-- Limpieza: faltas (nucleo.ausencias), sustitutos, reparto automático y plan de la semana. Personas inventadas.
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

-- unidad S: Ana, Beto y Carla trabajan todos los días (Carla sabe hacer hornos); Dani no entra en el reparto
insert into nucleo.empresas (id, codigo, nombre) values ('adadadad-0000-0000-0000-000000000001', 'unidad-s', 'Unidad S');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('adadadad-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('adadadad-0000-0000-0000-0000000000e1', 'adadadad-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.personas (id, empresa_id, nombre, horario)
select x.id::uuid, 'adadadad-0000-0000-0000-000000000001', x.n,
       (select jsonb_object_agg(d, '[["08:00","16:00"]]'::jsonb) from unnest(array['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) d)
  from (values ('adadadad-0000-0000-0000-0000000000f1', 'Ana Prueba'), ('adadadad-0000-0000-0000-0000000000f2', 'Beto Prueba'),
               ('adadadad-0000-0000-0000-0000000000f3', 'Carla Prueba'), ('adadadad-0000-0000-0000-0000000000f4', 'Dani Prueba')) x(id, n);
insert into limpieza.personas (persona_id, empresa_id, grupos) values
  ('adadadad-0000-0000-0000-0000000000f1', 'adadadad-0000-0000-0000-000000000001', '{}'),
  ('adadadad-0000-0000-0000-0000000000f2', 'adadadad-0000-0000-0000-000000000001', '{}'),
  ('adadadad-0000-0000-0000-0000000000f3', 'adadadad-0000-0000-0000-000000000001', '{hornos}');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000dde1'), ('00000000-0000-0000-0000-00000000ddf2');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-00000000dde1', 'Encargado S', null),
  ('00000000-0000-0000-0000-00000000ddf2', 'Beto', 'adadadad-0000-0000-0000-0000000000f2');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), 'adadadad-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000000dde1', 'encargado'), ('00000000-0000-0000-0000-00000000ddf2', 'operario')) x(u, r);
insert into limpieza.tareas (empresa_id, clase, titulo, grupo, minutos_est, dias, asignados, equipo_id)
select *, 'adadadad-0000-0000-0000-0000000000e1'::uuid from (values
  ('adadadad-0000-0000-0000-000000000001'::uuid, 'fija', 'Basuras', null, 20, '{0,1,2,3,4,5,6}'::int[], '{adadadad-0000-0000-0000-0000000000f1}'::uuid[]),
  ('adadadad-0000-0000-0000-000000000001'::uuid, 'fija', 'Fregar', null, 20, '{0,1,2,3,4,5,6}', '{adadadad-0000-0000-0000-0000000000f2}'),
  ('adadadad-0000-0000-0000-000000000001'::uuid, 'fija', 'Horno', 'hornos', 60, '{0,1,2,3,4,5,6}', '{}'),
  ('adadadad-0000-0000-0000-000000000001'::uuid, 'fija', 'Pasillo', null, 30, '{0,1,2,3,4,5,6}', '{}')) x(a, b, c, d, e, f, g);

-- Ana está de vacaciones hoy y Beto la cubre; Beto falta mañana (baja) y nadie le cubre
insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values
  ('adadadad-0000-0000-0000-000000000001', 'adadadad-0000-0000-0000-0000000000f1', current_date, current_date);
insert into personal.horas_dia (empresa_id, persona_id, fecha, falta) values
  ('adadadad-0000-0000-0000-000000000001', 'adadadad-0000-0000-0000-0000000000f2', current_date + 1, 'baja');
