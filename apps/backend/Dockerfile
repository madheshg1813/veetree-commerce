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
COPY package.json package-lock.json turbo.json ./
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

RUN groupadd --system --gid 1001 medusa \
 && useradd  --system --uid 1001 --gid medusa medusa \
 && chown -R medusa:medusa /app
USER medusa

EXPOSE 9000

# Migrations run on boot rather than as a separate release step: Railway has no
# release phase, and `db:migrate` is idempotent. The worker service skips it —
# two services migrating the same database at once is a race.
CMD ["sh", "-c", "if [ \"$MEDUSA_WORKER_MODE\" != \"worker\" ]; then npx medusa db:migrate; fi && npx medusa start"]
