import { loadEnv, defineConfig, Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
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
 * Brands the admin dashboard as Veetree.
 *
 * Two things the stock dashboard leaves generic: the browser tab reads
 * "<page> - Medusa", and the favicon is a blank `data:,` placeholder. Neither
 * is configurable, so this rewrites the built index.html and adds a small
 * script for the title — the dashboard sets `document.title` at runtime as you
 * navigate, so a static replacement alone would be overwritten on the first
 * route change.
 *
 * Deliberately limited to the tab: restyling the dashboard itself would mean
 * fighting Medusa's design system on every upgrade, for a UI that is already
 * clean.
 */
const FAVICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjRjVEOThCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMC41IiBzdG9wLWNvbG9yPSIjQzg5MTJGIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzhBNUUxNCIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMwRjJBMUQiLz4KICA8cGF0aCBkPSJNMzIgMTEgTDQ1IDMxIEgxOSBaIiBmaWxsPSJ1cmwoI2cpIi8+CiAgPHJlY3QgeD0iMzAuNCIgeT0iMzAiIHdpZHRoPSIzLjIiIGhlaWdodD0iMTMiIGZpbGw9InVybCgjZykiLz4KICA8ZyBzdHJva2U9InVybCgjZykiIHN0cm9rZS13aWR0aD0iMi4xIiBzdHJva2UtbGluZWNhcD0icm91bmQiIGZpbGw9Im5vbmUiPgogICAgPHBhdGggZD0iTTMyIDQyIEMzMiA0NyAyNyA0OCAyMyA1MyIvPgogICAgPHBhdGggZD0iTTMyIDQyIEMzMiA0NyAzNyA0OCA0MSA1MyIvPgogICAgPHBhdGggZD0iTTMyIDQyIEwzMiA1MiIvPgogICAgPHBhdGggZD0iTTI4LjUgNDYgQzI2IDQ4IDI1IDUwIDI0LjUgNTIiLz4KICAgIDxwYXRoIGQ9Ik0zNS41IDQ2IEMzOCA0OCAzOSA1MCAzOS41IDUyIi8+CiAgPC9nPgo8L3N2Zz4K"

const brandAdmin = () => ({
  name: "veetree-admin-branding",
  transformIndexHtml(html: string) {
    // The built index.html carries no <title> and no icon — the dashboard sets
    // the title at runtime — so these are injected at the end of <head> rather
    // than replacing anything.
    const head =
      `<title>Veetree</title>` +
      `<link rel="icon" href="${FAVICON}" />` +
      `<script>(function(){` +
      // Medusa injects its own blank "data:," icon, and does so after this
      // transform runs — so it is dropped at runtime rather than by string
      // surgery on the built HTML.
      `var ph=document.querySelector('link[data-placeholder-favicon]');if(ph){ph.remove();}` +
      `var f=function(){var t=document.title;` +
      `if(t&&t.indexOf("Medusa")>-1){document.title=t.replace(/Medusa/g,"Veetree");}};` +
      `f();var o=new MutationObserver(f);` +
      `o.observe(document.head,{childList:true,subtree:true,characterData:true});` +
      // The login screen greets you with "Welcome to Medusa". That string is
      // baked into the dashboard bundle (i18n key login.title), so it is
      // swapped in the DOM. Deliberately an exact-phrase match on text nodes
      // only: a blanket "Medusa" replace would also rewrite copy about the
      // Medusa API, where the product's real name is the correct word.
      `var swap=function(){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;` +
      `while((n=w.nextNode())){if(n.nodeValue&&n.nodeValue.indexOf("Welcome to Medusa")>-1){` +
      `n.nodeValue=n.nodeValue.split("Welcome to Medusa").join("Welcome to Veetree");}}};` +
      // The sign-in card carries Medusa's own logo as an inline 400x400 svg.
      // Repainted with the Veetree mark rather than hidden, so the card still
      // has something above the greeting.
      `var MARK='<defs> <linearGradient id="vtLogoG" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#F5D98B"/> <stop offset="0.5" stop-color="#C8912F"/> <stop offset="1" stop-color="#8A5E14"/> </linearGradient> </defs> <rect width="64" height="64" rx="14" fill="#0F2A1D"/> <path d="M32 11 L45 31 H19 Z" fill="url(#vtLogoG)"/> <rect x="30.4" y="30" width="3.2" height="13" fill="url(#vtLogoG)"/> <g stroke="url(#vtLogoG)" stroke-width="2.1" stroke-linecap="round" fill="none"> <path d="M32 42 C32 47 27 48 23 53"/> <path d="M32 42 C32 47 37 48 41 53"/> <path d="M32 42 L32 52"/> <path d="M28.5 46 C26 48 25 50 24.5 52"/> <path d="M35.5 46 C38 48 39 50 39.5 52"/> </g>';` +
      `var logo=function(){var s=document.querySelector('svg[viewBox="0 0 400 400"]');` +
      `if(s&&!s.getAttribute("data-veetree")){s.setAttribute("data-veetree","1");` +
      `s.setAttribute("viewBox","0 0 64 64");s.innerHTML=MARK;}};` +
      `var start=function(){swap();logo();` +
      `new MutationObserver(function(){swap();logo();}).observe(document.body,` +
      `{childList:true,subtree:true,characterData:true});};` +
      `if(document.body){start();}else{document.addEventListener("DOMContentLoaded",start);}` +
      `})();</script>`
    return html.replace("</head>", `${head}</head>`)
  },
})

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
        /**
         * Required. The Razorpay provider resolves `payment` and the logger
         * from the container in its constructor; without these declared the
         * module loads but every session dies with
         *   AwilixResolutionError: Could not resolve 'payment'
         * surfaced to the storefront as a bare 500.
         */
        dependencies: [Modules.PAYMENT, ContainerRegistrationKeys.LOGGER],
        options: {
          providers: [
            {
              resolve: "medusa-plugin-razorpay-v2/providers/payment-razorpay/src",
              id: "razorpay",
              options: {
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
                /**
                 * Only ever sent as the X-Razorpay-Account header, which is
                 * Razorpay's Route (linked sub-account) mechanism. A single
                 * merchant does not use it, and Razorpay ignores the header
                 * outright — verified against the live test API, which created
                 * orders identically with the header absent, empty and bogus.
                 * The plugin validates its presence regardless, so it defaults
                 * to empty rather than being left undefined, which crashed the
                 * payment module on boot.
                 */
                razorpay_account: process.env.RAZORPAY_ACCOUNT ?? "",
                webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
                automatic_expiry_period: 30,
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
      plugins: [...(config.plugins ?? []), brandAdmin()],
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
