-- Día del cambio: borrar los datos de prueba (scripts/dia-del-cambio/borrar-pruebas.sql) con datos inventados.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('f1f1f1f1-0000-0000-0000-000000000001', 'limpieza-prueba', 'Limpieza');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('f1f1f1f1-0000-0000-0000-0000000000a1', 'f1f1f1f1-0000-0000-0000-000000000001', 'Jefe Inventado'),
  ('f1f1f1f1-0000-0000-0000-0000000000b1', 'f1f1f1f1-0000-0000-0000-000000000001', 'Operaria Inventada'),
  ('f1f1f1f1-0000-0000-0000-0000000000c1', 'f1f1f1f1-0000-0000-0000-000000000001', 'pruebas'),
  ('f1f1f1f1-0000-0000-0000-0000000000c2', 'f1f1f1f1-0000-0000-0000-000000000001', 'Pruebas 2');
insert into auth.users (id, email) values ('f1f1f1f1-0000-0000-0000-00000000aaa1', 'jefe@ejemplo.invalid'), ('f1f1f1f1-0000-0000-0000-00000000ccc1', 'pin-c1@pin.invalid'),
  ('f1f1f1f1-0000-0000-0000-00000000ccc2', 'prueba@ejemplo.invalid');
insert into nucleo.usuarios (id, nombre, email, superadmin, persona_id) values
  ('f1f1f1f1-0000-0000-0000-00000000aaa1', 'Jefe', 'jefe@ejemplo.invalid', true, 'f1f1f1f1-0000-0000-0000-0000000000a1'),
  ('f1f1f1f1-0000-0000-0000-00000000ccc1', 'pruebas', null, false, 'f1f1f1f1-0000-0000-0000-0000000000c1'),
  ('f1f1f1f1-0000-0000-0000-00000000ccc2', 'prueba', 'prueba@ejemplo.invalid', false, null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id) select 'f1f1f1f1-0000-0000-0000-00000000ccc1', id, 'f1f1f1f1-0000-0000-0000-000000000001' from nucleo.roles where codigo = 'operario' and empresa_id is null;
insert into nucleo.moviles (usuario_id, empresa_id, llave_hash, sal, pin_hash) values ('f1f1f1f1-0000-0000-0000-00000000ccc1', 'f1f1f1f1-0000-0000-0000-000000000001', 'x', 'y', 'z');
insert into nucleo.notificaciones (empresa_id, usuario_id, titulo) values ('f1f1f1f1-0000-0000-0000-000000000001', 'f1f1f1f1-0000-0000-0000-00000000ccc1', 'Aviso');
insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values
  ('f1f1f1f1-0000-0000-0000-000000000001', 'f1f1f1f1-0000-0000-0000-0000000000c1', '2026-08-03', '2026-08-31'),
  ('f1f1f1f1-0000-0000-0000-000000000001', 'f1f1f1f1-0000-0000-0000-0000000000a1', '2026-08-03', '2026-08-16');
-- documentos firmados: del jefe (de prueba y uno de verdad, copiado de la vieja) y de «pruebas»
insert into nucleo.firmas (id, empresa_id, modulo, documento, documento_id, persona_id, sha256_documento) values
  ('f1f1f1f1-0000-0000-0000-0000000f0001', 'f1f1f1f1-0000-0000-0000-000000000001', 'prevencion', 'epi', 'f1f1f1f1-0000-0000-0000-0000000d0001', 'f1f1f1f1-0000-0000-0000-0000000000a1', repeat('a', 64)),
  ('f1f1f1f1-0000-0000-0000-0000000f0002', 'f1f1f1f1-0000-0000-0000-000000000001', 'prevencion', 'epi', 'f1f1f1f1-0000-0000-0000-0000000d0002', 'f1f1f1f1-0000-0000-0000-0000000000a1', repeat('a', 64)),
  ('f1f1f1f1-0000-0000-0000-0000000f0003', 'f1f1f1f1-0000-0000-0000-000000000001', 'prevencion', 'epi', 'f1f1f1f1-0000-0000-0000-0000000d0003', 'f1f1f1f1-0000-0000-0000-0000000000c1', repeat('a', 64));
