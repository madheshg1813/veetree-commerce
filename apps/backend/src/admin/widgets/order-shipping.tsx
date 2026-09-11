import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Select, Table, Toaster, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { buildInvoice, type InvoiceOrder } from "../lib/invoice"

/**
 * The dashboard authenticates with a JWT held in localStorage, not a cookie,
 * so a fetch without this header is anonymous and comes back 401.
 */
const authHeaders = (): Record<string, string> => {
  let token: string | null = null
  try { token = window.localStorage.getItem("medusa_auth_token") } catch { /* blocked */ }
  if (!token) {
    try { token = window.sessionStorage.getItem("medusa_auth_token") } catch { /* blocked */ }
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * A printer, drawn to match Medusa's own icons — 15x15, currentColor, 1.2
 * stroke — so the button sits with the rest of the dashboard rather than
 * showing an emoji that renders differently on every platform.
 */
const PrinterIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 5.5V2h7v3.5" />
    <path d="M4 11H2.8A1.3 1.3 0 0 1 1.5 9.7V6.8A1.3 1.3 0 0 1 2.8 5.5h9.4a1.3 1.3 0 0 1 1.3 1.3v2.9a1.3 1.3 0 0 1-1.3 1.3H11" />
    <path d="M4 9h7v4H4z" />
  </svg>
)

interface Courier { id: string; name: string }
interface Order extends InvoiceOrder {
  id: string
  state: string | null
  courier: string | null
  auto: string | null
}

/**
 * The despatch strip, directly under Medusa's own order list.
 *
 * Medusa's table cannot take an extra column: the admin exposes only
 * `order.list.before` and `order.list.after`, and a custom route cannot shadow
 * a core one — custom routes are spliced in after the built-in ones, so the
 * built-in `/orders` always wins. This sits immediately below that table
 * instead, on the same screen, carrying the courier and the print button the
 * table itself has no room for.
 *
 * The full page at Shipping shows the same thing with the delivery address.
 */
const OrderShippingWidget = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { courier: string; tracking: string }>>({})

  const load = () => {
    fetch("/admin/shipping", { credentials: "include", headers: authHeaders() })
      .then((r) => r.json())
      .then((d: { orders?: Order[]; couriers?: Courier[] }) => {
        const list = d.orders ?? []
        setOrders(list)
        setCouriers(d.couriers ?? [])
        setDraft(
          Object.fromEntries(
            list.map((o) => [o.id, { courier: o.courier ?? o.auto ?? "", tracking: o.tracking ?? "" }])
          )
        )
      })
      .catch(() => toast.error("Could not load shipping details."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const nameOf = (id: string) => couriers.find((c) => c.id === id)?.name ?? id

  const setRow = (id: string, patch: Partial<{ courier: string; tracking: string }>) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { courier: "", tracking: "" }), ...patch } }))

  const save = async (o: Order) => {
    const row = draft[o.id]
    if (!row) return
    setSavingId(o.id)
    try {
      const res = await fetch("/admin/shipping", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ orderId: o.id, courier: row.courier, tracking: row.tracking }),
      })
      if (!res.ok) throw new Error()
      const out = (await res.json()) as { emailed?: boolean; emailReason?: string | null }
      // Say whether the customer was told, rather than leaving it a mystery.
      if (out.emailed) toast.success(`Order #${o.number ?? ""} saved — tracking emailed to the customer.`)
      else if (out.emailReason === "no-key") toast.warning("Saved. No email sent: RESEND_API_KEY is not set on this service.")
      else if (out.emailReason === "no-recipient") toast.warning("Saved. No email sent: this order has no email address.")
      else if (out.emailReason) toast.warning("Saved, but the tracking email could not be sent.")
      else toast.success(`Order #${o.number ?? ""} saved.`)
      load()
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setSavingId(null)
    }
  }

  const print = (o: Order) => {
    const row = draft[o.id]
    if (!row?.courier) {
      toast.error("Choose a courier for this order first.")
      return
    }
    const win = window.open("", "_blank", "width=820,height=900")
    if (!win) {
      toast.error("Your browser blocked the print window. Allow pop-ups for this site.")
      return
    }
    win.document.write(
      buildInvoice({ ...o, tracking: row.tracking }, nameOf(row.courier))
    )
    win.document.close()
  }

  if (loading) return null
  if (!orders.length) return null

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Courier &amp; bill</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Tamil Nadu pin codes are set to ST Courier automatically. Choose the courier yourself for
          anywhere else.
        </Text>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Courier</Table.HeaderCell>
              <Table.HeaderCell>Tracking</Table.HeaderCell>
              <Table.HeaderCell>Total</Table.HeaderCell>
              <Table.HeaderCell>Bill</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {orders.map((o) => {
              const row = draft[o.id] ?? { courier: o.auto ?? "", tracking: "" }
              return (
                <Table.Row key={o.id}>
                  <Table.Cell>
                    <Text size="small" weight="plus">#{o.number ?? "—"}</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {[o.city, o.state].filter(Boolean).join(", ")}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Select size="small" value={row.courier} onValueChange={(v) => setRow(o.id, { courier: v })}>
                      <Select.Trigger>
                        <Select.Value placeholder="Choose courier" />
                      </Select.Trigger>
                      <Select.Content>
                        {couriers.map((c) => (
                          <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                    {!o.courier && o.auto ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">automatic · Tamil Nadu</Text>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <Input
                      size="small"
                      placeholder="Tracking number"
                      value={row.tracking}
                      onChange={(e) => setRow(o.id, { tracking: e.target.value })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {o.total !== null ? `₹${o.total.toLocaleString("en-IN")}` : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2">
                      <Button size="small" variant="secondary" onClick={() => save(o)} disabled={savingId === o.id}>
                        {savingId === o.id ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="small"
                        variant="transparent"
                        onClick={() => print(o)}
                        title="Print the parcel label"
                        aria-label="Print the parcel label"
                      >
                        <PrinterIcon />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      </div>

      <Toaster />
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.list.after" })

export default OrderShippingWidget
