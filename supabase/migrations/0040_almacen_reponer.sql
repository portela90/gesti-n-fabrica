-- Almacén, trozo 1c (Hoy y Reponer; decidido por Cristian el 22/11): la dotación y los mínimos los cambian el encargado y el
-- administrador (como en la app vieja); «Quitar» una fila de «bajar a planta» y la cantidad de hoy; ajustes de Reponer y Previsión.

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('almacen.dotacion.editar', 'almacen', 'Cambiar la dotación de los almacenes de producción, los mínimos de los artículos y los ajustes de Reponer y Previsión')
on conflict (codigo) do nothing;
insert into nucleo.rol_permisos (rol_id, permiso)
select id, 'almacen.dotacion.editar' from nucleo.roles where codigo = 'encargado' and empresa_id is null
on conflict do nothing;

-- ---------- dotación: también quien tiene «almacen.dotacion.editar» ----------
create policy cambiar_dotacion on almacen.dotacion for all to authenticated
  using (nucleo.tiene_permiso('almacen.dotacion.editar', empresa_id)) with check (nucleo.tiene_permiso('almacen.dotacion.editar', empresa_id));

-- ---------- mínimos (columna del núcleo: solo el mínimo, sin dar permiso para cambiar el resto del artículo) ----------
-- p_minimos: [{"articulo": uuid, "minimo": número o null}]
create or replace function almacen.poner_minimos(p_empresa uuid, p_minimos jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not nucleo.tiene_permiso('almacen.dotacion.editar', p_empresa) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  if jsonb_typeof(p_minimos) <> 'array' then raise exception 'DATOS_MAL'; end if;
  if exists (select 1 from jsonb_array_elements(p_minimos) x where nullif(x->>'minimo', '')::numeric < 0) then raise exception 'CANTIDAD_MAL'; end if;
  update nucleo.articulos a set minimo = nullif(x->>'minimo', '')::numeric
    from jsonb_array_elements(p_minimos) x
   where a.id = (x->>'articulo')::uuid and a.empresa_id = p_empresa and a.minimo is distinct from nullif(x->>'minimo', '')::numeric;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function almacen.poner_minimos(uuid, jsonb) from public, anon;
grant execute on function almacen.poner_minimos(uuid, jsonb) to authenticated;

-- ---------- ajustes de Reponer y Previsión (nucleo.ajustes, módulo almacen) ----------
-- origen_reposicion: almacén central que no se repone (uuid); prevision: {"nivel":95,"plazo":7,"cobertura":7}
create or replace function almacen.guardar_ajuste(p_empresa uuid, p_clave text, p_valor jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('almacen.dotacion.editar', p_empresa) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  if p_clave not in ('origen_reposicion', 'prevision') then raise exception 'AJUSTE_DESCONOCIDO'; end if;
  if p_clave = 'origen_reposicion' and p_valor <> 'null'::jsonb
     and not exists (select 1 from nucleo.almacenes where id = (p_valor #>> '{}')::uuid and empresa_id = p_empresa) then raise exception 'DATOS_MAL'; end if;
  if p_clave = 'prevision' and (jsonb_typeof(p_valor) <> 'object'
     or coalesce((p_valor->>'nivel')::numeric, 95) not in (90, 95, 99)
     or coalesce((p_valor->>'plazo')::numeric, 7) not between 0 and 120
     or coalesce((p_valor->>'cobertura')::numeric, 7) not between 1 and 60) then raise exception 'DATOS_MAL'; end if;
  insert into nucleo.ajustes (empresa_id, centro_id, modulo, clave, valor) values (p_empresa, null, 'almacen', p_clave, p_valor)
  on conflict (empresa_id, centro_id, modulo, clave) do update set valor = excluded.valor;
end $$;
revoke all on function almacen.guardar_ajuste(uuid, text, jsonb) from public, anon;
grant execute on function almacen.guardar_ajuste(uuid, text, jsonb) to authenticated;

-- ---------- «bajar a planta»: filas quitadas y cantidades cambiadas para hoy ----------
-- quitar: desde entonces solo sale lo gastado después (stock = el que había al quitarla); deja de valer si entra material.
-- hoy: la cantidad a bajar ese día (solo vale el día «dia»).
create table almacen.bajar (
  empresa_id  uuid not null references nucleo.empresas(id),
  almacen_id  uuid not null,
  articulo_id uuid not null,
  quitado_stock numeric,
  quitado_en  timestamptz,
  hoy_cantidad numeric check (hoy_cantidad is null or hoy_cantidad >= 0),
  hoy_dia     date,
  primary key (almacen_id, articulo_id),
  foreign key (empresa_id, almacen_id) references nucleo.almacenes(empresa_id, id),
  foreign key (empresa_id, articulo_id) references nucleo.articulos(empresa_id, id)
);
comment on table almacen.bajar is 'Reponer: filas de «bajar a planta» quitadas (con el stock de ese momento) y cantidades cambiadas solo para un día.';
alter table almacen.bajar enable row level security;
grant select, insert, update, delete on almacen.bajar to authenticated;
grant all on almacen.bajar to service_role;
create policy ver on almacen.bajar for select to authenticated using (nucleo.tiene_permiso('almacen.stock.ver', empresa_id));
create policy cambiar on almacen.bajar for all to authenticated
  using (nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id)) with check (nucleo.tiene_permiso('almacen.movimiento.apuntar', empresa_id));
select nucleo.activar_historial('almacen.bajar');
