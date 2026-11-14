-- =====================================================================================
-- 0016 · Prevención: lo firmado queda para una auditoría.
--  1) Una charla que ya ha firmado alguien (firma sin anular) no se puede cambiar: cada trabajador conserva
--     exactamente lo que firmó. Para corregirla hay que anular antes las firmas.
--  2) Los PDF del técnico no se cambian ni se borran nunca (cada subida es un archivo nuevo).
-- =====================================================================================

create or replace function prevencion._charla_firmada() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from prevencion.sesiones s where s.charla_id = old.id and s.cerrada_en is not null) then raise exception 'CERRADA'; end if;
  if tg_op = 'DELETE' and exists (select 1 from prevencion.sesiones s where s.charla_id = old.id) then raise exception 'TIENE_SESION'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from prevencion.asistencias a join prevencion.sesiones s on s.id = a.sesion_id
                                    where s.charla_id = old.id and a.anulada is null) then
    raise exception 'YA_FIRMADA: ya la ha firmado alguien; para cambiarla hay que anular antes las firmas';
  end if;
  return coalesce(new, old);
end $$;

drop policy if exists prevencion_cambiar on storage.objects;
drop policy if exists prevencion_borrar on storage.objects;
