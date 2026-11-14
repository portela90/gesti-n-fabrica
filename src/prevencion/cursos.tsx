// Cursos y certificados de cada trabajador (en su ficha) y el expediente PRL: un solo PDF con todo lo suyo
// para una inspección o auditoría.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { descargar } from './pdfToolbox';
import { MESES, fechaCorta, hoy, prev, textoError, useAjustes, type Persona } from './comun';
import { abrirDocumento, bajarDocumento } from './documentos';
import { TIPOS, pdfDocumentos, resumenDoc, type Documento, type TipoDoc } from './documentos-firma';
import type { DatosFormacion, Evaluacion } from './formacion';

export interface Archivo { ruta: string; nombre: string; mime: string; sha256?: string }
export interface Curso {
  id: string; empresa_id: string; persona_id: string; tipo: string; titulo: string | null; entidad: string | null;
  fecha: string | null; horas: number | null; caduca: string | null; notas: string | null; archivos: Archivo[];
}
export const CURSOS = ['Carretilla elevadora', 'Plataforma elevadora (PEMP)', 'Puente grúa', 'Grúa móvil / autocargante', 'Trabajos en altura', 'Espacios confinados',
  'Riesgo eléctrico', 'PRL nivel básico (60 h)', 'PRL 20 h / 6 h oficio (TPC)', 'Primeros auxilios', 'Extinción de incendios / emergencias',
  'Manipulación de productos químicos', 'Manipulación manual de cargas'];

const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const masAnios = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setFullYear(d.getFullYear() + n); return d.toLocaleDateString('sv-SE'); };
/** Vigente, caduca pronto (60 días) o caducado. */
export function estadoCurso(c: Pick<Curso, 'caduca'>): [string, string] {
  if (!c.caduca) return ['Sin caducidad', 'sin'];
  const h = hoy();
  if (c.caduca < h) return ['Caducado', 'peligro'];
  if (c.caduca <= masDias(h, 60)) return ['Caduca pronto', 'pendiente'];
  return ['Vigente', 'firmado'];
}

async function sha256(b: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
/** Foto reducida a JPEG de 1700 px como mucho (para que no pese). */
function fotoAJpeg(f: File): Promise<Blob> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1700 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido leer la foto'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => mal(new Error('No se ha podido leer la foto'));
    img.src = URL.createObjectURL(f);
  });
}
async function subirCertificado(unidad: string, curso: string, f: File): Promise<Archivo> {
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!pdf && !f.type.startsWith('image/')) throw new Error('Tiene que ser una foto o un PDF');
  if (pdf && f.size > 20 * 1024 * 1024) throw new Error('El PDF pesa más de 20 MB');
  const datos = pdf ? f : await fotoAJpeg(f);
  const bytes = await datos.arrayBuffer();
  const mime = pdf ? 'application/pdf' : 'image/jpeg';
  const ruta = `${unidad}/cursos/${curso}/${Date.now()}.${pdf ? 'pdf' : 'jpg'}`;
  const { error } = await supabase.storage.from('prevencion').upload(ruta, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error('No se ha podido subir: ' + error.message);
  return { ruta, nombre: f.name.slice(0, 120), mime, sha256: await sha256(bytes) };
}

// ---------------------------------------------------------------------------------------------
// En la ficha: lista de cursos
// ---------------------------------------------------------------------------------------------
export function Cursos({ persona }: { persona: Persona }) {
  const { puede } = useSesion();
  const [cursos, setCursos] = useState<Curso[] | null>(null);
  const [abierto, setAbierto] = useState<Curso | 'nuevo' | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await prev().from('cursos').select('*').eq('persona_id', persona.id).order('fecha', { ascending: false });
    setCursos(((data ?? []) as Curso[]).sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')));
  }, [persona]);
  useEffect(() => { cargar(); }, [cargar]);
  return (
    <section className="cursos">
      <h3 className="subtitulo">Cursos y certificados</h3>
      {cursos === null ? <p className="nota">Cargando…</p> : !cursos.length ? <p className="nota">No tiene cursos apuntados.</p> : (
        <div className="lista">
          {cursos.map((c) => {
            const [t, k] = estadoCurso(c);
            return (
              <button key={c.id} type="button" className="fila" onClick={() => setAbierto(c)}>
                <span className="fila-txt"><b>{c.tipo}</b>
                  <small>{c.fecha ? fechaCorta(c.fecha) : 'sin fecha'}{c.entidad ? ` · ${c.entidad}` : ''}{c.caduca ? ` · caduca ${fechaCorta(c.caduca)}` : ''}
                    {' · '}{c.archivos.length ? `${c.archivos.length} archivo${c.archivos.length === 1 ? '' : 's'}` : 'sin certificado'}</small></span>
                {c.caduca && <span className={'chapa ' + k}>{t}</span>}
              </button>
            );
          })}
        </div>
      )}
      {puede('prevencion.ficha.editar') && <div className="botonera" style={{ marginTop: 8 }}><button type="button" className="boton sec" onClick={() => setAbierto('nuevo')}>＋ Curso o certificado</button></div>}
      {abierto && <EditarCurso persona={persona} curso={abierto === 'nuevo' ? null : abierto} alCerrar={() => setAbierto(null)} alGuardar={() => { setAbierto(null); cargar(); }} />}
    </section>
  );
}

