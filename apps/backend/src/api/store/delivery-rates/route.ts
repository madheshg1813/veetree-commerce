import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getRates } from "../../../lib/delivery-rates"

/**
 * What the storefront reads to quote delivery at checkout.
 *
 * Public, because the quote is shown before anyone signs in. The figures are
 * the same shipping-option prices Medusa bills by, so what the customer is
 * shown and what they are charged cannot drift apart.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await getRates(req.scope))
}
