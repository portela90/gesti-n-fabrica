-- Prevención: entregas de EPI (documentos que firma cada trabajador) y tallas que propone el trabajador.
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
  ('55555555-0000-0000-0000-000000000001', 'unidad-e', 'Unidad E'), ('66666666-0000-0000-0000-000000000001', 'unidad-f', 'Unidad F');
insert into nucleo.empresa_modulos (empresa_id, modulo) values ('55555555-0000-0000-0000-000000000001', 'prevencion'), ('66666666-0000-0000-0000-000000000001', 'prevencion');
insert into nucleo.personas (id, empresa_id, nombre, categoria) values
  ('55555555-0000-0000-0000-0000000000f1', '55555555-0000-0000-0000-000000000001', 'Ana Prueba', 'Peón'),
  ('55555555-0000-0000-0000-0000000000f2', '55555555-0000-0000-0000-000000000001', 'Bruno Prueba', 'Peón'),
  ('66666666-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-000000000001', 'Quique Otra', 'Peón');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000005a1'), ('00000000-0000-0000-0000-0000000005f1'),
  ('00000000-0000-0000-0000-0000000005f2'), ('00000000-0000-0000-0000-0000000005e1'), ('00000000-0000-0000-0000-0000000006a1');
insert into nucleo.usuarios (id, nombre, persona_id) values
  ('00000000-0000-0000-0000-0000000005a1', 'Jefe E', null), ('00000000-0000-0000-0000-0000000005f1', 'Ana', '55555555-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000005f2', 'Bruno', '55555555-0000-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-0000000005e1', 'Encargado E', null),
  ('00000000-0000-0000-0000-0000000006a1', 'Jefe F', null);
insert into nucleo.asignaciones (usuario_id, rol_id, empresa_id)
select u::uuid, (select id from nucleo.roles where codigo = r and empresa_id is null), e::uuid from (values
  ('00000000-0000-0000-0000-0000000005a1', 'admin_empresa', '55555555-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000005f1', 'operario',      '55555555-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000005f2', 'operario',      '55555555-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000005e1', 'encargado',     '55555555-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000006a1', 'admin_empresa', '66666666-0000-0000-0000-000000000001')) x(u, r, e);
insert into prevencion.prendas (empresa_id, codigo, nombre) values
  ('55555555-0000-0000-0000-000000000001', 'pantalon', 'Pantalón'), ('55555555-0000-0000-0000-000000000001', 'bota', 'Botas');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
set role authenticated;

-- ---------- el encargado hace una entrega de EPI a Ana y a Bruno ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);
insert into prevencion.documentos (empresa_id, tipo, persona_id, fecha, datos, nombre) values
  ('55555555-0000-0000-0000-000000000001', 'epi', '55555555-0000-0000-0000-0000000000f1', '2031-03-02', '{"items":{"bota":{"u":"1","cat":["Agua"],"motivo":"Primera entrega"}},"lugar":"Planta E"}', 'Nombre inventado'),
  ('55555555-0000-0000-0000-000000000001', 'epi', '55555555-0000-0000-0000-0000000000f2', '2031-03-02', '{"items":{"bota":{"u":"1"}}}', null);
insert into ids select 'ana', id from prevencion.documentos where persona_id = '55555555-0000-0000-0000-0000000000f1';
insert into ids select 'bruno', id from prevencion.documentos where persona_id = '55555555-0000-0000-0000-0000000000f2';
select pruebas.ok((select nombre from prevencion.documentos where id = (select v from ids where k = 'ana')) = 'Ana Prueba', 'el nombre sale de la persona (no del que lo escribe)');
select pruebas.falla($q$insert into prevencion.documentos (empresa_id, tipo, persona_id) values ('55555555-0000-0000-0000-000000000001', 'epi', '66666666-0000-0000-0000-0000000000f1')$q$, 'no se hace a un trabajador de otra unidad');
select pruebas.falla($q$insert into prevencion.documentos (empresa_id, tipo) values ('55555555-0000-0000-0000-000000000001', 'epi')$q$, 'una entrega de EPI es para un trabajador');
select pruebas.falla($q$update prevencion.documentos set firmado_en = now() where id = (select v from ids where k = 'ana')$q$, 'la firma no se pone a mano');

-- ---------- Ana: no ve lo que no se le ha enviado ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005f1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.documentos') = 0, 'la trabajadora no ve la entrega hasta que se le envía');
select pruebas.falla($q$select prevencion.firmar_documento((select v from ids where k = 'ana'), 'data:image/png;base64,AAAA')$q$, 'ni la puede firmar');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);
select pruebas.ok(prevencion.enviar_documentos(array[(select v from ids where k = 'ana'), (select v from ids where k = 'bruno')]) = 2, 'el encargado las envía: faltan 2');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005f1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.documentos') = 1, 'enviada: Ana ve la suya y solo la suya');
select pruebas.falla($q$select prevencion.firmar_documento((select v from ids where k = 'bruno'), 'data:image/png;base64,AAAA')$q$, 'Ana no firma la de Bruno');
select pruebas.falla($q$select prevencion.firmar_documento((select v from ids where k = 'ana'), 'no es una imagen')$q$, 'sin firma no vale');
select prevencion.firmar_documento((select v from ids where k = 'ana'), 'data:image/png;base64,AAAA', '{"agente":"prueba"}');
select pruebas.ok((select firmado_en is not null and firma_id is not null from prevencion.documentos), 'Ana firma la suya');
select pruebas.falla($q$select prevencion.firmar_documento((select v from ids where k = 'ana'), 'data:image/png;base64,AAAA')$q$, 'no se firma dos veces');
reset role;
select pruebas.ok((select f.sha256_documento = prevencion.huella_documento(d.id) and f.documento = 'epi' from prevencion.documentos d join nucleo.firmas f on f.id = d.firma_id
  where d.id = (select v from ids where k = 'ana')), 'la firma guarda la huella de lo que se firmó');
