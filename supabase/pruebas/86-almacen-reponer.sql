-- Almacén 0040: dotación y mínimos (encargado sí, solo lectura no), ajustes de Reponer, filas de «bajar». Todo inventado.
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
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0e1', true);
insert into almacen.dotacion (empresa_id, almacen_id, articulo_id, cantidad) values ('b0b0b0b0-0000-0000-0000-000000000001', 'b0b0b0b0-0000-0000-0000-0000000000a2', 'b0b0b0b0-0000-0000-0000-0000000000d1', 5);
select pruebas.ok((select cantidad = 5 from almacen.dotacion), 'el encargado pone la dotación');
update almacen.dotacion set cantidad = 7;
select pruebas.ok((select cantidad = 7 from almacen.dotacion), 'y la cambia');
select pruebas.ok(almacen.poner_minimos('b0b0b0b0-0000-0000-0000-000000000001', '[{"articulo":"b0b0b0b0-0000-0000-0000-0000000000d1","minimo":12}]') = 1, 'pone un mínimo');
select pruebas.ok((select minimo = 12 from nucleo.articulos where id = 'b0b0b0b0-0000-0000-0000-0000000000d1'), 'el mínimo está puesto');
select pruebas.ok(almacen.poner_minimos('b0b0b0b0-0000-0000-0000-000000000001', '[{"articulo":"b0b0b0b0-0000-0000-0000-0000000000d9","minimo":3}]') = 0, 'no toca artículos de otra unidad');
select pruebas.falla($q$select almacen.poner_minimos('b0b0b0b0-0000-0000-0000-000000000001', '[{"articulo":"b0b0b0b0-0000-0000-0000-0000000000d1","minimo":-1}]')$q$, 'mínimo negativo, no');
select almacen.guardar_ajuste('b0b0b0b0-0000-0000-0000-000000000001', 'origen_reposicion', '"b0b0b0b0-0000-0000-0000-0000000000a1"');
select almacen.guardar_ajuste('b0b0b0b0-0000-0000-0000-000000000001', 'prevision', '{"nivel":99,"plazo":10,"cobertura":7}');
select pruebas.ok((select count(*) = 2 from nucleo.ajustes where modulo = 'almacen'), 'guarda los ajustes de Reponer y Previsión');
select pruebas.falla($q$select almacen.guardar_ajuste('b0b0b0b0-0000-0000-0000-000000000001', 'otra_cosa', '1')$q$, 'otros ajustes, no');
select pruebas.falla($q$select almacen.guardar_ajuste('b0b0b0b0-0000-0000-0000-000000000001', 'prevision', '{"nivel":42}')$q$, 'nivel raro, no');
insert into almacen.bajar (empresa_id, almacen_id, articulo_id, quitado_stock, quitado_en) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'b0b0b0b0-0000-0000-0000-0000000000a2', 'b0b0b0b0-0000-0000-0000-0000000000d1', 3, now());
select pruebas.ok((select count(*) = 1 from almacen.bajar), 'el encargado quita una fila de bajar a planta');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b0c1', true);
select pruebas.ok((select count(*) = 1 from almacen.bajar), 'solo lectura la ve');
update almacen.dotacion set cantidad = 1;
select pruebas.ok((select cantidad = 7 from almacen.dotacion), 'solo lectura no cambia la dotación');
select pruebas.falla($q$select almacen.poner_minimos('b0b0b0b0-0000-0000-0000-000000000001', '[]')$q$, 'ni los mínimos');
select pruebas.falla($q$insert into almacen.bajar (empresa_id, almacen_id, articulo_id, hoy_cantidad, hoy_dia) values ('b0b0b0b0-0000-0000-0000-000000000001', 'b0b0b0b0-0000-0000-0000-0000000000a1', 'b0b0b0b0-0000-0000-0000-0000000000d1', 1, current_date)$q$, 'ni las filas de bajar');
rollback;
