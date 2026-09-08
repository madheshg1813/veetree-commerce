import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Badge, Toaster, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

interface Row {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
  sku: string | null
  price: number | null
}

/**
 * The whole price sheet on one screen.
 *
 * Medusa's own editor sits behind a product's overflow menu and handles one
 * product at a time, which is a poor fit for how Veetree prices things — a
 * sheet of everything, reviewed together. Only changed rows are sent on save.
 */
const PricesPage = () => {
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState("")

  const load = () => {
    setLoading(true)
    fetch("/admin/prices", { credentials: "include" })
      .then((r) => r.json() as Promise<{ rows?: Row[] }>)
      .then((d) => {
        setRows(d.rows ?? [])
        setDraft(
          Object.fromEntries((d.rows ?? []).map((r) => [r.variantId, r.price == null ? "" : String(r.price)]))
        )
      })
      .catch(() => toast.error("Could not load prices."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  /** Rows whose field differs from what is stored — the only ones we send. */
  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const typed = (draft[r.variantId] ?? "").trim()
        if (typed === "") return false
        return Number(typed) !== r.price
      }),
    [rows, draft]
  )

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.productTitle.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        r.variantTitle.toLowerCase().includes(q)
    )
  }, [rows, filter])

  const save = async () => {
    if (changed.length === 0) return
    setSaving(true)
    try {
      const res = await fetch("/admin/prices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: changed.map((r) => ({ variantId: r.variantId, price: Number(draft[r.variantId]) })),
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message ?? String(res.status))
      }
      toast.success(`Saved ${changed.length} price${changed.length === 1 ? "" : "s"}.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <Toaster />
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Prices</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          Selling price in rupees for every size. Change what you need and press Save — only
          edited rows are written. The storefront picks the new price up within a minute.
        </Text>
      </div>

      <div className="flex items-center gap-x-3 px-6 py-3">
        <Input
          placeholder="Filter by product, size or SKU"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button onClick={save} isLoading={saving} disabled={loading || changed.length === 0}>
          {changed.length ? `Save ${changed.length}` : "Save"}
        </Button>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-ui-fg-muted txt-compact-xsmall-plus">
                <th className="py-2">Product</th>
                <th className="py-2">Size</th>
                <th className="py-2">SKU</th>
                <th className="py-2 w-40">Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const typed = (draft[r.variantId] ?? "").trim()
                const edited = typed !== "" && Number(typed) !== r.price
                return (
                  <tr key={r.variantId} className="border-t border-ui-border-base">
                    <td className="py-2 pr-4 txt-compact-small">{r.productTitle}</td>
                    <td className="py-2 pr-4 txt-compact-small text-ui-fg-subtle">{r.variantTitle}</td>
                    <td className="py-2 pr-4 txt-compact-xsmall text-ui-fg-muted">{r.sku ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-x-2">
                        <Input
                          type="number"
                          min={0}
                          value={draft[r.variantId] ?? ""}
                          onChange={(e) => setDraft({ ...draft, [r.variantId]: e.target.value })}
                        />
                        {edited ? <Badge size="2xsmall">edited</Badge> : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Prices",
})

export default PricesPage
