-- Pruebas de permisos del núcleo. Todo dentro de una transacción que se deshace al final.
-- Empresas y personas inventadas (nunca datos reales).
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
-- ok si la orden SQL da error (por permisos, reglas o claves)
create function pruebas.falla(orden text, msg text) returns void language plpgsql as $$
begin
  begin execute orden; exception when others then raise notice 'ok: % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLA: % — debería haber dado error y no lo dio', msg;
end $$;
-- filas que se ven con la orden (después de las reglas de seguridad)
create function pruebas.cuantas(orden text) returns int language plpgsql as $$
declare n int; begin execute 'with x as (' || orden || ') select count(*) from x' into n; return n; end $$;
grant usage on schema pruebas to authenticated;
grant execute on all functions in schema pruebas to authenticated;

-- ---------- datos de prueba (como postgres, sin reglas) ----------
insert into nucleo.empresas (id, codigo, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'empresa-a', 'Empresa A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'empresa-b', 'Empresa B');
insert into nucleo.empresa_modulos (empresa_id, modulo) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'coladas'), ('aaaaaaaa-0000-0000-0000-000000000001', 'almacen'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'limpieza');
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('coladas.lote.ver', 'coladas', 'prueba'), ('almacen.stock.ver', 'almacen', 'prueba'), ('limpieza.tarea.apuntar', 'limpieza', 'prueba');
insert into nucleo.centros (id, empresa_id, codigo, nombre) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001', 'n1', 'Nave 1'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000001', 'n2', 'Nave 2'),
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-000000000001', 'planta', 'Planta B');
insert into nucleo.personas (id, empresa_id, nombre, centro_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Persona A1', 'aaaaaaaa-0000-0000-0000-0000000000c1'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-000000000001', 'Persona A2', 'aaaaaaaa-0000-0000-0000-0000000000c2'),
  ('aaaaaaaa-0000-0000-0000-0000000000f3', 'aaaaaaaa-0000-0000-0000-000000000001', 'Persona A3 sin nave', null),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 'Persona B1', null);
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000005a'), ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-000000000000');
insert into nucleo.usuarios (id, nombre, superadmin, persona_id) values
  ('00000000-0000-0000-0000-00000000005a', 'Super', true, null),
  ('00000000-0000-0000-0000-0000000000a1', 'Admin A', false, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Encargado A Nave 1', false, 'aaaaaaaa-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000d1', 'Lectura A sin Coladas', false, null),
  ('00000000-0000-0000-0000-0000000000b1', 'Operario B', false, 'bbbbbbbb-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-000000000000', 'Sin rol', false, null);
insert into nucleo.roles (id, empresa_id, codigo, nombre) values
  ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-000000000001', 'solo_almacen', 'Solo almacén');
insert into nucleo.rol_permisos (rol_id, permiso) values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'almacen.*.ver');
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id, centro_id)
select u, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid, c::uuid from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'admin_empresa', 'aaaaaaaa-0000-0000-0000-000000000001', null),
  ('00000000-0000-0000-0000-0000000000e1'::uuid, 'encargado',     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'operario',      'bbbbbbbb-0000-0000-0000-000000000001', null)) x(u, r, e, c);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---------- sin rol: no ve nada ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
select pruebas.ok(pruebas.cuantas('select * from nucleo.empresas') = 0, 'sin rol no ve ninguna empresa');
select pruebas.ok(pruebas.cuantas('select * from nucleo.centros') = 0, 'sin rol no ve ninguna nave');
select pruebas.ok(pruebas.cuantas('select * from nucleo.personas') = 0, 'sin rol no ve ningún trabajador');

-- ---------- administrador de la empresa A ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pruebas.ok(pruebas.cuantas('select * from nucleo.empresas') = 1, 'admin A ve solo su empresa');
select pruebas.ok(pruebas.cuantas('select * from nucleo.centros') = 2, 'admin A ve sus 2 naves y ninguna de B');
select pruebas.ok(pruebas.cuantas('select * from nucleo.personas') = 3, 'admin A ve sus 3 trabajadores y ninguno de B');
insert into nucleo.almacenes (empresa_id, centro_id, codigo, nombre, tipo)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'n1a', 'Almacén N1A', 'produccion');
select pruebas.ok(true, 'admin A da de alta un almacén en su empresa');
select pruebas.falla($q$insert into nucleo.almacenes (empresa_id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001', 'x', 'X')$q$,
                     'admin A no puede crear nada en la empresa B');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre)
  values ('aaaaaaaa-0000-0000-0000-0000000000e0', 'aaaaaaaa-0000-0000-0000-000000000001', 'inyectora', 'Inyectora');
insert into nucleo.activos (empresa_id, tipo_id, centro_id, codigo)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e0', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'F25');
select pruebas.ok(true, 'admin A da de alta una máquina en su Nave 1 sin programar nada');
select pruebas.falla($q$insert into nucleo.activos (empresa_id, tipo_id, centro_id, codigo)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000e0', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'F99')$q$,
  'una máquina de A no puede ir en una nave de B');
