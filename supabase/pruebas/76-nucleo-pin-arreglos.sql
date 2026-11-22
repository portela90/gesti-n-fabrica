-- Arreglos del PIN (0036): pasar a PIN una ficha cuyos usuarios con correo ya no tienen roles, y «He olvidado mi PIN».
-- Unidades y personas inventadas.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
create function pruebas.falla(orden text, msg text) returns void language plpgsql as $$
begin
  begin execute orden; exception when others then raise notice 'ok: % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLA: % — debería haber dado error y no lo dio', msg;
end $$;
grant usage on schema pruebas to authenticated, service_role;
grant execute on all functions in schema pruebas to authenticated, service_role;

insert into nucleo.empresas (id, codigo, nombre) values ('a9a9a9a9-0000-0000-0000-000000000001', 'unidad-r', 'Unidad R');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('a9a9a9a9-0000-0000-0000-0000000000f1', 'a9a9a9a9-0000-0000-0000-000000000001', 'Rita Prueba'),
  ('a9a9a9a9-0000-0000-0000-0000000000f4', 'a9a9a9a9-0000-0000-0000-000000000001', 'Admin Persona');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000009a0a1', 'admin-r@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000009a0c1', 'rita@ejemplo.invalid'), ('00000000-0000-0000-0000-00000009a0c2', 'rita2@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000009a0f1', 'pin-a9a9a9a9-0000-0000-0000-0000000000f1@pin.invalid');
insert into nucleo.usuarios (id, nombre, email, persona_id) values
  ('00000000-0000-0000-0000-00000009a0a1', 'Admin R', 'admin-r@ejemplo.invalid', 'a9a9a9a9-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-00000009a0c1', 'Rita (correo)', 'rita@ejemplo.invalid', 'a9a9a9a9-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000009a0c2', 'Rita (otro correo)', 'rita2@ejemplo.invalid', 'a9a9a9a9-0000-0000-0000-0000000000f1');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'a9a9a9a9-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000009a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000009a0c1', 'operario')) x(u, r);
create temp table v (k text primary key, s text);
grant all on v to authenticated, service_role;

-- ---------- 1) ficha con correo ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000009a0a1', true);
select pruebas.falla($q$select nucleo.codigo_alta('a9a9a9a9-0000-0000-0000-0000000000f1', (select id from nucleo.roles where codigo = 'operario' and empresa_id is null))$q$,
  'mientras uno de sus usuarios con correo tenga un rol, no se le da código');
reset role;
delete from nucleo.asignaciones where usuario_id = '00000000-0000-0000-0000-00000009a0c1';
set role authenticated;
insert into v select 'c1', nucleo.codigo_alta('a9a9a9a9-0000-0000-0000-0000000000f1', (select id from nucleo.roles where codigo = 'operario' and empresa_id is null));
select pruebas.ok((select s is not null from v where k = 'c1'), 'quitados los roles, ya se le puede dar código');
reset role;
set role service_role;
select pruebas.ok((select nucleo.pin_codigo(s) -> 'usuario_id' = 'null'::jsonb from v where k = 'c1'), 'no se cuenta su usuario con correo como el del PIN');
insert into v select 'm1', nucleo.pin_alta(s, '00000000-0000-0000-0000-00000009a0f1', repeat('r', 64), '2580') ->> 'movil' from v where k = 'c1';
select pruebas.ok((select s is not null from v where k = 'm1'), 'alta hecha');
reset role;
select pruebas.ok((select count(*) = 0 from nucleo.usuarios where persona_id = 'a9a9a9a9-0000-0000-0000-0000000000f1' and email is not null),
  'los dos usuarios con correo se desenlazan de su ficha');
select pruebas.ok((select count(*) = 2 from nucleo.usuarios where id in ('00000000-0000-0000-0000-00000009a0c1', '00000000-0000-0000-0000-00000009a0c2')),
  'pero no se borran');
select pruebas.ok((select persona_id = 'a9a9a9a9-0000-0000-0000-0000000000f1' from nucleo.usuarios where id = '00000000-0000-0000-0000-00000009a0f1'),
  'y la ficha queda con su usuario de PIN');

-- ---------- 2) «He olvidado mi PIN» ----------
select set_config('request.jwt.claim.sub', '', true);   -- la función de servidor llama sin ser nadie
set role service_role;
select pruebas.ok(nucleo.pin_olvido((select s::uuid from v where k = 'm1'), repeat('x', 64)) ->> 'error' = 'MOVIL', 'sin la llave del móvil no se puede avisar');
select pruebas.ok(nucleo.pin_olvido((select s::uuid from v where k = 'm1'), repeat('r', 64)) ->> 'ok' = 'true', 'con su móvil, avisa');
select pruebas.ok(nucleo.pin_olvido((select s::uuid from v where k = 'm1'), repeat('r', 64)) ->> 'error' = 'YA_AVISADO', 'otra vez enseguida, no (uno cada 30 minutos)');
reset role;
select pruebas.ok((select count(*) = 1 from nucleo.notificaciones where usuario_id = '00000000-0000-0000-0000-00000009a0a1'
  and titulo = 'Rita Prueba ha olvidado su PIN' and ruta = '/config/usuarios'), 'al administrador le llega el aviso, con dónde darle el código');
update nucleo.moviles set aviso_olvido = now() - interval '31 minutes', bloqueado = now() where id = (select s::uuid from v where k = 'm1');
set role service_role;
select pruebas.ok(nucleo.pin_olvido((select s::uuid from v where k = 'm1'), repeat('r', 64)) ->> 'ok' = 'true', 'bloqueado y pasada media hora, puede volver a avisar');
reset role;
select pruebas.ok((select texto like 'Su móvil está bloqueado.%' from nucleo.notificaciones order by id desc limit 1), 'y el aviso dice que está bloqueado');
set role authenticated;
select pruebas.falla($q$select nucleo.pin_olvido(gen_random_uuid(), 'x')$q$, 'la app no puede llamar a lo del aviso directamente');
reset role;

rollback;
