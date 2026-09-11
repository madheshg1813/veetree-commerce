/**
 * The printable bill.
 *
 * Plain HTML written into a new window rather than a React view: it has to
 * print, and a document with its own stylesheet prints predictably where a
 * fragment of the dashboard does not. It carries what the parcel and the
 * customer both need — the order number, who it is going to and how to reach
 * them, the courier and its tracking number, and what was paid.
 */
export interface InvoiceOrder {
  number: number | null
  placedAt: string | null
  name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  total: number | null
  currency: string
  tracking: string
  items: { title: string; size: string | null; qty: number; unitPrice: number | null }[]
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  )

const money = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN")}`)

export function buildInvoice(order: InvoiceOrder, courier: string | null): string {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td>${esc(i.title)}${i.size ? `<span class="muted"> · ${esc(i.size)}</span>` : ""}</td>
        <td class="num">${esc(i.qty)}</td>
        <td class="num">${money(i.unitPrice)}</td>
        <td class="num">${money(i.unitPrice === null ? null : i.unitPrice * i.qty)}</td>
      </tr>`
    )
    .join("")

  const placed = order.placedAt
    ? new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—"

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Veetree — Order #${esc(order.number ?? "")}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14190C;margin:0;padding:28px;font-size:13px;line-height:1.5}
  h1{font-size:20px;margin:0 0 2px}
  .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #283618;padding-bottom:12px;margin-bottom:18px}
  .muted{color:rgba(20,25,12,.6)}
  .grid{display:flex;gap:28px;margin-bottom:18px;flex-wrap:wrap}
  .grid section{flex:1 1 220px}
  h2{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(20,25,12,.6);margin:0 0 6px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #e6e4dd}
  th{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:rgba(20,25,12,.6)}
  .num{text-align:right;white-space:nowrap}
  tfoot td{border-bottom:0;font-weight:700;padding-top:10px}
  .track{margin-top:16px;padding:10px 12px;border:1px solid #283618;border-radius:6px;display:flex;justify-content:space-between;gap:16px}
  .track b{font-size:15px;letter-spacing:.02em}
  footer{margin-top:22px;font-size:11px;color:rgba(20,25,12,.6)}
  @media print{body{padding:0}@page{margin:14mm}}
</style></head>
<body onload="window.print()">
  <div class="brand">
    <div>
      <h1>VEETREE</h1>
      <div class="muted">Rooted in Tradition, Backed by Science.</div>
    </div>
    <div style="text-align:right">
      <div><strong>Order #${esc(order.number ?? "—")}</strong></div>
      <div class="muted">${esc(placed)}</div>
    </div>
  </div>

  <div class="grid">
    <section>
      <h2>Deliver to</h2>
      <div><strong>${esc(order.name ?? "—")}</strong></div>
      <div>${esc(order.address ?? "")}</div>
      <div>${esc([order.city, order.postalCode].filter(Boolean).join(" "))}</div>
    </section>
    <section>
      <h2>Contact</h2>
      <div>${esc(order.phone ?? "—")}</div>
      <div>${esc(order.email ?? "—")}</div>
    </section>
    <section>
      <h2>Courier</h2>
      <div><strong>${esc(courier ?? "—")}</strong></div>
      <div class="muted">Tracking ${esc(order.tracking || "not yet recorded")}</div>
    </section>
  </div>

  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="muted">No items recorded.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3" class="num">Total paid</td><td class="num">${money(order.total)}</td></tr></tfoot>
  </table>

  <div class="track">
    <span><span class="muted">Courier</span> <b>${esc(courier ?? "—")}</b></span>
    <span><span class="muted">Tracking</span> <b>${esc(order.tracking || "—")}</b></span>
  </div>

  <footer>
    Veetree Life · No. 30A, Gandhinagar 2nd Street, Nandhivaram, Guduvancheri, Tamil Nadu 603202 ·
    veetreework@gmail.com · Exchange only, within 48 hours, with an unboxing video. See
    www.veetree.life/refund-policy
  </footer>
</body></html>`
}
