// Entrega de información al trabajador (SH-CORP-SP-FP-022): el texto que lee y cómo se rellena el PDF.
// Copia de la app de ahora (toolbox), mismas posiciones sobre la plantilla oficial.
import { MESES } from './comun';

export const CODIGO_INFO = 'SH-CORP-SP-FP-022';
export const INFO_DOCS = [
  'Fichas de información de riesgos laborales para el trabajador, correspondientes a su puesto de trabajo.',
  'Manual de Seguridad (Handbook).',
  'Política de Calidad, Medio Ambiente, Seguridad y Salud Laboral y Responsabilidad Corporativa.',
  '¡Bienvenido a la gran familia de ISS!',
];
export const INFO_INTRO = 'En base a lo dispuesto en el artículo 18 de la Ley de Prevención de Riesgos Laborales (Ley 31/1995), se te entrega la siguiente información:';
export const INFO_COMPROMISO = 'Con la firma de este documento te comprometes a leer atentamente la información facilitada y, como consecuencia de ello, a cumplir con las obligaciones detalladas en el art. 29 de la Ley 31/1995 en materia de prevención.';

export interface DatosInfo { empresa?: string; lugar?: string; enlace?: string }
export interface DocInfo { nombre: string; dni: string | null; fecha: string; datos: DatosInfo; firma: string | null; firmado_en: string | null }

const fechaLarga = (d: string) => { const [y, m, dd] = d.split('-'); return `${+dd} de ${MESES[+m - 1].toLowerCase()} de ${y}`; };

/** Una o varias entregas de información en un solo PDF (una hoja FP-022 por trabajador). */
export async function pdfInfo(docs: DocInfo[], sello: string | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const r = await fetch(`${import.meta.env.BASE_URL}prevencion/plantillas/${CODIGO_INFO}.pdf`);
  if (!r.ok) throw new Error('No se encuentra la plantilla del FP-022');
  const plantilla = await r.arrayBuffer();
  const salida = await PDFDocument.create();
  for (const d of docs) {
    const doc = await PDFDocument.load(plantilla);
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.getPage(0), H = pg.getHeight(), ink = rgb(0.05, 0.1, 0.3);
    type F = typeof font;
    const fit = (t: unknown, size: number, f: F, maxW: number) => { let s = String(t ?? ''); while (s && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1); return s; };
    const txt = (t: unknown, X: number, yb: number, size = 9, f: F = font, maxW = 400) => { const s = fit(t, size, f, maxW); if (s) pg.drawText(s, { x: X, y: H - yb, size, font: f, color: ink }); };
    const ctr = (t: unknown, x0: number, x1: number, y0: number, y1: number, size = 8, f: F = font) => {
      const s = fit(t, size, f, x1 - x0 - 2); if (!s) return; const w = f.widthOfTextAtSize(s, size);
      pg.drawText(s, { x: (x0 + x1) / 2 - w / 2, y: H - ((y0 + y1) / 2 + size * 0.35), size, font: f, color: ink });
    };
    const img = async (u: string | null, x0: number, y0: number, x1: number, y1: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
      const im = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b);
      const w = x1 - x0, h = y1 - y0, k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - y1 + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    txt(d.datos.empresa ?? '', 142, 140, 10, bold, 370);
    ctr(d.nombre, 86, 304.5, 515.5, 560, 10, bold); ctr(d.dni ?? '', 304.5, 418, 515.5, 560, 10, bold);
    await img(d.firma, 421, 518, 529, 566);
    if (d.firmado_en) pg.drawText(`Firmado digitalmente ${new Date(d.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`,
      { x: 421, y: H - 570, size: 5, font, color: rgb(0.45, 0.45, 0.45) });
    await img(sello, 192, 635, 404, 686);
    pg.drawRectangle({ x: 84, y: H - 776, width: 428, height: 19, color: rgb(1, 1, 1) });
    txt(`En ${d.datos.lugar || '…………'}, a ${fechaLarga(d.fecha)}`, 86, 770, 11, font, 420);
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
