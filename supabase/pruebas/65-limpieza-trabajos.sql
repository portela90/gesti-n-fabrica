-- Limpieza: trabajos del día del operario (fijas que salen solas, empezar/pausar/terminar, checklist, fotos).
-- Unidades, personas y máquinas inventadas. Todo se deshace al final.
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

-- unidad L: equipo Semana con Leo y Marta; Nico en el otro equipo. Hoy es el día de la prueba.
insert into nucleo.empresas (id, codigo, nombre) values ('dddddddd-6666-0000-0000-000000000001', 'unidad-l', 'Unidad L'), ('eeeeeeee-6666-0000-0000-000000000001', 'unidad-m', 'Unidad M');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('dddddddd-6666-0000-0000-000000000001', 'limpieza'), ('eeeeeeee-6666-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre, dias) values
  ('dddddddd-6666-0000-0000-0000000000e1', 'dddddddd-6666-0000-0000-000000000001', 'semana', 'Semana', '{0,1,2,3,4,5,6}'),
  ('dddddddd-6666-0000-0000-0000000000e2', 'dddddddd-6666-0000-0000-000000000001', 'otro', 'Otro', '{0,1,2,3,4,5,6}');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('dddddddd-6666-0000-0000-0000000000f1', 'dddddddd-6666-0000-0000-000000000001', 'Leo Prueba', 'dddddddd-6666-0000-0000-0000000000e1'),
  ('dddddddd-6666-0000-0000-0000000000f2', 'dddddddd-6666-0000-0000-000000000001', 'Marta Prueba', 'dddddddd-6666-0000-0000-0000000000e1'),
  ('dddddddd-6666-0000-0000-0000000000f3', 'dddddddd-6666-0000-0000-000000000001', 'Nico Prueba', 'dddddddd-6666-0000-0000-0000000000e2');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('dddddddd-6666-0000-0000-0000000000a1', 'dddddddd-6666-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, tipo_id, codigo) values
  ('dddddddd-6666-0000-0000-0000000000a2', 'dddddddd-6666-0000-0000-000000000001', 'dddddddd-6666-0000-0000-0000000000a1', 'F77'),
  ('dddddddd-6666-0000-0000-0000000000a3', 'dddddddd-6666-0000-0000-000000000001', 'dddddddd-6666-0000-0000-0000000000a1', 'M7');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000bbaa1'), ('00000000-0000-0000-0000-0000000bbff1'), ('00000000-0000-0000-0000-0000000bbff2'),
  ('00000000-0000-0000-0000-0000000bbff3'), ('00000000-0000-0000-0000-0000000bbee1'), ('00000000-0000-0000-0000-0000000bbcc1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000bbaa1', 'Jefe L', null), ('00000000-0000-0000-0000-0000000bbff1', 'Leo', 'dddddddd-6666-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000bbff2', 'Marta', 'dddddddd-6666-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-0000000bbff3', 'Nico', 'dddddddd-6666-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000bbee1', 'Encargado L', null), ('00000000-0000-0000-0000-0000000bbcc1', 'Jefe M', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000bbaa1', 'admin_empresa', 'dddddddd-6666-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000bbff1', 'operario',      'dddddddd-6666-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000bbff2', 'operario',      'dddddddd-6666-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000bbff3', 'operario',      'dddddddd-6666-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000bbee1', 'encargado',     'dddddddd-6666-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000bbcc1', 'admin_empresa', 'eeeeeeee-6666-0000-0000-000000000001')) x(u, r, e);
-- tareas: una fija para Leo, una de todo el equipo, otra de otro día; una habitual solo para Marta y otra para cualquiera
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, equipo_id, asignados, todo_equipo, minutos_est) values
  ('dddddddd-6666-0000-0000-0000000000b1', 'dddddddd-6666-0000-0000-000000000001', 'fija', 'Limpieza F77', array[extract(dow from current_date)::int], 'dddddddd-6666-0000-0000-0000000000e1', '{dddddddd-6666-0000-0000-0000000000f1}', false, 30),
  ('dddddddd-6666-0000-0000-0000000000b2', 'dddddddd-6666-0000-0000-000000000001', 'fija', 'Barrer pasillo', array[extract(dow from current_date)::int], 'dddddddd-6666-0000-0000-0000000000e1', '{}', true, null),
  ('dddddddd-6666-0000-0000-0000000000b3', 'dddddddd-6666-0000-0000-000000000001', 'fija', 'Otro día', array[(extract(dow from current_date)::int + 1) % 7], 'dddddddd-6666-0000-0000-0000000000e1', '{dddddddd-6666-0000-0000-0000000000f1}', false, null);
insert into limpieza.tareas (id, empresa_id, clase, titulo, solo_para, minutos_est, activo_id) values
  ('dddddddd-6666-0000-0000-0000000000c1', 'dddddddd-6666-0000-0000-000000000001', 'habitual', 'Derrame', '{dddddddd-6666-0000-0000-0000000000f2}', 20, null),
  ('dddddddd-6666-0000-0000-0000000000c2', 'dddddddd-6666-0000-0000-000000000001', 'habitual', 'Cambiar taladrina', '{}', 15, 'dddddddd-6666-0000-0000-0000000000a3');
insert into limpieza.plantillas (empresa_id, nombre, cuando, aplica, puntos, orden) values
  ('dddddddd-6666-0000-0000-000000000001', 'Inyectoras', 'trabajos', '{"codigos": "F*", "excluir": "horno"}',
   '[{"texto": "Robot", "tipo": "ok", "foto_si_mal": true}, {"texto": "Bidones", "tipo": "num", "minimo": 2}]', 1),
  ('dddddddd-6666-0000-0000-000000000001', 'Mecanizado', 'trabajos', '{"codigos": "M3-M11"}', '[{"texto": "Virutas", "tipo": "ok"}]', 2),
  ('dddddddd-6666-0000-0000-000000000001', 'Del encargado', 'encargado', '{}', '[{"texto": "Luces", "tipo": "ok"}]', 3);

-- ---------- las reglas de la checklist (las de la app vieja) ----------
select pruebas.ok(limpieza.encaja('{"codigos": "F*"}', 'Limpieza F25', null) and not limpieza.encaja('{"codigos": "F*"}', 'Pasar la fregadora', null), 'F* = una F con número (no «fregadora»)');
select pruebas.ok(limpieza.encaja('{"codigos": "M3-M11"}', 'Limpieza M7', null) and not limpieza.encaja('{"codigos": "M3-M11"}', 'Limpieza M12', null), 'M3-M11 = de la 3 a la 11');
select pruebas.ok(limpieza.encaja('{"codigos": "F28"}', 'Limpieza F-28', null) and not limpieza.encaja('{"codigos": "F28"}', 'Limpieza F280', null), 'F28 = solo esa');
select pruebas.ok(limpieza.encaja('{"codigos": "robot"}', 'Limpiar el ROBOT', null), 'otra palabra = el nombre la contiene');
select pruebas.ok(not limpieza.encaja('{"codigos": "F*", "excluir": "horno"}', 'Limpieza horno F25', null), 'excluir manda');
select pruebas.ok(limpieza.encaja('{"tareas": ["dddddddd-6666-0000-0000-0000000000c2"]}', 'Lo que sea', 'dddddddd-6666-0000-0000-0000000000c2'), 'y las tareas habituales marcadas');

set role authenticated;
-- ---------- Leo abre su día: salen solas sus fijas de hoy ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbff1', true);
create temp table dia as select jsonb_array_elements(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date)) j;
grant all on dia to authenticated;
select pruebas.ok((select count(*) from dia) = 2, 'Leo ve 2: la suya y la de todo el equipo (la de otro día no)');
select pruebas.ok((select j ->> 'maquina' is null and j -> 'nombres' = '[]'::jsonb from dia where j ->> 'titulo' = 'Barrer pasillo'), 'con quién va (nadie en concreto: todo el equipo)');
select pruebas.ok(jsonb_array_length(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date)) = 2, 'abrirlo otra vez no repite las fijas');
select pruebas.ok(jsonb_array_length(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date - 7)) = 0, 'los días pasados no se rellenan');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'f77', (j ->> 'id')::uuid from dia where j ->> 'titulo' = 'Limpieza F77';
insert into ids select 'pasillo', (j ->> 'id')::uuid from dia where j ->> 'titulo' = 'Barrer pasillo';
select pruebas.ok(jsonb_array_length(limpieza.puntos((select v from ids where k = 'f77'))) = 2, 'a la F77 le toca la checklist de inyectoras (2 puntos)');
select pruebas.ok(jsonb_array_length(limpieza.puntos((select v from ids where k = 'pasillo'))) = 0, 'al pasillo, ninguna (la del encargado no sale en trabajos)');

