-- =====================================================================================
-- 0022 · PERSONAL · HORAS DEL DÍA (como «Horas del día» de la app vieja de Limpieza)
-- Decidido por Cristian (14/11): de momento las horas del mes salen del calendario + faltas y extras
-- (el fichaje vendrá más adelante), con las mismas reglas que la app vieja.
--  · Cada trabajador tiene en su ficha su jornada (completa, parcial, de otra empresa), sus horas de
--    contrato a la semana y su horario de cada día de la semana: {"lunes": [["08:00","13:00"],["14:00","16:00"]], …}
--    (como en la app vieja; ya venía así al traer los trabajadores). Eso dice lo que hace un día normal.
--  · El calendario de Personal dice lo que cambia ese día: festivo, cierre o descanso = 0 h; jornada intensiva,
--    horario especial o «trabaja» = sus horas; vacaciones = falta «vacaciones».
--  · En «Horas del día» se apunta solo lo distinto: horas trabajadas, de ellas fuera de presupuesto (no las paga
--    el servicio), extra a mano (se pagan como extra), falta y motivo.
-- La bolsa de horas (35 h o las de contrato a la semana) se calcula en la app a partir de lo de aquí.
-- =====================================================================================

-- ---------- la ficha: horas de contrato y horario bien escrito ----------
alter table nucleo.personas add column horas_semana numeric(5,2) check (horas_semana is null or horas_semana between 0 and 80);
comment on column nucleo.personas.horas_semana is 'Horas de contrato a la semana (jornada completa: con ellas se calcula la bolsa; vacío = 35).';

