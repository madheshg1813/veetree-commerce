import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getReels, setReels, MAX_REELS } from "../../../lib/reels"

/** Reads the reels the dashboard has saved. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ reels: await getReels(req.scope), max: MAX_REELS })
}

/**
 * Replaces the list wholesale.
 *
 * Anything that is not an Instagram permalink is dropped rather than rejected,
 * and the saved list is returned — so the dashboard shows exactly what was
 * kept instead of leaving someone to guess whether a bad line took effect.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as { reels?: unknown }
  const saved = await setReels(req.scope, body?.reels)
  res.json({ reels: saved, max: MAX_REELS })
}
