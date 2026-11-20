-- Limpieza · Investigar: datos (problemas con tema y sitio, tareas, horarios), pasar una tarea fija y aplicar tiempos. Personas inventadas.
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

-- unidad J: Ana y Bea en Semana (Ana de lunes a viernes 8-15; Bea también el sábado); Ciro en otra unidad
insert into nucleo.empresas (id, codigo, nombre) values
  ('a3a3a3a3-0000-0000-0000-000000000001', 'unidad-j', 'Unidad J'), ('a3a3a3a3-0000-0000-0000-000000000002', 'unidad-k', 'Unidad K');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('a3a3a3a3-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('a3a3a3a3-0000-0000-0000-0000000000e1', 'a3a3a3a3-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id, jornada, horario) values
  ('a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-000000000001', 'Ana Prueba', 'a3a3a3a3-0000-0000-0000-0000000000e1', 'completa',
   '{"lunes": [["08:00","15:00"]], "martes": [["08:00","15:00"]], "miercoles": [["08:00","15:00"]], "jueves": [["08:00","15:00"]], "viernes": [["08:00","15:00"]]}'),
  ('a3a3a3a3-0000-0000-0000-0000000000f2', 'a3a3a3a3-0000-0000-0000-000000000001', 'Bea Prueba', 'a3a3a3a3-0000-0000-0000-0000000000e1', 'completa',
   '{"lunes": [["08:00","14:00"]], "sabado": [["08:00","12:00"]]}'),
  ('a3a3a3a3-0000-0000-0000-0000000000f3', 'a3a3a3a3-0000-0000-0000-000000000002', 'Ciro Prueba', null, null, null);
insert into auth.users (id) values ('00000000-0000-0000-0000-00000003a0a1'), ('00000000-0000-0000-0000-00000003a0e1');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-00000003a0a1', 'Admin J', null), ('00000000-0000-0000-0000-00000003a0e1', 'Enca J', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'a3a3a3a3-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000003a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000003a0e1', 'encargado')) x(u, r);
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('a3a3a3a3-0000-0000-0000-0000000000c1', 'a3a3a3a3-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id) values
  ('a3a3a3a3-0000-0000-0000-0000000000a1', 'a3a3a3a3-0000-0000-0000-000000000001', 'F19', 'a3a3a3a3-0000-0000-0000-0000000000c1');
insert into limpieza.temas (empresa_id, nombre, palabras, orden) values
  ('a3a3a3a3-0000-0000-0000-000000000001', 'Taladrina', '{taladrin}', 1), ('a3a3a3a3-0000-0000-0000-000000000001', 'Aceite', '{aceite,fuga}', 2);
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, asignados, equipo_id, minutos_est) values
  ('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-000000000001', 'fija', 'Barrer pasillo', '{1,2,3,4,5}', '{a3a3a3a3-0000-0000-0000-0000000000f1}', 'a3a3a3a3-0000-0000-0000-0000000000e1', 30),
  ('a3a3a3a3-0000-0000-0000-0000000000b2', 'a3a3a3a3-0000-0000-0000-000000000001', 'fija', 'Revisar fugas', '{1}', '{a3a3a3a3-0000-0000-0000-0000000000f1}', 'a3a3a3a3-0000-0000-0000-0000000000e1', 10);
insert into limpieza.tareas (id, empresa_id, clase, titulo, minutos_est) values
  ('a3a3a3a3-0000-0000-0000-0000000000b3', 'a3a3a3a3-0000-0000-0000-000000000001', 'habitual', 'Recoger taladrina', 20);
