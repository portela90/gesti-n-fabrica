-- =====================================================================================
-- 0018 · Prevención: formación práctica en el puesto (F40R304) y entrega de información (FP-022).
--  · Las dos van en prevencion.documentos (tipo 'formacion' e 'info'), como la entrega de EPI: se firman igual y,
--    firmadas, no cambian.
--  · La formación lleva después una «evaluación de la eficacia» (fecha, eficaz sí/no, fecha de nueva formación).
--    Se apunta cuando el trabajador ya lleva un tiempo en el puesto, o sea, con la formación ya firmada: por eso va
--    en su propia columna (evaluacion), que no forma parte de lo firmado (no entra en la huella) y se puede apuntar
--    después.
-- =====================================================================================

alter table prevencion.documentos drop constraint documentos_tipo_check;
alter table prevencion.documentos add constraint documentos_tipo_check
  check (tipo in ('epi', 'epi_col', 'info', 'autoriz', 'botiquin', 'formacion'));

alter table prevencion.documentos
  add column evaluacion jsonb check (evaluacion is null or jsonb_typeof(evaluacion) = 'object'),
  add constraint evaluacion_solo_formacion check (evaluacion is null or tipo = 'formacion');
grant update (evaluacion) on prevencion.documentos to authenticated;

-- firmado: lo firmado no cambia; se puede anular (una vez) y apuntar la evaluación de la eficacia
create or replace function prevencion._documento_firmado() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.firma_id is not null then raise exception 'YA_FIRMADO: un documento firmado no se borra; se anula'; end if;
    return old;
  end if;
  if old.firma_id is not null then
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

-- anular dos veces no hace nada: ahora lo dice
create or replace function prevencion.anular_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d prevencion.documentos;
begin
  select * into d from prevencion.documentos where id = p_documento;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.firma.anular', d.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if d.firma_id is null then raise exception 'SIN_FIRMAR'; end if;
  if d.anulado is not null then raise exception 'ANULADO'; end if;
  update prevencion.documentos set anulado = now(), anulado_por = auth.uid() where id = p_documento;
end $$;
