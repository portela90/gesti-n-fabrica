-- Almacén, trozo 1b (pantallas; decidido por Cristian el 22/11): marcar y anular «pedido» desde Stock, que la entrada de lo
-- pedido quite la marca sola (como la app vieja) y las notas pendientes de «Apuntar» (lo escrito durante el día, para procesar luego).

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('almacen.pedido.apuntar', 'almacen', 'Marcar un artículo como pedido (con cantidad y fecha) y anular la marca')
on conflict (codigo) do nothing;

-- ---------- marcar pedido ----------
-- La ficha la cambia quien edita el catálogo; la marca de pedido, quien apunta pedidos (el encargado, por «almacen.*.apuntar").
create or replace function almacen.marcar_pedido(p_articulo uuid, p_cantidad numeric, p_fecha date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid := (select empresa_id from nucleo.articulos where id = p_articulo);
begin
  if v_emp is null or not nucleo.tiene_permiso('almacen.pedido.apuntar', v_emp) or not nucleo.tiene_permiso('almacen.stock.ver', v_emp) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_cantidad is not null and p_cantidad < 0 then raise exception 'CANTIDAD_MAL'; end if;
  insert into almacen.fichas (articulo_id, empresa_id, pedido_en, pedido_cantidad, actualizado)
  values (p_articulo, v_emp, coalesce(p_fecha, current_date), p_cantidad, now())
  on conflict (articulo_id) do update set pedido_en = excluded.pedido_en, pedido_cantidad = excluded.pedido_cantidad, actualizado = now();
end $$;

create or replace function almacen.anular_pedido(p_articulo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid := (select empresa_id from nucleo.articulos where id = p_articulo);
begin
  if v_emp is null or not nucleo.tiene_permiso('almacen.pedido.apuntar', v_emp) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  update almacen.fichas set pedido_en = null, pedido_cantidad = null, actualizado = now() where articulo_id = p_articulo;
end $$;
revoke all on function almacen.marcar_pedido(uuid, numeric, date), almacen.anular_pedido(uuid) from public, anon;
grant execute on function almacen.marcar_pedido(uuid, numeric, date), almacen.anular_pedido(uuid) to authenticated;

-- ---------- la entrada de algo pedido: guarda cuándo se pidió y quita la marca ----------
create or replace function almacen._entrada_de_pedido() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido date;
begin
  if new.tipo <> 'entrada' or new.origen is not null then return new; end if;   -- la copia de la vieja no toca las fichas
  select pedido_en into v_pedido from almacen.fichas where articulo_id = new.articulo_id;
  if v_pedido is not null then
    new.pedido_en := coalesce(new.pedido_en, v_pedido);
    update almacen.fichas set pedido_en = null, pedido_cantidad = null, actualizado = now() where articulo_id = new.articulo_id;
  end if;
  return new;
end $$;
create trigger entrada_de_pedido before insert on almacen.movimientos for each row execute function almacen._entrada_de_pedido();

-- ---------- notas pendientes de «Apuntar» ----------
create table almacen.notas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  texto       text not null check (length(trim(texto)) between 1 and 2000),
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);
create index on almacen.notas (empresa_id, creado);
comment on table almacen.notas is 'Lo que alguien escribe o dicta en «Apuntar» para procesarlo después. Cada uno ve las suyas; se borran al procesarlas.';
alter table almacen.notas enable row level security;
grant select, insert, delete on almacen.notas to authenticated;
grant all on almacen.notas to service_role;
create policy ver on almacen.notas for select to authenticated
  using (creado_por = auth.uid() and nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id));
create policy apuntar on almacen.notas for insert to authenticated
  with check (creado_por = auth.uid() and nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id) and nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy quitar on almacen.notas for delete to authenticated using (creado_por = auth.uid());
select nucleo.activar_historial('almacen.notas');
