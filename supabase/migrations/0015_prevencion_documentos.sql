-- =====================================================================================
-- 0015 · PREVENCIÓN · SUBIR LOS DOCUMENTOS DEL TÉCNICO (PDF)
-- Cristian (14/11): «necesito poder subir los documentos todos los años sin depender de programar».
--  · Cada charla puede llevar el PDF que manda el técnico de prevención. Con el PDF ya no hace falta escribir
--    nada: el compromiso y los demás textos pasan a ser opcionales.
--  · Los PDF se guardan en el almacén de Supabase (Storage, gratis hasta 1 GB), en un cubo privado «prevencion»,
--    dentro de una carpeta por unidad de trabajo: <empresa_id>/charlas/<año>-<mes>-<marca>.pdf
--    Cada subida es un archivo nuevo: lo que ya se firmó con un documento no cambia aunque se suba otro.
--  · Lo leen todos los de la unidad; lo suben, cambian o quitan quienes pueden editar las charlas.
--  · La huella de lo que se firma incluye la huella del PDF.
-- =====================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prevencion', 'prevencion', false, 20971520, '{application/pdf}')
on conflict (id) do nothing;

-- la unidad de trabajo dueña de un archivo (la primera carpeta de su ruta), sin fallar si no es un id
create or replace function prevencion.empresa_de_ruta(p_ruta text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_ruta, '/', 1)::uuid end
$$;
grant execute on function prevencion.empresa_de_ruta(text) to authenticated;

create policy prevencion_ver on storage.objects for select to authenticated
  using (bucket_id = 'prevencion' and prevencion.empresa_de_ruta(name) in (select nucleo.mis_empresas()));
create policy prevencion_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'prevencion' and nucleo.tiene_permiso('prevencion.charla.editar', prevencion.empresa_de_ruta(name)));
create policy prevencion_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'prevencion' and nucleo.tiene_permiso('prevencion.charla.editar', prevencion.empresa_de_ruta(name)))
  with check (bucket_id = 'prevencion' and nucleo.tiene_permiso('prevencion.charla.editar', prevencion.empresa_de_ruta(name)));
create policy prevencion_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'prevencion' and nucleo.tiene_permiso('prevencion.charla.editar', prevencion.empresa_de_ruta(name)));

-- la charla puede ser solo el documento del técnico
alter table prevencion.charlas
  alter column compromiso drop not null,
  add column documento_ruta text check (documento_ruta is null or length(documento_ruta) <= 300),
  add column documento_nombre text check (documento_nombre is null or length(documento_nombre) <= 200),
  add column documento_sha256 text check (documento_sha256 is null or documento_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint charla_con_contenido check (compromiso is not null or documento_ruta is not null),
  add constraint documento_de_su_unidad check (documento_ruta is null or prevencion.empresa_de_ruta(documento_ruta) = empresa_id);
comment on column prevencion.charlas.documento_ruta is 'PDF del técnico de prevención en el almacén (cubo «prevencion»).';

create or replace function prevencion.huella_charla(p_sesion uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'denominacion', s.denominacion, 'compromiso', c.compromiso, 'cuerpo', c.cuerpo, 'puntos', c.puntos,
    'tema', c.tema, 'tema_intro', c.tema_intro, 'tema_puntos', c.tema_puntos, 'documento', c.documento_sha256)::text, 'UTF8')), 'hex')
  from prevencion.sesiones s join prevencion.charlas c on c.id = s.charla_id where s.id = p_sesion
$$;
