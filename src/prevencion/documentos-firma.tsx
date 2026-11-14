// Documentos que firma cada trabajador: entrega de EPI (FO-014), formación en el puesto (F40R304) y entrega de
// información (FP-022). Hacerlos (jefe o encargado), enviarlos a firmar, recoger la firma en el móvil, que el
// trabajador los lea y firme, anular, evaluar la formación y sacar el PDF oficial.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { descargar } from './pdfToolbox';
import { fechaCorta, hoy, prev, textoError, useAjustes, usePersonas, type Persona } from './comun';
import {
  CODIGO_EPI, EPI_DECL, EPI_GRUPOS, EPI_INTRO, EPI_ITEMS, MOTIVOS_EPI, lineasEpi, pdfEpi,
  type DatosEpi, type LineaEpi, type OtroEpi,
} from './epi';
import { CODIGO_F40, F_INTRO, F_ITEMS, F_REVERSO, pdfFormacion, tituloPunto, type DatosFormacion, type Evaluacion } from './formacion';
import { CODIGO_INFO, INFO_COMPROMISO, INFO_DOCS, INFO_INTRO, pdfInfo, type DatosInfo } from './info';

export type TipoDoc = 'epi' | 'formacion' | 'info';
export interface Documento {
  id: string; empresa_id: string; tipo: TipoDoc; persona_id: string; nombre: string | null; fecha: string;
  datos: Record<string, unknown>; evaluacion?: Evaluacion | null;
  enviado_en: string | null; firma_id: string | null; firmado_en: string | null; anulado: string | null; creado: string;
}
export const TIPOS: Record<TipoDoc, { titulo: string; plural: string; codigo: string; firmar: string; declaro: string }> = {
  epi: { titulo: 'Entrega de EPI', plural: 'Entregas de EPI', codigo: CODIGO_EPI, firmar: 'He recibido los equipos, firmar', declaro: 'Firmo que he recibido los equipos y conozco su uso correcto.' },
  formacion: { titulo: 'Formación en el puesto', plural: 'Formación en el puesto', codigo: CODIGO_F40, firmar: 'Me lo han enseñado, firmar',
    declaro: 'Me han enseñado las instalaciones, los equipos y las tareas, y cómo hacerlas de forma segura. Lo he entendido.' },
  info: { titulo: 'Entrega de información', plural: 'Entrega de información', codigo: CODIGO_INFO, firmar: 'La he recibido, firmar',
    declaro: 'He recibido esta información y me comprometo a leerla.' },
};
const ANIO_ACTUAL = new Date().getFullYear();
const ROPA = ['Pantalón de trabajo', 'Camiseta manga corta', 'Camiseta manga larga', 'Polo', 'Camisa', 'Chaqueta', 'Forro polar', 'Chaleco', 'Sudadera', 'Bata', 'Gorra', 'Calcetines'];

export function estadoDoc(d: Documento): [string, string] {
  if (d.anulado) return ['Anulado', 'sin'];
  if (d.firma_id) {
    if (d.tipo === 'formacion' && d.evaluacion?.eficaz === false) return ['No eficaz', 'pendiente'];
    if (d.tipo === 'formacion' && d.evaluacion?.eficaz !== true) return ['Sin evaluar', 'firmado'];
    return ['Firmado', 'firmado'];
  }
  if (d.enviado_en) return ['Sin firmar', 'pendiente'];
  return ['Sin enviar', 'sin'];
}
/** Lo que lleva, en una línea (para las listas). */
export function resumenDoc(d: Documento): string {
  if (d.tipo === 'epi') return lineasEpi(d.datos as unknown as DatosEpi).map((l) => l.split(' · ')[0].replace(/\s*\(.*\)$/, '')).join(', ') || '—';
  if (d.tipo === 'formacion') return ((d.datos as unknown as DatosFormacion).items ?? []).map((n) => tituloPunto(n).replace(/^\d+\. /, '')).join(', ');
  return 'Información de prevención de su puesto';
}
export const tituloDoc = (d: Documento) => `${TIPOS[d.tipo].titulo} · ${fechaCorta(d.fecha)}`;
const nombrePdf = (d: Documento) => `${TIPOS[d.tipo].codigo} ${TIPOS[d.tipo].titulo} ${d.nombre ?? ''} ${d.fecha}.pdf`;

