-- =====================================================================================
-- 0028 · FESTIVOS EN LAS AUSENCIAS Y RESPONSABLES CON SU EQUIPO (lo que faltaba de la parte 4)
-- 1) Festivos. Los calendarios de Personal son por persona: Personal deja en nucleo.ausencias, para cada persona de un
--    calendario, sus días festivo, cierre y descanso (motivo «festivo»). Limpieza ya mira las ausencias, así que:
--     · una tarea fija no sale el día en que toda su gente tiene festivo (como en la app vieja);
--     · quien tiene festivo no entra en el reparto ese día, y si solo lo tiene una parte, se trata como una falta.
-- 2) Responsables (Encargado hornos), decidido por Cristian (15/11): el responsable solo ve los trabajos de su equipo
--    (más los sin asignar de los grupos que sabe hacer su equipo), los puede mover entre ellos, crearles trabajos y dejar
--    uno «Sin asignar» para que lo reparta el administrador. No reparte lo que queda ni apunta sustitutos.
--    Repartir a mano ahora también permite dejar un trabajo sin asignar (a todos).
-- =====================================================================================

-- ---------- 1) festivos ----------
alter table nucleo.ausencias drop constraint ausencias_motivo_check;
alter table nucleo.ausencias add constraint ausencias_motivo_check check (motivo in ('vacaciones', 'baja', 'permiso', 'otro', 'festivo'));
comment on table nucleo.ausencias is 'Quién falta y cuándo (copia de lo que se apunta en Personal: vacaciones, faltas de «Horas del día» y '
  'los festivos, cierres y descansos de su calendario). origen = de dónde sale. Solo la escriben los disparadores.';

create or replace function nucleo.ausencia(p_persona uuid, p_fecha date) returns text
language sql stable security definer set search_path = '' as $$
  select a.motivo from nucleo.ausencias a where a.persona_id = p_persona and p_fecha between a.desde and a.hasta
   order by case a.motivo when 'festivo' then 0 when 'baja' then 1 when 'vacaciones' then 2 when 'permiso' then 3 else 4 end limit 1
$$;

-- vuelve a copiar los días sin trabajo de un calendario para su gente
create or replace function personal._festivos_de(p_calendario uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_calendario is null then return; end if;
  delete from nucleo.ausencias where origen like 'personal.calendario:' || p_calendario || ':%';
  insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen)
  select d.empresa_id, cp.persona_id, d.fecha, d.fecha, 'festivo', 'personal.calendario:' || p_calendario || ':' || d.fecha || ':' || cp.persona_id
    from personal.dias d
    join personal.calendario_personas cp on cp.calendario_id = d.calendario_id and cp.anio = extract(year from d.fecha)::int
   where d.calendario_id = p_calendario and d.tipo in ('festivo', 'cierre', 'descanso')
  on conflict (origen) do nothing;
end $$;
create or replace function personal._festivos_disparador() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform personal._festivos_de(old.calendario_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.calendario_id is distinct from old.calendario_id) then perform personal._festivos_de(new.calendario_id); end if;
  return null;
end $$;
create trigger festivos after insert or update or delete on personal.dias for each row execute function personal._festivos_disparador();
create trigger festivos after insert or update or delete on personal.calendario_personas for each row execute function personal._festivos_disparador();
revoke execute on function personal._festivos_de(uuid), personal._festivos_disparador() from public, authenticated;
do $$ declare c uuid; begin
  for c in select id from personal.calendarios loop perform personal._festivos_de(c); end loop;
end $$;

-- ¿sale la tarea fija ese día? No, si toda su gente (los asignados o, si no hay, su equipo) tiene festivo.
create or replace function limpieza._fija_sale(t limpieza.tareas, p_fecha date) returns boolean
language sql stable security definer set search_path = '' as $$
  with gente as (
    select x as id from unnest(t.asignados) x where not t.todo_equipo
    union
    select p.id from nucleo.personas p
     where (t.todo_equipo or cardinality(t.asignados) = 0) and p.empresa_id = t.empresa_id and p.equipo_id = t.equipo_id
       and (p.baja is null or p.baja::date > p_fecha))
  select not exists (select 1 from gente) or exists (select 1 from gente g where nucleo.ausencia(g.id, p_fecha) is distinct from 'festivo')
