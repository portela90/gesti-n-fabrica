-- =====================================================================================
-- 0029 · LIMPIEZA · FIN DE SEMANA (parte 5)
-- Decidido por Cristian (15/11):
--  · Excel del cliente: solo lo sube el administrador. Al subirlo elige qué pasa con los que no traen persona:
--    reparto automático, para el encargado (sin asignar, no los toca el reparto) o para todo el equipo.
--    No se crea dos veces el mismo trabajo el mismo día (mismo título y lugar).
--  · El encargado revisa los del fin de semana y les puede cambiar el día.
--  · Instrucciones para el encargado («traspasos»): igual que la vieja (título, texto, desde-hasta, «Leído»;
--    si se cambian, hay que volver a leerlas).
--  · Checklist del encargado: igual que la vieja, una por día; Bien/Mal o número, nota y foto si está mal;
--    se guarda a medias y luego «Terminar y enviar». Los puntos son las checklists «del encargado» (limpieza.plantillas).
-- Además:
--  · trabajos.no_repartir: el reparto automático no toca ese trabajo (los «para el encargado» y los que alguien suelta).
--  · trabajos.urgente y trabajos.grupo (el grupo de un trabajo sin tarea, p. ej. del Excel, para el reparto).
--  · es_mio: crear un trabajo para otro ya no lo hace «mío» (antes salía en el Mi día de quien lo creaba).
-- =====================================================================================

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.excel.editar', 'limpieza', 'Subir el Excel del fin de semana y dar instrucciones al encargado')
on conflict (codigo) do nothing;

alter table limpieza.trabajos add column no_repartir boolean not null default false,
  add column urgente boolean not null default false,
  add column grupo text check (grupo is null or length(grupo) between 1 and 40);
comment on column limpieza.trabajos.no_repartir is 'El reparto automático no lo toca (es para que lo reparta el encargado o el administrador a mano).';

