// Autorización de uso de equipos de trabajo (maquinaria). No hay hoja oficial: el PDF se hace igual que en la app de ahora.
import { MESES, fechaCorta } from './comun';

export const CODIGO_AUT = 'AUTORIZ';
/** Equipos que se proponen (se pueden escribir otros). */
export const MAQUINAS = ['Carretilla elevadora', 'Plataforma elevadora móvil de personal (PEMP)', 'Puente grúa', 'Grúa autocargante', 'Transpaleta eléctrica',
  'Apilador eléctrico', 'Barredora / fregadora con conductor', 'Hidrolimpiadora de alta presión', 'Escalera / andamio móvil'];
export const AUT_TXT = [
  'Ha recibido la formación e información adecuadas sobre los riesgos derivados de su utilización y las medidas preventivas a adoptar.',
  'Utilizará los equipos conforme a las instrucciones del fabricante, las normas de seguridad del centro y solo para las tareas para las que han sido diseñados.',
  'Revisará el equipo antes de cada uso y comunicará de inmediato a su responsable cualquier anomalía o deterioro, sin utilizarlo hasta su reparación.',
  'Esta autorización es personal e intransferible y podrá ser revocada por la empresa en cualquier momento.',
];
export interface DatosAut { empresa?: string; centro?: string; hasta?: string; autoriza?: string; obs?: string; maquinas: string[]; lugar?: string }
export interface DocAut { nombre: string; dni: string | null; puesto: string | null; fecha: string; datos: DatosAut; firma: string | null; firmado_en: string | null }

const fechaLarga = (d: string) => { const [y, m, dd] = d.split('-'); return `${+dd} de ${MESES[+m - 1].toLowerCase()} de ${y}`; };

export async function pdfAutorizacion(docs: DocAut[], sello: string | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const salida = await PDFDocument.create();
  for (const d of docs) {
    const x = d.datos;
    const doc = await PDFDocument.create(); const pg = doc.addPage([595.28, 841.89]); const H = 841.89, L = 60, R = 535;
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const NAVY = rgb(0.09, 0.13, 0.35), INK = rgb(0.1, 0.1, 0.1);
    type F = typeof font;
    const partir = (s: string, size: number, f: F, max: number) => { const out: string[] = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; };
    let y = 70;
    const par = (s: string, size = 10.5, f: F = font, c = INK, ind = 0) => { for (const l of partir(s, size, f, R - L - ind)) { pg.drawText(l, { x: L + ind, y: H - y, size, font: f, color: c }); y += size * 1.45; } };
    pg.drawRectangle({ x: 0, y: H - 50, width: 595.28, height: 50, color: NAVY });
    pg.drawText('AUTORIZACIÓN DE USO DE EQUIPOS DE TRABAJO', { x: L, y: H - 32, size: 15, font: bold, color: rgb(1, 1, 1) });
    y = 85; par('Real Decreto 1215/1997 y Ley 31/1995 de Prevención de Riesgos Laborales', 9, font, rgb(0.4, 0.4, 0.4)); y += 12;
    const fila = (k: string, v: string | null | undefined) => { pg.drawText(k, { x: L, y: H - y, size: 10, font: bold, color: INK }); pg.drawText(String(v || '—'), { x: L + 120, y: H - y, size: 10.5, font, color: INK }); y += 17; };
    fila('Empresa:', x.empresa); fila('Centro:', x.centro); fila('Trabajador/a:', d.nombre); fila('DNI / NIE:', d.dni); fila('Puesto:', d.puesto); y += 10;
    par(`La empresa AUTORIZA al trabajador/a arriba indicado a utilizar los siguientes equipos de trabajo${x.hasta ? `, con validez hasta el ${fechaCorta(x.hasta)}` : ''}:`); y += 4;
    for (const m of x.maquinas ?? []) { pg.drawText('•', { x: L + 8, y: H - y, size: 11, font: bold, color: NAVY }); par(m, 10.5, bold, INK, 22); }
    if (x.obs) { y += 4; par(`Observaciones / limitaciones: ${x.obs}`, 10); }
    y += 10; par('El trabajador/a declara y se compromete a que:', 10.5, bold);
    AUT_TXT.forEach((t, i) => { pg.drawText(`${i + 1}.`, { x: L + 4, y: H - y, size: 10, font: bold, color: INK }); par(t, 10, font, INK, 20); y += 2; });
    y += 14; par(`En ${x.lugar || '…………'}, a ${fechaLarga(d.fecha)}`, 10.5);
    const yb = Math.max(y + 20, 620);
    const caja = (x0: number, t1: string, t2: string) => {
      pg.drawText(t1, { x: x0, y: H - yb, size: 9.5, font: bold, color: INK });
      if (t2) pg.drawText(t2, { x: x0, y: H - yb - 12, size: 8.5, font, color: rgb(0.35, 0.35, 0.35) });
      pg.drawRectangle({ x: x0, y: H - yb - 100, width: 210, height: 80, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.8 });
    };
    caja(L, 'Por la empresa', x.autoriza ?? ''); caja(R - 210, 'El trabajador/a', d.nombre);
    const img = async (u: string | null, x0: number, y0: number, w: number, h: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
      const im = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b); const k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - y0 - h + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    await img(sello, L + 5, yb + 22, 200, 74);
    await img(d.firma, R - 205, yb + 22, 200, 74);
    if (d.firmado_en) pg.drawText(`Firmado digitalmente ${new Date(d.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`,
      { x: R - 210, y: H - yb - 110, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
