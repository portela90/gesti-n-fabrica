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

### Lo siguiente de la Fase 1, en orden
1. ~~Dar de alta Limpieza de verdad~~ HECHO 13/11: equipos «Semana» (`semana`) y «Fin de semana» (`finde`) y 13
   trabajadores con el **mismo id** que en limpieza-cie (2 de baja; sin las fichas de prueba; sin teléfonos ni DNI, que
   llegan con Prevención). Ahmed El Hait estaba en los dos equipos: puesto en Semana. Usuario de Cristian enlazado a su ficha.
2. **Entrar con nombre y PIN** (operarios): hace falta para que firmen en su móvil. Por decidir cómo (ver abajo).
3. **Traer los datos del calendario** de limpieza-cie (`cal_dia` → `personal.dias`, `cal_vac` → `personal.vacaciones`,
   `cal_firma` está vacía) con `origen` = tabla:id vieja, y comprobar que cuadra.
4. **Prevención** (Toolbox): datos del trabajador, charlas mensuales, formación F40R304, documentos PRL y EPIs,
   certificados, tallas, expediente PDF. Y traer `prl_*`.
5. App vieja de Calendario y Toolbox en solo consulta.

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
