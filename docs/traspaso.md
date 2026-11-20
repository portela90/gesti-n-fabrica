# Traspaso a una sesión nueva (20/11/2026)

Lee esto junto con `CLAUDE.md` (reglas) y `docs/estado.md` (qué está hecho y aplicado, parte por parte).
Aquí está lo que solo se habló en la conversación anterior: cómo trabaja Cristian, sus decisiones y lo pendiente.

## Cómo trabajar con Cristian
- Está aprendiendo a programar: **explícale en español sencillo todo lo que haces y por qué**, sin dar nada por sabido.
  Si algo no lo entiende, vuelve a explicarlo más fácil (sin términos técnicos).
- **Planifica antes de programar.** Las dudas, **una pregunta cada vez** (con opciones para elegir).
- **Solo servicios gratuitos.**
- **Migraciones:** escribe una migración nueva en `supabase/migrations/`, pásala por `scripts/probar-bd.sh` y por
  `npm run build` + `npx playwright test`, y dale el archivo. **La pega él** en el SQL Editor de colada-mapri.
  Cuando te diga que está pegada, compruébala en la base de datos (si tienes acceso) y solo entonces sube a `dev`.
  Los datos reales (copias de la app vieja, datos de partida) van en un `.sql` aparte que también pega él.
- **Nada se aplica en Supabase ni se instala (funciones) sin su «sí» explícito.**
- **Subir siempre a `dev`** (`git push origin HEAD:dev`); GitHub prueba y publica en `main`. Comprueba con
  `gh run list` que las dos ejecuciones (dev y main) salen bien y dile que recargue la app.
- **Las apps viejas no se tocan** (repo `portela90/COLADA` y Supabase limpieza-cie). Las apps viejas de Coladas/Almacén
  usan el mismo Supabase (colada-mapri, esquema `public`): no tocar `public` ni sus funciones (`avisos-almacen`,
  `leer-contador`…).
- **Exposed schemas (Data API):** romperlo dejó sin servicio a las apps viejas el 13/11. `public` siempre el primero.
  Hay dos versiones de cómo guardarlo (ver «Avisos» en `docs/estado.md`): **antes de tocarlo, pregúntale y compruébalo
  después** con una llamada sin esquema a una tabla de `public`.
- Nunca pidas ni guardes contraseñas ni claves. Las claves de los avisos al móvil están en Vault y nadie las copia.
- El repositorio es **público**: no subas datos personales (correos, nombres nuevos, ids de usuarios) ni los `.sql` de datos reales.

## Dónde está Limpieza (Fase 2)
Hechas y aplicadas las partes 1 a 6 del plan de Limpieza (detalle en `docs/estado.md`, apartados 2.1–2.9):
1–3. Tareas y checklists, horas del día, Mi día y Trabajo abierto (sin red, fotos, checklist, tiempo).
4. Hoy del equipo, repartir, faltas y sustitutos (`nucleo.ausencias`), reparto automático cada mañana, grupos (hornos),
   plan de la semana, festivos desde el calendario, responsables con su equipo (Encargado hornos).
5. Fin de semana: subir el Excel del cliente (solo .xlsx, librería `read-excel-file`), cambiar de día,
   instrucciones al encargado, checklist del encargado.
6. Incidencias (automáticas y a mano), problemas repetidos, tablón, bandeja «Te ha llegado» y **avisos al móvil**
   (función `avisos` v2 instalada en colada-mapri, sin JWT; probado en iPhone).

7. **En curso (20/11): Resumen e informes.** Decidido todo en `docs/estado.md` apartado 2.10. Trozo 1 (pestaña «Resumen»:
   en pantalla, informe semanal, informe por operario, aviso de los lunes) **hecho y probado; falta que Cristian pegue la 0032**,
   comprobarla y subir a `dev`. Después, en este orden: **trozo 2** Investigar de Limpieza (botón «Investigar» dentro de
   «Resumen»: saturación y pasar trabajos, tiempos con «Aplicar», problemas y sitios; mirar `src/limpieza/js/07e`, `07g` de COLADA);
   **trozo 3** Investigar personas en **Personal** (días de baja, días y horas trabajadas…); **trozo 4** «Pregúntale» (`07f`).
   Antes de cada trozo, preguntarle a Cristian lo que haga falta, una a una.

Después, **parte 8: 2–4 semanas en paralelo** con la app vieja antes del cambio.

## Decisiones de Cristian que conviene recordar
- Pantallas: se dice **«unidad de trabajo»**, nunca «empresa». Fábrica (MAPRI) y Limpieza (CIE).
- Encargados: «Encargado hornos» (reparte solo a su equipo: lo ve todo de su equipo, mueve, crea y puede «dejar sin
  asignar»; no ve sustitutos ni reparte lo que queda) y el encargado de fin de semana. No hay más encargados.
- El encargado no ve fichas, datos personales, cursos ni horas de otros.
- «Pedir quedarse» lo acepta siempre el administrador. El operario solo ve quién comparte su mismo trabajo.
- Horas: por ahora calendario + faltas/extras (igual que la vieja). **El fichaje con pausas, más adelante.**
  Las horas de Cristian también cuentan.
- Atrasados: las fijas solo su día; lo creado a mano sigue hasta que se hace.
- Reparto: si alguien falta y tiene sustituto, se lo lleva el sustituto; si no, «Sin asignar». Se reparte solo cada
  mañana (lo que el administrador pulsa con «Repartir lo que queda» reparte también lo que se soltó a mano).
- Excel del fin de semana: lo sube solo el administrador y elige qué hacer con los que no traen persona.
- Incidencias: solo las gestiona el administrador; cada uno ve las suyas.
- Avisos al móvil: incidencias y problemas al administrador; trabajos al operario; instrucciones al encargado y su
  checklist enviada al administrador; tablón a todos.
- Stock de ropa y EPI: por talla, se descuenta al hacer la entrega, solo su unidad, con hoja del pedido.
- Los datos de reconocimientos médicos no se migran.
- No hay usuarios de solo lectura por ahora.

- Informes de Limpieza (20/11): una sola pestaña «Resumen» para no saturar; encargados sin horas; el de fin de semana ve
  los de su equipo; aviso del informe semanal los lunes a las 9:00; informe por operario muy detallado (PDF + Excel).
- **Costes de limpieza** (€/hora + productos por máquina o zona): más adelante, después del cambio.

## Pendientes sueltos
- **Costes de limpieza:** decidido dejarlos para más adelante (ver la app vieja `07-fichaje-y-costes.js`).
- **Sesión:** salir de la app nueva ya solo cierra ese dispositivo (`signOut({ scope: 'local' })`), pero si se sale en
  otra herramienta con la misma cuenta, cierra todas las sesiones. Si «dar acceso» dice que la sesión se cerró: salir y entrar.
- **PIN para los operarios** (antes del día del cambio): hoy los operarios no pueden entrar con PIN; se prueba con el usuario «pruebas».
- **La ficha de pruebas tiene dos usuarios** («Pruebas» y «prueba»).
- **Limpieza de datos de prueba el día del cambio:** persona y usuarios de pruebas, documentos y firmas de prueba,
  EPI y formación de prueba de Cristian, el diploma subido en Storage, la firma de prueba de «Semana 2027».
- **El día del cambio:** volver a copiar de las apps viejas lo que haya cambiado.
- **Correo automático a prevención** (necesita un secreto de Gmail): pendiente.
- Calendario 2027 del fin de semana (ver `docs/estado.md`).
- El revisor de Supabase avisa de funciones de las apps viejas que se pueden llamar sin entrar: no tocado (son de COLADA).