/** PDF oficial de uno o varios documentos del mismo tipo, con las firmas, el DNI y el puesto (si se pueden ver). */
export async function pdfDocumentos(docs: Documento[], ajustes: Record<string, string>) {
  const pids = [...new Set(docs.map((d) => d.persona_id))];
  const fids = docs.map((d) => d.firma_id).filter(Boolean) as string[];
  const [fichas, personas, firmas] = await Promise.all([
    prev().from('fichas').select('persona_id, dni, puesto').in('persona_id', pids),
    nucleo().from('personas').select('id, categoria').in('id', pids),
    fids.length ? nucleo().from('firmas').select('id, imagen').in('id', fids) : Promise.resolve({ data: [] }),
  ]);
  const fi = (fichas.data ?? []) as { persona_id: string; dni: string | null; puesto: string | null }[];
  const pe = (personas.data ?? []) as { id: string; categoria: string | null }[];
  const fr = (firmas.data ?? []) as { id: string; imagen: string }[];
  const base = (d: Documento) => {
    const f = fi.find((x) => x.persona_id === d.persona_id);
    return { nombre: d.nombre ?? '', dni: f?.dni ?? null, puesto: f?.puesto ?? pe.find((x) => x.id === d.persona_id)?.categoria ?? null,
      fecha: d.fecha, firma: fr.find((x) => x.id === d.firma_id)?.imagen ?? null, firmado_en: d.firmado_en };
  };
  const sello = ajustes.sello || ajustes.firma_formador || null;
  const tipo = docs[0]?.tipo;
  if (docs.some((d) => d.tipo !== tipo)) throw new Error('Los documentos tienen que ser del mismo tipo');
  if (tipo === 'formacion') return pdfFormacion(docs.map((d) => ({ ...base(d), datos: d.datos as unknown as DatosFormacion, evaluacion: d.evaluacion ?? null })),
    ajustes.firma_resp || null, ajustes.firma_formador || null);
  if (tipo === 'info') return pdfInfo(docs.map((d) => ({ ...base(d), datos: d.datos as unknown as DatosInfo })), sello);
  return pdfEpi(docs.map((d) => ({ ...base(d), datos: d.datos as unknown as DatosEpi })), sello);
}
export async function descargarDocumentos(docs: Documento[], ajustes: Record<string, string>, nombre?: string) {
  try { descargar(await pdfDocumentos(docs, ajustes), nombre ?? nombrePdf(docs[0])); }
  catch (e) { aviso('No se ha podido hacer el PDF: ' + (e as Error).message); }
}

