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
   en pantalla, informe semanal, informe por operario, aviso de los lunes) **hecho, aplicado (0032) y publicado el 20/11**. **Trozo 2** Investigar de Limpieza (`docs/estado.md` 2.11) **hecho, aplicado (0033) y publicado el 21/11**. **Trozo 3** Investigar personas en Personal → Horas
   (`docs/estado.md` 2.12) **hecho y publicado el 21/11** (sin migración). **Trozo 4** «Pregúntale» (`docs/estado.md` 2.13)
   **hecho, aplicado (0034 + copia) y publicado el 21/11**. **La parte 7 está terminada.**
   Antes de cada trozo, preguntarle a Cristian lo que haga falta, una a una.

**Después de la parte 7 y antes de la parte 8: aspecto nuevo de la app** (decidido 21/11). Cristian quiere un estilo parecido
al de Holded: **menú lateral** en el ordenador, **aspecto limpio** (fondo claro, mucho aire, líneas finas), **listas como tablas**
en el ordenador (columnas, filtros y buscador arriba) y **paneles con cifras** en las pantallas de inicio. Solo el estilo: nada de
su logo, nombre ni colores de marca. **Decidido 21/11:** en el móvil el menú se abre con ≡; los apartados de cada módulo (las
pestañas de ahora) van dentro del menú lateral; panel de Inicio con Limpieza de hoy, incidencias, quién falta hoy y pendientes de
firmar (cada uno según sus permisos; el operario ve lo suyo); tablas con buscador y filtros en **todas** las listas en el ordenador (en
el móvil, filas); colores **«Pizarra»**: menú azul muy oscuro (#18202f), contenido claro (#f3f5f7) y acento verde azulado (#0f7f77), con
modo oscuro. Propuestas que vio: https://claude.ai/artifact/RPSNo1UMtrmnHC9QEUdP8a. Orden: 1) menú lateral y colores (**hecho y
publicado el 21/11**, `docs/estado.md` A.1); 2) panel de Inicio (**hecho y publicado el 21/11**, A.2); 3) tablas en los cuatro módulos (**hecho y publicado el 21/11**, A.3). **El aspecto nuevo está terminado.** Los colores están en variables al principio de `src/estilos.css`.

Después, **parte 8: 2–4 semanas en paralelo** con la app vieja antes del cambio (**empezada el 21/11**, `docs/estado.md` «Parte 8»).
Decidido: en paralelo **solo usa la nueva Cristian**; los operarios cambian una vez, el día del cambio. Trozo 1, entrar con
**código de alta + PIN** (8.1): hecho, aplicado (0035), función «pin» instalada y publicado el 22/11; falta que lo pruebe con «pruebas».
Decidido 22/11: en paralelo solo apunta en la vieja y **una vez por semana se copia a la nueva** (Personal, Limpieza lo hecho,
Limpieza tareas y equipos, Prevención). Receta en `scripts/copia-semanal/` (ver `docs/estado.md` 8.2). **Las cuatro partes hechas y la 1.ª copia pegada y comprobada el 22/11.**
Cada semana: Cristian pega los cuatro `leer-vieja-*.sql` en la vieja y la casilla de cada uno en colada-mapri; luego se comprueba.
**Día del cambio preparado (22/11)**: `docs/dia-del-cambio.md` (lista paso a paso), hoja de códigos en Usuarios y borrado de pruebas
(`scripts/dia-del-cambio/`). Falta decidir qué hacer con la app vieja después (lo decide él más adelante).

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
- **PIN para los operarios:** hecho y publicado (parte 8.1). La ficha «pruebas» entra con correo, así que se prueba con una ficha nueva «Prueba PIN».
- **La ficha de pruebas tiene dos usuarios** («Pruebas» y «prueba»).
- **Limpieza de datos de prueba el día del cambio:** persona y usuarios de pruebas, la ficha «Prueba PIN» (si se creó para probar el PIN) y su móvil, documentos y firmas de prueba,
  EPI y formación de prueba de Cristian, el diploma subido en Storage, la firma de prueba de «Semana 2027».
- **El día del cambio:** volver a copiar de las apps viejas lo que haya cambiado.
- **Correo automático a prevención**: decidido 22/11 que se mande **solo al cerrar el mes** (si falla, botón para reintentar) y desde
  la **cuenta de empresa de Cristian, que es Microsoft 365 (Outlook)**. Con Outlook no vale usuario + contraseña por SMTP (Supabase
  seguramente bloquea el puerto 587 en sus funciones y Microsoft apaga por defecto el SMTP AUTH con contraseña a finales de diciembre
  de 2026): la forma buena es **Microsoft Graph** (registrar una app en Entra ID con permiso Mail.Send y consentimiento del
  administrador de su empresa; la clave la guarda él en Supabase). **Decidido 22/11: se deja como está** (lo manda él desde su correo
  con lo que le prepara la app) hasta que sepa si su empresa puede dar ese permiso.
- Calendario 2027 del fin de semana: lo mete Cristian más adelante desde la app; luego comprobar con el Excel (ver `docs/estado.md`).
- El revisor de Supabase avisa de funciones de las apps viejas que se pueden llamar sin entrar: no tocado (son de COLADA).
