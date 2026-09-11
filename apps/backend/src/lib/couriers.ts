import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * Which courier carries an order.
 *
 * One rule is automatic: anything going to a Tamil Nadu pin code goes by ST
 * Courier. Everywhere else is chosen by hand on the Shipping page, because
 * only Veetree knows which of the other four actually serves a given
 * destination — a guess here would put a parcel with a courier that cannot
 * deliver it.
 *
 * The choice and the tracking number are stored on the order's own metadata,
 * so they travel with the order.
 */
export const COURIERS = [
  { id: "st", name: "ST Courier" },
  { id: "india-post", name: "India Post" },
  { id: "dtdc", name: "DTDC" },
  { id: "franch", name: "Franch Express" },
  { id: "thirupathi", name: "Thirupathi Courier" },
] as const

export type CourierId = (typeof COURIERS)[number]["id"]

export const isCourier = (v: unknown): v is CourierId =>
  typeof v === "string" && COURIERS.some((c) => c.id === v)

export const courierName = (id: string | null | undefined) =>
  COURIERS.find((c) => c.id === id)?.name ?? null

/** Keys on an order's metadata. */
export const COURIER_FIELD = "veetree_courier"
export const TRACKING_FIELD = "veetree_tracking"

/** The courier Tamil Nadu is served by. */
export const TN_COURIER: CourierId = "st"

/**
 * Tamil Nadu's postal range.
 *
 * India Post allocates 600001–643253 to Tamil Nadu, so the whole 600–643
 * block is the state. Note that Puducherry sits inside it — 605xxx, 607xxx and
 * 609xxx are the UT, not Tamil Nadu — and is therefore treated as Tamil Nadu
 * here. It is surrounded by the state and served the same way, but say so if
 * it should be picked by hand instead.
 */
const TN_FIRST = 600000
const TN_LAST = 643999

/** A pin code is six digits; anything else is not one. */
export function isTamilNaduPin(postalCode: string | null | undefined): boolean {
  const digits = (postalCode ?? "").replace(/\D/g, "")
  if (digits.length !== 6) return false
  const n = Number(digits)
  return n >= TN_FIRST && n <= TN_LAST
}

/** Belt and braces for an order whose pin code is missing or malformed. */
export const isTamilNaduState = (state: string | null | undefined) =>
  /tamil\s*nadu|tamilnadu/i.test((state ?? "").trim())

/**
 * The courier chosen automatically, or null when there is nothing to go on and
 * a person has to decide. Null is deliberate: an unconsidered default is how a
 * parcel ends up with the wrong carrier.
 */
export function autoCourier(
  postalCode: string | null | undefined,
  state: string | null | undefined
): CourierId | null {
  return isTamilNaduPin(postalCode) || isTamilNaduState(state) ? TN_COURIER : null
}

/** Reads what has been recorded against an order. */
export function savedShipment(metadata: Record<string, unknown> | null | undefined) {
  const meta = metadata ?? {}
  return {
    courier: isCourier(meta[COURIER_FIELD]) ? (meta[COURIER_FIELD] as CourierId) : null,
    tracking: typeof meta[TRACKING_FIELD] === "string" ? (meta[TRACKING_FIELD] as string) : "",
  }
}

/** Present so the API route has one place to reach for the container type. */
export type Container = MedusaContainer
