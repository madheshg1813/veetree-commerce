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
  modules: redisModules,
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
