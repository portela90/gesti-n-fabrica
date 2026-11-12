-- =====================================================================================
-- 0002 · ROLES, PERMISOS Y SEGURIDAD POR FILA
-- Un permiso es «módulo.cosa.acción» (coladas.consumo.apuntar). Un rol es una lista de
-- permisos; en la lista vale el comodín * (coladas.* = todo Coladas, *.ver = ver todo).
-- A cada usuario se le asignan roles en una empresa y, si se quiere, solo en una nave.
-- La base de datos comprueba los permisos en cada fila (RLS): aunque alguien se salte
-- la pantalla, no puede leer ni cambiar lo que no le toca.
-- =====================================================================================

create table nucleo.permisos (
  codigo       text primary key check (codigo ~ '^[a-z]+\.[a-z_]+\.[a-z_]+$'),
  modulo       text not null references nucleo.modulos(codigo),
  descripcion  text not null
);
comment on table nucleo.permisos is 'Lista de todos los permisos que existen. Se rellena en 0004 y crece con cada módulo.';

create table nucleo.roles (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid references nucleo.empresas(id),
  codigo       text not null,
  nombre       text not null,
  descripcion  text,
  baja         timestamptz,
  unique nulls not distinct (empresa_id, codigo)
);
comment on table nucleo.roles is 'Roles. Sin empresa = plantilla para todas (administrador, encargado, operario…); con empresa = rol propio de esa empresa.';

create table nucleo.rol_permisos (
  rol_id   uuid not null references nucleo.roles(id) on delete cascade,
  permiso  text not null check (permiso ~ '^[a-z*]+(\.[a-z_*]+){0,2}$'),
  primary key (rol_id, permiso)
);
comment on table nucleo.rol_permisos is 'Qué permisos tiene cada rol. Admite comodín: coladas.*, *.ver, *.';

create table nucleo.asignaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references nucleo.usuarios(id) on delete cascade,
  rol_id      uuid not null references nucleo.roles(id),
  empresa_id  uuid not null references nucleo.empresas(id),
  centro_id   uuid,
  desde       timestamptz not null default now(),
  hasta       timestamptz,
  unique nulls not distinct (usuario_id, rol_id, empresa_id, centro_id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.asignaciones is 'Qué rol tiene cada usuario, en qué empresa y (opcional) en qué nave. hasta = fecha en que deja de valer.';
create index on nucleo.asignaciones (usuario_id);

-- un rol propio de una empresa solo se puede asignar en esa empresa
create or replace function nucleo._asignacion_valida() returns trigger language plpgsql as $$
begin
  if exists (select 1 from nucleo.roles r where r.id = new.rol_id and r.empresa_id is not null and r.empresa_id <> new.empresa_id) then
    raise exception 'ROL_DE_OTRA_EMPRESA';
  end if;
  return new;
end $$;
create trigger asignacion_valida before insert or update on nucleo.asignaciones
  for each row execute function nucleo._asignacion_valida();

-- ---------------------------------------------------------------------------
-- Funciones que usan las reglas de seguridad. «security definer» = leen las tablas
-- de permisos aunque el usuario no pueda verlas; «stable» = Postgres las calcula una
-- vez por consulta. search_path fijo para que nadie las engañe con otra tabla.
-- ---------------------------------------------------------------------------
create or replace function nucleo.soy_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.superadmin from nucleo.usuarios u where u.id = auth.uid() and u.baja is null), false)
$$;

