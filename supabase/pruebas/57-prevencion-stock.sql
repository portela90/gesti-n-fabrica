-- Prevención: stock de ropa y EPI (se descuenta solo al hacer la entrega, por talla). Personas inventadas.
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
create function pruebas.hay(p_nombre text, p_talla text default '') returns int language sql as $$
  select coalesce((select stock from prevencion.v_stock where nombre = p_nombre and talla = p_talla), 0) $$;
grant usage on schema pruebas to authenticated;
grant execute on all functions in schema pruebas to authenticated;

insert into nucleo.empresas (id, codigo, nombre) values
  ('bbbbbbbb-5555-0000-0000-000000000001', 'unidad-s', 'Unidad S'), ('cccccccc-5555-0000-0000-000000000001', 'unidad-t', 'Unidad T');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('bbbbbbbb-5555-0000-0000-000000000001', 'prevencion'), ('cccccccc-5555-0000-0000-000000000001', 'prevencion');
insert into nucleo.personas (id, empresa_id, nombre) values
  ('bbbbbbbb-5555-0000-0000-0000000000f1', 'bbbbbbbb-5555-0000-0000-000000000001', 'Ana Prueba'),
  ('bbbbbbbb-5555-0000-0000-0000000000f2', 'bbbbbbbb-5555-0000-0000-000000000001', 'Bruno Prueba');