create or replace function limpieza.es_mio(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select limpieza.mi_persona() = any(t.asignados)
      or (t.todo_equipo and t.equipo_id is not null and t.equipo_id = (select p.equipo_id from nucleo.personas p where p.id = limpieza.mi_persona()))
      or (t.creado_por = auth.uid() and cardinality(t.asignados) = 0 and not t.todo_equipo)
$$;

-- el reparto: como en la 0027, con el grupo del trabajo si no tiene tarea. El de la mañana (p_todos = false) no toca los
-- «no repartir»; el botón «Repartir lo que queda» (p_todos = true) reparte todo lo que está sin asignar.
create or replace function limpieza._repartir_lo_que_queda(p_empresa uuid, p_fecha date, p_todos boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare t record; elegido uuid; n int := 0;
begin
  create temp table if not exists _carga (persona_id uuid primary key, equipo_id uuid, grupos text[], minutos int) on commit drop;
  truncate _carga;
  insert into _carga select d.persona_id, d.equipo_id, d.grupos,
         coalesce((select sum(coalesce(x.minutos_est, 30)) from limpieza.trabajos x
                    where x.empresa_id = p_empresa and x.fecha = p_fecha and x.estado <> 'hecho' and d.persona_id = any(x.asignados)), 0)
    from limpieza._disponibles(p_empresa, p_fecha) d;
  for t in select x.id, x.equipo_id, x.minutos_est, coalesce(x.grupo, (select h.grupo from limpieza.tareas h where h.id = x.tarea_id)) as grupo
             from limpieza.trabajos x
            where x.empresa_id = p_empresa and x.fecha = p_fecha and x.estado = 'pendiente' and not x.todo_equipo and cardinality(x.asignados) = 0
              and (p_todos or not x.no_repartir)
            order by x.urgente desc, x.minutos_est desc nulls last, x.titulo loop
    select c.persona_id into elegido from _carga c
     where (t.grupo is null
            or not exists (select 1 from limpieza.personas lp where lp.empresa_id = p_empresa and t.grupo = any(lp.grupos))
            or t.grupo = any(c.grupos))
     order by (t.equipo_id is not null and c.equipo_id = t.equipo_id) desc, c.minutos, c.persona_id
     limit 1;
    continue when elegido is null;
    update limpieza.trabajos set asignados = array[elegido], aviso_reparto = coalesce(aviso_reparto || '; ', '') || 'Repartido solo' where id = t.id;
    update _carga set minutos = minutos + coalesce(t.minutos_est, 30) where persona_id = elegido;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function limpieza._repartir_lo_que_queda(p_empresa uuid, p_fecha date) returns int
language sql security definer set search_path = '' as $$ select limpieza._repartir_lo_que_queda(p_empresa, p_fecha, false) $$;

create or replace function limpieza.repartir_lo_que_queda(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) or limpieza.mi_equipo(p_empresa) is not null then raise exception 'NO_PERMISO'; end if;
  if p_fecha < current_date - 1 or p_fecha > current_date + 1 then raise exception 'FECHA_MAL'; end if;
  perform limpieza.generar_dia(p_empresa, p_fecha);
  perform limpieza._aplicar_ausencias(p_empresa, p_fecha);
  return limpieza._repartir_lo_que_queda(p_empresa, p_fecha, true);
end $$;

-- repartir a mano: soltar (sin nadie) lo deja para repartir a mano; dárselo a alguien lo vuelve normal
create or replace function limpieza._soltar_marca() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.asignados is distinct from old.asignados or new.todo_equipo is distinct from old.todo_equipo then
    if cardinality(new.asignados) = 0 and not new.todo_equipo and cardinality(coalesce(old.asignados, '{}')) > 0 and new.aviso_reparto is null
       and new.asignados_orig is null then
      new.no_repartir := true;                         -- lo soltó alguien a mano
    elsif cardinality(new.asignados) > 0 or new.todo_equipo then
      new.no_repartir := false;
    end if;
  end if;
  return new;
end $$;
create trigger soltar before update on limpieza.trabajos for each row execute function limpieza._soltar_marca();

-- ---------- el Excel del fin de semana ----------
-- p_items: [{titulo, lugar, descripcion, fecha, asignados: [uuid], minutos_est, urgente, activo_id, grupo}]
-- p_sin_persona: 'auto' (reparto automático) | 'encargado' (sin asignar, a mano) | 'equipo' (todo el equipo p_equipo)
create or replace function limpieza.importar(p_empresa uuid, p_items jsonb, p_sin_persona text, p_equipo uuid default null, p_archivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i jsonb; f date; asg uuid[]; n int := 0; dup int := 0; sinp int := 0; tit text; lug text; act uuid; hoy_repartido boolean := false;
begin
  if not nucleo.tiene_permiso('limpieza.excel.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if p_sin_persona not in ('auto', 'encargado', 'equipo') then raise exception 'REPARTO_MAL'; end if;
  if p_sin_persona = 'equipo' and not exists (select 1 from nucleo.equipos e where e.id = p_equipo and e.empresa_id = p_empresa) then raise exception 'FALTA_EQUIPO'; end if;
  if p_equipo is not null and not exists (select 1 from nucleo.equipos e where e.id = p_equipo and e.empresa_id = p_empresa) then raise exception 'FALTA_EQUIPO'; end if;
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' or jsonb_array_length(coalesce(p_items, '[]')) > 300 then raise exception 'DEMASIADAS'; end if;
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    tit := left(trim(coalesce(i ->> 'titulo', '')), 120);
    continue when tit = '';
    f := (i ->> 'fecha')::date;
    if f is null or f < current_date or f > current_date + 14 then raise exception 'FECHA_MAL'; end if;
    lug := nullif(left(trim(coalesce(i ->> 'lugar', '')), 120), '');
    if exists (select 1 from limpieza.trabajos x where x.empresa_id = p_empresa and x.fecha = f and lower(x.titulo) = lower(tit)
                and coalesce(lower(x.lugar), '') = coalesce(lower(lug), '')) then
      dup := dup + 1; continue;
    end if;
    asg := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(i -> 'asignados', '[]')) x);
    if exists (select 1 from unnest(asg) x where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = p_empresa)) then
      raise exception 'PERSONA_DE_OTRA_UNIDAD';
    end if;
    act := nullif(i ->> 'activo_id', '')::uuid;
    if act is not null and not exists (select 1 from nucleo.activos a where a.id = act and a.empresa_id = p_empresa) then act := null; end if;
    insert into limpieza.trabajos (empresa_id, fecha, clase, titulo, descripcion, lugar, activo_id, minutos_est, equipo_id, asignados, todo_equipo,
                                   no_repartir, urgente, grupo, origen, creado_por)
    values (p_empresa, f, 'suelto', tit, nullif(left(trim(coalesce(i ->> 'descripcion', '')), 1000), ''), lug, act,
            case when (i ->> 'minutos_est') ~ '^\d{1,4}$' and (i ->> 'minutos_est')::int between 1 and 1440 then (i ->> 'minutos_est')::int end,
            p_equipo, asg, cardinality(asg) = 0 and p_sin_persona = 'equipo', cardinality(asg) = 0 and p_sin_persona = 'encargado',
            coalesce((i ->> 'urgente')::boolean, false), nullif(left(trim(coalesce(i ->> 'grupo', '')), 40), ''),
            left('excel' || coalesce(': ' || nullif(trim(p_archivo), ''), ''), 200), null);
    n := n + 1;
    if cardinality(asg) = 0 and p_sin_persona <> 'equipo' then sinp := sinp + 1; end if;
    if f = current_date then hoy_repartido := true; end if;
  end loop;
  -- si es para hoy y el reparto de la mañana ya pasó, se reparte ahora lo que toca
  if hoy_repartido and p_sin_persona = 'auto' and exists (select 1 from limpieza.repartos r where r.empresa_id = p_empresa and r.fecha = current_date) then
    perform limpieza._repartir_lo_que_queda(p_empresa, current_date);
  end if;
  return jsonb_build_object('creados', n, 'repetidos', dup, 'sin_persona', sinp);
end $$;

-- cambiar de día un trabajo que aún no está hecho (el encargado, sábado ↔ domingo)
create or replace function limpieza.cambiar_dia(p_trabajo uuid, p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos;
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not nucleo.tiene_permiso('limpieza.trabajo.repartir', t.empresa_id) or not limpieza._de_mi_equipo(t) then raise exception 'NO_PERMISO'; end if;
  if t.estado = 'hecho' then raise exception 'YA_HECHO'; end if;
  if t.clase = 'fija' then raise exception 'ES_FIJA'; end if;
  if p_fecha is null or p_fecha < current_date or p_fecha > current_date + 14 then raise exception 'FECHA_MAL'; end if;
  update limpieza.trabajos set fecha = p_fecha where id = p_trabajo;
end $$;

-- ---------- instrucciones para el encargado ----------
create table limpieza.instrucciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  desde       date not null,
  hasta       date not null,
  titulo      text not null check (length(titulo) between 1 and 120),
  texto       text check (texto is null or length(texto) <= 4000),
  leido_en    timestamptz,
  leido_por   uuid,
  anulado     timestamptz,
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  check (hasta >= desde and hasta - desde <= 62)
);
create index on limpieza.instrucciones (empresa_id, hasta);
comment on table limpieza.instrucciones is 'Instrucciones del administrador para el encargado (los «traspasos» de la app vieja). Si se cambian, vuelven a «sin leer».';

create or replace function limpieza._instruccion_cambia() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.titulo, new.texto, new.desde, new.hasta) is distinct from (old.titulo, old.texto, old.desde, old.hasta) then
    new.leido_en := null; new.leido_por := null;
  end if;
  return new;