// ---------------------------------------------------------------------------------------------
// Lista del año, por tipo
// ---------------------------------------------------------------------------------------------
export function Documentos() {
  const { empresa, puede } = useSesion();
  const ajustes = useAjustes();
  const [tipo, setTipo] = useState<TipoDoc>('epi');
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [nueva, setNueva] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const editable = puede('prevencion.documento.editar');

  const cargar = useCallback(async () => {
    const { data } = await prev().from('documentos').select('*').eq('empresa_id', empresa!.id).eq('tipo', tipo)
      .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha', { ascending: false });
    setDocs(((data ?? []) as Documento[]).sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.nombre ?? '').localeCompare(b.nombre ?? '')));
  }, [empresa, anio, tipo]);
  useEffect(() => { setDocs(null); cargar(); }, [cargar]);

  const firmados = (docs ?? []).filter((d) => d.firma_id && !d.anulado);
  const sinFirmar = (docs ?? []).filter((d) => !d.firma_id && !d.anulado);
  const doc = docs?.find((d) => d.id === abierto) ?? null;
  const T = TIPOS[tipo];
  return (
    <>
      <div className="segmentos tres no-imprimir" role="group" aria-label="Tipo de documento">
        {(Object.keys(TIPOS) as TipoDoc[]).map((k) => (
          <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{k === 'epi' ? 'EPI' : k === 'formacion' ? 'Formación' : 'Información'}</button>))}
      </div>
      <div className="filtros">
        <label className="campo"><span>Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => <option key={a}>{a}</option>)}
          </select></label>
        {editable && <div className="campo"><span aria-hidden="true">&nbsp;</span><button type="button" className="boton" onClick={() => setNueva(true)}>＋ {T.titulo}</button></div>}
      </div>
      {docs === null ? <p className="nota">Cargando…</p> : !docs.length ? <div className="vacio"><p>No hay {T.plural.toLowerCase()} en {anio}.</p></div> : (
        <>
          <p className="nota" style={{ marginTop: 0 }}>{T.codigo} · {docs.length} en {anio}{sinFirmar.length ? ` · ${sinFirmar.length} sin firmar` : ''}.</p>
          <div className="lista">
            {docs.map((d) => {
              const [t, c] = estadoDoc(d);
              return (
                <button key={d.id} type="button" className={'fila' + (d.anulado ? ' de-baja' : '')} onClick={() => setAbierto(d.id)}>
                  <span className="fila-txt"><b>{d.nombre}</b><small>{fechaCorta(d.fecha)} · {resumenDoc(d)}</small></span>
                  <span className={'chapa ' + c}>{t}</span>
                </button>
              );
            })}
          </div>
          <div className="botonera">
            {editable && sinFirmar.some((d) => !d.enviado_en) && <button type="button" className="boton sec" onClick={async () => {
              const { data, error } = await prev().rpc('enviar_documentos', { p_ids: sinFirmar.map((d) => d.id) });
              if (error) { aviso(textoError(error.message)); return; }
              aviso(`Enviados: faltan ${data} por firmar`); cargar();
            }}>Enviar los que faltan</button>}
            {firmados.length > 0 && <button type="button" className="boton sec" disabled={haciendo} onClick={async () => {
              setHaciendo(true); await descargarDocumentos(firmados, ajustes, `${T.codigo} ${T.plural} ${anio}.pdf`); setHaciendo(false);
            }}>{haciendo ? 'Haciendo el PDF…' : `PDF de todos los firmados (${firmados.length})`}</button>}
          </div>
        </>
      )}
      {nueva && <EditarDocumento tipo={tipo} doc={null} alCerrar={() => setNueva(false)} alGuardar={() => { setNueva(false); cargar(); }} />}
      {doc && <DetalleDocumento doc={doc} alCerrar={() => setAbierto(null)} alCambiar={cargar} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Hacer o cambiar un documento: trabajadores, fecha y lo de cada tipo
// ---------------------------------------------------------------------------------------------
function Motivo({ v, alCambiar }: { v: LineaEpi; alCambiar: (x: LineaEpi) => void }) {
  return (
    <span className="motivo">
      <select aria-label="Motivo" value={v.motivo ?? 'Primera entrega'} onChange={(e) => alCambiar({ ...v, motivo: e.target.value })}>
        {MOTIVOS_EPI.map((m) => <option key={m}>{m}</option>)}
      </select>
      {v.motivo === 'Otro' && <input aria-label="Escribe el motivo" placeholder="Escribe el motivo" maxLength={80} value={v.mtxt ?? ''} onChange={(e) => alCambiar({ ...v, mtxt: e.target.value })} />}
    </span>
  );
}

function FormEpi({ v, alCambiar }: { v: DatosEpi; alCambiar: (x: DatosEpi) => void }) {
  const { empresa } = useSesion();
  const [prendas, setPrendas] = useState<string[]>([]);
  useEffect(() => {
    prev().from('prendas').select('nombre').eq('empresa_id', empresa!.id).is('baja', null)
      .then(({ data }) => setPrendas(((data ?? []) as { nombre: string }[]).map((x) => x.nombre)));
  }, [empresa]);
  const items = v.items ?? {};
  const otros = useMemo(() => { const o = [...(v.otros ?? [])]; while (o.length < 4) o.push({ t: '' }); return o; }, [v.otros]);
  const marca = (k: string, on: boolean) => { const n = { ...items }; if (on) n[k] = n[k] ?? { u: '1', motivo: 'Primera entrega' }; else delete n[k]; alCambiar({ ...v, items: n }); };
  const pon = (k: string, x: LineaEpi) => alCambiar({ ...v, items: { ...items, [k]: x } });
  const ponOtro = (i: number, x: OtroEpi) => alCambiar({ ...v, otros: otros.map((o, j) => (j === i ? x : o)) });
  return (
    <>
      {EPI_GRUPOS.map(([g, claves]) => (
        <fieldset key={g} className="grupo-epi">
          <legend>{g}</legend>
          {claves.map((k) => {
            const it = EPI_ITEMS.find((i) => i[0] === k)!; const x = items[k];
            return (
              <div key={k} className="linea-epi">
                <label className="casilla"><input type="checkbox" checked={!!x} onChange={(e) => marca(k, e.target.checked)} /> {it[1]}</label>
                {x && <>
                  <input className="ud" aria-label={`Unidades de ${it[1]}`} type="number" min={1} inputMode="numeric" value={x.u ?? ''} onChange={(e) => pon(k, { ...x, u: e.target.value })} />
                  <Motivo v={x} alCambiar={(y) => pon(k, y)} />
                  {it[5] && <span className="cats">{it[5].map((c) => (
                    <label key={c} className="casilla peq"><input type="checkbox" checked={(x.cat ?? []).includes(c)}
                      onChange={(e) => pon(k, { ...x, cat: e.target.checked ? [...(x.cat ?? []), c] : (x.cat ?? []).filter((y) => y !== c) })} /> {c}</label>))}</span>}
                </>}
              </div>
            );
          })}
        </fieldset>
      ))}
      <fieldset className="grupo-epi">
        <legend>Ropa de trabajo y otros <small>(hasta 4)</small></legend>
        <datalist id="ropa-epi">{[...new Set([...prendas, ...ROPA])].map((r) => <option key={r} value={r} />)}</datalist>
        {otros.map((o, i) => (
          <div key={i} className="linea-epi">
            <input className="otro" list="ropa-epi" aria-label={`Prenda ${i + 1}`} placeholder="Prenda o elemento" maxLength={60} value={o.t} onChange={(e) => ponOtro(i, { ...o, t: e.target.value })} />
            <input className="ud" aria-label={`Unidades de la prenda ${i + 1}`} type="number" min={1} inputMode="numeric" placeholder="Ud." value={o.u ?? ''} onChange={(e) => ponOtro(i, { ...o, u: e.target.value })} />
            {o.t.trim() && <Motivo v={o} alCambiar={(y) => ponOtro(i, { ...o, ...y })} />}
          </div>
        ))}
      </fieldset>
    </>
  );
}

function FormFormacion({ v, alCambiar }: { v: DatosFormacion; alCambiar: (x: DatosFormacion) => void }) {
  const items = new Set(v.items ?? []);
  const pon = (k: keyof DatosFormacion) => (e: { target: { value: string } }) => alCambiar({ ...v, [k]: e.target.value });
  return (
    <>
      <label className="campo"><span>Dirección de servicio</span><input maxLength={120} value={v.direccion ?? ''} onChange={pon('direccion')} /></label>
      <div className="dos">
        <label className="campo"><span>Duración</span><input maxLength={30} placeholder="ej. 2 h" value={v.duracion ?? ''} onChange={pon('duracion')} /></label>
        <label className="campo"><span>Formación impartida por</span><input maxLength={80} value={v.impartida ?? ''} onChange={pon('impartida')} /></label>
      </div>
      <fieldset className="grupo-epi">
        <legend>Formación en</legend>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="linea-epi">
            <label className="casilla"><input type="checkbox" checked={items.has(n)}
              onChange={(e) => alCambiar({ ...v, items: e.target.checked ? [...items, n].sort() : [...items].filter((x) => x !== n) })} /> {n}. {F_ITEMS[n]}</label>
            {n === 1 && items.has(1) && <input className="otro" aria-label="Otros del punto 1" placeholder="Otros (punto 1, opcional)" maxLength={120} value={v.otros1 ?? ''} onChange={pon('otros1')} />}
            {n === 6 && items.has(6) && <input className="otro" aria-label="¿Qué otra formación?" placeholder="¿Qué otra formación?" maxLength={120} value={v.otros6 ?? ''} onChange={pon('otros6')} />}
          </div>
        ))}
      </fieldset>
    </>
  );
}

