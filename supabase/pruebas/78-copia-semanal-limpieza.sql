-- Copia semanal de Limpieza · trabajos (scripts/copia-semanal/limpieza-trabajos.sql) con datos inventados.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('c1c1c1c1-0000-0000-0000-000000000001', 'limpieza-prueba', 'Limpieza');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('c1c1c1c1-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('c1c1c1c1-0000-0000-0000-0000000000f1', 'c1c1c1c1-0000-0000-0000-000000000001', 'Ana Prueba');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values
  ('c1c1c1c1-0000-0000-0000-0000000000e1', 'c1c1c1c1-0000-0000-0000-000000000001', 'semana', 'Semana'),
  ('c1c1c1c1-0000-0000-0000-0000000000e2', 'c1c1c1c1-0000-0000-0000-000000000001', 'finde', 'Fin de semana');
insert into nucleo.turnos (id, empresa_id, codigo, nombre) values ('c1c1c1c1-0000-0000-0000-0000000000d1', 'c1c1c1c1-0000-0000-0000-000000000001', 'tarde', 'Tarde');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('c1c1c1c1-0000-0000-0000-0000000000b1', 'c1c1c1c1-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id) values ('c1c1c1c1-0000-0000-0000-0000000000a1', 'c1c1c1c1-0000-0000-0000-000000000001', 'F54', 'c1c1c1c1-0000-0000-0000-0000000000b1');
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, equipo_id, origen) values
  ('c1c1c1c1-0000-0000-0000-0000000000c1', 'c1c1c1c1-0000-0000-0000-000000000001', 'fija', 'Pasillos', '{1,2,3,4,5}', 'c1c1c1c1-0000-0000-0000-0000000000e1',
   'limpieza-cie:tareas_fijas:c1c1c1c1-0000-0000-0000-0000000001c1');
-- lo que ya había en la nueva: dos fijas sacadas solas (una de un día que se copia), una hecha a mano y una copia anterior
insert into limpieza.trabajos (id, empresa_id, fecha, clase, tarea_id, titulo, estado, asignados, equipo_id) values
  ('c1c1c1c1-0000-0000-0000-000000000101', 'c1c1c1c1-0000-0000-0000-000000000001', '2026-11-02', 'fija', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Pasillos', 'pendiente', '{}', 'c1c1c1c1-0000-0000-0000-0000000000e1'),
  ('c1c1c1c1-0000-0000-0000-000000000102', 'c1c1c1c1-0000-0000-0000-000000000001', '2026-12-01', 'fija', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Pasillos', 'pendiente', '{}', 'c1c1c1c1-0000-0000-0000-0000000000e1');
insert into limpieza.trabajos (id, empresa_id, fecha, clase, titulo, estado, asignados, inicio, fin, minutos) values
  ('c1c1c1c1-0000-0000-0000-000000000103', 'c1c1c1c1-0000-0000-0000-000000000001', '2026-11-02', 'suelto', 'Hecho a mano en la nueva', 'hecho', '{}', '2026-11-02 10:00+01', '2026-11-02 10:20+01', 20);
insert into limpieza.trabajos (id, empresa_id, fecha, clase, titulo, estado, asignados, origen) values
  ('c1c1c1c1-0000-0000-0000-000000000104', 'c1c1c1c1-0000-0000-0000-000000000001', '2026-11-01', 'suelto', 'Borrado en la vieja', 'pendiente', '{}', 'limpieza-cie:ots:c1c1c1c1-0000-0000-0000-000000000104');

-- lo que hay en la vieja
create temp table v_ots (id uuid, fecha date, titulo text, descripcion text, tipo text, origen text, equipo text, turno text, asignados uuid[], todo_equipo boolean,
  estado text, tarea_id uuid, habitual_id uuid, checklist jsonb, resultado text, nota text, motivo text, inicio timestamptz, fin timestamptz, pausado_min int,
  minutos_est int, tiempo_auto boolean, hecho_por uuid, lugar text, nave text, elemento_codigo text, fotos int, creado timestamptz);
insert into v_ots values
  ('c1c1c1c1-0000-0000-0000-000000000201', '2026-11-02', 'Pasillos', null, null, 'fija', 'Semana', 'Tarde', '{c1c1c1c1-0000-0000-0000-0000000000f1}', false,
   'hecha', 'c1c1c1c1-0000-0000-0000-0000000001c1', null, '{"Suelo limpio": "OK", "Papeleras": "NO-OK", "Cristales": "N/A"}', null, null, null,
   '2026-11-02 15:00+01', '2026-11-02 15:45+01', 5, 60, false, 'c1c1c1c1-0000-0000-0000-0000000000f1', null, null, null, 2, '2026-11-02 06:00+01'),
  ('c1c1c1c1-0000-0000-0000-000000000202', '2026-11-03', 'Cambiar saca', null, 'Incidencia', 'rapida', null, null, '{}', false,
   'hecha', null, null, null, null, null, null, null, '2026-11-03 10:00+01', 0, null, false, null, 'Nave 2', null, 'f54', 0, null),
  ('c1c1c1c1-0000-0000-0000-000000000203', '2026-11-04', 'Pasillos', null, null, 'fija', 'Semana', null, '{}', false,
   'no_hecha', 'c1c1c1c1-0000-0000-0000-0000000001c1', null, null, null, null, 'Faltó gente', null, null, 0, 60, false, null, null, null, 'ZZ9', 0, null);
create temp table n_antes as select count(*) n from nucleo.notificaciones;
\ir ../../scripts/copia-semanal/limpieza-trabajos.sql

select pruebas.ok(not exists (select 1 from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000101'), 'la fija que la nueva sacó sola ese día se quita');
select pruebas.ok(exists (select 1 from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000102'), 'la de un día que no se copia, no');
select pruebas.ok(exists (select 1 from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000103'), 'lo hecho a mano en la nueva se queda');
select pruebas.ok(not exists (select 1 from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000104'), 'lo borrado en la vieja se quita');
select pruebas.ok((select clase = 'fija' and estado = 'hecho' and minutos = 40 and tarea_id = 'c1c1c1c1-0000-0000-0000-0000000000c1'
  and equipo_id = 'c1c1c1c1-0000-0000-0000-0000000000e1' and turno_id = 'c1c1c1c1-0000-0000-0000-0000000000d1' and no_repartir
  from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000201'), 'fija hecha: tarea, equipo, turno y minutos (45 − 5 de pausa)');
select pruebas.ok((select checklist = '[{"texto": "Cristales", "tipo": "ok", "valor": null}, {"texto": "Papeleras", "tipo": "ok", "valor": "mal"}, {"texto": "Suelo limpio", "tipo": "ok", "valor": "bien"}]'::jsonb
  from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000201'), 'la checklist se traduce (OK = bien, NO-OK = mal, N/A = sin marcar)');
select pruebas.ok((select nota = '2 fotos en la app vieja' from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000201'), 'dice cuántas fotos tenía');
select pruebas.ok((select clase = 'suelto' and minutos = 1 and lugar = 'Nave 2' and activo_id = 'c1c1c1c1-0000-0000-0000-0000000000a1'
  from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000202'), 'incidencia rápida: suelto, con su máquina y su sitio');
select pruebas.ok((select estado = 'pendiente' and nota = 'No hecho en la app vieja: Faltó gente' from limpieza.trabajos where id = 'c1c1c1c1-0000-0000-0000-000000000203'),
  'no hecha: pendiente, con el motivo');
select pruebas.ok((select count(*) = 0 from nucleo.notificaciones) or (select n from n_antes) = (select count(*) from nucleo.notificaciones), 'no salta ningún aviso');
select pruebas.ok((select count(*) = 0 from limpieza.incidencias), 'ni ninguna incidencia');
select pruebas.ok((select bool_and(tgenabled <> 'D') from pg_trigger where tgrelid = 'limpieza.trabajos'::regclass and not tgisinternal), 'los disparadores quedan encendidos');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 11), 'avisa de la máquina que no está (ZZ9)');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 1), 'cuenta las fijas cambiadas');
rollback;
