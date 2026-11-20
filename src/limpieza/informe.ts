// Cuentas del Resumen y de los informes de Limpieza (las mismas que la app vieja: datosInforme, horasSemana, vResumen…).
// No toca la base de datos ni dibuja: recibe los datos de limpieza.informe (y, si se puede, las horas de Personal) y devuelve tablas.

/** Un trabajo tal como lo devuelve limpieza.informe. */
export interface TrabInf {
  id: string; fecha: string; clase: 'fija' | 'habitual' | 'suelto'; tarea_id: string | null; titulo: string; descripcion: string | null;
  lugar: string | null; maquina: string | null; minutos_est: number | null; minutos: number | null; tiempo_auto: boolean;
  estado: 'pendiente' | 'en_curso' | 'pausado' | 'hecho'; inicio: string | null; fin: string | null; pausado_min: number;
  hecho_por: string | null; hecho_por_nombre: string | null; asignados: string[]; asignados_nombres: string[]; asignados_orig_nombres: string[];
  aviso_reparto: string | null; todo_equipo: boolean; equipo: string | null; turno: string | null; urgente: boolean; origen: string | null;
  problema: string | null; nota: string | null; checklist_puntos: number; checklist_mal: number; fotos: number; creado_por_nombre: string | null;
}
export interface PersonaInf { id: string; nombre: string; equipo_id: string | null; equipo: string | null; baja: string | null }
export interface DatosInf { alcance: 'todo' | 'responsable' | 'equipo'; unidad: string; personas: PersonaInf[]; trabajos: TrabInf[] }

/** Un día de un trabajador (lo que devuelve personal.horas_dias; solo lo que se usa aquí). */
export interface DiaH {
  persona_id: string; nombre: string; jornada: string | null; horas_semana: number | null; fecha: string; dow: number; tipo_dia: string | null;
  nombre_dia: string | null; horario: number; prevista: number; trabajadas: number | null; fuera: number; extra_mano: number | null;
  falta: string | null; nota: string | null; horas: number;
}
/** Quién cubre a quién (limpieza.sustituciones). */
export interface Sust { ausente: string; sustituto: string; desde: string; hasta: string; nota: string | null }