select pruebas.ok(nucleo.ausencia('adadadad-0000-0000-0000-0000000000f1', current_date) = 'vacaciones', 'las vacaciones de Personal llegan a las ausencias del núcleo');
select pruebas.ok(nucleo.ausencia('adadadad-0000-0000-0000-0000000000f2', current_date + 1) = 'baja', 'y las faltas de «Horas del día» también');
select pruebas.ok(nucleo.ausencia('adadadad-0000-0000-0000-0000000000f1', current_date + 1) is null, 'el día que no falta, no sale');
insert into limpieza.sustituciones (empresa_id, ausente, sustituto, desde, hasta) values
  ('adadadad-0000-0000-0000-000000000001', 'adadadad-0000-0000-0000-0000000000f1', 'adadadad-0000-0000-0000-0000000000f2', current_date, current_date);
create temp view dia as select t.titulo, t.fecha, t.asignados, t.asignados_orig, t.aviso_reparto from limpieza.trabajos t
 where t.empresa_id = 'adadadad-0000-0000-0000-000000000001';
grant select on dia to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dde1', true);
select limpieza.mi_dia('adadadad-0000-0000-0000-000000000001', current_date);
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f2}' and asignados_orig = '{adadadad-0000-0000-0000-0000000000f1}' and aviso_reparto like 'Beto Prueba cubre a Ana Prueba%'
  from dia where titulo = 'Basuras' and fecha = current_date), 'Ana falta: Basuras se la lleva Beto, su sustituto');
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f3}' and aviso_reparto = 'Repartido solo' from dia where titulo = 'Horno' and fecha = current_date),
  'el horno solo va a Carla, que sabe hacer hornos');
select pruebas.ok((select cardinality(asignados) = 1 and not ('adadadad-0000-0000-0000-0000000000f1' = any(asignados)) and not ('adadadad-0000-0000-0000-0000000000f4' = any(asignados))
  from dia where titulo = 'Pasillo' and fecha = current_date), 'el pasillo se reparte solo, ni a Ana (falta) ni a Dani (no entra en el reparto)');
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f2}' from dia where titulo = 'Pasillo' and fecha = current_date),
  'y a quien menos lleva (Beto 40 min, Carla 60 con el horno)');

-- el reparto de la mañana es una vez: si lo quito a mano, no vuelve a repartirse solo
reset role;
update limpieza.trabajos set asignados = '{}', aviso_reparto = null where titulo = 'Pasillo' and fecha = current_date and empresa_id = 'adadadad-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dde1', true);
select limpieza.mi_dia('adadadad-0000-0000-0000-000000000001', current_date);
select pruebas.ok((select asignados = '{}' from dia where titulo = 'Pasillo' and fecha = current_date), 'el reparto solo se hace una vez por la mañana');
select pruebas.ok(limpieza.repartir_lo_que_queda('adadadad-0000-0000-0000-000000000001', current_date) = 1, 'el botón «Repartir lo que queda» lo reparte');
select pruebas.ok((select cardinality(asignados) = 1 from dia where titulo = 'Pasillo' and fecha = current_date), 'y el pasillo vuelve a tener a alguien');

-- mañana: Beto falta y nadie le cubre → Fregar sin asignar (y mañana todavía no se reparte solo)
select limpieza.mi_dia('adadadad-0000-0000-0000-000000000001', current_date + 1);
select pruebas.ok((select asignados = '{}' and aviso_reparto = 'Falta Beto Prueba' from dia where titulo = 'Fregar' and fecha = current_date + 1),
  'sin sustituto, el trabajo del que falta sale sin asignar');
select pruebas.ok((select asignados = '{}' from dia where titulo = 'Pasillo' and fecha = current_date + 1), 'mañana todavía no se reparte solo');
insert into limpieza.sustituciones (empresa_id, ausente, sustituto, desde, hasta) values
  ('adadadad-0000-0000-0000-000000000001', 'adadadad-0000-0000-0000-0000000000f2', 'adadadad-0000-0000-0000-0000000000f3', current_date + 1, current_date + 1);
select limpieza.mi_dia('adadadad-0000-0000-0000-000000000001', current_date + 1);
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f3}' and aviso_reparto = 'Carla Prueba cubre a Beto Prueba' from dia where titulo = 'Fregar' and fecha = current_date + 1),
  'si luego apunto sustituto, el trabajo que salió sin nadie se lo lleva él');
