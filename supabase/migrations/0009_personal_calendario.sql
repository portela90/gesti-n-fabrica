-- =====================================================================================
-- 0009 · PERSONAL · CALENDARIO LABORAL
-- Un calendario por equipo y año (festivos, cierres, jornada intensiva, horarios especiales),
-- las vacaciones de cada trabajador y los envíos a firmar «recibido y conforme».
--  · Cada envío guarda una FOTO del calendario de ese trabajador (datos) y su huella (sha256):
--    lo que se firma no cambia aunque luego se toque el calendario.
--  · La firma va en nucleo.firmas (documento «calendario», documento_id = el envío), que solo
--    se añade. Un envío ya no se cambia: solo se puede anular si aún no está firmado.
--  · origen = de dónde vino la fila al traerla de las apps de ahora (vacío = hecha en esta app).
-- Solo depende del núcleo (empresas, equipos, personas, firmas).
-- =====================================================================================

create schema if not exists personal;

-- ---------- días marcados del calendario ----------
create table personal.dias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  equipo_id   uuid not null,
  fecha       date not null,
  tipo        text not null check (tipo in ('festivo', 'cierre', 'intensiva', 'especial')),
  nombre      text check (nombre is null or length(nombre) <= 120),
  horario     text check (horario is null or length(horario) <= 120),
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, equipo_id, fecha),
  foreign key (empresa_id, equipo_id) references nucleo.equipos(empresa_id, id)
);
comment on table personal.dias is 'Días especiales del calendario de cada equipo: festivo, cierre de fábrica, jornada intensiva u horario especial. Los demás días se trabaja según el horario de cada uno.';

-- ---------- vacaciones ----------
create table personal.vacaciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  persona_id  uuid not null,
  desde       date not null,
  hasta       date not null,
  nota        text check (nota is null or length(nota) <= 200),
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  check (hasta >= desde and hasta - desde <= 366),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table personal.vacaciones is 'Vacaciones de cada trabajador (de desde a hasta, los dos incluidos).';
create index on personal.vacaciones (empresa_id, persona_id, desde);

-- ---------- envíos a firmar ----------
create table personal.envios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  anio         int  not null check (anio between 2000 and 2100),
  equipo_id    uuid not null,
  persona_id   uuid not null,
  datos        jsonb not null check (jsonb_typeof(datos) = 'object'),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  enviado      timestamptz not null default now(),
  enviado_por  uuid default auth.uid(),
  anulado      timestamptz,
  origen       text,
  foreign key (empresa_id, equipo_id)  references nucleo.equipos(empresa_id, id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table personal.envios is 'Cada calendario enviado a un trabajador para que lo firme. datos = foto del calendario en ese momento; sha256 = su huella. Solo se puede anular (si no está firmado).';
create index on personal.envios (empresa_id, anio, equipo_id);
create index on personal.envios (persona_id);

-- huella de lo que se firma (la misma cuenta en la base de datos y en el PDF)
create or replace function personal.huella(p jsonb) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p::text, 'UTF8')), 'hex') $$;

-- un envío no se cambia; solo se anula una vez y si no está firmado
create or replace function personal._envio_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'SOLO_ANADIR: un envío no se borra; se anula'; end if;
  if (to_jsonb(new) - 'anulado') <> (to_jsonb(old) - 'anulado') or old.anulado is not null or new.anulado is null then
    raise exception 'SOLO_ANADIR: de un envío solo se puede anotar que se anula';
  end if;
  if exists (select 1 from nucleo.firmas f where f.documento = 'calendario' and f.documento_id = old.id) then
    raise exception 'YA_FIRMADO';
  end if;
  return new;
end $$;
create trigger inmutable before update or delete on personal.envios for each row execute function personal._envio_inmutable();

