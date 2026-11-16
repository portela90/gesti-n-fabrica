-- =====================================================================================
-- 0030 · INCIDENCIAS, PROBLEMAS REPETIDOS, TABLÓN DE AVISOS Y BANDEJA DE NOTIFICACIONES (parte 6)
-- Decidido por Cristian (16/11):
--  · Incidencias automáticas: «Hay un problema» en un trabajo, cada punto «Mal» (o por debajo del mínimo) de la checklist
--    de un trabajo y de la checklist del encargado crean una incidencia sola. También se crean a mano.
--  · Solo el administrador las ve todas y las gestiona (abierta → en proceso → resuelta / descartada, con nota).
--    Cada uno ve las suyas y cómo van.
--  · Problemas repetidos igual que la vieja: si el mismo tema (aceite, taladrina…) pasa en el mismo sitio y ya pasó
--    otra vez en los 7 días anteriores, se abre un «problema repetido» que se sigue hasta solucionarlo; si vuelve a pasar,
--    se reabre. Los temas y sus palabras son datos (limpieza.temas), no código.
--  · Notificaciones: incidencias y problemas al administrador; trabajos nuevos o cambiados al operario; instrucciones
--    al encargado y su checklist enviada al administrador; avisos del tablón a todos. Aquí se apuntan en
--    nucleo.notificaciones (la bandeja); el envío al móvil va aparte.
-- =====================================================================================

-- ---------- núcleo: quién tiene un permiso, bandeja de notificaciones y tablón ----------
create or replace function nucleo.usuarios_con_permiso(p_permiso text, p_empresa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.usuario_id), '{}')
    from nucleo.asignaciones a
    join nucleo.usuarios u on u.id = a.usuario_id and u.baja is null
    join nucleo.roles r on r.id = a.rol_id and r.baja is null
    join nucleo.rol_permisos rp on rp.rol_id = r.id
   where a.empresa_id = p_empresa and (a.hasta is null or a.hasta > now())
     and p_permiso like replace(replace(rp.permiso, '_', '\_'), '*', '%')
     and (split_part(p_permiso, '.', 1) = 'nucleo' or exists (
           select 1 from nucleo.empresa_modulos m where m.empresa_id = p_empresa and m.modulo = split_part(p_permiso, '.', 1) and m.activo))
$$;
create or replace function nucleo.usuarios_de_personas(p_personas uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u.id), '{}') from nucleo.usuarios u where u.persona_id = any(p_personas) and u.baja is null
$$;

create table nucleo.notificaciones (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null references nucleo.empresas(id),
  usuario_id  uuid not null references nucleo.usuarios(id),
  titulo      text not null check (length(titulo) between 1 and 120),
  texto       text check (texto is null or length(texto) <= 500),
  ruta        text check (ruta is null or length(ruta) <= 200),
  etiqueta    text check (etiqueta is null or length(etiqueta) <= 120),
  urgente     boolean not null default false,
  creado      timestamptz not null default now(),
  leido       timestamptz,
  enviado     timestamptz,
  envio_error text
);
create index on nucleo.notificaciones (usuario_id, creado desc);
create index on nucleo.notificaciones (creado) where enviado is null;
comment on table nucleo.notificaciones is 'Bandeja de notificaciones de cada usuario (se ven en la app y se mandan al móvil). '
  'etiqueta: las de la misma etiqueta se juntan en el móvil. Las escriben las funciones (nucleo.notificar).';