function EditarCurso({ persona, curso, alCerrar, alGuardar }: { persona: Persona; curso: Curso | null; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa, puede } = useSesion();
  const editable = puede('prevencion.ficha.editar');
  const enLista = !curso || CURSOS.includes(curso.tipo);
  const [v, setV] = useState({
    tipo: curso ? (enLista ? curso.tipo : 'Otro') : CURSOS[0], otro: enLista ? '' : curso?.tipo ?? '', titulo: curso?.titulo ?? '', entidad: curso?.entidad ?? '',
    fecha: curso?.fecha ?? '', horas: curso?.horas != null ? String(curso.horas) : '', caduca: curso?.caduca ?? '', notas: curso?.notas ?? '',
  });
  const [archivos, setArchivos] = useState<Archivo[]>(curso?.archivos ?? []);
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pon = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function guardar() {
    const tipo = v.tipo === 'Otro' ? v.otro.trim() : v.tipo;
    if (!tipo) { setError('Escribe qué curso es.'); return; }
    if (v.fecha && v.caduca && v.caduca < v.fecha) { setError('No puede caducar antes de hacerlo.'); return; }
    setOcupado(true); setError(null);
    try {
      const id = curso?.id ?? crypto.randomUUID();
      const subidos: Archivo[] = [];
      for (const f of nuevos) subidos.push(await subirCertificado(empresa!.id, id, f));
      const fila = {
        tipo, titulo: v.titulo.trim() || null, entidad: v.entidad.trim() || null, fecha: v.fecha || null, horas: v.horas ? Number(v.horas) : null,
        caduca: v.caduca || null, notas: v.notas.trim() || null, archivos: [...archivos, ...subidos],
      };
      const { error } = curso ? await prev().from('cursos').update(fila).eq('id', curso.id)
        : await prev().from('cursos').insert({ ...fila, id, empresa_id: empresa!.id, persona_id: persona.id });
      if (error) throw new Error(textoError(error.message));
      aviso('Curso guardado'); alGuardar();
    } catch (e) { setError((e as Error).message); }
    setOcupado(false);
  }
  async function borrar() {
    if (!curso || !confirm(`¿Borrar el curso «${curso.tipo}»?`)) return;
    const { error } = await prev().from('cursos').delete().eq('id', curso.id);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Curso borrado'); alGuardar();
  }
  return (
    <Ventana titulo={`${curso ? 'Curso' : 'Nuevo curso'} · ${persona.nombre}`} alCerrar={alCerrar}
      pie={editable ? <>{curso && <button type="button" className="boton txt peligro" onClick={borrar}>Borrar</button>}
        <button type="button" className="boton" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button></> : undefined}>
      <fieldset className="formulario" disabled={!editable}>
        <label className="campo"><span>Tipo de curso</span>
          <select value={v.tipo} onChange={pon('tipo')}>{[...CURSOS, 'Otro'].map((c) => <option key={c}>{c}</option>)}</select></label>
        {v.tipo === 'Otro' && <label className="campo"><span>¿Qué curso?</span><input maxLength={80} value={v.otro} onChange={pon('otro')} /></label>}
        <label className="campo"><span>Nombre del curso o detalle (opcional)</span><input maxLength={200} value={v.titulo} onChange={pon('titulo')} /></label>
        <label className="campo"><span>Entidad que lo imparte</span><input maxLength={120} value={v.entidad} onChange={pon('entidad')} /></label>
        <div className="dos">
          <label className="campo"><span>Fecha del curso</span><input type="date" value={v.fecha} onChange={pon('fecha')} /></label>
          <label className="campo"><span>Horas</span><input type="number" min={0} step={0.5} inputMode="decimal" value={v.horas} onChange={pon('horas')} /></label>
        </div>
        <label className="campo"><span>Caduca (renovar antes de)</span><input type="date" value={v.caduca} onChange={pon('caduca')} /></label>
        <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: -6 }}>
          {[1, 3, 5].map((n) => <button key={n} type="button" className="boton txt peq" onClick={() => {
            if (!v.fecha) { setError('Pon antes la fecha del curso.'); return; } setV((x) => ({ ...x, caduca: masAnios(x.fecha, n) }));
          }}>+{n} año{n > 1 ? 's' : ''}</button>)}
        </div>
        <label className="campo"><span>Notas</span><textarea rows={2} maxLength={1000} value={v.notas} onChange={pon('notas')} /></label>
      </fieldset>
      <div className="campo"><span>Certificado o diploma (foto o PDF; sale en su expediente)</span>
        {archivos.map((a) => (
          <div key={a.ruta} className="fila fija centrada">
            <span className="fila-txt"><b>{a.mime === 'application/pdf' ? 'PDF' : 'Foto'}</b><small>{a.nombre}</small></span>
            <button type="button" className="boton txt peq" onClick={async () => { try { await abrirDocumento(a.ruta); } catch (e) { aviso((e as Error).message); } }}>Ver</button>
            {editable && <button type="button" className="boton txt peq" onClick={() => setArchivos((x) => x.filter((y) => y.ruta !== a.ruta))}>Quitar</button>}
          </div>
        ))}
        {nuevos.map((f, i) => (
          <div key={i} className="fila fija centrada"><span className="fila-txt"><b>Nuevo</b><small>{f.name}</small></span>
            <button type="button" className="boton txt peq" onClick={() => setNuevos((x) => x.filter((_, j) => j !== i))}>Quitar</button></div>
        ))}
        {editable && <label className="boton sec archivo" style={{ alignSelf: 'flex-start' }}>Adjuntar foto o PDF
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; setNuevos((x) => [...x, ...f]); }} /></label>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Expediente PRL: un PDF con la portada, los resúmenes y, detrás, todo lo firmado y los certificados
// ---------------------------------------------------------------------------------------------
interface Ficha { dni: string | null; puesto: string | null; fecha_alta: string | null; fecha_baja: string | null; idioma: string | null }

