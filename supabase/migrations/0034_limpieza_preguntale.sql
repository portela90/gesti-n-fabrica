-- =====================================================================================
-- 0034 · LIMPIEZA · PREGÚNTALE (parte 7, trozo 4)
-- Decidido por Cristian (21/11):
--  · El buscador «Pregúntale» arriba de Investigar (solo el administrador, permiso limpieza.informe.todo). Entiende la
--    pregunta con reglas (sin servicios de pago), como la app vieja, y contesta de trabajos y también de personas.
--  · Se traen de la vieja «Enséñale» (diccionario), «¿Te ha servido?», las favoritas y los ejemplos.
-- Aquí: el diccionario y las preguntas guardadas, y lo que le falta a limpieza.investigar para contestar
-- (la nave y la hora de cada trabajo, y los temas con sus palabras).
-- Solo depende del núcleo.
-- =====================================================================================

-- ---------- lo que se le enseña ----------
create table limpieza.preguntas_dic (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  tipo        text not null check (tipo in ('persona', 'lugar', 'problema', 'frase', 'grupo', 'favorita')),
  palabra     text not null check (length(trim(palabra)) between 1 and 200),
  valor       text check (valor is null or length(valor) <= 500),
  nota        text check (nota is null or length(nota) <= 500),
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  check (tipo = 'favorita' or length(trim(coalesce(valor, ''))) > 0)
);
create unique index preguntas_dic_unica on limpieza.preguntas_dic (empresa_id, tipo, lower(trim(palabra)));
comment on table limpieza.preguntas_dic is 'Lo que se le enseña a «Pregúntale»: cuando escriba «palabra» quiero decir «valor». '
  'persona = nombre de la ficha; lugar = cómo se llama el sitio; problema = nombre del tema; frase = otras palabras; '
  'grupo = palabras de los trabajos del grupo, separadas por comas; favorita = una pregunta guardada (sin valor).';

-- ---------- las preguntas que se hacen (para aprender) ----------
create table limpieza.preguntas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  q           text not null check (length(trim(q)) between 1 and 500),
  entendido   jsonb,
  respuesta   text check (respuesta is null or length(respuesta) <= 4000),
  ok          boolean,
  queria      text check (queria is null or length(queria) <= 1000),
  revisada    boolean not null default false,
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);
create index on limpieza.preguntas (empresa_id, creado desc);
comment on table limpieza.preguntas is 'Cada pregunta a «Pregúntale», lo que entendió y lo que contestó; ok = ¿te ha servido?; queria = lo que se quería saber si no sirvió.';

grant select, insert, update, delete on limpieza.preguntas_dic to authenticated;
grant select, insert, update on limpieza.preguntas to authenticated;
grant all on limpieza.preguntas_dic, limpieza.preguntas to service_role;
alter table limpieza.preguntas_dic enable row level security;
alter table limpieza.preguntas enable row level security;
create policy ver on limpieza.preguntas_dic for select to authenticated using (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy crear on limpieza.preguntas_dic for insert to authenticated with check (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy cambiar on limpieza.preguntas_dic for update to authenticated
  using (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id)) with check (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy borrar on limpieza.preguntas_dic for delete to authenticated using (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy ver on limpieza.preguntas for select to authenticated using (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy crear on limpieza.preguntas for insert to authenticated with check (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
create policy cambiar on limpieza.preguntas for update to authenticated
  using (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id)) with check (nucleo.tiene_permiso('limpieza.informe.todo', empresa_id));
select nucleo.activar_historial('limpieza.preguntas_dic');

-- ---------- Investigar: también la nave y la hora de cada trabajo, y los temas ----------
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
    -- nuevo en la 0034: nave y hora de cada trabajo (para «compara naves» y «a qué hora»)
    'detalles', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'creado', t.creado,
               'nave', coalesce((select c.nombre from nucleo.activos a join nucleo.centros c on c.id = a.centro_id where a.id = t.activo_id),
                                (select c.nombre from nucleo.ubicaciones u join nucleo.centros c on c.id = u.centro_id where u.id = t.ubicacion_id))))
        from limpieza.trabajos t where t.empresa_id = p_empresa and t.fecha between p_desde and p_hasta), '[]'::jsonb),
    'temas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', m.nombre, 'palabras', m.palabras) order by m.orden, m.nombre)
        from limpieza.temas m where m.empresa_id = p_empresa and m.baja is null), '[]'::jsonb),
    'naves', coalesce((select jsonb_agg(c.nombre order by c.nombre) from nucleo.centros c where c.empresa_id = p_empresa and c.baja is null), '[]'::jsonb),
    'maquinas', coalesce((select jsonb_agg(a.codigo order by a.codigo) from nucleo.activos a where a.empresa_id = p_empresa and a.baja is null), '[]'::jsonb));
end $$;
comment on function limpieza.investigar(uuid, date, date) is 'Datos de «Investigar» y «Pregúntale» (solo el administrador): lo de limpieza.informe + problemas (tema y sitio) + tareas '
  '+ horas de horario por día de la semana + nave y hora de cada trabajo + temas, naves y máquinas de la unidad.';
