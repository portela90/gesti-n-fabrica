-- Prevención: fichas (datos personales), charlas mensuales, sesiones, firmas y cierre.
-- Unidades y personas inventadas. Todo se deshace al final.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
create function pruebas.falla(orden text, msg text) returns void language plpgsql as $$
begin
  begin execute orden; exception when others then raise notice 'ok: % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLA: % — debería haber dado error y no lo dio', msg;
end $$;
create function pruebas.cuantas(orden text) returns int language plpgsql as $$
declare n int; begin execute 'with x as (' || orden || ') select count(*) from x' into n; return n; end $$;
grant usage on schema pruebas to authenticated;
grant execute on all functions in schema pruebas to authenticated;

-- ---------- datos inventados ----------
insert into nucleo.empresas (id, codigo, nombre) values
  ('33333333-0000-0000-0000-000000000001', 'unidad-p', 'Unidad P'),
  ('44444444-0000-0000-0000-000000000001', 'unidad-q', 'Unidad Q');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('33333333-0000-0000-0000-000000000001', 'prevencion'), ('44444444-0000-0000-0000-000000000001', 'prevencion');
insert into nucleo.personas (id, empresa_id, nombre, categoria) values
  ('33333333-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000001', 'Ana Prueba', 'Peón'),
  ('33333333-0000-0000-0000-0000000000f2', '33333333-0000-0000-0000-000000000001', 'Bruno Prueba', 'Peón'),
  ('33333333-0000-0000-0000-0000000000f3', '33333333-0000-0000-0000-000000000001', 'Carla Encargada', 'Encargada'),
  ('33333333-0000-0000-0000-0000000000f4', '33333333-0000-0000-0000-000000000001', 'Dani Nuevo', 'Peón'),
  ('44444444-0000-0000-0000-0000000000f1', '44444444-0000-0000-0000-000000000001', 'Quique Otra', 'Peón');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000003a1'), ('00000000-0000-0000-0000-0000000003f1'),
  ('00000000-0000-0000-0000-0000000003f2'), ('00000000-0000-0000-0000-0000000003e3'), ('00000000-0000-0000-0000-0000000004a1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000003a1', 'Jefe P', null),
  ('00000000-0000-0000-0000-0000000003f1', 'Ana', '33333333-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000003f2', 'Bruno', '33333333-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000003e3', 'Carla', '33333333-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000004a1', 'Jefe Q', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000003a1', 'admin_empresa', '33333333-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000003f1', 'operario',      '33333333-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000003f2', 'operario',      '33333333-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000003e3', 'encargado',     '33333333-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000004a1', 'admin_empresa', '44444444-0000-0000-0000-000000000001')) x(u, r, e);

set role authenticated;

-- ---------- jefe: fichas ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);
insert into prevencion.prendas (empresa_id, codigo, nombre, orden) values
  ('33333333-0000-0000-0000-000000000001', 'pantalon', 'Pantalón', 1), ('33333333-0000-0000-0000-000000000001', 'bota', 'Botas de seguridad', 2);
insert into prevencion.fichas (persona_id, empresa_id, dni, puesto, fecha_alta, telefono, tallas) values
  ('33333333-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000001', '00000000T', 'Limpieza industrial', '2031-01-10', '600000001', '{"pantalon":"L","bota":"42"}'),
  ('33333333-0000-0000-0000-0000000000f2', '33333333-0000-0000-0000-000000000001', null, null, null, null, '{}');
select pruebas.falla($q$insert into prevencion.fichas (persona_id, empresa_id, dni) values ('44444444-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000001', '11111111H')$q$,
  'no se hace la ficha de un trabajador de otra unidad');
select pruebas.falla($q$update prevencion.fichas set dni = 'esto no es un dni' where persona_id = '33333333-0000-0000-0000-0000000000f2'$q$, 'un DNI mal escrito no se acepta');
select pruebas.falla($q$update prevencion.fichas set fecha_alta = '2031-05-01', fecha_baja = '2031-04-01' where persona_id = '33333333-0000-0000-0000-0000000000f1'$q$,
  'la baja no puede ser antes del alta');
update prevencion.fichas set idioma = 'Francés' where persona_id = '33333333-0000-0000-0000-0000000000f1';
select pruebas.ok((select actualizado > '2000-01-01' from prevencion.fichas where persona_id = '33333333-0000-0000-0000-0000000000f1'), 'el jefe cambia una ficha');

-- ---------- jefe: charla del mes ----------
insert into prevencion.charlas (id, empresa_id, anio, mes, codigo, compromiso, cuerpo, puntos, tema, tema_puntos) values
  ('33333333-0000-0000-0000-0000000000c1', '33333333-0000-0000-0000-000000000001', 2031, 3, 'COD-1', 'Si veo algo inseguro, lo digo',
   'Texto de la charla', '["¿Qué harías si…?"]', 'Riesgo eléctrico', '["No toques cables pelados"]');
