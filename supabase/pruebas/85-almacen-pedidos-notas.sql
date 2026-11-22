-- Almacén 0039: marcar y anular pedido, la entrada quita la marca, notas pendientes. Todo inventado.
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

insert into nucleo.empresas (id, codigo, nombre) values ('b0b0b0b0-0000-0000-0000-000000000001', 'fabrica-p', 'Fábrica P'), ('b0b0b0b0-0000-0000-0000-000000000002', 'otra-p', 'Otra P');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('b0b0b0b0-0000-0000-0000-000000000001', 'almacen');
insert into nucleo.centros (id, empresa_id, codigo, nombre) values ('b0b0b0b0-0000-0000-0000-0000000000c1', 'b0b0b0b0-0000-0000-0000-000000000001', 'n1', 'Nave 1');
insert into nucleo.almacenes (id, empresa_id, codigo, nombre, tipo) values
  ('b0b0b0b0-0000-0000-0000-0000000000a1', 'b0b0b0b0-0000-0000-0000-000000000001', 'gen', 'General', 'general'),
  ('b0b0b0b0-0000-0000-0000-0000000000a2', 'b0b0b0b0-0000-0000-0000-000000000001', 'n1', 'Producción N1', 'produccion');
insert into nucleo.articulos (id, empresa_id, codigo, nombre) values
  ('b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-000000000001', 'P-80', 'Pistón Ø 80'),
  ('b0b0b0b0-0000-0000-0000-0000000000d9', 'b0b0b0b0-0000-0000-0000-000000000002', 'X-1', 'De otra unidad');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('b0b0b0b0-0000-0000-0000-0000000000b1', 'b0b0b0b0-0000-0000-0000-000000000001', 'iny', 'Inyectora'),
  ('b0b0b0b0-0000-0000-0000-0000000000b2', 'b0b0b0b0-0000-0000-0000-000000000002', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id) values
  ('b0b0b0b0-0000-0000-0000-0000000000e1', 'b0b0b0b0-0000-0000-0000-000000000001', 'F1', 'b0b0b0b0-0000-0000-0000-0000000000b1'),
  ('b0b0b0b0-0000-0000-0000-0000000000e2', 'b0b0b0b0-0000-0000-0000-000000000001', 'F2', 'b0b0b0b0-0000-0000-0000-0000000000b1'),
  ('b0b0b0b0-0000-0000-0000-0000000000e9', 'b0b0b0b0-0000-0000-0000-000000000002', 'F9', 'b0b0b0b0-0000-0000-0000-0000000000b2');
insert into nucleo.personas (id, empresa_id, nombre) values ('b0b0b0b0-0000-0000-0000-0000000000f1', 'b0b0b0b0-0000-0000-0000-000000000001', 'Operario 37');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000b0a1'), ('00000000-0000-0000-0000-00000000b0e1'), ('00000000-0000-0000-0000-00000000b0c1'), ('00000000-0000-0000-0000-00000000b0f1');
insert into nucleo.usuarios (id, nombre) values ('00000000-0000-0000-0000-00000000b0a1', 'Admin'), ('00000000-0000-0000-0000-00000000b0e1', 'Encargado'),
  ('00000000-0000-0000-0000-00000000b0c1', 'Consulta'), ('00000000-0000-0000-0000-00000000b0f1', 'Operario');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select x.u::uuid, (select id from nucleo.roles where codigo = x.r and empresa_id is null), 'b0b0b0b0-0000-0000-0000-000000000001'
  from (values ('00000000-0000-0000-0000-00000000b0a1', 'admin_empresa'), ('00000000-0000-0000-0000-00000000b0e1', 'encargado'),
               ('00000000-0000-0000-0000-00000000b0c1', 'solo_lectura'), ('00000000-0000-0000-0000-00000000b0f1', 'operario')) x(u, r);

set role authenticated;
-- ---------- pedidos ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0e1', true);
select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d1', 12, '2026-11-10');
select pruebas.ok((select pedido_en = '2026-11-10' and pedido_cantidad = 12 from almacen.fichas where articulo_id = 'b0b0b0b0-0000-0000-0000-0000000000d1'), 'el encargado marca pedido (crea la ficha)');
select almacen.anular_pedido('b0b0b0b0-0000-0000-0000-0000000000d1');
select pruebas.ok((select pedido_en is null from almacen.fichas where articulo_id = 'b0b0b0b0-0000-0000-0000-0000000000d1'), 'y lo anula');
select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d1', 5, '2026-11-11');
insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', '2026-11-15', 'entrada', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 5, auth.uid());
select pruebas.ok((select pedido_en = '2026-11-11' from almacen.movimientos where tipo = 'entrada'), 'la entrada guarda cuándo se pidió');
select pruebas.ok((select pedido_en is null and pedido_cantidad is null from almacen.fichas where articulo_id = 'b0b0b0b0-0000-0000-0000-0000000000d1'), 'y quita la marca');
select pruebas.falla($q$select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d9', 1)$q$, 'no en otra unidad');
select pruebas.falla($q$select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d1', -1)$q$, 'cantidad negativa, no');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0c1', true);
select pruebas.falla($q$select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d1', 1)$q$, 'solo lectura no marca pedidos');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0a1', true);
select almacen.marcar_pedido('b0b0b0b0-0000-0000-0000-0000000000d1', 2);
select pruebas.ok((select pedido_en = current_date from almacen.fichas where articulo_id = 'b0b0b0b0-0000-0000-0000-0000000000d1'), 'el administrador también (hoy por defecto)');

-- ---------- notas pendientes ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0e1', true);
insert into almacen.notas (empresa_id, texto) values ('b0b0b0b0-0000-0000-0000-000000000001', '2 guantes para la F1');
select pruebas.ok((select count(*) = 1 from almacen.notas), 'el encargado guarda una nota y la ve');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0a1', true);
select pruebas.ok((select count(*) = 0 from almacen.notas), 'las notas de otro no se ven (ni el administrador)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0c1', true);
select pruebas.falla($q$insert into almacen.notas (empresa_id, texto) values ('b0b0b0b0-0000-0000-0000-000000000001', 'x')$q$, 'solo lectura no guarda notas');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0e1', true);
delete from almacen.notas;
select pruebas.ok((select count(*) = 0 from almacen.notas), 'la borra al procesarla');
rollback;
