import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  deleteProductsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Seeds VeeTree's real catalogue and removes the demo products that ship
 * with the starter.
 *
 * Run with:  npx medusa exec ./src/scripts/seed-veetree.ts
 *
 * Safe to re-run — it skips anything that already exists.
 */

// Images are served by the backend's local file provider from /static.
// Set MEDUSA_BACKEND_URL before running to point these at a deployed host.
const BASE = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

/**
 * ⚠️ PLACEHOLDER PRICES — in whole rupees.
 * VeeTree has not supplied a price list yet. Every one of these is a guess.
 * Edit here and re-run, or change them directly in the admin.
 */
type Seed = {
  slug: string
  title: string
  category: string
  size: string
  priceInr: number
  weightG: number
  description: string
}

const PRODUCTS: Seed[] = [
  {
    slug: "kumkumadi-serum",
    title: "Kumkumadi Brightening Face Serum",
    category: "Skin Care",
    size: "20 ml",
    priceInr: 1299,
    weightG: 80,
    description:
      "24k gold, goat milk and 12+ vital herbs steeped with pure saffron for a radiant, even tone. Suitable for all skin types.",
  },
  {
    slug: "multi-floral-gel",
    title: "Multi-Floral Gel",
    category: "Skin Care",
    size: "30 ml",
    priceInr: 899,
    weightG: 90,
    description:
      "Peptides, hyaluronic acid and flower acids in a weightless gel for healthy ageing and rejuvenation.",
  },
  {
    slug: "aloe-vera-gel",
    title: "Aloe Vera Gel",
    category: "Skin Care",
    size: "100 g",
    priceInr: 399,
    weightG: 150,
    description:
      "Organic, cold-pressed aloe enriched with vitamin E — the calm-everything step for stressed skin.",
  },
  {
    slug: "rose-hydrosol",
    title: "Rose Hydrosol",
    category: "Skin Care",
    size: "100 ml",
    priceInr: 449,
    weightG: 150,
    description:
      "Steam-distilled rose water that tones, restores pH balance and leaves skin softly scented.",
  },
  {
    slug: "hair-growth-oil",
    title: "Hair Growth Oil",
    category: "Hair Care",
    size: "200 ml",
    priceInr: 649,
    weightG: 260,
    description:
      "A slow-infused blend of amla, hibiscus and coconut that promotes growth and controls hairfall. For all hair types.",
  },
  {
    slug: "scalp-hair-rebirth-serum",
    title: "Scalp & Hair Rebirth Serum",
    category: "Hair Care",
    size: "30 ml",
    priceInr: 899,
    weightG: 90,
    description:
      "An 8+ botanical blend with a potent mix of seed oils, made for tired scalps and thinning lengths.",
  },
  {
    slug: "seed-petal-shampoo",
    title: "Seed-Petal Shampoo",
    category: "Hair Care",
    size: "200 ml",
    priceInr: 549,
    weightG: 250,
    description:
      "Rosemary, hibiscus and flaxseed lather gently for strength and shine without stripping.",
  },
  {
    slug: "rosemary-hydrosol",
    title: "Rosemary Hydrosol",
    category: "Hair Care",
    size: "100 ml",
    priceInr: 449,
    weightG: 150,
    description:
      "A daily scalp mist distilled from fresh rosemary to nourish roots and strengthen hair.",
  },
  {
    slug: "nalpamaradi-body-lebam",
    title: "Nalpamaradi Body Lebam",
    category: "Body Care",
    size: "15 g",
    priceInr: 499,
    weightG: 60,
    description:
      "A 13+ herb blend that brightens skin and fades body pigmentation, in a travel-friendly tin.",
  },
  {
    slug: "patchouli-shower-gel",
    title: "Patchouli Shower Gel",
    category: "Body Care",
    size: "200 ml",
    priceInr: 549,
    weightG: 250,
    description:
      "Infused with lavender buds and grounding patchouli — a shower that smooths and resets you.",
  },
  {
    slug: "mango-lip-oil",
    title: "Mango Lip Oil",
    category: "Lip Care",
    size: "Roll-on",
    priceInr: 299,
    weightG: 30,
    description:
      "Hydrating and healing mango butter oil in a roll-on that lives in every pocket you own.",
  },
]

const CATEGORY_NAMES = ["Skin Care", "Hair Care", "Body Care", "Lip Care"]
const DEMO_HANDLES = ["t-shirt", "sweatshirt", "sweatpants", "shorts"]