-- empresa a la que pertenece una persona (para comprobar enlaces usuario ↔ persona)
create or replace function nucleo.empresa_de_persona(p_persona uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.empresa_id from nucleo.personas p where p.id = p_persona
$$;

-- empresas en las que el usuario tiene algún rol vigente
create or replace function nucleo.mis_empresas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.id from nucleo.empresas e where nucleo.soy_superadmin()
  union
  select a.empresa_id from nucleo.asignaciones a
    join nucleo.usuarios u on u.id = a.usuario_id and u.baja is null
   where a.usuario_id = auth.uid() and (a.hasta is null or a.hasta > now())
$$;

-- ¿puede el usuario hacer «permiso» en esa empresa (y nave)?
--  · centro null  = la fila no es de una nave concreta: vale cualquier rol de la empresa.
--  · centro dado  = vale un rol de toda la empresa o uno de esa misma nave.
--  · el módulo tiene que estar encendido en la empresa (el núcleo siempre lo está).
create or replace function nucleo.tiene_permiso(p_permiso text, p_empresa uuid, p_centro uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_empresa is null then false
    when nucleo.soy_superadmin() then true
    when split_part(p_permiso, '.', 1) <> 'nucleo' and not exists (
      select 1 from nucleo.empresa_modulos m
       where m.empresa_id = p_empresa and m.modulo = split_part(p_permiso, '.', 1) and m.activo) then false
    else exists (
      select 1
        from nucleo.asignaciones a
        join nucleo.usuarios u on u.id = a.usuario_id and u.baja is null
        join nucleo.roles r on r.id = a.rol_id and r.baja is null
        join nucleo.rol_permisos rp on rp.rol_id = r.id
       where a.usuario_id = auth.uid()
         and a.empresa_id = p_empresa
         and (a.hasta is null or a.hasta > now())
         and (a.centro_id is null or p_centro is null or a.centro_id = p_centro)
         and p_permiso like replace(replace(rp.permiso, '_', '\_'), '*', '%'))
  end
$$;

-- ¿tiene algún permiso de ese módulo? (para enseñar o esconder el módulo en el menú)
create or replace function nucleo.ve_modulo(p_modulo text, p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from nucleo.permisos pe where pe.modulo = p_modulo and nucleo.tiene_permiso(pe.codigo, p_empresa))
$$;

-- lo que necesita la app al arrancar: quién soy, mis empresas y qué puedo hacer en cada una
create or replace function nucleo.mi_sesion() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usuario', (select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'superadmin', u.superadmin, 'empresa_actual', u.empresa_actual)
                  from nucleo.usuarios u where u.id = auth.uid() and u.baja is null),
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'codigo', e.codigo, 'nombre', e.nombre,
        'modulos', coalesce((select jsonb_agg(m.modulo order by mo.orden) from nucleo.empresa_modulos m join nucleo.modulos mo on mo.codigo = m.modulo
                              where m.empresa_id = e.id and m.activo and nucleo.ve_modulo(m.modulo, e.id)), '[]'::jsonb),
        'permisos', coalesce((select jsonb_agg(pe.codigo order by pe.codigo) from nucleo.permisos pe where nucleo.tiene_permiso(pe.codigo, e.id)), '[]'::jsonb)
      ) order by e.nombre)
      from nucleo.empresas e where e.id in (select nucleo.mis_empresas()) and e.baja is null), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Seguridad por fila en TODAS las tablas del núcleo.
-- Ojo: sin «force». Las funciones security definer (dueño postgres) tienen que poder
-- leer las tablas de permisos sin pasar por estas reglas; si no, se llamarían en bucle.
-- ---------------------------------------------------------------------------
grant usage on schema nucleo to authenticated, service_role;
grant select, insert, update, delete on all tables in schema nucleo to authenticated;
grant all on all tables in schema nucleo to service_role;
grant execute on all functions in schema nucleo to authenticated;
revoke execute on function nucleo._asignacion_valida() from authenticated;

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'nucleo' loop
    execute format('alter table nucleo.%I enable row level security', t);
  end loop;
end $$;

-- Catálogos de la planta: los ve cualquiera de la empresa; los cambia quien tenga «nucleo.<cosa>.editar».
do $$ declare r record; begin
  for r in select * from (values
      ('centros', 'nave', 'centro_id'),  -- en centros, la nave es la propia fila (id)
      ('ubicaciones', 'ubicacion', 'centro_id'),
      ('turnos', 'turno', 'centro_id'),
      ('equipos', 'equipo', null),
      ('tipos_activo', 'activo', null),
      ('activos', 'activo', 'centro_id'),
      ('almacenes', 'almacen', 'centro_id'),
      ('familias', 'articulo', null),
      ('articulos', 'articulo', null),
      ('proveedores', 'proveedor', null),
      ('campos_extra', 'configuracion', null),
      ('ajustes', 'configuracion', 'centro_id')
    ) as x(tabla, cosa, col_centro) loop
    execute format('create policy ver on nucleo.%I for select to authenticated using (empresa_id in (select nucleo.mis_empresas()))', r.tabla);
    execute format('create policy crear on nucleo.%I for insert to authenticated with check (nucleo.tiene_permiso(%L, empresa_id%s))',
                   r.tabla, 'nucleo.' || r.cosa || '.editar', case when r.tabla = 'centros' then ', id' when r.col_centro is not null then ', ' || r.col_centro else '' end);
    execute format('create policy cambiar on nucleo.%I for update to authenticated using (nucleo.tiene_permiso(%L, empresa_id%s)) with check (nucleo.tiene_permiso(%L, empresa_id%s))',
                   r.tabla, 'nucleo.' || r.cosa || '.editar', case when r.tabla = 'centros' then ', id' when r.col_centro is not null then ', ' || r.col_centro else '' end,
                   'nucleo.' || r.cosa || '.editar', case when r.tabla = 'centros' then ', id' when r.col_centro is not null then ', ' || r.col_centro else '' end);
    execute format('create policy borrar on nucleo.%I for delete to authenticated using (nucleo.tiene_permiso(%L, empresa_id%s))',
                   r.tabla, 'nucleo.' || r.cosa || '.borrar', case when r.tabla = 'centros' then ', id' when r.col_centro is not null then ', ' || r.col_centro else '' end);
  end loop;