-- nombre del día de la semana como lo guarda el horario (0 = domingo)
create or replace function nucleo.nombre_dia(dow int) returns text
language sql immutable set search_path = '' as $$
  select (array['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[dow + 1]
$$;

-- {"lunes".."domingo": [["HH:MM","HH:MM"], …]} con cada tramo de menos a más
create or replace function nucleo.horario_valido(h jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select h is null or (jsonb_typeof(h) = 'object'
    and not exists (select 1 from jsonb_object_keys(h) k where k not in ('lunes','martes','miercoles','jueves','viernes','sabado','domingo'))
    and not exists (
      select 1 from jsonb_each(h) d
       where jsonb_typeof(d.value) <> 'array' or jsonb_array_length(d.value) > 4
          or exists (select 1 from jsonb_array_elements(d.value) t
                      where jsonb_typeof(t) <> 'array' or jsonb_array_length(t) <> 2
                         or (t ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (t ->> 1) !~ '^([01][0-9]|2[0-4]):[0-5][0-9]$'
                         or (t ->> 0) >= (t ->> 1))))
$$;
-- (las funciones nuevas del núcleo nacen sin permiso; la comprobación la usa quien guarda la ficha)
grant execute on function nucleo.nombre_dia(int), nucleo.horario_valido(jsonb) to authenticated;
alter table nucleo.personas add constraint horario_valido check (nucleo.horario_valido(horario));
comment on column nucleo.personas.horario is 'Horario de un día normal por día de la semana: {"lunes": [["08:00","13:00"],["14:00","16:00"]], "sabado": []}. Vacío = sin horario propio.';

-- horas de un horario un día de la semana
create or replace function nucleo.horas_horario(h jsonb, dow int) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(sum(extract(epoch from ((t ->> 1)::time - (t ->> 0)::time)) / 3600), 0)::numeric
    from jsonb_array_elements(coalesce(h -> nucleo.nombre_dia(dow), '[]'::jsonb)) t
$$;
grant execute on function nucleo.horas_horario(jsonb, int) to authenticated;

-- ---------- lo que se corrige de cada día ----------
create table personal.horas_dia (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  persona_id   uuid not null,
  fecha        date not null,
  trabajadas   numeric(4,2) check (trabajadas is null or trabajadas between 0 and 24),
  fuera        numeric(4,2) not null default 0 check (fuera between 0 and 24),
  extra_mano   numeric(4,2) check (extra_mano is null or extra_mano between 0 and 24),
  falta        text check (falta is null or falta in ('baja', 'vacaciones', 'permiso', 'otro')),
  nota         text check (nota is null or length(nota) <= 500),
  origen       text,
  creado       timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  unique (empresa_id, persona_id, fecha),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id),
  check (trabajadas is null or fuera <= trabajadas),
  check ((fuera = 0 and coalesce(extra_mano, 0) = 0) or length(trim(coalesce(nota, ''))) > 0)
);
comment on table personal.horas_dia is 'Lo que se corrige de un día de un trabajador. trabajadas vacío = las de su horario y calendario; '
  'fuera = de ellas, horas que no paga el servicio; extra_mano = horas que se pagan como extra; falta = baja, vacaciones, permiso u otra. '
  'Con horas fuera o extra, el motivo (nota) es obligatorio.';
create index on personal.horas_dia (empresa_id, fecha);

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('personal.horas.editar', 'personal', 'Ver y corregir las horas de todos (horas del día, del mes y bolsa)')
on conflict (codigo) do nothing;
-- Solo el administrador («*»). A propósito no acaba en .ver ni .apuntar: el encargado («personal.*.ver») y el
-- operario («*.*.apuntar») no ven las horas de los demás. Cada uno ve las suyas con personal.horas_dias.

grant select, insert, update, delete on personal.horas_dia to authenticated;
grant all on personal.horas_dia to service_role;
alter table personal.horas_dia enable row level security;
create policy ver on personal.horas_dia for select to authenticated using (
  nucleo.tiene_permiso('personal.horas.editar', empresa_id)
  or persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));
create policy crear on personal.horas_dia for insert to authenticated with check (nucleo.tiene_permiso('personal.horas.editar', empresa_id));
create policy cambiar on personal.horas_dia for update to authenticated
  using (nucleo.tiene_permiso('personal.horas.editar', empresa_id)) with check (nucleo.tiene_permiso('personal.horas.editar', empresa_id));
create policy borrar on personal.horas_dia for delete to authenticated using (nucleo.tiene_permiso('personal.horas.editar', empresa_id));
select nucleo.activar_historial('personal.horas_dia');

-- ---------- las horas de cada día ----------
-- Una fila por trabajador (sin los de otra empresa ni los de baja antes del día) y día, con lo que le toca
-- (prevista), lo apuntado y lo que vale al final. Quien tiene personal.horas.editar ve a todos; los demás, solo a sí mismos.
create or replace function personal.horas_dias(p_empresa uuid, p_desde date, p_hasta date, p_persona uuid default null)
returns table (persona_id uuid, nombre text, jornada text, horas_semana numeric, fecha date, dow int,
               tipo_dia text, nombre_dia text, horario numeric, prevista numeric, vacaciones boolean,
               apuntado boolean, trabajadas numeric, fuera numeric, extra_mano numeric, falta text, nota text, horas numeric)
language sql stable security definer set search_path = '' as $$
  with yo as (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()),
  todos as (select nucleo.tiene_permiso('personal.horas.editar', p_empresa) as si),
  pe as (
    select p.* from nucleo.personas p
     where p.empresa_id = p_empresa and coalesce(p.jornada, '') <> 'externo'
       and (p_persona is null or p.id = p_persona)
       and ((select si from todos) or p.id = (select persona_id from yo))),
  dias as (select g::date as f from generate_series(p_desde, least(p_hasta, p_desde + 400), interval '1 day') g),
  base as (
    select pe.id, pe.nombre, pe.jornada, pe.horas_semana, d.f, extract(dow from d.f)::int as dw, pe.horario as hor, pe.baja,
           c.horas_dia as cal_horas, c.dias_semana as cal_dias, m.tipo, m.nombre as mnombre, m.horas as mhoras,
           exists (select 1 from personal.vacaciones v where v.empresa_id = p_empresa and v.persona_id = pe.id and d.f between v.desde and v.hasta) as vac,
           h.id as hid, h.trabajadas as h_tra, h.fuera as h_fu, h.extra_mano as h_em, h.falta as h_fa, h.nota as h_no
      from pe cross join dias d
      left join personal.calendario_personas cp on cp.empresa_id = p_empresa and cp.persona_id = pe.id and cp.anio = extract(year from d.f)::int
      left join personal.calendarios c on c.id = cp.calendario_id
      left join personal.dias m on m.calendario_id = c.id and m.fecha = d.f
      left join personal.horas_dia h on h.empresa_id = p_empresa and h.persona_id = pe.id and h.fecha = d.f
     where pe.baja is null or pe.baja::date > d.f),
  calc as (
    select b.*,
      -- un día normal: su horario; si no tiene, el del calendario (si ese día se trabaja)
      (case when b.hor is not null then nucleo.horas_horario(b.hor, b.dw)
            when b.cal_dias is not null and b.dw = any(b.cal_dias) then coalesce(b.cal_horas[b.dw + 1], 0)
            else 0 end)::numeric as normal
      from base b),
  prev as (
    select c.*,
      (case when c.tipo in ('festivo', 'cierre', 'descanso') then 0
            when c.tipo in ('intensiva', 'especial', 'trabaja') then coalesce(c.mhoras, c.normal)
            else c.normal end)::numeric as prevista,
      coalesce(c.h_fa, case when c.vac then 'vacaciones' end) as fa
      from calc c)
  select p.id, p.nombre, p.jornada, p.horas_semana, p.f, p.dw, p.tipo, p.mnombre, p.normal, p.prevista, p.vac,
         p.hid is not null, p.h_tra, coalesce(p.h_fu, 0), p.h_em, p.fa, p.h_no,
         (case when p.fa is not null then 0 else coalesce(p.h_tra, p.prevista) end)::numeric
    from prev p
   order by p.nombre, p.f
$$;
comment on function personal.horas_dias(uuid, date, date, uuid) is 'Horas de cada trabajador cada día: horario = su día normal; prevista = lo que le toca según el calendario; '
  'horas = lo que vale (con falta 0; si no, lo apuntado o lo previsto). Como mucho 401 días.';
revoke execute on function personal.horas_dias(uuid, date, date, uuid) from public;
grant execute on function personal.horas_dias(uuid, date, date, uuid) to authenticated;

-- ---------- guardar las horas de un día de varios a la vez ----------
-- p_items = [{"persona_id", "trabajadas", "fuera", "extra_mano", "falta", "nota"}, …]. Si no queda nada distinto
-- (sin horas cambiadas, sin fuera, sin extra, sin falta), la fila se quita. security invoker: valen las reglas de arriba.
create or replace function personal.guardar_horas_dia(p_empresa uuid, p_fecha date, p_items jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare x jsonb; n int := 0; tra numeric; fu numeric; em numeric; fa text; no text;
begin
  if not nucleo.tiene_permiso('personal.horas.editar', p_empresa) then raise exception 'NO_PERMISO'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'DEMASIADAS'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    tra := nullif(x ->> 'trabajadas', '')::numeric; fu := coalesce(nullif(x ->> 'fuera', '')::numeric, 0);
    em := nullif(x ->> 'extra_mano', '')::numeric; fa := nullif(x ->> 'falta', ''); no := nullif(trim(coalesce(x ->> 'nota', '')), '');
    if fa is not null and tra is null then tra := 0; end if;
    if tra is null and fu = 0 and coalesce(em, 0) = 0 and fa is null then
      delete from personal.horas_dia h where h.empresa_id = p_empresa and h.persona_id = (x ->> 'persona_id')::uuid and h.fecha = p_fecha;
    else
      insert into personal.horas_dia (empresa_id, persona_id, fecha, trabajadas, fuera, extra_mano, falta, nota)
      values (p_empresa, (x ->> 'persona_id')::uuid, p_fecha, tra, fu, em, fa, no)
      on conflict (empresa_id, persona_id, fecha) do update
        set trabajadas = excluded.trabajadas, fuera = excluded.fuera, extra_mano = excluded.extra_mano,
            falta = excluded.falta, nota = excluded.nota;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function personal.guardar_horas_dia(uuid, date, jsonb) from public;
grant execute on function personal.guardar_horas_dia(uuid, date, jsonb) to authenticated;

-- ---------- desde cuándo cuenta la bolsa (ajuste, no escrito en el código) ----------
-- nucleo.ajustes, módulo personal, clave «bolsa_inicio» = un lunes (la bolsa empieza ahí con 0 h). Se pone desde la app.
