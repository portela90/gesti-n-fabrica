// Cuentas de «Investigar» (las mismas que la app vieja: invDatos, invTiempos, invPasar…). No toca la base de datos.
// Cambios decididos por Cristian (21/11): los problemas son los trabajos con tema (limpieza.temas) y su sitio la máquina o zona;
// el 85 % y los 30 min son ajustes; si no hay horas de Personal, la jornada sale del horario de la ficha.
import { dow, sumaD, tiempoReal, type DiaH, type TrabInf } from './informe';

export interface ProblemaInf { id: string; tema: string; sitio_clave: string; sitio: string }
export interface TareaInf { id: string; clase: 'fija' | 'habitual'; titulo: string; minutos_est: number | null; dias: number[] | null; equipo_id: string | null;
  asignados: string[]; todo_equipo: boolean }
export interface HorarioInf { id: string; nombre: string; equipo_id: string | null; jornada: string | null; horas_dow: number[] }
export interface DatosInv { trabajos: TrabInf[]; problemas: ProblemaInf[]; tareas: TareaInf[]; horarios: HorarioInf[] }
export interface Ajustes { limite: number; hueco: number }
export const AJUSTES_PARTIDA: Ajustes = { limite: 85, hueco: 30 };
const K = 5, ULTIMAS = 20;

// ---------- ayudas ----------
export const mediana = (a: number[]) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
export const pctN = (a: number, b: number) => (b ? Math.round((a * 100) / b) : null);
export const diasEntre = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);
export const horasTxt = (m: number | null | undefined) => {
  const r = Math.round(m ?? 0), h = Math.floor(r / 60), s = r % 60;
  return h ? (s ? `${h} h ${s} min` : `${h} h`) : `${s} min`;
};
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'al', 'un', 'una', 'por', 'con', 'para']);
const plano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Para juntar el mismo trabajo escrito de formas distintas («Derrame taladrina» = «Derrame de taladrina»). */
export const claveTitulo = (t: string) => plano(t.replace(/\s*·.*$/, '')).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w && !VACIAS.has(w)).join(' ');
export const claveTiempo = (t: Pick<TrabInf, 'tarea_id' | 'clase' | 'titulo'>) =>
  t.tarea_id ? `${t.clase === 'fija' ? 'f' : 'h'}:${t.tarea_id}` : `a:${claveTitulo(t.titulo)}`;
