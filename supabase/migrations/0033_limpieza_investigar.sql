-- =====================================================================================
-- 0033 · LIMPIEZA · INVESTIGAR (parte 7, trozo 2)
-- Decidido por Cristian (21/11):
--  · «Investigar» dentro de «Resumen», solo para el administrador (permiso limpieza.informe.todo).
--  · Saturación de cada trabajador, trabajos que se pueden pasar a otro (botón «Pasar», igual que la app vieja: cambia la
--    tarea fija desde hoy y sus trabajos pendientes), tiempos de cada trabajo con «Aplicar» y «Aplicar todos», tiempos que
--    no cuadran, problemas y sitios donde se repiten, en qué se va el tiempo y qué días pasan más.
--  · Los problemas se reconocen con los temas de la parte 6 (limpieza.temas) y el sitio con la misma regla que los
--    problemas repetidos (limpieza._clave_lugar). Las tareas fijas no son problemas (es trabajo planificado).
--  · El 85 % y los 30 min se guardan como ajustes de Limpieza (nucleo.ajustes): no hace falta nada aquí.
-- Solo depende del núcleo.
-- =====================================================================================

-- ---------- los datos de Investigar ----------
-- Lo mismo que limpieza.informe (como administrador ve todo) y además: el tema y el sitio de cada trabajo que es un
-- problema, las tareas (para los tiempos y para pasar trabajos) y las horas de horario de cada persona cada día de la semana.
create or replace function limpieza.investigar(p_empresa uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not nucleo.tiene_permiso('limpieza.informe.todo', p_empresa) then raise exception 'NO_PERMISO'; end if;
  r := limpieza.informe(p_empresa, p_desde, p_hasta);
  return r || jsonb_build_object(
    'problemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'tema', x.tema, 'sitio_clave', x.clave,
                                          'sitio', coalesce(x.maquina, nullif(x.lugar, ''), x.clave)))
        from (select t.id, limpieza._tema(t.empresa_id, t.titulo || ' ' || coalesce(t.descripcion, '')) as tema,
                     limpieza._clave_lugar(t.empresa_id, t.activo_id, coalesce(t.lugar, (select u.nombre from nucleo.ubicaciones u where u.id = t.ubicacion_id))) as clave,
                     (select a.codigo from nucleo.activos a where a.id = t.activo_id) as maquina,
                     coalesce(t.lugar, (select u.nombre from nucleo.ubicaciones u where u.id = t.ubicacion_id)) as lugar
                from limpieza.trabajos t
               where t.empresa_id = p_empresa and t.fecha between p_desde and p_hasta and t.clase <> 'fija') x
       where x.tema is not null), '[]'::jsonb),
    'tareas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'clase', a.clase, 'titulo', a.titulo, 'minutos_est', a.minutos_est, 'dias', a.dias,
                                          'equipo_id', a.equipo_id, 'asignados', a.asignados, 'todo_equipo', a.todo_equipo)
                       order by a.clase, a.titulo)
        from limpieza.tareas a where a.empresa_id = p_empresa and a.baja is null), '[]'::jsonb),
    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'equipo_id', p.equipo_id, 'jornada', p.jornada,
               'horas_dow', (select jsonb_agg(coalesce(nucleo.horas_horario(p.horario, d), 0) order by d) from generate_series(0, 6) d))
             order by p.nombre)
        from nucleo.personas p where p.empresa_id = p_empresa and p.baja is null and coalesce(p.jornada, '') <> 'externo'), '[]'::jsonb));
end $$;
comment on function limpieza.investigar(uuid, date, date) is 'Datos de «Investigar» (solo el administrador): lo de limpieza.informe + problemas (tema y sitio de cada trabajo '
  'que no es fijo y encaja con un tema) + tareas + horas de horario de cada persona por día de la semana (0 = domingo).';

-- ---------- pasar una tarea fija a otra persona ----------
-- Desde hoy: cambia la tarea fija y los trabajos de esa tarea que aún no están hechos (de hoy en adelante). Lo hecho no se toca.
-- Devuelve cuántos trabajos pendientes se han cambiado.
create or replace function limpieza.pasar_tarea(p_tarea uuid, p_de uuid, p_a uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare t limpieza.tareas; n int;
begin
  select * into t from limpieza.tareas where id = p_tarea for update;
  if not found or not nucleo.tiene_permiso('limpieza.plan.editar', t.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if t.clase <> 'fija' or t.baja is not null or t.todo_equipo then raise exception 'NO_SE_PUEDE_PASAR'; end if;
  if p_de is null or p_a is null or p_de = p_a or not p_de = any(t.asignados) then raise exception 'NO_LA_TIENE'; end if;
  if p_a = any(t.asignados) then raise exception 'YA_LA_TIENE'; end if;
  if not exists (select 1 from nucleo.personas p where p.id = p_a and p.empresa_id = t.empresa_id and p.baja is null) then raise exception 'PERSONA_DE_OTRA_UNIDAD'; end if;
  update limpieza.tareas set asignados = array_replace(asignados, p_de, p_a) where id = p_tarea;
  update limpieza.trabajos set asignados = array_replace(asignados, p_de, p_a)
   where tarea_id = p_tarea and fecha >= current_date and estado <> 'hecho' and p_de = any(asignados) and not p_a = any(asignados);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- aplicar tiempos propuestos ----------
-- p_items = [{"id": tarea, "minutos": n}, …]. Todo o nada. Solo cambia el previsto de la tarea (los trabajos ya salidos no).
create or replace function limpieza.poner_tiempos(p_empresa uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare x jsonb; m int; n int := 0;
begin
  if not nucleo.tiene_permiso('limpieza.plan.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'DEMASIADAS'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    m := case when (x ->> 'minutos') ~ '^\d{1,4}$' then (x ->> 'minutos')::int end;
    if m is null or m < 1 or m > 1440 then raise exception 'TIEMPO_MAL'; end if;
    update limpieza.tareas set minutos_est = m where id = (x ->> 'id')::uuid and empresa_id = p_empresa and baja is null;
    if not found then raise exception 'NO_EXISTE'; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function limpieza.investigar(uuid, date, date), limpieza.pasar_tarea(uuid, uuid, uuid), limpieza.poner_tiempos(uuid, jsonb) from public, anon;
grant execute on function limpieza.investigar(uuid, date, date), limpieza.pasar_tarea(uuid, uuid, uuid), limpieza.poner_tiempos(uuid, jsonb) to authenticated;
