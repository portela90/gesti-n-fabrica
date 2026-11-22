-- Copia semanal de Prevención (scripts/copia-semanal/prevencion.sql) con datos inventados.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('e1e1e1e1-0000-0000-0000-000000000001', 'limpieza-prueba', 'Limpieza');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('e1e1e1e1-0000-0000-0000-000000000001', 'prevencion');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('e1e1e1e1-0000-0000-0000-0000000000f1', 'e1e1e1e1-0000-0000-0000-000000000001', 'Ana Prueba'),
  ('e1e1e1e1-0000-0000-0000-0000000000f2', 'e1e1e1e1-0000-0000-0000-000000000001', 'Bea Prueba');

create temp table v_toolbox (anio int, mes int, compromiso text, cuerpo text, puntos jsonb, tema text, tema_intro text, tema_puntos jsonb, imagen text, codigo text);
insert into v_toolbox values (2026, 10, 'Si veo algo, lo digo', 'Texto', '[]', 'Riesgo eléctrico', null, '["No tocar"]', null, 'COD-1'),
  (2026, 1, 'Compromiso', 'Texto de enero', '[]', 'Frío', '', '[]', 'img/toolbox/2026-01.jpg', 'COD-1'),
  (2026, 9, 'Compromiso', 'Texto de septiembre cambiado en la vieja', '[]', 'Calor', '', '[]', null, 'COD-1');
-- en la nueva, enero ya estaba copiado con su imagen dentro
insert into prevencion.charlas (empresa_id, anio, mes, codigo, compromiso, cuerpo, tema, imagen, origen) values
  ('e1e1e1e1-0000-0000-0000-000000000001', 2026, 1, 'COD-1', 'Compromiso', 'Texto viejo', 'Frío', 'data:image/jpeg;base64,/9j/4AAQ', 'limpieza-cie:prl_toolbox:2026-01');
-- septiembre: hecho y firmado en la app nueva
insert into prevencion.charlas (id, empresa_id, anio, mes, codigo, compromiso, cuerpo, tema, origen) values
  ('e1e1e1e1-0000-0000-0000-000000000c09', 'e1e1e1e1-0000-0000-0000-000000000001', 2026, 9, 'COD-1', 'Compromiso', 'Texto de septiembre', 'Calor', 'limpieza-cie:prl_toolbox:2026-09');
insert into prevencion.sesiones (id, empresa_id, charla_id, previstos) values ('e1e1e1e1-0000-0000-0000-000000000509', 'e1e1e1e1-0000-0000-0000-000000000001',
  'e1e1e1e1-0000-0000-0000-000000000c09', '{e1e1e1e1-0000-0000-0000-0000000000f1}');
insert into nucleo.firmas (id, empresa_id, modulo, documento, documento_id, persona_id, sha256_documento) values ('e1e1e1e1-0000-0000-0000-000000000f09',
  'e1e1e1e1-0000-0000-0000-000000000001', 'prevencion', 'charla', 'e1e1e1e1-0000-0000-0000-000000000509', 'e1e1e1e1-0000-0000-0000-0000000000f1', repeat('a', 64));
insert into prevencion.asistencias (empresa_id, sesion_id, persona_id, nombre, firma_id) values ('e1e1e1e1-0000-0000-0000-000000000001',
  'e1e1e1e1-0000-0000-0000-000000000509', 'e1e1e1e1-0000-0000-0000-0000000000f1', 'Ana Prueba', 'e1e1e1e1-0000-0000-0000-000000000f09');
create temp table v_sesion (id uuid, anio int, mes int, denominacion text, fecha date, centro text, duracion int, formador text, observaciones text,
  previstos uuid[], enviada_en timestamptz, estado text, cerrada_en timestamptz, creado timestamptz, prev_enviado_en timestamptz, prev_destino text);
insert into v_sesion values ('e1e1e1e1-0000-0000-0000-000000000501', 2026, 10, 'Toolbox Octubre', '2026-10-05', 'Planta', 15, 'Formador Prueba', null,
  '{e1e1e1e1-0000-0000-0000-0000000000f1,e1e1e1e1-0000-0000-0000-0000000000f2,e1e1e1e1-0000-0000-0000-0000000000f9}', '2026-10-05 08:00+02', 'cerrada', '2026-10-20 08:00+02', null, null, null);
