-- Limpieza · fin de semana: Excel, cambiar de día, instrucciones para el encargado y su checklist. Personas inventadas.
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

-- unidad W: Jefa (administradora), Enzo (encargado), Olga (operaria, trabaja todos los días)
insert into nucleo.empresas (id, codigo, nombre) values ('afafafaf-0000-0000-0000-000000000001', 'unidad-w', 'Unidad W');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('afafafaf-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('afafafaf-0000-0000-0000-0000000000e1', 'afafafaf-0000-0000-0000-000000000001', 'finde', 'Finde');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id, horario) values
  ('afafafaf-0000-0000-0000-0000000000f1', 'afafafaf-0000-0000-0000-000000000001', 'Olga Prueba', 'afafafaf-0000-0000-0000-0000000000e1',
   (select jsonb_object_agg(d, '[["08:00","16:00"]]'::jsonb) from unnest(array['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) d)),
  ('afafafaf-0000-0000-0000-0000000000f2', 'afafafaf-0000-0000-0000-000000000001', 'Enzo Prueba', 'afafafaf-0000-0000-0000-0000000000e1', null);
insert into limpieza.personas (persona_id, empresa_id) values ('afafafaf-0000-0000-0000-0000000000f1', 'afafafaf-0000-0000-0000-000000000001');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id)
select 'afafafaf-0000-0000-0000-0000000000a1', 'afafafaf-0000-0000-0000-000000000001', 'F30', (select id from nucleo.tipos_activo limit 1)
 where exists (select 1 from nucleo.tipos_activo);
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000fffa1'), ('00000000-0000-0000-0000-0000000fffe2'), ('00000000-0000-0000-0000-0000000ffff1');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-0000000fffa1', 'Jefa', null),
  ('00000000-0000-0000-0000-0000000fffe2', 'Enzo', 'afafafaf-0000-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-0000000ffff1', 'Olga', 'afafafaf-0000-0000-0000-0000000000f1');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), 'afafafaf-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-0000000fffa1', 'admin_empresa'), ('00000000-0000-0000-0000-0000000fffe2', 'encargado'),
               ('00000000-0000-0000-0000-0000000ffff1', 'operario')) x(u, r);
insert into limpieza.plantillas (empresa_id, nombre, cuando, puntos) values
  ('afafafaf-0000-0000-0000-000000000001', 'Cierre', 'encargado', '[{"texto": "Cuarto cerrado", "tipo": "ok"}, {"texto": "Botiquín", "tipo": "ok", "foto_si_mal": true}]');
create temp view t as select x.titulo, x.fecha, x.asignados, x.todo_equipo, x.no_repartir, x.urgente, x.grupo, x.activo_id, x.creado_por, x.origen
  from limpieza.trabajos x where x.empresa_id = 'afafafaf-0000-0000-0000-000000000001';
grant select on t to authenticated;
set role authenticated;

-- ---------- Excel ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffa1', true);
select pruebas.ok((select (r ->> 'creados')::int = 3 and (r ->> 'repetidos')::int = 1 and (r ->> 'sin_persona')::int = 2 from (select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('titulo', 'Limpieza F30', 'lugar', 'F30', 'fecha', current_date + 1, 'urgente', true, 'minutos_est', '45'),
    jsonb_build_object('titulo', 'Suelo taller', 'fecha', current_date + 1, 'asignados', jsonb_build_array('afafafaf-0000-0000-0000-0000000000f1')),
    jsonb_build_object('titulo', 'Cámaras', 'fecha', current_date + 2, 'grupo', 'hornos'),
    jsonb_build_object('titulo', 'limpieza f30', 'lugar', 'f30', 'fecha', current_date + 1),
    jsonb_build_object('titulo', '   ', 'fecha', current_date + 1)), 'encargado', 'afafafaf-0000-0000-0000-0000000000e1', 'finde.xlsx') r) x),
  'el Excel crea 3 trabajos, salta el repetido y la fila vacía');
select pruebas.ok((select no_repartir and urgente and asignados = '{}' and origen = 'excel: finde.xlsx' and creado_por is null from t where titulo = 'Limpieza F30'),
  'los sin persona «para el encargado» no los toca el reparto; urgente; de quién no es');
select pruebas.ok((select asignados = '{afafafaf-0000-0000-0000-0000000000f1}' and not no_repartir from t where titulo = 'Suelo taller'), 'el que trae persona va a esa persona');
select pruebas.ok((select grupo = 'hornos' from t where titulo = 'Cámaras'), 'y se guarda el grupo');
select pruebas.ok((select count(*) = 0 from jsonb_array_elements(limpieza.mi_dia('afafafaf-0000-0000-0000-000000000001', current_date + 1)) j where (j ->> 'mio')::boolean),
  'subir el Excel no le llena el Mi día a quien lo sube');
select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('titulo', 'Patio', 'fecha', current_date + 1)), 'equipo', 'afafafaf-0000-0000-0000-0000000000e1');
select pruebas.ok((select todo_equipo from t where titulo = 'Patio'), '«para todo el equipo»');
select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('titulo', 'Hoy urgente', 'fecha', current_date)), 'auto');
select pruebas.ok((select asignados = '{}' and not no_repartir from t where titulo = 'Hoy urgente'), '«reparto automático» para hoy antes del reparto: espera al reparto de la mañana');
select limpieza.mi_dia('afafafaf-0000-0000-0000-000000000001', current_date);
select pruebas.ok((select asignados = '{afafafaf-0000-0000-0000-0000000000f1}' from t where titulo = 'Hoy urgente'), 'y el reparto de la mañana se lo da a Olga');
select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('titulo', 'Hoy otro', 'fecha', current_date)), 'auto');
select pruebas.ok((select asignados = '{afafafaf-0000-0000-0000-0000000000f1}' from t where titulo = 'Hoy otro'), 'si el reparto de hoy ya pasó, se reparte al subirlo');
select pruebas.falla($q$select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('titulo', 'Ayer', 'fecha', current_date - 1)), 'auto')$q$, 'no para días pasados');
select pruebas.falla($q$select limpieza.importar('afafafaf-0000-0000-0000-000000000001', '[]', 'equipo')$q$, '«todo el equipo» necesita el equipo');