select pruebas.falla($q$insert into prevencion.charlas (empresa_id, anio, mes, compromiso) values ('33333333-0000-0000-0000-000000000001', 2031, 3, 'Otra')$q$,
  'solo hay una charla por mes');
insert into prevencion.sesiones (id, empresa_id, charla_id, denominacion, fecha, centro, duracion, formador, previstos) values
  ('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-000000000001', '33333333-0000-0000-0000-0000000000c1',
   'Toolbox Talk HSE Marzo 31', '2031-03-05', 'Planta P', 15, 'Jefe P',
   array['33333333-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-0000000000f2']::uuid[]);
select pruebas.ok(prevencion.enviar_charla('33333333-0000-0000-0000-0000000000a1') = 2, 'enviar la charla: 2 tienen que firmarla');
select pruebas.ok((select enviada_en is not null from prevencion.sesiones), 'queda la fecha de envío');

-- ---------- Ana (operaria): ve lo suyo y firma ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003f1', true);
select pruebas.ok(nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos' ? 'prevencion', 'la operaria ve Prevención en el menú');
select pruebas.ok(pruebas.cuantas('select * from prevencion.fichas') = 1, 'Ana solo ve su ficha');
select pruebas.ok(pruebas.cuantas('select * from prevencion.sesiones') = 1, 'Ana ve la charla que le han enviado');
update prevencion.fichas set dni = '22222222J' where persona_id = '33333333-0000-0000-0000-0000000000f1';
select pruebas.ok((select dni from prevencion.fichas) = '00000000T', 'Ana no cambia su ficha');
select pruebas.falla($q$select prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f2', null, 'data:image/png;base64,AAAA')$q$,
  'Ana no firma por Bruno');
select pruebas.falla($q$select prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f1', null, 'hola')$q$,
  'la firma tiene que ser una imagen');
select pruebas.ok(prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f1', null, 'data:image/png;base64,AAAA') is not null,
  'Ana firma la charla');
select pruebas.ok((select puesto from prevencion.asistencias) = 'Limpieza industrial', 'la firma lleva el puesto de su ficha');
select pruebas.ok((select sha256_documento = prevencion.huella_charla('33333333-0000-0000-0000-0000000000a1') from nucleo.firmas), 'la firma guarda la huella de la charla');
select pruebas.falla($q$select prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f1', null, 'data:image/png;base64,AAAA')$q$,
  'no se firma dos veces');

-- ---------- Bruno: no ve la firma de Ana ni las fichas ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003f2', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.asistencias') = 0, 'Bruno no ve quién ha firmado');
select pruebas.ok(pruebas.cuantas('select * from prevencion.fichas') = 1, 'Bruno solo ve su ficha (vacía)');

-- ---------- Carla (encargada): ve charlas y firmas, NO las fichas; recoge firmas ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003e3', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.fichas') = 0, 'la encargada NO ve las fichas (datos personales)');
select pruebas.ok(pruebas.cuantas('select * from prevencion.asistencias') = 1, 'la encargada ve quién ha firmado');
select pruebas.ok(prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f4', 'Peón', 'data:image/png;base64,BBBB') is not null,
  'la encargada recoge en su móvil la firma de Dani, que no estaba en la lista');
select pruebas.ok((select '33333333-0000-0000-0000-0000000000f4' = any(previstos) from prevencion.sesiones), 'Dani pasa a estar en la lista');
select pruebas.falla($q$select prevencion.anular_asistencia((select id from prevencion.asistencias limit 1))$q$, 'la encargada no anula firmas');
select pruebas.falla($q$select prevencion.apuntar_envio('33333333-0000-0000-0000-0000000000a1', 'x')$q$, 'la encargada no apunta envíos a prevención');
update prevencion.charlas set tema = 'otro';
select pruebas.ok((select tema from prevencion.charlas) = 'Riesgo eléctrico', 'la encargada no cambia la charla');

-- ---------- jefe: anula una firma mal hecha, vuelve a firmarse, cierra ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);
select prevencion.anular_asistencia((select id from prevencion.asistencias where persona_id = '33333333-0000-0000-0000-0000000000f4'));
select pruebas.ok(pruebas.cuantas('select * from prevencion.asistencias where anulada is null') = 1, 'la firma anulada deja de contar');
select pruebas.ok(pruebas.cuantas($q$select * from nucleo.firmas where documento = 'charla'$q$) = 2, 'pero la firma sigue guardada');
select pruebas.ok(prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f4', 'Peón', 'data:image/png;base64,CCCC') is not null,
  'Dani vuelve a firmar');
select prevencion.cerrar_sesion('33333333-0000-0000-0000-0000000000a1', true);
select pruebas.falla($q$select prevencion.firmar_charla('33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000f2', null, 'data:image/png;base64,AAAA')$q$,
  'cerrada: ya no se firma');
