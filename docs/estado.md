# Estado del proyecto (para empezar una conversación nueva)

Última actualización: 20/11/2026. Léelo junto con `CLAUDE.md`, `README.md` y `docs/traspaso.md`.

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
   - **Entrega de EPI (FO-014) + tallas** (14/11, paso 2): `0017_prevencion_entregas.sql` (APLICADO 14/11, comprobado):
     tabla `prevencion.documentos` (genérica: tipo epi y luego epi_col, info, autoriz, botiquin), firmada no cambia ni
     se borra (solo se anula, con `firma.anular`), la firma solo con `firmar_documento` (el trabajador si se le ha
     enviado, o quien tenga `firma.recoger`), `enviar_documentos`, `anular_documento`; permisos
     `prevencion.documento.ver/editar` (encargado: los dos; solo lectura: ver). Tallas: `fichas.tallas_propuestas` +
     `proponer_tallas` (el trabajador propone; en su ficha se aceptan o rechazan). En pantalla: pestaña «Entregas de
     EPI» (nueva entrega para varios a la vez, equipos de la hoja oficial con unidades, categorías y motivo, ropa con
     las prendas de la unidad; enviar, firmar aquí, anular, PDF oficial y PDF de todas). El trabajador ve en «Mis
     charlas» lo que tiene por firmar y «Mis tallas». PDF: `src/prevencion/epi.ts` (mismas posiciones que la app
     vieja sobre la plantilla). En «Datos por defecto», el sello de la empresa (foto, sin fondo blanco).
   - **Formación en el puesto (F40R304) y entrega de información (FP-022)** (14/11, paso 3):
     `0018_prevencion_formacion.sql` (APLICADO 14/11, comprobado): tipo `formacion` en `prevencion.documentos` y columna
     `evaluacion` (evaluación de la eficacia, se apunta ya firmada; no entra en la huella). La pestaña «Entregas de
     EPI» pasa a llamarse «Documentos», con EPI / Formación / Información arriba. Textos del reverso del F40R304
     copiados de la app vieja (`src/prevencion/formacion.ts`), FP-022 en `src/prevencion/info.ts`. En «Datos por
     defecto»: dirección de servicio, enlace a la información y firma del responsable de centro.
   - **Arreglo 14/11**: `tsc -b` sin `noEmit` había dejado archivos .js compilados junto a los .tsx (y
     vite.config.js), y se subieron en dos commits. Vite coge el .js antes que el .tsx, así que podían quedar
     pantallas viejas. Borrados, `noEmit` en tsconfig y en .gitignore.
   - **EPI de altura (FO-072), revisión del botiquín (FO-018) y autorización de maquinaria** (14/11, paso 4):
     `0019_prevencion_botiquin.sql` (APLICADO 14/11, comprobado). Van en `prevencion.documentos` (tipos epi_col,
     botiquin, autoriz). El botiquín no es de ningún trabajador: las firmas de quien revisa y quien supervisa van
     en `datos` (más sitio: 400 KB) y `cerrar_botiquin` lo cierra; cerrado = como firmado (no cambia, solo se anula).
     En «Documentos» ahora se elige el tipo en una lista. PDF: `epiAltura.ts` (hasta 4 entregas del mismo
     trabajador por hoja), `botiquin.ts`, `autorizacion.ts` (sin plantilla, como la app vieja). Próxima revisión
     del botiquín = 3 meses. En «Datos por defecto»: quién supervisa el botiquín.
   - **Cursos y certificados + expediente PRL** (14/11, paso 5): `0020_prevencion_cursos.sql` (APLICADO 14/11,
     comprobado): tabla `prevencion.cursos` (tipo, entidad, fecha, horas, caduca, notas, archivos = fotos/PDF en el
     almacén `<unidad>/cursos/<curso>/`). Son datos del trabajador: los ve quien ve fichas y el propio trabajador
     los suyos (el encargado no); los apunta quien edita fichas. El almacén acepta ahora JPEG y PNG, y la carpeta
     cursos tiene sus reglas (charlas igual que antes; fuera de las dos no se sube nada). En la ficha:
     «Cursos y certificados» (caducado / caduca pronto a 60 días, también en la lista de fichas) y botón
     «Expediente PRL (PDF)»: portada con datos, tablas de EPI, formación y cursos e historial, y detrás todos los
     PDF oficiales firmados y los certificados (`src/prevencion/cursos.tsx`).
   - **Mejoras tras las pruebas de Cristian (14/11)**: en Personal → Calendario cada operario dice si su calendario
     está «Cuadra · sin enviar», «Enviado, sin firmar» o «Firmado», y el que cuadra se envía desde la misma lista
     (uno o varios marcados). En Configuración → Usuarios se ve con qué trabajador está enlazado cada usuario y se
     puede enlazar o cambiar («Enlazar con su ficha»); sin enlace no le sale nada para firmar. Sin migración.
   - **Incidente 14/11 (14:41)**: en «Para 7 personas · cambiar» de «Semana 2026» se dejó solo a «pruebas» y luego se
     guardó su calendario encima: los 7 operarios de semana se quedaron sin calendario y sus 12 días especiales se
     cambiaron. Arreglo de datos preparado en `/home/claude/sql/restaurar_semana_2026.sql` (ensayado con rollback:
     Semana 2026 = 12 días y 7 personas; el de «pruebas» pasa a «pruebas 2026» con su firma). APLICADO 14/11 con el «sí» de Cristian y comprobado.
     En la app: quitar gente de un calendario ahora avisa con sus nombres.
   - Orden decidido por Cristian (14/11) para lo que falta: ~~2) Entrega de EPI (FO-014) unida a las tallas~~ hecho;
     ~~3) Formación en el puesto (F40R304) y entrega de información (FP-022)~~ hecho; ~~4) EPI de altura (FO-072), botiquín (FO-018)
     y autorización de maquinaria~~ hecho; ~~5) certificados de cursos y expediente PRL en PDF~~ hecho. **Prevención completa** (falta traer los datos el día del cambio).
   - Datos de la app vieja (`prl_*`): se traen el día del cambio, con las firmas (son imágenes: mejor de proyecto a
     proyecto que pegando SQL).
5. **Decidido 13/11: los operarios cambian de app UNA sola vez**, cuando la app nueva tenga Personal, Prevención y
   Limpieza. Hasta entonces siguen con las apps viejas; ese día se vuelven a traer y comparar los datos y se les da el
   código de alta a todos. Las apps viejas quedan en solo consulta.

## Fase 2 (Limpieza): EN CURSO
Plan por pantallas y roles acordado con Cristian el 14/11 (documento «Fase 2 · Limpieza: pantallas por rol» en Claude).
Decidido: «Encargado hornos» es un encargado (una persona, sale con el puesto) que reparte a Juan José y Freddy;
no hay más encargados que ese y Abdoul kader (fin de semana); el encargado crea trabajos sueltos y reparte;
«pedir quedarse» lo acepta siempre el administrador; el operario solo ve quién comparte su mismo trabajo; se fichan
también las pausas; sin modo sencillo; nadie con solo lectura por ahora.

