-- =====================================================================================
-- 0001 · NÚCLEO: la planta y la gente, común a todos los módulos.
-- Todo vive en el esquema «nucleo». Cada tabla de negocio lleva empresa_id: la base de
-- datos solo deja ver las filas de las empresas del usuario (ver 0002_permisos.sql).
-- Las relaciones entre tablas llevan también la empresa (claves dobles empresa_id + id)
-- para que sea imposible, por ejemplo, poner una máquina de una empresa en la nave de otra.
-- Nada de la planta va escrito en el código: naves, máquinas, almacenes, artículos,
-- turnos… son filas de estas tablas.
-- «baja» = fecha en que se dio de baja (vacío = en uso). No se borra nada que tenga historia.
-- =====================================================================================

create schema if not exists nucleo;

-- ---------- empresas y módulos ----------
create table nucleo.empresas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique check (codigo ~ '^[a-z0-9-]{2,30}$'),
  nombre      text not null,
  logo_ruta   text,
  baja        timestamptz,
  creado      timestamptz not null default now()
);
comment on table nucleo.empresas is 'Cada empresa que usa la app (hoy MAPRI y CIE). Preparado para más.';

create table nucleo.modulos (
  codigo  text primary key check (codigo ~ '^[a-z]+$'),
  nombre  text not null,
  orden   int  not null default 0
);
comment on table nucleo.modulos is 'Lista fija de módulos que existen en la app (coladas, almacen…). Se rellena en 0004.';

create table nucleo.empresa_modulos (
  empresa_id uuid not null references nucleo.empresas(id),
  modulo     text not null references nucleo.modulos(codigo),
  activo     boolean not null default true,
  primary key (empresa_id, modulo)
);
comment on table nucleo.empresa_modulos is 'Qué módulos tiene encendidos cada empresa.';

-- ---------- centros (naves) y ubicaciones ----------
create table nucleo.centros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null,
  nombre      text not null,
  orden       int  not null default 0,
  baja        timestamptz,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);
comment on table nucleo.centros is 'Naves o plantas de cada empresa (Nave 1, Nave 2, planta de CIE…).';

create table nucleo.ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  centro_id   uuid,
  padre_id    uuid,
  codigo      text not null,
  nombre      text not null,
  baja        timestamptz,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id),
  foreign key (empresa_id, padre_id)  references nucleo.ubicaciones(empresa_id, id)
);
comment on table nucleo.ubicaciones is 'Árbol nave → zona → puesto o estantería. El código es el que va en el QR.';

-- ---------- turnos y equipos ----------
create table nucleo.turnos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  centro_id   uuid,
  codigo      text not null,
  nombre      text not null,
  inicio      time,
  fin         time,
  orden       int not null default 0,
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.turnos is 'Relevos (mañana, tarde, noche…). Coladas apunta el consumo por relevo con esta tabla.';

create table nucleo.equipos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null,
  nombre      text not null,
  dias        int[] not null default '{1,2,3,4,5}' check (dias <@ '{0,1,2,3,4,5,6}'),
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);
comment on table nucleo.equipos is 'Equipos de trabajo y qué días trabajan (0 = domingo). Ej.: Semana = L-V, Fin de semana = S-D.';

-- ---------- activos (máquinas y piezas con número propio) ----------
create table nucleo.tipos_activo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null,
  nombre      text not null,
  con_numero  boolean not null default true,
  estados     jsonb not null default '[]'::jsonb check (jsonb_typeof(estados) = 'array'),
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);
comment on table nucleo.tipos_activo is 'Tipos de activo (inyectora, horno, eje, pistón, molde, contenedor, tolva…) y sus estados posibles: [{"codigo":"planta","nombre":"En planta","color":"verde"}, …].';

