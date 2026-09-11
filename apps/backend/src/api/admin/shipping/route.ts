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

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
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
    pagination: { take: 100, skip: 0, order: { created_at: "DESC" } },
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
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })
  const existing = ((data as unknown as OrderRow[])[0]?.metadata ?? {}) as Record<string, unknown>

  await updateOrderWorkflow(req.scope).run({
    input: {
      id: orderId,
      user_id: req.auth_context?.actor_id ?? "",
      // Merged, not replaced: an order's metadata is not ours alone.
      metadata: {
        ...existing,
        [COURIER_FIELD]: courier || null,
        [TRACKING_FIELD]: (body.tracking ?? "").trim() || null,
      },
    },
  })

  res.json({ ok: true })
}