### 2.1 Base: tareas y checklists (14/11) — APLICADO 14/11 (0021, `limpieza` expuesto con `public` el primero y copia de datos; comprobado)
- `0021_limpieza_base.sql`: esquema `limpieza` con `tareas` (fijas: días, equipo, turno, quién / todo el equipo;
  habituales: grupo, solo para; las dos: máquina, zona, sitio, minutos, artículo y cantidad para la fase 3) y
  `plantillas` (checklists «del encargado» o «al terminar trabajos», con códigos de máquina tipo `F*`, palabras que
  excluyen y tareas habituales; puntos bien/mal o número con mínimo y foto si está mal). No se borra: se da de baja.
  Permisos `limpieza.plan.ver` (encargado y solo lectura, por `limpieza.*.ver`) y `limpieza.plan.editar` (administrador).
  El operario no las ve: cada trabajo llevará su copia de la checklist.
- Naves, zonas y máquinas son del núcleo (Configuración). Las inyectoras de la unidad Limpieza son una copia de las
  de la fábrica (como hoy, que están en otro proyecto).
- Pantalla `src/limpieza/Limpieza.tsx`: pestañas Tareas (Fijas / Habituales) y Checklists, con «Sale en: F4, F10…».
- Pruebas: `supabase/pruebas/60-limpieza-base.sql` (24) y `pruebas/limpieza.spec.ts` (6).
- Copia de la app vieja preparada en `/home/claude/sql/limpieza_base_datos.sql` (generada por `gen_limpieza.py`;
  ensayada dos veces en una base de usar y tirar, la segunda no repite nada): 2 naves, 3 turnos (Partido, Refuerzo,
  Tarde, sin horas), 72 máquinas (30 inyectoras, 33 hornos `H-Fxx`, M3–M11 como centros de mecanizado), 12 zonas,
  16 fijas, 19 habituales y 9 checklists (5 de `enc_check_punto` y 4 de los puntos de cada horno o inyectora).
  En la vieja, «F30» estaba como horno sin puntos: se trae como inyectora. Los artículos de almacén de las
  habituales (`alm_art`) no se traen todavía (fase 3); los consumos siguen saliendo de la app vieja.
- Orden para aplicarlo: 1) pegar 0021; 2) añadir `limpieza` a Exposed schemas (con `public` el primero, en un solo
  guardado); 3) pegar la copia de datos; 4) subir la app.

### 2.2 Horas del día y Mis horas (14/11) — APLICADO 15/11 (0022 y copia de horas; comprobado)
Decidido por Cristian (14/11): de momento las horas del mes = calendario + faltas y extras, con las mismas reglas
que «Horas del día» y el Excel mensual de la app vieja (35 h o las de contrato a la semana, bolsa, festivos). El
fichaje con pausas, más adelante. Y cada trabajador lleva en su ficha su jornada, sus horas de contrato y su horario.
- `0022_personal_horas_dia.sql`: `nucleo.personas.horas_semana`; el horario de la ficha (ya venía de la app vieja con
  los días por su nombre: `{"lunes": [["08:00","13:00"],["14:00","16:00"]]}`) se comprueba (`nucleo.horario_valido`);
  `nucleo.horas_horario`. Tabla `personal.horas_dia` (trabajadas, fuera de presupuesto, extra a mano, falta, motivo
  obligatorio con fuera o extra). `personal.horas_dias(unidad, desde, hasta, persona)`: lo que le toca a cada uno cada
  día (su horario; festivo, cierre y descanso 0 h; intensiva, especial y «trabaja» sus horas; vacaciones = falta) y lo
  que vale. `personal.guardar_horas_dia`. Permiso `personal.horas.editar` (solo el administrador; a propósito no
  acaba en .ver ni .apuntar para que encargado y operario no vean las de los demás).
- Bolsa en la app (`src/personal/horas.ts`, copia de `horasMesExcel` de la vieja). Desde cuándo cuenta: ajuste
  `bolsa_inicio` (Personal) = 5/10/2026. Supuesto mío: los días del calendario sin trabajar (festivo, cierre y
  descanso) no restan de la bolsa, como el festivo en la vieja.
- Pantallas: Personal → «Horas» (administrador: Horas del día y Horas del mes con Excel y detalle) y «Mis horas»
  (cada trabajador). Configuración → Trabajadores: horas de contrato y horario («8-13, 14-16»).
- Pruebas: `supabase/pruebas/42-personal-horas-dia.sql` (30) y `pruebas/horas.spec.ts` (11, 6 del cálculo).
- Copia preparada en `/home/claude/sql/horas_datos.sql` (`gen_horas.py`): horas de contrato de 10 personas, 38 días
  con algo distinto (3 con horas fuera sin motivo en la vieja → «(sin motivo en la app vieja)») y la bolsa desde
  el 5/10/2026. Las 316 jornadas de vacaciones de `horas_dia` ya están todas en `personal.vacaciones`.
- **Comparado 15/11** (del 1/10 al 14/11, día a día y persona a persona: horas, extra, fuera y falta): los 9 trabajadores
  de las dos apps salen idénticos (misma huella md5) tras añadir el festivo del 12/10 (Fiesta Nacional), que no se
  había traído, a «Semana 2026» y «Fin de semana 2026» (con el «sí» de Cristian). En la nueva salen además
  Cristian Portela (decidido 15/11: sus horas sí cuentan; su ficha aún sin jornada ni horas de contrato), «pruebas»
  (se borra el día del cambio), y Abdelila y Hicham hasta su baja (en la vieja no salen por estar inactivos).

### 2.3 Mi día y Trabajo abierto del operario (15/11) — APLICADO 15/11 (0024, comprobado)
Decidido por Cristian (15/11): sin cobertura «a veces, en algún rincón» → se guarda lo básico en el móvil (empezar,
pausar, seguir, terminar, checklist, fotos y aviso) y se manda solo; tiempo igual que la vieja (Empezar/Terminar, si
no, «¿Cuánto has tardado?», nunca menos de lo previsto); fotos como ahora (obligatoria si un punto con «foto si está
mal» está mal); las fijas son de su día y lo creado a mano sigue hasta que se haga.
- `0024_limpieza_trabajos.sql`: `limpieza.trabajos` (sin insert/update directos: todo por funciones). `generar_dia`
  (saca las fijas del día una sola vez), `mi_dia`, `puntos` (checklist que toca), `empezar`/`pausar`/`seguir`/
  `terminar` (con «cuándo» del móvil, de hasta 2 días atrás; repetido = sin efecto o YA_HECHO), `poner_foto`,
  `avisar_problema` (queda en el trabajo; las incidencias, parte 6), `habituales_para_mi`, `crear_trabajo`.
  `limpieza.encaja` = `_check_casa` de la vieja (por el nombre del trabajo y el código de su máquina); la vista previa
  de Checklists usa ahora las mismas reglas. Permisos `limpieza.trabajo.ver/apuntar/corregir` (operario: los suyos =
  está en él, es de todo su equipo o lo creó él). Cubo `limpieza` (fotos, `<unidad>/trabajos/<trabajo>/…`).
- Pantalla: Limpieza → «Mi día» (`src/limpieza/MiDia.tsx`) y cola sin red en IndexedDB (`src/limpieza/cola.ts`).
- Pruebas: `supabase/pruebas/65-limpieza-trabajos.sql` (45) y `pruebas/midia.spec.ts` (6, una sin red).
- Sin datos que traer. Los festivos no paran las fijas (Limpieza no puede leer el calendario de Personal): ese día
  salen y, si nadie las hace, se quedan sin hacer.