-- el encargado: no sube el Excel; cambia de día; suelta y no se reparte solo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffe2', true);
select pruebas.falla($q$select limpieza.importar('afafafaf-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('titulo', 'X', 'fecha', current_date + 1)), 'auto')$q$,
  'el encargado no sube el Excel');
select limpieza.cambiar_dia((select id from limpieza.trabajos where titulo = 'Limpieza F30'), current_date + 2);
select pruebas.ok((select fecha = current_date + 2 from t where titulo = 'Limpieza F30'), 'el encargado lo pasa al día siguiente');
select pruebas.falla($q$select limpieza.cambiar_dia((select id from limpieza.trabajos where titulo = 'Limpieza F30'), current_date - 1)$q$, 'no a un día pasado');
select limpieza.repartir((select id from limpieza.trabajos where titulo = 'Hoy otro'), '{}');
select pruebas.ok((select no_repartir from t where titulo = 'Hoy otro'), 'soltar un trabajo lo deja para repartir a mano');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ffff1', true);
select pruebas.falla($q$select limpieza.cambiar_dia((select id from limpieza.trabajos where titulo = 'Suelo taller'), current_date + 2)$q$, 'la operaria no cambia días');

-- ---------- instrucciones ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffa1', true);
insert into limpieza.instrucciones (empresa_id, desde, hasta, titulo, texto) values ('afafafaf-0000-0000-0000-000000000001', current_date, current_date + 1, 'Carretillas', 'Limpiar las dos');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffe2', true);
select pruebas.ok((select count(*) = 1 from limpieza.instrucciones), 'el encargado ve las instrucciones');
select pruebas.falla($q$insert into limpieza.instrucciones (empresa_id, desde, hasta, titulo) values ('afafafaf-0000-0000-0000-000000000001', current_date, current_date, 'Yo')$q$, 'pero no las escribe');
select limpieza.instruccion_leida((select id from limpieza.instrucciones));
select pruebas.ok((select leido_en is not null and leido_por = '00000000-0000-0000-0000-0000000fffe2' from limpieza.instrucciones), 'y las marca como leídas');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffa1', true);
update limpieza.instrucciones set texto = 'Limpiar las tres';
select pruebas.ok((select leido_en is null from limpieza.instrucciones), 'si la jefa las cambia, vuelven a «sin leer»');
update limpieza.instrucciones set anulado = now();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffe2', true);
select pruebas.ok((select count(*) = 0 from limpieza.instrucciones), 'las quitadas ya no las ve el encargado');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ffff1', true);
select pruebas.ok((select count(*) = 0 from limpieza.instrucciones), 'la operaria no ve instrucciones');

-- ---------- checklist del encargado ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffe2', true);
select pruebas.ok(jsonb_array_length(limpieza.puntos_encargado('afafafaf-0000-0000-0000-000000000001')) = 2, 'salen los 2 puntos de las checklists del encargado');
select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[{"plantilla": "Cierre", "texto": "Cuarto cerrado", "estado": "bien"}]', 'a medias', false);
select pruebas.ok((select cerrado is null and nota = 'a medias' from limpieza.revisiones), 'se guarda a medias');
select pruebas.falla($q$select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[{"plantilla": "Cierre", "texto": "Cuarto cerrado", "estado": "bien"}]', null, true)$q$,
  'no se envía si falta un punto');
select pruebas.falla($q$select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[{"plantilla": "Cierre", "texto": "Cuarto cerrado", "estado": "bien"},
  {"plantilla": "Cierre", "texto": "Botiquín", "estado": "mal", "nota": "faltan tiritas"}]', null, true)$q$, 'ni si un punto mal pide foto y no la tiene');
select pruebas.falla($q$select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[{"plantilla": "Cierre", "texto": "Botiquín", "estado": "mal",
  "foto": "otra/revisiones/x.jpg"}]', null, false)$q$, 'la foto tiene que ser de esta revisión');
select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, jsonb_build_array(
  '{"plantilla": "Cierre", "texto": "Cuarto cerrado", "estado": "bien"}'::jsonb,
  jsonb_build_object('plantilla', 'Cierre', 'texto', 'Botiquín', 'estado', 'mal', 'foto', 'afafafaf-0000-0000-0000-000000000001/revisiones/' || current_date || '/a.jpg')), null, true);
select pruebas.ok((select cerrado is not null and hecho_por = '00000000-0000-0000-0000-0000000fffe2' from limpieza.revisiones), 'terminada y enviada');
select pruebas.falla($q$select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[]', null, false)$q$, 'enviada, el encargado ya no la cambia');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ffff1', true);
select pruebas.ok((select count(*) = 0 from limpieza.revisiones), 'la operaria no la ve');
select pruebas.falla($q$select limpieza.guardar_revision('afafafaf-0000-0000-0000-000000000001', current_date, '[]', null, false)$q$, 'ni la rellena');
rollback;
