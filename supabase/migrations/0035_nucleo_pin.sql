-- Parte 8 · Entrar con código de alta + PIN (decidido por Cristian el 21/11).
-- · Quien puede dar acceso saca un CÓDIGO DE ALTA para un trabajador (sirve una vez y caduca a los 7 días).
-- · El operario lo abre en su móvil y elige un PIN de 4 cifras. Su móvil guarda una llave secreta que solo tiene él.
-- · Para entrar hacen falta las dos cosas: ese móvil (la llave) y el PIN. 5 PIN mal seguidos bloquean el móvil.
-- · Si olvida el PIN, cambia de móvil o se bloquea: se le da otro código (el móvil anterior deja de servir al momento).
-- Aquí solo se guardan las «huellas» (sha256) del código, de la llave y del PIN, nunca los de verdad.
-- La cuenta de Supabase (sin correo de verdad) y la sesión las hace la función de servidor «pin», que es la única que
-- puede llamar a pin_codigo / pin_alta / pin_entrar.

-- ---------- códigos de alta ----------
create table nucleo.codigos_alta (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  persona_id   uuid not null references nucleo.personas(id),
  rol_id       uuid not null references nucleo.roles(id),
  centro_id    uuid,
  codigo_hash  text not null unique,
  caduca       timestamptz not null default now() + interval '7 days',
  usado        timestamptz,
  usado_por    uuid references nucleo.usuarios(id),
  anulado      timestamptz,
  creado       timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.codigos_alta is 'Códigos para dar de alta el móvil de un operario (entrar con PIN). Una vez, 7 días. Solo la huella del código.';
create index on nucleo.codigos_alta (persona_id);

-- ---------- móviles con PIN ----------
create table nucleo.moviles (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references nucleo.usuarios(id) on delete cascade,
  empresa_id   uuid not null references nucleo.empresas(id),
  llave_hash   text not null,
  sal          text not null,
  pin_hash     text not null,
  fallos       int not null default 0,
  bloqueado    timestamptz,
  ultimo       timestamptz,
  baja         timestamptz,
  creado       timestamptz not null default now(),
  creado_por   uuid
);
comment on table nucleo.moviles is 'El móvil con el que entra cada operario con su PIN (uno activo por persona). Solo huellas de la llave y del PIN.';
create unique index moviles_uno_activo on nucleo.moviles (usuario_id) where baja is null;

alter table nucleo.codigos_alta enable row level security;
alter table nucleo.moviles enable row level security;
-- las huellas no las lee nadie desde la app: solo estas columnas
grant select (id, empresa_id, persona_id, rol_id, centro_id, caduca, usado, usado_por, anulado, creado, creado_por) on nucleo.codigos_alta to authenticated;
grant select (id, usuario_id, empresa_id, fallos, bloqueado, ultimo, baja, creado) on nucleo.moviles to authenticated;
grant all on nucleo.codigos_alta, nucleo.moviles to service_role;
create policy ver on nucleo.codigos_alta for select to authenticated using (nucleo.tiene_permiso('nucleo.usuario.ver', empresa_id));
create policy ver on nucleo.moviles for select to authenticated using (usuario_id = auth.uid() or nucleo.tiene_permiso('nucleo.usuario.ver', empresa_id));
select nucleo.activar_historial('nucleo.codigos_alta');
select nucleo.activar_historial('nucleo.moviles');

-- ---------- ayudas ----------
create or replace function nucleo._huella(p text) returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;
/** El código sin guiones ni espacios y en mayúsculas («k7p2 9qxm» = «K7P2-9QXM»). */
create or replace function nucleo._codigo_limpio(p text) returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
revoke execute on function nucleo._huella(text), nucleo._codigo_limpio(text) from public, anon;

-- ---------- sacar un código de alta (desde la app, quien puede dar acceso) ----------
create or replace function nucleo.codigo_alta(p_persona uuid, p_rol uuid, p_centro uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- sin I, L, O, 0 ni 1 (se confunden)
  v_cod text := '';
begin
  select empresa_id into v_emp from nucleo.personas where id = p_persona and baja is null;
  if v_emp is null then raise exception 'PERSONA'; end if;
  if not nucleo.tiene_permiso('nucleo.usuario.editar', v_emp, p_centro) then raise exception 'NO_PERMISO'; end if;
  if not exists (select 1 from nucleo.roles r where r.id = p_rol and r.baja is null and (r.empresa_id is null or r.empresa_id = v_emp)) then
    raise exception 'ROL';
  end if;
  if exists (select 1 from nucleo.usuarios u where u.persona_id = p_persona and u.id = auth.uid()) then raise exception 'A_TI_MISMO'; end if;
  if exists (select 1 from nucleo.usuarios u where u.persona_id = p_persona and u.email is not null) then raise exception 'TIENE_CORREO'; end if;

  -- lo anterior deja de valer: códigos sin usar y el móvil que tuviera
  update nucleo.codigos_alta set anulado = now() where persona_id = p_persona and usado is null and anulado is null;
  update nucleo.moviles set baja = now() where baja is null and usuario_id in (select u.id from nucleo.usuarios u where u.persona_id = p_persona);

  for i in 1..8 loop
    v_cod := v_cod || substr(v_letras, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(v_letras), 1);
  end loop;
  insert into nucleo.codigos_alta (empresa_id, persona_id, rol_id, centro_id, codigo_hash)
    values (v_emp, p_persona, p_rol, p_centro, nucleo._huella(v_cod));
  return substr(v_cod, 1, 4) || '-' || substr(v_cod, 5, 4);
end $$;
revoke execute on function nucleo.codigo_alta(uuid, uuid, uuid) from public, anon;
grant execute on function nucleo.codigo_alta(uuid, uuid, uuid) to authenticated;

/** Anular un código que aún no se ha usado. */
create or replace function nucleo.codigo_anular(p_codigo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from nucleo.codigos_alta where id = p_codigo and usado is null and anulado is null;
  if v_emp is null then raise exception 'CODIGO'; end if;
  if not nucleo.tiene_permiso('nucleo.usuario.editar', v_emp) then raise exception 'NO_PERMISO'; end if;
  update nucleo.codigos_alta set anulado = now() where id = p_codigo;
end $$;
revoke execute on function nucleo.codigo_anular(uuid) from public, anon;
grant execute on function nucleo.codigo_anular(uuid) to authenticated;

-- ---------- lo que usa la función de servidor «pin» (solo ella) ----------
/** ¿Vale este código? Devuelve de quién es (y si ya tiene usuario), o {error}. No lo gasta. */
create or replace function nucleo.pin_codigo(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('persona_id', p.id, 'nombre', p.nombre, 'empresa_id', c.empresa_id,
                              'usuario_id', (select u.id from nucleo.usuarios u where u.persona_id = p.id order by u.creado limit 1))
    from nucleo.codigos_alta c join nucleo.personas p on p.id = c.persona_id and p.baja is null
    where c.codigo_hash = nucleo._huella(nucleo._codigo_limpio(p_codigo)) and c.usado is null and c.anulado is null and c.caduca > now()
  ), jsonb_build_object('error', 'CODIGO'))
$$;

/** Gasta el código: alta en la app (si no la tenía), su rol y su móvil con la huella de la llave y del PIN. */
create or replace function nucleo.pin_alta(p_codigo text, p_usuario uuid, p_llave text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c nucleo.codigos_alta%rowtype;
  v_ya uuid;
  v_nombre text;
  v_sal text := gen_random_uuid()::text;
  v_movil uuid;
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return jsonb_build_object('error', 'PIN_MAL'); end if;
  if length(coalesce(p_llave, '')) < 32 then return jsonb_build_object('error', 'LLAVE'); end if;
  select * into c from nucleo.codigos_alta
    where codigo_hash = nucleo._huella(nucleo._codigo_limpio(p_codigo)) and usado is null and anulado is null and caduca > now()
    for update;
  if not found then return jsonb_build_object('error', 'CODIGO'); end if;
  select nombre into v_nombre from nucleo.personas where id = c.persona_id and baja is null;
  if v_nombre is null then return jsonb_build_object('error', 'CODIGO'); end if;

  select u.id into v_ya from nucleo.usuarios u where u.persona_id = c.persona_id order by u.creado limit 1;
  if v_ya is not null and v_ya <> p_usuario then return jsonb_build_object('error', 'OTRO_USUARIO'); end if;
  if v_ya is null then
    insert into nucleo.usuarios (id, nombre, persona_id) values (p_usuario, v_nombre, c.persona_id);
  end if;
  insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id, centro_id)
    values (p_usuario, c.rol_id, c.empresa_id, c.centro_id) on conflict do nothing;
  update nucleo.asignaciones set hasta = null
    where usuario_id = p_usuario and rol_id = c.rol_id and empresa_id = c.empresa_id and centro_id is not distinct from c.centro_id;

  update nucleo.moviles set baja = now() where usuario_id = p_usuario and baja is null;
  insert into nucleo.moviles (usuario_id, empresa_id, llave_hash, sal, pin_hash, creado_por)
    values (p_usuario, c.empresa_id, nucleo._huella(p_llave), v_sal, nucleo._huella(v_sal || ':' || p_pin), c.creado_por)
    returning id into v_movil;
  update nucleo.codigos_alta set usado = now(), usado_por = p_usuario where id = c.id;
  return jsonb_build_object('movil', v_movil, 'usuario', p_usuario, 'nombre', v_nombre);
end $$;

/** Entrar: este móvil (su llave) y su PIN. Los fallos se cuentan (por eso devuelve {error} en vez de dar error). */
create or replace function nucleo.pin_entrar(p_movil uuid, p_llave text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m nucleo.moviles%rowtype;
begin
  select * into m from nucleo.moviles where id = p_movil and baja is null for update;
  if not found or m.llave_hash <> nucleo._huella(p_llave) then return jsonb_build_object('error', 'MOVIL'); end if;
  if m.bloqueado is not null then return jsonb_build_object('error', 'BLOQUEADO'); end if;
  if not exists (select 1 from nucleo.usuarios u left join nucleo.personas p on p.id = u.persona_id
                 where u.id = m.usuario_id and u.baja is null and p.baja is null) then
    return jsonb_build_object('error', 'BAJA');
  end if;
  if m.pin_hash <> nucleo._huella(m.sal || ':' || coalesce(p_pin, '')) then
    update nucleo.moviles set fallos = fallos + 1, bloqueado = case when fallos + 1 >= 5 then now() end where id = m.id;
    return case when m.fallos + 1 >= 5 then jsonb_build_object('error', 'BLOQUEADO')
                else jsonb_build_object('error', 'PIN', 'quedan', 5 - (m.fallos + 1)) end;
  end if;
  update nucleo.moviles set fallos = 0, ultimo = now() where id = m.id;
  return jsonb_build_object('usuario', m.usuario_id);
end $$;

revoke execute on function nucleo.pin_codigo(text), nucleo.pin_alta(text, uuid, text, text), nucleo.pin_entrar(uuid, text, text)
  from public, anon, authenticated;
grant execute on function nucleo.pin_codigo(text), nucleo.pin_alta(text, uuid, text, text), nucleo.pin_entrar(uuid, text, text) to service_role;
grant execute on function nucleo._huella(text), nucleo._codigo_limpio(text) to service_role;
