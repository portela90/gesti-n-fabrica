-- Copia semanal de Limpieza · tareas y equipos (parte 8, decidido por Cristian el 22/11). SIN DATOS: el archivo de cada semana
-- empieza llenando v_tf (tareas fijas), v_th (habituales), v_trab (nombre y equipos de cada trabajador), v_hab (habilidades) y v_resp
-- (responsable de hornos) con lo de la vieja (leer-vieja-limpieza-tareas.sql). Reglas:
--  · Tareas: la vieja manda en lo que ella tiene (título, descripción, días, equipo, turno, quién, minutos, «solo para», sitio, grupo de
--    las habituales y si está activa). Lo que solo existe en la nueva (grupo de las fijas, máquina o zona) no se toca.
--    Se reconocen por su origen «limpieza-cie:tareas_fijas:<id>» / «…tareas_habituales:<id>». Las inactivas que nunca se copiaron, no se crean.
--  · Equipos de cada trabajador, habilidades y responsable de hornos: solo se AVISA de las diferencias (no se cambia nada).
--  · Todo o nada. Al final, un resumen.

create temp table r_resumen (orden int, que text, cuantos bigint, detalle text);

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Limpieza');
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Limpieza'; end if;

  create temp table r_tf as
  select f.*, 'limpieza-cie:tareas_fijas:' || f.id origen_n,
    (select q.id from nucleo.equipos q where q.empresa_id = v_emp and q.codigo = case lower(f.equipo) when 'semana' then 'semana' when 'finde' then 'finde' end) equipo_n,
    (select q.id from nucleo.turnos q where q.empresa_id = v_emp and lower(q.nombre) = lower(f.turno)) turno_n,
    (select array_agg(distinct d order by d) from unnest(f.dias) x(n), unnest(case lower(x.n)
        when 'todos' then case when lower(f.equipo) = 'finde' then '{0,6}'::int[] else '{1,2,3,4,5}'::int[] end
        when 'domingo' then '{0}' when 'lunes' then '{1}' when 'martes' then '{2}' when 'miercoles' then '{3}' when 'miércoles' then '{3}'
        when 'jueves' then '{4}' when 'viernes' then '{5}' when 'sabado' then '{6}' when 'sábado' then '{6}' else '{}' end) y(d)) dias_n
  from v_tf f;

  with q as (
    update limpieza.tareas t set titulo = left(trim(r.titulo), 120), descripcion = nullif(trim(r.descripcion), ''), dias = r.dias_n, equipo_id = r.equipo_n,
      turno_id = r.turno_n, asignados = coalesce(r.asignados, '{}'), todo_equipo = coalesce(r.todo_equipo, false), minutos_est = r.minutos_est,
      baja = case when r.vivo then null else coalesce(t.baja, now()) end
    from r_tf r where t.empresa_id = v_emp and t.origen = r.origen_n
      and (t.titulo, coalesce(t.descripcion, ''), t.dias, t.equipo_id, t.turno_id, t.asignados, t.todo_equipo, t.minutos_est, t.baja is null)
          is distinct from (left(trim(r.titulo), 120), coalesce(nullif(trim(r.descripcion), ''), ''), r.dias_n, r.equipo_n, r.turno_n,
                            coalesce(r.asignados, '{}'), coalesce(r.todo_equipo, false), r.minutos_est, r.vivo)
    returning t.titulo)
  insert into r_resumen select 1, 'Tareas fijas cambiadas', count(*), string_agg(titulo, ', ') from q;
  with q as (
    insert into limpieza.tareas (empresa_id, clase, titulo, descripcion, dias, equipo_id, turno_id, asignados, todo_equipo, minutos_est, origen)
    select v_emp, 'fija', left(trim(r.titulo), 120), nullif(trim(r.descripcion), ''), r.dias_n, r.equipo_n, r.turno_n, coalesce(r.asignados, '{}'),
           coalesce(r.todo_equipo, false), r.minutos_est, r.origen_n
      from r_tf r where r.vivo and not exists (select 1 from limpieza.tareas t where t.empresa_id = v_emp and t.origen = r.origen_n)
    returning titulo)
  insert into r_resumen select 2, 'Tareas fijas nuevas', count(*), string_agg(titulo, ', ') from q;

  with q as (
    update limpieza.tareas t set titulo = left(trim(r.titulo), 120), descripcion = nullif(trim(r.descripcion), ''), lugar = left(nullif(trim(r.lugar), ''), 120),
      minutos_est = r.minutos_est, solo_para = coalesce(r.solo_para, '{}'), grupo = nullif(trim(r.grupo), ''),
      baja = case when r.vivo then null else coalesce(t.baja, now()) end
    from v_th r where t.empresa_id = v_emp and t.origen = 'limpieza-cie:tareas_habituales:' || r.id
      and (t.titulo, coalesce(t.descripcion, ''), coalesce(t.lugar, ''), t.minutos_est, t.solo_para, coalesce(t.grupo, ''), t.baja is null)
          is distinct from (left(trim(r.titulo), 120), coalesce(nullif(trim(r.descripcion), ''), ''), coalesce(left(nullif(trim(r.lugar), ''), 120), ''),
                            r.minutos_est, coalesce(r.solo_para, '{}'), coalesce(nullif(trim(r.grupo), ''), ''), r.vivo)
    returning t.titulo)
  insert into r_resumen select 3, 'Tareas habituales cambiadas', count(*), string_agg(titulo, ', ') from q;
  with q as (
    insert into limpieza.tareas (empresa_id, clase, titulo, descripcion, lugar, minutos_est, solo_para, grupo, origen)
    select v_emp, 'habitual', left(trim(r.titulo), 120), nullif(trim(r.descripcion), ''), left(nullif(trim(r.lugar), ''), 120), r.minutos_est,
           coalesce(r.solo_para, '{}'), nullif(trim(r.grupo), ''), 'limpieza-cie:tareas_habituales:' || r.id
      from v_th r where r.vivo and not exists (select 1 from limpieza.tareas t where t.empresa_id = v_emp and t.origen = 'limpieza-cie:tareas_habituales:' || r.id)
    returning titulo)
  insert into r_resumen select 4, 'Tareas habituales nuevas', count(*), string_agg(titulo, ', ') from q;

  -- solo avisos
  insert into r_resumen select 10, 'Aviso: trabajadores en otro equipo en la vieja (no se cambia; míralo en Configuración → Trabajadores)', count(*),
         string_agg(p.nombre || ' (vieja: ' || array_to_string(v.equipos, ', ') || ')', '; ')
    from v_trab v join nucleo.personas p on p.id = v.id and p.empresa_id = v_emp left join nucleo.equipos q on q.id = p.equipo_id
   where v.activo and p.baja is null
     and not (lower(coalesce(q.codigo, '')) = any (select case lower(e) when 'semana' then 'semana' when 'finde' then 'finde' end from unnest(v.equipos) e));
  insert into r_resumen select 11, 'Aviso: trabajadores activos en la vieja y de baja (o sin ficha) en la nueva', count(*), string_agg(coalesce(v.nombre, v.id::text), ', ')
    from v_trab v where v.activo and not exists (select 1 from nucleo.personas p where p.id = v.id and p.empresa_id = v_emp and p.baja is null);
  insert into r_resumen select 12, 'Aviso: habilidades distintas (grupos de reparto; míralo en Limpieza → Personas)', count(*), string_agg(p.nombre || ': ' || h.habilidad, '; ')
    from v_hab h join nucleo.personas p on p.id = h.trabajador
   where h.activo <> coalesce((select h.habilidad = any (lp.grupos) from limpieza.personas lp where lp.persona_id = h.trabajador), false);
  insert into r_resumen select 13, 'Aviso: responsable de hornos distinto (míralo en Limpieza → Personas)', count(*), string_agg(p.nombre || ' → ' || o.nombre, '; ')
    from v_resp v join nucleo.personas p on p.id = v.resp join nucleo.personas o on o.id = v.operario
   where v.activo <> coalesce((select v.operario = any (r.operarios) from limpieza.responsables r where r.persona_id = v.resp), false);
end $$;

select que as "Qué", cuantos as "Cuántos", coalesce(detalle, '') as "Detalle" from r_resumen where cuantos > 0 order by orden;
