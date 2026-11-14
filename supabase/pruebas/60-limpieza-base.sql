-- Limpieza: tareas fijas y habituales y checklists (lo que prepara el administrador).
-- Unidades y personas inventadas. Todo se deshace al final.
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

insert into nucleo.empresas (id, codigo, nombre) values
  ('77777777-0000-0000-0000-000000000001', 'unidad-g', 'Unidad G'), ('88888888-0000-0000-0000-000000000001', 'unidad-h', 'Unidad H');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('77777777-0000-0000-0000-000000000001', 'limpieza'), ('88888888-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('77777777-0000-0000-0000-0000000000f1', '77777777-0000-0000-0000-000000000001', 'Carla Prueba'),
  ('88888888-0000-0000-0000-0000000000f1', '88888888-0000-0000-0000-000000000001', 'Dani Otra');
insert into nucleo.equipos (id, empresa_id, codigo, nombre) values
  ('77777777-0000-0000-0000-0000000000e1', '77777777-0000-0000-0000-000000000001', 'semana', 'Semana'),
  ('88888888-0000-0000-0000-0000000000e1', '88888888-0000-0000-0000-000000000001', 'semana', 'Semana');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('77777777-0000-0000-0000-0000000000a1', '77777777-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, tipo_id, codigo) values ('77777777-0000-0000-0000-0000000000a2', '77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000a1', 'F99');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000007a1'), ('00000000-0000-0000-0000-0000000007e1'),
  ('00000000-0000-0000-0000-0000000007f1'), ('00000000-0000-0000-0000-0000000008a1'), ('00000000-0000-0000-0000-0000000007c1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000007a1', 'Jefe G', null), ('00000000-0000-0000-0000-0000000007e1', 'Encargado G', null),
  ('00000000-0000-0000-0000-0000000007f1', 'Carla', '77777777-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000008a1', 'Jefe H', null),
  ('00000000-0000-0000-0000-0000000007c1', 'Mirón G', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000007a1', 'admin_empresa', '77777777-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000007e1', 'encargado',     '77777777-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000007f1', 'operario',      '77777777-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000007c1', 'solo_lectura',  '77777777-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000008a1', 'admin_empresa', '88888888-0000-0000-0000-000000000001')) x(u, r, e);
set role authenticated;

-- ---------- el administrador prepara tareas y checklists ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', true);
insert into limpieza.tareas (id, empresa_id, clase, titulo, dias, equipo_id, asignados, minutos_est) values
  ('77777777-0000-0000-0000-0000000000b1', '77777777-0000-0000-0000-000000000001', 'fija', 'Basuras Nave Z', '{5,1,1,3}',
   '77777777-0000-0000-0000-0000000000e1', '{77777777-0000-0000-0000-0000000000f1,77777777-0000-0000-0000-0000000000f1}', 30);
select pruebas.ok((select dias = '{1,3,5}' and asignados = '{77777777-0000-0000-0000-0000000000f1}' from limpieza.tareas), 'los días se ordenan y las personas no se repiten');
insert into limpieza.tareas (id, empresa_id, clase, titulo, grupo, activo_id, solo_para) values
  ('77777777-0000-0000-0000-0000000000b2', '77777777-0000-0000-0000-000000000001', 'habitual', 'Cambiar taladrina F99', 'limpieza',
   '77777777-0000-0000-0000-0000000000a2', '{77777777-0000-0000-0000-0000000000f1}');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo) values ('77777777-0000-0000-0000-000000000001', 'fija', 'Sin días')$q$, 'una fija necesita días y equipo');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo, dias, equipo_id) values ('77777777-0000-0000-0000-000000000001', 'habitual', 'Con días', '{1}', '77777777-0000-0000-0000-0000000000e1')$q$, 'una habitual no lleva días ni equipo');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo, dias, equipo_id) values ('77777777-0000-0000-0000-000000000001', 'fija', 'Equipo ajeno', '{1}', '88888888-0000-0000-0000-0000000000e1')$q$, 'no vale el equipo de otra unidad');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo, solo_para) values ('77777777-0000-0000-0000-000000000001', 'habitual', 'Persona ajena', '{88888888-0000-0000-0000-0000000000f1}')$q$, 'no vale una persona de otra unidad');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo, dias, equipo_id) values ('77777777-0000-0000-0000-000000000001', 'fija', 'Día 9', '{9}', '77777777-0000-0000-0000-0000000000e1')$q$, 'los días van de 0 a 6');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo, cantidad) values ('77777777-0000-0000-0000-000000000001', 'habitual', 'Cantidad sola', 2)$q$, 'una cantidad sin artículo no vale');

