-- Copia semanal de Limpieza · lo hecho cada día (parte 8, decidido por Cristian el 22/11): trabajos de la app vieja (`ots`) a la
-- nueva (`limpieza.trabajos`). ESTE ARCHIVO NO LLEVA DATOS: el archivo de cada semana empieza llenando `v_ots` (LEEME.md).
-- Reglas:
--  · Todo desde el 5/10. Mismo id que en la vieja; origen «limpieza-cie:ots:<id>». Sin fotos (en la nota: «N fotos en la app vieja»).
--  · En las fechas que se copian, las fijas que la nueva sacó sola y nadie tocó se quitan (las sustituyen las de la vieja).
--    Lo hecho a mano en la app nueva no se toca.
--  · Los avisos al móvil, las incidencias y los problemas repetidos NO saltan al copiar (se apagan sus disparadores y se vuelven a encender).
--  · Todo o nada (el SQL Editor lo manda en una sola transacción). Al final, un resumen.

create temp table r_resumen (orden int, que text, cuantos bigint, detalle text);
alter table limpieza.trabajos disable trigger notificar;
alter table limpieza.trabajos disable trigger caso;
alter table limpieza.trabajos disable trigger incidencias;
alter table limpieza.trabajos disable trigger soltar;

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Limpieza');
  v_desde date := (select min(fecha) from v_ots);
  v_hasta date := (select max(fecha) from v_ots);
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Limpieza'; end if;

  -- la traducción, fila a fila
  create temp table r_t as
  select o.*,
    case when o.origen = 'fija' then 'fija'
         when o.habitual_id is not null or o.tipo ilike 'habitual%' then 'habitual' else 'suelto' end clase_n,
    case o.estado when 'hecha' then 'hecho' when 'en_curso' then 'en_curso' else 'pendiente' end estado_n
  from v_ots o;
  alter table r_t add column tarea_n uuid, add column grupo_n text, add column activo_n uuid, add column equipo_n uuid, add column turno_n uuid,
    add column fin_n timestamptz, add column minutos_n int, add column nota_n text, add column lugar_n text, add column checklist_n jsonb;
  update r_t set tarea_n = t.id, grupo_n = t.grupo from limpieza.tareas t
   where t.empresa_id = v_emp and t.origen = case when r_t.clase_n = 'fija' then 'limpieza-cie:tareas_fijas:' || r_t.tarea_id
                                                  else 'limpieza-cie:tareas_habituales:' || r_t.habitual_id end;
  update r_t set activo_n = a.id from nucleo.activos a where a.empresa_id = v_emp and lower(a.codigo) = lower(r_t.elemento_codigo);
  update r_t set equipo_n = q.id from nucleo.equipos q where q.empresa_id = v_emp
     and q.codigo = case lower(r_t.equipo) when 'semana' then 'semana' when 'finde' then 'finde' end;
  update r_t set turno_n = q.id from nucleo.turnos q where q.empresa_id = v_emp and lower(q.nombre) = lower(r_t.turno);
  update r_t set
    fin_n = case when estado_n = 'hecho' then coalesce(fin, inicio, fecha + time '12:00') end,
    lugar_n = left(nullif(concat_ws(' · ', nullif(trim(nave), ''), nullif(trim(lugar), '')), ''), 120),
    nota_n = left(nullif(concat_ws(' · ', nullif(trim(nota), ''), nullif(trim(resultado), ''),
                  case when estado = 'no_hecha' then 'No hecho en la app vieja' || coalesce(': ' || nullif(trim(motivo), ''), '') end,
                  case when fotos > 0 then fotos || case when fotos = 1 then ' foto' else ' fotos' end || ' en la app vieja' end), ''), 1000),
    checklist_n = case when jsonb_typeof(checklist) = 'object' then (
      select jsonb_agg(jsonb_build_object('texto', k, 'tipo', 'ok', 'valor', case v when '"OK"' then '"bien"'::jsonb when '"NO-OK"' then '"mal"'::jsonb else 'null'::jsonb end))
        from jsonb_each(checklist) e(k, v)) end;
  update r_t set minutos_n = case when estado_n = 'hecho' then
    greatest(1, least(1440, coalesce(round(extract(epoch from fin_n - inicio) / 60)::int - coalesce(pausado_min, 0), minutos_est, 1))) end;

  insert into r_resumen select 10, 'Trabajos con tarea que no está en la nueva (se copian sin enlazar a la tarea)', count(*), string_agg(distinct titulo, ', ')
    from r_t where (tarea_id is not null or habitual_id is not null) and tarea_n is null;
  insert into r_resumen select 11, 'Trabajos con máquina que no está en la nueva (se copian sin máquina)', count(*), string_agg(distinct elemento_codigo, ', ')
    from r_t where elemento_codigo is not null and activo_n is null;

  -- las fijas que la nueva sacó sola esos días y nadie tocó
  with q as (
    delete from limpieza.trabajos t where t.empresa_id = v_emp and t.origen is null and t.clase = 'fija' and t.estado = 'pendiente'
       and t.inicio is null and t.problema is null and t.fecha between v_desde and v_hasta
       and not exists (select 1 from limpieza.incidencias i where i.trabajo_id = t.id) returning fecha)
  insert into r_resumen select 1, 'Fijas que la app nueva sacó sola, cambiadas por las de la vieja', count(*), min(fecha) || ' a ' || max(fecha) from q;

  with q as (
    insert into limpieza.trabajos (id, empresa_id, fecha, clase, tarea_id, grupo, titulo, descripcion, lugar, activo_id, minutos_est, equipo_id, turno_id,
      asignados, todo_equipo, estado, inicio, pausado_min, fin, minutos, tiempo_auto, hecho_por, checklist, fotos, nota, origen, creado, no_repartir)
    select r.id, v_emp, r.fecha, r.clase_n, r.tarea_n, r.grupo_n, left(trim(r.titulo), 120), left(nullif(trim(r.descripcion), ''), 2000), r.lugar_n, r.activo_n,
           case when r.minutos_est between 1 and 1440 then r.minutos_est end, r.equipo_n, r.turno_n,
           coalesce(r.asignados, '{}'), coalesce(r.todo_equipo, false), r.estado_n, r.inicio, coalesce(r.pausado_min, 0), r.fin_n, r.minutos_n,
           coalesce(r.tiempo_auto, false), (select p.id from nucleo.personas p where p.id = r.hecho_por), r.checklist_n, '[]', r.nota_n,
           'limpieza-cie:ots:' || r.id, coalesce(r.creado, now()), true
      from r_t r
    on conflict (id) do update set fecha = excluded.fecha, clase = excluded.clase, tarea_id = excluded.tarea_id, grupo = excluded.grupo, titulo = excluded.titulo,
      descripcion = excluded.descripcion, lugar = excluded.lugar, activo_id = excluded.activo_id, minutos_est = excluded.minutos_est, equipo_id = excluded.equipo_id,
      turno_id = excluded.turno_id, asignados = excluded.asignados, todo_equipo = excluded.todo_equipo, estado = excluded.estado, inicio = excluded.inicio,
      pausado_min = excluded.pausado_min, fin = excluded.fin, minutos = excluded.minutos, tiempo_auto = excluded.tiempo_auto, hecho_por = excluded.hecho_por,
      checklist = excluded.checklist, nota = excluded.nota
      where limpieza.trabajos.origen like 'limpieza-cie:ots:%'
        and (limpieza.trabajos.fecha, limpieza.trabajos.clase, limpieza.trabajos.tarea_id, limpieza.trabajos.titulo, limpieza.trabajos.lugar, limpieza.trabajos.activo_id,
             limpieza.trabajos.asignados, limpieza.trabajos.todo_equipo, limpieza.trabajos.estado, limpieza.trabajos.inicio, limpieza.trabajos.fin,
             limpieza.trabajos.minutos, limpieza.trabajos.hecho_por, limpieza.trabajos.checklist, limpieza.trabajos.nota)
            is distinct from (excluded.fecha, excluded.clase, excluded.tarea_id, excluded.titulo, excluded.lugar, excluded.activo_id, excluded.asignados,
             excluded.todo_equipo, excluded.estado, excluded.inicio, excluded.fin, excluded.minutos, excluded.hecho_por, excluded.checklist, excluded.nota)
    returning (xmax = 0) nuevo, estado)
  insert into r_resumen select 2, case when nuevo then 'Trabajos nuevos' else 'Trabajos cambiados' end, count(*),
         count(*) filter (where estado = 'hecho') || ' hechos, ' || count(*) filter (where estado <> 'hecho') || ' sin hacer'
    from q group by nuevo;

  with q as (
    delete from limpieza.trabajos t where t.empresa_id = v_emp and t.origen like 'limpieza-cie:ots:%'
       and not exists (select 1 from v_ots o where 'limpieza-cie:ots:' || o.id = t.origen)
       and not exists (select 1 from limpieza.incidencias i where i.trabajo_id = t.id) returning fecha)
  insert into r_resumen select 3, 'Trabajos quitados (borrados en la vieja)', count(*), string_agg(fecha::text, ', ' order by fecha) from q;
end $$;

alter table limpieza.trabajos enable trigger notificar;
alter table limpieza.trabajos enable trigger caso;
alter table limpieza.trabajos enable trigger incidencias;
alter table limpieza.trabajos enable trigger soltar;

select que as "Qué", cuantos as "Cuántos", coalesce(detalle, '') as "Detalle" from r_resumen where cuantos > 0 order by orden;