- Los operarios aún no pueden entrar (falta el PIN): se prueba con el usuario «pruebas».

### 2.4 Hoy del equipo y repartir (15/11, primera pieza de la parte 4) — APLICADO 15/11 (0025, comprobado)
Pedido por Cristian: cambiar a quién le toca un trabajo que ya ha salido hoy.
- `0025_limpieza_repartir.sql`: permiso `limpieza.trabajo.repartir` (también al encargado de partida);
  `limpieza.repartir` (personas o todo un equipo; solo ese trabajo, no la tarea fija; lo hecho no se reparte);
  `crear_trabajo` con `p_para` (para otros hace falta repartir; sin ficha, tampoco).
- Pantalla: Limpieza → «Hoy del equipo» (`src/limpieza/Hoy.tsx`): trabajos del día por persona (sin asignar primero),
  «Cambiar a quién le toca», «+ Trabajo» con «Para quién». Listas comunes en `src/limpieza/listas.ts`.
- Pruebas: `supabase/pruebas/66-limpieza-repartir.sql` (12) y `pruebas/hoy.spec.ts` (4).
- De momento el encargado reparte entre todos (lo de «Encargado hornos solo su equipo», más adelante).
- Falta de la parte 4: plan de la semana, limpieza de inyectoras por semana, faltas y sustituciones, reparto automático.

### 2.5 Faltas, sustitutos, reparto automático y plan de la semana (15/11, resto de la parte 4) — APLICADO 15/11 (0026, 0027 y datos, comprobado)
Decidido por Cristian: si falta y hay sustituto, se lo lleva el sustituto; si no, «Sin asignar». Reparto solo cada mañana.
Grupos por persona (hornos). Plan de la semana igual que la vieja. «+ Trabajo» con máquina.
- `0026_nucleo_ausencias.sql`: `nucleo.ausencias` (copia de personal.vacaciones y de las faltas de horas_dia, por disparadores),
  `nucleo.ausencia(persona, fecha)`.
- `0027_limpieza_reparto.sql`: `limpieza.personas` (en_reparto, grupos), `limpieza.sustituciones`, `limpieza.repartos`,
  `trabajos.asignados_orig` y `aviso_reparto`; `generar_dia` quita a los que faltan (sustituto o sin asignar) y la primera vez
  de hoy reparte lo que queda (con horario, sin faltar, por minutos; grupo → solo quien lo tenga); `repartir_lo_que_queda`;
  `semana(p_empresa, p_lunes)`; `repartir` borra el aviso.
- Datos de partida: `/home/claude/sql/reparto_datos.sql` (grupo «hornos» en las fijas de horno/escoria; 9 personas en el reparto, Juan José con hornos).
- Pantallas: `src/limpieza/Reparto.tsx` (Sustitutos, PersonasReparto, Semana); pestañas «Semana» y «Personas»; en «Hoy del equipo»
  «Repartir lo que queda» y «Faltas y sustitutos»; aviso del reparto en cada fila; máquina en «+ Trabajo».
- Pruebas: `67-limpieza-reparto.sql` (26) y `pruebas/reparto.spec.ts` (6). El simulador distingue «esquema.tabla».
- Pendiente: el encargado de hornos solo con su equipo; festivos (Limpieza no lee Personal: podría ir también a nucleo).

### 2.6 Festivos y responsables con su equipo (15/11, cierre de la parte 4) — APLICADO 15/11 (0028 y datos, comprobado)
- `0028_limpieza_festivos_responsables.sql`: motivo «festivo» en `nucleo.ausencias` (Personal copia festivo/cierre/descanso de cada
  calendario a su gente, con disparadores en personal.dias y calendario_personas); `limpieza._fija_sale` (una fija no sale si toda su
  gente tiene festivo); `limpieza.responsables` + `mi_equipo` + `_de_mi_equipo` (el responsable solo ve/reparte lo de su equipo y los
  sin asignar de sus grupos; puede soltar; no reparte lo que queda ni ve sustitutos); `repartir` permite dejar sin asignar.
- Datos: `/home/claude/sql/responsables_datos.sql` (Encargado hornos → Juan José y Freddy).
- Pantallas: «Dejar sin asignar», Hoy limitado al equipo, Personas → «Es responsable de un equipo», «Festivo» en la Semana.
- Pruebas: `68-limpieza-festivos-responsables.sql` (23) y 2 más en `pruebas/reparto.spec.ts`.

### 2.7 Fin de semana (15/11, parte 5) — APLICADO 15/11 (0029, comprobado)
Decidido por Cristian: al subir el Excel elige qué hacer con los sin persona (reparto automático, para el encargado, todo el equipo);
solo él sube el Excel; instrucciones («traspasos») y checklist del encargado igual que la vieja.
- `0029_limpieza_finde.sql`: permiso `limpieza.excel.editar`; trabajos `no_repartir`, `urgente`, `grupo`; disparador `soltar`
  (soltar a mano → no_repartir); el reparto de la mañana no toca los no_repartir, el botón sí; `importar` (sin repetidos, días de hoy a +14,
  creado_por vacío), `cambiar_dia`; `instrucciones` (+ `instruccion_leida`; al cambiarlas vuelven a sin leer); `revisiones`
  (+ `puntos_encargado`, `guardar_revision`; enviada = no se cambia salvo plan.editar); fotos en `<empresa>/revisiones/<fecha>/`.
  `es_mio`: crear para otro ya no lo hace tuyo.
- Pantallas: pestaña «Fin de semana» (`src/limpieza/Finde.tsx`), lectura del Excel en `src/limpieza/excel.ts` (librería `read-excel-file`, solo .xlsx);
  aviso «Tienes instrucciones nuevas» para el encargado.
- Pruebas: `69-limpieza-finde.sql` (31) y `pruebas/finde.spec.ts` (6, con `pruebas/datos/finde-inventado.xlsx`).
- Pendiente: el responsable de un equipo (Encargado hornos) ve la pestaña pero no la checklist ni las instrucciones; avisos al móvil (parte 6).

### 2.8 Incidencias, problemas repetidos, tablón y bandeja de notificaciones (16/11, parte 6) — APLICADO 16/11 (0030 y datos, comprobado)
Decidido por Cristian: incidencias automáticas (Hay un problema, puntos Mal de checklists de trabajos y del encargado); solo él las gestiona;
problemas repetidos igual que la vieja; al móvil: incidencias a él, trabajos al operario, instrucciones/checklist del encargado, tablón a todos.
- `0030_incidencias_avisos.sql`: núcleo `usuarios_con_permiso`, `usuarios_de_personas`, `notificaciones` + `notificar` + `marcar_leidas`,
  `avisos` (tablón, permiso `nucleo.aviso.editar`); Limpieza `temas` (+ `_tema`, `_clave_lugar`), `incidencias` + `incidencia_notas`
  (+ `crear_incidencia`, `incidencia_estado`, `incidencia_nota`, permiso `limpieza.incidencia.editar`), `problemas` + `casos` + `problema_notas`
  (+ `problema_estado`, `problema_quitar`, `problemas_lista`); disparadores que crean incidencias, casos y notificaciones; fotos en `<empresa>/incidencias/<id>/`.
