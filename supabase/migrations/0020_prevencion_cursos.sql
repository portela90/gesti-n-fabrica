-- =====================================================================================
-- 0020 · Prevención: cursos y certificados de cada trabajador (carretilla, PEMP, altura, PRL 60 h…).
--  · prevencion.cursos: tipo, nombre, entidad, fecha, horas, caducidad y notas; y los archivos del certificado
--    (foto o PDF) en el almacén de archivos, carpeta <unidad>/cursos/.
--  · Son datos del trabajador, como la ficha: los ve quien ve fichas (el encargado no) y el propio trabajador
--    los suyos; los apunta quien edita fichas.
--  · El almacén «prevencion» ya existía (0015, solo PDF, para los documentos del técnico). Ahora acepta también
--    fotos (JPEG y PNG), y la carpeta «cursos» tiene sus propias reglas: verla, quien ve fichas; subir, quien
--    edita fichas. La carpeta «charlas» sigue igual.
-- =====================================================================================

create table prevencion.cursos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  persona_id  uuid not null,
  tipo        text not null check (length(tipo) between 1 and 80),
  titulo      text check (titulo is null or length(titulo) <= 200),
  entidad     text check (entidad is null or length(entidad) <= 120),
  fecha       date,
  horas       numeric(6,1) check (horas is null or horas between 0 and 2000),
  caduca      date,
  notas       text check (notas is null or length(notas) <= 1000),
  archivos    jsonb not null default '[]'::jsonb check (jsonb_typeof(archivos) = 'array' and jsonb_array_length(archivos) <= 10),
  origen      text,
  creado      timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id),
  check (caduca is null or fecha is null or caduca >= fecha)
);
create index cursos_persona on prevencion.cursos (persona_id);
comment on table prevencion.cursos is 'Cursos y certificados de cada trabajador. archivos = [{ruta, nombre, mime, sha256}] en el almacén (carpeta <unidad>/cursos/).';

-- los archivos tienen que estar en la carpeta de cursos de su unidad
create or replace function prevencion._curso_archivos() returns trigger language plpgsql set search_path = '' as $$
declare a jsonb;
begin
  for a in select * from jsonb_array_elements(new.archivos) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a->>'ruta', '') not like new.empresa_id::text || '/cursos/%'
       or coalesce(a->>'mime', '') not in ('application/pdf', 'image/jpeg', 'image/png') then
      raise exception 'ARCHIVO_MAL: el certificado tiene que ser un PDF o una foto de la carpeta de cursos de su unidad';
    end if;
  end loop;
  return new;
end $$;
create trigger archivos before insert or update on prevencion.cursos for each row execute function prevencion._curso_archivos();

grant select, insert, update, delete on prevencion.cursos to authenticated;
grant all on prevencion.cursos to service_role;
alter table prevencion.cursos enable row level security;
create policy ver on prevencion.cursos for select to authenticated using (
  nucleo.tiene_permiso('prevencion.ficha.ver', empresa_id) or persona_id = prevencion.mi_persona());
create policy gestionar on prevencion.cursos for all to authenticated
  using (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id)) with check (nucleo.tiene_permiso('prevencion.ficha.editar', empresa_id));
select nucleo.activar_historial('prevencion.cursos');
revoke execute on function prevencion._curso_archivos() from public, authenticated;

-- ---------- almacén: fotos y carpeta de cursos ----------
update storage.buckets set allowed_mime_types = '{application/pdf,image/jpeg,image/png}' where id = 'prevencion';

drop policy if exists prevencion_ver on storage.objects;
drop policy if exists prevencion_subir on storage.objects;
create policy prevencion_ver on storage.objects for select to authenticated using (
  bucket_id = 'prevencion' and case split_part(name, '/', 2)
    when 'cursos' then nucleo.tiene_permiso('prevencion.ficha.ver', prevencion.empresa_de_ruta(name))
      or exists (select 1 from prevencion.cursos c where c.archivos @> jsonb_build_array(jsonb_build_object('ruta', name)) and c.persona_id = prevencion.mi_persona())
    else prevencion.empresa_de_ruta(name) in (select nucleo.mis_empresas()) end);
create policy prevencion_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'prevencion' and case split_part(name, '/', 2)
    when 'cursos' then nucleo.tiene_permiso('prevencion.ficha.editar', prevencion.empresa_de_ruta(name))
    when 'charlas' then nucleo.tiene_permiso('prevencion.charla.editar', prevencion.empresa_de_ruta(name))
    else false end);
