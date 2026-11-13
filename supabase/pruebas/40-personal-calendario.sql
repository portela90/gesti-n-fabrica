-- Personal · Calendario laboral: días por equipo, vacaciones, envíos a firmar y firmas.
-- Empresas y personas inventadas. Todo se deshace al final.
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

-- ---------- datos inventados ----------
-- Unidad L (con Personal encendido) y unidad M (sin Personal)
insert into nucleo.empresas (id, codigo, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'unidad-l', 'Unidad L'),
  ('22222222-0000-0000-0000-000000000001', 'unidad-m', 'Unidad M');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('11111111-0000-0000-0000-000000000001', 'personal');
insert into nucleo.equipos (id, empresa_id, codigo, nombre, dias) values
  ('11111111-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001', 'sem', 'Semana', '{1,2,3,4,5}'),
  ('11111111-0000-0000-0000-0000000000e2', '11111111-0000-0000-0000-000000000001', 'fin', 'Fin de semana', '{0,6}'),
  ('22222222-0000-0000-0000-0000000000e1', '22222222-0000-0000-0000-000000000001', 'sem', 'Semana M', '{1,2,3,4,5}');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('11111111-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', 'Ana Prueba', '11111111-0000-0000-0000-0000000000e1'),
  ('11111111-0000-0000-0000-0000000000f2', '11111111-0000-0000-0000-000000000001', 'Bruno Prueba', '11111111-0000-0000-0000-0000000000e1'),
  ('11111111-0000-0000-0000-0000000000f3', '11111111-0000-0000-0000-000000000001', 'Carla Encargada', '11111111-0000-0000-0000-0000000000e2'),
  ('22222222-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000001', 'Mario Otra', '22222222-0000-0000-0000-0000000000e1');
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000001a1'), ('00000000-0000-0000-0000-0000000001f1'), ('00000000-0000-0000-0000-0000000001f2'),
  ('00000000-0000-0000-0000-0000000001e3'), ('00000000-0000-0000-0000-0000000002a1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000001a1', 'Jefe L', null),
  ('00000000-0000-0000-0000-0000000001f1', 'Ana', '11111111-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000001f2', 'Bruno', '11111111-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000001e3', 'Carla', '11111111-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000002a1', 'Jefe M', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000001a1', 'admin_empresa', '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000001f1', 'operario',      '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000001f2', 'operario',      '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000001e3', 'encargado',     '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000002a1', 'admin_empresa', '22222222-0000-0000-0000-000000000001')) x(u, r, e);

-- calendarios del año 2031 (los crea el jefe)
insert into personal.calendarios (id, empresa_id, anio, nombre, dias_semana) values
  ('11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 2031, 'Semana 2031', '{1,2,3,4,5}'),
  ('11111111-0000-0000-0000-0000000000c2', '11111111-0000-0000-0000-000000000001', 2031, 'Fin de semana 2031', '{0,6}'),
  ('22222222-0000-0000-0000-0000000000c1', '22222222-0000-0000-0000-000000000001', 2031, 'Semana M 2031', '{1,2,3,4,5}');

set role authenticated;

-- ---------- jefe: calendarios, personas y días ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);
select pruebas.ok(nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos' ? 'personal', 'el jefe ve Personal en el menú');
insert into personal.calendarios (id, empresa_id, anio, nombre, dias_semana) values
  ('11111111-0000-0000-0000-0000000000c3', '11111111-0000-0000-0000-000000000001', 2031, 'Refuerzo 2031', '{1,3,5}');
select pruebas.falla($q$insert into personal.calendarios (empresa_id, anio, nombre) values ('11111111-0000-0000-0000-000000000001', 2031, 'Refuerzo 2031')$q$,
  'no hay dos calendarios con el mismo nombre el mismo año');
select pruebas.ok(personal.poner_personas('11111111-0000-0000-0000-0000000000c1',
  array['11111111-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-0000000000f2']::uuid[]) = 2, 'Ana y Bruno en el calendario Semana');
select pruebas.ok(personal.poner_personas('11111111-0000-0000-0000-0000000000c2', array['11111111-0000-0000-0000-0000000000f3']::uuid[]) = 1, 'Carla en Fin de semana');
select pruebas.ok(personal.poner_personas('11111111-0000-0000-0000-0000000000c3', array['11111111-0000-0000-0000-0000000000f2']::uuid[]) = 1, 'Bruno pasa a Refuerzo');
select pruebas.ok((select calendario_id from personal.calendario_personas where persona_id = '11111111-0000-0000-0000-0000000000f2') = '11111111-0000-0000-0000-0000000000c3',
  'una persona solo está en un calendario por año (Bruno sale de Semana)');
select pruebas.ok(personal.poner_personas('11111111-0000-0000-0000-0000000000c1',
  array['11111111-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-0000000000f1']::uuid[]) = 1, 'no se mete a un trabajador de otra unidad (se ignora)');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-0000000000c2']::uuid[],
  array['2031-01-01', '2031-01-06']::date[], 'festivo', 'Festivo', null) = 4, 'marca 2 festivos en 2 calendarios (4 días)');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-01-06']::date[], 'cierre', 'Cierre de fábrica', null) = 1,
  'volver a marcar un día cambia su tipo');
