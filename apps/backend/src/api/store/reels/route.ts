import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getReels } from "../../../lib/reels"

/** What the storefront reads. Public, and returns only the permalinks. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ reels: await getReels(req.scope) })
}