export function BotonExpediente({ persona }: { persona: Persona }) {
  const ajustes = useAjustes();
  const [haciendo, setHaciendo] = useState(false);
  return (
    <button type="button" className="boton" disabled={haciendo} onClick={async () => {
      setHaciendo(true);
      try { descargar(await expediente(persona, ajustes), `Expediente PRL ${persona.nombre}.pdf`); }
      catch (e) { aviso('No se ha podido hacer el expediente: ' + (e as Error).message); }
      setHaciendo(false);
    }}>{haciendo ? 'Haciendo el expediente…' : 'Expediente PRL (PDF)'}</button>
  );
}

export async function expediente(persona: Persona, ajustes: Record<string, string>): Promise<Uint8Array> {
  const [rf, rd, rc, ra] = await Promise.all([
    prev().from('fichas').select('dni, puesto, fecha_alta, fecha_baja, idioma').eq('persona_id', persona.id).maybeSingle(),
    prev().from('documentos').select('*').eq('persona_id', persona.id),
    prev().from('cursos').select('*').eq('persona_id', persona.id),
    prev().from('asistencias').select('*').eq('persona_id', persona.id).is('anulada', null),
  ]);
  const ficha = (rf.data ?? null) as Ficha | null;
  const docs = ((rd.data ?? []) as Documento[]).filter((d) => !d.anulado);
  const cursos = (rc.data ?? []) as Curso[];
  const asis = (ra.data ?? []) as { sesion_id: string; creado: string }[];
  const sids = asis.map((a) => a.sesion_id);
  const ses = sids.length ? ((await prev().from('sesiones').select('id, charla_id, denominacion').in('id', sids)).data ?? []) as { id: string; charla_id: string; denominacion: string | null }[] : [];
  const cids = ses.map((x) => x.charla_id);
  const chs = cids.length ? ((await prev().from('charlas').select('id, anio, mes, tema').in('id', cids)).data ?? []) as { id: string; anio: number; mes: number; tema: string | null }[] : [];

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
  type F = typeof font;
  const NAVY = rgb(0.09, 0.13, 0.35), GRIS = rgb(0.45, 0.45, 0.45), LINEA = rgb(0.8, 0.82, 0.86), TINTA = rgb(0.1, 0.1, 0.1);
  const W = 595.28, H = 841.89, L = 50, R = 545;
  let pg = out.addPage([W, H]); let y = 60;
  // Helvetica de pdf-lib solo escribe letras «occidentales»: lo que no sepa escribir se cambia por «?»
  const limpio = (s: unknown) => String(s ?? '').replace(/[^ -ÿ€–—‘’“”•…]/g, '?');
  const t1 = (s: unknown, x: number, size = 10, f: F = font, c = TINTA) => pg.drawText(limpio(s), { x, y: H - y, size, font: f, color: c });
  const sitio = (h: number) => { if (y + h > H - 50) { pg = out.addPage([W, H]); y = 60; } };
  const partir = (s: string, size: number, f: F, max: number) => { const ls: string[] = []; let cur = ''; for (const w of limpio(s).split(' ')) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > max && cur) { ls.push(cur); cur = w; } else cur = t; } if (cur) ls.push(cur); return ls.length ? ls : ['']; };
  const fechaHora = (t: string) => new Date(t).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  pg.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: NAVY });
  pg.drawText('EXPEDIENTE PRL DEL TRABAJADOR', { x: L, y: H - 48, size: 16, font: bold, color: rgb(1, 1, 1) });
  pg.drawText(limpio(`Entregas de EPI, formación, información y cursos · hecho el ${fechaHora(new Date().toISOString())}`), { x: L, y: H - 68, size: 9.5, font, color: rgb(0.85, 0.88, 0.95) });
  y = 125;
  const dato = (k: string, v: unknown) => { t1(k, L, 10, bold); t1(v || '—', L + 100, 10); y += 18; };
  dato('Trabajador/a:', persona.nombre); dato('DNI / NIE:', ficha?.dni); dato('Puesto:', ficha?.puesto ?? persona.categoria);
  dato('Empresa:', ajustes.empresa); dato('Centro:', ajustes.centro);
  dato('Fecha de alta:', ficha?.fecha_alta ? fechaCorta(ficha.fecha_alta) : null);
  if (ficha?.fecha_baja) dato('Fecha de baja:', fechaCorta(ficha.fecha_baja));
  if (ficha?.idioma) dato('Idioma:', ficha.idioma);

  const tabla = (titulo: string, cab: string[], xs: number[], filas: string[][]) => {
    y += 22; sitio(50); t1(titulo, L, 12, bold, NAVY); y += 8;
    pg.drawLine({ start: { x: L, y: H - y }, end: { x: R, y: H - y }, thickness: 1, color: NAVY }); y += 14;
    cab.forEach((c, i) => t1(c, xs[i], 8.5, bold, GRIS)); y += 6;
    if (!filas.length) { y += 12; t1('Sin registros.', L, 9.5, font, GRIS); return; }
    for (const f of filas) {
      const ls = f.map((c, i) => partir(c, 9, font, (xs[i + 1] ?? R) - xs[i] - 8));
      const h = Math.max(...ls.map((l) => l.length)) * 11 + 6; sitio(h + 4);
      pg.drawLine({ start: { x: L, y: H - y }, end: { x: R, y: H - y }, thickness: 0.5, color: LINEA }); y += 12;
      ls.forEach((l, i) => l.forEach((s, j) => pg.drawText(s, { x: xs[i], y: H - (y + j * 11), size: 9, font, color: TINTA }))); y += h - 12;
    }
  };
  const firmados = docs.filter((d) => d.firma_id);
  const estado = (d: Documento) => (d.firma_id ? `Firmado ${fechaHora(d.firmado_en!)}` : 'PENDIENTE DE FIRMA');
  tabla('Entregas de EPI', ['Fecha', 'Equipos y prendas', 'Estado'], [L, 110, 400],
    docs.filter((d) => d.tipo === 'epi' || d.tipo === 'epi_col').sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((d) => [fechaCorta(d.fecha), `${d.tipo === 'epi_col' ? 'Altura (uso colectivo): ' : ''}${resumenDoc(d)}`, estado(d)]));
  const evalTxt = (e?: Evaluacion | null) => (e?.eficaz === true ? ' · eficaz' : e?.eficaz === false ? ' · no eficaz' : '');
  tabla('Formación y cursos', ['Curso', 'Fecha', 'Horas', 'Caduca', 'Estado'], [L, 290, 350, 395, 455], [
    ...cursos.map((c) => [`${c.tipo}${c.titulo ? ` · ${c.titulo}` : ''}${c.entidad ? ` (${c.entidad})` : ''}`, c.fecha ? fechaCorta(c.fecha) : '—',
      c.horas != null ? String(c.horas) : '—', c.caduca ? fechaCorta(c.caduca) : '—', estadoCurso(c)[0] + (c.archivos.length ? ' · certificado adjunto' : '')]),
    ...docs.filter((d) => d.tipo === 'formacion').map((d) => [`Formación práctica en el puesto (F40R304)${(d.datos as unknown as DatosFormacion).impartida ? ` · ${(d.datos as unknown as DatosFormacion).impartida}` : ''}`,
      fechaCorta(d.fecha), (d.datos as unknown as DatosFormacion).duracion || '—', '—', (d.firma_id ? 'Firmada' : 'Pendiente de firma') + evalTxt(d.evaluacion)]),
  ]);
  const hist: [string, string, string, string][] = [
    ...docs.map((d) => [d.fecha, TIPOS[d.tipo].codigo.replace('SH-CORP-SP-', ''), `${TIPOS[d.tipo].titulo}: ${resumenDoc(d)}`, estado(d)] as [string, string, string, string]),
    ...asis.map((a) => {
      const s = ses.find((x) => x.id === a.sesion_id); const c = s && chs.find((x) => x.id === s.charla_id);
      return [a.creado.slice(0, 10), 'FO-IB-031', `Toolbox ${c ? `${MESES[c.mes - 1]} ${c.anio}` : ''}${c?.tema ? `: ${c.tema}` : ''}`, `Firmado ${fechaHora(a.creado)}`] as [string, string, string, string];
    }),
  ].sort((a, b) => b[0].localeCompare(a[0]));
  tabla('Historial de documentos', ['Fecha', 'Documento', 'Contenido', 'Estado'], [L, 105, 170, 430], hist.map((h) => [fechaCorta(h[0]), h[1], h[2], h[3]]));
  y += 24; sitio(30); t1('A continuación van los documentos firmados por el trabajador y los certificados de sus cursos.', L, 9, font, GRIS);

  // detrás: los PDF oficiales de lo firmado (cada tipo con su hoja) y los certificados
  const pegar = async (bytes: Uint8Array) => { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); };
  for (const tipo of ['epi', 'epi_col', 'formacion', 'info', 'autoriz'] as TipoDoc[]) {
    const deEse = firmados.filter((d) => d.tipo === tipo).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (deEse.length) await pegar(await pdfDocumentos(deEse, ajustes));
  }
  for (const c of cursos) for (const a of c.archivos) {
    try {
      const bytes = await bajarDocumento(a.ruta);
      if (a.mime === 'application/pdf') { await pegar(bytes); continue; }
      const im = a.mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      pg = out.addPage([W, H]);
      pg.drawText(limpio(`${c.tipo}${c.titulo ? ` · ${c.titulo}` : ''}`).slice(0, 90), { x: 40, y: 805, size: 11, font: bold, color: NAVY });
      pg.drawText(limpio(`${persona.nombre}${c.fecha ? ` · ${fechaCorta(c.fecha)}` : ''}${c.caduca ? ` · caduca ${fechaCorta(c.caduca)}` : ''}`), { x: 40, y: 790, size: 9, font, color: GRIS });
      const k = Math.min(515 / im.width, 730 / im.height);
      pg.drawImage(im, { x: 40 + (515 - im.width * k) / 2, y: 40 + (730 - im.height * k) / 2, width: im.width * k, height: im.height * k });
    } catch { /* un archivo que no se puede leer no impide el resto */ }
  }
  return out.save();
}
