// Entrega de EPI (SH-CORP-SP-FO-014): la lista de equipos de la hoja oficial y cómo se rellena el PDF.
// Copia de la app de ahora (toolbox): mismas posiciones sobre la misma plantilla (public/prevencion/plantillas).
import { MESES } from './comun';

/** [clave, texto, lado de la hoja, y0, y1, categorías que se marcan con una X] */
export type ItemEpi = [string, string, 'L' | 'R', number, number, string[]?];
export const EPI_ITEMS: ItemEpi[] = [
  ['gafas', 'Gafas de protección (EN 166)', 'L', 132.2, 150, ['Partículas', 'Salpicadura']],
  ['gafas_sold', 'Gafas para soldadura (EN 166)', 'L', 150, 168],
  ['pantalla', 'Pantalla facial (EN 166; EN 169)', 'L', 168, 184.5],
  ['tapon_cordon', 'Tapón auditivo con cordón (EN 352-2)', 'L', 184.5, 202.5],
  ['tapones', 'Tapones auditivos desechables (EN 352-2)', 'L', 202.5, 220],
  ['orejeras', 'Orejeras (EN 352-1)', 'L', 220, 237],
  ['orejeras_casco', 'Orejeras para cascos (EN 352-3)', 'L', 237, 256],
  ['arnes', 'Arnés de seguridad anticaída (EN 361; EN 354)', 'L', 256, 273],
  ['mosqueton', 'Mosquetón (EN 361; EN 354)', 'L', 273, 291],
  ['cuerda', 'Cuerda de amarre (EN 362; EN 354)', 'L', 291, 307.5],
  ['mascarilla', 'Mascarilla autofiltrante (EN 149)', 'L', 314, 329.5, ['Vapores', 'Partículas']],
  ['media_mascara', 'Media máscara (EN 405:2001)', 'L', 329.5, 350.5],
  ['mascara', 'Máscara completa (EN 136; EN 140)', 'L', 350.5, 370],
  ['filtros', 'Filtros (EN 140)', 'L', 370, 388.5],
  ['casco', 'Casco de seguridad (EN 397; EN 50365)', 'L', 388.5, 414.2],
  ['zapato', 'Zapato (EN ISO 20345)', 'L', 420.5, 438, ['Puntera', 'Anti-perfo', 'Agua']],
  ['bota', 'Bota (EN ISO 20345)', 'L', 438, 459.2, ['Puntera', 'Anti-perfo', 'Agua']],
  ['guantes_quim', 'Guantes química (EN 388; EN 374)', 'R', 132.2, 150, ['Nitrilo', 'Neopreno', 'Látex']],
  ['guantes_mec', 'Guantes mecánica (EN 388)', 'R', 150, 168],
  ['guantes_corte', 'Guantes anticorte (EN 388; EN 1082)', 'R', 168, 184.5],
  ['guantes_term', 'Guantes térmica (EN 511 / EN 407)', 'R', 184.5, 202.5],
  ['guantes_diel', 'Guantes dieléctrica (EN 60903)', 'R', 202.5, 220],
  ['guantes_sold', 'Guantes soldadura (EN 388; EN 407)', 'R', 220, 237],
  ['parka', 'Parka frío (EN 342)', 'R', 237, 256],
  ['traje_agua', 'Traje de agua 2 piezas (EN 343)', 'R', 256, 273],
  ['delantal', 'Delantal (EN 343)', 'R', 273, 291],
  ['chaleco', 'Chaleco reflectante (EN 20471)', 'R', 291, 307.5],
  ['tyvek', 'Traje buzo tipo Tyvek (EN 13034)', 'R', 307.5, 329.5],
  ['unif_refl', 'Uniformidad reflectante (EN 20471)', 'R', 329.5, 350.5],
  ['ignifugo', 'Vestuario ignífugo / antiestático', 'R', 350.5, 370],
];
export const EPI_GRUPOS: [string, string[]][] = [
  ['Protección ocular y facial', ['gafas', 'gafas_sold', 'pantalla']],
  ['Protección auditiva', ['tapon_cordon', 'tapones', 'orejeras', 'orejeras_casco']],
  ['Anticaídas', ['arnes', 'mosqueton', 'cuerda']],
  ['Protección respiratoria', ['mascarilla', 'media_mascara', 'mascara', 'filtros']],
  ['Cabeza y pies', ['casco', 'zapato', 'bota']],
  ['Manos', ['guantes_quim', 'guantes_mec', 'guantes_corte', 'guantes_term', 'guantes_diel', 'guantes_sold']],
  ['Otros elementos de protección', ['parka', 'traje_agua', 'delantal', 'chaleco', 'tyvek', 'unif_refl', 'ignifugo']],
];
export const MOTIVOS_EPI = ['Primera entrega', 'Reposición: rotura', 'Reposición: pérdida o extravío', 'Reposición: desgaste', 'Cambio de talla', 'Otro'];
export const EPI_DECL = [
  'Ha recibido el equipo arriba mencionado. Este material es propiedad de la empresa, por lo que el trabajador lo recibe en depósito. En caso de pérdida, rotura o extravío deberá notificarlo inmediatamente a su responsable.',
  'Ha sido formado e informado y conoce el correcto uso y mantenimiento de los equipos de protección entregados.',
  'Se compromete a utilizarlos debidamente en la realización de las tareas que así los requieran.',
];
export const EPI_INTRO = 'En cumplimiento del artículo 17.2 de la Ley de Prevención de Riesgos Laborales es obligatorio el uso de equipos de protección individual. La empresa pone a tu disposición los equipos indicados.';
export const CODIGO_EPI = 'SH-CORP-SP-FO-014';

