-- =====================================================================================
-- 0011 · PERSONAL · CALENDARIOS CON NOMBRE Y PERSONAS (en vez de uno por equipo)
-- Hay operarios con calendarios distintos aunque sean del mismo equipo. Ahora:
--  · calendarios: cada uno con su nombre, su año y los días de la semana que se trabaja.
--  · calendario_personas: quién va en cada calendario. Una persona, un solo calendario por año
--    (si se la pone en otro, se cambia de calendario).
--  · personal.dias y personal.envios pasan a ir por calendario (ya no por equipo).
-- Lo que ya había se convierte solo: un calendario «<equipo> <año>» por cada equipo y año con días marcados o envíos,
-- con la gente de ese equipo. Las firmas no se tocan (la foto firmada no cambia).
-- =====================================================================================

create table personal.calendarios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  anio         int  not null check (anio between 2000 and 2100),
  nombre       text not null check (length(nombre) between 1 and 80),
  dias_semana  int[] not null default '{1,2,3,4,5}' check (dias_semana <@ '{0,1,2,3,4,5,6}'),
  origen       text,
  creado       timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  unique (empresa_id, anio, nombre),
  unique (empresa_id, id),
  unique (empresa_id, id, anio)
);
comment on table personal.calendarios is 'Cada calendario laboral de un año (p. ej. «Semana 2027», «Fin de semana 2027», «Refuerzo 2027»). dias_semana = días que se trabaja normalmente (0 = domingo).';

create table personal.calendario_personas (
  empresa_id     uuid not null references nucleo.empresas(id),
  anio           int  not null,
  persona_id     uuid not null,
  calendario_id  uuid not null,
  primary key (empresa_id, anio, persona_id),
  foreign key (empresa_id, calendario_id, anio) references personal.calendarios(empresa_id, id, anio) on delete cascade,
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table personal.calendario_personas is 'Quién va en cada calendario. Una persona solo puede estar en un calendario cada año.';
create index on personal.calendario_personas (calendario_id);

-- ---------- convertir lo que había (uno por equipo y año) ----------
insert into personal.calendarios (empresa_id, anio, nombre, dias_semana, origen)
select distinct x.empresa_id, x.anio, q.nombre || ' ' || x.anio, q.dias, 'equipo:' || q.codigo
  from (select empresa_id, equipo_id, extract(year from fecha)::int anio from personal.dias
        union select empresa_id, equipo_id, anio from personal.envios) x
  join nucleo.equipos q on q.id = x.equipo_id;

insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id)
select c.empresa_id, c.anio, p.id, c.id
  from personal.calendarios c
  join nucleo.equipos q on q.empresa_id = c.empresa_id and c.origen = 'equipo:' || q.codigo
  join nucleo.personas p on p.empresa_id = c.empresa_id and p.equipo_id = q.id
on conflict do nothing;
-- quien ya firmó o tiene un envío de un año va en el calendario de ese envío
insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id)
select e.empresa_id, e.anio, e.persona_id, c.id
  from personal.envios e join nucleo.equipos q on q.id = e.equipo_id
  join personal.calendarios c on c.empresa_id = e.empresa_id and c.anio = e.anio and c.origen = 'equipo:' || q.codigo
on conflict do nothing;

-- días: de equipo a calendario
alter table personal.dias add column calendario_id uuid;
update personal.dias d set calendario_id = c.id
  from nucleo.equipos q, personal.calendarios c
 where q.id = d.equipo_id and c.empresa_id = d.empresa_id and c.anio = extract(year from d.fecha)::int and c.origen = 'equipo:' || q.codigo;
alter table personal.dias alter column calendario_id set not null;
alter table personal.dias drop constraint dias_empresa_id_equipo_id_fecha_key;
alter table personal.dias drop column equipo_id;
alter table personal.dias add constraint dias_calendario_fecha unique (calendario_id, fecha);
alter table personal.dias add foreign key (empresa_id, calendario_id) references personal.calendarios(empresa_id, id) on delete cascade;
comment on table personal.dias is 'Días especiales de cada calendario: festivo, cierre, intensiva, horario especial, trabaja (fuera de sus días) o descanso.';

