-- Incidencias, problemas repetidos, tablón y bandeja de notificaciones. Personas inventadas.
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

-- unidad I: Ada (administradora), Eva (encargada), Oli (operario)
insert into nucleo.empresas (id, codigo, nombre) values ('a1a1a1a1-0000-0000-0000-000000000001', 'unidad-i', 'Unidad I');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('a1a1a1a1-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values ('a1a1a1a1-0000-0000-0000-0000000000e1', 'a1a1a1a1-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.personas (id, empresa_id, nombre, equipo_id) values
  ('a1a1a1a1-0000-0000-0000-0000000000f1', 'a1a1a1a1-0000-0000-0000-000000000001', 'Oli Prueba', 'a1a1a1a1-0000-0000-0000-0000000000e1'),
  ('a1a1a1a1-0000-0000-0000-0000000000f2', 'a1a1a1a1-0000-0000-0000-000000000001', 'Eva Prueba', 'a1a1a1a1-0000-0000-0000-0000000000e1');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000001a0a1'), ('00000000-0000-0000-0000-00000001a0e2'), ('00000000-0000-0000-0000-00000001a0f1');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-00000001a0a1', 'Ada', null),
  ('00000000-0000-0000-0000-00000001a0e2', 'Eva', 'a1a1a1a1-0000-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-00000001a0f1', 'Oli', 'a1a1a1a1-0000-0000-0000-0000000000f1');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), 'a1a1a1a1-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000001a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000001a0e2', 'encargado'),
               ('00000000-0000-0000-0000-00000001a0f1', 'operario')) x(u, r);
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('a1a1a1a1-0000-0000-0000-0000000000c1', 'a1a1a1a1-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id) values
  ('a1a1a1a1-0000-0000-0000-0000000000a1', 'a1a1a1a1-0000-0000-0000-000000000001', 'F30', 'a1a1a1a1-0000-0000-0000-0000000000c1');
insert into limpieza.temas (empresa_id, nombre, palabras, orden) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Taladrina', '{taladrin}', 1),
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Aceite', '{aceite,hidraulic}', 2);
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, asignados, equipo_id, activo_id) values
  ('a1a1a1a1-0000-0000-0000-0000000000b1', 'a1a1a1a1-0000-0000-0000-000000000001', 'fija', 'Limpieza F30', '{0,1,2,3,4,5,6}',
   '{a1a1a1a1-0000-0000-0000-0000000000f1}', 'a1a1a1a1-0000-0000-0000-0000000000e1', 'a1a1a1a1-0000-0000-0000-0000000000a1');
select pruebas.ok(limpieza._tema('a1a1a1a1-0000-0000-0000-000000000001', 'Fuga HIDRÁULICA') = 'Aceite', 'el tema sale de las palabras, sin mirar tildes ni mayúsculas');
select pruebas.ok(limpieza._tema('a1a1a1a1-0000-0000-0000-000000000001', 'aceite y taladrina') = 'Taladrina', 'gana el tema de menor orden');
select pruebas.ok(limpieza._clave_lugar('a1a1a1a1-0000-0000-0000-000000000001', null, 'junto a la F-30') = 'F30', 'el sitio es la máquina si se nombra');
select pruebas.ok(limpieza._clave_lugar('a1a1a1a1-0000-0000-0000-000000000001', null, 'Pasillo nave 2') = 'PASILLONAVE2', 'si no, el texto del lugar');
create temp view bandeja as select n.usuario_id, n.titulo, n.texto, n.urgente from nucleo.notificaciones n where n.empresa_id = 'a1a1a1a1-0000-0000-0000-000000000001';
grant select on bandeja to authenticated;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
set role authenticated;

-- ---------- «Hay un problema» → incidencia ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
insert into ids select 't1', (j ->> 'id')::uuid from jsonb_array_elements(limpieza.mi_dia('a1a1a1a1-0000-0000-0000-000000000001', current_date)) j;
select limpieza.avisar_problema((select v from ids where k = 't1'), 'Hay mucho aceite en el suelo');
select pruebas.ok((select count(*) = 1 and bool_and(tema = 'Aceite' and lugar_clave = 'F30' and origen = 'trabajo' and estado = 'abierta') from limpieza.incidencias),
  '«Hay un problema» crea una incidencia (tema Aceite, en la F30) que el operario ve');
