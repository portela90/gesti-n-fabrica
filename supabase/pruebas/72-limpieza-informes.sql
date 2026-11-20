-- Limpieza: resumen e informes (qué ve cada uno), aviso de los lunes y arreglo de _push_resultado. Personas inventadas.
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

-- unidad G: Ana y Bea en Semana, Ciro en Finde; Enca (Semana) es responsable de Ana; Fede es encargado del Finde.
-- Otra unidad H con un trabajo que nadie de G debe ver.
insert into nucleo.empresas (id, codigo, nombre) values
  ('a7a7a7a7-0000-0000-0000-000000000001', 'unidad-g', 'Unidad G'), ('a7a7a7a7-0000-0000-0000-000000000002', 'unidad-h', 'Unidad H');
insert into nucleo.empresa_modulos (empresa_id, modulo) values
  ('a7a7a7a7-0000-0000-0000-000000000001', 'limpieza'), ('a7a7a7a7-0000-0000-0000-000000000002', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values
  ('a7a7a7a7-0000-0000-0000-0000000000e1', 'a7a7a7a7-0000-0000-0000-000000000001', 'semana', 'Semana'),
  ('a7a7a7a7-0000-0000-0000-0000000000e2', 'a7a7a7a7-0000-0000-0000-000000000001', 'finde', 'Finde');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('a7a7a7a7-0000-0000-0000-0000000000f1', 'a7a7a7a7-0000-0000-0000-000000000001', 'Ana Prueba',  'a7a7a7a7-0000-0000-0000-0000000000e1'),
  ('a7a7a7a7-0000-0000-0000-0000000000f2', 'a7a7a7a7-0000-0000-0000-000000000001', 'Bea Prueba',  'a7a7a7a7-0000-0000-0000-0000000000e1'),
  ('a7a7a7a7-0000-0000-0000-0000000000f3', 'a7a7a7a7-0000-0000-0000-000000000001', 'Ciro Prueba', 'a7a7a7a7-0000-0000-0000-0000000000e2'),
  ('a7a7a7a7-0000-0000-0000-0000000000f8', 'a7a7a7a7-0000-0000-0000-000000000001', 'Enca Prueba', 'a7a7a7a7-0000-0000-0000-0000000000e1'),
  ('a7a7a7a7-0000-0000-0000-0000000000f9', 'a7a7a7a7-0000-0000-0000-000000000001', 'Fede Prueba', 'a7a7a7a7-0000-0000-0000-0000000000e2'),
  ('a7a7a7a7-0000-0000-0000-0000000000a1', 'a7a7a7a7-0000-0000-0000-000000000002', 'Hugo Prueba', null);
insert into limpieza.responsables (persona_id, empresa_id, operarios) values
  ('a7a7a7a7-0000-0000-0000-0000000000f8', 'a7a7a7a7-0000-0000-0000-000000000001', '{a7a7a7a7-0000-0000-0000-0000000000f1}');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000007a0a1'), ('00000000-0000-0000-0000-00000007a0e8'),
  ('00000000-0000-0000-0000-00000007a0e9'), ('00000000-0000-0000-0000-00000007a0f1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-00000007a0a1', 'Admin G', null),
  ('00000000-0000-0000-0000-00000007a0e8', 'Enca', 'a7a7a7a7-0000-0000-0000-0000000000f8'),
  ('00000000-0000-0000-0000-00000007a0e9', 'Fede', 'a7a7a7a7-0000-0000-0000-0000000000f9'),
  ('00000000-0000-0000-0000-00000007a0f1', 'Ana',  'a7a7a7a7-0000-0000-0000-0000000000f1');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'a7a7a7a7-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000007a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000007a0e8', 'encargado'),
               ('00000000-0000-0000-0000-00000007a0e9', 'encargado'), ('00000000-0000-0000-0000-00000007a0f1', 'operario')) x(u, r);

