# Cómo funcionan los permisos

1. **Permiso** = `módulo.cosa.acción`, por ejemplo `coladas.consumo.apuntar`. La lista está en `nucleo.permisos`.
2. **Rol** = lista de permisos (admite `*`). Hay roles de partida para todas las empresas (administrador de empresa,
   encargado, operario, técnico de mantenimiento, solo lectura) y cada empresa puede crear los suyos.
3. **Asignación** = a un usuario se le da un rol en una empresa y, si se quiere, solo en una nave.
4. **La base de datos decide**: cada tabla tiene reglas (RLS) que llaman a `nucleo.tiene_permiso(permiso, empresa, nave)`.
   Aunque alguien se salte la pantalla, no lee ni cambia lo que no le toca.
5. **Módulo apagado** en una empresa = nadie de esa empresa tiene permisos de ese módulo, aunque su rol tenga `*`.
6. **Superadministrador** (Cristian): puede con todo; es el único que crea empresas y enciende módulos.

Ejemplo: «Beatriz no ve Coladas» = sus roles no tienen ningún permiso `coladas.*`. Coladas no le sale en el menú
(`nucleo.ve_modulo`) y, si lo intentara por otro camino, la base de datos no le devuelve ninguna fila.

Lo que la app pide al arrancar: `nucleo.mi_sesion()` → usuario, empresas, módulos visibles y permisos en cada una.
