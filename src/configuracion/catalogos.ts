/**
 * Catálogos que se configuran desde la app (sin programar). Cada uno es una tabla del núcleo y una lista de campos:
 * la pantalla de Configuración monta sola la lista, el formulario y el guardado a partir de esto.
 * Añadir un catálogo nuevo = añadir una entrada aquí (y su tabla y permisos en una migración).
 */
export type TipoCampo = 'texto' | 'numero' | 'lista' | 'referencia' | 'hora' | 'dias' | 'estados' | 'correo' | 'telefono';

export interface Campo {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  obligatorio?: boolean;
  ayuda?: string;
  opciones?: [string, string][];            // para «lista»: [valor, texto]
  ref?: { tabla: string; vacio?: string };   // para «referencia»: otra tabla del núcleo (se enseña su nombre)
}

export interface Catalogo {
  tabla: string;
  titulo: string;        // plural, para la lista
  singular: string;      // para «Añadir …» y el formulario
  descripcion: string;
  permiso: string;       // permiso para crear y cambiar (nucleo.<cosa>.editar)
  conCodigo: boolean;    // la tabla tiene «codigo» (se rellena solo a partir del nombre si se deja vacío)
  campos: Campo[];
  detalle: (fila: Fila, nombres: (tabla: string, id: unknown) => string) => string; // segunda línea en la lista
}

export type Fila = Record<string, unknown> & { id: string; nombre: string; baja?: string | null };

const ORDEN = 'Opcional. 1, 2, 3… para decidir cuál sale primero; si lo dejas vacío, por nombre.';
const DIAS: [string, string][] = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['0', 'D']];
export const DIAS_SEMANA = DIAS;

