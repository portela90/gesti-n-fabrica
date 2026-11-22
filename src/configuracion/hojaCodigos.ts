// Hoja de códigos de alta para imprimir (parte 8, día del cambio; decidido por Cristian el 22/11): una tarjeta por persona
// (nombre, código, QR y cómo darse de alta), 8 por hoja A4 para recortar. Las librerías se cargan solo al usarlas.
import { txt } from '../componentes/informes';

export interface Tarjeta { nombre: string; codigo: string }

const fDMA = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });

export async function pdfCodigos(tarjetas: Tarjeta[], unidad: string, direccion: string, caduca: Date): Promise<Blob> {
  const [{ jsPDF }, qr] = await Promise.all([import('jspdf'), import('qrcode')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 10, ANCHO = 95, ALTO = 69, COLS = 2, FILAS = 4;
  for (let i = 0; i < tarjetas.length; i++) {
    const t = tarjetas[i];
    const en = i % (COLS * FILAS);
    if (i > 0 && en === 0) doc.addPage();
    const x = M + (en % COLS) * ANCHO, y = M + Math.floor(en / COLS) * ALTO;
    // línea de recorte
    doc.setDrawColor(180); doc.setLineDashPattern([1.5, 1.5], 0); doc.rect(x, y, ANCHO, ALTO); doc.setLineDashPattern([], 0);
    // el nombre en una sola línea: si no cabe, letra más pequeña y, si aun así no cabe, cortado con «…»
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
    let fs = 12, nombre = txt(t.nombre);
    doc.setFontSize(fs);
    while (doc.getTextWidth(nombre) > ANCHO - 10 && fs > 9) { fs -= 0.5; doc.setFontSize(fs); }
    while (doc.getTextWidth(nombre) > ANCHO - 10 && nombre.length > 4) nombre = nombre.slice(0, -2).trimEnd() + '…';
    doc.text(nombre, x + 5, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
    doc.text(txt(`${unidad} · Tu código para entrar en la app (caduca el ${fDMA(caduca)})`), x + 5, y + 13, { maxWidth: ANCHO - 10 });
    doc.setFont('courier', 'bold'); doc.setFontSize(20); doc.setTextColor(0);
    doc.text(t.codigo, x + 5, y + 24);
    const img = await qr.toDataURL(`${direccion}#/alta/${t.codigo}`, { margin: 0, width: 300 });
    doc.addImage(img, 'PNG', x + ANCHO - 33, y + 17, 28, 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(40);
    const pasos = [
      `1. Abre la app en tu móvil: ${direccion.replace(/^https?:\/\//, '')} (o escanea el QR).`,
      '2. Toca «Soy operario: tengo un código de alta» y escribe el código.',
      '3. Elige tu PIN de 4 cifras (solo lo sabrás tú). Desde entonces solo pones el PIN.',
      'iPhone: primero añade la app a la pantalla de inicio (Compartir > Añadir a pantalla de inicio) y escribe el código dentro de la app.',
    ];
    // los tres pasos, a la izquierda del QR; el aviso del iPhone, debajo, a todo lo ancho
    let py = y + 31;
    pasos.forEach((p, k) => {
      if (k === 3) { py = Math.max(py, y + 49); doc.setTextColor(90); }
      const lineas = doc.splitTextToSize(txt(p), k === 3 ? ANCHO - 10 : ANCHO - 40);
      doc.text(lineas, x + 5, py);
      py += lineas.length * 3.2 + 0.8;
    });
  }
  return doc.output('blob');
}
