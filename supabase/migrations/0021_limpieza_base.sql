-- =====================================================================================
-- 0021 · LIMPIEZA · BASE: tareas (fijas y habituales) y checklists.
-- Lo que prepara el administrador y luego usan todos:
--  · limpieza.tareas: las fijas (salen solas los días que tocan, para un equipo y turno) y las
--    habituales (las que se piden a menudo y se sacan de una lista: «Cambiar taladrina F25»).
--  · limpieza.plantillas: las checklists. Cada una es del encargado (la que hace él, p. ej. el
--    cierre del fin de semana) o sale al terminar ciertos trabajos (las máquinas cuyo código
--    encaja, p. ej. «F*», y las tareas que se elijan).
-- Las naves, zonas y máquinas NO van aquí: son del núcleo (centros, ubicaciones, activos).
-- No se borra nada: se da de baja (los trabajos de días pasados siguen apuntando a su tarea).
-- origen = de dónde vino la fila al traerla de la app de ahora (vacío = hecha en esta app).
-- Solo depende del núcleo.
-- =====================================================================================

create schema if not exists limpieza;

-- ---------- checklists ----------
create table limpieza.plantillas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  nombre      text not null check (length(trim(nombre)) between 1 and 120),
  cuando      text not null check (cuando in ('trabajos', 'encargado')),
  aplica      jsonb not null default '{}'::jsonb check (jsonb_typeof(aplica) = 'object' and length(aplica::text) <= 20000),
  puntos      jsonb not null default '[]'::jsonb check (jsonb_typeof(puntos) = 'array' and jsonb_array_length(puntos) <= 80 and length(puntos::text) <= 40000),
  orden       int not null default 0,
  baja        timestamptz,
  origen      text,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, id)
);
comment on table limpieza.plantillas is 'Checklists. cuando = «encargado» (la rellena el encargado) o «trabajos» (sale al terminar ciertos trabajos). '
  'aplica = {"codigos": "F*, M3", "excluir": "horno, derrame", "tareas": [uuid…]}. '
  'puntos = [{"texto": "Robot limpio", "tipo": "ok"|"num", "minimo": 2, "ayuda": "…", "foto_si_mal": true}, …].';

-- Cada punto tiene que tener texto y un tipo válido; «aplica» solo lleva lo que se sabe leer.
create or replace function limpieza._plantilla_valida() returns trigger language plpgsql set search_path = '' as $$
declare p jsonb;
begin
  for p in select * from jsonb_array_elements(new.puntos) loop
    if jsonb_typeof(p) <> 'object'
       or jsonb_typeof(p -> 'texto') is distinct from 'string' or length(trim(p ->> 'texto')) not between 1 and 200
       or coalesce(p ->> 'tipo', '') not in ('ok', 'num')
       or (p ? 'minimo' and jsonb_typeof(p -> 'minimo') not in ('number', 'null'))
       or (p ? 'ayuda' and jsonb_typeof(p -> 'ayuda') not in ('string', 'null'))
       or length(coalesce(p ->> 'ayuda', '')) > 300
       or (p ? 'foto_si_mal' and jsonb_typeof(p -> 'foto_si_mal') <> 'boolean') then
      raise exception 'PUNTO_MAL: cada punto necesita texto (hasta 200 letras) y tipo ok o num';
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(new.aplica) k where k not in ('codigos', 'excluir', 'tareas'))
     or (new.aplica ? 'codigos' and jsonb_typeof(new.aplica -> 'codigos') <> 'string')
     or (new.aplica ? 'excluir' and jsonb_typeof(new.aplica -> 'excluir') <> 'string')
     or (new.aplica ? 'tareas' and jsonb_typeof(new.aplica -> 'tareas') <> 'array') then
    raise exception 'APLICA_MAL';
  end if;
  if new.cuando = 'encargado' then new.aplica := '{}'::jsonb; end if;
  return new;
end $$;
create trigger valida before insert or update on limpieza.plantillas for each row execute function limpieza._plantilla_valida();

