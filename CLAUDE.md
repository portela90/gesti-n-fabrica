# App de planta (MAPRI y CIE) — instrucciones para trabajar en este repositorio

Plan completo: documento «Plan de la nueva app de planta (MAPRI y CIE)» (en Claude). Este repositorio es la app NUEVA;
las apps de ahora siguen en `portela90/COLADA` y no se tocan desde aquí.

## Nombres
- En pantalla se dice **unidad de trabajo** (hoy: **Fábrica** y **Limpieza**); en la base de datos es `nucleo.empresas` / `empresa_id`.
  Nunca escribir «empresa» en textos que vea el usuario.

## Reglas que no se rompen
- Cristian habla español: textos, comentarios y nombres en español.
- Solo servicios gratuitos.
- Nada de la planta escrito en el código (naves, máquinas, aleaciones, almacenes, turnos…): son filas del núcleo.
- Cada módulo solo depende del núcleo (`nucleo.*`), nunca de las tablas de otro módulo.
- Toda tabla de negocio: `empresa_id`, seguridad por fila (RLS) con `nucleo.tiene_permiso(...)` y historial
  (`select nucleo.activar_historial('esquema.tabla')`).
- Stock = suma de movimientos; los cierres son fotos que no cambian. Firmas e historial: solo se añaden.
- Cada cambio de base de datos es una migración nueva en `supabase/migrations/` (nunca se edita una ya aplicada en Supabase).
- Aplicar migraciones al Supabase de verdad o desplegar funciones: solo con el «sí» explícito de Cristian.
- Nunca datos reales en las pruebas: empresas y personas inventadas.

## Publicar
- Subir SIEMPRE a `dev` (`git push origin HEAD:dev`); GitHub prueba y pasa a `main`, y publica en GitHub Pages. Nunca a `main` a mano.

## Probar
- `scripts/probar-bd.sh`: Postgres de usar y tirar, imita Supabase, aplica las migraciones y pasa `supabase/pruebas/`.
  Cada archivo de pruebas va en una transacción con `rollback` y usa `pruebas.ok / pruebas.falla / pruebas.cuantas`.
- `npm run build` y `npx playwright test` (pruebas de pantallas con Supabase simulado en `pruebas/simulador.ts`;
  incluyen que nada se aplaste a 320 px).
- Para probar como un usuario: `set role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', true);`

## Permisos
- Código `módulo.cosa.acción` (`coladas.consumo.apuntar`). Acciones habituales: `ver`, `apuntar`, `corregir`, `editar`, `borrar`.
- Cada módulo da de alta sus permisos en `nucleo.permisos` en su migración y los añade a los roles de partida.
- En los roles vale el comodín `*` (`coladas.*`, `*.ver`, `*`).
- Esquemas nuevos: hay que añadirlos en Supabase a «Exposed schemas» (API) para que la app los vea.