select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Fregar' and fecha = current_date + 1 and empresa_id = 'adadadad-0000-0000-0000-000000000001'),
  '{adadadad-0000-0000-0000-0000000000f1}');
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f1}' and aviso_reparto is null from dia where titulo = 'Fregar' and fecha = current_date + 1),
  'repartir a mano manda y borra el aviso');
select limpieza.mi_dia('adadadad-0000-0000-0000-000000000001', current_date + 1);
select pruebas.ok((select asignados = '{adadadad-0000-0000-0000-0000000000f1}' from dia where titulo = 'Fregar' and fecha = current_date + 1), 'y no se deshace al volver a abrir el día');

-- plan de la semana
select pruebas.ok(jsonb_array_length(limpieza.semana('adadadad-0000-0000-0000-000000000001', current_date)) = 7, 'la semana tiene 7 días');
select pruebas.ok((select (d -> 'personas') @> jsonb_build_array(jsonb_build_object('nombre', 'Ana Prueba', 'ausencia', 'vacaciones', 'horario_min', 480, 'trabajo_min', 0))
  from jsonb_array_elements(limpieza.semana('adadadad-0000-0000-0000-000000000001', current_date)) d where (d ->> 'fecha')::date = current_date),
  'hoy Ana sale de vacaciones, con 8 h de horario y 0 de trabajo');
select pruebas.ok((select (d -> 'trabajos') @> '[{"titulo": "Basuras", "previsto": true, "nombres": ["Ana Prueba"]}]'
  from jsonb_array_elements(limpieza.semana('adadadad-0000-0000-0000-000000000001', current_date)) d where (d ->> 'fecha')::date = current_date + 2),
  'pasado mañana sale Basuras prevista para Ana');

-- el operario no reparte, ni ve los sustitutos, ni la semana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ddf2', true);
select pruebas.falla($q$select limpieza.repartir_lo_que_queda('adadadad-0000-0000-0000-000000000001', current_date)$q$, 'el operario no pulsa «Repartir lo que queda»');
select pruebas.ok((select count(*) from limpieza.sustituciones) = 0, 'ni ve los sustitutos');
select pruebas.falla($q$insert into limpieza.sustituciones (empresa_id, ausente, sustituto, desde, hasta) values ('adadadad-0000-0000-0000-000000000001',
  'adadadad-0000-0000-0000-0000000000f2', 'adadadad-0000-0000-0000-0000000000f3', current_date, current_date)$q$, 'ni los apunta');
select pruebas.falla($q$select limpieza.semana('adadadad-0000-0000-0000-000000000001', current_date)$q$, 'ni ve el plan de la semana');
select pruebas.falla($q$select limpieza.generar_dia('adadadad-0000-0000-0000-000000000001', current_date)$q$, 'sacar el día a mano no se puede');
select pruebas.falla($q$insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen) values ('adadadad-0000-0000-0000-000000000001',
  'adadadad-0000-0000-0000-0000000000f2', current_date, current_date, 'otro', 'a mano')$q$, 'nadie escribe ausencias a mano');

-- quitar la falta quita la ausencia
reset role;
delete from personal.horas_dia where persona_id = 'adadadad-0000-0000-0000-0000000000f2';
select pruebas.ok(nucleo.ausencia('adadadad-0000-0000-0000-0000000000f2', current_date + 1) is null, 'quitar la falta en Personal la quita de las ausencias');
update personal.vacaciones set desde = current_date + 3, hasta = current_date + 4 where persona_id = 'adadadad-0000-0000-0000-0000000000f1';
select pruebas.ok(nucleo.ausencia('adadadad-0000-0000-0000-0000000000f1', current_date) is null and nucleo.ausencia('adadadad-0000-0000-0000-0000000000f1', current_date + 4) = 'vacaciones',
  'cambiar las vacaciones las cambia también');
rollback;
