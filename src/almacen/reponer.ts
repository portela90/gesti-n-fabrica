// Cuentas de Reponer y Previsión (las de la app vieja; decidido por Cristian el 22/11). Sin pantallas: se prueban solas.
import { dias, plazoDe, stockDe, sumarDias, type Almacen, type Articulo, type Catalogo } from './datos';

// =====================================================================================
// Reponer hoy
// =====================================================================================

/** Almacén de donde se repone (el central que no se repone): el de los ajustes; si no, el primero que no es de producción. */
export function origenReposicion(c: Catalogo) {
  const vivos = c.almacenes.filter((a) => !a.baja);
  return (c.ajustes.origen && vivos.find((a) => a.id === c.ajustes.origen)?.id) ?? vivos.find((a) => a.tipo !== 'produccion')?.id ?? vivos[0]?.id ?? null;
}

/** Almacenes que se reponen: los de producción menos el de origen (si no hay ninguno, todos menos el de origen). */
export function lineas(c: Catalogo): Almacen[] {
  const o = origenReposicion(c), vivos = c.almacenes.filter((a) => !a.baja && a.id !== o);
  const prod = vivos.filter((a) => a.tipo === 'produccion');
  return prod.length ? prod : vivos;
}

/** De dónde sale cada artículo: su almacén principal; si no, el que no es de producción donde más hay; si no, el de origen. */
export function origenDe(c: Catalogo, art: string) {
  const ppal = c.fichas.get(art)?.almacen_principal_id;
  if (ppal && c.almacenes.some((a) => a.id === ppal && !a.baja)) return ppal;
  const con = c.almacenes.filter((a) => !a.baja && a.tipo !== 'produccion' && stockDe(c, art, a.id) > 0).sort((a, b) => stockDe(c, art, b.id) - stockDe(c, art, a.id))[0];
  return con?.id ?? origenReposicion(c);
}

export interface Falta {
  almacen_id: string; articulo_id: string; dotacion: number; hay: number;
  /** Lo que falta para la dotación. */
  falta: number;
  /** Lo que se baja hoy (con «Quitar» y la cantidad de hoy aplicados). */
  bajar: number;
  origen_id: string | null;
  /** El origen es el mismo almacén: no se baja de ningún sitio (va a la lista de pedido). */
  propio: boolean;
  quitado: boolean; cambiadoHoy: boolean;
}

/** ¿Sigue valiendo un «Quitar»? Deja de valer en cuanto entra material a ese almacén. */
function quitadoVigente(c: Catalogo, almacen: string, art: string) {
  const b = c.bajar.find((x) => x.almacen_id === almacen && x.articulo_id === art);
  if (!b?.quitado_en || b.quitado_stock == null) return null;
  const entro = c.movs.some((m) => m.articulo_id === art && m.creado > b.quitado_en! && ((m.tipo === 'entrada' && m.almacen_id === almacen) || (m.tipo === 'traslado' && m.destino_id === almacen)));
  return entro ? null : b.quitado_stock;
}

/** Lo que falta en un almacén según su dotación. */
export function faltas(c: Catalogo, almacen: string, hoy: string): Falta[] {
  const dot = c.dotacion.get(almacen);
  if (!dot) return [];
  const out: Falta[] = [];
  dot.forEach((d, art) => {
    const a = c.articulos.find((x) => x.id === art);
    if (!a || a.baja) return;
    const hay = stockDe(c, art, almacen), falta = Math.max(0, Math.ceil(d - hay));
    let bajar = falta;
    const q = quitadoVigente(c, almacen, art);
    if (q !== null) bajar = Math.min(bajar, Math.max(0, Math.ceil(q - hay)));
    const b = c.bajar.find((x) => x.almacen_id === almacen && x.articulo_id === art);
    const cambiadoHoy = b?.hoy_dia === hoy && b.hoy_cantidad != null;
    if (cambiadoHoy) bajar = Math.min(bajar, b!.hoy_cantidad!);
    const origen = origenDe(c, art);
    out.push({ almacen_id: almacen, articulo_id: art, dotacion: d, hay, falta, bajar, origen_id: origen, propio: origen === almacen, quitado: q !== null, cambiadoHoy });
  });
  return out.sort((x, y) => nombre(c, x.articulo_id).localeCompare(nombre(c, y.articulo_id), 'es', { numeric: true }));
}
const nombre = (c: Catalogo, id: string) => c.articulos.find((a) => a.id === id)?.nombre ?? '';

/** Todo lo que hay que bajar hoy (de todos los almacenes que se reponen). */
export const paraBajar = (c: Catalogo, hoy: string) => lineas(c).flatMap((l) => faltas(c, l.id, hoy)).filter((f) => f.bajar > 0 && !f.propio);

// =====================================================================================
// Previsión
// =====================================================================================

const Z: Record<90 | 95 | 99, number> = { 90: 1.2816, 95: 1.6449, 99: 2.3263 };
/** Artículos que se cuentan por unidades (no los de kg, litros o metros). */
export const contable = (a: Articulo) => !['kg', 'l', 'm', 'm3'].includes(a.unidad);

