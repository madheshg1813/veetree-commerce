import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Badge, Select, Checkbox, Toaster, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

interface Row {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
  sku: string | null
  price: number | null
  categories?: string[]
}

const ALL = "__all__"
/** Anything below this is questioned on save — see the API route. */
const LOW_PRICE = 50

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
  const [category, setCategory] = useState(ALL)
  const [allowLow, setAllowLow] = useState(false)

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

  /** Categories present in the catalogue, in menu order where recognised. */
  const categories = useMemo(() => {
    const order = ["Face Care", "Hair Care", "Body Care", "Lip Care", "Eye Care"]
    const found = new Set<string>()
    for (const r of rows) for (const c of r.categories ?? []) found.add(c)
    const known = order.filter((c) => found.has(c))
    const rest = [...found].filter((c) => !order.includes(c)).sort()
    return [...known, ...rest]
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((r) => {
      if (category !== ALL && !(r.categories ?? []).includes(category)) return false
      if (!q) return true
      return (
        r.productTitle.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        r.variantTitle.toLowerCase().includes(q)
      )
    })
  }, [rows, filter, category])

  const lowEdits = useMemo(
    () => changed.filter((r) => {
      const n = Number(draft[r.variantId])
      return n > 0 && n < LOW_PRICE
    }),
    [changed, draft]
  )

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
          confirmLow: allowLow,
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

      <div className="flex flex-col gap-y-3 px-6 py-3">
        <div className="flex items-center gap-x-3">
          <div className="w-56">
            <Select value={category} onValueChange={setCategory}>
              <Select.Trigger>
                <Select.Value placeholder="All categories" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>All categories</Select.Item>
                {categories.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Input
            placeholder="Filter by product, size or SKU"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button onClick={save} isLoading={saving} disabled={loading || changed.length === 0}>
            {changed.length ? `Save ${changed.length}` : "Save"}
          </Button>
        </div>
        <div className="flex items-center gap-x-4">
          <Text size="xsmall" className="text-ui-fg-muted">
            {shown.length} of {rows.length} sizes
            {category === ALL ? "" : ` in ${category}`}
          </Text>
          {lowEdits.length ? (
            <div className="flex items-center gap-x-2">
              <Checkbox
                id="allow-low"
                checked={allowLow}
                onCheckedChange={(v) => setAllowLow(v === true)}
              />
              <Text size="xsmall" className="text-ui-fg-error">
                <label htmlFor="allow-low">
                  {lowEdits.length === 1 ? "One price is" : `${lowEdits.length} prices are`} under
                  ₹{LOW_PRICE} — tick to allow
                </label>
              </Text>
            </div>
          ) : null}
        </div>
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
