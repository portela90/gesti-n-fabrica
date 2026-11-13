-- =====================================================================================
-- 0013 · PERSONAL · HACER EL CALENDARIO POR OPERARIO Y GUARDARLO DE UNA VEZ
-- Cristian (13/11): «quiero seleccionar un operario (o varios), meterle sus horas anuales, ir marcando los días y
-- poniendo las horas de cada día hasta completar el calendario y darle a guardar».
-- La pantalla trabaja en el móvil y, al pulsar Guardar, manda todo junto: nombre, horas al año, personas, todos los
-- días (con sus horas) y las vacaciones nuevas. Aquí se guarda en una sola operación: o todo o nada.
-- Un día de trabajo con sus horas se guarda como tipo «trabaja» con horas; festivo, cierre… como hasta ahora.
-- =====================================================================================

create or replace function personal.guardar_calendario(
  p_empresa uuid, p_anio int, p_calendario uuid, p_nombre text, p_horas_anuales numeric,
  p_personas uuid[], p_dias jsonb, p_vacaciones jsonb default '[]'::jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := p_calendario; v_dia jsonb;
begin
  if not nucleo.tiene_permiso('personal.calendario.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'FALTA_NOMBRE'; end if;
  if cardinality(p_personas) = 0 then raise exception 'SIN_PERSONAS'; end if;
  if jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) > 366 then raise exception 'DIAS_MAL'; end if;
  if jsonb_array_length(coalesce(p_vacaciones, '[]'::jsonb)) > 0 and not nucleo.tiene_permiso('personal.vacaciones.editar', p_empresa) then
    raise exception 'NO_PERMISO';
  end if;

  if v_id is null then
    insert into personal.calendarios (empresa_id, anio, nombre, dias_semana, horas_dia, horas_anuales)
    values (p_empresa, p_anio, trim(p_nombre), '{}', '{0,0,0,0,0,0,0}', p_horas_anuales) returning id into v_id;
  else
    update personal.calendarios set nombre = trim(p_nombre), horas_anuales = p_horas_anuales, dias_semana = '{}', horas_dia = '{0,0,0,0,0,0,0}'
     where id = v_id and empresa_id = p_empresa and anio = p_anio;
    if not found then raise exception 'NO_EXISTE'; end if;
  end if;

  perform personal.poner_personas(v_id, p_personas);
  -- quien tenía horas propias y ahora se le hace el calendario a él: valen las de este calendario
  update personal.calendario_personas set horas_anuales = null where calendario_id = v_id and persona_id = any(p_personas);

  delete from personal.dias where calendario_id = v_id;
  for v_dia in select * from jsonb_array_elements(p_dias) loop
    insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario, horas)
    values (p_empresa, v_id, (v_dia ->> 'fecha')::date, v_dia ->> 'tipo', nullif(trim(v_dia ->> 'nombre'), ''),
            nullif(trim(v_dia ->> 'horario'), ''), (v_dia ->> 'horas')::numeric);
  end loop;

  insert into personal.vacaciones (empresa_id, persona_id, desde, hasta, nota)
  select p_empresa, (x ->> 'persona_id')::uuid, (x ->> 'desde')::date, (x ->> 'hasta')::date, nullif(trim(x ->> 'nota'), '')
    from jsonb_array_elements(coalesce(p_vacaciones, '[]'::jsonb)) x;

  -- los calendarios de ese año que se han quedado sin nadie y no se han enviado nunca, se quitan
  delete from personal.calendarios c
   where c.empresa_id = p_empresa and c.anio = p_anio and c.id <> v_id
     and not exists (select 1 from personal.calendario_personas cp where cp.calendario_id = c.id)
     and not exists (select 1 from personal.envios e where e.calendario_id = c.id);
  return v_id;
end $$;

grant execute on function personal.guardar_calendario(uuid, int, uuid, text, numeric, uuid[], jsonb, jsonb) to authenticated;
