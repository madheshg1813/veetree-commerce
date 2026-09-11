import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Select, Toaster, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { buildInvoice, type InvoiceOrder } from "../lib/invoice"

/**
 * The dashboard keeps its JWT in localStorage and sends it as a bearer token,
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
 * Courier and parcel label on a single order.
 *
 * This one uses a real widget zone rather than writing into the page: the
 * order detail route exposes `order.details.side.after`, so it sits in the
 * right-hand column under Customer, where despatch details belong.
 */
const OrderDetailShipping = ({ data }: { data: { id: string } }) => {
  const [order, setOrder] = useState<Order | null>(null)
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [courier, setCourier] = useState("")
  const [tracking, setTracking] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    fetch(`/admin/shipping?orderId=${encodeURIComponent(data.id)}`, {
      credentials: "include",
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d: { orders?: Order[]; couriers?: Courier[] }) => {
        const found = (d.orders ?? [])[0] ?? null
        setOrder(found)
        setCouriers(d.couriers ?? [])
        if (found) {
          setCourier(found.courier ?? found.auto ?? "")
          setTracking(found.tracking ?? "")
        }
      })
      .catch(() => toast.error("Could not load shipping details."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [data.id])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/admin/shipping", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ orderId: data.id, courier, tracking }),
      })
      if (!res.ok) throw new Error()
      const out = (await res.json()) as { emailed?: boolean; emailReason?: string | null }
      if (out.emailed) toast.success("Saved — tracking emailed to the customer.")
      else if (out.emailReason === "no-key") toast.warning("Saved. No email sent: RESEND_API_KEY is not set on this service.")
      else if (out.emailReason === "no-recipient") toast.warning("Saved. No email sent: this order has no email address.")
      else if (out.emailReason) toast.warning("Saved, but the tracking email could not be sent.")
      else toast.success("Saved.")
      load()
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const print = () => {
    if (!order) return
    if (!courier) {
      toast.error("Choose a courier first.")
      return
    }
    const win = window.open("", "_blank", "width=820,height=900")
    if (!win) {
      toast.error("Your browser blocked the print window. Allow pop-ups for this site.")
      return
    }
    win.document.write(
      buildInvoice({ ...order, tracking }, couriers.find((c) => c.id === courier)?.name ?? courier)
    )
    win.document.close()
  }

  if (loading || !order) return null

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Courier &amp; bill</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {order.auto && !order.courier
            ? "Tamil Nadu pin code — ST Courier chosen automatically."
            : "Choose the courier, then print the parcel label."}
        </Text>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex flex-col gap-1">
          <Text size="xsmall" className="text-ui-fg-subtle">Courier</Text>
          <Select value={courier} onValueChange={setCourier}>
            <Select.Trigger>
              <Select.Value placeholder="Choose courier" />
            </Select.Trigger>
            <Select.Content>
              {couriers.map((c) => (
                <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Text size="xsmall" className="text-ui-fg-subtle">Tracking number</Text>
          <Input
            placeholder="e.g. ST123456789IN"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="small" variant="secondary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="small" onClick={print}>
            <PrinterIcon />
            Print label
          </Button>
        </div>
      </div>

      <Toaster />
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default OrderDetailShipping