- Datos: `/home/claude/sql/incidencias_datos.sql` (5 temas de la vieja y la incidencia abierta de la Karcher).
- Pantallas: pestaña «Incidencias» (`src/limpieza/Incidencias.tsx`), tablón y «Te ha llegado» en Inicio (`src/nucleo/Tablon.tsx`), tablón arriba de Limpieza.
- Pruebas: `70-incidencias-avisos.sql` (36) y `pruebas/incidencias.spec.ts` (6).
- Falta: mandar la bandeja al móvil (función de Supabase + claves; con el «sí» de Cristian).

### 2.9 Avisos al móvil (16/11, parte 6) — APLICADO 16/11 (0031, función «avisos» v2 instalada sin JWT, claves creadas; probado en iPhone: llega)
Con el «sí» de Cristian (instalar la función «avisos» en colada-mapri cuando pegue la migración).
- `0031_avisos_movil.sql`: `nucleo.suscripciones` (+ `guardar_suscripcion`, `quitar_suscripcion`), claves en Vault (`push_secreto` y `push_url`
  los crea la migración; `push_publica`/`push_privada` los crea la función la primera vez), `clave_push` (si no hay, pide a la función que las cree),
  `_push_config/_push_guardar_claves/_push_pendientes/_push_resultado` (solo servicio y con la contraseña), disparador por sentencia en
  `nucleo.notificaciones` que llama a la función con pg_net si algún avisado tiene móvil, y pg_cron `avisos-al-movil` cada 5 min de reintento.
- Función `supabase/functions/avisos` (Deno, web-push 3.6.7; sin JWT: la protege la contraseña del Vault). Probada en Deno: claves y cifrado.
- App: `public/sw-avisos.js` (push y clic), `vite.config.ts` importScripts, «Avisos en este móvil» en Inicio (`src/nucleo/AvisosMovil.tsx`).
- v2: el contacto VAPID es la dirección de la app (Apple rechaza con 403 los inventados).
- ~~Pendiente: `_push_resultado` no borra `envio_error` cuando un reintento sale bien~~: arreglado en la 0032.
- Pruebas: `71-avisos-movil.sql` (17) y 2 en `pruebas/incidencias.spec.ts`. La imitación de Supabase tiene Vault, pg_net y pg_cron de mentira.

### 2.10 Resumen e informes (20/11, parte 7, trozo 1 de 4) — APLICADO 20/11 (0032 pegada por Cristian; comprobado: permisos, funciones, reloj de los lunes, arreglo de avisos e informe con datos reales)
Estudiada la app vieja (informe semanal PDF + Excel, informe por operario, «Por persona», «Cuánto tarda cada trabajo»,
costes, pestaña «Investigar»). Decidido por Cristian (20/11):
- Entra en la parte 7: informe semanal, informe por operario, resumen en pantalla e **Investigar entera** (saturación y pasar
  trabajos, tiempos con «Aplicar», problemas y sitios, «Pregúntale»). **Costes: más adelante.** Las horas del mes ya estaban (2.2).
- **Investigar personas** (días de baja, días y horas trabajadas…) va en **Personal**, no en Limpieza.
- Orden: 1) informes (este trozo); 2) Investigar de Limpieza; 3) Investigar personas en Personal; 4) «Pregúntale».
- Para no saturar: **una sola pestaña «Resumen»** en Limpieza con botones «En pantalla» e «Informes» (e «Investigar» cuando llegue).
- Informe semanal **igual que la vieja + aviso cada lunes a las 9:00** (hora de Madrid) al administrador.
- Informe por operario: lo de la vieja + **tiempo real** + **horas con detalle** (días y horas trabajadas, entre semana / fin de
  semana, extra, fuera de presupuesto, por sustitución, faltas, día a día). **PDF + Excel.**
- Resumen en pantalla: 7 días, 30 días o **entre fechas**.
- Quién lo ve: administrador todo; **encargados sin horas**; el Encargado hornos solo su equipo (`limpieza.responsables`);
  el resto de encargados (el de fin de semana) **los trabajos del equipo de su ficha**.
- `0032_limpieza_informes.sql`: permisos `limpieza.informe.ver` (el encargado lo coge por `limpieza.*.ver`) y `limpieza.informe.todo`
  (solo el administrador, por `*`); `limpieza.informe(empresa, desde, hasta)` (como mucho 400 días) devuelve los trabajos que le
  tocan a quien pregunta con los nombres puestos y su gente; `limpieza._aviso_informe_semanal` + pg_cron `informe-limpieza-lunes`
  (`0 7,8 * * 1` UTC y solo avisa si en Madrid son las 9; una vez por semana; solo si hubo trabajos; ruta
  `/m/limpieza/resumen/informes/<lunes>`); **arreglo de `nucleo._push_resultado`** (un reintento que sale bien borra el error).
- Pantalla: `src/limpieza/Resumen.tsx`; cuentas en `src/limpieza/informe.ts`; PDF y Excel en `src/limpieza/pdfInforme.ts` (se carga
  solo al sacar un informe). Librerías nuevas (MIT): `jspdf-autotable` 5.0.9 (tablas del PDF) y `write-excel-file` 4.1.1 (.xlsx con hojas).
- Diferencias con la vieja: en la nueva no hay «no se pudo hacer»: sale **«Con problema»** (el operario pulsó «Hay un problema») y
  «Sin hacer». Incidencias y problemas repetidos solo en el informe del administrador. Horas solo si la unidad tiene Personal y quien
  lo saca tiene `personal.horas.editar`; «por sustitución» = horas por encima de su horario hasta las del que falta (como la vieja).
- Pruebas: `supabase/pruebas/72-limpieza-informes.sql` (25) y `pruebas/resumen.spec.ts` (7; descargan el PDF y el Excel y miran dentro).
- Sin datos que traer. No hace falta tocar «Exposed schemas» (`limpieza` ya está).

### 2.11 Investigar (21/11, parte 7, trozo 2 de 4) — APLICADO 21/11 (0033 pegada por Cristian; comprobado: funciones, permisos e Investigar con datos reales)
Decidido por Cristian (21/11): igual que la pestaña «Investigar» de la app vieja (`07e`, `07g` de COLADA), con estos cambios:
- **Solo el administrador** (permiso `limpieza.informe.todo`): tercer botón «Investigar» dentro de «Resumen».
- **Problemas con los temas** de la parte 6 (`limpieza.temas`), no con las 7 categorías fijas de la vieja; sitio = máquina o zona
  (`limpieza._clave_lugar`, la misma regla que los problemas repetidos). Las tareas fijas no cuentan como problema.
- **«Pasar» igual que la vieja**: cambia la tarea fija desde hoy y sus trabajos pendientes (lo hecho no). Candidatos: mismo equipo,
  con horario todos los días de la tarea y sin pasar del límite (la ficha no tiene turno, así que no se mira el turno).
- **Tiempos igual que la vieja**: propuesto = (5 × previsto + n × real) / (5 + n), con la mediana de las últimas 20 veces sin las
  que pasan del triple; «Aplicar» y «Aplicar todos».
- **85 % y 30 min se pueden cambiar** («Cambiar» en Investigar): ajustes `investigar_limite` e `investigar_hueco` (módulo limpieza).
- Si la unidad no tiene Personal, la jornada sale del horario de cada ficha.
- `0033_limpieza_investigar.sql`: `limpieza.investigar(empresa, desde, hasta)` (= informe + problemas con tema y sitio + tareas +
  horas de horario por día de la semana), `limpieza.pasar_tarea(tarea, de, a)` y `limpieza.poner_tiempos(empresa, items)` (todo o nada).
