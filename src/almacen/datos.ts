// Almacén: lo que comparten Stock, Movimientos y Apuntar (decidido por Cristian el 22/11: lo mismo que la app vieja).
// El catálogo es del núcleo (artículos, almacenes, máquinas, personas…); lo del almacén (fichas, movimientos) del esquema «almacen».
// Las cuentas de los avisos son las de la vieja (stockMap, consDia, puntoPedido, nivel).
import { useCallback, useEffect, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';

export const alm = () => supabase.schema('almacen');

export const hoy = () => new Date().toLocaleDateString('sv-SE');
export const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
export const dias = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 86400000);
export const fCorta = (f: string | null | undefined) => { if (!f) return ''; const [, m, d] = f.slice(0, 10).split('-').map(Number); return `${d}/${m}`; };
export const fLarga = (f: string | null | undefined) => { if (!f) return ''; const [a, m, d] = f.slice(0, 10).split('-').map(Number); return `${d}/${m}/${a}`; };
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nomMes = (m: string) => { const [a, n] = m.split('-').map(Number); return `${MESES[n - 1]} ${a}`; };
/** Cantidades: hasta 2 decimales, con coma. */
export const fmt = (n: number | null | undefined) => (n == null ? '' : Number(n.toFixed(2)).toLocaleString('es-ES'));
export const plano = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export interface Familia { id: string; codigo: string; nombre: string; orden: number }
export interface Articulo { id: string; codigo: string; nombre: string; unidad: string; minimo: number | null; familia_id: string | null; baja: string | null }
export interface Almacen { id: string; codigo: string; nombre: string; tipo: 'general' | 'produccion' | 'externo'; centro_id: string | null; orden: number; baja: string | null }
export interface Ficha {
  articulo_id: string; proveedor_id: string | null; ref_proveedor: string | null; plazo_dias: number | null; punto_pedido: number | null;
  almacen_principal_id: string | null; ubicacion: string | null; notas: string | null; pedido_en: string | null; pedido_cantidad: number | null;
  envase: string | null; maquinas: string[]; por_maquina: number | null; atributos: Record<string, unknown>;
}
export interface Proveedor { id: string; codigo: string; nombre: string; contacto: Record<string, unknown>; baja: string | null }
export interface Maquina { id: string; codigo: string; nombre: string | null; centro_id: string | null; baja: string | null }
export interface Centro { id: string; codigo: string; nombre: string; baja: string | null }
export interface Persona { id: string; nombre: string; baja: string | null }
export interface Sinonimo { id: string; palabra: string; articulo_id: string }
export interface Mov {
  id: string; empresa_id: string; fecha: string; tipo: 'entrada' | 'salida' | 'traslado' | 'ajuste'; articulo_id: string; almacen_id: string; destino_id: string | null;
  cantidad: number; contado: number | null; teorico: number | null; centro_id: string | null; activos: string[]; persona_id: string | null;
  gestor_id: string | null; proveedor_id: string | null; albaran: string | null; pedido_en: string | null; motivo: string | null; perdida: boolean;
  nota: string | null; origen: string | null; extra: Record<string, unknown>; creado: string; creado_por: string | null;
}
export interface Catalogo {
  familias: Familia[]; articulos: Articulo[]; almacenes: Almacen[]; fichas: Map<string, Ficha>; proveedores: Proveedor[];
  maquinas: Maquina[]; centros: Centro[]; personas: Persona[]; gestores: Set<string>; sinonimos: Sinonimo[];
  /** stock[articulo][almacen] */
  stock: Map<string, Map<string, number>>;
  /** Movimientos de los últimos 13 meses (para consumos, «lo que sueles apuntar» y la ficha). */
  movs: Mov[];
}

/** Todas las filas (Supabase da como mucho 1000 de una vez). */
export async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error) throw new Error(error.message);
    const d = (data ?? []) as T[];
    out.push(...d);
    if (d.length < 1000) return out;
  }
}

