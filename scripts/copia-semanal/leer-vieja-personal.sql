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
$receta$-- Copia semanal de Personal (parte 8, decidido por Cristian el 22/11): de la app vieja (limpieza-cie) a la nueva (colada-mapri).
-- ESTE ARCHIVO NO LLEVA DATOS. El archivo de cada semana (fuera del repositorio) empieza creando y llenando
-- v_horas, v_vac y v_dias con lo que hay en la vieja (consultas en scripts/copia-semanal/LEEME.md) y luego pega esto.
-- Reglas:
--  · Solo se toca lo que vino de la vieja (origen «limpieza-cie:…»). Lo hecho en la app nueva no se pisa nunca.
--  · Horas del día y vacaciones: se ponen, se cambian y se quitan para que queden igual que en la vieja.
--  · Calendario: se ponen o cambian los días de «Semana AAAA» y «Fin de semana AAAA»; no se borra ninguno (solo se avisa).
--  · Todo o nada: el SQL Editor de Supabase lo manda todo de una vez (una sola transacción): si algo falla, no se guarda nada.
-- Al final saca un resumen.

create temp table r_resumen (orden int, que text, cuantos bigint, detalle text);

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Limpieza');
  n bigint;
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Limpieza'; end if;

  -- ---------- horas del día ----------
  insert into r_resumen select 10, 'Horas: personas que no están en la app nueva (no se copian)', count(*), string_agg(distinct persona::text, ', ')
    from v_horas h where not exists (select 1 from nucleo.personas p where p.id = h.persona and p.empresa_id = v_emp);
  insert into r_resumen select 11, 'Horas: días apuntados en la app nueva que la copia no toca', count(*), string_agg(h.fecha::text, ', ')
    from v_horas h join personal.horas_dia d on d.empresa_id = v_emp and d.persona_id = h.persona and d.fecha = h.fecha
   where d.origen is distinct from 'limpieza-cie:horas_dia';

  with q as (
    insert into personal.horas_dia (empresa_id, persona_id, fecha, trabajadas, fuera, extra_mano, falta, nota, origen)
    select v_emp, h.persona, h.fecha, h.trabajadas, coalesce(h.fuera, 0), nullif(coalesce(h.extra, 0), 0), h.falta,
           case when nullif(trim(h.nota), '') is null and (coalesce(h.fuera, 0) > 0 or coalesce(h.extra, 0) > 0) then '(sin motivo en la app vieja)'
                else nullif(trim(h.nota), '') end,
           'limpieza-cie:horas_dia'
      from v_horas h where exists (select 1 from nucleo.personas p where p.id = h.persona and p.empresa_id = v_emp)
    on conflict (empresa_id, persona_id, fecha) do update
      set trabajadas = excluded.trabajadas, fuera = excluded.fuera, extra_mano = excluded.extra_mano, falta = excluded.falta, nota = excluded.nota
      where personal.horas_dia.origen = 'limpieza-cie:horas_dia'
        and (personal.horas_dia.trabajadas, personal.horas_dia.fuera, coalesce(personal.horas_dia.extra_mano, 0), personal.horas_dia.falta, personal.horas_dia.nota)
            is distinct from (excluded.trabajadas, excluded.fuera, coalesce(excluded.extra_mano, 0), excluded.falta, excluded.nota)
    returning (xmax = 0) nueva, fecha)
  insert into r_resumen select 1, case when nueva then 'Horas: días nuevos' else 'Horas: días cambiados' end, count(*), string_agg(fecha::text, ', ' order by fecha)
    from q group by nueva;

  with q as (
    delete from personal.horas_dia d where d.empresa_id = v_emp and d.origen = 'limpieza-cie:horas_dia'
       and not exists (select 1 from v_horas h where h.persona = d.persona_id and h.fecha = d.fecha) returning fecha)
  insert into r_resumen select 2, 'Horas: días quitados (ya no están en la vieja)', count(*), string_agg(fecha::text, ', ' order by fecha) from q;

  -- ---------- vacaciones ----------
  with q as (
    insert into personal.vacaciones (id, empresa_id, persona_id, desde, hasta, nota, origen)
    select x.id, v_emp, x.persona, x.desde, x.hasta, nullif(trim(x.nota), ''), 'limpieza-cie:cal_vac:' || x.id
      from v_vac x where exists (select 1 from nucleo.personas p where p.id = x.persona and p.empresa_id = v_emp)
    on conflict (id) do update set persona_id = excluded.persona_id, desde = excluded.desde, hasta = excluded.hasta, nota = excluded.nota
      where personal.vacaciones.origen like 'limpieza-cie:cal_vac:%'
        and (personal.vacaciones.persona_id, personal.vacaciones.desde, personal.vacaciones.hasta, personal.vacaciones.nota)
            is distinct from (excluded.persona_id, excluded.desde, excluded.hasta, excluded.nota)
    returning (xmax = 0) nueva, desde)
  insert into r_resumen select 3, case when nueva then 'Vacaciones: nuevas' else 'Vacaciones: cambiadas' end, count(*), string_agg(desde::text, ', ' order by desde)
    from q group by nueva;
  with q as (
    delete from personal.vacaciones v where v.empresa_id = v_emp and v.origen like 'limpieza-cie:cal_vac:%'
       and not exists (select 1 from v_vac x where 'limpieza-cie:cal_vac:' || x.id = v.origen) returning desde)
  insert into r_resumen select 4, 'Vacaciones: quitadas (borradas en la vieja)', count(*), string_agg(desde::text, ', ' order by desde) from q;

  -- ---------- calendario ----------
  create temp table r_dias as
  select d.*, c.id calendario_id, c.nombre calendario
    from v_dias d
    left join personal.calendarios c on c.empresa_id = v_emp and c.anio = extract(year from d.fecha)::int
     and c.nombre = case lower(d.equipo) when 'semana' then 'Semana ' when 'finde' then 'Fin de semana ' end || extract(year from d.fecha)::int;
  insert into r_resumen select 12, 'Calendario: días de un año sin calendario en la nueva (no se copian)', count(*), string_agg(equipo || ' ' || fecha, ', ')
    from r_dias where calendario_id is null;
  with q as (
    insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario, origen)
    select v_emp, r.calendario_id, r.fecha, r.tipo, nullif(r.nombre, ''), nullif(r.horario, ''), 'limpieza-cie:cal_dia:' || lower(r.equipo) || ':' || r.fecha
      from r_dias r where r.calendario_id is not null
    on conflict (calendario_id, fecha) do update set tipo = excluded.tipo, nombre = excluded.nombre, horario = excluded.horario, horas = null
      where (personal.dias.tipo, personal.dias.nombre, personal.dias.horario) is distinct from (excluded.tipo, excluded.nombre, excluded.horario)
    returning (xmax = 0) nueva, fecha, calendario_id)
  insert into r_resumen select 5, case when nueva then 'Calendario: días nuevos' else 'Calendario: días cambiados' end, count(*),
         string_agg((select nombre from personal.calendarios c where c.id = q.calendario_id) || ' ' || fecha, ', ' order by fecha)
    from q group by nueva;
  insert into r_resumen select 13, 'Calendario: festivos, puentes… que están en la nueva y no en la vieja (no se borran: míralos)', count(*),
         string_agg(c.nombre || ' ' || d.fecha || ' ' || d.tipo, ', ' order by d.fecha)
    from personal.dias d join personal.calendarios c on c.id = d.calendario_id
   where c.empresa_id = v_emp and d.tipo in ('festivo', 'cierre', 'intensiva', 'especial', 'descanso')
     and coalesce(d.origen, '') not like 'limpieza-cie:festivos:%'      -- los festivos que se trajeron de la tabla de festivos de la vieja
     and exists (select 1 from r_dias r where r.calendario_id = c.id)   -- solo los calendarios que vienen de la vieja
     and not exists (select 1 from r_dias r where r.calendario_id = c.id and r.fecha = d.fecha);
end $$;

select que as "Qué", cuantos as "Cuántos", coalesce(detalle, '') as "Fechas o detalle" from r_resumen where cuantos > 0 order by orden;
$receta$) as "Copia esta casilla y pégala en colada-mapri";
