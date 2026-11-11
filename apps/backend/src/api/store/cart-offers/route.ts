import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPublicOffers } from "../../../lib/cart-offers"

/**
 * What the storefront's slide-in cart reads: the announcement bar, the spend
 * milestones, and the coupons listed under "View all coupons".
 *
 * Public, because the cart is shown before anyone signs in. Coupons are
 * checked against the Promotion module on every read, so a code that has
 * expired or been switched off drops out without anyone editing the list.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await getPublicOffers(req.scope))
}