select limpieza.avisar_problema((select v from ids where k = 't1'), 'Y ahora gotea más');
select pruebas.ok((select count(*) = 1 from limpieza.incidencias) and (select count(*) = 1 from limpieza.incidencia_notas), 'avisar otra vez añade una nota, no otra incidencia');
reset role;
select pruebas.ok((select count(*) = 1 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0a1' and titulo like 'Incidencia: Hay mucho aceite%'),
  'a la administradora le llega la incidencia');
select pruebas.ok((select count(*) = 0 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0e2' and titulo like 'Incidencia%'), 'a la encargada no');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0e2', true);
select pruebas.ok((select count(*) = 0 from limpieza.incidencias), 'la encargada no ve las incidencias de otros');
select pruebas.falla($q$select limpieza.incidencia_nota((select id from limpieza.incidencias limit 1), 'hola')$q$, 'ni escribe en ellas');

-- ---------- problema repetido: el operario abre un «Derrame de aceite» en la F30 ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
select limpieza.crear_trabajo('a1a1a1a1-0000-0000-0000-000000000001', current_date, null, 'Derrame de aceite', 'a1a1a1a1-0000-0000-0000-0000000000a1');
reset role;
select pruebas.ok((select count(*) = 1 and bool_and(tema = 'Aceite' and lugar_clave = 'F30' and estado = 'pendiente') from limpieza.problemas),
  'dos veces aceite en la F30 en 7 días: problema repetido');
select pruebas.ok((select count(*) = 2 from limpieza.casos where problema_id is not null), 'con sus dos casos (el trabajo y su incidencia cuentan una vez)');
select pruebas.ok((select count(*) = 1 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0a1' and titulo = 'Problema repetido: Aceite en F30'), 'y se avisa a la administradora');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0a1', true);
select pruebas.ok(jsonb_array_length(limpieza.problemas_lista('a1a1a1a1-0000-0000-0000-000000000001') -> 0 -> 'casos') = 2, 'la lista de problemas trae sus casos');
select pruebas.falla($q$select limpieza.problema_estado((select id from limpieza.problemas), 'solucionado', '')$q$, 'solucionarlo pide nota');
select limpieza.problema_estado((select id from limpieza.problemas), 'solucionado', 'Cambiado el latiguillo');
select pruebas.ok((select estado = 'solucionado' from limpieza.problemas), 'solucionado');
select limpieza.crear_incidencia('a1a1a1a1-0000-0000-0000-000000000001', 'Mancha de aceite', null, 'a1a1a1a1-0000-0000-0000-0000000000a1');
select pruebas.ok((select estado = 'pendiente' and reabierto = 1 from limpieza.problemas), 'si vuelve a pasar, se reabre');
select limpieza.problema_quitar((select id from limpieza.problemas), (select id from limpieza.incidencias where texto = 'Mancha de aceite'), 'Era otra cosa');
reset role;
select pruebas.ok((select count(*) = 2 from limpieza.casos where problema_id is not null), '«No es lo mismo» quita un caso');
set role authenticated;
select pruebas.falla($q$select * from limpieza.casos$q$, 'los casos no se leen desde la app');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0e2', true);
select pruebas.falla($q$select limpieza.problemas_lista('a1a1a1a1-0000-0000-0000-000000000001')$q$, 'la encargada no ve los problemas repetidos');

-- ---------- gestionar una incidencia ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
select pruebas.falla($q$select limpieza.incidencia_estado((select id from limpieza.incidencias where origen = 'trabajo'), 'resuelta', 'ya')$q$, 'el operario no la gestiona');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0a1', true);
select pruebas.falla($q$select limpieza.incidencia_estado((select id from limpieza.incidencias where origen = 'trabajo'), 'en_proceso')$q$, 'ponerla en proceso pide nota');
select limpieza.incidencia_estado((select id from limpieza.incidencias where origen = 'trabajo'), 'en_proceso', 'Avisado a mantenimiento');
reset role;
select pruebas.ok((select count(*) = 1 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0f1' and titulo like 'En marcha:%' and texto = 'Avisado a mantenimiento'),
  'al operario le llega cómo va su incidencia');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
select limpieza.incidencia_nota((select id from limpieza.incidencias where origen = 'trabajo'), 'Sigue goteando');
select pruebas.ok((select count(*) = 3 from limpieza.incidencia_notas), 'el operario añade una nota a la suya');
select pruebas.ok((select count(*) = 1 from limpieza.incidencias), 'y solo ve la suya (la «a mano» es de la administradora)');
select pruebas.falla($q$select limpieza.crear_incidencia('a1a1a1a1-0000-0000-0000-000000000001', 'Con foto', null, null, false, '["otra/incidencias/x/a.jpg"]', gen_random_uuid())$q$,
  'la foto tiene que ser de esa incidencia');

-- ---------- checklist del encargado con un punto mal ----------
reset role;
insert into limpieza.revisiones (empresa_id, fecha, items, cerrado) values ('a1a1a1a1-0000-0000-0000-000000000001', current_date,
  '[{"plantilla": "Cierre", "texto": "Botiquín", "estado": "mal", "nota": "faltan tiritas"}, {"plantilla": "Cierre", "texto": "Luces", "estado": "bien"}]', now());
select pruebas.ok((select count(*) = 1 from limpieza.incidencias where origen = 'encargado' and texto = '«Botiquín» mal (Cierre): faltan tiritas'),
  'el punto mal de la checklist del encargado es una incidencia');
select pruebas.ok((select count(*) = 1 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0a1' and titulo = 'Checklist del encargado enviada'),
  'y a la administradora le llega que está enviada');

-- ---------- trabajos al operario ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0e2', true);
select limpieza.crear_trabajo('a1a1a1a1-0000-0000-0000-000000000001', current_date, null, 'Barrer muelle', null, null, '{a1a1a1a1-0000-0000-0000-0000000000f1}');
reset role;
select pruebas.ok((select count(*) = 1 from bandeja where usuario_id = '00000000-0000-0000-0000-00000001a0f1' and titulo = 'Trabajo nuevo: Barrer muelle'),
  'al operario le llega el trabajo que le ponen');
select pruebas.ok((select count(*) = 0 from bandeja where titulo = 'Trabajo nuevo: Limpieza F30'), 'las fijas de cada día no avisan');

-- ---------- tablón ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0a1', true);
insert into nucleo.avisos (empresa_id, titulo, texto, hasta) values ('a1a1a1a1-0000-0000-0000-000000000001', 'Auditoría', 'El jueves viene el cliente', current_date + 3);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
select pruebas.ok((select count(*) = 1 from nucleo.avisos), 'el operario ve el aviso del tablón');
select pruebas.ok((select count(*) = 1 from nucleo.notificaciones where titulo = 'Aviso: Auditoría'), 'y le llega');
select pruebas.falla($q$insert into nucleo.avisos (empresa_id, titulo, hasta) values ('a1a1a1a1-0000-0000-0000-000000000001', 'Yo', current_date)$q$, 'pero no publica avisos');
select pruebas.ok((select count(*) from nucleo.notificaciones) = (select count(*) from nucleo.notificaciones where usuario_id = '00000000-0000-0000-0000-00000001a0f1'),
  'cada uno ve solo su bandeja');
select nucleo.marcar_leidas();
select pruebas.ok((select count(*) = 0 from nucleo.notificaciones where leido is null), 'y la marca como leída');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0a1', true);
update nucleo.avisos set anulado = now();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000001a0f1', true);
select pruebas.ok((select count(*) = 0 from nucleo.avisos), 'un aviso quitado ya no sale');
rollback;