create or replace function nucleo.notificar(p_empresa uuid, p_usuarios uuid[], p_titulo text, p_texto text default null,
                                            p_ruta text default null, p_etiqueta text default null, p_urgente boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into nucleo.notificaciones (empresa_id, usuario_id, titulo, texto, ruta, etiqueta, urgente)
  select p_empresa, u, left(p_titulo, 120), left(p_texto, 500), left(p_ruta, 200), left(p_etiqueta, 120), coalesce(p_urgente, false)
    from (select distinct unnest(coalesce(p_usuarios, '{}')) u) x
   where u is distinct from auth.uid()                                       -- a uno mismo no se le avisa
     and exists (select 1 from nucleo.usuarios w where w.id = u and w.baja is null);
exception when others then
  raise warning 'nucleo.notificar: %', sqlerrm;                             -- un aviso nunca impide guardar
end $$;

create or replace function nucleo.marcar_leidas(p_ids bigint[] default null) returns void
language sql security definer set search_path = '' as $$
  update nucleo.notificaciones set leido = now()
   where usuario_id = auth.uid() and leido is null and (p_ids is null or id = any(p_ids))
$$;

alter table nucleo.notificaciones enable row level security;
grant select on nucleo.notificaciones to authenticated;
grant all on nucleo.notificaciones to service_role;
create policy ver on nucleo.notificaciones for select to authenticated using (usuario_id = auth.uid());

-- tablón: avisos para todos los de la unidad de trabajo hasta una fecha
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('nucleo.aviso.editar', 'nucleo', 'Publicar y quitar avisos del tablón')
on conflict (codigo) do nothing;
create table nucleo.avisos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  titulo      text not null check (length(titulo) between 1 and 120),
  texto       text check (texto is null or length(texto) <= 2000),
  hasta       date not null,
  anulado     timestamptz,
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);
create index on nucleo.avisos (empresa_id, hasta);
comment on table nucleo.avisos is 'Tablón: avisos que ven todos los de la unidad de trabajo hasta «hasta». Se quitan con «anulado».';
alter table nucleo.avisos enable row level security;
grant select, insert, update on nucleo.avisos to authenticated;
grant all on nucleo.avisos to service_role;
create policy ver on nucleo.avisos for select to authenticated using (
  nucleo.tiene_permiso('nucleo.aviso.editar', empresa_id)
  or (empresa_id in (select nucleo.mis_empresas()) and anulado is null and hasta >= current_date));
create policy crear on nucleo.avisos for insert to authenticated with check (nucleo.tiene_permiso('nucleo.aviso.editar', empresa_id));
create policy cambiar on nucleo.avisos for update to authenticated
  using (nucleo.tiene_permiso('nucleo.aviso.editar', empresa_id)) with check (nucleo.tiene_permiso('nucleo.aviso.editar', empresa_id));
create or replace function nucleo._aviso_notificar() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.anulado is null and new.hasta >= current_date then
    perform nucleo.notificar(new.empresa_id,
      (select array_agg(distinct a.usuario_id) from nucleo.asignaciones a where a.empresa_id = new.empresa_id and (a.hasta is null or a.hasta > now())),
      'Aviso: ' || new.titulo, left(new.texto, 200), '/', 'aviso-' || new.id);
  end if;
  return null;
end $$;
create trigger notificar after insert on nucleo.avisos for each row execute function nucleo._aviso_notificar();
do $$ begin perform nucleo.activar_historial('nucleo.avisos'); end $$;

-- ---------- Limpieza: temas (de qué va un problema) ----------
create table limpieza.temas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  nombre      text not null check (length(nombre) between 1 and 60),
  palabras    text[] not null check (cardinality(palabras) between 1 and 40),
  orden       int not null default 0,
  baja        timestamptz,
  unique (empresa_id, nombre)
);
comment on table limpieza.temas is 'Temas de los problemas («Aceite», «Taladrina»…): si el texto contiene alguna de sus palabras (o el principio de una), es de ese tema. '
  'Gana el de menor orden.';

-- texto en minúsculas y sin tildes
create or replace function limpieza._plano(p text) returns text language sql immutable set search_path = '' as $$
  select translate(lower(coalesce(p, '')), 'áéíóúüàèìòùñ', 'aeiouuaeioun')
$$;
create or replace function limpieza._tema(p_empresa uuid, p_texto text) returns text
language sql stable security definer set search_path = '' as $$
  select t.nombre from limpieza.temas t
   where t.empresa_id = p_empresa and t.baja is null
     and exists (select 1 from unnest(t.palabras) w where limpieza._plano(p_texto) like '%' || limpieza._plano(w) || '%')
   order by t.orden, t.nombre limit 1
$$;
-- el sitio para comparar: la máquina (la del trabajo o una cuyo código salga en el texto) o, si no, el texto del lugar
create or replace function limpieza._clave_lugar(p_empresa uuid, p_activo uuid, p_lugar text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select upper(regexp_replace(a.codigo, '[\s.-]', '', 'g')) from nucleo.activos a where a.id = p_activo),
    (select upper(regexp_replace(a.codigo, '[\s.-]', '', 'g')) from nucleo.activos a
      where a.empresa_id = p_empresa and a.baja is null and length(a.codigo) >= 2
        and upper(regexp_replace(regexp_replace(coalesce(p_lugar, ''), '[.-]', '', 'g'), '([A-Za-z])\s+(\d)', '\1\2', 'g'))
            ~ ('(^|[^A-Z0-9])' || upper(regexp_replace(a.codigo, '[\s.-]', '', 'g')) || '([^0-9]|$)')
      order by length(a.codigo) desc limit 1),
    nullif(upper(regexp_replace(trim(coalesce(p_lugar, '')), '[\s.,-]+', '', 'g')), ''))
