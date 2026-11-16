-- =====================================================================================
-- 0031 · AVISOS AL MÓVIL (notificaciones «push»; parte 6)
-- Con el «sí» de Cristian (16/11). Cómo funciona:
--  · Cada móvil se apunta una vez («Recibir avisos en este móvil»): nucleo.suscripciones.
--  · Cada vez que se apunta algo en la bandeja (nucleo.notificaciones), la base de datos llama a la función de servidor
--    «avisos» (supabase/functions/avisos), que lo manda a los móviles de esa persona. Por si falla, cada 5 minutos
--    se vuelve a llamar si queda algo sin mandar (de las últimas 24 h).
--  · Las claves (las del «push» y la contraseña entre la base de datos y la función) se guardan en la caja fuerte de
--    Supabase (Vault). La contraseña se crea aquí sola; las claves del «push» las crea la función la primera vez.
--    Nadie tiene que copiarlas. Solo la clave pública sale a la app (hace falta para apuntar el móvil).
-- =====================================================================================

-- ---------- móviles apuntados ----------
create table nucleo.suscripciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references nucleo.usuarios(id),
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh      text not null check (length(p256dh) <= 200),
  auth        text not null check (length(auth) <= 100),
  agente      text check (agente is null or length(agente) <= 300),
  activo      boolean not null default true,
  fallos      int not null default 0,
  creado      timestamptz not null default now(),
  ultimo_uso  timestamptz
);
create index on nucleo.suscripciones (usuario_id) where activo;
comment on table nucleo.suscripciones is 'Móviles (navegadores) apuntados para recibir avisos de cada usuario. Los mantiene la función «avisos» (se apagan si el móvil ya no existe).';
alter table nucleo.suscripciones enable row level security;
grant select on nucleo.suscripciones to authenticated;
grant all on nucleo.suscripciones to service_role;
create policy ver on nucleo.suscripciones for select to authenticated using (usuario_id = auth.uid());

create or replace function nucleo.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from nucleo.usuarios u where u.id = auth.uid() and u.baja is null) then raise exception 'NO_PERMISO'; end if;
  insert into nucleo.suscripciones (usuario_id, endpoint, p256dh, auth, agente)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_agente, 300))
  on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
    agente = excluded.agente, activo = true, fallos = 0;
end $$;
create or replace function nucleo.quitar_suscripcion(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  update nucleo.suscripciones set activo = false where endpoint = p_endpoint and usuario_id = auth.uid()
$$;

-- ---------- claves en la caja fuerte ----------
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_secreto') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'push_secreto',
      'Contraseña entre la base de datos y la función «avisos» (la crea la migración 0031).');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_url') then
    perform vault.create_secret('https://whemhkcrgwyjucpaswrm.supabase.co/functions/v1/avisos', 'push_url', 'Dirección de la función «avisos».');
  end if;
end $$;

-- la clave pública del «push» (la app la necesita para apuntar el móvil). Si aún no existe, se le pide a la función
-- que la cree (tarda unos segundos) y se devuelve null: la app dice «inténtalo en un momento».
create or replace function nucleo.clave_push() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select decrypted_secret into c from vault.decrypted_secrets where name = 'push_publica';
  if c is null and auth.uid() is not null then perform nucleo._push_lanzar(); end if;
  return c;
end $$;

