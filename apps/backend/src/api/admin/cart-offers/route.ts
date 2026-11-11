import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  couponStates,
  freeShippingStatus,
  getSettings,
  saveSettings,
  validateSettings,
  LIMITS,
  type CartOffersSettings,
} from "../../../lib/cart-offers"

/**
 * The saved settings, plus what the dashboard needs to warn about them: which
 * listed codes the storefront is currently hiding, and where the four shipping
 * options' free-shipping prices stand.
 */
async function view(req: MedusaRequest, settings: CartOffersSettings) {
  const [coupon_states, free_shipping] = await Promise.all([
    couponStates(req.scope, settings.coupons.map((c) => c.code)),
    freeShippingStatus(req.scope),
  ])
  return { ...settings, coupon_states, free_shipping, limits: LIMITS }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await view(req, await getSettings(req.scope)))
}

/**
 * Replaces the settings. Validation throws an INVALID_DATA error naming the
 * problem, which Medusa returns as a 400 and the dashboard shows as-is.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const settings = validateSettings(req.body)
  await saveSettings(req.scope, settings)
  res.json(await view(req, settings))
}
