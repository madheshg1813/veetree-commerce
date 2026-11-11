import { Modules, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  listOptions,
  ownPrices,
  restatePrice,
  setOptionPrices,
  OPTION_NAMES,
  type OptionRow,
  type PriceRow,
} from "./delivery-rates"

/**
 * Offers shown in the storefront's slide-in cart: an announcement bar, spend
 * milestones on a progress bar, and the coupon codes listed under "View all
 * coupons".
 *
 * All of it is display. A milestone does not change what a cart costs, and
 * listing a code does not create it — the discount itself is a Promotion, and
 * free shipping is a ₹0 price on the shipping options. The storefront reads
 * `GET /store/cart-offers`; the dashboard writes through `/admin/cart-offers`.
 */
export const CART_OFFERS_KEY = "veetree_cart_offers"

export const LIMITS = {
  announcement: 120,
  label: 30,
  title: 60,
  description: 160,
  code: 64,
  milestones: 3,
  coupons: 10,
  maxRupees: 10_000_000,
} as const

export type MilestoneKind = "shipping" | "gift"

export interface Milestone {
  /** Whole rupees. */
  amount: number
  label: string
  kind: MilestoneKind
}

export interface AdvertisedCoupon {
  code: string
  title: string
  description: string
}

/**
 * What is saved, and what the dashboard edits.
 *
 * The announcement text is kept while it is switched off, so turning it back
 * on does not mean typing it again.
 */
export interface CartOffersSettings {
  announcement: string
  announcementEnabled: boolean
  milestones: Milestone[]
  coupons: AdvertisedCoupon[]
}

/** What the storefront reads. */
export interface PublicCartOffers {
  announcement: string | null
  milestones: Milestone[]
  coupons: AdvertisedCoupon[]
}

export const DEFAULTS: CartOffersSettings = {
  announcement: "",
  announcementEnabled: false,
  milestones: [],
  coupons: [],
}

const KINDS: MilestoneKind[] = ["shipping", "gift"]

const invalid = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message)

const text = (v: unknown, label: string, max: number, required: boolean): string => {
  if (v === undefined || v === null) v = ""
  if (typeof v !== "string") throw invalid(`${label} must be text.`)
  const s = v.trim()
  if (required && !s) throw invalid(`${label} is required.`)
  if (s.length > max) throw invalid(`${label} must be at most ${max} characters (it is ${s.length}).`)
  return s
}

const list = (v: unknown, label: string, max: number): unknown[] => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw invalid(`${label} must be a list.`)
  if (v.length > max) throw invalid(`At most ${max} ${label.toLowerCase()} are allowed.`)
  return v
}

const record = (v: unknown, label: string): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw invalid(`${label} is not valid.`)
  return v as Record<string, unknown>
}

/**
 * Checks and normalises settings from the dashboard. Throws a MedusaError
 * naming the first problem, which the dashboard shows as-is.
 *
 * Coupon codes are not checked against the Promotion module here: a promotion
 * can be created after it is listed, or expire after, so that check happens
 * every time the storefront reads the list instead.
 */
