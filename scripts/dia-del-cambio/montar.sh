#!/usr/bin/env bash
# Monta los archivos del día del cambio (sin datos): ver-pruebas.sql (solo mira) y borrar-pruebas.sql (borra).
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
{ echo '-- PEGAR EN colada-mapri. SOLO MIRA: lista lo que se borraría (generado por scripts/dia-del-cambio/montar.sh).'; cat "$D/objetivos.sql" "$D/listar.sql"; } > "$D/ver-pruebas.sql"
{ echo '-- PEGAR EN colada-mapri el DÍA DEL CAMBIO. BORRA los datos de prueba (generado por scripts/dia-del-cambio/montar.sh).'; cat "$D/objetivos.sql" "$D/borrar.sql"; } > "$D/borrar-pruebas.sql"
echo "Montados ver-pruebas.sql y borrar-pruebas.sql"
