import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

/**
 * Emails the password reset link.
 *
 * Medusa answers `POST /auth/customer/emailpass/reset-password` with 201 and
 * nothing else — the token it mints is emitted on this event instead, never
 * returned over HTTP, so that the response cannot be used to work out which
 * addresses have accounts. Delivering it is therefore our job, and without
 * this subscriber the storefront's "forgotten your password" form would
 * silently send nothing.
 *
 * Resend is called directly rather than through a notification provider: this
 * is the backend's only outbound email, and a whole module for one message
 * would be more to configure and more to go wrong.
 *
 * Needs three variables on this service:
 *   RESEND_API_KEY   the same key the storefront uses
 *   EMAIL_FROM       a verified Resend sender, e.g. "Veetree <no-reply@veetree.life>"
 *   STOREFRONT_URL   https://www.veetree.life
 */
export default async function passwordResetHandler({
  event,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type: string }>) {
  const { entity_id: email, token, actor_type } = event.data

  // Admin resets go through the dashboard's own flow, not the shop's.
  if (actor_type !== "customer") return

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim() || "Veetree <no-reply@veetree.life>"
  const base = (process.env.STOREFRONT_URL?.trim() || "https://www.veetree.life").replace(/\/$/, "")

  if (!apiKey) {
    // Loud, because the customer is waiting for an email that will never come.
    console.error("[password-reset] RESEND_API_KEY is not set — no reset email sent")
    return
  }

  const link = `${base}/account/reset?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14190C">
      <h1 style="font-size:20px;margin:0 0 16px">Set a new password</h1>
      <p style="line-height:1.6;margin:0 0 16px">
        Someone asked to reset the password for your Veetree account. If that was you, use the
        button below. If it was not, you can ignore this email — nothing has changed.
      </p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:100px;background:#283618;color:#fff;text-decoration:none;font-weight:600">Choose a new password</a>
      </p>
      <p style="line-height:1.6;margin:0 0 16px;font-size:13px;color:rgba(20,25,12,.68)">
        The link works once and expires. If it has run out, request another from the sign-in page.
      </p>
      <p style="line-height:1.6;margin:0;font-size:12px;color:rgba(20,25,12,.68);word-break:break-all">
        If the button does not work, paste this into your browser:<br>${link}
      </p>
    </div>`

  const text = [
    "Set a new password",
    "",
    "Someone asked to reset the password for your Veetree account.",
    "If that was you, open this link:",
    link,
    "",
    "The link works once and expires. If it was not you, ignore this email — nothing has changed.",
  ].join("\n")

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Reset your Veetree password",
        html,
        text,
      }),
    })

    if (!res.ok) {
      // The token itself must never reach a log, so only the status is recorded.
      console.error(`[password-reset] Resend refused the message: ${res.status}`)
    }
  } catch {
    console.error("[password-reset] could not reach Resend")
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
