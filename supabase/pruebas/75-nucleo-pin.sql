-- Entrar con código de alta + PIN (0035). Unidades y personas inventadas.
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

insert into nucleo.empresas (id, codigo, nombre) values
  ('a8a8a8a8-0000-0000-0000-000000000001', 'unidad-p', 'Unidad P'), ('a8a8a8a8-0000-0000-0000-000000000002', 'unidad-q', 'Unidad Q');
insert into nucleo.personas (id, empresa_id, nombre, baja) values
  ('a8a8a8a8-0000-0000-0000-0000000000f1', 'a8a8a8a8-0000-0000-0000-000000000001', 'Ana Prueba', null),
  ('a8a8a8a8-0000-0000-0000-0000000000f2', 'a8a8a8a8-0000-0000-0000-000000000001', 'Bea Prueba', null),
  ('a8a8a8a8-0000-0000-0000-0000000000f3', 'a8a8a8a8-0000-0000-0000-000000000001', 'Ciro Antiguo', now()),
  ('a8a8a8a8-0000-0000-0000-0000000000f4', 'a8a8a8a8-0000-0000-0000-000000000001', 'Admin Persona', null),
  ('a8a8a8a8-0000-0000-0000-0000000000f9', 'a8a8a8a8-0000-0000-0000-000000000002', 'Quique Prueba', null);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000008a0a1', 'admin@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000008a0b2', 'bea@ejemplo.invalid'), ('00000000-0000-0000-0000-00000008a0e1', null);
insert into nucleo.usuarios (id, nombre, email, persona_id) values
  ('00000000-0000-0000-0000-00000008a0a1', 'Admin P', 'admin@ejemplo.invalid', 'a8a8a8a8-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-00000008a0b2', 'Bea', 'bea@ejemplo.invalid', 'a8a8a8a8-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-00000008a0e1', 'Encargado P', null, null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'a8a8a8a8-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000008a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000008a0e1', 'encargado'),
               ('00000000-0000-0000-0000-00000008a0b2', 'operario')) x(u, r);
create temp table v (k text primary key, s text);
grant all on v to authenticated, service_role;
insert into v values ('operario', (select id::text from nucleo.roles where codigo = 'operario' and empresa_id is null));

-- ---------- sacar códigos ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000008a0a1', true);
insert into v select 'c1', nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f1', (select s::uuid from v where k = 'operario'));
select pruebas.ok((select s ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$' from v where k = 'c1'), 'el código tiene 8 letras y cifras fáciles de dictar (XXXX-XXXX)');
select pruebas.ok((select count(*) = 1 from nucleo.codigos_alta where persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f1'), 'el administrador ve el código pendiente');
select pruebas.ok((select caduca between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute' from nucleo.codigos_alta), 'caduca a los 7 días');
select pruebas.falla($q$select codigo_hash from nucleo.codigos_alta$q$, 'la huella del código no se puede leer desde la app');
select pruebas.falla($q$select nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f3', (select s::uuid from v where k = 'operario'))$q$, 'a quien está de baja, no');
select pruebas.falla($q$select nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f9', (select s::uuid from v where k = 'operario'))$q$, 'a uno de otra unidad, no');
select pruebas.falla($q$select nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f2', (select s::uuid from v where k = 'operario'))$q$, 'a quien ya entra con correo, no');
select pruebas.falla($q$select nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f4', (select s::uuid from v where k = 'operario'))$q$, 'ni a sí mismo');
select pruebas.falla($q$select nucleo.pin_codigo('XXXX-XXXX')$q$, 'la app no puede llamar a lo de la función de servidor');
select pruebas.falla($q$select nucleo.pin_entrar(gen_random_uuid(), 'x', '1234')$q$, 'ni a entrar');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000008a0e1', true);
select pruebas.falla($q$select nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f1', (select s::uuid from v where k = 'operario'))$q$, 'el encargado no puede sacar códigos');
select pruebas.ok((select count(*) = 0 from nucleo.codigos_alta), 'ni los ve');
reset role;

-- ---------- la función de servidor: comprobar y gastar el código ----------
set role service_role;
select pruebas.ok((select nucleo.pin_codigo(lower(replace(s, '-', ' '))) ->> 'nombre' = 'Ana Prueba' from v where k = 'c1'), 'el código vale escrito en minúsculas y con espacio');
select pruebas.ok((select nucleo.pin_codigo(s) -> 'usuario_id' = 'null'::jsonb from v where k = 'c1'), 'Ana todavía no tiene usuario');
select pruebas.ok(nucleo.pin_codigo('AAAA-BBBB') ->> 'error' = 'CODIGO', 'un código inventado no vale');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000008a0f1', 'pin-a8a8a8a8-0000-0000-0000-0000000000f1@pin.invalid');
set role service_role;
select pruebas.ok((select nucleo.pin_alta(s, '00000000-0000-0000-0000-00000008a0f1', repeat('k', 64), '12a4') ->> 'error' = 'PIN_MAL' from v where k = 'c1'), 'el PIN tiene que ser de 4 cifras');
select pruebas.ok((select nucleo.pin_alta(s, '00000000-0000-0000-0000-00000008a0f1', 'corta', '1234') ->> 'error' = 'LLAVE' from v where k = 'c1'), 'la llave del móvil tiene que ser larga');
insert into v select 'alta', nucleo.pin_alta(s, '00000000-0000-0000-0000-00000008a0f1', repeat('k', 64), '2580')::text from v where k = 'c1';
insert into v select 'm1', (s::jsonb ->> 'movil') from v where k = 'alta';
select pruebas.ok((select s::jsonb ->> 'nombre' = 'Ana Prueba' from v where k = 'alta'), 'alta hecha');
select pruebas.ok((select persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f1' and email is null from nucleo.usuarios where id = '00000000-0000-0000-0000-00000008a0f1'),
  'Ana ya es usuaria, enlazada con su ficha y sin correo');
select pruebas.ok((select count(*) = 1 from nucleo.asignaciones a join nucleo.roles r on r.id = a.rol_id
  where a.usuario_id = '00000000-0000-0000-0000-00000008a0f1' and r.codigo = 'operario'), 'con el rol de operario');
select pruebas.ok((select pin_hash <> '2580' and llave_hash <> repeat('k', 64) and length(pin_hash) = 64 from nucleo.moviles), 'solo se guardan huellas');
select pruebas.ok((select nucleo.pin_alta(s, '00000000-0000-0000-0000-00000008a0f1', repeat('k', 64), '2580') ->> 'error' = 'CODIGO' from v where k = 'c1'), 'el código sirve una sola vez');

-- ---------- entrar ----------
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '2580') ->> 'usuario' = '00000000-0000-0000-0000-00000008a0f1' from v where k = 'm1'), 'con su móvil y su PIN, entra');
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('x', 64), '2580') ->> 'error' = 'MOVIL' from v where k = 'm1'), 'con el PIN bueno pero desde otro móvil, no');
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '0000') = '{"error": "PIN", "quedan": 4}'::jsonb from v where k = 'm1'), 'PIN mal: le quedan 4 intentos');
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '2580') ? 'usuario' from v where k = 'm1'), 'acertar pone los fallos a cero');
select pruebas.ok((select fallos = 0 and ultimo is not null from nucleo.moviles where id = (select s::uuid from v where k = 'm1')), 'y apunta cuándo entró');
select nucleo.pin_entrar((select s::uuid from v where k = 'm1'), repeat('k', 64), '1111') from generate_series(1, 4);
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '1111') ->> 'error' = 'BLOQUEADO' from v where k = 'm1'), 'al quinto fallo seguido se bloquea');
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '2580') ->> 'error' = 'BLOQUEADO' from v where k = 'm1'), 'y ya no entra ni con el PIN bueno');
reset role;

