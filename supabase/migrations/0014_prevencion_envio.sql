-- =====================================================================================
-- 0014 · PREVENCIÓN · ENVÍO A PREVENCIÓN DEL MES
-- Como en la app de ahora: al cerrar el mes se manda al técnico de prevención el PDF oficial del Toolbox.
-- De momento se envía «desde mi correo» (la app prepara el PDF y el texto; se envía desde el móvil) y se apunta aquí
-- cuándo y a quién. El envío automático (servidor de correo) llegará cuando se configure la cuenta de envío.
-- Los datos del correo (a quién, nombre, empresa) y la firma del formador van en nucleo.ajustes (módulo prevencion).
-- =====================================================================================

alter table prevencion.sesiones
  add column prev_enviado_en timestamptz,
  add column prev_destino text check (prev_destino is null or length(prev_destino) <= 300),
  add column prev_por uuid;
comment on column prevencion.sesiones.prev_enviado_en is 'Cuándo se envió la documentación del mes a prevención (vacío = sin enviar).';

-- Una sesión cerrada no se cambia, salvo para reabrirla o apuntar el envío a prevención.
create or replace function prevencion._sesion_cerrada() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'SOLO_ANADIR: una sesión no se borra'; end if;
  if old.cerrada_en is not null
     and (to_jsonb(new) - 'cerrada_en' - 'prev_enviado_en' - 'prev_destino' - 'prev_por')
      <> (to_jsonb(old) - 'cerrada_en' - 'prev_enviado_en' - 'prev_destino' - 'prev_por') then
    raise exception 'CERRADA';
  end if;
  return new;
end $$;

-- Apuntar que se ha enviado a prevención (lo llama la app después de enviar el correo).
create or replace function prevencion.apuntar_envio(p_sesion uuid, p_destino text) returns void
language plpgsql security definer set search_path = '' as $$
declare s prevencion.sesiones;
begin
  select * into s from prevencion.sesiones where id = p_sesion;
  if not found then raise exception 'NO_EXISTE'; end if;
  if not nucleo.tiene_permiso('prevencion.charla.editar', s.empresa_id) then raise exception 'NO_PERMISO'; end if;
  update prevencion.sesiones set prev_enviado_en = now(), prev_destino = left(nullif(trim(p_destino), ''), 300), prev_por = auth.uid()
   where id = p_sesion;
end $$;
grant execute on function prevencion.apuntar_envio(uuid, text) to authenticated;