select pruebas.falla($q$update nucleo.usuarios set superadmin = true where id = auth.uid()$q$, 'admin A no puede hacerse superadministrador');
select pruebas.falla($q$insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
  values (auth.uid(), (select id from nucleo.roles where codigo = 'tecnico_mant'), 'aaaaaaaa-0000-0000-0000-000000000001')$q$,
  'admin A no puede darse roles a sí mismo');
select pruebas.falla($q$update nucleo.usuarios set persona_id = 'bbbbbbbb-0000-0000-0000-0000000000f1' where id = auth.uid()$q$,
                     'admin A no puede enlazarse con un trabajador de la empresa B (para firmar por él)');
update nucleo.usuarios set persona_id = 'aaaaaaaa-0000-0000-0000-0000000000f3' where id = auth.uid();
select pruebas.ok(true, 'admin A sí puede enlazarse con un trabajador de su empresa');
select pruebas.ok(pruebas.cuantas($q$select * from nucleo.historial where tabla = 'almacenes' and usuario_id = auth.uid() and accion = 'crear'$q$) = 1,
                  'el alta del almacén queda en el historial con quién la hizo');
select pruebas.ok(pruebas.cuantas('select * from nucleo.empresas where id = ''bbbbbbbb-0000-0000-0000-000000000001''') = 0, 'admin A no ve la empresa B');

-- ---------- encargado de A, solo en la Nave 1 ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select pruebas.falla($q$insert into nucleo.almacenes (empresa_id, codigo, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'y', 'Y')$q$,
                     'un encargado no configura almacenes');
select pruebas.ok(pruebas.cuantas('select * from nucleo.personas') = 2, 'encargado de la Nave 1 ve los trabajadores de su nave y los sin nave, no los de la Nave 2');
select pruebas.ok(pruebas.cuantas('select * from nucleo.historial') = 0, 'un encargado no ve el historial del núcleo');
select pruebas.ok(nucleo.tiene_permiso('coladas.lote.ver', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'encargado ve Coladas en su nave');
select pruebas.ok(not nucleo.tiene_permiso('coladas.lote.ver', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2'), 'encargado no ve Coladas de la Nave 2');

-- ---------- solo almacén: no ve Coladas ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select pruebas.ok(not nucleo.tiene_permiso('coladas.lote.ver', 'aaaaaaaa-0000-0000-0000-000000000001'), 'quien solo tiene Almacén no tiene ningún permiso de Coladas');
select pruebas.ok(not nucleo.ve_modulo('coladas', 'aaaaaaaa-0000-0000-0000-000000000001'), 'y Coladas no le sale en el menú');
select pruebas.ok(nucleo.ve_modulo('almacen', 'aaaaaaaa-0000-0000-0000-000000000001'), 'Almacén sí le sale');
select pruebas.ok((nucleo.mi_sesion() -> 'empresas' -> 0 -> 'modulos') = '["almacen"]'::jsonb, 'su sesión trae solo el módulo Almacén');
select pruebas.ok(pruebas.cuantas('select * from nucleo.personas') = 0, 'sin permiso de personas no ve trabajadores');

-- ---------- operario de B ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select pruebas.ok(nucleo.tiene_permiso('limpieza.tarea.apuntar', 'bbbbbbbb-0000-0000-0000-000000000001'), 'operario de B apunta en Limpieza');
select pruebas.ok(not nucleo.tiene_permiso('coladas.consumo.apuntar', 'bbbbbbbb-0000-0000-0000-000000000001'), 'con Coladas apagado en B, ni el comodín da permiso');
select pruebas.ok(pruebas.cuantas('select * from nucleo.personas') = 1, 'el operario solo se ve a sí mismo');
insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, sha256_documento, firmado_por)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'personal', 'calendario', gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000f1', repeat('a', 64), auth.uid());
select pruebas.ok(true, 'el operario firma lo suyo');
select pruebas.falla($q$insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, sha256_documento, firmado_por)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'personal', 'calendario', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000f1', repeat('a', 64), auth.uid())$q$,
  'no puede firmar por otra persona');
select pruebas.ok(pruebas.cuantas('update nucleo.firmas set conforme = false returning 1') = 0, 'una firma no se puede cambiar (no hay regla que lo deje)');
select nucleo.anotar_error('prueba-1', 'Algo falló', null, null, null, '0.1', null);
select nucleo.anotar_error('prueba-1', 'Algo falló', null, null, null, '0.1', null);
select pruebas.ok(pruebas.cuantas('select * from nucleo.errores') = 0, 'el operario anota errores pero no los lee');

-- ---------- superadministrador ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true);
select pruebas.ok(pruebas.cuantas('select * from nucleo.empresas') = 2, 'el superadministrador ve las dos empresas');
select pruebas.ok((select veces from nucleo.errores where firma = 'prueba-1') = 2, 'el mismo error se agrupa y suma veces');

-- ---------- nada se puede borrar del historial ni de las firmas, ni siquiera desde el servidor ----------
reset role;
select pruebas.falla('delete from nucleo.historial', 'el historial no se borra');
select pruebas.falla('update nucleo.firmas set conforme = false', 'las firmas no se cambian ni desde el servidor');
rollback;
