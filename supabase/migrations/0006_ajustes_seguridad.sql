-- =====================================================================================
-- 0006 · Ajustes que pide el revisor de seguridad de Supabase:
--  · ruta de búsqueda fija también en las funciones internas (disparadores y activar_historial);
--  · las funciones del núcleo solo las pueden llamar usuarios que han entrado (nunca anónimos).
-- =====================================================================================
alter function nucleo._asignacion_valida() set search_path = '';
alter function nucleo._solo_anadir() set search_path = '';
alter function nucleo.activar_historial(regclass) set search_path = '';

revoke execute on all functions in schema nucleo from public, anon;
grant execute on function nucleo.soy_superadmin(), nucleo.mis_empresas(), nucleo.empresa_de_persona(uuid),
  nucleo.tiene_permiso(text, uuid, uuid), nucleo.ve_modulo(text, uuid), nucleo.mi_sesion(),
  nucleo.anotar_error(text, text, text, text, text, text, uuid) to authenticated;
-- y lo mismo para las funciones que se creen más adelante en este esquema
alter default privileges in schema nucleo revoke execute on functions from public;
