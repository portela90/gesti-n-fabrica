-- =====================================================================================
-- 0010 · PREVENCIÓN (1.ª parte): ficha del trabajador y charlas mensuales (Toolbox Talk HSE)
--  · fichas: datos de prevención de cada trabajador (DNI, puesto, alta y baja, contacto, idioma, tallas).
--    Son datos personales: solo los ve quien tenga «prevencion.ficha.ver» y cada uno la suya.
--    El reconocimiento médico NO va aquí: en la app de ahora está escondido hasta que prevención lo autorice.
--  · prendas: lista de prendas y botas con talla (es configuración de cada unidad, no va en el código).
--  · charlas: el contenido de cada mes (compromiso, preguntas, tema, imagen…).
--  · sesiones: la charla de un mes dada en la unidad (fecha, lugar, formador, a quién se envía, cerrada o no).
--  · asistencias: quién la ha firmado. La firma va en nucleo.firmas (documento «charla»), que solo se añade;
--    si una firma está mal, se anula la asistencia (no se borra) y se vuelve a firmar.
--  · origen = de dónde vino la fila al traerla de las apps de ahora (vacío = hecha en esta app).
-- Solo depende del núcleo.
-- =====================================================================================

create schema if not exists prevencion;

-- ---------- ficha del trabajador ----------
create table prevencion.fichas (
  persona_id    uuid primary key,
  empresa_id    uuid not null references nucleo.empresas(id),
  dni           text check (dni is null or dni ~ '^[0-9A-Z]{6,12}$'),
  puesto        text check (puesto is null or length(puesto) <= 80),
  fecha_alta    date,
  fecha_baja    date,
  motivo_baja   text check (motivo_baja is null or length(motivo_baja) <= 80),
  telefono      text check (telefono is null or length(telefono) <= 30),
  emerg_nombre  text check (emerg_nombre is null or length(emerg_nombre) <= 80),
  emerg_tel     text check (emerg_tel is null or length(emerg_tel) <= 30),
  idioma        text check (idioma is null or length(idioma) <= 40),
  tallas        jsonb not null default '{}'::jsonb check (jsonb_typeof(tallas) = 'object'),
  origen        text,
  actualizado   timestamptz not null default now(),
  check (fecha_baja is null or fecha_alta is null or fecha_baja >= fecha_alta),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table prevencion.fichas is 'Datos de prevención de cada trabajador. tallas = {codigo de prenda: talla}. Sin datos de salud.';

create table prevencion.prendas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null check (codigo ~ '^[a-z][a-z0-9_]{0,40}$'),
  nombre      text not null,
  orden       int  not null default 0,
  baja        timestamptz,
  unique (empresa_id, codigo)
);
comment on table prevencion.prendas is 'Prendas y botas de las que se apunta la talla (camiseta, pantalón, botas…).';

-- ---------- charlas ----------
create table prevencion.charlas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  anio        int  not null check (anio between 2000 and 2100),
  mes         int  not null check (mes between 1 and 12),
  codigo      text,
  compromiso  text not null check (length(compromiso) between 1 and 500),
  cuerpo      text check (cuerpo is null or length(cuerpo) <= 4000),
  puntos      jsonb not null default '[]'::jsonb check (jsonb_typeof(puntos) = 'array'),
  tema        text check (tema is null or length(tema) <= 200),
  tema_intro  text check (tema_intro is null or length(tema_intro) <= 2000),
  tema_puntos jsonb not null default '[]'::jsonb check (jsonb_typeof(tema_puntos) = 'array'),
  imagen      text check (imagen is null or (imagen ~ '^data:image/(png|jpeg);base64,' and length(imagen) <= 700000)),
  origen      text,
  actualizado timestamptz not null default now(),
  unique (empresa_id, anio, mes),
  unique (empresa_id, id)
);
comment on table prevencion.charlas is 'Contenido de la charla de cada mes: compromiso del mes, texto, preguntas (puntos), tema HSE con sus consejos e imagen.';

create table prevencion.sesiones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references nucleo.empresas(id),
  charla_id     uuid not null,
  denominacion  text check (denominacion is null or length(denominacion) <= 200),
  fecha         date,
  centro        text check (centro is null or length(centro) <= 200),
  duracion      int  check (duracion is null or duracion between 1 and 600),
  formador      text check (formador is null or length(formador) <= 120),
  observaciones text check (observaciones is null or length(observaciones) <= 1000),
  previstos     uuid[] not null default '{}',
  enviada_en    timestamptz,
  cerrada_en    timestamptz,
  origen        text,
  creado        timestamptz not null default now(),
  unique (empresa_id, charla_id),
  unique (empresa_id, id),
  foreign key (empresa_id, charla_id) references prevencion.charlas(empresa_id, id)
);
comment on table prevencion.sesiones is 'La charla de un mes dada en la unidad. previstos = trabajadores que tienen que firmarla. Cerrada = ya no se firma ni se cambia.';

