-- =====================================================================================
-- 0032 · LIMPIEZA · INFORMES Y RESUMEN (parte 7, primer trozo)
-- Decidido por Cristian (20/11):
--  · Una sola pestaña «Resumen» en Limpieza con tres apartados: En pantalla, Informes e Investigar.
--  · Informe semanal (PDF + Excel) igual que la app vieja; informe por operario (PDF + Excel) con el tiempo real y,
--    para el administrador, sus horas con detalle; resumen en pantalla de 7 o 30 días o entre dos fechas.
--  · Lo ven el administrador (todo) y los encargados (sin horas): el Encargado hornos solo su equipo de responsable;
--    el resto de encargados, los trabajos del equipo que tienen en su ficha (el de fin de semana, los de su equipo).
--  · Cada lunes a las 9:00 (hora de Madrid) llega un aviso al administrador: «Ya está el informe de la semana N».
-- Además (pendiente de la parte 6): nucleo._push_resultado borra el error viejo cuando un reintento sale bien.
-- Solo depende del núcleo.
-- =====================================================================================

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('limpieza.informe.ver',  'limpieza', 'Ver el resumen y sacar los informes de limpieza de lo que me toca (mi equipo)'),
  ('limpieza.informe.todo', 'limpieza', 'Ver el resumen y los informes de limpieza de todos')
on conflict (codigo) do nothing;
-- Roles de partida: el encargado ya tiene «limpieza.*.ver» (coge informe.ver); «informe.todo» no acaba en .ver,
-- así que solo lo tiene el administrador («*»).

-- ---------- qué me toca ver en los informes ----------
-- 'todo' = todo; 'responsable' = responsable de un equipo (limpieza.responsables); 'equipo' = el equipo de mi ficha;
-- null = nada (sin permiso).
create or replace function limpieza._informe_alcance(p_empresa uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when nucleo.tiene_permiso('limpieza.informe.todo', p_empresa) then 'todo'
              when not nucleo.tiene_permiso('limpieza.informe.ver', p_empresa) then null
              when limpieza.mi_equipo(p_empresa) is not null then 'responsable'
              else 'equipo' end
$$;

-- la gente que me toca: todos, los de mi equipo de responsable (y yo) o los del equipo de mi ficha
create or replace function limpieza._informe_gente(p_empresa uuid, p_alcance text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case p_alcance
    when 'todo' then (select coalesce(array_agg(p.id), '{}') from nucleo.personas p where p.empresa_id = p_empresa)
    when 'responsable' then limpieza.mi_equipo(p_empresa) || coalesce(array[limpieza.mi_persona()], '{}')
    when 'equipo' then (select coalesce(array_agg(p.id), '{}') from nucleo.personas p
                         where p.empresa_id = p_empresa and p.equipo_id is not null
                           and p.equipo_id = (select y.equipo_id from nucleo.personas y where y.id = limpieza.mi_persona()))
    else '{}'::uuid[] end
$$;

-- ¿entra este trabajo en mis informes?
create or replace function limpieza._informe_entra(t limpieza.trabajos, p_alcance text, p_gente uuid[]) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_alcance = 'todo' then return true; end if;
  if p_alcance = 'responsable' then return limpieza._de_mi_equipo(t); end if;
  if p_alcance = 'equipo' then
    return cardinality(p_gente) > 0 and (
           t.asignados && p_gente or coalesce(t.asignados_orig, '{}') && p_gente or t.hecho_por = any(p_gente)
        or (t.equipo_id is not null and t.equipo_id = (select y.equipo_id from nucleo.personas y where y.id = limpieza.mi_persona())));
  end if;
  return false;
end $$;

-- ---------- los datos de los informes ----------
-- Todos los trabajos de unas fechas que me tocan, con los nombres ya puestos (personas, equipo, turno, máquina) y lo
-- que hace falta para las cuentas. También la gente que me toca (para elegir en «Informe por operario»).
-- Como mucho 400 días de una vez.
create or replace function limpieza.informe(p_empresa uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare alc text := limpieza._informe_alcance(p_empresa); gente uuid[];
begin
  if alc is null then raise exception 'NO_PERMISO'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'FECHAS_MAL'; end if;
  if p_hasta - p_desde > 400 then raise exception 'DEMASIADOS_DIAS'; end if;
  gente := limpieza._informe_gente(p_empresa, alc);
  return jsonb_build_object(
    'alcance', alc,
    'unidad', (select e.nombre from nucleo.empresas e where e.id = p_empresa),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'equipo_id', p.equipo_id,
                                          'equipo', (select q.nombre from nucleo.equipos q where q.id = p.equipo_id),
                                          'baja', p.baja) order by p.nombre)
        from nucleo.personas p
       where p.empresa_id = p_empresa and p.id = any(gente) and (p.baja is null or p.baja::date >= p_desde)), '[]'::jsonb),
    'trabajos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'fecha', t.fecha, 'clase', t.clase, 'tarea_id', t.tarea_id, 'titulo', t.titulo, 'descripcion', t.descripcion,
               'lugar', coalesce(t.lugar, (select u.nombre from nucleo.ubicaciones u where u.id = t.ubicacion_id)),
               'maquina', (select a.codigo from nucleo.activos a where a.id = t.activo_id),
               'minutos_est', t.minutos_est, 'minutos', t.minutos, 'tiempo_auto', t.tiempo_auto, 'estado', t.estado,
               'inicio', t.inicio, 'fin', t.fin, 'pausado_min', t.pausado_min,
               'hecho_por', t.hecho_por, 'hecho_por_nombre', (select p.nombre from nucleo.personas p where p.id = t.hecho_por),
               'asignados', t.asignados,
               'asignados_nombres', coalesce((select jsonb_agg(p.nombre order by p.nombre) from nucleo.personas p where p.id = any(t.asignados)), '[]'::jsonb),
               'asignados_orig_nombres', coalesce((select jsonb_agg(p.nombre order by p.nombre) from nucleo.personas p where p.id = any(t.asignados_orig)), '[]'::jsonb),
               'aviso_reparto', t.aviso_reparto, 'todo_equipo', t.todo_equipo,
               'equipo', (select q.nombre from nucleo.equipos q where q.id = t.equipo_id),
               'turno', (select r.nombre from nucleo.turnos r where r.id = t.turno_id),
               'urgente', t.urgente, 'origen', t.origen, 'problema', t.problema, 'nota', t.nota,
               'checklist_puntos', coalesce(jsonb_array_length(t.checklist), 0),
               'checklist_mal', (select count(*) from jsonb_array_elements(coalesce(t.checklist, '[]'::jsonb)) it
                                  where it ->> 'valor' = 'mal' or coalesce((it ->> 'bajo_minimo')::boolean, false)),
               'fotos', jsonb_array_length(t.fotos),
               'creado_por_nombre', (select w.nombre from nucleo.usuarios w where w.id = t.creado_por))
             order by t.fecha, t.titulo)
        from limpieza.trabajos t
       where t.empresa_id = p_empresa and t.fecha between p_desde and p_hasta
         and limpieza._informe_entra(t, alc, gente)), '[]'::jsonb));
