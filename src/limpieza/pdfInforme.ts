// PDF y Excel del informe semanal y del informe por operario (mismo aspecto que la app vieja de Limpieza).
// Las librerías (jspdf, jspdf-autotable, write-excel-file) se cargan solo al pulsar el botón.
import {
  cuentas, dec, dondeTxt, durTxt, estadoTxt, esFinde, fCorta, fDM, fDMA, FALTA_TXT, hora, numSemana, origenTxt, pct, quienDe, tiempoReal,
  type HorasPersona, type PersonaInf, type TrabInf,
} from './informe';
import { cab, GRIS, libro, neg, nuevoPDF, ROJO, txt, type Celda } from '../componentes/informes';
export { cab, libro, neg, nuevoPDF, type Celda };

/** Incidencia para el informe (de limpieza.incidencias; solo las ve el administrador). */
export interface IncInf { id: string; tema: string | null; texto: string; lugar: string | null; urgente: boolean; estado: string; creado: string;
  quien: string | null; fotos: string[] }
/** Problema que se repite (de limpieza.problemas_lista, con sus veces en el periodo). */
export interface RepInf { tema: string; lugar: string | null; veces: number; ultima: string; quien: string[]; casos: string[] }

const INC_ESTADO: Record<string, string> = { abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta', descartada: 'Descartada' };


/** Foto (URL) más pequeña en JPEG para el PDF. */
function achica(src: string, max: number, q: number): Promise<{ src: string; w: number; h: number } | null> {
  return new Promise((ok) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      ok({ src: c.toDataURL('image/jpeg', q), w: c.width, h: c.height });
    };
    im.onerror = () => ok(null); im.src = src;
  });
}

// =====================================================================================
// Informe semanal
// =====================================================================================
export interface DatosSemana {
  unidad: string; quien: string; desde: string; hasta: string; trabajos: TrabInf[];
  incidencias: IncInf[] | null;                // null = no las puede ver (no salen)
  repetidos: RepInf[] | null;
  horas: HorasPersona[] | null;                // null = sin horas (encargados o sin Personal)
  urlFoto: (ruta: string) => Promise<string | null>;
  progreso?: (t: string, p: number) => void;
}

