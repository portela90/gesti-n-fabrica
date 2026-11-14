// EPI de uso colectivo para trabajos en altura (SH-CORP-SP-FO-072): equipos de la hoja oficial y cómo se rellena el PDF.
// Copia de la app de ahora (toolbox). Hasta 4 entregas del mismo trabajador por hoja (Día / Hora / Firma).
import { fechaCorta } from './comun';

export const CODIGO_COL = 'SH-CORP-SP-FO-072';
/** [clave, texto, y0, y1] */
export const COL_ITEMS: [string, string, number, number][] = [
  ['arnes', 'Arnés de seguridad anticaída (EN 361; EN 354)', 137.5, 165],
  ['amarre_simple', 'Cuerda amarre simple + absorbedor (EN 355, EN 362)', 165, 196],
  ['mosqueton', 'Mosquetón (EN 362; EN 354)', 196, 226.5],
  ['amarre_y', 'Cuerda amarre "Y" + absorbedor A85 (EN 355; EN 362)', 226.5, 259],
  ['regulable', 'Cuerda simple regulable + absorbedor (EN 355; EN 362)', 259, 292],
  ['retractil', 'Anticaídas retráctil de reposición automática (EN 360)', 292, 331],
  ['movil', 'Dispositivo anticaídas móvil (EN 353-2)', 331, 375.5],
  ['rocker', 'Anticaídas Rocker (EN 353-2; EN 358; EN 12841-A)', 375.5, 413.5],
  ['cintas', 'Cintas de anclaje (EN 795B - EN 354)', 413.5, 447.5],
];
export const COL_DECL = [
  'Ha recibido el equipo arriba mencionado, habiéndolo revisado previo al uso. Este material es propiedad de la empresa, por lo que el trabajador lo recibe en depósito.',
  'En caso de pérdida, rotura o extravío deberá notificarlo inmediatamente a su responsable.',
  'Ha sido formado e informado y conoce el correcto uso y mantenimiento de los equipos de protección entregados.',
  'Se compromete a utilizarlos debidamente en la realización de las tareas que así los requieran.',
];
export interface DatosCol { items: Record<string, { serie?: string }>; otros?: string; hora?: string }
export const lineasCol = (x: DatosCol) => [
  ...COL_ITEMS.filter(([k]) => x.items?.[k]).map(([k, t]) => t + (x.items[k].serie ? ` · Nº serie ${x.items[k].serie}` : '')),
  ...(x.otros ? [x.otros] : []),
];
export interface DocCol { persona_id: string; nombre: string; dni: string | null; puesto: string | null; fecha: string; datos: DatosCol; firma: string | null }

/** Entregas de EPI de altura: se agrupan por trabajador, hasta 4 por hoja. */
export async function pdfCol(docs: DocCol[], sello: string | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const r = await fetch(`${import.meta.env.BASE_URL}prevencion/plantillas/${CODIGO_COL}.pdf`);
  if (!r.ok) throw new Error('No se encuentra la plantilla del FO-072');
  const plantilla = await r.arrayBuffer();
  const hojas: DocCol[][] = []; const porPersona: Record<string, DocCol[][]> = {};
  for (const d of [...docs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const g = (porPersona[d.persona_id] ??= []);
    if (!g.length || g[g.length - 1].length === 4) { const n: DocCol[] = []; g.push(n); hojas.push(n); }
    g[g.length - 1].push(d);
  }
  const salida = await PDFDocument.create();
  for (const lista of hojas) {
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
    const cache: Record<string, Awaited<ReturnType<typeof doc.embedPng>>> = {};
    const img = async (u: string | null, x0: number, y0: number, x1: number, y1: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      let im = cache[u];
      if (!im) { const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0)); im = cache[u] = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b); }
      const w = x1 - x0, h = y1 - y0, k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - y1 + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    const p0 = lista[0];
    txt(p0.nombre, 181, 99.8, 9, bold, 440); txt(p0.dni, 672, 99.8, 9, bold, 150); txt(p0.puesto, 147, 114.5, 9, bold, 300);
    for (let s = 0; s < lista.length; s++) {
      const e = lista[s], x = e.datos, off = 142 * s, its = x.items ?? {};
      for (const [k, , y0, y1] of COL_ITEMS) {
        const v = its[k]; if (!v) continue;
        if (v.serie) ctr(v.serie, 226, 264, y0, y1, 7);
        ctr(fechaCorta(e.fecha), 264 + off, 304 + off, y0, y1, 7.5, bold); ctr(x.hora ?? '', 304 + off, 343.5 + off, y0, y1, 7.5, bold);
        await img(e.firma, 345 + off, y0 + 1.5, 405 + off, y1 - 1.5);
      }
      if (x.otros) {
        txt(x.otros, 108, 465, 8, font, 115);
        ctr(fechaCorta(e.fecha), 264 + off, 304 + off, 447.5, 476, 7.5, bold); ctr(x.hora ?? '', 304 + off, 343.5 + off, 447.5, 476, 7.5, bold);
        await img(e.firma, 345 + off, 449, 405 + off, 474.5);
      }
    }
    await img(sello, 646, 512, 790, 590);
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
