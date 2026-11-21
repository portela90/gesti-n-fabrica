// Cuentas de «Investigar personas» (Personal → Horas → Investigar). No toca la base de datos: recibe los días de
// personal.horas_dias y devuelve la ficha de una persona, la comparación de todos y el mes a mes.
// Solo cuentan los días ya pasados (hasta ayer), como las horas del mes.
import type { DiaHoras } from './horas';

export type Motivo = 'baja' | 'vacaciones' | 'permiso' | 'otro';
export const MOTIVO: Record<Motivo, string> = { baja: 'Baja', vacaciones: 'Vacaciones', permiso: 'Permiso', otro: 'Otra falta' };
export interface Periodo { motivo: Motivo; desde: string; hasta: string; dias: number; notas: string[] }
export type ClaseDia = 'entre' | 'sabado' | 'domingo' | 'festivo';
export const CLASE: Record<ClaseDia, string> = { entre: 'Entre semana', sabado: 'Sábados', domingo: 'Domingos', festivo: 'Festivos' };

export interface Ficha {
  persona_id: string; nombre: string; jornada: string; diasTrab: number; horas: number; previstas: number;
  porClase: Record<ClaseDia, { dias: number; horas: number }>;
  faltas: Record<Motivo, number>; periodos: Periodo[];
  extra: number; fuera: number; extras: { fecha: string; extra: number; fuera: number; nota: string | null }[];
  dias: DiaHoras[];
}

const n = (x: unknown) => Number(x ?? 0) || 0;
export const sumaDias = (f: string, k: number) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE'); };
export const claseDia = (d: Pick<DiaHoras, 'tipo_dia' | 'dow'>): ClaseDia =>
  d.tipo_dia === 'festivo' ? 'festivo' : d.dow === 0 ? 'domingo' : d.dow === 6 ? 'sabado' : 'entre';
const jornadaTxt = (j: string | null) => (j === 'completa' ? 'Completa' : j === 'parcial' ? 'Parcial' : 'Sin poner');

/** Días seguidos con la misma falta = un periodo (una baja del 3 al 7 y otra del 20 al 21 son dos). */
export function periodos(dias: DiaHoras[]): Periodo[] {
  const out: Periodo[] = [];
  for (const d of [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!d.falta) continue;
    const m = d.falta as Motivo, ult = out[out.length - 1];
    if (ult && ult.motivo === m && sumaDias(ult.hasta, 1) === d.fecha) { ult.hasta = d.fecha; ult.dias++; if (d.nota && !ult.notas.includes(d.nota)) ult.notas.push(d.nota); }
    else out.push({ motivo: m, desde: d.fecha, hasta: d.fecha, dias: 1, notas: d.nota ? [d.nota] : [] });
  }
  return out;
}

/** El último día que cuenta: «hasta» si ya pasó; si no, ayer. */
export const limite = (hasta: string, hoy: string) => (hasta < hoy ? hasta : sumaDias(hoy, -1));

/** La ficha de cada persona entre dos fechas (solo días ya pasados). */
export function fichas(todos: DiaHoras[], desde: string, hasta: string, hoy: string): Ficha[] {
  const lim = limite(hasta, hoy);
  const porP = new Map<string, DiaHoras[]>();
  todos.filter((d) => d.fecha >= desde && d.fecha <= lim).forEach((d) => porP.set(d.persona_id, [...(porP.get(d.persona_id) ?? []), d]));
  const res: Ficha[] = [];
  for (const ds of porP.values()) {
    ds.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const p = ds[0];
    const f: Ficha = { persona_id: p.persona_id, nombre: p.nombre, jornada: jornadaTxt(p.jornada), diasTrab: 0, horas: 0, previstas: 0,
      porClase: { entre: { dias: 0, horas: 0 }, sabado: { dias: 0, horas: 0 }, domingo: { dias: 0, horas: 0 }, festivo: { dias: 0, horas: 0 } },
      faltas: { baja: 0, vacaciones: 0, permiso: 0, otro: 0 }, periodos: periodos(ds), extra: 0, fuera: 0, extras: [], dias: ds };
    for (const d of ds) {
      const h = n(d.horas), em = Math.min(h, n(d.extra_mano)), fu = n(d.fuera);
      f.previstas += n(d.prevista);
      if (h > 0) { f.diasTrab++; f.horas += h; const c = f.porClase[claseDia(d)]; c.dias++; c.horas += h; }
      if (d.falta) f.faltas[d.falta as Motivo]++;
      f.extra += em; f.fuera += fu;
      if (em > 0 || fu > 0) f.extras.push({ fecha: d.fecha, extra: em, fuera: fu, nota: d.nota });
    }
    res.push(f);
  }
  return res.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ---------- comparar a todos ----------
export type Orden = 'nombre' | 'baja' | 'horas' | 'diasTrab' | 'vacaciones' | 'permiso' | 'extra' | 'fuera';
export const ORDEN: [Orden, string][] = [['nombre', 'Nombre'], ['baja', 'Días de baja'], ['horas', 'Horas trabajadas'], ['diasTrab', 'Días trabajados'],
  ['vacaciones', 'Días de vacaciones'], ['permiso', 'Días de permiso'], ['extra', 'Horas extra'], ['fuera', 'Fuera de presupuesto']];
export function ordenar(F: Ficha[], o: Orden): Ficha[] {
  const v = (f: Ficha) => (o === 'baja' || o === 'vacaciones' || o === 'permiso' ? f.faltas[o] : o === 'nombre' ? 0 : f[o]);
  return [...F].sort((a, b) => (o === 'nombre' ? 0 : v(b) - v(a)) || a.nombre.localeCompare(b.nombre, 'es'));
}

// ---------- mes a mes ----------
export interface Mes { mes: string; diasTrab: number; horas: number; baja: number; vacaciones: number; permiso: number; otro: number; extra: number; fuera: number; bajas: number }
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** Cada mes del periodo, de una persona (persona_id) o de todos (null). «bajas» = cuántas bajas empiezan ese mes. */
export function mesAMes(todos: DiaHoras[], desde: string, hasta: string, hoy: string, persona: string | null): Mes[] {
  const lim = limite(hasta, hoy);
  const ds = todos.filter((d) => d.fecha >= desde && d.fecha <= lim && (!persona || d.persona_id === persona));
  const M = new Map<string, Mes>();
  for (let f = desde.slice(0, 7); f <= lim.slice(0, 7); f = sumaDias(f + '-28', 7).slice(0, 7))
    M.set(f, { mes: f, diasTrab: 0, horas: 0, baja: 0, vacaciones: 0, permiso: 0, otro: 0, extra: 0, fuera: 0, bajas: 0 });
  for (const d of ds) {
    const m = M.get(d.fecha.slice(0, 7)); if (!m) continue;
    const h = n(d.horas);
    if (h > 0) { m.diasTrab++; m.horas += h; }
    if (d.falta) m[d.falta as Motivo]++;
    m.extra += Math.min(h, n(d.extra_mano)); m.fuera += n(d.fuera);
  }
  const porP = new Map<string, DiaHoras[]>(); ds.forEach((d) => porP.set(d.persona_id, [...(porP.get(d.persona_id) ?? []), d]));
  porP.forEach((x) => periodos(x).filter((p) => p.motivo === 'baja').forEach((p) => { const m = M.get(p.desde.slice(0, 7)); if (m) m.bajas++; }));
  return [...M.values()];
}
