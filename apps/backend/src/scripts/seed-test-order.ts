import { Modules } from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"

/**
 * One order in the local database, so the shipping columns have something to
 * render against. Development only — production has real orders.
 *
 * Tamil Nadu on purpose: 600096 is Perungudi, Chennai, which is what the
 * automatic ST Courier rule is meant to catch.
 */
export default async function seedTestOrder({ container }: ExecArgs) {
  const orderModule = container.resolve(Modules.ORDER)

  const existing = await orderModule.listOrders({}, { take: 1 })
  if (existing.length) {
    console.log(`Local database already has an order — nothing seeded.`)
    return
  }

  const [order] = await orderModule.createOrders([
    {
      email: "aiswariya@example.com",
      currency_code: "inr",
      shipping_address: {
        first_name: "Aiswariya",
        last_name: "R",
        address_1: "Heritage phase 2, Plot no 6",
        address_2: "Telephone nagar main road",
        city: "Perungudi, Chennai",
        province: "Tamil Nadu",
        postal_code: "600096",
        country_code: "in",
        phone: "+91 72002 47219",
      },
      items: [
        {
          title: "Kumkumadi Serum",
          variant_title: "15 ml",
          quantity: 1,
          unit_price: 277,
        },
      ],
    },
  ])

  console.log("Seeded order:", order.id, "display_id", order.display_id)
}