end $$;
create trigger cambia before update on limpieza.instrucciones for each row execute function limpieza._instruccion_cambia();

create or replace function limpieza.instruccion_leida(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare x limpieza.instrucciones;
begin
  select * into x from limpieza.instrucciones where id = p_id;
  if not found or not nucleo.tiene_permiso('limpieza.trabajo.repartir', x.empresa_id) or limpieza.mi_equipo(x.empresa_id) is not null then raise exception 'NO_PERMISO'; end if;
  if nucleo.tiene_permiso('limpieza.excel.editar', x.empresa_id) then return; end if;   -- el administrador no la marca como leída
  update limpieza.instrucciones set leido_en = coalesce(leido_en, now()), leido_por = coalesce(leido_por, auth.uid()) where id = p_id and leido_en is null;
end $$;

-- ---------- checklist del encargado (una por día) ----------
create table limpieza.revisiones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  fecha       date not null,
  items       jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  nota        text check (nota is null or length(nota) <= 2000),
  hecho_por   uuid,
  actualizado timestamptz not null default now(),
  cerrado     timestamptz,
  origen      text,
  unique (empresa_id, fecha)
);
comment on table limpieza.revisiones is 'Checklist del encargado de cada día: items [{plantilla, texto, tipo, estado bien|mal, valor, nota, foto}]. cerrado = enviada.';

-- los puntos de hoy: las checklists «del encargado»
create or replace function limpieza.puntos_encargado(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) then raise exception 'NO_PERMISO'; end if;
  return coalesce((select jsonb_agg(p || jsonb_build_object('plantilla', pl.nombre) order by pl.orden, pl.nombre, o)
                     from limpieza.plantillas pl, jsonb_array_elements(pl.puntos) with ordinality as x(p, o)
                    where pl.empresa_id = p_empresa and pl.cuando = 'encargado' and pl.baja is null), '[]'::jsonb);
end $$;

