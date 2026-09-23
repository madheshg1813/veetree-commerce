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
const FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAA/1BMVEX8+e0aNhn7+e4NKQwsRiuwuKmNmojT18pSZ092hnEiPSHk5dqZpZNoemUgOh7r7OI5UzjEybu6wrRFWkOirJz8+e5cclr7+e7e4NXHzcGCkX38+e4AGgBhc138+u78+u78+u4ePiBBVj6BjnunsJ4eQCCkrqB9kXxgblvN0L0eQB9fdWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARXlAoAAAAQHRSTlP+/wD///////////////////////+S/67////O//9qUCr//////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAJcbO/gAAD2ZJREFUeNrVXYt626qyhgACdJclO74nTdKudc5+//fbXCRZTmJpBsmpN/3apnUizQ9zZxjI09R4fVk/Hw7kx8fh8Lx+eZ0kj4x/fF7/BdKvYKzP4QDOz+QhxvM5BMDrmjzQWL8iATwW+WMQvgfwcOQ7CGAAZ/Kg4wwD8EwedjwDALyQhx4vUwDO5MHHeRzAUtJbyEqk0V7rzA6to1SsZHIPWSZLs38hG61KTin7PCgvlW6qYllBuAIw122QQituKadm5LEfeftFbv/TwlBazFuLwy0As+Z/K3RJHemGWPrdAjhM3H5kQES7hdaALML/MlWxJdGS3nHLRr9HafMhhGjSSGebmscdwNyCKHW1hByQ+fQnqaI98ZTXWSS+lVcj2I1nsfabaRnJ2QjIXP1fZbwniG/SKpkU8jQre8B0s5ppD3oAYc8RdvIdKSi2NizHmftBswxpkF76DCBEgIvITb6hPt40W6zQO8bLHfaoCBdkEsxAjvzczqFKt2GiH1leMiIdBOHlCgD+7akh301fVs1QiKuNXQYLIQ1kIhKmgUTZTd1c/0Dq3EAwM1GvgjSRA/CKfanyAsjT2X5BB8Gq4Az5tNceAFKCI8u5Qat+C0JGHQQu8HJM0Asga09+VJDlxk45/4mdCuwSEKwERM4EsWxLlh0f3C/CCikFBKeCtspKHCtXZPFRaL8IEU4REVQQJjizpkffJ9gSfhFUgQnPCEaEIzdFZUXuNIrMs5FEiDFBcFDmpDcryP1G6tQRFXAeImAvIqmZ9dqQujOpcR6zLBlGEF4MAKAOktxOf4l14NWxRLKRU6hMQ/UQAQbCK0e/wrKPopxtkD+jEQgOTwRmxYR1mxla+1haYpRi9IJgEWQwW0ZegPTnFE0I2VObXkHI5OV1UAQv5AymH+36pJYXuDJ/yCAEkAU/k2cg/ehpJI2lgpbE+E4lVnZWUATP5AB7GJ5+N4u/DCMkho8UOtKxuQsA0x6mAciw+Xf0Gw5K3BOAIjn8eaeLxDSASfeNB82/X7ZWcAwxeA1gETA2J4HnRxkkv4b+314CvBNliKkVUgvbH2Lx3JB1w+KA2TP0/3IrYNzuxBsEEzZi+chaEVbPo3/PaID9Wv129P+mhmKtWpNs5AE7Eyro7Z/4MGcqUH6dBGvm+a8obWKa4WSpsAECE+H0b22enON0+Eqrlvzf5tWWC7hjoqSQ9mE4k7abKQaOFBk2+4aJNsQHKKeBXkGaNGvM8SxwJUQpln7+u2OgNsq9MIHAU3PC09CPiqINkNP+/98CEJr9ar+UlzVACqUVA0a3gRYAKwCVZZxfZnvGEp1d6L94Eg3apIlgJtpbC4BKn+wswbHJ2FkApaIdLxlNdhrQwz5QdGSBmkhSrA42QZuZflYnmQ0DOB0O+yQZdVLeoJmIB2ggqwCRcdRvswT/mEm+Jr5HULuIVJq9GSWxTPSOduaxC6ddzsWk7JJvyHf5KlL57G2SMZanuLlk2JiosGZzg/WZXL56Q28g4HLD2MlapSZmdI/gZob3x60niAAta5uxc7sF6Q362+jSg7RQNNIgoZYgiY022aOSmqWXzA86Mnz21m3FCH48IchhSFWqDUPwBG7vWd2Kyz/OEtjR/vntsDKcaARJLjRApGStHILtd6L63eqqZLfmnl2qJyg9UrszKBXYtSuQS7BnOViFivKiE1fC/FoJ99t96b74Zqw+HORUVZglkAgVlEMNvpi3TSkkwpplcJ7OERJA5EqkaRrZ36iRfqwkJjSE+3RWJ+7BBQO8Kw4yb2C4YTyneg8DkeRwolbgMCbJuK/O8iVAV5R9FuOcXpOetxVcjML2CzO4R5SxGGaEV5xdNDxXJ92NTHH21RCrwedtcZf/JIeIcgX2bZwvI2ArlbfU19HuOnBI9CfyY/G5vC6LOwwwR6eGatLUGLESCtTbperWNkU/4m9ITKJunUC8kULFWBkvQkM3UqxnUE3gu73nVWjKBhnIKTGGRXM2kKEApty2tEVjAUU/bvHIzi8CewN61TXMCJRQf5XxamqFvB86HjjBHB0BCwsUg/mhLu1XJxMIWw6qJ/f0IqBPmoJEswL6e2pyifpobMrbV0AeUpAAlANjfkWgALIpdQASAqeHkulIAKSDVpM5IzgAO7WQBJS0zoqYzGbFoLyNmY2KLAXA+ppQW5YBlCjkWdExJYsBMFt6oJfqaX9IAM0w+ackCwIwpEmyiCKFigDRYlEABf8/AjTGzaQfAQqGK7IoABKBgsu3qey2zWfR0JL4WQDAid5xSyDxW0rjlRILA7CWYJQ+YRwhRR4XQDWVnIiMDC/1snuwkHOHxHiKFr+r/YMACJ+ICep527L3B6DGbfGSSug+APR4UCMpxWS0/gKAdNyZ2F3qSx4UgKsi2o56Qoo8sBqd0qMpNKWFBXBa6qFu73Q1agb0PVhoMQAuSy1GUsB8SQB5D2CxZXWGIB1RUnwxO3YnAOWoJcsMgPQeLLQcABtV3t70PtGHB6BM8d1tLjd71OzPowOgEwDE4wPIRqv9/+cB/Hl8GchGWCh+fCEek4G7aSH1QwAWNmT3AFBPAnh/bADjlnhhX+geAMZ9oZTx5eTtLgCcN9qM1N1yWpPlwlfQFtOS8UBFc8rvAGC5OHUiIls0qN8MdymLBWPifPszaRVFAfvEC2clTGIrXsoZKq526sXP5IWcL7GQJauuaj2yn8nM2YLvpd61v0SUlC6mGsqJ3KhNr78t86pPxd9ioez0xKOsGoqThbNCCyrSarKgmC80WfK76vX7KyG/ybeAFCfl19LXhvzAHplxYPgCjsuO0/wrgnQZGdaTFYtzbXER0U/0174maCOX8ITEdBXNrL4jbSVc7I7TaH+QLPIizaie11OjGU+u9/VOes7su2NTm4h7wZWtM2oaKrmmLFRFcp4IvE1nNFm4ymssnfxdFrVlIn+eo3WF0tpDMDWawW2VOOAYmpzheiXW0LsTGspWX1f987xiW7kTrW/saHoThfvSAnAAOlCRmkLe3HdesYWD3Sy4oj7en/TgYqdNvXItAz25uJj+rjwsgHLtLNL+BFFzVd3YdPbB1kkVkdmvXoUp0Q3Mi5SBIbBolUV8mYPVVVCccHe61ra5WgVxUAM6RB+ghzLDNd3TbfV4c3ltXg8KIatWDDNGqwAOyhOQH4w/+ZexwYFJy/Zy4OAKPnDizSZK0v69w+sgtYy5+0798IsFN7xaDnNNhtjLsWyZt6tjzmQI9LFWAU0Ao/whyY+xyI49370No/jSsIytdetZPjuq/vRWhAzGYMmBBnluzvTNMweZysuP2HzE9vIwaeOQC60GTcs75jxfDD5DhDmPyDFBrCiPpbCyqq6seTfh5fHdLcPlgabmp7y0+ONc7QWkE7JGnIUDHqQsiqSKSlY6vkyPzUDf5V39+IcnVrEBPnUli8luB2lI7YJJqH3awiKoKtUq63yzemgi6972qqP4AsDWAyispYlQx4M1wxozcRSfvEb/b87JFwA7pvWRaYlO6pb3O44urw9yZN3bZPuU8ur0balMr1526+zK7QVocAfxEUuweku/Ho4QDkDTTsgwoGyO0p6w58d3VLFfSZCxG7TEpPh8ntKEddy/T3ptZJMJw+mo67aAXGNORKPMnkYe4P283sKEL/aFvvvm5/MBRRsQCKAlk/hNEqe13kJbyhh9Z8zsv5Z0y0LJ10yBTlsE7+D+JFWA2gpKhEjuja+z+5HusnSfJErK9jC+mm6Fv2Ih6WEOdF6/xjVH52YqV+mf6Na1uMksu6jZAQIZfHsV5/yd8N2oj/TfrV9CJwR2fjn0tOEIMwREuSeGzgeujJvTmWYjBI7/pd+4osEZSyfBZWgqG5WqjlgmB3GA13uJrUZlxnBREbw3H6gQsd2Vmnh3HVVsLydf5JaysPRuNKNRmEIxX3J1LtFoITWQpopUxpjqQAbiM/ZD4KuX7q4tYW85jRa0DzEdn4//hiTjwi2q10TQPd7qOjkzSKx0PZEidsxCNMmezNptD9kvMMbsYnqjvtBQYNXavCZn7bmnABEy6atB15H6kusTOLVWze+2KHMWsDukjgP6V66rTdWlJBDPkjGbu1vRtf1cIfchBvRvzWrUvU1PEOX9RRlogr/Rw7j4kg+6hG5NMFatLvHAhiYoLZ4tsjNoGBGBoBrEKfbQ/x8rBp0gCfBqnoDNOg+wmUDs/EWs/95d7l1Tw4idLNIMMW/TKhzQc7dVRXAEGzWQQpV0aYm0c7cTsAIHrPsB0rbZt/0EI7i0plXHizvRc4NSUPrpDtK2+QzT64hrAXTaU80Hgt3rc0DvXcc/oA2EM6x1ucQgSNNeDKvhlPb/EE0CkF+YtL8Am8d7BDCXXnYAYjW0J+C0SOEiAOAW1Cu0fb/nIliY3756OzRCEpzXaeeqgrbvh16gULwxZMJRDolIoMV4gmLkbY24wsLv+HZ6ERROyKsVrMCpfVZuEVdYPCGvZojBse0we2saEkjYZhvqIhfkNS6pb9gHZaMoHe4QleCLaDTBXeOCuEin8m94A7ZWi4YbCBqwwk58U4K8SOcJuaFqFwGWGJeY1h3t9KNaawddJuWm6ciRcQZXUy3rPHuirulZB13n5dtimd6tEhUcjvs1tvzDKog/JOQ6L+yFao5XbQEZ3MVWpwnu8dpnG3ahGvpKu92bf2Gut1DrOoLVboYE3Ac3vNIOf6lgGrdlfBmIkf5zm7Y/dbeeRfilggHXOia+x515uZqeOJHevJmyZR78xvH1tY4hF2u2NwGal/OJlpuFuPHfG9qSXwsy82LNoKtNLxBYja2mLIRuW32Gkf/5atPAy2Wljjsq6Nv7Clx5ktpGpXAWhFwuG3q9bxKVbddNQ5GtPJlYiWTnbvftYMdaLnW9b/gFy65zqL+e1F0Ord6b6msBSrGtRJTVvO336ie/KZa7YHnOFdeJOMXtLdxd/11zx7Uy17u/76P9u+nwau9N72/qdt8Tq1Que8X1vEvGC3/HuCMw/+6O8eEnlGezLkp/vtM177LJ6rgj1jUKNhTnbtAeU1xnzcwy/JvXvM+86N1zky2Dcvehf1kB/qZ0U80/ofP8dBvAnKver2DYZtqRaW98Op2yTO+jVFRyoeOI66cxAJjw7O+M89M4gODr3n9ovDxNAVhCEO42nr9S+w2Ax2Wj8xMMwGKyvOxYf0vq9wCeXh8Owvr1CQPg0SDcIn8EgJWFBxHn5/MIkWMALIb14e8Sf1ifxymcAGB56WX9fPgLMA6H5/XL6yR5/wWvAKYT+9y4uwAAAABJRU5ErkJggg=="

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
      // It is replaced with an <img>, not with markup: the wordmark renders
      // through an inverted mask, and a mask injected by innerHTML does not
      // survive — the card drew a solid block. An img loads the same data URI
      // as a document, where the mask works.
      `var logo=function(){var s=document.querySelector('svg[viewBox="0 0 400 400"]');`  +
      `if(s&&!s.getAttribute('data-veetree')){var i=document.createElement('img');`  +
      `i.src=${JSON.stringify(FAVICON)};i.width=44;i.height=44;i.alt='Veetree';`  +
      `i.setAttribute('data-veetree','1');s.replaceWith(i);}};` +
      `var start=function(){swap();logo();` +
      `new MutationObserver(function(){swap();logo();}).observe(document.body,` +
      `{childList:true,subtree:true,characterData:true});};` +
      `if(document.body){start();}else{document.addEventListener("DOMContentLoaded",start);}` +
      `})();</script>`
    return html.replace("</head>", `${head}</head>`)
  },
})