/** Lo que cubre el «nivel» de las veces: Poisson si se cuenta por unidades y no varía mucho; si no, normal. */
export function cuantil(media: number, varianza: number, nivel: 90 | 95 | 99, porUnidades: boolean) {
  if (media <= 0) return 0;
  if (porUnidades && varianza <= 1.3 * media) {
    const p = nivel / 100;
    let k = 0, t = Math.exp(-media), s = t;
    if (!Number.isFinite(t) || t === 0) return Math.ceil(media + Z[nivel] * Math.sqrt(media));   // medias muy grandes: como la normal
    while (s < p && k < 10000) { k++; t *= media / k; s += t; }
    return k;
  }
  const q = media + Z[nivel] * Math.sqrt(Math.max(varianza, 0));
  return porUnidades ? Math.ceil(q) : Math.ceil(q * 10) / 10;
}

export interface Prevision {
  articulo_id: string;
  /** Días con datos (hasta 182). */
  diasDatos: number;
  /** Consumo al día. */
  ritmo: number;
  varianza: number;
  /** Mínimo sugerido (lo que cubre el plazo de entrega). */
  minimo: number;
  /** Consumo previsto el mes que viene (de lo bajo a lo alto). */
  mesLo: number; mesHi: number;
  /** Cuánto pedir para llegar a fin del mes que viene con el mínimo. */
  pedir: number;
  /** Dotación sugerida de cada almacén de producción (lo que se gasta allí entre dos reposiciones). */
  planta: Map<string, number>;
  /** Máximo razonable (por encima, sobra). */
  maximo: number;
}

/** Días hasta el fin del mes que viene, y cuántos días tiene ese mes. */
export function horizonte(hoy: string) {
  const d = new Date(hoy + 'T12:00'), fin = new Date(d.getFullYear(), d.getMonth() + 2, 0, 12);
  return { H: dias(hoy, fin.toLocaleDateString('sv-SE')), dm: fin.getDate(), fin: fin.toLocaleDateString('sv-SE') };
}

export function prevision(c: Catalogo, a: Articulo, hoy: string): Prevision | null {
  const sal = c.movs.filter((m) => m.articulo_id === a.id && m.tipo === 'salida' && !m.perdida);
  if (!sal.length) return null;
  const primera = sal.reduce((x, m) => (m.fecha < x ? m.fecha : x), sal[0].fecha);
  const ini = primera > sumarDias(hoy, -182) ? primera : sumarDias(hoy, -182);
  const usadas = sal.filter((m) => m.fecha >= ini && m.fecha <= hoy);
  const D = Math.max(1, dias(ini, hoy) + 1);
  const total = usadas.reduce((s, m) => s + m.cantidad, 0);
  const ritmo = total / D;
  // varianza al día, de las semanas completas
  const semanas: number[] = [];
  for (let f = ini; dias(f, hoy) >= 6; f = sumarDias(f, 7)) {
    const hasta = sumarDias(f, 6);
    semanas.push(usadas.filter((m) => m.fecha >= f && m.fecha <= hasta).reduce((s, m) => s + m.cantidad, 0));
  }
  const varianza = semanas.length >= 2 ? semanas.reduce((s, x) => s + (x - ritmo * 7) ** 2, 0) / (semanas.length - 1) / 7 : ritmo;
  const pu = contable(a), nivel = c.ajustes.prevision.nivel;
  const plazoArt = plazoDe(c, a.id), pl = plazoArt || c.ajustes.prevision.plazo;
  const q = cuantil(ritmo * pl, varianza * pl, nivel, pu);
  const minimo = plazoArt ? Math.max(0, redondea(q - ritmo * pl, pu)) : q;
  const { H, dm } = horizonte(hoy);
  const zMes = Z[nivel] * Math.sqrt(varianza * dm);
  const mesLo = Math.max(0, redondea(ritmo * dm - zMes, pu)), mesHi = redondea(ritmo * dm + zMes, pu);
  const f = c.fichas.get(a.id);
  const pedido = f?.pedido_en ? Number(f.pedido_cantidad ?? 0) : 0;
  const pedir = Math.max(0, Math.ceil(ritmo * H + minimo - stockDe(c, a.id) - pedido));
  const planta = new Map<string, number>();
  const cob = c.ajustes.prevision.cobertura;
  for (const l of lineas(c)) {
    const r = usadas.filter((m) => m.almacen_id === l.id).reduce((s, m) => s + m.cantidad, 0) / D;
    if (r > 0) planta.set(l.id, Math.max(pu ? 1 : 0, cuantil(r * cob, (varianza * r / Math.max(ritmo, 1e-9)) * cob, nivel, pu)));
  }
  return { articulo_id: a.id, diasDatos: D, ritmo, varianza, minimo, mesLo, mesHi, pedir, planta, maximo: Math.max(minimo, Math.ceil(ritmo * H + minimo)) };
}
const redondea = (x: number, porUnidades: boolean) => (porUnidades ? Math.ceil(x) : Math.ceil(x * 10) / 10);

/** Falta y sobra: compara el stock total con el mínimo y el máximo sugeridos. */
export type EstadoStock = 'falta' | 'sobra' | 'justo' | 'sin-datos';
export function estadoStock(c: Catalogo, a: Articulo, p: Prevision | null): EstadoStock {
  if (!p) return 'sin-datos';
  const st = stockDe(c, a.id);
  return st < p.minimo ? 'falta' : st > p.maximo ? 'sobra' : 'justo';
}
