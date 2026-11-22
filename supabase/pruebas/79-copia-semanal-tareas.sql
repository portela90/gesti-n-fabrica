-- Copia semanal de Limpieza · tareas y equipos (scripts/copia-semanal/limpieza-tareas.sql) con datos inventados.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('d1d1d1d1-0000-0000-0000-000000000001', 'limpieza-prueba', 'Limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values
  ('d1d1d1d1-0000-0000-0000-0000000000e1', 'd1d1d1d1-0000-0000-0000-000000000001', 'semana', 'Semana'),
  ('d1d1d1d1-0000-0000-0000-0000000000e2', 'd1d1d1d1-0000-0000-0000-000000000001', 'finde', 'Fin de semana');
insert into nucleo.turnos (id, empresa_id, codigo, nombre) values ('d1d1d1d1-0000-0000-0000-0000000000d1', 'd1d1d1d1-0000-0000-0000-000000000001', 'tarde', 'Tarde');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('d1d1d1d1-0000-0000-0000-0000000000f1', 'd1d1d1d1-0000-0000-0000-000000000001', 'Ana Prueba', 'd1d1d1d1-0000-0000-0000-0000000000e1'),
  ('d1d1d1d1-0000-0000-0000-0000000000f2', 'd1d1d1d1-0000-0000-0000-000000000001', 'Bea Prueba', 'd1d1d1d1-0000-0000-0000-0000000000e1');
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, equipo_id, asignados, grupo, origen) values
  ('d1d1d1d1-0000-0000-0000-0000000000c1', 'd1d1d1d1-0000-0000-0000-000000000001', 'fija', 'Basuras', '{0,1,3,5}', 'd1d1d1d1-0000-0000-0000-0000000000e1',
   '{d1d1d1d1-0000-0000-0000-0000000000f2}', 'hornos', 'limpieza-cie:tareas_fijas:d1d1d1d1-0000-0000-0000-0000000001c1');
insert into limpieza.tareas (id, empresa_id, clase, titulo, origen) values
  ('d1d1d1d1-0000-0000-0000-0000000000c2', 'd1d1d1d1-0000-0000-0000-000000000001', 'habitual', 'Derrame', 'limpieza-cie:tareas_habituales:d1d1d1d1-0000-0000-0000-0000000001c2'),
  ('d1d1d1d1-0000-0000-0000-0000000000c3', 'd1d1d1d1-0000-0000-0000-000000000001', 'habitual', 'Hecha en la nueva', null);

create temp table v_tf (id uuid, titulo text, descripcion text, dias text[], equipo text, turno text, asignados uuid[], todo_equipo boolean, minutos_est int, vivo boolean);
insert into v_tf values ('d1d1d1d1-0000-0000-0000-0000000001c1', 'Basuras', null, '{lunes,miercoles,viernes}', 'Semana', 'Tarde', '{d1d1d1d1-0000-0000-0000-0000000000f1}', false, 90, true),
  ('d1d1d1d1-0000-0000-0000-0000000001c4', 'Pasillos', null, '{todos}', 'Semana', null, '{}', true, 60, true),
  ('d1d1d1d1-0000-0000-0000-0000000001c5', 'Vieja inactiva', null, '{todos}', 'Finde', null, '{}', false, null, false);
create temp table v_th (id uuid, titulo text, descripcion text, lugar text, minutos_est int, vivo boolean, solo_para uuid[], grupo text);
insert into v_th values ('d1d1d1d1-0000-0000-0000-0000000001c2', 'Derrame', 'Recoger', null, 30, false, '{}', 'limpieza');
create temp table v_trab (id uuid, equipos text[], activo boolean);
insert into v_trab values ('d1d1d1d1-0000-0000-0000-0000000000f1', '{Semana}', true), ('d1d1d1d1-0000-0000-0000-0000000000f2', '{Finde}', true);
create temp table v_hab (trabajador uuid, habilidad text, activo boolean);
insert into v_hab values ('d1d1d1d1-0000-0000-0000-0000000000f1', 'hornos', true);
create temp table v_resp (resp uuid, operario uuid, activo boolean);
insert into v_resp values ('d1d1d1d1-0000-0000-0000-0000000000f1', 'd1d1d1d1-0000-0000-0000-0000000000f2', true);

\ir ../../scripts/copia-semanal/limpieza-tareas.sql

select pruebas.ok((select dias = '{1,3,5}' and asignados = '{d1d1d1d1-0000-0000-0000-0000000000f1}' and turno_id is not null and minutos_est = 90 and grupo = 'hornos'
  from limpieza.tareas where id = 'd1d1d1d1-0000-0000-0000-0000000000c1'), 'la fija cambiada queda como en la vieja (y su grupo de la nueva se queda)');
select pruebas.ok((select dias = '{1,2,3,4,5}' and todo_equipo from limpieza.tareas where origen = 'limpieza-cie:tareas_fijas:d1d1d1d1-0000-0000-0000-0000000001c4'),
  'una fija nueva se crea («todos» = de lunes a viernes)');
select pruebas.ok(not exists (select 1 from limpieza.tareas where titulo = 'Vieja inactiva'), 'una inactiva que nunca se copió no se crea');
select pruebas.ok((select baja is not null and descripcion = 'Recoger' and minutos_est = 30 and grupo = 'limpieza' from limpieza.tareas where id = 'd1d1d1d1-0000-0000-0000-0000000000c2'),
  'la habitual desactivada en la vieja queda de baja y cambiada');
select pruebas.ok((select baja is null from limpieza.tareas where id = 'd1d1d1d1-0000-0000-0000-0000000000c3'), 'lo hecho en la nueva no se toca');
select pruebas.ok((select cuantos = 1 and detalle like 'Bea Prueba%' from r_resumen where orden = 10), 'avisa del trabajador que en la vieja está en otro equipo');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 12), 'avisa de la habilidad que falta');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 13), 'avisa del responsable de hornos que falta');
select pruebas.ok((select equipo_id = 'd1d1d1d1-0000-0000-0000-0000000000e1' from nucleo.personas where id = 'd1d1d1d1-0000-0000-0000-0000000000f2'), 'los equipos no se cambian solos');
rollback;
