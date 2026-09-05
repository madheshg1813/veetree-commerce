import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * Sends the bare domain to the admin dashboard.
 *
 * Medusa serves no page at "/", so the link Railway shows for this service —
 * the domain on its own — answered "Cannot GET /" and read as an outage. The
 * dashboard is at /app; this makes the obvious URL land there.
 *
 * 302 rather than 301: a permanent redirect is cached by browsers indefinitely
 * and would be awkward to undo if anything is ever served at the root.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.redirect(302, "/app");
}