select pruebas.ok((select tipo from personal.dias where calendario_id = '11111111-0000-0000-0000-0000000000c1' and fecha = '2031-01-06') = 'cierre', 'el día ya es cierre');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c2']::uuid[], array['2031-01-06']::date[], null) = 1, 'tipo vacío quita la marca');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-07-01', '2031-07-02']::date[], 'intensiva', null, '7:00-15:00') = 2,
  'jornada intensiva con horario');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c2']::uuid[], array['2031-01-13']::date[], 'trabaja', null, '6:00 a 14:00') = 1,
  'el calendario de fin de semana trabaja un lunes');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c2']::uuid[], array['2031-01-13']::date[], null) = 1, 'y se puede deshacer');
select pruebas.ok(personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2032-01-01']::date[], 'festivo') = 0,
  'un día de otro año no se marca en un calendario de 2031');
select pruebas.falla($q$select personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-02-01']::date[], 'vacaciones')$q$,
  'un tipo que no existe no se acepta');
select pruebas.falla($q$select personal.marcar_dias(array['22222222-0000-0000-0000-0000000000c1']::uuid[], array['2031-02-01']::date[], 'festivo')$q$,
  'no se puede marcar un calendario de otra unidad');
select pruebas.ok(personal.copiar_dias('11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-0000000000c3') = 4, 'copiar los días de Semana a Refuerzo');
select pruebas.ok(pruebas.cuantas($q$select * from personal.dias where calendario_id = '11111111-0000-0000-0000-0000000000c3'$q$) = 4, 'Refuerzo queda igual que Semana');

-- vacaciones
insert into personal.vacaciones (empresa_id, persona_id, desde, hasta, nota) values
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000f1', '2031-08-01', '2031-08-15', 'Verano'),
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000f1', '2030-12-28', '2031-01-03', 'Navidad'),
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000f2', '2031-09-01', '2031-09-05', null);
select pruebas.falla($q$insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000f2', '2031-09-10', '2031-09-01')$q$,
  'unas vacaciones que acaban antes de empezar no se aceptan');
select pruebas.falla($q$insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-0000000000f1', '2031-09-01', '2031-09-02')$q$,
  'no se ponen vacaciones a un trabajador de otra unidad');

-- horas anuales (L-J 8 h, V 6 h; festivos, cierres y vacaciones no suman)
update personal.calendarios set horas_dia = '{0,8,8,8,8,6,0}', horas_anuales = 1968 where id = '11111111-0000-0000-0000-0000000000c1';
select pruebas.ok((select horas from personal.horas_personas('11111111-0000-0000-0000-0000000000c1') where persona_id = '11111111-0000-0000-0000-0000000000f1') = 1872,
  'horas de Ana: 1968 del año menos sus vacaciones = 1872');
select pruebas.ok((select vacaciones from personal.horas_personas('11111111-0000-0000-0000-0000000000c1') where persona_id = '11111111-0000-0000-0000-0000000000f1') = 18,
  'y cuenta sus 18 días de vacaciones de 2031');
select pruebas.falla($q$select personal.enviar_calendario('11111111-0000-0000-0000-0000000000c1')$q$, 'no se envía si no cuadran las horas (Ana: 1872 de 1968)');
update personal.calendarios set horas_anuales = 1872 where id = '11111111-0000-0000-0000-0000000000c1';
select personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-07-03']::date[], 'intensiva', null, '7:00 a 13:00', 6);
select pruebas.ok((select horas from personal.horas_personas('11111111-0000-0000-0000-0000000000c1') where persona_id = '11111111-0000-0000-0000-0000000000f1') = 1870,
  'un jueves de intensiva con 6 h resta 2 h');
select personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-07-05']::date[], 'trabaja', null, null, 2);
select pruebas.ok((select horas from personal.horas_personas('11111111-0000-0000-0000-0000000000c1') where persona_id = '11111111-0000-0000-0000-0000000000f1') = 1872,
  'un sábado que trabaja 2 h las suma: vuelve a cuadrar');
