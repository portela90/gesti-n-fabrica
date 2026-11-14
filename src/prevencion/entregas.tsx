// Entregas de EPI (SH-CORP-SP-FO-014): hacerlas (jefe o encargado), enviarlas a firmar, recoger la firma en el móvil,
// que el trabajador las lea y firme, anular y sacar el PDF oficial.
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

export interface Documento {
  id: string; empresa_id: string; tipo: string; persona_id: string; nombre: string | null; fecha: string; datos: DatosEpi;
  enviado_en: string | null; firma_id: string | null; firmado_en: string | null; anulado: string | null; creado: string;
}
const ANIO_ACTUAL = new Date().getFullYear();
const ROPA = ['Pantalón de trabajo', 'Camiseta manga corta', 'Camiseta manga larga', 'Polo', 'Camisa', 'Chaqueta', 'Forro polar', 'Chaleco', 'Sudadera', 'Bata', 'Gorra', 'Calcetines'];

export function estadoDoc(d: Documento): [string, string] {
  if (d.anulado) return ['Anulado', 'sin'];
  if (d.firma_id) return ['Firmado', 'firmado'];
  if (d.enviado_en) return ['Sin firmar', 'pendiente'];
  return ['Sin enviar', 'sin'];
}

/** PDF oficial (FO-014) de una o varias entregas, con las firmas, el DNI y el puesto (si se pueden ver) y el sello. */
export async function pdfEntregas(docs: Documento[], ajustes: Record<string, string>) {
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
  return pdfEpi(docs.map((d) => {
    const f = fi.find((x) => x.persona_id === d.persona_id);
    return {
      nombre: d.nombre ?? '', dni: f?.dni ?? null, puesto: f?.puesto ?? pe.find((x) => x.id === d.persona_id)?.categoria ?? null,
      fecha: d.fecha, datos: d.datos, firma: fr.find((x) => x.id === d.firma_id)?.imagen ?? null, firmado_en: d.firmado_en,
    };
  }), ajustes.sello || ajustes.firma_formador || null);
}
export async function descargarEntregas(docs: Documento[], ajustes: Record<string, string>, nombre: string) {
  try { descargar(await pdfEntregas(docs, ajustes), nombre); }
  catch (e) { aviso('No se ha podido hacer el PDF: ' + (e as Error).message); }
}
const nombrePdf = (d: Documento) => `${CODIGO_EPI} Entrega de EPI ${d.nombre ?? ''} ${d.fecha}.pdf`;