export async function cargarCatalogo(emp: string): Promise<Catalogo> {
  const desde = sumarDias(hoy(), -400);
  const [fa, ar, al, fi, pr, ma, ce, pe, ge, si, st, mv] = await Promise.all([
    nucleo().from('familias').select('id, codigo, nombre, orden').eq('empresa_id', emp).is('baja', null),
    todas<Articulo>((a, b) => nucleo().from('articulos').select('id, codigo, nombre, unidad, minimo, familia_id, baja').eq('empresa_id', emp).order('nombre').range(a, b)),
    nucleo().from('almacenes').select('id, codigo, nombre, tipo, centro_id, orden, baja').eq('empresa_id', emp).order('orden').order('nombre'),
    todas<Ficha>((a, b) => alm().from('fichas').select('*').eq('empresa_id', emp).range(a, b)),
    nucleo().from('proveedores').select('id, codigo, nombre, contacto, baja').eq('empresa_id', emp).order('nombre'),
    nucleo().from('activos').select('id, codigo, nombre, centro_id, baja').eq('empresa_id', emp).order('codigo'),
    nucleo().from('centros').select('id, codigo, nombre, baja').eq('empresa_id', emp).order('orden').order('nombre'),
    nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', emp).order('nombre'),
    alm().from('gestores').select('persona_id').eq('empresa_id', emp),
    alm().from('sinonimos').select('id, palabra, articulo_id').eq('empresa_id', emp),
    todas<{ articulo_id: string; almacen_id: string; cantidad: number }>((a, b) => alm().from('stock').select('articulo_id, almacen_id, cantidad').eq('empresa_id', emp).range(a, b)),
    todas<Mov>((a, b) => alm().from('movimientos').select('*').eq('empresa_id', emp).gte('fecha', desde).order('fecha').order('creado').range(a, b)),
  ]);
  for (const r of [fa, al, pr, ma, ce, pe, ge, si]) if (r.error) throw new Error(r.error.message);
  const stock = new Map<string, Map<string, number>>();
  for (const s of st) {
    if (!stock.has(s.articulo_id)) stock.set(s.articulo_id, new Map());
    stock.get(s.articulo_id)!.set(s.almacen_id, Number(s.cantidad));
  }
  return {
    familias: ((fa.data ?? []) as Familia[]).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    articulos: ar.map((a) => ({ ...a, minimo: a.minimo == null ? null : Number(a.minimo) })),
    almacenes: (al.data ?? []) as Almacen[], fichas: new Map(fi.map((f) => [f.articulo_id, f])), proveedores: (pr.data ?? []) as Proveedor[],
    maquinas: (ma.data ?? []) as Maquina[], centros: (ce.data ?? []) as Centro[], personas: (pe.data ?? []) as Persona[],
    gestores: new Set(((ge.data ?? []) as { persona_id: string }[]).map((g) => g.persona_id)), sinonimos: (si.data ?? []) as Sinonimo[],
    stock, movs: mv.map((m) => ({ ...m, cantidad: Number(m.cantidad) })),
  };
}

