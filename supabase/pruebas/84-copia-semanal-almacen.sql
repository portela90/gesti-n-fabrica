-- Copia semanal del Almacén (scripts/copia-semanal/almacen.sql): de public.docs (app vieja, inventada aquí) a almacen.*.
-- El stock de la nueva tiene que salir igual que el de la vieja; repetirla no duplica nada. Todo inventado.
begin;
create schema pruebas;
create function pruebas.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into nucleo.empresas (id, codigo, nombre) values ('c4c4c4c4-0000-0000-0000-000000000001', 'fabrica-prueba', 'Fábrica');
insert into nucleo.centros (empresa_id, codigo, nombre) values ('c4c4c4c4-0000-0000-0000-000000000001', 'nave', 'NAVE 1');

create table if not exists public.docs (col text, id text, data jsonb, primary key (col, id));
insert into public.docs values ('alm_cat', 'app', $j${
  "articulos": [
    {"id": "pist-80", "cod": "P-80", "desc": "Pistón Ø 80", "fam": "piston", "ud": "ud", "min": 2, "pp": 4, "prov": "taller-x", "almPpal": "gen",
     "iny": ["F1", "F2"], "porMaq": 1, "precio": "25.5", "pedido": "2026-11-09", "pedCant": 6, "diam": "80", "activo": true},
    {"id": "guante", "cod": null, "desc": "Guantes de nitrilo", "fam": "consumible", "ud": "ud", "min": 0, "pp": 0, "precio": 2.1, "activo": true},
    {"id": "aceite", "cod": "AC-1", "desc": "Aceite hidráulico", "fam": "consumible", "ud": "l", "min": 50, "pp": 0, "activo": false}
  ],
  "almacenes": [
    {"id": "gen", "nom": "Almacén general", "nave": null, "tipo": "central"},
    {"id": "n1", "nom": "Producción N1A", "nave": "Nave 1", "tipo": "produccion"},
    {"id": "n2", "nom": "Producción N2", "nave": "Nave 2", "tipo": "produccion"},
    {"id": "abc123xyz789", "nom": "Baldas de aceites", "nave": null, "tipo": null}
  ],
  "proveedores": [{"id": "taller-x", "nom": "Taller Inventado", "tel": "600000000", "plazo": 7}],
  "maquinas": [{"id": "F1", "cod": "F1", "nave": "Nave 1"}, {"id": "F2", "cod": "F2", "nave": "Nave 2", "notas": "de prueba"}],
  "operarios": [{"id": "op-0", "nom": null, "num": "37"}, {"id": "op-1", "nom": "Pepe Inventado", "num": "40"}],
  "gest": {"lista": [{"id": "gst1", "n": "Gestor Uno"}]},
  "dot": {"n1": {"pist-80": 2, "guante": 50}, "n2": {"pist-80": 0}}
}$j$);
insert into public.docs values ('alm_mov', '2026-10', $j${"items": [
  {"id": "m1", "f": "2026-10-01", "ts": 1790000000000, "tipo": "entrada", "alm": "gen", "art": "pist-80", "cant": 10, "prov": "taller-x", "alb": "A-1", "ped": "2026-09-28"},
  {"id": "m2", "f": "2026-10-02", "tipo": "entrada", "alm": "gen", "art": "guante", "cant": 200},
  {"id": "m3", "f": "2026-10-03", "tipo": "traslado", "alm": "gen", "dest": "n1", "art": "pist-80", "cant": 3},
  {"id": "m4", "f": "2026-10-04", "tipo": "salida", "alm": "n1", "art": "pist-80", "cant": 1, "maq": "F1", "nave": "Nave 1A", "resp": "KEPA", "gest": "gst1", "u": "Mañana"},
  {"id": "m5", "f": "2026-10-05", "tipo": "salida", "alm": "gen", "art": "guante", "cant": 20, "maqs": ["F1", "F2", "F99"], "nave": "Nave 2", "inc": "inc1", "motivo": "Rotura"}
]}$j$);
insert into public.docs values ('alm_mov', '2026-11', $j${"items": [
  {"id": "m6", "f": "2026-11-01", "tipo": "ajuste", "alm": "gen", "art": "guante", "cant": -5, "contado": 175, "teorico": 180, "motivo": "Recuento"},
  {"id": "m7", "f": "2026-11-02", "tipo": "salida", "alm": "gen", "art": "no-existe", "cant": 1}
]}$j$);

\ir ../../scripts/copia-semanal/almacen.sql

create temp table vieja_stock as
select i->>'art' art, l alm, sum(c) cant from public.docs d, jsonb_array_elements(d.data->'items') i,
  lateral (values (i->>'alm', case i->>'tipo' when 'salida' then -(i->>'cant')::numeric when 'traslado' then -(i->>'cant')::numeric else (i->>'cant')::numeric end),
                  (case when i->>'tipo' = 'traslado' then i->>'dest' end, (i->>'cant')::numeric)) x(l, c)
 where d.col = 'alm_mov' and l is not null and i->>'art' <> 'no-existe' group by 1, 2;
create temp table nueva_stock as
select a.vieja art, l.vieja alm, s.cantidad cant from almacen.stock s
  join almacen.equivalencias a on a.clase = 'articulo' and a.nueva = s.articulo_id
  join almacen.equivalencias l on l.clase = 'almacen' and l.nueva = s.almacen_id;