/**
 * Cloudinary for dashboard uploads.
 *
 * Railway's filesystem is ephemeral, so the default local file provider would
 * lose every uploaded image on the next deploy. Cloudinary already holds the
 * storefront's photography, so uploads join it there.
 *
 * Gated on the credentials being present: without them Medusa keeps its local
 * provider, which is right for a laptop.
 */
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
)

const fileModule = cloudinaryConfigured
  ? [
      {
        resolve: "@medusajs/medusa/file",
        options: {
          providers: [
            {
              resolve: "./src/modules/cloudinary-file",
              id: "cloudinary",
              options: {
                cloudName: process.env.CLOUDINARY_CLOUD_NAME,
                apiKey: process.env.CLOUDINARY_API_KEY,
                apiSecret: process.env.CLOUDINARY_API_SECRET,
                folder: process.env.CLOUDINARY_FOLDER || "veetree",
              },
            },
          ],
        },
      },
    ]
  : []

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
  modules: [...redisModules, ...paymentModule, ...fileModule],
  plugins: razorpayConfigured ? ["medusa-plugin-razorpay-v2"] : [],
  admin: {
    // The worker service has no HTTP surface, so it has no use for the
    // dashboard bundle either — and building it there wastes minutes.
    disable: process.env.MEDUSA_WORKER_MODE === "worker",
    /**
     * Return only what is being added, never a spread of the config passed in.
     *
     * Medusa does `mergeConfig(baseConfig, yourConfig)`, and Vite's mergeConfig
     * concatenates arrays rather than replacing them. Spreading `config` back
     * therefore handed every base plugin in a second time — including
     * @vitejs/plugin-react, whose refresh preamble was then injected twice and
     * broke every admin page with "The symbol inWebWorker has already been
     * declared". The merge supplies the rest.
     */
    vite: () => ({
      plugins: [brandAdmin()],
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          react: reactRoot('react'),
          'react-dom': reactRoot('react-dom'),
        },
      },
    }),
  },
})
