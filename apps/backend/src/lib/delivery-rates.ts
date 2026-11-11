import { Modules, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { updateShippingOptionsWorkflow } from "@medusajs/core-flows"

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

export interface PriceRuleRow {
  attribute: string
  operator?: string
  value: string
}

export interface PriceRow {
  id: string
  amount?: number
  currency_code?: string
  price_list_id?: string | null
  price_rules?: PriceRuleRow[]
}

export interface OptionRow {
  id: string
  name: string
  prices?: PriceRow[]
}

export async function listOptions(container: MedusaContainer): Promise<OptionRow[]> {
  const query = container.resolve("query")
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.price_list_id",
      "prices.price_rules.attribute",
      "prices.price_rules.operator",
      "prices.price_rules.value",
    ],
    pagination: { take: 100, skip: 0 },
  })
  return data as unknown as OptionRow[]
}

/**
 * The option's own prices, without any price list's.
 *
 * Those are the only prices `updatePriceSets` replaces, so they are the set a
 * write has to account for in full.
 */
export const ownPrices = (option: OptionRow): PriceRow[] =>
  (option.prices ?? []).filter((p) => !p.price_list_id)

/**
 * The flat INR charge: the one with no conditions attached.
 *
 * An option can also carry conditional prices (e.g. ₹0 above a cart total for
 * free shipping), so "the first INR price" is not necessarily the delivery
 * charge — it could be the free one.
 */
export const basePrice = (option: OptionRow | undefined): PriceRow | undefined =>
  option ? ownPrices(option).find((p) => p.currency_code === "inr" && !p.price_rules?.length) : undefined

/** A price as `updateShippingOptionsWorkflow` takes it. */
export type PriceInput = {
  id?: string
  amount: number
  currency_code?: string
  region_id?: string
  rules?: { attribute: string; operator: string; value: number }[]
}

/**
 * An existing price, restated so that writing it back leaves it as it was.
 *
 * Writing an option's prices replaces the whole list, and a price sent back
 * without its rules loses them — so every price that is kept has to be sent
 * again, rules and all. Region prices go back as `region_id`, the form the
 * workflow accepts; numeric conditions (cart total) go back as rules. Anything
 * else cannot be restated faithfully through the workflow, so the write is
 * refused rather than quietly changing a price.
 */
export function restatePrice(option: OptionRow, price: PriceRow): PriceInput {
  const rules: NonNullable<PriceInput["rules"]> = []
  let regionId: string | undefined
  for (const rule of price.price_rules ?? []) {
    const operator = rule.operator ?? "eq"
    if (rule.attribute === "region_id" && operator === "eq") {
      regionId = rule.value
      continue
    }
    const value = Number(rule.value)
    if (!Number.isFinite(value)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `"${option.name}" has a price condition on "${rule.attribute}" that this page cannot ` +
          `preserve. Edit that option's prices under Settings → Locations & Shipping instead.`
      )
    }
    rules.push({ attribute: rule.attribute, operator, value })
  }
  const amount = price.amount ?? 0
  const base = regionId
    ? { id: price.id, amount, region_id: regionId }
    : { id: price.id, amount, currency_code: price.currency_code }
  return rules.length ? { ...base, rules } : base
}

export async function setOptionPrices(
  container: MedusaContainer,
  optionId: string,
  prices: PriceInput[]
) {
  await updateShippingOptionsWorkflow(container).run({
    input: [{ id: optionId, prices: prices as never }],
  })
}

export async function getRates(container: MedusaContainer): Promise<Rates> {
  const options = await listOptions(container)
  const byName = new Map(options.map((o) => [o.name, o]))

  const rates = {} as Record<RateKey, number>
  for (const [key, name] of Object.entries(OPTION_NAMES) as [RateKey, string][]) {
    const inr = basePrice(byName.get(name))
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
