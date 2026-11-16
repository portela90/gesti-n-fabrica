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

-- Almacén de archivos (Storage), lo justo para probar sus reglas: cubos, objetos y storage.foldername().
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid(),
  created_at timestamptz default now(), metadata jsonb
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text) to authenticated;

-- Caja fuerte (Vault), lo justo: guardar un secreto con nombre y leerlo.
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid
language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;

-- Llamadas web (pg_net): aquí solo se apuntan, para poder comprobar que se hacen.
create schema if not exists net;
create table if not exists net.llamadas (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.llamadas (url, body, headers) values (url, body, headers) returning id $$;

-- Tareas programadas (pg_cron): aquí solo se apuntan.
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
