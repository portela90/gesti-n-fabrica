// «Pregúntale» (arriba de Investigar, solo el administrador): entiende una pregunta escrita como se diría y contesta.
// Es el de la app vieja (07f de COLADA) regla a regla, sin servicios de pago, con estos cambios decididos por Cristian (21/11):
//  · Los problemas son los temas de Incidencias (no 7 categorías fijas); máquinas y naves, las dadas de alta.
//  · También contesta de personas (bajas, vacaciones, permisos, faltas, días y horas trabajadas, extra y fuera de presupuesto),
//    con las horas de Personal.
//  · El turno es el del trabajo (las fichas no tienen turno).
// No toca la base de datos: recibe la pregunta y los datos y devuelve lo entendido y la respuesta.
import { fDM, fDMA, fCorta, lunesDe, sumaD, tiempoReal, type DiaH, type TrabInf } from './informe';
import {
  anterior, claveTitulo, diasEntre, diasTareaTxt, dudosa, fraseSitio, horasTxt as invH, investigar, minutosDe, pasables, pctN, periodo,
  DIAS_LARGOS, type Ajustes, type DatosInv, type Investigacion, type Repetido,
} from './investigar';
import { fichas, mesAMes, MOTIVO, nombreMes, type DiaHoras, type Ficha, type Motivo } from '../componentes/horasPersonas';

// ---------- datos ----------
export interface DicEntrada { id: string; tipo: 'persona' | 'lugar' | 'problema' | 'frase' | 'grupo' | 'favorita'; palabra: string; valor: string | null }
export interface DatosPreg extends DatosInv {
  unidad: string;
  detalles: { id: string; creado: string; nave: string | null }[];
  temas: { nombre: string; palabras: string[] }[];
  naves: string[]; maquinas: string[];
}
export interface Contexto { D: DatosPreg; dias: DiaHoras[] | null; dic: DicEntrada[]; aj: Ajustes; hoy: string; pantalla: { d0: string; d1: string; t: string } }
export interface Periodo { d0: string; d1: string; t: string }
export type Intencion = 'personas' | 'res' | 'pend' | 'naves' | 'pasar' | 'mejora' | 'ahorro' | 'vuelto' | 'avisos' | 'sobra' | 'sat' | 'evo' | 'rep' | 'cal' | 'gen';
export type Grupo = 'hora' | 'semmes' | 'turno' | 'per' | 'sit' | 'dsem' | 'sem' | 'mes' | 'trab' | 'tipo' | null;
export interface Entendido {
  q: string; t: string; per: Periodo; pers: string[]; sitio: { k: 'maq' | 'nave' | 'lugar'; v: string } | null; cat: string | null; dsem: number[] | null;
  turno: string | null; libres: string[]; ignoradas: string[]; conj: { n: string; w: string[] } | null; int: Intencion; grupo: Grupo;
  met: 'avg' | 'n' | 'min' | 'both'; comp: boolean; menos: boolean; medida: Medida | null;
}
export interface Respuesta {
  frase: string; cols: string[] | null; filas: (string | number)[][]; rowL?: TrabInf[][]; L: TrabInf[];
  extra?: { titulo: string; cols: string[]; filas: (string | number)[][] }[];
}

// ---------- texto ----------
export const plano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DSEM: [string, number][] = [['domingo', 0], ['lunes', 1], ['martes', 2], ['miercoles', 3], ['jueves', 4], ['viernes', 5], ['sabado', 6]];
/** Palabras que no son del trabajo (para no filtrar por ellas). Las de la vieja más las de personas. */
const NO = new Set(('cuanto cuanta cuantas cuantos veces vez tiempo horas hora minutos min quien quienes donde cuando como que cual cuales mas menos ha han he hemos '
  + 'habido hay hace hecho hizo hacen se lo le les la los las de del en el y o u por para con sin a al este esta estos estas ese esa eso mes meses ano anos semana semanas dia dias hoy ayer '
  + 'pasado pasada pasados ultimo ultimos ultima ultimas desde hasta entre tarda tardan tardado tardo media promedio total suma lista listado dime dame ensename muestra mostrar ver '
  + 'trabajado trabajo trabajos tarea tareas numero saturacion cargado cargada cargados ocupado ocupados mucho mucha muchos poco perdido perdida perdidas pierde pierden perder pierdo '
  + 'maquina maquinas sitio sitios zona zonas sido son es esta estan fue fueron era compara comparar comparado comparacion anterior antes subido bajado aumentado empeorado mejorado '
  + 'cada vez evolucion tendencia va todo toda todos todas siempre principio historico persona personas trabajador trabajadores operario operarios equipo nave naves uno dos '
  + 'problema problemas incidencia incidencias aviso avisos fuga fugas derrame derrames perdidas '
  + 'repite repiten repetido repetidos sigue pasa pasando pasan reincide justificar justificado desplazamiento desplazamientos huecos empezar empiezan pulsan pulsa real reales estimado estimados apuntan apunta tiene tienen tenido '
  + 'mi mis tu su sus nos nuestro nuestra quiero saber necesito sale salen hubo mayor menor peor mejor primero primera limpiado limpiar limpiaron limpiada limpiadas limpiados hacer apuntado apuntar apuntados atendido atender recogido '
  + 'perdemos perdiendo repetir repetimos repetirse repetida repetidas mismo misma mismos mismas soluciona solucionan solucionado solucionar solucion arregla arreglan arreglado arreglar arreglo '
  + 'porque vuelve vuelven volver otra otras otro otros carga cargas libre libres desocupado desocupados parado parados holgado trabaja trabajan '
  + 'franja franjas turno turnos manana tarde noche partido refuerzo segunda tercera cuarta quinta resumen informe jefe jefes pendiente pendientes hechos hecha hechas '
  + 'terminar terminado terminados quedado quedaron quedan queda ahorro ahorrar ahorramos ahorrariamos ahorraria ahorrarian vuelto frente versus contra tardamos tardais '
  + 'arreglaron arreglen solucionaron solucionen respecto empeora empeoran mejora mejoran subir bajar '
  + 'podemos puedo puede podriamos realizar realizamos realizan hacemos mejorar ganar optimizar eficientes eficiencia reducir aprovechar concreto concreta concretos determinado sobra sobran segun capacidad disponible disponibles '
  + 'baja bajas vacaciones vacacion permiso permisos falta faltas ausencia ausencias absentismo extra extras fuera presupuesto trabajadas trabajados enfermo enfermedad '
  + MESES.join(' ') + ' ' + DSEM.map((x) => x[0]).join(' ')).split(' '));
