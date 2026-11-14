-- =====================================================================================
-- 0017 · Prevención: documentos que firma cada trabajador (de momento, la entrega de EPI, SH-CORP-SP-FO-014)
-- y tallas que propone el propio trabajador.
--  · prevencion.documentos: una fila por trabajador y documento. tipo = epi (y más adelante epi_col, info,
--    autoriz, botiquin). datos = lo entregado. Mientras no está firmado se puede cambiar o borrar; firmado,
--    no cambia nunca (solo se anula, y la firma queda).
--  · Firma: el propio trabajador (si se le ha enviado) o, en su móvil, quien tenga prevencion.firma.recoger.
--  · fichas.tallas_propuestas: el trabajador propone sus tallas; quien edita fichas las acepta o rechaza.
-- =====================================================================================

create table prevencion.documentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  tipo        text not null check (tipo in ('epi', 'epi_col', 'info', 'autoriz', 'botiquin')),
  persona_id  uuid,
  nombre      text,
  fecha       date not null default current_date,
  datos       jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and length(datos::text) <= 20000),
  enviado_en  timestamptz,
  firma_id    uuid references nucleo.firmas(id),
  firmado_en  timestamptz,
  anulado     timestamptz,
  anulado_por uuid,
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id),
  check (tipo = 'botiquin' or persona_id is not null)
);
create index documentos_persona on prevencion.documentos (persona_id);
create index documentos_fecha on prevencion.documentos (empresa_id, fecha);
comment on table prevencion.documentos is 'Documentos de prevención de cada trabajador (entrega de EPI…). Firmados no cambian; solo se anulan.';

-- el nombre del trabajador se copia al crearlo (sale igual aunque luego cambie)
create or replace function prevencion._documento_nuevo() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.persona_id is not null then
    select p.nombre into new.nombre from nucleo.personas p where p.id = new.persona_id and p.empresa_id = new.empresa_id;
  end if;
  if new.firma_id is not null or new.firmado_en is not null or new.anulado is not null then raise exception 'SOLO_FIRMANDO'; end if;
  return new;
end $$;
create trigger nuevo before insert on prevencion.documentos for each row execute function prevencion._documento_nuevo();

-- firmado: no se cambia ni se borra; solo se anula una vez. La firma solo la pone prevencion.firmar_documento.
create or replace function prevencion._documento_firmado() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.firma_id is not null then raise exception 'YA_FIRMADO: un documento firmado no se borra; se anula'; end if;
    return old;
  end if;
  if old.firma_id is not null then
    if (to_jsonb(new) - 'anulado' - 'anulado_por') <> (to_jsonb(old) - 'anulado' - 'anulado_por') or old.anulado is not null or new.anulado is null then
      raise exception 'YA_FIRMADO: de un documento firmado solo se puede anotar que se anula';
    end if;
    return new;
  end if;
  if (new.firma_id is distinct from old.firma_id or new.firmado_en is distinct from old.firmado_en)
     and coalesce(current_setting('prevencion.firmando', true), '') <> 'si' then raise exception 'SOLO_FIRMANDO'; end if;
  if new.anulado is not null then raise exception 'SIN_FIRMAR: un documento sin firmar se borra, no se anula'; end if;
  if new.persona_id is distinct from old.persona_id or new.tipo <> old.tipo or new.empresa_id <> old.empresa_id then raise exception 'NO_CAMBIA'; end if;
  return new;
end $$;
create trigger firmado before update or delete on prevencion.documentos for each row execute function prevencion._documento_firmado();

-- huella de lo que se firma
create or replace function prevencion.huella_documento(p_documento uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_object('tipo', d.tipo, 'persona', d.persona_id, 'nombre', d.nombre,
           'fecha', d.fecha, 'datos', d.datos)::text, 'UTF8')), 'hex')
    from prevencion.documentos d where d.id = p_documento
$$;

-- ---------- tallas que propone el trabajador ----------
alter table prevencion.fichas
  add column tallas_propuestas jsonb check (tallas_propuestas is null or jsonb_typeof(tallas_propuestas) = 'object'),
  add column tallas_propuestas_en timestamptz;

-- ---------- permisos ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('prevencion.documento.ver',    'prevencion', 'Ver las entregas de EPI y demás documentos de los trabajadores'),
  ('prevencion.documento.editar', 'prevencion', 'Hacer entregas de EPI y demás documentos, enviarlas a firmar y borrar las que no están firmadas')
on conflict (codigo) do nothing;
-- el encargado hace las entregas de EPI y recoge las firmas (como en la app de ahora); solo lectura las ve
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, p from nucleo.roles r, unnest(array['prevencion.documento.ver', 'prevencion.documento.editar']) p
 where r.empresa_id is null and r.codigo = 'encargado'
on conflict do nothing;
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, 'prevencion.documento.ver' from nucleo.roles r where r.empresa_id is null and r.codigo = 'solo_lectura'
on conflict do nothing;