$$;

create or replace function limpieza.generar_dia(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_fecha < current_date - 1 then return 0; end if;
  insert into limpieza.trabajos (empresa_id, fecha, clase, tarea_id, titulo, descripcion, lugar, ubicacion_id, activo_id, minutos_est,
                                 equipo_id, turno_id, asignados, todo_equipo, creado_por)
  select t.empresa_id, p_fecha, 'fija', t.id, t.titulo, t.descripcion, t.lugar, t.ubicacion_id, t.activo_id, t.minutos_est,
         t.equipo_id, t.turno_id, t.asignados, t.todo_equipo, null
    from limpieza.tareas t
   where t.empresa_id = p_empresa and t.clase = 'fija' and t.baja is null and extract(dow from p_fecha)::int = any(t.dias)
     and limpieza._fija_sale(t, p_fecha)
  on conflict (tarea_id, fecha) where clase = 'fija' do nothing;
  get diagnostics n = row_count;
  if p_fecha between current_date - 1 and current_date + 1 then
    perform limpieza._aplicar_ausencias(p_empresa, p_fecha);
    if p_fecha <= current_date and not exists (select 1 from limpieza.repartos r where r.empresa_id = p_empresa and r.fecha = p_fecha) then
      insert into limpieza.repartos (empresa_id, fecha) values (p_empresa, p_fecha) on conflict do nothing;
      perform limpieza._repartir_lo_que_queda(p_empresa, p_fecha);
    end if;
  end if;
  return n;
end $$;

-- ---------- 2) responsables con su equipo ----------
create table limpieza.responsables (
  persona_id  uuid primary key,
  empresa_id  uuid not null references nucleo.empresas(id),
  operarios   uuid[] not null check (cardinality(operarios) between 1 and 50),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table limpieza.responsables is 'Responsables con su equipo (p. ej. Encargado hornos): solo ven y reparten los trabajos de estos operarios.';
create or replace function limpieza._responsable_valido() returns trigger language plpgsql set search_path = '' as $$
begin
  new.operarios := array(select distinct x from unnest(new.operarios) x where x <> new.persona_id order by 1);
  if cardinality(new.operarios) = 0 then raise exception 'FALTA_QUIEN'; end if;
  if exists (select 1 from unnest(new.operarios) x where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = new.empresa_id)) then
    raise exception 'PERSONA_DE_OTRA_UNIDAD';
  end if;
  return new;
end $$;
create trigger valido before insert or update on limpieza.responsables for each row execute function limpieza._responsable_valido();

