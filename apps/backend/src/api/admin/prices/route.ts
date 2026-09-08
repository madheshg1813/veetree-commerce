import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/core-flows"

const CURRENCY = "inr"

interface Row {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
  sku: string | null
  price: number | null
  categories: string[]
}

/**
 * Every variant with its INR price, for the dashboard's Prices screen.
 *
 * Medusa's own price editor lives behind a product's overflow menu, one product
 * at a time. This lists the whole catalogue on one screen, which is how Veetree
 * actually works — a price sheet, not thirty-one separate edits.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "categories.name",
    ],
    pagination: { take: 500, skip: 0 },
  })

  const rows: Row[] = []
  for (const p of products) {
    for (const v of p.variants ?? []) {
      // `query.graph` returns the joined price rows, which the ProductVariant
      // type does not describe — narrowed here rather than cast blindly.
      const prices = (v as unknown as {
        prices?: { amount?: number; currency_code?: string }[]
      }).prices ?? []
      const inr = prices.find((pr) => pr.currency_code === CURRENCY)
      const categories = ((p as unknown as { categories?: { name?: string }[] }).categories ?? [])
        .map((c) => c.name)
        .filter((n): n is string => Boolean(n))

      rows.push({
        productId: p.id,
        productTitle: p.title,
        variantId: v.id,
        variantTitle: v.title ?? "",
        sku: v.sku ?? null,
        price: typeof inr?.amount === "number" ? inr.amount : null,
        categories,
      })
    }
  }

  rows.sort((a, b) =>
    a.productTitle.localeCompare(b.productTitle) || a.variantTitle.localeCompare(b.variantTitle)
  )
  res.json({ currency: CURRENCY, rows })
}

/**
 * Writes new prices.
 *
 * Goes through `updateProductVariantsWorkflow` rather than touching the pricing
 * module directly: prices live in a price set linked to the variant, and the
 * workflow is what keeps that link consistent. Only variants whose price
 * actually changed are sent, so saving the screen does not rewrite the whole
 * catalogue.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    prices?: { variantId?: unknown; price?: unknown }[]
    confirmLow?: unknown
  }
  const confirmLow = body?.confirmLow === true
  const incoming = Array.isArray(body?.prices) ? body.prices : []
  if (incoming.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No prices were sent.")
  }

  const updates: { id: string; prices: { amount: number; currency_code: string }[] }[] = []
  for (const row of incoming) {
    if (typeof row?.variantId !== "string") continue
    const amount = Math.round(Number(row.price))
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `"${row.price}" is not a valid price.`
      )
    }
    /**
     * Refuse a suspiciously small price unless it is confirmed.
     *
     * A part-typed entry once saved a 239 rupee pack at 15, and the storefront
     * charged it — the whole chain works, which is exactly what makes the
     * mistake expensive. Nothing here is genuinely under 50 rupees, so that is
     * a safe floor to question.
     */
    if (amount > 0 && amount < 50 && !confirmLow) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `₹${amount} looks like a mistyped price. Re-enter it and tick "allow prices under ₹50" if it is deliberate.`
      )
    }
    updates.push({ id: row.variantId, prices: [{ amount, currency_code: CURRENCY }] })
  }
  if (updates.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No valid prices were sent.")
  }

  for (const update of updates) {
    await updateProductVariantsWorkflow(req.scope).run({
      input: { selector: { id: update.id }, update: { prices: update.prices } },
    })
  }

  res.json({ ok: true, updated: updates.length })
}
