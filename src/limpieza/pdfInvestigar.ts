// PDF y Excel de «Investigar» y de la ficha de un sitio (como la app vieja). Se carga solo al pulsar el botón.
import { fDMA, fCorta, hora, tiempoReal } from './informe';
import { cab, libro, neg, nuevoPDF, type Celda } from './pdfInforme';
import { fraseSitio, horasTxt, minutosDe, pctN, type Ajustes, type Investigacion, type ProblemaInf, type Repetido } from './investigar';

const h1 = (m: number) => Math.round((m || 0) / 6) / 10;   // horas con un decimal

export async function pdfInvestigar(X: Investigacion, unidad: string, quien: string, d0: string, d1: string, aj: Ajustes): Promise<Blob> {
  const P = await nuevoPDF(); const { doc, M, W, s, tabla, titulo } = P;
  const texto = (t: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const L = doc.splitTextToSize(t, W - 2 * M); if (s.y + L.length * 5 > 280) { doc.addPage(); s.y = 18; }
    doc.text(L, M, s.y + 2); s.y += L.length * 5 + 4;
  };
  const T = X.tot;
  P.cabecera('Investigación de Limpieza', `${unidad}  ·  ${fDMA(d0)} al ${fDMA(d1)}`);
  texto(`Horas de jornada del equipo: ${horasTxt(T.jor)}. En trabajos: ${horasTxt(T.min)}. Desplazamiento y preparación entre trabajos: ${horasTxt(T.desp)}. `
    + `Sin justificar: ${horasTxt(T.sin)}.${T.jor ? ` Saturación: ${pctN(T.cont, T.jor)} %.` : ''} Tiempo empleado en problemas: ${horasTxt(T.prob)} en ${T.np} avisos.`);
  titulo('Saturación de cada trabajador');
  tabla(['Persona', 'Jornada', 'En trabajos', 'Desplaz. y preparación', 'Sin justificar', 'Saturación', 'En problemas', 'Trabajos'],
    X.sat.map((p) => [p.n, horasTxt(p.jor), horasTxt(p.min), horasTxt(p.desp), horasTxt(p.sin), p.jor ? `${pctN(p.cont, p.jor)} %` : '—', horasTxt(p.prob), p.nt]));
  texto(`Saturación = (tiempo en trabajos + desplazamiento y preparación) / horas de jornada, día a día y sin pasar nunca de la jornada del día. `
    + `Los trabajos sin tiempo real cuentan con su tiempo previsto. Desplazamiento y preparación: huecos de hasta ${aj.hueco} min entre un trabajo y el siguiente de la misma persona.`);
  if (T.sinNada.length) texto(`Sin ningún trabajo apuntado a su nombre: ${T.sinNada.map((p) => p.n).join(', ')} (${horasTxt(T.sinNada.reduce((a, p) => a + p.jor, 0))} de jornada). `
    + `Saturación de quien sí apunta sus trabajos: ${T.jorAp ? `${pctN(T.contAp, T.jorAp)} %` : '—'}.`);
  if (X.raros.length) { titulo('Tiempos que no cuadran (ajustados)'); tabla(['Día', 'Persona', 'Qué', 'Tiempo', 'Por qué'], X.raros.slice(0, 40).map((r) => [fDMA(r.f), r.n, r.t, horasTxt(r.min), r.motivo])); }
  if (X.tipos.length) {
    titulo('Tiempo perdido en problemas');
    tabla(['Problema', 'Veces', 'Tiempo', 'Media por vez', 'Sitios distintos', 'Periodo anterior'], X.tipos.map((t) => [t.tema, t.n, horasTxt(t.min), t.n ? horasTxt(t.min / t.n) : '—', t.sitios, t.ant]));
  }
  const hoy = new Date().toLocaleDateString('sv-SE');
  if (X.rep.length) {
    titulo('Máquinas y zonas donde se repite');
    tabla(['Sitio', 'Problema', 'Veces', 'Tiempo', 'Cada (días)', 'Primera', 'Última', 'Sigue'], X.rep.map((g) => [g.sitio, g.tema, g.n, horasTxt(g.min),
      g.cada != null ? String(Math.round(g.cada * 10) / 10).replace('.', ',') : '—', fDMA(g.pri), fDMA(g.ult), g.sigue ? 'Sí' : 'No']));
    X.rep.slice(0, 5).forEach((g) => texto(`· ${fraseSitio(g, hoy)}`));
  }
  if (X.trab.length) {
    titulo('En qué se va el tiempo (los 15 que más)');
    tabla(['Trabajo', 'Veces', 'Tiempo', 'Media', 'Máximo'], X.trab.slice(0, 15).map((t) => [t.t + (t.prob ? ' (problema)' : ''), t.n, horasTxt(t.min), horasTxt(t.min / t.n), horasTxt(t.max)]));
  }
  P.pie(quien, unidad);
  return doc.output('blob');
}