select pruebas.ok((select horas from personal.dias where fecha = '2031-07-05') = 2, 'el día guarda sus horas');
-- quien tiene otras horas (Bruno en Refuerzo, L-X-V)
update personal.calendarios set horas_dia = '{0,8,0,8,0,6,0}', horas_anuales = 2000 where id = '11111111-0000-0000-0000-0000000000c3';
update personal.calendario_personas set horas_anuales = (select horas from personal.horas_personas('11111111-0000-0000-0000-0000000000c3') where persona_id = '11111111-0000-0000-0000-0000000000f2')
 where persona_id = '11111111-0000-0000-0000-0000000000f2';
select pruebas.ok((select objetivo = horas from personal.horas_personas('11111111-0000-0000-0000-0000000000c3') where persona_id = '11111111-0000-0000-0000-0000000000f2'),
  'Bruno tiene sus propias horas (no las 2000 del calendario) y le cuadran');
select pruebas.falla($q$select personal.enviar_calendario('11111111-0000-0000-0000-0000000000c2')$q$, 'sin horas anuales puestas no se envía (Fin de semana)');

-- enviar a firmar
select pruebas.ok(personal.enviar_calendario('11111111-0000-0000-0000-0000000000c1') = 1, 'enviar Semana sin decir a quién: a todos los del calendario (Ana)');
select pruebas.ok(personal.enviar_calendario('11111111-0000-0000-0000-0000000000c3', array['11111111-0000-0000-0000-0000000000f2', '11111111-0000-0000-0000-0000000000f1']::uuid[]) = 1,
  'enviar Refuerzo a Bruno y Ana: solo a Bruno (Ana no está en ese calendario)');