// ---------------------------------------------------------------------------------------------
// Lista de entregas del año
// ---------------------------------------------------------------------------------------------
export function Entregas() {
  const { empresa, puede } = useSesion();
  const ajustes = useAjustes();
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [nueva, setNueva] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const editable = puede('prevencion.documento.editar');

  const cargar = useCallback(async () => {
    const { data } = await prev().from('documentos').select('*').eq('empresa_id', empresa!.id).eq('tipo', 'epi')
      .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha', { ascending: false });
    setDocs(((data ?? []) as Documento[]).sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.nombre ?? '').localeCompare(b.nombre ?? '')));
  }, [empresa, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  const firmados = (docs ?? []).filter((d) => d.firma_id && !d.anulado);
  const sinFirmar = (docs ?? []).filter((d) => !d.firma_id && !d.anulado);
  const doc = docs?.find((d) => d.id === abierto) ?? null;
  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => <option key={a}>{a}</option>)}
          </select></label>
        {editable && <div className="campo"><span aria-hidden="true">&nbsp;</span><button type="button" className="boton" onClick={() => setNueva(true)}>＋ Entrega de EPI</button></div>}
      </div>
      {docs === null ? <p className="nota">Cargando…</p> : !docs.length ? <div className="vacio"><p>No hay entregas de EPI en {anio}.</p></div> : (
        <>
          <p className="nota" style={{ marginTop: 0 }}>{docs.length} entrega{docs.length === 1 ? '' : 's'} en {anio}{sinFirmar.length ? ` · ${sinFirmar.length} sin firmar` : ''}.</p>
          <div className="lista">
            {docs.map((d) => {
              const [t, c] = estadoDoc(d);
              return (
                <button key={d.id} type="button" className={'fila' + (d.anulado ? ' de-baja' : '')} onClick={() => setAbierto(d.id)}>
                  <span className="fila-txt"><b>{d.nombre}</b><small>{fechaCorta(d.fecha)} · {lineasEpi(d.datos).map((l) => l.split(' · ')[0].replace(/\s*\(.*\)$/, '')).join(', ') || '—'}</small></span>
                  <span className={'chapa ' + c}>{t}</span>
                </button>
              );
            })}
          </div>
          <div className="botonera">
            {editable && sinFirmar.some((d) => !d.enviado_en) && <button type="button" className="boton sec" onClick={async () => {
              const { data, error } = await prev().rpc('enviar_documentos', { p_ids: sinFirmar.map((d) => d.id) });
              if (error) { aviso(textoError(error.message)); return; }
              aviso(`Enviadas: faltan ${data} por firmar`); cargar();
            }}>Enviar las que faltan</button>}
            {firmados.length > 0 && <button type="button" className="boton sec" disabled={haciendo} onClick={async () => {
              setHaciendo(true); await descargarEntregas(firmados, ajustes, `${CODIGO_EPI} Entregas de EPI ${anio}.pdf`); setHaciendo(false);
            }}>{haciendo ? 'Haciendo el PDF…' : `PDF de todas las firmadas (${firmados.length})`}</button>}
          </div>
        </>
      )}
      {nueva && <EditarEntrega doc={null} alCerrar={() => setNueva(false)} alGuardar={() => { setNueva(false); cargar(); }} />}
      {doc && <DetalleEntrega doc={doc} alCerrar={() => setAbierto(null)} alCambiar={cargar} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Hacer o cambiar una entrega
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

function EditarEntrega({ doc, alCerrar, alGuardar }: { doc: Documento | null; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const personas = usePersonas();
  const ajustes = useAjustes();
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [fecha, setFecha] = useState(doc?.fecha ?? hoy());
  const [lugar, setLugar] = useState<string | null>(doc?.datos.lugar ?? null);
  const [items, setItems] = useState<Record<string, LineaEpi>>(doc?.datos.items ?? {});
  const [otros, setOtros] = useState<OtroEpi[]>(() => { const o = [...(doc?.datos.otros ?? [])]; while (o.length < 4) o.push({ t: '' }); return o; });
  const [prendas, setPrendas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    prev().from('prendas').select('nombre').eq('empresa_id', empresa!.id).is('baja', null)
      .then(({ data }) => setPrendas(((data ?? []) as { nombre: string }[]).map((x) => x.nombre)));
  }, [empresa]);
  const activos = personas.filter((p) => !p.baja);
  const marca = (k: string, on: boolean) => setItems((x) => { const n = { ...x }; if (on) n[k] = n[k] ?? { u: '1', motivo: 'Primera entrega' }; else delete n[k]; return n; });
  const pon = (k: string, v: LineaEpi) => setItems((x) => ({ ...x, [k]: v }));
  const ponOtro = (i: number, v: OtroEpi) => setOtros((o) => o.map((x, j) => (j === i ? v : x)));

  async function guardar(enviar: boolean) {
    const datos: DatosEpi = {
      items, lugar: (lugar ?? ajustes.centro ?? '').trim(),
      otros: otros.filter((o) => o.t.trim()).map((o) => ({ ...o, t: o.t.trim(), motivo: o.motivo ?? 'Primera entrega' })),
    };
    if (!Object.keys(items).length && !datos.otros.length) { setError('Marca al menos un equipo o prenda.'); return; }
    if (!doc && !elegidos.size) { setError('Elige al menos un trabajador.'); return; }
    if (!fecha) { setError('Falta la fecha.'); return; }
    setOcupado(true); setError(null);
    let ids: string[] = [];
    if (doc) {
      const { error } = await prev().from('documentos').update({ fecha, datos }).eq('id', doc.id);
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
      ids = [doc.id];
    } else {
      const { data, error } = await prev().from('documentos')
        .insert([...elegidos].map((p) => ({ empresa_id: empresa!.id, tipo: 'epi', persona_id: p, fecha, datos }))).select('id');
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
      ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
    }
    if (enviar && ids.length) {
      const { error } = await prev().rpc('enviar_documentos', { p_ids: ids });
      if (error) { setOcupado(false); setError(textoError(error.message)); return; }
    }
    setOcupado(false);
    aviso(enviar ? 'Guardada y enviada a firmar' : 'Guardada'); alGuardar();
  }
  return (
    <Ventana titulo={doc ? `Entrega de EPI · ${doc.nombre}` : 'Nueva entrega de EPI'} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(false)}>Guardar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar(true)}>{doc?.enviado_en ? 'Guardar y avisar' : 'Guardar y enviar'}</button></>}>
      {!doc && (
        <fieldset className="grupo-epi">
          <legend>Trabajadores <small>(se hace una para cada uno)</small></legend>
          <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            <button type="button" className="boton txt peq" onClick={() => setElegidos(new Set(activos.map((p) => p.id)))}>Todos</button>
            <button type="button" className="boton txt peq" onClick={() => setElegidos(new Set())}>Ninguno</button>
          </div>
          {activos.map((p: Persona) => (
            <label key={p.id} className="marca"><input type="checkbox" checked={elegidos.has(p.id)}
              onChange={(e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /> {p.nombre}</label>
          ))}
        </fieldset>
      )}
      <div className="dos">
        <label className="campo"><span>Fecha</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="campo"><span>Lugar («En …, a …»)</span><input value={lugar ?? ajustes.centro ?? ''} maxLength={80} onChange={(e) => setLugar(e.target.value)} /></label>
      </div>
      {EPI_GRUPOS.map(([g, claves]) => (
        <fieldset key={g} className="grupo-epi">
          <legend>{g}</legend>
          {claves.map((k) => {
            const it = EPI_ITEMS.find((i) => i[0] === k)!; const v = items[k];
            return (
              <div key={k} className="linea-epi">
                <label className="marca"><input type="checkbox" checked={!!v} onChange={(e) => marca(k, e.target.checked)} /> {it[1]}</label>
                {v && <>
                  <input className="ud" aria-label={`Unidades de ${it[1]}`} type="number" min={1} inputMode="numeric" value={v.u ?? ''} onChange={(e) => pon(k, { ...v, u: e.target.value })} />
                  <Motivo v={v} alCambiar={(x) => pon(k, x)} />
                  {it[5] && <span className="cats">{it[5].map((c) => (
                    <label key={c} className="marca peq"><input type="checkbox" checked={(v.cat ?? []).includes(c)}
                      onChange={(e) => pon(k, { ...v, cat: e.target.checked ? [...(v.cat ?? []), c] : (v.cat ?? []).filter((x) => x !== c) })} /> {c}</label>))}</span>}
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
            {o.t.trim() && <Motivo v={o} alCambiar={(x) => ponOtro(i, { ...o, ...x })} />}
          </div>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Una entrega: lo que lee el trabajador, su estado y lo que se puede hacer
// ---------------------------------------------------------------------------------------------
export function TextoEntrega({ d }: { d: Documento }) {
  return (
    <div className="charla">
      <p className="nota" style={{ marginTop: 0 }}>{CODIGO_EPI} · Entrega de EPI · {fechaCorta(d.fecha)}</p>
      <h3 className="subtitulo" style={{ marginTop: 0 }}>Equipos que recibes</h3>
      <ul>{lineasEpi(d.datos).map((l) => <li key={l}>{l}</li>)}</ul>
      <p>{EPI_INTRO}</p>
      <p><b>Al firmar declaras que:</b></p>
      <ol>{EPI_DECL.map((t) => <li key={t}>{t}</li>)}</ol>
    </div>
  );
}

function DetalleEntrega({ doc, alCerrar, alCambiar }: { doc: Documento; alCerrar: () => void; alCambiar: () => void }) {
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
    aviso(doc.enviado_en ? 'Aviso enviado' : 'Enviada a firmar'); alCambiar();
  }
  async function borrar() {
    if (!confirm(`¿Borrar la entrega de ${doc.nombre}?`)) return;
    const { error } = await prev().from('documentos').delete().eq('id', doc.id);
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Borrada'); alCerrar(); alCambiar();
  }
  async function anular() {
    if (!confirm(`¿Anular la entrega firmada de ${doc.nombre}? La firma queda guardada, pero deja de contar.`)) return;
    const { error } = await prev().rpc('anular_documento', { p_documento: doc.id });
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Anulada'); alCambiar();
  }
  return (
    <Ventana titulo={`${doc.nombre} · ${fechaCorta(doc.fecha)}`} alCerrar={alCerrar}>
      <p style={{ marginTop: 0 }}><span className={'chapa ' + c}>{t}</span>{' '}
        <small className="nota">{doc.firmado_en ? `Firmado el ${new Date(doc.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
          : doc.enviado_en ? `Enviada el ${fechaCorta(doc.enviado_en)}; esperando a que firme.` : 'Todavía no se le ha enviado.'}</small></p>
      {firma && <img className="firma-guardada" src={firma} alt={`Firma de ${doc.nombre}`} />}
      <TextoEntrega d={doc} />
      <div className="botonera">
        {editable && <button type="button" className="boton sec" onClick={() => setEditando(true)}>Cambiar</button>}
        {editable && <button type="button" className="boton txt peligro" onClick={borrar}>Borrar</button>}
        {editable && <button type="button" className="boton sec" onClick={enviar}>{doc.enviado_en ? 'Recordar' : 'Enviar al trabajador'}</button>}
        {!doc.firma_id && !doc.anulado && puede('prevencion.firma.recoger') && <button type="button" className="boton" onClick={() => setFirmando(true)}>Firmar aquí</button>}
        {doc.firma_id && !doc.anulado && puede('prevencion.firma.anular') && <button type="button" className="boton txt peligro" onClick={anular}>Anular</button>}
        <button type="button" className="boton sec" disabled={haciendo} onClick={async () => { setHaciendo(true); await descargarEntregas([doc], ajustes, nombrePdf(doc)); setHaciendo(false); }}>
          {haciendo ? 'Haciendo el PDF…' : 'PDF oficial'}</button>
      </div>
      {editando && <EditarEntrega doc={doc} alCerrar={() => setEditando(false)} alGuardar={() => { setEditando(false); alCambiar(); }} />}
      {firmando && <FirmarEntrega doc={doc} alCerrar={() => setFirmando(false)} alFirmar={() => { setFirmando(false); alCambiar(); }} />}
    </Ventana>
  );
}

/** Leer y firmar una entrega: el propio trabajador o, en el móvil del jefe o del encargado, el trabajador. */
export function FirmarEntrega({ doc, alCerrar, alFirmar }: { doc: Documento; alCerrar: () => void; alFirmar: () => void }) {
  const { estado } = useSesion();
  const [leida, setLeida] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
  async function firmar() {
    if (!png) { setError('Falta la firma.'); return; }
    setOcupado(true); setError(null);
    const { error } = await prev().rpc('firmar_documento', {
      p_documento: doc.id, p_imagen: png,
      p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Firmada'); alFirmar();
  }
  return (
    <Ventana titulo="Entrega de EPI" alCerrar={alCerrar}
      pie={leida
        ? <><button type="button" className="boton sec" onClick={() => setLeida(false)}>Atrás</button><button type="button" className="boton" disabled={ocupado} onClick={firmar}>Firmar</button></>
        : <button type="button" className="boton" onClick={() => setLeida(true)}>He recibido los equipos, firmar</button>}>
      {!leida ? <TextoEntrega d={doc} /> : (
        <>
          <p style={{ marginTop: 0 }}><b>{doc.nombre}</b></p>
          <p className="nota" style={{ marginBottom: 8 }}>Firmo que he recibido los equipos y conozco su uso correcto.</p>
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
export function MisEntregas({ persona }: { persona: string }) {
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
      <p className="aviso-linea">Tienes {pendientes.length === 1 ? 'una entrega de EPI' : `${pendientes.length} entregas de EPI`} por firmar.</p>
      <div className="lista" style={{ marginBottom: 16 }}>
        {pendientes.map((d) => (
          <button key={d.id} type="button" className="fila" onClick={() => setFirmando(d)}>
            <span className="fila-txt"><b>Entrega de EPI · {fechaCorta(d.fecha)}</b><small>{lineasEpi(d.datos).map((l) => l.split(' · ')[0].replace(/\s*\(.*\)$/, '')).join(', ')}</small></span>
            <span className="chapa pendiente">Firmar</span>
          </button>
        ))}
      </div>
      {firmando && <FirmarEntrega doc={firmando} alCerrar={() => setFirmando(null)} alFirmar={() => { setFirmando(null); cargar(); }} />}
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
