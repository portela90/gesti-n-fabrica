-- Limpieza: festivos (desde el calendario de Personal) y responsables con su equipo (Encargado hornos). Personas inventadas.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
create function pruebas.falla(orden text, msg text) returns void language plpgsql as $$
begin
  begin execute orden; exception when others then raise notice 'ok: % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLA: % — debería haber dado error y no lo dio', msg;
end $$;
grant usage on schema pruebas to authenticated;
grant execute on all functions in schema pruebas to authenticated;

-- unidad F: Pía, Quim (sabe hornos) y Rafa en el equipo Semana; Enca es responsable de Pía y Quim
insert into nucleo.empresas (id, codigo, nombre) values ('aeaeaeae-0000-0000-0000-000000000001', 'unidad-f', 'Unidad F');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('aeaeaeae-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('aeaeaeae-0000-0000-0000-0000000000e1', 'aeaeaeae-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id, horario)
select x.id::uuid, 'aeaeaeae-0000-0000-0000-000000000001', x.n, case when x.n <> 'Enca Prueba' then 'aeaeaeae-0000-0000-0000-0000000000e1'::uuid end,
       (select jsonb_object_agg(d, '[["08:00","16:00"]]'::jsonb) from unnest(array['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) d)
  from (values ('aeaeaeae-0000-0000-0000-0000000000f1', 'Pía Prueba'), ('aeaeaeae-0000-0000-0000-0000000000f2', 'Quim Prueba'),
               ('aeaeaeae-0000-0000-0000-0000000000f3', 'Rafa Prueba'), ('aeaeaeae-0000-0000-0000-0000000000f9', 'Enca Prueba')) x(id, n);
insert into limpieza.personas (persona_id, empresa_id, grupos) values
  ('aeaeaeae-0000-0000-0000-0000000000f1', 'aeaeaeae-0000-0000-0000-000000000001', '{}'),
  ('aeaeaeae-0000-0000-0000-0000000000f2', 'aeaeaeae-0000-0000-0000-000000000001', '{hornos}'),
  ('aeaeaeae-0000-0000-0000-0000000000f3', 'aeaeaeae-0000-0000-0000-000000000001', '{}');
insert into limpieza.responsables (persona_id, empresa_id, operarios) values
  ('aeaeaeae-0000-0000-0000-0000000000f9', 'aeaeaeae-0000-0000-0000-000000000001', '{aeaeaeae-0000-0000-0000-0000000000f2,aeaeaeae-0000-0000-0000-0000000000f1,aeaeaeae-0000-0000-0000-0000000000f1}');
select pruebas.ok((select operarios = '{aeaeaeae-0000-0000-0000-0000000000f1,aeaeaeae-0000-0000-0000-0000000000f2}' from limpieza.responsables), 'el equipo del responsable se guarda sin repetidos');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000eeee1'), ('00000000-0000-0000-0000-0000000eeee9');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-0000000eeee1', 'Encargada general', null),
  ('00000000-0000-0000-0000-0000000eeee9', 'Enca', 'aeaeaeae-0000-0000-0000-0000000000f9');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = 'encargado' and empresa_id is null), 'aeaeaeae-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-0000000eeee1'), ('00000000-0000-0000-0000-0000000eeee9')) x(u);
insert into limpieza.tareas (empresa_id, clase, titulo, grupo, dias, asignados, todo_equipo, equipo_id)
select 'aeaeaeae-0000-0000-0000-000000000001', 'fija', x.t, x.g, '{0,1,2,3,4,5,6}', x.a::uuid[], x.todo, 'aeaeaeae-0000-0000-0000-0000000000e1'
  from (values ('Basuras', null, '{aeaeaeae-0000-0000-0000-0000000000f1}', false), ('Fregar', null, '{aeaeaeae-0000-0000-0000-0000000000f3}', false),
               ('Pasillo', null, '{}', true), ('Horno', 'hornos', '{}', false)) x(t, g, a, todo);

-- hoy es festivo en el calendario de los tres
insert into personal.calendarios (id, empresa_id, anio, nombre) values
  ('aeaeaeae-0000-0000-0000-0000000000c1', 'aeaeaeae-0000-0000-0000-000000000001', extract(year from current_date)::int, 'Semana');
insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id)
select 'aeaeaeae-0000-0000-0000-000000000001', extract(year from current_date)::int, p, 'aeaeaeae-0000-0000-0000-0000000000c1'
  from unnest('{aeaeaeae-0000-0000-0000-0000000000f1,aeaeaeae-0000-0000-0000-0000000000f2}'::uuid[]) p;
insert into personal.dias (empresa_id, calendario_id, fecha, tipo, nombre) values
  ('aeaeaeae-0000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-0000000000c1', current_date, 'festivo', 'Fiesta de prueba');
select pruebas.ok(nucleo.ausencia('aeaeaeae-0000-0000-0000-0000000000f1', current_date) = 'festivo', 'el festivo del calendario llega a las ausencias');
select pruebas.ok(nucleo.ausencia('aeaeaeae-0000-0000-0000-0000000000f3', current_date) is null, 'Rafa aún no está en el calendario: no tiene festivo');
insert into personal.calendario_personas (empresa_id, anio, persona_id, calendario_id) values
  ('aeaeaeae-0000-0000-0000-000000000001', extract(year from current_date)::int, 'aeaeaeae-0000-0000-0000-0000000000f3', 'aeaeaeae-0000-0000-0000-0000000000c1');
