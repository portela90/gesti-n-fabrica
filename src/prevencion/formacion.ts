// Formación práctica en el puesto de trabajo (F40R304): los puntos de la hoja oficial, el texto que lee el
// trabajador (el reverso de la hoja) y cómo se rellena el PDF. Copia de la app de ahora (toolbox), mismas posiciones.
import { fechaCorta } from './comun';

export const F_ITEMS: Record<number, string> = {"1": "NORMAS BÁSICAS Y GENERALES", "2": "ÚTILES Y PRODUCTOS", "3": "LIMPIEZA Y CONSERVACIÓN DE MAQUINARIA", "4": "CONDICIONES DE SEGURIDAD Y ERGONOMÍA", "5": "MEDIO AMBIENTE", "6": "OTROS"};
export const F_REVERSO: Record<number, { intro: string; grupos: [string, string[]][] }> = {
  1: {
    intro: "Para ISS es muy importante que los trabajadores cuiden la imagen profesional, procurando ser discretos, educados y apliquen normas básicas de limpieza.",
    grupos: [
      ["Imagen profesional - uniformidad", ["Correcto empleo del uniforme establecido por ISS: limpio y planchado.", "Pelo recogido y ausencia de elementos que interfieran en las tareas (pulseras, piercings…).", "Trato correcto y respetuoso hacia el cliente."]],
      ["Normas generales de limpieza", ["Limpiaremos de arriba abajo, de dentro hacia fuera y de más limpio a sucio.", "Observa la zona a tratar, piensa la forma más efectiva de realizar la tarea y actúa para que la limpieza sea satisfactoria.", "Orden y limpieza en mi puesto de trabajo."]],
    ],
  },
  2: {
    intro: "Identificar y explicar los diferentes útiles y productos en cada centro, definiendo el uso correcto, utilidad de cada uno de ellos y dosificación correcta de uso.",
    grupos: [
      ["Equipos, útiles y productos", ["Identificación y utilización segura de los equipos y útiles para llevar a cabo la limpieza en el centro (carros, código de colores de bayetas, maquinaria a emplear, etc.).", "Identificación y utilización segura de los productos químicos para llevar a cabo la limpieza en el centro.", "Principales características y condiciones de uso seguro de equipos, útiles y productos químicos.", "Dosificación establecida (indicar responsables si procede).", "Solicitar etiquetas homologadas.", "Correcta utilización y conservación de los útiles.", "Comunicación inmediata de cualquier incidencia o anomalía en el uso de equipos, útiles y productos al responsable."]],
      ["Almacenaje", ["Las fichas técnicas y de seguridad de los productos deben estar a disposición de la plantilla.", "No utilizar botellas de agua para contener productos de limpieza.", "Revisión del área destinada al depósito de productos: mostrar ubicación, envases empleados y trasladar las funciones del etiquetaje de seguridad en cada caso.", "Revisar normas básicas de almacenaje e incompatibilidad de almacenamiento.", "Identificar y clasificar correctamente los productos en el almacén."]],
    ],
  },
  3: {
    intro: "Identificar y explicar los diferentes tipos de máquinas y el correcto mantenimiento preventivo de las mismas.",
    grupos: [
      ["Tareas preventivas diarias", ["Verificación de puntos críticos (carcasas colocadas, cableado bien conservado, funciones de paro y accionamiento correctas).", "Limpieza de la carcasa.", "Vaciado y limpieza de bandejas, tanque de agua y bayeta de secado.", "Mantener en buen estado general y de limpieza el equipo."]],
      ["Tareas preventivas semanales", ["Limpieza de filtros.", "Rellenar niveles.", "Limpiar ruedas.", "Como norma general se limpiarán las máquinas paradas y bloqueadas. Si fuera imprescindible la limpieza de algún equipo en movimiento, mi responsable me lo tendrá que comunicar previamente y durante la realización de los trabajos mantendré una distancia de seguridad de al menos 1 m, con el fin de evitar accidentes por atrapamiento, haciendo uso de alargadores tipo lanza u otros elementos complementarios que garanticen en todo momento la seguridad."]],
    ],
  },
  4: {
    intro: "La seguridad en el trabajo se puede definir como el conjunto de técnicas, actuaciones y procedimientos que tienen por objeto detectar o disminuir el riesgo de accidente o minimizar sus consecuencias.",
    grupos: [
      ["Normas básicas", ["Normas de seguridad en las instalaciones del cliente.", "Actuación ante una emergencia y/o accidente laboral.", "Identificación de recorridos de evacuación, salidas de emergencia, ubicación de extintores y punto de emergencia o de reunión.", "Escaleras portátiles: identificación de las escaleras disponibles, su emplazamiento y tareas donde pueden usarse. Colocación y uso seguro. Revisión visual antes de su utilización. Verificación de puntos críticos: zapatas antideslizantes, estado de peldaños, limitador de apertura.", "Electricidad: identificación de los elementos eléctricos en la instalación (enchufes, cuadros eléctricos, etc.) y elementos de seguridad para evitar el contacto eléctrico. Precauciones a adoptar durante las tareas de limpieza.", "Posturas forzadas y manejo de cargas: identificación de las actividades diarias que pueden conllevar la manipulación de objetos voluminosos o pesados. Medidas preventivas para evitar sobreesfuerzos (mantener la espalda recta, utilizar ayudas mecánicas, evitar giros del tronco, mantener la carga cerca del centro de gravedad, etc.).", "Equipos de protección individual (EPI): identificación de los equipos de protección individual que debe emplear. Utilización y mantenimiento de los equipos de protección proporcionados."]],
    ],
  },
  5: {
    intro: "Explicar las acciones necesarias para preservar el medio ambiente, utilizando buenas prácticas de gestión.",
    grupos: [
      ["Respetemos el medioambiente", ["Gestionar los residuos según indicaciones del cliente.", "No dejar correr el agua en grifos y cisternas más tiempo del necesario. Notificaremos averías de inmediato.", "Debemos seguir las indicaciones de las fichas técnicas para dosificar correctamente los productos químicos.", "Aprovechar la luz natural, cuando sea posible, para la realización de tareas de limpieza.", "Seguir las instrucciones de actuación en caso de vertido o derrame accidental (por ejemplo, cómo recoger y gestionar un producto químico derramado).", "Realizar el apagado y encendido de las luces según instrucciones del cliente."]],
    ],
  },
};
export const CODIGO_F40 = 'F40R304';
export const F_INTRO = 'Se muestran las instalaciones y equipos, se describen in situ las tareas a realizar y cómo realizarlas de forma segura (pautas preventivas básicas).';