/** El catálogo del almacén de la unidad en la que se está (se recarga con `cargar`). */
export function useCatalogo() {
  const { empresa } = useSesion();
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try { setCat(await cargarCatalogo(empresa!.id)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  return { cat, error, cargar };
}

// ---------- cuentas (las de la app vieja) ----------
export const stockDe = (c: Catalogo, art: string, almacen?: string | null) => {
  const x = c.stock.get(art);
  if (!x) return 0;
  if (almacen) return x.get(almacen) ?? 0;
  let s = 0; x.forEach((v) => { s += v; }); return s;
};

/** Consumo al día: salidas de los últimos 60 días (sin pérdidas) entre los días desde el primer movimiento (1 a 60). */
export function consumoDia(c: Catalogo, art: string, h = hoy()) {
  const desde = sumarDias(h, -60);
  let primero: string | null = null, sal = 0;
  for (const m of c.movs) {
    if (m.articulo_id !== art) continue;
    if (!primero || m.fecha < primero) primero = m.fecha;
    if (m.tipo === 'salida' && !m.perdida && m.fecha >= desde) sal += m.cantidad;
  }
  if (!sal || !primero) return 0;
  const ini = primero > desde ? primero : desde;
  return sal / Math.max(1, dias(ini, h) + 1);
}

/** Plazo de entrega: el de la ficha; si no, el del proveedor. */
export function plazoDe(c: Catalogo, art: string) {
  const f = c.fichas.get(art);
  if (f?.plazo_dias && f.plazo_dias > 0) return f.plazo_dias;
  const p = f?.proveedor_id ? c.proveedores.find((x) => x.id === f.proveedor_id) : null;
  const pp = Number(p?.contacto?.plazo_dias ?? 0);
  return pp > 0 ? pp : 0;
}

export const puntoPedido = (c: Catalogo, a: Articulo) => Math.max(Number(c.fichas.get(a.id)?.punto_pedido ?? 0), (a.minimo ?? 0) + consumoDia(c, a.id) * plazoDe(c, a.id));

export type Nivel = 'bad' | 'warn' | 'ok' | 'na';
export const NIVEL: Record<Nivel, string> = { bad: 'Crítico', warn: 'Pedir', ok: 'Bien', na: 'Sin mínimo' };
export function nivel(c: Catalogo, a: Articulo): Nivel {
  const st = stockDe(c, a.id), mn = a.minimo ?? 0, pp = puntoPedido(c, a);
  if (!(pp > 0) && !(mn > 0)) return 'na';
  if (st < mn) return 'bad';
  if (st <= pp) return 'warn';
  return 'ok';
}
/** Cuánto pedir: hasta el mínimo más lo que se gasta mientras llega. */
export const cantPedir = (c: Catalogo, a: Articulo) => Math.max(0, Math.ceil((a.minimo ?? 0) + consumoDia(c, a.id) * plazoDe(c, a.id) - stockDe(c, a.id)));

/** Para cuándo llega lo pedido (fecha del pedido + plazo), o null si no hay plazo. */
export const llegaEl = (c: Catalogo, a: Articulo) => { const f = c.fichas.get(a.id); const p = plazoDe(c, a.id); return f?.pedido_en && p ? sumarDias(f.pedido_en, p) : null; };

export const nombreDe = <T extends { id: string; nombre: string }>(l: T[], id: string | null | undefined) => (id ? l.find((x) => x.id === id)?.nombre ?? '' : '');
export const codMaq = (c: Catalogo, id: string) => c.maquinas.find((m) => m.id === id)?.codigo ?? '';
export const nomAlmacen = (c: Catalogo, id: string | null | undefined) => nombreDe(c.almacenes, id);
/** Nombre corto del almacén (la última palabra si es corta: «N1A», «N2», «General»). */
export const almCorto = (c: Catalogo, id: string) => {
  const n = nomAlmacen(c, id); const u = n.split(/\s+/).pop() ?? n;
  return /^(almac[eé]n|de|del)$/i.test(u) ? n : u.length <= 4 || /^(general|central)$/i.test(u) ? u : n;
};

export const TIPOS: Record<Mov['tipo'], string> = { entrada: 'Entrada', salida: 'Consumo', traslado: 'Traslado', ajuste: 'Recuento' };

/** Cantidad con signo en un almacén (o total si no se dice). */
export function signo(m: Mov, almacen?: string) {
  if (m.tipo === 'entrada' || m.tipo === 'ajuste') return m.cantidad;
  if (m.tipo === 'salida') return -m.cantidad;
  if (!almacen) return 0;
  return almacen === m.destino_id ? m.cantidad : -m.cantidad;
}

/** Almacén de partida al elegir un artículo (como la vieja). */
export function almacenPorDefecto(c: Catalogo, tipo: Mov['tipo'], art: string, actual?: string | null): { desde: string | null; hasta: string | null } {
  const ppal = c.fichas.get(art)?.almacen_principal_id ?? null;
  const vivos = c.almacenes.filter((a) => !a.baja);
  const prod = vivos.filter((a) => a.tipo === 'produccion');
  const con = (id: string) => stockDe(c, art, id) > 0;
  if (tipo === 'entrada' || tipo === 'ajuste') return { desde: ppal ?? actual ?? vivos[0]?.id ?? null, hasta: null };
  if (tipo === 'salida') {
    if (actual && con(actual)) return { desde: actual, hasta: null };
    return { desde: prod.find((a) => con(a.id))?.id ?? vivos.find((a) => con(a.id))?.id ?? ppal ?? actual ?? null, hasta: null };
  }
  const desde = ppal ?? vivos.find((a) => con(a.id))?.id ?? vivos[0]?.id ?? null;
  return { desde, hasta: prod.find((a) => a.id !== desde)?.id ?? vivos.find((a) => a.id !== desde)?.id ?? null };
}

/** Relevo según la hora (Mañana 6–14, Tarde 14–22, Noche). */
export const relevoAhora = (d = new Date()) => { const h = d.getHours(); return h >= 6 && h < 14 ? 'Mañana' : h >= 14 && h < 22 ? 'Tarde' : 'Noche'; };

export const ERRORES: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para hacer esto.', '42501': 'No tienes permiso para hacer esto.', 'row-level security': 'No tienes permiso para hacer esto.',
  MAQUINA_DE_OTRA_UNIDAD: 'Esa máquina es de otra unidad de trabajo.', CANTIDAD_MAL: 'La cantidad no puede ser negativa.',
  movimientos_check: 'Faltan datos o no cuadran (mira el tipo, la cantidad y los almacenes).', sinonimos_palabra: 'Esa palabra ya está enseñada.',
};
export const textoError = (m: string) => { const k = Object.keys(ERRORES).find((x) => m.includes(x)); return k ? ERRORES[k] : 'No se ha podido guardar: ' + m; };
