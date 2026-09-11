/**
 * The parcel label.
 *
 * Modelled on the label Veetree already uses: sender block at the top left,
 * mark at the right with the date, then SHIPPING TO in a bordered table of
 * name, address and phone. Two things are added that the sample lacks — the
 * order number, so a parcel on the bench can be traced back to the order, and
 * the courier with its tracking number.
 *
 * Plain HTML written into a new window rather than a React view: it has to
 * print, and a document with its own stylesheet prints predictably where a
 * fragment of the dashboard does not.
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

/** The sender. Matches the address on the policies and the storefront footer. */
const SENDER = {
  name: "VEETREE",
  lines: [
    "No. 30A, Gandhinagar 2nd Street,",
    "Nandhivaram, Guduvancheri,",
    "Chengalpattu (Dt),",
    "Tamil Nadu &ndash; 603202",
  ],
  phone: "+91 63825 25233",
}

export function buildInvoice(order: InvoiceOrder, courier: string | null): string {
  const date = order.placedAt
    ? new Date(order.placedAt).toLocaleDateString("en-GB").replace(/\//g, "-")
    : new Date().toLocaleDateString("en-GB").replace(/\//g, "-")

  // The sample prints the address over several lines; anything comma-separated
  // is broken apart so a long address does not run off the label.
  const addressLines = [order.address, order.city, order.postalCode]
    .filter(Boolean)
    .join(", ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const itemCount = order.items.reduce((n, i) => n + i.qty, 0)

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Veetree — Order #${esc(order.number ?? "")}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Times New Roman",Times,Georgia,serif;color:#000;margin:0;padding:18px;font-size:15px;line-height:1.35}
  .label{border:1.5px solid #2f6b34;padding:14px 16px;max-width:760px;margin:0 auto}
  .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
  .name{font-size:23px;font-weight:700;letter-spacing:.02em;margin:0 0 2px}
  .sender div{font-size:14px}
  .right{text-align:right;font-size:14px;white-space:nowrap}
  .mark{font-size:12px;letter-spacing:.14em;color:#5c7a4a;margin-bottom:22px}
  .rule{border:0;border-top:1.5px solid #000;margin:12px 0 8px}
  h2{font-size:17px;font-weight:700;margin:0 0 8px;letter-spacing:.01em}
  table{width:100%;border-collapse:collapse}
  td{border:1px solid #000;padding:7px 10px;vertical-align:top;font-size:16px}
  td.k{width:130px;font-weight:700;letter-spacing:.02em}
  .addr div{margin-bottom:1px}
  .foot{display:flex;justify-content:space-between;gap:16px;margin-top:10px;font-size:13px}
  @media print{body{padding:0}@page{margin:10mm}}
</style></head>
<body onload="window.print()">
  <div class="label">
    <div class="top">
      <div class="sender">
        <p class="name">${SENDER.name}</p>
        ${SENDER.lines.map((l) => `<div>${l}</div>`).join("")}
        <div>Ph: ${esc(SENDER.phone)}</div>
      </div>
      <div class="right">
        <div class="mark">ROOTED IN TRADITION</div>
        <div><strong>Date:</strong> ${esc(date)}</div>
        <div><strong>Order:</strong> #${esc(order.number ?? "—")}</div>
      </div>
    </div>

    <hr class="rule">
    <h2>SHIPPING TO</h2>

    <table>
      <tr>
        <td class="k">NAME</td>
        <td>${esc(order.name ?? "—")}</td>
      </tr>
      <tr>
        <td class="k">ADDRESS</td>
        <td class="addr">${
          addressLines.length
            ? addressLines.map((l) => `<div>${esc(l)}</div>`).join("")
            : "&mdash;"
        }</td>
      </tr>
      <tr>
        <td class="k">PHONE</td>
        <td>${esc(order.phone ?? "—")}</td>
      </tr>
      <tr>
        <td class="k">ORDER ID</td>
        <td>#${esc(order.number ?? "—")}</td>
      </tr>
      <tr>
        <td class="k">COURIER</td>
        <td>${esc(courier ?? "—")}${
          order.tracking ? ` &nbsp;·&nbsp; Tracking: ${esc(order.tracking)}` : ""
        }</td>
      </tr>
    </table>

    <div class="foot">
      <span>${esc(itemCount)} item${itemCount === 1 ? "" : "s"}</span>
      <span>${order.total !== null ? `₹${order.total.toLocaleString("en-IN")} paid` : ""}</span>
      <span>${esc(order.email ?? "")}</span>
    </div>
  </div>
</body></html>`
}
