-- =====================================================================================
-- 0004 · LISTAS INICIALES: módulos, unidades, permisos del núcleo y roles de partida.
-- Aquí no hay datos de ninguna empresa: las empresas, naves, máquinas… se dan de alta
-- desde la app (o se traen de las apps de ahora en cada fase de la migración).
-- Cada módulo, en su propia migración, añade sus permisos y los suma a estos roles.
-- =====================================================================================

insert into nucleo.modulos (codigo, nombre, orden) values
  ('nucleo',        'Núcleo y configuración', 0),
  ('coladas',       'Coladas',                10),
  ('almacen',       'Almacén',                20),
  ('mantenimiento', 'Mantenimiento',          30),
  ('limpieza',      'Limpieza',               40),
  ('personal',      'Personal',               50),
  ('prevencion',    'Prevención',             60);

insert into nucleo.unidades (codigo, nombre, decimales) values
  ('ud', 'unidades', 0), ('kg', 'kilos', 1), ('l', 'litros', 1), ('par', 'pares', 0),
  ('m3', 'metros cúbicos', 2), ('m', 'metros', 2), ('caja', 'cajas', 0), ('rollo', 'rollos', 0), ('h', 'horas', 2);

insert into nucleo.permisos (codigo, modulo, descripcion) values
  ('nucleo.nave.editar',            'nucleo', 'Dar de alta y cambiar naves'),
  ('nucleo.nave.borrar',            'nucleo', 'Borrar naves'),
  ('nucleo.ubicacion.editar',       'nucleo', 'Dar de alta y cambiar ubicaciones'),
  ('nucleo.ubicacion.borrar',       'nucleo', 'Borrar ubicaciones'),
  ('nucleo.turno.editar',           'nucleo', 'Dar de alta y cambiar turnos y relevos'),
  ('nucleo.turno.borrar',           'nucleo', 'Borrar turnos'),
  ('nucleo.equipo.editar',          'nucleo', 'Dar de alta y cambiar equipos'),
  ('nucleo.equipo.borrar',          'nucleo', 'Borrar equipos'),
  ('nucleo.activo.editar',          'nucleo', 'Dar de alta y cambiar máquinas, piezas y sus tipos'),
  ('nucleo.activo.borrar',          'nucleo', 'Borrar máquinas y piezas'),
  ('nucleo.almacen.editar',         'nucleo', 'Dar de alta y cambiar almacenes'),
  ('nucleo.almacen.borrar',         'nucleo', 'Borrar almacenes'),
  ('nucleo.articulo.editar',        'nucleo', 'Dar de alta y cambiar artículos y familias'),
  ('nucleo.articulo.borrar',        'nucleo', 'Borrar artículos y familias'),
  ('nucleo.proveedor.editar',       'nucleo', 'Dar de alta y cambiar proveedores'),
  ('nucleo.proveedor.borrar',       'nucleo', 'Borrar proveedores'),
  ('nucleo.configuracion.editar',   'nucleo', 'Cambiar ajustes y campos extra'),
  ('nucleo.configuracion.borrar',   'nucleo', 'Borrar ajustes y campos extra'),
  ('nucleo.persona.ver',            'nucleo', 'Ver los datos de los trabajadores'),
  ('nucleo.persona.editar',         'nucleo', 'Dar de alta y cambiar trabajadores'),
  ('nucleo.persona.borrar',         'nucleo', 'Borrar trabajadores'),
  ('nucleo.usuario.ver',            'nucleo', 'Ver los usuarios y sus roles'),
  ('nucleo.usuario.editar',         'nucleo', 'Dar de alta usuarios y darles roles'),
  ('nucleo.rol.editar',             'nucleo', 'Crear y cambiar los roles de la empresa'),
  ('nucleo.archivo.borrar',         'nucleo', 'Borrar fotos y documentos'),
  ('nucleo.incidencia.gestionar',   'nucleo', 'Ver y contestar las incidencias de soporte'),
  ('nucleo.historial.ver',          'nucleo', 'Ver el historial de cambios del núcleo');

-- Roles de partida (plantillas para todas las empresas; cada empresa puede copiarlos y ajustarlos)
with r as (
  insert into nucleo.roles (codigo, nombre, descripcion) values
    ('admin_empresa', 'Administrador de empresa', 'Todo en su empresa: configuración, usuarios y todos sus módulos'),
    ('encargado',     'Encargado',                'Ve sus módulos, apunta y corrige lo de su equipo; ve a los trabajadores'),
    ('operario',      'Operario',                 'Apunta sus tareas'),
    ('tecnico_mant',  'Técnico de mantenimiento', 'Todo Mantenimiento; ve el stock de Almacén y apunta consumos'),
    ('solo_lectura',  'Solo lectura',             'Ve los módulos, sin cambiar nada')
  returning id, codigo)
insert into nucleo.rol_permisos (rol_id, permiso)
select r.id, p from r, lateral (select unnest(case r.codigo
  when 'admin_empresa' then array['*']
  when 'encargado'     then array['nucleo.persona.ver',
                                  'coladas.*.ver', 'coladas.*.apuntar', 'coladas.*.corregir',
                                  'almacen.*.ver', 'almacen.*.apuntar', 'almacen.*.corregir',
                                  'mantenimiento.*.ver', 'mantenimiento.*.apuntar', 'mantenimiento.*.corregir',
                                  'limpieza.*.ver', 'limpieza.*.apuntar', 'limpieza.*.corregir',
                                  'personal.*.ver', 'personal.firma.recoger',
                                  'prevencion.*.ver', 'prevencion.*.apuntar', 'prevencion.firma.recoger']
  when 'operario'      then array['*.*.apuntar', '*.tarea.ver']
  when 'tecnico_mant'  then array['mantenimiento.*', 'almacen.*.ver', 'almacen.consumo.apuntar']
  when 'solo_lectura'  then array['coladas.*.ver', 'almacen.*.ver', 'mantenimiento.*.ver', 'limpieza.*.ver', 'personal.*.ver', 'prevencion.*.ver']
end) p) x;
