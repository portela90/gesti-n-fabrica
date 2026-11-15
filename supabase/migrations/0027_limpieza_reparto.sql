-- =====================================================================================
-- 0027 · LIMPIEZA · FALTAS, SUSTITUTOS, REPARTO AUTOMÁTICO Y PLAN DE LA SEMANA (resto de la parte 4)
-- Decidido por Cristian (15/11):
--  · Si alguien falta (nucleo.ausencias, que llena Personal) y tiene sustituto apuntado, el sustituto se lleva sus
--    trabajos; si no, van a «Sin asignar».
--  · Lo que queda sin asignar se reparte solo cada mañana (la primera vez que alguien abre el día) entre los que
--    trabajan ese día: en el reparto, con horario ese día y sin faltar; a partes iguales por minutos previstos.
--    Se puede cambiar a mano después, y hay un botón para volver a repartir lo que quede.
--  · Cada persona tiene los grupos que sabe hacer («hornos»…): si alguien tiene un grupo, los trabajos de ese grupo
--    solo van a quien lo tenga.
--  · Plan de la semana: cada día con sus trabajos (los de días que aún no han llegado, previstos desde las tareas
--    fijas) y las horas de trabajo de cada persona frente a las de su horario.
-- Solo depende del núcleo (personas, horario, ausencias).
-- =====================================================================================

-- ---------- quién entra en el reparto y qué sabe hacer ----------
create table limpieza.personas (
  persona_id  uuid primary key,
  empresa_id  uuid not null references nucleo.empresas(id),
  en_reparto  boolean not null default true,
  grupos      text[] not null default '{}' check (cardinality(grupos) <= 20),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table limpieza.personas is 'Lo de Limpieza de cada trabajador: si entra en el reparto automático y qué grupos de trabajo sabe hacer (hornos…).';

-- ---------- quién cubre a quién ----------
create table limpieza.sustituciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  ausente     uuid not null,
  sustituto   uuid not null,
  desde       date not null,
  hasta       date not null,
  nota        text check (nota is null or length(nota) <= 200),
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  check (hasta >= desde and hasta - desde <= 366 and ausente <> sustituto),
  foreign key (empresa_id, ausente) references nucleo.personas(empresa_id, id),
  foreign key (empresa_id, sustituto) references nucleo.personas(empresa_id, id)
);
create index on limpieza.sustituciones (empresa_id, desde, hasta);
comment on table limpieza.sustituciones is 'Quién cubre a quién de desde a hasta: si el ausente falta (nucleo.ausencias), sus trabajos se los lleva el sustituto.';

-- ---------- lo que cambia en los trabajos ----------
alter table limpieza.trabajos add column asignados_orig uuid[], add column aviso_reparto text check (aviso_reparto is null or length(aviso_reparto) <= 200);
comment on column limpieza.trabajos.asignados_orig is 'A quién le tocaba antes de quitar a los que faltan (si se quitó a alguien).';
comment on column limpieza.trabajos.aviso_reparto is 'Qué hizo el reparto: «Cubre a …», «Faltaba …», «Repartido solo».';

create table limpieza.repartos (
  empresa_id  uuid not null references nucleo.empresas(id),
  fecha       date not null,
  hecho_en    timestamptz not null default now(),
  primary key (empresa_id, fecha)
);
comment on table limpieza.repartos is 'Días en los que ya se hizo el reparto automático de la mañana (una vez por día).';

-- ---------- quién trabaja y quién cubre a quién un día ----------
create or replace function limpieza._sustituto(p_empresa uuid, p_persona uuid, p_fecha date) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.sustituto from limpieza.sustituciones s
   where s.empresa_id = p_empresa and s.ausente = p_persona and p_fecha between s.desde and s.hasta and nucleo.ausencia(s.sustituto, p_fecha) is null
   order by s.creado desc limit 1
$$;

-- a quién le toca de verdad: los que faltan se cambian por su sustituto (o se quitan)
create or replace function limpieza._con_ausencias(p_empresa uuid, p_fecha date, p_asignados uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct q) filter (where q is not null), '{}')
    from (select case when nucleo.ausencia(x, p_fecha) is null then x else limpieza._sustituto(p_empresa, x, p_fecha) end q
            from unnest(p_asignados) x) y
