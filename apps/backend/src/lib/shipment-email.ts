import { courierName } from "./couriers"

/**
 * Tells a customer their parcel is on its way.
 *
 * Sent from the backend rather than the storefront because this is triggered
 * by someone typing a tracking number into the dashboard, and the order data
 * is already in hand at that moment.
 *
 * Resend is called directly rather than through a notification provider: the
 * backend sends two messages in total, and a whole module for that would be
 * more to configure and more to go wrong. Same three variables the password
 * reset needs — RESEND_API_KEY, EMAIL_FROM, STOREFRONT_URL.
 */
export interface ShipmentOrder {
  number: number | null
  email: string | null
  name: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  total: number | null
  items: { title: string; size: string | null; qty: number }[]
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  )

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "no-key" | "no-recipient" | "rejected" | "network" }

export async function sendTrackingEmail(
  order: ShipmentOrder,
  courierId: string,
  tracking: string
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return { sent: false, reason: "no-key" }
  if (!order.email) return { sent: false, reason: "no-recipient" }

  const from = process.env.EMAIL_FROM?.trim() || "Veetree <no-reply@veetree.life>"
  const site = (process.env.STOREFRONT_URL?.trim() || "https://www.veetree.life").replace(/\/$/, "")
  const courier = courierName(courierId) ?? courierId
  const orderNo = order.number !== null ? `#${order.number}` : ""

  const lines = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 0">${esc(i.title)}${
          i.size ? ` <span style="color:#6b7280">· ${esc(i.size)}</span>` : ""
        }</td><td style="padding:4px 0;text-align:right">×${esc(i.qty)}</td></tr>`
    )
    .join("")

  const address = [order.address, order.city, order.postalCode].filter(Boolean).join(", ")

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#14190C">
      <h1 style="font-size:20px;margin:0 0 4px">Your order is on its way</h1>
      <p style="margin:0 0 20px;color:rgba(20,25,12,.68)">Order ${esc(orderNo)}</p>

      <div style="border:1px solid #e6e4dd;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 6px;font-size:13px;color:rgba(20,25,12,.68)">Courier</p>
        <p style="margin:0 0 14px;font-size:16px;font-weight:600">${esc(courier)}</p>
        <p style="margin:0 0 6px;font-size:13px;color:rgba(20,25,12,.68)">Tracking number</p>
        <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:.02em">${esc(tracking)}</p>
      </div>

      <p style="line-height:1.6;margin:0 0 18px">
        Use that number on ${esc(courier)}'s own tracking page to follow the parcel. It can take
        up to 24 hours to start showing movement.
      </p>

      ${
        lines
          ? `<p style="font-size:13px;color:rgba(20,25,12,.68);margin:0 0 6px">In this parcel</p>
             <table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px">${lines}</table>`
          : ""
      }

      ${
        address
          ? `<p style="font-size:13px;color:rgba(20,25,12,.68);margin:0 0 6px">Delivering to</p>
             <p style="margin:0 0 18px;line-height:1.5">${esc(order.name ?? "")}<br>${esc(address)}</p>`
          : ""
      }

      <p style="line-height:1.6;margin:0 0 6px;font-size:13px;color:rgba(20,25,12,.68)">
        Please film a single continuous video as you open the parcel. We can only accept an
        exchange with one, and it has to start before the tape is cut.
        <a href="${site}/refund-policy" style="color:#283618">Read why</a>.
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:rgba(20,25,12,.68)">
        Veetree · ${site.replace(/^https?:\/\//, "")}
      </p>
    </div>`

  const text = [
    `Your order ${orderNo} is on its way.`,
    "",
    `Courier: ${courier}`,
    `Tracking number: ${tracking}`,
    "",
    order.items.length
      ? "In this parcel: " + order.items.map((i) => `${i.title}${i.size ? ` (${i.size})` : ""} x${i.qty}`).join(", ")
      : "",
    address ? `Delivering to: ${order.name ?? ""}, ${address}` : "",
    "",
    "Please film a continuous unboxing video — we can only accept an exchange with one.",
    `${site}/refund-policy`,
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [order.email],
        subject: `Your Veetree order ${orderNo} has shipped`,
        html,
        text,
      }),
    })
    // The tracking number must never reach a log, so only the status is kept.
    if (!res.ok) {
      console.error(`[tracking-email] Resend refused the message: ${res.status}`)
      return { sent: false, reason: "rejected" }
    }
    return { sent: true }
  } catch {
    console.error("[tracking-email] could not reach Resend")
    return { sent: false, reason: "network" }
  }
}
