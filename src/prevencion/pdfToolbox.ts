/**
 * PDF oficial del Toolbox Talk (formato SH-CORP-FO-IB-031), igual que en la app de ahora (toolbox.html).
 * Se hace en el móvil con jsPDF (gratis, sin servidor). jsPDF se carga solo cuando hace falta.
 * El logo y los iconos del pie están en public/prevencion/ (sacados de la app de ahora).
 */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface DatosToolbox {
  anio: number; mes: number;
  charla: { compromiso: string | null; documento_nombre?: string | null; cuerpo: string | null; puntos: string[]; tema: string | null; tema_intro: string | null; tema_puntos: string[]; imagen: string | null };
  sesion: { denominacion: string | null; fecha: string | null; centro: string | null; duracion: number | null; formador: string | null; observaciones: string | null };
  firmas: { nombre: string; puesto: string | null; imagen: string | null; firmado_en: string }[];
  ajustes: { centro?: string; duracion?: string; formador?: string; firma_formador?: string };
}

const fechaCorta = (f: string | null) => { if (!f) return ''; const [a, m, d] = f.slice(0, 10).split('-').map(Number); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`; };
const fechaHora = (f: string) => new Date(f).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Tamaño de una imagen (para que no se deforme al ponerla en el PDF). */
function tamano(src: string | null | undefined): Promise<{ w: number; h: number } | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = src; });
}
/** Una imagen de la propia app (logo, iconos) como data URL. */
async function deLaApp(ruta: string): Promise<string | null> {
  try {
    const r = await fetch(import.meta.env.BASE_URL + ruta); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b); });
  } catch { return null; }
}

export async function pdfToolbox(d: DatosToolbox): Promise<{ bytes: Uint8Array; nombre: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, L = 15, R = 195, CW = R - L;
  const NAVY = [15, 28, 77], LBL = [0, 51, 102], BLUE = [0, 112, 192], GREY = [242, 242, 242], BORDER = [191, 191, 191], TXT = [30, 30, 30];
  const nombreMes = MESES[d.mes - 1];
  const codigo = `SH-CORP-FO-IB-031 Toolbox Talk HSE_${nombreMes} ${String(d.anio).slice(2)}`;
  const FOOT_TOP = H - 42;
  const tb = d.charla, s = d.sesion, cfg = d.ajustes;
  const [LOGO, ICONOS] = await Promise.all([deLaApp('prevencion/logo.png'), deLaApp('prevencion/iconos.jpg')]);
  const ic = await tamano(ICONOS), lg = await tamano(LOGO);
  const firmas = d.firmas.filter((f) => f.imagen).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const tams = await Promise.all(firmas.map((f) => tamano(f.imagen)));
  const formSig = await tamano(cfg.firma_formador);
  const tbImg = await tamano(tb.imagen);
  const fmt = (src: string) => (/^data:image\/png/.test(src) ? 'PNG' : 'JPEG');
  const fit = (src: string | null | undefined, sz: { w: number; h: number } | null, x: number, y: number, w: number, h: number, align: 'center' | 'left' = 'center') => {
    if (!src || !sz) return; const k = Math.min(w / sz.w, h / sz.h); const iw = sz.w * k, ih = sz.h * k; const ox = align === 'left' ? 0 : (w - iw) / 2;
    doc.addImage(src, fmt(src), x + ox, y + (h - ih) / 2, iw, ih);
  };
  const color = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

  function cabecera() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); color(NAVY);
    doc.text('TOOLBOX TALK / TEAMBOARD / REUNIÓN PERIÓDICA', W / 2, 17, { align: 'center' });
    doc.text('HSE', W / 2, 22.5, { align: 'center' });
    doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(L + 10, 26, CW - 20, 4, 'F');
    return 36;
  }
  function pie() {
    if (ICONOS && ic) { const w = 150, h = w * ic.h / ic.w; doc.addImage(ICONOS, 'JPEG', (W - w) / 2, FOOT_TOP + 2, w, h); }
    doc.setFontSize(6.3); color(TXT);
    const lineas: [string, boolean][][] = [
      [['Todos los asistentes que firman el presente documento han participado en la actividad formativa (Toolbox Talk) indicada, la cual ha sido', false]],
      [['realizada durante la reunión mensual de ', false], ['Team Board (TB)', true], ['. En aquellos casos donde ', false], ['no es de aplicación el TB', true], [', la actividad formativa se', false]],
      [['ha realizado durante las ', false], ['reuniones periódicas de Seguridad y Salud o Medioambiente', true], ['.', false]],
    ];
    let y = H - 21;
    for (const ln of lineas) {
      let tw = 0; for (const [t, b] of ln) { doc.setFont('helvetica', b ? 'bold' : 'normal'); tw += doc.getTextWidth(t); }
      let x = (W - tw) / 2; for (const [t, b] of ln) { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.text(t, x, y); x += doc.getTextWidth(t); }
      y += 2.9;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 112, 192); doc.text('PEOPLE MAKE PLACES', L - 5, H - 8);
    color(TXT); doc.setFontSize(8); doc.text(String(doc.getCurrentPageInfo().pageNumber), W / 2, H - 9, { align: 'center' });
    doc.setFontSize(6.5); doc.text(codigo, R + 5, H - 6, { align: 'right' });
    if (LOGO && lg) doc.addImage(LOGO, 'PNG', R - 17, H - 16.5, 10, 10 * lg.h / lg.w);
  }

  // ---- Página 1: datos de la sesión
  let y = cabecera();
  doc.setFontSize(7.6);
  const lbl = (t: string, x: number, yy: number) => { doc.setFont('helvetica', 'bold'); color(LBL); doc.text(t, x, yy); return x + doc.getTextWidth(t) + 2; };
  const val = (t: string | null | undefined, x: number, yy: number, maxW: number) => { doc.setFont('helvetica', 'normal'); color(TXT); doc.text(doc.splitTextToSize(String(t || ''), maxW)[0] || '', x, yy); };
  let x = lbl('DENOMINACIÓN DE LA ACCIÓN FORMATIVA:', L + 5, y); val(s.denominacion || `Toolbox Talk HSE ${nombreMes} ${String(d.anio).slice(2)}`, x, y, 128 - x);
  x = lbl('FECHA:', 132, y); val(fechaCorta(s.fecha) || `  /${String(d.mes).padStart(2, '0')}/${String(d.anio).slice(2)}`, x + 3, y, 40);
  y += 4.3;
  x = lbl('CENTRO DE TRABAJO/LUGAR REALIZACIÓN:', L + 5, y); val(s.centro || cfg.centro, x, y, 128 - x);
  x = lbl('DURACIÓN:', 134, y); val(`${s.duracion ?? cfg.duracion ?? ''}  MIN`, x + 3, y, 40);
  y += 4.3;
  x = lbl('FORMADOR:', L + 5, y); val(s.formador || cfg.formador || '', x, y, 110);
  y += 6;
  lbl('FIRMA:', L + 5, y + 3.5);
  doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(L + 18, y - 1, 62, 11, 'F');
  fit(cfg.firma_formador, formSig, L + 20, y - 0.5, 58, 10);
  y += 15;

  // ---- Contenidos (la letra se ajusta para que quepa en la página 1)
  const COLW_L = 92, COLW_R = CW - COLW_L, P = 3;
  const espacioMax = FOOT_TOP - y - 6 - 30 - 36;
  function medir(k: number, dibujar: boolean, y0: number) {
    let yl = y0 + P + 1, yr = y0 + P + 1;
    const fsT = 11 * k, fsB = 7.4 * k, lh = fsB * 0.42, lhT = fsT * 0.43;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fsT); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
    let ls: string[] = doc.splitTextToSize(tb.compromiso ?? (tb.documento_nombre ? 'Ver el documento del técnico de prevención adjunto.' : ''), COLW_L - 2 * P);
    if (dibujar) doc.text(ls, L + P, yl + lhT * 0.8, { lineHeightFactor: 1.15 }); yl += ls.length * lhT + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fsB); color(TXT);
    for (const par of (tb.cuerpo || '').split('\n').filter(Boolean)) { ls = doc.splitTextToSize(par, COLW_L - 2 * P); if (dibujar) doc.text(ls, L + P, yl + lh * 0.8, { lineHeightFactor: 1.15 }); yl += ls.length * lh + 1.6; }
    if (tb.puntos.length) {
      yl += 1; doc.setFont('helvetica', 'bold'); if (dibujar) doc.text('Puntos para discusión:', L + P, yl + lh * 0.8); yl += lh + 0.6; doc.setFont('helvetica', 'normal');
      for (const q of tb.puntos) { ls = doc.splitTextToSize(q, COLW_L - 2 * P); if (dibujar) doc.text(ls, L + P, yl + lh * 0.8, { lineHeightFactor: 1.15 }); yl += ls.length * lh + 0.8; }
    }
    const xr = L + COLW_L + P, wr = COLW_R - 2 * P;
    if (tb.imagen && tbImg) { const ih = Math.min(30 * k, wr * tbImg.h / tbImg.w); if (dibujar) fit(tb.imagen, tbImg, xr, yr, wr, ih, 'left'); yr += ih + 3; }
    if (tb.tema) { doc.setFont('helvetica', 'bold'); doc.setFontSize(fsT * 0.95); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]); ls = doc.splitTextToSize(tb.tema, wr); if (dibujar) doc.text(ls, xr, yr + lhT * 0.8, { lineHeightFactor: 1.15 }); yr += ls.length * lhT + 2.5; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fsB); color(TXT);
    for (const par of (tb.tema_intro || '').split('\n').filter(Boolean)) { ls = doc.splitTextToSize(par, wr); if (dibujar) doc.text(ls, xr, yr + lh * 0.8, { lineHeightFactor: 1.15 }); yr += ls.length * lh + 1.4; }
    for (const it of tb.tema_puntos) { ls = doc.splitTextToSize(it, wr - 3.5); if (dibujar) { doc.text('•', xr, yr + lh * 0.8); doc.text(ls, xr + 3.5, yr + lh * 0.8, { lineHeightFactor: 1.15 }); } yr += ls.length * lh + 0.9; }
    return Math.max(yl, yr) - y0 + P;
  }
  let k = 1, hC = medir(k, false, y);
  while (hC > espacioMax && k > 0.7) { k -= 0.03; hC = medir(k, false, y); }
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.25);
  doc.rect(L, y, CW, 6); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); color(LBL); doc.text('CONTENIDOS', L + 2.5, y + 4.2);
  y += 6;
  doc.rect(L, y, COLW_L, hC); doc.rect(L + COLW_L, y, COLW_R, hC);
  medir(k, true, y);
  y += hC + 5;

  // ---- Comentarios / observaciones
  doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(L, y, CW, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); color(LBL); doc.text('Comentarios adicionales / Observaciones', L + 2, y + 3.6);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); color(TXT);
  const obs: string[] = doc.splitTextToSize(s.observaciones || '', CW - 6);
  const hObs = Math.max(14, obs.length * 3.4 + 5);
  doc.rect(L, y, CW, hObs); if (obs.length) doc.text(obs, L + 3, y + 4.5, { lineHeightFactor: 1.3 });
  y += hObs + 6;

  // ---- Asistentes
  const CN = 88, CP = 52, CF = CW - CN - CP, RH = 13;
  function cabTabla() {
    doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(L, y, CW, 9, 'F'); doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.rect(L, y, CN, 9); doc.rect(L + CN, y, CP, 9); doc.rect(L + CN + CP, y, CF, 9); doc.line(L, y + 4.6, L + CN, y + 4.6);
    color(LBL); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4);
    doc.text('DATOS DE LOS ASISTENTES', L + CN / 2, y + 3.4, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.text('NOMBRE Y APELLIDOS', L + CN / 2, y + 7.8, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.text('PUESTO DE TRABAJO', L + CN + CP / 2, y + 5.6, { align: 'center' }); doc.text('FIRMA', L + CN + CP + CF / 2, y + 5.6, { align: 'center' });
    y += 9;
  }
  const filas = firmas.length ? firmas.map((f, i) => ({ f, t: tams[i] })) : [null, null];
  if (y + 9 + RH > FOOT_TOP) { pie(); doc.addPage(); y = cabecera(); }
  cabTabla();
  for (const fila of filas) {
    if (y + RH > FOOT_TOP) { pie(); doc.addPage(); y = cabecera(); cabTabla(); }
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.rect(L, y, CN, RH); doc.rect(L + CN, y, CP, RH); doc.rect(L + CN + CP, y, CF, RH);
    if (fila) {
      const { f, t } = fila;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); color(TXT);
      doc.text(doc.splitTextToSize(f.nombre, CN - 6)[0], L + 3, y + RH / 2 + 1.3);
      doc.setFontSize(7.6); doc.text(doc.splitTextToSize(f.puesto || '', CP - 4)[0] || '', L + CN + 2.5, y + RH / 2 + 1.2);
      fit(f.imagen, t, L + CN + CP + 2, y + 0.8, CF - 4, RH - 4.2);
      doc.setFontSize(4.8); doc.setTextColor(120, 120, 120); doc.text('Firmado digitalmente ' + fechaHora(f.firmado_en), L + CN + CP + CF / 2, y + RH - 0.9, { align: 'center' });
    }
    y += RH;
  }
  pie();
  return { bytes: new Uint8Array(doc.output('arraybuffer')), nombre: codigo + '.pdf' };
}

/** Descargar un PDF (o, en el móvil, abrirlo para guardarlo o compartirlo). */
export function descargar(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
