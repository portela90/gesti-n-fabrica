-- La nave de cada trabajo, también adivinada del texto (0037). Unidades y máquinas inventadas.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('a0a0a0a0-0000-0000-0000-000000000001', 'unidad-n', 'Unidad N');
insert into nucleo.centros (id, empresa_id, codigo, nombre) values
  ('a0a0a0a0-0000-0000-0000-0000000000c1', 'a0a0a0a0-0000-0000-0000-000000000001', 'nave-1', 'Nave 1'),
  ('a0a0a0a0-0000-0000-0000-0000000000c2', 'a0a0a0a0-0000-0000-0000-000000000001', 'nave-2', 'Nave 2');
insert into nucleo.tipos_activo (id, empresa_id, codigo, nombre) values ('a0a0a0a0-0000-0000-0000-0000000000b1', 'a0a0a0a0-0000-0000-0000-000000000001', 'iny', 'Inyectora');
insert into nucleo.activos (id, empresa_id, codigo, tipo_id, centro_id) values
  ('a0a0a0a0-0000-0000-0000-0000000000a1', 'a0a0a0a0-0000-0000-0000-000000000001', 'F29', 'a0a0a0a0-0000-0000-0000-0000000000b1', 'a0a0a0a0-0000-0000-0000-0000000000c2'),
  ('a0a0a0a0-0000-0000-0000-0000000000a2', 'a0a0a0a0-0000-0000-0000-000000000001', 'F4', 'a0a0a0a0-0000-0000-0000-0000000000b1', 'a0a0a0a0-0000-0000-0000-0000000000c1');
insert into nucleo.ubicaciones (id, empresa_id, codigo, nombre, centro_id) values
  ('a0a0a0a0-0000-0000-0000-0000000000d1', 'a0a0a0a0-0000-0000-0000-000000000001', 'moriz', 'MORIZ', 'a0a0a0a0-0000-0000-0000-0000000000c1');

create temp table v (texto text, activo uuid, nave text);
insert into v values
  ('Lo que sea', 'a0a0a0a0-0000-0000-0000-0000000000a1', 'Nave 2'),            -- 1) su máquina
  ('Derrame de aceite F29', null, 'Nave 2'),                                    -- 2) una máquina en el texto
  ('Derrame en f29.', null, 'Nave 2'),                                          --    sin distinguir mayúsculas, con punto
  ('Derrame F290', null, null),                                                 --    F290 no es F29
  ('Suelo Brother y moriz', null, 'Nave 1'),                                    --    una zona en el texto
  ('Basuras Nave 2', null, 'Nave 2'),                                           -- 3) una nave en el texto
  ('Limpieza nave1', null, 'Nave 1'),                                           --    sin espacio
  ('Retirar basura de las naves 1 y 2', null, null),                            --    «naves 1 y 2»: no es «nave 1» suelta
  ('Pasillo Nave 1 y Nave 2', null, null),                                      --    las dos: sin nave
  ('F29 y F4', null, null),                                                     --    máquinas de naves distintas: sin nave
  ('Vaciar bandejas escoria', null, null),                                      --    nada
  ('', null, null);
select pruebas.ok(limpieza._nave_trabajo('a0a0a0a0-0000-0000-0000-000000000001', activo, null, texto) is not distinct from nave,
  format('«%s» → %s', texto, coalesce(nave, 'sin nave'))) from v;
rollback;
