#!/bin/sh
set -e

# Railway's private networking is not resolvable for the first second or two of
# a container's life, so a migration fired immediately races DNS and fails with
# a connection timeout against a database that is perfectly healthy. Retry
# briefly rather than crash-looping the whole service.
if [ "$MEDUSA_WORKER_MODE" != "worker" ]; then
  n=0
  until npx medusa db:migrate; do
    n=$((n + 1))
    if [ "$n" -ge 6 ]; then
      echo "migrations failed after $n attempts" >&2
      exit 1
    fi
    echo "migrate attempt $n failed; waiting for the database…" >&2
    sleep 5
  done
fi

# Seed an admin user when one is named. `medusa user` fails if the address is
# already taken, which is the normal case on every deploy after the first — so
# the failure is tolerated rather than allowed to stop the boot.
if [ -n "$MEDUSA_ADMIN_EMAIL" ] && [ -n "$MEDUSA_ADMIN_PASSWORD" ]; then
  # Creates the user the first time. On every later boot the address is already
  # taken and this fails, which is expected and ignored.
  npx medusa user -e "$MEDUSA_ADMIN_EMAIL" -p "$MEDUSA_ADMIN_PASSWORD" \
    || echo "admin user exists; syncing its password instead" >&2

  # Medusa has no change-password screen and its reset flow needs an email
  # provider, so this is the only way to rotate the admin password: change the
  # variable and redeploy. Note the .js: `medusa build` compiles the scripts,
  # and the runtime image carries the compiled output, not the sources.
  npx medusa exec ./src/scripts/set-admin-password.js \
    || echo "could not sync the admin password; continuing" >&2
fi

# One-shot catalogue seed, gated on a flag so it does not run on every boot.
# Set RUN_CATALOGUE_SEED=true, deploy, then remove the variable again. The seed
# deletes the handles it manages (including Medusa's demo products) before
# recreating them, so re-running updates rather than duplicates.
if [ "$RUN_CATALOGUE_SEED" = "true" ]; then
  echo "seeding the VeeTree catalogue…" >&2
  npx medusa exec ./src/scripts/seed-veetree-full.js \
    || echo "catalogue seed failed; continuing so the server still starts" >&2
fi

exec npx medusa start