export interface LineaEpi { u?: string; cat?: string[]; motivo?: string; mtxt?: string }
export interface OtroEpi extends LineaEpi { t: string }
export interface DatosEpi { items: Record<string, LineaEpi>; otros: OtroEpi[]; lugar?: string }

/** Motivo tal como se imprime («Otro» se cambia por lo que se escribe). */
export const motivoTxt = (v?: LineaEpi) => (!v || !v.motivo ? '' : v.motivo === 'Otro' ? v.mtxt || 'Otro' : v.motivo);
export const nombreCorto = (t: string) => t.replace(/\s*\(.*\)$/, '');

/** Lo entregado, en líneas de texto (para listas y para leerlo antes de firmar). */
export function lineasEpi(x: DatosEpi): string[] {
  const its = x.items ?? {};
  const a = EPI_ITEMS.filter((i) => its[i[0]]).map((i) => {
    const v = its[i[0]];
    return [i[1], v.u ? `${v.u} ud.` : '', (v.cat ?? []).join(', '), motivoTxt(v)].filter(Boolean).join(' · ');
  });
  (x.otros ?? []).filter((o) => o?.t).forEach((o) => a.push([o.t, o.u ? `${o.u} ud.` : '', motivoTxt(o)].filter(Boolean).join(' · ')));
  return a;
}

const fechaLarga = (d: string) => { const [y, m, dd] = d.split('-'); return `${+dd} de ${MESES[+m - 1].toLowerCase()} de ${y}`; };
const fechaHora = (t: string) => new Date(t).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export interface DocEpi {
  nombre: string; dni: string | null; puesto: string | null; fecha: string; datos: DatosEpi;
  firma: string | null; firmado_en: string | null;
}

const L = { unit: [289.4, 319.5], cat2: [[319.5, 366.6], [366.6, 435.2]], cat3: [[320.8, 361.4], [363.4, 407.2], [407.2, 435.2]] };
const R = { unit: [600.3, 631], cat3: [[631, 675.6], [675.6, 719.4], [719.4, 755.5]] };
const OTROS_Y = [[370, 388.5], [388.5, 414.2], [414.2, 438], [438, 459.2]];

