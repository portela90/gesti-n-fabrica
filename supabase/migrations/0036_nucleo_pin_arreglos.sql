-- Parte 8 · Arreglos del PIN tras las pruebas de Cristian (22/11).
-- 1) Una ficha cuyos usuarios con correo ya no tienen ningún rol (se les quitó) sí puede pasar a entrar con PIN.
--    Al dar de alta el móvil, esos usuarios viejos se desenlazan de la ficha (queda en el historial) y se le hace su usuario con PIN.
-- 2) «He olvidado mi PIN»: desde la pantalla del PIN, el móvil (con su llave) avisa a quien puede dar acceso en su unidad.
--    Como mucho un aviso cada 30 minutos por móvil.

/** ¿Este usuario con correo sigue entrando? (tiene algún rol que vale hoy) */
create or replace function nucleo._entra_con_correo(p_persona uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nucleo.usuarios u join nucleo.asignaciones a on a.usuario_id = u.id and (a.hasta is null or a.hasta > now())
                 where u.persona_id = p_persona and u.email is not null and u.baja is null)
$$;
revoke execute on function nucleo._entra_con_correo(uuid) from public, anon, authenticated;

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
  if nucleo._entra_con_correo(p_persona) then raise exception 'TIENE_CORREO'; end if;

  update nucleo.codigos_alta set anulado = now() where persona_id = p_persona and usado is null and anulado is null;
  update nucleo.moviles set baja = now() where baja is null and usuario_id in (select u.id from nucleo.usuarios u where u.persona_id = p_persona);

  for i in 1..8 loop
    v_cod := v_cod || substr(v_letras, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(v_letras), 1);
  end loop;
  insert into nucleo.codigos_alta (empresa_id, persona_id, rol_id, centro_id, codigo_hash)
    values (v_emp, p_persona, p_rol, p_centro, nucleo._huella(v_cod));
  return substr(v_cod, 1, 4) || '-' || substr(v_cod, 5, 4);
end $$;

-- el usuario con PIN de la ficha es el que no tiene correo
create or replace function nucleo.pin_codigo(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('persona_id', p.id, 'nombre', p.nombre, 'empresa_id', c.empresa_id,
                              'usuario_id', (select u.id from nucleo.usuarios u where u.persona_id = p.id and u.email is null order by u.creado limit 1))
    from nucleo.codigos_alta c join nucleo.personas p on p.id = c.persona_id and p.baja is null
    where c.codigo_hash = nucleo._huella(nucleo._codigo_limpio(p_codigo)) and c.usado is null and c.anulado is null and c.caduca > now()
  ), jsonb_build_object('error', 'CODIGO'))
$$;

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
  if nucleo._entra_con_correo(c.persona_id) then return jsonb_build_object('error', 'TIENE_CORREO'); end if;

  -- los usuarios con correo que se quedaron sin roles dejan de ser este trabajador
  update nucleo.usuarios set persona_id = null where persona_id = c.persona_id and email is not null;

  select u.id into v_ya from nucleo.usuarios u where u.persona_id = c.persona_id order by u.creado limit 1;
  if v_ya is not null and v_ya <> p_usuario then return jsonb_build_object('error', 'OTRO_USUARIO'); end if;
  if v_ya is null then
    insert into nucleo.usuarios (id, nombre, persona_id) values (p_usuario, v_nombre, c.persona_id)
      on conflict (id) do update set persona_id = excluded.persona_id where nucleo.usuarios.email is null;
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

-- ---------- «He olvidado mi PIN» ----------
alter table nucleo.moviles add column aviso_olvido timestamptz;
grant select (aviso_olvido) on nucleo.moviles to authenticated;

/** El móvil (con su llave) avisa a quien puede dar acceso en su unidad. Vale aunque esté bloqueado o se le haya sacado otro código. */
create or replace function nucleo.pin_olvido(p_movil uuid, p_llave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m nucleo.moviles%rowtype;
  v_nombre text;
begin
  select * into m from nucleo.moviles where id = p_movil for update;
  if not found or m.llave_hash <> nucleo._huella(p_llave) then return jsonb_build_object('error', 'MOVIL'); end if;
  if m.aviso_olvido > now() - interval '30 minutes' then return jsonb_build_object('error', 'YA_AVISADO'); end if;
  select coalesce(p.nombre, u.nombre) into v_nombre
    from nucleo.usuarios u left join nucleo.personas p on p.id = u.persona_id where u.id = m.usuario_id and u.baja is null;
  if v_nombre is null then return jsonb_build_object('error', 'BAJA'); end if;
  update nucleo.moviles set aviso_olvido = now() where id = m.id;
  perform nucleo.notificar(m.empresa_id, nucleo.usuarios_con_permiso('nucleo.usuario.editar', m.empresa_id),
    v_nombre || ' ha olvidado su PIN',
    case when m.bloqueado is not null then 'Su móvil está bloqueado. ' else '' end || 'Dale un código de alta nuevo en Configuración → Usuarios.',
    '/config/usuarios', 'pin-' || m.usuario_id::text, false);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function nucleo.pin_olvido(uuid, text) from public, anon, authenticated;
grant execute on function nucleo.pin_olvido(uuid, text) to service_role;
