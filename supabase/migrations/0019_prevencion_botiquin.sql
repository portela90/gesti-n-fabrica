-- =====================================================================================
-- 0019 · Prevención: EPI de altura (FO-072), revisión del botiquín (FO-018) y autorización de maquinaria.
--  · Los tres van en prevencion.documentos (tipos epi_col, botiquin y autoriz, que ya estaban permitidos).
--    EPI de altura y autorización los firma el trabajador, como el resto: no hace falta nada nuevo.
--  · El botiquín es distinto: no es de un trabajador. Lo firman quien hace la revisión y quien la supervisa, y
--    las dos firmas van dentro de «datos» (por eso le dejamos más sitio). Cuando están las dos se «cierra»
--    (prevencion.cerrar_botiquin) y, desde ahí, no cambia ni se borra: solo se anula, igual que lo firmado.
-- =====================================================================================

-- más sitio para el botiquín (lleva dos firmas dibujadas); el resto sigue igual
alter table prevencion.documentos drop constraint documentos_datos_check;
alter table prevencion.documentos add constraint documentos_datos_check check (
  jsonb_typeof(datos) = 'object' and length(datos::text) <= case when tipo = 'botiquin' then 400000 else 20000 end);

-- «terminado» = firmado por el trabajador (firma_id) o botiquín cerrado (firmado_en sin firma_id)
create or replace function prevencion._documento_firmado() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.firma_id is not null or old.firmado_en is not null then raise exception 'YA_FIRMADO: un documento firmado no se borra; se anula'; end if;
    return old;
  end if;
  if old.firma_id is not null or old.firmado_en is not null then
    if (to_jsonb(new) - 'anulado' - 'anulado_por' - 'evaluacion') <> (to_jsonb(old) - 'anulado' - 'anulado_por' - 'evaluacion')
       or (old.anulado is not null and (new.anulado is distinct from old.anulado or new.anulado_por is distinct from old.anulado_por)) then
      raise exception 'YA_FIRMADO: de un documento firmado solo se puede anotar que se anula o la evaluación';
    end if;
    return new;
  end if;
  if (new.firma_id is distinct from old.firma_id or new.firmado_en is distinct from old.firmado_en)
     and coalesce(current_setting('prevencion.firmando', true), '') <> 'si' then raise exception 'SOLO_FIRMANDO'; end if;
  if new.anulado is not null then raise exception 'SIN_FIRMAR: un documento sin firmar se borra, no se anula'; end if;
  if new.persona_id is distinct from old.persona_id or new.tipo <> old.tipo or new.empresa_id <> old.empresa_id then raise exception 'NO_CAMBIA'; end if;
  return new;
end $$;
revoke execute on function prevencion._documento_firmado() from public, authenticated;

-- Cerrar la revisión del botiquín cuando ya tiene las dos firmas.
create or replace function prevencion.cerrar_botiquin(p_documento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d prevencion.documentos;
begin
  select * into d from prevencion.documentos where id = p_documento for update;
  if not found or d.tipo <> 'botiquin' then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.documento.editar', d.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if d.firmado_en is not null then raise exception 'YA_FIRMADO'; end if;
  if coalesce(d.datos->>'firma_realiza', '') !~ '^data:image/png;base64,' or coalesce(d.datos->>'firma_supervisa', '') !~ '^data:image/png;base64,' then
    raise exception 'FALTAN_FIRMAS'; end if;
  perform set_config('prevencion.firmando', 'si', true);
  update prevencion.documentos set firmado_en = now() where id = d.id;
  perform set_config('prevencion.firmando', '', true);
end $$;

-- anular: también un botiquín cerrado
create or replace function prevencion.anular_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d prevencion.documentos;
begin
  select * into d from prevencion.documentos where id = p_documento;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.firma.anular', d.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if d.firma_id is null and d.firmado_en is null then raise exception 'SIN_FIRMAR'; end if;
  if d.anulado is not null then raise exception 'ANULADO'; end if;
  update prevencion.documentos set anulado = now(), anulado_por = auth.uid() where id = p_documento;
end $$;

grant execute on function prevencion.cerrar_botiquin(uuid) to authenticated;