create table prevencion.asistencias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  sesion_id   uuid not null,
  persona_id  uuid not null,
  nombre      text not null,
  puesto      text,
  firma_id    uuid references nucleo.firmas(id),
  anulada     timestamptz,
  anulada_por uuid,
  origen      text,
  creado      timestamptz not null default now(),
  foreign key (empresa_id, sesion_id)  references prevencion.sesiones(empresa_id, id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table prevencion.asistencias is 'Quién ha firmado cada charla (nombre y puesto tal como firmó). Solo se anula; nunca se borra.';
create unique index asistencia_viva on prevencion.asistencias (sesion_id, persona_id) where anulada is null;

-- huella de lo que se firma: el contenido de la charla y la denominación de la sesión
create or replace function prevencion.huella_charla(p_sesion uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'denominacion', s.denominacion, 'compromiso', c.compromiso, 'cuerpo', c.cuerpo, 'puntos', c.puntos,
    'tema', c.tema, 'tema_intro', c.tema_intro, 'tema_puntos', c.tema_puntos)::text, 'UTF8')), 'hex')
  from prevencion.sesiones s join prevencion.charlas c on c.id = s.charla_id where s.id = p_sesion
$$;

-- una sesión cerrada no se cambia (salvo para reabrirla) y no se borra
create or replace function prevencion._sesion_cerrada() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'SOLO_ANADIR: una sesión no se borra'; end if;
  if old.cerrada_en is not null and (to_jsonb(new) - 'cerrada_en') <> (to_jsonb(old) - 'cerrada_en') then raise exception 'CERRADA'; end if;
  return new;
end $$;
create trigger cerrada before update or delete on prevencion.sesiones for each row execute function prevencion._sesion_cerrada();

-- la charla de una sesión cerrada tampoco se cambia (es lo que se firmó)
create or replace function prevencion._charla_firmada() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from prevencion.sesiones s where s.charla_id = old.id and s.cerrada_en is not null) then raise exception 'CERRADA'; end if;
  if tg_op = 'DELETE' and exists (select 1 from prevencion.sesiones s where s.charla_id = old.id) then raise exception 'TIENE_SESION'; end if;
  return coalesce(new, old);
end $$;
create trigger firmada before update or delete on prevencion.charlas for each row execute function prevencion._charla_firmada();

-- una asistencia solo se anula
create or replace function prevencion._asistencia_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'SOLO_ANADIR: una asistencia no se borra; se anula'; end if;
  if (to_jsonb(new) - 'anulada' - 'anulada_por') <> (to_jsonb(old) - 'anulada' - 'anulada_por') or old.anulada is not null or new.anulada is null then
    raise exception 'SOLO_ANADIR: de una asistencia solo se puede anotar que se anula';
  end if;
  return new;
end $$;
create trigger inmutable before update or delete on prevencion.asistencias for each row execute function prevencion._asistencia_inmutable();

-- ---------- permisos ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('prevencion.tarea.ver',     'prevencion', 'Ver mis cosas de Prevención: las charlas que tengo que firmar y mi ficha'),
  ('prevencion.charla.ver',    'prevencion', 'Ver las charlas de cada mes y su estado'),
  ('prevencion.charla.editar', 'prevencion', 'Escribir las charlas, preparar la sesión, enviarla a firmar y cerrarla'),
  ('prevencion.firma.ver',     'prevencion', 'Ver quién ha firmado cada charla y sus firmas'),
  ('prevencion.firma.recoger', 'prevencion', 'Recoger en mi móvil la firma de otro trabajador'),
  ('prevencion.firma.anular',  'prevencion', 'Anular una firma mal hecha (antes de cerrar la sesión)'),
  ('prevencion.ficha.ver',     'prevencion', 'Ver las fichas de los trabajadores (DNI, contacto, tallas)'),
  ('prevencion.ficha.editar',  'prevencion', 'Cambiar las fichas de los trabajadores y la lista de prendas'),
  ('prevencion.historial.ver', 'prevencion', 'Ver el historial de cambios de Prevención')
on conflict (codigo) do nothing;

