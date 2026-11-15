-- =====================================================================================
-- 0023 · PREVENCIÓN · STOCK DE ROPA Y EPI
-- Pedido por Cristian (15/11): tiene un pequeño stock de ropa y EPI para los que entran nuevos o a quien se le rompe
-- algo. Al hacer una entrega de EPI se descuenta solo, por talla; cuando llega un pedido se suma; y se imprime la
-- hoja de lo que hay y lo que hay que pedir para llegar al mínimo. Sin contar a mano.
--  · material: lo que se tiene en el almacén, con sus tallas y el mínimo de cada talla. Se reconoce en la entrega por
--    su línea de la hoja oficial (epi = «bota», «gafas»…) o, en «Ropa de trabajo», por su nombre.
--  · stock_mov: cada entrada y salida. Solo se añaden (nunca se cambian ni se borran). Stock = suma de movimientos.
--  · Las salidas de las entregas las apunta la base de datos sola: al hacer la entrega se descuenta; si se cambia antes
--    de firmar, se corrige; si se borra o se anula, vuelve. La talla: la que se elige en la entrega o, si no, la de la
--    ficha del trabajador (prenda del material).
-- Solo depende del núcleo y de lo de Prevención.
-- =====================================================================================

create table prevencion.material (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  epi         text check (epi is null or epi ~ '^[a-z][a-z0-9_]{0,40}$'),
  prenda      text check (prenda is null or prenda ~ '^[a-z][a-z0-9_]{0,40}$'),
  tallas      text[] not null default '{}' check (cardinality(tallas) <= 40),
  minimos     jsonb not null default '{}'::jsonb check (jsonb_typeof(minimos) = 'object' and length(minimos::text) <= 4000),
  orden       int not null default 0,
  baja        timestamptz,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, id)
);
create unique index material_nombre on prevencion.material (empresa_id, lower(trim(nombre))) where baja is null;
create unique index material_epi on prevencion.material (empresa_id, epi) where baja is null and epi is not null;
comment on table prevencion.material is 'Ropa y EPI que se tienen en el almacén. epi = clave de su línea en la hoja oficial (FO-014); prenda = código de la '
  'prenda de la ficha de donde se coge la talla; tallas = las que se llevan («38», «40», …; vacío = talla única); minimos = {talla: cuántas tener siempre} ("" = talla única).';

-- los mínimos son números enteros de 0 en adelante
create or replace function prevencion._material_valido() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from jsonb_each(new.minimos) m where jsonb_typeof(m.value) <> 'number' or (m.value)::numeric < 0 or (m.value)::numeric <> trunc((m.value)::numeric)) then
    raise exception 'MINIMO_MAL';
  end if;
  new.nombre := trim(new.nombre);
  new.tallas := array(select distinct trim(t) from unnest(new.tallas) t where trim(t) <> '');
  return new;
end $$;
create trigger valido before insert or update on prevencion.material for each row execute function prevencion._material_valido();

create table prevencion.stock_mov (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references nucleo.empresas(id),
  material_id   uuid not null,
  talla         text not null default '' check (length(talla) <= 20),
  cantidad      int not null check (cantidad <> 0 and cantidad between -10000 and 10000),
  tipo          text not null check (tipo in ('entrada', 'entrega', 'devolucion', 'ajuste')),
  documento_id  uuid,
  persona_id    uuid,
  nota          text check (nota is null or length(nota) <= 300),
  creado        timestamptz not null default now(),
  creado_por    uuid default auth.uid(),
  foreign key (empresa_id, material_id) references prevencion.material(empresa_id, id)
);
create index on prevencion.stock_mov (empresa_id, material_id, talla);
create index on prevencion.stock_mov (documento_id);
comment on table prevencion.stock_mov is 'Entradas (+) y salidas (−) del almacén de ropa y EPI. entrega/devolucion = de una entrega de EPI (documento_id); '
  'entrada = llega un pedido; ajuste = recuento. Solo se añaden.';
create trigger solo_anadir before update or delete on prevencion.stock_mov for each row execute function nucleo._solo_anadir();