$$;

-- ---------- incidencias ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.incidencia.editar', 'limpieza', 'Ver todas las incidencias y problemas repetidos y gestionarlos')
on conflict (codigo) do nothing;

create table limpieza.incidencias (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references nucleo.empresas(id),
  tema          text,
  texto         text not null check (length(texto) between 1 and 1000),
  lugar         text check (lugar is null or length(lugar) <= 120),
  lugar_clave   text,
  activo_id     uuid,
  ubicacion_id  uuid,
  urgente       boolean not null default false,
  fotos         jsonb not null default '[]' check (jsonb_typeof(fotos) = 'array'),
  estado        text not null default 'abierta' check (estado in ('abierta', 'en_proceso', 'resuelta', 'descartada')),
  origen        text not null check (origen in ('trabajo', 'checklist', 'encargado', 'mano')),
  trabajo_id    uuid references limpieza.trabajos(id),
  revision_id   uuid references limpieza.revisiones(id),
  persona_id    uuid,
  cerrada_en    timestamptz,
  creado        timestamptz not null default now(),
  creado_por    uuid default auth.uid()
);
create index on limpieza.incidencias (empresa_id, estado, creado desc);
create index on limpieza.incidencias (trabajo_id);
comment on table limpieza.incidencias is 'Incidencias: de «Hay un problema», de los puntos «Mal» de las checklists o a mano. Solo el administrador las gestiona.';

create table limpieza.incidencia_notas (
  id             uuid primary key default gen_random_uuid(),
  incidencia_id  uuid not null references limpieza.incidencias(id),
  empresa_id     uuid not null references nucleo.empresas(id),
  texto          text check (texto is null or length(texto) <= 1000),
  estado         text check (estado is null or estado in ('abierta', 'en_proceso', 'resuelta', 'descartada')),
  creado         timestamptz not null default now(),
  creado_por     uuid default auth.uid()
);
create index on limpieza.incidencia_notas (incidencia_id, creado);
create trigger solo_anadir before update or delete on limpieza.incidencia_notas for each row execute function nucleo._solo_anadir();
comment on table limpieza.incidencia_notas is 'Seguimiento de cada incidencia (notas y cambios de estado). Solo se añade.';

-- crear una incidencia (la usan los disparadores y la de «a mano»)
create or replace function limpieza._nueva_incidencia(p_empresa uuid, p_texto text, p_origen text, p_lugar text, p_activo uuid, p_ubicacion uuid,
                                                      p_urgente boolean, p_fotos jsonb, p_trabajo uuid, p_revision uuid, p_titulo text default null,
                                                      p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i limpieza.incidencias;
begin
  insert into limpieza.incidencias (id, empresa_id, tema, texto, lugar, lugar_clave, activo_id, ubicacion_id, urgente, fotos, origen, trabajo_id, revision_id, persona_id)
  values (coalesce(p_id, gen_random_uuid()), p_empresa, limpieza._tema(p_empresa, coalesce(p_titulo, '') || ' ' || p_texto), left(p_texto, 1000), nullif(left(trim(coalesce(p_lugar, '')), 120), ''),
          limpieza._clave_lugar(p_empresa, p_activo, p_lugar), p_activo, p_ubicacion, coalesce(p_urgente, false), coalesce(p_fotos, '[]'),
          p_origen, p_trabajo, p_revision, limpieza.mi_persona())
  returning * into i;
  perform limpieza._caso(p_empresa, coalesce(i.trabajo_id, i.id), i.tema, i.lugar_clave, i.lugar, current_date);
  perform nucleo.notificar(p_empresa, nucleo.usuarios_con_permiso('limpieza.incidencia.editar', p_empresa),
    case when i.urgente then 'URGENTE: ' else 'Incidencia: ' end || left(i.texto, 100), i.lugar, '/m/limpieza/incidencias', 'incidencia-' || i.id, i.urgente);
  return i.id;
end $$;

-- a mano (cualquiera que apunte en Limpieza). p_id lo da la pantalla para poder subir antes las fotos.
create or replace function limpieza.crear_incidencia(p_empresa uuid, p_texto text, p_lugar text default null, p_activo uuid default null,
                                                     p_urgente boolean default false, p_fotos jsonb default '[]', p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if length(trim(coalesce(p_texto, ''))) not between 1 and 1000 then raise exception 'TEXTO_MAL'; end if;
  if p_activo is not null and not exists (select 1 from nucleo.activos a where a.id = p_activo and a.empresa_id = p_empresa) then raise exception 'NO_PERMISO'; end if;
  if jsonb_typeof(coalesce(p_fotos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_fotos, '[]')) > 5 then raise exception 'FOTO_MAL'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_fotos, '[]')) loop
    if p_id is null or f #>> '{}' not like p_empresa || '/incidencias/' || p_id || '/%' then raise exception 'FOTO_MAL'; end if;
  end loop;
  return limpieza._nueva_incidencia(p_empresa, trim(p_texto), 'mano', coalesce(p_lugar, (select a.codigo from nucleo.activos a where a.id = p_activo)),
                                    p_activo, null, p_urgente, p_fotos, null, null, null, p_id);