const reP = (w: string) => new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'g');
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const finMes = (y: number, m: number) => ymd(y, m, new Date(y, m, 0).getDate());
const vez = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`;
const lista = (a: string[], n: number) => a.slice(0, n).join(', ') + (a.length > n ? ` y ${a.length - n} más` : '');
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- periodo ----------
const AHORRO = /(ahorr|si (lo |la |los |las |se |le )?(arregl|solucion))/;
const MEJORA = /(como (podemos |puedo |se puede |podriamos )?(ahorrar|ganar|mejorar|optimizar|reducir|aprovechar)|ahorrar tiempo|ganar tiempo|optimizar|mas eficientes|eficiencia|donde (podemos )?mejorar)/;
/** El periodo escrito en la pregunta (null = el de la pantalla). */
export function periodoQ(t: string, h: string): Periodo | null {
  const Y = Number(h.slice(0, 4)), M = Number(h.slice(5, 7));
  const anio = (s: string | undefined) => (s ? (s.length === 2 ? 2000 + Number(s) : Number(s)) : Y);
  let m: RegExpMatchArray | null;
  if ((m = t.match(/desde (?:el )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?.*?hasta (?:el )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/))) {
    const a = ymd(anio(m[3]), Number(m[2]), Number(m[1])), b = ymd(anio(m[6]), Number(m[5]), Number(m[4])); return { d0: a, d1: b, t: `del ${fDM(a)} al ${fDM(b)}` };
  }
  if ((m = t.match(/desde (?:el )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/))) {
    let a = ymd(anio(m[3]), Number(m[2]), Number(m[1])); if (!m[3] && a > h) a = ymd(Y - 1, Number(m[2]), Number(m[1])); return { d0: a, d1: h, t: `desde el ${fDM(a)}` };
  }
  if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)) && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    let a = ymd(anio(m[3]), Number(m[2]), Number(m[1])); if (!m[3] && a > h) a = ymd(Y - 1, Number(m[2]), Number(m[1])); return { d0: a, d1: a, t: `el ${fDMA(a)}` };
  }
  if ((m = t.match(/\b(\d{1,2}) de ([a-z]+)(?: de (20\d\d))?/)) && MESES.includes(m[2])) {
    const mi = MESES.indexOf(m[2]) + 1; let a = ymd(m[3] ? Number(m[3]) : Y, mi, Number(m[1])); if (!m[3] && a > h) a = ymd(Y - 1, mi, Number(m[1])); return { d0: a, d1: a, t: `el ${fDMA(a)}` };
  }
  if (/\bhoy\b/.test(t)) return { d0: h, d1: h, t: 'hoy' };
  if (/\bayer\b/.test(t)) { const a = sumaD(h, -1); return { d0: a, d1: a, t: 'ayer' }; }
  if (/semana pasada/.test(t)) { const l = sumaD(lunesDe(h), -7); return { d0: l, d1: sumaD(l, 6), t: 'la semana pasada' }; }
  if (/esta semana/.test(t)) { const p = periodo('sem', h); return { d0: p.d0, d1: p.d1, t: p.t }; }
  if (/(mes pasado|ultimo mes|mes anterior)/.test(t) && !/compar/.test(t)) { const p = periodo('mesant', h); return { d0: p.d0, d1: p.d1, t: p.t }; }
  if (/este mes/.test(t)) { const p = periodo('mes', h); return { d0: p.d0, d1: p.d1, t: p.t }; }
  if ((m = t.match(/ultim[oa]s?\s+(\d+)\s+(dias|semanas|meses)/))) {
    const n = Number(m[1]) * (m[2] === 'dias' ? 1 : m[2] === 'semanas' ? 7 : 30); return { d0: sumaD(h, -(n - 1)), d1: h, t: `los últimos ${m[1]} ${m[2].replace('dias', 'días')}` };
  }
  if ((m = t.match(/ultim[oa]s?\s+(dos|tres|seis)\s+(semanas|meses)/))) {
    const k = ({ dos: 2, tres: 3, seis: 6 } as Record<string, number>)[m[1]], n = k * (m[2] === 'semanas' ? 7 : 30); return { d0: sumaD(h, -(n - 1)), d1: h, t: `los últimos ${k} ${m[2]}` };
  }
  const mi = MESES.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t)), ya = (t.match(/\b(20\d\d)\b/) ?? [])[1];
  if (mi >= 0) { const y = ya ? Number(ya) : mi + 1 > M ? Y - 1 : Y; const a = ymd(y, mi + 1, 1), b = finMes(y, mi + 1); return { d0: a, d1: b < h ? b : h, t: MESES[mi] + (y !== Y ? ` de ${y}` : '') }; }
  if (ya) return { d0: `${ya}-01-01`, d1: `${ya}-12-31` < h ? `${ya}-12-31` : h, t: `el año ${ya}` };
  if (/(este ano|en lo que va de ano|el ano)/.test(t)) { const p = periodo('ano', h); return { d0: p.d0, d1: p.d1, t: p.t }; }
  if (/(siempre|desde el principio|historico|todo el tiempo)/.test(t)) return { d0: '2026-01-01', d1: h, t: 'desde el principio' };
  return null;
}

// ---------- qué se quiere saber ----------
export type Medida = 'baja' | 'vacaciones' | 'permiso' | 'faltas' | 'extra' | 'fuera' | 'dias' | 'horas';
/** De personas: bajas, vacaciones, permisos, faltas, extra, fuera de presupuesto, días y horas trabajadas. */
export function medidaQ(t: string): Medida | null {
  if (/\b(bajas?|enferm\w*|incapacidad)\b/.test(t) && !/\bdados? de baja\b/.test(t)) return 'baja';
  if (/vacacion/.test(t)) return 'vacaciones';
  if (/\bpermisos?\b/.test(t)) return 'permiso';
  if (/\b(faltas?|ausencias?|absentismo|ha faltado|han faltado|falto|faltaron)\b/.test(t)) return 'faltas';
  if (/fuera de presupuesto/.test(t)) return 'fuera';
  if (/\b(horas? extras?|extras)\b/.test(t)) return 'extra';
  if (/(dias (ha |han )?trabajad|cuantos dias (ha |han )?(trabajado|venido|ido))/.test(t)) return 'dias';
  if (/(horas (ha |han )?trabajad|horas (ha |han )?hecho|cuanto (ha |han )?trabajado|ha trabajado|han trabajado|horas de trabajo)/.test(t)) return 'horas';
  return null;
}
export function intencion(t: string): Intencion {
  const has = (re: RegExp) => re.test(t);
  if (medidaQ(t)) return 'personas';
  if (has(/(resumen|informe del mes|informe para|como ha ido)/)) return 'res';
  if (has(/(sin hacer|no se (han )?hecho|no se hicieron|no se ha hecho|pendiente|quedado sin|quedaron sin|quedan sin|no hech|sin terminar)/)) return 'pend';
  if (has(/(compar|frente|versus|\bvs\b|contra|entre|diferencia).*\bnaves\b|\bnaves\b.*(compar|frente|versus|\bvs\b)|las dos naves|ambas naves|cada nave|por naves?\b/)
    || has(/nave\s*(1|uno)\b.*nave\s*(2|dos)\b|nave\s*(2|dos)\b.*nave\s*(1|uno)\b|nave\s*(1|uno)\s*(y|con|frente a|vs|contra)\s*(la\s*)?(2|dos)\b/)) return 'naves';
  if (has(/(pasar(le|se)? (los |el |un |algun |algunos )?(trabajos? )?a otr|se pueden pasar|se podrian pasar|repartir|redistribu|equilibrar|quitar(le)? (algun )?trabajo|aliviar|descargar a)/)) return 'pasar';
  if (has(MEJORA)) return 'mejora';
  if (has(AHORRO)) return 'ahorro';
  if (has(/(ha vuelto|han vuelto|vuelto a pasar|vuelto a perder|vuelto a salir|desde que (se |la |lo |le )?(arregl|solucion))/)) return 'vuelto';
  if (has(/(que|cuales|cual)\b.{0,12}(trabajos?|avisos?|incidencias?|tareas?)\b.{0,30}(repit|repet)/)) return 'avisos';
  if (has(/(sobra|sobran|tiempo libre|capacidad|cuanto (tiempo )?queda libre|horas libres|disponib)/)) return 'sobra';
  if (has(/(saturac|carga|ocupad|desocupad|libre|parad|holgad|sin justificar|desplazamiento|hueco|rendimiento|productiv)/) || has(/(quien|que trabajador|que operario).*(menos|mas) trabaj/)) return 'sat';
  if (has(/(que|cual|cuales|donde|en que)\b.{0,25}(empeor|a peor|mejorad|a mejor|ha subido|han subido|ha bajado|han bajado|ha aumentado|han aumentado)/)) return 'evo';
  if (has(/(repite|repetid|repetir|sigue pasando|cada cuanto|reincid|vuelve a|vuelven a|no se solucion|no se arregl|no lo arregl|no lo solucion|sin solucion|sin arregl)/)) return 'rep';
  if (has(/(se pierde|se pierden|pierde mas|perdemos|perdiendo|perder (mas )?tiempo|tiempo perdido)/) && !['dsem', 'sem', 'mes', 'hora', 'semmes', 'turno', 'per'].includes(grupoQ(t) ?? '')) return 'rep';
  if (has(/(sin empezar|tiempo real|estimad|no pulsa|no pulsan|pulsan empezar|pulsa empezar|no apunta)/)) return 'cal';
  return 'gen';
}
export function grupoQ(t: string): Grupo {
  const has = (re: RegExp) => re.test(t);
  if (has(/(a que hora|que hora|en que horas|por horas?\b|franja|horario)/)) return 'hora';
  if (has(/(semana del mes|que semana|primera semana|segunda semana|tercera semana|cuarta semana|ultima semana del mes)/)) return 'semmes';
  if (has(/(por turno|que turno|cada turno|turnos|segun el turno)/)) return 'turno';
  if (has(/\b(quien|quienes|por persona|trabajador|operario|cada uno)\b/)) return 'per';
  if (has(/(donde|que maquina|que maquinas|que sitio|que sitios|que zona|en que (maquina|sitio|zona|nave)|por maquina|por sitio)/)) return 'sit';
  if (has(/(que dia|que dias|dia de la semana|dias de la semana|por dia de)/)) return 'dsem';
  if (has(/(por semana|cada semana|semana a semana|evolucion|tendencia|va a mas)/)) return 'sem';
  if (has(/(por mes|cada mes|mes a mes)/)) return 'mes';
  if (has(/(que trabajos|que tareas|en que se va|en que se pierde|que es lo que|por trabajo|por tarea)/)) return 'trab';
  if (has(/(que tipo|por tipo|que problemas)/)) return 'tipo';
  return null;
}
const metQ = (t: string): Entendido['met'] => {
  if (/(tarda|media|promedio|cuanto dura|duracion)/.test(t)) return 'avg';
  if (/(cuantas veces|cuantos|cuantas|numero de|veces)/.test(t) && !/(tiempo|horas)/.test(t)) return 'n';
  if (/(tiempo|horas|minutos|se pierde|perdid)/.test(t) && !/(cuantas veces)/.test(t)) return 'min';
  return 'both';
};

// ---------- ayudas sobre los trabajos ----------
export class Ayudas {
  prob: Map<string, { tema: string; sitio: string }>;
  det: Map<string, { creado: string; nave: string | null }>;
  lugares: { p: string; v: string }[];
  constructor(public C: Contexto) {
    this.prob = new Map(C.D.problemas.map((p) => [p.id, { tema: p.tema, sitio: p.sitio }]));
    this.det = new Map(C.D.detalles.map((d) => [d.id, { creado: d.creado, nave: d.nave }]));
    this.lugares = C.dic.filter((d) => d.tipo === 'lugar' && d.valor).map((d) => ({ p: plano(d.palabra).trim(), v: d.valor! })).sort((a, b) => b.p.length - a.p.length);
  }
  cat = (o: TrabInf) => this.prob.get(o.id)?.tema ?? null;
  nave = (o: TrabInf) => this.det.get(o.id)?.nave ?? null;
  /** Dónde: la máquina; si no, el lugar (o como se le ha enseñado que se llama); si no, la nave. */
  sitio = (o: TrabInf) => {
    if (o.maquina) return o.maquina;
    const l = (o.lugar ?? '').trim().replace(/\s+/g, ' ');
    if (l) { const k = plano(l); const d = this.lugares.find((x) => x.p === k) ?? this.lugares.find((x) => reP(x.p).test(k)); return d ? d.v : mayus(l); }
    const d = this.lugares.find((x) => reP(x.p).test(plano(`${o.titulo} ${o.descripcion ?? ''}`)));
    return d?.v ?? this.nave(o) ?? 'Sin lugar';
  };
  /** Hora del aviso: cuando se dio (los que no son fijos); los fijos, cuando se empezó. */
  hora = (o: TrabInf) => { const x = o.clase !== 'fija' ? this.det.get(o.id)?.creado : o.inicio; return x ? new Date(x).getHours() : null; };
  min = (o: TrabInf, X: Investigacion) => minutosDe(o, X);
}
const franja = (h: number | null) => (h == null ? 'Sin hora' : `${String(h - (h % 2)).padStart(2, '0')}–${String(h - (h % 2) + 2).padStart(2, '0')} h`);
const semMes = (f: string) => { const d = Number(f.slice(8, 10)), k = Math.min(5, Math.ceil(d / 7)); return `${k}.ª semana (días ${(k - 1) * 7 + 1}–${k === 5 ? '31' : k * 7})`; };

// ---------- entender ----------
/** Aplica lo enseñado a la pregunta (ya en minúsculas y sin tildes): frases, problemas, personas y grupos. */
function aplicaDic(t: string, dic: DicEntrada[]) {
  const pers: string[] = [];
  dic.filter((d) => d.tipo === 'frase' && d.valor).forEach((d) => { t = t.replace(reP(plano(d.palabra).trim()), '$1' + plano(d.valor!)); });
  dic.filter((d) => d.tipo === 'problema' && d.valor).forEach((d) => { t = t.replace(reP(plano(d.palabra).trim()), '$1' + plano(d.valor!)); });
  [...dic.filter((d) => d.tipo === 'persona' && d.valor)].sort((a, b) => b.palabra.length - a.palabra.length).forEach((d) => {
    const re = reP(plano(d.palabra).trim()); if (re.test(t)) { pers.push(d.valor!); t = t.replace(reP(plano(d.palabra).trim()), '$1'); }
  });
  let conj: Entendido['conj'] = null;
  dic.filter((d) => d.tipo === 'grupo' && d.valor).forEach((d) => {
    if (conj) return; const re = reP(plano(d.palabra).trim());
    if (re.test(t)) { conj = { n: mayus(d.palabra.trim()), w: plano(d.valor!).split(/\s*,\s*/).map((w) => w.trim()).filter(Boolean) }; t = t.replace(reP(plano(d.palabra).trim()), '$1'); }
  });
  return { t: t.replace(/\s+/g, ' ').trim(), pers, conj };
}
/** ¿el trabajo es del grupo? (alguna palabra empieza por una del grupo; las de 4 letras o menos, enteras o en plural) */
export const enConj = (o: TrabInf, c: { w: string[] }) => {
  const w = plano([o.titulo, o.descripcion, o.lugar].filter(Boolean).join(' ')).split(/[^a-z0-9ñ]+/);
  return c.w.some((g) => w.some((x) => (g.length > 4 ? x.startsWith(g) : x === g || x === g + 's' || x === g + 'es')));
};
const normCod = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const SIT_NO = new Set(['de', 'del', 'la', 'el', 'a', 'al', 'junto', 'en', 'y']);

export function entiende(q: string, C: Contexto, A: Ayudas): Entendido {
  const t0 = plano(q).replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const D = aplicaDic(t0, C.dic), t = D.t;
  const AH = AHORRO.test(t) || MEJORA.test(t);
  const per = periodoQ(t, C.hoy) ?? (AH ? { d0: sumaD(C.hoy, -89), d1: C.hoy, t: 'los últimos 3 meses' } : C.pantalla);
  // personas: las de los trabajos, las de las fichas y las de las horas
  const nombres = [...new Set([...C.D.horarios.map((h) => h.nombre), ...C.D.trabajos.flatMap((o) => [o.hecho_por_nombre, ...o.asignados_nombres]),
    ...(C.dias ?? []).map((d) => d.nombre)].filter(Boolean) as string[])];
  const tk = (n: string) => plano(n).split(/\s+/).filter((w) => w.length >= 3 && !NO.has(w));
  const enT = (w: string) => new RegExp(`\\b${w}\\b`).test(t);
  let pq = nombres.filter((n) => { const k = tk(n); return k.length > 1 && k.every(enT); });
  if (!pq.length) {
    const parcial = nombres.filter((n) => tk(n).some(enT));
    const sc = (n: string) => tk(n).filter(enT).length, max = Math.max(0, ...parcial.map(sc));
    pq = parcial.length <= 1 ? parcial : parcial.filter((n) => sc(n) === max);
  }
  const pers = [...new Set([...D.pers, ...pq])];
  // sitio: máquina dada de alta, nave, o un lugar por su nombre
  let sitio: Entendido['sitio'] = null;
  const cods = new Set(C.D.maquinas.map(normCod));
  for (const m of t.matchAll(/\b(?:h-)?([a-z]{1,3})\s?-?(\d{1,4})\b/g)) { const c = normCod(m[1] + m[2]); if (cods.has(c)) { sitio = { k: 'maq', v: C.D.maquinas.find((x) => normCod(x) === c)! }; break; } }
  const mn = t.match(/\bnave\s*(\d+|uno|dos|tres)\s*([ab])?\b/);
  if (!sitio && mn) {
    const n = ({ uno: '1', dos: '2', tres: '3' } as Record<string, string>)[mn[1]] ?? mn[1], v = `nave ${n}${mn[2] ?? ''}`;
    const nave = C.D.naves.find((x) => plano(x) === v) ?? C.D.naves.find((x) => plano(x).startsWith(v));
    sitio = { k: 'nave', v: nave ?? mayus(v) };
  }
  const usadasSitio: string[] = [];
  if (!sitio) {
    let best: { v: string; n: number; tk: string[] } | null = null;
    [...new Set(C.D.trabajos.map(A.sitio))].forEach((s) => {
      if (/^(nave|sin lugar)/i.test(s)) return;
      const k = plano(s).split(/[\s,.()·]+/).filter((w) => (w.length >= 2 || /^\d$/.test(w)) && !SIT_NO.has(w));
      if (k.length && k.every((w) => reP(w).test(t)) && (!best || k.length > best.n)) best = { v: s, n: k.length, tk: k };
    });
    if (best) { sitio = { k: 'lugar', v: (best as { v: string }).v }; usadasSitio.push(...(best as { tk: string[] }).tk); }
  }
  // problema: un tema (por su nombre o sus palabras), «todos los problemas» o nada
  let cat: string | null = null;
  for (const m of C.D.temas) if ([m.nombre, ...m.palabras].some((w) => t.includes(plano(w)))) { cat = m.nombre; break; }
  if (!cat && /\b(problema|incidencia|fuga|derrame|perdida|aviso)/.test(t)) cat = '*';
  let dsem: number[] | null = DSEM.filter(([d]) => new RegExp(`\\b${d}s?\\b`).test(t)).map((x) => x[1]);
  if (/\b(finde|findes|fin de semana|fines de semana)\b/.test(t)) dsem = [...new Set([...dsem, 6, 0])];
  if (!dsem.length) dsem = null;
  // turno (el del trabajo): «turno de tarde», «los de la mañana»
  const turnos = [...new Set(C.D.trabajos.map((o) => o.turno).filter(Boolean) as string[])];
  const turno = turnos.map(plano).find((n) => new RegExp(`turno (de )?(la )?${n}\\b`).test(t) || new RegExp(`(de|por|en) la ${n}\\b`).test(t)) ?? null;
  const usadas = new Set<string>([...(turno ? turno.split(' ') : []), ...pers.flatMap((n) => plano(n).split(/\s+/)), ...usadasSitio,
    ...(cat && cat !== '*' ? C.D.temas.filter((m) => m.nombre === cat).flatMap((m) => [plano(m.nombre), ...m.palabras.map(plano)]) : [])]);
  const libres = t.split(' ').filter((w) => w.length >= 3 && !NO.has(w) && !usadas.has(w) && !cods.has(normCod(w)) && !/^20\d\d$/.test(w) && !/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(w)
    && !(cat && cat !== '*' && C.D.temas.some((m) => m.nombre === cat && m.palabras.some((p) => w.startsWith(plano(p))))));
  const int = intencion(t);
  return { t, q, per, pers, sitio: int === 'naves' && sitio?.k === 'nave' ? null : sitio, cat, dsem, turno, libres, ignoradas: [], conj: D.conj, int,
    grupo: grupoQ(t), met: metQ(t), comp: /(compar|anterior|antes|subido|bajado|aumentado|empeorado|mejorado|que el mes)/.test(t), menos: /\bmenos\b/.test(t), medida: medidaQ(t) };
}

/** Los trabajos que cumplen lo pedido (sin mirar el periodo). Las palabras del trabajo solo cuentan si hay trabajos que las tengan. */
export function filtra(L: TrabInf[], E: Entendido, A: Ayudas): TrabInf[] {
  let X = L.filter((o) => {
    if (E.pers.length && !E.pers.includes(o.hecho_por_nombre ?? '') && !(o.estado !== 'hecho' && o.asignados_nombres.some((n) => E.pers.includes(n)))) return false;
    if (E.cat === '*' && !A.cat(o)) return false;
    if (E.cat && E.cat !== '*' && A.cat(o) !== E.cat) return false;
    if (E.sitio && E.sitio.k !== 'nave' && A.sitio(o) !== E.sitio.v) return false;
    if (E.sitio?.k === 'nave' && A.nave(o) !== E.sitio.v) return false;
    if (E.conj && !enConj(o, E.conj)) return false;
    if (E.turno && !plano(o.turno ?? 'sin turno').startsWith(E.turno)) return false;
    if (E.dsem && !E.dsem.includes(new Date(o.fecha + 'T12:00:00').getDay())) return false;
    return true;
  });
  E.ignoradas = [];
  if (E.libres.length) {
    const cl = (o: TrabInf) => (claveTitulo(o.titulo) + ' ' + plano(`${o.descripcion ?? ''} ${o.lugar ?? ''}`)).split(/\s+/);
    const tiene = (o: TrabInf, w: string) => cl(o).some((x) => x.startsWith(w.slice(0, Math.max(4, w.length - 2))));
    const Y = X.filter((o) => E.libres.every((w) => tiene(o, w)));
    if (Y.length) X = Y;
    else {
      const ok = E.libres.filter((w) => X.some((o) => tiene(o, w)));
      if (ok.length) X = X.filter((o) => ok.every((w) => tiene(o, w)));
      E.ignoradas = E.libres.filter((w) => !ok.includes(w));
    }
  }
  return X;
}

// ---------- contestar ----------
export function contesta(E: Entendido, C: Contexto, A: Ayudas): Respuesta {
  const { d0, d1 } = E.per, hoy = C.hoy;
  const enP = (o: TrabInf) => o.fecha >= d0 && o.fecha <= d1;
  const Ant = anterior(d0, d1), enA = (o: TrabInf) => o.fecha >= Ant.d0 && o.fecha <= Ant.d1;
  const horas = (C.dias ?? null) as DiaH[] | null;
  const X0 = investigar(C.D, horas, d0, d1, hoy, C.aj);   // todo el periodo (para tiempos y saturación)
  const T = (a: TrabInf[]) => a.reduce((s, o) => s + A.min(o, X0), 0);
  if (E.int === 'personas') return personas(E, C);
  const todos = filtra(C.D.trabajos, E, A), L = todos.filter(enP), La = todos.filter(enA), H = L.filter((o) => o.estado === 'hecho');
  const r: Respuesta = { frase: '', cols: null, filas: [], L };
  const desc = [E.cat === '*' ? 'problemas' : E.cat ? E.cat.toLowerCase() : null, E.sitio ? `en la ${E.sitio.v}` : null, E.conj ? `de ${E.conj.n.toLowerCase()}` : null,
    E.pers.length ? `de ${E.pers.join(' y ')}` : null, E.dsem ? `los ${E.dsem.map((d) => DIAS_LARGOS[d].toLowerCase()).join(' y ')}` : null,
    E.libres.length && !E.ignoradas.length ? `«${E.libres.join(' ')}»` : null].filter(Boolean).join(' ');
  const quien = desc || 'trabajos';
  const inv = (Ls: TrabInf[]) => investigar({ ...C.D, trabajos: Ls }, horas, d0, d1, hoy, C.aj);

  if (E.int === 'naves') {
    if (C.D.naves.length < 2) { r.frase = 'Solo hay una nave dada de alta: no hay con qué comparar.'; r.L = []; return r; }
    const N = C.D.naves.slice(0, 2).map((v) => {
      const X = filtra(C.D.trabajos, { ...E, sitio: { k: 'nave', v } }, A), a = X.filter(enP), b = X.filter(enA);
      const h = a.filter((o) => o.estado === 'hecho'), pr = a.filter((o) => A.cat(o)), S = new Map<string, number>();
      pr.forEach((o) => S.set(A.sitio(o), (S.get(A.sitio(o)) ?? 0) + 1));
      const top = [...S.entries()].sort((x, y) => y[1] - x[1])[0];
      return { v, a, n: a.length, min: T(h), h: h.length, np: pr.length, mp: T(pr.filter((o) => o.estado === 'hecho')), na: b.length, top };
    });
    const [a, b] = N; r.cols = ['', a.v, b.v];
    r.filas = [['Veces', a.n, b.n], ['Tiempo', invH(a.min), invH(b.min)], ['Media por vez', a.h ? invH(a.min / a.h) : '—', b.h ? invH(b.min / b.h) : '—'],
      ['Problemas', a.np, b.np], ['Tiempo en problemas', invH(a.mp), invH(b.mp)], ['Sitio con más problemas', a.top ? `${a.top[0]} (${a.top[1]})` : '—', b.top ? `${b.top[0]} (${b.top[1]})` : '—'],
      ['Veces el periodo anterior', a.na, b.na]];
    const m = a.min >= b.min ? a : b, o2 = m === a ? b : a;
    r.frase = (quien === 'trabajos' ? '' : `${mayus(quien)}, `) + `${a.v} frente a ${b.v} ${E.per.t}: la ${a.v} ${vez(a.n)} y ${invH(a.min)}; la ${b.v} ${vez(b.n)} y ${invH(b.min)}.`
      + (a.min !== b.min ? ` En la ${m.v} se va ${invH(m.min - o2.min)} más.` : '') + ` Problemas: ${a.np} en la ${a.v} y ${b.np} en la ${b.v}.`;
    r.L = [...a.a, ...b.a]; return r;
  }
  if (E.int === 'ahorro') {
    const P = L.filter((o) => A.cat(o) && o.estado === 'hecho'), mes = Math.max(1, (diasEntre(d0, d1) + 1) / 30.4);
    const G = new Map<string, { s: string; n: number; min: number; c: Map<string, number>; L: TrabInf[] }>();
    P.forEach((o) => { const k = A.sitio(o); const g = G.get(k) ?? { s: k, n: 0, min: 0, c: new Map<string, number>(), L: [] as TrabInf[] }; g.n++; g.L.push(o); g.min += A.min(o, X0); g.c.set(A.cat(o)!, (g.c.get(A.cat(o)!) ?? 0) + 1); G.set(k, g); });
    const L2 = [...G.values()].sort((x, y) => y.min - x.min);
    const tipos = (g: { c: Map<string, number> }) => [...g.c.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(', ');
    r.cols = ['Sitio', 'Problemas', `Tiempo ${E.per.t}`, 'Al mes', 'De qué']; r.filas = L2.map((g) => [g.s, g.n, invH(g.min), invH(g.min / mes), tipos(g)]); r.rowL = L2.map((g) => g.L);
    const tot = T(P);
    r.frase = !P.length ? `No ha habido problemas ${E.sitio ? `en la ${E.sitio.v} ` : ''}${E.per.t}: no hay nada que ahorrar.`
      : E.sitio && L2.length === 1 ? `Si se arregla la ${E.sitio.v}, se ahorrarían unas ${invH(tot / mes)} al mes de limpieza: ${E.per.t} ha tenido ${P.length} problemas (${tipos(L2[0])}) que han llevado ${invH(tot)}.`
        : `Si se arreglan ${L2.length === 1 ? 'estos problemas' : `los problemas de estos ${L2.length} sitios`}, se ahorrarían unas ${invH(tot / mes)} al mes (${invH(tot)} ${E.per.t}). Lo que más ahorraría: ${L2[0].s}, ${invH(L2[0].min / mes)} al mes.`;
    r.L = P; return r;
  }
  if (E.int === 'vuelto') {
    const conFecha = /desde (?:el )?\d/.test(E.t), antes = todos.filter((o) => o.fecha < d0).sort((x, y) => x.fecha.localeCompare(y.fecha));
    const ult = [...L].sort((x, y) => y.fecha.localeCompare(x.fecha))[0], q2 = quien === 'trabajos' ? '' : ` (${quien})`;
    r.frase = !conFecha ? `Para saber si ha vuelto a pasar, dime desde cuándo: por ejemplo «¿ha vuelto a perder aceite la F19 desde el 10/11?». ${mayus(E.per.t)}${q2}: ${vez(L.length)}${ult ? `, la última el ${fDMA(ult.fecha)}` : ''}.`
      : L.length ? `Sí, ha vuelto a pasar${q2}: ${vez(L.length)} ${E.per.t}. La última, el ${fDMA(ult.fecha)} (hace ${diasEntre(ult.fecha, hoy)} días).`
        : `No ha vuelto a pasar${q2} ${E.per.t}.` + (antes.length ? ` Lo último fue el ${fDMA(antes[antes.length - 1].fecha)}.` : '');
    r.cols = ['', E.per.t, 'Antes']; r.filas = [['Veces', L.length, antes.length], ['Tiempo', invH(T(H)), invH(T(antes.filter((o) => o.estado === 'hecho')))]]; return r;
  }
  if (E.int === 'pend') {
    const P = L.filter((o) => o.estado !== 'hecho' && o.fecha <= hoy);
    const G = new Map<string, { t: string; n: number; p: number; pr: number; c: number; ult: string; L: TrabInf[] }>();
    P.forEach((o) => {
      const k = claveTitulo(o.titulo) || o.titulo; const g = G.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), n: 0, p: 0, pr: 0, c: 0, ult: o.fecha, L: [] };
      g.n++; g.L.push(o); if (o.problema) g.pr++; else if (o.estado === 'pendiente') g.p++; else g.c++; if (o.fecha > g.ult) g.ult = o.fecha; G.set(k, g);
    });
    const L2 = [...G.values()].sort((x, y) => y.n - x.n);
    r.cols = ['Trabajo', 'Sin hacer', 'Pendientes', 'Con problema', 'Empezados', 'Último']; r.filas = L2.map((g) => [g.t, g.n, g.p, g.pr, g.c, fCorta(g.ult)]); r.rowL = L2.map((g) => g.L);
    const cp = P.filter((o) => o.problema).length, ce = P.filter((o) => !o.problema && o.estado !== 'pendiente').length;
    r.frase = P.length ? `Sin hacer ${E.per.t}${quien === 'trabajos' ? '' : ` (${quien})`}: ${P.length} trabajos (${P.length - cp - ce} pendientes, ${cp} con problema y ${ce} empezados sin terminar). El que más se queda sin hacer: «${L2[0].t}» (${vez(L2[0].n)}).`
      : `Nada se ha quedado sin hacer ${E.per.t}.`;
    r.L = P; return r;
  }
  if (E.int === 'evo') {
    const mej = /(mejor|bajado)/.test(E.t), base = (Xs: TrabInf[]) => Xs.filter((o) => (E.cat ? true : A.cat(o)) && A.cat(o)), Aa = base(L), Bb = base(La);
    const G = new Map<string, { s: string; c: string; n: number; na: number; min: number }>(), k = (o: TrabInf) => `${A.sitio(o)}|${A.cat(o)}`;
    Aa.forEach((o) => { const g = G.get(k(o)) ?? { s: A.sitio(o), c: A.cat(o)!, n: 0, na: 0, min: 0 }; g.n++; g.min += A.min(o, X0); G.set(k(o), g); });
    Bb.forEach((o) => { const g = G.get(k(o)) ?? { s: A.sitio(o), c: A.cat(o)!, n: 0, na: 0, min: 0 }; g.na++; G.set(k(o), g); });
    const L2 = [...G.values()].filter((g) => (mej ? g.n < g.na : g.n > g.na)).sort((x, y) => (mej ? (x.n - x.na) - (y.n - y.na) : (y.n - y.na) - (x.n - x.na)) || y.min - x.min);
    r.cols = ['Sitio', 'Problema', 'Antes', 'Ahora', 'Diferencia', 'Tiempo ahora']; r.filas = L2.map((g) => [g.s, g.c, g.na, g.n, (g.n > g.na ? '+' : '') + (g.n - g.na), invH(g.min)]);
    r.frase = L2.length ? `Lo que más ha ${mej ? 'mejorado' : 'empeorado'} ${E.per.t} respecto al periodo anterior: ${L2[0].s} (${L2[0].c.toLowerCase()}), de ${L2[0].na} a ${vez(L2[0].n)}. `
      + (L2.length > 1 ? `En total, ${L2.length} sitios van a ${mej ? 'mejor' : 'peor'}.` : '') + ` En todos los problemas: ${Aa.length} ahora y ${Bb.length} antes.`
      : `Nada ha ${mej ? 'mejorado' : 'empeorado'} ${E.per.t} respecto al periodo anterior (${Aa.length} problemas ahora y ${Bb.length} antes).`;
    r.L = Aa.filter((o) => L2.some((g) => g.s === A.sitio(o) && g.c === A.cat(o))); return r;
  }
  if (E.int === 'res') {
    const t = X0.tot, Pa = C.D.trabajos.filter(enA).filter((o) => A.cat(o)), sh = C.D.trabajos.filter(enP).filter((o) => o.estado !== 'hecho' && o.fecha <= hoy).length;
    const repMin = X0.rep.reduce((x, g) => x + g.min, 0), topRep = [...X0.rep].sort((x, y) => y.min - x.min)[0];
    r.cols = ['', E.per.t, 'Periodo anterior'];
    r.filas = [['Trabajos hechos', t.nt, C.D.trabajos.filter(enA).filter((o) => o.estado === 'hecho').length], ['Tiempo en trabajos', invH(t.min), '—'], ['Problemas (avisos)', t.np, Pa.length],
      ['Tiempo en problemas', invH(t.prob), invH(T(Pa.filter((o) => o.estado === 'hecho')))], ['Problemas que se repiten (sitios)', X0.rep.length, '—'], ['Tiempo en problemas repetidos', invH(repMin), '—'],
      ['Saturación del equipo', t.jor ? `${pctN(t.cont, t.jor)} %` : '—', '—'], ['Saturación de quien apunta', t.jorAp ? `${pctN(t.contAp, t.jorAp)} %` : '—', '—'], ['Sin hacer', sh, '—']];
    r.frase = `Resumen ${E.per.t}: se han hecho ${t.nt} trabajos (${invH(t.min)}). Ha habido ${t.np} problemas, `
      + (t.np > Pa.length ? `${t.np - Pa.length} más` : t.np < Pa.length ? `${Pa.length - t.np} menos` : 'los mismos') + ` que el periodo anterior, con ${invH(t.prob)} de limpieza. `
      + (topRep ? `En problemas que se repiten sin arreglarse se han ido ${invH(repMin)}; donde más, ${topRep.sitio} (${topRep.tema.toLowerCase()}, ${vez(topRep.n)}, ${invH(topRep.min)}). ` : 'No se ha repetido ningún problema en el mismo sitio. ')
      + (t.jor ? `Saturación del equipo: ${pctN(t.cont, t.jor)} %` + (t.sinNada.length ? ` (${pctN(t.contAp, t.jorAp)} % de quien apunta sus trabajos; ${lista(t.sinNada.map((p) => p.n), 3)} no tienen nada apuntado)` : '') + '. ' : '')
      + (sh ? `${sh} trabajos se han quedado sin hacer.` : 'No se ha quedado nada sin hacer.');
    r.L = []; return r;
  }
  if (E.int === 'mejora') {
    const mes = Math.max(1, (diasEntre(d0, d1) + 1) / 30.4), R2 = H.filter((o) => tiempoReal(o) && !dudosa(o)), pm = (m: number) => invH(m / mes);
    const B: { q: string; min: number; det: [string, number][] }[] = [];
    { const G = new Map<string, { t: string; n: number; ex: number; est: number; real: number }>();
      R2.filter((o) => (o.minutos_est ?? 0) > 0 && o.minutos! > o.minutos_est!).forEach((o) => { const k = claveTitulo(o.titulo); const g = G.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), n: 0, ex: 0, est: o.minutos_est!, real: 0 }; g.n++; g.ex += o.minutos! - o.minutos_est!; g.real += o.minutos!; G.set(k, g); });
      const L2 = [...G.values()].sort((a, b) => b.ex - a.ex);
      B.push({ q: 'Trabajos que tardan más de lo previsto', min: L2.reduce((x, g) => x + g.ex, 0), det: L2.slice(0, 3).map((g) => [`${g.t}: ${invH(g.real / g.n)} de media y se prevén ${invH(g.est)} (${vez(g.n)})`, g.ex]) }); }
    { const G = new Map<string, { t: string; P: Map<string, number[]> }>();
      R2.filter((o) => o.hecho_por_nombre).forEach((o) => { const k = claveTitulo(o.titulo); const g = G.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), P: new Map() }; g.P.set(o.hecho_por_nombre!, [...(g.P.get(o.hecho_por_nombre!) ?? []), o.minutos!]); G.set(k, g); });
      const L2: { t: string; ex: number; best: { n: string; m: number }; peor: { n: string; m: number } }[] = [];
      G.forEach((g) => {
        const P = [...g.P.entries()].filter(([, a]) => a.length >= 2).map(([n, a]) => ({ n, c: a.length, m: a.reduce((x, y) => x + y, 0) / a.length })); if (P.length < 2) return;
        const best = P.reduce((a, b) => (a.m <= b.m ? a : b)); let ex = 0, peor: typeof best | null = null;
        P.forEach((p) => { if (p.m > best.m * 1.2) { ex += (p.m - best.m) * p.c; if (!peor || p.m > peor.m) peor = p; } });
        if (ex > 0) L2.push({ t: g.t, ex, best, peor: peor! });
      });
      L2.sort((a, b) => b.ex - a.ex);
      B.push({ q: 'El mismo trabajo, unos tardan mucho más que otros', min: L2.reduce((x, g) => x + g.ex, 0), det: L2.slice(0, 3).map((g) => [`${g.t}: ${g.peor.n} ${invH(g.peor.m)} de media, ${g.best.n} ${invH(g.best.m)}`, g.ex]) }); }
    { const Dd = new Map<string, TrabInf[]>(), P = new Map<string, { n: string; corto: number; largo: number }>();
      R2.filter((o) => o.inicio && o.fin && o.hecho_por_nombre).forEach((o) => { const k = `${o.hecho_por_nombre}|${o.fecha}`; Dd.set(k, [...(Dd.get(k) ?? []), o]); });
      Dd.forEach((a, k) => { a.sort((x, y) => x.inicio!.localeCompare(y.inicio!)); const n = k.split('|')[0];
        for (let i = 1; i < a.length; i++) { const gap = (Date.parse(a[i].inicio!) - Date.parse(a[i - 1].fin!)) / 60000;
          if (gap > 0 && gap <= 240) { const p = P.get(n) ?? { n, corto: 0, largo: 0 }; if (gap <= C.aj.hueco) p.corto += gap; else p.largo += gap; P.set(n, p); } } });
      const L2 = [...P.values()].sort((a, b) => (b.corto + b.largo) - (a.corto + a.largo));
      B.push({ q: 'Tiempo entre un trabajo y otro', min: L2.reduce((x, p) => x + p.corto + p.largo, 0),
        det: L2.slice(0, 3).map((p) => [`${p.n}: ${pm(p.corto)} al mes en desplazarse y preparar, ${pm(p.largo)} en huecos de más de ${C.aj.hueco} min`, p.corto + p.largo]) }); }
    { const G = [...inv(todos).rep].sort((a, b) => b.min - a.min);
      B.push({ q: 'Arreglar las máquinas y sitios que repiten problemas', min: G.reduce((x, g) => x + g.min, 0), det: G.slice(0, 3).map((g) => [`${g.sitio} (${g.tema.toLowerCase()}, ${vez(g.n)})`, g.min]) }); }
    B.sort((a, b) => b.min - a.min);
    r.cols = ['Dónde ahorrar tiempo', 'Al mes', E.per.t]; r.filas = [];
    B.forEach((b, i) => { r.filas.push([`${i + 1}. ${b.q}`, pm(b.min), invH(b.min)]); b.det.forEach(([d, m]) => r.filas.push([`   · ${d}`, pm(m), invH(m)])); });
    const conReal = H.filter(tiempoReal).length;
    r.frase = B.some((b) => b.min > 0) ? `Para ahorrar tiempo ${E.per.t}, por orden: ` + B.filter((b) => b.min > 0).map((b, i) => `${i + 1}) ${b.q.toLowerCase()}, unas ${pm(b.min)} al mes`).join('; ') + '.'
      + ` Solo cuenta lo que tiene tiempo real (con «Empezar» y «Terminar»): ${conReal} de ${H.length} trabajos; cuantos más se apunten así, más afinado sale.`
      : `No hay datos suficientes ${E.per.t} para saber dónde ahorrar: hacen falta trabajos con «Empezar» y «Terminar» (${conReal} de ${H.length}).`;
    r.L = []; return r;
  }
  if (E.int === 'avisos') {
    const esAv = (o: TrabInf) => o.clase !== 'fija' && !o.origen?.startsWith('excel'), A2 = L.filter(esAv), Aa = La.filter(esAv);
    const dr = C.dic.find((d) => d.tipo === 'grupo' && plano(d.palabra).trim() === 'rutinas' && d.valor), cr = dr ? { w: plano(dr.valor!).split(/\s*,\s*/).filter(Boolean) } : null;
    const esRut = (o: TrabInf) => !!cr && enConj(o, cr);
    type GA = { k: string; t: string; n: number; min: number; S: Map<string, number>; D: number[]; L: TrabInf[] };
    const agrupa = (Xs: TrabInf[]) => { const G = new Map<string, GA>(); Xs.forEach((o) => { const k = claveTitulo(o.titulo) || o.titulo; const g = G.get(k) ?? { k, t: o.titulo.replace(/\s*·.*$/, ''), n: 0, min: 0, S: new Map<string, number>(), D: [0, 0, 0, 0, 0, 0, 0], L: [] as TrabInf[] };
      g.n++; g.L.push(o); if (o.estado === 'hecho') g.min += A.min(o, X0); g.S.set(A.sitio(o), (g.S.get(A.sitio(o)) ?? 0) + 1); g.D[new Date(o.fecha + 'T12:00:00').getDay()]++; G.set(k, g); }); return G; };
    const Ga = agrupa(Aa), top = (g: GA) => [...g.S.entries()].sort((a, b) => b[1] - a[1])[0], dia = (g: GA) => { const m = Math.max(...g.D); return `${DIAS_LARGOS[g.D.indexOf(m)]} (${m})`; };
    const va = (g: GA) => { const a = Ga.get(g.k)?.n ?? 0; return a ? (g.n > a ? 'a más' : g.n < a ? 'a menos' : 'igual') : 'nuevo'; };
    const fila = (g: GA) => [g.t, g.n, Ga.get(g.k)?.n ?? 0, va(g), invH(g.min), g.S.size, `${top(g)[0]} (${top(g)[1]})`, dia(g)];
    const ord = (G: Map<string, GA>) => [...G.values()].filter((g) => g.n >= 2).sort((a, b) => b.n - a.n || b.min - a.min);
    const L2 = ord(agrupa(A2.filter((o) => !esRut(o)))), R2 = ord(agrupa(A2.filter(esRut)));
    r.cols = ['Aviso', 'Veces', 'Antes', 'Va', 'Tiempo', 'Sitios', 'Donde más', 'Día que más']; r.filas = L2.map(fila); r.rowL = L2.map((g) => g.L);
    r.extra = [{ titulo: 'Rutinas pedidas como aviso', cols: r.cols, filas: R2.map(fila) }];
    r.frase = L2.length ? `Los avisos que más se repiten ${E.per.t}: ` + L2.slice(0, 3).map((g) => `«${g.t}» ${vez(g.n)} (${va(g)}; ${invH(g.min)}, en ${g.S.size} ${g.S.size === 1 ? 'sitio' : 'sitios'}; donde más, ${top(g)[0]} con ${top(g)[1]}; sobre todo los ${dia(g).replace(/ \(.*/, '').toLowerCase()})`).join(', ')
      + '. No cuento los trabajos fijos.' + (R2.length ? ` Aparte, ${R2.reduce((x, g) => x + g.n, 0)} avisos son rutinas (la que más, «${R2[0].t}» ${vez(R2[0].n)}): quizá convenga pasarlas a trabajos fijos.` : '')
      : `Ningún aviso se ha repetido ${E.per.t}.` + (R2.length ? ` Solo rutinas: «${R2[0].t}» ${vez(R2[0].n)}.` : '');
    r.L = L2.length ? A2.filter((o) => o.titulo.replace(/\s*·.*$/, '') === L2[0].t) : []; return r;
  }
  if (E.int === 'sobra') {
    let P = X0.sat.filter((p) => p.jor > 0); if (E.pers.length) P = P.filter((p) => E.pers.includes(p.n));
    P.sort((a, b) => (b.jor - b.cont) - (a.jor - a.cont));
    const jo = P.reduce((x, p) => x + p.jor, 0), so = jo - P.reduce((x, p) => x + p.cont, 0), ap = P.filter((p) => p.nt > 0), na = P.filter((p) => !p.nt);
    const joA = ap.reduce((x, p) => x + p.jor, 0), soA = joA - ap.reduce((x, p) => x + p.cont, 0), media = P.length ? jo / P.length : 0;
    r.cols = ['Persona', 'Jornada', 'Ocupado', 'Sobra', '% que sobra']; r.filas = P.map((p) => [p.n + (p.nt ? '' : ' (sin nada apuntado)'), invH(p.jor), invH(p.cont), invH(p.jor - p.cont), `${pctN(p.jor - p.cont, p.jor)} %`]);
    r.frase = !P.length ? `No hay horas de jornada ${E.per.t} para calcularlo.`
      : `Según lo apuntado, ${E.per.t} sobran ${invH(so)} de ${invH(jo)} de jornada (${pctN(so, jo)} %)` + (media && P.length > 1 ? `, como ${String(Math.round((so / media) * 10) / 10).replace('.', ',')} personas a jornada completa` : '') + '.'
        + (na.length ? ` Pero ${invH(na.reduce((x, p) => x + p.jor, 0))} de esas horas son de ${lista(na.map((p) => p.n), 3)}, que no tienen nada apuntado: seguramente trabajan sin apuntarlo. Contando solo a quien apunta, sobran ${invH(soA)} de ${invH(joA)} (${pctN(soA, joA)} %).` : '')
        + ' Ojo: «sobra» es tiempo sin trabajos apuntados; si no se pulsa «Empezar» o hay trabajos sin apuntar, sale más de lo real.';
    const DS = [0, 1, 2, 3, 4, 5, 6].map(() => ({ jor: 0, cont: 0 }));
    ap.forEach((p) => p.D.forEach((x, f) => { const d = new Date(f + 'T12:00:00').getDay(); DS[d].jor += x.jor; DS[d].cont += x.cont; }));
    const fl = (n: string, x: { jor: number; cont: number }) => [n, invH(x.jor), invH(x.cont), invH(x.jor - x.cont), `${pctN(x.jor - x.cont, x.jor)} %`];
    const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => DS[d].jor > 0);
    const dmax = [...dias].sort((a, b) => (DS[b].jor - DS[b].cont) / DS[b].jor - (DS[a].jor - DS[a].cont) / DS[a].jor)[0];
    const PE = L.filter((o) => o.estado !== 'hecho' && o.fecha <= hoy), med = new Map<string, number[]>();
    H.forEach((o) => { const k = claveTitulo(o.titulo); med.set(k, [...(med.get(k) ?? []), A.min(o, X0)]); });
    const dura = (o: TrabInf) => o.minutos_est || ((med.get(claveTitulo(o.titulo)) ?? []).length ? med.get(claveTitulo(o.titulo))!.reduce((x, y) => x + y, 0) / med.get(claveTitulo(o.titulo))!.length : 30);
    const GP = new Map<string, { t: string; n: number; min: number }>();
    PE.forEach((o) => { const k = claveTitulo(o.titulo) || o.titulo; const g = GP.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), n: 0, min: 0 }; g.n++; g.min += dura(o); GP.set(k, g); });
    const LP = [...GP.values()].sort((a, b) => b.min - a.min), peMin = LP.reduce((x, g) => x + g.min, 0);
    r.extra = [{ titulo: 'Qué días sobra más (de quien apunta)', cols: ['Día', 'Jornada', 'Ocupado', 'Sobra', '% que sobra'], filas: dias.map((d) => fl(DIAS_LARGOS[d], DS[d])) },
      { titulo: 'Lo que se ha quedado sin hacer y cabría en lo que sobra', cols: ['Trabajo', 'Veces sin hacer', 'Tiempo que lleva'], filas: LP.map((g) => [g.t, g.n, invH(g.min)]) }];
    if (P.length) r.frase += (dias.length && ap.length ? ` Donde más sobra es el ${DIAS_LARGOS[dmax].toLowerCase()} (${pctN(DS[dmax].jor - DS[dmax].cont, DS[dmax].jor)} %).` : '')
      + (PE.length ? ` Lo que se ha quedado sin hacer (${PE.length} ${PE.length === 1 ? 'trabajo' : 'trabajos'}, unas ${invH(peMin)}) ` + (peMin <= soA ? `cabría ${peMin ? String(Math.floor((soA / peMin) * 10) / 10).replace('.', ',') : ''} veces en lo que sobra a quien apunta.` : `no cabe entero en lo que sobra a quien apunta (${invH(soA)}).`) : ' No se ha quedado nada sin hacer.');
    r.L = []; return r;
  }
  if (E.int === 'pasar') {
    let P = X0.sat.filter((p) => p.jor && p.nt && (pctN(p.cont, p.jor) ?? 0) >= C.aj.limite); if (E.pers.length) P = X0.sat.filter((p) => E.pers.includes(p.n) && p.jor);
    r.cols = ['Persona', 'Trabajo', 'Días', 'Tiempo', 'Pasar a', 'Así quedaría']; r.filas = [];
    P.forEach((p) => pasables(p, C.D, X0, d0, d1, C.aj).forEach((x) => { const b = x.cands.find((c) => !c.sin);
      r.filas.push([`${p.n} (${x.antes} %)`, x.t.titulo, diasTareaTxt(x.t.dias), invH(x.m), b ? `${b.nombre} (${b.antes} % → ${b.despues} %)` : 'nadie con hueco', `${p.n.split(' ')[0]} ${x.despues} %`]); }));
    r.frase = !P.length ? `Nadie con trabajos apuntados pasa del ${C.aj.limite} % ${E.per.t}: no hace falta pasar trabajos.`
      : r.filas.length ? `${P.length} ${P.length === 1 ? 'persona pasa' : 'personas pasan'} del ${C.aj.limite} %: ${P.map((p) => `${p.n} (${pctN(p.cont, p.jor)} %)`).join(', ')}. Abajo, sus trabajos fijos y a quién se podrían pasar. Para hacerlo, en «Trabajos que se pueden pasar a otro» pulsa «Pasar».`
        : `Quien pasa del ${C.aj.limite} % no tiene trabajos fijos con tiempo que se puedan pasar.`;
    r.L = []; return r;
  }
  if (E.int === 'sat') {
    let P = X0.sat; if (E.pers.length) P = P.filter((p) => E.pers.includes(p.n));
    const fila = (p: typeof P[number]) => [p.n, invH(p.jor), invH(p.min), invH(p.desp), invH(p.sin), p.jor ? `${pctN(p.cont, p.jor)} %` : '—'];
    r.cols = ['Persona', 'Jornada', 'Trabajos', 'Despl. y prep.', 'Sin justificar', 'Saturación']; r.filas = P.map(fila);
    const jo = P.reduce((s, p) => s + p.jor, 0), co = P.reduce((s, p) => s + p.cont, 0);
    r.frase = `${P.length === 1 ? `Saturación de ${P[0].n}` : `Saturación${E.pers.length ? '' : ' del equipo'}`} ${E.per.t}: ${jo ? `${pctN(co, jo)} %` : 'sin horas de jornada'} (${invH(co)} de ${invH(jo)} de jornada).`;
    const Q = P.filter((p) => p.jor > 0);
    if (Q.length > 1 && (E.menos || /\b(mas|mayor)\b/.test(E.t))) {
      const sat = (p: typeof Q[number]) => p.cont / p.jor; Q.sort((a, b) => (E.menos ? sat(a) - sat(b) : sat(b) - sat(a)));
      r.filas = [...Q, ...P.filter((p) => !p.jor)].map(fila); const a = Q[0], b = Q[Q.length - 1];
      r.frase = `Quien ${E.menos ? 'menos' : 'más'} carga de trabajo tiene ${E.per.t}: ${a.n}, ${pctN(a.cont, a.jor)} % (${invH(a.cont)} de ${invH(a.jor)} de jornada). ${E.menos ? 'Quien más' : 'Quien menos'}: ${b.n}, ${pctN(b.cont, b.jor)} %. Equipo: ${pctN(co, jo)} %.`
        + (E.menos && !a.min ? ` Ojo: ${a.n} no tiene ningún trabajo apuntado; puede que trabaje sin apuntarlo, así que no quiere decir que no haga nada.` : '');
    }
    r.L = P.length === 1 ? X0.H.filter((o) => o.hecho_por_nombre === P[0].n) : []; return r;
  }
  if (E.int === 'rep') {
    const Xr = inv(C.D.trabajos.filter((o) => todos.includes(o) || !A.cat(o)));
    let G: Repetido[] = Xr.rep;
    const perd = /(pierd|perd|solucion|arregl)/.test(E.t); if (perd) G = [...G].sort((a, b) => b.min - a.min || b.n - a.n);
    r.cols = ['Sitio', 'Problema', 'Veces', 'Tiempo', 'Cada (días)', 'Última', 'Sigue'];
    r.filas = G.map((g) => [g.sitio, g.tema, g.n, invH(g.min), g.cada != null ? String(Math.round(g.cada * 10) / 10).replace('.', ',') : '—', fCorta(g.ult), g.sigue ? 'Sí' : 'No']);
    const tot = G.reduce((s, g) => s + g.min, 0), veces = G.reduce((s, g) => s + g.n, 0);
    r.frase = !G.length ? `Nada se ha repetido en el mismo sitio ${E.per.t}.`
      : perd ? `Donde más tiempo se pierde repitiendo el mismo trabajo ${E.per.t}: ${G[0].sitio} (${G[0].tema.toLowerCase()}), ${G[0].n} veces y ${invH(G[0].min)}. En total se han ido ${invH(tot)} en ${veces} trabajos por ${G.length} ${G.length === 1 ? 'problema que se repite' : 'problemas que se repiten'} sin arreglarse. ${fraseSitio(G[0], hoy)}`
        : `${G.length} ${G.length === 1 ? 'sitio donde se repite' : 'sitios donde se repite'} ${E.per.t}. ${fraseSitio(G[0], hoy)}`;
    r.L = G.length ? G[0].L : []; r.rowL = G.map((g) => g.L); return r;
  }
  if (E.int === 'cal') {
    const G = new Map<string, { n: string; t: number; r: number }>();
    H.forEach((o) => { const n = o.hecho_por_nombre ?? 'Sin indicar'; const g = G.get(n) ?? { n, t: 0, r: 0 }; g.t++; if (tiempoReal(o)) g.r++; G.set(n, g); });
    const P = [...G.values()].sort((a, b) => a.r / a.t - b.r / b.t);
    r.cols = ['Persona', 'Trabajos', 'Con «Empezar»', 'Sin empezar', '% real']; r.filas = P.map((g) => [g.n, g.t, g.r, g.t - g.r, `${pctN(g.r, g.t)} %`]);
    r.frase = P.length ? `Quien menos pulsa «Empezar» ${E.per.t}: ${P[0].n} (${pctN(P[0].t - P[0].r, P[0].t)} % de sus trabajos sin tiempo real).` : `Ningún trabajo hecho ${E.per.t}.`;
    r.L = H.filter((o) => !tiempoReal(o)); return r;
  }
  // general: contar, tiempo, media, agrupado
  if (!C.D.trabajos.some(enP)) { r.frase = `En la app no hay ningún trabajo apuntado ${E.per.t}. Puede que sea antes de empezar a usarla o una fecha mal escrita.`; r.L = []; return r; }
  const met = E.met;
  const val = (a: TrabInf[]) => { const h = a.filter((o) => o.estado === 'hecho'); return { n: a.length, min: T(h), h: h.length }; };
  type V = ReturnType<typeof val>;
  const fmt = (v: V) => (met === 'n' ? [v.n] : met === 'min' ? [invH(v.min)] : met === 'avg' ? [v.h ? invH(v.min / v.h) : '—'] : [v.n, invH(v.min), v.h ? invH(v.min / v.h) : '—']);
  const head = met === 'n' ? ['Veces'] : met === 'min' ? ['Tiempo'] : met === 'avg' ? ['Media'] : ['Veces', 'Tiempo', 'Media'];
  const key = met === 'avg' ? (v: V) => (v.h ? v.min / v.h : -1) : met === 'n' ? (v: V) => v.n : (v: V) => v.min || v.n / 1000;
  let g = E.grupo; const tot = val(L), ant = val(La);
  if (!g && met === 'avg' && (E.conj || E.libres.length > E.ignoradas.length) && new Set(L.map((o) => claveTitulo(o.titulo))).size > 1) g = 'trab';
  if (g === 'per' && met === 'avg' && !E.cat && !E.conj && !E.sitio && !(E.libres.length > E.ignoradas.length)) {
    const G = new Map<string, { t: string; P: Map<string, number[]> }>();
    H.filter((o) => tiempoReal(o) && !dudosa(o) && o.hecho_por_nombre).forEach((o) => { const k = claveTitulo(o.titulo); const x = G.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), P: new Map() }; x.P.set(o.hecho_por_nombre!, [...(x.P.get(o.hecho_por_nombre!) ?? []), o.minutos!]); G.set(k, x); });
    const L2: { t: string; hi: { n: string; c: number; m: number }; lo: { n: string; c: number; m: number }; imp: number }[] = [];
    G.forEach((x) => { const P = [...x.P.entries()].filter(([, a]) => a.length >= 2).map(([n, a]) => ({ n, c: a.length, m: a.reduce((u, v) => u + v, 0) / a.length })); if (P.length < 2) return;
      P.sort((a, b) => b.m - a.m); const hi = P[0], lo = P[P.length - 1]; L2.push({ t: x.t, hi, lo, imp: (hi.m - lo.m) * hi.c }); });
    L2.sort((a, b) => b.imp - a.imp); if (E.menos) L2.sort((a, b) => a.lo.m - b.lo.m);
    r.cols = ['Trabajo', 'Tarda más', 'Media', 'Tarda menos', 'Media', 'Diferencia'];
    r.filas = L2.map((x) => [x.t, `${x.hi.n} (${vez(x.hi.c)})`, invH(x.hi.m), `${x.lo.n} (${vez(x.lo.c)})`, invH(x.lo.m), invH(x.hi.m - x.lo.m)]);
    r.frase = L2.length ? `Comparando a la gente en el mismo trabajo ${E.per.t}, donde más diferencia hay es «${L2[0].t}»: ${L2[0].hi.n} tarda ${invH(L2[0].hi.m)} de media y ${L2[0].lo.n} ${invH(L2[0].lo.m)}. Solo cuento tiempos reales (con «Empezar») de quien ha hecho el trabajo al menos 2 veces. Para uno concreto, pregunta por él: «¿quién tarda más en vaciar barreduras?».`
      : `No hay ningún trabajo hecho ${E.per.t} por dos personas al menos 2 veces cada una con tiempo real (con «Empezar» y «Terminar»): todavía no se puede comparar.`;
    r.L = []; return r;
  }
  const cmp = (a: number, b: number) => (b > a ? 'más' : b < a ? 'menos' : 'igual');
  if (g) {
    const gg = g;
    const by = (o: TrabInf) => gg === 'per' ? (o.hecho_por_nombre ?? 'Sin hacer') : gg === 'sit' ? A.sitio(o) : gg === 'dsem' ? DIAS_LARGOS[new Date(o.fecha + 'T12:00:00').getDay()]
      : gg === 'sem' ? `Semana del ${fDM(lunesDe(o.fecha))}` : gg === 'mes' ? `${MESES[Number(o.fecha.slice(5, 7)) - 1]} ${o.fecha.slice(0, 4)}` : gg === 'tipo' ? (A.cat(o) ?? 'Trabajo normal')
        : gg === 'hora' ? franja(A.hora(o)) : gg === 'semmes' ? semMes(o.fecha) : gg === 'turno' ? (o.turno ?? 'Sin turno') : (claveTitulo(o.titulo) || '(sin título)');
    const M = new Map<string, TrabInf[]>(), Ma = new Map<string, TrabInf[]>();
    L.forEach((o) => M.set(by(o), [...(M.get(by(o)) ?? []), o])); La.forEach((o) => Ma.set(by(o), [...(Ma.get(by(o)) ?? []), o]));
    const ks = [...M.keys()];
    if (g === 'sem' || g === 'mes') ks.sort((a, b) => M.get(a)![0].fecha.localeCompare(M.get(b)![0].fecha));
    else if (g === 'hora' || g === 'semmes') ks.sort((a, b) => (a === 'Sin hora' ? 1 : b === 'Sin hora' ? -1 : a.localeCompare(b)));
    else if (g === 'dsem') ks.sort((a, b) => ((DIAS_LARGOS.indexOf(a) + 6) % 7) - ((DIAS_LARGOS.indexOf(b) + 6) % 7));
    else ks.sort((a, b) => (E.menos ? key(val(M.get(a)!)) - key(val(M.get(b)!)) : key(val(M.get(b)!)) - key(val(M.get(a)!))));
    const nom = (k: string) => (g === 'trab' ? M.get(k)![0].titulo.replace(/\s*·.*$/, '') : k);
    r.cols = [({ per: 'Persona', sit: 'Sitio', dsem: 'Día', sem: 'Semana', mes: 'Mes', trab: 'Trabajo', tipo: 'Tipo', hora: 'Hora', semmes: 'Semana del mes', turno: 'Turno' } as Record<string, string>)[g], ...head, ...(E.comp ? ['Antes'] : [])];
    r.filas = ks.map((k) => [nom(k), ...fmt(val(M.get(k)!)), ...(E.comp ? [(Ma.get(k) ?? []).length] : [])]); r.rowL = ks.map((k) => M.get(k)!);
    const ord = ['sem', 'mes', 'dsem', 'hora', 'semmes'].includes(g);
    const top = ks.filter((k) => !ord && k !== 'Sin hora')[0] ?? [...ks.filter((k) => k !== 'Sin hora')].sort((a, b) => (E.menos ? key(val(M.get(a)!)) - key(val(M.get(b)!)) : key(val(M.get(b)!)) - key(val(M.get(a)!))))[0] ?? ks[0];
    r.frase = ks.length ? `${mayus(quien)} ${E.per.t} (${tot.n} en total, ${invH(tot.min)}). ${E.menos ? 'El que menos' : 'El que más'}: ${nom(top)} (${fmt(val(M.get(top)!)).join(' · ')}).`
      + (E.comp ? ` Periodo anterior: ${ant.n} (${cmp(ant.n, tot.n)} ahora).` : '') + (g === 'hora' && M.get('Sin hora') ? ` (${M.get('Sin hora')!.length} sin hora: trabajos fijos que no se empezaron con «Empezar».)` : '')
      : `No hay ${quien} ${E.per.t}.`;
    return r;
  }
  r.cols = ['', E.per.t, 'Periodo anterior'];
  r.filas = [['Veces', tot.n, ant.n], ['Tiempo', invH(tot.min), invH(ant.min)], ['Media por vez', tot.h ? invH(tot.min / tot.h) : '—', ant.h ? invH(ant.min / ant.h) : '—']];
  r.frase = tot.n ? `${mayus(quien)} ${E.per.t}: ` + (met === 'avg' ? `de media ${tot.h ? invH(tot.min / tot.h) : '—'} cada vez (${vez(tot.n)})` : met === 'min' ? `${invH(tot.min)} en ${vez(tot.n)}` : `${vez(tot.n)}, ${invH(tot.min)}`) + '.'
    + ` En el periodo anterior: ${vez(ant.n)}` + (ant.n !== tot.n ? ` (${tot.n > ant.n ? 'ha subido' : 'ha bajado'})` : '') + '.'
    : `No hay ${quien} ${E.per.t}.` + (ant.n ? ` En el periodo anterior hubo ${ant.n}.` : '');
  return r;
}

// ---------- personas (nuevo) ----------
const MEDIDA: Record<Medida, { t: string; unidad: 'dias' | 'h'; v: (f: Ficha) => number; motivos?: Motivo[] }> = {
  baja: { t: 'días de baja', unidad: 'dias', v: (f) => f.faltas.baja, motivos: ['baja'] },
  vacaciones: { t: 'días de vacaciones', unidad: 'dias', v: (f) => f.faltas.vacaciones, motivos: ['vacaciones'] },
  permiso: { t: 'días de permiso', unidad: 'dias', v: (f) => f.faltas.permiso, motivos: ['permiso'] },
  faltas: { t: 'días de falta', unidad: 'dias', v: (f) => f.faltas.baja + f.faltas.vacaciones + f.faltas.permiso + f.faltas.otro, motivos: ['baja', 'vacaciones', 'permiso', 'otro'] },
  extra: { t: 'horas extra', unidad: 'h', v: (f) => f.extra },
  fuera: { t: 'horas fuera de presupuesto', unidad: 'h', v: (f) => f.fuera },
  dias: { t: 'días trabajados', unidad: 'dias', v: (f) => f.diasTrab },
  horas: { t: 'horas trabajadas', unidad: 'h', v: (f) => f.horas },
};
const num = (x: number, u: 'dias' | 'h') => (u === 'h' ? `${(Math.round(x * 100) / 100).toLocaleString('es-ES')} h` : String(x));
function personas(E: Entendido, C: Contexto): Respuesta {
  const r: Respuesta = { frase: '', cols: null, filas: [], L: [] };
  if (!C.dias) { r.frase = 'Para preguntar por bajas, vacaciones u horas de las personas hace falta tener Personal y poder ver las horas.'; return r; }
  const m = MEDIDA[E.medida!];
  const F = fichas(C.dias, E.per.d0, E.per.d1, C.hoy);
  const Fp = E.pers.length ? F.filter((f) => E.pers.includes(f.nombre)) : F;
  const persTxt = E.pers.length ? E.pers.join(' y ') : null;
  if (E.grupo === 'mes' || /mes a mes/.test(E.t)) {
    const id = Fp.length === 1 && E.pers.length ? Fp[0].persona_id : null;
    const Ms = mesAMes(C.dias, E.per.d0, E.per.d1, C.hoy, id);
    const vm = (x: typeof Ms[number]) => (E.medida === 'baja' ? x.baja : E.medida === 'vacaciones' ? x.vacaciones : E.medida === 'permiso' ? x.permiso
      : E.medida === 'faltas' ? x.baja + x.vacaciones + x.permiso + x.otro : E.medida === 'extra' ? x.extra : E.medida === 'fuera' ? x.fuera : E.medida === 'dias' ? x.diasTrab : x.horas);
    r.cols = ['Mes', mayus(m.t), ...(E.medida === 'baja' ? ['Bajas nuevas'] : [])];
    r.filas = Ms.map((x) => [nombreMes(x.mes), num(vm(x), m.unidad), ...(E.medida === 'baja' ? [x.bajas] : [])]);
    const top = [...Ms].sort((a, b) => vm(b) - vm(a))[0];
    r.frase = `${mayus(m.t)} mes a mes ${E.per.t}${id ? ` de ${Fp[0].nombre}` : ' (todos)'}: ${num(Ms.reduce((s, x) => s + vm(x), 0), m.unidad)} en total` + (top && vm(top) ? `; el mes con más, ${nombreMes(top.mes)} (${num(vm(top), m.unidad)}).` : '.');
    return r;
  }
  if (E.pers.length && Fp.length === 1) {
    const f = Fp[0], v = m.v(f);
    const per = m.motivos ? f.periodos.filter((p) => m.motivos!.includes(p.motivo)) : [];
    const pTxt = (p: typeof per[number]) => `${p.desde === p.hasta ? `el ${fDM(p.desde)}` : `del ${fDM(p.desde)} al ${fDM(p.hasta)}`}${p.notas.length ? ` (${p.notas.join(', ')})` : ''}`;
    if (m.motivos) {
      r.cols = ['Qué', 'Desde', 'Hasta', 'Días', 'Nota']; r.filas = per.map((p) => [MOTIVO[p.motivo], fDMA(p.desde), fDMA(p.hasta), p.dias, p.notas.join(' · ')]);
      r.frase = `${f.nombre} ${E.per.t}: ${v} ${m.t}` + (per.length ? `${E.medida === 'baja' ? ` en ${per.length} ${per.length === 1 ? 'baja' : 'bajas'}` : ''}: ${lista(per.map(pTxt), 4)}.` : '.');
    } else if (E.medida === 'extra' || E.medida === 'fuera') {
      const ds = f.extras.filter((e) => (E.medida === 'extra' ? e.extra : e.fuera) > 0);
      r.cols = ['Día', mayus(m.t), 'Motivo']; r.filas = ds.map((e) => [fCorta(e.fecha), num(E.medida === 'extra' ? e.extra : e.fuera, 'h'), e.nota ?? '']);
      r.frase = `${f.nombre} ${E.per.t}: ${num(v, 'h')} ${m.t.replace(/^horas /, '')}` + (ds.length ? ` en ${ds.length} ${ds.length === 1 ? 'día' : 'días'}.` : '.');
    } else {
      r.cols = ['', 'Días', 'Horas']; r.filas = (['entre', 'sabado', 'domingo', 'festivo'] as const).map((c) => [({ entre: 'Entre semana', sabado: 'Sábados', domingo: 'Domingos', festivo: 'Festivos' })[c], f.porClase[c].dias, num(f.porClase[c].horas, 'h')]);
      r.filas.push(['Total', f.diasTrab, num(f.horas, 'h')]);
      r.frase = `${f.nombre} ${E.per.t}: ${f.diasTrab} días trabajados y ${num(f.horas, 'h')} (previstas ${num(f.previstas, 'h')}).`;
    }
    return r;
  }
  if (E.pers.length && !Fp.length) { r.frase = `No hay horas de ${persTxt} ${E.per.t}.`; return r; }
  const L = [...Fp].sort((a, b) => (E.menos ? m.v(a) - m.v(b) : m.v(b) - m.v(a)) || a.nombre.localeCompare(b.nombre, 'es'));
  r.cols = ['Persona', mayus(m.t), ...(E.medida === 'baja' ? ['Bajas'] : [])];
  r.filas = L.map((f) => [f.nombre, num(m.v(f), m.unidad), ...(E.medida === 'baja' ? [f.periodos.filter((p) => p.motivo === 'baja').length] : [])]);
  const tot = L.reduce((s, f) => s + m.v(f), 0), top = L[0];
  r.frase = !L.length ? `No hay horas ${E.per.t}.` : !tot && m.unidad === 'dias' && E.medida !== 'dias' ? `Nadie tiene ${m.t} ${E.per.t}.`
    : `Quien ${E.menos ? 'menos' : 'más'} ${m.t} ${E.per.t}: ${top.nombre} (${num(m.v(top), m.unidad)}`
      + (E.medida === 'baja' ? `, ${top.periodos.filter((p) => p.motivo === 'baja').length} ${top.periodos.filter((p) => p.motivo === 'baja').length === 1 ? 'baja' : 'bajas'}` : '') + `). En total, ${num(tot, m.unidad)} entre ${L.length} personas.`;
  return r;
}

/** Ejemplos para tocar y probar (los de la vieja y los de personas). */
export const EJEMPLOS = ['¿Cuántas veces ha perdido aceite la F19 este año?', '¿Qué máquinas pierden más aceite en los últimos 3 meses?', '¿Quién tarda más en cada trabajo?',
  '¿Qué trabajos son los que más se repiten?', '¿Qué trabajos se pueden pasar a otro?', '¿Cuánto tiempo sobra según la carga de trabajo?', '¿Dónde se pierde más tiempo?',
  '¿Cómo podemos ahorrar tiempo en los trabajos?', 'Resumen del mes pasado', 'Compara la Nave 1 con la Nave 2', '¿Qué ha empeorado este mes?', '¿Cuánto ahorraríamos si arreglan la F19?',
  '¿A qué hora hay más derrames?', '¿Qué se ha quedado sin hacer esta semana?', 'Saturación de cada uno el mes pasado', '¿Qué días hay más derrames?', 'Tiempo perdido en problemas por semana',
  '¿Quién no pulsa Empezar?', '¿En qué se va el tiempo los sábados?',
  '¿Quién ha tenido más días de baja este año?', '¿Quién ha hecho más horas extra este mes?', 'Vacaciones de cada uno este año', 'Horas trabajadas mes a mes este año',
  '¿Cuántas horas fuera de presupuesto este mes?'];
export { fDMA as fechaLarga };
