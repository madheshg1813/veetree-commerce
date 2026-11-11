import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  applyFreeShipping,
  freeShippingStatus,
  getSettings,
} from "../../../../lib/cart-offers"

/**
 * Makes the four shipping options charge ₹0 from the saved "Free shipping"
 * milestone upward — or, with no such milestone saved, removes the ₹0 price.
 *
 * Reads the saved milestone rather than taking an amount, so what checkout
 * charges can only ever match what the cart has been told to show.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const shipping = settings.milestones.find((m) => m.kind === "shipping")
  const threshold = shipping ? shipping.amount : null
  const result = await applyFreeShipping(req.scope, threshold)
  res.json({
    threshold,
    ...result,
    free_shipping: await freeShippingStatus(req.scope),
  })
}
