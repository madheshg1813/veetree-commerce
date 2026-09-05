import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * The Instagram reels shown on the storefront homepage.
 *
 * Kept in the store's `metadata` rather than a table of their own: this is a
 * handful of URLs that Veetree edits occasionally, and a new module plus
 * migration would be a lot of machinery for three strings.
 */
export const REELS_KEY = "veetree_reels"
export const MAX_REELS = 3

/** Instagram permalinks only, and only ones a reel code can be read from. */
export function normaliseReels(input: unknown): string[] {
  const list = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of list) {
    if (typeof raw !== "string") continue
    const url = raw.trim()
    if (!url) continue
    const m = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i.exec(url)
    if (!m) continue
    const code = m[1]!
    if (seen.has(code)) continue
    seen.add(code)
    // Stored canonically, so a link copied with tracking parameters does not
    // reach the storefront and end up in an iframe URL.
    out.push(`https://www.instagram.com/reel/${code}/`)
    if (out.length >= MAX_REELS) break
  }
  return out
}

async function store(container: MedusaContainer) {
  const service = container.resolve(Modules.STORE)
  const [record] = await service.listStores({}, { take: 1 })
  return { service, record }
}

export async function getReels(container: MedusaContainer): Promise<string[]> {
  const { record } = await store(container)
  return normaliseReels((record?.metadata as Record<string, unknown> | undefined)?.[REELS_KEY])
}

export async function setReels(container: MedusaContainer, reels: unknown): Promise<string[]> {
  const { service, record } = await store(container)
  if (!record) return []
  const clean = normaliseReels(reels)
  await service.updateStores(record.id, {
    metadata: { ...(record.metadata ?? {}), [REELS_KEY]: clean },
  })
  return clean
}
