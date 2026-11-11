import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  Toaster,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type Kind = "shipping" | "gift"

type CouponState =
  | "active" | "missing" | "draft" | "inactive" | "not_started" | "expired" | "used_up"

interface Saved {
  announcement: string
  announcementEnabled: boolean
  milestones: { amount: number; label: string; kind: Kind }[]
  coupons: { code: string; title: string; description: string }[]
  coupon_states?: Record<string, CouponState>
  free_shipping?: { name: string; found: boolean; threshold: number | null }[]
}

interface Promotion {
  id: string
  code: string
  status: string
  is_automatic?: boolean
}

interface MilestoneRow { amount: string; label: string; kind: Kind }
interface CouponRow { code: string; title: string; description: string }

const MAX_MILESTONES = 3
const MAX_COUPONS = 10

const KIND_LABELS: Record<Kind, string> = {
  shipping: "Free shipping",
  gift: "Free gift",
}

const STATE_LABELS: Record<CouponState, { text: string; color: "green" | "orange" | "red" | "grey" }> = {
  active: { text: "Shown", color: "green" },
  missing: { text: "Hidden: no such promotion", color: "red" },
  draft: { text: "Hidden: promotion is a draft", color: "orange" },
  inactive: { text: "Hidden: promotion is inactive", color: "orange" },
  not_started: { text: "Hidden: campaign not started", color: "orange" },
  expired: { text: "Hidden: campaign has ended", color: "red" },
  used_up: { text: "Hidden: usage limit reached", color: "red" },
}

const errorOf = async (res: Response) => {
  const e = (await res.json().catch(() => ({}))) as { message?: string }
  return new Error(e.message ?? `Request failed (${res.status}).`)
}

/**
 * Offers in the storefront's slide-in cart.
 *
 * Everything here is display: the discount behind a code is a Promotion, and
 * free shipping is a ₹0 price on the shipping options. The page says so, and
 * offers a button for the shipping half because it is four identical edits.
 */
