import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Set (or reset) an admin user's password.
 *
 * Medusa's admin has no change-password screen, and the built-in reset flow
 * emails a token — useless until a notification provider is configured. That
 * left no way at all to rotate the admin password on a fresh deployment.
 *
 * This closes that gap by rehashing through the emailpass provider itself, so
 * the stored hash is produced exactly the way a login will verify it.
 *
 * Reads MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD, so rotating a password
 * is: change the variable, redeploy. Does nothing when either is unset.
 *
 *   npx medusa exec ./src/scripts/set-admin-password.ts
 */
export default async function setAdminPassword({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const email = process.env.MEDUSA_ADMIN_EMAIL
  const password = process.env.MEDUSA_ADMIN_PASSWORD

  if (!email || !password) {
    logger.info("MEDUSA_ADMIN_EMAIL/PASSWORD not set; leaving passwords alone.")
    return
  }

  const auth = container.resolve(Modules.AUTH)
  const result = await auth.updateProvider("emailpass", {
    entity_id: email,
    password,
  })

  if (!result.success) {
    // Not fatal: a boot should not be blocked by this.
    logger.error(`Could not set the password for ${email}: ${result.error}`)
    return
  }

  logger.info(`Password updated for ${email}.`)
}