end $$;

-- gestionar (solo el administrador): estado con nota
create or replace function limpieza.incidencia_estado(p_id uuid, p_estado text, p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare i limpieza.incidencias;
begin
  select * into i from limpieza.incidencias where id = p_id for update;
  if not found or not nucleo.tiene_permiso('limpieza.incidencia.editar', i.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if p_estado not in ('abierta', 'en_proceso', 'resuelta', 'descartada') then raise exception 'ESTADO_MAL'; end if;
  if p_estado <> 'abierta' and length(trim(coalesce(p_nota, ''))) = 0 then raise exception 'FALTA_NOTA'; end if;
  update limpieza.incidencias set estado = p_estado, cerrada_en = case when p_estado in ('resuelta', 'descartada') then now() end where id = p_id;
  insert into limpieza.incidencia_notas (incidencia_id, empresa_id, texto, estado) values (p_id, i.empresa_id, nullif(left(trim(coalesce(p_nota, '')), 1000), ''), p_estado);
  -- a quien la abrió le llega cómo va
  perform nucleo.notificar(i.empresa_id, array(select u.id from nucleo.usuarios u where u.id = i.creado_por),
    case p_estado when 'en_proceso' then 'En marcha: ' when 'resuelta' then 'Resuelta: ' when 'descartada' then 'Cerrada: ' else 'Reabierta: ' end || left(i.texto, 90),
    p_nota, '/m/limpieza/incidencias', 'incidencia-' || i.id);
end $$;

-- añadir una nota (el administrador o quien la abrió)
create or replace function limpieza.incidencia_nota(p_id uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare i limpieza.incidencias; admin boolean;
begin
  select * into i from limpieza.incidencias where id = p_id;
  if not found then raise exception 'NO_PERMISO'; end if;
  admin := nucleo.tiene_permiso('limpieza.incidencia.editar', i.empresa_id);
  if not admin and i.creado_por is distinct from auth.uid() then raise exception 'NO_PERMISO'; end if;
  if length(trim(coalesce(p_texto, ''))) not between 1 and 1000 then raise exception 'TEXTO_MAL'; end if;
  insert into limpieza.incidencia_notas (incidencia_id, empresa_id, texto) values (p_id, i.empresa_id, trim(p_texto));
  perform nucleo.notificar(i.empresa_id,
    case when admin then array(select u.id from nucleo.usuarios u where u.id = i.creado_por) else nucleo.usuarios_con_permiso('limpieza.incidencia.editar', i.empresa_id) end,
    'Nota en: ' || left(i.texto, 100), left(trim(p_texto), 200), '/m/limpieza/incidencias', 'incidencia-' || i.id);
end $$;

-- automáticas: «Hay un problema» y puntos «Mal» al terminar un trabajo
create or replace function limpieza._incidencias_de_trabajo() returns trigger language plpgsql security definer set search_path = '' as $$
declare lug text; it jsonb; abierta uuid;
begin
  lug := coalesce((select a.codigo from nucleo.activos a where a.id = new.activo_id), new.lugar, (select u.nombre from nucleo.ubicaciones u where u.id = new.ubicacion_id));
  if new.problema is not null and new.problema is distinct from old.problema then
    select i.id into abierta from limpieza.incidencias i where i.trabajo_id = new.id and i.origen = 'trabajo' and i.estado in ('abierta', 'en_proceso') limit 1;
    if abierta is not null then
      insert into limpieza.incidencia_notas (incidencia_id, empresa_id, texto) values (abierta, new.empresa_id, left(new.problema, 1000));
    else
      perform limpieza._nueva_incidencia(new.empresa_id, new.problema, 'trabajo', lug, new.activo_id, new.ubicacion_id, false,
        coalesce((select jsonb_agg(f ->> 'ruta') from jsonb_array_elements(new.fotos) f where f ->> 'momento' = 'problema'), '[]'), new.id, null, new.titulo);
    end if;
  end if;
  if new.estado = 'hecho' and old.estado <> 'hecho' and new.checklist is not null then
    for it in select * from jsonb_array_elements(new.checklist) loop
      if it ->> 'valor' = 'mal' or coalesce((it ->> 'bajo_minimo')::boolean, false) then
        perform limpieza._nueva_incidencia(new.empresa_id,
          '«' || (it ->> 'texto') || '» ' || case when it ->> 'valor' = 'mal' then 'mal' else 'por debajo del mínimo (' || (it ->> 'valor') || ' de ' || (it ->> 'minimo') || ')' end
            || ' en «' || new.titulo || '»',
          'checklist', lug, new.activo_id, new.ubicacion_id, false,
          case when it ->> 'foto' is not null then jsonb_build_array(it ->> 'foto') else '[]' end, new.id, null, new.titulo);
      end if;
    end loop;
  end if;
  return null;
exception when others then
  raise warning 'incidencias de un trabajo: %', sqlerrm;                     -- nunca impide terminar el trabajo
  return null;
end $$;
create trigger incidencias after update of problema, estado on limpieza.trabajos for each row execute function limpieza._incidencias_de_trabajo();

-- automáticas: puntos «Mal» de la checklist del encargado, al enviarla
create or replace function limpieza._incidencias_de_revision() returns trigger language plpgsql security definer set search_path = '' as $$
declare it jsonb;
begin
  if new.cerrado is not null and (tg_op = 'INSERT' or old.cerrado is null) then
    for it in select * from jsonb_array_elements(new.items) loop
      if it ->> 'estado' = 'mal' then
        perform limpieza._nueva_incidencia(new.empresa_id,
          '«' || (it ->> 'texto') || '» mal (' || coalesce(it ->> 'plantilla', 'checklist del encargado') || ')' || coalesce(': ' || nullif(it ->> 'nota', ''), ''),
          'encargado', null, null, null, false, case when it ->> 'foto' is not null then jsonb_build_array(it ->> 'foto') else '[]' end, null, new.id);
      end if;
    end loop;
    perform nucleo.notificar(new.empresa_id, nucleo.usuarios_con_permiso('limpieza.excel.editar', new.empresa_id),
      'Checklist del encargado enviada', to_char(new.fecha, 'DD/MM') || ' · ' ||
        (select count(*) from jsonb_array_elements(new.items) x where x ->> 'estado' = 'mal') || ' mal', '/m/limpieza/finde', 'revision-' || new.id);
  end if;
  return null;
exception when others then
  raise warning 'incidencias de una revisión: %', sqlerrm;
  return null;
end $$;
create trigger incidencias after insert or update of cerrado on limpieza.revisiones for each row execute function limpieza._incidencias_de_revision();

-- ---------- problemas repetidos ----------
create table limpieza.problemas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references nucleo.empresas(id),
  tema            text not null,
  lugar_clave     text not null,
  lugar           text,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'en_marcha', 'solucionado', 'descartado')),
  primera         date,
  ultima          date,
  reabierto       int not null default 0,
  solucionado_en  timestamptz,
  creado          timestamptz not null default now(),
  unique (empresa_id, tema, lugar_clave)
);
comment on table limpieza.problemas is 'Problemas repetidos: el mismo tema en el mismo sitio más de una vez en 7 días. Se sigue hasta solucionarlo; si vuelve a pasar, se reabre.';