function FormInfo({ v, alCambiar }: { v: DatosInfo; alCambiar: (x: DatosInfo) => void }) {
  return (
    <>
      <label className="campo"><span>Empresa</span><input maxLength={120} value={v.empresa ?? ''} onChange={(e) => alCambiar({ ...v, empresa: e.target.value })} /></label>
      <label className="campo"><span>Enlace donde está la información (opcional)</span><input type="url" maxLength={300} value={v.enlace ?? ''} onChange={(e) => alCambiar({ ...v, enlace: e.target.value })} /></label>
      <p className="nota">Se le entrega: {INFO_DOCS.join(' · ')}</p>
    </>
  );
}

/** Lo que se pone solo en un documento nuevo (de «Datos por defecto»). */
function datosNuevos(tipo: TipoDoc, a: Record<string, string>, yo: string): Record<string, unknown> {
  if (tipo === 'formacion') return { items: [1, 2, 3, 4, 5], direccion: a.direccion || a.centro || '', impartida: a.formador || yo, duracion: '' };
  if (tipo === 'info') return { empresa: a.empresa ?? '', lugar: a.centro ?? '', enlace: a.enlace_info ?? '' };
  return { items: {}, otros: [], lugar: a.centro ?? '' };
}

function EditarDocumento({ tipo, doc, alCerrar, alGuardar }: { tipo: TipoDoc; doc: Documento | null; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa, estado } = useSesion();
  const personas = usePersonas();
  const ajustes = useAjustes();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [fecha, setFecha] = useState(doc?.fecha ?? hoy());
  const [datos, setDatos] = useState<Record<string, unknown> | null>(doc?.datos ?? null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // los datos por defecto llegan después de abrir: se ponen si aún no se ha tocado nada
  useEffect(() => { if (!doc && datos === null && Object.keys(ajustes).length) setDatos(datosNuevos(tipo, ajustes, yo)); }, [doc, datos, ajustes, tipo, yo]);
  const d = datos ?? datosNuevos(tipo, ajustes, yo);
  const activos = personas.filter((p) => !p.baja);

  function limpiar(): Record<string, unknown> | string {
    if (tipo === 'epi') {
      const x = d as unknown as DatosEpi;
      const otros = (x.otros ?? []).filter((o) => o.t.trim()).map((o) => ({ ...o, t: o.t.trim(), motivo: o.motivo ?? 'Primera entrega' }));
      if (!Object.keys(x.items ?? {}).length && !otros.length) return 'Marca al menos un equipo o prenda.';
      return { ...x, otros, lugar: (x.lugar ?? '').trim() };
    }
    if (tipo === 'formacion') {
      const x = d as unknown as DatosFormacion;
      if (!(x.items ?? []).length) return 'Marca al menos un punto de «Formación en».';
      if ((x.items ?? []).includes(6) && !x.otros6?.trim()) return 'Escribe qué otra formación (punto 6).';
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, typeof y === 'string' ? y.trim() : y]));
    }
    return Object.fromEntries(Object.entries(d).map(([k, y]) => [k, typeof y === 'string' ? y.trim() : y]));
  }
  async function guardar(enviar: boolean) {
    const limpios = limpiar();
    if (typeof limpios === 'string') { setError(limpios); return; }
    if (!doc && !elegidos.size) { setError('Elige al menos un trabajador.'); return; }
    if (!fecha) { setError('Falta la fecha.'); return; }
    setOcupado(true); setError(null);
    let ids: string[] = [];
    if (doc) {
      const { error } = await prev().from('documentos').update({ fecha, datos: limpios }).eq('id', doc.id);
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
      ids = [doc.id];
    } else {
      const { data, error } = await prev().from('documentos')
        .insert([...elegidos].map((p) => ({ empresa_id: empresa!.id, tipo, persona_id: p, fecha, datos: limpios }))).select('id');
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
      ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
    }
    if (enviar && ids.length) {
      const { error } = await prev().rpc('enviar_documentos', { p_ids: ids });
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
    }
    setOcupado(false);
    aviso(enviar ? 'Guardado y enviado a firmar' : 'Guardado'); alGuardar();
  }
  return (
    <Ventana titulo={doc ? `${TIPOS[tipo].titulo} · ${doc.nombre}` : `Nueva: ${TIPOS[tipo].titulo.toLowerCase()}`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(false)}>Guardar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar(true)}>{doc?.enviado_en ? 'Guardar y avisar' : 'Guardar y enviar'}</button></>}>
      {!doc && (
        <fieldset className="grupo-epi">
          <legend>Trabajadores <small>(se hace uno para cada uno)</small></legend>
          <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            <button type="button" className="boton txt peq" onClick={() => setElegidos(new Set(activos.map((p) => p.id)))}>Todos</button>
            <button type="button" className="boton txt peq" onClick={() => setElegidos(new Set())}>Ninguno</button>
          </div>
          {activos.map((p: Persona) => (
            <label key={p.id} className="casilla"><input type="checkbox" checked={elegidos.has(p.id)}
              onChange={(e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /> {p.nombre}</label>
          ))}
        </fieldset>
      )}
      <div className="dos">
        <label className="campo"><span>Fecha</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        {tipo !== 'formacion' && <label className="campo"><span>Lugar («En …, a …»)</span>
          <input value={String(d.lugar ?? '')} maxLength={80} onChange={(e) => setDatos({ ...d, lugar: e.target.value })} /></label>}
      </div>
      {tipo === 'epi' && <FormEpi v={d as unknown as DatosEpi} alCambiar={(x) => setDatos(x as unknown as Record<string, unknown>)} />}
      {tipo === 'formacion' && <FormFormacion v={d as unknown as DatosFormacion} alCambiar={(x) => setDatos(x as unknown as Record<string, unknown>)} />}
      {tipo === 'info' && <FormInfo v={d as DatosInfo} alCambiar={(x) => setDatos(x as Record<string, unknown>)} />}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Un documento: lo que lee el trabajador, su estado y lo que se puede hacer
// ---------------------------------------------------------------------------------------------
export function TextoDocumento({ d }: { d: Documento }) {
  const T = TIPOS[d.tipo];
  if (d.tipo === 'formacion') {
    const x = d.datos as unknown as DatosFormacion;
    return (
      <div className="charla">
        <p className="nota" style={{ marginTop: 0 }}>{T.codigo} · Formación práctica en el puesto · {fechaCorta(d.fecha)}{x.duracion ? ` · ${x.duracion}` : ''}{x.impartida ? ` · ${x.impartida}` : ''}</p>
        <p>{F_INTRO}</p>
        {(x.items ?? []).map((n) => n === 6
          ? <div key={n}><h3 className="subtitulo">6. Otros</h3><p>{x.otros6}</p></div>
          : <div key={n}><h3 className="subtitulo">{tituloPunto(n)}</h3><p>{F_REVERSO[n].intro}</p>
            {F_REVERSO[n].grupos.map(([t, l]) => <div key={t}><p style={{ marginBottom: 4 }}><b>{t}</b></p><ul>{l.map((y) => <li key={y}>{y}</li>)}</ul></div>)}
            {n === 1 && x.otros1 && <p><b>Otros:</b> {x.otros1}</p>}</div>)}
      </div>
    );
  }
  if (d.tipo === 'info') {
    const x = d.datos as DatosInfo;
    return (
      <div className="charla">
        <p className="nota" style={{ marginTop: 0 }}>{T.codigo} · Entrega de información · {fechaCorta(d.fecha)}</p>
        <p>{INFO_INTRO}</p>
        <ul>{INFO_DOCS.map((t) => <li key={t}><b>{t}</b></li>)}</ul>
        <p>{INFO_COMPROMISO}</p>
        {x.enlace && /^https?:\/\//.test(x.enlace) && <p><a className="boton sec" href={x.enlace} target="_blank" rel="noopener noreferrer">Abrir la información</a></p>}
      </div>
    );
  }
  return (
    <div className="charla">
      <p className="nota" style={{ marginTop: 0 }}>{T.codigo} · Entrega de EPI · {fechaCorta(d.fecha)}</p>
      <h3 className="subtitulo" style={{ marginTop: 0 }}>Equipos que recibes</h3>
      <ul>{lineasEpi(d.datos as unknown as DatosEpi).map((l) => <li key={l}>{l}</li>)}</ul>
      <p>{EPI_INTRO}</p>
      <p><b>Al firmar declaras que:</b></p>
      <ol>{EPI_DECL.map((t) => <li key={t}>{t}</li>)}</ol>
    </div>
  );
}

/** Evaluación de la eficacia de la formación (se apunta cuando ya lleva un tiempo en el puesto). */
function EvaluarFormacion({ doc, alCambiar }: { doc: Documento; alCambiar: () => void }) {
  const [ev, setEv] = useState<Evaluacion>(doc.evaluacion ?? {});
  async function guardar() {
    if (ev.eficaz == null) { aviso('Elige si ha sido eficaz o no.'); return; }
    const evaluacion = { fecha: ev.fecha || hoy(), eficaz: ev.eficaz, ...(ev.eficaz === false && ev.nueva_fecha ? { nueva_fecha: ev.nueva_fecha } : {}) };
    const { error } = await prev().from('documentos').update({ evaluacion }).eq('id', doc.id);
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Evaluación guardada'); alCambiar();
  }
  return (
    <fieldset className="grupo-epi">
      <legend>Evaluación de la eficacia</legend>
      <p className="nota" style={{ marginTop: 0 }}>Cuando ya lleve un tiempo en el puesto, apunta si la formación ha sido eficaz.</p>
      <div className="segmentos" role="group" aria-label="¿Ha sido eficaz?">
        <button type="button" aria-pressed={ev.eficaz === true} onClick={() => setEv({ ...ev, eficaz: true })}>Sí, eficaz</button>
        <button type="button" aria-pressed={ev.eficaz === false} onClick={() => setEv({ ...ev, eficaz: false })}>No eficaz</button>
      </div>
      <div className="dos">
        <label className="campo"><span>Fecha de la evaluación</span><input type="date" value={ev.fecha ?? ''} onChange={(e) => setEv({ ...ev, fecha: e.target.value })} /></label>
        {ev.eficaz === false && <label className="campo"><span>Fecha de la nueva formación</span><input type="date" value={ev.nueva_fecha ?? ''} onChange={(e) => setEv({ ...ev, nueva_fecha: e.target.value })} /></label>}
      </div>
      <div className="botonera" style={{ marginTop: 0 }}><button type="button" className="boton sec" onClick={guardar}>Guardar la evaluación</button></div>
    </fieldset>
  );
}

function DetalleDocumento({ doc, alCerrar, alCambiar }: { doc: Documento; alCerrar: () => void; alCambiar: () => void }) {
  const { puede } = useSesion();
  const ajustes = useAjustes();
  const [editando, setEditando] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  useEffect(() => {
    if (!doc.firma_id) return;
    nucleo().from('firmas').select('imagen').eq('id', doc.firma_id).maybeSingle().then(({ data }) => setFirma((data as { imagen: string } | null)?.imagen ?? null));
  }, [doc.firma_id]);
  const editable = puede('prevencion.documento.editar') && !doc.firma_id;
  const [t, c] = estadoDoc(doc);
  async function enviar() {
    const { error } = await prev().rpc('enviar_documentos', { p_ids: [doc.id] });
    if (error) { aviso(textoError(error.message)); return; }
    aviso(doc.enviado_en ? 'Aviso enviado' : 'Enviado a firmar'); alCambiar();
  }
  async function borrar() {
    if (!confirm(`¿Borrar «${TIPOS[doc.tipo].titulo}» de ${doc.nombre}?`)) return;
    const { error } = await prev().from('documentos').delete().eq('id', doc.id);
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Borrado'); alCerrar(); alCambiar();
  }
  async function anular() {
    if (!confirm(`¿Anular el documento firmado de ${doc.nombre}? La firma queda guardada, pero deja de contar.`)) return;
    const { error } = await prev().rpc('anular_documento', { p_documento: doc.id });
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Anulado'); alCambiar();
  }
  return (
    <Ventana titulo={`${doc.nombre} · ${fechaCorta(doc.fecha)}`} alCerrar={alCerrar}>
      <p style={{ marginTop: 0 }}><span className={'chapa ' + c}>{t}</span>{' '}
        <small className="nota">{doc.firmado_en ? `Firmado el ${new Date(doc.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
          : doc.enviado_en ? `Enviado el ${fechaCorta(doc.enviado_en)}; esperando a que firme.` : 'Todavía no se le ha enviado.'}</small></p>
      {firma && <img className="firma-guardada" src={firma} alt={`Firma de ${doc.nombre}`} />}
      <TextoDocumento d={doc} />
      {doc.tipo === 'formacion' && doc.firma_id && !doc.anulado && puede('prevencion.documento.editar') && <EvaluarFormacion doc={doc} alCambiar={alCambiar} />}
      <div className="botonera">
        {editable && <button type="button" className="boton sec" onClick={() => setEditando(true)}>Cambiar</button>}
        {editable && <button type="button" className="boton txt peligro" onClick={borrar}>Borrar</button>}
        {editable && <button type="button" className="boton sec" onClick={enviar}>{doc.enviado_en ? 'Recordar' : 'Enviar al trabajador'}</button>}
        {!doc.firma_id && !doc.anulado && puede('prevencion.firma.recoger') && <button type="button" className="boton" onClick={() => setFirmando(true)}>Firmar aquí</button>}
        {doc.firma_id && !doc.anulado && puede('prevencion.firma.anular') && <button type="button" className="boton txt peligro" onClick={anular}>Anular</button>}
        <button type="button" className="boton sec" disabled={haciendo} onClick={async () => { setHaciendo(true); await descargarDocumentos([doc], ajustes); setHaciendo(false); }}>
          {haciendo ? 'Haciendo el PDF…' : 'PDF oficial'}</button>
      </div>
      {editando && <EditarDocumento tipo={doc.tipo} doc={doc} alCerrar={() => setEditando(false)} alGuardar={() => { setEditando(false); alCambiar(); }} />}
      {firmando && <FirmarDocumento doc={doc} alCerrar={() => setFirmando(false)} alFirmar={() => { setFirmando(false); alCambiar(); }} />}
    </Ventana>
  );
}

/** Leer y firmar: el propio trabajador o, en el móvil del jefe o del encargado, el trabajador. */
export function FirmarDocumento({ doc, alCerrar, alFirmar }: { doc: Documento; alCerrar: () => void; alFirmar: () => void }) {
  const { estado } = useSesion();
  const [leida, setLeida] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
  const T = TIPOS[doc.tipo];
  async function firmar() {
    if (!png) { setError('Falta la firma.'); return; }
    setOcupado(true); setError(null);
    const { error } = await prev().rpc('firmar_documento', {
      p_documento: doc.id, p_imagen: png,
      p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Firmado'); alFirmar();
  }
  return (
    <Ventana titulo={T.titulo} alCerrar={alCerrar}
      pie={leida
        ? <><button type="button" className="boton sec" onClick={() => setLeida(false)}>Atrás</button><button type="button" className="boton" disabled={ocupado} onClick={firmar}>Firmar</button></>
        : <button type="button" className="boton" onClick={() => setLeida(true)}>{T.firmar}</button>}>
      {!leida ? <TextoDocumento d={doc} /> : (
        <>
          <p style={{ marginTop: 0 }}><b>{doc.nombre}</b></p>
          <p className="nota" style={{ marginBottom: 8 }}>{T.declaro}</p>
          <Firma alCambiar={setPng} />
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Para el trabajador: lo que tiene por firmar y sus tallas
// ---------------------------------------------------------------------------------------------
export function MisDocumentos({ persona }: { persona: string }) {
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [firmando, setFirmando] = useState<Documento | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await prev().from('documentos').select('*').eq('persona_id', persona).is('anulado', null).order('fecha', { ascending: false });
    setDocs((data ?? []) as Documento[]);
  }, [persona]);
  useEffect(() => { cargar(); }, [cargar]);
  const pendientes = (docs ?? []).filter((d) => !d.firma_id);
  if (!pendientes.length) return null;
  return (
    <>
      <p className="aviso-linea">Tienes {pendientes.length === 1 ? 'un documento' : `${pendientes.length} documentos`} de prevención por firmar.</p>
      <div className="lista" style={{ marginBottom: 16 }}>
        {pendientes.map((d) => (
          <button key={d.id} type="button" className="fila" onClick={() => setFirmando(d)}>
            <span className="fila-txt"><b>{tituloDoc(d)}</b><small>{resumenDoc(d)}</small></span>
            <span className="chapa pendiente">Firmar</span>
          </button>
        ))}
      </div>
      {firmando && <FirmarDocumento doc={firmando} alCerrar={() => setFirmando(null)} alFirmar={() => { setFirmando(null); cargar(); }} />}
    </>
  );
}

export function MisTallas({ persona }: { persona: string }) {
  const { empresa } = useSesion();
  const [prendas, setPrendas] = useState<{ codigo: string; nombre: string }[]>([]);
  const [ficha, setFicha] = useState<{ tallas: Record<string, string>; tallas_propuestas: Record<string, string> | null } | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const [p, f] = await Promise.all([
      prev().from('prendas').select('codigo, nombre').eq('empresa_id', empresa!.id).is('baja', null).order('orden'),
      prev().from('fichas').select('tallas, tallas_propuestas').eq('persona_id', persona).maybeSingle(),
    ]);
    setPrendas((p.data ?? []) as { codigo: string; nombre: string }[]);
    setFicha((f.data as typeof ficha) ?? { tallas: {}, tallas_propuestas: null });
  }, [empresa, persona]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!ficha || !prendas.length) return null;
  const actual = (k: string) => ficha.tallas_propuestas?.[k] ?? ficha.tallas?.[k] ?? '';
  async function enviar() {
    const tallas = Object.fromEntries(prendas.map((p) => [p.codigo, (v[p.codigo] ?? actual(p.codigo)).trim()]));
    const { error } = await prev().rpc('proponer_tallas', { p_tallas: tallas });
    if (error) { setError(textoError(error.message)); return; }
    aviso('Tallas enviadas'); setAbierta(false); cargar();
  }
  return (
    <>
      <h2 className="subtitulo">Mis tallas</h2>
      <div className="lista">
        <button type="button" className="fila" onClick={() => { setV({}); setAbierta(true); }}>
          <span className="fila-txt"><b>{prendas.map((p) => `${p.nombre}: ${ficha.tallas?.[p.codigo] || '—'}`).join(' · ')}</b>
            <small>{ficha.tallas_propuestas ? 'Has enviado cambios: falta que los revisen' : 'Toca para cambiarlas'}</small></span>
          <span className="fila-flecha" aria-hidden="true">›</span>
        </button>
      </div>
      {abierta && (
        <Ventana titulo="Mis tallas" alCerrar={() => setAbierta(false)}
          pie={<><button type="button" className="boton sec" onClick={() => setAbierta(false)}>Cancelar</button><button type="button" className="boton" onClick={enviar}>Enviar</button></>}>
          <p className="nota" style={{ marginTop: 0 }}>Tu ficha cambia cuando tu responsable acepte las tallas.</p>
          <div className="dos">{prendas.map((p) => (
            <label key={p.codigo} className="campo"><span>{p.nombre}</span>
              <input maxLength={10} value={v[p.codigo] ?? actual(p.codigo)} onChange={(e) => setV((x) => ({ ...x, [p.codigo]: e.target.value }))} /></label>
          ))}</div>
          {error && <p className="error" role="alert">{error}</p>}
        </Ventana>
      )}
    </>
  );
}

/** En la ficha: tallas que ha propuesto el trabajador, para aceptarlas o rechazarlas. */
export function TallasPropuestas({ persona, propuestas, tallas, nombres, alResolver }: {
  persona: string; propuestas: Record<string, string>; tallas: Record<string, string>; nombres: Record<string, string>; alResolver: () => void;
}) {
  const cambios = useMemo(() => Object.entries(propuestas).filter(([k, x]) => tallas[k] !== x), [propuestas, tallas]);
  async function resolver(aceptar: boolean) {
    const { error } = await prev().from('fichas').update(aceptar
      ? { tallas: { ...tallas, ...propuestas }, tallas_propuestas: null, tallas_propuestas_en: null }
      : { tallas_propuestas: null, tallas_propuestas_en: null }).eq('persona_id', persona);
    if (error) { aviso(textoError(error.message)); return; }
    aviso(aceptar ? 'Tallas aceptadas' : 'Cambios rechazados'); alResolver();
  }
  return (
    <div className="propuesta">
      <b>Tallas propuestas por el trabajador</b>
      <p className="nota" style={{ margin: '4px 0' }}>{cambios.length ? cambios.map(([k, x]) => `${nombres[k] ?? k}: ${tallas[k] || '—'} → ${x}`).join(' · ') : 'Son las mismas que ya tiene.'}</p>
      <div className="botonera" style={{ marginTop: 6 }}>
        <button type="button" className="boton sec peq" onClick={() => resolver(false)}>Rechazar</button>
        <button type="button" className="boton peq" onClick={() => resolver(true)}>Aceptar</button>
      </div>
    </div>
  );
}