- Pantalla `src/limpieza/Investigar.tsx` (se descarga al abrirla), cuentas en `src/limpieza/investigar.ts`, PDF y Excel en
  `src/limpieza/pdfInvestigar.ts` (informe completo, ficha de un sitio y lista de un trabajo).
- Pruebas: `supabase/pruebas/73-limpieza-investigar.sql` (23) y `pruebas/investigar.spec.ts` (6).

### 2.12 Investigar personas (21/11, parte 7, trozo 3 de 4) — PUBLICADO 21/11 (sin migración)
Decidido por Cristian (21/11): en **Personal → Horas**, tercer botón «Investigar» (no una pestaña más), **solo quien edita horas**.
- Tres vistas con un periodo (este mes, mes pasado, 3 meses, este año o entre fechas; solo días ya pasados, hasta ayer):
  **Una persona** (días y horas trabajadas entre semana / sábados / domingos / festivos y previstas; bajas, vacaciones, permisos y
  otras faltas como periodos de días seguidos con su nota; extra y fuera de presupuesto con su motivo; día a día),
  **Todos** (una fila por persona, ordenable por días de baja, horas, días trabajados, vacaciones, permisos, extra o fuera) y
  **Mes a mes** (de una persona o de todos; «bajas nuevas» = bajas que empiezan ese mes).
- PDF de la ficha y Excel (hojas Todos, Faltas, Extra y fuera, Mes a mes, Día a día).
- Sin migración: todo sale de `personal.horas_dias`. Cuentas en `src/personal/investigar.ts`, pantalla `src/personal/InvestigarPersonas.tsx`
  (se descarga al abrirla), PDF/Excel en `src/personal/pdfPersonas.ts`.
- Las piezas comunes de PDF y Excel (cabecera, cajas, tablas, Excel con hojas, bajar o compartir) pasan a `src/componentes/informes.ts`
  para que Personal no dependa de Limpieza.
- Pruebas: `pruebas/personas.spec.ts` (8: 4 de cuentas y 4 de pantallas).

### 2.13 Pregúntale (21/11, parte 7, trozo 4 de 4) — APLICADO 21/11 (0034 y copia de datos pegadas por Cristian; comprobado: 21 del diccionario, 4 preguntas, personas enlazadas)
Decidido por Cristian (21/11): el buscador de la app vieja (`07f` de COLADA) arriba de Limpieza → Resumen → Investigar, **solo el
administrador**, contestando de **trabajos y también de personas**; se traen «Enséñale», «¿Te ha servido?», favoritas y ejemplos, y
**todo lo enseñado en la vieja** (21 entradas: 5 personas, 12 lugares, 4 grupos) y sus 4 preguntas.
- Entiende con reglas (sin servicios de pago), regla a regla como la vieja: periodo, persona (y motes), máquina (las dadas de alta),
  nave (las del núcleo), lugar (con lo enseñado), tema (los de Incidencias, no las 7 categorías fijas), día, turno (el del trabajo; las
  fichas no tienen turno, así que no hay «cuánto sobra por turno»), grupos y palabras del trabajo; y unas 20 intenciones.
- Nuevo: **personas** (bajas, vacaciones, permisos, faltas, días y horas trabajadas, extra, fuera de presupuesto; de una persona, ranking o
  mes a mes) con las horas de Personal; «qué días ha trabajado X» da la lista de días (la vieja no, Cristian lo pidió). Periodos nuevos:
  «del … al …», «entre el … y el …» y dos meses («octubre y noviembre»).
- `0034_limpieza_preguntale.sql`: `limpieza.preguntas_dic` (persona, lugar, problema = tema, frase, grupo, favorita; con historial) y
  `limpieza.preguntas` (pregunta, lo entendido, respuesta, ok, lo que quería), solo con `limpieza.informe.todo`; `limpieza.investigar`
  trae además nave y hora de cada trabajo, temas, naves y máquinas.
- Copia de datos (fuera del repositorio): `preguntale_datos.sql` (ensayado dos veces: no repite; las personas por su nombre en la ficha).
- Motor `src/limpieza/preguntale.ts`, pantalla `src/limpieza/Preguntale.tsx` (dentro de Investigar, que se descarga al abrirlo).
  Las cuentas de personas pasan a `src/componentes/horasPersonas.ts` (las usan Personal y Pregúntale).
- Pruebas: `supabase/pruebas/74-limpieza-preguntale.sql` (13) y `pruebas/preguntale.spec.ts` (14: 10 del motor con preguntas de verdad y 4 de pantalla).
- Ojo (21/11): de 27 trabajos en la nueva solo 1 tiene nave (la sale de la máquina o la zona con su nave en Configuración). Para que
  «compara naves» sirva, las máquinas y zonas de Limpieza tienen que tener su nave puesta y los trabajos su máquina o zona.