-- trabajos de la semana del 16 al 22/11/2026
insert into limpieza.trabajos (empresa_id, fecha, clase, titulo, asignados, equipo_id, estado, inicio, fin, minutos, minutos_est, hecho_por, checklist)
values
  ('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-17', 'suelto', 'Barrer F4', '{a7a7a7a7-0000-0000-0000-0000000000f1}', 'a7a7a7a7-0000-0000-0000-0000000000e1',
   'hecho', '2026-11-17 08:00+01', '2026-11-17 08:40+01', 40, 30, 'a7a7a7a7-0000-0000-0000-0000000000f1',
   '[{"texto": "Suelo", "tipo": "ok", "valor": "bien"}, {"texto": "Rejilla", "tipo": "ok", "valor": "mal"}, {"texto": "Aceite", "tipo": "numero", "valor": "2", "minimo": 5, "bajo_minimo": true}]'),
  ('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-18', 'suelto', 'Fregar pasillo', '{a7a7a7a7-0000-0000-0000-0000000000f2}', 'a7a7a7a7-0000-0000-0000-0000000000e1',
   'pendiente', null, null, null, 20, null, null),
  ('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-21', 'suelto', 'Vaciar escoria', '{a7a7a7a7-0000-0000-0000-0000000000f3}', 'a7a7a7a7-0000-0000-0000-0000000000e2',
   'pendiente', null, null, null, 15, null, null),
  ('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-22', 'suelto', 'Repaso del finde', '{}', 'a7a7a7a7-0000-0000-0000-0000000000e2',
   'pendiente', null, null, null, null, null, null),
  ('a7a7a7a7-0000-0000-0000-000000000002', '2026-11-17', 'suelto', 'Trabajo de H', '{a7a7a7a7-0000-0000-0000-0000000000a1}', null,
   'pendiente', null, null, null, null, null, null);
create temp table r (quien text, j jsonb);
grant all on r to authenticated;
create temp view titulos as select quien, (select coalesce(array_agg(t ->> 'titulo' order by t ->> 'titulo'), '{}') from jsonb_array_elements(j -> 'trabajos') t) as tit,
  (select coalesce(array_agg(p ->> 'nombre' order by p ->> 'nombre'), '{}') from jsonb_array_elements(j -> 'personas') p) as gente, j ->> 'alcance' as alcance from r;
grant select on titulos to authenticated;

set role authenticated;
-- el administrador: todo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0a1', true);
insert into r select 'admin', limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22');
select pruebas.ok((select alcance = 'todo' and tit = '{"Barrer F4","Fregar pasillo","Repaso del finde","Vaciar escoria"}' from titulos where quien = 'admin'),
  'el administrador ve los 4 trabajos de su unidad (no el de la otra)');
select pruebas.ok((select cardinality(gente) = 5 from titulos where quien = 'admin'), 'y a las 5 personas para el informe por operario');
select pruebas.ok((select j -> 'unidad' = '"Unidad G"' from r where quien = 'admin'), 'el nombre de la unidad viene para la cabecera');
select pruebas.ok((select (t ->> 'checklist_mal')::int = 2 and (t ->> 'checklist_puntos')::int = 3 and t ->> 'hecho_por_nombre' = 'Ana Prueba'
                     and t -> 'asignados_nombres' = '["Ana Prueba"]' and t ->> 'equipo' = 'Semana' and (t ->> 'minutos')::int = 40
                     and (t ->> 'minutos_est')::int = 30
                     from r, jsonb_array_elements(j -> 'trabajos') t where quien = 'admin' and t ->> 'titulo' = 'Barrer F4'),
  'cada trabajo trae nombres, tiempos y los puntos mal (mal o por debajo del mínimo)');