-- cada vez que pasa algo con tema y sitio (un trabajo abierto por un operario o una incidencia)
create table limpieza.casos (
  caso         uuid primary key,              -- el trabajo o la incidencia (una incidencia de un trabajo cuenta como ese trabajo)
  empresa_id   uuid not null references nucleo.empresas(id),
  tema         text not null,
  lugar_clave  text not null,
  fecha        date not null,
  problema_id  uuid references limpieza.problemas(id),
  descartado   boolean not null default false
);
create index on limpieza.casos (empresa_id, tema, lugar_clave, fecha);
comment on table limpieza.casos is 'Cada cosa que ha pasado con tema y sitio (para detectar los problemas repetidos).';

create table limpieza.problema_notas (
  id           uuid primary key default gen_random_uuid(),
  problema_id  uuid not null references limpieza.problemas(id),
  empresa_id   uuid not null references nucleo.empresas(id),
  texto        text check (texto is null or length(texto) <= 1000),
  estado       text,
  creado       timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);
create trigger solo_anadir before update or delete on limpieza.problema_notas for each row execute function nucleo._solo_anadir();

create or replace function limpieza._caso(p_empresa uuid, p_caso uuid, p_tema text, p_clave text, p_lugar text, p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
declare pr limpieza.problemas; nuevo boolean := false;
begin
  if p_tema is null or p_clave is null then return; end if;
  insert into limpieza.casos (caso, empresa_id, tema, lugar_clave, fecha) values (p_caso, p_empresa, p_tema, p_clave, p_fecha)
  on conflict (caso) do nothing;
  if not found then return; end if;                                         -- ya contado (el trabajo y su incidencia son lo mismo)
  select * into pr from limpieza.problemas where empresa_id = p_empresa and tema = p_tema and lugar_clave = p_clave for update;
  if found then
    if pr.estado in ('solucionado', 'descartado') then
      update limpieza.problemas set estado = 'pendiente', reabierto = reabierto + 1, ultima = p_fecha, solucionado_en = null where id = pr.id;
      insert into limpieza.problema_notas (problema_id, empresa_id, texto, estado) values (pr.id, p_empresa, 'Ha vuelto a pasar', 'pendiente');
      nuevo := true;
    else
      update limpieza.problemas set ultima = greatest(ultima, p_fecha) where id = pr.id;
    end if;
    update limpieza.casos set problema_id = pr.id where caso = p_caso;
  elsif exists (select 1 from limpieza.casos c where c.empresa_id = p_empresa and c.tema = p_tema and c.lugar_clave = p_clave
                   and c.caso <> p_caso and c.fecha between p_fecha - 7 and p_fecha and not c.descartado) then
    insert into limpieza.problemas (empresa_id, tema, lugar_clave, lugar, primera, ultima)
    values (p_empresa, p_tema, p_clave, coalesce(nullif(trim(p_lugar), ''), p_clave),
            (select min(c.fecha) from limpieza.casos c where c.empresa_id = p_empresa and c.tema = p_tema and c.lugar_clave = p_clave
               and c.fecha >= p_fecha - 7 and not c.descartado), p_fecha)
    returning * into pr;
    update limpieza.casos set problema_id = pr.id
     where empresa_id = p_empresa and tema = p_tema and lugar_clave = p_clave and fecha >= p_fecha - 7 and not descartado and problema_id is null;
    nuevo := true;
  end if;
  if nuevo then
    perform nucleo.notificar(p_empresa, nucleo.usuarios_con_permiso('limpieza.incidencia.editar', p_empresa),
      'Problema repetido: ' || pr.tema || ' en ' || coalesce(pr.lugar, pr.lugar_clave), case when pr.estado in ('solucionado', 'descartado') then 'Ha vuelto a pasar' end,
      '/m/limpieza/incidencias', 'problema-' || pr.id);
  end if;
end $$;

-- un trabajo abierto por un operario (no las fijas ni los del Excel) cuenta como caso
create or replace function limpieza._caso_de_trabajo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.clase <> 'fija' and new.creado_por is not null and coalesce(new.origen, '') not like 'excel%' then
    perform limpieza._caso(new.empresa_id, new.id, limpieza._tema(new.empresa_id, new.titulo || ' ' || coalesce(new.descripcion, '')),
      limpieza._clave_lugar(new.empresa_id, new.activo_id, coalesce(new.lugar, (select u.nombre from nucleo.ubicaciones u where u.id = new.ubicacion_id))),
      coalesce(new.lugar, (select a.codigo from nucleo.activos a where a.id = new.activo_id)), new.fecha);
  end if;
  return null;
exception when others then
  raise warning 'caso de un trabajo: %', sqlerrm;
  return null;
end $$;
create trigger caso after insert on limpieza.trabajos for each row execute function limpieza._caso_de_trabajo();

create or replace function limpieza.problema_estado(p_id uuid, p_estado text, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare pr limpieza.problemas;
begin
  select * into pr from limpieza.problemas where id = p_id for update;
  if not found or not nucleo.tiene_permiso('limpieza.incidencia.editar', pr.empresa_id) then raise exception 'NO_PERMISO'; end if;
  if p_estado not in ('pendiente', 'en_marcha', 'solucionado', 'descartado') then raise exception 'ESTADO_MAL'; end if;
  if length(trim(coalesce(p_nota, ''))) = 0 then raise exception 'FALTA_NOTA'; end if;
  update limpieza.problemas set estado = p_estado, solucionado_en = case when p_estado = 'solucionado' then now() end where id = p_id;
  insert into limpieza.problema_notas (problema_id, empresa_id, texto, estado) values (p_id, pr.empresa_id, left(trim(p_nota), 1000), p_estado);
end $$;

-- «No es lo mismo»: quitar un caso de un problema (si queda uno solo, se descarta)
create or replace function limpieza.problema_quitar(p_id uuid, p_caso uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pr limpieza.problemas;
begin
  select * into pr from limpieza.problemas where id = p_id for update;
  if not found or not nucleo.tiene_permiso('limpieza.incidencia.editar', pr.empresa_id) then raise exception 'NO_PERMISO'; end if;
  update limpieza.casos set problema_id = null, descartado = true where caso = p_caso and problema_id = p_id;
  if not found then raise exception 'NO_ESTA'; end if;
  insert into limpieza.problema_notas (problema_id, empresa_id, texto) values (p_id, pr.empresa_id, coalesce(nullif(trim(p_nota), ''), 'Quitado: no es lo mismo'));
  if (select count(*) from limpieza.casos where problema_id = p_id) < 2 then
    update limpieza.problemas set estado = 'descartado' where id = p_id;
    insert into limpieza.problema_notas (problema_id, empresa_id, texto, estado) values (p_id, pr.empresa_id, 'Queda un solo caso: descartado', 'descartado');
  end if;
end $$;

-- lo que sale en la lista de problemas: cada uno con sus casos (título, fecha, quién)
create or replace function limpieza.problemas_lista(p_empresa uuid, p_cerrados boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nucleo.tiene_permiso('limpieza.incidencia.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'casos', (select coalesce(jsonb_agg(jsonb_build_object('caso', c.caso, 'fecha', c.fecha,
                  'titulo', coalesce((select t.titulo from limpieza.trabajos t where t.id = c.caso), (select i.texto from limpieza.incidencias i where i.id = c.caso)),
                  'quien', coalesce((select pe.nombre from limpieza.trabajos t join nucleo.personas pe on pe.id = coalesce(t.hecho_por, t.asignados[1]) where t.id = c.caso),
                                    (select pe.nombre from limpieza.incidencias i join nucleo.personas pe on pe.id = i.persona_id where i.id = c.caso)))
                  order by c.fecha desc), '[]'::jsonb) from limpieza.casos c where c.problema_id = p.id),
      'notas', (select coalesce(jsonb_agg(jsonb_build_object('texto', n.texto, 'estado', n.estado, 'creado', n.creado,
                  'quien', (select u.nombre from nucleo.usuarios u where u.id = n.creado_por)) order by n.creado), '[]'::jsonb)
                  from limpieza.problema_notas n where n.problema_id = p.id))
      order by p.estado in ('solucionado', 'descartado'), p.ultima desc)
      from limpieza.problemas p
     where p.empresa_id = p_empresa and (p_cerrados or p.estado in ('pendiente', 'en_marcha') or p.solucionado_en > now() - interval '30 days')), '[]'::jsonb);