## Aspecto nuevo (estilo Holded, «Pizarra») — TERMINADO 21/11
Decidido por Cristian (21/11; propuestas en https://claude.ai/artifact/RPSNo1UMtrmnHC9QEUdP8a): menú lateral, apartados dentro del menú,
panel con cifras en Inicio, tablas en todas las listas en el ordenador, colores «Pizarra». En tres trozos.

### A.1 Menú lateral y colores (21/11) — PUBLICADO 21/11 (sin migración)
- `src/pantallas/Lateral.tsx`: Inicio, los módulos de la unidad (con su puntito de color) y, bajo el módulo abierto, sus apartados (las
  pestañas de antes; cada módulo los da con `apartadosLimpieza/Personal/Prevencion(puede)`, con las mismas reglas de permisos);
  Configuración; al pie «Tengo un problema» y «Tu cuenta» (la ventana de antes: cambiar de unidad, salir, versión).
  Ordenador (≥ 900 px): siempre a la vista. Móvil: se abre con ≡ («Menú») y se cierra al elegir o con ✕.
- La barra de arriba es clara y dice el apartado abierto («Resumen», con «Limpieza · unidad» debajo); si la ruta no dice apartado, el
  de partida de cada módulo. Ya no hay pestañas arriba en Limpieza, Personal ni Prevención.
- Colores en las variables del principio de `src/estilos.css` (menú #18202f, fondo #f3f5f7, acento #0f7f77; con modo oscuro).
- Pruebas: `pruebas/lateral.spec.ts` (4) y ayudas `abrirMenu/irApartado/cerrarMenu` en `pruebas/simulador.ts` (las pruebas que usaban
  las pestañas ahora van por el menú, como una persona).

### A.2 Panel de Inicio (21/11) — PUBLICADO 21/11 (sin migración)
- Inicio: saludo, tablón y «Te ha llegado» como antes; después el panel (`section.panel`) y, más pequeños, «Ir a» con los módulos.
- Tarjetas (componente común `src/componentes/Panel.tsx`), cada una según los permisos de siempre y tocándola se va a su apartado:
  - Limpieza (`src/limpieza/panel.tsx`): **Limpieza de hoy** (`mi_dia`: hechos, pendientes, sin asignar; saturación de la semana con las
    cuentas de Investigar solo con `informe.todo` y horas) o, al operario, **Tus trabajos de hoy** (lo siguiente; va a «Mi día»);
    **Incidencias** (abiertas, urgentes, problemas que se repiten, la última); **Quién falta hoy** (`nucleo.ausencias` sin festivos, con
    quién cubre; con `nucleo.persona.ver` y repartir).
  - **Pendientes de firmar**: suman lo que aporta cada módulo (`src/personal/panel.ts`: calendarios sin firmar del año o el tuyo;
    `src/prevencion/panel.ts`: firmas de charlas que faltan, documentos sin firmar, cursos caducados o que caducan en 60 días; al
    trabajador, sus charlas y documentos).
- Pruebas: `pruebas/panel.spec.ts` (3). El simulador entiende ahora `not.is.null` y `cs.{…}`.
- Aprendido: no usar la clase `aviso` (es la de los mensajes flotantes); el naranja del panel es `naranja`.

### A.3 Tablas (21/11) — PUBLICADO 21/11, los cuatro módulos (sin migración)
Decidido por Cristian (21/11): tabla en los **listados de verdad**; las listas pequeñas de las ventanas y las de escribir horas siguen
en filas. Orden: Configuración, Limpieza, Personal, Prevención.
- `src/componentes/Tabla.tsx`: en el ordenador (≥ 900 px, `useOrdenador`) tabla con buscador, filtros, columnas que se ordenan tocando
  el título (▲ ▼, con números en su orden: F3 antes que F25) y «N filas»; en el móvil, las filas de siempre. Columnas `soloTabla` y
  `soloMovil` para que el móvil se vea igual que antes. Tocar una fila abre su ficha (también con Intro).
- **Configuración** (PUBLICADO 21/11): todos los catálogos (columnas sacadas de sus campos) y Usuarios (en el ordenador, tabla con roles
  y botones; en el móvil, como antes). Salud de la app, sin cambios (listas cortas, solo superadmin).
- **Limpieza** (PUBLICADO 21/11): en el ordenador, tabla en Hoy del equipo (filtros Pendientes / Sin asignar / Con problema / Hechos;
  tocar abre el trabajo), Tareas (los equipos o grupos como filtros), Checklists, Incidencias (urgentes, abiertas, en proceso…),
  Problemas que se repiten y las dos listas de Resumen → En pantalla (por persona y cuánto tarda). Siguen en filas a propósito: Mi día
  (es la agenda del operario), Personas (se escribe en ella), las listas pequeñas del fin de semana y las de Investigar (llevan
  botones y barras). Arreglado de paso: la chapa verde «Hecho/Firmado» cogía el borde de la caja de firmas (misma clase `firmado`).
  Pruebas: una de ordenador en `limpieza`, `hoy` e `incidencias`.
- **Personal** (PUBLICADO 21/11): en el ordenador, tabla en Calendario (operarios: calendario, horas, debe hacer, estado; filtros Sin
  hacer / No cuadran / Sin enviar / Sin firmar / Firmados; casillas para elegir varios), Vacaciones (periodos con «Cambiar», días
  naturales del año, «Añadir»), Firmas (estado, enviado, firmado, conforme, «Ver», casillas), Horas del mes (un dato por columna) e
  Investigar personas (Todos y Mes a mes; en el ordenador se ordena tocando la columna en lugar del desplegable). Siguen en filas:
  Horas del día (se escribe), Mi calendario, Mis horas, el cuadro de horas de Firmas y la ficha de una persona.
  La tabla común admite casillas (`eleccion`) y un botón dentro de una fila ya no abre también la ficha.
  Pruebas: una de ordenador en `personal`, `horas` y `personas`.
- **Prevención** (PUBLICADO 21/11): en el ordenador, tabla en Charlas (los 12 meses: charla, enviada, cerrada, firmas «1 de 2», estado;
  filtros Sin charla / Sin enviar / Firmando / Cerradas), Documentos (trabajador o botiquín, fecha, detalle, estado; filtros Sin firmar /
  Firmados / Anulados), Fichas (puesto, le falta, cursos, estado; filtros Les falta algo / Cursos caducados o a punto) y Stock (hay/mínimo
  por talla en rojo si falta, pedir, estado; filtro Hay que pedir). Siguen en filas: Mis charlas, las firmas de una sesión, los cursos y
  documentos de una ficha (dentro de ventanas). Arreglado de paso: en el ordenador, los campos y botones de arriba de las listas
  (`.filtros`) van en una línea, cada uno de su tamaño (antes «Subir documentos del año» salía partido en tres líneas).
  Pruebas: una de ordenador en `prevencion` y `stock`.
- Pruebas: `pruebas/tabla.spec.ts` (3). Arreglado de paso: una prueba de incidencias que miraba la petición antes de que saliera.

### Stock de ropa y EPI (15/11, pedido por Cristian) — APLICADO 15/11 (0023, comprobado)
Decidido: por talla; se descuenta al hacer la entrega (no al firmar); solo para su unidad (cada unidad el suyo).
- `0023_prevencion_stock.sql`: `prevencion.material` (nombre, línea de la hoja oficial `epi`, prenda de la ficha de donde
  sale la talla, tallas, mínimos por talla) y `prevencion.stock_mov` (solo se añaden: entrada, entrega, devolución,
  ajuste). Vista `v_stock` (stock = suma de movimientos, con mínimo). Disparador en `prevencion.documentos` (tipo epi):
  al crear la entrega descuenta; si se cambia antes de firmar corrige la diferencia; si se borra o se anula, vuelve.
  Al firmar no mueve nada (así las entregas de antes no descuentan). Talla: la elegida en la entrega o la de la ficha.
  `recontar_stock` (recuento: apunta la diferencia). Permiso `prevencion.stock.editar` (solo administrador); quien
  hace entregas ve el stock.
- Pantallas: Prevención → «Stock» (material, «He recibido un pedido», «Recuento», «Hoja del pedido (PDF)») y en la
  entrega de EPI la talla y «quedan N» de lo que es material del almacén (`src/prevencion/stock.tsx`).
- Pruebas: `supabase/pruebas/57-prevencion-stock.sql` (28) y `pruebas/stock.spec.ts` (5).
- Sin datos que traer: Cristian da de alta su material y hace el primer recuento.

### Calendario 2027 (pendiente, viene de la app vieja)
- Semana 2027 ya cargado en la app vieja de Calendario (225 días, como el Excel de la fábrica).
- Fin de semana 2027: solo existe el **relevo B** (la columna A del Excel no es nadie). Del Excel:
  - Trabaja todos los sábados y domingos salvo: 2–3/1, 21–22/8, 9–10/10, sábado 30/10, 11–12/12 y 25–26/12.
  - Vacaciones: 19/7–15/8 y 23–24/12.
  - Trabaja entre semana: 4–5/1; lunes 11, 18 y 25/1, 1 y 8/2; 29/3; 16–20/8; 11–12/10; 1/11; 27–30/12.
  - Decidido (13/11): las vacaciones y los días entre semana del fin de semana **cambian según el año**, así que los
    pone Cristian desde la app nueva, no se dejan fijos: tipos de día «Trabaja» (un día fuera de los de su equipo) y
    «Descanso» (un día de su equipo que no trabaja), y «Vacaciones para todo el equipo» (luego se cambian sueltas).

### A.4 Inicio sin «Ir a» (22/11, pedido por Cristian) — PUBLICADO 22/11
Los recuadros de «Ir a» (un mosaico por módulo y Configuración) repetían el menú lateral: quitados. Inicio queda con el saludo, el
tablón, lo que te ha llegado, el panel (Limpieza de hoy, pendientes de firmar) y los avisos del móvil. A los módulos se va por el menú
(≡ en el móvil). Pruebas cambiadas para entrar por el menú.

## Parte 8: en paralelo con la app vieja (21/11) — EN CURSO
Decidido por Cristian (21/11): durante las 2–4 semanas en paralelo **solo él** usa la app nueva a la vez que la vieja; los operarios
siguen solo con la vieja y cambian una sola vez, el día del cambio.

### 8.1 Entrar con código de alta + PIN — APLICADO 22/11 (0035, comprobado), función «pin» instalada (v1, sin JWT) y PUBLICADO
Decidido (21/11): código de alta (o su QR) + PIN de 4 cifras; en la pantalla de entrar no sale ningún nombre. Si olvida el PIN,
cambia de móvil o se bloquea (5 fallos seguidos): se le da otro código. Puesto por defecto: el código sirve una vez y caduca a los
7 días; un móvil por persona; rol «Operario» de partida (se puede elegir otro y una nave).
- `0035_nucleo_pin.sql`: `nucleo.codigos_alta` (huella sha256 del código) y `nucleo.moviles` (huellas de la llave del móvil y del PIN con
  sal; fallos, bloqueado, último acceso). La app solo lee columnas sin huellas. `codigo_alta(persona, rol, nave)` (con
  `nucleo.usuario.editar`; no a quien entra con correo, ni a uno mismo, ni de baja; anula el código y el móvil anteriores) y
  `codigo_anular`. Solo para la función de servidor: `pin_codigo`, `pin_alta`, `pin_entrar` (cuenta fallos; al 5.º, bloqueado).
- Función de servidor `supabase/functions/pin` (sin comprobar sesión, verify_jwt = false): «alta» crea la cuenta sin correo de verdad
  (`pin-<id de su ficha>@pin.invalid`, nunca se le manda nada) y «entrar»; las dos devuelven un vale de un solo uso (`generateLink`
  sin enviar correo) con el que la app abre la sesión (`verifyOtp`). La llave secreta del móvil está en `localStorage` (`gf-movil-pin`);
  el PIN no se guarda nunca. PIN demasiado fácil (1111, 1234, 9876) no se deja.
- Pantallas: entrar con PIN (teclado de números grande), «Soy operario: tengo un código de alta», alta con el QR (`#/alta/<código>`);
  Configuración → Usuarios: «Operario: código de alta (PIN)» con el código y su QR (librería `qrcode`, MIT), estado de cada uno
  (con PIN, bloqueado, sin móvil), «Nuevo código de alta» y «Códigos de alta sin usar» (anular). El botón de siempre pasa a llamarse
  «Dar acceso con correo».
- Pruebas: `supabase/pruebas/75-nucleo-pin.sql` (41) y `pruebas/pin.spec.ts` (6).
- **Arreglo 22/11 (prueba de Cristian en iPhone):** el QR abre Safari y el alta se guardaba en Safari; la app de la pantalla de inicio
  del iPhone tiene su propio almacén y no la veía (pedía correo y contraseña). Ahora, en un iPhone en Safari, el alta avisa de que se
  haga dentro de la app (enseña el código y cómo añadir la app a la pantalla de inicio; «Usar la app aquí en Safari de todas formas»).
  La ventana del código lo dice también. En Android no pasa (comparten almacén). Prueba nueva en `pin.spec.ts`.
- **Probado por Cristian 22/11:** «Pruebas 2» entró con PIN desde su iPhone.
- **0036 (22/11, tras sus pruebas) — APLICADO 22/11 (comprobado), función «pin» v2 instalada y PUBLICADO:** (1) una ficha cuyos usuarios con correo ya no tienen ningún rol (se los quitó) sí puede pasar a PIN:
  al dar de alta el móvil esos usuarios se desenlazan de la ficha (no se borran) y se hace el de PIN (`_entra_con_correo`);
  (2) **«He olvidado mi PIN: avisar al administrador»** en la pantalla del PIN: `pin_olvido(móvil, llave)` (función de servidor
  «pin», acción «olvido») avisa a quien tiene `nucleo.usuario.editar` (campana y móvil; un aviso cada 30 minutos por móvil; dice si
  está bloqueado). Pruebas: `76-nucleo-pin-arreglos.sql` (14) y una más en `pin.spec.ts`.
- **Cambiar de usuario (22/11, pedido por Cristian para sus pruebas):** un móvil puede tener varias personas dadas de alta (cada una con
  su código la primera vez en ese móvil). Si hay más de una: «¿Quién eres?» con **solo** los nombres dados de alta en ese móvil; en la
  pantalla del PIN, «Cambiar de usuario» y «Tengo un código de alta (nuevo o de otra persona)». Se guarda en `gf-moviles-pin` (lista) y
  `gf-movil-pin-actual`; lo de antes (`gf-movil-pin`) se pasa solo a la lista. Sin migración ni cambios en el portero.

### 8.2 Copia semanal de la app vieja a la nueva (22/11) — EN CURSO
Decidido por Cristian (22/11): en paralelo **solo apunta en la vieja**; **una vez por semana** se copia a la nueva y él comprueba que
enseña lo mismo. Qué se copia: **Personal**, **Limpieza (lo hecho cada día)**, **Limpieza (tareas y equipos)** y **Prevención**, en ese orden.
- Receta sin datos en `scripts/copia-semanal/` (`LEEME.md`: cómo leer la vieja, montar el archivo de la semana, ensayar y comprobar
  con huellas). Los archivos de cada semana llevan nombres y notas: **fuera del repositorio**.
- **Personal** (`personal.sql`): horas del día (sin las 316 jornadas de vacaciones, que son `cal_vac`; sin motivo → «(sin motivo en la
  app vieja)»), vacaciones (mismo id) y calendario («Semana AAAA» / «Fin de semana AAAA»: pone o cambia, no borra; avisa). Nunca
  toca lo hecho en la app nueva. Resumen al final. Prueba `supabase/pruebas/77-copia-semanal-personal.sql` (16, datos inventados).
- Comparado 22/11 antes de la primera copia: vacaciones y calendario iguales; horas: faltan 4 días en la nueva (21/11 y 22/11 de
  fin de semana con extra; 4/11 y 13/11 con horas fuera de presupuesto).
- **1.ª copia de Personal: PEGADA 22/11 por Cristian y comprobada** (4 días de horas nuevos; huellas iguales en las dos apps:
  42 días de horas y 35 vacaciones).
- **Limpieza, lo hecho cada día** (decidido 22/11): **todo desde el 5/10** (~800 `ots`); las fijas que la nueva saca sola y nadie tocó
  se **cambian por las de la vieja** en esos días (lo hecho a mano en la nueva se queda); **sin fotos** de momento (865 archivos en
  el Storage de limpieza-cie: no se pueden pasar con SQL ni desde aquí; se decide para el día del cambio), en la nota «N fotos en la app vieja».
  Traducción `ots` → `limpieza.trabajos` (mismo id, origen `limpieza-cie:ots:<id>`): origen fija → `fija`; habitual (habitual_id o tipo
  Habitual/limpieza de horno o inyectora) → `habitual`; rápida «Incidencia» y Excel → `suelto`; `borrado` no se copia; estado hecha → hecho,
  en_curso → en_curso, pendiente y no_hecha → pendiente (con el motivo en la nota); tarea por `limpieza.tareas.origen`
  (`limpieza-cie:tareas_fijas:<id>` / `tareas_habituales:<id>`); máquina: `elementos.codigo` = `nucleo.activos.codigo` (Limpieza);
  equipo por nombre (Finde → finde); turno por nombre (Mañana finde no existe → vacío); checklist `{"punto": "OK"}` → `[{texto, tipo, valor}]`;
  minutos = fin − inicio − pausado (mínimo 1). **Al copiar hay que apagar los disparadores `notificar`, `incidencias`, `caso` y `soltar`
  de `limpieza.trabajos`** (si no, cientos de avisos e incidencias) y volver a encenderlos; el historial se deja.
  Receta `scripts/copia-semanal/limpieza-trabajos.sql` y prueba `78-copia-semanal-limpieza.sql` (14). Como son ~800 trabajos (340.000
  letras), Cristian pega `leer-vieja-limpieza.sql` en la vieja y la casilla que sale en colada-mapri (`montar.sh`; ver `LEEME.md`).
  **1.ª copia PEGADA 22/11 por Cristian y comprobada**: 801 trabajos desde el 5/10 (730 hechos; 340 fijas, 73 habituales, 388 sueltos;
  413 con tarea, 59 con máquina; todas las tareas y máquinas existían), 53.152 minutos hechos igual que en la vieja; 23 fijas sacadas
  solas cambiadas; ningún aviso ni incidencia; disparadores encendidos; los 5 trabajos hechos en la nueva siguen.
- **Limpieza, tareas y equipos** (22/11): receta `limpieza-tareas.sql` (+ `leer-vieja-limpieza-tareas.sql`), prueba `79-copia-semanal-tareas.sql` (9).
  Tareas fijas y habituales: la vieja manda en lo suyo (título, descripción, días —«todos» = lunes a viernes, o sábado y domingo en Finde—,
  equipo, turno, quién, minutos, «solo para», sitio, grupo de las habituales, activa); lo que solo tiene la nueva (grupo de las fijas,
  máquina o zona) no se toca; las inactivas que nunca se copiaron no se crean. Equipos de cada trabajador, habilidades y responsable de
  hornos: **solo avisos**. Comparado 22/11: igual salvo «Basuras Nave 2», que en la nueva tenía domingo y «pruebas» (de sus pruebas del 14/11).
  **1.ª copia PEGADA 22/11 y comprobada**: «Basuras Nave 2» vuelve a lunes, miércoles y viernes con su operario; 35 tareas activas, todas con origen de la vieja.
  Aviso que salió: «Prueba Encargado» (trabajador de prueba de la vieja, 29/10) no está en la nueva: correcto. Desde ahí el aviso dice el nombre.
- **Prevención** (22/11): receta `prevencion.sql` (+ `leer-vieja-prevencion.sql`, ~550.000 letras por las imágenes), prueba
  `80-copia-semanal-prevencion.sql` (14, también que la 2.ª vez no duplica). Toolbox (`prl_toolbox` → `charlas`, por año y mes), sesiones
  (`prl_sesion`, mismo id; una cerrada en la nueva no se toca), firmas de charlas (`prl_firma` → `nucleo.firmas` con `imagen` + `asistencias`;
  solo se añaden; huella del documento = sha256 de «limpieza-cie:prl_firma:<id>»), entregas de EPI (`prl_doc`) y formaciones
  (`prl_formacion` → `documentos` tipo formacion, con evaluación): se crean sin firmar y se firman con `prevencion.firmando = si`;
  certificados (`prl_cert` → `cursos`, sin archivo: 3 archivos en `prl_cert_arch`, «N archivos en la app vieja»); fichas (`prl_trab`, sin
  `rm_*`: el reconocimiento médico no se migra). Se apaga el disparador `stock` de `documentos` (no descuenta EPI) y se vuelve a encender.
  Arreglos tras los dos primeros intentos de Cristian (22/11, no se guardó nada): la imagen de la charla en la vieja es un archivo
  (`img/toolbox/…`) → se deja la de la nueva; texto vacío en la vieja = nada en la nueva (si no, «cambiaba» todos los meses); una charla
  con firmas o cerrada en la nueva no se cambia nunca (aviso); una charla del mismo mes hecha en la nueva no se pisa (aviso). Prueba: 18.
  **1.ª copia PEGADA 22/11 (3.er intento) y comprobada**, igual que en la vieja: 4 sesiones, 16 firmas de charlas, 10 documentos (10 firmados),
  4 certificados, 9 fichas (la 10.ª es «Prueba Encargado», que no está en la nueva); 26 firmas con imagen; ningún movimiento de stock ni
  aviso; disparadores encendidos.
- **Rutina semanal (desde el 22/11):** Cristian pega en la vieja `leer-vieja-personal.sql`, `leer-vieja-limpieza.sql`,
  `leer-vieja-limpieza-tareas.sql` y `leer-vieja-prevencion.sql` (uno a uno) y la casilla de cada uno en colada-mapri; Claude comprueba.
  Pendiente para el día del cambio: fotos de trabajos (865) y archivos de certificados (3), que están en el Storage / base de la vieja.

### 8.3 Día del cambio (preparación, 22/11) — EN CURSO
Decidido por Cristian (22/11): las **fotos** de trabajos (865) se quedan en la app vieja (se consultan allí; en la nueva cada trabajo dice
cuántas tenía); los **3 archivos de certificados** los vuelve a subir él a mano en la ficha; los códigos de alta se reparten con una
**hoja para imprimir**; qué hacer con la app vieja después: **lo decide más adelante**.
- **Hoja de códigos (PDF)** en Configuración → Usuarios (PUBLICADO 22/11, sin migración): marca a los trabajadores que aún no tienen
  móvil ni entran con correo, saca sus códigos (`codigo_alta`, rol Operario por defecto) y hace un PDF A4 con 8 tarjetas para recortar
  (nombre en una línea, código, QR, 3 pasos y el aviso del iPhone; `src/configuracion/hojaCodigos.ts`). Los códigos caducan a los 7 días:
  se hace el mismo día del cambio. Prueba en `pin.spec.ts`.
- **Borrar los datos de prueba** (`scripts/dia-del-cambio/`, montados con `montar.sh`): `ver-pruebas.sql` (solo mira; también los archivos
  del Storage a quitar a mano) y `borrar-pruebas.sql` (todo o nada; apaga y vuelve a encender las protecciones de lo firmado).
  Reglas en `objetivos.sql`, sin nombres reales: fichas «pruebas» y «Pruebas 2» con todo lo suyo; del superadmin, documentos y certificados
  hechos en la nueva y sus envíos de calendario de antes del 23/11; trabajos hechos en la nueva antes del 17/11; charlas hechas en la nueva
  antes del 23/11. **Decidido 22/11**: sus vacaciones se quedan; la incidencia de la Karcher es de verdad (copiada de la vieja) y se queda.
  Lista vista el 22/11 en colada-mapri: 2 fichas, 4 usuarios, 5 documentos, 1 certificado, 1 charla con 2 asistencias, 1 calendario,
  2 envíos, 9 firmas, 5 trabajos. Prueba `81-dia-del-cambio-borrar.sql` (12). Las cuentas de Supabase (auth) no se tocan.
- **Lista paso a paso**: `docs/dia-del-cambio.md`.

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
