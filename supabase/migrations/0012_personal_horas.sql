-- =====================================================================================
-- 0012 · PERSONAL · HORAS ANUALES QUE TIENEN QUE CUADRAR
-- Decidido por Cristian (13/11):
--  · Las horas anuales son del calendario y, a quien tenga otras (p. ej. jornada parcial), se le ponen las suyas.
--  · Un día normal tiene las horas de su día de la semana (p. ej. de lunes a jueves 8 h y viernes 6 h).
--  · Los días de jornada intensiva, horario especial y «trabaja» llevan sus propias horas.
--  · Festivos, cierres, descansos y las vacaciones de cada uno no suman horas.
--  · No se puede enviar a firmar el calendario a alguien a quien no le cuadran las horas al 100 %.
-- =====================================================================================

alter table personal.calendarios
  add column horas_anuales numeric(7,2) check (horas_anuales is null or horas_anuales between 0 and 4000),
  add column horas_dia numeric(4,2)[] check (horas_dia is null or (array_length(horas_dia, 1) = 7 and 0 <= all(horas_dia) and 24 >= all(horas_dia)));
comment on column personal.calendarios.horas_anuales is 'Horas que tiene que trabajar al año cada persona de este calendario (salvo quien tenga las suyas).';
comment on column personal.calendarios.horas_dia is 'Horas de un día normal según el día de la semana: [domingo, lunes, martes, miércoles, jueves, viernes, sábado].';

alter table personal.calendario_personas
  add column horas_anuales numeric(7,2) check (horas_anuales is null or horas_anuales between 0 and 4000);
comment on column personal.calendario_personas.horas_anuales is 'Horas al año de esta persona si no son las del calendario (vacío = las del calendario).';

alter table personal.dias add column horas numeric(4,2) check (horas is null or horas between 0 and 24);
comment on column personal.dias.horas is 'Horas de ese día (jornada intensiva, horario especial o «trabaja»). Vacío = las de un día normal.';

-- Horas de cada persona del calendario: las que salen y las que tiene que hacer.
create or replace function personal.horas_personas(p_calendario uuid)
returns table (persona_id uuid, nombre text, objetivo numeric, horas numeric, vacaciones int)
language sql stable security invoker set search_path = '' as $$
  with c as (select * from personal.calendarios where id = p_calendario),
  dia as (
    select g::date as f, (
      case when m.tipo in ('festivo', 'cierre', 'descanso') then 0
           when m.tipo in ('intensiva', 'especial', 'trabaja') then coalesce(m.horas, c.horas_dia[extract(dow from g)::int + 1], 0)
           else coalesce(c.horas_dia[extract(dow from g)::int + 1], 0) end)::numeric as h
      from c cross join generate_series(make_date(c.anio, 1, 1), make_date(c.anio, 12, 31), interval '1 day') g
      left join personal.dias m on m.calendario_id = c.id and m.fecha = g::date)
  select cp.persona_id, p.nombre, coalesce(cp.horas_anuales, c.horas_anuales),
         coalesce((select sum(d.h) from dia d where not exists (
           select 1 from personal.vacaciones v where v.empresa_id = c.empresa_id and v.persona_id = cp.persona_id and d.f between v.desde and v.hasta)), 0),
         (select count(*)::int from dia d where exists (
           select 1 from personal.vacaciones v where v.empresa_id = c.empresa_id and v.persona_id = cp.persona_id and d.f between v.desde and v.hasta))
    from c join personal.calendario_personas cp on cp.calendario_id = c.id
    join nucleo.personas p on p.id = cp.persona_id
   order by p.nombre
$$;

-- Marcar días, ahora también con las horas de ese día.
drop function personal.marcar_dias(uuid[], date[], text, text, text);
create or replace function personal.marcar_dias(p_calendarios uuid[], p_fechas date[], p_tipo text,
                                                p_nombre text default null, p_horario text default null, p_horas numeric default null) returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if cardinality(p_fechas) > 400 or cardinality(p_calendarios) > 20 then raise exception 'DEMASIADAS'; end if;
  if exists (select 1 from personal.calendarios c where c.id = any(p_calendarios) and not nucleo.tiene_permiso('personal.calendario.editar', c.empresa_id))
     or (select count(*) from personal.calendarios c where c.id = any(p_calendarios)) <> cardinality(p_calendarios) then
    raise exception 'NO_PERMISO';
  end if;
  if coalesce(p_tipo, '') = '' then
    delete from personal.dias d where d.calendario_id = any(p_calendarios) and d.fecha = any(p_fechas);
  else
    insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario, horas)
    select c.empresa_id, c.id, f, p_tipo, nullif(trim(p_nombre), ''), nullif(trim(p_horario), ''),
           case when p_tipo in ('intensiva', 'especial', 'trabaja') then p_horas end
      from personal.calendarios c, unnest(p_fechas) f
     where c.id = any(p_calendarios) and extract(year from f)::int = c.anio
    on conflict (calendario_id, fecha) do update set tipo = excluded.tipo, nombre = excluded.nombre, horario = excluded.horario, horas = excluded.horas;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- copiar_dias también copia las horas de cada día