-- el equipo de quien entra (null = no es responsable de un equipo: ve y reparte todo lo que le dejen sus permisos)
create or replace function limpieza.mi_equipo(p_empresa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select r.operarios from limpieza.responsables r where r.empresa_id = p_empresa and r.persona_id = limpieza.mi_persona()
$$;

-- ¿es este trabajo de mi equipo? (siempre sí si no soy responsable de un equipo)
create or replace function limpieza._de_mi_equipo(t limpieza.trabajos) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare eq uuid[] := limpieza.mi_equipo(t.empresa_id);
begin
  if eq is null then return true; end if;
  return limpieza.es_mio(t) or t.asignados && eq or coalesce(t.asignados_orig, '{}') && eq
      or (not t.todo_equipo and cardinality(t.asignados) = 0 and exists (
            select 1 from limpieza.tareas h where h.id = t.tarea_id and h.grupo is not null
               and exists (select 1 from limpieza.personas lp where lp.persona_id = any(eq) and h.grupo = any(lp.grupos))));
end $$;

create or replace function limpieza.puedo_ver(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select (nucleo.tiene_permiso('limpieza.trabajo.ver', t.empresa_id) and limpieza._de_mi_equipo(t))
      or (limpieza.es_mio(t) and nucleo.tiene_permiso('limpieza.trabajo.apuntar', t.empresa_id))
$$;
create or replace function limpieza.puedo_apuntar(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select (nucleo.tiene_permiso('limpieza.trabajo.corregir', t.empresa_id) and limpieza._de_mi_equipo(t))
      or (limpieza.es_mio(t) and nucleo.tiene_permiso('limpieza.trabajo.apuntar', t.empresa_id))
$$;

-- Repartir a mano: también dejar sin asignar; el responsable, solo dentro de su equipo.
create or replace function limpieza.repartir(p_trabajo uuid, p_personas uuid[], p_todo_equipo boolean default false, p_equipo uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos; eq uuid; mio uuid[];
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not nucleo.tiene_permiso('limpieza.trabajo.repartir', t.empresa_id) or not limpieza._de_mi_equipo(t) then raise exception 'NO_PERMISO'; end if;
  if t.estado = 'hecho' then raise exception 'YA_HECHO'; end if;
  p_personas := array(select distinct unnest(coalesce(p_personas, '{}')));
  if cardinality(p_personas) > 50 then raise exception 'DEMASIADAS'; end if;
  mio := limpieza.mi_equipo(t.empresa_id);
  if mio is not null and (coalesce(p_todo_equipo, false) or not p_personas <@ mio) then raise exception 'FUERA_DE_TU_EQUIPO'; end if;
  if exists (select 1 from unnest(p_personas) x where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = t.empresa_id)) then
    raise exception 'PERSONA_DE_OTRA_UNIDAD';
  end if;
  eq := coalesce(p_equipo, t.equipo_id);
  if p_todo_equipo and (eq is null or not exists (select 1 from nucleo.equipos e where e.id = eq and e.empresa_id = t.empresa_id)) then
    raise exception 'FALTA_EQUIPO';
  end if;
  update limpieza.trabajos set asignados = case when p_todo_equipo then '{}' else p_personas end,
         todo_equipo = coalesce(p_todo_equipo, false), equipo_id = case when p_todo_equipo then eq else t.equipo_id end,
         asignados_orig = null, aviso_reparto = null
   where id = p_trabajo;
end $$;

-- Crear un trabajo: igual que antes; el responsable solo para su equipo.
create or replace function limpieza.crear_trabajo(p_empresa uuid, p_fecha date, p_tarea uuid default null, p_titulo text default null,
                                                  p_activo uuid default null, p_nota text default null, p_para uuid[] default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h limpieza.tareas; yo uuid := limpieza.mi_persona(); quien uuid[]; nuevo uuid; mio uuid[] := limpieza.mi_equipo(p_empresa);
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  quien := array(select distinct unnest(coalesce(p_para, case when yo is null then '{}'::uuid[] else array[yo] end)));
  if cardinality(quien) = 0 and yo is null and p_para is null then raise exception 'SIN_FICHA'; end if;
  if not cardinality(quien) between 1 and 50 then raise exception 'FALTA_QUIEN'; end if;
  if not (yo is not null and quien = array[yo]) then
    if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) then raise exception 'NO_PERMISO'; end if;
    if mio is not null and not quien <@ mio then raise exception 'FUERA_DE_TU_EQUIPO'; end if;
  end if;
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

create or replace function limpieza.repartir_lo_que_queda(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) or limpieza.mi_equipo(p_empresa) is not null then raise exception 'NO_PERMISO'; end if;
  if p_fecha < current_date - 1 or p_fecha > current_date + 1 then raise exception 'FECHA_MAL'; end if;
  perform limpieza.generar_dia(p_empresa, p_fecha);
  perform limpieza._aplicar_ausencias(p_empresa, p_fecha);
  return limpieza._repartir_lo_que_queda(p_empresa, p_fecha);
end $$;

-- Plan de la semana: sin las fijas que no salen por festivo; el responsable solo ve lo de su equipo.
create or replace function limpieza.semana(p_empresa uuid, p_lunes date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mio uuid[] := limpieza.mi_equipo(p_empresa);
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.ver', p_empresa) then raise exception 'NO_PERMISO'; end if;
  return (
    with dias as (select (p_lunes + i)::date as f from generate_series(0, 6) i),
    t as (
      select x.fecha, x.id, x.titulo, x.minutos_est, x.estado, x.asignados, x.todo_equipo, x.equipo_id, false as previsto, x.aviso_reparto
        from limpieza.trabajos x where x.empresa_id = p_empresa and x.fecha between p_lunes and p_lunes + 6 and limpieza._de_mi_equipo(x)
      union all
      select d.f, null, tf.titulo, tf.minutos_est, 'pendiente', limpieza._con_ausencias(p_empresa, d.f, tf.asignados), tf.todo_equipo, tf.equipo_id, true, null
        from dias d join limpieza.tareas tf on tf.empresa_id = p_empresa and tf.clase = 'fija' and tf.baja is null and extract(dow from d.f)::int = any(tf.dias)
       where d.f >= current_date and limpieza._fija_sale(tf, d.f)
         and not exists (select 1 from limpieza.trabajos x where x.tarea_id = tf.id and x.fecha = d.f)
         and (mio is null or tf.asignados && mio
              or (cardinality(tf.asignados) = 0 and not tf.todo_equipo and tf.grupo is not null
                  and exists (select 1 from limpieza.personas lp where lp.persona_id = any(mio) and tf.grupo = any(lp.grupos))))),
    gente as (
      select p.id, p.nombre, p.horario from nucleo.personas p
       where p.empresa_id = p_empresa and p.baja is null and (mio is null or p.id = any(mio))
         and (exists (select 1 from limpieza.personas lp where lp.persona_id = p.id and lp.en_reparto)
              or exists (select 1 from t where p.id = any(t.asignados))))
    select jsonb_agg(jsonb_build_object(
      'fecha', d.f,
      'trabajos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'minutos_est', t.minutos_est, 'estado', t.estado,
                     'previsto', t.previsto, 'todo_equipo', t.todo_equipo, 'aviso', t.aviso_reparto,
                     'equipo', (select e.nombre from nucleo.equipos e where e.id = t.equipo_id),
                     'nombres', (select coalesce(jsonb_agg(p.nombre order by p.nombre), '[]'::jsonb) from nucleo.personas p where p.id = any(t.asignados)))
                   order by t.titulo) from t where t.fecha = d.f), '[]'::jsonb),
      'personas', coalesce((select jsonb_agg(jsonb_build_object('persona_id', g.id, 'nombre', g.nombre,
                     'horario_min', (nucleo.horas_horario(g.horario, extract(dow from d.f)::int) * 60)::int,
                     'ausencia', nucleo.ausencia(g.id, d.f),
                     'trabajo_min', coalesce((select sum(coalesce(t.minutos_est, 30)) from t where t.fecha = d.f and g.id = any(t.asignados)), 0))
                   order by g.nombre) from gente g), '[]'::jsonb)
    ) order by d.f) from dias d);