-- ---------- empezar, pausar, seguir y terminar ----------
select limpieza.empezar((select v from ids where k = 'f77'), now() - interval '40 minutes');
select limpieza.empezar((select v from ids where k = 'f77'));  -- repetido (sin red): no pasa nada
select pruebas.ok((select estado = 'en_curso' and inicio < now() - interval '39 minutes' from limpieza.trabajos where id = (select v from ids where k = 'f77')), 'empezado con la hora del móvil');
select limpieza.pausar((select v from ids where k = 'f77'), now() - interval '30 minutes');
select limpieza.seguir((select v from ids where k = 'f77'), now() - interval '20 minutes');
select pruebas.ok((select pausado_min = 10 and estado = 'en_curso' from limpieza.trabajos where id = (select v from ids where k = 'f77')), 'la pausa cuenta 10 minutos');
select pruebas.falla($q$select limpieza.terminar((select v from ids where k = 'f77'), 30, '[{"valor": "bien"}]')$q$, 'sin contestar toda la checklist no se termina');
select pruebas.falla($q$select limpieza.terminar((select v from ids where k = 'f77'), 30, '[{"valor": "mal"}, {"valor": 3}]')$q$, 'un punto mal con «foto si está mal» necesita foto');
select pruebas.falla($q$select limpieza.terminar((select v from ids where k = 'f77'), 30, '[{"valor": "regular"}, {"valor": 3}]')$q$, 'bien o mal, nada más');
select pruebas.falla($q$select limpieza.poner_foto((select v from ids where k = 'f77'), 'otra/carpeta/foto.jpg', 'punto')$q$, 'la foto tiene que estar en la carpeta del trabajo');
select limpieza.poner_foto((select v from ids where k = 'f77'), 'dddddddd-6666-0000-0000-000000000001/trabajos/' || (select v from ids where k = 'f77') || '/robot.jpg', 'punto');
select limpieza.poner_foto((select v from ids where k = 'f77'), 'dddddddd-6666-0000-0000-000000000001/trabajos/' || (select v from ids where k = 'f77') || '/robot.jpg', 'punto');
select pruebas.ok((select jsonb_array_length(fotos) from limpieza.trabajos where id = (select v from ids where k = 'f77')) = 1, 'la misma foto dos veces (sin red) se guarda una');
select limpieza.terminar((select v from ids where k = 'f77'), 12,
  jsonb_build_array(jsonb_build_object('valor', 'mal', 'foto', 'dddddddd-6666-0000-0000-000000000001/trabajos/' || (select v from ids where k = 'f77') || '/robot.jpg'), jsonb_build_object('valor', 1)), 'Robot sucio');
