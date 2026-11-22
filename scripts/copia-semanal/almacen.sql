-- Copia del Almacén de la app vieja a la nueva (Fase 3, trozo 1; decidido por Cristian el 22/11). SIN DATOS: lee la vieja
-- (public.docs, colecciones alm_cat y alm_mov, en este mismo Supabase) y escribe en nucleo.* y almacen.*. No toca la vieja.
-- Se puede repetir (cada semana y el día del cambio): lo ya copiado se reconoce por almacen.equivalencias y movimientos.origen.
-- Reglas:
--  · La vieja manda en artículos, fichas, precios, dotación, proveedores, almacenes y máquinas (en paralelo solo se apunta en la vieja).
--  · Las fichas de trabajador (operarios y gestores) se crean una vez y no se vuelven a tocar (así se les puede poner el nombre en la nueva).
--  · «Quién se lo lleva» de los movimientos viejos se guarda como texto (extra.se_lo_llevo). Lo que no tiene columna, en extra.
--  · Nave 1A y Nave 1B son la Nave 1 (la de la vieja queda en extra.nave). Todo o nada. Resumen al final.

drop table if exists r_resumen; create temp table r_resumen (orden int, que text, cuantos bigint, detalle text);

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Fábrica');
  c jsonb := (select data from public.docs where col = 'alm_cat' and id = 'app');
  v_n1 uuid; v_n2 uuid; v_tipo uuid;
  n bigint;
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Fábrica'; end if;
  if c is null then raise exception 'No encuentro el catálogo del almacén viejo (public.docs alm_cat/app)'; end if;

  -- ---------- naves ----------
  select id into v_n1 from nucleo.centros where empresa_id = v_emp and baja is null and lower(replace(nombre, ' ', '')) = 'nave1' order by creado limit 1;
  if v_n1 is null then insert into nucleo.centros (empresa_id, codigo, nombre, orden) values (v_emp, 'nave-1', 'NAVE 1', 1) returning id into v_n1; end if;
  select id into v_n2 from nucleo.centros where empresa_id = v_emp and baja is null and lower(replace(nombre, ' ', '')) = 'nave2' order by creado limit 1;
  if v_n2 is null then insert into nucleo.centros (empresa_id, codigo, nombre, orden) values (v_emp, 'nave-2', 'NAVE 2', 2) returning id into v_n2; end if;
  drop table if exists r_nave; create temp table r_nave (vieja text primary key, id uuid) on commit drop;
  insert into r_nave values ('nave 1', v_n1), ('nave 1a', v_n1), ('nave 1b', v_n1), ('nave 2', v_n2);

  -- ---------- máquinas ----------
  select id into v_tipo from nucleo.tipos_activo where empresa_id = v_emp and codigo = 'inyectora';
  if v_tipo is null then insert into nucleo.tipos_activo (empresa_id, codigo, nombre) values (v_emp, 'inyectora', 'Inyectora') returning id into v_tipo; end if;
  insert into nucleo.activos (empresa_id, tipo_id, centro_id, codigo, atributos)
  select v_emp, v_tipo, (select id from r_nave where vieja = lower(m->>'nave')), m->>'cod',
         jsonb_strip_nulls(jsonb_build_object('ficha', m->'ficha', 'tags', m->'tags', 'notas', m->>'notas', 'horno_fab', m->>'hornoFab', 'horno_placa', m->'hornoPlaca', 'docs', m->'docs'))
    from jsonb_array_elements(c->'maquinas') m
   where coalesce(m->>'cod', '') <> '' and not exists (select 1 from nucleo.activos a where a.empresa_id = v_emp and a.codigo = m->>'cod');
  get diagnostics n = row_count; insert into r_resumen values (1, 'Máquinas nuevas', n, null);
  update nucleo.activos a set centro_id = coalesce((select id from r_nave where vieja = lower(m->>'nave')), a.centro_id)
    from jsonb_array_elements(c->'maquinas') m where a.empresa_id = v_emp and a.codigo = m->>'cod' and a.centro_id is distinct from (select id from r_nave where vieja = lower(m->>'nave'));
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'maquina', m->>'id', a.id from jsonb_array_elements(c->'maquinas') m join nucleo.activos a on a.empresa_id = v_emp and a.codigo = m->>'cod'
  on conflict (empresa_id, clase, vieja) do update set nueva = excluded.nueva;

  -- ---------- familias ----------
  insert into nucleo.familias (empresa_id, codigo, nombre, modulo, orden)
  select v_emp, f, case f when 'piston' then 'Pistones' when 'barra' then 'Barras expulsoras y tornillos' when 'consumible' then 'Consumibles'
                          when 'horno' then 'Recambios de horno' else initcap(f) end, 'almacen', row_number() over (order by f)
    from (select distinct a->>'fam' f from jsonb_array_elements(c->'articulos') a where coalesce(a->>'fam', '') <> '') x
   where not exists (select 1 from nucleo.familias y where y.empresa_id = v_emp and y.codigo = x.f);
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'familia', codigo, id from nucleo.familias where empresa_id = v_emp on conflict (empresa_id, clase, vieja) do update set nueva = excluded.nueva;

  -- ---------- proveedores ----------
  drop table if exists r_prov; create temp table r_prov on commit drop as
  select p->>'id' vieja, p->>'nom' nombre,
         jsonb_strip_nulls(jsonb_build_object('cif', p->>'cif', 'direccion', p->>'dir', 'telefono', p->>'tel', 'email', p->>'email', 'whatsapp', p->>'wa',
           'persona', p->>'contacto', 'codigo_cliente', p->>'codCli', 'plazo_dias', p->>'plazo', 'pedido_minimo', p->>'pedMin', 'suministra', p->>'sum',
           'notas', p->>'notas', 'albaran_pista', p->>'albPista', 'albaran_lee', p->'albLee')) contacto,
         left(trim(both '-' from regexp_replace(lower(translate(coalesce(p->>'nom', p->>'id'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g')), 30) slug
    from jsonb_array_elements(c->'proveedores') p;
  update nucleo.proveedores x set nombre = r.nombre, contacto = r.contacto
    from r_prov r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'proveedor' and e.vieja = r.vieja
   where x.id = e.nueva and (x.nombre, x.contacto) is distinct from (r.nombre, r.contacto);
  insert into nucleo.proveedores (empresa_id, codigo, nombre, contacto)
  select v_emp, r.slug || case when exists (select 1 from nucleo.proveedores y where y.empresa_id = v_emp and y.codigo = r.slug) then '-' || left(md5(r.vieja), 4) else '' end,
         coalesce(r.nombre, r.vieja), r.contacto
    from r_prov r where not exists (select 1 from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'proveedor' and e.vieja = r.vieja);
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'proveedor', r.vieja, y.id from r_prov r join nucleo.proveedores y on y.empresa_id = v_emp and y.nombre = coalesce(r.nombre, r.vieja)
   where not exists (select 1 from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'proveedor' and e.vieja = r.vieja)
  on conflict do nothing;

  -- ---------- almacenes ----------
  insert into nucleo.almacenes (empresa_id, centro_id, codigo, nombre, tipo, orden)
  select v_emp, (select id from r_nave where vieja = lower(a->>'nave')),
         case when a->>'id' ~ '^[a-z0-9]{1,6}$' then a->>'id'
              else left(trim(both '-' from regexp_replace(lower(translate(a->>'nom', 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g')), 30) end,
         a->>'nom', case a->>'tipo' when 'produccion' then 'produccion' else 'general' end, o
    from jsonb_array_elements(c->'almacenes') with ordinality x(a, o)
   where not exists (select 1 from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'almacen' and e.vieja = a->>'id');
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'almacen', a->>'id', y.id from jsonb_array_elements(c->'almacenes') a join nucleo.almacenes y on y.empresa_id = v_emp and y.nombre = a->>'nom'
  on conflict do nothing;
  update nucleo.almacenes y set nombre = a->>'nom', centro_id = (select id from r_nave where vieja = lower(a->>'nave'))
    from jsonb_array_elements(c->'almacenes') a join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'almacen' and e.vieja = a->>'id'
   where y.id = e.nueva and (y.nombre, y.centro_id) is distinct from (a->>'nom', (select id from r_nave where vieja = lower(a->>'nave')));

  -- ---------- artículos ----------
  drop table if exists r_art; create temp table r_art on commit drop as
  select a->>'id' vieja, a, coalesce(nullif(trim(a->>'cod'), ''),
           left(trim(both '-' from regexp_replace(lower(translate(coalesce(a->>'desc', a->>'id'), 'ÁÉÍÓÚÜÑØáéíóúüñø', 'AEIOUUNOaeiouuno')), '[^a-z0-9]+', '-', 'g')), 40)) codigo
    from jsonb_array_elements(c->'articulos') a;
  insert into nucleo.articulos (empresa_id, familia_id, codigo, nombre, unidad, minimo)
  select v_emp, (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'familia' and e.vieja = r.a->>'fam'),
         r.codigo || case when exists (select 1 from nucleo.articulos y where y.empresa_id = v_emp and y.codigo = r.codigo) then '-' || left(md5(r.vieja), 4) else '' end,
         coalesce(nullif(trim(r.a->>'desc'), ''), r.vieja), coalesce(nullif(r.a->>'ud', ''), 'ud'), nullif((r.a->>'min')::numeric, 0)
    from r_art r where not exists (select 1 from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'articulo' and e.vieja = r.vieja)
   order by r.vieja;
  get diagnostics n = row_count; insert into r_resumen values (2, 'Artículos nuevos', n, null);
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'articulo', r.vieja, y.id from r_art r
    join nucleo.articulos y on y.empresa_id = v_emp and y.nombre = coalesce(nullif(trim(r.a->>'desc'), ''), r.vieja)
                           and (y.codigo = r.codigo or y.codigo = r.codigo || '-' || left(md5(r.vieja), 4))
  on conflict do nothing;
  update nucleo.articulos y set nombre = coalesce(nullif(trim(r.a->>'desc'), ''), r.vieja), unidad = coalesce(nullif(r.a->>'ud', ''), 'ud'),
         minimo = nullif((r.a->>'min')::numeric, 0),
         familia_id = (select nueva from almacen.equivalencias f where f.empresa_id = v_emp and f.clase = 'familia' and f.vieja = r.a->>'fam'),
         baja = case when (r.a->>'activo')::boolean is false then coalesce(y.baja, now()) end
    from r_art r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'articulo' and e.vieja = r.vieja
   where y.id = e.nueva;

  insert into almacen.fichas (articulo_id, empresa_id, proveedor_id, ref_proveedor, plazo_dias, punto_pedido, almacen_principal_id, ubicacion, notas,
                              pedido_en, pedido_cantidad, envase, maquinas, por_maquina, atributos, origen, actualizado)
  select e.nueva, v_emp,
         (select nueva from almacen.equivalencias p where p.empresa_id = v_emp and p.clase = 'proveedor' and p.vieja = r.a->>'prov'),
         nullif(coalesce(r.a->>'refProv', r.a->>'codProv'), ''), nullif(r.a->>'plazo', '')::numeric::int, nullif((r.a->>'pp')::numeric, 0),
         (select nueva from almacen.equivalencias l where l.empresa_id = v_emp and l.clase = 'almacen' and l.vieja = r.a->>'almPpal'),
         nullif(r.a->>'ubic', ''), nullif(r.a->>'notas', ''),
         case when r.a->>'pedido' ~ '^\d{4}-\d{2}-\d{2}' then left(r.a->>'pedido', 10)::date end, nullif(r.a->>'pedCant', '')::numeric,
         nullif(r.a->>'envase', ''),
         array(select x.id from jsonb_array_elements_text(case when jsonb_typeof(r.a->'iny') = 'array' then r.a->'iny' else '[]' end) i
                 join nucleo.activos x on x.empresa_id = v_emp and x.codigo = i),
         nullif(r.a->>'porMaq', '')::numeric,
         jsonb_strip_nulls(jsonb_build_object('diametro', r.a->>'diam', 'medidas', r.a->'medidas', 'peso', r.a->'peso', 'tipo_inyectora', r.a->>'tipoIny',
           'grupo', r.a->>'grupo', 'informar', r.a->>'inf', 'geometria', r.a->'geo', 'revisiones', r.a->'revs', 'plano', r.a->'plano',
           'almacenes', r.a->'alms', 'limpieza', r.a->'limp', 'prevista', r.a->>'prevista', 'pp_auto', r.a->'ppAuto')),
         'colada-mapri:alm_cat:' || r.vieja, now()
    from r_art r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'articulo' and e.vieja = r.vieja
  on conflict (articulo_id) do update set proveedor_id = excluded.proveedor_id, ref_proveedor = excluded.ref_proveedor, plazo_dias = excluded.plazo_dias,
    punto_pedido = excluded.punto_pedido, almacen_principal_id = excluded.almacen_principal_id, ubicacion = excluded.ubicacion, notas = excluded.notas,
    pedido_en = excluded.pedido_en, pedido_cantidad = excluded.pedido_cantidad, envase = excluded.envase, maquinas = excluded.maquinas,
    por_maquina = excluded.por_maquina, atributos = excluded.atributos, actualizado = now()
    where (almacen.fichas.proveedor_id, almacen.fichas.ref_proveedor, almacen.fichas.plazo_dias, almacen.fichas.punto_pedido, almacen.fichas.almacen_principal_id,
           almacen.fichas.ubicacion, almacen.fichas.notas, almacen.fichas.pedido_en, almacen.fichas.pedido_cantidad, almacen.fichas.envase,
           almacen.fichas.maquinas, almacen.fichas.por_maquina, almacen.fichas.atributos)
       is distinct from (excluded.proveedor_id, excluded.ref_proveedor, excluded.plazo_dias, excluded.punto_pedido, excluded.almacen_principal_id,
           excluded.ubicacion, excluded.notas, excluded.pedido_en, excluded.pedido_cantidad, excluded.envase, excluded.maquinas, excluded.por_maquina, excluded.atributos);

  insert into almacen.precios (articulo_id, empresa_id, precio, precio_recuperado, historial)
  select e.nueva, v_emp, nullif(r.a->>'precio', '')::numeric, nullif(r.a->>'precioRec', '')::numeric,
         case when jsonb_typeof(r.a->'ph') = 'array' then r.a->'ph' else '[]' end
    from r_art r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'articulo' and e.vieja = r.vieja
   where nullif(r.a->>'precio', '') is not null or nullif(r.a->>'precioRec', '') is not null
  on conflict (articulo_id) do update set precio = excluded.precio, precio_recuperado = excluded.precio_recuperado, historial = excluded.historial, actualizado = now()
    where (almacen.precios.precio, almacen.precios.precio_recuperado, almacen.precios.historial) is distinct from (excluded.precio, excluded.precio_recuperado, excluded.historial);

  -- ---------- dotación (la vieja manda: se rehace) ----------
  delete from almacen.dotacion where empresa_id = v_emp;
  insert into almacen.dotacion (empresa_id, almacen_id, articulo_id, cantidad)
  select v_emp, l.nueva, ar.nueva, q.value::numeric
    from jsonb_each(coalesce(c->'dot', '{}')) d cross join lateral jsonb_each_text(d.value) q
    join almacen.equivalencias ar on ar.empresa_id = v_emp and ar.clase = 'articulo' and ar.vieja = q.key
    join almacen.equivalencias l on l.empresa_id = v_emp and l.clase = 'almacen' and l.vieja = d.key
   where q.value::numeric > 0;

  -- ---------- operarios y gestores (fichas de la Fábrica; se crean una vez y no se tocan) ----------
  drop table if exists r_per; create temp table r_per on commit drop as
  select 'op:' || (o->>'id') vieja, coalesce(nullif(trim(o->>'nom'), '') || coalesce(' (' || nullif(trim(o->>'num'), '') || ')', ''), 'Operario ' || coalesce(o->>'num', o->>'id')) nombre, 'Operario' categoria, false gestor
    from jsonb_array_elements(coalesce(c->'operarios', '[]')) o
  union all
  select 'gst:' || (g->>'id'), coalesce(nullif(trim(g->>'n'), ''), g->>'id'), 'Gestor de relevo', true
    from jsonb_array_elements(coalesce(c->'gest'->'lista', '[]')) g;
  insert into almacen.equivalencias (empresa_id, clase, vieja, nueva)
  select v_emp, 'persona', r.vieja, gen_random_uuid() from r_per r
   where not exists (select 1 from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'persona' and e.vieja = r.vieja);
  insert into nucleo.personas (id, empresa_id, nombre, categoria)
  select e.nueva, v_emp, r.nombre, r.categoria from r_per r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'persona' and e.vieja = r.vieja
   where not exists (select 1 from nucleo.personas p where p.id = e.nueva);
  get diagnostics n = row_count; insert into r_resumen values (3, 'Fichas de trabajador nuevas (operarios y gestores)', n, null);
  insert into almacen.gestores (persona_id, empresa_id)
  select e.nueva, v_emp from r_per r join almacen.equivalencias e on e.empresa_id = v_emp and e.clase = 'persona' and e.vieja = r.vieja
   where r.gestor on conflict do nothing;

  -- ---------- movimientos ----------
  drop table if exists r_mov; create temp table r_mov on commit drop as
  select i->>'id' vieja, i,
         (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'articulo' and e.vieja = i->>'art') articulo,
         (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'almacen' and e.vieja = i->>'alm') almacen,
         (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'almacen' and e.vieja = i->>'dest') destino
    from public.docs d, jsonb_array_elements(d.data->'items') i
   where d.col = 'alm_mov' and jsonb_typeof(d.data->'items') = 'array';
  insert into r_resumen select 10, 'Aviso: movimientos con un artículo o almacén que no está (no se copian)', count(*), string_agg(distinct coalesce(i->>'art', '?'), ', ')
    from r_mov where articulo is null or almacen is null or (i->>'tipo' = 'traslado' and destino is null);

  with q as (
    insert into almacen.movimientos (empresa_id, fecha, tipo, articulo_id, almacen_id, destino_id, cantidad, contado, teorico, centro_id, activos, gestor_id,
                                     proveedor_id, albaran, pedido_en, motivo, perdida, nota, origen, extra, creado, creado_por)
    select v_emp, (r.i->>'f')::date, r.i->>'tipo', r.articulo, r.almacen, case when r.i->>'tipo' = 'traslado' then r.destino end,
           coalesce((r.i->>'cant')::numeric, 0), nullif(r.i->>'contado', '')::numeric, nullif(r.i->>'teorico', '')::numeric,
           case when r.i->>'tipo' = 'salida' then (select id from r_nave where vieja = lower(r.i->>'nave')) end,
           case when r.i->>'tipo' = 'salida' then array(select x.id from jsonb_array_elements_text(
             case when jsonb_typeof(r.i->'maqs') = 'array' then r.i->'maqs' when coalesce(r.i->>'maq', '') <> '' then jsonb_build_array(r.i->>'maq') else '[]' end) m
             join nucleo.activos x on x.empresa_id = v_emp and x.codigo = m) else '{}' end,
           case when r.i->>'tipo' = 'salida' then (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'persona' and e.vieja = 'gst:' || (r.i->>'gest')) end,
           case when r.i->>'tipo' = 'entrada' then (select nueva from almacen.equivalencias e where e.empresa_id = v_emp and e.clase = 'proveedor' and e.vieja = r.i->>'prov') end,
           case when r.i->>'tipo' = 'entrada' then nullif(left(r.i->>'alb', 80), '') end,
           case when r.i->>'tipo' = 'entrada' and r.i->>'ped' ~ '^\d{4}-\d{2}-\d{2}' then left(r.i->>'ped', 10)::date end,
           nullif(left(r.i->>'motivo', 200), ''), r.i->>'tipo' = 'salida' and coalesce(r.i->>'inc', '') <> '', nullif(left(r.i->>'nota', 1000), ''),
           'colada-mapri:alm_mov:' || r.vieja,
           jsonb_strip_nulls(jsonb_build_object('se_lo_llevo', r.i->>'resp', 'apuntado_por', r.i->>'por', 'nave', r.i->>'nave', 'maquinas', r.i->'maqs',
             'maquina', r.i->>'maq', 'foto', r.i->'foto', 'revisado', r.i->'rev', 'motivo_original', r.i->>'motOrig', 'incidencia', r.i->>'inc',
             'recuperado', r.i->'rec', 'unidad', r.i->>'u')),
           coalesce(to_timestamp((r.i->>'ts')::numeric / 1000), (r.i->>'f')::date), null
      from r_mov r where r.articulo is not null and r.almacen is not null and (r.i->>'tipo' <> 'traslado' or r.destino is not null)
    on conflict (origen) where origen is not null do update set fecha = excluded.fecha, tipo = excluded.tipo, articulo_id = excluded.articulo_id,
      almacen_id = excluded.almacen_id, destino_id = excluded.destino_id, cantidad = excluded.cantidad, contado = excluded.contado, teorico = excluded.teorico,
      centro_id = excluded.centro_id, activos = excluded.activos, gestor_id = excluded.gestor_id, proveedor_id = excluded.proveedor_id, albaran = excluded.albaran,
      pedido_en = excluded.pedido_en, motivo = excluded.motivo, perdida = excluded.perdida, nota = excluded.nota, extra = excluded.extra
      where (almacen.movimientos.fecha, almacen.movimientos.tipo, almacen.movimientos.articulo_id, almacen.movimientos.almacen_id, almacen.movimientos.destino_id,
             almacen.movimientos.cantidad, almacen.movimientos.contado, almacen.movimientos.teorico, almacen.movimientos.centro_id, almacen.movimientos.activos,
             almacen.movimientos.gestor_id, almacen.movimientos.proveedor_id, almacen.movimientos.albaran, almacen.movimientos.pedido_en, almacen.movimientos.motivo,
             almacen.movimientos.perdida, almacen.movimientos.nota, almacen.movimientos.extra)
         is distinct from (excluded.fecha, excluded.tipo, excluded.articulo_id, excluded.almacen_id, excluded.destino_id, excluded.cantidad, excluded.contado,
             excluded.teorico, excluded.centro_id, excluded.activos, excluded.gestor_id, excluded.proveedor_id, excluded.albaran, excluded.pedido_en, excluded.motivo,
             excluded.perdida, excluded.nota, excluded.extra)
    returning (xmax = 0) nuevo)
  insert into r_resumen select 4, case when nuevo then 'Movimientos nuevos' else 'Movimientos cambiados' end, count(*), null from q group by nuevo;
  with q as (delete from almacen.movimientos m where m.empresa_id = v_emp and m.origen like 'colada-mapri:alm_mov:%'
               and not exists (select 1 from r_mov r where 'colada-mapri:alm_mov:' || r.vieja = m.origen) returning 1)
  insert into r_resumen select 5, 'Movimientos quitados (borrados en la vieja)', count(*), null from q;
  insert into r_resumen select 11, 'Aviso: máquinas de los movimientos que no están en la nueva (el movimiento se copia sin esa máquina)', count(distinct m), string_agg(distinct m, ', ')
    from r_mov r, jsonb_array_elements_text(case when jsonb_typeof(r.i->'maqs') = 'array' then r.i->'maqs' when coalesce(r.i->>'maq', '') <> '' then jsonb_build_array(r.i->>'maq') else '[]' end) m
   where not exists (select 1 from nucleo.activos x where x.empresa_id = v_emp and x.codigo = m);
end $$;

select que as "Qué", cuantos as "Cuántos", coalesce(detalle, '') as "Detalle" from r_resumen where cuantos > 0 order by orden;
