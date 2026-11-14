# Estado del proyecto (para empezar una conversación nueva)

Última actualización: 12/11/2026 (noche). Léelo junto con `CLAUDE.md` y `README.md`.

## Qué es
App nueva de planta para MAPRI y CIE que sustituye poco a poco a las apps de ahora (repo `portela90/COLADA`:
Coladas, Almacén, Limpieza, Calendario, Toolbox, Hornos, Encargado, Inicio). Núcleo común configurable + módulos
independientes, con roles y permisos por unidad de trabajo y nave. Plan completo: documento de Claude
«Plan de la nueva app de planta (MAPRI y CIE)» (https://claude.ai/artifact/VbendmqKU4KpTRaJRN8RWD).

- Web: https://portela90.github.io/gesti-n-fabrica/
- Supabase: proyecto colada-mapri (`whemhkcrgwyjucpaswrm`), esquema `nucleo` (expuesto en Data API). Las apps de
  ahora siguen en el mismo proyecto (esquema `public`) y en limpieza-cie (`uddejncrjcyyaxjocbpj`).
- Unidades de trabajo (en la BD «empresas»): **Fábrica** (código `mapri`: Coladas, Almacén, Mantenimiento) y
  **Limpieza** (código `cie`: Limpieza, Personal, Prevención). Cristian es superadministrador.

## Fase 0 (cimientos): TERMINADA
- Migraciones 0001–0007 aplicadas en Supabase (0002–0007 las pegó Cristian en el SQL Editor: el control de
  seguridad no deja a Claude aplicar migraciones en el Supabase de verdad; prepárale un .sql para pegar).
- App: entrar (contraseña o enlace), elegir unidad, menú según permisos, «Tengo un problema», errores, versión.
- Configuración: naves, ubicaciones, tipos de máquina/pieza (con estados), máquinas y piezas, almacenes, familias,
  artículos, proveedores, turnos, equipos, trabajadores; Usuarios (función de servidor `invitar` desplegada: alta con
  contraseña temporal, porque el correo gratuito de Supabase solo envía al equipo); Salud de la app (superadmin).
- Copia nocturna cifrada (`.github/workflows/copia-nocturna.yml`, secretos `SUPABASE_DB_URL` y `COPIA_CLAVE` ya
  puestos; primera copia OK: 43 tablas). Ver `docs/copias.md`.
- Datos reales dados de alta: Fábrica → «NAVE 1» (código interno `nave`). Nada más todavía.

## Fase 1 (Personal y Prevención): EN CURSO
Calendario laboral (festivos, cierres, vacaciones, firmas) y Toolbox (charlas, EPIs, formación, firmas mensuales).
Migrar desde limpieza-cie (tablas `cal_dia`, `cal_vac`, `cal_firma`, `prl_*`) con historial completo y comprobar
que cuadra antes de dejar la app vieja en solo consulta.

### 1.1 Calendario laboral (Personal): APLICADO en Supabase el 13/11 (falta dar de alta equipos y trabajadores)
- Migraciones aplicadas por Cristian en el SQL Editor el 13/11 (comprobado: tablas, funciones, permisos e historial):
  - `0008_firma_imagen.sql`: la imagen de la firma (PNG) se guarda en `nucleo.firmas.imagen` (sin Storage).
  - `0009_personal_calendario.sql`: esquema `personal` con `dias` (por equipo), `vacaciones`, `envios` (foto fija
    del calendario + huella sha256; solo se anulan) y la vista `v_envios` (pendiente / firmado / anulado).
    Funciones: `marcar_dias`, `copiar_dias`, `enviar_calendario`, `anular_envio`, `firmar_calendario`.
    Permisos `personal.*` (tarea.ver, calendario.ver/editar, vacaciones.editar, firma.enviar/ver/recoger, historial.ver).
- Después de aplicarlas: añadir `personal` **al final** de «Exposed schemas» (que `public` siga el primero: el primero es
  el de por defecto y las apps viejas dependen de él, ver Avisos) y encender el módulo Personal en Limpieza.
- Subido a `dev` el 13/11 sin aplicar nada en Supabase: mientras no se apliquen 0008–0009 no existen los permisos
  `personal.*`, así que nadie ve el módulo nuevo y nada cambia para nadie.
- Pantallas (`src/personal/`): Mi calendario (ver y firmar con el dedo, conforme o con observaciones), Calendario
  (tocar días y marcarlos, también en el otro equipo; copiar de otro equipo), Vacaciones, Firmas (quién ha firmado,
  enviar a firmar, anular, ver la firma). «Imprimir o PDF» con el diálogo de imprimir del móvil.
  Recuadro de firma reutilizable: `src/componentes/Firma.tsx` (lo usará Prevención).
- Pruebas: `supabase/pruebas/40-personal-calendario.sql` (52) y `pruebas/personal.spec.ts` (5).

### 1.1 bis · Calendarios con nombre y personas (13/11, noche) — APLICADO (0011 y 0012 pegados el 13/11; comprobado)
- Cristian: «hay operarios que tienen calendarios diferentes». Ya no hay un calendario por equipo: `0011_personal_calendarios.sql`
  crea `personal.calendarios` (nombre, año, días de la semana) y `personal.calendario_personas` (**una persona, un calendario
  por año**). `dias` y `envios` van por `calendario_id`. Funciones nuevas: `marcar_dias(p_calendarios, …)`,
  `copiar_dias(p_de, p_a)`, `poner_personas`, `enviar_calendario(p_calendario, p_personas)`.
- Conversión automática de lo que había: un calendario «<equipo> <año>» por equipo y año (origen `equipo:<código>`) con la
  gente del equipo. Probado con datos como los reales: mismos días y el envío firmado sigue firmado (misma huella).
- Pantallas: elegir año y calendario; «+ Nuevo calendario» (nombre, días de la semana, copiar días de otro, para quién:
  todos o algunos; avisa si alguien se cambia de calendario); «Para N personas · cambiar»; borrar si no se ha enviado.
- Pruebas: 61 de base de datos (40-personal-calendario) y 7 de pantallas de Personal.

### 1.1 ter · Horas anuales que tienen que cuadrar (13/11, noche) — APLICADO; los 4 calendarios convertidos están aún sin horas
- Decidido por Cristian: horas al año del calendario y, a quien sea distinto, las suyas (`calendario_personas.horas_anuales`);
  horas de un día normal por día de la semana (`calendarios.horas_dia`, [dom..sáb]); intensiva, especial y «trabaja»
  con sus horas (`dias.horas`); festivos, cierres, descansos y **vacaciones restan**; **no se envía a firmar si a alguien
  no le cuadra al 100 %** (`enviar_calendario` da `NO_CUADRA: nombres` o `SIN_HORAS: nombres`).
- `0012_personal_horas.sql`: `horas_personas(calendario)` = por persona: objetivo, horas que salen y días de vacaciones.
  La foto firmada lleva `horas_anuales` y `horas`.
- Pantallas: horas por día de la semana y horas al año en el formulario del calendario; cuadro «Horas del año» (cuadra /
  faltan / sobran, «Otras horas» por persona); al marcar intensiva, especial o trabaja se ponen las horas del día.
- Pruebas: 70 de base de datos (cuenta exacta de un año de ejemplo) y 9 de pantallas de Personal.

### 1.1 cuater · Calendario por operario (13/11, noche) — APLICADO (0013 pegado el 13/11; comprobado)
- Cristian: «seleccionar un operario (o varios), meterle sus horas anuales, ir marcando los días y poniendo las horas de
  cada día hasta completar el calendario y darle a guardar». La pestaña **Calendario** es ahora una lista de operarios
  (con su calendario y si le cuadran las horas); se toca uno o se marcan varios → editor (`src/personal/PorOperario.tsx`).
- Editor: horas al año, nombre, **contador fijo arriba** (cuadra / faltan / sobran; por persona si sus vacaciones difieren),
  tocar días → poner horas / festivo / vacaciones / quitar; «Rellenar por días de la semana»; «Borrar todo»; **Guardar**
  manda todo junto. Si los elegidos comparten calendario (y solo ellos), se cambia ese; si no, uno nuevo partiendo del
  calendario del primero (se convierte a horas por día).
- `0013_personal_guardar_calendario.sql`: `guardar_calendario(empresa, año, calendario|null, nombre, horas al año, personas,
  días jsonb, vacaciones nuevas jsonb)`, todo o nada; los días de trabajo se guardan como «trabaja» con horas; quita
  calendarios del año que se quedan sin nadie y sin envíos. Vacaciones y Firmas siguen eligiendo calendario; en Firmas
  está el cuadro «Horas del año».
- Pruebas: `45-calendario-operario.sql` (12) y 4 de pantallas nuevas.
- Cambio pedido por Cristian (13/11, 23:54): **tocar un día suma al momento** («pincel»): arriba se elige qué se pone al
  tocar (unas horas, Festivo o Vacaciones); tocar otra vez lo quita; el contador se recalcula en cada toque. Ya no hay
  «elegir días y luego Poner horas». Las vacaciones nuevas se ponen solo a quien aún no las tenía ese día.

### Lo siguiente de la Fase 1, en orden
1. ~~Dar de alta Limpieza de verdad~~ HECHO 13/11: equipos «Semana» (`semana`) y «Fin de semana» (`finde`) y 13
   trabajadores con el **mismo id** que en limpieza-cie (2 de baja; sin las fichas de prueba; sin teléfonos ni DNI, que
   llegan con Prevención). Ahmed El Hait estaba en los dos equipos: puesto en Semana. Usuario de Cristian enlazado a su ficha.
2. **Entrar con nombre y PIN** (operarios): se hace antes del cambio, para que Cristian lo pruebe; no se da a nadie hasta el día del cambio.
3. ~~Traer los datos del calendario~~ HECHO 13/11: 53 días (`cal_dia`) y 35 vacaciones (`cal_vac`, mismo id) con `origen`;
   `cal_firma` vacía. **Comprobado: idénticos** (misma huella md5 en los dos proyectos, día a día y vacación a vacación).
   La app vieja sigue en uso hasta tener el PIN: antes de dejarla en solo consulta, volver a comparar y traer lo que
   haya cambiado allí. En la vieja: el 12/10/2026 está en `festivos` pero no en `cal_dia` (no se trajo); Ahmed tiene
   dos vacaciones solapadas en verano de 2026 (se trajeron tal cual).
4. **Prevención** (Toolbox). 1.ª parte **aplicada en Supabase el 13/11** (0010 + 6 prendas de Limpieza; `prevencion`
   expuesto con `public` el primero, comprobado):
   - `0010_prevencion.sql`: esquema `prevencion` con `fichas` (DNI, puesto, alta/baja y motivo, contacto, idioma,
     tallas; sin datos de salud), `prendas`, `charlas` (contenido de cada mes), `sesiones` (fecha, lugar, formador,
     previstos, enviada, cerrada), `asistencias` (nombre y puesto al firmar; la firma en `nucleo.firmas`, documento
     «charla»; solo se anulan). Funciones `enviar_charla`, `firmar_charla`, `anular_asistencia`, `cerrar_sesion`.
     Permisos `prevencion.*`; **el encargado y solo lectura ya no tienen `prevencion.*.ver`** (no ven las fichas).
   - Pantallas (`src/prevencion/`): Mis charlas (leer y firmar), Charlas (12 meses; contenido con imagen, sesión,
     enviar, firmas, recoger firma, anular, cerrar/reabrir, hoja para imprimir), Fichas, Prendas con talla.
     Datos por defecto de la sesión (lugar, duración, formador) en `nucleo.ajustes` (módulo prevencion).
   - Pruebas: `supabase/pruebas/50-prevencion.sql` (39) y `pruebas/prevencion.spec.ts` (6).
   - Reconocimiento médico: NO se ha pasado (en la app vieja está escondido hasta que prevención lo autorice).
   - **PDF oficial del Toolbox (SH-CORP-FO-IB-031)** hecho (14/11): `src/prevencion/pdfToolbox.ts`, copia de
     `construirPDF` de la app vieja con jsPDF (se carga solo al usarlo); logo e iconos del pie en `public/prevencion/`.
     Los 5 PDF oficiales (F40R304, FO-014, FO-018, FO-072, FP-022) copiados tal cual a `public/prevencion/plantillas/`
     para los siguientes pasos (decidido por Cristian: los de la app vieja, sin cambios).
   - **Envío a prevención** (14/11): con el mes cerrado, «Enviar desde mi correo» (compartir en el móvil / mailto en el
     ordenador, con el PDF y el texto) y «Ya lo he enviado» → `prevencion.apuntar_envio` (`0014_prevencion_envio.sql`, APLICADO 14/11:
     `sesiones.prev_enviado_en/prev_destino/prev_por`; se puede apuntar con la sesión cerrada). En «Datos por defecto»:
     correo y nombre del técnico, empresa y **firma del formador** (sale en el PDF). El envío **automático** (Gmail
     desde el servidor, como la app vieja) queda para cuando Cristian ponga la cuenta de envío como secreto en Supabase.
   - **Auditoría** (14/11, pedido por Cristian: lo firmado tiene que quedar en la ficha del trabajador):
     en Fichas → trabajador → «Documentos firmados» (todas sus firmas, también anuladas, y el PDF oficial de cada una
     con el documento del técnico detrás; sigue ahí aunque se dé de baja). `0016_prevencion_auditoria.sql`
     (APLICADO 14/11, comprobado): una charla que ya ha firmado alguien no se puede cambiar (YA_FIRMADA; hay que anular
     antes las firmas) y los PDF del técnico no se pueden cambiar ni borrar. Lo siguiente (paso 5): expediente PDF
     completo del trabajador de una vez.
   - **Charlas de 2026 traídas de la app vieja** (14/11, metidas por Claude con el «sí» de Cristian): 10 meses (sin junio
     ni agosto) en `prevencion.charlas` de la unidad `cie`, con texto e imagen (md5 comprobado igual que el original).
   - **Documentos del técnico** (14/11, pedido por Cristian: «que solo suba yo los documentos a la app», cada año sin
     programar): `0015_prevencion_documentos.sql` (APLICADO 14/11): almacén de archivos (bucket privado
     `prevencion`, solo PDF, 20 MB; ruta `<unidad>/charlas/<año>-<mes>-<marca>.pdf`, cada subida es un archivo nuevo),
     permisos en `storage.objects` (ver: su unidad; subir/cambiar/borrar: `prevencion.charla.editar`),
     `charlas.documento_ruta/nombre/sha256`, el compromiso ya no es obligatorio si hay PDF, y la huella de la charla
     incluye el sha256 del PDF. En pantalla: «Subir documentos del año» (varios PDF a la vez, reconoce el mes por el
     nombre y se puede corregir), y en cada mes «Subir el PDF del técnico». El trabajador lo abre antes de firmar.
     El PDF oficial y el envío a prevención llevan detrás el PDF del técnico (pdf-lib). Código en `src/prevencion/documentos.ts`.
   - **Entrega de EPI (FO-014) + tallas** (14/11, paso 2): `0017_prevencion_entregas.sql` (**PENDIENTE de pegar**):
     tabla `prevencion.documentos` (genérica: tipo epi y luego epi_col, info, autoriz, botiquin), firmada no cambia ni
     se borra (solo se anula, con `firma.anular`), la firma solo con `firmar_documento` (el trabajador si se le ha
     enviado, o quien tenga `firma.recoger`), `enviar_documentos`, `anular_documento`; permisos
     `prevencion.documento.ver/editar` (encargado: los dos; solo lectura: ver). Tallas: `fichas.tallas_propuestas` +
     `proponer_tallas` (el trabajador propone; en su ficha se aceptan o rechazan). En pantalla: pestaña «Entregas de
     EPI» (nueva entrega para varios a la vez, equipos de la hoja oficial con unidades, categorías y motivo, ropa con
     las prendas de la unidad; enviar, firmar aquí, anular, PDF oficial y PDF de todas). El trabajador ve en «Mis
     charlas» lo que tiene por firmar y «Mis tallas». PDF: `src/prevencion/epi.ts` (mismas posiciones que la app
     vieja sobre la plantilla). En «Datos por defecto», el sello de la empresa (foto, sin fondo blanco).
   - Orden decidido por Cristian (14/11) para lo que falta: ~~2) Entrega de EPI (FO-014) unida a las tallas~~ hecho;
     3) Formación en el puesto (F40R304) y entrega de información (FP-022); 4) EPI de altura (FO-072), botiquín (FO-018)
     y autorización de maquinaria; 5) certificados de cursos y expediente PRL en PDF.
   - Datos de la app vieja (`prl_*`): se traen el día del cambio, con las firmas (son imágenes: mejor de proyecto a
     proyecto que pegando SQL).