-- trabajos: dos fijas de «Barrer pasillo» (ayer hecha, mañana pendiente), «Revisar fugas» (fija: no es problema),
-- un derrame de taladrina en F19 y una fuga de aceite escrita en el lugar «junto a la F-19», y algo sin tema
insert into limpieza.trabajos (id, empresa_id, fecha, clase, tarea_id, titulo, lugar, activo_id, asignados, estado, fin, minutos, hecho_por) values
  ('a3a3a3a3-0000-0000-0000-0000000000d1', 'a3a3a3a3-0000-0000-0000-000000000001', current_date - 1, 'fija', 'a3a3a3a3-0000-0000-0000-0000000000b1', 'Barrer pasillo', null, null,
   '{a3a3a3a3-0000-0000-0000-0000000000f1}', 'hecho', now(), 35, 'a3a3a3a3-0000-0000-0000-0000000000f1'),
  ('a3a3a3a3-0000-0000-0000-0000000000d2', 'a3a3a3a3-0000-0000-0000-000000000001', current_date + 1, 'fija', 'a3a3a3a3-0000-0000-0000-0000000000b1', 'Barrer pasillo', null, null,
   '{a3a3a3a3-0000-0000-0000-0000000000f1}', 'pendiente', null, null, null),
  ('a3a3a3a3-0000-0000-0000-0000000000d3', 'a3a3a3a3-0000-0000-0000-000000000001', current_date - 1, 'fija', 'a3a3a3a3-0000-0000-0000-0000000000b2', 'Revisar fugas', null, null,
   '{a3a3a3a3-0000-0000-0000-0000000000f1}', 'pendiente', null, null, null),
  ('a3a3a3a3-0000-0000-0000-0000000000d4', 'a3a3a3a3-0000-0000-0000-000000000001', current_date - 1, 'habitual', 'a3a3a3a3-0000-0000-0000-0000000000b3', 'Recoger taladrina', null,
   'a3a3a3a3-0000-0000-0000-0000000000a1', '{a3a3a3a3-0000-0000-0000-0000000000f2}', 'hecho', now(), 25, 'a3a3a3a3-0000-0000-0000-0000000000f2'),
  ('a3a3a3a3-0000-0000-0000-0000000000d5', 'a3a3a3a3-0000-0000-0000-000000000001', current_date - 1, 'suelto', null, 'Fuga de aceite', 'junto a la F-19', null,
   '{a3a3a3a3-0000-0000-0000-0000000000f2}', 'pendiente', null, null, null),
  ('a3a3a3a3-0000-0000-0000-0000000000d6', 'a3a3a3a3-0000-0000-0000-000000000001', current_date - 1, 'suelto', null, 'Ordenar armario', 'Vestuario', null,
   '{a3a3a3a3-0000-0000-0000-0000000000f2}', 'pendiente', null, null, null);
create temp table r (j jsonb);
grant all on r to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000003a0a1', true);
insert into r select limpieza.investigar('a3a3a3a3-0000-0000-0000-000000000001', current_date - 7, current_date + 7);
select pruebas.ok((select jsonb_array_length(j -> 'trabajos') = 6 and j ->> 'alcance' = 'todo' from r), 'trae los trabajos como el informe');
select pruebas.ok((select array_agg((p ->> 'tema') || ' en ' || (p ->> 'sitio_clave') || ' (' || (p ->> 'sitio') || ')' order by p ->> 'tema') =
                          '{"Aceite en F19 (junto a la F-19)","Taladrina en F19 (F19)"}'
                     from r, jsonb_array_elements(j -> 'problemas') p),
  'problemas: el derrame de taladrina y la fuga en F19 (por la máquina o por el lugar escrito); la fija «Revisar fugas» y lo sin tema, no');
select pruebas.ok((select jsonb_array_length(j -> 'tareas') = 3 from r), 'trae las tareas (fijas y habituales)');
select pruebas.ok((select h -> 'horas_dow' = '[0, 7, 7, 7, 7, 7, 0]' from r, jsonb_array_elements(j -> 'horarios') h where h ->> 'nombre' = 'Ana Prueba'),
  'las horas de horario de cada persona por día de la semana (domingo primero)');
select pruebas.ok((select h -> 'horas_dow' = '[0, 6, 0, 0, 0, 0, 4]' from r, jsonb_array_elements(j -> 'horarios') h where h ->> 'nombre' = 'Bea Prueba'),
  'y las de Bea, con su sábado');
select pruebas.ok((select count(*) = 2 from r, jsonb_array_elements(j -> 'horarios') h), 'solo la gente de su unidad');

