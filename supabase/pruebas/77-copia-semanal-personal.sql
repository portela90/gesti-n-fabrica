-- Copia semanal de Personal (scripts/copia-semanal/personal.sql) con datos inventados.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('b1b1b1b1-0000-0000-0000-000000000001', 'limpieza-prueba', 'Limpieza');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('b1b1b1b1-0000-0000-0000-0000000000f1', 'b1b1b1b1-0000-0000-0000-000000000001', 'Ana Prueba'),
  ('b1b1b1b1-0000-0000-0000-0000000000f2', 'b1b1b1b1-0000-0000-0000-000000000001', 'Bea Prueba');
insert into personal.calendarios (id, empresa_id, anio, nombre, dias_semana) values
  ('b1b1b1b1-0000-0000-0000-0000000000c1', 'b1b1b1b1-0000-0000-0000-000000000001', 2026, 'Semana 2026', '{1,2,3,4,5}');
-- lo que ya había: una copia anterior, algo hecho en la app nueva y un festivo que la vieja ya no tiene
insert into personal.horas_dia (empresa_id, persona_id, fecha, trabajadas, fuera, falta, nota, origen) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000f1', '2026-11-02', 7, 0, 'otro', null, 'limpieza-cie:horas_dia'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000f1', '2026-11-03', 7, 0, null, null, 'limpieza-cie:horas_dia'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000f2', '2026-11-04', 9, 0, null, null, null);
insert into personal.vacaciones (id, empresa_id, persona_id, desde, hasta, nota, origen) values
  ('b1b1b1b1-0000-0000-0000-0000000000a1', 'b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000f1', '2026-08-03', '2026-08-23', 'Verano', 'limpieza-cie:cal_vac:b1b1b1b1-0000-0000-0000-0000000000a1'),
  ('b1b1b1b1-0000-0000-0000-0000000000a2', 'b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000f2', '2026-12-21', '2026-12-24', 'Borrada en la vieja', 'limpieza-cie:cal_vac:b1b1b1b1-0000-0000-0000-0000000000a2');
insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000c1', '2026-12-08', 'festivo', 'Inmaculada'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-0000000000c1', '2026-05-15', 'festivo', 'San Isidro');

-- lo que hay en la vieja esta semana
create temp table v_horas (persona uuid, fecha date, trabajadas numeric, fuera numeric, extra numeric, falta text, nota text);
insert into v_horas values ('b1b1b1b1-0000-0000-0000-0000000000f1','2026-11-02',7,0,0,'baja',NULL),        -- cambiado
  ('b1b1b1b1-0000-0000-0000-0000000000f1','2026-11-21',8,0,8,NULL,'Fin de semana'),                         -- nuevo
  ('b1b1b1b1-0000-0000-0000-0000000000f2','2026-11-13',null,6,0,NULL,NULL),                                 -- nuevo, sin motivo
  ('b1b1b1b1-0000-0000-0000-0000000000f2','2026-11-04',7,0,0,NULL,NULL),                                    -- en la nueva está hecho a mano
  ('b1b1b1b1-0000-0000-0000-0000000000f9','2026-11-05',7,0,0,NULL,NULL);                                    -- persona que no existe
create temp table v_vac (id uuid, persona uuid, desde date, hasta date, nota text);
insert into v_vac values ('b1b1b1b1-0000-0000-0000-0000000000a1','b1b1b1b1-0000-0000-0000-0000000000f1','2026-08-03','2026-08-30','Verano'),
  ('b1b1b1b1-0000-0000-0000-0000000000a3','b1b1b1b1-0000-0000-0000-0000000000f2','2026-12-26','2026-12-30','Navidad');
create temp table v_dias (equipo text, fecha date, tipo text, nombre text, horario text);
insert into v_dias values ('Semana','2026-12-08','festivo','Inmaculada Concepción',NULL), ('Semana','2026-12-31','cierre','Puente',NULL),
  ('Finde','2026-12-31','cierre','Puente',NULL);
\ir ../../scripts/copia-semanal/personal.sql

select pruebas.ok((select falta = 'baja' from personal.horas_dia where fecha = '2026-11-02'), 'un día cambiado en la vieja se cambia');
select pruebas.ok((select nota = 'Fin de semana' and extra_mano = 8 from personal.horas_dia where fecha = '2026-11-21'), 'un día nuevo se pone');
select pruebas.ok((select nota = '(sin motivo en la app vieja)' from personal.horas_dia where fecha = '2026-11-13'), 'horas fuera sin motivo: se pone «sin motivo»');
select pruebas.ok(not exists (select 1 from personal.horas_dia where fecha = '2026-11-03'), 'un día que ya no está en la vieja se quita');
select pruebas.ok((select trabajadas = 9 from personal.horas_dia where fecha = '2026-11-04'), 'lo hecho en la app nueva no se toca');
select pruebas.ok((select hasta = '2026-08-30' from personal.vacaciones where id = 'b1b1b1b1-0000-0000-0000-0000000000a1'), 'vacaciones cambiadas');
select pruebas.ok(not exists (select 1 from personal.vacaciones where id = 'b1b1b1b1-0000-0000-0000-0000000000a2'), 'vacaciones borradas en la vieja, quitadas');
select pruebas.ok(exists (select 1 from personal.vacaciones where id = 'b1b1b1b1-0000-0000-0000-0000000000a3'), 'vacaciones nuevas, con su mismo número');
select pruebas.ok((select nombre = 'Inmaculada Concepción' from personal.dias where fecha = '2026-12-08'), 'un festivo cambiado se cambia');
select pruebas.ok(exists (select 1 from personal.dias where fecha = '2026-12-31' and tipo = 'cierre'), 'un puente nuevo se pone');
select pruebas.ok(exists (select 1 from personal.dias where fecha = '2026-05-15'), 'un festivo que solo está en la nueva no se borra');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 10), 'avisa de la persona que no está');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 11), 'avisa del día hecho a mano en la nueva');
select pruebas.ok((select cuantos = 1 from r_resumen where orden = 12), 'avisa del calendario que falta (Fin de semana 2026)');
select pruebas.ok((select detalle like '%2026-05-15%' from r_resumen where orden = 13), 'avisa del festivo que solo está en la nueva');
select pruebas.ok((select cuantos = 2 from r_resumen where orden = 1 and que = 'Horas: días nuevos'), 'el resumen cuenta los días nuevos');
rollback;
