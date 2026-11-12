-- SOLO PARA PRUEBAS EN LOCAL. Imita lo mínimo de Supabase para poder probar las migraciones
-- y los permisos en un Postgres normal: los roles anon / authenticated / service_role,
-- la tabla auth.users y la función auth.uid() (que en Supabase lee el usuario de la sesión).
-- En el Supabase de verdad todo esto ya existe y este archivo NO se aplica.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  creado timestamptz not null default now()
);

-- igual que en Supabase: el usuario sale de la configuración de la petición
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create extension if not exists pgcrypto;
