-- =====================================================================================
-- 0005 · Un permiso básico por módulo: «<módulo>.modulo.ver» = el módulo sale en el menú.
-- Así el administrador ya ve los módulos de su empresa (aunque aún no tengan pantallas) y
-- cada módulo, cuando llegue, añadirá sus permisos de verdad.
-- =====================================================================================
insert into nucleo.permisos (codigo, modulo, descripcion)
select m.codigo || '.modulo.ver', m.codigo, 'Ver el módulo ' || m.nombre || ' en el menú'
  from nucleo.modulos m where m.codigo <> 'nucleo'
on conflict (codigo) do nothing;
