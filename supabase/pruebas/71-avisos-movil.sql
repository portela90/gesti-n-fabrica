-- Avisos al móvil: apuntar el móvil, llamar a la función al notificar y lo que hace la función. Personas inventadas.
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

insert into nucleo.empresas (id, codigo, nombre) values ('a2a2a2a2-0000-0000-0000-000000000001', 'unidad-m', 'Unidad M');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000002a0a1'), ('00000000-0000-0000-0000-00000002a0b1');
insert into nucleo.usuarios (id, nombre) values ('00000000-0000-0000-0000-00000002a0a1', 'Mía'), ('00000000-0000-0000-0000-00000002a0b1', 'Bea');
create temp table secreto as select decrypted_secret s from vault.decrypted_secrets where name = 'push_secreto';
grant select on secreto to authenticated, service_role;
select pruebas.ok((select length(s) = 64 from secreto), 'la migración crea sola la contraseña entre la base de datos y la función');
select pruebas.ok((select count(*) = 1 from cron.job where jobname = 'avisos-al-movil'), 'y la tarea de reintentar cada 5 minutos');

-- Mía apunta su móvil
truncate net.llamadas;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000002a0a1', true);
select pruebas.ok(nucleo.clave_push() is null, 'sin claves todavía (las crea la función la primera vez)');
reset role;
select pruebas.ok((select count(*) = 1 from net.llamadas), 'y al pedirla se llama a la función para que las cree');
set role authenticated;
select nucleo.guardar_suscripcion('https://push.ejemplo.invalid/m1', 'clave-p256', 'clave-auth', 'Móvil de prueba');
select pruebas.ok((select count(*) = 1 from nucleo.suscripciones), 'Mía ve su móvil apuntado');
select pruebas.falla($q$select nucleo._push_pendientes((select s from secreto))$q$, 'la app no puede leer lo pendiente');
select pruebas.falla($q$select nucleo._push_config('cualquiera')$q$, 'ni las claves');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000002a0b1', true);
select pruebas.ok((select count(*) = 0 from nucleo.suscripciones), 'Bea no ve el móvil de Mía');
select nucleo.guardar_suscripcion('https://push.ejemplo.invalid/m1', 'clave-p256', 'clave-auth', 'El mismo navegador, ahora con Bea');
reset role;
select pruebas.ok((select usuario_id = '00000000-0000-0000-0000-00000002a0b1' from nucleo.suscripciones), 'si en ese navegador entra otra persona, el móvil pasa a ser suyo');
update nucleo.suscripciones set usuario_id = '00000000-0000-0000-0000-00000002a0a1';

-- notificar a quien tiene móvil llama a la función; a quien no, no
truncate net.llamadas;
select set_config('request.jwt.claim.sub', '', true);
select nucleo.notificar('a2a2a2a2-0000-0000-0000-000000000001', '{00000000-0000-0000-0000-00000002a0b1}', 'Para Bea, sin móvil');
select pruebas.ok((select count(*) = 0 from net.llamadas), 'a quien no tiene móvil apuntado no se llama a la función');
select nucleo.notificar('a2a2a2a2-0000-0000-0000-000000000001', '{00000000-0000-0000-0000-00000002a0a1}', 'Para Mía', 'Hola', '/m/limpieza');
select pruebas.ok((select count(*) = 1 and bool_and(url like '%/functions/v1/avisos' and body ->> 'secreto' = (select s from secreto)) from net.llamadas),
  'a quien sí, se llama a la función con la contraseña');

-- lo que hace la función (con la clave de servidor)
set role service_role;
select pruebas.falla($q$select nucleo._push_pendientes('mala')$q$, 'con otra contraseña no da nada');
select pruebas.ok((select jsonb_array_length(p) = 2 and p -> 1 ->> 'titulo' = 'Para Mía' and jsonb_array_length(p -> 1 -> 'moviles') = 1 and jsonb_array_length(p -> 0 -> 'moviles') = 0
  from (select nucleo._push_pendientes((select s from secreto)) p) x), 'la función recibe lo pendiente con los móviles de cada uno');
select nucleo._push_guardar_claves((select s from secreto), 'PUBLICA', 'PRIVADA');
select nucleo._push_guardar_claves((select s from secreto), 'OTRA', 'OTRA');
select pruebas.ok((select (c ->> 'publica') = 'PUBLICA' and (c ->> 'privada') = 'PRIVADA' from (select nucleo._push_config((select s from secreto)) c) x),
  'guarda las claves la primera vez y ya no las cambia');
select nucleo._push_resultado((select s from secreto), (select array_agg(id) from nucleo.notificaciones where titulo = 'Para Mía'), '{}', '{https://push.ejemplo.invalid/m1}');
reset role;
select pruebas.ok((select enviado is not null from nucleo.notificaciones where titulo = 'Para Mía'), 'apunta lo mandado');
select pruebas.ok((select not activo from nucleo.suscripciones), 'y apaga el móvil que ya no existe');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000002a0a1', true);
select pruebas.ok(nucleo.clave_push() = 'PUBLICA', 'la app ya puede leer la clave pública');
rollback;