-- ---------- seguridad por fila ----------
grant select, insert, delete on prevencion.documentos to authenticated;
grant update (fecha, datos, enviado_en) on prevencion.documentos to authenticated;
grant all on prevencion.documentos to service_role;
alter table prevencion.documentos enable row level security;
create policy ver on prevencion.documentos for select to authenticated using (
  nucleo.tiene_permiso('prevencion.documento.ver', empresa_id)
  or (persona_id = prevencion.mi_persona() and enviado_en is not null));
create policy crear on prevencion.documentos for insert to authenticated with check (nucleo.tiene_permiso('prevencion.documento.editar', empresa_id));
create policy cambiar on prevencion.documentos for update to authenticated
  using (nucleo.tiene_permiso('prevencion.documento.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.documento.editar', empresa_id));
create policy borrar on prevencion.documentos for delete to authenticated using (nucleo.tiene_permiso('prevencion.documento.editar', empresa_id));
select nucleo.activar_historial('prevencion.documentos');

-- ---------- funciones ----------
-- Enviar a firmar (o volver a avisar): deja la fecha del primer envío. Devuelve cuántos faltan por firmar.
create or replace function prevencion.enviar_documentos(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if exists (select 1 from prevencion.documentos d where d.id = any(p_ids) and not nucleo.tiene_permiso('prevencion.documento.editar', d.empresa_id)) then
    raise exception 'NO_PERMISO'; end if;
  update prevencion.documentos set enviado_en = coalesce(enviado_en, now()) where id = any(p_ids) and firma_id is null and anulado is null;
  select count(*) into v_n from prevencion.documentos where id = any(p_ids) and firma_id is null and anulado is null;
  return v_n;
end $$;

-- Firmar: el propio trabajador (si se le ha enviado) o, en su móvil, quien tenga «prevencion.firma.recoger».
create or replace function prevencion.firmar_documento(p_documento uuid, p_imagen text, p_dispositivo jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d prevencion.documentos; v_recoge boolean; v_firma uuid;
begin
  select * into d from prevencion.documentos where id = p_documento for update;
  if not found or d.persona_id is null then raise exception 'NO_EXISTE'; end if;
  v_recoge := nucleo.tiene_permiso('prevencion.firma.recoger', d.empresa_id);
  if not (d.persona_id = prevencion.mi_persona() or v_recoge) then raise exception 'NO_PERMISO'; end if;
  if not v_recoge and d.enviado_en is null then raise exception 'NO_ENVIADA'; end if;
  if d.anulado is not null then raise exception 'ANULADO'; end if;
  if d.firma_id is not null then raise exception 'YA_FIRMADO'; end if;
  if p_imagen is null or p_imagen !~ '^data:image/png;base64,' then raise exception 'FIRMA_MAL'; end if;
  insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, imagen, sha256_documento, firmado_por, dispositivo)
  values (d.empresa_id, 'prevencion', d.tipo, d.id, d.persona_id, p_imagen, prevencion.huella_documento(d.id), auth.uid(), p_dispositivo)
  returning id into v_firma;
  perform set_config('prevencion.firmando', 'si', true);
  update prevencion.documentos set firma_id = v_firma, firmado_en = now(), enviado_en = coalesce(enviado_en, now()) where id = d.id;
  perform set_config('prevencion.firmando', '', true);
  return v_firma;
end $$;

-- Anular un documento firmado por error. La firma queda guardada; el documento deja de contar.
create or replace function prevencion.anular_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d prevencion.documentos;
begin
  select * into d from prevencion.documentos where id = p_documento;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.firma.anular', d.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if d.firma_id is null then raise exception 'SIN_FIRMAR'; end if;
  update prevencion.documentos set anulado = now(), anulado_por = auth.uid() where id = p_documento;
end $$;

-- El trabajador propone sus tallas ({codigo de prenda: talla}); su ficha no cambia hasta que se aceptan.
create or replace function prevencion.proponer_tallas(p_tallas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := prevencion.mi_persona(); v_emp uuid; v_limpias jsonb;
begin
  if v_yo is null then raise exception 'SIN_FICHA'; end if;
  if p_tallas is null or jsonb_typeof(p_tallas) <> 'object' then raise exception 'TALLAS_MAL'; end if;
  select p.empresa_id into v_emp from nucleo.personas p where p.id = v_yo;
  select coalesce(jsonb_object_agg(k, left(trim(v), 10)), '{}'::jsonb) into v_limpias
    from jsonb_each_text(p_tallas) t(k, v)
   where trim(v) <> '' and exists (select 1 from prevencion.prendas pr where pr.empresa_id = v_emp and pr.codigo = k and pr.baja is null);
  insert into prevencion.fichas (persona_id, empresa_id, tallas_propuestas, tallas_propuestas_en) values (v_yo, v_emp, v_limpias, now())
  on conflict (persona_id) do update set tallas_propuestas = excluded.tallas_propuestas, tallas_propuestas_en = excluded.tallas_propuestas_en;
end $$;

grant execute on function prevencion.huella_documento(uuid), prevencion.enviar_documentos(uuid[]), prevencion.firmar_documento(uuid, text, jsonb),
  prevencion.anular_documento(uuid), prevencion.proponer_tallas(jsonb) to authenticated;
revoke execute on function prevencion._documento_nuevo(), prevencion._documento_firmado() from public, authenticated;
