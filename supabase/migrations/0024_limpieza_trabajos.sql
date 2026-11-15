-- =====================================================================================
-- 0024 · LIMPIEZA · TRABAJOS DEL DÍA («Mi día» y «Trabajo abierto» del operario)
-- Decidido por Cristian (15/11):
--  · Tiempo como la app vieja: Empezar y Terminar; si no pulsó Empezar se le pregunta cuánto ha tardado; si tarda
--    menos de lo previsto se apunta lo previsto (tiempo_auto = sí).
--  · Fotos como ahora: obligatoria solo cuando un punto de la checklist con «foto si está mal» está mal.
--  · Las fijas son solo de su día; lo que crea alguien a mano (habitual de la lista o suelto) sigue hasta que se haga.
--  · Sin cobertura, la app guarda empezar, pausar, terminar y la checklist y los manda luego: por eso las acciones
--    aceptan «cuándo» (la hora del móvil, dentro de unos límites) y repetir una ya hecha no da error grave (YA_HECHO).
--  · La checklist sale por el nombre del trabajo (y el código de su máquina) con las reglas de la app vieja
--    (_check_casa): «F*» = una F con número, «M3-M11» = de la 3 a la 11, «F28» = esa, otra palabra = la contiene;
--    «excluir» = si el nombre lleva esa palabra no sale; y en las tareas habituales marcadas.
-- Todo se cambia con funciones (no a mano en la tabla) para que las reglas estén en un solo sitio.
-- Solo depende del núcleo.
-- =====================================================================================

create table limpieza.trabajos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references nucleo.empresas(id),
  fecha          date not null,
  clase          text not null check (clase in ('fija', 'habitual', 'suelto')),
  tarea_id       uuid,
  titulo         text not null check (length(trim(titulo)) between 1 and 120),
  descripcion    text check (descripcion is null or length(descripcion) <= 2000),
  lugar          text check (lugar is null or length(lugar) <= 120),
  ubicacion_id   uuid,
  activo_id      uuid,
  minutos_est    int check (minutos_est is null or minutos_est between 1 and 1440),
  equipo_id      uuid,
  turno_id       uuid,
  asignados      uuid[] not null default '{}',
  todo_equipo    boolean not null default false,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'pausado', 'hecho')),
  inicio         timestamptz,
  pausa_desde    timestamptz,
  pausado_min    int not null default 0 check (pausado_min >= 0),
  fin            timestamptz,
  minutos        int check (minutos is null or minutos between 1 and 1440),
  tiempo_auto    boolean not null default false,
  hecho_por      uuid,
  checklist      jsonb check (checklist is null or (jsonb_typeof(checklist) = 'array' and length(checklist::text) <= 60000)),
  fotos          jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 30),
  nota           text check (nota is null or length(nota) <= 1000),
  problema       text check (problema is null or length(problema) <= 1000),
  problema_en    timestamptz,
  origen         text,
  creado         timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  unique (empresa_id, id),
  foreign key (empresa_id, tarea_id)     references limpieza.tareas(empresa_id, id),
  foreign key (empresa_id, ubicacion_id) references nucleo.ubicaciones(empresa_id, id),
  foreign key (empresa_id, activo_id)    references nucleo.activos(empresa_id, id),
  foreign key (empresa_id, equipo_id)    references nucleo.equipos(empresa_id, id),
  foreign key (empresa_id, turno_id)     references nucleo.turnos(empresa_id, id),
  check (estado <> 'hecho' or (fin is not null and minutos is not null))
);
create unique index trabajos_fija_dia on limpieza.trabajos (tarea_id, fecha) where clase = 'fija';
create index on limpieza.trabajos (empresa_id, fecha);
create index on limpieza.trabajos (empresa_id, estado) where estado <> 'hecho';
comment on table limpieza.trabajos is 'Cada trabajo de limpieza de un día. clase: fija (sale sola de su tarea), habitual (de la lista), suelto (escrito a mano). '
  'checklist = lo que se contestó al terminar: [{plantilla, texto, tipo, minimo, valor, foto, bajo_minimo}]. fotos = [{ruta, momento, en}].';