create or replace function personal.copiar_dias(p_de uuid, p_a uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare a personal.calendarios; b personal.calendarios; n int;
begin
  select * into a from personal.calendarios where id = p_de;
  select * into b from personal.calendarios where id = p_a;
  if a.id is null or b.id is null then raise exception 'NO_EXISTE'; end if;
  if a.id = b.id then raise exception 'MISMO_CALENDARIO'; end if;
  if a.anio <> b.anio or a.empresa_id <> b.empresa_id then raise exception 'OTRO_ANIO'; end if;
  if not nucleo.tiene_permiso('personal.calendario.editar', b.empresa_id) then raise exception 'NO_PERMISO'; end if;
  delete from personal.dias d where d.calendario_id = b.id;
  insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario, horas)
  select d.empresa_id, b.id, d.fecha, d.tipo, d.nombre, d.horario, d.horas from personal.dias d where d.calendario_id = a.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- La foto que se firma lleva también las horas del año de esa persona.
create or replace function personal._foto(p_calendario uuid, p_persona uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'anio', c.anio,
    'unidad', (select e.nombre from nucleo.empresas e where e.id = c.empresa_id),
    'calendario', c.nombre,
    'equipo', c.nombre,
    'dias_equipo', c.dias_semana,
    'horas_dia', c.horas_dia,
    'horas_anuales', h.objetivo,
    'horas', h.horas,
    'trabajador', (select p.nombre from nucleo.personas p where p.id = p_persona and p.empresa_id = c.empresa_id),
    'horario', (select p.horario from nucleo.personas p where p.id = p_persona and p.empresa_id = c.empresa_id),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', d.fecha, 'tipo', d.tipo, 'nombre', d.nombre, 'horario', d.horario, 'horas', d.horas) order by d.fecha)
                        from personal.dias d where d.calendario_id = c.id), '[]'::jsonb),
    'vacaciones', coalesce((select jsonb_agg(jsonb_build_object('desde', greatest(v.desde, make_date(c.anio, 1, 1)), 'hasta', least(v.hasta, make_date(c.anio, 12, 31)), 'nota', v.nota) order by v.desde)
                        from personal.vacaciones v where v.empresa_id = c.empresa_id and v.persona_id = p_persona
                         and v.hasta >= make_date(c.anio, 1, 1) and v.desde <= make_date(c.anio, 12, 31)), '[]'::jsonb))
  from personal.calendarios c
  left join lateral (select x.objetivo, x.horas from personal.horas_personas(c.id) x where x.persona_id = p_persona) h on true
  where c.id = p_calendario
$$;
revoke execute on function personal._foto(uuid, uuid) from public, authenticated;

-- Enviar a firmar: solo si a todos a los que se envía les cuadran las horas al 100 %.
create or replace function personal.enviar_calendario(p_calendario uuid, p_personas uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare c personal.calendarios; v_persona uuid; v_datos jsonb; n int := 0; v_mal text;
begin
  select * into c from personal.calendarios where id = p_calendario;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('personal.firma.enviar', c.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if cardinality(p_personas) > 200 then raise exception 'DEMASIADAS'; end if;
  select string_agg(h.nombre, ', ' order by h.nombre) into v_mal
    from personal.horas_personas(c.id) h join nucleo.personas p on p.id = h.persona_id and p.baja is null
   where (p_personas is null or h.persona_id = any(p_personas)) and h.objetivo is null;
  if v_mal is not null then raise exception 'SIN_HORAS: %', v_mal; end if;
  select string_agg(h.nombre, ', ' order by h.nombre) into v_mal
    from personal.horas_personas(c.id) h join nucleo.personas p on p.id = h.persona_id and p.baja is null
   where (p_personas is null or h.persona_id = any(p_personas)) and abs(h.horas - h.objetivo) > 0.005;
  if v_mal is not null then raise exception 'NO_CUADRA: %', v_mal; end if;
  for v_persona in
    select cp.persona_id from personal.calendario_personas cp join nucleo.personas p on p.id = cp.persona_id and p.baja is null
     where cp.calendario_id = c.id and (p_personas is null or cp.persona_id = any(p_personas))
  loop
    update personal.envios e set anulado = now()
     where e.empresa_id = c.empresa_id and e.persona_id = v_persona and e.anio = c.anio and e.anulado is null
       and not exists (select 1 from nucleo.firmas f where f.documento = 'calendario' and f.documento_id = e.id);
    v_datos := personal._foto(c.id, v_persona);
    insert into personal.envios (empresa_id, anio, calendario_id, persona_id, datos, sha256)
    values (c.empresa_id, c.anio, c.id, v_persona, v_datos, personal.huella(v_datos));
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function personal.horas_personas(uuid), personal.marcar_dias(uuid[], date[], text, text, text, numeric),
  personal.copiar_dias(uuid, uuid), personal.enviar_calendario(uuid, uuid[]) to authenticated;
