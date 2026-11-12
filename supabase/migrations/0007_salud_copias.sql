-- =====================================================================================
-- 0007 · SALUD DE LA APP: registro de copias de seguridad y una función con las cifras
-- que ve el superadministrador (espacio usado, última copia, errores, incidencias).
-- =====================================================================================

create table nucleo.copias (
  id      bigint generated always as identity primary key,
  en      timestamptz not null default now(),
  bytes   bigint not null check (bytes >= 0),
  tablas  int not null check (tablas >= 0),
  nota    text
);
comment on table nucleo.copias is 'Cada copia nocturna hecha por GitHub Actions (la copia cifrada se guarda fuera de Supabase).';
alter table nucleo.copias enable row level security;
grant select on nucleo.copias to authenticated;
grant all on nucleo.copias to service_role;
create policy ver on nucleo.copias for select to authenticated using (nucleo.soy_superadmin());

-- el superadministrador puede marcar errores como vistos
grant update (visto) on nucleo.errores to authenticated;
create policy marcar_visto on nucleo.errores for update to authenticated using (nucleo.soy_superadmin()) with check (nucleo.soy_superadmin());

-- cifras del panel de salud (solo superadministrador)
create or replace function nucleo.salud() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nucleo.soy_superadmin() then raise exception 'NO_PERMISO'; end if;
  return jsonb_build_object(
    'bd_bytes', pg_database_size(current_database()),
    'bd_limite', 500 * 1024 * 1024,
    'ultima_copia', (select jsonb_build_object('en', c.en, 'bytes', c.bytes, 'tablas', c.tablas) from nucleo.copias c order by c.en desc limit 1),
    'errores_sin_ver', (select count(*) from nucleo.errores where not visto),
    'errores_24h', (select count(*) from nucleo.errores where ultimo > now() - interval '24 hours'),
    'incidencias_abiertas', (select count(*) from nucleo.incidencias where estado <> 'cerrada'),
    'usuarios', (select count(*) from nucleo.usuarios where baja is null));
end $$;
revoke execute on function nucleo.salud() from public, anon;
grant execute on function nucleo.salud() to authenticated;

-- lo de 0006 (por si aún no se aplicó; repetirlo no hace daño)
alter function nucleo._asignacion_valida() set search_path = '';
alter function nucleo._solo_anadir() set search_path = '';
alter function nucleo.activar_historial(regclass) set search_path = '';
revoke execute on all functions in schema nucleo from public, anon;
grant execute on function nucleo.soy_superadmin(), nucleo.mis_empresas(), nucleo.empresa_de_persona(uuid),
  nucleo.tiene_permiso(text, uuid, uuid), nucleo.ve_modulo(text, uuid), nucleo.mi_sesion(),
  nucleo.anotar_error(text, text, text, text, text, text, uuid), nucleo.salud() to authenticated;
