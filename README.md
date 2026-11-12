# App de planta (MAPRI y CIE)

App nueva que sustituirá poco a poco a las apps de ahora (Coladas, Almacén, Limpieza, Calendario, Toolbox, Hornos,
Encargado, Inicio): un núcleo común configurable y módulos independientes, con roles y permisos por empresa y nave.

## Estado
- **Fase 0 · Cimientos** — en curso.
  - [x] Base de datos del núcleo: empresas, naves, ubicaciones, turnos, equipos, activos, almacenes, artículos,
        proveedores, personas, usuarios, ajustes, campos extra, archivos, firmas, incidencias, errores, versiones.
  - [x] Roles, permisos y seguridad por fila; historial de cambios; firmas e historial que no se pueden borrar.
  - [x] Pruebas de permisos (`scripts/probar-bd.sh`).
  - [x] App (web instalable): entrar con correo y contraseña o con enlace, elegir empresa, menú según permisos,
        versión visible, «Tengo un problema», registro de errores, aviso de versión nueva.
  - [ ] Entrar con nombre y PIN (operarios): llega con el primer módulo que lo necesite.
  - [x] Configuración: naves, ubicaciones, tipos de máquina y pieza (con sus estados), máquinas y piezas, almacenes,
        familias, artículos, proveedores, turnos, equipos y trabajadores (añadir, cambiar, dar de baja).
        Cada catálogo es una entrada en `src/configuracion/catalogos.ts`.
  - [x] Usuarios: dar acceso con contraseña temporal (función `supabase/functions/invitar`), roles por unidad y nave,
        quitar roles; la primera vez obliga a poner contraseña propia.
  - [ ] Roles propios de cada unidad (crear y ajustar permisos desde la app).
  - [x] Soporte: versión visible, «Tengo un problema», registro de errores, panel «Salud de la app» (superadministrador).
  - [x] Copia nocturna cifrada (`.github/workflows/copia-nocturna.yml`, ver `docs/copias.md`) que además mantiene activo Supabase.

## Carpetas
```
src/                   la app (React + TypeScript): nucleo/, componentes/, pantallas/
pruebas/               pruebas de pantallas (Playwright) y el Supabase simulado
supabase/migrations/   cambios de la base de datos, en orden (0001_nucleo.sql, 0002_permisos.sql…)
supabase/pruebas/      pruebas de la base de datos (00 = imitar Supabase en local)
scripts/               herramientas (probar-bd.sh)
docs/                  cómo está hecha la app
```

## Probar
```
npm install
scripts/probar-bd.sh      # base de datos (necesita PostgreSQL 15 o más; no usa ningún Supabase)
npm run build             # montar la app en dist/
npx playwright test       # pantallas, con Supabase simulado
npm run dev               # la app en local
```

## Publicar
Subir a la rama `dev`. GitHub pasa todas las pruebas y, si van bien, pasa los cambios a `main` y publica la app en
https://portela90.github.io/gesti-n-fabrica/ (nunca se sube a `main` a mano).
