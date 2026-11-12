#!/usr/bin/env bash
# Prueba la base de datos en un Postgres de usar y tirar (no toca ningún Supabase):
# imita Supabase, aplica todas las migraciones en orden y pasa las pruebas de supabase/pruebas.
# Uso: scripts/probar-bd.sh        (sale con error si falla algo)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"; PORT="${PORT:-55432}"
chmod 777 "$TMP"
como_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
limpiar() { como_pg "$PGBIN/pg_ctl" -D "$TMP/datos" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

como_pg "$PGBIN/initdb" -D "$TMP/datos" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
como_pg "$PGBIN/pg_ctl" -D "$TMP/datos" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=("$PGBIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

aplica() { echo "· $(basename "$1")"; PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$1"; }
aplica "$RAIZ/supabase/pruebas/00-imitar-supabase.sql"
for f in "$RAIZ"/supabase/migrations/*.sql; do aplica "$f"; done
echo "Migraciones aplicadas. Pruebas:"
fallos=0
for f in "$RAIZ"/supabase/pruebas/[1-9]*.sql; do
  if out=$("${PSQL[@]}" -f "$f" 2>&1); then
    echo "  ✓ $(basename "$f") ($(grep -c 'ok:' <<<"$out") comprobaciones)"
  else
    fallos=1; echo "  ✗ $(basename "$f")"; grep -E 'ERROR|FALLA|ok:' <<<"$out" | tail -5 | sed 's/^/      /'
  fi
done
exit $fallos
