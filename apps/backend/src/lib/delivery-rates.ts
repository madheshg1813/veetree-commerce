import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * Delivery charges, as the storefront needs them.
 *
 * The money lives on Medusa's shipping options — that is what prices a cart,
 * so it has to stay the single source of truth. These four names are the
 * contract between the backend and `src/lib/checkout/shipping.ts`; renaming an
 * option in the dashboard breaks the match, so the names are matched exactly
 * and a missing one falls back rather than failing a checkout.
 */
export const OPTION_NAMES = {
  tnLight: "Tamil Nadu — up to 1 kg",
  tnHeavy: "Tamil Nadu — over 1 kg",
  inLight: "Rest of India — up to 1 kg",
  inHeavy: "Rest of India — over 1 kg",
} as const

export type RateKey = keyof typeof OPTION_NAMES

/** Sensible defaults, used only when an option is missing from the backend. */
export const FALLBACK: Record<RateKey, number> = {
  tnLight: 50,
  tnHeavy: 99,
  inLight: 99,
  inHeavy: 150,
}

/** Weight above which the heavier rate applies, and the per-unit packaging allowance. */
export const WEIGHT_KEY = "veetree_delivery_weights"
export const WEIGHT_DEFAULTS = { breakG: 1000, packagingG: 80 }

export interface Rates {
  rates: Record<RateKey, number>
  breakG: number
  packagingG: number
  currency: string
}

interface OptionRow {
  id: string
  name: string
  prices?: { amount?: number; currency_code?: string }[]
}

export async function listOptions(container: MedusaContainer): Promise<OptionRow[]> {
  const query = container.resolve("query")
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "prices.amount", "prices.currency_code"],
    pagination: { take: 100, skip: 0 },
  })
  return data as unknown as OptionRow[]
}

export async function getRates(container: MedusaContainer): Promise<Rates> {
  const options = await listOptions(container)
  const byName = new Map(options.map((o) => [o.name, o]))

  const rates = {} as Record<RateKey, number>
  for (const [key, name] of Object.entries(OPTION_NAMES) as [RateKey, string][]) {
    const inr = (byName.get(name)?.prices ?? []).find((p) => p.currency_code === "inr")
    rates[key] = typeof inr?.amount === "number" ? inr.amount : FALLBACK[key]
  }

  const store = container.resolve(Modules.STORE)
  const [record] = await store.listStores({}, { take: 1 })
  const saved = (record?.metadata as Record<string, unknown> | undefined)?.[WEIGHT_KEY]
  const w = (saved ?? {}) as { breakG?: unknown; packagingG?: unknown }

  const num = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : fallback
  }

  return {
    rates,
    breakG: num(w.breakG, WEIGHT_DEFAULTS.breakG),
    packagingG: num(w.packagingG, WEIGHT_DEFAULTS.packagingG),
    currency: "inr",
  }
}