end $$;

-- ---------- notificaciones de Limpieza: trabajos al operario e instrucciones al encargado ----------
create or replace function limpieza._notificar_trabajo() returns trigger language plpgsql security definer set search_path = '' as $$
declare nuevos uuid[];
begin
  if new.estado = 'hecho' then return null; end if;
  if tg_op = 'INSERT' then
    if new.clase = 'fija' then return null; end if;                          -- las fijas de cada día no avisan
    nuevos := new.asignados;
  else
    nuevos := array(select x from unnest(new.asignados) x where not x = any(coalesce(old.asignados, '{}')));
  end if;
  if cardinality(nuevos) > 0 and new.fecha >= current_date then
    perform nucleo.notificar(new.empresa_id, nucleo.usuarios_de_personas(nuevos),
      case when new.urgente then 'Trabajo urgente: ' else 'Trabajo nuevo: ' end || left(new.titulo, 90),
      case when new.fecha = current_date then 'Para hoy' else 'Para el ' || to_char(new.fecha, 'DD/MM') end,
      '/m/limpieza/dia', 'trabajos-' || new.fecha, new.urgente);
  end if;
  return null;
exception when others then
  raise warning 'notificar trabajo: %', sqlerrm;
  return null;
end $$;
create trigger notificar after insert or update of asignados on limpieza.trabajos for each row execute function limpieza._notificar_trabajo();