export async function pdfSemanal(D: DatosSemana): Promise<Blob> {
  const P = await nuevoPDF(); const { doc, M, W, s, tabla, titulo, frase } = P;
  const X = cuentas(D.trabajos);
  P.cabecera('Informe semanal de limpieza', `${D.unidad}  ·  Semana ${numSemana(D.desde)}  ·  del ${fDMA(D.desde)} al ${fDMA(D.hasta)}`);
  const kp: [string, string, boolean?][] = [['Trabajos', String(X.total)], ['Hechos', String(X.hechos.length)], ['Cumplimiento', `${pct(X.hechos.length, X.total)} %`],
    ['Con problema', String(X.conProblema.length), X.conProblema.length > 0], ['Sin hacer', String(X.sinHacer.length), X.sinHacer.length > 0],
    ['Tiempo trabajado', durTxt(X.min) || '0 min'], ['Checklists con algo mal', String(X.mal), X.mal > 0]];
  if (D.incidencias) kp.push(['Incidencias', String(D.incidencias.length)]);
  P.cajas(kp);

  titulo('Por persona');
  tabla(['Persona', 'Trabajos', 'Hechos', 'Con problema', 'Tiempo total', 'Tiempo medio real'],
    X.porPersona.map((p) => [p.nombre, p.t, p.h, p.prob, durTxt(p.min) || '-', p.nm ? durTxt(p.minReal / p.nm) : '-']));

  if (D.horas) {
    titulo('Horas de la semana');
    tabla(['Persona', 'Jornada', 'Horas trabajadas', 'Extra a mano', 'Fuera de presupuesto', 'Por sustitución', 'Bolsa de la semana (h)'],
      D.horas.map((h) => [h.nombre, h.jornada, dec(h.horas), dec(h.extra), dec(h.fuera), dec(h.sust), h.bolsa == null ? '—' : dec(h.bolsa)]));
    const L = D.horas.flatMap((h) => h.detalle.filter((d) => d.fuera > 0 || d.extra > 0 || d.sust > 0).map((d) => [fCorta(d.fecha), h.nombre, dec(d.fuera), dec(d.extra), dec(d.sust),
      [d.sust ? `Sustituye a ${d.aQuien}` : '', d.nota ?? ''].filter(Boolean).join(' · '),
      D.trabajos.filter((t) => t.fecha === d.fecha && t.estado === 'hecho' && t.hecho_por === h.persona_id).map((t) => t.titulo + (t.minutos != null ? ` (${durTxt(t.minutos)})` : '')).join(' · ') || '—']))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (L.length) {
      titulo('Horas fuera de presupuesto, extra y por sustitución, con motivo y trabajos');
      tabla(['Día', 'Persona', 'Fuera (h)', 'Extra a mano (h)', 'Por sustitución (h)', 'Motivo', 'Trabajos hechos ese día'], L);
    } else frase('Esta semana no hay horas fuera de presupuesto, extra a mano ni por sustitución.');
  }

  titulo('Por día');
  tabla(['Día', 'Trabajos', 'Hechos', 'Cumplimiento'], X.porDia.map((d) => [fCorta(d.fecha), d.t, d.h, `${pct(d.h, d.t)} %`]));
  if (X.fijas.length) {
    titulo('Tareas fijas');
    tabla(['Tarea', 'Veces', 'Hechas', 'Tiempo previsto', 'Tiempo medio real'], X.fijas.map((f) => [f.titulo, f.n, f.h, f.est ? durTxt(f.est) : '-', f.media != null ? durTxt(f.media) : '-']));
  }
  const malos = [...X.conProblema, ...X.sinHacer.filter((t) => !t.problema)].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (malos.length) {
    titulo('Con problema o sin hacer');
    tabla(['Día', 'Trabajo', 'Quién', 'Estado', 'Problema / nota'], malos.map((t) => [fCorta(t.fecha), t.titulo, quienDe(t).join(', '), estadoTxt(t),
      [t.problema, t.nota].filter(Boolean).join(' · ')]), { columnStyles: { 4: { cellWidth: 60 } } });
  }
  if (D.repetidos?.length) {
    titulo('Problemas que se repiten');
    tabla(['Problema', 'Veces', 'Dónde', 'Última vez', 'Avisado por'], D.repetidos.map((r) => [r.tema, r.veces, r.lugar ?? '-', fCorta(r.ultima), r.quien.join(', ')]),
      { columnStyles: { 2: { cellWidth: 50 } } });
  }
  if (D.incidencias) {
    titulo(`Incidencias (${D.incidencias.length})`);
    if (!D.incidencias.length) frase('No hubo ninguna esta semana.');
    let ni = 0;
    for (const o of D.incidencias) {
      ni++; D.progreso?.(`Preparando incidencia ${ni} de ${D.incidencias.length}…`, 20 + (60 * ni) / D.incidencias.length);
      if (s.y > (o.fotos.length ? 195 : 250)) { doc.addPage(); s.y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const tl = doc.splitTextToSize(txt((o.urgente ? '[URGENTE] ' : '') + (o.tema ? `${o.tema}: ` : '') + o.texto), W - 2 * M); doc.text(tl, M, s.y); s.y += tl.length * 4.6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
      const info = [fCorta(o.creado.slice(0, 10)) + ' ' + hora(o.creado), o.lugar ? `Dónde: ${o.lugar}` : null, `Abierta por: ${o.quien ?? '-'}`,
        `Estado: ${INC_ESTADO[o.estado] ?? o.estado}`].filter(Boolean).join('   ·   ');
      const il = doc.splitTextToSize(txt(info), W - 2 * M); doc.text(il, M, s.y); s.y += il.length * 4 + 1.5; doc.setTextColor(0);
      const fw = (W - 2 * M - 6) / 2; let col = 0, alto = 0, faltan = 0;
      for (const ruta of o.fotos) {
        const u = await D.urlFoto(ruta); const im = u ? await achica(u, 900, 0.62) : null;
        if (!im) { faltan++; continue; }
        let w = fw, h = (w * im.h) / im.w; if (h > 70) { h = 70; w = (h * im.w) / im.h; }
        if (col === 0 && s.y + h > 285) { doc.addPage(); s.y = 18; }
        doc.addImage(im.src, 'JPEG', M + col * (fw + 6) + (fw - w) / 2, s.y, w, h); alto = Math.max(alto, h); col++;
        if (col === 2) { col = 0; s.y += alto + 4; alto = 0; }
      }
      if (col) s.y += alto + 4;
      if (faltan) { doc.setFontSize(8); doc.setTextColor(...GRIS); doc.text(`${faltan} foto(s) que no se han podido poner.`, M, s.y); doc.setTextColor(0); s.y += 5; }
      doc.setDrawColor(214, 222, 230); doc.line(M, s.y, W - M, s.y); s.y += 6;
    }
  }
  doc.addPage(); s.y = 18; titulo('Detalle de todos los trabajos');
  tabla(['Día', 'Trabajo', 'Quién', 'Estado', 'Empezó', 'Terminó', 'Tiempo'],
    [...D.trabajos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es'))
      .map((t) => [fCorta(t.fecha), t.titulo + (dondeTxt(t) ? ` (${dondeTxt(t)})` : ''), quienDe(t).join(', '), estadoTxt(t), hora(t.inicio), hora(t.fin), durTxt(t.minutos)]),
    { columnStyles: { 1: { cellWidth: 55 } } });
  P.pie(D.quien, D.unidad);
  return doc.output('blob');
}

// ---------- Excel ----------
const filaTrabajo = (t: TrabInf): Celda[] => [t.fecha, t.titulo, dondeTxt(t), quienDe(t).join(', '), estadoTxt(t), hora(t.inicio), hora(t.fin),
  t.minutos ?? null, tiempoReal(t) ? 'Sí' : t.estado === 'hecho' ? 'No (el previsto)' : '', t.minutos_est ?? null, t.urgente ? 'Sí' : '', origenTxt(t),
  t.checklist_puntos ? `${t.checklist_mal} mal de ${t.checklist_puntos}` : '', t.fotos, t.problema ?? '', t.nota ?? '', t.descripcion ?? ''];
const CAB_TRABAJO = ['Fecha', 'Trabajo', 'Dónde', 'Quién', 'Estado', 'Empezó', 'Terminó', 'Minutos', '¿Tiempo real?', 'Minutos previstos', 'Urgente', 'Origen',
  'Checklist', 'Fotos', 'Problema', 'Nota', 'Descripción'];
const ANCHO_TRABAJO = [11, 32, 18, 24, 14, 8, 8, 9, 14, 10, 8, 12, 14, 6, 30, 30, 30];

export async function excelSemanal(D: DatosSemana): Promise<Blob> {
  const X = cuentas(D.trabajos);
  const res: Celda[][] = [[neg(`Informe semanal de limpieza - ${D.unidad}`)], [`Semana ${numSemana(D.desde)}, del ${fDMA(D.desde)} al ${fDMA(D.hasta)}`], [],
    ['Trabajos', X.total], ['Hechos', X.hechos.length], ['Cumplimiento', { value: X.total ? X.hechos.length / X.total : 0, format: '0%' }],
    ['Con problema', X.conProblema.length], ['Sin hacer', X.sinHacer.length], ['Minutos trabajados', X.min], ['Checklists con algo mal', X.mal],
    ...(D.incidencias ? [['Incidencias', D.incidencias.length]] : []), [],
    cab(['Persona', 'Trabajos', 'Hechos', 'Con problema', 'Minutos totales', 'Minutos de media (real)']),
    ...X.porPersona.map((p) => [p.nombre, p.t, p.h, p.prob, p.min, p.nm ? Math.round(p.minReal / p.nm) : null])];
  const hojas = [{ nombre: 'Resumen', filas: res, anchos: [34, 12, 10, 12, 16, 20] },
    { nombre: 'Trabajos', filas: [cab(CAB_TRABAJO), ...[...D.trabajos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es')).map(filaTrabajo)], anchos: ANCHO_TRABAJO }];
  if (D.incidencias) hojas.push({ nombre: 'Incidencias', anchos: [16, 14, 40, 20, 8, 12, 22, 6],
    filas: [cab(['Fecha', 'Tema', 'Qué pasa', 'Dónde', 'Urgente', 'Estado', 'Abierta por', 'Fotos']),
      ...D.incidencias.map((o) => [o.creado.slice(0, 16).replace('T', ' '), o.tema ?? '', o.texto, o.lugar ?? '', o.urgente ? 'Sí' : '', INC_ESTADO[o.estado] ?? o.estado, o.quien ?? '', o.fotos.length])] });
  if (D.repetidos) hojas.push({ nombre: 'Repetidos', anchos: [24, 7, 30, 12, 30, 80],
    filas: [cab(['Problema', 'Veces', 'Dónde', 'Última vez', 'Avisado por', 'Avisos']),
      ...(D.repetidos.length ? D.repetidos.map((r) => [r.tema, r.veces, r.lugar ?? '', r.ultima, r.quien.join(', '), r.casos.join(' | ')]) : [['Nada repetido']])] });
  if (D.horas) hojas.push({ nombre: 'Horas', anchos: [24, 11, 14, 12, 18, 14, 18], filas: [cab(['Persona', 'Jornada', 'Horas trabajadas', 'Extra a mano', 'Fuera de presupuesto', 'Por sustitución', 'Bolsa de la semana (h)']),
    ...D.horas.map((h) => [h.nombre, h.jornada, h.horas, h.extra, h.fuera, h.sust, h.bolsa])] });
  return libro(hojas);
}

// =====================================================================================
// Informe por operario
// =====================================================================================
export interface DatosOperarios {
  unidad: string; quien: string; desde: string; hasta: string; periodo: string; conFinde: boolean;
  personas: PersonaInf[]; trabajos: TrabInf[]; horas: HorasPersona[] | null; hoy: string;
}
/** Lo de una persona: lo que hizo y lo que tenía y no se hizo (de los días ya pasados). */
export function deOperario(p: PersonaInf, D: Pick<DatosOperarios, 'trabajos' | 'conFinde' | 'hoy'>) {
  const vale = (t: TrabInf) => D.conFinde || !esFinde(t.fecha);
  const hechos = D.trabajos.filter((t) => vale(t) && t.estado === 'hecho' && (t.hecho_por === p.id || (!t.hecho_por && t.asignados.includes(p.id))))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const noHechos = D.trabajos.filter((t) => vale(t) && t.estado !== 'hecho' && t.fecha < D.hoy && t.asignados.includes(p.id)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const est = hechos.reduce((s, t) => s + (t.minutos_est ?? 0), 0), real = hechos.reduce((s, t) => s + (t.minutos ?? 0), 0);
  const dias = new Map<string, { n: number; est: number; real: number }>();
  hechos.forEach((t) => { const d = dias.get(t.fecha) ?? { n: 0, est: 0, real: 0 }; d.n++; d.est += t.minutos_est ?? 0; d.real += t.minutos ?? 0; dias.set(t.fecha, d); });
  return { hechos, noHechos, est, real, sinEst: hechos.filter((t) => !t.minutos_est).length, dias: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)) };
}

export async function pdfOperarios(D: DatosOperarios): Promise<Blob> {
  const P = await nuevoPDF(); const { doc, tabla, titulo, frase } = P;
  D.personas.forEach((p, i) => {
    if (i > 0) doc.addPage();
    const O = deOperario(p, D);
    P.cabecera(`Informe por operario · ${p.nombre}`, `${D.unidad}  ·  ${D.periodo}${D.conFinde ? '' : '  ·  sin fin de semana'}`);
    const H = D.horas?.find((h) => h.persona_id === p.id);
    const kp: [string, string, boolean?][] = [['Trabajos hechos', String(O.hechos.length)], ['Tiempo previsto', durTxt(O.est) || '0 min'],
      ['Tiempo real', durTxt(O.real) || '0 min'], ['No hechos', String(O.noHechos.length), O.noHechos.length > 0]];
    if (H) kp.push(['Días trabajados', String(H.diasTrab)], ['Horas trabajadas', dec(H.horas)], ['Fuera de presupuesto (h)', dec(H.fuera), H.fuera > 0], ['Por sustitución (h)', dec(H.sust)]);
    P.cajas(kp);
    if (O.sinEst) frase(`${O.sinEst} trabajo(s) sin tiempo previsto.`);
    if (H) {
      titulo('Horas');
      tabla(['Jornada', 'Días trabajados', 'Horas', 'Entre semana', 'Fin de semana', 'Extra a mano', 'Fuera de presupuesto', 'Por sustitución', 'Faltas'],
        [[H.jornada, H.diasTrab, dec(H.horas), dec(H.entreSemana), dec(H.finde), dec(H.extra), dec(H.fuera), dec(H.sust),
          [H.baja && `${H.baja} baja`, H.vacaciones && `${H.vacaciones} vacaciones`, H.permiso && `${H.permiso} permiso`, H.otra && `${H.otra} otra`].filter(Boolean).join(', ') || '—']]);
      titulo('Horas día a día');
      tabla(['Día', 'Calendario', 'Previstas', 'Horas', 'Fuera', 'Extra', 'Sustitución', 'Falta', 'Motivo'],
        H.detalle.filter((d) => D.conFinde || !esFinde(d.fecha)).map((d) => [fCorta(d.fecha), d.tipo, dec(d.prevista), dec(d.horas), d.fuera ? dec(d.fuera) : '', d.extra ? dec(d.extra) : '',
          d.sust ? `${dec(d.sust)} (${d.aQuien})` : '', d.falta ? FALTA_TXT[d.falta] ?? d.falta : '', d.nota ?? '']), { styles: { fontSize: 7.5, cellPadding: 1.2 } });
    }
    titulo('Cada día');
    if (O.dias.length) tabla(['Día', 'Trabajos', 'Tiempo previsto', 'Tiempo real'], O.dias.map(([f, d]) => [fCorta(f), d.n, durTxt(d.est) || '0 min', durTxt(d.real) || '0 min']));
    else frase('No hizo ningún trabajo en este periodo.');
    if (O.hechos.length) {
      titulo('Trabajos hechos');
      tabla(['Fecha', 'Trabajo', 'Dónde', 'Previsto', 'Real', 'Empezó', 'Terminó', 'Checklist'], O.hechos.map((t) => [fDM(t.fecha), t.titulo, dondeTxt(t), t.minutos_est ? durTxt(t.minutos_est) : '—',
        tiempoReal(t) ? durTxt(t.minutos) : `${durTxt(t.minutos)} (previsto)`, hora(t.inicio), hora(t.fin), t.checklist_puntos ? (t.checklist_mal ? `${t.checklist_mal} mal` : 'Bien') : '—']),
        { columnStyles: { 1: { cellWidth: 45 } } });
    }
    if (O.noHechos.length) {
      titulo('Trabajos que no se hicieron');
      tabla(['Fecha', 'Trabajo', 'Estado', 'Problema / nota'], O.noHechos.map((t) => [fDM(t.fecha), t.titulo, estadoTxt(t), [t.problema, t.nota].filter(Boolean).join(' · ')]), {}, ROJO);
    }
  });
  P.pie(D.quien, D.unidad);
  return doc.output('blob');
}

export async function excelOperarios(D: DatosOperarios): Promise<Blob> {
  const filas = D.personas.map((p) => ({ p, O: deOperario(p, D), H: D.horas?.find((h) => h.persona_id === p.id) ?? null }));
  const conH = !!D.horas;
  const resumen: Celda[][] = [[neg(`Informe por operario - ${D.unidad}`)], [D.periodo + (D.conFinde ? '' : ' (sin fin de semana)')], [],
    cab(['Persona', 'Trabajos hechos', 'Minutos previstos', 'Minutos reales', 'No hechos',
      ...(conH ? ['Días trabajados', 'Horas trabajadas', 'Horas entre semana', 'Horas fin de semana', 'Extra a mano', 'Fuera de presupuesto', 'Por sustitución',
        'Días de baja', 'Días de vacaciones', 'Días de permiso', 'Días de otra falta'] : [])]),
    ...filas.map(({ p, O, H }) => [p.nombre, O.hechos.length, O.est, O.real, O.noHechos.length,
      ...(conH ? (H ? [H.diasTrab, H.horas, H.entreSemana, H.finde, H.extra, H.fuera, H.sust, H.baja, H.vacaciones, H.permiso, H.otra] : Array(11).fill(null)) : [])])];
  const hojas = [{ nombre: 'Resumen', filas: resumen, anchos: [26, 12, 12, 12, 10, ...(conH ? Array(11).fill(13) : [])] },
    { nombre: 'Trabajos', anchos: [24, ...ANCHO_TRABAJO], filas: [cab(['Persona', ...CAB_TRABAJO]),
      ...filas.flatMap(({ p, O }) => [...O.hechos, ...O.noHechos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((t) => [p.nombre, ...filaTrabajo(t)]))] }];
  if (conH) hojas.push({ nombre: 'Horas día a día', anchos: [24, 11, 14, 10, 10, 10, 10, 14, 22, 14, 30],
    filas: [cab(['Persona', 'Fecha', 'Calendario', 'Previstas', 'Horas', 'Fuera de presupuesto', 'Extra a mano', 'Por sustitución', 'Sustituye a', 'Falta', 'Motivo']),
      ...filas.flatMap(({ H }) => (H?.detalle ?? []).filter((d) => D.conFinde || !esFinde(d.fecha)).map((d) => [H!.nombre, d.fecha, d.tipo, d.prevista, d.horas, d.fuera, d.extra, d.sust,
        d.aQuien ?? '', d.falta ? FALTA_TXT[d.falta] ?? d.falta : '', d.nota ?? '']))] });
  return libro(hojas);
}