$$;

-- los que trabajan ese día y entran en el reparto (con horario ese día, o porque cubren a alguien), sin faltar
create or replace function limpieza._disponibles(p_empresa uuid, p_fecha date) returns table (persona_id uuid, equipo_id uuid, grupos text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.equipo_id, lp.grupos
    from nucleo.personas p join limpieza.personas lp on lp.persona_id = p.id and lp.en_reparto
   where p.empresa_id = p_empresa and (p.baja is null or p.baja::date > p_fecha) and nucleo.ausencia(p.id, p_fecha) is null
     and (nucleo.horas_horario(p.horario, extract(dow from p_fecha)::int) > 0
          or exists (select 1 from limpieza.sustituciones s where s.empresa_id = p_empresa and s.sustituto = p.id and p_fecha between s.desde and s.hasta))
$$;

-- Quita a los que faltan de los trabajos del día que aún no se han empezado. También vuelve a mirar los que se
-- quedaron sin nadie por una falta (por si después se apuntó un sustituto).
create or replace function limpieza._aplicar_ausencias(p_empresa uuid, p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos; base uuid[]; nuevos uuid[]; aviso text;
begin
  for t in select * from limpieza.trabajos where empresa_id = p_empresa and fecha = p_fecha and estado = 'pendiente' and not todo_equipo
              and ((asignados_orig is null and cardinality(asignados) > 0) or (asignados_orig is not null and cardinality(asignados) = 0)) loop
    base := coalesce(t.asignados_orig, t.asignados);
    nuevos := limpieza._con_ausencias(p_empresa, p_fecha, base);
    if nuevos is distinct from t.asignados then
      select string_agg(case when s is null then 'Falta ' || p.nombre else (select n.nombre from nucleo.personas n where n.id = s) || ' cubre a ' || p.nombre end, '; ')
        into aviso
        from (select x, limpieza._sustituto(p_empresa, x, p_fecha) s from unnest(base) x where nucleo.ausencia(x, p_fecha) is not null) y
        join nucleo.personas p on p.id = y.x;
      update limpieza.trabajos set asignados_orig = base, asignados = nuevos, aviso_reparto = left(aviso, 200) where id = t.id;
    end if;
  end loop;
end $$;

-- Repartir a mano (de la 0025): igual, y borra el aviso del reparto, que ya no vale.
create or replace function limpieza.repartir(p_trabajo uuid, p_personas uuid[], p_todo_equipo boolean default false, p_equipo uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos; eq uuid;
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not nucleo.tiene_permiso('limpieza.trabajo.repartir', t.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if t.estado = 'hecho' then raise exception 'YA_HECHO'; end if;
  p_personas := array(select distinct unnest(coalesce(p_personas, '{}')));
  if cardinality(p_personas) > 50 then raise exception 'DEMASIADAS'; end if;
  if not coalesce(p_todo_equipo, false) and cardinality(p_personas) = 0 then raise exception 'FALTA_QUIEN'; end if;
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

-- Reparte lo que está sin asignar entre los disponibles, a partes iguales por minutos previstos (30 si no tiene).
create or replace function limpieza._repartir_lo_que_queda(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
declare t record; elegido uuid; n int := 0;
begin
  create temp table if not exists _carga (persona_id uuid primary key, equipo_id uuid, grupos text[], minutos int) on commit drop;
  truncate _carga;
  insert into _carga select d.persona_id, d.equipo_id, d.grupos,
         coalesce((select sum(coalesce(x.minutos_est, 30)) from limpieza.trabajos x
                    where x.empresa_id = p_empresa and x.fecha = p_fecha and x.estado <> 'hecho' and d.persona_id = any(x.asignados)), 0)
    from limpieza._disponibles(p_empresa, p_fecha) d;
  for t in select x.id, x.equipo_id, x.minutos_est, (select h.grupo from limpieza.tareas h where h.id = x.tarea_id) as grupo
             from limpieza.trabajos x
            where x.empresa_id = p_empresa and x.fecha = p_fecha and x.estado = 'pendiente' and not x.todo_equipo and cardinality(x.asignados) = 0
            order by x.minutos_est desc nulls last, x.titulo loop
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

-- Sacar el día: las fijas, quitar a los que faltan y, la primera vez de hoy, repartir lo que queda.
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

-- El botón «Repartir lo que queda» (administrador y encargado)
create or replace function limpieza.repartir_lo_que_queda(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.repartir', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if p_fecha < current_date - 1 or p_fecha > current_date + 1 then raise exception 'FECHA_MAL'; end if;
  perform limpieza.generar_dia(p_empresa, p_fecha);
  perform limpieza._aplicar_ausencias(p_empresa, p_fecha);
  return limpieza._repartir_lo_que_queda(p_empresa, p_fecha);
end $$;

-- ---------- plan de la semana ----------
-- De lunes a domingo: los trabajos de cada día (los que ya han salido y, de los días que no han llegado, lo previsto
-- desde las tareas fijas, con los que faltan ya cambiados) y por persona los minutos de trabajo frente a su horario.
create or replace function limpieza.semana(p_empresa uuid, p_lunes date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.ver', p_empresa) then raise exception 'NO_PERMISO'; end if;
  return (
    with dias as (select (p_lunes + i)::date as f from generate_series(0, 6) i),
    t as (
      select x.fecha, x.id, x.titulo, x.minutos_est, x.estado, x.asignados, x.todo_equipo, x.equipo_id, false as previsto, x.aviso_reparto
        from limpieza.trabajos x where x.empresa_id = p_empresa and x.fecha between p_lunes and p_lunes + 6
      union all
      select d.f, null, tf.titulo, tf.minutos_est, 'pendiente', limpieza._con_ausencias(p_empresa, d.f, tf.asignados), tf.todo_equipo, tf.equipo_id, true, null
        from dias d join limpieza.tareas tf on tf.empresa_id = p_empresa and tf.clase = 'fija' and tf.baja is null and extract(dow from d.f)::int = any(tf.dias)
       where d.f >= current_date
         and not exists (select 1 from limpieza.trabajos x where x.tarea_id = tf.id and x.fecha = d.f)),
    gente as (
      select p.id, p.nombre, p.horario from nucleo.personas p
       where p.empresa_id = p_empresa and p.baja is null
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
grant select, insert, update on limpieza.personas to authenticated;
grant select, insert, update, delete on limpieza.sustituciones to authenticated;
grant select on limpieza.repartos to authenticated;
grant all on limpieza.personas, limpieza.sustituciones, limpieza.repartos to service_role;
alter table limpieza.personas enable row level security;
alter table limpieza.sustituciones enable row level security;
alter table limpieza.repartos enable row level security;
create policy ver on limpieza.personas for select to authenticated using (
  nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id));
create policy crear on limpieza.personas for insert to authenticated with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy cambiar on limpieza.personas for update to authenticated
  using (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy ver on limpieza.sustituciones for select to authenticated using (
  nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id));
create policy crear on limpieza.sustituciones for insert to authenticated with check (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id));
create policy cambiar on limpieza.sustituciones for update to authenticated
  using (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id)) with check (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id));
create policy borrar on limpieza.sustituciones for delete to authenticated using (nucleo.tiene_permiso('limpieza.trabajo.repartir', empresa_id));
create policy ver on limpieza.repartos for select to authenticated using (nucleo.tiene_permiso('limpieza.trabajo.ver', empresa_id));
do $$ begin
  perform nucleo.activar_historial('limpieza.personas');
  perform nucleo.activar_historial('limpieza.sustituciones');
end $$;

grant execute on function limpieza.repartir_lo_que_queda(uuid, date), limpieza.semana(uuid, date), limpieza.repartir(uuid, uuid[], boolean, uuid) to authenticated;
revoke execute on function limpieza._sustituto(uuid, uuid, date), limpieza._con_ausencias(uuid, date, uuid[]), limpieza._disponibles(uuid, date),
  limpieza._aplicar_ausencias(uuid, date), limpieza._repartir_lo_que_queda(uuid, date), limpieza.generar_dia(uuid, date) from public, authenticated;