-- ---------- quién es quién ----------
create or replace function limpieza.mi_persona() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.persona_id from nucleo.usuarios u where u.id = auth.uid() and u.baja is null
$$;

-- ¿Es mío este trabajo? Estoy en él, es de todo mi equipo o lo he creado yo.
create or replace function limpieza.es_mio(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select limpieza.mi_persona() = any(t.asignados)
      or (t.todo_equipo and t.equipo_id is not null and t.equipo_id = (select p.equipo_id from nucleo.personas p where p.id = limpieza.mi_persona()))
      or t.creado_por = auth.uid()
$$;
create or replace function limpieza.puedo_ver(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select nucleo.tiene_permiso('limpieza.trabajo.ver', t.empresa_id) or (limpieza.es_mio(t) and nucleo.tiene_permiso('limpieza.trabajo.apuntar', t.empresa_id))
$$;
create or replace function limpieza.puedo_apuntar(t limpieza.trabajos) returns boolean
language sql stable security definer set search_path = '' as $$
  select nucleo.tiene_permiso('limpieza.trabajo.corregir', t.empresa_id) or (limpieza.es_mio(t) and nucleo.tiene_permiso('limpieza.trabajo.apuntar', t.empresa_id))
$$;

-- ---------- ¿sale esta checklist en este trabajo? (las reglas de la app vieja) ----------
create or replace function limpieza.encaja(a jsonb, p_texto text, p_tarea uuid) returns boolean
language plpgsql immutable set search_path = '' as $$
declare t text := lower(coalesce(p_texto, '')); tok text; m text[]; lo int; hi int; n text;
begin
  if a is null or a = '{}'::jsonb then return false; end if;
  foreach tok in array regexp_split_to_array(coalesce(a ->> 'excluir', ''), '\s*,\s*') loop
    tok := lower(trim(tok)); if tok <> '' and position(tok in t) > 0 then return false; end if;
  end loop;
  if p_tarea is not null and jsonb_typeof(a -> 'tareas') = 'array' and (a -> 'tareas') @> to_jsonb(p_tarea::text) then return true; end if;
  foreach tok in array regexp_split_to_array(coalesce(a ->> 'codigos', ''), '\s*,\s*') loop
    tok := lower(trim(tok)); continue when tok = '';
    m := regexp_match(tok, '^([a-zñ]+)-?\*$');                                          -- F*
    if m is not null then
      if t ~ ('(^|[^a-z0-9ñ])' || m[1] || '-?\d+([^0-9]|$)') then return true; end if; continue; end if;
    m := regexp_match(tok, '^([a-zñ]+)-?(\d+)\s*-\s*(?:[a-zñ]+)?-?(\d+)$');              -- M3-M11
    if m is not null then
      lo := least(m[2]::int, m[3]::int); hi := greatest(m[2]::int, m[3]::int);
      for n in select (regexp_matches(t, '(?:^|[^a-z0-9ñ])' || m[1] || '-?(\d+)(?=[^0-9]|$)', 'g'))[1] loop
        if n::int between lo and hi then return true; end if;
      end loop; continue; end if;
    m := regexp_match(tok, '^([a-zñ]+)-?(\d+)$');                                       -- F28
    if m is not null then
      for n in select (regexp_matches(t, '(?:^|[^a-z0-9ñ])' || m[1] || '-?(\d+)(?=[^0-9]|$)', 'g'))[1] loop
        if n::int = m[2]::int then return true; end if;
      end loop; continue; end if;
    if position(tok in t) > 0 then return true; end if;                                  -- palabra
  end loop;
  return false;
end $$;

-- texto con el que se compara: el nombre del trabajo y el código de su máquina
create or replace function limpieza._texto(t limpieza.trabajos) returns text
language sql stable security definer set search_path = '' as $$
  select t.titulo || coalesce(' ' || (select a.codigo from nucleo.activos a where a.id = t.activo_id), '')
$$;

-- Los puntos que tocan al terminar este trabajo (de todas las checklists que encajan, en su orden)
create or replace function limpieza.puntos(p_trabajo uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t limpieza.trabajos;
begin
  select * into t from limpieza.trabajos where id = p_trabajo;
  if not found or not limpieza.puedo_ver(t) then raise exception 'NO_PERMISO'; end if;
  return coalesce((
    select jsonb_agg(p.value || jsonb_build_object('plantilla', pl.nombre) order by pl.orden, pl.nombre, p.ordinality)
      from limpieza.plantillas pl, jsonb_array_elements(pl.puntos) with ordinality p
     where pl.empresa_id = t.empresa_id and pl.baja is null and pl.cuando = 'trabajos'
       and limpieza.encaja(pl.aplica, limpieza._texto(t), t.tarea_id)), '[]'::jsonb);
end $$;

-- ---------- los trabajos del día ----------
-- Saca las fijas que tocan ese día (una vez; si ya están, no las repite). Solo de hoy en adelante (con un día de
-- margen por la hora del móvil).
create or replace function limpieza.generar_dia(p_empresa uuid, p_fecha date) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_fecha < current_date - 1 then return 0; end if;
  insert into limpieza.trabajos (empresa_id, fecha, clase, tarea_id, titulo, descripcion, lugar, ubicacion_id, activo_id, minutos_est,
                                 equipo_id, turno_id, asignados, todo_equipo, creado_por)
  select t.empresa_id, p_fecha, 'fija', t.id, t.titulo, t.descripcion, t.lugar, t.ubicacion_id, t.activo_id, t.minutos_est,
         t.equipo_id, t.turno_id, t.asignados, t.todo_equipo, null
    from limpieza.tareas t
   where t.empresa_id = p_empresa and t.clase = 'fija' and t.baja is null and extract(dow from p_fecha)::int = any(t.dias)
  on conflict (tarea_id, fecha) where clase = 'fija' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Lo que ve cada uno ese día: los del día y, si es hoy o después, lo que se creó a mano y sigue sin hacer.
-- Con los nombres de quién va en cada trabajo (para saber con quién lo comparte), su máquina y su zona.
create or replace function limpieza.mi_dia(p_empresa uuid, p_fecha date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (nucleo.tiene_permiso('limpieza.trabajo.ver', p_empresa) or nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa)) then
    raise exception 'NO_PERMISO';
  end if;
  perform limpieza.generar_dia(p_empresa, p_fecha);
  return coalesce((
    select jsonb_agg(to_jsonb(t) || jsonb_build_object(
             'atrasado', t.fecha < p_fecha,
             'nombres', (select coalesce(jsonb_agg(p.nombre order by p.nombre), '[]'::jsonb) from nucleo.personas p where p.id = any(t.asignados)),
             'hecho_por_nombre', (select p.nombre from nucleo.personas p where p.id = t.hecho_por),
             'maquina', (select a.codigo from nucleo.activos a where a.id = t.activo_id),
             'zona', (select u.nombre from nucleo.ubicaciones u where u.id = t.ubicacion_id),
             'turno', (select x.nombre from nucleo.turnos x where x.id = t.turno_id),
             'mio', limpieza.es_mio(t),
             'puedo', limpieza.puedo_apuntar(t))
           order by t.estado = 'hecho', t.fecha, t.titulo)
      from limpieza.trabajos t
     where t.empresa_id = p_empresa and limpieza.puedo_ver(t)
       and (t.fecha = p_fecha
            or (t.clase <> 'fija' and t.estado <> 'hecho' and t.fecha < p_fecha and p_fecha >= current_date - 1)
            or (t.estado = 'hecho' and t.fecha < p_fecha and (t.fin at time zone 'UTC')::date between p_fecha - 1 and p_fecha and t.clase <> 'fija'))),
    '[]'::jsonb);
end $$;

-- ---------- acciones ----------
-- «cuándo» viene del móvil (puede ser de cuando no había red): vale hasta 2 días atrás y 5 minutos adelante.
create or replace function limpieza._cuando(p timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case when p is null or p > now() + interval '5 minutes' or p < now() - interval '2 days' then now() else p end
$$;

create or replace function limpieza._mio_para_apuntar(p_trabajo uuid) returns limpieza.trabajos
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos;
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not limpieza.puedo_apuntar(t) then raise exception 'NO_PERMISO'; end if;
  if t.estado = 'hecho' then raise exception 'YA_HECHO'; end if;
  return t;
end $$;

create or replace function limpieza.empezar(p_trabajo uuid, p_cuando timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos := limpieza._mio_para_apuntar(p_trabajo);
begin
  if t.estado <> 'pendiente' then return; end if;   -- ya empezado: no pasa nada (puede venir repetido de sin red)
  update limpieza.trabajos set estado = 'en_curso', inicio = limpieza._cuando(p_cuando) where id = p_trabajo;
end $$;

create or replace function limpieza.pausar(p_trabajo uuid, p_cuando timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos := limpieza._mio_para_apuntar(p_trabajo);
begin
  if t.estado <> 'en_curso' then return; end if;
  update limpieza.trabajos set estado = 'pausado', pausa_desde = greatest(limpieza._cuando(p_cuando), t.inicio) where id = p_trabajo;
end $$;

create or replace function limpieza.seguir(p_trabajo uuid, p_cuando timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos := limpieza._mio_para_apuntar(p_trabajo); c timestamptz;
begin
  if t.estado <> 'pausado' then return; end if;
  c := greatest(limpieza._cuando(p_cuando), t.pausa_desde);
  update limpieza.trabajos set estado = 'en_curso', pausa_desde = null,
         pausado_min = t.pausado_min + (extract(epoch from (c - t.pausa_desde)) / 60)::int where id = p_trabajo;
end $$;

-- Terminar: los minutos que dice el móvil (lo medido o lo que contestó); con previsto, nunca menos que lo previsto.
-- p_checklist = [{"valor": "bien"|"mal"|número, "foto": ruta}, …] en el orden de limpieza.puntos(p_trabajo).
create or replace function limpieza.terminar(p_trabajo uuid, p_minutos int, p_checklist jsonb default '[]',
                                             p_nota text default null, p_cuando timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos := limpieza._mio_para_apuntar(p_trabajo);
        pts jsonb := limpieza.puntos(p_trabajo); r jsonb := '[]'::jsonb; i int; p jsonb; x jsonb; v jsonb; c timestamptz := limpieza._cuando(p_cuando); m int;
begin
  if p_minutos is null or p_minutos < 1 or p_minutos > 720 then raise exception 'TIEMPO_MAL'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]')) <> 'array' or jsonb_array_length(coalesce(p_checklist, '[]')) <> jsonb_array_length(pts) then
    raise exception 'CHECKLIST_MAL: faltan puntos por contestar';
  end if;
  for i in 0 .. jsonb_array_length(pts) - 1 loop
    p := pts -> i; x := p_checklist -> i; v := x -> 'valor';
    if p ->> 'tipo' = 'ok' then
      if v is null or v #>> '{}' not in ('bien', 'mal') then raise exception 'CHECKLIST_MAL: «%» sin contestar', p ->> 'texto'; end if;
      if v #>> '{}' = 'mal' and coalesce((p ->> 'foto_si_mal')::boolean, false)
         and coalesce(x ->> 'foto', '') not like t.empresa_id || '/trabajos/' || t.id || '/%' then
        raise exception 'FOTO_FALTA: «%» está mal y necesita foto', p ->> 'texto';
      end if;
    else
      if v is null or jsonb_typeof(v) <> 'number' then raise exception 'CHECKLIST_MAL: «%» sin número', p ->> 'texto'; end if;
    end if;
    r := r || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('plantilla', p ->> 'plantilla', 'texto', p ->> 'texto', 'tipo', p ->> 'tipo',
           'minimo', p -> 'minimo', 'valor', v, 'foto', nullif(x ->> 'foto', ''),
           'bajo_minimo', case when p ->> 'tipo' = 'num' and jsonb_typeof(p -> 'minimo') = 'number' then (v)::numeric < (p ->> 'minimo')::numeric end)));
  end loop;
  m := case when t.minutos_est is not null then greatest(p_minutos, t.minutos_est) else p_minutos end;
  update limpieza.trabajos set estado = 'hecho', fin = c, minutos = m, tiempo_auto = (t.minutos_est is not null and p_minutos < t.minutos_est),
         inicio = coalesce(t.inicio, c - make_interval(mins => m)), pausa_desde = null, hecho_por = limpieza.mi_persona(),
         checklist = r, nota = coalesce(nullif(trim(coalesce(p_nota, '')), ''), t.nota)
   where id = p_trabajo;
end $$;

-- Añadir una foto (ya subida al almacén, en la carpeta del trabajo)
create or replace function limpieza.poner_foto(p_trabajo uuid, p_ruta text, p_momento text default 'trabajo') returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos;
begin
  select * into t from limpieza.trabajos where id = p_trabajo for update;
  if not found or not limpieza.puedo_apuntar(t) then raise exception 'NO_PERMISO'; end if;
  if coalesce(p_ruta, '') not like t.empresa_id || '/trabajos/' || t.id || '/%' or length(p_ruta) > 300 then raise exception 'RUTA_MAL'; end if;
  if coalesce(p_momento, '') not in ('trabajo', 'punto', 'problema') then raise exception 'MOMENTO_MAL'; end if;
  if t.fotos @> jsonb_build_array(jsonb_build_object('ruta', p_ruta)) then return; end if;   -- repetida (sin red)
  update limpieza.trabajos set fotos = fotos || jsonb_build_array(jsonb_build_object('ruta', p_ruta, 'momento', p_momento, 'en', now(), 'por', limpieza.mi_persona()))
   where id = p_trabajo;
end $$;

-- «Hay un problema»: queda en el trabajo (las incidencias de verdad llegan en la parte 6)
create or replace function limpieza.avisar_problema(p_trabajo uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare t limpieza.trabajos;
begin
  select * into t from limpieza.trabajos where id = p_trabajo;
  if not found or not limpieza.puedo_apuntar(t) then raise exception 'NO_PERMISO'; end if;
  if length(trim(coalesce(p_texto, ''))) not between 1 and 1000 then raise exception 'TEXTO_MAL'; end if;
  update limpieza.trabajos set problema = trim(p_texto), problema_en = now() where id = p_trabajo;
end $$;

-- Las tareas habituales que puedo coger (todas las que no son solo para otros)
create or replace function limpieza.habituales_para_mi(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'descripcion', t.descripcion, 'grupo', t.grupo, 'lugar', t.lugar,
                                               'minutos_est', t.minutos_est, 'maquina', (select a.codigo from nucleo.activos a where a.id = t.activo_id))
                            order by t.grupo nulls last, t.orden, t.titulo), '[]'::jsonb)
    from limpieza.tareas t
   where t.empresa_id = p_empresa and t.clase = 'habitual' and t.baja is null
     and nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa)
     and (cardinality(t.solo_para) = 0 or limpieza.mi_persona() = any(t.solo_para) or nucleo.tiene_permiso('limpieza.trabajo.corregir', p_empresa))
$$;

-- Crear un trabajo para mí: de la lista de habituales (p_tarea) o escrito a mano (p_titulo). Sigue hasta que se haga.
create or replace function limpieza.crear_trabajo(p_empresa uuid, p_fecha date, p_tarea uuid default null, p_titulo text default null,
                                                  p_activo uuid default null, p_nota text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h limpieza.tareas; yo uuid := limpieza.mi_persona(); nuevo uuid;
begin
  if not nucleo.tiene_permiso('limpieza.trabajo.apuntar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if yo is null then raise exception 'SIN_FICHA'; end if;
  if p_fecha is null or p_fecha < current_date - 1 or p_fecha > current_date + 1 then raise exception 'FECHA_MAL'; end if;
  if p_activo is not null and not exists (select 1 from nucleo.activos a where a.id = p_activo and a.empresa_id = p_empresa) then raise exception 'NO_PERMISO'; end if;
  if p_tarea is not null then
    select * into h from limpieza.tareas where id = p_tarea and empresa_id = p_empresa and clase = 'habitual' and baja is null;
    if not found or not (cardinality(h.solo_para) = 0 or yo = any(h.solo_para) or nucleo.tiene_permiso('limpieza.trabajo.corregir', p_empresa)) then
      raise exception 'NO_PERMISO';
    end if;
    insert into limpieza.trabajos (empresa_id, fecha, clase, tarea_id, titulo, descripcion, lugar, ubicacion_id, activo_id, minutos_est, asignados, nota)
    values (p_empresa, p_fecha, 'habitual', h.id, h.titulo, h.descripcion, h.lugar, h.ubicacion_id, coalesce(p_activo, h.activo_id), h.minutos_est,
            array[yo], nullif(trim(coalesce(p_nota, '')), ''))
    returning id into nuevo;
  else
    if length(trim(coalesce(p_titulo, ''))) not between 1 and 120 then raise exception 'TITULO_MAL'; end if;
    insert into limpieza.trabajos (empresa_id, fecha, clase, titulo, activo_id, asignados, nota)
    values (p_empresa, p_fecha, 'suelto', trim(p_titulo), p_activo, array[yo], nullif(trim(coalesce(p_nota, '')), ''))
    returning id into nuevo;
  end if;
  return nuevo;
end $$;

-- ---------- permisos y seguridad ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.trabajo.ver',      'limpieza', 'Ver los trabajos de limpieza de todos'),
  ('limpieza.trabajo.apuntar',  'limpieza', 'Apuntar mis trabajos: empezar, pausar, terminar, checklist, fotos y crear uno de la lista'),
  ('limpieza.trabajo.corregir', 'limpieza', 'Apuntar o corregir los trabajos de los demás')
on conflict (codigo) do nothing;
-- Roles de partida: operario «*.*.apuntar» (los suyos); encargado «limpieza.*.ver/apuntar/corregir»; administrador «*».

grant select on limpieza.trabajos to authenticated;
grant all on limpieza.trabajos to service_role;
alter table limpieza.trabajos enable row level security;
create policy ver on limpieza.trabajos for select to authenticated using (limpieza.puedo_ver(trabajos));
-- Sin insert/update/delete directos: todo pasa por las funciones de arriba.
select nucleo.activar_historial('limpieza.trabajos');

grant execute on function limpieza.mi_persona(), limpieza.es_mio(limpieza.trabajos), limpieza.puedo_ver(limpieza.trabajos),
  limpieza.puedo_apuntar(limpieza.trabajos), limpieza.encaja(jsonb, text, uuid), limpieza.puntos(uuid), limpieza.mi_dia(uuid, date),
  limpieza.empezar(uuid, timestamptz), limpieza.pausar(uuid, timestamptz), limpieza.seguir(uuid, timestamptz),
  limpieza.terminar(uuid, int, jsonb, text, timestamptz), limpieza.poner_foto(uuid, text, text), limpieza.avisar_problema(uuid, text),
  limpieza.habituales_para_mi(uuid), limpieza.crear_trabajo(uuid, date, uuid, text, uuid, text) to authenticated;
revoke execute on function limpieza.generar_dia(uuid, date), limpieza._texto(limpieza.trabajos), limpieza._mio_para_apuntar(uuid), limpieza._cuando(timestamptz) from public, authenticated;

-- ---------- almacén de fotos ----------
-- Cubo privado «limpieza», solo imágenes de hasta 10 MB. Ruta: <unidad>/trabajos/<trabajo>/<archivo>.
-- Ve y sube quien ve / apunta ese trabajo. Nada se cambia ni se borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('limpieza', 'limpieza', false, 10485760, '{image/jpeg,image/png}')
on conflict (id) do nothing;

create or replace function limpieza.trabajo_de_ruta(p_ruta text) returns limpieza.trabajos
language sql stable security definer set search_path = '' as $$
  select t.* from limpieza.trabajos t
   where split_part(p_ruta, '/', 2) = 'trabajos'
     and split_part(p_ruta, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and t.id = split_part(p_ruta, '/', 3)::uuid and t.empresa_id::text = split_part(p_ruta, '/', 1)
$$;
grant execute on function limpieza.trabajo_de_ruta(text) to authenticated;

create policy limpieza_ver on storage.objects for select to authenticated using (
  bucket_id = 'limpieza' and coalesce(limpieza.puedo_ver(limpieza.trabajo_de_ruta(name)), false));
create policy limpieza_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'limpieza' and coalesce(limpieza.puedo_apuntar(limpieza.trabajo_de_ruta(name)), false));