-- ---------- aplicar tiempos ----------
select pruebas.ok(limpieza.poner_tiempos('a3a3a3a3-0000-0000-0000-000000000001',
  '[{"id": "a3a3a3a3-0000-0000-0000-0000000000b1", "minutos": 34}, {"id": "a3a3a3a3-0000-0000-0000-0000000000b3", "minutos": 22}]') = 2, 'aplica dos tiempos de una vez');
select pruebas.ok((select array_agg(minutos_est order by titulo) = '{34,22}' from limpieza.tareas where id in ('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-0000000000b3')),
  'el previsto de las tareas cambia');
select pruebas.ok((select minutos_est is null from limpieza.trabajos where id = 'a3a3a3a3-0000-0000-0000-0000000000d2'), 'los trabajos ya salidos no se tocan');
select pruebas.falla($$select limpieza.poner_tiempos('a3a3a3a3-0000-0000-0000-000000000001',
  '[{"id": "a3a3a3a3-0000-0000-0000-0000000000b1", "minutos": 40}, {"id": "a3a3a3a3-0000-0000-0000-0000000000b3", "minutos": 0}]')$$, 'un tiempo de 0 min no vale');
select pruebas.ok((select minutos_est = 34 from limpieza.tareas where id = 'a3a3a3a3-0000-0000-0000-0000000000b1'), 'y no se queda nada a medias (todo o nada)');

-- ---------- pasar una tarea fija ----------
select pruebas.falla($$select limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-0000000000f2', 'a3a3a3a3-0000-0000-0000-0000000000f1')$$,
  'no se puede pasar de quien no la tiene');
select pruebas.falla($$select limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-0000000000f3')$$,
  'ni a alguien de otra unidad');
select pruebas.falla($$select limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b3', 'a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-0000000000f2')$$,
  'ni una habitual');
select pruebas.ok(limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-0000000000f2') = 1,
  'pasar «Barrer pasillo» de Ana a Bea cambia su trabajo pendiente de mañana');
select pruebas.ok((select asignados = '{a3a3a3a3-0000-0000-0000-0000000000f2}' from limpieza.tareas where id = 'a3a3a3a3-0000-0000-0000-0000000000b1'), 'la tarea fija ya es de Bea');
select pruebas.ok((select asignados = '{a3a3a3a3-0000-0000-0000-0000000000f2}' from limpieza.trabajos where id = 'a3a3a3a3-0000-0000-0000-0000000000d2'), 'el de mañana también');
select pruebas.ok((select asignados = '{a3a3a3a3-0000-0000-0000-0000000000f1}' and hecho_por = 'a3a3a3a3-0000-0000-0000-0000000000f1'
                     from limpieza.trabajos where id = 'a3a3a3a3-0000-0000-0000-0000000000d1'), 'el de ayer, ya hecho, sigue siendo de Ana');
select pruebas.falla($$select limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b1', 'a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-0000000000f2')$$,
  'pasarla otra vez da error (Ana ya no la tiene)');

-- ---------- el encargado no ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000003a0e1', true);
select pruebas.falla($$select limpieza.investigar('a3a3a3a3-0000-0000-0000-000000000001', current_date - 7, current_date)$$, 'el encargado no entra en Investigar');
select pruebas.falla($$select limpieza.pasar_tarea('a3a3a3a3-0000-0000-0000-0000000000b2', 'a3a3a3a3-0000-0000-0000-0000000000f1', 'a3a3a3a3-0000-0000-0000-0000000000f2')$$,
  'ni pasa tareas');
select pruebas.falla($$select limpieza.poner_tiempos('a3a3a3a3-0000-0000-0000-000000000001', '[{"id": "a3a3a3a3-0000-0000-0000-0000000000b2", "minutos": 12}]')$$,
  'ni cambia tiempos');

-- ---------- historial ----------
reset role;
select pruebas.ok((select count(*) >= 2 from nucleo.historial h where h.tabla = 'tareas' and h.modulo = 'limpieza' and h.fila = 'a3a3a3a3-0000-0000-0000-0000000000b1' and h.accion = 'cambiar'),
  'los cambios de la tarea quedan en el historial');

rollback;
