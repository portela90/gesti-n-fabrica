-- Almacén, trozo 1 (0038): stock = suma de movimientos, permisos y reglas. Unidades, artículos y personas inventadas.
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

-- ---------- el encargado apunta ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0e1', true);
insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', '2026-11-01', 'entrada', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 20, auth.uid());
insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, destino_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', '2026-11-02', 'traslado', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 'b0b0b0b0-0000-0000-0000-0000000000a2', 6, auth.uid());
insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, cantidad, centro_id, activos, persona_id, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', '2026-11-03', 'salida', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a2', 2,
   'b0b0b0b0-0000-0000-0000-0000000000c1', '{b0b0b0b0-0000-0000-0000-0000000000e1,b0b0b0b0-0000-0000-0000-0000000000e2}', 'b0b0b0b0-0000-0000-0000-0000000000f1', auth.uid());
insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, cantidad, contado, teorico, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', '2026-11-04', 'ajuste', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', -1, 13, 14, auth.uid());
select pruebas.ok((select cantidad = 13 from almacen.stock where almacen_id = 'b0b0b0b0-0000-0000-0000-0000000000a1'), 'general: 20 − 6 de traslado − 1 de recuento = 13');
select pruebas.ok((select cantidad = 4 from almacen.stock where almacen_id = 'b0b0b0b0-0000-0000-0000-0000000000a2'), 'producción: 6 del traslado − 2 de salida = 4');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, destino_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'traslado', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 1, auth.uid())$q$,
  'un traslado al mismo almacén, no');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'salida', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', -3, auth.uid())$q$,
  'una salida en negativo, no');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, cantidad, activos, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'salida', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 1, '{b0b0b0b0-0000-0000-0000-0000000000e9}', auth.uid())$q$,
  'a una máquina de otra unidad, no');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, cantidad, creado_por, origen) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'entrada', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 1, auth.uid(), 'limpieza-cie:x')$q$,
  'desde la app no se apunta como si viniera de la copia');
select pruebas.falla($q$insert into almacen.precios (articulo_id, empresa_id, precio) values ('b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-000000000001', 1)$q$, 'el encargado no pone precios');
select pruebas.falla($q$insert into almacen.fichas (articulo_id, empresa_id) values ('b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-000000000001')$q$,
  'el encargado no cambia las fichas');
insert into almacen.sinonimos (empresa_id, palabra, articulo_id) values ('b0b0b0b0-0000-0000-0000-000000000001', 'pistón gordo', 'b0b0b0b0-0000-0000-0000-0000000000d1');
select pruebas.ok((select count(*) = 1 from almacen.sinonimos), 'quien apunta puede enseñar una palabra');
select pruebas.falla($q$insert into almacen.sinonimos (empresa_id, palabra, articulo_id) values ('b0b0b0b0-0000-0000-0000-000000000001', 'PISTÓN GORDO ', 'b0b0b0b0-0000-0000-0000-0000000000d1')$q$,
  'la misma palabra dos veces, no (sin mirar mayúsculas)');

-- ---------- solo lectura y operario ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0c1', true);
select pruebas.ok((select count(*) = 4 from almacen.movimientos), 'solo lectura ve los movimientos');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'entrada', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 1, auth.uid())$q$, 'pero no apunta');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0f1', true);
select pruebas.ok((select count(*) = 0 from almacen.movimientos), 'el operario no ve el almacén');
select pruebas.falla($q$insert into almacen.movimientos (empresa_id, tipo, articulo_id, almacen_id, cantidad, creado_por) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'entrada', 'b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-0000000000a1', 1, auth.uid())$q$,
  'ni apunta (aunque tenga «*.*.apuntar»)');

-- ---------- el administrador: fichas, precios, dotación ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0a1', true);
insert into almacen.fichas (articulo_id, empresa_id, punto_pedido, maquinas) values ('b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-000000000001', 8, '{b0b0b0b0-0000-0000-0000-0000000000e1}');
insert into almacen.precios (articulo_id, empresa_id, precio) values ('b0b0b0b0-0000-0000-0000-0000000000d1', 'b0b0b0b0-0000-0000-0000-000000000001', 42.5);
insert into almacen.dotacion (empresa_id, almacen_id, articulo_id, cantidad) values ('b0b0b0b0-0000-0000-0000-000000000001', 'b0b0b0b0-0000-0000-0000-0000000000a2', 'b0b0b0b0-0000-0000-0000-0000000000d1', 5);
select pruebas.falla($q$insert into almacen.fichas (articulo_id, empresa_id) values ('b0b0b0b0-0000-0000-0000-0000000000d9', 'b0b0b0b0-0000-0000-0000-000000000001')$q$,
  'la ficha de un artículo de otra unidad, no');
update almacen.movimientos set cantidad = 3 where tipo = 'salida';
select pruebas.ok((select cantidad = 3 from almacen.stock where almacen_id = 'b0b0b0b0-0000-0000-0000-0000000000a2'), 'corregir una salida cambia el stock al momento');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0c1', true);
select pruebas.ok((select count(*) = 0 from almacen.precios), 'solo lectura no ve precios (solo el administrador)');
select pruebas.ok((select count(*) = 1 from almacen.dotacion), 'pero sí la dotación');
reset role;
select pruebas.ok((select count(*) > 0 from nucleo.historial where tabla = 'movimientos' and modulo = 'almacen' and accion = 'cambiar'), 'la corrección queda en el historial');
-- roles de partida: el operario ya no tiene «*.*.apuntar» (no apunta en el almacén) y el técnico de mantenimiento sí apunta salidas
select pruebas.ok(not exists (select 1 from nucleo.rol_permisos rp join nucleo.roles r on r.id = rp.rol_id where r.codigo = 'operario' and rp.permiso like '*.%'
                                                                                                       and rp.permiso <> '*.tarea.ver'), 'operario sin comodín de apuntar');
select pruebas.ok(exists (select 1 from nucleo.rol_permisos rp join nucleo.roles r on r.id = rp.rol_id where r.codigo = 'operario' and rp.permiso = 'limpieza.*.apuntar'), 'operario apunta en Limpieza');
select pruebas.ok(exists (select 1 from nucleo.rol_permisos rp join nucleo.roles r on r.id = rp.rol_id where r.codigo = 'tecnico_mant' and rp.permiso = 'almacen.movimiento.apuntar'), 'técnico apunta salidas');
rollback;