// ---------- fechas y textos ----------
export const sumaD = (f: string, n: number) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
export const lunesDe = (f: string) => sumaD(f, -((new Date(f + 'T12:00:00').getDay() + 6) % 7));
export const dow = (f: string) => new Date(f + 'T12:00:00').getDay();
export const esFinde = (f: string) => dow(f) === 0 || dow(f) === 6;
export const fDM = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
export const fDMA = (f: string) => `${fDM(f)}/${f.slice(0, 4)}`;
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const fCorta = (f: string) => `${DIAS_C[dow(f)]} ${fDM(f)}`;
/** Número de semana (ISO, como la app vieja). */
export function numSemana(f: string) {
  const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - y.getTime()) / 864e5 - 3 + ((y.getDay() + 6) % 7)) / 7);
}
export const durTxt = (m: number | null | undefined) => {
  if (m == null || !Number.isFinite(m)) return '';
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}`;
};
export const dec = (x: number | null | undefined) => (x == null ? '' : (Math.round(x * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }));
export const hora = (ts: string | null) => (ts ? new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
export const ESTADO: Record<TrabInf['estado'], string> = { pendiente: 'Sin hacer', en_curso: 'Empezado', pausado: 'En pausa', hecho: 'Hecho' };
export const estadoTxt = (t: TrabInf) => (t.estado !== 'hecho' && t.problema ? `${ESTADO[t.estado]} · con problema` : ESTADO[t.estado]);
export const origenTxt = (t: TrabInf) =>
  t.origen?.startsWith('excel') ? 'Excel' : t.clase === 'fija' ? 'Tarea fija' : t.clase === 'habitual' ? 'Habitual' : 'A mano';
export const dondeTxt = (t: TrabInf) => [t.maquina, t.lugar].filter(Boolean).join(' · ');
/** ¿el tiempo es real? (se apuntó lo medido o lo que dijo; no lo previsto porque tardó menos) */
export const tiempoReal = (t: TrabInf) => t.estado === 'hecho' && t.minutos != null && !t.tiempo_auto;

/** A quién se le cuenta un trabajo: quien lo hizo; si no, a quien le toca (o el equipo, o «Sin asignar»). */
export function quienDe(t: TrabInf): string[] {
  if (t.estado === 'hecho' && t.hecho_por_nombre) return [t.hecho_por_nombre];
  if (t.todo_equipo) return [`Equipo ${t.equipo ?? ''}`.trim()];
  return t.asignados_nombres.length ? t.asignados_nombres : ['Sin asignar'];
}

// ---------- el informe de unas fechas ----------
export interface FilaPersona { nombre: string; t: number; h: number; prob: number; mal: number; min: number; nm: number; minReal: number }
export interface FilaTarda { titulo: string; est: number | null; media: number; n: number; mn: number; mx: number; tarde: boolean }
export interface Cuentas {
  total: number; hechos: TrabInf[]; conProblema: TrabInf[]; sinHacer: TrabInf[]; min: number; mal: number;
  porPersona: FilaPersona[]; porDia: { fecha: string; t: number; h: number }[];
  fijas: { titulo: string; n: number; h: number; est: number | null; media: number | null }[];
  tarda: FilaTarda[];
}

/** Todas las cuentas de unos trabajos (resumen, por persona, por día, tareas fijas y cuánto tarda cada trabajo). */
export function cuentas(T: TrabInf[]): Cuentas {
  const hechos = T.filter((t) => t.estado === 'hecho');
  const P = new Map<string, FilaPersona>();
  T.forEach((t) => quienDe(t).forEach((n) => {
    const p = P.get(n) ?? { nombre: n, t: 0, h: 0, prob: 0, mal: 0, min: 0, nm: 0, minReal: 0 };
    p.t++;
    if (t.estado === 'hecho') { p.h++; if (t.minutos != null) p.min += t.minutos; if (tiempoReal(t)) { p.nm++; p.minReal += t.minutos!; } }
    if (t.problema) p.prob++;
    if (t.checklist_mal) p.mal++;
    P.set(n, p);
  }));
  const D = new Map<string, { fecha: string; t: number; h: number }>();
  T.forEach((t) => { const d = D.get(t.fecha) ?? { fecha: t.fecha, t: 0, h: 0 }; d.t++; if (t.estado === 'hecho') d.h++; D.set(t.fecha, d); });
  const F = new Map<string, { titulo: string; n: number; h: number; est: number | null; s: number; nm: number }>();
  T.filter((t) => t.clase === 'fija').forEach((t) => {
    const f = F.get(t.titulo) ?? { titulo: t.titulo, n: 0, h: 0, est: null, s: 0, nm: 0 };
    f.n++; if (t.estado === 'hecho') f.h++; if (tiempoReal(t)) { f.s += t.minutos!; f.nm++; } if (t.minutos_est) f.est = t.minutos_est;
    F.set(t.titulo, f);
  });
  const TT = new Map<string, { titulo: string; est: number | null; s: number; n: number; mn: number; mx: number }>();
  T.filter(tiempoReal).forEach((t) => {
    const x = TT.get(t.titulo) ?? { titulo: t.titulo, est: null, s: 0, n: 0, mn: Infinity, mx: 0 };
    if (t.minutos_est) x.est = t.minutos_est;
    x.n++; x.s += t.minutos!; x.mn = Math.min(x.mn, t.minutos!); x.mx = Math.max(x.mx, t.minutos!);
    TT.set(t.titulo, x);
  });
  const es = (a: string, b: string) => a.localeCompare(b, 'es');
  return {
    total: T.length, hechos, conProblema: T.filter((t) => t.problema), sinHacer: T.filter((t) => t.estado !== 'hecho'),
    min: hechos.reduce((s, t) => s + (t.minutos ?? 0), 0), mal: T.filter((t) => t.checklist_mal).length,
    porPersona: [...P.values()].sort((a, b) => es(a.nombre, b.nombre)),
    porDia: [...D.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    fijas: [...F.values()].map((f) => ({ titulo: f.titulo, n: f.n, h: f.h, est: f.est, media: f.nm ? f.s / f.nm : null })).sort((a, b) => es(a.titulo, b.titulo)),
    tarda: [...TT.values()].map((x) => ({ titulo: x.titulo, est: x.est, media: x.s / x.n, n: x.n, mn: x.mn, mx: x.mx, tarde: !!x.est && x.s / x.n > x.est * 1.25 }))
      .sort((a, b) => b.media - a.media),
  };
}
export const pct = (h: number, t: number) => (t ? Math.round((h * 100) / t) : 0);

// ---------- horas (solo el administrador; vienen de Personal) ----------
/** Horas de un día que son por sustitución: lo que pasa de su horario hasta las horas del que falta (no en festivo). */
export function sustDelDia(d: DiaH, S: Sust[], dias: DiaH[]): { h: number; aQuien: string | null } {
  const s = S.filter((x) => x.sustituto === d.persona_id && d.fecha >= x.desde && d.fecha <= x.hasta);
  if (!s.length || d.tipo_dia === 'festivo') return { h: 0, aQuien: null };
  let mejor: { h: number; aQuien: string } | null = null;
  for (const x of s) {
    const a = dias.find((y) => y.persona_id === x.ausente && y.fecha === d.fecha);
    const ha = a ? Number(a.horario) || 0 : 0;
    if (!mejor || ha > mejor.h) mejor = { h: ha, aQuien: a?.nombre ?? 'alguien' };
  }
  return { h: Math.max(0, Math.min(Number(d.horas) || 0, mejor!.h) - (Number(d.horario) || 0)), aQuien: mejor!.aQuien };
}

export interface HorasPersona {
  persona_id: string; nombre: string; jornada: string; diasTrab: number; horas: number; entreSemana: number; finde: number;
  extra: number; fuera: number; sust: number; bolsa: number | null;
  baja: number; vacaciones: number; permiso: number; otra: number;
  detalle: { fecha: string; tipo: string; prevista: number; horas: number; fuera: number; extra: number; sust: number; aQuien: string | null; falta: string | null; nota: string | null }[];
}
const TIPO_DIA: Record<string, string> = { festivo: 'Festivo', cierre: 'Cierre', descanso: 'Descanso', intensiva: 'Intensiva', especial: 'Especial', trabaja: 'Trabaja' };
const jornadaTxt = (j: string | null) => (j === 'completa' ? 'Completa' : j === 'parcial' ? 'Parcial' : 'Sin poner');
const n0 = (x: unknown) => Number(x ?? 0) || 0;

/**
 * Horas de cada persona entre dos fechas (los días ya pasados): días trabajados, horas (entre semana y fin de semana),
 * extra a mano, fuera de presupuesto, por sustitución y faltas, con el detalle de cada día.
 * Bolsa: solo si es una semana entera ya pasada, de jornada completa y desde que cuenta la bolsa (como la app vieja).
 */
export function horasPorPersona(dias: DiaH[], S: Sust[], desde: string, hasta: string, hoy: string, bolsaInicio: string | null): HorasPersona[] {
  const lim = hasta < hoy ? hasta : sumaD(hoy, -1);
  const semanaEntera = dow(desde) === 1 && sumaD(desde, 6) === hasta && hasta < hoy;
  const porP = new Map<string, DiaH[]>();
  dias.forEach((d) => porP.set(d.persona_id, [...(porP.get(d.persona_id) ?? []), d]));
  const res: HorasPersona[] = [];
  for (const ds of porP.values()) {
    const p = ds[0];
    const r: HorasPersona = { persona_id: p.persona_id, nombre: p.nombre, jornada: jornadaTxt(p.jornada), diasTrab: 0, horas: 0, entreSemana: 0, finde: 0,
      extra: 0, fuera: 0, sust: 0, bolsa: null, baja: 0, vacaciones: 0, permiso: 0, otra: 0, detalle: [] };
    let exc = 0;
    for (const d of ds.filter((x) => x.fecha >= desde && x.fecha <= lim).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const h = n0(d.horas), em = Math.min(h, n0(d.extra_mano)), fu = n0(d.fuera);
      const s = sustDelDia(d, S, dias);
      if (h > 0) r.diasTrab++;
      r.horas += h; if (d.dow === 0 || d.dow === 6) r.finde += h; else r.entreSemana += h;
      r.extra += em; r.fuera += fu; r.sust += s.h;
      if (d.falta === 'baja') r.baja++; else if (d.falta === 'vacaciones') r.vacaciones++; else if (d.falta === 'permiso') r.permiso++; else if (d.falta) r.otra++;
      if (d.falta === 'baja' || d.falta === 'vacaciones' || (['festivo', 'cierre', 'descanso'].includes(d.tipo_dia ?? '') && h === 0)) exc += n0(d.horario);
      r.detalle.push({ fecha: d.fecha, tipo: d.nombre_dia || (d.tipo_dia ? TIPO_DIA[d.tipo_dia] ?? d.tipo_dia : ''), prevista: n0(d.prevista), horas: h,
        fuera: fu, extra: em, sust: s.h, aQuien: s.h ? s.aQuien : null, falta: d.falta, nota: d.nota });
    }
    if (p.jornada === 'completa' && semanaEntera && bolsaInicio && desde >= bolsaInicio) {
      const c = p.horas_semana ?? 35;
      r.bolsa = r.horas - r.extra - (c - exc);
    }
    res.push(r);
  }
  return res.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
export const FALTA_TXT: Record<string, string> = { baja: 'Baja', vacaciones: 'Vacaciones', permiso: 'Permiso', otro: 'Otra falta', festivo: 'Festivo' };