-- solo para la función «avisos» (con la clave de servidor): leer y guardar las claves
create or replace function nucleo._push_config(p_secreto text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_secreto is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto') then raise exception 'NO_PERMISO'; end if;
  return jsonb_build_object('publica', (select decrypted_secret from vault.decrypted_secrets where name = 'push_publica'),
                            'privada', (select decrypted_secret from vault.decrypted_secrets where name = 'push_privada'));
end $$;
create or replace function nucleo._push_guardar_claves(p_secreto text, p_publica text, p_privada text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secreto is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto') then raise exception 'NO_PERMISO'; end if;
  if exists (select 1 from vault.decrypted_secrets where name = 'push_publica') then return; end if;   -- ya hay: no se cambian
  perform vault.create_secret(p_publica, 'push_publica', 'Clave pública de los avisos al móvil (VAPID).');
  perform vault.create_secret(p_privada, 'push_privada', 'Clave privada de los avisos al móvil (VAPID). No sale de Supabase.');
end $$;

-- lo que hay que mandar: notificaciones sin mandar de las últimas 24 h, con los móviles de cada uno
create or replace function nucleo._push_pendientes(p_secreto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_secreto is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto') then raise exception 'NO_PERMISO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'texto', n.texto, 'ruta', n.ruta, 'etiqueta', n.etiqueta, 'urgente', n.urgente,
             'moviles', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                           from nucleo.suscripciones s where s.usuario_id = n.usuario_id and s.activo))
           order by n.id)
      from (select * from nucleo.notificaciones where enviado is null and creado > now() - interval '24 hours' order by id limit 200) n), '[]'::jsonb);
end $$;

-- lo que ha pasado al mandar: notificaciones mandadas y móviles que ya no existen
create or replace function nucleo._push_resultado(p_secreto text, p_enviadas bigint[], p_errores jsonb, p_muertos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secreto is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto') then raise exception 'NO_PERMISO'; end if;
  update nucleo.notificaciones set enviado = now() where id = any(coalesce(p_enviadas, '{}'));
  update nucleo.notificaciones n set envio_error = left(e.value, 300)
    from jsonb_each_text(coalesce(p_errores, '{}')) e where n.id = e.key::bigint;
  update nucleo.suscripciones set activo = false where endpoint = any(coalesce(p_muertos, '{}'));
  update nucleo.suscripciones s set ultimo_uso = now()
   where s.activo and exists (select 1 from nucleo.notificaciones n where n.id = any(coalesce(p_enviadas, '{}')) and n.usuario_id = s.usuario_id);
end $$;

-- ---------- avisar a la función ----------
create or replace function nucleo._push_lanzar() returns void
language plpgsql security definer set search_path = '' as $$
declare url text; secreto text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'push_secreto';
  if url is null or secreto is null then return; end if;
  perform net.http_post(url := url, body := jsonb_build_object('secreto', secreto),
                        headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
exception when others then
  raise warning 'avisos al móvil: %', sqlerrm;                               -- nunca impide guardar
end $$;

create or replace function nucleo._push_tras_notificar() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- solo si alguien de los avisados tiene un móvil apuntado
  if exists (select 1 from nuevas n join nucleo.suscripciones s on s.usuario_id = n.usuario_id and s.activo) then
    perform nucleo._push_lanzar();
  end if;
  return null;
end $$;
create trigger mandar after insert on nucleo.notificaciones referencing new table as nuevas
  for each statement execute function nucleo._push_tras_notificar();

-- por si alguna llamada falla: cada 5 minutos, si queda algo sin mandar con móvil apuntado
create or replace function nucleo._push_reintentar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from nucleo.notificaciones n join nucleo.suscripciones s on s.usuario_id = n.usuario_id and s.activo
              where n.enviado is null and n.creado > now() - interval '24 hours' and n.creado < now() - interval '1 minute') then
    perform nucleo._push_lanzar();
  end if;
end $$;
select cron.schedule('avisos-al-movil', '*/5 * * * *', 'select nucleo._push_reintentar()');

grant execute on function nucleo.guardar_suscripcion(text, text, text, text), nucleo.quitar_suscripcion(text), nucleo.clave_push() to authenticated;
revoke execute on function nucleo._push_config(text), nucleo._push_guardar_claves(text, text, text), nucleo._push_pendientes(text),
  nucleo._push_resultado(text, bigint[], jsonb, text[]), nucleo._push_lanzar(), nucleo._push_tras_notificar(), nucleo._push_reintentar() from public, authenticated, anon;
grant execute on function nucleo._push_config(text), nucleo._push_guardar_claves(text, text, text), nucleo._push_pendientes(text),
  nucleo._push_resultado(text, bigint[], jsonb, text[]) to service_role;