create or replace function limpieza._notificar_instruccion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.anulado is null and new.leido_en is null and new.hasta >= current_date
     and (tg_op = 'INSERT' or (new.titulo, new.texto, new.desde, new.hasta) is distinct from (old.titulo, old.texto, old.desde, old.hasta)) then
    perform nucleo.notificar(new.empresa_id,
      array(select u from unnest(nucleo.usuarios_con_permiso('limpieza.trabajo.repartir', new.empresa_id)) u
             where not u = any(nucleo.usuarios_con_permiso('limpieza.excel.editar', new.empresa_id))),
      'Instrucciones: ' || new.titulo, left(new.texto, 200), '/m/limpieza/finde', 'instruccion-' || new.id);
  end if;
  return null;
end $$;
create trigger notificar after insert or update on limpieza.instrucciones for each row execute function limpieza._notificar_instruccion();

-- ---------- fotos de las incidencias: <empresa>/incidencias/<id>/<archivo> ----------
create policy limpieza_incidencia_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'limpieza' and split_part(name, '/', 2) = 'incidencias' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and nucleo.tiene_permiso('limpieza.trabajo.apuntar', split_part(name, '/', 1)::uuid));
create policy limpieza_incidencia_ver on storage.objects for select to authenticated using (
  bucket_id = 'limpieza' and split_part(name, '/', 2) = 'incidencias' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and (nucleo.tiene_permiso('limpieza.incidencia.editar', split_part(name, '/', 1)::uuid) or owner = auth.uid()));
