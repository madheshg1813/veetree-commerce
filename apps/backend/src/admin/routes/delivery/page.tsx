import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Toaster, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type RateKey = "tnLight" | "tnHeavy" | "inLight" | "inHeavy"

const ROWS: { key: RateKey; where: string; weight: string }[] = [
  { key: "tnLight", where: "Tamil Nadu", weight: "up to 1 kg" },
  { key: "tnHeavy", where: "Tamil Nadu", weight: "over 1 kg" },
  { key: "inLight", where: "Rest of India", weight: "up to 1 kg" },
  { key: "inHeavy", where: "Rest of India", weight: "over 1 kg" },
]

/**
 * Delivery charges, editable.
 *
 * These write to the shipping options Medusa bills by, so the figure shown at
 * checkout and the figure charged are always the same number.
 */
const DeliveryPage = () => {
  const [rates, setRates] = useState<Record<string, string>>({})
  const [breakG, setBreakG] = useState("")
  const [packagingG, setPackagingG] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fill = (d: { rates?: Record<string, number>; breakG?: number; packagingG?: number }) => {
    setRates(Object.fromEntries(Object.entries(d.rates ?? {}).map(([k, v]) => [k, String(v)])))
    setBreakG(String(d.breakG ?? ""))
    setPackagingG(String(d.packagingG ?? ""))
  }

  useEffect(() => {
    let cancelled = false
    fetch("/admin/delivery-rates", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) fill(d) })
      .catch(() => { if (!cancelled) toast.error("Could not load delivery charges.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/admin/delivery-rates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v)])),
          breakG: Number(breakG),
          packagingG: Number(packagingG),
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(e.message ?? String(res.status))
      }
      const d = (await res.json()) as { missing?: string[] }
      fill(d as never)
      if (d.missing?.length) {
        toast.warning(`Saved, but these shipping options were not found: ${d.missing.join(", ")}`)
      } else {
        toast.success("Delivery charges saved. Checkout updates within a minute.")
      }
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
        <Heading level="h2">Delivery Charges</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          What a customer pays for delivery, by destination and parcel weight. These are the
          figures shown at checkout and the ones actually charged — they cannot disagree.
        </Text>
      </div>

      <div className="flex flex-col gap-y-4 px-6 py-6">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center gap-x-4">
            <div className="w-56">
              <Text size="small" weight="plus">{row.where}</Text>
              <Text size="xsmall" className="text-ui-fg-muted">{row.weight}</Text>
            </div>
            <div className="w-40">
              <Input
                type="number"
                min={0}
                disabled={loading}
                value={rates[row.key] ?? ""}
                onChange={(e) => setRates({ ...rates, [row.key]: e.target.value })}
              />
            </div>
            <Text size="xsmall" className="text-ui-fg-muted">₹</Text>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-6">
        <Heading level="h3">How weight is worked out</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          A parcel counts as heavy above the threshold. Each item is its pack size plus the
          packaging allowance — weigh a packed parcel and set the real figure here, or set a
          weight on the variant itself and that is used instead.
        </Text>
        <div className="flex items-center gap-x-4">
          <div className="w-56"><Text size="small" weight="plus">Heavy above</Text></div>
          <div className="w-40">
            <Input type="number" min={1} disabled={loading} value={breakG}
              onChange={(e) => setBreakG(e.target.value)} />
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">grams</Text>
        </div>
        <div className="flex items-center gap-x-4">
          <div className="w-56"><Text size="small" weight="plus">Packaging per item</Text></div>
          <div className="w-40">
            <Input type="number" min={0} disabled={loading} value={packagingG}
              onChange={(e) => setPackagingG(e.target.value)} />
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">grams</Text>
        </div>
      </div>

      <div className="flex items-center gap-x-3 px-6 py-4">
        <Button onClick={save} isLoading={saving} disabled={loading}>Save</Button>
        <Text className="text-ui-fg-muted" size="small">Checkout updates within a minute.</Text>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Delivery Charges" })

export default DeliveryPage