-- ---------- estado de cada envío (con su firma, si la tiene) ----------
-- security_invoker: cada uno ve solo los envíos y firmas que le dejan ver sus permisos.
create view personal.v_envios with (security_invoker = on) as
select e.id, e.empresa_id, e.anio, e.equipo_id, e.persona_id, e.datos, e.sha256, e.enviado, e.enviado_por, e.anulado, e.origen,
       f.id as firma_id, f.firmado_en, f.conforme, f.comentario, f.imagen as firma_imagen,
       case when e.anulado is not null then 'anulado' when f.id is null then 'pendiente' else 'firmado' end as estado
  from personal.envios e
  left join lateral (
    select f.* from nucleo.firmas f
     where f.empresa_id = e.empresa_id and f.modulo = 'personal' and f.documento = 'calendario'
       and f.documento_id = e.id and f.persona_id = e.persona_id and f.sha256_documento = e.sha256
     order by f.firmado_en limit 1) f on true;
comment on view personal.v_envios is 'Envíos del calendario con su estado: pendiente, firmado o anulado. Solo cuenta la firma del propio trabajador sobre esa misma foto (misma huella).';

-- ---------- permisos ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('personal.tarea.ver',          'personal', 'Ver mis cosas de Personal: mi calendario y lo que tengo por firmar'),
  ('personal.calendario.ver',     'personal', 'Ver el calendario laboral y las vacaciones de todos'),
  ('personal.calendario.editar',  'personal', 'Marcar festivos, cierres, jornada intensiva y horarios especiales'),
  ('personal.vacaciones.editar',  'personal', 'Apuntar, cambiar y quitar vacaciones'),
  ('personal.firma.enviar',       'personal', 'Enviar el calendario a firmar y anular envíos sin firmar'),
  ('personal.firma.ver',          'personal', 'Ver las firmas del calendario de todos'),
  ('personal.firma.recoger',      'personal', 'Recoger en mi móvil la firma de otro trabajador'),
  ('personal.historial.ver',      'personal', 'Ver el historial de cambios de Personal')
on conflict (codigo) do nothing;
-- Los roles de partida ya los cubren con comodines (0004): administrador «*», encargado «personal.*.ver» y
-- «personal.firma.recoger», operario «*.tarea.ver», solo lectura «personal.*.ver».

-- ---------- seguridad por fila ----------
grant usage on schema personal to authenticated, service_role;
grant select, insert, update, delete on personal.dias, personal.vacaciones to authenticated;
grant select on personal.envios, personal.v_envios to authenticated;
grant all on all tables in schema personal to service_role;
alter table personal.dias enable row level security;
alter table personal.vacaciones enable row level security;
alter table personal.envios enable row level security;

-- Días: los festivos y cierres los ve cualquiera de la unidad; los cambia quien tiene permiso.
create policy ver on personal.dias for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy crear on personal.dias for insert to authenticated with check (nucleo.tiene_permiso('personal.calendario.editar', empresa_id));
create policy cambiar on personal.dias for update to authenticated
  using (nucleo.tiene_permiso('personal.calendario.editar', empresa_id)) with check (nucleo.tiene_permiso('personal.calendario.editar', empresa_id));
create policy borrar on personal.dias for delete to authenticated using (nucleo.tiene_permiso('personal.calendario.editar', empresa_id));

-- Vacaciones: cada uno ve las suyas; quien ve el calendario, las de todos.
create policy ver on personal.vacaciones for select to authenticated using (
  nucleo.tiene_permiso('personal.calendario.ver', empresa_id)
  or persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));
create policy crear on personal.vacaciones for insert to authenticated with check (nucleo.tiene_permiso('personal.vacaciones.editar', empresa_id));
create policy cambiar on personal.vacaciones for update to authenticated
  using (nucleo.tiene_permiso('personal.vacaciones.editar', empresa_id)) with check (nucleo.tiene_permiso('personal.vacaciones.editar', empresa_id));
create policy borrar on personal.vacaciones for delete to authenticated using (nucleo.tiene_permiso('personal.vacaciones.editar', empresa_id));

-- Envíos: cada uno ve los suyos; quien envía o ve firmas, los de todos. Se crean y anulan solo con las funciones de abajo.
create policy ver on personal.envios for select to authenticated using (
  nucleo.tiene_permiso('personal.firma.ver', empresa_id) or nucleo.tiene_permiso('personal.firma.enviar', empresa_id)
  or persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));