end $$;

-- Empresas: cada uno ve las suyas; solo el superadministrador las crea o cambia.
create policy ver on nucleo.empresas for select to authenticated using (id in (select nucleo.mis_empresas()));
create policy gestionar on nucleo.empresas for all to authenticated using (nucleo.soy_superadmin()) with check (nucleo.soy_superadmin());
create policy ver on nucleo.empresa_modulos for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy gestionar on nucleo.empresa_modulos for all to authenticated using (nucleo.soy_superadmin()) with check (nucleo.soy_superadmin());

-- Listas comunes (módulos, unidades, permisos): las lee cualquiera con usuario; no las cambia nadie desde la app.
create policy ver on nucleo.modulos for select to authenticated using (true);
create policy ver on nucleo.unidades for select to authenticated using (true);
create policy ver on nucleo.permisos for select to authenticated using (true);

-- Personas: datos personales. Las ve quien tenga «nucleo.persona.ver» (en su nave, si el rol es de nave) y cada uno la suya.
create policy ver on nucleo.personas for select to authenticated using (
  nucleo.tiene_permiso('nucleo.persona.ver', empresa_id, centro_id)
  or id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));
create policy crear on nucleo.personas for insert to authenticated with check (nucleo.tiene_permiso('nucleo.persona.editar', empresa_id, centro_id));
create policy cambiar on nucleo.personas for update to authenticated
  using (nucleo.tiene_permiso('nucleo.persona.editar', empresa_id, centro_id))
  with check (nucleo.tiene_permiso('nucleo.persona.editar', empresa_id, centro_id));
create policy borrar on nucleo.personas for delete to authenticated using (nucleo.tiene_permiso('nucleo.persona.borrar', empresa_id, centro_id));

-- Usuarios: cada uno ve su fila; los administradores de una empresa ven y gestionan los usuarios con rol en ella.
-- Nadie puede hacerse superadministrador a sí mismo (solo otro superadministrador).
create policy ver on nucleo.usuarios for select to authenticated using (
  id = auth.uid() or nucleo.soy_superadmin()
  or exists (select 1 from nucleo.asignaciones a where a.usuario_id = usuarios.id and nucleo.tiene_permiso('nucleo.usuario.ver', a.empresa_id)));
-- Al enlazar un usuario con un trabajador, el trabajador tiene que ser de una empresa donde quien lo hace puede
-- editar trabajadores (si no, alguien podría enlazarse con una persona de otra empresa y firmar por ella).
create policy crear on nucleo.usuarios for insert to authenticated with check (nucleo.soy_superadmin() or (
  not superadmin
  and exists (select 1 from nucleo.asignaciones a where a.usuario_id = auth.uid() and nucleo.tiene_permiso('nucleo.usuario.editar', a.empresa_id))
  and (persona_id is null or nucleo.tiene_permiso('nucleo.persona.editar', nucleo.empresa_de_persona(persona_id)))));
create policy cambiar on nucleo.usuarios for update to authenticated
  using (nucleo.soy_superadmin() or exists (select 1 from nucleo.asignaciones a where a.usuario_id = usuarios.id and nucleo.tiene_permiso('nucleo.usuario.editar', a.empresa_id)))
  with check (nucleo.soy_superadmin() or (
    not superadmin
    and (persona_id is null or nucleo.tiene_permiso('nucleo.persona.editar', nucleo.empresa_de_persona(persona_id)))));

-- Roles: plantillas (sin empresa) visibles para todos; los de una empresa, para esa empresa.
create policy ver on nucleo.roles for select to authenticated using (empresa_id is null or empresa_id in (select nucleo.mis_empresas()));
create policy gestionar on nucleo.roles for all to authenticated
  using (case when empresa_id is null then nucleo.soy_superadmin() else nucleo.tiene_permiso('nucleo.rol.editar', empresa_id) end)
  with check (case when empresa_id is null then nucleo.soy_superadmin() else nucleo.tiene_permiso('nucleo.rol.editar', empresa_id) end);
create policy ver on nucleo.rol_permisos for select to authenticated using (exists (select 1 from nucleo.roles r where r.id = rol_id));
create policy gestionar on nucleo.rol_permisos for all to authenticated
  using (exists (select 1 from nucleo.roles r where r.id = rol_id and case when r.empresa_id is null then nucleo.soy_superadmin() else nucleo.tiene_permiso('nucleo.rol.editar', r.empresa_id) end))
  with check (exists (select 1 from nucleo.roles r where r.id = rol_id and case when r.empresa_id is null then nucleo.soy_superadmin() else nucleo.tiene_permiso('nucleo.rol.editar', r.empresa_id) end));

