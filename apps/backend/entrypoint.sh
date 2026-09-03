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

exec npx medusa start