-- Roles de partida: el encargado y solo lectura NO ven las fichas (datos personales), como en la app de ahora.
-- Se cambia su «prevencion.*.ver» por lo que sí pueden ver. El administrador («*») lo ve todo.
delete from nucleo.rol_permisos rp using nucleo.roles r
 where rp.rol_id = r.id and r.empresa_id is null and r.codigo in ('encargado', 'solo_lectura') and rp.permiso = 'prevencion.*.ver';
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, p from nucleo.roles r, unnest(array['prevencion.charla.ver', 'prevencion.firma.ver', 'prevencion.tarea.ver', 'prevencion.modulo.ver', 'prevencion.historial.ver']) p
 where r.empresa_id is null and r.codigo in ('encargado', 'solo_lectura')
on conflict do nothing;

-- ---------- seguridad por fila ----------
grant usage on schema prevencion to authenticated, service_role;
grant select, insert, update on prevencion.fichas, prevencion.charlas, prevencion.sesiones to authenticated;
grant select, insert, update, delete on prevencion.prendas to authenticated;
grant delete on prevencion.charlas to authenticated;  -- solo si aún no tiene sesión (ver _charla_firmada)
grant select on prevencion.asistencias to authenticated;
grant all on all tables in schema prevencion to service_role;
alter table prevencion.fichas enable row level security;
alter table prevencion.prendas enable row level security;
alter table prevencion.charlas enable row level security;
alter table prevencion.sesiones enable row level security;
alter table prevencion.asistencias enable row level security;

-- quién soy yo como trabajador
create or replace function prevencion.mi_persona() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.persona_id from nucleo.usuarios u where u.id = auth.uid() and u.baja is null
$$;

-- Fichas: cada uno la suya; las de todos, quien tiene permiso. Solo las cambia quien puede editarlas.
create policy ver on prevencion.fichas for select to authenticated using (
  nucleo.tiene_permiso('prevencion.ficha.ver', empresa_id) or persona_id = prevencion.mi_persona());
create policy crear on prevencion.fichas for insert to authenticated with check (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id));
create policy cambiar on prevencion.fichas for update to authenticated
  using (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id));

create policy ver on prevencion.prendas for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy gestionar on prevencion.prendas for all to authenticated
  using (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id));

-- Charlas: el contenido lo lee cualquiera de la unidad (es lo que se explica a todos).
create policy ver on prevencion.charlas for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy crear on prevencion.charlas for insert to authenticated with check (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id));
create policy cambiar on prevencion.charlas for update to authenticated
  using (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id));
create policy borrar on prevencion.charlas for delete to authenticated using (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id));

-- Sesiones: quien ve charlas, todas; un trabajador, las que le han enviado.
create policy ver on prevencion.sesiones for select to authenticated using (
  nucleo.tiene_permiso('prevencion.charla.ver', empresa_id)
  or (enviada_en is not null and prevencion.mi_persona() = any(previstos)));