-- el día tiene que ser del año del calendario
create or replace function personal._dia_del_anio() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from personal.calendarios c where c.id = new.calendario_id and c.anio = extract(year from new.fecha)::int) then
    raise exception 'OTRO_ANIO';
  end if;
  return new;
end $$;
create trigger del_anio before insert or update on personal.dias for each row execute function personal._dia_del_anio();

-- envíos: de equipo a calendario (los ya hechos se quedan con su foto)
alter table personal.envios disable trigger inmutable;
alter table personal.envios add column calendario_id uuid;
update personal.envios e set calendario_id = c.id
  from nucleo.equipos q, personal.calendarios c
 where q.id = e.equipo_id and c.empresa_id = e.empresa_id and c.anio = e.anio and c.origen = 'equipo:' || q.codigo;
alter table personal.envios alter column calendario_id set not null;
alter table personal.envios alter column equipo_id drop not null;
alter table personal.envios add foreign key (empresa_id, calendario_id) references personal.calendarios(empresa_id, id);
alter table personal.envios enable trigger inmutable;
comment on column personal.envios.equipo_id is 'Solo en los envíos de antes de los calendarios con nombre (0011).';
create index on personal.envios (calendario_id);

-- la vista, con el calendario (se rehace porque cambian sus columnas)
drop view personal.v_envios;
create view personal.v_envios with (security_invoker = on) as
select e.id, e.empresa_id, e.anio, e.calendario_id, e.persona_id, e.datos, e.sha256, e.enviado, e.enviado_por, e.anulado, e.origen,
       f.id as firma_id, f.firmado_en, f.conforme, f.comentario, f.imagen as firma_imagen,
       case when e.anulado is not null then 'anulado' when f.id is null then 'pendiente' else 'firmado' end as estado
  from personal.envios e
  left join lateral (
    select f.* from nucleo.firmas f
     where f.empresa_id = e.empresa_id and f.modulo = 'personal' and f.documento = 'calendario'
       and f.documento_id = e.id and f.persona_id = e.persona_id and f.sha256_documento = e.sha256
     order by f.firmado_en limit 1) f on true;
grant select on personal.v_envios to authenticated;

-- ---------- seguridad por fila ----------
grant select, insert, update, delete on personal.calendarios, personal.calendario_personas to authenticated;
grant all on personal.calendarios, personal.calendario_personas to service_role;
alter table personal.calendarios enable row level security;
alter table personal.calendario_personas enable row level security;
create policy ver on personal.calendarios for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy gestionar on personal.calendarios for all to authenticated
  using (nucleo.tiene_permiso('personal.calendario.editar', empresa_id)) with check (nucleo.tiene_permiso('personal.calendario.editar', empresa_id));
create policy ver on personal.calendario_personas for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy gestionar on personal.calendario_personas for all to authenticated
  using (nucleo.tiene_permiso('personal.calendario.editar', empresa_id)) with check (nucleo.tiene_permiso('personal.calendario.editar', empresa_id));
do $$ begin
  perform nucleo.activar_historial('personal.calendarios');
  perform nucleo.activar_historial('personal.calendario_personas');
end $$;

-- ---------- funciones (las de equipo se sustituyen por las de calendario) ----------
drop function personal.marcar_dias(uuid, uuid[], date[], text, text, text);
drop function personal.copiar_dias(uuid, int, uuid, uuid);
drop function personal.enviar_calendario(uuid, int, uuid, uuid[]);
drop function personal._foto(uuid, int, uuid, uuid);

