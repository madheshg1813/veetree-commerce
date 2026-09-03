import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Seeds VeeTree's full catalogue into Medusa from the founder's product sheet.
 *
 *   cd apps/backend
 *   npx medusa exec ./src/scripts/seed-veetree-full.ts
 *
 * The sheet is the source of truth for names, sizes, prices, ingredients,
 * usage and descriptions. Safe to re-run: every product it manages is removed
 * by handle before being recreated, so editing the CSV and running again
 * updates rather than duplicates.
 *
 * Products with no price in the sheet are SKIPPED rather than created at a
 * placeholder — a ₹0 product in a live catalogue is orderable.
 */

const CSV_NAME = "VEETREE products description  - Products.csv"

/** Minimal RFC4180 parser — the sheet has quoted fields with commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => v.trim()))
}

const RENAME: Record<string, string> = {
  "Kumkumadi serum": "Kumkumadi Serum",
  "Aqua Rose Brightning Serum": "Aqua Rose Brightening Serum",
  "Aloevera gel": "Aloe Vera Gel",
  "Saffron gel": "Saffron Gel",
  "Multi floral gel": "Multi-Floral Gel",
  "Kumkumayadi night cream": "Kumkumadi Night Cream",
  "Rose hydrosol": "Rose Hydrosol",
  "Teatree Hydrosol": "Tea Tree Hydrosol",
  "Scalp & Hair rebirth serum": "Scalp & Hair Rebirth Serum",
  "Protein Hair pack": "Protein Hair Pack",
  "Seed Petal shampoo": "Seed-Petal Shampoo",
  "Anti Dandruff gel": "Anti-Dandruff Gel",
  "Nalparamadi lotion": "Nalpamaradi Lotion",
  "Ritual body oil": "Ritual Body Oil",
  "Nalparamadi lepam": "Nalpamaradi Lepam",
  "Paucholi shower gel": "Patchouli Shower Gel",
  "Body & face scrub": "Body & Face Scrub",
  "Rose & vannila body butter": "Rose & Vanilla Body Butter",
  "Tender coconut body butter": "Tender Coconut Body Butter",
  "Choco Body butter": "Choco Body Butter",
  "Sandalwood lipbalm": "Sandalwood Lip Balm",
  "Fruit & spice lipbalm": "Fruit & Spice Lip Balm",
  "Orange lip scrub": "Orange Lip Scrub",
  "Coffee lip scrub": "Coffee Lip Scrub",
  "under-eye serum": "Under-Eye Serum",
  "Earth eye cream": "Earth Eye Cream",
}

const CATEGORY_NAME: Record<string, string> = {
  "FACE CARE": "Face Care",
  "HAIR CARE": "Hair Care",
  "BODY CARE": "Body Care",
  "LIP CARE": "Lip Care",
  "EYE CARE": "Eye Care",
}

/** Photography already uploaded to Cloudinary, keyed by slug. */
const IMAGE_FOR: Record<string, string> = {
  "kumkumadi-serum": "kumkumadi-serum",
  "multi-floral-gel": "multi-floral-gel",
  "aloe-vera-gel": "aloe-vera-gel",
  "rose-hydrosol": "rose-hydrosol",
  "hair-growth-oil": "hair-growth-oil",
  "scalp-hair-rebirth-serum": "scalp-hair-rebirth-serum",
  "seed-petal-shampoo": "seed-petal-shampoo",
  "rosemary-hydrosol": "rosemary-hydrosol",
  "nalpamaradi-lepam": "nalpamaradi-body-lebam",
  "patchouli-shower-gel": "patchouli-shower-gel",
  "mango-lip-oil": "mango-lip-oil",
}

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "z4e833jz"
const imageUrl = (file: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto/veetree/products/${file}`

const slugify = (n: string) =>
  n.toLowerCase().replace(/&/g, " ").replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-")

const normSize = (s: string) => {
  const m = s.trim().match(/^(\d+)\s*(ml|g|gm)$/i)
  if (!m) return s.trim()
  return `${m[1]} ${m[2]!.toLowerCase() === "ml" ? "ml" : "g"}`
}

export default async function seedVeetreeFull({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // medusa exec runs from apps/backend; the sheet sits at the monorepo root,
  // and a copy may be in /tmp. Try each in turn.
  const candidates = [
    path.join(process.cwd(), CSV_NAME),
    path.join(process.cwd(), "..", "..", CSV_NAME),
    "/tmp/vt-products.csv",
  ]
  let raw = ""
  let usedPath = ""
  for (const p of candidates) {
    try { raw = readFileSync(p, "utf8"); usedPath = p; break } catch { /* next */ }
  }
  if (!raw) {
    throw new Error("Could not find the product sheet. Looked in:\n  " + candidates.join("\n  "))
  }
  logger.info(`Reading product sheet: ${usedPath}`)

  const rows = parseCsv(raw)
  const header = rows[0]!.map((h) => h.trim().toUpperCase())
  const col = (n: string) => header.findIndex((h) => h === n)
  const iCat = col("CATEGORY"), iName = col("PRODUCT"), iSize = col("SIZE")
  const iPrice = col("PRICE"), iIng = col("INGREDIENTS"), iUse = col("HOW TO USE")
  const iDesc = col("DESCRIPTION")

  type Row = {
    cat: string; name: string; slug: string
    variants: { size: string; price: number | null }[]
    ing: string; use: string; desc: string
  }

  const items: Row[] = []
  let cat = ""
  for (const r of rows.slice(1)) {
    const c = (r[iCat] ?? "").trim()
    if (c) cat = c
    const rawName = (r[iName] ?? "").trim()
    if (!rawName) continue

    const name = RENAME[rawName] ?? rawName
    const sizes = (r[iSize] ?? "").split(/&|,/).map(normSize).filter(Boolean)
    const prices = (r[iPrice] ?? "").split("/")
      .map((p) => parseInt(p.replace(/\D/g, ""), 10))
      .filter((n) => Number.isFinite(n))

    let variants: { size: string; price: number | null }[]
    if (prices.length === sizes.length) variants = sizes.map((s, i) => ({ size: s, price: prices[i]! }))
    else if (prices.length > sizes.length) variants = [{ size: sizes[0]!, price: prices[0]! }]
    else variants = sizes.map((s, i) => ({ size: s, price: prices[i] ?? null }))

    items.push({
      cat, name, slug: slugify(name), variants,
      ing: (r[iIng] ?? "").trim(),
      use: (r[iUse] ?? "").trim(),
      desc: (r[iDesc] ?? "").trim(),
    })
  }

  logger.info(`Parsed ${items.length} products from the sheet.`)

  const skipped = items.filter((i) => i.variants.every((v) => v.price === null))
  const usable = items.filter((i) => i.variants.some((v) => v.price !== null))
  if (skipped.length) {
    logger.warn(`Skipping ${skipped.length} with no price: ${skipped.map((s) => s.name).join(", ")}`)
  }

  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const salesChannel = channels[0], stockLocation = locations[0], shippingProfile = profiles[0]
  if (!salesChannel || !stockLocation || !shippingProfile) {
    throw new Error("Expected a sales channel, stock location and shipping profile to exist.")
  }

  const wanted = [...new Set(usable.map((i) => CATEGORY_NAME[i.cat] ?? i.cat))]
  const { data: existingCats } = await query.graph({ entity: "product_category", fields: ["id", "name"] })
  const missing = wanted.filter((n) => !existingCats.some((c: { name: string }) => c.name === n))
  if (missing.length) {
    logger.info(`Creating categories: ${missing.join(", ")}`)
    await createProductCategoriesWorkflow(container).run({
      input: { product_categories: missing.map((name) => ({ name, is_active: true })) },
    })
  }
  // Retire categories from the Medusa demo seed and the earlier taxonomy.
  const LEGACY_CATEGORIES = ["Shirts", "Sweatshirts", "Pants", "Merch", "Skin Care"]
  const legacy = existingCats.filter((c: { name: string }) => LEGACY_CATEGORIES.includes(c.name))
  if (legacy.length) {
    logger.info(`Removing legacy categories: ${legacy.map((c: { name: string }) => c.name).join(", ")}`)
    await deleteProductCategoriesWorkflow(container).run({
      input: legacy.map((c: { id: string }) => c.id),
    })
  }

  const { data: cats } = await query.graph({ entity: "product_category", fields: ["id", "name"] })
  const catId = (n: string) => {
    const f = cats.find((c: { name: string }) => c.name === n)
    if (!f) throw new Error(`Category not found: ${n}`)
    return f.id as string
  }

  const { data: existing } = await query.graph({ entity: "product", fields: ["id", "handle"] })
  // Every handle the sheet knows about — including skipped ones, so a stale
  // copy carrying an old placeholder price cannot survive a reseed.
  const handles = new Set(items.map((i) => i.slug))
  const stale = ["nalpamaradi-body-lebam", "t-shirt", "sweatshirt", "sweatpants", "shorts"]
  const toDelete = existing.filter(
    (p: { handle: string }) => handles.has(p.handle) || stale.includes(p.handle)
  )
  if (toDelete.length) {
    logger.info(`Removing ${toDelete.length} existing product(s) before reseeding…`)
    await deleteProductsWorkflow(container).run({
      input: { ids: toDelete.map((p: { id: string }) => p.id) },
    })
  }

  const products = usable.map((i) => {
    const sizes = i.variants.map((v) => v.size)
    const img = IMAGE_FOR[i.slug]
    const baseSku = "VT-" + i.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")
    return {
      title: i.name,
      handle: i.slug,
      description: i.desc,
      status: ProductStatus.PUBLISHED,
      category_ids: [catId(CATEGORY_NAME[i.cat] ?? i.cat)],
      shipping_profile_id: shippingProfile.id,
      sales_channels: [{ id: salesChannel.id }],
      images: img ? [{ url: imageUrl(img) }] : [],
      options: [{ title: "Size", values: sizes }],
      metadata: { ingredients: i.ing, how_to_use: i.use },
      variants: i.variants
        .filter((v) => v.price !== null)
        .map((v) => ({
          title: v.size,
          sku: sizes.length > 1 ? `${baseSku}-${v.size.replace(/\s+/g, "").toUpperCase()}` : baseSku,
          manage_inventory: true,
          options: { Size: v.size },
          prices: [{ amount: v.price!, currency_code: "inr" }],
        })),
    }
  })

  logger.info(`Creating ${products.length} products…`)
  await createProductsWorkflow(container).run({ input: { products } })

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item", fields: ["id", "location_levels.id"],
  })
  // Annotating the predicate's parameter made it unassignable to Array.filter's
  // signature, which failed `medusa build` — and a non-zero build exit kills the
  // Docker image. Narrow the array instead of the callback.
  const unstocked = (
    inventoryItems as unknown as { id: string; location_levels?: unknown[] }[]
  ).filter((i) => !i.location_levels?.length)
  if (unstocked.length) {
    logger.info(`Setting opening stock on ${unstocked.length} item(s)…`)
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: unstocked.map((item: { id: string }) => ({
          location_id: stockLocation.id,
          inventory_item_id: item.id,
          stocked_quantity: 100,
        })),
      },
    })
  }

  const variantCount = products.reduce((n, p) => n + p.variants.length, 0)
  logger.info(`Done. ${products.length} products, ${variantCount} variants.`)
  if (skipped.length) {
    logger.warn(`Add prices in the sheet and re-run for: ${skipped.map((s) => s.name).join(", ")}`)
  }
}