-- ---------- lo que hay de cada material y talla ----------
create view prevencion.v_stock with (security_invoker = on) as
with claves as (
  select m.id, m.empresa_id, t as talla from prevencion.material m, unnest(case when cardinality(m.tallas) = 0 then array[''] else m.tallas end) t
  union
  select s.material_id, s.empresa_id, s.talla from prevencion.stock_mov s)
select m.id as material_id, m.empresa_id, m.nombre, m.epi, m.prenda, m.orden, m.baja, k.talla,
       (k.talla = any(m.tallas) or (cardinality(m.tallas) = 0 and k.talla = '')) as talla_de_la_lista,
       coalesce((select sum(s.cantidad) from prevencion.stock_mov s where s.material_id = m.id and s.talla = k.talla), 0)::int as stock,
       coalesce((m.minimos ->> k.talla)::int, 0) as minimo
  from claves k join prevencion.material m on m.id = k.id;
comment on view prevencion.v_stock is 'Stock de cada material y talla (suma de movimientos) con su mínimo. pedir = mínimo − stock (si es más de 0).';

-- ---------- lo que descuenta una entrega de EPI ----------
-- Líneas de la hoja oficial (items) cuyo material tiene esa clave, y de «Ropa de trabajo» (otros) por el nombre.
create or replace function prevencion._lineas_stock(p_empresa uuid, p_persona uuid, p_datos jsonb)
returns table (material_id uuid, talla text, cantidad int)
language sql stable set search_path = '' as $$
  with f as (select coalesce((select tallas from prevencion.fichas where persona_id = p_persona and empresa_id = p_empresa), '{}'::jsonb) as tallas),
  l as (
    select m.id, m.prenda, x.value as v
      from jsonb_each(case when jsonb_typeof(p_datos -> 'items') = 'object' then p_datos -> 'items' else '{}'::jsonb end) x
      join prevencion.material m on m.empresa_id = p_empresa and m.baja is null and m.epi = x.key
    union all
    select m.id, m.prenda, o.value
      from jsonb_array_elements(case when jsonb_typeof(p_datos -> 'otros') = 'array' then p_datos -> 'otros' else '[]'::jsonb end) o
      join prevencion.material m on m.empresa_id = p_empresa and m.baja is null and lower(trim(m.nombre)) = lower(trim(o.value ->> 't')))
  select l.id,
         left(coalesce(nullif(trim(l.v ->> 'talla'), ''), case when l.prenda is not null then nullif(trim((select tallas from f) ->> l.prenda), '') end, ''), 20),
         sum(greatest(coalesce(nullif(l.v ->> 'u', '')::int, 1), 1))::int
    from l
   where coalesce(nullif(l.v ->> 'u', ''), '1') ~ '^[0-9]{1,4}$'
   group by 1, 2
$$;

