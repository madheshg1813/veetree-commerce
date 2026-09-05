# Deploying the Medusa backend to Railway

Three services: **Postgres**, **Redis**, and this backend. Optionally a fourth,
a worker running the same image.

## 1. Create the project

In Railway: New Project → Deploy from GitHub repo → pick this repository.
Add Postgres and Redis from the same project (New → Database).

## 2. Point the service at the Dockerfile

Root directory: `/` (the repo root — `apps/backend` is an npm workspace and
cannot resolve its dependencies from its own folder).
Dockerfile path: `apps/backend/Dockerfile`. Both are set on the service itself (Settings → Build), not in a config file:
`railway.json` is deprecated and Railway ignores it, and a hand-written
`.railway/railway.ts` failed the build before Docker even started.

## 3. Environment variables

Railway injects `DATABASE_URL` and `REDIS_URL` when you reference the Postgres
and Redis services. Set the rest yourself:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `DATABASE_SSL` | `true` — Railway Postgres requires TLS |
| `JWT_SECRET` | a fresh 32+ byte random string, **not** the local one |
| `COOKIE_SECRET` | another fresh random string |
| `AUTH_MFA_ENCRYPTION_KEY` | another fresh random string |
| `STORE_CORS` | the storefront origin, e.g. `https://veetree.life` |
| `ADMIN_CORS` | this service's own public URL |
| `AUTH_CORS` | both of the above, comma separated |
| `MEDUSA_WORKER_MODE` | `server` |
| `MEDUSA_BACKEND_URL` | this service's own public URL |

Generate secrets with `openssl rand -base64 32`. Never reuse the values from
`apps/backend/.env` — those are local-only and are in the repo's ignore list
precisely so they stay that way.

## 4. Optional worker service

Medusa recommends splitting HTTP from background work. Add a second service
from the same repo and Dockerfile, identical variables except
`MEDUSA_WORKER_MODE=worker`. It needs no public domain. The Dockerfile skips
migrations when in worker mode, so the two cannot race.

## 5. First deploy

Migrations run on boot (`medusa db:migrate` in the container command), so the
schema is created on the first successful start. Then create an admin user —
Railway service → Settings → Terminal, or locally against the deployed database:

    npx medusa user -e you@veetree.life -p '<a strong password>'

The dashboard is then at `https://<your-service>.up.railway.app/app`.

## 6. Point the storefront at it

In the `veetree-web` Railway service set:

    NEXT_PUBLIC_MEDUSA_URL=https://<your-service>.up.railway.app
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<from Settings → API Key Management>
    NEXT_PUBLIC_MEDUSA_REGION_ID=<from Settings → Regions>

Note what this does: Medusa's prices then override the ones committed in
`veetree-web/src/lib/catalog/products/*.ts`. Enter the price list in the
dashboard before switching the storefront over, or the site will show whatever
Medusa happens to hold.
Test Key Secret