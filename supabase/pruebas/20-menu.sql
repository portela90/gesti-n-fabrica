-- El menú: qué módulos salen a cada uno (nucleo.mi_sesion). Empresas y personas inventadas.
begin;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
insert into nucleo.empresas (id, codigo, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'empresa-a', 'Empresa A');
insert into nucleo.empresa_modulos (empresa_id, modulo) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'coladas'), ('aaaaaaaa-0000-0000-0000-000000000001', 'almacen');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000c1');
insert into nucleo.usuarios (id, nombre) values ('00000000-0000-0000-0000-0000000000a1', 'Admin A'), ('00000000-0000-0000-0000-0000000000d1', 'Lectura A'), ('00000000-0000-0000-0000-0000000000c1', 'Operario A');
insert into nucleo.roles (id, empresa_id, codigo, nombre) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-000000000001', 'solo_almacen', 'Solo almacén');
insert into nucleo.rol_permisos values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'almacen.*.ver');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id) values
  ('00000000-0000-0000-0000-0000000000a1', (select id from nucleo.roles where codigo = 'admin_empresa'), 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000c1', (select id from nucleo.roles where codigo = 'operario'), 'aaaaaaaa-0000-0000-0000-000000000001');
grant execute on function pg_temp.ok(boolean, text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.ok((nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos') = '["coladas", "almacen"]', 'el administrador ve en el menú los módulos encendidos de su empresa');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select pg_temp.ok((nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos') = '["almacen"]', 'quien solo tiene Almacén ve solo Almacén');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.ok((nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos') = '[]', 'un operario no ve módulos hasta que cada módulo le dé sus tareas');
rollback;