export const CATALOGOS: Catalogo[] = [
  {
    tabla: 'centros', titulo: 'Naves', singular: 'nave', descripcion: 'Naves o plantas de esta unidad de trabajo',
    permiso: 'nucleo.nave.editar', conCodigo: true,
    campos: [{ clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true }, { clave: 'orden', etiqueta: 'Orden en las listas', tipo: 'numero', ayuda: ORDEN }],
    detalle: () => '',
  },
  {
    tabla: 'ubicaciones', titulo: 'Ubicaciones', singular: 'ubicación', descripcion: 'Zonas, puestos y estanterías (cada una con su código para el QR)',
    permiso: 'nucleo.ubicacion.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'centro_id', etiqueta: 'Nave', tipo: 'referencia', ref: { tabla: 'centros', vacio: 'Sin nave' } },
      { clave: 'padre_id', etiqueta: 'Dentro de', tipo: 'referencia', ref: { tabla: 'ubicaciones', vacio: '—' }, ayuda: 'Por ejemplo, una estantería dentro de una zona' },
    ],
    detalle: (f, n) => [n('centros', f.centro_id), n('ubicaciones', f.padre_id)].filter(Boolean).join(' · '),
  },
  {
    tabla: 'tipos_activo', titulo: 'Tipos de máquina y pieza', singular: 'tipo', descripcion: 'Inyectora, horno, eje, pistón, molde… y sus estados',
    permiso: 'nucleo.activo.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'estados', etiqueta: 'Estados', tipo: 'estados', ayuda: 'Uno por línea, en orden. Por ejemplo: En planta, En reparación, Cuarentena' },
    ],
    detalle: (f) => { const e = (f.estados as { nombre: string }[]) ?? []; return e.length ? e.map((x) => x.nombre).join(' · ') : 'Sin estados'; },
  },
  {
    tabla: 'activos', titulo: 'Máquinas y piezas', singular: 'máquina o pieza', descripcion: 'Cada máquina o pieza con número propio (F25, 2.8.J-2…)',
    permiso: 'nucleo.activo.editar', conCodigo: true,
    campos: [
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', obligatorio: true, ayuda: 'El que lleva grabado o pegado (F25, 2.8.J-2…)' },
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
      { clave: 'tipo_id', etiqueta: 'Tipo', tipo: 'referencia', obligatorio: true, ref: { tabla: 'tipos_activo' } },
      { clave: 'centro_id', etiqueta: 'Nave', tipo: 'referencia', ref: { tabla: 'centros', vacio: 'Sin nave' } },
      { clave: 'ubicacion_id', etiqueta: 'Ubicación', tipo: 'referencia', ref: { tabla: 'ubicaciones', vacio: '—' } },
      { clave: 'montado_en', etiqueta: 'Puesto en (máquina)', tipo: 'referencia', ref: { tabla: 'activos', vacio: '—' } },
    ],
    detalle: (f, n) => [n('tipos_activo', f.tipo_id), n('centros', f.centro_id), f.montado_en ? 'en ' + n('activos', f.montado_en) : ''].filter(Boolean).join(' · '),
  },
  {
    tabla: 'almacenes', titulo: 'Almacenes', singular: 'almacén', descripcion: 'Almacén general, de producción o externo',
    permiso: 'nucleo.almacen.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'lista', obligatorio: true, opciones: [['general', 'General'], ['produccion', 'De producción (se repone)'], ['externo', 'Externo']] },
      { clave: 'centro_id', etiqueta: 'Nave', tipo: 'referencia', ref: { tabla: 'centros', vacio: 'Sin nave' } },
      { clave: 'orden', etiqueta: 'Orden en las listas', tipo: 'numero', ayuda: ORDEN },
    ],
    detalle: (f, n) => [({ general: 'General', produccion: 'De producción', externo: 'Externo' } as Record<string, string>)[String(f.tipo)], n('centros', f.centro_id)].filter(Boolean).join(' · '),
  },
  {
    tabla: 'familias', titulo: 'Familias de artículos', singular: 'familia', descripcion: 'Consumibles, pistones, aceites, materia prima…',
    permiso: 'nucleo.articulo.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'modulo', etiqueta: 'La lleva el módulo', tipo: 'lista', opciones: [['', '—'], ['coladas', 'Coladas'], ['almacen', 'Almacén'], ['mantenimiento', 'Mantenimiento'], ['limpieza', 'Limpieza'], ['prevencion', 'Prevención']] },
    ],
    detalle: (f) => (f.modulo ? 'Módulo: ' + String(f.modulo) : ''),
  },
  {
    tabla: 'articulos', titulo: 'Artículos', singular: 'artículo', descripcion: 'Todo lo que tiene stock',
    permiso: 'nucleo.articulo.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ayuda: 'Si lo dejas vacío se pone uno a partir del nombre' },
      { clave: 'familia_id', etiqueta: 'Familia', tipo: 'referencia', ref: { tabla: 'familias', vacio: 'Sin familia' } },
      { clave: 'unidad', etiqueta: 'Unidad', tipo: 'lista', obligatorio: true, opciones: [['ud', 'Unidades'], ['kg', 'Kilos'], ['l', 'Litros'], ['par', 'Pares'], ['m', 'Metros'], ['m3', 'Metros cúbicos'], ['caja', 'Cajas'], ['rollo', 'Rollos']] },
      { clave: 'control', etiqueta: 'Se controla', tipo: 'lista', obligatorio: true, opciones: [['cantidad', 'Por cantidad'], ['lote', 'Por lote (cada colada…)'], ['serie', 'Por número de serie']] },
      { clave: 'minimo', etiqueta: 'Mínimo', tipo: 'numero' },
    ],
    detalle: (f, n) => [n('familias', f.familia_id), String(f.unidad ?? ''), f.minimo != null ? 'mín. ' + String(f.minimo) : ''].filter(Boolean).join(' · '),
  },
  {
    tabla: 'proveedores', titulo: 'Proveedores y talleres', singular: 'proveedor', descripcion: 'De material, talleres de reparación y servicios',
    permiso: 'nucleo.proveedor.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'lista', obligatorio: true, opciones: [['material', 'Material'], ['taller', 'Taller de reparación'], ['servicio', 'Servicio']] },
    ],
    detalle: (f) => ({ material: 'Material', taller: 'Taller', servicio: 'Servicio' } as Record<string, string>)[String(f.tipo)] ?? '',
  },
  {
    tabla: 'turnos', titulo: 'Turnos y relevos', singular: 'turno', descripcion: 'Mañana, tarde, noche… con su horario',
    permiso: 'nucleo.turno.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'inicio', etiqueta: 'Empieza', tipo: 'hora' },
      { clave: 'fin', etiqueta: 'Acaba', tipo: 'hora' },
      { clave: 'centro_id', etiqueta: 'Nave', tipo: 'referencia', ref: { tabla: 'centros', vacio: 'Todas' } },
      { clave: 'orden', etiqueta: 'Orden en las listas', tipo: 'numero', ayuda: ORDEN },
    ],
    detalle: (f, n) => [f.inicio && f.fin ? `${String(f.inicio).slice(0, 5)}–${String(f.fin).slice(0, 5)}` : '', n('centros', f.centro_id)].filter(Boolean).join(' · '),
  },
  {
    tabla: 'equipos', titulo: 'Equipos', singular: 'equipo', descripcion: 'Grupos de trabajo y qué días trabajan (semana, fin de semana…)',
    permiso: 'nucleo.equipo.editar', conCodigo: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', obligatorio: true },
      { clave: 'dias', etiqueta: 'Días que trabaja', tipo: 'dias', obligatorio: true },
    ],
    detalle: (f) => DIAS.filter(([v]) => ((f.dias as number[]) ?? []).includes(+v)).map(([, t]) => t).join(' '),
  },
  {
    tabla: 'personas', titulo: 'Trabajadores', singular: 'trabajador', descripcion: 'Cada persona, tenga o no usuario en la app',
    permiso: 'nucleo.persona.editar', conCodigo: false,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre y apellidos', tipo: 'texto', obligatorio: true },
      { clave: 'equipo_id', etiqueta: 'Equipo', tipo: 'referencia', ref: { tabla: 'equipos', vacio: 'Sin equipo' } },
      { clave: 'centro_id', etiqueta: 'Nave', tipo: 'referencia', ref: { tabla: 'centros', vacio: 'Sin nave' } },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto' },
      { clave: 'jornada', etiqueta: 'Jornada', tipo: 'lista', opciones: [['', '—'], ['completa', 'Completa'], ['parcial', 'Parcial'], ['externo', 'De otra empresa (no cuenta horas)']] },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      { clave: 'email', etiqueta: 'Correo', tipo: 'correo' },
    ],
    detalle: (f, n) => [n('equipos', f.equipo_id), n('centros', f.centro_id), String(f.categoria ?? '')].filter(Boolean).join(' · '),
  },
];

export const catalogoPorTabla = (t: string) => CATALOGOS.find((c) => c.tabla === t);

/** Código a partir del nombre: «Nave 1» → «nave-1». */
export const codigoDe = (nombre: string) =>
  nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sin-nombre';

/** Estados: «En planta\nEn reparación» ⇄ [{codigo:'en-planta', nombre:'En planta'}, …] */
export const estadosDeTexto = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean).map((nombre) => ({ codigo: codigoDe(nombre), nombre }));
export const textoDeEstados = (e: unknown) => ((e as { nombre: string }[]) ?? []).map((x) => x.nombre).join('\n');