-- ---------- olvidó el PIN / bloqueado: otro código ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000008a0a1', true);
select pruebas.ok((select bloqueado is not null and fallos = 5 from nucleo.moviles where usuario_id = '00000000-0000-0000-0000-00000008a0f1'), 'el administrador ve que está bloqueado');
insert into v select 'c2', nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f1', (select s::uuid from v where k = 'operario'));
select pruebas.ok((select count(*) = 0 from nucleo.moviles where usuario_id = '00000000-0000-0000-0000-00000008a0f1' and baja is null), 'al sacar otro código, el móvil anterior deja de servir');
insert into v select 'c3', nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f1', (select s::uuid from v where k = 'operario'));
select pruebas.ok((select count(*) = 1 from nucleo.codigos_alta where persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f1' and usado is null and anulado is null), 'y el código anterior sin usar, también');
reset role;
set role service_role;
select pruebas.ok((select nucleo.pin_codigo(s) ->> 'error' = 'CODIGO' from v where k = 'c2'), 'el código anulado ya no vale');
select pruebas.ok((select nucleo.pin_codigo(s) ->> 'usuario_id' = '00000000-0000-0000-0000-00000008a0f1' from v where k = 'c3'), 'el nuevo sabe que Ana ya tiene usuario (no se le hace otro)');
select pruebas.ok((select nucleo.pin_alta(s, gen_random_uuid(), repeat('n', 64), '1357') ->> 'error' = 'OTRO_USUARIO' from v where k = 'c3'), 'no se le puede poner a otra cuenta');
insert into v select 'm2', nucleo.pin_alta(s, '00000000-0000-0000-0000-00000008a0f1', repeat('n', 64), '1357') ->> 'movil' from v where k = 'c3';
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('n', 64), '1357') ? 'usuario' from v where k = 'm2'), 'con el móvil nuevo y su PIN nuevo, entra');
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('k', 64), '2580') ->> 'error' = 'MOVIL' from v where k = 'm1'), 'el móvil viejo no');
select pruebas.ok((select count(*) = 1 from nucleo.usuarios where persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f1'), 'sigue siendo un solo usuario');
reset role;

-- ---------- baja ----------
update nucleo.personas set baja = now() where id = 'a8a8a8a8-0000-0000-0000-0000000000f1';
set role service_role;
select pruebas.ok((select nucleo.pin_entrar(s::uuid, repeat('n', 64), '1357') ->> 'error' = 'BAJA' from v where k = 'm2'), 'quien está de baja ya no entra');
reset role;

-- ---------- anular un código ----------
insert into nucleo.personas (id, empresa_id, nombre) values ('a8a8a8a8-0000-0000-0000-0000000000f5', 'a8a8a8a8-0000-0000-0000-000000000001', 'Dani Prueba');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000008a0a1', true);
insert into v select 'c4', nucleo.codigo_alta('a8a8a8a8-0000-0000-0000-0000000000f5', (select s::uuid from v where k = 'operario'));
select nucleo.codigo_anular((select id from nucleo.codigos_alta where persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f5'));
select pruebas.ok((select anulado is not null from nucleo.codigos_alta where persona_id = 'a8a8a8a8-0000-0000-0000-0000000000f5'), 'un código sin usar se puede anular');
reset role;
select pruebas.ok((select count(*) > 0 from nucleo.historial where tabla = 'codigos_alta'), 'los códigos quedan en el historial');

rollback;
