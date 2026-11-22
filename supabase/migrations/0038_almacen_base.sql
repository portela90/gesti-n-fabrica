-- Fase 3 · Almacén, trozo 1: la base (decidido por Cristian el 22/11).
-- Los artículos, almacenes, familias, proveedores, máquinas y personas son del núcleo; aquí va solo lo del almacén:
--  · fichas: lo del almacén de cada artículo (proveedor y su referencia, plazo, punto de pedido, almacén principal, sitio,
--    marca de «pedido», envase, máquinas donde va). precios, aparte (solo los ve quien tiene almacen.precio.editar: de partida, el administrador).
--  · dotacion: cuánto debe haber de cada artículo en cada almacén (lo que se repone en los de producción).
--  · movimientos: entradas, salidas (a una nave, a una máquina o a varias a partes iguales, con quién se lo lleva y el gestor),
--    traslados entre almacenes y ajustes de recuento (la diferencia). El STOCK ES LA SUMA DE LOS MOVIMIENTOS (vista almacen.stock).
--  · gestores (de relevo) y sinonimos (lo que aprende el lector de «Apuntar»).
-- Roles de partida: ya tienen almacen.* (administrador «*», encargado ver/apuntar/corregir, solo lectura ver). El operario
-- tiene «*.*.apuntar» pero no entra al almacén (decidido): para apuntar hace falta además almacen.stock.ver.

create schema if not exists almacen;
grant usage on schema almacen to authenticated, service_role;
comment on schema almacen is 'Módulo Almacén (Fábrica): fichas de artículos, precios, dotación, movimientos (el stock es su suma), gestores y sinónimos.';

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('almacen.stock.ver',          'almacen', 'Ver el stock, los movimientos, la reposición y las fichas de los artículos'),
  ('almacen.movimiento.apuntar', 'almacen', 'Apuntar entradas, salidas, traslados y recuentos'),
  ('almacen.movimiento.corregir','almacen', 'Corregir o borrar movimientos ya apuntados'),
  ('almacen.catalogo.editar',    'almacen', 'Cambiar las fichas del almacén, la dotación, los gestores y los sinónimos'),
  ('almacen.precio.editar',      'almacen', 'Ver y cambiar los precios de los artículos (de partida, solo el administrador)')
on conflict (codigo) do nothing;

-- roles de partida. Los operarios no entran en el Almacén (decidido por Cristian el 22/11: «como ahora, oficina y almacén»):
-- su «*.*.apuntar» pasa a ser módulo a módulo, sin el almacén. El técnico de mantenimiento apunta lo que gasta (salidas).
delete from nucleo.rol_permisos where permiso = '*.*.apuntar'
   and rol_id in (select id from nucleo.roles where codigo = 'operario' and empresa_id is null);
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, p from nucleo.roles r,
       unnest(array['coladas.*.apuntar', 'mantenimiento.*.apuntar', 'limpieza.*.apuntar', 'personal.*.apuntar', 'prevencion.*.apuntar']) p
 where r.codigo = 'operario' and r.empresa_id is null
on conflict do nothing;
delete from nucleo.rol_permisos where permiso = 'almacen.consumo.apuntar'
   and rol_id in (select id from nucleo.roles where codigo = 'tecnico_mant' and empresa_id is null);
insert into nucleo.rol_permisos (rol_id, permiso)
select id, 'almacen.movimiento.apuntar' from nucleo.roles where codigo = 'tecnico_mant' and empresa_id is null
on conflict do nothing;

-- ---------- fichas ----------
create table almacen.fichas (
  articulo_id          uuid primary key,
  empresa_id           uuid not null references nucleo.empresas(id),
  proveedor_id         uuid,
  ref_proveedor        text check (ref_proveedor is null or length(ref_proveedor) <= 120),
  plazo_dias           int check (plazo_dias is null or plazo_dias between 0 and 365),
  punto_pedido         numeric check (punto_pedido is null or punto_pedido >= 0),
  almacen_principal_id uuid,
  ubicacion            text check (ubicacion is null or length(ubicacion) <= 120),
  notas                text check (notas is null or length(notas) <= 2000),
  pedido_en            date,
  pedido_cantidad      numeric check (pedido_cantidad is null or pedido_cantidad >= 0),
  envase               text check (envase is null or length(envase) <= 80),
  maquinas             uuid[] not null default '{}',
  por_maquina          numeric check (por_maquina is null or por_maquina >= 0),
  atributos            jsonb not null default '{}' check (jsonb_typeof(atributos) = 'object'),
  origen               text,
  actualizado          timestamptz not null default now(),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id),
  foreign key (empresa_id, proveedor_id) references nucleo.proveedores(empresa_id, id),
  foreign key (empresa_id, almacen_principal_id) references nucleo.almacenes(empresa_id, id)
);
comment on table almacen.fichas is 'Lo del almacén de cada artículo. maquinas = activos donde va (inyectoras). atributos: medidas, peso, diámetro… de la app vieja.';

