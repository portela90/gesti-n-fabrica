-- Limpieza: repartir los trabajos del día y crear trabajos para otros. Personas inventadas.
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

insert into nucleo.empresas (id, codigo, nombre) values ('abababab-0000-0000-0000-000000000001', 'unidad-r', 'Unidad R'), ('acacacac-0000-0000-0000-000000000001', 'unidad-q', 'Unidad Q');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('abababab-0000-0000-0000-000000000001', 'limpieza'), ('acacacac-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('abababab-0000-0000-0000-0000000000e1', 'abababab-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('abababab-0000-0000-0000-0000000000f1', 'abababab-0000-0000-0000-000000000001', 'Rosa Prueba', 'abababab-0000-0000-0000-0000000000e1'),
  ('abababab-0000-0000-0000-0000000000f2', 'abababab-0000-0000-0000-000000000001', 'Raúl Prueba', 'abababab-0000-0000-0000-0000000000e1'),
  ('acacacac-0000-0000-0000-0000000000f1', 'acacacac-0000-0000-0000-000000000001', 'Quino Otra', null);
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000cce1'), ('00000000-0000-0000-0000-00000000ccf1'), ('00000000-0000-0000-0000-00000000ccc1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-00000000cce1', 'Encargado R', null), ('00000000-0000-0000-0000-00000000ccf1', 'Rosa', 'abababab-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000ccc1', 'Sin ficha R', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), 'abababab-0000-0000-0000-000000000001' from (values
  ('00000000-0000-0000-0000-00000000cce1', 'encargado'), ('00000000-0000-0000-0000-00000000ccf1', 'operario'), ('00000000-0000-0000-0000-00000000ccc1', 'operario')) x(u, r);
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, equipo_id, asignados) values
  ('abababab-0000-0000-0000-0000000000b1', 'abababab-0000-0000-0000-000000000001', 'fija', 'Basuras', array[extract(dow from current_date)::int], 'abababab-0000-0000-0000-0000000000e1', '{abababab-0000-0000-0000-0000000000f1}');
insert into limpieza.tareas (id, empresa_id, clase, titulo, solo_para) values
  ('abababab-0000-0000-0000-0000000000c1', 'abababab-0000-0000-0000-000000000001', 'habitual', 'Hornos', '{abababab-0000-0000-0000-0000000000f2}');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
set role authenticated;

-- el encargado ve el día y reparte
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cce1', true);
insert into ids select 'basuras', (j ->> 'id')::uuid from jsonb_array_elements(limpieza.mi_dia('abababab-0000-0000-0000-000000000001', current_date)) j;
select limpieza.repartir((select v from ids where k = 'basuras'), '{abababab-0000-0000-0000-0000000000f2,abababab-0000-0000-0000-0000000000f2}');
select pruebas.ok((select asignados = '{abababab-0000-0000-0000-0000000000f2}' from limpieza.trabajos where id = (select v from ids where k = 'basuras')), 'el encargado le pasa el trabajo a Raúl');
select pruebas.ok((select asignados = '{abababab-0000-0000-0000-0000000000f1}' from limpieza.tareas where id = 'abababab-0000-0000-0000-0000000000b1'), 'la tarea fija sigue como estaba');
select limpieza.repartir((select v from ids where k = 'basuras'), '{}', true);
select pruebas.ok((select todo_equipo and asignados = '{}' from limpieza.trabajos where id = (select v from ids where k = 'basuras')), 'o a todo el equipo');
select pruebas.falla($q$select limpieza.repartir((select v from ids where k = 'basuras'), '{acacacac-0000-0000-0000-0000000000f1}')$q$, 'no a alguien de otra unidad');
insert into ids select 'para_raul', limpieza.crear_trabajo('abababab-0000-0000-0000-000000000001', current_date, 'abababab-0000-0000-0000-0000000000c1', null, null, null, '{abababab-0000-0000-0000-0000000000f2}');
select pruebas.ok((select asignados = '{abababab-0000-0000-0000-0000000000f2}' and creado_por = '00000000-0000-0000-0000-00000000cce1' from limpieza.trabajos where id = (select v from ids where k = 'para_raul')),
  'el encargado crea un trabajo para Raúl');
select pruebas.falla($q$select limpieza.crear_trabajo('abababab-0000-0000-0000-000000000001', current_date, null, 'Para nadie', null, null, '{}')$q$, 'para nadie no');

-- la operaria no reparte ni crea para otros
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ccf1', true);
select pruebas.falla($q$select limpieza.repartir((select v from ids where k = 'basuras'), '{abababab-0000-0000-0000-0000000000f1}')$q$, 'la operaria no reparte');
select pruebas.falla($q$select limpieza.crear_trabajo('abababab-0000-0000-0000-000000000001', current_date, null, 'Para Raúl', null, null, '{abababab-0000-0000-0000-0000000000f2}')$q$, 'ni crea trabajos para otros');
select pruebas.ok(limpieza.crear_trabajo('abababab-0000-0000-0000-000000000001', current_date, null, 'Para mí') is not null, 'para ella sí');
select pruebas.ok((select bool_or((j ->> 'titulo') = 'Basuras') from jsonb_array_elements(limpieza.mi_dia('abababab-0000-0000-0000-000000000001', current_date)) j), 'y ahora ve Basuras (es de todo su equipo)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ccc1', true);
select pruebas.falla($q$select limpieza.crear_trabajo('abababab-0000-0000-0000-000000000001', current_date, null, 'Para Raúl', null, null, '{abababab-0000-0000-0000-0000000000f2}')$q$, 'sin ficha tampoco crea para otros');

-- lo hecho ya no se reparte
reset role;
update limpieza.trabajos set estado = 'hecho', fin = now(), minutos = 5 where id = (select v from ids where k = 'para_raul');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cce1', true);
select pruebas.falla($q$select limpieza.repartir((select v from ids where k = 'para_raul'), '{abababab-0000-0000-0000-0000000000f1}')$q$, 'un trabajo hecho no se reparte');
rollback;
