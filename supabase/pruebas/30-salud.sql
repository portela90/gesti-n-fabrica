-- Panel de salud: solo el superadministrador ve las cifras, las copias y puede marcar errores como vistos.
begin;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
insert into nucleo.empresas (id, codigo, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'unidad-a', 'Unidad A');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000005a'), ('00000000-0000-0000-0000-0000000000a1');
insert into nucleo.usuarios (id, nombre, superadmin) values ('00000000-0000-0000-0000-00000000005a', 'Super', true), ('00000000-0000-0000-0000-0000000000a1', 'Admin A', false);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id) values
  ('00000000-0000-0000-0000-0000000000a1', (select id from nucleo.roles where codigo = 'admin_empresa'), 'aaaaaaaa-0000-0000-0000-000000000001');
insert into nucleo.copias (bytes, tablas) values (123456, 30);
insert into nucleo.errores (firma, mensaje) values ('e1', 'Algo falló');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin perform nucleo.salud(); raise exception 'FALLA: un administrador de unidad no debería ver la salud'; exception when others then
  if sqlerrm like 'FALLA%' then raise; end if; raise notice 'ok: un administrador de unidad no ve el panel de salud'; end $$;
select pg_temp.ok((select count(*) from nucleo.copias) = 0, 'ni las copias');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true);
select pg_temp.ok((nucleo.salud() ->> 'errores_sin_ver')::int = 1, 'el superadministrador ve los errores sin ver');
select pg_temp.ok((nucleo.salud() -> 'ultima_copia' ->> 'tablas')::int = 30, 'y la última copia');
update nucleo.errores set visto = true where firma = 'e1';
select pg_temp.ok((nucleo.salud() ->> 'errores_sin_ver')::int = 0, 'puede marcar un error como visto');
reset role;
select pg_temp.ok(not has_function_privilege('anon', 'nucleo.salud()', 'execute'), 'un anónimo no puede pedir la salud');
rollback;