/** Una o varias entregas de EPI en un solo PDF (una hoja FO-014 por entrega). sello = sello o firma de la empresa. */
export async function pdfEpi(docs: DocEpi[], sello: string | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const r = await fetch(`${import.meta.env.BASE_URL}prevencion/plantillas/${CODIGO_EPI}.pdf`);
  if (!r.ok) throw new Error('No se encuentra la plantilla del FO-014');
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
    const X = (x0: number, x1: number, y0: number, y1: number) => {
      const cx = (x0 + x1) / 2, cy = H - (y0 + y1) / 2, s = Math.min(x1 - x0, y1 - y0) * 0.28;
      pg.drawLine({ start: { x: cx - s, y: cy - s }, end: { x: cx + s, y: cy + s }, thickness: 1.3, color: ink });
      pg.drawLine({ start: { x: cx - s, y: cy + s }, end: { x: cx + s, y: cy - s }, thickness: 1.3, color: ink });
    };
    const blanco = (x0: number, y0: number, x1: number, y1: number) => pg.drawRectangle({ x: x0, y: H - y1, width: x1 - x0, height: y1 - y0, color: rgb(1, 1, 1) });
    const img = async (u: string | null, x0: number, y0: number, x1: number, y1: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
      const im = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b);
      const w = x1 - x0, h = y1 - y0, k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - y1 + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    txt(d.nombre, 323, 99.6, 9, bold, 280); txt(d.puesto, 323, 111.6, 9, bold, 280); txt(d.dni, 628, 99.6, 9, bold, 125);
    const its = x.items ?? {};
    for (const [k, , lado, y0, y1, cats] of EPI_ITEMS) {
      const v = its[k]; if (!v) continue; const P = lado === 'L' ? L : R;
      ctr(v.u || '1', P.unit[0], P.unit[1], y0, y1, 9, bold);
      if (cats && (v.cat ?? []).length) {
        const cols = lado === 'R' ? R.cat3 : cats.length === 3 ? L.cat3 : L.cat2;
        cats.forEach((c, i) => { if (v.cat!.includes(c)) X(cols[i][0], cols[i][1], y0, y1); });
      }
    }
    (x.otros ?? []).filter((o) => o?.t).slice(0, 4).forEach((o, i) => {
      const [y0, y1] = OTROS_Y[i]; txt(o.t, 466, (y0 + y1) / 2 + 3, 8, font, 130); ctr(o.u || '', R.unit[0], R.unit[1], y0, y1, 9, bold);
    });
    // la plantilla no tiene columna para el motivo: va en letra pequeña bajo la declaración
    const mot = [...EPI_ITEMS.filter((i) => its[i[0]] && motivoTxt(its[i[0]])).map((i) => `${nombreCorto(i[1])}: ${motivoTxt(its[i[0]])}`),
      ...(x.otros ?? []).filter((o) => o?.t && motivoTxt(o)).map((o) => `${o.t}: ${motivoTxt(o)}`)];
    if (mot.length) {
      const lin: string[] = []; let cur = '';
      for (const m of mot) { const t = cur ? `${cur}   ·   ${m}` : m; if (font.widthOfTextAtSize(t, 6) > 440 && cur) { lin.push(cur); cur = m; } else cur = t; }
      if (cur) lin.push(cur);
      lin.slice(0, 2).forEach((l, i) => txt((i ? '' : 'Motivo: ') + l, 86, 578 + i * 6.5, 6, font, 440));
    }
    blanco(518, 507, 641.5, 524);
    // «En …, a …»: la letra se hace más pequeña hasta que el lugar quepa entero en la casilla (no se corta)
    const enLugar = `En ${x.lugar ?? ''},`; let tam = 7;
    while (tam > 4 && font.widthOfTextAtSize(enLugar, tam) > 118) tam -= 0.25;
    txt(enLugar, 521, 514.5, tam, font, 118); txt(`a ${fechaLarga(d.fecha)}`, 521, 521.5, 7, font, 118);
    await img(d.firma, 522, 546, 638, 580);
    if (d.firmado_en) pg.drawText(`Firmado digitalmente ${fechaHora(d.firmado_en)}`, { x: 522, y: H - 580.5, size: 5, font, color: rgb(0.45, 0.45, 0.45) });
    await img(sello, 646, 518, 752, 579);
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