export async function excelInvestigar(X: Investigacion, problemas: ProblemaInf[]): Promise<Blob> {
  const pr = new Map(problemas.map((p) => [p.id, p]));
  const hoja = (nombre: string, cabecera: string[], filas: Celda[][], anchos: number[]) =>
    ({ nombre, filas: [cab(cabecera), ...(filas.length ? filas : [['Nada en este periodo']])], anchos });
  return libro([
    hoja('Saturación', ['Persona', 'Jornada (h)', 'En trabajos (h)', 'Desplazamiento y preparación (h)', 'Sin justificar (h)', 'Saturación (%)', 'En problemas (h)',
      'Planificado (h)', 'Otros (h)', 'Trabajos', 'Con tiempo real', 'Días con jornada'],
      X.sat.map((p) => [p.n, h1(p.jor), h1(p.min), h1(p.desp), h1(p.sin), pctN(p.cont, p.jor), h1(p.prob), h1(p.plan), h1(p.otros), p.nt, p.real, p.dias]),
      [24, 11, 14, 18, 14, 12, 14, 13, 10, 9, 13, 14]),
    hoja('No cuadran', ['Día', 'Persona', 'Qué', 'Minutos', 'Por qué'], X.raros.map((r) => [r.f, r.n, r.t, Math.round(r.min), r.motivo]), [11, 22, 28, 9, 60]),
    hoja('Problemas', ['Problema', 'Veces', 'Tiempo (h)', 'Media (min)', 'Sitios', 'Periodo anterior'],
      X.tipos.map((t) => [t.tema, t.n, h1(t.min), t.n ? Math.round(t.min / t.n) : null, t.sitios, t.ant]), [24, 8, 11, 11, 8, 15]),
    hoja('Repetidos', ['Sitio', 'Problema', 'Veces', 'Tiempo (h)', 'Cada (días)', 'Primera', 'Última', 'Sigue pasando', 'Periodo anterior'],
      X.rep.map((g) => [g.sitio, g.tema, g.n, h1(g.min), g.cada != null ? Math.round(g.cada * 10) / 10 : null, g.pri, g.ult, g.sigue ? 'Sí' : 'No', g.ant]),
      [22, 18, 7, 10, 10, 11, 11, 12, 14]),
    hoja('Avisos de problemas', ['Fecha', 'Hora', 'Sitio', 'Problema', 'Trabajo', 'Descripción', 'Quién lo atendió', 'Estado', 'Minutos', 'Tiempo real'],
      X.P.map((o) => [o.fecha, hora(o.inicio), pr.get(o.id)?.sitio ?? '', pr.get(o.id)?.tema ?? '', o.titulo, o.descripcion ?? '', o.hecho_por_nombre ?? '', o.estado,
        o.estado === 'hecho' ? Math.round(minutosDe(o, X)) : null, tiempoReal(o) ? 'Sí' : 'Previsto']), [11, 7, 18, 16, 28, 30, 20, 10, 8, 10]),
    hoja('Trabajos', ['Trabajo', 'Tipo', 'Veces', 'Tiempo (h)', 'Media (min)', 'Máximo (min)'],
      X.trab.map((t) => [t.t, t.prob ? 'Problema' : t.plan ? 'Fija' : 'Otro', t.n, h1(t.min), Math.round(t.min / t.n), Math.round(t.max)]), [32, 10, 7, 10, 11, 12]),
  ]);
}

export async function pdfSitio(g: Repetido, X: Investigacion, unidad: string, quien: string, d0: string, d1: string): Promise<Blob> {
  const P = await nuevoPDF(); const { doc, M, W, s, tabla } = P;
  P.cabecera(`${g.sitio} · ${g.tema}`, `${unidad}  ·  repeticiones  ·  ${fDMA(d0)} al ${fDMA(d1)}`);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  const L = doc.splitTextToSize(fraseSitio(g, new Date().toLocaleDateString('sv-SE')), W - 2 * M); doc.text(L, M, s.y); s.y += L.length * 5 + 4;
  tabla(['Fecha', 'Qué', 'Descripción', 'Quién', 'Tiempo', 'Fotos'], g.L.map((o) => [fCorta(o.fecha), o.titulo, o.descripcion ?? '',
    o.hecho_por_nombre ?? o.asignados_nombres.join(', '), o.estado === 'hecho' ? horasTxt(minutosDe(o, X)) + (tiempoReal(o) ? '' : ' (prev.)') : 'Sin hacer', o.fotos || '']),
    { columnStyles: { 0: { cellWidth: 20 }, 4: { cellWidth: 20 }, 5: { cellWidth: 12 } } });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Cada fila es un trabajo apuntado en la app de Limpieza. Las fotos están guardadas en cada trabajo.', M, s.y);
  P.pie(quien, unidad);
  return doc.output('blob');
}

export async function excelLista(titulo: string, filas: { o: Parameters<typeof minutosDe>[0]; sitio: string }[], X: Investigacion): Promise<Blob> {
  return libro([{ nombre: 'Trabajos', anchos: [11, 30, 30, 18, 22, 10, 8, 11, 6], filas: [[neg(titulo)], [],
    cab(['Fecha', 'Trabajo', 'Descripción', 'Dónde', 'Quién', 'Estado', 'Minutos', 'Tiempo real', 'Fotos']),
    ...filas.map(({ o, sitio }) => [o.fecha, o.titulo, o.descripcion ?? '', sitio, o.hecho_por_nombre ?? o.asignados_nombres.join(', '), o.estado,
      o.estado === 'hecho' ? Math.round(minutosDe(o, X)) : null, tiempoReal(o) ? 'Sí' : 'Previsto', o.fotos])] }]);
}