export function validateSettings(input: unknown): CartOffersSettings {
  const body = record(input ?? {}, "The settings")

  const announcement = text(body.announcement, "The announcement", LIMITS.announcement, false)
  const enabled = body.announcementEnabled
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw invalid("announcementEnabled must be true or false.")
  }

  const milestones = list(body.milestones, "Milestones", LIMITS.milestones).map((raw, i) => {
    const m = record(raw, `Milestone ${i + 1}`)
    const n = typeof m.amount === "string" && m.amount.trim() !== "" ? Number(m.amount) : m.amount
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      throw invalid(`Milestone ${i + 1}: the amount must be a positive number of rupees.`)
    }
    if (!Number.isInteger(n)) {
      throw invalid(`Milestone ${i + 1}: the amount must be whole rupees.`)
    }
    if (n > LIMITS.maxRupees) throw invalid(`Milestone ${i + 1}: the amount is too large.`)
    if (!KINDS.includes(m.kind as MilestoneKind)) {
      throw invalid(`Milestone ${i + 1}: the kind must be "shipping" or "gift".`)
    }
    return {
      amount: n,
      label: text(m.label, `Milestone ${i + 1}: the label`, LIMITS.label, true),
      kind: m.kind as MilestoneKind,
    }
  })

  const amounts = new Set(milestones.map((m) => m.amount))
  if (amounts.size < milestones.length) throw invalid("Two milestones have the same amount.")
  if (milestones.filter((m) => m.kind === "shipping").length > 1) {
    throw invalid("Only one milestone can be Free shipping.")
  }
  milestones.sort((a, b) => a.amount - b.amount)

  const coupons = list(body.coupons, "Coupons", LIMITS.coupons).map((raw, i) => {
    const c = record(raw, `Coupon ${i + 1}`)
    return {
      code: text(c.code, `Coupon ${i + 1}: the code`, LIMITS.code, true),
      title: text(c.title, `Coupon ${i + 1}: the title`, LIMITS.title, true),
      description: text(c.description, `Coupon ${i + 1}: the description`, LIMITS.description, false),
    }
  })
  const codes = new Set(coupons.map((c) => c.code.toLowerCase()))
  if (codes.size < coupons.length) throw invalid("The same coupon is listed twice.")

  return {
    announcement,
    // Absent means "on if there is something to show", which is what a
    // caller that never heard of the toggle would expect.
    announcementEnabled: typeof enabled === "boolean" ? enabled : announcement !== "",
    milestones,
    coupons,
  }
}

async function storeRecord(container: MedusaContainer) {
  const store = container.resolve(Modules.STORE)
  const [record] = await store.listStores({}, { take: 1 })
  return { store, record }
}

export async function getSettings(container: MedusaContainer): Promise<CartOffersSettings> {
  const { record } = await storeRecord(container)
  const saved = (record?.metadata as Record<string, unknown> | undefined)?.[CART_OFFERS_KEY]
  if (saved === undefined || saved === null) return { ...DEFAULTS }
  try {
    return validateSettings(saved)
  } catch {
    // Only ever written through validateSettings, so this means hand-edited
    // metadata. Showing nothing beats showing something malformed.
    return { ...DEFAULTS }
  }
}

export async function saveSettings(
  container: MedusaContainer,
  settings: CartOffersSettings
): Promise<void> {
  const { store, record } = await storeRecord(container)
  if (!record) throw new MedusaError(MedusaError.Types.NOT_FOUND, "No store record to save to.")
  const existing = (record.metadata ?? {}) as Record<string, unknown>
  await store.updateStores(record.id, {
    metadata: { ...existing, [CART_OFFERS_KEY]: settings },
  })
}

/**
 * Whether each code can be used right now, which is the only time it is
 * worth advertising.
 */
export type CouponState =
  | "active"
  | "missing"
  | "draft"
  | "inactive"
  | "not_started"
  | "expired"
  | "used_up"

interface PromotionRow {
  code?: string
  status?: string
  limit?: number | null
  used?: number
  campaign?: {
    starts_at?: Date | string | null
    ends_at?: Date | string | null
    budget?: { type?: string; limit?: number | null; used?: number } | null
  } | null
}

const stateOf = (p: PromotionRow | undefined, now: number): CouponState => {
  if (!p) return "missing"
  if (p.status === "draft") return "draft"
  if (p.status !== "active") return "inactive"
  const starts = p.campaign?.starts_at ? new Date(p.campaign.starts_at).getTime() : null
  const ends = p.campaign?.ends_at ? new Date(p.campaign.ends_at).getTime() : null
  if (starts !== null && starts > now) return "not_started"
  if (ends !== null && ends <= now) return "expired"
  if (typeof p.limit === "number" && (p.used ?? 0) >= p.limit) return "used_up"
  // Per-customer budgets ("..._by_attribute") can be spent for one shopper and
  // not another, so only a store-wide budget rules a code out for everyone.
  const budget = p.campaign?.budget
  if (
    budget &&
    (budget.type === "usage" || budget.type === "spend") &&
    typeof budget.limit === "number" &&
    (budget.used ?? 0) >= budget.limit
  ) {
    return "used_up"
  }
  return "active"
}