select pruebas.falla($$select limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-22', '2026-11-16')$$, '«hasta» antes que «desde» no vale');
select pruebas.falla($$select limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2025-01-01', '2026-11-16')$$, 'más de 400 días de una vez no vale');
select pruebas.falla($$select limpieza.informe('a7a7a7a7-0000-0000-0000-000000000002', '2026-11-16', '2026-11-22')$$, 'de otra unidad, nada');

-- el responsable (Encargado hornos): solo su equipo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0e8', true);
insert into r select 'enca', limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22');
select pruebas.ok((select alcance = 'responsable' and tit = '{"Barrer F4"}' from titulos where quien = 'enca'), 'el responsable solo ve lo de Ana (su equipo)');
select pruebas.ok((select gente = '{"Ana Prueba","Enca Prueba"}' from titulos where quien = 'enca'), 'y para el informe por operario, Ana y él');

-- el encargado del fin de semana: los de su equipo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0e9', true);
insert into r select 'fede', limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22');
select pruebas.ok((select alcance = 'equipo' and tit = '{"Repaso del finde","Vaciar escoria"}' from titulos where quien = 'fede'),
  'el encargado del Finde ve lo de Ciro y lo del equipo Finde sin asignar, no lo de Semana');
select pruebas.ok((select gente = '{"Ciro Prueba","Fede Prueba"}' from titulos where quien = 'fede'), 'y su gente es la del equipo Finde');

-- el operario: nada
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0f1', true);
select pruebas.falla($$select limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22')$$, 'el operario no saca informes');
select pruebas.falla($$select limpieza._aviso_informe_semanal()$$, 'ni puede lanzar el aviso de los lunes');
select pruebas.falla($$select limpieza._informe_alcance('a7a7a7a7-0000-0000-0000-000000000001')$$, 'ni llamar a las piezas internas');

-- un encargado sin equipo en su ficha: no ve nada (pero no da error)
reset role;
update nucleo.personas set equipo_id = null where id = 'a7a7a7a7-0000-0000-0000-0000000000f9';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0e9', true);
select pruebas.ok(jsonb_array_length(limpieza.informe('a7a7a7a7-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22') -> 'trabajos') = 0,
  'un encargado sin equipo en su ficha no ve trabajos');
reset role;
update nucleo.personas set equipo_id = 'a7a7a7a7-0000-0000-0000-0000000000e2' where id = 'a7a7a7a7-0000-0000-0000-0000000000f9';

-- permisos de partida
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a0e8', true);
select pruebas.ok(nucleo.tiene_permiso('limpieza.informe.ver', 'a7a7a7a7-0000-0000-0000-000000000001')
  and not nucleo.tiene_permiso('limpieza.informe.todo', 'a7a7a7a7-0000-0000-0000-000000000001'),
  'el encargado tiene informe.ver pero no informe.todo');
reset role;

-- ---------- aviso de los lunes ----------
select pruebas.ok(exists (select 1 from cron.job where jobname = 'informe-limpieza-lunes' and schedule = '0 7,8 * * 1'), 'el reloj de los lunes está puesto');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-11-23 07:00+00') = 0, 'lunes a las 8 de Madrid: todavía no avisa');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-11-24 08:00+00') = 0, 'un martes no avisa');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-11-23 08:00+00') = 1, 'lunes a las 9 de Madrid (invierno): avisa a uno en G (en H nadie tiene informe.todo)');
select pruebas.ok((select count(*) = 1 and min(titulo) = 'Ya está el informe de la semana 47' and min(ruta) = '/m/limpieza/resumen/informes/2026-11-16'
                     and min(texto) like 'Del 16/11 al 22/11%'
                     from nucleo.notificaciones where etiqueta = 'informe-limpieza-2026-11-16'),
  'solo el administrador recibe el aviso, con la semana y la ruta al informe');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-11-23 08:30+00') = 0, 'si se llama otra vez la misma semana no repite');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-07-06 07:00+00') = 0, 'en verano (9 de Madrid = 7 UTC) tampoco avisa si la semana no tuvo trabajos');
insert into limpieza.trabajos (empresa_id, fecha, clase, titulo) values ('a7a7a7a7-0000-0000-0000-000000000001', '2026-07-01', 'suelto', 'Trabajo de verano');
select pruebas.ok(limpieza._aviso_informe_semanal('2026-07-06 07:00+00') = 1, 'en verano avisa a las 7 UTC, que son las 9 de Madrid');

-- ---------- _push_resultado: un reintento que sale bien borra el error ----------
create temp table secreto as select decrypted_secret s from vault.decrypted_secrets where name = 'push_secreto';
update nucleo.notificaciones set envio_error = 'fallo de antes' where etiqueta = 'informe-limpieza-2026-11-16';
select nucleo._push_resultado((select s from secreto), (select array_agg(id) from nucleo.notificaciones where etiqueta = 'informe-limpieza-2026-11-16'), '{}', '{}');
select pruebas.ok((select bool_and(enviado is not null and envio_error is null) from nucleo.notificaciones where etiqueta = 'informe-limpieza-2026-11-16'),
  'al enviarse bien en un reintento se borra el error anterior');

rollback;