end $$;

-- ---------- permisos y seguridad ----------
grant select, insert, update, delete on limpieza.responsables to authenticated;
grant all on limpieza.responsables to service_role;
alter table limpieza.responsables enable row level security;
create policy ver on limpieza.responsables for select to authenticated using (
  nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or persona_id = limpieza.mi_persona());
create policy crear on limpieza.responsables for insert to authenticated with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy cambiar on limpieza.responsables for update to authenticated
  using (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy borrar on limpieza.responsables for delete to authenticated using (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
do $$ begin perform nucleo.activar_historial('limpieza.responsables'); end $$;

-- el responsable de un equipo no ve ni apunta sustitutos (son de toda la unidad)
drop policy ver on limpieza.sustituciones;
drop policy crear on limpieza.sustituciones;
drop policy cambiar on limpieza.sustituciones;
drop policy borrar on limpieza.sustituciones;
create policy ver on limpieza.sustituciones for select to authenticated using (
  (nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id)) and limpieza.mi_equipo(empresa_id) is null);
create policy crear on limpieza.sustituciones for insert to authenticated with check (
  nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null);
create policy cambiar on limpieza.sustituciones for update to authenticated
  using (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null)
  with check (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null);
create policy borrar on limpieza.sustituciones for delete to authenticated using (
  nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id) and limpieza.mi_equipo(empresa_id) is null);

grant execute on function limpieza.mi_equipo(uuid), limpieza.puedo_ver(limpieza.trabajos), limpieza.puedo_apuntar(limpieza.trabajos) to authenticated;
revoke execute on function limpieza._fija_sale(limpieza.tareas, date), limpieza._de_mi_equipo(limpieza.trabajos), limpieza.generar_dia(uuid, date),
  limpieza._responsable_valido() from public, authenticated;
