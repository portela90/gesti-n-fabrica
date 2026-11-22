-- Nave de cada trabajo en Investigar y Pregúntale (pedido por Cristian el 22/11, «que la adivine del texto»).
-- Antes solo salía de su máquina o su zona (60 de 806 trabajos). Ahora, en este orden:
--  1) su máquina o su zona (la nave que tengan en Configuración);
--  2) si no, el código de una máquina o el nombre/código de una zona que aparezca como palabra en su título, sitio o descripción
--     (F29, 14024, MORIZ…): si todas las que aparecen están en la misma nave, esa;
--  3) si no, el nombre de una nave que aparezca en el texto («Nave 2», también «nave2»): si sale solo una, esa.
--  Si aparecen dos naves distintas (p. ej. «las 2 naves»), sin nave. Nada escrito a mano: todo sale de Configuración.

/** Una palabra suelta dentro de un texto (sin distinguir mayúsculas): «F29» está en «derrame F29» pero no en «F290». */
create or replace function limpieza._tiene_palabra(p_texto text, p_palabra text) returns boolean
language sql immutable set search_path = '' as $$
  select p_texto is not null and length(trim(coalesce(p_palabra, ''))) >= 2
     and lower(p_texto) ~ ('(^|[^[:alnum:]])' || regexp_replace(regexp_replace(lower(trim(p_palabra)), '([.^$|()\[\]{}*+?\\-])', '\\\1', 'g'), '\s+', '\\s*', 'g') || '($|[^[:alnum:]])')
$$;

create or replace function limpieza._nave_trabajo(p_empresa uuid, p_activo uuid, p_ubicacion uuid, p_texto text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text; n int;
begin
  -- 1) su máquina o su zona
  v := coalesce((select c.nombre from nucleo.activos a join nucleo.centros c on c.id = a.centro_id where a.id = p_activo),
                (select c.nombre from nucleo.ubicaciones u join nucleo.centros c on c.id = u.centro_id where u.id = p_ubicacion));
  if v is not null or coalesce(trim(p_texto), '') = '' then return v; end if;
  -- 2) máquinas y zonas nombradas en el texto
  select count(distinct c.id), min(c.nombre) into n, v from (
      select a.centro_id from nucleo.activos a where a.empresa_id = p_empresa and a.baja is null and a.centro_id is not null
         and limpieza._tiene_palabra(p_texto, a.codigo)
      union all
      select u.centro_id from nucleo.ubicaciones u where u.empresa_id = p_empresa and u.baja is null and u.centro_id is not null
         and (limpieza._tiene_palabra(p_texto, u.nombre) or limpieza._tiene_palabra(p_texto, u.codigo))) x
    join nucleo.centros c on c.id = x.centro_id;
  if n = 1 then return v; end if;
  if n > 1 then return null; end if;
  -- 3) naves nombradas en el texto
  select count(*), min(c.nombre) into n, v from nucleo.centros c
   where c.empresa_id = p_empresa and c.baja is null and (limpieza._tiene_palabra(p_texto, c.nombre) or limpieza._tiene_palabra(p_texto, c.codigo));
  return case when n = 1 then v end;
end $$;
revoke execute on function limpieza._nave_trabajo(uuid, uuid, uuid, text) from public, anon;

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
        from nucleo.personas p where p.empresa_id = p_empresa and p.baja is null and coalesce(p.jornada, '') <> 'externo'), '[]'::jsonb),
    -- nave (desde la 0037, también adivinada del texto) y hora de cada trabajo (para «compara naves» y «a qué hora»)
    'detalles', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'creado', t.creado,
               'nave', limpieza._nave_trabajo(t.empresa_id, t.activo_id, t.ubicacion_id, concat_ws(' ', t.titulo, t.lugar, t.descripcion))))
        from limpieza.trabajos t where t.empresa_id = p_empresa and t.fecha between p_desde and p_hasta), '[]'::jsonb),
    'temas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', m.nombre, 'palabras', m.palabras) order by m.orden, m.nombre)
        from limpieza.temas m where m.empresa_id = p_empresa and m.baja is null), '[]'::jsonb),
    'naves', coalesce((select jsonb_agg(c.nombre order by c.nombre) from nucleo.centros c where c.empresa_id = p_empresa and c.baja is null), '[]'::jsonb),
    'maquinas', coalesce((select jsonb_agg(a.codigo order by a.codigo) from nucleo.activos a where a.empresa_id = p_empresa and a.baja is null), '[]'::jsonb));
end $$;
comment on function limpieza.investigar(uuid, date, date) is 'Datos de «Investigar» y «Pregúntale» (solo el administrador): lo de limpieza.informe + problemas (tema y sitio) + tareas '
  '+ horas de horario por día de la semana + nave y hora de cada trabajo + temas, naves y máquinas de la unidad.';
