import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { updateOrderWorkflow } from "@medusajs/core-flows"
import {
  COURIERS,
  COURIER_FIELD,
  TRACKING_FIELD,
  autoCourier,
  isCourier,
  savedShipment,
} from "../../../lib/couriers"
import { sendTrackingEmail } from "../../../lib/shipment-email"

interface OrderRow {
  id: string
  display_id?: number
  created_at?: string
  email?: string
  currency_code?: string
  total?: number
  metadata?: Record<string, unknown> | null
  shipping_address?: {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    province?: string
    postal_code?: string
    phone?: string
  } | null
  items?: { title?: string; variant_title?: string; quantity?: number; unit_price?: number }[]
}

/**
 * Orders as the shipping desk needs them: who it goes to, where, which courier
 * the rules suggest, and whatever has already been recorded against it.
 *
 * Medusa's own order list cannot be extended — the admin only offers
 * `order.list.before` and `.after`, not a column — so this feeds a page of our
 * own rather than trying to graft onto that table.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  // The order detail page asks for one order; the list asks for all of them.
  const only = typeof req.query?.orderId === "string" ? req.query.orderId : null

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      /*
       * Not shown anywhere, but the query fails without it. Asking for `total`
       * makes Medusa compute the order's totals, which loads its shipping
       * methods and then their adjustments — and that step throws "Shipping
       * method version is required to load adjustments" unless the order's
       * version has been selected, because the join rows take their version
       * from it. An order with no shipping method never reaches that code,
       * which is why a seeded test order passed while every real one failed.
       */
      "version",
      "display_id",
      "created_at",
      "email",
      "currency_code",
      "total",
      "metadata",
      "shipping_address.*",
      "items.title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
    ],
    ...(only ? { filters: { id: only } } : {}),
    pagination: { take: only ? 1 : 100, skip: 0, order: { created_at: "DESC" } },
  })

  const orders = (data as unknown as OrderRow[]).map((o) => {
    const addr = o.shipping_address ?? null
    const saved = savedShipment(o.metadata as Record<string, unknown> | null)
    // Tamil Nadu is decided by pin code; everywhere else waits for a person.
    const auto = autoCourier(addr?.postal_code, addr?.province)

    return {
      id: o.id,
      number: typeof o.display_id === "number" ? o.display_id : null,
      placedAt: o.created_at ?? null,
      email: o.email ?? null,
      phone: addr?.phone ?? null,
      name: [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || null,
      address: [addr?.address_1, addr?.address_2].filter(Boolean).join(", ") || null,
      city: addr?.city ?? null,
      state: addr?.province ?? null,
      postalCode: addr?.postal_code ?? null,
      total: typeof o.total === "number" ? o.total : null,
      currency: (o.currency_code ?? "inr").toUpperCase(),
      items: (o.items ?? []).map((i) => ({
        title: i.title ?? "",
        size: i.variant_title ?? null,
        qty: i.quantity ?? 1,
        unitPrice: typeof i.unit_price === "number" ? i.unit_price : null,
      })),
      // What has been chosen, and what the pin code decides. Both, so a
      // deliberate choice is never overwritten by the automatic one.
      courier: saved.courier,
      auto,
      tracking: saved.tracking,
    }
  })

  res.json({ orders, couriers: COURIERS })
}

/** Records the courier and tracking number against one order. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    orderId?: string
    courier?: string
    tracking?: string
  }

  const orderId = (body.orderId ?? "").trim()
  if (!orderId) {
    return res.status(400).json({ message: "orderId is required." })
  }

  const courier = (body.courier ?? "").trim()
  if (courier && !isCourier(courier)) {
    return res.status(400).json({ message: "Unknown courier." })
  }

  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "order",
    // Enough to write the customer's email, and "version" for the same reason
    // the list query needs it: asking for `total` computes the totals.
    fields: [
      "id",
      "version",
      "display_id",
      "email",
      "total",
      "metadata",
      "shipping_address.*",
      "items.title",
      "items.variant_title",
      "items.quantity",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderRow[])[0]
  const existing = (order?.metadata ?? {}) as Record<string, unknown>
  const before = savedShipment(existing)
  const tracking = (body.tracking ?? "").trim()

  await updateOrderWorkflow(req.scope).run({
    input: {
      id: orderId,
      user_id: req.auth_context?.actor_id ?? "",
      // Merged, not replaced: an order's metadata is not ours alone.
      metadata: {
        ...existing,
        [COURIER_FIELD]: courier || null,
        [TRACKING_FIELD]: tracking || null,
      },
    },
  })

  /*
   * Tell the customer, but only when the tracking number is genuinely new.
   * Saving the same number again — which happens whenever the courier is
   * corrected, or Save is pressed twice — must not send a second email.
   */
  const isNew = Boolean(tracking) && tracking !== before.tracking
  let emailed = false
  let emailReason: string | null = null

  if (isNew && courier && order) {
    const addr = order.shipping_address ?? null
    const result = await sendTrackingEmail(
      {
        number: typeof order.display_id === "number" ? order.display_id : null,
        email: order.email ?? null,
        name: [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || null,
        address: [addr?.address_1, addr?.address_2].filter(Boolean).join(", ") || null,
        city: addr?.city ?? null,
        postalCode: addr?.postal_code ?? null,
        total: typeof order.total === "number" ? order.total : null,
        items: (order.items ?? []).map((i) => ({
          title: i.title ?? "",
          size: i.variant_title ?? null,
          qty: i.quantity ?? 1,
        })),
      },
      courier,
      tracking
    )
    emailed = result.sent
    if (!result.sent) emailReason = result.reason
  }

  // The save succeeded either way; the dashboard says whether the mail went.
  res.json({ ok: true, emailed, emailReason })
}