export default async function seedVeetree({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // ── Existing infrastructure created by the starter seed ────────────────
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.*"],
  })

  const salesChannel = salesChannels[0]
  const stockLocation = stockLocations[0]
  const shippingProfile = shippingProfiles[0]
  const store = stores[0]

  if (!salesChannel || !stockLocation || !shippingProfile || !store) {
    throw new Error(
      "Expected the starter seed to have created a sales channel, stock location, shipping profile and store."
    )
  }

  // ── Currency: add INR and make it the default ──────────────────────────
  const existing = (store.supported_currencies ?? []).map(
    (c) => c?.currency_code
  )

  if (!existing.includes("inr")) {
    logger.info("Adding INR to the store's supported currencies...")
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            { currency_code: "inr", is_default: true },
            ...existing
              .filter((c: string) => c !== "inr")
              .map((currency_code: string) => ({
                currency_code,
                is_default: false,
              })),
          ],
        },
      },
    })
  }

  // ── Region: India ──────────────────────────────────────────────────────
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
  })

  let indiaRegion = regions.find((r: { name: string }) => r.name === "India")

  if (!indiaRegion) {
    logger.info("Creating the India region...")
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "India",
            currency_code: "inr",
            countries: ["in"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    // RegionDTO lacks a few of Region's relation fields; only id and name are
    // read from here, so narrow rather than widen the declared type.
    indiaRegion = result[0] as unknown as typeof indiaRegion

    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "in" }],
    })
  }

  // ── Categories ─────────────────────────────────────────────────────────
  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })

  const missing = CATEGORY_NAMES.filter(
    (name) => !existingCategories.some((c: { name: string }) => c.name === name)
  )

  if (missing.length) {
    logger.info(`Creating categories: ${missing.join(", ")}`)
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((name) => ({ name, is_active: true })),
      },
    })
  }

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoryId = (name: string) => {
    const found = categories.find((c: { name: string }) => c.name === name)
    if (!found) throw new Error(`Category not found: ${name}`)
    return found.id as string
  }

  // ── Remove the starter's demo products ─────────────────────────────────
  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })

  const demo = allProducts.filter((p: { handle: string }) =>
    DEMO_HANDLES.includes(p.handle)
  )

  if (demo.length) {
    logger.info(`Deleting ${demo.length} demo product(s)...`)
    await deleteProductsWorkflow(container).run({
      input: { ids: demo.map((p: { id: string }) => p.id) },
    })
  }

  // ── VeeTree catalogue ──────────────────────────────────────────────────
  const alreadySeeded = new Set(
    allProducts.map((p: { handle: string }) => p.handle)
  )
  const toCreate = PRODUCTS.filter((p) => !alreadySeeded.has(p.slug))

  if (!toCreate.length) {
    logger.info("All VeeTree products already exist — nothing to create.")
  } else {
    logger.info(`Creating ${toCreate.length} VeeTree product(s)...`)
    await createProductsWorkflow(container).run({
      input: {
        products: toCreate.map((p) => ({
          title: p.title,
          handle: p.slug,
          description: p.description,
          status: ProductStatus.PUBLISHED,
          weight: p.weightG,
          category_ids: [categoryId(p.category)],
          shipping_profile_id: shippingProfile.id,
          sales_channels: [{ id: salesChannel.id }],
          images: [{ url: `${BASE}/static/${p.slug}.jpg` }],
          options: [{ title: "Size", values: [p.size] }],
          variants: [
            {
              title: p.size,
              sku: `VT-${p.slug.toUpperCase()}`,
              manage_inventory: true,
              options: { Size: p.size },
              prices: [{ amount: p.priceInr, currency_code: "inr" }],
            },
          ],
        })),
      },
    })
  }

  // ── Stock ──────────────────────────────────────────────────────────────
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.id"],
  })

  // Annotating the predicate's parameter made it unassignable to Array.filter's
  // signature, which failed `medusa build` — and a non-zero build exit kills the
  // Docker image. Narrow the array instead of the callback.
  const unstocked = (
    inventoryItems as unknown as { id: string; location_levels?: unknown[] }[]
  ).filter((i) => !i.location_levels?.length)

  if (unstocked.length) {
    logger.info(`Setting opening stock on ${unstocked.length} item(s)...`)
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

  logger.info("VeeTree catalogue seeded.")
}
