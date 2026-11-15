-- =====================================================================================
-- 0026 · NÚCLEO · AUSENCIAS (quién falta cada día, para todos los módulos)
-- Decidido por Cristian (15/11): las vacaciones y faltas que se apuntan en Personal sirven también en Limpieza, sin
-- apuntarlas dos veces. Como cada módulo solo puede leer el núcleo, Personal deja aquí una copia de cada ausencia:
--  · personal.vacaciones → una ausencia «vacaciones» de desde a hasta;
--  · personal.horas_dia con falta → una ausencia de ese día con su motivo (baja, vacaciones, permiso, otro).
-- La mantienen unos disparadores de Personal (al crear, cambiar o quitar): aquí nadie escribe a mano.
-- =====================================================================================

create table nucleo.ausencias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  persona_id  uuid not null,
  desde       date not null,
  hasta       date not null,
  motivo      text not null check (motivo in ('vacaciones', 'baja', 'permiso', 'otro')),
  origen      text not null unique,
  creado      timestamptz not null default now(),
  check (hasta >= desde),
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
create index on nucleo.ausencias (empresa_id, desde, hasta);
comment on table nucleo.ausencias is 'Quién falta y cuándo (copia de lo que se apunta en Personal: vacaciones y faltas de «Horas del día»). '
  'origen = de dónde sale (personal.vacaciones:<id> o personal.horas_dia:<id>). Solo la escriben los disparadores.';

alter table nucleo.ausencias enable row level security;
grant select on nucleo.ausencias to authenticated;
grant all on nucleo.ausencias to service_role;
create policy ver on nucleo.ausencias for select to authenticated using (
  nucleo.tiene_permiso('nucleo.persona.ver', empresa_id) or persona_id = (select u.persona_id from nucleo.usuarios u where u.id = auth.uid()));

-- ¿Falta esta persona ese día? (el motivo, o nada)
create or replace function nucleo.ausencia(p_persona uuid, p_fecha date) returns text
language sql stable security definer set search_path = '' as $$
  select a.motivo from nucleo.ausencias a where a.persona_id = p_persona and p_fecha between a.desde and a.hasta
   order by case a.motivo when 'baja' then 1 when 'vacaciones' then 2 when 'permiso' then 3 else 4 end limit 1
$$;
grant execute on function nucleo.ausencia(uuid, date) to authenticated;

-- ---------- Personal deja aquí sus ausencias ----------
create or replace function personal._ausencia_vacacion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then delete from nucleo.ausencias where origen = 'personal.vacaciones:' || old.id; end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen)
    values (new.empresa_id, new.persona_id, new.desde, new.hasta, 'vacaciones', 'personal.vacaciones:' || new.id);
  end if;
  return null;
end $$;
create trigger ausencia after insert or update or delete on personal.vacaciones for each row execute function personal._ausencia_vacacion();

create or replace function personal._ausencia_horas() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then delete from nucleo.ausencias where origen = 'personal.horas_dia:' || old.id; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.falta is not null then
    insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen)
    values (new.empresa_id, new.persona_id, new.fecha, new.fecha, new.falta, 'personal.horas_dia:' || new.id);
  end if;
  return null;
end $$;
create trigger ausencia after insert or update or delete on personal.horas_dia for each row execute function personal._ausencia_horas();
revoke execute on function personal._ausencia_vacacion(), personal._ausencia_horas() from public, authenticated;

-- ---------- lo que ya había ----------
insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen)
select empresa_id, persona_id, desde, hasta, 'vacaciones', 'personal.vacaciones:' || id from personal.vacaciones
on conflict (origen) do nothing;
insert into nucleo.ausencias (empresa_id, persona_id, desde, hasta, motivo, origen)
select empresa_id, persona_id, fecha, fecha, falta, 'personal.horas_dia:' || id from personal.horas_dia where falta is not null
on conflict (origen) do nothing;
