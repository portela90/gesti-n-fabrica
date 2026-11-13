# Estado del proyecto (para empezar una conversación nueva)

Última actualización: 12/11/2026. Léelo junto con `CLAUDE.md` y `README.md`.

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

## Siguiente: Fase 1 (Personal y Prevención)
Calendario laboral (festivos, cierres, vacaciones, firmas) y Toolbox (charlas, EPIs, formación, firmas mensuales).
Migrar desde limpieza-cie (tablas `cal_dia`, `cal_vac`, `cal_firma`, `prl_*`) con historial completo y comprobar
que cuadra antes de dejar la app vieja en solo consulta.

### Calendario 2027 (pendiente, viene de la app vieja)
- Semana 2027 ya cargado en la app vieja de Calendario (225 días, como el Excel de la fábrica).
- Fin de semana 2027: solo existe el **relevo B** (la columna A del Excel no es nadie). Del Excel:
  - Trabaja todos los sábados y domingos salvo: 2–3/1, 21–22/8, 9–10/10, sábado 30/10, 11–12/12 y 25–26/12.
  - Vacaciones: 19/7–15/8 y 23–24/12.
  - Trabaja entre semana: 4–5/1; lunes 11, 18 y 25/1, 1 y 8/2; 29/3; 16–20/8; 11–12/10; 1/11; 27–30/12.
  - Falta que Cristian confirme: si las vacaciones son para todo el equipo de fin de semana (como en 2026) y cómo
    quiere que salgan los días entre semana en el calendario que se firma.

## Avisos
- Al exponer `nucleo` en «Exposed schemas» (12/11) el esquema por defecto de la API de colada-mapri dejó de ser
  `public`: las llamadas que no dicen esquema (pg_net desde limpieza-cie) daban 404. Arreglado en Limpieza con la cabecera
  `Content-Profile: public` (COLADA `supabase/migraciones/limpieza_envios_almacen_esquema_public.sql`). Cualquier llamada
  nueva entre proyectos debe decir siempre el esquema.
- No pedir ni guardar contraseñas ni claves; si Cristian pega una en el chat, decirle que la cambie.
- El revisor de Supabase avisa de funciones de las apps viejas que se pueden llamar sin entrar (p. ej.
  `errores_listar`): pendiente de revisar en COLADA, no tocado.
