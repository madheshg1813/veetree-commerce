#!/bin/sh
set -e

# Railway's private networking is not resolvable for the first second or two of
# a container's life, so a migration fired immediately races DNS and fails with
# a connection timeout against a database that is perfectly healthy. Retry
# briefly rather than crash-looping the whole service.
# Temporary diagnostic: Postgres is up and Redis is reachable from this very
# container, yet every migration attempt times out. Resolve and dial the host
# directly so the failure is described rather than guessed at.
node -e '
const dns = require("dns"), net = require("net");
const url = new URL(process.env.DATABASE_URL);
console.log("PROBE host:", url.hostname, "port:", url.port);
dns.lookup(url.hostname, { all: true }, (e, addrs) => {
  console.log("PROBE dns:", e ? "ERR " + e.code : JSON.stringify(addrs));
  const s = net.connect({ host: url.hostname, port: +url.port, family: 0 });
  s.setTimeout(8000);
  s.on("connect", () => { console.log("PROBE tcp: CONNECTED"); s.end(); });
  s.on("timeout", () => { console.log("PROBE tcp: TIMEOUT"); s.destroy(); });
  s.on("error", (err) => console.log("PROBE tcp: ERR", err.code, err.message));
});
' || true

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