-- ---------- tareas fijas y habituales ----------
create table limpieza.tareas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references nucleo.empresas(id),
  clase         text not null check (clase in ('fija', 'habitual')),
  titulo        text not null check (length(trim(titulo)) between 1 and 120),
  descripcion   text check (descripcion is null or length(descripcion) <= 2000),
  grupo         text check (grupo is null or length(grupo) <= 60),
  lugar         text check (lugar is null or length(lugar) <= 120),
  ubicacion_id  uuid,
  activo_id     uuid,
  minutos_est   int check (minutos_est is null or minutos_est between 1 and 1440),
  -- solo las fijas: qué días (0 = domingo), para qué equipo y turno, y a quién
  dias          int[] check (dias is null or dias <@ '{0,1,2,3,4,5,6}'),
  equipo_id     uuid,
  turno_id      uuid,
  asignados     uuid[] not null default '{}' check (cardinality(asignados) <= 50),
  todo_equipo   boolean not null default false,
  -- solo las habituales: quién puede hacerlas (vacío = cualquiera)
  solo_para     uuid[] not null default '{}' check (cardinality(solo_para) <= 50),
  -- lo que gasta del almacén al terminarla (se enlaza con Almacén en la fase 3)
  articulo_id   uuid,
  cantidad      numeric check (cantidad is null or cantidad > 0),
  orden         int not null default 0,
  baja          timestamptz,
  origen        text,
  creado        timestamptz not null default now(),
  creado_por    uuid default auth.uid(),
  unique (empresa_id, id),
  foreign key (empresa_id, ubicacion_id) references nucleo.ubicaciones(empresa_id, id),
  foreign key (empresa_id, activo_id)    references nucleo.activos(empresa_id, id),
  foreign key (empresa_id, equipo_id)    references nucleo.equipos(empresa_id, id),
  foreign key (empresa_id, turno_id)     references nucleo.turnos(empresa_id, id),
  foreign key (empresa_id, articulo_id)  references nucleo.articulos(empresa_id, id),
  check (clase = 'habitual' or (coalesce(cardinality(dias), 0) > 0 and equipo_id is not null)),
  check (clase = 'fija' or (dias is null and equipo_id is null and turno_id is null and cardinality(asignados) = 0 and not todo_equipo)),
  check (clase = 'habitual' or cardinality(solo_para) = 0),
  check ((articulo_id is null) = (cantidad is null))
);
comment on table limpieza.tareas is 'Tareas de limpieza. fija = sale sola los días marcados para un equipo (y turno); habitual = se elige de una lista cuando hace falta. '
  'asignados / solo_para = personas del núcleo. articulo_id + cantidad = lo que gasta del almacén al terminarla.';
create index on limpieza.tareas (empresa_id, clase, orden);

-- Las personas tienen que ser de la misma unidad de trabajo.
create or replace function limpieza._tarea_valida() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.asignados || new.solo_para) x
              where not exists (select 1 from nucleo.personas p where p.id = x and p.empresa_id = new.empresa_id)) then
    raise exception 'PERSONA_DE_OTRA_UNIDAD';
  end if;
  new.asignados := array(select distinct unnest(new.asignados));
  new.solo_para := array(select distinct unnest(new.solo_para));
  if new.dias is not null then new.dias := array(select distinct unnest(new.dias) order by 1); end if;
  return new;
end $$;
create trigger valida before insert or update on limpieza.tareas for each row execute function limpieza._tarea_valida();

-- ---------- permisos ----------
insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.plan.ver',     'limpieza', 'Ver las tareas fijas y habituales y las checklists'),
  ('limpieza.plan.editar',  'limpieza', 'Crear, cambiar y dar de baja tareas fijas y habituales y checklists')
on conflict (codigo) do nothing;
-- Roles de partida: administrador «*» (lo tiene), encargado y solo lectura «limpieza.*.ver» (ven, no cambian).
-- El operario no los necesita: cada trabajo llevará su propia copia de la checklist.

-- ---------- seguridad por fila ----------
grant usage on schema limpieza to authenticated, service_role;
grant select, insert, update on limpieza.plantillas, limpieza.tareas to authenticated;
grant all on all tables in schema limpieza to service_role;
alter table limpieza.plantillas enable row level security;
alter table limpieza.tareas enable row level security;

create policy ver on limpieza.plantillas for select to authenticated using (
  nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy crear on limpieza.plantillas for insert to authenticated with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy cambiar on limpieza.plantillas for update to authenticated
  using (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));

create policy ver on limpieza.tareas for select to authenticated using (
  nucleo.tiene_permiso('limpieza.plan.ver', empresa_id) or nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy crear on limpieza.tareas for insert to authenticated with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
create policy cambiar on limpieza.tareas for update to authenticated
  using (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id)) with check (nucleo.tiene_permiso('limpieza.plan.editar', empresa_id));
-- Sin «borrar»: se da de baja.

do $$ begin
  perform nucleo.activar_historial('limpieza.plantillas');
  perform nucleo.activar_historial('limpieza.tareas');
end $$;

alter default privileges in schema limpieza revoke execute on functions from public;