-- Asignaciones: cada uno ve las suyas; quien gestiona usuarios en una empresa, las de esa empresa.
-- Un administrador de empresa no puede darse a sí mismo más roles.
create policy ver on nucleo.asignaciones for select to authenticated using (usuario_id = auth.uid() or nucleo.tiene_permiso('nucleo.usuario.ver', empresa_id));
create policy crear on nucleo.asignaciones for insert to authenticated with check (
  nucleo.soy_superadmin() or (usuario_id <> auth.uid() and nucleo.tiene_permiso('nucleo.usuario.editar', empresa_id, centro_id)));
create policy cambiar on nucleo.asignaciones for update to authenticated
  using (nucleo.soy_superadmin() or (usuario_id <> auth.uid() and nucleo.tiene_permiso('nucleo.usuario.editar', empresa_id, centro_id)))
  with check (nucleo.soy_superadmin() or (usuario_id <> auth.uid() and nucleo.tiene_permiso('nucleo.usuario.editar', empresa_id, centro_id)));
create policy borrar on nucleo.asignaciones for delete to authenticated using (
  nucleo.soy_superadmin() or (usuario_id <> auth.uid() and nucleo.tiene_permiso('nucleo.usuario.editar', empresa_id, centro_id)));

-- Archivos: los ve quien es de la empresa; los sube cualquiera de la empresa (cada módulo decide en sus tablas a qué se pegan).
create policy ver on nucleo.archivos for select to authenticated using (empresa_id in (select nucleo.mis_empresas()));
create policy crear on nucleo.archivos for insert to authenticated with check (empresa_id in (select nucleo.mis_empresas()) and subido_por = auth.uid());
create policy borrar on nucleo.archivos for delete to authenticated using (nucleo.tiene_permiso('nucleo.archivo.borrar', empresa_id));

-- Firmas: solo se añaden. La firma de una persona la ve ella y quien tenga permiso de ver firmas.
create policy ver on nucleo.firmas for select to authenticated using (
  nucleo.tiene_permiso(modulo || '.firma.ver', empresa_id)
  or persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));
create policy crear on nucleo.firmas for insert to authenticated with check (
  firmado_por = auth.uid() and empresa_id in (select nucleo.mis_empresas()) and (
    persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid())
    or nucleo.tiene_permiso(modulo || '.firma.recoger', empresa_id)));
-- (sin políticas de cambiar ni borrar: no se puede)

-- Incidencias: cada uno ve las suyas; quien gestiona soporte, las de su empresa.
create policy ver on nucleo.incidencias for select to authenticated using (
  usuario_id = auth.uid() or nucleo.soy_superadmin() or nucleo.tiene_permiso('nucleo.incidencia.gestionar', empresa_id));
create policy crear on nucleo.incidencias for insert to authenticated with check (
  usuario_id = auth.uid() and (empresa_id is null or empresa_id in (select nucleo.mis_empresas())));
create policy cambiar on nucleo.incidencias for update to authenticated
  using (nucleo.soy_superadmin() or nucleo.tiene_permiso('nucleo.incidencia.gestionar', empresa_id))
  with check (nucleo.soy_superadmin() or nucleo.tiene_permiso('nucleo.incidencia.gestionar', empresa_id));

-- Errores: se guardan con la función nucleo.anotar_error (abajo); solo los lee el superadministrador.
create policy ver on nucleo.errores for select to authenticated using (nucleo.soy_superadmin());
-- Versiones: las lee cualquiera; se publican desde el despliegue (service_role).
create policy ver on nucleo.versiones for select to authenticated using (true);

-- Anotar un error desde la app (agrupa por firma y suma veces).
create or replace function nucleo.anotar_error(p_firma text, p_mensaje text, p_pila text default null, p_url text default null,
                                              p_agente text default null, p_version text default null, p_empresa uuid default null)
returns void language sql volatile security definer set search_path = '' as $$
  insert into nucleo.errores (firma, app_version, mensaje, pila, url, agente, empresa_id, usuario_id)
  values (left(p_firma, 200), left(p_version, 40), left(p_mensaje, 1000), left(p_pila, 4000), left(p_url, 500), left(p_agente, 300),
          case when p_empresa in (select nucleo.mis_empresas()) then p_empresa end, auth.uid())
  on conflict (firma) do update set veces = nucleo.errores.veces + 1, ultimo = now(), visto = false,
    app_version = excluded.app_version, usuario_id = excluded.usuario_id
$$;
revoke execute on function nucleo.anotar_error(text, text, text, text, text, text, uuid) from public;
grant execute on function nucleo.anotar_error(text, text, text, text, text, text, uuid) to authenticated;