const CartOffersPage = () => {
  const [announcement, setAnnouncement] = useState("")
  const [enabled, setEnabled] = useState(false)
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [states, setStates] = useState<Record<string, CouponState>>({})
  const [freeShipping, setFreeShipping] = useState<Saved["free_shipping"]>([])
  const [savedJson, setSavedJson] = useState("")
  const [savedShipping, setSavedShipping] = useState<number | null>(null)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const prompt = usePrompt()

  const payload = (a = announcement, e = enabled, m = milestones, c = coupons) => ({
    announcement: a,
    announcementEnabled: e,
    milestones: m.map((r) => ({ amount: Number(r.amount), label: r.label, kind: r.kind })),
    coupons: c,
  })

  const fill = (d: Saved) => {
    const m = d.milestones.map((r) => ({ ...r, amount: String(r.amount) }))
    setAnnouncement(d.announcement)
    setEnabled(d.announcementEnabled)
    setMilestones(m)
    setCoupons(d.coupons)
    setStates(d.coupon_states ?? {})
    setFreeShipping(d.free_shipping ?? [])
    setSavedJson(JSON.stringify(payload(d.announcement, d.announcementEnabled, m, d.coupons)))
    setSavedShipping(d.milestones.find((r) => r.kind === "shipping")?.amount ?? null)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/admin/cart-offers", { credentials: "include" }).then(async (r) => {
        if (!r.ok) throw await errorOf(r)
        return (await r.json()) as Saved
      }),
      fetch("/admin/promotions?limit=200&fields=id,code,status,is_automatic", {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { promotions: [] }))
        .then((d: { promotions?: Promotion[] }) => d.promotions ?? [])
        .catch(() => [] as Promotion[]),
    ])
      .then(([saved, promos]) => {
        if (cancelled) return
        fill(saved)
        setPromotions(promos.filter((p) => p.code))
      })
      .catch(() => { if (!cancelled) toast.error("Could not load cart offers.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const dirty = !loading && JSON.stringify(payload()) !== savedJson

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/admin/cart-offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      if (!res.ok) throw await errorOf(res)
      const d = (await res.json()) as Saved
      fill(d)
      const hidden = d.coupons.filter((c) => d.coupon_states?.[c.code] !== "active").length
      if (hidden) {
        toast.warning(
          `Saved, but ${hidden} coupon${hidden === 1 ? " is" : "s are"} hidden from shoppers — see the notes beside ${hidden === 1 ? "it" : "them"}.`
        )
      } else {
        toast.success("Cart offers saved.")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  const applyFreeShipping = async () => {
    const removing = savedShipping === null
    const ok = await prompt({
      title: removing ? "Remove free shipping?" : "Apply free shipping?",
      description: removing
        ? "This removes the ₹0 free-shipping price from all 4 shipping options. Their normal delivery charges are not changed."
        : `All 4 shipping options will charge ₹0 when the cart's item total is ₹${savedShipping} or more. Their normal delivery charges are not changed.`,
      confirmText: removing ? "Remove" : "Apply",
      cancelText: "Cancel",
    })
    if (!ok) return
    setApplying(true)
    try {
      const res = await fetch("/admin/cart-offers/free-shipping", {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw await errorOf(res)
      const d = (await res.json()) as {
        threshold: number | null
        updated: string[]
        missing: string[]
        free_shipping: Saved["free_shipping"]
      }
      setFreeShipping(d.free_shipping ?? [])
      if (d.missing.length) {
        toast.warning(`Updated ${d.updated.length}, but these shipping options were not found: ${d.missing.join(", ")}`)
      } else {
        toast.success(
          d.threshold === null
            ? "Free shipping removed from all 4 shipping options."
            : `Free shipping from ₹${d.threshold} applied to all 4 shipping options.`
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the shipping options.")
    } finally {
      setApplying(false)
    }
  }

  const setMilestone = (i: number, patch: Partial<MilestoneRow>) =>
    setMilestones(milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const setCoupon = (i: number, patch: Partial<CouponRow>) =>
    setCoupons(coupons.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const promoByCode = useMemo(() => new Map(promotions.map((p) => [p.code, p])), [promotions])
  const pickable = promotions.filter((p) => !coupons.some((c) => c.code === p.code))

  const couponBadge = (code: string) => {
    // A saved state comes from the server's full check (dates, usage limits);
    // a code added since the last save only has the promotion's status.
    const state: CouponState | undefined =
      states[code] ??
      (promoByCode.get(code)
        ? ((promoByCode.get(code)!.status === "active" ? "active" : promoByCode.get(code)!.status) as CouponState)
        : undefined)
    const s = state ? STATE_LABELS[state] ?? STATE_LABELS.inactive : undefined
    return s ? <Badge size="2xsmall" color={s.color}>{s.text}</Badge> : null
  }

  const anyFreeApplied = (freeShipping ?? []).some((o) => o.threshold !== null)
  const helperDisabled =
    loading || dirty || applying || (savedShipping === null && !anyFreeApplied)

  return (
    <Container className="divide-y p-0">
      <Toaster />
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Cart Offers</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          What shoppers see in the slide-in cart: an announcement bar, spend milestones on a
          progress bar, and the coupons listed under "View all coupons".
        </Text>
      </div>

      {/* Announcement */}
      <div className="flex flex-col gap-y-3 px-6 py-6">
        <div className="flex items-center justify-between">
          <Heading level="h3">Announcement</Heading>
          <div className="flex items-center gap-x-2">
            <Switch id="announcement-on" checked={enabled} disabled={loading}
              onCheckedChange={setEnabled} />
            <Label htmlFor="announcement-on" size="small">{enabled ? "Shown" : "Hidden"}</Label>
          </div>
        </div>
        <Input
          placeholder="Diwali Sale: 20% OFF | Apply Code DIWALI20"
          maxLength={120}
          disabled={loading}
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
        />
        <Text size="xsmall" className="text-ui-fg-muted">
          {announcement.trim().length}/120 characters.
          {!enabled && " Switched off, so the cart shows no announcement bar. The text is kept."}
        </Text>
      </div>

      {/* Milestones */}
      <div className="flex flex-col gap-y-3 px-6 py-6">
        <Heading level="h3">Milestones</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          Steps on the cart's progress bar, by item total. Up to {MAX_MILESTONES}; they are shown
          in order of amount.
        </Text>
        {milestones.length === 0 && (
          <Text size="small" className="text-ui-fg-muted">No milestones. The progress bar is hidden.</Text>
        )}
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-x-3">
            <div className="flex w-36 items-center gap-x-2">
              <Text size="small" className="text-ui-fg-muted">₹</Text>
              <Input type="number" min={1} step={1} placeholder="699" disabled={loading}
                value={m.amount} onChange={(e) => setMilestone(i, { amount: e.target.value })} />
            </div>
            <div className="w-56">
              <Input placeholder="Free Shipping" maxLength={30} disabled={loading}
                value={m.label} onChange={(e) => setMilestone(i, { label: e.target.value })} />
            </div>
            <div className="w-44">
              <Select value={m.kind} disabled={loading}
                onValueChange={(v) => setMilestone(i, { kind: v as Kind })}>
                <Select.Trigger><Select.Value /></Select.Trigger>
                <Select.Content>
                  {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                    <Select.Item key={k} value={k}>{KIND_LABELS[k]}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <Button variant="transparent" size="small" disabled={loading}
              onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="small"
            disabled={loading || milestones.length >= MAX_MILESTONES}
            onClick={() => setMilestones([
              ...milestones,
              {
                amount: "",
                label: "",
                kind: milestones.some((m) => m.kind === "shipping") ? "gift" : "shipping",
              },
            ])}>
            Add milestone
          </Button>
        </div>
      </div>

      {/* Coupons */}
      <div className="flex flex-col gap-y-3 px-6 py-6">
        <Heading level="h3">Advertised coupons</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          Codes listed under "View all coupons", up to {MAX_COUPONS}. Choose from your
          promotions. A code is hidden from shoppers whenever its promotion is not active, so the
          cart never shows a code that would be rejected.
        </Text>
        {coupons.map((c, i) => (
          <div key={c.code} className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-x-2">
                <Text size="small" weight="plus" className="font-mono">{c.code}</Text>
                {couponBadge(c.code)}
              </div>
              <Button variant="transparent" size="small" disabled={loading}
                onClick={() => setCoupons(coupons.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
            <Input placeholder="Title, e.g. 20% off everything" maxLength={60} disabled={loading}
              value={c.title} onChange={(e) => setCoupon(i, { title: e.target.value })} />
            <Textarea placeholder="Description (optional), e.g. This week only" maxLength={160}
              rows={2} disabled={loading} value={c.description}
              onChange={(e) => setCoupon(i, { description: e.target.value })} />
          </div>
        ))}
        <div className="w-72">
          <Select
            value=""
            disabled={loading || coupons.length >= MAX_COUPONS || pickable.length === 0}
            onValueChange={(code) => code && setCoupons([...coupons, { code, title: "", description: "" }])}
          >
            <Select.Trigger>
              <Select.Value placeholder={
                promotions.length === 0 ? "No promotions with a code yet"
                  : pickable.length === 0 ? "All promotions are listed"
                  : "Add a coupon from Promotions"
              } />
            </Select.Trigger>
            <Select.Content>
              {pickable.map((p) => (
                <Select.Item key={p.id} value={p.code}>
                  {p.code}{p.status !== "active" ? ` (${p.status})` : ""}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-x-3 px-6 py-4">
        <Button onClick={save} isLoading={saving} disabled={loading}>Save</Button>
        <Text className="text-ui-fg-muted" size="small">
          {dirty ? "Unsaved changes." : "All changes saved."}
        </Text>
      </div>

      {/* Free shipping helper */}
      <div className="flex flex-col gap-y-3 px-6 py-6">
        <Heading level="h3">Charging free shipping</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          The milestone only changes what the cart shows. This button makes checkout actually
          charge ₹0 from the saved Free shipping amount, on all 4 shipping options. Their normal
          delivery charges stay as they are.
        </Text>
        <div className="flex flex-col gap-y-1">
          {(freeShipping ?? []).map((o) => (
            <div key={o.name} className="flex items-center gap-x-3">
              <Text size="small" className="w-64">{o.name}</Text>
              {!o.found ? (
                <Badge size="2xsmall" color="red">Option not found</Badge>
              ) : o.threshold === null ? (
                <Badge size="2xsmall" color="grey">No free shipping</Badge>
              ) : (
                <Badge size="2xsmall" color={o.threshold === savedShipping ? "green" : "orange"}>
                  ₹0 from ₹{o.threshold}
                  {savedShipping !== null && o.threshold !== savedShipping ? " — differs from the milestone" : ""}
                </Badge>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-x-3">
          <Button variant="secondary" onClick={applyFreeShipping} isLoading={applying}
            disabled={helperDisabled}>
            {savedShipping === null && anyFreeApplied
              ? "Remove free-shipping rule from all 4 shipping options"
              : "Apply free-shipping rule to all 4 shipping options"}
          </Button>
          <Text size="xsmall" className="text-ui-fg-muted">
            {dirty
              ? "Save first — this uses the saved milestone."
              : savedShipping === null && !anyFreeApplied
                ? "Add and save a Free shipping milestone first."
                : ""}
          </Text>
        </div>
      </div>

      {/* Help */}
      <div className="flex flex-col gap-y-2 px-6 py-6">
        <Heading level="h3">How these work</Heading>
        <ul className="text-ui-fg-subtle txt-small flex list-disc flex-col gap-y-2 pl-5">
          <li>
            A <b>Free shipping</b> milestone only changes what the cart displays. To actually
            charge ₹0, each shipping option also needs a ₹0 price for carts at or above that
            amount (a conditional price on item total). There are 4 options: "Tamil Nadu — up to
            1 kg", "Tamil Nadu — over 1 kg", "Rest of India — up to 1 kg" and "Rest of India —
            over 1 kg". The button above sets all 4 at once.
          </li>
          <li>
            A <b>Free gift</b> milestone needs its own promotion, under Promotions, that gives the
            gift product above that amount.
          </li>
          <li>
            Coupons are created under <b>Promotions</b>. This page only chooses which ones are
            shown to shoppers.
          </li>
        </ul>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Cart Offers" })

export default CartOffersPage
