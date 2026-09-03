# syntax=docker/dockerfile:1
#
# Medusa backend for Railway.
#
# Built from the MONOREPO ROOT, not this folder: apps/backend is an npm
# workspace, so its dependencies live in the root node_modules and a build
# context of apps/backend alone cannot resolve them.
#   docker build -f apps/backend/Dockerfile .
# On Railway set the service's root directory to the repo root and point it at
# this Dockerfile path.
#
# `medusa build` does not build in place — it emits a self-contained server to
# .medusa/server, with its own package.json. That directory is what runs, and
# it needs its own production install.

ARG NODE_VERSION=22-slim

# ── build ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

# No apt layer on purpose. The only two packages in this tree that can compile
# native code — sharp and msgpackr-extract — both ship prebuilt binaries as
# optional platform deps (@img/sharp-linux-x64, @msgpackr-extract/*), so nothing
# needs python3/make/g++. Installing them cost a build step that failed on
# Railway's builder for a toolchain the install never used.

# Workspace manifests first, so a dependency-free code change reuses this layer.
# .npmrc matters here: it carries legacy-peer-deps, which the second install
# (inside .medusa/server) needs to resolve the Razorpay plugin's over-strict
# Medusa peer pin. Without it that step failed with ERESOLVE.
COPY package.json package-lock.json turbo.json .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/storefront/package.json ./apps/storefront/
RUN npm ci --workspace=@dtc/backend --include-workspace-root

COPY apps/backend ./apps/backend

WORKDIR /repo/apps/backend
# The admin bundle is built here unless MEDUSA_WORKER_MODE=worker.
ARG MEDUSA_WORKER_MODE=server
ENV MEDUSA_WORKER_MODE=${MEDUSA_WORKER_MODE}
RUN npx medusa build

# .medusa/server is a fresh package; install its production deps.
WORKDIR /repo/apps/backend/.medusa/server
RUN npm install --omit=dev

# ── run ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=9000

COPY --from=builder /repo/apps/backend/.medusa/server ./

# --create-home matters: the Medusa CLI writes through `configstore`, which
# mkdirs $HOME/.config/medusa on every invocation. A system user without a home
# made the container die on boot with
#   EACCES: permission denied, mkdir '/home/medusa/.config/medusa'
RUN groupadd --system --gid 1001 medusa \
 && useradd  --system --uid 1001 --gid medusa --create-home --home-dir /home/medusa medusa \
 && mkdir -p /home/medusa/.config \
 && chown -R medusa:medusa /app /home/medusa
ENV HOME=/home/medusa
USER medusa

EXPOSE 9000

# Migrations run on boot rather than as a separate release step: Railway has no
# release phase, and `db:migrate` is idempotent. The worker service skips it —
# two services migrating the same database at once is a race.
#
# The retry is not defensive padding. Railway's private network is not resolvable
# the instant a container starts, so the first migrate attempt raced DNS and died
# with "connection timed out after 10 seconds" against a database that was up and
# healthy the whole time.
# The catalogue seed reads the founder's sheet from the working directory, so
# the sheet has to be in the image for the seed to run on Railway at all.
COPY --chown=medusa:medusa ["VEETREE products description  - Products.csv", "/app/"]
COPY --chown=medusa:medusa apps/backend/entrypoint.sh /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