-- el administrador de incidencias ve también las fotos de trabajos y revisiones que salen en ellas
create policy limpieza_incidencia_ver_otras on storage.objects for select to authenticated using (
  bucket_id = 'limpieza' and split_part(name, '/', 2) in ('trabajos', 'revisiones') and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and nucleo.tiene_permiso('limpieza.incidencia.editar', split_part(name, '/', 1)::uuid));

-- ---------- permisos y seguridad ----------
grant select on limpieza.temas, limpieza.incidencias, limpieza.incidencia_notas, limpieza.problemas, limpieza.problema_notas to authenticated;
grant insert, update on limpieza.temas to authenticated;
grant all on limpieza.temas, limpieza.incidencias, limpieza.incidencia_notas, limpieza.problemas, limpieza.problema_notas, limpieza.casos to service_role;
alter table limpieza.temas enable row level security;
alter table limpieza.incidencias enable row level security;
alter table limpieza.incidencia_notas enable row level security;
alter table limpieza.problemas enable row level security;
alter table limpieza.problema_notas enable row level security;
alter table limpieza.casos enable row level security;
create policy ver on limpieza.temas for select to authenticated using (nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id));
create policy crear on limpieza.temas for insert to authenticated with check (nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id));
create policy cambiar on limpieza.temas for update to authenticated
  using (nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id));
create policy ver on limpieza.incidencias for select to authenticated using (
  nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id) or creado_por = auth.uid());
create policy ver on limpieza.incidencia_notas for select to authenticated using (
  nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id)
  or exists (select 1 from limpieza.incidencias i where i.id = incidencia_id and i.creado_por = auth.uid()));
create policy ver on limpieza.problemas for select to authenticated using (nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id));
create policy ver on limpieza.problema_notas for select to authenticated using (nucleo.tiene_permiso('limpieza.incidencia.editar', empresa_id));
do $$ begin
  perform nucleo.activar_historial('limpieza.temas');
  perform nucleo.activar_historial('limpieza.incidencias');
  perform nucleo.activar_historial('limpieza.problemas');
end $$;

grant execute on function limpieza.crear_incidencia(uuid, text, text, uuid, boolean, jsonb, uuid), limpieza.incidencia_estado(uuid, text, text),
  limpieza.incidencia_nota(uuid, text), limpieza.problema_estado(uuid, text, text), limpieza.problema_quitar(uuid, uuid, text),
  limpieza.problemas_lista(uuid, boolean), nucleo.marcar_leidas(bigint[]) to authenticated;
revoke execute on function nucleo.usuarios_con_permiso(text, uuid), nucleo.usuarios_de_personas(uuid[]),
  nucleo.notificar(uuid, uuid[], text, text, text, text, boolean), nucleo._aviso_notificar(),
  limpieza._tema(uuid, text), limpieza._clave_lugar(uuid, uuid, text),
  limpieza._nueva_incidencia(uuid, text, text, text, uuid, uuid, boolean, jsonb, uuid, uuid, text, uuid),
  limpieza._incidencias_de_trabajo(), limpieza._incidencias_de_revision(), limpieza._caso(uuid, uuid, text, text, text, date),
  limpieza._caso_de_trabajo(), limpieza._notificar_trabajo(), limpieza._notificar_instruccion() from public, authenticated;
grant execute on function limpieza._plano(text) to authenticated;