export const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const diasTareaTxt = (d: number[] | null) => {
  const s = [...(d ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (s.join(',') === '1,2,3,4,5') return 'De lunes a viernes';
  if (s.length === 7) return 'Todos los días';
  return s.map((x) => DIAS_LARGOS[x].slice(0, 3).toLowerCase()).join(', ');
};

// ---------- periodos ----------
export type ClavePeriodo = 'sem' | 'mes' | 'mesant' | '3m' | 'ano' | '';
export interface Periodo { k: ClavePeriodo; d0: string; d1: string; t: string }
export function periodo(k: ClavePeriodo, hoy: string): Periodo {
  const y = hoy.slice(0, 4), m = Number(hoy.slice(5, 7));
  if (k === 'mesant') {
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? Number(y) - 1 : Number(y);
    return { k, d0: `${py}-${String(pm).padStart(2, '0')}-01`, d1: sumaD(hoy.slice(0, 8) + '01', -1), t: 'el mes pasado' };
  }
  if (k === '3m') return { k, d0: sumaD(hoy, -89), d1: hoy, t: 'los últimos 3 meses' };
  if (k === 'ano') return { k, d0: `${y}-01-01`, d1: hoy, t: 'este año' };
  if (k === 'sem') return { k, d0: sumaD(hoy, -((dow(hoy) + 6) % 7)), d1: hoy, t: 'esta semana' };
  return { k: 'mes', d0: hoy.slice(0, 8) + '01', d1: hoy, t: 'este mes' };
}
export const anterior = (d0: string, d1: string) => { const n = diasEntre(d0, d1) + 1; return { d0: sumaD(d0, -n), d1: sumaD(d0, -1) }; };

// ---------- tiempos de cada trabajo ----------
export interface Tiempo {
  k: string; tipo: 'fija' | 'habitual' | 'aviso'; titulo: string; ref: TareaInf | null; est: number | null; hechas: number; real: number;
  n: number; med: number | null; prop: number | null; porPersona: Map<string, { c: number; med: number }>; R: { f: string; m: number; quien: string | null }[];
}
/** Para cada trabajo: tu estimado, lo real (mediana de las últimas 20 veces sin las disparatadas) y lo propuesto. */
export function tiempos(T: TrabInf[], tareas: TareaInf[]): Map<string, Tiempo> {
  const G = new Map<string, Tiempo & { E: Map<number, number> }>();
  for (const o of T) {
    const k = claveTiempo(o);
    const g = G.get(k) ?? { k, tipo: k[0] === 'f' ? 'fija' : k[0] === 'h' ? 'habitual' : 'aviso', titulo: o.titulo.replace(/\s*·.*$/, ''), ref: null, est: null,
      hechas: 0, real: 0, n: 0, med: null, prop: null, porPersona: new Map(), R: [], E: new Map() } as Tiempo & { E: Map<number, number> };
    G.set(k, g);
    if (o.estado !== 'hecho') continue;
    g.hechas++;
    if (o.minutos_est) g.E.set(o.minutos_est, (g.E.get(o.minutos_est) ?? 0) + 1);
    if (tiempoReal(o) && o.minutos! > 0 && o.minutos! <= 480) { g.real++; g.R.push({ f: o.fecha + (o.inicio ?? ''), m: o.minutos!, quien: o.hecho_por_nombre }); }
  }
  for (const g of G.values()) {
    g.ref = g.tipo === 'aviso' ? null : tareas.find((t) => t.id === g.k.slice(2)) ?? null;
    if (g.ref) g.titulo = g.ref.titulo;
    g.est = g.ref ? g.ref.minutos_est : ([...g.E.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    g.R.sort((a, b) => b.f.localeCompare(a.f));
    const ult = g.R.slice(0, ULTIMAS), m0 = mediana(ult.map((x) => x.m)) ?? 0, R = ult.filter((x) => x.m <= 3 * m0);
    g.n = R.length; g.med = mediana(R.map((x) => x.m));
    g.prop = g.n ? (g.est ? Math.round((K * g.est + g.n * g.med!) / (K + g.n)) : g.n >= 3 ? Math.round(g.med!) : null) : null;
    const P = new Map<string, number[]>();
    g.R.filter((x) => x.quien && x.m <= 3 * m0).forEach((x) => P.set(x.quien!, [...(P.get(x.quien!) ?? []), x.m]));
    P.forEach((a, n) => { if (a.length >= 3) g.porPersona.set(n, { c: a.length, med: mediana(a)! }); });
  }
  return G;
}
/** ¿Se propone cambiar el tiempo? (tarea de verdad, 3 veces o más con tiempo real y al menos 2 min de diferencia) */
export const cambiaTiempo = (g: Tiempo) => !!g.ref && g.prop != null && g.n >= 3 && Math.abs(g.prop - (g.est ?? 0)) >= 2;
/** Trabajos que se hacen a menudo y casi nunca con «Empezar»: su tiempo es una suposición. */
export const sinTiempoFiable = (T: Map<string, Tiempo>) => [...T.values()].filter((g) => g.hechas >= 5 && g.real / g.hechas < 0.3).sort((a, b) => b.hechas - a.hechas);
/** Quién tarda al menos la mitad más que los demás en el mismo trabajo (con 3 veces o más). */
export function quienTardaMas(T: Map<string, Tiempo>) {
  const out: { titulo: string; quien: string; c: number; med: number; otros: number }[] = [];
  T.forEach((g) => {
    if (g.porPersona.size < 2) return;
    g.porPersona.forEach((x, n) => {
      const mo = mediana(g.R.filter((r) => r.quien !== n).map((r) => r.m));
      if (mo && x.med >= 1.5 * mo && x.med - mo >= 5) out.push({ titulo: g.titulo, quien: n, c: x.c, med: x.med, otros: mo });
    });
  });
  return out.sort((a, b) => (b.med - b.otros) * b.c - (a.med - a.otros) * a.c);
}

// ---------- todo lo del periodo ----------
export interface Saturacion {
  id: string; n: string; equipo_id: string | null; jor: number; dias: number; min: number; desp: number; cont: number; sin: number;
  prob: number; plan: number; otros: number; nt: number; real: number; sinJor: number; D: Map<string, { jor: number; cont: number }>;
}
export interface Raro { f: string; n: string; t: string; min: number; motivo: string }
export interface Repetido { sitio: string; clave: string; tema: string; L: TrabInf[]; min: number; n: number; pri: string; ult: string; cada: number | null; sigue: boolean; ant: number }
export interface Investigacion {
  sat: Saturacion[]; raros: Raro[]; tipos: { tema: string; n: number; min: number; ant: number; sitios: number }[]; rep: Repetido[];
  trab: { t: string; n: number; min: number; max: number; real: number; prob: boolean; plan: boolean; L: TrabInf[] }[];
  dia: number[]; P: TrabInf[]; H: TrabInf[]; tiempos: Map<string, Tiempo>;
  tot: { jor: number; min: number; desp: number; cont: number; sin: number; prob: number; np: number; nt: number; real: number; jorAp: number; contAp: number; sinNada: Saturacion[] };
}

/**
 * Las cuentas de un periodo [d0, d1]. `T` trae los trabajos desde antes (al menos el periodo anterior y 4 meses, para los tiempos).
 * `horasDia` son las horas de Personal de cada uno cada día (null = sin Personal: se usa su horario).
 */
export function investigar(D: DatosInv, horasDia: DiaH[] | null, d0: string, d1: string, hoy: string, aj: Ajustes): Investigacion {
  const prob = new Map(D.problemas.map((p) => [p.id, p]));
  const T = D.trabajos;
  const TT = tiempos(T, D.tareas);
  const propuesto = (o: TrabInf) => TT.get(claveTiempo(o))?.prop ?? 0;
  const minDe = (o: TrabInf) => (o.estado !== 'hecho' ? 0 : o.minutos ?? o.minutos_est ?? propuesto(o));
  const dudosa = (o: TrabInf) => {
    if (!tiempoReal(o)) return null;
    const m = o.minutos!, e = o.minutos_est ?? 0;
    if (m > 480) return 'más de 8 h abierto';
    if (e && m > 3 * e && m > 120) return `el triple de lo previsto (${horasTxt(e)})`;
    return null;
  };
  const enP = (o: TrabInf) => o.fecha >= d0 && o.fecha <= d1;
  const L = T.filter(enP), H = L.filter((o) => o.estado === 'hecho');
  const A = anterior(d0, d1);
  const Pant = T.filter((o) => o.fecha >= A.d0 && o.fecha <= A.d1 && prob.has(o.id));

  // jornada de cada uno, día a día (minutos): las horas de Personal; si no hay, su horario
  const lim = d1 < hoy ? d1 : hoy;
  const jorDe = new Map<string, Map<string, number>>();
  for (const p of D.horarios) {
    const m = new Map<string, number>();
    if (horasDia) horasDia.filter((x) => x.persona_id === p.id && x.fecha >= d0 && x.fecha <= lim).forEach((x) => m.set(x.fecha, (Number(x.horas) || 0) * 60));
    else for (let f = d0; f <= lim; f = sumaD(f, 1)) m.set(f, (p.horas_dow[dow(f)] ?? 0) * 60);
    jorDe.set(p.id, m);
  }
  // saturación: trabajos + huecos cortos entre trabajos (desplazamiento y preparación), como mucho su jornada de ese día
  const raros: Raro[] = [];
  const sat: Saturacion[] = [];
  for (const p of D.horarios) {
    const s: Saturacion = { id: p.id, n: p.nombre, equipo_id: p.equipo_id, jor: 0, dias: 0, min: 0, desp: 0, cont: 0, sin: 0, prob: 0, plan: 0, otros: 0, nt: 0, real: 0, sinJor: 0, D: new Map() };
    const J = jorDe.get(p.id)!;
    const suyos = H.filter((o) => o.hecho_por === p.id);
    const dias = new Set([...[...J.entries()].filter(([, v]) => v > 0).map(([f]) => f), ...suyos.map((o) => o.fecha)]);
    for (const f of [...dias].sort()) {
      const Ld = suyos.filter((o) => o.fecha === f), jor = J.get(f) ?? 0;
      if (jor > 0) s.dias++;
      let reg = 0;
      for (const o of Ld) {
        const du = dudosa(o);
        let m = minDe(o);
        if (du) { m = o.minutos_est ?? 0; raros.push({ f, n: p.nombre, t: o.titulo, min: o.minutos!, motivo: du + (m ? ': se cuenta lo previsto' : ': no se cuenta') }); }
        reg += m; s.nt++; if (tiempoReal(o)) s.real++;
        if (prob.has(o.id)) s.prob += m; else if (o.clase === 'fija') s.plan += m; else s.otros += m;
      }
      const R = Ld.filter((o) => tiempoReal(o) && !dudosa(o) && o.inicio && o.fin).sort((a, b) => a.inicio!.localeCompare(b.inicio!));
      let desp = 0, finAnt: number | null = null;
      for (const o of R) {
        const ini = Date.parse(o.inicio!), fin = Date.parse(o.fin!);
        if (finAnt != null) { const g = (ini - finAnt) / 60000; if (g > 0 && g <= aj.hueco) desp += g; }
        finAnt = finAnt == null ? fin : Math.max(finAnt, fin);
      }
      const nTxt = `${Ld.length} ${Ld.length === 1 ? 'trabajo' : 'trabajos'}`;
      if (!jor) {
        if (reg > 0) { s.sinJor += reg; raros.push({ f, n: p.nombre, t: nTxt, min: reg, motivo: 'trabajo en un día sin horas de jornada: no cuenta en la saturación' }); }
        continue;
      }
      const tot = reg + desp;
      s.jor += jor; s.min += reg; s.desp += desp; s.cont += Math.min(tot, jor); s.D.set(f, { jor, cont: Math.min(tot, jor) });
      if (tot > jor * 1.15) raros.push({ f, n: p.nombre, t: nTxt, min: tot,
        motivo: `más tiempo apuntado que su jornada (${horasTxt(jor)})${Ld.some((o) => o.origen?.startsWith('excel')) ? ', del Excel del fin de semana (puede ser trabajo de todo el equipo)' : ''}: se cuenta su jornada` });
    }
    s.sin = Math.max(0, s.jor - s.cont);
    if (s.jor > 0 || s.nt > 0) sat.push(s);
  }
  sat.sort((a, b) => (pctN(b.cont, b.jor) ?? 0) - (pctN(a.cont, a.jor) ?? 0));
  raros.sort((a, b) => b.f.localeCompare(a.f) || a.n.localeCompare(b.n, 'es'));

  // problemas por tema y sitios donde se repiten
  const P = L.filter((o) => prob.has(o.id));
  const temas = [...new Set([...P, ...Pant].map((o) => prob.get(o.id)!.tema))].sort((a, b) => a.localeCompare(b, 'es'));
  const tipos = temas.map((tema) => {
    const X = P.filter((o) => prob.get(o.id)!.tema === tema);
    return { tema, n: X.length, min: X.reduce((s, o) => s + minDe(o), 0), ant: Pant.filter((o) => prob.get(o.id)!.tema === tema).length,
      sitios: new Set(X.map((o) => prob.get(o.id)!.sitio_clave)).size };
  });
  const G = new Map<string, Repetido>();
  for (const o of P) {
    const x = prob.get(o.id)!, k = `${x.sitio_clave}|${x.tema}`;
    const g = G.get(k) ?? { sitio: x.sitio, clave: x.sitio_clave, tema: x.tema, L: [], min: 0, n: 0, pri: '', ult: '', cada: null, sigue: false, ant: 0 };
    g.L.push(o); g.min += minDe(o); G.set(k, g);
  }
  const rep = [...G.values()].filter((g) => g.L.length >= 2).map((g) => {
    g.L.sort((a, b) => a.fecha.localeCompare(b.fecha));
    g.n = g.L.length; g.pri = g.L[0].fecha; g.ult = g.L[g.n - 1].fecha;
    g.cada = g.n > 1 ? diasEntre(g.pri, g.ult) / (g.n - 1) : null;
    g.sigue = diasEntre(g.ult, hoy) <= 14;
    g.ant = Pant.filter((o) => { const x = prob.get(o.id)!; return x.sitio_clave === g.clave && x.tema === g.tema; }).length;
    return g;
  }).sort((a, b) => b.n - a.n || b.min - a.min);

  // en qué se va el tiempo
  const TR = new Map<string, { nom: Map<string, number>; n: number; min: number; max: number; real: number; prob: boolean; plan: boolean; L: TrabInf[] }>();
  for (const o of H) {
    const k = claveTitulo(o.titulo) || '(sin título)';
    const t = TR.get(k) ?? { nom: new Map(), n: 0, min: 0, max: 0, real: 0, prob: prob.has(o.id), plan: o.clase === 'fija', L: [] as TrabInf[] };
    t.nom.set(o.titulo, (t.nom.get(o.titulo) ?? 0) + 1); t.L.push(o);
    const m = minDe(o); t.n++; t.min += m; t.max = Math.max(t.max, m); if (tiempoReal(o)) t.real++;
    TR.set(k, t);
  }
  const trab = [...TR.values()].map((t) => ({ ...t, t: [...t.nom.entries()].sort((a, b) => b[1] - a[1])[0][0].replace(/\s*·.*$/, '') })).sort((a, b) => b.min - a.min);
  const dia = [0, 0, 0, 0, 0, 0, 0]; P.forEach((o) => { dia[dow(o.fecha)]++; });

  const ap = sat.filter((p) => p.nt > 0), sum = (k: 'jor' | 'min' | 'desp' | 'cont' | 'sin') => sat.reduce((s, p) => s + p[k], 0);
  return {
    sat, raros, tipos, rep, trab, dia, P, H, tiempos: TT,
    tot: { jor: sum('jor'), min: sum('min'), desp: sum('desp'), cont: sum('cont'), sin: sum('sin'), prob: P.reduce((s, o) => s + minDe(o), 0), np: P.length,
      nt: H.length, real: H.filter(tiempoReal).length, jorAp: ap.reduce((s, p) => s + p.jor, 0), contAp: ap.reduce((s, p) => s + p.cont, 0),
      sinNada: sat.filter((p) => !p.nt && p.jor > 0) },
  };
}
/** Minutos que cuentan de un trabajo hecho (los reales; si no, el previsto; si no, el propuesto). */
export const minutosDe = (o: TrabInf, X: Investigacion) => (o.estado !== 'hecho' ? 0 : o.minutos ?? o.minutos_est ?? X.tiempos.get(claveTiempo(o))?.prop ?? 0);

// ---------- trabajos que se pueden pasar a otro ----------
export interface Candidato { id: string; nombre: string; sin: boolean; antes: number | null; despues: number | null; hecho: number; med: number | null }
export interface Pasable { t: TareaInf; veces: number; m: number; cands: Candidato[]; antes: number | null; despues: number | null }
/** Tareas fijas de una persona que podría hacer otra del mismo equipo que trabaja esos días y no pasaría del límite. */
export function pasables(p: Saturacion, D: DatosInv, X: Investigacion, d0: string, d1: string, aj: Ajustes): Pasable[] {
  if (!p.jor) return [];
  const dur = (t: TareaInf) => X.tiempos.get(`f:${t.id}`)?.prop ?? t.minutos_est ?? 0;
  return D.tareas.filter((t) => t.clase === 'fija' && !t.todo_equipo && t.asignados.includes(p.id)).map((t) => {
    const veces = D.trabajos.filter((o) => o.tarea_id === t.id && o.fecha >= d0 && o.fecha <= d1 && o.asignados.includes(p.id)).length;
    const m = veces * dur(t);
    const cands = D.horarios.filter((c) => c.id !== p.id && t.equipo_id && c.equipo_id === t.equipo_id && !t.asignados.includes(c.id)
        && (t.dias ?? []).every((d) => (c.horas_dow[d] ?? 0) > 0))
      .map((c) => {
        const q = X.sat.find((s) => s.id === c.id), sin = !q || !q.nt || !q.jor;
        return { id: c.id, nombre: c.nombre, sin, antes: sin ? null : pctN(q!.cont, q!.jor), despues: sin ? null : pctN(q!.cont + m, q!.jor),
          hecho: D.trabajos.filter((o) => o.tarea_id === t.id && o.hecho_por === c.id && o.estado === 'hecho').length,
          med: X.tiempos.get(`f:${t.id}`)?.porPersona.get(c.nombre)?.med ?? null };
      })
      .filter((x) => x.sin || (x.despues ?? 0) <= aj.limite)
      .sort((a, b) => (Number(a.sin) - Number(b.sin)) || (Number(b.hecho > 0) - Number(a.hecho > 0)) || ((a.med ?? 1e9) - (b.med ?? 1e9)) || ((a.despues ?? 0) - (b.despues ?? 0)));
    return { t, veces, m, cands, antes: pctN(p.cont, p.jor), despues: pctN(Math.max(0, p.cont - m), p.jor) };
  }).filter((x) => x.m > 0).sort((a, b) => b.m - a.m);
}
/** Cuáles hacen falta para bajar del límite (el resto son opcionales). */
export function necesarias(p: Saturacion, L: Pasable[], aj: Ajustes) {
  let resto = p.cont; const nec = new Set<string>();
  L.forEach((x) => { if ((pctN(resto, p.jor) ?? 0) > aj.limite && x.cands.some((c) => !c.sin)) { nec.add(x.t.id); resto -= x.m; } });
  return nec;
}
export const candidatoTxt = (x: Candidato) => x.nombre + (x.sin ? ' (sin datos: no tiene nada apuntado)' : `: del ${x.antes} % al ${x.despues} %`)
  + (x.hecho ? ` · ya lo ha hecho ${x.hecho} ${x.hecho === 1 ? 'vez' : 'veces'}${x.med ? ` (${horasTxt(x.med)} de media)` : ''}` : '');
/** Frase de la ficha de un sitio (para llevársela a mantenimiento). */
export const fraseSitio = (g: Repetido, hoy: string) =>
  `${g.sitio} ha tenido ${g.n} veces «${g.tema}» entre el ${g.pri.split('-').reverse().join('/')} y el ${g.ult.split('-').reverse().join('/')}`
  + (g.cada != null ? `: una cada ${String(Math.round(g.cada * 10) / 10).replace('.', ',')} días de media` : '')
  + `. Se han empleado ${horasTxt(g.min)} en limpiarlas.` + (g.sigue ? ` La última fue hace ${diasEntre(g.ult, hoy)} días: sigue pasando.` : '');