5. **Decidido 13/11: los operarios cambian de app UNA sola vez**, cuando la app nueva tenga Personal, Prevención y
   Limpieza. Hasta entonces siguen con las apps viejas; ese día se vuelven a traer y comparar los datos y se les da el
   código de alta a todos. Las apps viejas quedan en solo consulta.

### Calendario 2027 (pendiente, viene de la app vieja)
- Semana 2027 ya cargado en la app vieja de Calendario (225 días, como el Excel de la fábrica).
- Fin de semana 2027: solo existe el **relevo B** (la columna A del Excel no es nadie). Del Excel:
  - Trabaja todos los sábados y domingos salvo: 2–3/1, 21–22/8, 9–10/10, sábado 30/10, 11–12/12 y 25–26/12.
  - Vacaciones: 19/7–15/8 y 23–24/12.
  - Trabaja entre semana: 4–5/1; lunes 11, 18 y 25/1, 1 y 8/2; 29/3; 16–20/8; 11–12/10; 1/11; 27–30/12.
  - Decidido (13/11): las vacaciones y los días entre semana del fin de semana **cambian según el año**, así que los
    pone Cristian desde la app nueva, no se dejan fijos: tipos de día «Trabaja» (un día fuera de los de su equipo) y
    «Descanso» (un día de su equipo que no trabaja), y «Vacaciones para todo el equipo» (luego se cambian sueltas).

## Avisos
- Al exponer `nucleo` en «Exposed schemas» (12/11) el esquema por defecto de la API de colada-mapri dejó de ser
  `public`: las llamadas que no dicen esquema (pg_net desde limpieza-cie) daban 404. Arreglado en Limpieza con la cabecera
  `Content-Profile: public` (COLADA `supabase/migraciones/limpieza_envios_almacen_esquema_public.sql`). Cualquier llamada
  nueva entre proyectos debe decir siempre el esquema.
- 13/11: el de por defecto había quedado `graphql_public`. Arreglado: `public` vuelve a ser el primero (comprobado con
  una llamada sin esquema → 200). **Para exponer un esquema nuevo**, en dos guardados: 1) dejar solo `public` y guardar;
  2) marcar los demás (`nucleo`, `personal`, …, `graphql_public` el último) y guardar. Nunca desmarcar `public`.
  Comprobarlo después con `net.http_get` a una tabla de `public` sin cabecera de esquema.
- No pedir ni guardar contraseñas ni claves; si Cristian pega una en el chat, decirle que la cambie.
- El revisor de Supabase avisa de funciones de las apps viejas que se pueden llamar sin entrar (p. ej.
  `errores_listar`): pendiente de revisar en COLADA, no tocado.