select pruebas.ok((select datos ->> 'calendario' from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f2') = 'Refuerzo 2031', 'la foto dice qué calendario es');
select pruebas.ok((select datos -> 'dias_equipo' from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f2') = '[1,3,5]', 'y qué días de la semana se trabaja');
select pruebas.ok((select datos -> 'vacaciones' -> 0 ->> 'desde' from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1') = '2031-01-01', 'la foto recorta las vacaciones al año');
select pruebas.ok((select jsonb_array_length(datos -> 'dias') from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1') = 6, 'la foto lleva los días del calendario');
select pruebas.ok((select (datos ->> 'horas_anuales')::numeric = 1872 and (datos ->> 'horas')::numeric = 1872 from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'),
  'la foto lleva las horas del año');
select pruebas.ok((select sha256 = personal.huella(datos) from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'), 'el envío guarda la huella de la foto');
select pruebas.ok(pruebas.cuantas($q$select * from personal.v_envios where estado = 'pendiente'$q$) = 2, 'los 2 envíos están pendientes');
select pruebas.falla($q$insert into personal.envios (empresa_id, anio, calendario_id, persona_id, datos, sha256) values ('11111111-0000-0000-0000-000000000001', 2031, '11111111-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-0000000000f1', '{}', repeat('0', 64))$q$,
  'un envío no se puede crear a mano (solo con enviar_calendario)');
select personal.enviar_calendario('11111111-0000-0000-0000-0000000000c3');
select pruebas.ok(pruebas.cuantas($q$select * from personal.v_envios where persona_id = '11111111-0000-0000-0000-0000000000f2' and estado = 'anulado'$q$) = 1
  and pruebas.cuantas($q$select * from personal.v_envios where persona_id = '11111111-0000-0000-0000-0000000000f2' and estado = 'pendiente'$q$) = 1,
  'volver a enviar anula el envío anterior sin firmar');

-- ---------- trabajadora: ve lo suyo y firma ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f1', true);
select pruebas.ok(nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos' ? 'personal', 'el operario ve Personal en el menú (su calendario)');
select pruebas.ok(pruebas.cuantas('select * from personal.v_envios') = 1, 'Ana solo ve su envío');
select pruebas.ok(pruebas.cuantas('select * from personal.vacaciones') = 2, 'Ana solo ve sus vacaciones');
select pruebas.ok(pruebas.cuantas('select * from personal.calendarios') = 3, 'Ana ve los calendarios de su unidad');
select pruebas.falla($q$select personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-03-01']::date[], 'festivo')$q$, 'un operario no marca días');
select pruebas.falla($q$select personal.poner_personas('11111111-0000-0000-0000-0000000000c1', array[]::uuid[])$q$, 'un operario no cambia quién va en un calendario');
select pruebas.falla($q$insert into personal.vacaciones (empresa_id, persona_id, desde, hasta) values ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000f1', '2031-10-01', '2031-10-02')$q$,
  'un operario no se pone vacaciones');
select pruebas.falla($q$select personal.enviar_calendario('11111111-0000-0000-0000-0000000000c1')$q$, 'un operario no envía calendarios');
select pruebas.falla($q$select personal.firmar_calendario((select id from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'), false, '', 'data:image/png;base64,AAAA')$q$,
  'si no está conforme tiene que explicar por qué');
select pruebas.falla($q$select personal.firmar_calendario((select id from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'), true, null, 'hola')$q$,
  'la firma tiene que ser una imagen');
select pruebas.ok(personal.firmar_calendario((select id from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'), true, null, 'data:image/png;base64,AAAA') is not null,
  'Ana firma su calendario');
select pruebas.ok((select estado from personal.v_envios) = 'firmado', 'su envío sale firmado');
select pruebas.falla($q$select personal.firmar_calendario((select id from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f1'), true, null, 'data:image/png;base64,AAAA')$q$,
  'no se firma dos veces');
update nucleo.firmas set conforme = false;
select pruebas.ok((select conforme from nucleo.firmas where persona_id = '11111111-0000-0000-0000-0000000000f1'), 'una firma no se cambia desde la app');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select pruebas.falla($q$update personal.envios set datos = '{}' where persona_id = '11111111-0000-0000-0000-0000000000f1'$q$, 'la foto de un envío no se cambia (ni desde el servidor)');
select pruebas.falla($q$update personal.envios set anulado = now() where persona_id = '11111111-0000-0000-0000-0000000000f1'$q$, 'un envío firmado no se anula');
select pruebas.falla($q$delete from personal.envios$q$, 'los envíos no se borran');
select pruebas.falla($q$update nucleo.firmas set conforme = false$q$, 'una firma no se cambia ni desde el servidor');
set role authenticated;

-- Bruno no ve el de Ana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f2', true);
select pruebas.ok(pruebas.cuantas($q$select * from personal.v_envios where persona_id = '11111111-0000-0000-0000-0000000000f1'$q$) = 0, 'Bruno no ve el calendario de Ana');
select pruebas.falla($q$select personal.firmar_calendario((select id from personal.envios where anulado is not null limit 1), true, null, 'data:image/png;base64,AAAA')$q$,
  'un envío anulado no se firma');

-- ---------- encargada: ve todo, recoge firmas, no envía ni cambia ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e3', true);
select pruebas.ok(pruebas.cuantas('select * from personal.v_envios') = 3, 'la encargada ve todos los envíos');
select pruebas.ok(pruebas.cuantas('select * from personal.vacaciones') = 3, 'la encargada ve todas las vacaciones');
select pruebas.ok(personal.firmar_calendario((select id from personal.envios where persona_id = '11111111-0000-0000-0000-0000000000f2' and anulado is null), false,
  'Faltan mis vacaciones de octubre', 'data:image/png;base64,BBBB') is not null, 'la encargada recoge en su móvil la firma de Bruno (no conforme, con comentario)');
select pruebas.ok((select firmado_por from nucleo.firmas where comentario like 'Faltan%') = '00000000-0000-0000-0000-0000000001e3', 'se sabe que la recogió la encargada');
select pruebas.falla($q$select personal.marcar_dias(array['11111111-0000-0000-0000-0000000000c1']::uuid[], array['2031-03-01']::date[], 'festivo')$q$, 'la encargada no cambia el calendario');
select pruebas.falla($q$select personal.anular_envio((select id from personal.envios where anulado is null limit 1))$q$, 'la encargada no anula envíos');

-- ---------- jefe de otra unidad: no ve nada de L ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a1', true);
select pruebas.ok(pruebas.cuantas('select * from personal.dias') + pruebas.cuantas('select * from personal.vacaciones')
  + pruebas.cuantas('select * from personal.v_envios') + pruebas.cuantas('select * from personal.calendario_personas') = 0, 'el jefe de otra unidad no ve nada de L');
select pruebas.falla($q$select personal.enviar_calendario('22222222-0000-0000-0000-0000000000c1')$q$, 'sin el módulo Personal encendido no se envían calendarios');

-- ---------- historial ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);
select pruebas.ok((select usuario_id from nucleo.historial where modulo = 'personal' and tabla = 'dias' order by id limit 1) = '00000000-0000-0000-0000-0000000001a1',
  'el historial dice quién marcó el día');
select pruebas.ok(pruebas.cuantas($q$select * from nucleo.historial where modulo = 'personal' and tabla = 'calendario_personas'$q$) > 0, 'y quién cambió a la gente de calendario');

rollback;