create policy crear on prevencion.sesiones for insert to authenticated with check (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id));
create policy cambiar on prevencion.sesiones for update to authenticated
  using (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.charla.editar', empresa_id));

-- Asistencias: quien ve firmas, todas; cada uno, las suyas. Se crean y anulan con las funciones de abajo.
create policy ver on prevencion.asistencias for select to authenticated using (
  nucleo.tiene_permiso('prevencion.firma.ver', empresa_id) or persona_id = prevencion.mi_persona());

do $$ begin
  perform nucleo.activar_historial('prevencion.fichas');
  perform nucleo.activar_historial('prevencion.prendas');
  perform nucleo.activar_historial('prevencion.charlas');
  perform nucleo.activar_historial('prevencion.sesiones');
  perform nucleo.activar_historial('prevencion.asistencias');
end $$;
-- la fecha de la última vez que se cambió la ficha
create or replace function prevencion._ficha_actualizada() returns trigger language plpgsql set search_path = '' as $$
begin new.actualizado := now(); return new; end $$;
create trigger actualizada before update on prevencion.fichas for each row execute function prevencion._ficha_actualizada();

-- ---------- funciones ----------
alter default privileges in schema prevencion revoke execute on functions from public;

-- Enviar (o volver a avisar) la charla de un mes a los previstos. Deja la fecha del primer envío.
create or replace function prevencion.enviar_charla(p_sesion uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare s prevencion.sesiones;
begin
  select * into s from prevencion.sesiones where id = p_sesion;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.charla.editar', s.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if s.cerrada_en is not null then raise exception 'CERRADA'; end if;
  if cardinality(s.previstos) = 0 then raise exception 'SIN_PREVISTOS'; end if;
  update prevencion.sesiones set enviada_en = coalesce(enviada_en, now()) where id = p_sesion;
  return (select count(*) from unnest(s.previstos) x
           where not exists (select 1 from prevencion.asistencias a where a.sesion_id = s.id and a.persona_id = x and a.anulada is null));
end $$;

-- Firmar la charla: el propio trabajador (si se le ha enviado) o, en su móvil, quien tenga «prevencion.firma.recoger».
create or replace function prevencion.firmar_charla(p_sesion uuid, p_persona uuid, p_puesto text, p_imagen text, p_dispositivo jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s prevencion.sesiones; v_yo uuid := prevencion.mi_persona(); v_recoge boolean; v_nombre text; v_firma uuid; v_asis uuid;
begin
  select * into s from prevencion.sesiones where id = p_sesion;
  if not found then raise exception 'NO_EXISTE'; end if;
  v_recoge := nucleo.tiene_permiso('prevencion.firma.recoger', s.empresa_id);
  if not (p_persona = v_yo or v_recoge) then raise exception 'NO_PERMISO'; end if;
  if not v_recoge and (s.enviada_en is null or not (p_persona = any(s.previstos))) then raise exception 'NO_ENVIADA'; end if;
  if s.cerrada_en is not null then raise exception 'CERRADA'; end if;
  select p.nombre into v_nombre from nucleo.personas p where p.id = p_persona and p.empresa_id = s.empresa_id and p.baja is null;
  if v_nombre is null then raise exception 'NO_EXISTE'; end if;
  if exists (select 1 from prevencion.asistencias a where a.sesion_id = s.id and a.persona_id = p_persona and a.anulada is null) then raise exception 'YA_FIRMADO'; end if;
  if p_imagen is null or p_imagen !~ '^data:image/png;base64,' then raise exception 'FIRMA_MAL'; end if;
  insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, imagen, sha256_documento, firmado_por, dispositivo)
  values (s.empresa_id, 'prevencion', 'charla', s.id, p_persona, p_imagen, prevencion.huella_charla(s.id), auth.uid(), p_dispositivo)
  returning id into v_firma;
  insert into prevencion.asistencias (empresa_id, sesion_id, persona_id, nombre, puesto, firma_id)
  values (s.empresa_id, s.id, p_persona, v_nombre,
          coalesce(nullif(left(trim(p_puesto), 80), ''), (select f.puesto from prevencion.fichas f where f.persona_id = p_persona),
                   (select p.categoria from nucleo.personas p where p.id = p_persona)), v_firma)
  returning id into v_asis;
  -- quien firma sin estar en la lista (recogida por el jefe) pasa a estar prevista
  if not (p_persona = any(s.previstos)) then
    update prevencion.sesiones set previstos = array_append(previstos, p_persona) where id = s.id;
  end if;
  return v_asis;
end $$;

-- Anular una firma mal hecha (antes de cerrar). La firma queda guardada; la asistencia deja de contar.
create or replace function prevencion.anular_asistencia(p_asistencia uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a prevencion.asistencias;
begin
  select * into a from prevencion.asistencias where id = p_asistencia;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.firma.anular', a.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if exists (select 1 from prevencion.sesiones s where s.id = a.sesion_id and s.cerrada_en is not null) then raise exception 'CERRADA'; end if;
  update prevencion.asistencias set anulada = now(), anulada_por = auth.uid() where id = p_asistencia;
end $$;

-- Cerrar (o reabrir) la sesión de un mes.
create or replace function prevencion.cerrar_sesion(p_sesion uuid, p_cerrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s prevencion.sesiones;
begin
  select * into s from prevencion.sesiones where id = p_sesion;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.charla.editar', s.empresa_id) then raise exception 'NO_PERMISO'; end if;
  update prevencion.sesiones set cerrada_en = case when p_cerrar then coalesce(cerrada_en, now()) end where id = p_sesion;
end $$;

grant execute on function prevencion.mi_persona(), prevencion.huella_charla(uuid), prevencion.enviar_charla(uuid),
  prevencion.firmar_charla(uuid, uuid, text, text, jsonb), prevencion.anular_asistencia(uuid),
  prevencion.cerrar_sesion(uuid, boolean) to authenticated;
revoke execute on function prevencion._sesion_cerrada(), prevencion._charla_firmada(), prevencion._asistencia_inmutable(),
  prevencion._ficha_actualizada() from public, authenticated;