-- Deja los movimientos de un documento como deben estar: lo que dice la entrega si sigue en pie; nada si se ha borrado
-- o anulado. Solo añade la diferencia (los movimientos no se cambian).
create or replace function prevencion._cuadrar_stock(p_doc uuid, p_empresa uuid, p_persona uuid, p_datos jsonb, p_vale boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into prevencion.stock_mov (empresa_id, material_id, talla, cantidad, tipo, documento_id, persona_id, creado_por)
  select p_empresa, coalesce(d.material_id, a.material_id), coalesce(d.talla, a.talla),
         coalesce(d.cantidad, 0) - coalesce(a.cantidad, 0),
         case when coalesce(d.cantidad, 0) - coalesce(a.cantidad, 0) < 0 then 'entrega' else 'devolucion' end,
         p_doc, p_persona, auth.uid()
    from (select l.material_id, l.talla, -l.cantidad as cantidad from prevencion._lineas_stock(p_empresa, p_persona, p_datos) l where p_vale) d
    full join (select s.material_id, s.talla, sum(s.cantidad)::int as cantidad from prevencion.stock_mov s where s.documento_id = p_doc group by 1, 2) a
      on a.material_id = d.material_id and a.talla = d.talla
   where coalesce(d.cantidad, 0) <> coalesce(a.cantidad, 0);
end $$;
revoke execute on function prevencion._cuadrar_stock(uuid, uuid, uuid, jsonb, boolean) from public, authenticated;

create or replace function prevencion._documento_stock() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.tipo = 'epi' then perform prevencion._cuadrar_stock(old.id, old.empresa_id, old.persona_id, old.datos, false); end if;
    return old;
  end if;
  if new.tipo <> 'epi' then return new; end if;
  -- al firmar no cambia nada (así las entregas de antes de esto no descuentan al firmarlas)
  if tg_op = 'INSERT' or new.datos is distinct from old.datos or new.anulado is distinct from old.anulado then
    perform prevencion._cuadrar_stock(new.id, new.empresa_id, new.persona_id, new.datos, new.anulado is null);
  end if;
  return new;
end $$;
create trigger stock after insert or update or delete on prevencion.documentos for each row execute function prevencion._documento_stock();

-- ---------- recuento: se pone lo que hay de verdad y se apunta la diferencia ----------
-- p_items = [{"material_id", "talla", "hay"}, …]
create or replace function prevencion.recontar_stock(p_empresa uuid, p_items jsonb, p_nota text default null) returns int
language plpgsql security invoker set search_path = '' as $$
declare x jsonb; ahora int; n int := 0;
begin
  if not nucleo.tiene_permiso('prevencion.stock.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then raise exception 'DEMASIADAS'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    if coalesce(x ->> 'hay', '') !~ '^[0-9]{1,5}$' then raise exception 'CANTIDAD_MAL'; end if;
    select coalesce(sum(cantidad), 0) into ahora from prevencion.stock_mov
     where empresa_id = p_empresa and material_id = (x ->> 'material_id')::uuid and talla = coalesce(x ->> 'talla', '');
    if (x ->> 'hay')::int <> ahora then
      insert into prevencion.stock_mov (empresa_id, material_id, talla, cantidad, tipo, nota)
      values (p_empresa, (x ->> 'material_id')::uuid, coalesce(x ->> 'talla', ''), (x ->> 'hay')::int - ahora, 'ajuste', nullif(trim(coalesce(p_nota, '')), ''));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function prevencion.recontar_stock(uuid, jsonb, text) from public;
grant execute on function prevencion.recontar_stock(uuid, jsonb, text) to authenticated;

-- ---------- permisos y seguridad ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('prevencion.stock.editar', 'prevencion', 'Llevar el stock de ropa y EPI: material, mínimos, pedidos recibidos y recuentos')
on conflict (codigo) do nothing;
-- Solo el administrador («*»). Quien hace entregas (prevencion.documento.editar) ve el stock para saber si queda.

grant select, insert, update on prevencion.material to authenticated;
grant select, insert on prevencion.stock_mov to authenticated;
grant select on prevencion.v_stock to authenticated;
grant all on prevencion.material, prevencion.stock_mov to service_role;
alter table prevencion.material enable row level security;
alter table prevencion.stock_mov enable row level security;

create policy ver on prevencion.material for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy crear on prevencion.material for insert to authenticated with check (nucleo.tiene_permiso('prevencion.stock.editar', empresa_id));
create policy cambiar on prevencion.material for update to authenticated
  using (nucleo.tiene_permiso('prevencion.stock.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.stock.editar', empresa_id));

create policy ver on prevencion.stock_mov for select to authenticated using (
  nucleo.tiene_permiso('prevencion.stock.editar', empresa_id) or nucleo.tiene_permiso('prevencion.documento.editar', empresa_id));
-- a mano solo entradas (llega un pedido) y ajustes; las de las entregas las pone la base de datos
create policy crear on prevencion.stock_mov for insert to authenticated with check (
  nucleo.tiene_permiso('prevencion.stock.editar', empresa_id) and tipo in ('entrada', 'ajuste') and documento_id is null);

do $$ begin
  perform nucleo.activar_historial('prevencion.material');
end $$;