do $$
declare e uuid := 'c4c4c4c4-0000-0000-0000-000000000001';
begin
  perform pruebas.ok((select count(*) from nucleo.articulos where empresa_id = e) = 3, '3 artículos');
  perform pruebas.ok((select codigo from nucleo.articulos where empresa_id = e and nombre = 'Guantes de nitrilo') = 'guantes-de-nitrilo', 'sin código: uno legible');
  perform pruebas.ok((select baja is not null from nucleo.articulos where empresa_id = e and codigo = 'AC-1'), 'el inactivo, de baja');
  perform pruebas.ok((select count(*) from nucleo.almacenes where empresa_id = e) = 4, '4 almacenes');
  perform pruebas.ok((select tipo from nucleo.almacenes where empresa_id = e and codigo = 'n1') = 'produccion', 'producción');
  perform pruebas.ok((select codigo from nucleo.almacenes where empresa_id = e and nombre = 'Baldas de aceites') = 'baldas-de-aceites', 'id raro: código legible');
  perform pruebas.ok((select count(*) from nucleo.centros where empresa_id = e) = 2, 'se crea la Nave 2 y se usa la NAVE 1 que había');
  perform pruebas.ok((select c.nombre from nucleo.activos a join nucleo.centros c on c.id = a.centro_id where a.empresa_id = e and a.codigo = 'F2') = 'NAVE 2', 'máquina en su nave');
  perform pruebas.ok((select count(*) from almacen.dotacion where empresa_id = e) = 2, 'dotación (sin las de 0)');
  perform pruebas.ok((select f.punto_pedido = 4 and f.plazo_dias is null and cardinality(f.maquinas) = 2 and f.pedido_en = '2026-11-09' and f.atributos->>'diametro' = '80'
                        from almacen.fichas f join nucleo.articulos a on a.id = f.articulo_id where a.codigo = 'P-80'), 'ficha del pistón');
  perform pruebas.ok((select p.precio from almacen.precios p join nucleo.articulos a on a.id = p.articulo_id where a.codigo = 'P-80') = 25.5, 'precio en texto');
  perform pruebas.ok((select count(*) from nucleo.personas where empresa_id = e) = 3, '2 operarios y 1 gestor');
  perform pruebas.ok(exists (select 1 from nucleo.personas where empresa_id = e and nombre = 'Operario 37')
                     and exists (select 1 from nucleo.personas where empresa_id = e and nombre = 'Pepe Inventado (40)'), 'nombres de operarios');
  perform pruebas.ok((select count(*) from almacen.gestores where empresa_id = e) = 1, 'gestor de relevo');
  perform pruebas.ok((select count(*) from almacen.movimientos where empresa_id = e) = 6, '6 movimientos (el del artículo que no está, no)');
  perform pruebas.ok((select m.extra->>'se_lo_llevo' = 'KEPA' and m.extra->>'nave' = 'Nave 1A' and c.nombre = 'NAVE 1' and m.gestor_id is not null and cardinality(m.activos) = 1
                        from almacen.movimientos m join nucleo.centros c on c.id = m.centro_id where m.origen = 'colada-mapri:alm_mov:m4'), 'salida: quién como texto, nave, gestor, máquina');
  perform pruebas.ok((select perdida and cardinality(activos) = 2 from almacen.movimientos where origen = 'colada-mapri:alm_mov:m5'), 'pérdida y la máquina que no está, fuera');
  perform pruebas.ok((select proveedor_id is not null and albaran = 'A-1' and pedido_en = '2026-09-28' from almacen.movimientos where origen = 'colada-mapri:alm_mov:m1'), 'entrada con proveedor');
  perform pruebas.ok((select count(*) from vieja_stock v full join nueva_stock n using (art, alm) where v.cant is distinct from n.cant) = 0, 'stock igual que en la vieja');
  perform pruebas.ok((select cuantos from r_resumen where orden = 10) = 1, 'aviso del artículo que no está');
  perform pruebas.ok((select detalle from r_resumen where orden = 11) = 'F99', 'aviso de la máquina que no está');
end $$;

-- otra vez, con un cambio y un movimiento borrado en la vieja
update public.docs set data = jsonb_set(data, '{items}', (select jsonb_agg(case when i->>'id' = 'm2' then jsonb_set(i, '{cant}', '250') else i end)
                                                             from jsonb_array_elements(data->'items') i where i->>'id' <> 'm3'))
 where col = 'alm_mov' and id = '2026-10';
update nucleo.personas set nombre = 'Ana Inventada' where nombre = 'Operario 37';
\ir ../../scripts/copia-semanal/almacen.sql
do $$
declare e uuid := 'c4c4c4c4-0000-0000-0000-000000000001';
begin
  perform pruebas.ok((select count(*) from nucleo.articulos where empresa_id = e) = 3, 'repetir: no duplica artículos');
  perform pruebas.ok((select count(*) from nucleo.personas where empresa_id = e) = 3 and exists (select 1 from nucleo.personas where nombre = 'Ana Inventada'),
                     'repetir: las fichas de trabajador no se tocan');
  perform pruebas.ok((select count(*) from almacen.movimientos where empresa_id = e) = 5, 'repetir: el borrado en la vieja se quita');
  perform pruebas.ok((select cantidad from almacen.movimientos where origen = 'colada-mapri:alm_mov:m2') = 250, 'repetir: el cambiado se cambia');
  perform pruebas.ok((select cuantos from r_resumen where orden = 5) = 1 and (select cuantos from r_resumen where que = 'Movimientos cambiados') = 1, 'resumen de la repetición');
end $$;
rollback;
