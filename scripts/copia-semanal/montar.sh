#!/usr/bin/env bash
# Monta los archivos «leer-vieja-*.sql» (sin datos): se pegan en el SQL Editor de la app VIEJA (limpieza-cie), solo leen,
# y devuelven una casilla con la copia ya montada (los datos de la vieja + la receta) para pegar en colada-mapri.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
receta() { printf '%s' "\$receta\$"; cat "$D/$1"; printf '%s' "\$receta\$"; }

{ cat <<'EOF'
-- PEGAR EN LA APP VIEJA (limpieza-cie). Solo lee. Copia la casilla que sale y pégala en el SQL Editor de colada-mapri.
-- Copia semanal de Limpieza · lo hecho cada día (generado por scripts/copia-semanal/montar.sh; no editar a mano).
select concat(
 'create temp table v_ots (id uuid, fecha date, titulo text, descripcion text, tipo text, origen text, equipo text, turno text, asignados uuid[], todo_equipo boolean, ',
 'estado text, tarea_id uuid, habitual_id uuid, checklist jsonb, resultado text, nota text, motivo text, inicio timestamptz, fin timestamptz, pausado_min int, ',
 'minutos_est int, tiempo_auto boolean, hecho_por uuid, lugar text, nave text, elemento_codigo text, fotos int, creado timestamptz);', E'\n',
 'insert into v_ots values ', string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%s,%L)',
   o.id, o.fecha, o.titulo, o.descripcion, o.tipo, o.origen, o.equipo, o.turno, o.asignados, o.todo_equipo, o.estado, o.tarea_id, o.habitual_id,
   case when jsonb_typeof(o.checklist) = 'object' then o.checklist end, o.resultado, o.nota, o.motivo, o.inicio, o.fin, o.pausado_min, o.minutos_est,
   o.tiempo_auto, o.hecho_por, o.lugar, o.nave, e.codigo, coalesce(f.n, 0), o.creado), E',\n' order by o.fecha, o.id), ';', E'\n',
EOF
  receta limpieza-trabajos.sql
  cat <<'EOF'
) as "Copia esta casilla y pégala en colada-mapri"
from ots o left join elementos e on e.id = o.elemento_id
left join (select ot_id, count(*) n from fotos group by 1) f on f.ot_id = o.id
where not coalesce(o.borrado, false) and o.fecha >= '2026-10-05';
EOF
} > "$D/leer-vieja-limpieza.sql"

{ cat <<'EOF'
-- PEGAR EN LA APP VIEJA (limpieza-cie). Solo lee. Copia la casilla que sale y pégala en el SQL Editor de colada-mapri.
-- Copia semanal de Personal (generado por scripts/copia-semanal/montar.sh; no editar a mano).
select concat(
 'create temp table v_horas (persona uuid, fecha date, trabajadas numeric, fuera numeric, extra numeric, falta text, nota text);', E'\n',
 'insert into v_horas values ', (select string_agg(format('(%L,%L,%s,%s,%s,%L,%L)', trabajador, fecha, coalesce(trabajadas::text,'null'),
    coalesce(fuera,0), coalesce(extra_mano,0), falta, nota), E',\n' order by trabajador, fecha)
    from horas_dia where coalesce(falta,'') <> 'vacaciones'), ';', E'\n',
 'create temp table v_vac (id uuid, persona uuid, desde date, hasta date, nota text);', E'\n',
 'insert into v_vac values ', (select string_agg(format('(%L,%L,%L,%L,%L)', id, trabajador, desde, hasta, nota), E',\n' order by desde)
    from cal_vac where not coalesce(borrado,false)), ';', E'\n',
 'create temp table v_dias (equipo text, fecha date, tipo text, nombre text, horario text);', E'\n',
 'insert into v_dias values ', (select string_agg(format('(%L,%L,%L,%L,%L)', equipo, fecha, tipo, nombre, horario), E',\n' order by equipo, fecha)
    from cal_dia where not coalesce(borrado,false)), ';', E'\n',
EOF
  receta personal.sql
  echo ') as "Copia esta casilla y pégala en colada-mapri";'
} > "$D/leer-vieja-personal.sql"
{ cat <<'EOF'
-- PEGAR EN LA APP VIEJA (limpieza-cie). Solo lee. Copia la casilla que sale y pégala en el SQL Editor de colada-mapri.
-- Copia semanal de Limpieza · tareas y equipos (generado por scripts/copia-semanal/montar.sh; no editar a mano).
select concat(
 'create temp table v_tf (id uuid, titulo text, descripcion text, dias text[], equipo text, turno text, asignados uuid[], todo_equipo boolean, minutos_est int, vivo boolean);', E'\n',
 'insert into v_tf values ', (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', id, titulo, descripcion, dias, equipo, turno, asignados, todo_equipo,
    minutos_est, coalesce(activo, true) and not coalesce(borrado, false)), E',\n' order by id) from tareas_fijas), ';', E'\n',
 'create temp table v_th (id uuid, titulo text, descripcion text, lugar text, minutos_est int, vivo boolean, solo_para uuid[], grupo text);', E'\n',
 'insert into v_th values ', (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L)', id, titulo, descripcion, lugar, minutos_est,
    coalesce(activo, true) and not coalesce(borrado, false), solo_para, grupo), E',\n' order by id) from tareas_habituales), ';', E'\n',
 'create temp table v_trab (id uuid, nombre text, equipos text[], activo boolean);', E'\n',
 'insert into v_trab values ', (select string_agg(format('(%L,%L,%L,%L)', id, nombre, equipos, coalesce(activo, true)), E',\n' order by id) from trabajadores), ';', E'\n',
 'create temp table v_hab (trabajador uuid, habilidad text, activo boolean);', E'\n',
 coalesce('insert into v_hab values ' || (select string_agg(format('(%L,%L,%L)', trabajador, habilidad, coalesce(activo, true)), E',\n') from limp_habilidad) || ';', ''), E'\n',
 'create temp table v_resp (resp uuid, operario uuid, activo boolean);', E'\n',
 coalesce('insert into v_resp values ' || (select string_agg(format('(%L,%L,%L)', resp, operario, coalesce(activo, true)), E',\n') from limp_resp_hornos_op) || ';', ''), E'\n',
EOF
  receta limpieza-tareas.sql
  echo ') as "Copia esta casilla y pégala en colada-mapri";'
} > "$D/leer-vieja-limpieza-tareas.sql"
echo "Montados: leer-vieja-personal.sql, leer-vieja-limpieza.sql y leer-vieja-limpieza-tareas.sql en $D"