end $$;
comment on function limpieza.informe(uuid, date, date) is 'Datos del resumen y de los informes de limpieza: los trabajos de unas fechas que le tocan a quien pregunta '
  '(alcance todo / responsable / equipo) y su gente. checklist_mal = puntos mal o por debajo del mínimo.';

-- ---------- aviso de los lunes a las 9:00 (hora de Madrid) ----------
-- pg_cron va en hora UTC y en España la hora cambia en verano: se llama los lunes a las 7 y a las 8 UTC y solo avisa
-- cuando en Madrid son las 9. Avisa una vez por semana y persona (etiqueta), y solo si la semana pasada hubo trabajos.
create or replace function limpieza._aviso_informe_semanal(p_ahora timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare loc timestamp := p_ahora at time zone 'Europe/Madrid'; lunes date; sem int; e record; quienes uuid[]; n int := 0; etq text;
begin
  if extract(isodow from loc) <> 1 or extract(hour from loc) <> 9 then return 0; end if;
  lunes := loc::date - 7;
  sem := extract(week from lunes)::int;
  etq := 'informe-limpieza-' || lunes;
  for e in select m.empresa_id from nucleo.empresa_modulos m where m.modulo = 'limpieza' and m.activo loop
    continue when not exists (select 1 from limpieza.trabajos t where t.empresa_id = e.empresa_id and t.fecha between lunes and lunes + 6);
    quienes := array(select u from unnest(nucleo.usuarios_con_permiso('limpieza.informe.todo', e.empresa_id)) u
                      where not exists (select 1 from nucleo.notificaciones x where x.usuario_id = u and x.empresa_id = e.empresa_id and x.etiqueta = etq));
    continue when cardinality(quienes) = 0;
    perform nucleo.notificar(e.empresa_id, quienes, 'Ya está el informe de la semana ' || sem,
      'Del ' || to_char(lunes, 'DD/MM') || ' al ' || to_char(lunes + 6, 'DD/MM') || '. Tócalo para sacar el PDF y el Excel.',
      '/m/limpieza/resumen/informes/' || lunes, etq, false);
    n := n + cardinality(quienes);
  end loop;
  return n;
end $$;
select cron.schedule('informe-limpieza-lunes', '0 7,8 * * 1', 'select limpieza._aviso_informe_semanal()');

-- ---------- avisos al móvil: un reintento que sale bien borra el error anterior ----------
create or replace function nucleo._push_resultado(p_secreto text, p_enviadas bigint[], p_errores jsonb, p_muertos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secreto is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto') then raise exception 'NO_PERMISO'; end if;
  update nucleo.notificaciones set enviado = now(), envio_error = null where id = any(coalesce(p_enviadas, '{}'));
  update nucleo.notificaciones n set envio_error = left(e.value, 300)
    from jsonb_each_text(coalesce(p_errores, '{}')) e where n.id = e.key::bigint;
  update nucleo.suscripciones set activo = false where endpoint = any(coalesce(p_muertos, '{}'));
  update nucleo.suscripciones s set ultimo_uso = now()
   where s.activo and exists (select 1 from nucleo.notificaciones n where n.id = any(coalesce(p_enviadas, '{}')) and n.usuario_id = s.usuario_id);
end $$;

-- ---------- quién puede llamar a qué ----------
revoke execute on function limpieza._informe_alcance(uuid), limpieza._informe_gente(uuid, text),
  limpieza._informe_entra(limpieza.trabajos, text, uuid[]), limpieza._aviso_informe_semanal(timestamptz) from public, authenticated, anon;
revoke execute on function nucleo._push_resultado(text, bigint[], jsonb, text[]) from public, authenticated, anon;
grant execute on function nucleo._push_resultado(text, bigint[], jsonb, text[]) to service_role;
revoke execute on function limpieza.informe(uuid, date, date) from public, anon;
grant execute on function limpieza.informe(uuid, date, date) to authenticated;