export async function couponStates(
  container: MedusaContainer,
  codes: string[]
): Promise<Record<string, CouponState>> {
  if (!codes.length) return {}
  const promotions = container.resolve(Modules.PROMOTION)
  const found = (await promotions.listPromotions(
    { code: codes },
    { relations: ["campaign", "campaign.budget"], take: codes.length * 2 }
  )) as unknown as PromotionRow[]
  const byCode = new Map(found.map((p) => [p.code, p]))
  const now = Date.now()
  return Object.fromEntries(codes.map((code) => [code, stateOf(byCode.get(code), now)]))
}

/**
 * The storefront's view: the announcement only while it is switched on, and
 * only the codes a shopper could actually apply — the cart never advertises
 * a dead code.
 */
export async function getPublicOffers(container: MedusaContainer): Promise<PublicCartOffers> {
  const settings = await getSettings(container)
  const states = await couponStates(container, settings.coupons.map((c) => c.code))
  return {
    announcement: settings.announcementEnabled && settings.announcement ? settings.announcement : null,
    milestones: settings.milestones,
    coupons: settings.coupons.filter((c) => states[c.code] === "active"),
  }
}

/*
 * Free shipping, actually charged.
 *
 * A "Free shipping" milestone only changes what the cart shows. Charging ₹0
 * takes a conditional price on each shipping option — ₹0 when the item total
 * is at least the milestone — which is what the dashboard's "conditional
 * prices" create. This writes that same price on all four options at once.
 */

/** The ₹0 "item total at least X" price this page manages, if the option has one. */
export const isFreeShippingPrice = (p: PriceRow) =>
  p.currency_code === "inr" &&
  p.amount === 0 &&
  p.price_rules?.length === 1 &&
  p.price_rules[0].attribute === "item_total" &&
  p.price_rules[0].operator === "gte"

export interface FreeShippingStatus {
  name: string
  found: boolean
  /** Rupee threshold of the ₹0 price, or null when the option has none. */
  threshold: number | null
}

export async function freeShippingStatus(container: MedusaContainer): Promise<FreeShippingStatus[]> {
  const options = await listOptions(container)
  const byName = new Map(options.map((o) => [o.name, o]))
  return Object.values(OPTION_NAMES).map((name) => {
    const option = byName.get(name)
    const free = option ? ownPrices(option).find(isFreeShippingPrice) : undefined
    return {
      name,
      found: Boolean(option),
      threshold: free ? Number(free.price_rules![0].value) : null,
    }
  })
}

/**
 * Sets the ₹0 price on all four options to start at `threshold` rupees, or
 * removes it when `threshold` is null.
 *
 * Every other price on each option is written back unchanged (see
 * `restatePrice`). All four are checked before any is written, so a price
 * that cannot be preserved stops the whole change instead of leaving the
 * options half-updated.
 */
export async function applyFreeShipping(
  container: MedusaContainer,
  threshold: number | null
): Promise<{ updated: string[]; missing: string[] }> {
  const options = await listOptions(container)
  const byName = new Map(options.map((o) => [o.name, o]))
  const missing: string[] = []
  const plan: { option: OptionRow; prices: ReturnType<typeof restatePrice>[] }[] = []

  for (const name of Object.values(OPTION_NAMES)) {
    const option = byName.get(name)
    if (!option) {
      missing.push(name)
      continue
    }
    const kept = ownPrices(option)
      .filter((p) => !isFreeShippingPrice(p))
      .map((p) => restatePrice(option, p))
    const free = ownPrices(option).find(isFreeShippingPrice)
    if (threshold !== null) {
      kept.push({
        ...(free ? { id: free.id } : {}),
        amount: 0,
        currency_code: "inr",
        rules: [{ attribute: "item_total", operator: "gte", value: threshold }],
      })
    }
    plan.push({ option, prices: kept })
  }

  for (const { option, prices } of plan) {
    await setOptionPrices(container, option.id, prices)
  }
  return { updated: plan.map((p) => p.option.name), missing }
}