insert into prevencion.documentos (id, empresa_id, tipo, persona_id, fecha, datos, origen) values
  ('f1f1f1f1-0000-0000-0000-0000000d0001', 'f1f1f1f1-0000-0000-0000-000000000001', 'epi', 'f1f1f1f1-0000-0000-0000-0000000000a1', '2026-11-14', '{}', null),
  ('f1f1f1f1-0000-0000-0000-0000000d0002', 'f1f1f1f1-0000-0000-0000-000000000001', 'epi', 'f1f1f1f1-0000-0000-0000-0000000000a1', '2026-10-01', '{}', 'limpieza-cie:prl_doc:x'),
  ('f1f1f1f1-0000-0000-0000-0000000d0003', 'f1f1f1f1-0000-0000-0000-000000000001', 'epi', 'f1f1f1f1-0000-0000-0000-0000000000c1', '2026-11-14', '{}', null);
select set_config('prevencion.firmando', 'si', true);
update prevencion.documentos set firma_id = ('f1f1f1f1-0000-0000-0000-0000000f000' || right(id::text, 1))::uuid, firmado_en = now();
-- limpieza: un trabajo de prueba antiguo, uno de verdad copiado y una incidencia de verdad
insert into limpieza.trabajos (id, empresa_id, fecha, clase, titulo, estado, asignados, origen, creado) values
  ('f1f1f1f1-0000-0000-0000-0000000e0001', 'f1f1f1f1-0000-0000-0000-000000000001', '2026-11-15', 'suelto', 'Derrame de prueba', 'pendiente', '{f1f1f1f1-0000-0000-0000-0000000000c1}', null, '2026-11-15 10:00+01'),
  ('f1f1f1f1-0000-0000-0000-0000000e0002', 'f1f1f1f1-0000-0000-0000-000000000001', '2026-11-15', 'suelto', 'De verdad', 'pendiente', '{f1f1f1f1-0000-0000-0000-0000000000b1,f1f1f1f1-0000-0000-0000-0000000000c1}', 'limpieza-cie:ots:x', '2026-11-15 10:00+01');
insert into limpieza.incidencias (empresa_id, texto, persona_id, creado, origen) values ('f1f1f1f1-0000-0000-0000-000000000001', 'Manguera rota', 'f1f1f1f1-0000-0000-0000-0000000000b1', '2026-11-07', 'mano');

\ir ../../scripts/dia-del-cambio/borrar-pruebas.sql

select pruebas.ok(not exists (select 1 from nucleo.personas where nombre in ('pruebas', 'Pruebas 2')), 'las fichas de prueba ya no están');
select pruebas.ok(not exists (select 1 from nucleo.usuarios where id in ('f1f1f1f1-0000-0000-0000-00000000ccc1', 'f1f1f1f1-0000-0000-0000-00000000ccc2')), 'ni sus usuarios (PIN y correo)');
select pruebas.ok(not exists (select 1 from nucleo.moviles) and not exists (select 1 from nucleo.notificaciones), 'ni sus móviles ni sus avisos');
select pruebas.ok(exists (select 1 from auth.users where id = 'f1f1f1f1-0000-0000-0000-00000000ccc2'), 'las cuentas de Supabase no se tocan');
select pruebas.ok((select count(*) = 1 from personal.vacaciones), 'las vacaciones del jefe se quedan');
select pruebas.ok((select array_agg(id) = '{f1f1f1f1-0000-0000-0000-0000000d0002}' from prevencion.documentos), 'solo queda el documento de verdad');
select pruebas.ok((select array_agg(id) = '{f1f1f1f1-0000-0000-0000-0000000f0002}' from nucleo.firmas), 'y su firma');
select pruebas.ok((select array_agg(id) = '{f1f1f1f1-0000-0000-0000-0000000e0002}' from limpieza.trabajos), 'el trabajo de prueba se borra; el de verdad se queda');
select pruebas.ok((select asignados = '{f1f1f1f1-0000-0000-0000-0000000000b1}' from limpieza.trabajos), 'sin la persona de prueba entre los asignados');
select pruebas.ok((select count(*) = 1 from limpieza.incidencias), 'la incidencia de verdad se queda');
select pruebas.ok((select bool_and(tgenabled <> 'D') from pg_trigger where tgrelid in ('nucleo.firmas'::regclass, 'prevencion.documentos'::regclass, 'prevencion.asistencias'::regclass,
  'prevencion.sesiones'::regclass, 'personal.envios'::regclass, 'limpieza.incidencia_notas'::regclass) and not tgisinternal), 'las protecciones quedan encendidas');
select pruebas.ok((select cuantos = 2 from r_hecho where tabla = 'Fichas de trabajador'), 'el resumen cuenta las fichas');
rollback;