create table almacen.precios (
  articulo_id       uuid primary key,
  empresa_id        uuid not null references nucleo.empresas(id),
  precio            numeric check (precio is null or precio >= 0),
  precio_recuperado numeric check (precio_recuperado is null or precio_recuperado >= 0),
  historial         jsonb not null default '[]' check (jsonb_typeof(historial) = 'array'),
  actualizado       timestamptz not null default now(),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id)
);
comment on table almacen.precios is 'Precio (€ por unidad) y precio de lo recuperado. historial = precios anteriores [{f, de, a, por}].';

-- ---------- dotación ----------
create table almacen.dotacion (
  empresa_id  uuid not null references nucleo.empresas(id),
  almacen_id  uuid not null,
  articulo_id uuid not null,
  cantidad    numeric not null check (cantidad > 0),
  primary key (almacen_id, articulo_id),
  foreign key (empresa_id, almacen_id) references nucleo.almacenes(empresa_id, id),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id)
);
comment on table almacen.dotacion is 'Cuánto debe haber de cada artículo en cada almacén (normalmente los de producción): lo que se repone.';

-- ---------- movimientos ----------
create table almacen.movimientos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  fecha        date not null default current_date,
  tipo         text not null check (tipo in ('entrada', 'salida', 'traslado', 'ajuste')),
  articulo_id  uuid not null,
  almacen_id   uuid not null,
  destino_id   uuid,
  cantidad     numeric not null,
  contado      numeric,
  teorico      numeric,
  centro_id    uuid,
  activos      uuid[] not null default '{}',
  persona_id   uuid,
  gestor_id    uuid,
  proveedor_id uuid,
  albaran      text check (albaran is null or length(albaran) <= 80),
  pedido_en    date,
  motivo       text check (motivo is null or length(motivo) <= 200),
  perdida      boolean not null default false,
  nota         text check (nota is null or length(nota) <= 1000),
  origen       text,
  extra        jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  creado       timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  check (tipo = 'ajuste' or cantidad >= 0),
  check ((tipo = 'traslado') = (destino_id is not null) and (destino_id is null or destino_id <> almacen_id)),
  check (tipo = 'salida' or (cardinality(activos) = 0 and centro_id is null and persona_id is null and gestor_id is null and not perdida)),
  check (tipo = 'entrada' or (proveedor_id is null and albaran is null and pedido_en is null)),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id),
  foreign key (empresa_id, almacen_id) references nucleo.almacenes(empresa_id, id),
  foreign key (empresa_id, destino_id) references nucleo.almacenes(empresa_id, id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id),
  foreign key (empresa_id, gestor_id) references nucleo.personas(empresa_id, id),
  foreign key (empresa_id, proveedor_id) references nucleo.proveedores(empresa_id, id)
);
create index on almacen.movimientos (empresa_id, fecha);
create index on almacen.movimientos (articulo_id);
create unique index movimientos_origen on almacen.movimientos (origen) where origen is not null;
comment on table almacen.movimientos is 'extra: datos de la app vieja sin columna propia (quién lo apuntó, foto…). Entradas, salidas, traslados y ajustes. cantidad: en ajuste es la diferencia (contado − teórico), en lo demás positiva. '
  'Salida: a una nave (centro_id), a una o varias máquinas (activos, a partes iguales), con quién se lo lleva (persona_id) y el gestor. perdida = robo, rotura, caducado (se carga a la nave).';

-- las máquinas (movimientos.activos, fichas.maquinas) tienen que ser de la misma unidad
create or replace function almacen._maquinas_de_su_unidad() returns trigger language plpgsql set search_path = '' as $$
declare v jsonb := coalesce(to_jsonb(new) -> 'activos', to_jsonb(new) -> 'maquinas', '[]');
begin
  if exists (select 1 from jsonb_array_elements_text(v) a
             where not exists (select 1 from nucleo.activos x where x.id = a::uuid and x.empresa_id = new.empresa_id)) then
    raise exception 'MAQUINA_DE_OTRA_UNIDAD';
  end if;
  return new;
end $$;
create trigger maquinas before insert or update of activos, empresa_id on almacen.movimientos for each row execute function almacen._maquinas_de_su_unidad();
create trigger maquinas before insert or update of maquinas, empresa_id on almacen.fichas for each row execute function almacen._maquinas_de_su_unidad();

