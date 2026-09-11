import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { buildInvoice, type InvoiceOrder } from "../lib/invoice"

interface Courier { id: string; name: string }
interface Order extends InvoiceOrder {
  id: string
  state: string | null
  courier: string | null
  auto: string | null
}

/**
 * Adds Courier and Bill columns to Medusa's own order table.
 *
 * The admin has no supported way to do this. It offers widget zones before and
 * after the list, not inside it, and a custom route cannot shadow the core
 * `/orders` — custom routes are appended after the built-in ones, so the
 * built-in always matches first. So this widget renders nothing itself and
 * instead writes the two cells into the rendered table.
 *
 * That means it depends on Medusa's markup, which is not a contract. Every
 * step is therefore defensive: it identifies columns by their heading text
 * rather than by position or class name, it re-applies on re-render through a
 * MutationObserver, and anything unexpected makes it stop rather than throw.
 * If a dashboard upgrade changes the table, the columns quietly disappear and
 * the rest of the page still works — the Shipping page and the panel below
 * the list carry the same information.
 *
 * Only the courier name and the print button go in. Choosing a courier stays
 * in the panel below, because a dropdown injected into a table React owns
 * would be torn out on the next re-render.
 */

const MARK = "data-veetree-shipping"

const cellText = (el: Element | null) => (el?.textContent ?? "").trim().toLowerCase()

const OrderTableColumns = () => {
  useEffect(() => {
    let orders: Order[] = []
    let couriers: Courier[] = []
    let stopped = false

    const nameOf = (id: string | null) =>
      id ? couriers.find((c) => c.id === id)?.name ?? id : null

    /** Rows show "#2"; the API gives display_id. That is the join. */
    const byNumber = () => {
      const map = new Map<string, Order>()
      for (const o of orders) if (o.number !== null) map.set(String(o.number), o)
      return map
    }

    const print = (order: Order, courier: string | null) => {
      if (!courier) {
        window.alert("Choose a courier for this order first, in the panel below the table.")
        return
      }
      const win = window.open("", "_blank", "width=820,height=900")
      if (!win) return
      win.document.write(buildInvoice(order, courier))
      win.document.close()
    }

    const decorate = () => {
      if (stopped || !orders.length) return
      const lookup = byNumber()

      for (const table of Array.from(document.querySelectorAll("table"))) {
        const headRow = table.querySelector("thead tr")
        if (!headRow) continue

        const heads = Array.from(headRow.children)
        const fulfilmentAt = heads.findIndex((h) => cellText(h).includes("fulfillment"))
        const totalAt = heads.findIndex((h) => cellText(h).includes("order total"))
        // Not the orders table.
        if (fulfilmentAt === -1 || totalAt === -1) continue

        if (!headRow.querySelector(`[${MARK}]`)) {
          const mk = (label: string) => {
            const th = document.createElement("th")
            th.setAttribute(MARK, "head")
            th.className = heads[totalAt]?.className ?? ""
            th.textContent = label
            return th
          }
          // Inserted from the right first, so the earlier index stays valid.
          heads[totalAt]?.after(mk("Bill"))
          heads[fulfilmentAt]?.after(mk("Courier"))
        }

        for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
          if (row.querySelector(`[${MARK}]`)) continue
          const cells = Array.from(row.children)
          const number = (cells[0]?.textContent ?? "").trim().replace(/^#/, "")
          const order = lookup.get(number)
          if (!order) continue

          const courier = nameOf(order.courier ?? order.auto)
          const template = cells[totalAt]?.className ?? ""

          const billCell = document.createElement("td")
          billCell.setAttribute(MARK, "cell")
          billCell.className = template
          const button = document.createElement("button")
          button.type = "button"
          button.textContent = "🖨"
          button.title = "Print the bill"
          button.style.cssText = "cursor:pointer;background:none;border:0;font-size:15px;line-height:1"
          button.addEventListener("click", (e) => {
            // The row itself navigates to the order; printing must not.
            e.preventDefault()
            e.stopPropagation()
            print(order, courier)
          })
          billCell.appendChild(button)

          const courierCell = document.createElement("td")
          courierCell.setAttribute(MARK, "cell")
          courierCell.className = template
          courierCell.textContent = courier ?? "—"
          if (!courier) courierCell.style.opacity = "0.5"

          cells[totalAt]?.after(billCell)
          cells[fulfilmentAt]?.after(courierCell)
        }
      }
    }

    fetch("/admin/shipping", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { orders?: Order[]; couriers?: Courier[] }) => {
        if (stopped) return
        orders = d.orders ?? []
        couriers = d.couriers ?? []
        decorate()
      })
      .catch(() => {
        /* Without the data there is nothing to add; the table is unharmed. */
      })

    // The table is re-rendered on sort, filter and page change, which drops
    // anything we added. Watching puts it back.
    const observer = new MutationObserver(() => {
      try { decorate() } catch { stopped = true; observer.disconnect() }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      stopped = true
      observer.disconnect()
      document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove())
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrderTableColumns
