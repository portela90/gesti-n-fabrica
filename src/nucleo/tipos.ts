/** Lo que devuelve nucleo.mi_sesion(): quién soy y qué puedo hacer en cada empresa. */
export interface EmpresaSesion {
  id: string;
  codigo: string;
  nombre: string;
  modulos: string[];
  permisos: string[];
}

export interface Sesion {
  usuario: { id: string; nombre: string; superadmin: boolean; empresa_actual: string | null } | null;
  empresas: EmpresaSesion[];
}