-- Marcar o desmarcar días en uno o varios calendarios (tipo vacío = quitar la marca).
create or replace function personal.marcar_dias(p_calendarios uuid[], p_fechas date[], p_tipo text,
                                                p_nombre text default null, p_horario text default null) returns int
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
    insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario)
    select c.empresa_id, c.id, f, p_tipo, nullif(trim(p_nombre), ''), nullif(trim(p_horario), '')
      from personal.calendarios c, unnest(p_fechas) f
     where c.id = any(p_calendarios) and extract(year from f)::int = c.anio
    on conflict (calendario_id, fecha) do update set tipo = excluded.tipo, nombre = excluded.nombre, horario = excluded.horario;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Copiar los días marcados de un calendario a otro del mismo año (lo que tenía el de destino se quita).
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
  insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horario)
  select d.empresa_id, b.id, d.fecha, d.tipo, d.nombre, d.horario from personal.dias d where d.calendario_id = a.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Poner a estas personas en este calendario (las quita del que tuvieran ese año) y quitar a las que ya no estén.
create or replace function personal.poner_personas(p_calendario uuid, p_personas uuid[]) returns int
language plpgsql security invoker set search_path = '' as $$
declare c personal.calendarios; n int;
begin
  select * into c from personal.calendarios where id = p_calendario;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('personal.calendario.editar', c.empresa_id) then raise exception 'NO_PERMISO'; end if;
  delete from personal.calendario_personas cp where cp.calendario_id = c.id and not (cp.persona_id = any(p_personas));
  insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id)
  select c.empresa_id, c.anio, p.id, c.id from nucleo.personas p where p.id = any(p_personas) and p.empresa_id = c.empresa_id
  on conflict (empresa_id, anio, persona_id) do update set calendario_id = excluded.calendario_id;
  select count(*) into n from personal.calendario_personas cp where cp.calendario_id = c.id;
  return n;
end $$;

-- La foto del calendario de un trabajador (lo que se le envía a firmar).
-- Las claves «equipo» y «dias_equipo» se mantienen para que los envíos viejos y nuevos se lean igual.
create or replace function personal._foto(p_calendario uuid, p_persona uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'anio', c.anio,
    'unidad', (select e.nombre from nucleo.empresas e where e.id = c.empresa_id),
    'calendario', c.nombre,
    'equipo', c.nombre,
    'dias_equipo', c.dias_semana,
    'trabajador', (select p.nombre from nucleo.personas p where p.id = p_persona and p.empresa_id = c.empresa_id),
    'horario', (select p.horario from nucleo.personas p where p.id = p_persona and p.empresa_id = c.empresa_id),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', d.fecha, 'tipo', d.tipo, 'nombre', d.nombre, 'horario', d.horario) order by d.fecha)
                        from personal.dias d where d.calendario_id = c.id), '[]'::jsonb),
    'vacaciones', coalesce((select jsonb_agg(jsonb_build_object('desde', greatest(v.desde, make_date(c.anio, 1, 1)), 'hasta', least(v.hasta, make_date(c.anio, 12, 31)), 'nota', v.nota) order by v.desde)
                        from personal.vacaciones v where v.empresa_id = c.empresa_id and v.persona_id = p_persona
                         and v.hasta >= make_date(c.anio, 1, 1) and v.desde <= make_date(c.anio, 12, 31)), '[]'::jsonb))
  from personal.calendarios c where c.id = p_calendario
$$;
revoke execute on function personal._foto(uuid, uuid) from public, authenticated;

-- Enviar a firmar el calendario a las personas que se digan (si no se dice nadie, a todas las del calendario).
-- Los envíos anteriores sin firmar de ese año para esa persona se anulan.
create or replace function personal.enviar_calendario(p_calendario uuid, p_personas uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare c personal.calendarios; v_persona uuid; v_datos jsonb; n int := 0;
begin
  select * into c from personal.calendarios where id = p_calendario;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('personal.firma.enviar', c.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if cardinality(p_personas) > 200 then raise exception 'DEMASIADAS'; end if;
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

grant execute on function personal.marcar_dias(uuid[], date[], text, text, text), personal.copiar_dias(uuid, uuid),
  personal.poner_personas(uuid, uuid[]), personal.enviar_calendario(uuid, uuid[]) to authenticated;
revoke execute on function personal._dia_del_anio() from public, authenticated;