create or replace function limpieza.guardar_revision(p_empresa uuid, p_fecha date, p_items jsonb, p_nota text, p_cerrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r limpieza.revisiones; it jsonb; pt jsonb; pts jsonb;
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) or limpieza.mi_equipo(p_empresa) is not null then raise exception 'NO_PERMISO'; end if;
  if p_fecha is null or p_fecha < current_date - 7 or p_fecha > current_date then raise exception 'FECHA_MAL'; end if;
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' or jsonb_array_length(coalesce(p_items, '[]')) > 200 or length(p_items::text) > 200000 then raise exception 'CHECKLIST_MAL'; end if;
  select * into r from limpieza.revisiones where empresa_id = p_empresa and fecha = p_fecha for update;
  if found and r.cerrado is not null and not nucleo.tiene_permiso('limpieza.plan.editar', p_empresa) then raise exception 'YA_CERRADA'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    if coalesce(it ->> 'estado', '') not in ('bien', 'mal') or coalesce(it ->> 'texto', '') = '' then raise exception 'CHECKLIST_MAL'; end if;
    if it ->> 'foto' is not null and (it ->> 'foto') not like p_empresa || '/revisiones/' || p_fecha || '/%' then raise exception 'FOTO_MAL'; end if;
  end loop;
  if coalesce(p_cerrar, false) then
    pts := limpieza.puntos_encargado(p_empresa);
    for pt in select * from jsonb_array_elements(pts) loop
      select x into it from jsonb_array_elements(p_items) x where x ->> 'plantilla' = pt ->> 'plantilla' and x ->> 'texto' = pt ->> 'texto' limit 1;
      if it is null then raise exception 'FALTA_PUNTO: %', pt ->> 'texto'; end if;
      if it ->> 'estado' = 'mal' and coalesce(pt ->> 'tipo', 'ok') = 'ok' and coalesce(trim(it ->> 'nota'), '') = '' and it ->> 'foto' is null then
        raise exception 'FALTA_EXPLICAR: %', pt ->> 'texto';
      end if;
      if it ->> 'estado' = 'mal' and coalesce((pt ->> 'foto_si_mal')::boolean, false) and it ->> 'foto' is null then raise exception 'FOTO_FALTA: %', pt ->> 'texto'; end if;
    end loop;
  end if;
  insert into limpieza.revisiones (empresa_id, fecha, items, nota, hecho_por, cerrado)
  values (p_empresa, p_fecha, coalesce(p_items, '[]'), nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), case when p_cerrar then now() end)
  on conflict (empresa_id, fecha) do update set items = excluded.items, nota = excluded.nota, hecho_por = excluded.hecho_por,
     cerrado = case when p_cerrar then now() else limpieza.revisiones.cerrado end, actualizado = now();
end $$;

-- fotos de la checklist: <empresa>/revisiones/<fecha>/<archivo>
create policy limpieza_revision_ver on storage.objects for select to authenticated using (
  bucket_id = 'limpieza' and split_part(name, '/', 2) = 'revisiones' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and nucleo.tiene_permiso('limpieza.trabajo.repartir', split_part(name, '/', 1)::uuid));
create policy limpieza_revision_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'limpieza' and split_part(name, '/', 2) = 'revisiones' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and nucleo.tiene_permiso('limpieza.trabajo.repartir', split_part(name, '/', 1)::uuid)
  and limpieza.mi_equipo(split_part(name, '/', 1)::uuid) is null);

-- ---------- permisos y seguridad ----------
grant select, insert, update on limpieza.instrucciones to authenticated;
grant select on limpieza.revisiones to authenticated;
grant all on limpieza.instrucciones, limpieza.revisiones to service_role;
alter table limpieza.instrucciones enable row level security;
alter table limpieza.revisiones enable row level security;
create policy ver on limpieza.instrucciones for select to authenticated using (
  nucleo.tiene_permiso('limpieza.excel.editar', empresa_id)
  or (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null and anulado is null));
create policy crear on limpieza.instrucciones for insert to authenticated with check (nucleo.tiene_permiso('limpieza.excel.editar', empresa_id));
create policy cambiar on limpieza.instrucciones for update to authenticated
  using (nucleo.tiene_permiso('limpieza.excel.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.excel.editar', empresa_id));
create policy ver on limpieza.revisiones for select to authenticated using (
  nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null);
do $$ begin
  perform nucleo.activar_historial('limpieza.instrucciones');
  perform nucleo.activar_historial('limpieza.revisiones');
end $$;

grant execute on function limpieza.importar(uuid, jsonb, text, uuid, text), limpieza.cambiar_dia(uuid, date), limpieza.instruccion_leida(uuid),
  limpieza.puntos_encargado(uuid), limpieza.guardar_revision(uuid, date, jsonb, text, boolean), limpieza.es_mio(limpieza.trabajos) to authenticated;
revoke execute on function limpieza._soltar_marca(), limpieza._instruccion_cambia(), limpieza._repartir_lo_que_queda(uuid, date),
  limpieza._repartir_lo_que_queda(uuid, date, boolean) from public, authenticated;
