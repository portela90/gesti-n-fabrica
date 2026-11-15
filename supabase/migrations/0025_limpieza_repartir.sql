-- =====================================================================================
-- 0025 · LIMPIEZA · REPARTIR (primera pieza de la parte 4: «Hoy del equipo»)
-- Pedido por Cristian (15/11): poder cambiar a quién le toca un trabajo que ya ha salido hoy, y crear un trabajo y
-- dárselo directamente a un operario. Lo hacen el administrador y el encargado.
--  · repartir: cambia solo ese trabajo de ese día (la tarea fija sigue como estaba). No se reparte lo ya hecho.
--  · crear_trabajo: nuevo «p_para» (para quién); para otros hace falta poder repartir.
--  · De momento el encargado reparte entre todos; lo de «solo su equipo» (Encargado hornos) se ajusta más adelante.
-- =====================================================================================

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.trabajo.repartir', 'limpieza', 'Repartir los trabajos: cambiar a quién le toca y crear trabajos para otros')
on conflict (codigo) do nothing;
-- el encargado de partida también reparte (el administrador ya lo tiene con «*»)
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, 'limpieza.trabajo.repartir' from nucleo.roles r
 where r.codigo = 'encargado' and r.empresa_id is null
   and not exists (select 1 from nucleo.rol_permisos rp where rp.rol_id = r.id and rp.permiso = 'limpieza.trabajo.repartir');

-- Cambiar a quién le toca un trabajo: unas personas, o todo un equipo.
create or replace function limpieza.repartir(p_trabajo uuid, p_personas uuid[], p_todo_equipo boolean default false, p_equipo uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos; eq uuid;
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not nucleo.tiene_permiso('limpieza.trabajo.repartir', t.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if t.estado = 'hecho' then raise exception 'YA_HECHO'; end if;
  p_personas := array(select distinct unnest(coalesce(p_personas, '{}')));
  if cardinality(p_personas) > 50 then raise exception 'DEMASIADAS'; end if;
  if exists (select 1 from unnest(p_personas) x where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = t.empresa_id)) then
    raise exception 'PERSONA_DE_OTRA_UNIDAD';
  end if;
  eq := coalesce(p_equipo, t.equipo_id);
  if p_todo_equipo and (eq is null or not exists (select 1 from nucleo.equipos e where e.id = eq and e.empresa_id = t.empresa_id)) then
    raise exception 'FALTA_EQUIPO';
  end if;
  update limpieza.trabajos set asignados = case when p_todo_equipo then '{}' else p_personas end,
         todo_equipo = coalesce(p_todo_equipo, false), equipo_id = case when p_todo_equipo then eq else t.equipo_id end
   where id = p_trabajo;
end $$;
grant execute on function limpieza.repartir(uuid, uuid[], boolean, uuid) to authenticated;

-- Crear un trabajo: para mí o, si puedo repartir, para otros (p_para).
drop function limpieza.crear_trabajo(uuid, date, uuid, text, uuid, text);
create or replace function limpieza.crear_trabajo(p_empresa uuid, p_fecha date, p_tarea uuid default null, p_titulo text default null,
                                                  p_activo uuid default null, p_nota text default null, p_para uuid[] default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h limpieza.tareas; yo uuid := limpieza.mi_persona(); quien uuid[]; nuevo uuid;
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  quien := array(select distinct unnest(coalesce(p_para, case when yo is null then '{}'::uuid[] else array[yo] end)));
  if cardinality(quien) = 0 and yo is null and p_para is null then raise exception 'SIN_FICHA'; end if;
  if not cardinality(quien) between 1 and 50 then raise exception 'FALTA_QUIEN'; end if;
  if not (yo is not null and quien = array[yo]) and not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if exists (select 1 from unnest(quien) x where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = p_empresa)) then
    raise exception 'PERSONA_DE_OTRA_UNIDAD';
  end if;
  if p_fecha is null or p_fecha < current_date - 1 or p_fecha > current_date + 1 then raise exception 'FECHA_MAL'; end if;
  if p_activo is not null and not exists (select 1 from nucleo.activos a where a.id = p_activo and a.empresa_id = p_empresa) then raise exception 'NO_PERMISO'; end if;
  if p_tarea is not null then
    select * into h from limpieza.tareas where id = p_tarea and empresa_id = p_empresa and clase = 'habitual' and baja is null;
    if not found or not (cardinality(h.solo_para) = 0 or nucleo.tiene_permiso('limpieza.trabajo.corregir', p_empresa)
                         or (quien <@ h.solo_para)) then
      raise exception 'NO_PERMISO';
    end if;
    insert into limpieza.trabajos (empresa_id, fecha, clase, tarea_id, titulo, descripcion, lugar, ubicacion_id, activo_id, minutos_est, asignados, nota)
    values (p_empresa, p_fecha, 'habitual', h.id, h.titulo, h.descripcion, h.lugar, h.ubicacion_id, coalesce(p_activo, h.activo_id), h.minutos_est,
            quien, nullif(trim(coalesce(p_nota, '')), ''))
    returning id into nuevo;
  else
    if length(trim(coalesce(p_titulo, ''))) not between 1 and 120 then raise exception 'TITULO_MAL'; end if;
    insert into limpieza.trabajos (empresa_id, fecha, clase, titulo, activo_id, asignados, nota)
    values (p_empresa, p_fecha, 'suelto', trim(p_titulo), p_activo, quien, nullif(trim(coalesce(p_nota, '')), ''))
    returning id into nuevo;
  end if;
  return nuevo;
end $$;
grant execute on function limpieza.crear_trabajo(uuid, date, uuid, text, uuid, text, uuid[]) to authenticated;
