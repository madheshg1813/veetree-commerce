import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Select, Table, Toaster, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
// Outside routes/: everything under a route folder is treated as a page and
// transformed as one, which made Vite process this module twice.
import { buildInvoice, type InvoiceOrder } from "../../lib/invoice"

interface Courier { id: string; name: string }

interface Order extends InvoiceOrder {
  id: string
  state: string | null
  /** Recorded against the order, once someone has saved it. */
  courier: string | null
  /** Decided by the pin code — Tamil Nadu only. Null everywhere else. */
  auto: string | null
}

/**
 * The shipping desk.
 *
 * Medusa's own order list cannot take an extra column — the admin exposes only
 * `order.list.before` and `.after` — so the orders are listed again here with
 * what despatch actually needs: where it is going, which courier the rules
 * pick, somewhere to put the tracking number, and a bill to print.
 *
 * The courier is a suggestion until someone saves it. Nothing is chosen on an
 * order's behalf silently.
 */
const ShippingPage = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { courier: string; tracking: string }>>({})

  const load = () => {
    fetch("/admin/shipping", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { orders?: Order[]; couriers?: Courier[] }) => {
        const list = d.orders ?? []
        setOrders(list)
        setCouriers(d.couriers ?? [])
        // A saved choice wins; otherwise the automatic one, which is empty for
        // anywhere outside Tamil Nadu so the field reads as "not yet chosen".
        setDraft(
          Object.fromEntries(
            list.map((o) => [o.id, { courier: o.courier ?? o.auto ?? "", tracking: o.tracking ?? "" }])
          )
        )
      })
      .catch(() => toast.error("Could not load orders."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const courierName = useMemo(
    () => (id: string) => couriers.find((c) => c.id === id)?.name ?? id,
    [couriers]
  )

  const save = async (order: Order) => {
    const row = draft[order.id]
    if (!row) return
    setSavingId(order.id)
    try {
      const res = await fetch("/admin/shipping", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, courier: row.courier, tracking: row.tracking }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Order #${order.number ?? ""} updated.`)
      load()
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setSavingId(null)
    }
  }

  /**
   * The bill opens in its own window and prints itself. A window rather than a
   * download: despatch wants paper, and this way the browser's own print
   * dialogue chooses the printer and the paper size.
   */
  const print = (order: Order) => {
    const row = draft[order.id]
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
      buildInvoice(
        { ...order, tracking: row?.tracking ?? order.tracking },
        row?.courier ? courierName(row.courier) : null
      )
    )
    win.document.close()
  }

  const setRow = (id: string, patch: Partial<{ courier: string; tracking: string }>) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { courier: "", tracking: "" }), ...patch } }))

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Shipping</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            The courier each order goes to, its tracking number, and the bill to print.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          Tamil Nadu pin codes are set to ST Courier automatically. Anywhere else, choose the
          courier yourself before saving — nothing is picked for you.
        </Text>
      </div>

      {loading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">Loading orders…</Text>
        </div>
      ) : orders.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">No orders yet.</Text>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell>Destination</Table.HeaderCell>
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
                        {o.placedAt ? new Date(o.placedAt).toLocaleDateString("en-IN") : ""}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{o.name ?? "—"}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">{o.phone ?? o.email ?? ""}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{[o.city, o.state].filter(Boolean).join(", ") || "—"}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">{o.postalCode ?? ""}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Select
                        size="small"
                        value={row.courier}
                        onValueChange={(v) => setRow(o.id, { courier: v })}
                      >
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
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          automatic · Tamil Nadu
                        </Text>
                      ) : !o.courier ? (
                        <Text size="xsmall" className="text-ui-fg-subtle">not chosen yet</Text>
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
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => save(o)}
                          disabled={savingId === o.id}
                        >
                          {savingId === o.id ? "Saving…" : "Save"}
                        </Button>
                        <Button size="small" variant="transparent" onClick={() => print(o)} title="Print the bill">
                          🖨
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </div>
      )}

      <Toaster />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Shipping" })

export default ShippingPage