create temp table v_firma (id uuid, sesion uuid, trabajador uuid, nombre text, puesto text, firma text, firmado_en timestamptz);
insert into v_firma values
  ('e1e1e1e1-0000-0000-0000-000000000601', 'e1e1e1e1-0000-0000-0000-000000000501', 'e1e1e1e1-0000-0000-0000-0000000000f1', 'Ana Prueba', 'Peón',
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', '2026-10-05 09:00+02');
create temp table v_doc (tabla text, id uuid, tipo text, trabajador uuid, fecha date, datos jsonb, firma text, firmado_en timestamptz, enviada_en timestamptz,
  creado timestamptz, borrado boolean, evaluacion jsonb);
insert into v_doc values
  ('prl_doc', 'e1e1e1e1-0000-0000-0000-000000000701', 'epi', 'e1e1e1e1-0000-0000-0000-0000000000f1', '2026-10-29',
   '{"items": {"gafas": {"u": "1", "cat": [], "motivo": "Primera entrega"}}, "lugar": "Planta", "otros": []}',
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', '2026-10-29 10:00+01', '2026-10-29 09:00+01', null, false, null),
  ('prl_formacion', 'e1e1e1e1-0000-0000-0000-000000000702', 'formacion', 'e1e1e1e1-0000-0000-0000-0000000000f2', '2026-10-16',
   '{"items": [1, 2, 3], "duracion": "10", "direccion": "Planta", "impartida": "Formador Prueba"}', null, null, null, null, false, '{"fecha": "2026-10-16", "eficaz": true}'),
  ('prl_doc', 'e1e1e1e1-0000-0000-0000-000000000703', 'epi', 'e1e1e1e1-0000-0000-0000-0000000000f2', '2026-10-30', '{"items": {}, "otros": []}', null, null, null, null, true, null);
create temp table v_cert (id uuid, trabajador uuid, tipo text, titulo text, entidad text, horas numeric, fecha date, caduca date, notas text, archivos int, borrado boolean);
insert into v_cert values ('e1e1e1e1-0000-0000-0000-000000000801', 'e1e1e1e1-0000-0000-0000-0000000000f1', 'Puente grúa', 'Uso de puente grúa', 'Academia', 4,
  '2026-09-01', '2031-09-01', null, 2, false);
create temp table v_ficha (trabajador uuid, dni text, puesto text, fecha_alta date, fecha_baja date, motivo_baja text, telefono text, emerg_nombre text, emerg_tel text,
  idioma text, tallas jsonb);
insert into v_ficha values ('e1e1e1e1-0000-0000-0000-0000000000f1', '00000000T', 'Peón', '2026-01-10', null, null, null, null, null, null, '{"bota": "42"}');

create temp table stock_antes as select count(*) n from prevencion.stock_mov;
\ir ../../scripts/copia-semanal/prevencion.sql

select pruebas.ok((select count(*) = 1 from prevencion.charlas where empresa_id = 'e1e1e1e1-0000-0000-0000-000000000001' and tema = 'Riesgo eléctrico'), 'el texto del Toolbox se copia');
select pruebas.ok((select cuerpo = 'Texto de enero' and imagen = 'data:image/jpeg;base64,/9j/4AAQ' from prevencion.charlas where mes = 1 and empresa_id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  'la imagen que en la vieja es un archivo no pisa la de la nueva (el texto sí se cambia)');
select pruebas.ok((select cuerpo = 'Texto de septiembre' from prevencion.charlas where id = 'e1e1e1e1-0000-0000-0000-000000000c09'), 'una charla ya firmada no se cambia');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 12), 'y se avisa');
select pruebas.ok((select tema_intro is null from prevencion.charlas where mes = 1 and empresa_id = 'e1e1e1e1-0000-0000-0000-000000000001'), 'texto vacío = nada');
select pruebas.ok((select cerrada_en is not null and previstos = '{e1e1e1e1-0000-0000-0000-0000000000f1,e1e1e1e1-0000-0000-0000-0000000000f2}'
  from prevencion.sesiones where id = 'e1e1e1e1-0000-0000-0000-000000000501'), 'la sesión se copia cerrada (sin la persona que no existe)');
select pruebas.ok((select f.imagen like 'data:image/png;base64,%' and f.documento = 'charla' from prevencion.asistencias a join nucleo.firmas f on f.id = a.firma_id
  where a.origen = 'limpieza-cie:prl_firma:e1e1e1e1-0000-0000-0000-000000000601'), 'la firma de la charla se copia con su imagen');
select pruebas.ok((select firma_id is not null and nombre = 'Ana Prueba' from prevencion.documentos where id = 'e1e1e1e1-0000-0000-0000-000000000701'), 'la entrega de EPI firmada, con su firma');
select pruebas.ok((select firma_id is null and evaluacion ->> 'eficaz' = 'true' from prevencion.documentos where id = 'e1e1e1e1-0000-0000-0000-000000000702'), 'la formación sin firmar, con su evaluación');
select pruebas.ok(not exists (select 1 from prevencion.documentos where id = 'e1e1e1e1-0000-0000-0000-000000000703'), 'lo borrado en la vieja no se copia');
select pruebas.ok((select n from stock_antes) = (select count(*) from prevencion.stock_mov), 'no se descuenta stock');
select pruebas.ok((select bool_and(tgenabled <> 'D') from pg_trigger where tgrelid = 'prevencion.documentos'::regclass and not tgisinternal), 'el disparador del stock queda encendido');
select pruebas.ok((select archivos = '[]' and notas = '2 archivos en la app vieja' from prevencion.cursos where id = 'e1e1e1e1-0000-0000-0000-000000000801'), 'el certificado, sin archivo y avisando');
select pruebas.ok((select dni = '00000000T' and tallas = '{"bota": "42"}' from prevencion.fichas where persona_id = 'e1e1e1e1-0000-0000-0000-0000000000f1'), 'la ficha se copia');

-- otra vez (la semana siguiente): no duplica nada; la formación ya firmada en la vieja se firma
update v_doc set firma = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', firmado_en = '2026-11-01 10:00+01'
 where id = 'e1e1e1e1-0000-0000-0000-000000000702';
drop table r_resumen, r_tb;
\ir ../../scripts/copia-semanal/prevencion.sql
select pruebas.ok((select count(*) = 1 from prevencion.asistencias where origen like 'limpieza-cie:%'), 'la segunda vez no repite firmas');
select pruebas.ok((select count(*) = 2 from prevencion.documentos where origen like 'limpieza-cie:%'), 'ni documentos');
select pruebas.ok((select firma_id is not null from prevencion.documentos where id = 'e1e1e1e1-0000-0000-0000-000000000702'), 'la formación firmada después se firma');
select pruebas.ok((select count(*) = 0 from r_resumen where orden in (1, 2, 3, 7, 9) and cuantos > 0), 'lo que no cambió no sale en el resumen (tampoco enero: texto vacío = nada)');
rollback;
