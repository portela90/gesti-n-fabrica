// Documentos del técnico de prevención (PDF) guardados en el almacén de archivos de Supabase (bucket «prevencion»).
// Ruta: <unidad>/charlas/<año>-<mes>-<marca>.pdf. Cada subida es un archivo nuevo: lo ya firmado no cambia.
import { supabase } from '../nucleo/supabase';
const almacen = () => supabase.storage.from('prevencion');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
async function sha256(bytes) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Sube el PDF y devuelve lo que hay que guardar en la charla. */
export async function subirDocumento(unidad, anio, mes, archivo) {
    if (archivo.type && archivo.type !== 'application/pdf' && !/\.pdf$/i.test(archivo.name))
        throw new Error('Tiene que ser un PDF');
    if (archivo.size > 20 * 1024 * 1024)
        throw new Error('El PDF pesa más de 20 MB');
    const bytes = await archivo.arrayBuffer();
    const ruta = `${unidad}/charlas/${anio}-${String(mes).padStart(2, '0')}-${Date.now()}.pdf`;
    const { error } = await almacen().upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
    if (error)
        throw new Error('No se ha podido subir: ' + error.message);
    return { documento_ruta: ruta, documento_nombre: archivo.name.slice(0, 200), documento_sha256: await sha256(bytes) };
}
/** Abre el PDF en otra pestaña (enlace que dura una hora). */
export async function abrirDocumento(ruta) {
    const ventana = window.open('', '_blank');
    const { data, error } = await almacen().createSignedUrl(ruta, 3600);
    if (error || !data) {
        ventana?.close();
        throw new Error('No se ha podido abrir el documento');
    }
    if (ventana)
        ventana.location.href = data.signedUrl;
    else
        window.location.href = data.signedUrl;
}
/** Los bytes del PDF (para unirlo al PDF oficial). */
export async function bajarDocumento(ruta) {
    const { data, error } = await almacen().download(ruta);
    if (error || !data)
        throw new Error('No se ha podido bajar el documento del técnico');
    return new Uint8Array(await data.arrayBuffer());
}
/** Adivina el mes por el nombre del archivo («Toolbox marzo 2027.pdf», «03 - charla.pdf», «2027-03.pdf»…). */
export function mesDelNombre(nombre) {
    const n = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.pdf$/, '');
    for (let i = 0; i < 12; i++)
        if (n.includes(MESES[i]) || new RegExp(`(^|[^a-z])${MESES[i].slice(0, 3)}([^a-z]|$)`).test(n))
            return i + 1;
    const sinAnio = n.replace(/(19|20)\d{2}/g, ' ');
    const m = sinAnio.match(/(^|\D)(0?[1-9]|1[0-2])(\D|$)/);
    return m ? Number(m[2]) : null;
}
/** El PDF oficial seguido del documento del técnico, en un solo archivo. */
export async function unirPdfs(primero, segundo) {
    const { PDFDocument } = await import('pdf-lib');
    const total = await PDFDocument.load(primero);
    const otro = await PDFDocument.load(segundo, { ignoreEncryption: true });
    const paginas = await total.copyPages(otro, otro.getPageIndices());
    paginas.forEach((p) => total.addPage(p));
    return total.save();
}