create table nucleo.activos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references nucleo.empresas(id),
  tipo_id       uuid not null,
  centro_id     uuid,
  ubicacion_id  uuid,
  montado_en    uuid,
  codigo        text not null,
  nombre        text,
  estado        text,
  atributos     jsonb not null default '{}'::jsonb check (jsonb_typeof(atributos) = 'object'),
  baja          timestamptz,
  creado        timestamptz not null default now(),
  creado_por    uuid default auth.uid(),
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, tipo_id)      references nucleo.tipos_activo(empresa_id, id),
  foreign key (empresa_id, centro_id)    references nucleo.centros(empresa_id, id),
  foreign key (empresa_id, ubicacion_id) references nucleo.ubicaciones(empresa_id, id),
  foreign key (empresa_id, montado_en)   references nucleo.activos(empresa_id, id),
  check (montado_en is null or montado_en <> id)
);
comment on table nucleo.activos is 'Cada máquina o pieza con número propio. montado_en = en qué máquina está puesta (un eje en la F25). Los campos extra van en atributos.';
create index on nucleo.activos (empresa_id, tipo_id);
create index on nucleo.activos (montado_en);

-- ---------- almacenes, artículos, proveedores ----------
create table nucleo.almacenes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  centro_id   uuid,
  codigo      text not null,
  nombre      text not null,
  tipo        text not null default 'general' check (tipo in ('general', 'produccion', 'externo')),
  orden       int  not null default 0,
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.almacenes is 'Almacén general, de producción (se reponen por dotación) o externo (el del aluminio).';

create table nucleo.unidades (
  codigo     text primary key,
  nombre     text not null,
  decimales  int  not null default 0 check (decimales between 0 and 3)
);
comment on table nucleo.unidades is 'Unidades de medida (ud, kg, l, par, m³…). Comunes a todas las empresas.';

create table nucleo.familias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null,
  nombre      text not null,
  modulo      text references nucleo.modulos(codigo),
  orden       int  not null default 0,
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);
comment on table nucleo.familias is 'Familias de artículos (consumible, pistón, barra expulsora, aceite, materia prima…). modulo = el módulo que la gestiona.';

create table nucleo.articulos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  familia_id  uuid,
  codigo      text not null,
  nombre      text not null,
  unidad      text not null default 'ud' references nucleo.unidades(codigo),
  control     text not null default 'cantidad' check (control in ('cantidad', 'lote', 'serie')),
  minimo      numeric check (minimo is null or minimo >= 0),
  atributos   jsonb not null default '{}'::jsonb check (jsonb_typeof(atributos) = 'object'),
  baja        timestamptz,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, familia_id) references nucleo.familias(empresa_id, id)
);
comment on table nucleo.articulos is 'Todo lo que tiene stock. control: por cantidad (guantes), por lote (aluminio: cada colada) o por número de serie.';

create table nucleo.proveedores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  codigo      text not null,
  nombre      text not null,
  tipo        text not null default 'material' check (tipo in ('material', 'taller', 'servicio')),
  contacto    jsonb not null default '{}'::jsonb,
  baja        timestamptz,
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);
comment on table nucleo.proveedores is 'Proveedores y talleres de fuera (aluminio, repuestos, reparación de ejes y tolvas).';

-- ---------- personas y usuarios ----------
create table nucleo.personas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  nombre      text not null,
  categoria   text,
  jornada     text check (jornada in ('completa', 'parcial', 'externo')),
  equipo_id   uuid,
  centro_id   uuid,
  horario     jsonb,
  telefono    text,
  email       text,
  baja        timestamptz,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  unique (empresa_id, id),
  foreign key (empresa_id, equipo_id) references nucleo.equipos(empresa_id, id),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.personas is 'Cada trabajador, tenga o no usuario en la app. jornada «externo» = de otra empresa (no cuenta horas).';

create table nucleo.usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  persona_id     uuid references nucleo.personas(id),
  nombre         text not null,
  email          text,
  superadmin     boolean not null default false,
  empresa_actual uuid references nucleo.empresas(id),
  baja           timestamptz,
  creado         timestamptz not null default now()
);
comment on table nucleo.usuarios is 'Quien entra en la app. El mismo id que su usuario de Supabase Auth (correo, enlace o PIN). superadmin = puede con todo (Cristian).';