-- ---------- stock: la suma de los movimientos ----------
create view almacen.stock with (security_invoker = on) as
select empresa_id, articulo_id, almacen_id, sum(c) as cantidad
  from (select empresa_id, articulo_id, almacen_id,
               case tipo when 'salida' then -cantidad when 'traslado' then -cantidad else cantidad end as c
          from almacen.movimientos
        union all
        select empresa_id, articulo_id, destino_id, cantidad from almacen.movimientos where tipo = 'traslado') m
 group by empresa_id, articulo_id, almacen_id;
comment on view almacen.stock is 'Stock de cada artículo en cada almacén = suma de sus movimientos (entrada +, salida −, ajuste ±, traslado − origen + destino).';

-- ---------- gestores de relevo y sinónimos ----------
create table almacen.gestores (
  persona_id uuid primary key,
  empresa_id uuid not null references nucleo.empresas(id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table almacen.gestores is 'Personas que son gestores de relevo (se eligen en las salidas).';

create table almacen.sinonimos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  palabra     text not null check (length(trim(palabra)) between 1 and 80),
  articulo_id uuid not null,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id)
);
create unique index sinonimos_palabra on almacen.sinonimos (empresa_id, lower(trim(palabra)));
comment on table almacen.sinonimos is 'Palabras que el lector de «Apuntar» ha aprendido para cada artículo (p. ej. «junta gorda» → junta cono JPC-375).';

-- ---------- equivalencias con la app vieja (para la copia semanal y el día del cambio) ----------
create table almacen.equivalencias (
  empresa_id uuid not null references nucleo.empresas(id),
  clase      text not null check (clase in ('articulo', 'almacen', 'proveedor', 'maquina', 'persona', 'familia')),
  vieja      text not null,
  nueva      uuid not null,
  primary key (empresa_id, clase, vieja)
);
comment on table almacen.equivalencias is 'Qué es cada cosa de la app vieja (su id en public.docs) en la nueva. Solo la usa la copia.';

-- ---------- seguridad ----------
alter table almacen.fichas enable row level security;
alter table almacen.precios enable row level security;
alter table almacen.dotacion enable row level security;
alter table almacen.movimientos enable row level security;
alter table almacen.gestores enable row level security;
alter table almacen.sinonimos enable row level security;
alter table almacen.equivalencias enable row level security;   -- sin reglas: desde la app no se ve ni se toca
grant select, insert, update, delete on almacen.fichas, almacen.precios, almacen.dotacion, almacen.movimientos, almacen.gestores, almacen.sinonimos to authenticated;
grant select on almacen.stock to authenticated;
grant all on all tables in schema almacen to service_role;

create policy ver on almacen.fichas for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy cambiar on almacen.fichas for all to authenticated
  using (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id)) with check (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id));
create policy ver on almacen.precios for select to authenticated using (nucleo.tiene_permiso('almacen.precio.editar', empresa_id));
create policy cambiar on almacen.precios for all to authenticated
  using (nucleo.tiene_permiso('almacen.precio.editar', empresa_id) and nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id))
  with check (nucleo.tiene_permiso('almacen.precio.editar', empresa_id) and nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id));
create policy ver on almacen.dotacion for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy cambiar on almacen.dotacion for all to authenticated
  using (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id)) with check (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id));
create policy ver on almacen.gestores for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy cambiar on almacen.gestores for all to authenticated
  using (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id)) with check (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id));
create policy ver on almacen.sinonimos for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
-- enseñar una palabra lo puede quien apunta; quitarla, quien edita el catálogo
create policy ensenar on almacen.sinonimos for insert to authenticated
  with check (nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id) and nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy quitar on almacen.sinonimos for delete to authenticated using (nucleo.tiene_permiso('almacen.catalogo.editar', empresa_id));

create policy ver on almacen.movimientos for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy apuntar on almacen.movimientos for insert to authenticated
  with check (nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id) and nucleo.tiene_permiso('almacen.stock.ver', empresa_id)
              and creado_por = auth.uid() and origen is null);
create policy corregir on almacen.movimientos for update to authenticated
  using (nucleo.tiene_permiso('almacen.movimiento.corregir', empresa_id)) with check (nucleo.tiene_permiso('almacen.movimiento.corregir', empresa_id));
create policy borrar on almacen.movimientos for delete to authenticated using (nucleo.tiene_permiso('almacen.movimiento.corregir', empresa_id));

select nucleo.activar_historial('almacen.fichas');
select nucleo.activar_historial('almacen.precios');
select nucleo.activar_historial('almacen.dotacion');
select nucleo.activar_historial('almacen.movimientos');
select nucleo.activar_historial('almacen.gestores');
select nucleo.activar_historial('almacen.sinonimos');
