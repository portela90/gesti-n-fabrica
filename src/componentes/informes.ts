// PDF y Excel comunes a todos los módulos (cabecera azul, cajas de cifras, tablas, pie con la página; Excel con varias hojas).
// Las librerías (jspdf, jspdf-autotable, write-excel-file) se cargan solo al usarlas.

export const AZUL: [number, number, number] = [31, 78, 121], GRIS: [number, number, number] = [92, 107, 122], ROJO: [number, number, number] = [179, 38, 30];
/** Helvetica del PDF solo sabe letras del español y poco más: lo demás se quita. */
export const txt = (t: unknown) => String(t ?? '').replace(/[^\x20-\x7E -ÿ–—‘’“”•€]/g, '').trim();
const fDMA = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;
export async function nuevoPDF() {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc: Doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const s = { y: 0 };
  const tabla = (head: unknown[], body: unknown[][], opt: Record<string, unknown> = {}, color = AZUL) => {
    at.default(doc, { startY: s.y, head: [head.map(txt)], body: body.map((r) => r.map(txt)), margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak' }, headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 251] }, ...opt });
    s.y = doc.lastAutoTable.finalY + 8;
  };
  const titulo = (t: string) => {
    if (s.y > 262) { doc.addPage(); s.y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...AZUL); doc.text(txt(t), M, s.y);
    doc.setDrawColor(...AZUL); doc.line(M, s.y + 1.5, W - M, s.y + 1.5); doc.setTextColor(0); s.y += 6;
  };
  const frase = (t: string) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS); doc.text(txt(t), M, s.y); doc.setTextColor(0); s.y += 8; };
  const cabecera = (t: string, sub: string) => {
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 24, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(txt(t), M, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(txt(sub), M, 18); doc.setTextColor(0); s.y = 32;
  };
  const cajas = (kp: [string, string, boolean?][]) => {
    const bw = (W - 2 * M - 3 * 4) / 4;
    kp.forEach(([n, v, rojo], i) => {
      const cx = M + (i % 4) * (bw + 4), cy = s.y + Math.floor(i / 4) * 20;
      doc.setFillColor(238, 242, 246); doc.roundedRect(cx, cy, bw, 17, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...(rojo ? ROJO : [22, 33, 44])); doc.text(txt(v), cx + bw / 2, cy + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS); doc.text(txt(n), cx + bw / 2, cy + 13.5, { align: 'center' });
    });
    doc.setTextColor(0); s.y += Math.ceil(kp.length / 4) * 20 + 4;
  };
  const pie = (quien: string, unidad: string) => {
    const n = doc.getNumberOfPages();
    const hoy = new Date().toLocaleDateString('sv-SE');
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
      doc.text(txt(`Generado el ${fDMA(hoy)} por ${quien} · Limpieza · ${unidad}`), M, 292);
      doc.text(`Página ${i} de ${n}`, W - M, 292, { align: 'right' });
    }
  };
  return { doc, W, M, s, tabla, titulo, frase, cabecera, cajas, pie };
}

// ---------- Excel ----------
export type Celda = string | number | null | { value: string | number; fontWeight?: 'bold'; format?: string };
export const neg = (v: string) => ({ value: v, fontWeight: 'bold' as const });
export const cab = (r: string[]) => r.map(neg);
export async function libro(hojas: { nombre: string; filas: Celda[][]; anchos: number[] }[]) {
  const { default: escribir } = await import('write-excel-file/browser');
  return escribir(hojas.map((h) => ({ sheet: h.nombre, data: h.filas as never, columns: h.anchos.map((width) => ({ width })) }))).toBlob();
}

/** Guardar o compartir un archivo: en el móvil, el menú de compartir («Guardar en Archivos»); si no, se descarga. */
export async function bajarArchivo(b: Blob, nombre: string) {
  const f = b instanceof File ? b : new File([b], nombre, { type: b.type });
  try { if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; } }
  catch (e) { if ((e as Error).name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
}
