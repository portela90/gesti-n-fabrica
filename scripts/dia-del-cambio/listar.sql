
-- SOLO MIRA: lo que se borraría y, aparte, los archivos de prueba que hay que quitar a mano del almacén (Storage).
select que as "Qué se borraría", tabla as "Dónde" from r_obj
union all
select 'Archivo: ' || a ->> 'ruta', 'Storage (quitar a mano)' from prevencion.cursos c, jsonb_array_elements(c.archivos) a where c.id in (select id from r_obj where tabla = 'prevencion.cursos')
union all
select 'Archivo: ' || f.imagen_ruta, 'Storage (quitar a mano)' from nucleo.firmas f where f.imagen_ruta is not null and f.id in (select id from r_obj where tabla = 'nucleo.firmas')
union all
select 'Archivo: ' || coalesce(x ->> 'ruta', x #>> '{}'), 'Storage (quitar a mano)' from limpieza.trabajos t, jsonb_array_elements(t.fotos) x where t.id in (select id from r_obj where tabla = 'limpieza.trabajos');
