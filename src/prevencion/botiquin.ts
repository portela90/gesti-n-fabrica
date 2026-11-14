// Revisión del botiquín (SH-CORP-SP-FO-018): material, comprobaciones y cómo se rellena el PDF.
// Copia de la app de ahora (toolbox). No la firma un trabajador: la firman quien la hace y quien la supervisa.
import { fechaCorta } from './comun';

export const CODIGO_BOT = 'SH-CORP-SP-FO-018';
/** [texto, mínimo, y0, y1] */
export const BOT_ITEMS: [string, number, number, number][] = [
  ['Desinfectante: botella de agua oxigenada', 1, 222.8, 237], ['Antiséptico: povidona yodada', 1, 237, 251.2], ['Algodón', 1, 251.2, 265.5],
  ['Caja de bandas protectoras / tiritas', 1, 265.5, 279.8], ['Vendas', 5, 279.8, 294], ['Esparadrapo', 1, 294, 308.2],
  ['Gasa 20 × 20 cm (sobre 5 u)', 3, 308.2, 322.5], ['Tijera de cirugía', 1, 322.5, 336.8], ['Pinza de disección', 1, 336.8, 351],
  ['Par de guantes de látex/nitrilo', 2, 351, 365.2], ['Botella de alcohol', 1, 365.2, 379.5], ['Venda elástica Crepe', 1, 379.5, 393.8],
  ['Suero fisiológico 5 ml', 0, 393.8, 408],
];
/** [clave, pregunta, y0, y1] */
export const BOT_PREG: [string, string, number, number][] = [
  ['repuesto', '¿Has podido reponer los productos marcados con NO del stock de reserva?', 444.2, 475.5],
  ['conserv', 'Conservación del armario/maletín en adecuadas condiciones', 504, 518.2],
  ['ident', 'Identificación de la Mutua y teléfono de la línea asistencial 24 h en el exterior de la puerta', 518.2, 541],
  ['ubicado', 'Correctamente ubicado y fácilmente accesible para el personal', 541, 555.2],
];
export interface DatosBotiquin {
  empresa?: string; ubicacion?: string; centro?: string;
  items: { a?: string; ok?: boolean }[]; otros?: string; otros_a?: string;
  respuestas: Record<string, boolean>; n_bot?: string; n_rep?: string;
  realiza?: string; supervisa?: string; firma_realiza?: string | null; firma_supervisa?: string | null;
}
export const proximaRevision = (f: string) => { const d = new Date(`${f}T12:00:00`); d.setMonth(d.getMonth() + 3); return d.toLocaleDateString('sv-SE'); };

export async function pdfBotiquin(docs: { fecha: string; datos: DatosBotiquin }[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const r = await fetch(`${import.meta.env.BASE_URL}prevencion/plantillas/${CODIGO_BOT}.pdf`);
  if (!r.ok) throw new Error('No se encuentra la plantilla del FO-018');
  const plantilla = await r.arrayBuffer();
  const salida = await PDFDocument.create();
  for (const d of docs) {
    const doc = await PDFDocument.load(plantilla);
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.getPage(0), H = pg.getHeight(), ink = rgb(0.05, 0.1, 0.3), x = d.datos;
    type F = typeof font;
    const fit = (t: unknown, size: number, f: F, maxW: number) => { let s = String(t ?? ''); while (s && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1); return s; };
    const txt = (t: unknown, X: number, yb: number, size = 9, f: F = font, maxW = 400) => { const s = fit(t, size, f, maxW); if (s) pg.drawText(s, { x: X, y: H - yb, size, font: f, color: ink }); };
    const ctr = (t: unknown, x0: number, x1: number, y0: number, y1: number, size = 8, f: F = font) => {
      const s = fit(t, size, f, x1 - x0 - 2); if (!s) return; const w = f.widthOfTextAtSize(s, size);
      pg.drawText(s, { x: (x0 + x1) / 2 - w / 2, y: H - ((y0 + y1) / 2 + size * 0.35), size, font: f, color: ink });
    };
    const aro = (x0: number, x1: number, y0: number, y1: number) => pg.drawEllipse({ x: (x0 + x1) / 2, y: H - (y0 + y1) / 2, xScale: (x1 - x0) / 2 - 3, yScale: (y1 - y0) / 2 - 1.5, borderColor: ink, borderWidth: 1.3 });
    const img = async (u: string | null | undefined, x0: number, y0: number, x1: number, y1: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
      const im = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b);
      const w = x1 - x0, h = y1 - y0, k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - y1 + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    txt(x.empresa, 108, 116, 9, bold, 155); txt(x.ubicacion, 324, 115, 9, bold, 156); txt(x.centro, 108, 137.5, 9, bold, 155); txt(fechaCorta(d.fecha), 108, 158, 9, bold, 155);
    (x.items ?? []).forEach((v, i) => {
      if (!v || !BOT_ITEMS[i]) return; const [, , y0, y1] = BOT_ITEMS[i];
      if (v.a !== '' && v.a != null) ctr(v.a, 324.2, 374, y0, y1, 9, bold);
      if (v.ok === true) aro(374, 431, y0, y1); if (v.ok === false) aro(431, 483.8, y0, y1);
    });
    if (x.otros) { txt(x.otros, 60, 428, 8, font, 200); if (x.otros_a) ctr(x.otros_a, 324.2, 374, 408, 444.2, 9, bold); }
    BOT_PREG.forEach(([k, , y0, y1]) => { if (x.respuestas?.[k] === true) aro(374, 431, y0, y1); if (x.respuestas?.[k] === false) aro(431, 483.8, y0, y1); });
    if (x.n_bot) txt(x.n_bot, 253, 585, 10, bold, 20); if (x.n_rep) txt(x.n_rep, 468, 585, 10, bold, 20);
    txt(x.realiza, 56, 631, 8.5, bold, 205); txt(x.supervisa, 271, 631, 8.5, bold, 205);
    await img(x.firma_realiza, 60, 635, 256, 675); await img(x.firma_supervisa, 276, 635, 474, 675);
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