insert into limpieza.plantillas (id, empresa_id, nombre, cuando, aplica, puntos) values
  ('77777777-0000-0000-0000-0000000000c1', '77777777-0000-0000-0000-000000000001', 'Inyectoras', 'trabajos',
   '{"codigos": "F*", "excluir": "horno", "tareas": ["77777777-0000-0000-0000-0000000000b2"]}',
   '[{"texto": "Robot limpio", "tipo": "ok", "foto_si_mal": true}, {"texto": "Bidones llenos", "tipo": "num", "minimo": 2}]'),
  ('77777777-0000-0000-0000-0000000000c2', '77777777-0000-0000-0000-000000000001', 'Cierre', 'encargado',
   '{"codigos": "F*"}', '[{"texto": "Luces apagadas", "tipo": "ok"}]');
select pruebas.ok((select aplica = '{}' from limpieza.plantillas where id = '77777777-0000-0000-0000-0000000000c2'), 'la checklist del encargado no se engancha a trabajos');
select pruebas.falla($q$insert into limpieza.plantillas (empresa_id, nombre, cuando, puntos) values ('77777777-0000-0000-0000-000000000001', 'Mal', 'trabajos', '[{"texto": "", "tipo": "ok"}]')$q$, 'un punto sin texto no vale');
select pruebas.falla($q$insert into limpieza.plantillas (empresa_id, nombre, cuando, puntos) values ('77777777-0000-0000-0000-000000000001', 'Mal', 'trabajos', '[{"texto": "X", "tipo": "foto"}]')$q$, 'un punto con un tipo raro no vale');
select pruebas.falla($q$insert into limpieza.plantillas (empresa_id, nombre, cuando, aplica) values ('77777777-0000-0000-0000-000000000001', 'Mal', 'trabajos', '{"otra": 1}')$q$, '«aplica» solo lleva códigos, excluir y tareas');
select pruebas.falla($q$insert into limpieza.plantillas (empresa_id, nombre, cuando) values ('77777777-0000-0000-0000-000000000001', 'Mal', 'cuando_quiera')$q$, 'cuándo sale: trabajos o encargado');
update limpieza.tareas set baja = now() where id = '77777777-0000-0000-0000-0000000000b1';
select pruebas.ok(pruebas.cuantas('select * from limpieza.tareas where baja is not null') = 1, 'el administrador da de baja una tarea');
select pruebas.falla($q$delete from limpieza.tareas$q$, 'nada se borra: se da de baja');

-- ---------- el encargado y solo lectura ven, pero no cambian ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007e1', true);
select pruebas.ok(pruebas.cuantas('select * from limpieza.tareas') = 2 and pruebas.cuantas('select * from limpieza.plantillas') = 2, 'el encargado ve tareas y checklists');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo) values ('77777777-0000-0000-0000-000000000001', 'habitual', 'Del encargado')$q$, 'el encargado no crea tareas fijas ni habituales');
update limpieza.plantillas set nombre = 'Cambiada' where id = '77777777-0000-0000-0000-0000000000c1';
select pruebas.ok((select nombre from limpieza.plantillas where id = '77777777-0000-0000-0000-0000000000c1') = 'Inyectoras', 'ni cambia una checklist');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007c1', true);
select pruebas.ok(pruebas.cuantas('select * from limpieza.tareas') = 2, 'solo lectura las ve');
select pruebas.falla($q$insert into limpieza.plantillas (empresa_id, nombre, cuando) values ('77777777-0000-0000-0000-000000000001', 'Mía', 'encargado')$q$, 'solo lectura no crea checklists');

-- ---------- el operario no las necesita; la otra unidad no las ve ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007f1', true);
select pruebas.ok(pruebas.cuantas('select * from limpieza.tareas') = 0 and pruebas.cuantas('select * from limpieza.plantillas') = 0, 'el operario no ve la lista de tareas ni las checklists');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008a1', true);
select pruebas.ok(pruebas.cuantas('select * from limpieza.tareas') = 0, 'el jefe de otra unidad no ve nada de esta');
select pruebas.falla($q$insert into limpieza.tareas (empresa_id, clase, titulo) values ('77777777-0000-0000-0000-000000000001', 'habitual', 'Intruso')$q$, 'ni crea tareas en ella');

-- ---------- historial ----------
reset role;
select pruebas.ok((select count(*) from nucleo.historial where tabla = 'tareas' and modulo = 'limpieza' and fila = '77777777-0000-0000-0000-0000000000b1') >= 2,
  'el historial guarda quién creó y dio de baja la tarea');
select pruebas.ok((select usuario_id from nucleo.historial where tabla = 'plantillas' and fila = '77777777-0000-0000-0000-0000000000c1' limit 1) = '00000000-0000-0000-0000-0000000007a1',
  'y quién hizo la checklist');
rollback;