select pruebas.ok((select estado = 'hecho' and minutos = 30 and tiempo_auto and hecho_por = 'dddddddd-6666-0000-0000-0000000000f1' from limpieza.trabajos where id = (select v from ids where k = 'f77')),
  'tardó 12 de 30 previstos: se apunta lo previsto (como la app vieja)');
select pruebas.ok((select checklist -> 0 ->> 'valor' = 'mal' and checklist -> 1 ->> 'bajo_minimo' = 'true' and checklist -> 0 ->> 'plantilla' = 'Inyectoras' from limpieza.trabajos where id = (select v from ids where k = 'f77')),
  'la checklist queda guardada en el trabajo, con lo que está por debajo del mínimo');
select pruebas.falla($q$select limpieza.terminar((select v from ids where k = 'f77'), 30, '[]')$q$, 'terminado dos veces: YA_HECHO');
select limpieza.terminar((select v from ids where k = 'pasillo'), 45);
select pruebas.ok((select minutos = 45 and not tiempo_auto and inicio = fin - interval '45 minutes' from limpieza.trabajos where id = (select v from ids where k = 'pasillo')), 'sin Empezar ni previsto: lo que contestó (y el inicio se calcula)');
select pruebas.falla($q$select limpieza.terminar((select v from ids where k = 'f77'), 0)$q$, 'el tiempo tiene que ser de 1 minuto en adelante');