set role authenticated;

-- ---------- el encargado recoge la firma de Bruno en su móvil ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);
select prevencion.firmar_documento((select v from ids where k = 'bruno'), 'data:image/png;base64,BBBB');
select pruebas.ok(pruebas.cuantas('select * from prevencion.documentos where firma_id is not null') = 2, 'el encargado recoge la firma de Bruno');

-- ---------- firmado: no cambia, no se borra; solo se anula ----------
select pruebas.falla($q$update prevencion.documentos set datos = '{"items":{}}' where id = (select v from ids where k = 'ana')$q$, 'firmada: no se cambia');
select pruebas.falla($q$delete from prevencion.documentos where id = (select v from ids where k = 'ana')$q$, 'firmada: no se borra');
select pruebas.falla($q$select prevencion.anular_documento((select v from ids where k = 'ana'))$q$, 'el encargado no anula');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true);
select prevencion.anular_documento((select v from ids where k = 'bruno'));
select pruebas.ok((select anulado is not null and firma_id is not null from prevencion.documentos where id = (select v from ids where k = 'bruno')), 'el jefe anula la de Bruno y la firma queda');
select pruebas.falla($q$select prevencion.anular_documento((select v from ids where k = 'bruno'))$q$, 'no se anula dos veces');
reset role;
select pruebas.falla($q$delete from prevencion.documentos where id = (select v from ids where k = 'ana')$q$, 'firmada: no se borra ni desde el servidor');
set role authenticated;

-- ---------- sin firmar: se cambia y se borra ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);
insert into prevencion.documentos (empresa_id, tipo, persona_id, datos) values ('55555555-0000-0000-0000-000000000001', 'epi', '55555555-0000-0000-0000-0000000000f1', '{"items":{"gafas":{"u":"1"}}}');
update prevencion.documentos set datos = '{"items":{"gafas":{"u":"2"}}}' where firma_id is null;
select pruebas.ok((select datos->'items'->'gafas'->>'u' from prevencion.documentos where firma_id is null) = '2', 'sin firmar: se cambia');
select pruebas.falla($q$update prevencion.documentos set persona_id = '55555555-0000-0000-0000-0000000000f2' where firma_id is null$q$, 'pero no se cambia de trabajador');
delete from prevencion.documentos where firma_id is null;
select pruebas.ok(pruebas.cuantas('select * from prevencion.documentos') = 2, 'sin firmar: se borra');

-- ---------- la trabajadora no hace entregas; otra unidad no ve nada ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005f1', true);
select pruebas.falla($q$insert into prevencion.documentos (empresa_id, tipo, persona_id) values ('55555555-0000-0000-0000-000000000001', 'epi', '55555555-0000-0000-0000-0000000000f1')$q$, 'la trabajadora no hace entregas');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006a1', true);
select pruebas.ok(pruebas.cuantas('select * from prevencion.documentos') = 0, 'el jefe de otra unidad no ve nada');
select pruebas.falla($q$select prevencion.enviar_documentos(array[(select v from ids where k = 'ana')])$q$, 'ni envía');

-- ---------- tallas que propone la trabajadora ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005f1', true);
select prevencion.proponer_tallas('{"pantalon":"M","bota":" 41 ","gorra":"L","vacia":""}');
select pruebas.ok((select tallas_propuestas = '{"pantalon":"M","bota":"41"}'::jsonb and tallas = '{}'::jsonb from prevencion.fichas), 'Ana propone sus tallas (solo prendas que existen) y su ficha aún no cambia');
update prevencion.fichas set tallas = '{"bota":"40"}';
select pruebas.ok((select tallas = '{}'::jsonb from prevencion.fichas), 'ella no se cambia las tallas directamente');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true);
update prevencion.fichas set tallas = tallas || tallas_propuestas, tallas_propuestas = null, tallas_propuestas_en = null where persona_id = '55555555-0000-0000-0000-0000000000f1';
select pruebas.ok((select tallas->>'bota' from prevencion.fichas) = '41', 'el jefe las acepta');

-- ---------- historial ----------
select pruebas.ok(pruebas.cuantas($q$select * from nucleo.historial where modulo = 'prevencion' and tabla = 'documentos'$q$) >= 3, 'las entregas quedan en el historial');
rollback;
