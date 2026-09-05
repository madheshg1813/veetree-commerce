import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Toaster, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

const MAX = 3
const BLANKS = ["", "", ""]

/**
 * Instagram reels shown on the storefront homepage.
 *
 * Three slots, newest first. Saving replaces the list, and the server keeps
 * only what it can read a reel code from — so the fields are refilled from the
 * response rather than from what was typed, and anything dropped is visible
 * immediately instead of being discovered on the website.
 */
const ReelsPage = () => {
  const [values, setValues] = useState<string[]>(BLANKS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fill = (reels: string[]) =>
    setValues([...reels, ...BLANKS].slice(0, MAX))

  useEffect(() => {
    let cancelled = false
    fetch("/admin/reels", { credentials: "include" })
      .then((r) => r.json() as Promise<{ reels?: string[] }>)
      .then((d) => { if (!cancelled) fill(d.reels ?? []) })
      .catch(() => { if (!cancelled) toast.error("Could not load the current reels.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/admin/reels", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reels: values }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { reels: string[] }
      const typed = values.filter((v) => v.trim()).length
      fill(data.reels)
      if (data.reels.length < typed) {
        toast.warning("Saved, but some links were not Instagram reel URLs and were dropped.")
      } else {
        toast.success(
          data.reels.length
            ? `Saved. ${data.reels.length} reel${data.reels.length === 1 ? "" : "s"} on the homepage.`
            : "Saved. The reels section is now hidden on the homepage."
        )
      }
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <Toaster />
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Instagram Reels</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          The reels shown on the homepage, below the reviews. Newest first. Paste the link
          from Instagram — open the reel, tap the three dots, then Copy link. Leave a slot
          empty to show fewer; clear all three to hide the section.
        </Text>
      </div>

      <div className="flex flex-col gap-y-4 px-6 py-6">
        {values.map((value, i) => (
          <div key={i} className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              Reel {i + 1}
            </Text>
            <Input
              placeholder="https://www.instagram.com/reel/…"
              value={value}
              disabled={loading}
              onChange={(e) => {
                const next = [...values]
                next[i] = e.target.value
                setValues(next)
              }}
            />
          </div>
        ))}

        <div className="flex items-center gap-x-3 pt-2">
          <Button onClick={save} isLoading={saving} disabled={loading}>
            Save
          </Button>
          <Text className="text-ui-fg-muted" size="small">
            The homepage updates within a minute.
          </Text>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Instagram Reels",
})

export default ReelsPage