-- ---------- crear un trabajo de la lista o a mano ----------
select pruebas.ok((select count(*) from jsonb_array_elements(limpieza.habituales_para_mi('dddddddd-6666-0000-0000-000000000001'))) = 1, 'Leo no ve la habitual que es solo para Marta');
select pruebas.falla($q$select limpieza.crear_trabajo('dddddddd-6666-0000-0000-000000000001', current_date, 'dddddddd-6666-0000-0000-0000000000c1')$q$, 'ni la puede coger');
insert into ids select 'taladrina', limpieza.crear_trabajo('dddddddd-6666-0000-0000-000000000001', current_date, 'dddddddd-6666-0000-0000-0000000000c2');
insert into ids select 'suelto', limpieza.crear_trabajo('dddddddd-6666-0000-0000-000000000001', current_date - 1, null, 'Recoger cartones', null, 'Se quedó a medias');
select pruebas.ok((select clase = 'habitual' and minutos_est = 15 and asignados = '{dddddddd-6666-0000-0000-0000000000f1}' from limpieza.trabajos where id = (select v from ids where k = 'taladrina')), 'de la lista: con lo de la tarea y para él');
select pruebas.ok(jsonb_array_length(limpieza.puntos((select v from ids where k = 'taladrina'))) = 1, 'su máquina M7 trae la checklist de mecanizado');
select pruebas.ok((select (j ->> 'atrasado')::boolean from jsonb_array_elements(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date)) j where j ->> 'titulo' = 'Recoger cartones'),
  'lo que se creó a mano ayer y no se hizo sigue hoy, como atrasado');
select pruebas.falla($q$select limpieza.crear_trabajo('dddddddd-6666-0000-0000-000000000001', current_date - 9, null, 'Muy viejo')$q$, 'no se crea en un día lejano');
select limpieza.avisar_problema((select v from ids where k = 'taladrina'), 'No queda taladrina en el almacén');
select pruebas.ok((select problema is not null from limpieza.trabajos where id = (select v from ids where k = 'taladrina')), '«hay un problema» queda en el trabajo');
select pruebas.falla($q$update limpieza.trabajos set estado = 'hecho'$q$, 'nada se cambia a mano en la tabla');

-- ---------- los demás ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbff2', true);
select pruebas.ok((select count(*) from jsonb_array_elements(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date))) = 1, 'Marta solo ve la de todo el equipo (no las de Leo)');
select pruebas.falla($q$select limpieza.empezar((select v from ids where k = 'taladrina'))$q$, 'ni empieza la de Leo');
select pruebas.ok(pruebas.cuantas('select * from limpieza.trabajos') = 1, 'en la tabla tampoco ve las de Leo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbff3', true);
select pruebas.ok((select count(*) from jsonb_array_elements(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date))) = 0, 'Nico (de otro equipo) no ve nada de ese equipo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbee1', true);
select pruebas.ok((select count(*) from jsonb_array_elements(limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date))) = 4, 'el encargado ve todos');
select limpieza.empezar((select v from ids where k = 'suelto'));
select pruebas.ok((select estado = 'en_curso' from limpieza.trabajos where id = (select v from ids where k = 'suelto')), 'y puede apuntar el de otro');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbcc1', true);
select pruebas.falla($q$select limpieza.mi_dia('dddddddd-6666-0000-0000-000000000001', current_date)$q$, 'el jefe de otra unidad no ve nada');
select pruebas.ok(pruebas.cuantas('select * from limpieza.trabajos') = 0, 'ni en la tabla');

-- ---------- fotos en el almacén ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbff1', true);
insert into storage.objects (bucket_id, name) values ('limpieza', 'dddddddd-6666-0000-0000-000000000001/trabajos/' || (select v from ids where k = 'taladrina') || '/a.jpg');
select pruebas.ok(pruebas.cuantas($q$select * from storage.objects where bucket_id = 'limpieza'$q$) = 1, 'Leo sube y ve la foto de su trabajo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000bbff2', true);
select pruebas.ok(pruebas.cuantas($q$select * from storage.objects where bucket_id = 'limpieza'$q$) = 0, 'Marta no ve las fotos de los trabajos de Leo');
select pruebas.falla($q$insert into storage.objects (bucket_id, name) values ('limpieza', 'dddddddd-6666-0000-0000-000000000001/trabajos/' || (select v from ids where k = 'taladrina') || '/b.jpg')$q$, 'ni sube fotos en ellos');
select pruebas.falla($q$insert into storage.objects (bucket_id, name) values ('limpieza', 'dddddddd-6666-0000-0000-000000000001/otra/b.jpg')$q$, 'fuera de la carpeta de un trabajo no se sube nada');

reset role;
select pruebas.ok((select count(*) from nucleo.historial where tabla = 'trabajos' and modulo = 'limpieza') >= 10, 'el historial guarda cada paso de cada trabajo');
rollback;
