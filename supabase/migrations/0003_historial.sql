-- =====================================================================================
-- 0003 · HISTORIAL DE CAMBIOS (quién cambió qué y cuándo, con el antes y el después)
-- Un solo disparador para todas las tablas: cada módulo lo activa en las suyas con
-- nucleo.activar_historial('esquema.tabla'). El historial y las firmas no se pueden
-- cambiar ni borrar, ni siquiera desde el servidor.
-- =====================================================================================

create table nucleo.historial (
  id          bigint generated always as identity primary key,
  empresa_id  uuid references nucleo.empresas(id),
  modulo      text not null,
  tabla       text not null,
  fila        text,
  accion      text not null check (accion in ('crear', 'cambiar', 'borrar')),
  antes       jsonb,
  despues     jsonb,
  usuario_id  uuid,
  en          timestamptz not null default now()
);
comment on table nucleo.historial is 'Cada alta, cambio o borrado de las tablas con historial. modulo = el esquema de la tabla (nucleo, coladas…).';
create index on nucleo.historial (empresa_id, tabla, fila);
create index on nucleo.historial (en desc);

alter table nucleo.historial enable row level security;
grant select on nucleo.historial to authenticated;
grant all on nucleo.historial to service_role;
create policy ver on nucleo.historial for select to authenticated using (
  nucleo.soy_superadmin() or nucleo.tiene_permiso(modulo || '.historial.ver', empresa_id));

create or replace function nucleo._anotar_historial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_fila jsonb := coalesce(v_despues, v_antes);
  v_empresa uuid;
begin
  if tg_op = 'UPDATE' and v_antes = v_despues then return null; end if; -- no ha cambiado nada
  v_empresa := coalesce(
    (v_fila ->> 'empresa_id')::uuid,
    case when tg_table_schema = 'nucleo' and tg_table_name = 'empresas' then (v_fila ->> 'id')::uuid end,
    case when tg_table_schema = 'nucleo' and tg_table_name = 'rol_permisos'
         then (select r.empresa_id from nucleo.roles r where r.id = (v_fila ->> 'rol_id')::uuid) end);
  insert into nucleo.historial (empresa_id, modulo, tabla, fila, accion, antes, despues, usuario_id)
  values (v_empresa, tg_table_schema, tg_table_name,
          coalesce(v_fila ->> 'id', v_fila ->> 'codigo', v_fila ->> 'firma'),
          case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'cambiar' else 'borrar' end,
          v_antes, v_despues, auth.uid());
  return null;
end $$;
revoke execute on function nucleo._anotar_historial() from public, authenticated;

create or replace function nucleo.activar_historial(p_tabla regclass) returns void
language plpgsql as $$
begin
  execute format('drop trigger if exists historial on %s', p_tabla);
  execute format('create trigger historial after insert or update or delete on %s for each row execute function nucleo._anotar_historial()', p_tabla);
end $$;
revoke execute on function nucleo.activar_historial(regclass) from public, authenticated;

do $$ declare t text; begin foreach t in array array[
  'nucleo.empresas', 'nucleo.empresa_modulos', 'nucleo.centros', 'nucleo.ubicaciones', 'nucleo.turnos', 'nucleo.equipos',
  'nucleo.tipos_activo', 'nucleo.activos', 'nucleo.almacenes', 'nucleo.familias', 'nucleo.articulos', 'nucleo.proveedores',
  'nucleo.personas', 'nucleo.usuarios', 'nucleo.ajustes', 'nucleo.campos_extra', 'nucleo.roles', 'nucleo.rol_permisos',
  'nucleo.asignaciones', 'nucleo.archivos', 'nucleo.incidencias'] loop
  perform nucleo.activar_historial(t::regclass);
end loop; end $$;

-- ---------- lo que no se puede cambiar ni borrar nunca ----------
create or replace function nucleo._solo_anadir() returns trigger language plpgsql as $$
begin
  raise exception 'SOLO_ANADIR: en % no se cambia ni se borra; se añade un registro nuevo', tg_table_name;
end $$;
create trigger solo_anadir before update or delete on nucleo.historial for each row execute function nucleo._solo_anadir();
create trigger solo_anadir before update or delete on nucleo.firmas    for each row execute function nucleo._solo_anadir();