insert into prevencion.fichas (persona_id, empresa_id, tallas) values
  ('bbbbbbbb-5555-0000-0000-0000000000f1', 'bbbbbbbb-5555-0000-0000-000000000001', '{"bota": "42", "pantalon": "M"}'),
  ('bbbbbbbb-5555-0000-0000-0000000000f2', 'bbbbbbbb-5555-0000-0000-000000000001', '{"bota": "44"}');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aaa1'), ('00000000-0000-0000-0000-00000000aae1'),
  ('00000000-0000-0000-0000-00000000aaf1'), ('00000000-0000-0000-0000-00000000aab1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-00000000aaa1', 'Jefe S', null), ('00000000-0000-0000-0000-00000000aae1', 'Encargado S', null),
  ('00000000-0000-0000-0000-00000000aaf1', 'Ana', 'bbbbbbbb-5555-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-00000000aab1', 'Jefe T', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-00000000aaa1', 'admin_empresa', 'bbbbbbbb-5555-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000aae1', 'encargado',     'bbbbbbbb-5555-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000aaf1', 'operario',      'bbbbbbbb-5555-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000aab1', 'admin_empresa', 'cccccccc-5555-0000-0000-000000000001')) x(u, r, e);
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
set role authenticated;

-- ---------- el jefe da de alta el material y lo que tiene ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aaa1', true);
insert into prevencion.material (empresa_id, nombre, epi, prenda, tallas, minimos) values
  ('bbbbbbbb-5555-0000-0000-000000000001', 'Botas', 'bota', 'bota', '{41,42,43,44, 42}', '{"42": 3, "43": 2}'),
  ('bbbbbbbb-5555-0000-0000-000000000001', 'Gafas', 'gafas', null, '{}', '{"": 10}'),
  ('bbbbbbbb-5555-0000-0000-000000000001', ' Pantalón ', null, 'pantalon', '{S,M,L}', '{"M": 4}');
insert into ids select 'botas', id from prevencion.material where nombre = 'Botas';
insert into ids select 'gafas', id from prevencion.material where nombre = 'Gafas';
insert into ids select 'pantalon', id from prevencion.material where nombre = 'Pantalón';
select pruebas.ok((select cardinality(tallas) = 4 from prevencion.material where nombre = 'Botas'), 'las tallas no se repiten y el nombre se guarda sin espacios');
select pruebas.falla($q$insert into prevencion.material (empresa_id, nombre) values ('bbbbbbbb-5555-0000-0000-000000000001', 'botas')$q$, 'no hay dos materiales con el mismo nombre');
select pruebas.falla($q$insert into prevencion.material (empresa_id, nombre, minimos) values ('bbbbbbbb-5555-0000-0000-000000000001', 'Casco', '{"": -1}')$q$, 'un mínimo negativo no vale');
insert into prevencion.stock_mov (empresa_id, material_id, talla, cantidad, tipo, nota) values
  ('bbbbbbbb-5555-0000-0000-000000000001', (select v from ids where k = 'botas'), '42', 5, 'entrada', 'Pedido de prueba'),
  ('bbbbbbbb-5555-0000-0000-000000000001', (select v from ids where k = 'gafas'), '', 10, 'entrada', null);
select pruebas.ok(pruebas.hay('Botas', '42') = 5 and pruebas.hay('Gafas') = 10, 'llega un pedido: suma');
select pruebas.ok((select minimo = 2 and stock = 0 from prevencion.v_stock where nombre = 'Botas' and talla = '43'), 'cada talla de la lista sale con su mínimo aunque no haya');
select pruebas.falla($q$insert into prevencion.stock_mov (empresa_id, material_id, cantidad, tipo) values ('bbbbbbbb-5555-0000-0000-000000000001', (select v from ids where k = 'gafas'), -1, 'entrega')$q$, 'las salidas de entregas no se apuntan a mano');
select pruebas.falla($q$update prevencion.stock_mov set cantidad = 99$q$, 'un movimiento no se cambia');
select pruebas.falla($q$delete from prevencion.stock_mov$q$, 'ni se borra');

-- ---------- el encargado hace una entrega: se descuenta solo, con la talla de la ficha ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aae1', true);
insert into prevencion.documentos (empresa_id, tipo, persona_id, datos) values ('bbbbbbbb-5555-0000-0000-000000000001', 'epi', 'bbbbbbbb-5555-0000-0000-0000000000f1',
  '{"items": {"bota": {"u": "1"}, "gafas": {"u": "2"}, "tapones": {"u": "5"}}, "otros": [{"t": "pantalón", "u": "2", "talla": "L"}, {"t": "Chaqueta", "u": "1"}, {"t": ""}]}');
insert into ids select 'doc1', id from prevencion.documentos where persona_id = 'bbbbbbbb-5555-0000-0000-0000000000f1';
select pruebas.ok(pruebas.hay('Botas', '42') = 4, 'botas: sale la talla de su ficha (42)');
select pruebas.ok(pruebas.hay('Gafas') = 8, 'gafas: 2 menos');
select pruebas.ok(pruebas.hay('Pantalón', 'L') = -2 and pruebas.hay('Pantalón', 'M') = 0, 'pantalón: la talla elegida en la entrega manda sobre la de la ficha (y puede quedar en negativo)');
select pruebas.ok((select count(*) from prevencion.stock_mov where documento_id = (select v from ids where k = 'doc1')) = 3, 'lo que no es material del almacén (tapones, chaqueta) no cuenta');
select pruebas.ok(pruebas.cuantas('select * from prevencion.stock_mov') = 5, 'el encargado ve los movimientos (para saber si queda)');
select pruebas.falla($q$insert into prevencion.stock_mov (empresa_id, material_id, cantidad, tipo) values ('bbbbbbbb-5555-0000-0000-000000000001', (select v from ids where k = 'gafas'), 3, 'entrada')$q$, 'pero no apunta pedidos');
-- se corrige antes de firmar: solo 1 gafa
update prevencion.documentos set datos = jsonb_set(datos, '{items,gafas,u}', '"1"') where id = (select v from ids where k = 'doc1');
select pruebas.ok(pruebas.hay('Gafas') = 9 and pruebas.hay('Botas', '42') = 4, 'cambiar la entrega corrige solo la diferencia');
update prevencion.documentos set enviado_en = now() where id = (select v from ids where k = 'doc1');
select pruebas.ok((select count(*) from prevencion.stock_mov where documento_id = (select v from ids where k = 'doc1')) = 4, 'enviarla a firmar no mueve nada');
-- se borra (sin firmar): vuelve todo
delete from prevencion.documentos where id = (select v from ids where k = 'doc1');
select pruebas.ok(pruebas.hay('Gafas') = 10 and pruebas.hay('Botas', '42') = 5 and pruebas.hay('Pantalón', 'L') = 0, 'si se borra la entrega, todo vuelve al stock');

-- ---------- entrega firmada y luego anulada ----------
insert into prevencion.documentos (empresa_id, tipo, persona_id, datos) values ('bbbbbbbb-5555-0000-0000-000000000001', 'epi', 'bbbbbbbb-5555-0000-0000-0000000000f2',
  '{"items": {"bota": {"u": "1"}}}');
insert into ids select 'doc2', id from prevencion.documentos where persona_id = 'bbbbbbbb-5555-0000-0000-0000000000f2';
select pruebas.ok(pruebas.hay('Botas', '44') = -1, 'Bruno: su talla 44 (no había: queda en −1)');
select prevencion.firmar_documento((select v from ids where k = 'doc2'), 'data:image/png;base64,AAAA');
select pruebas.ok(pruebas.hay('Botas', '44') = -1, 'al firmar no se descuenta otra vez');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aaa1', true);
set role authenticated;
select prevencion.anular_documento((select v from ids where k = 'doc2'));
select pruebas.ok(pruebas.hay('Botas', '44') = 0, 'si se anula, la bota vuelve');

-- ---------- recuento ----------
select pruebas.ok(prevencion.recontar_stock('bbbbbbbb-5555-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('material_id', (select v from ids where k = 'botas'), 'talla', '42', 'hay', 7),
                    jsonb_build_object('material_id', (select v from ids where k = 'gafas'), 'talla', '', 'hay', 10)), 'Recuento de prueba') = 1, 'el recuento solo apunta lo que no cuadra');
select pruebas.ok(pruebas.hay('Botas', '42') = 7 and (select nota from prevencion.stock_mov where tipo = 'ajuste') = 'Recuento de prueba', 'y queda con su motivo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aae1', true);
select pruebas.falla($q$select prevencion.recontar_stock('bbbbbbbb-5555-0000-0000-000000000001', '[]')$q$, 'el encargado no hace recuentos');
update prevencion.material set minimos = '{}' where nombre = 'Botas';
select pruebas.ok((select minimos ->> '42' from prevencion.material where nombre = 'Botas') = '3', 'ni cambia el material');

-- ---------- la trabajadora y la otra unidad no ven el stock ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aaf1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.stock_mov') = 0, 'la trabajadora no ve el stock');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aab1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.stock_mov') = 0 and pruebas.cuantas('select * from prevencion.material') = 0, 'el jefe de otra unidad no ve nada');
select pruebas.falla($q$insert into prevencion.material (empresa_id, nombre) values ('bbbbbbbb-5555-0000-0000-000000000001', 'Intruso')$q$, 'ni da de alta material');
reset role;
select pruebas.ok((select count(*) from nucleo.historial where tabla = 'material') = 3, 'el historial guarda el alta del material');
rollback;