select pruebas.falla($q$update prevencion.sesiones set formador = 'otro'$q$, 'cerrada: la sesión no se cambia');
select pruebas.falla($q$update prevencion.charlas set tema = 'otro'$q$, 'cerrada: la charla firmada no se cambia');
select pruebas.falla($q$select prevencion.anular_asistencia((select id from prevencion.asistencias where anulada is null limit 1))$q$, 'cerrada: no se anulan firmas');
select prevencion.apuntar_envio('33333333-0000-0000-0000-0000000000a1', 'prevencion@ejemplo.com (desde mi correo)');
select pruebas.ok((select prev_enviado_en is not null and prev_destino like 'prevencion@%' from prevencion.sesiones), 'cerrada: se puede apuntar el envío a prevención');
select prevencion.cerrar_sesion('33333333-0000-0000-0000-0000000000a1', false);
select pruebas.ok((select cerrada_en is null from prevencion.sesiones), 'el jefe puede reabrirla');
select pruebas.falla($q$update prevencion.charlas set tema = 'otro' where id = '33333333-0000-0000-0000-0000000000c1'$q$, 'abierta pero ya firmada por alguien: la charla no se cambia (cada uno conserva lo que firmó)');
select pruebas.falla($q$delete from prevencion.charlas where id = '33333333-0000-0000-0000-0000000000c1'$q$, 'una charla con sesión no se borra');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select pruebas.falla($q$delete from prevencion.asistencias$q$, 'las asistencias no se borran (ni desde el servidor)');
select pruebas.falla($q$delete from prevencion.sesiones$q$, 'las sesiones no se borran (ni desde el servidor)');
set role authenticated;

-- ---------- otra unidad: no ve nada ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.fichas') + pruebas.cuantas('select * from prevencion.charlas')
  + pruebas.cuantas('select * from prevencion.sesiones') + pruebas.cuantas('select * from prevencion.asistencias') = 0, 'el jefe de otra unidad no ve nada de P');
select pruebas.falla($q$select prevencion.enviar_charla('33333333-0000-0000-0000-0000000000a1')$q$, 'ni envía sus charlas');

-- ---------- documentos del técnico (PDF en el almacén) ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);
insert into storage.objects (bucket_id, name) values ('prevencion', '33333333-0000-0000-0000-000000000001/charlas/2031-04-1.pdf');
insert into prevencion.charlas (empresa_id, anio, mes, documento_ruta, documento_nombre, documento_sha256) values
  ('33333333-0000-0000-0000-000000000001', 2031, 4, '33333333-0000-0000-0000-000000000001/charlas/2031-04-1.pdf', 'Toolbox abril.pdf', repeat('a', 64));
select pruebas.ok(pruebas.cuantas('select * from prevencion.charlas where mes = 4 and compromiso is null') = 1, 'una charla puede ser solo el PDF del técnico (sin escribir nada)');
select pruebas.falla($q$insert into prevencion.charlas (empresa_id, anio, mes) values ('33333333-0000-0000-0000-000000000001', 2031, 5)$q$, 'pero una charla sin texto ni documento no vale');
select pruebas.falla($q$insert into prevencion.charlas (empresa_id, anio, mes, documento_ruta) values ('33333333-0000-0000-0000-000000000001', 2031, 6, '44444444-0000-0000-0000-000000000001/charlas/x.pdf')$q$,
  'el documento tiene que estar en la carpeta de su unidad');
select pruebas.falla($q$insert into storage.objects (bucket_id, name) values ('prevencion', '44444444-0000-0000-0000-000000000001/charlas/x.pdf')$q$, 'no se sube a la carpeta de otra unidad');
delete from storage.objects where bucket_id = 'prevencion';
update storage.objects set name = name || '.viejo' where bucket_id = 'prevencion';
select pruebas.ok(pruebas.cuantas($q$select * from storage.objects where bucket_id = 'prevencion' and name like '%2031-04-1.pdf'$q$) = 1, 'ni el jefe borra ni cambia un PDF ya subido');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003f1', true);
select pruebas.ok(pruebas.cuantas($q$select * from storage.objects where bucket_id = 'prevencion'$q$) = 1, 'la operaria puede leer el documento de su unidad');
select pruebas.falla($q$insert into storage.objects (bucket_id, name) values ('prevencion', '33333333-0000-0000-0000-000000000001/charlas/y.pdf')$q$, 'la operaria no sube documentos');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);
select pruebas.ok(pruebas.cuantas($q$select * from storage.objects where bucket_id = 'prevencion'$q$) = 0, 'el jefe de otra unidad no ve los documentos de P');

-- ---------- historial ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);
select pruebas.ok(pruebas.cuantas($q$select * from nucleo.historial where modulo = 'prevencion' and tabla = 'fichas'$q$) >= 3, 'los cambios de las fichas quedan en el historial');

rollback;
