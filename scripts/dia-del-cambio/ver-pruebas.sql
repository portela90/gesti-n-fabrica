-- PEGAR EN colada-mapri. SOLO MIRA: lista lo que se borraría (generado por scripts/dia-del-cambio/montar.sh).
-- Día del cambio · qué es de PRUEBA (decidido por Cristian el 22/11). SIN DATOS PERSONALES: se reconoce por reglas.
--  · Las fichas «pruebas» y «Pruebas 2» de Limpieza y todo lo suyo (usuarios, móviles, códigos, calendario solo suyo, envíos y firmas,
--    vacaciones, horas, ausencias, ficha, documentos, certificados, asistencias, sitio en el reparto).
--  · Lo de prueba del administrador principal (el usuario superadmin con ficha): documentos y certificados hechos en la app nueva
--    (sin origen) y sus envíos de calendario firmados antes del 23/11.
--  · Limpieza: los trabajos hechos en la app nueva antes del 17/11 (sin origen). Prevención: las charlas (sesiones) hechas en la app
--    nueva antes del 23/11, con sus asistencias y firmas. NO se tocan las incidencias de verdad (la de la Karcher, copiada de la vieja).
create temp table r_obj (orden int, tabla text, id uuid, que text);

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Limpieza');
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Limpieza'; end if;
  insert into r_obj select 90, 'nucleo.personas', p.id, p.nombre from nucleo.personas p where p.empresa_id = v_emp and lower(trim(p.nombre)) in ('pruebas', 'pruebas 2');
  create temp table r_s as select u.persona_id id from nucleo.usuarios u where u.superadmin and u.persona_id is not null;

  insert into r_obj select 80, 'nucleo.usuarios', u.id, u.nombre || case when u.email is null then ' (PIN)' else ' (correo)' end from nucleo.usuarios u
   where not u.superadmin and (u.persona_id in (select id from r_obj where tabla = 'nucleo.personas') or lower(trim(u.nombre)) in ('pruebas', 'prueba', 'pruebas 2'));

  insert into r_obj select 30, 'prevencion.documentos', d.id, d.tipo || ' de ' || coalesce(d.nombre, '?') || ' (' || d.fecha || ')' from prevencion.documentos d
   where d.empresa_id = v_emp and (d.persona_id in (select id from r_obj where tabla = 'nucleo.personas') or (d.persona_id in (select id from r_s) and d.origen is null));
  insert into r_obj select 31, 'prevencion.cursos', c.id, coalesce(c.titulo, c.tipo) || ' (' || coalesce(c.fecha::text, '') || ')' from prevencion.cursos c
   where c.empresa_id = v_emp and (c.persona_id in (select id from r_obj where tabla = 'nucleo.personas') or (c.persona_id in (select id from r_s) and c.origen is null));
  insert into r_obj select 33, 'prevencion.sesiones', s.id, coalesce(s.denominacion, 'Charla') from prevencion.sesiones s
   where s.empresa_id = v_emp and s.origen is null and s.creado < '2026-11-23';
  insert into r_obj select 32, 'prevencion.asistencias', a.id, a.nombre || ' en ' || coalesce((select denominacion from prevencion.sesiones where id = a.sesion_id), 'una charla') from prevencion.asistencias a
   where a.empresa_id = v_emp and (a.sesion_id in (select id from r_obj where tabla = 'prevencion.sesiones') or a.persona_id in (select id from r_obj where tabla = 'nucleo.personas'));
  insert into r_obj select 34, 'personal.calendarios', c.id, c.nombre from personal.calendarios c
   where c.empresa_id = v_emp and exists (select 1 from personal.calendario_personas cp where cp.calendario_id = c.id)
     and not exists (select 1 from personal.calendario_personas cp where cp.calendario_id = c.id and cp.persona_id not in (select id from r_obj where tabla = 'nucleo.personas'));
  insert into r_obj select 35, 'personal.envios', e.id, 'Calendario ' || e.anio || ' enviado a ' || coalesce((select nombre from nucleo.personas where id = e.persona_id), '?') from personal.envios e
   where e.empresa_id = v_emp and (e.persona_id in (select id from r_obj where tabla = 'nucleo.personas') or e.calendario_id in (select id from r_obj where tabla = 'personal.calendarios')
     or (e.persona_id in (select id from r_s) and e.enviado < '2026-11-23'));
  insert into r_obj select 20, 'nucleo.firmas', f.id, f.modulo || ': ' || f.documento || ' de ' || coalesce((select nombre from nucleo.personas where id = f.persona_id), '?') from nucleo.firmas f
   where f.empresa_id = v_emp and (f.persona_id in (select id from r_obj where tabla = 'nucleo.personas')
     or f.documento_id in (select id from r_obj where tabla in ('prevencion.documentos', 'prevencion.sesiones', 'personal.envios'))
     or f.id in (select firma_id from prevencion.asistencias where id in (select id from r_obj where tabla = 'prevencion.asistencias')));
  insert into r_obj select 40, 'limpieza.trabajos', t.id, t.fecha || ' ' || t.titulo from limpieza.trabajos t
   where t.empresa_id = v_emp and t.origen is null and t.creado < '2026-11-17';
  insert into r_obj select 41, 'limpieza.incidencias', i.id, left(i.texto, 60) from limpieza.incidencias i
   where i.empresa_id = v_emp and (i.trabajo_id in (select id from r_obj where tabla = 'limpieza.trabajos') or i.persona_id in (select id from r_obj where tabla = 'nucleo.personas'));
end $$;

-- SOLO MIRA: lo que se borraría y, aparte, los archivos de prueba que hay que quitar a mano del almacén (Storage).
select que as "Qué se borraría", tabla as "Dónde" from r_obj
union all
select 'Archivo: ' || a ->> 'ruta', 'Storage (quitar a mano)' from prevencion.cursos c, jsonb_array_elements(c.archivos) a where c.id in (select id from r_obj where tabla = 'prevencion.cursos')
union all
select 'Archivo: ' || f.imagen_ruta, 'Storage (quitar a mano)' from nucleo.firmas f where f.imagen_ruta is not null and f.id in (select id from r_obj where tabla = 'nucleo.firmas')
union all
select 'Archivo: ' || coalesce(x ->> 'ruta', x #>> '{}'), 'Storage (quitar a mano)' from limpieza.trabajos t, jsonb_array_elements(t.fotos) x where t.id in (select id from r_obj where tabla = 'limpieza.trabajos');
