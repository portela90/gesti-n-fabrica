-- Personal: horas del día (horario de la ficha + calendario + lo que se corrige). Personas inventadas.
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

-- unidad J: Lola (completa, 35 h, horario partido), Pepe (finde, parcial), Ext (de otra empresa)
insert into nucleo.empresas (id, codigo, nombre) values
  ('99999999-0000-0000-0000-000000000001', 'unidad-j', 'Unidad J'), ('aaaaaaaa-9999-0000-0000-000000000001', 'unidad-k', 'Unidad K');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('99999999-0000-0000-0000-000000000001', 'personal'), ('aaaaaaaa-9999-0000-0000-000000000001', 'personal');
insert into nucleo.personas (id, empresa_id, nombre, jornada, horas_semana, horario) values
  ('99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-000000000001', 'Lola Prueba', 'completa', 35,
   '{"lunes": [["08:00","13:00"],["14:00","16:00"]], "martes": [["08:00","13:00"],["14:00","16:00"]], "miercoles": [["08:00","13:00"],["14:00","16:00"]],
     "jueves": [["08:00","13:00"],["14:00","16:00"]], "viernes": [["07:00","14:00"]]}'),
  ('99999999-0000-0000-0000-0000000000f2', '99999999-0000-0000-0000-000000000001', 'Pepe Prueba', 'parcial', 16, null),
  ('99999999-0000-0000-0000-0000000000f3', '99999999-0000-0000-0000-000000000001', 'Ext Prueba', 'externo', null, '{"lunes": [["08:00","14:00"]]}');
insert into personal.calendarios (id, empresa_id, anio, nombre, dias_semana, horas_dia) values
  ('99999999-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-000000000001', 2031, 'Semana 2031', '{1,2,3,4,5}', '{0,8,8,8,8,8,0}'),
  ('99999999-0000-0000-0000-0000000000c2', '99999999-0000-0000-0000-000000000001', 2031, 'Finde 2031', '{0,6}', '{8,0,0,0,0,0,8}');
insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id) values
  ('99999999-0000-0000-0000-000000000001', 2031, '99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-0000000000c1'),
  ('99999999-0000-0000-0000-000000000001', 2031, '99999999-0000-0000-0000-0000000000f2', '99999999-0000-0000-0000-0000000000c2'),
  ('99999999-0000-0000-0000-000000000001', 2031, '99999999-0000-0000-0000-0000000000f3', '99999999-0000-0000-0000-0000000000c1');
-- semana del lunes 3 al domingo 9 de marzo de 2031: martes festivo, jueves intensiva de 6 h; Lola de vacaciones el viernes
insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre, horas) values
  ('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000c1', '2031-03-04', 'festivo', 'Fiesta inventada', null),
  ('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000c1', '2031-03-06', 'intensiva', null, 6);
insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values
  ('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000f1', '2031-03-07', '2031-03-07');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009a1'), ('00000000-0000-0000-0000-0000000009f1'),
  ('00000000-0000-0000-0000-0000000009e1'), ('00000000-0000-0000-0000-0000000009b1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000009a1', 'Jefe J', null), ('00000000-0000-0000-0000-0000000009f1', 'Lola', '99999999-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000009e1', 'Encargado J', null), ('00000000-0000-0000-0000-0000000009b1', 'Jefe K', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000009a1', 'admin_empresa', '99999999-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000009f1', 'operario',      '99999999-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000009e1', 'encargado',     '99999999-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000009b1', 'admin_empresa', 'aaaaaaaa-9999-0000-0000-000000000001')) x(u, r, e);

-- ---------- la ficha ----------
select pruebas.ok(nucleo.horas_horario('{"lunes": [["08:00","13:00"],["14:00","16:00"]]}', 1) = 7, 'un horario partido suma sus dos tramos');
select pruebas.ok(nucleo.horas_horario('{"sabado": [["20:00","24:00"]]}', 6) = 4 and nucleo.horas_horario('{"lunes": []}', 1) = 0, 'hasta medianoche cuenta bien y un día sin tramos es 0');
select pruebas.falla($q$update nucleo.personas set horario = '{"lunes": [["14:00","08:00"]]}' where id = '99999999-0000-0000-0000-0000000000f2'$q$, 'un tramo al revés no vale');
select pruebas.falla($q$update nucleo.personas set horario = '{"1": [["08:00","14:00"]]}' where id = '99999999-0000-0000-0000-0000000000f2'$q$, 'los días van por su nombre');
select pruebas.falla($q$update nucleo.personas set horario = '{"lunes": [["8:00","14:00"]]}' where id = '99999999-0000-0000-0000-0000000000f2'$q$, 'las horas se escriben HH:MM');

set role authenticated;
-- ---------- el administrador ve lo que le toca a cada uno ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009a1', true);
update nucleo.personas set horas_semana = 16, horario = null where id = '99999999-0000-0000-0000-0000000000f2';
select pruebas.ok((select horas_semana from nucleo.personas where id = '99999999-0000-0000-0000-0000000000f2') = 16, 'el administrador cambia la ficha (horas de contrato y horario) desde la app');
select pruebas.falla($q$update nucleo.personas set horario = '{"lunes": [["14:00","08:00"]]}' where id = '99999999-0000-0000-0000-0000000000f2'$q$, 'y desde la app tampoco vale un horario mal escrito');
create temp table d as select * from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-09');
select pruebas.ok((select count(distinct persona_id) from d) = 2, 'salen Lola y Pepe; el de otra empresa no cuenta horas');
select pruebas.ok((select prevista from d where nombre = 'Lola Prueba' and fecha = '2031-03-03') = 7, 'lunes normal: las 7 h de su horario (no las 8 del calendario)');
select pruebas.ok((select prevista = 0 and tipo_dia = 'festivo' and nombre_dia = 'Fiesta inventada' from d where nombre = 'Lola Prueba' and fecha = '2031-03-04'), 'festivo: 0 h');
select pruebas.ok((select prevista from d where nombre = 'Lola Prueba' and fecha = '2031-03-06') = 6, 'jornada intensiva: sus 6 h');
select pruebas.ok((select falta = 'vacaciones' and horas = 0 and horario = 7 from d where nombre = 'Lola Prueba' and fecha = '2031-03-07'), 'vacaciones: falta vacaciones, 0 h (y se sabe que eran 7)');
select pruebas.ok((select sum(prevista) from d where nombre = 'Pepe Prueba') = 16, 'Pepe sin horario propio: las del calendario de finde (8 + 8)');
select pruebas.ok((select prevista from d where nombre = 'Lola Prueba' and fecha = '2031-03-08') = 0, 'sábado: Lola no trabaja');

-- ---------- y apunta lo que fue distinto ----------
select pruebas.ok(personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-03',
  '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "trabajadas": 9, "fuera": 1, "extra_mano": 2, "nota": "Derrame grande"},
    {"persona_id": "99999999-0000-0000-0000-0000000000f2"}]') = 2, 'guarda las horas del lunes');
select pruebas.ok((select count(*) from personal.horas_dia) = 1, 'quien no tiene nada distinto no deja fila');
select pruebas.ok((select horas from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-03', '99999999-0000-0000-0000-0000000000f1')) = 9, 'el lunes de Lola vale lo apuntado: 9 h');
select pruebas.falla($q$select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-05', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "trabajadas": 8, "extra_mano": 1}]')$q$, 'con extra, el motivo es obligatorio');
select pruebas.falla($q$select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-05', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "trabajadas": 2, "fuera": 3, "nota": "x"}]')$q$, 'fuera de presupuesto no puede ser más que lo trabajado');
select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-05', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "falta": "baja"}]');
select pruebas.ok((select horas = 0 and falta = 'baja' from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-05', '2031-03-05', '99999999-0000-0000-0000-0000000000f1')), 'una baja: 0 h');
select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-05', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1"}]');
select pruebas.ok((select count(*) from personal.horas_dia where fecha = '2031-03-05') = 0, 'quitar la falta deja el día como era');

-- ---------- cada uno ve solo las suyas ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009f1', true);
select pruebas.ok((select count(distinct persona_id) = 1 and min(nombre) = 'Lola Prueba' from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-09')), 'Lola ve solo sus horas');
select pruebas.ok(pruebas.cuantas($q$select * from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-09', '99999999-0000-0000-0000-0000000000f2')$q$) = 0, 'aunque pida las de Pepe');
select pruebas.ok(pruebas.cuantas('select * from personal.horas_dia') = 1, 'en la tabla también ve solo lo suyo');
select pruebas.falla($q$select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-06', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "trabajadas": 12}]')$q$, 'y no se pone horas');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009e1', true);
select pruebas.ok(pruebas.cuantas($q$select * from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-09')$q$) = 0, 'el encargado no ve las horas de los demás');
select pruebas.ok(pruebas.cuantas('select * from personal.horas_dia') = 0, 'ni en la tabla');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009b1', true);
select pruebas.ok(pruebas.cuantas($q$select * from personal.horas_dias('99999999-0000-0000-0000-000000000001', '2031-03-03', '2031-03-09')$q$) = 0, 'el jefe de otra unidad no ve nada');
select pruebas.falla($q$select personal.guardar_horas_dia('99999999-0000-0000-0000-000000000001', '2031-03-06', '[{"persona_id": "99999999-0000-0000-0000-0000000000f1", "trabajadas": 1}]')$q$, 'ni apunta horas');

reset role;
select pruebas.ok((select count(*) from nucleo.historial where tabla = 'horas_dia' and modulo = 'personal') >= 3, 'el historial guarda cada cambio de horas (también lo que se quita)');
rollback;
