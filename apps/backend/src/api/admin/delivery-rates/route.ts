import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import { updateShippingOptionsWorkflow } from "@medusajs/core-flows"
import {
  getRates,
  listOptions,
  OPTION_NAMES,
  WEIGHT_KEY,
  type RateKey,
} from "../../../lib/delivery-rates"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const current = await getRates(req.scope)
  res.json({ ...current, names: OPTION_NAMES })
}

/**
 * Writes the four delivery charges, plus the weight threshold.
 *
 * The charges go onto the shipping options themselves rather than into a
 * setting of our own — those prices are what Medusa bills a cart by, so
 * storing them anywhere else would let the quoted figure drift from the
 * charged one.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    rates?: Partial<Record<RateKey, unknown>>
    breakG?: unknown
    packagingG?: unknown
  }

  const money = (v: unknown, label: string) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < 0 || n > 100_000) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${v}" is not a valid ${label}.`)
    }
    return n
  }

  const options = await listOptions(req.scope)
  const byName = new Map(options.map((o) => [o.name, o]))
  const missing: string[] = []

  for (const [key, name] of Object.entries(OPTION_NAMES) as [RateKey, string][]) {
    const raw = body.rates?.[key]
    if (raw === undefined || raw === null || raw === "") continue
    const amount = money(raw, "delivery charge")
    const option = byName.get(name)
    if (!option) {
      missing.push(name)
      continue
    }
    await updateShippingOptionsWorkflow(req.scope).run({
      input: [{ id: option.id, prices: [{ amount, currency_code: "inr" }] }],
    })
  }

  if (body.breakG !== undefined || body.packagingG !== undefined) {
    const store = req.scope.resolve(Modules.STORE)
    const [record] = await store.listStores({}, { take: 1 })
    if (record) {
      const existing = (record.metadata ?? {}) as Record<string, unknown>
      const prev = (existing[WEIGHT_KEY] ?? {}) as { breakG?: number; packagingG?: number }
      await store.updateStores(record.id, {
        metadata: {
          ...existing,
          [WEIGHT_KEY]: {
            breakG: body.breakG === undefined ? prev.breakG : money(body.breakG, "weight"),
            packagingG:
              body.packagingG === undefined ? prev.packagingG : money(body.packagingG, "weight"),
          },
        },
      })
    }
  }

  const current = await getRates(req.scope)
  res.json({ ...current, missing })
}
