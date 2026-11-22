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
{ cat <<'EOF'
-- PEGAR EN LA APP VIEJA (limpieza-cie). Solo lee. Copia la casilla que sale y pégala en el SQL Editor de colada-mapri.
-- Copia semanal de Prevención (generado por scripts/copia-semanal/montar.sh; no editar a mano).
select concat(
 'create temp table v_toolbox (anio int, mes int, compromiso text, cuerpo text, puntos jsonb, tema text, tema_intro text, tema_puntos jsonb, imagen text, codigo text);', E'\n',
 coalesce('insert into v_toolbox values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', anio, mes, compromiso, cuerpo, puntos, tema, tema_intro,
    tema_puntos, imagen, codigo), E',\n') from prl_toolbox) || ';', ''), E'\n',
 'create temp table v_sesion (id uuid, anio int, mes int, denominacion text, fecha date, centro text, duracion int, formador text, observaciones text, ',
 'previstos uuid[], enviada_en timestamptz, estado text, cerrada_en timestamptz, creado timestamptz, prev_enviado_en timestamptz, prev_destino text);', E'\n',
 coalesce('insert into v_sesion values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', id, anio, mes, denominacion, fecha, centro,
    duracion, formador, observaciones, previstos, enviada_en, estado, cerrada_en, creado, prev_enviado_en, prev_destino), E',\n') from prl_sesion) || ';', ''), E'\n',
 'create temp table v_firma (id uuid, sesion uuid, trabajador uuid, nombre text, puesto text, firma text, firmado_en timestamptz);', E'\n',
 coalesce('insert into v_firma values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L)', id, sesion, trabajador, nombre, puesto, firma, firmado_en), E',\n')
    from prl_firma) || ';', ''), E'\n',
 'create temp table v_doc (tabla text, id uuid, tipo text, trabajador uuid, fecha date, datos jsonb, firma text, firmado_en timestamptz, enviada_en timestamptz, ',
 'creado timestamptz, borrado boolean, evaluacion jsonb);', E'\n',
 coalesce('insert into v_doc values ' || (select string_agg(x, E',\n') from (
    select format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', 'prl_doc', id, tipo, trabajador, fecha, datos, firma, firmado_en, enviada_en, creado,
      coalesce(borrado, false), null) x from prl_doc
    union all
    select format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', 'prl_formacion', id, 'formacion', trabajador, fecha,
      jsonb_strip_nulls(jsonb_build_object('items', to_jsonb(items), 'duracion', duracion, 'direccion', direccion, 'impartida', impartida, 'otros1', otros1, 'otros6', otros6)),
      firma, firmado_en, enviada_en, creado, coalesce(borrado, false),
      case when eval_fecha is not null or eval_eficaz is not null or nueva_fecha is not null
           then jsonb_strip_nulls(jsonb_build_object('fecha', eval_fecha, 'eficaz', eval_eficaz, 'nueva_fecha', nueva_fecha)) end) from prl_formacion) d) || ';', ''), E'\n',
 'create temp table v_cert (id uuid, trabajador uuid, tipo text, titulo text, entidad text, horas numeric, fecha date, caduca date, notas text, archivos int, borrado boolean);', E'\n',
 coalesce('insert into v_cert values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%s,%L)', c.id, c.trabajador, c.tipo, c.titulo, c.entidad, c.horas,
    c.fecha, c.caduca, c.notas, (select count(*) from prl_cert_arch a where a.cert = c.id), coalesce(c.borrado, false)), E',\n') from prl_cert c) || ';', ''), E'\n',
 'create temp table v_ficha (trabajador uuid, dni text, puesto text, fecha_alta date, fecha_baja date, motivo_baja text, telefono text, emerg_nombre text, emerg_tel text, idioma text, tallas jsonb);', E'\n',
 coalesce('insert into v_ficha values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', trabajador, dni, puesto, fecha_alta, fecha_baja, motivo_baja,
    telefono, emerg_nombre, emerg_tel, idioma, tallas), E',\n') from prl_trab) || ';', ''), E'\n',
EOF
  receta prevencion.sql
  echo ') as "Copia esta casilla y pégala en colada-mapri";'
} > "$D/leer-vieja-prevencion.sql"
echo "Montados: leer-vieja-personal.sql, leer-vieja-limpieza.sql, leer-vieja-limpieza-tareas.sql y leer-vieja-prevencion.sql en $D"
