-- Hacer el calendario por operario y guardarlo de una vez (guardar_calendario). Datos inventados.
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

insert into nucleo.empresas (id, codigo, nombre) values ('55555555-0000-0000-0000-000000000001', 'unidad-o', 'Unidad O');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('55555555-0000-0000-0000-000000000001', 'personal');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('55555555-0000-0000-0000-0000000000f1', '55555555-0000-0000-0000-000000000001', 'Ana Prueba'),
  ('55555555-0000-0000-0000-0000000000f2', '55555555-0000-0000-0000-000000000001', 'Bruno Prueba');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000005a1'), ('00000000-0000-0000-0000-0000000005f1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000005a1', 'Jefe O', null), ('00000000-0000-0000-0000-0000000005f1', 'Ana', '55555555-0000-0000-0000-0000000000f1');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), '55555555-0000-0000-0000-000000000001' from (values
  ('00000000-0000-0000-0000-0000000005a1', 'admin_empresa'), ('00000000-0000-0000-0000-0000000005f1', 'operario')) x(u, r);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true);

-- el calendario de Ana: 3 días con sus horas, un festivo y unas vacaciones nuevas
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('ana', personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, null, 'Ana 2031', 22,
  array['55555555-0000-0000-0000-0000000000f1']::uuid[],
  '[{"fecha":"2031-03-03","tipo":"trabaja","horas":8},{"fecha":"2031-03-04","tipo":"trabaja","horas":8},
    {"fecha":"2031-03-07","tipo":"trabaja","horas":6},{"fecha":"2031-03-19","tipo":"festivo","nombre":"San José"},
    {"fecha":"2031-03-10","tipo":"trabaja","horas":7.5}]',
  '[{"persona_id":"55555555-0000-0000-0000-0000000000f1","desde":"2031-03-10","hasta":"2031-03-11","nota":"Médico"}]'));
select pruebas.ok(pruebas.cuantas($q$select * from personal.dias where calendario_id = (select id from ids where k = 'ana')$q$) = 5, 'se guardan los 5 días');
select pruebas.ok((select horas from personal.horas_personas((select id from ids where k = 'ana'))) = 22,
  'horas de Ana: 8+8+6 = 22 (el día de vacaciones no cuenta)');
select pruebas.ok((select objetivo from personal.horas_personas((select id from ids where k = 'ana'))) = 22, 'y sus horas al año son 22: cuadra');
select pruebas.ok(pruebas.cuantas($q$select * from personal.vacaciones where nota = 'Médico'$q$) = 1, 'se guardan sus vacaciones');

-- volver a guardar cambia los días (no los duplica)
select personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, (select id from ids where k = 'ana'), 'Ana 2031', 16,
  array['55555555-0000-0000-0000-0000000000f1']::uuid[], '[{"fecha":"2031-03-03","tipo":"trabaja","horas":8},{"fecha":"2031-03-04","tipo":"trabaja","horas":8}]');
select pruebas.ok(pruebas.cuantas($q$select * from personal.dias where calendario_id = (select id from ids where k = 'ana')$q$) = 2, 'al volver a guardar quedan solo los días nuevos');

-- si algo está mal, no se guarda nada
select pruebas.falla($q$select personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, (select id from ids where k = 'ana'), 'Ana 2031', 16,
  array['55555555-0000-0000-0000-0000000000f1']::uuid[], '[{"fecha":"2031-03-05","tipo":"trabaja","horas":8},{"fecha":"2032-01-01","tipo":"trabaja","horas":8}]')$q$,
  'un día de otro año da error');
select pruebas.ok(pruebas.cuantas($q$select * from personal.dias where calendario_id = (select id from ids where k = 'ana') and fecha = '2031-03-05'$q$) = 0,
  'y no se ha guardado nada a medias');
select pruebas.falla($q$select personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, null, 'Nadie', 10, array[]::uuid[], '[]')$q$,
  'un calendario tiene que ser para alguien');

-- varios a la vez: Ana y Bruno juntos; el de Ana se queda vacío y se quita
insert into ids values ('juntos', personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, null, 'Ana y Bruno 2031', 8,
  array['55555555-0000-0000-0000-0000000000f1', '55555555-0000-0000-0000-0000000000f2']::uuid[], '[{"fecha":"2031-03-03","tipo":"trabaja","horas":8}]'));
select pruebas.ok(pruebas.cuantas($q$select * from personal.calendario_personas where calendario_id = (select id from ids where k = 'juntos')$q$) = 2, 'Ana y Bruno en el mismo calendario');
select pruebas.ok(pruebas.cuantas($q$select * from personal.calendarios where id = (select id from ids where k = 'ana')$q$) = 0, 'el calendario que se ha quedado sin nadie se quita');
select pruebas.ok((select bool_and(horas = objetivo) from personal.horas_personas((select id from ids where k = 'juntos'))), 'a los dos les cuadra');

-- un operario no puede
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005f1', true);
select pruebas.falla($q$select personal.guardar_calendario('55555555-0000-0000-0000-000000000001', 2031, null, 'Mío', 1, array['55555555-0000-0000-0000-0000000000f1']::uuid[], '[]')$q$,
  'un operario no se hace su calendario');
rollback;