-- ---------- ajustes y campos extra ----------
create table nucleo.ajustes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  centro_id   uuid,
  modulo      text not null references nucleo.modulos(codigo),
  clave       text not null,
  valor       jsonb not null,
  unique nulls not distinct (empresa_id, centro_id, modulo, clave),
  foreign key (empresa_id, centro_id) references nucleo.centros(empresa_id, id)
);
comment on table nucleo.ajustes is 'Parámetros de cada módulo por empresa y, si hace falta, por nave (destinatarios de informes, avisos…).';

create table nucleo.campos_extra (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references nucleo.empresas(id),
  entidad      text not null check (entidad in ('activo', 'articulo', 'persona')),
  aplica_a     uuid,
  clave        text not null check (clave ~ '^[a-z][a-z0-9_]{0,40}$'),
  etiqueta     text not null,
  tipo         text not null check (tipo in ('texto', 'numero', 'fecha', 'lista', 'si_no')),
  opciones     jsonb,
  obligatorio  boolean not null default false,
  orden        int not null default 0,
  baja         timestamptz,
  unique nulls not distinct (empresa_id, entidad, aplica_a, clave)
);
comment on table nucleo.campos_extra is 'Campos que se añaden sin programar. aplica_a = un tipo de activo o una familia (vacío = a todos). El valor se guarda en atributos.';

-- ---------- archivos, firmas, incidencias, errores, versiones ----------
create table nucleo.archivos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references nucleo.empresas(id),
  modulo      text references nucleo.modulos(codigo),
  entidad     text not null,
  entidad_id  uuid not null,
  ruta        text not null,
  nombre      text,
  mime        text,
  bytes       bigint check (bytes is null or bytes >= 0),
  sha256      text,
  subido_por  uuid default auth.uid(),
  creado      timestamptz not null default now()
);
comment on table nucleo.archivos is 'Fotos y documentos. El archivo va en Storage (ruta); aquí solo sus datos.';
create index on nucleo.archivos (empresa_id, entidad, entidad_id);

create table nucleo.firmas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references nucleo.empresas(id),
  modulo           text not null references nucleo.modulos(codigo),
  documento        text not null,
  documento_id     uuid not null,
  persona_id       uuid not null,
  conforme         boolean not null default true,
  comentario       text,
  imagen_ruta      text,
  sha256_documento text not null,
  firmado_en       timestamptz not null default now(),
  firmado_por      uuid default auth.uid(),
  dispositivo      jsonb,
  foreign key (empresa_id, persona_id) references nucleo.personas(empresa_id, id)
);
comment on table nucleo.firmas is 'Firmas (calendario, toolbox, EPIs…). Solo se añaden: nunca se cambian ni se borran. sha256_documento = huella de lo que se firmó.';

create table nucleo.incidencias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references nucleo.empresas(id),
  usuario_id  uuid default auth.uid(),
  modulo      text,
  pantalla    text,
  version     text,
  texto       text not null,
  contexto    jsonb not null default '{}'::jsonb,
  captura_ruta text,
  estado      text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'cerrada')),
  respuesta   text,
  creado      timestamptz not null default now(),
  cerrado     timestamptz
);
comment on table nucleo.incidencias is '«Tengo un problema»: quién, dónde, versión, móvil, conexión y cosas pendientes (contexto), con captura opcional.';

create table nucleo.errores (
  firma       text primary key,
  app_version text,
  mensaje     text not null,
  pila        text,
  url         text,
  agente      text,
  empresa_id  uuid references nucleo.empresas(id),
  usuario_id  uuid,
  veces       int not null default 1,
  primero     timestamptz not null default now(),
  ultimo      timestamptz not null default now(),
  visto       boolean not null default false
);
comment on table nucleo.errores is 'Errores de la app agrupados por firma (mismo error = una fila que suma veces).';

create table nucleo.versiones (
  version    text primary key,
  publicada  timestamptz not null default now(),
  cambios    text not null
);
comment on table nucleo.versiones is 'Cada versión publicada con su lista de cambios (sale en el menú de la app).';
