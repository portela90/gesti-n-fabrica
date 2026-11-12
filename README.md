# App de planta (MAPRI y CIE)

App nueva que sustituirá poco a poco a las apps de ahora (Coladas, Almacén, Limpieza, Calendario, Toolbox, Hornos,
Encargado, Inicio): un núcleo común configurable y módulos independientes, con roles y permisos por empresa y nave.

## Estado
- **Fase 0 · Cimientos** — en curso.
  - [x] Base de datos del núcleo: empresas, naves, ubicaciones, turnos, equipos, activos, almacenes, artículos,
        proveedores, personas, usuarios, ajustes, campos extra, archivos, firmas, incidencias, errores, versiones.
  - [x] Roles, permisos y seguridad por fila; historial de cambios; firmas e historial que no se pueden borrar.
  - [x] Pruebas de permisos (`scripts/probar-bd.sh`).
  - [ ] App (web instalable): entrar (correo, enlace o PIN), elegir empresa, menú según permisos.
  - [ ] Configuración: pantallas para dar de alta naves, máquinas, almacenes, artículos, personas, usuarios y roles.
  - [ ] Soporte: versión visible, «Tengo un problema», registro de errores, panel de salud.
  - [ ] Copias nocturnas y aviso diario para que Supabase no se pause.

## Carpetas
```
supabase/migrations/   cambios de la base de datos, en orden (0001_nucleo.sql, 0002_permisos.sql…)
supabase/pruebas/      pruebas de la base de datos (00 = imitar Supabase en local)
scripts/               herramientas (probar-bd.sh)
docs/                  cómo está hecha la app
```

## Probar
```
scripts/probar-bd.sh
```
Necesita PostgreSQL 15 o más instalado (no usa ningún Supabase).
