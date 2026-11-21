-- Limpieza · Pregúntale: diccionario y preguntas (solo el administrador) y lo nuevo de Investigar (nave, hora, temas). Personas inventadas.
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

insert into nucleo.empresas (id, codigo, nombre) values ('a4a4a4a4-0000-0000-0000-000000000001', 'unidad-l', 'Unidad L');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('a4a4a4a4-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.centros (id, empresa_id, codigo, nombre) values
  ('a4a4a4a4-0000-0000-0000-0000000000c1', 'a4a4a4a4-0000-0000-0000-000000000001', 'n1', 'Nave 1'),
  ('a4a4a4a4-0000-0000-0000-0000000000c2', 'a4a4a4a4-0000-0000-0000-000000000001', 'n2', 'Nave 2');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('a4a4a4a4-0000-0000-0000-0000000000b0', 'a4a4a4a4-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id, centro_id) values
  ('a4a4a4a4-0000-0000-0000-0000000000a1', 'a4a4a4a4-0000-0000-0000-000000000001', 'F19', 'a4a4a4a4-0000-0000-0000-0000000000b0', 'a4a4a4a4-0000-0000-0000-0000000000c2');
insert into nucleo.ubicaciones (id, empresa_id, centro_id, codigo, nombre) values
  ('a4a4a4a4-0000-0000-0000-0000000000d1', 'a4a4a4a4-0000-0000-0000-000000000001', 'a4a4a4a4-0000-0000-0000-0000000000c1', 'pasillo', 'Pasillo');
insert into limpieza.temas (empresa_id, nombre, palabras, orden) values ('a4a4a4a4-0000-0000-0000-000000000001', 'Aceite', '{aceite}', 1);
insert into limpieza.trabajos (id, empresa_id, fecha, clase, titulo, activo_id, ubicacion_id, creado) values
  ('a4a4a4a4-0000-0000-0000-0000000000e1', 'a4a4a4a4-0000-0000-0000-000000000001', current_date - 1, 'suelto', 'Fuga de aceite', 'a4a4a4a4-0000-0000-0000-0000000000a1', null, '2026-11-20 10:15+01'),
  ('a4a4a4a4-0000-0000-0000-0000000000e2', 'a4a4a4a4-0000-0000-0000-000000000001', current_date - 1, 'suelto', 'Barrer', null, 'a4a4a4a4-0000-0000-0000-0000000000d1', now()),
  ('a4a4a4a4-0000-0000-0000-0000000000e3', 'a4a4a4a4-0000-0000-0000-000000000001', current_date - 1, 'suelto', 'Ordenar', null, null, now());
insert into auth.users (id) values ('00000000-0000-0000-0000-00000004a0a1'), ('00000000-0000-0000-0000-00000004a0e1');
insert into nucleo.usuarios (id, nombre, persona_id) values ('00000000-0000-0000-0000-00000004a0a1', 'Admin L', null), ('00000000-0000-0000-0000-00000004a0e1', 'Enca L', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'a4a4a4a4-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000004a0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000004a0e1', 'encargado')) x(u, r);
create temp table r (j jsonb);
grant all on r to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000004a0a1', true);
insert into r select limpieza.investigar('a4a4a4a4-0000-0000-0000-000000000001', current_date - 7, current_date);
select pruebas.ok((select array_agg((d ->> 'nave') order by d ->> 'id') = '{"Nave 2","Nave 1",NULL}' from r, jsonb_array_elements(j -> 'detalles') d),
  'cada trabajo trae su nave: por la máquina (F19 en la Nave 2), por la zona (Pasillo en la Nave 1) o ninguna');
select pruebas.ok((select (d ->> 'creado')::timestamptz = '2026-11-20 10:15+01' from r, jsonb_array_elements(j -> 'detalles') d where d ->> 'id' = 'a4a4a4a4-0000-0000-0000-0000000000e1'),
  'y su hora de creación');
select pruebas.ok((select j -> 'temas' = '[{"nombre": "Aceite", "palabras": ["aceite"]}]' and j -> 'naves' = '["Nave 1", "Nave 2"]' and j -> 'maquinas' = '["F19"]' from r),
  'trae los temas con sus palabras, las naves y las máquinas');
select pruebas.ok((select jsonb_array_length(j -> 'problemas') = 1 and jsonb_array_length(j -> 'horarios') = 0 from r), 'y lo de antes sigue igual');

-- diccionario y preguntas
insert into limpieza.preguntas_dic (empresa_id, tipo, palabra, valor) values ('a4a4a4a4-0000-0000-0000-000000000001', 'persona', 'Juanjo', 'Juan José Prueba');
insert into limpieza.preguntas_dic (empresa_id, tipo, palabra) values ('a4a4a4a4-0000-0000-0000-000000000001', 'favorita', '¿Dónde se repiten las fugas?');
select pruebas.falla($$insert into limpieza.preguntas_dic (empresa_id, tipo, palabra) values ('a4a4a4a4-0000-0000-0000-000000000001', 'persona', 'Pepe')$$,
  'una persona sin a quién se refiere no vale');
select pruebas.falla($$insert into limpieza.preguntas_dic (empresa_id, tipo, palabra, valor) values ('a4a4a4a4-0000-0000-0000-000000000001', 'persona', ' JUANJO ', 'Otro')$$,
  'la misma palabra dos veces para lo mismo, no (sin mirar mayúsculas ni espacios)');
insert into limpieza.preguntas (empresa_id, q, respuesta) values ('a4a4a4a4-0000-0000-0000-000000000001', '¿Cuántas fugas este mes?', 'Fugas este mes: 1 vez.');
update limpieza.preguntas set ok = false, queria = 'Las de la F19' where q = '¿Cuántas fugas este mes?';
select pruebas.ok((select ok = false and queria = 'Las de la F19' and creado_por = '00000000-0000-0000-0000-00000004a0a1' from limpieza.preguntas), 'la pregunta se guarda y se marca si no ha servido');
delete from limpieza.preguntas_dic where tipo = 'favorita';
select pruebas.ok((select count(*) = 1 from limpieza.preguntas_dic), 'lo enseñado se puede borrar');

-- el encargado no ve ni toca nada de esto
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000004a0e1', true);
select pruebas.ok((select count(*) = 0 from limpieza.preguntas_dic) and (select count(*) = 0 from limpieza.preguntas), 'el encargado no ve el diccionario ni las preguntas');
select pruebas.falla($$insert into limpieza.preguntas_dic (empresa_id, tipo, palabra, valor) values ('a4a4a4a4-0000-0000-0000-000000000001', 'frase', 'x', 'y')$$, 'ni enseña');
select pruebas.falla($$insert into limpieza.preguntas (empresa_id, q) values ('a4a4a4a4-0000-0000-0000-000000000001', 'hola')$$, 'ni guarda preguntas');
select pruebas.falla($$select limpieza.investigar('a4a4a4a4-0000-0000-0000-000000000001', current_date - 7, current_date)$$, 'ni entra en Investigar');

reset role;
select pruebas.ok((select count(*) >= 1 from nucleo.historial h where h.tabla = 'preguntas_dic' and h.modulo = 'limpieza'), 'lo que se enseña queda en el historial');
rollback;