select pruebas.ok(nucleo.ausencia('aeaeaeae-0000-0000-0000-0000000000f3', current_date) = 'festivo', 'al meterlo en el calendario, también lo tiene');
create temp view dia as select t.titulo, t.asignados from limpieza.trabajos t where t.empresa_id = 'aeaeaeae-0000-0000-0000-000000000001' and t.fecha = current_date;
grant select on dia to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000eeee1', true);
select limpieza.mi_dia('aeaeaeae-0000-0000-0000-000000000001', current_date);
select pruebas.ok((select count(*) from dia) = 0, 'en un festivo de todos no sale ninguna tarea fija');
select pruebas.ok((select (d -> 'personas') @> '[{"nombre": "Pía Prueba", "ausencia": "festivo"}]' and d -> 'trabajos' = '[]'
  from jsonb_array_elements(limpieza.semana('aeaeaeae-0000-0000-0000-000000000001', current_date)) d where (d ->> 'fecha')::date = current_date),
  'la semana lo enseña como festivo y sin trabajos');

-- se quita el festivo: salen las fijas (el reparto de la mañana ya pasó, el horno queda sin asignar)
reset role;
delete from personal.dias where calendario_id = 'aeaeaeae-0000-0000-0000-0000000000c1';
select pruebas.ok(nucleo.ausencia('aeaeaeae-0000-0000-0000-0000000000f1', current_date) is null, 'quitar el festivo lo quita de las ausencias');
insert into limpieza.sustituciones (empresa_id, ausente, sustituto, desde, hasta) values
  ('aeaeaeae-0000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-0000000000f3', 'aeaeaeae-0000-0000-0000-0000000000f1', current_date + 5, current_date + 5);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000eeee1', true);
select pruebas.ok(jsonb_array_length(limpieza.mi_dia('aeaeaeae-0000-0000-0000-000000000001', current_date)) = 4, 'la encargada general ve los 4 trabajos');
select pruebas.ok(limpieza.mi_equipo('aeaeaeae-0000-0000-0000-000000000001') is null, 'y no tiene equipo: reparte a todos');

-- el responsable: solo su equipo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000eeee9', true);
select pruebas.ok((select array_agg(j ->> 'titulo' order by j ->> 'titulo') = '{Basuras,Horno}' from jsonb_array_elements(limpieza.mi_dia('aeaeaeae-0000-0000-0000-000000000001', current_date)) j),
  'el responsable ve lo de Pía y el horno sin asignar (Quim sabe hornos), no lo de Rafa ni lo de todo el equipo');
select pruebas.ok((select count(*) from limpieza.trabajos where empresa_id = 'aeaeaeae-0000-0000-0000-000000000001') = 2, 'tampoco lo ve leyendo la tabla');
select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Basuras' and empresa_id = 'aeaeaeae-0000-0000-0000-000000000001'), '{aeaeaeae-0000-0000-0000-0000000000f2}');
reset role;
select pruebas.ok((select asignados = '{aeaeaeae-0000-0000-0000-0000000000f2}' from dia where titulo = 'Basuras'), 'mueve Basuras de Pía a Quim');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000eeee9', true);
select pruebas.falla($q$select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Basuras' and empresa_id = 'aeaeaeae-0000-0000-0000-000000000001'), '{aeaeaeae-0000-0000-0000-0000000000f3}')$q$,
  'no se lo puede dar a Rafa, que no es de su equipo');
select pruebas.falla($q$select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Basuras' and empresa_id = 'aeaeaeae-0000-0000-0000-000000000001'), '{}', true)$q$,
  'ni a todo el equipo');
select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Basuras' and empresa_id = 'aeaeaeae-0000-0000-0000-000000000001'), '{}');
reset role;
select pruebas.ok((select asignados = '{}' from dia where titulo = 'Basuras'), 'lo puede soltar (sin asignar) para que lo reparta el administrador');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000eeee9', true);
select pruebas.falla($q$select limpieza.repartir('00000000-0000-0000-0000-000000000000', '{aeaeaeae-0000-0000-0000-0000000000f1}')$q$, 'un trabajo que no ve, no lo reparte');
select pruebas.ok(limpieza.crear_trabajo('aeaeaeae-0000-0000-0000-000000000001', current_date, null, 'Escoria', null, null, '{aeaeaeae-0000-0000-0000-0000000000f1}') is not null,
  'crea un trabajo para Pía');
select pruebas.falla($q$select limpieza.crear_trabajo('aeaeaeae-0000-0000-0000-000000000001', current_date, null, 'Escoria', null, null, '{aeaeaeae-0000-0000-0000-0000000000f3}')$q$,
  'pero no para Rafa');
select pruebas.falla($q$select limpieza.repartir_lo_que_queda('aeaeaeae-0000-0000-0000-000000000001', current_date)$q$, 'no pulsa «Repartir lo que queda»');
select pruebas.ok((select count(*) from limpieza.sustituciones) = 0, 'ni ve los sustitutos');
select pruebas.ok((select array_agg(distinct p ->> 'nombre' order by p ->> 'nombre') = '{Pía Prueba,Quim Prueba}'
  from jsonb_array_elements(limpieza.semana('aeaeaeae-0000-0000-0000-000000000001', current_date)) d, jsonb_array_elements(d -> 'personas') p), 'en la semana solo salen Pía y Quim');
select pruebas.ok((select count(*) from limpieza.responsables) = 1, 've su propia lista de equipo');
update limpieza.responsables set operarios = operarios || 'aeaeaeae-0000-0000-0000-0000000000f3'::uuid;
select pruebas.ok((select cardinality(operarios) = 2 from limpieza.responsables), 'pero no la puede cambiar');
rollback;