export interface DatosFormacion { items: number[]; otros1?: string; otros6?: string; direccion?: string; duracion?: string; impartida?: string }
export interface Evaluacion { fecha?: string; eficaz?: boolean | null; nueva_fecha?: string }

export const tituloPunto = (n: number) => `${n}. ${F_ITEMS[n].charAt(0)}${F_ITEMS[n].slice(1).toLowerCase()}`;

export interface DocFormacion {
  nombre: string; fecha: string; datos: DatosFormacion; evaluacion: Evaluacion | null;
  firma: string | null; firmado_en: string | null;
}

/** Una o varias formaciones en un solo PDF (una hoja F40R304 por trabajador). */
export async function pdfFormacion(docs: DocFormacion[], firmaResp: string | null, firmaFormador: string | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const r = await fetch(`${import.meta.env.BASE_URL}prevencion/plantillas/F40R304.pdf`);
  if (!r.ok) throw new Error('No se encuentra la plantilla del F40R304');
  const plantilla = await r.arrayBuffer();
  const salida = await PDFDocument.create();
  for (const f of docs) {
    const doc = await PDFDocument.load(plantilla);
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.getPage(0), H = pg.getHeight(), ink = rgb(0.05, 0.1, 0.3), x = f.datos;
    type F = typeof font;
    const txt = (t: unknown, X: number, yTop: number, size = 10, fnt: F = font, maxW = 330) => {
      let s = String(t ?? ''); while (s && fnt.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
      if (s) pg.drawText(s, { x: X, y: H - yTop, size, font: fnt, color: ink });
    };
    const cruz = (x0: number, x1: number, yTop: number, yBot: number) => {
      const cx = (x0 + x1) / 2, cy = H - (yTop + yBot) / 2, s = Math.min(x1 - x0, yBot - yTop) * 0.32;
      pg.drawLine({ start: { x: cx - s, y: cy - s }, end: { x: cx + s, y: cy + s }, thickness: 1.4, color: ink });
      pg.drawLine({ start: { x: cx - s, y: cy + s }, end: { x: cx + s, y: cy - s }, thickness: 1.4, color: ink });
    };
    const img = async (u: string | null, x0: number, yTop: number, x1: number, yBot: number) => {
      if (!u || !/^data:image\/(png|jpeg);base64,/.test(u)) return;
      const b = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
      const im = u.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b);
      const w = x1 - x0, h = yBot - yTop, k = Math.min(w / im.width, h / im.height);
      pg.drawImage(im, { x: x0 + (w - im.width * k) / 2, y: H - yBot + (h - im.height * k) / 2, width: im.width * k, height: im.height * k });
    };
    txt(x.direccion, 200, 173.3, 10.5, bold); txt(f.nombre, 200, 201, 10.5, bold); txt(fechaCorta(f.fecha), 200, 228.2, 10.5, bold);
    txt(x.duracion, 200, 257.7, 10.5, bold); txt(x.impartida, 200, 286.6, 10.5, bold);
    const filas: Record<number, [number, number]> = { 1: [355, 365], 2: [406, 420.5], 3: [428.5, 442.5], 4: [460.5, 475], 5: [483, 497.5], 6: [507.5, 520.5] };
    for (const n of x.items ?? []) if (filas[n]) cruz(511, 538.5, filas[n][0], filas[n][1]);
    if (x.otros1) txt(x.otros1, 212, 390, 8, font, 290);
    if (x.otros6) txt(x.otros6, 215, 516.5, 9, font, 285);
    await img(firmaResp, 49, 596, 161, 643);
    await img(firmaFormador, 221, 596, 363, 643);
    await img(f.firma, 404, 596, 536, 643);
    if (f.firmado_en) pg.drawText(`Firmado digitalmente ${new Date(f.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`,
      { x: 404, y: H - 652, size: 5.5, font, color: rgb(0.45, 0.45, 0.45) });
    const ev = f.evaluacion;
    if (ev?.fecha) txt(fechaCorta(ev.fecha), 120, 739.5, 9, bold);
    if (ev?.eficaz === true) cruz(279, 296.5, 745.5, 758.5);
    if (ev?.eficaz === false) { cruz(335, 349, 745.5, 758.5); if (ev.nueva_fecha) txt(fechaCorta(ev.nueva_fecha), 484, 755.5, 8.5, bold); }
    (await salida.copyPages(doc, doc.getPageIndices())).forEach((p) => salida.addPage(p));
  }
  return salida.save();
}
