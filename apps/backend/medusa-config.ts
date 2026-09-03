import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import path from 'path'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/**
 * This monorepo has a React 19 storefront and a React 18 admin. npm hoists the
 * storefront's React 19 to the root, which pushes React 18 into two separate
 * nested copies — one under apps/backend, one under @medusajs/dashboard.
 * Loading both at once breaks the admin's context providers.
 *
 * Pinning react/react-dom to this workspace's copy forces a single instance.
 */
const reactRoot = (pkg: string) =>
  path.dirname(require.resolve(`${pkg}/package.json`, { paths: [__dirname] }))

/**
 * Redis-backed modules, used only when REDIS_URL is set.
 *
 * Without them Medusa falls back to an in-memory event bus, cache, workflow
 * engine and lock — which it warns about on boot, and rightly: in-memory state
 * dies with the process, so a restart loses queued events and in-flight
 * workflows, and nothing coordinates two instances. Fine on a laptop, not on
 * Railway.
 *
 * Gated rather than unconditional so `npm run dev` still needs no Redis.
 */
const redisUrl = process.env.REDIS_URL

/**
 * Razorpay, registered only when keys are present.
 *
 * There is no official Razorpay provider for Medusa v2. Two community packages
 * exist and the choice between them was not cosmetic:
 *
 *   @sgftech/payment-razorpay 2.1.11 installs cleanly but is written for an
 *   older Medusa — its initiatePayment reads the cart from
 *   `input.context.extra`, which 2.19 no longer sends, so every payment session
 *   failed with "cart not ready" thrown from inside the package.
 *
 *   medusa-plugin-razorpay-v2 targets the current interface
 *   (`input.context.idempotency_key`, `{ amount, currency_code }`) and works.
 *   Its peers hard-pin 2.12.3, which is why .npmrc sets legacy-peer-deps.
 *
 * Gated on the keys so a checkout cannot half-exist: with no keys the payment
 * module keeps only the system provider and checkout stays honestly disabled.
 */
const razorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
)

const paymentModule = razorpayConfigured
  ? [
      {
        resolve: "@medusajs/medusa/payment",
        options: {
          providers: [
            {
              resolve: "medusa-plugin-razorpay-v2/providers/payment-razorpay/src",
              id: "razorpay",
              options: {
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
                razorpay_account: process.env.RAZORPAY_ACCOUNT,
                webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
                auto_expiry: 30,
                manual_expiry_period: 20,
                refund_speed: "normal",
              },
            },
          ],
        },
      },
    ]
  : []

const redisModules = redisUrl
  ? [
      { resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
      { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
      { resolve: "@medusajs/medusa/locking", options: {
          providers: [{
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          }],
        },
      },
      { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { url: redisUrl } } },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    /**
     * SSL is stated in both directions, never left to the default.
     *
     * With NODE_ENV=production Medusa turns SSL on by itself. Against a plain
     * server that produced a connection which opened at TCP level — the probe
     * confirmed CONNECTED — and then hung until Medusa's own 10 second timeout,
     * reported as "Could not connect to the database". `ssl: false` is the fix,
     * and it has to be explicit.
     */
    databaseDriverOptions: process.env.DATABASE_SSL === "true"
      ? { connection: { ssl: { rejectUnauthorized: false } } }
      : { connection: { ssl: false } },
    /**
     * Two services share this image on Railway: one serves HTTP, one runs the
     * workers. MEDUSA_WORKER_MODE picks which, and defaults to "shared" so a
     * single local process still does both.
     */
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") ?? "shared",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [...redisModules, ...paymentModule],
  plugins: razorpayConfigured ? ["medusa-plugin-razorpay-v2"] : [],
  admin: {
    // The worker service has no HTTP surface, so it has no use for the
    // dashboard bundle either — and building it there wastes minutes.
    disable: process.env.MEDUSA_WORKER_MODE === "worker",
    vite: (config: any) => ({
      ...config,
      resolve: {
        ...config.resolve,
        dedupe: [
          ...(config.resolve?.dedupe ?? []),
          'react',
          'react-dom',
        ],
        alias: {
          ...(config.resolve?.alias ?? {}),
          react: reactRoot('react'),
          'react-dom': reactRoot('react-dom'),
        },
      },
    }),
  },
})