do $$ begin
  perform nucleo.activar_historial('personal.dias');
  perform nucleo.activar_historial('personal.vacaciones');
  perform nucleo.activar_historial('personal.envios');
end $$;

-- ---------- funciones ----------
alter default privileges in schema personal revoke execute on functions from public;

-- Marcar o desmarcar varios días de golpe en uno o varios equipos (tipo vacío = quitar la marca).
-- security invoker: valen las reglas de arriba y el historial apunta a quien lo hace.
create or replace function personal.marcar_dias(p_empresa uuid, p_equipos uuid[], p_fechas date[], p_tipo text,
                                                p_nombre text default null, p_horario text default null) returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if cardinality(p_fechas) > 400 or cardinality(p_equipos) > 20 then raise exception 'DEMASIADAS'; end if;
  if not nucleo.tiene_permiso('personal.calendario.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if coalesce(p_tipo, '') = '' then
    delete from personal.dias d where d.empresa_id = p_empresa and d.equipo_id = any(p_equipos) and d.fecha = any(p_fechas);
  else
    insert into personal.dias (empresa_id, equipo_id, fecha, tipo, nombre, horario)
    select p_empresa, e, f, p_tipo, nullif(trim(p_nombre), ''), nullif(trim(p_horario), '')
      from unnest(p_equipos) e, unnest(p_fechas) f
    on conflict (empresa_id, equipo_id, fecha) do update
      set tipo = excluded.tipo, nombre = excluded.nombre, horario = excluded.horario;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Copiar el calendario de un año de un equipo a otro (lo que tenía el de destino ese año se quita).
create or replace function personal.copiar_dias(p_empresa uuid, p_anio int, p_de uuid, p_a uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if p_de = p_a then raise exception 'MISMO_EQUIPO'; end if;
  if not nucleo.tiene_permiso('personal.calendario.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  delete from personal.dias d where d.empresa_id = p_empresa and d.equipo_id = p_a and extract(year from d.fecha) = p_anio;
  insert into personal.dias (empresa_id, equipo_id, fecha, tipo, nombre, horario)
  select d.empresa_id, p_a, d.fecha, d.tipo, d.nombre, d.horario
    from personal.dias d where d.empresa_id = p_empresa and d.equipo_id = p_de and extract(year from d.fecha) = p_anio;
  get diagnostics n = row_count;
  return n;
end $$;

-- La foto del calendario de un trabajador para un año y equipo (lo que se le envía a firmar).
create or replace function personal._foto(p_empresa uuid, p_anio int, p_equipo uuid, p_persona uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (select make_date(p_anio, 1, 1) d0, make_date(p_anio, 12, 31) d1)
  select jsonb_build_object(
    'anio', p_anio,
    'unidad', (select e.nombre from nucleo.empresas e where e.id = p_empresa),
    'equipo', (select q.nombre from nucleo.equipos q where q.id = p_equipo and q.empresa_id = p_empresa),
    'dias_equipo', (select q.dias from nucleo.equipos q where q.id = p_equipo and q.empresa_id = p_empresa),
    'trabajador', (select p.nombre from nucleo.personas p where p.id = p_persona and p.empresa_id = p_empresa),
    'horario', (select p.horario from nucleo.personas p where p.id = p_persona and p.empresa_id = p_empresa),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', d.fecha, 'tipo', d.tipo, 'nombre', d.nombre, 'horario', d.horario) order by d.fecha)
                        from personal.dias d, r where d.empresa_id = p_empresa and d.equipo_id = p_equipo and d.fecha between r.d0 and r.d1), '[]'::jsonb),
    'vacaciones', coalesce((select jsonb_agg(jsonb_build_object('desde', greatest(v.desde, r.d0), 'hasta', least(v.hasta, r.d1), 'nota', v.nota) order by v.desde)
                        from personal.vacaciones v, r where v.empresa_id = p_empresa and v.persona_id = p_persona and v.hasta >= r.d0 and v.desde <= r.d1), '[]'::jsonb))
$$;
revoke execute on function personal._foto(uuid, int, uuid, uuid) from public, authenticated;

-- Enviar a firmar: una foto para cada trabajador. Los envíos anteriores sin firmar de ese año y equipo se anulan.
create or replace function personal.enviar_calendario(p_empresa uuid, p_anio int, p_equipo uuid, p_personas uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_persona uuid; v_datos jsonb; n int := 0;
begin
  if not nucleo.tiene_permiso('personal.firma.enviar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if not exists (select 1 from nucleo.equipos q where q.id = p_equipo and q.empresa_id = p_empresa) then raise exception 'NO_EXISTE'; end if;
  if cardinality(p_personas) > 200 then raise exception 'DEMASIADAS'; end if;
  for v_persona in select p.id from nucleo.personas p where p.id = any(p_personas) and p.empresa_id = p_empresa and p.baja is null loop
    update personal.envios e set anulado = now()
     where e.empresa_id = p_empresa and e.persona_id = v_persona and e.anio = p_anio and e.equipo_id = p_equipo and e.anulado is null
       and not exists (select 1 from nucleo.firmas f where f.documento = 'calendario' and f.documento_id = e.id);
    v_datos := personal._foto(p_empresa, p_anio, p_equipo, v_persona);
    insert into personal.envios (empresa_id, anio, equipo_id, persona_id, datos, sha256)
    values (p_empresa, p_anio, p_equipo, v_persona, v_datos, personal.huella(v_datos));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Anular un envío que aún no está firmado.
create or replace function personal.anular_envio(p_envio uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v personal.envios;
begin
  select * into v from personal.envios where id = p_envio;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('personal.firma.enviar', v.empresa_id) then raise exception 'NO_PERMISO'; end if;
  update personal.envios set anulado = now() where id = p_envio;  -- el disparador no deja si ya está firmado o anulado
end $$;

-- Firmar un calendario: el propio trabajador o, en su móvil, quien tenga «personal.firma.recoger».
create or replace function personal.firmar_calendario(p_envio uuid, p_conforme boolean, p_comentario text, p_imagen text,
                                                      p_dispositivo jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v personal.envios; v_yo uuid; v_firma uuid;
begin
  select * into v from personal.envios where id = p_envio;
  if not found then raise exception 'NO_EXISTE'; end if;
  select u.persona_id into v_yo from nucleo.usuarios u where u.id = auth.uid() and u.baja is null;
  if not (v.persona_id = v_yo or nucleo.tiene_permiso('personal.firma.recoger', v.empresa_id)) then raise exception 'NO_PERMISO'; end if;
  if v.anulado is not null then raise exception 'ANULADO'; end if;
  if exists (select 1 from nucleo.firmas f where f.documento = 'calendario' and f.documento_id = v.id) then raise exception 'YA_FIRMADO'; end if;
  if p_imagen is null or p_imagen !~ '^data:image/png;base64,' then raise exception 'FIRMA_MAL'; end if;
  if not coalesce(p_conforme, true) and coalesce(trim(p_comentario), '') = '' then raise exception 'FALTA_COMENTARIO'; end if;
  if personal.huella(v.datos) <> v.sha256 then raise exception 'HUELLA_MAL'; end if;
  insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, conforme, comentario, imagen,
                             sha256_documento, firmado_por, dispositivo)
  values (v.empresa_id, 'personal', 'calendario', v.id, v.persona_id, coalesce(p_conforme, true), nullif(left(trim(p_comentario), 500), ''),
          p_imagen, v.sha256, auth.uid(), p_dispositivo)
  returning id into v_firma;
  return v_firma;
end $$;

grant execute on function personal.huella(jsonb), personal.marcar_dias(uuid, uuid[], date[], text, text, text),
  personal.copiar_dias(uuid, int, uuid, uuid), personal.enviar_calendario(uuid, int, uuid, uuid[]),
  personal.anular_envio(uuid), personal.firmar_calendario(uuid, boolean, text, text, jsonb) to authenticated;
revoke execute on function personal._envio_inmutable() from public, authenticated;
