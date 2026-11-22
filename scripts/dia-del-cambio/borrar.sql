
-- BORRA lo de la lista. Todo o nada. Las protecciones de lo firmado se apagan solo mientras tanto y se vuelven a encender.
create temp table r_hecho (tabla text, cuantos bigint);
alter table nucleo.firmas disable trigger solo_anadir;
alter table prevencion.asistencias disable trigger inmutable;
alter table prevencion.documentos disable trigger firmado;
alter table prevencion.documentos disable trigger stock;
alter table prevencion.sesiones disable trigger cerrada;
alter table personal.envios disable trigger inmutable;
alter table limpieza.incidencia_notas disable trigger solo_anadir;

do $$
declare
  P uuid[] := array(select id from r_obj where tabla = 'nucleo.personas');
  n bigint;
begin
  delete from prevencion.asistencias where id in (select id from r_obj where tabla = 'prevencion.asistencias');
  get diagnostics n = row_count; insert into r_hecho values ('Asistencias a charlas', n);
  update prevencion.documentos set firma_id = null where id in (select id from r_obj where tabla = 'prevencion.documentos');
  delete from prevencion.documentos where id in (select id from r_obj where tabla = 'prevencion.documentos');
  get diagnostics n = row_count; insert into r_hecho values ('Documentos de Prevención', n);
  delete from prevencion.sesiones where id in (select id from r_obj where tabla = 'prevencion.sesiones');
  get diagnostics n = row_count; insert into r_hecho values ('Charlas (sesiones)', n);
  delete from personal.envios where id in (select id from r_obj where tabla = 'personal.envios');
  get diagnostics n = row_count; insert into r_hecho values ('Envíos de calendario', n);
  delete from nucleo.firmas where id in (select id from r_obj where tabla = 'nucleo.firmas');
  get diagnostics n = row_count; insert into r_hecho values ('Firmas', n);
  delete from prevencion.cursos where id in (select id from r_obj where tabla = 'prevencion.cursos');
  get diagnostics n = row_count; insert into r_hecho values ('Certificados', n);
  delete from limpieza.incidencia_notas where incidencia_id in (select id from r_obj where tabla = 'limpieza.incidencias');
  delete from limpieza.incidencias where id in (select id from r_obj where tabla = 'limpieza.incidencias');
  get diagnostics n = row_count; insert into r_hecho values ('Incidencias', n);
  delete from limpieza.trabajos where id in (select id from r_obj where tabla = 'limpieza.trabajos');
  get diagnostics n = row_count; insert into r_hecho values ('Trabajos de limpieza', n);
  delete from personal.calendarios where id in (select id from r_obj where tabla = 'personal.calendarios');
  get diagnostics n = row_count; insert into r_hecho values ('Calendarios', n);

  -- lo demás de las personas de prueba
  delete from personal.calendario_personas where persona_id = any (P);
  delete from personal.vacaciones where persona_id = any (P);
  delete from personal.horas_dia where persona_id = any (P);
  delete from nucleo.ausencias where persona_id = any (P);
  delete from prevencion.fichas where persona_id = any (P);
  delete from limpieza.personas where persona_id = any (P);
  delete from limpieza.sustituciones where ausente = any (P) or sustituto = any (P);
  delete from limpieza.responsables where persona_id = any (P);
  update limpieza.responsables set operarios = array(select o from unnest(operarios) o where o <> all (P)) where operarios && P;
  update limpieza.tareas set asignados = array(select o from unnest(asignados) o where o <> all (P)), solo_para = array(select o from unnest(solo_para) o where o <> all (P))
   where asignados && P or solo_para && P;
  update limpieza.trabajos set asignados = array(select o from unnest(asignados) o where o <> all (P)) where asignados && P;
  delete from nucleo.codigos_alta where persona_id = any (P) or usado_por in (select id from r_obj where tabla = 'nucleo.usuarios');

  -- usuarios de prueba: fuera de la app nueva (sus cuentas de Supabase no se tocan: pueden servir en otras apps)
  delete from nucleo.notificaciones where usuario_id in (select id from r_obj where tabla = 'nucleo.usuarios');
  delete from nucleo.suscripciones where usuario_id in (select id from r_obj where tabla = 'nucleo.usuarios');
  delete from nucleo.usuarios where id in (select id from r_obj where tabla = 'nucleo.usuarios');   -- con sus roles y móviles
  get diagnostics n = row_count; insert into r_hecho values ('Usuarios', n);
  delete from nucleo.personas where id = any (P);
  get diagnostics n = row_count; insert into r_hecho values ('Fichas de trabajador', n);
end $$;

alter table nucleo.firmas enable trigger solo_anadir;
alter table prevencion.asistencias enable trigger inmutable;
alter table prevencion.documentos enable trigger firmado;
alter table prevencion.documentos enable trigger stock;
alter table prevencion.sesiones enable trigger cerrada;
alter table personal.envios enable trigger inmutable;
alter table limpieza.incidencia_notas enable trigger solo_anadir;

select tabla as "Borrado", cuantos as "Cuántos" from r_hecho where cuantos > 0;
