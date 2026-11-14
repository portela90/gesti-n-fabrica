import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { descargar, pdfToolbox, type DatosToolbox } from './pdfToolbox';
import { MESES, fechaCorta, prev, textoError, useAjustes, usePersonas, type Persona } from './comun';
import { Documentos, MisDocumentos, MisTallas, TallasPropuestas, descargarDocumentos, tituloDoc, type Documento } from './documentos-firma';
import { abrirDocumento, bajarDocumento, mesDelNombre, subirDocumento, unirPdfs } from './documentos';


const ANIO_ACTUAL = new Date().getFullYear();

interface Charla {
  id: string; empresa_id: string; anio: number; mes: number; codigo: string | null; compromiso: string | null; cuerpo: string | null;
  puntos: string[]; tema: string | null; tema_intro: string | null; tema_puntos: string[]; imagen: string | null;
  documento_ruta?: string | null; documento_nombre?: string | null; documento_sha256?: string | null;
}
interface Sesion {
  id: string; charla_id: string; denominacion: string | null; fecha: string | null; centro: string | null; duracion: number | null;
  formador: string | null; observaciones: string | null; previstos: string[]; enviada_en: string | null; cerrada_en: string | null;
  prev_enviado_en?: string | null; prev_destino?: string | null;
}
interface Asistencia { id: string; sesion_id: string; persona_id: string; nombre: string; puesto: string | null; firma_id: string | null; anulada: string | null; creado: string }

type Pestana = 'mias' | 'charlas' | 'documentos' | 'fichas';

/** Módulo Prevención: mis charlas (todos) y, según permisos, las charlas de cada mes y las fichas de los trabajadores. */
export function Prevencion({ ruta, ir }: { ruta: string; ir: (r: string) => void }) {
  const { puede } = useSesion();
  const pestanas = ([
    ['mias', 'Mis charlas', true],
    ['charlas', 'Charlas', puede('prevencion.charla.ver')],
    ['documentos', 'Documentos', puede('prevencion.documento.ver')],
    ['fichas', 'Fichas', puede('prevencion.ficha.ver')],
  ] as [Pestana, string, boolean][]).filter((p) => p[2]);
  const pedida = (ruta.split('/')[3] ?? '') as Pestana;
  const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? (pestanas.length > 1 ? 'charlas' : 'mias');
  return (
    <main className="contenido" style={{ ['--area' as string]: '#b91c1c' }}>
      {pestanas.length > 1 && (
        <nav className="pestanas no-imprimir" aria-label="Prevención">
          {pestanas.map(([c, n]) => <button key={c} type="button" aria-pressed={actual === c} onClick={() => ir(`/m/prevencion/${c}`)}>{n}</button>)}
        </nav>
      )}
      {actual === 'mias' && <MisCharlas />}
      {actual === 'charlas' && <Charlas />}
      {actual === 'documentos' && <Documentos />}
      {actual === 'fichas' && <Fichas />}
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Charlas: los 12 meses del año
// ---------------------------------------------------------------------------------------------
function Charlas() {
  const { empresa, puede } = useSesion();
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [charlas, setCharlas] = useState<Charla[] | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [firmas, setFirmas] = useState<Asistencia[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const [subir, setSubir] = useState<File[] | null>(null);
  const editable = puede('prevencion.charla.editar');

  const cargar = useCallback(async () => {
    const { data, error } = await prev().from('charlas').select('*').eq('empresa_id', empresa!.id).eq('anio', anio).order('mes');
    if (error) { aviso(error.message); return; }
    const cs = (data ?? []) as Charla[];
    const ids = cs.map((c) => c.id);
    const s = ids.length ? await prev().from('sesiones').select('*').in('charla_id', ids) : { data: [] };
    const sids = ((s.data ?? []) as Sesion[]).map((x) => x.id);
    const a = sids.length && puede('prevencion.firma.ver') ? await prev().from('asistencias').select('*').in('sesion_id', sids).is('anulada', null) : { data: [] };
    setCharlas(cs); setSesiones((s.data ?? []) as Sesion[]); setFirmas((a.data ?? []) as Asistencia[]);
  }, [empresa, anio, puede]);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => <option key={a}>{a}</option>)}
          </select></label>
        {editable && <div className="campo"><span aria-hidden="true">&nbsp;</span><button type="button" className="boton sec" onClick={() => setAjustes(true)}>Datos por defecto</button></div>}
        {editable && <div className="campo"><span aria-hidden="true">&nbsp;</span>
          <label className="boton sec archivo">Subir documentos del año
            <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setSubir(f); }} /></label></div>}
      </div>
      {charlas === null ? <p className="nota">Cargando…</p> : (
        <div className="lista">
          {MESES.map((nombre, i) => {
            const c = charlas.find((x) => x.mes === i + 1);
            const s = c && sesiones.find((x) => x.charla_id === c.id);
            const n = s ? firmas.filter((f) => f.sesion_id === s.id).length : 0;
            const estado = !c ? 'Sin charla' : !s?.enviada_en ? 'Sin enviar' : s.cerrada_en ? 'Cerrada' : 'Firmando';
            return (
              <button key={nombre} type="button" className={'fila' + (!c ? ' de-baja' : '')} disabled={!c && !editable} onClick={() => setAbierto(i + 1)}>
                <span className="fila-txt"><b>{nombre}</b>
                  <small>{c ? (c.tema || c.compromiso || c.documento_nombre) : editable ? 'Toca para subir el documento o escribirla' : 'Todavía no hay charla'}</small>
                  {s && <small>{s.cerrada_en ? `Cerrada el ${fechaCorta(s.cerrada_en)}` : s.enviada_en ? `Enviada el ${fechaCorta(s.enviada_en)}` : 'Sin enviar'}
                    {' · '}{n} de {s.previstos.length} firmas</small>}</span>
                <span className={'chapa ' + (estado === 'Cerrada' ? 'firmado' : estado === 'Firmando' ? 'pendiente' : 'sin')}>{estado}</span>
              </button>
            );
          })}
        </div>
      )}
      {abierto && <Mes anio={anio} mes={abierto} charla={charlas?.find((c) => c.mes === abierto) ?? null}
        sesion={sesiones.find((s) => s.charla_id === charlas?.find((c) => c.mes === abierto)?.id) ?? null}
        alCerrar={() => setAbierto(null)} alCambiar={cargar} />}
      {ajustes && <Ajustes alCerrar={() => setAjustes(false)} />}
      {subir && charlas && <SubirDelAnio anio={anio} archivos={subir} charlas={charlas} sesiones={sesiones}
        alCerrar={() => setSubir(null)} alSubir={() => { setSubir(null); cargar(); }} />}
    </>
  );
}

/** Subir de una vez los PDF del técnico de todo el año: la app reconoce el mes por el nombre y se puede corregir. */
function SubirDelAnio({ anio, archivos, charlas, sesiones, alCerrar, alSubir }: {
  anio: number; archivos: File[]; charlas: Charla[]; sesiones: Sesion[]; alCerrar: () => void; alSubir: () => void;
}) {
  const { empresa } = useSesion();
  const [meses, setMeses] = useState<(number | 0)[]>(() => archivos.map((f) => mesDelNombre(f.name) ?? 0));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerradoEl = (mes: number) => { const c = charlas.find((x) => x.mes === mes); return c ? sesiones.find((s) => s.charla_id === c.id)?.cerrada_en ?? null : null; };
  const repetidos = meses.filter((m, i) => m && meses.indexOf(m) !== i);
  async function subir() {
    if (repetidos.length) { setError(`Hay dos documentos para ${MESES[repetidos[0] - 1]}.`); return; }
    if (meses.some((m, i) => m && cerradoEl(m) && archivos[i])) { setError('Algún mes elegido ya está cerrado: ese no se puede cambiar.'); return; }
    setOcupado(true); setError(null);
    let hechos = 0;
    for (let i = 0; i < archivos.length; i++) {
      const mes = meses[i]; if (!mes) continue;
      try {
        const d = await subirDocumento(empresa!.id, anio, mes, archivos[i]);
        const c = charlas.find((x) => x.mes === mes);
        const { error } = c ? await prev().from('charlas').update(d).eq('id', c.id)
          : await prev().from('charlas').insert({ ...d, empresa_id: empresa!.id, anio, mes });
        if (error) throw new Error(textoError(error.message));
        hechos++;
      } catch (e) { setError(`${archivos[i].name}: ${(e as Error).message}`); setOcupado(false); if (hechos) aviso(`${hechos} subidos`); return; }
    }
    setOcupado(false);
    aviso(hechos === 1 ? 'Documento subido' : `${hechos} documentos subidos`); alSubir();
  }
  return (
    <Ventana titulo={`Documentos del técnico · ${anio}`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado || !meses.some(Boolean)} onClick={subir}>{ocupado ? 'Subiendo…' : 'Subir'}</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Mira que cada PDF vaya a su mes. Si un mes ya tenía documento, se cambia por este.</p>
      <div className="lista">
        {archivos.map((f, i) => (
          <div key={i} className="fila fija centrada subir-doc">
            <span className="fila-txt"><b>{f.name}</b>{meses[i] && cerradoEl(meses[i]) ? <small className="error">Ese mes ya está cerrado</small> : null}</span>
            <select aria-label={`Mes de ${f.name}`} value={meses[i]} onChange={(e) => setMeses((m) => m.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
              <option value={0}>No subir</option>
              {MESES.map((n, k) => <option key={n} value={k + 1}>{n}</option>)}
            </select>
          </div>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** Datos por defecto para las sesiones nuevas (en nucleo.ajustes, módulo prevención). */
const CLAVES_AJUSTES = [['centro', 'Lugar donde se da'], ['duracion', 'Duración (minutos)'], ['formador', 'Formador'],
  ['correo_prl', 'Correo del técnico de prevención (para enviarle el mes)'], ['correo_prl_nombre', 'Nombre del técnico de prevención'],
  ['empresa', 'Empresa (sale en el asunto del correo y en la entrega de información)'], ['direccion', 'Dirección de servicio (formación en el puesto)'],
  ['enlace_info', 'Enlace a la información de prevención para el trabajador (entrega de información)'],
  ['supervisa_botiquin', 'Quién supervisa la revisión del botiquín (gestor de servicios)']] as const;
function Ajustes({ alCerrar }: { alCerrar: () => void }) {
  const { empresa } = useSesion();
  const actuales = useAjustes();
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const valor = (k: string) => v[k] ?? actuales[k] ?? '';
  const [firmando, setFirmando] = useState(false);
  const [firmandoResp, setFirmandoResp] = useState(false);
  async function guardar() {
    for (const k of [...CLAVES_AJUSTES.map(([c]) => c), 'firma_formador', 'firma_resp', 'sello']) {
      if (v[k] === undefined) continue;
      const { error } = await nucleo().from('ajustes').upsert({ empresa_id: empresa!.id, centro_id: null, modulo: 'prevencion', clave: k, valor: v[k].trim() },
        { onConflict: 'empresa_id,centro_id,modulo,clave' });
      if (error) { setError(error.message); return; }
    }
    aviso('Guardado'); alCerrar();
  }
  return (
    <Ventana titulo="Datos por defecto de Prevención" alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={guardar}>Guardar</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Se ponen solos cada vez que preparas la sesión de un mes nuevo. Luego puedes cambiarlos en cada mes.</p>
      {CLAVES_AJUSTES.map(([k, n]) => <label key={k} className="campo"><span>{n}</span>
        <input value={valor(k)} type={k === 'correo_prl' ? 'email' : undefined} inputMode={k === 'duracion' ? 'numeric' : undefined}
          onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} /></label>)}
      <div className="campo"><span>Firma del formador (sale en el PDF oficial)</span>
        {firmando ? <Firma alCambiar={(png) => setV((x) => ({ ...x, firma_formador: png ?? '' }))} />
          : <>{valor('firma_formador') ? <img src={valor('firma_formador')} alt="Firma del formador" className="firma-guardada" /> : <p className="nota" style={{ margin: 0 }}>Todavía no hay firma.</p>}
            <button type="button" className="boton sec peq" style={{ alignSelf: 'flex-start' }} onClick={() => setFirmando(true)}>{valor('firma_formador') ? 'Cambiar la firma' : 'Firmar'}</button></>}
      </div>
      <div className="campo"><span>Firma del responsable de centro (sale en la formación en el puesto)</span>
        {firmandoResp ? <Firma alCambiar={(png) => setV((x) => ({ ...x, firma_resp: png ?? '' }))} />
          : <>{valor('firma_resp') ? <img src={valor('firma_resp')} alt="Firma del responsable de centro" className="firma-guardada" /> : <p className="nota" style={{ margin: 0 }}>Todavía no hay firma.</p>}
            <button type="button" className="boton sec peq" style={{ alignSelf: 'flex-start' }} onClick={() => setFirmandoResp(true)}>{valor('firma_resp') ? 'Cambiar la firma' : 'Firmar'}</button></>}
      </div>
      <div className="campo"><span>Sello o firma de la empresa (sale en las entregas de EPI)</span>
        {valor('sello') ? <img src={valor('sello')} alt="Sello de la empresa" className="firma-guardada" /> : <p className="nota" style={{ margin: 0 }}>Todavía no hay sello.</p>}
        <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <label className="boton sec peq archivo">{valor('sello') ? 'Cambiar el sello' : 'Subir una foto del sello'}
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { const png = await selloDeFoto(f); setV((x) => ({ ...x, sello: png })); } catch (x) { setError((x as Error).message); } } }} /></label>
        </div></div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** Foto del sello: conserva el color y quita el fondo blanco. */
function selloDeFoto(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 500 / img.width, 260 / img.height);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 0 && p[i] > 215 && p[i + 1] > 215 && p[i + 2] > 215) p[i + 3] = 0;
      g.putImageData(d, 0, 0); URL.revokeObjectURL(img.src); ok(c.toDataURL('image/png'));
    };
    img.onerror = () => mal(new Error('No se ha podido leer la imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

// ---------------------------------------------------------------------------------------------
// Un mes: contenido, sesión y firmas
// ---------------------------------------------------------------------------------------------
function Mes({ anio, mes, charla, sesion, alCerrar, alCambiar }: {
  anio: number; mes: number; charla: Charla | null; sesion: Sesion | null; alCerrar: () => void; alCambiar: () => void;
}) {
  const { puede } = useSesion();
  const [pest, setPest] = useState<'contenido' | 'sesion' | 'firmas'>(charla ? (sesion ? 'firmas' : 'sesion') : 'contenido');
  // recién escrita la charla de un mes nuevo, lo siguiente es preparar la sesión
  const [habia] = useState(!!charla);
  useEffect(() => { if (charla && !habia && !sesion) setPest('sesion'); }, [charla, habia, sesion]);
  const titulo = `${MESES[mes - 1]} ${anio}`;
  if (!charla) {
    return puede('prevencion.charla.editar')
      ? <EditarCharla titulo={`Charla de ${titulo}`} anio={anio} mes={mes} charla={null} alCerrar={alCerrar} alGuardar={() => { alCambiar(); }} />
      : null;
  }
  return (
    <Ventana titulo={titulo} alCerrar={alCerrar}>
      <div className="segmentos tres no-imprimir" role="group" aria-label="Partes del mes">
        <button type="button" aria-pressed={pest === 'contenido'} onClick={() => setPest('contenido')}>Contenido</button>
        <button type="button" aria-pressed={pest === 'sesion'} onClick={() => setPest('sesion')}>Sesión</button>
        <button type="button" aria-pressed={pest === 'firmas'} onClick={() => setPest('firmas')} disabled={!sesion}>Firmas</button>
      </div>
      {pest === 'contenido' && <VerCharla charla={charla} sesion={sesion} alCambiar={alCambiar} />}
      {pest === 'sesion' && <DatosSesion anio={anio} mes={mes} charla={charla} sesion={sesion} alGuardar={() => { alCambiar(); }} />}
      {pest === 'firmas' && sesion && <FirmasSesion charla={charla} sesion={sesion} alCambiar={alCambiar} />}
    </Ventana>
  );
}

/** El texto de la charla tal como lo lee el trabajador. */
function TextoCharla({ c }: { c: Charla }) {
  return (
    <div className="charla">
      {c.documento_ruta && <BotonDocumento c={c} />}
      {c.imagen && <img src={c.imagen} alt="" />}
      {c.compromiso && <p className="charla-compromiso">«{c.compromiso}»</p>}
      {c.cuerpo && c.cuerpo.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
      {c.puntos.length > 0 && <><h3 className="subtitulo">Para hablar</h3><ul>{c.puntos.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
      {c.tema && <h3 className="subtitulo">{c.tema}</h3>}
      {c.tema_intro && <p>{c.tema_intro}</p>}
      {c.tema_puntos.length > 0 && <ul>{c.tema_puntos.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    </div>
  );
}

/** Abre el PDF del técnico. */
function BotonDocumento({ c }: { c: Charla }) {
  const [abriendo, setAbriendo] = useState(false);
  return (
    <div className="documento-tecnico">
      <span>📄 <b>{c.documento_nombre ?? 'Documento del técnico'}</b></span>
      <button type="button" className="boton" disabled={abriendo} onClick={async () => {
        setAbriendo(true); try { await abrirDocumento(c.documento_ruta!); } catch (e) { aviso((e as Error).message); } setAbriendo(false);
      }}>Abrir el documento</button>
    </div>
  );
}

function VerCharla({ charla, sesion, alCambiar }: { charla: Charla; sesion: Sesion | null; alCambiar: () => void }) {
  const { puede } = useSesion();
  const [editando, setEditando] = useState(false);
  const [firmadas, setFirmadas] = useState<number | null>(sesion ? null : 0);
  useEffect(() => {
    if (!sesion) return;
    prev().from('asistencias').select('id', { count: 'exact', head: true }).eq('sesion_id', sesion.id).is('anulada', null)
      .then(({ count }) => setFirmadas(count ?? 0));
  }, [sesion]);
  const cerrada = !!sesion?.cerrada_en;
  return (
    <>
      <TextoCharla c={charla} />
      {puede('prevencion.charla.editar') && !cerrada && firmadas === 0 && (
        <div className="botonera"><button type="button" className="boton sec" onClick={() => setEditando(true)}>Cambiar el contenido</button></div>)}
      {!cerrada && !!firmadas && <p className="nota">Ya la ha firmado alguien, así que no se puede cambiar: cada trabajador conserva lo que firmó. Para corregirla, anula antes las firmas.</p>}
      {editando && <EditarCharla titulo="Cambiar el contenido" anio={charla.anio} mes={charla.mes} charla={charla}
        alCerrar={() => setEditando(false)} alGuardar={() => { setEditando(false); alCambiar(); }} />}
    </>
  );
}

/** Reduce una foto a JPEG de como mucho 1000 px (para que no pese). */
function aJpeg(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => mal(new Error('No se ha podido leer la imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}
const lineas = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);

function EditarCharla({ titulo, anio, mes, charla, alCerrar, alGuardar }: {
  titulo: string; anio: number; mes: number; charla: Charla | null; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const [v, setV] = useState({
    compromiso: charla?.compromiso ?? '', cuerpo: charla?.cuerpo ?? '', puntos: (charla?.puntos ?? []).join('\n'),
    tema: charla?.tema ?? '', tema_intro: charla?.tema_intro ?? '', tema_puntos: (charla?.tema_puntos ?? []).join('\n'), codigo: charla?.codigo ?? '',
  });
  const [imagen, setImagen] = useState<string | null>(charla?.imagen ?? null);
  const [doc, setDoc] = useState<File | null>(null);
  const [quitarDoc, setQuitarDoc] = useState(false);
  const [escribir, setEscribir] = useState(!!charla?.compromiso);
  const docActual = !quitarDoc ? charla?.documento_nombre ?? null : null;
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pon = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function guardar() {
    const tieneDoc = !!doc || !!docActual;
    if (!v.compromiso.trim() && !tieneDoc) { setError('Sube el documento del técnico o escribe el compromiso del mes.'); return; }
    setOcupado(true); setError(null);
    let documento: Record<string, string | null> = {};
    if (doc) {
      try { documento = { ...await subirDocumento(empresa!.id, anio, mes, doc) }; }
      catch (e) { setOcupado(false); setError((e as Error).message); return; }
    } else if (quitarDoc) documento = { documento_ruta: null, documento_nombre: null, documento_sha256: null };
    const fila = {
      ...documento,
      compromiso: v.compromiso.trim() || null, cuerpo: v.cuerpo.trim() || null, puntos: lineas(v.puntos), tema: v.tema.trim() || null,
      tema_intro: v.tema_intro.trim() || null, tema_puntos: lineas(v.tema_puntos), imagen, codigo: v.codigo.trim() || null,
    };
    const { error } = charla ? await prev().from('charlas').update(fila).eq('id', charla.id)
      : await prev().from('charlas').insert({ ...fila, empresa_id: empresa!.id, anio, mes });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Charla guardada'); alGuardar();
  }
  return (
    <Ventana titulo={titulo} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
      <div className="campo"><span>Documento del técnico (PDF)</span>
        {(doc || docActual) && <p className="nota" style={{ margin: '0 0 6px' }}>📄 {doc?.name ?? docActual}</p>}
        <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <label className="boton sec peq archivo">{doc || docActual ? 'Cambiar el PDF' : 'Subir el PDF del técnico'}
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDoc(f); setQuitarDoc(false); } }} /></label>
          {(doc || docActual) && <button type="button" className="boton txt peq" onClick={() => { setDoc(null); setQuitarDoc(!!charla?.documento_ruta); }}>Quitar</button>}
        </div></div>
      {!escribir && <button type="button" className="boton txt" onClick={() => setEscribir(true)}>Escribir también el texto de la charla</button>}
      {escribir && <>
      <label className="campo"><span>Compromiso del mes</span><textarea rows={2} maxLength={500} value={v.compromiso} onChange={pon('compromiso')} /></label>
      <label className="campo"><span>Texto de la charla</span><textarea rows={5} maxLength={4000} value={v.cuerpo} onChange={pon('cuerpo')} /></label>
      <label className="campo"><span>Preguntas para hablar (una por línea)</span><textarea rows={3} value={v.puntos} onChange={pon('puntos')} /></label>
      <label className="campo"><span>Tema HSE del mes</span><input maxLength={200} value={v.tema} onChange={pon('tema')} /></label>
      <label className="campo"><span>Introducción del tema (opcional)</span><textarea rows={2} maxLength={2000} value={v.tema_intro} onChange={pon('tema_intro')} /></label>
      <label className="campo"><span>Consejos del tema (uno por línea)</span><textarea rows={4} value={v.tema_puntos} onChange={pon('tema_puntos')} /></label>
      <div className="campo"><span>Imagen (opcional)</span>
        {imagen && <img src={imagen} alt="Imagen de la charla" className="miniatura" />}
        <div className="botonera" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <label className="boton sec peq archivo">{imagen ? 'Cambiar imagen' : 'Elegir imagen'}
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setImagen(await aJpeg(f)); } catch (x) { setError((x as Error).message); } } }} /></label>
          {imagen && <button type="button" className="boton txt peq" onClick={() => setImagen(null)}>Quitar</button>}
        </div></div>
      </>}
      <label className="campo"><span>Código del documento (opcional)</span><input maxLength={60} value={v.codigo} onChange={pon('codigo')} /></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}


function DatosSesion({ anio, mes, charla, sesion, alGuardar }: { anio: number; mes: number; charla: Charla; sesion: Sesion | null; alGuardar: () => void }) {
  const { empresa, puede } = useSesion();
  const ajustes = useAjustes();
  const personas = usePersonas();
  const activas = personas.filter((p) => !p.baja);
  const editable = puede('prevencion.charla.editar') && !sesion?.cerrada_en;
  const [v, setV] = useState<Record<string, string>>({});
  const [previstos, setPrevistos] = useState<Set<string> | null>(sesion ? new Set(sesion.previstos) : null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inicial: Record<string, string> = {
    denominacion: sesion?.denominacion ?? `Toolbox Talk HSE ${MESES[mes - 1]} ${String(anio).slice(2)}`,
    fecha: sesion?.fecha ?? '', centro: sesion?.centro ?? ajustes.centro ?? '', duracion: String(sesion?.duracion ?? ajustes.duracion ?? ''),
    formador: sesion?.formador ?? ajustes.formador ?? '', observaciones: sesion?.observaciones ?? '',
  };
  const val = (k: string) => v[k] ?? inicial[k];
  const lista = previstos ?? new Set(activas.map((p) => p.id));
  const pon = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function guardar(): Promise<string | null> {
    const dur = val('duracion').trim();
    if (dur && !/^\d+$/.test(dur)) { setError('La duración son minutos (un número).'); return null; }
    const fila = {
      denominacion: val('denominacion').trim() || null, fecha: val('fecha') || null, centro: val('centro').trim() || null,
      duracion: dur ? Number(dur) : null, formador: val('formador').trim() || null, observaciones: val('observaciones').trim() || null, previstos: [...lista],
    };
    const r = sesion ? await prev().from('sesiones').update(fila).eq('id', sesion.id).select('id').single()
      : await prev().from('sesiones').insert({ ...fila, empresa_id: empresa!.id, charla_id: charla.id }).select('id').single();
    if (r.error) { setError(textoError(r.error.message)); return null; }
    return (r.data as { id: string }).id;
  }
  async function soloGuardar() { setOcupado(true); setError(null); const id = await guardar(); setOcupado(false); if (id) { aviso('Sesión guardada'); alGuardar(); } }
  async function enviar() {
    setOcupado(true); setError(null);
    const id = await guardar();
    if (!id) { setOcupado(false); return; }
    const { data, error } = await prev().rpc('enviar_charla', { p_sesion: id });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso(data ? `Enviada: faltan ${data} por firmar` : 'Enviada: ya han firmado todos'); alGuardar();
  }
  async function cerrar(c: boolean) {
    if (c && !confirm('¿Cerrar el mes? Ya no se podrá firmar ni cambiar (se puede reabrir).')) return;
    const { error } = await prev().rpc('cerrar_sesion', { p_sesion: sesion!.id, p_cerrar: c });
    if (error) { setError(textoError(error.message)); return; }
    aviso(c ? 'Mes cerrado' : 'Mes reabierto'); alGuardar();
  }

  return (
    <>
    <fieldset className="formulario" disabled={!editable}>
      {sesion?.cerrada_en && <p className="aviso-linea">Cerrado el {fechaCorta(sesion.cerrada_en)}.</p>}
      <label className="campo"><span>Denominación</span><input value={val('denominacion')} maxLength={200} onChange={pon('denominacion')} /></label>
      <div className="dos">
        <label className="campo"><span>Fecha</span><input type="date" value={val('fecha')} onChange={pon('fecha')} /></label>
        <label className="campo"><span>Duración (min)</span><input inputMode="numeric" value={val('duracion')} onChange={pon('duracion')} /></label>
      </div>
      <label className="campo"><span>Lugar</span><input value={val('centro')} maxLength={200} onChange={pon('centro')} /></label>
      <label className="campo"><span>Formador</span><input value={val('formador')} maxLength={120} onChange={pon('formador')} /></label>
      <label className="campo"><span>Observaciones</span><textarea rows={2} maxLength={1000} value={val('observaciones')} onChange={pon('observaciones')} /></label>
      <p className="nota" style={{ margin: '0 0 6px' }}>Tienen que firmarla ({lista.size}):</p>
      <div className="lista compacta">
        {activas.map((p) => (
          <label key={p.id} className="fila check">
            <input type="checkbox" checked={lista.has(p.id)} onChange={() => setPrevistos(() => { const n = new Set(lista); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
            <span className="fila-txt"><b>{p.nombre}</b>{p.categoria && <small>{p.categoria}</small>}</span>
          </label>
        ))}
        {!activas.length && <p className="nota" style={{ padding: 12 }}>No hay trabajadores en esta unidad.</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </fieldset>
    {sesion?.cerrada_en && puede('prevencion.charla.editar') && <EnvioPrevencion anio={anio} mes={mes} charla={charla} sesion={sesion} alApuntar={alGuardar} />}
    {puede('prevencion.charla.editar') && (
        <div className="botonera">
          {sesion?.cerrada_en ? <button type="button" className="boton sec" onClick={() => cerrar(false)}>Reabrir el mes</button> : <>
            <button type="button" className="boton sec" disabled={ocupado} onClick={soloGuardar}>Guardar</button>
            <button type="button" className="boton" disabled={ocupado || !lista.size} onClick={enviar}>{sesion?.enviada_en ? 'Guardar y volver a avisar' : 'Enviar a firmar'}</button>
            {sesion?.enviada_en && <button type="button" className="boton sec" onClick={() => cerrar(true)}>Cerrar el mes</button>}
          </>}
        </div>
      )}
    </>
  );
}

/** Quién ha firmado: ver firmas, recoger la de alguien en este móvil, anular una mal hecha, imprimir. */
function FirmasSesion({ charla, sesion, alCambiar }: { charla: Charla; sesion: Sesion; alCambiar: () => void }) {
  const { puede } = useSesion();
  const personas = usePersonas();
  const [asis, setAsis] = useState<Asistencia[] | null>(null);
  const [imagenes, setImagenes] = useState<Record<string, string>>({});
  const [recoger, setRecoger] = useState<Persona | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const ajustes = useAjustes();
  async function pdf() {
    setHaciendo(true);
    try { const r = await pdfCompleto(charla, sesion, ajustes); descargar(r.bytes, r.nombre); }
    catch (e) { aviso('No se ha podido hacer el PDF: ' + (e as Error).message); }
    setHaciendo(false);
  }
  const cerrada = !!sesion.cerrada_en;

  const cargar = useCallback(async () => {
    const { data } = await prev().from('asistencias').select('*').eq('sesion_id', sesion.id).is('anulada', null).order('creado');
    const a = (data ?? []) as Asistencia[];
    setAsis(a);
    const ids = a.map((x) => x.firma_id).filter(Boolean) as string[];
    if (ids.length) {
      const f = await nucleo().from('firmas').select('id, imagen').in('id', ids);
      setImagenes(Object.fromEntries(((f.data ?? []) as { id: string; imagen: string }[]).map((x) => [x.id, x.imagen])));
    }
  }, [sesion]);
  useEffect(() => { cargar(); }, [cargar]);

  const faltan = useMemo(() => sesion.previstos.filter((id) => !asis?.some((a) => a.persona_id === id))
    .map((id) => personas.find((p) => p.id === id) ?? { id, nombre: 'Trabajador', categoria: null, baja: null }), [sesion, asis, personas]);

  async function anular(a: Asistencia) {
    if (!confirm(`¿Anular la firma de ${a.nombre}? Tendrá que volver a firmar.`)) return;
    const { error } = await prev().rpc('anular_asistencia', { p_asistencia: a.id });
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Firma anulada'); cargar(); alCambiar();
  }
  if (asis === null) return <p className="nota">Cargando…</p>;
  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Han firmado <b>{asis.length}</b> de {sesion.previstos.length}.</p>
      <div className="lista">
        {asis.map((a) => (
          <div key={a.id} className="fila fija centrada">
            <span className="fila-txt"><b>{a.nombre}</b><small>{a.puesto ?? ''}{a.puesto ? ' · ' : ''}{new Date(a.creado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</small></span>
            {a.firma_id && imagenes[a.firma_id] && <img className="firma-mini" src={imagenes[a.firma_id]} alt={`Firma de ${a.nombre}`} />}
            {!cerrada && puede('prevencion.firma.anular') && <button type="button" className="boton txt peq" onClick={() => anular(a)}>Anular</button>}
          </div>
        ))}
        {faltan.map((p) => (
          <div key={p.id} className="fila fija centrada">
            <span className="fila-txt"><b>{p.nombre}</b><small>Falta por firmar</small></span>
            <span className="chapa pendiente">Falta</span>
            {!cerrada && puede('prevencion.firma.recoger') && <button type="button" className="boton txt peq" onClick={() => setRecoger(p)}>Firmar aquí</button>}
          </div>
        ))}
      </div>
      <div className="botonera"><button type="button" className="boton sec" disabled={haciendo} onClick={pdf}>{haciendo ? 'Haciendo el PDF…' : 'PDF oficial'}</button></div>
      {recoger && <FirmarCharla charla={charla} sesion={sesion} persona={recoger} alCerrar={() => setRecoger(null)}
        alFirmar={() => { setRecoger(null); cargar(); alCambiar(); }} />}
    </>
  );
}

/** PDF oficial de firmas y, detrás, el documento del técnico (si lo hay). */
async function pdfCompleto(charla: Charla, sesion: Sesion, ajustes: Record<string, string>) {
  const r = await pdfToolbox(await datosToolbox(charla, sesion, ajustes));
  if (!charla.documento_ruta) return r;
  return { nombre: r.nombre, bytes: await unirPdfs(r.bytes, await bajarDocumento(charla.documento_ruta)) };
}

/** Todo lo que lleva el PDF oficial del mes: charla, sesión, firmas (con su imagen) y datos por defecto. */
async function datosToolbox(charla: Charla, sesion: Sesion, ajustes: Record<string, string>): Promise<DatosToolbox> {
  const { data } = await prev().from('asistencias').select('*').eq('sesion_id', sesion.id).is('anulada', null);
  const asis = (data ?? []) as Asistencia[];
  const ids = asis.map((a) => a.firma_id).filter(Boolean) as string[];
  const f = ids.length ? ((await nucleo().from('firmas').select('id, imagen, firmado_en').in('id', ids)).data ?? []) as { id: string; imagen: string; firmado_en: string }[] : [];
  return {
    anio: charla.anio, mes: charla.mes, charla, sesion,
    firmas: asis.map((a) => { const x = f.find((y) => y.id === a.firma_id); return { nombre: a.nombre, puesto: a.puesto, imagen: x?.imagen ?? null, firmado_en: x?.firmado_en ?? a.creado }; }),
    ajustes,
  };
}

/** Enviar a prevención el mes cerrado: la app prepara el PDF y el correo, se envía desde el móvil y se apunta. */
function EnvioPrevencion({ anio, mes, charla, sesion, alApuntar }: { anio: number; mes: number; charla: Charla; sesion: Sesion; alApuntar: () => void }) {
  const { estado } = useSesion();
  const ajustes = useAjustes();
  const [paso, setPaso] = useState<'inicio' | 'enviar'>('inicio');
  const [archivo, setArchivo] = useState<{ bytes: Uint8Array; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  const destino = ajustes.correo_prl ?? '';
  const mesTxt = `${MESES[mes - 1]} ${anio}`;
  const asunto = `Documentación PRL ${mesTxt} · Toolbox` + (ajustes.empresa ? ` · ${ajustes.empresa}` : '');

  async function preparar() {
    setOcupado(true); setError(null);
    try {
      setArchivo(await pdfCompleto(charla, sesion, ajustes));
      setPaso('enviar');
    } catch (e) { setError('No se ha podido hacer el PDF: ' + (e as Error).message); }
    setOcupado(false);
  }
  function texto(firmados: number) {
    return [`Hola${ajustes.correo_prl_nombre ? ' ' + ajustes.correo_prl_nombre : ''},`, '',
      `Te adjunto la documentación de prevención de ${mesTxt}${ajustes.centro ? ' (' + ajustes.centro + ')' : ''}:`, '',
      `- Toolbox del mes${charla.tema ? ': ' + charla.tema : ''}. Han firmado ${firmados} de ${sesion.previstos.length}.`, '',
      'Un saludo,', yo].join('\n');
  }
  async function abrirCorreo() {
    if (!archivo) return;
    const { count } = await prev().from('asistencias').select('id', { count: 'exact', head: true }).eq('sesion_id', sesion.id).is('anulada', null);
    const cuerpo = texto(count ?? 0);
    const file = new File([archivo.bytes as BlobPart], archivo.nombre, { type: 'application/pdf' });
    // en el móvil: compartir (se elige Outlook o el correo, con el PDF y el texto ya puestos)
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: asunto, text: cuerpo }); } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); }
      return;
    }
    // en el ordenador: se descarga el PDF y se abre un correo nuevo con todo puesto
    descargar(archivo.bytes, archivo.nombre);
    setTimeout(() => { location.href = `mailto:${destino.split(/\s*[,;]\s*/).filter(Boolean).map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`; }, 600);
  }
  async function hecho() {
    setOcupado(true);
    const { error } = await prev().rpc('apuntar_envio', { p_sesion: sesion.id, p_destino: (destino || 'sin correo puesto') + ' (desde mi correo)' });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Apuntado como enviado a prevención'); setPaso('inicio'); alApuntar();
  }

  return (
    <section className="envio-prev" aria-label="Enviar a prevención">
      <h3 className="subtitulo" style={{ marginTop: 0 }}>Enviar a prevención</h3>
      {sesion.prev_enviado_en
        ? <p><span className="chapa firmado">Enviado</span> el {new Date(sesion.prev_enviado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
          {sesion.prev_destino ? ` · ${sesion.prev_destino}` : ''}</p>
        : <p><span className="chapa pendiente">Sin enviar</span>{destino ? ` · a ${destino}` : ''}</p>}
      {!destino && <p className="nota">Pon el correo del técnico de prevención en «Datos por defecto» (en la lista de meses) para que salga ya puesto.</p>}
      {paso === 'inicio' ? (
        <button type="button" className="boton ancho" disabled={ocupado} onClick={preparar}>{ocupado ? 'Haciendo el PDF…' : sesion.prev_enviado_en ? 'Volver a enviar desde mi correo' : 'Enviar desde mi correo'}</button>
      ) : (
        <div className="pasos-envio">
          <ol>
            <li>Pulsa <b>Abrir el correo</b>: en el móvil, elige Outlook (o tu correo); el PDF y el texto ya van puestos.</li>
            <li>Pon el destinatario si no sale{destino ? ` (${destino})` : ''} y dale a <b>Enviar</b>.</li>
            <li>Vuelve aquí y pulsa <b>Ya lo he enviado</b>.</li>
          </ol>
          <button type="button" className="boton ancho" onClick={abrirCorreo}>Abrir el correo</button>
          <button type="button" className="boton sec ancho" disabled={ocupado} onClick={hecho}>Ya lo he enviado</button>
          <button type="button" className="boton txt ancho" onClick={() => setPaso('inicio')}>Cancelar</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

/** Firmar una charla: el propio trabajador o, en el móvil del jefe, otro trabajador. */
function FirmarCharla({ charla, sesion, persona, alCerrar, alFirmar }: {
  charla: Charla; sesion: Sesion; persona: { id: string; nombre: string; categoria: string | null }; alCerrar: () => void; alFirmar: () => void;
}) {
  const { estado } = useSesion();
  const [leida, setLeida] = useState(false);
  const [puesto, setPuesto] = useState('');
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
  async function firmar() {
    if (!png) { setError('Falta la firma.'); return; }
    setOcupado(true); setError(null);
    const { error } = await prev().rpc('firmar_charla', {
      p_sesion: sesion.id, p_persona: persona.id, p_puesto: puesto.trim() || null, p_imagen: png,
      p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Firmada'); alFirmar();
  }
  return (
    <Ventana titulo={sesion.denominacion ?? 'Charla'} alCerrar={alCerrar}
      pie={leida
        ? <><button type="button" className="boton sec" onClick={() => setLeida(false)}>Atrás</button><button type="button" className="boton" disabled={ocupado} onClick={firmar}>Firmar</button></>
        : <button type="button" className="boton" onClick={() => setLeida(true)}>La he leído, firmar</button>}>
      {!leida ? <TextoCharla c={charla} /> : (
        <>
          <p style={{ marginTop: 0 }}><b>{persona.nombre}</b></p>
          <label className="campo"><span>Puesto (si lo dejas vacío, el de su ficha)</span><input value={puesto} maxLength={80} placeholder={persona.categoria ?? ''} onChange={(e) => setPuesto(e.target.value)} /></label>
          <p className="nota" style={{ marginBottom: 8 }}>Firmo que he asistido a la charla «{sesion.denominacion}» y la he entendido.</p>
          <Firma alCambiar={setPng} />
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Mis charlas (cualquier trabajador)
// ---------------------------------------------------------------------------------------------
function MisCharlas() {
  const { empresa, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
  const [datos, setDatos] = useState<{ persona: { id: string; nombre: string; categoria: string | null }; pendientes: { s: Sesion; c: Charla }[]; firmadas: Asistencia[] } | null>(null);
  const [sinFicha, setSinFicha] = useState(false);
  const [firmando, setFirmando] = useState<{ s: Sesion; c: Charla } | null>(null);

  const cargar = useCallback(async () => {
    const { data: u } = await nucleo().from('usuarios').select('persona_id').eq('id', yo!).maybeSingle();
    const pid = (u as { persona_id: string | null } | null)?.persona_id;
    if (!pid) { setSinFicha(true); return; }
    const [p, s, a] = await Promise.all([
      nucleo().from('personas').select('id, nombre, categoria').eq('id', pid).maybeSingle(),
      prev().from('sesiones').select('*').eq('empresa_id', empresa!.id).contains('previstos', [pid]).not('enviada_en', 'is', null).is('cerrada_en', null),
      prev().from('asistencias').select('*').eq('persona_id', pid).is('anulada', null),
    ]);
    const mias = (a.data ?? []) as Asistencia[];
    const ses = ((s.data ?? []) as Sesion[]).filter((x) => !mias.some((m) => m.sesion_id === x.id));
    const cids = ses.map((x) => x.charla_id);
    const cs = cids.length ? ((await prev().from('charlas').select('*').in('id', cids)).data ?? []) as Charla[] : [];
    setDatos({
      persona: (p.data as { id: string; nombre: string; categoria: string | null }) ?? { id: pid, nombre: '', categoria: null },
      pendientes: ses.map((x) => ({ s: x, c: cs.find((c) => c.id === x.charla_id)! })).filter((x) => x.c),
      firmadas: [...mias].sort((x, y) => y.creado.localeCompare(x.creado)),
    });
  }, [empresa, yo]);
  useEffect(() => { cargar(); }, [cargar]);

  if (sinFicha) return <div className="vacio"><p><b>Tu usuario no está enlazado con tu ficha de trabajador.</b></p><p>Pídeselo a tu administrador (Configuración → Usuarios).</p></div>;
  if (!datos) return <p className="nota">Cargando…</p>;
  return (
    <>
      <MisDocumentos persona={datos.persona.id} />
      {datos.pendientes.length > 0
        ? <p className="aviso-linea">Tienes {datos.pendientes.length === 1 ? 'una charla' : `${datos.pendientes.length} charlas`} por leer y firmar.</p>
        : <div className="vacio" style={{ marginBottom: 12 }}><p>No tienes ninguna charla por firmar.</p></div>}
      {datos.pendientes.length > 0 && (
        <div className="lista" style={{ marginBottom: 16 }}>
          {datos.pendientes.map((x) => (
            <button key={x.s.id} type="button" className="fila" onClick={() => setFirmando(x)}>
              <span className="fila-txt"><b>{x.s.denominacion ?? `${MESES[x.c.mes - 1]} ${x.c.anio}`}</b><small>{x.c.tema ?? x.c.compromiso ?? x.c.documento_nombre}</small></span>
              <span className="chapa pendiente">Firmar</span>
            </button>
          ))}
        </div>
      )}
      {datos.firmadas.length > 0 && <>
        <h2 className="subtitulo">Ya firmadas</h2>
        <div className="lista">
          {datos.firmadas.map((a) => (
            <div key={a.id} className="fila fija"><span className="fila-txt"><b>Firmada el {fechaCorta(a.creado)}</b>{a.puesto && <small>{a.puesto}</small>}</span>
              <span className="chapa firmado">Firmada</span></div>
          ))}
        </div></>}
      <MisTallas persona={datos.persona.id} />
      {firmando && <FirmarCharla charla={firmando.c} sesion={firmando.s} persona={datos.persona} alCerrar={() => setFirmando(null)}
        alFirmar={() => { setFirmando(null); cargar(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Fichas de los trabajadores
// ---------------------------------------------------------------------------------------------
interface Ficha {
  persona_id: string; dni: string | null; puesto: string | null; fecha_alta: string | null; fecha_baja: string | null; motivo_baja: string | null;
  telefono: string | null; emerg_nombre: string | null; emerg_tel: string | null; idioma: string | null; tallas: Record<string, string>;
  tallas_propuestas?: Record<string, string> | null;
}
interface Prenda { id: string; codigo: string; nombre: string; orden: number; baja: string | null }
const MOTIVOS_BAJA = ['Fin de contrato', 'Dimisión', 'Despido', 'Excedencia', 'Fin de obra o proyecto', 'Otro'];

function Fichas() {
  const { empresa, puede } = useSesion();
  const personas = usePersonas();
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [prendas, setPrendas] = useState<Prenda[]>([]);
  const [abierta, setAbierta] = useState<Persona | null>(null);
  const [verBajas, setVerBajas] = useState(false);
  const [editarPrendas, setEditarPrendas] = useState(false);

  const cargar = useCallback(async () => {
    const [f, p] = await Promise.all([
      prev().from('fichas').select('*').eq('empresa_id', empresa!.id),
      prev().from('prendas').select('*').eq('empresa_id', empresa!.id).order('orden'),
    ]);
    setFichas((f.data ?? []) as Ficha[]); setPrendas(((p.data ?? []) as Prenda[]).filter((x) => !x.baja));
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);

  if (fichas === null) return <p className="nota">Cargando…</p>;
  const visibles = personas.filter((p) => verBajas || !p.baja);
  const bajas = personas.filter((p) => p.baja).length;
  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Datos personales: solo los ve quien tiene permiso. El encargado no los ve.</p>
      <div className="lista">
        {visibles.map((p) => {
          const f = fichas.find((x) => x.persona_id === p.id);
          const faltan = [!f?.dni && 'DNI', !f?.fecha_alta && 'fecha de alta', prendas.some((x) => !f?.tallas?.[x.codigo]) && 'tallas'].filter(Boolean);
          return (
            <button key={p.id} type="button" className={'fila' + (p.baja ? ' de-baja' : '')} onClick={() => setAbierta(p)}>
              <span className="fila-txt"><b>{p.nombre}</b>
                <small>{p.baja ? 'Dado de baja · ' : ''}{f?.puesto ?? p.categoria ?? ''}{faltan.length ? `${f?.puesto || p.categoria ? ' · ' : ''}Falta: ${faltan.join(', ')}` : ''}</small></span>
              <span className="fila-flecha" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      <div className="botonera">
        {bajas > 0 && <button type="button" className="boton txt" onClick={() => setVerBajas(!verBajas)}>{verBajas ? 'Esconder los dados de baja' : `Ver los dados de baja (${bajas})`}</button>}
        {puede('prevencion.ficha.editar') && <button type="button" className="boton sec" onClick={() => setEditarPrendas(true)}>Prendas con talla</button>}
      </div>
      {abierta && <FormFicha persona={abierta} ficha={fichas.find((x) => x.persona_id === abierta.id) ?? null} prendas={prendas}
        alCerrar={() => setAbierta(null)} alGuardar={() => { setAbierta(null); cargar(); }} />}
      {editarPrendas && <Prendas prendas={prendas} alCerrar={() => { setEditarPrendas(false); cargar(); }} />}
    </>
  );
}

function FormFicha({ persona, ficha, prendas, alCerrar, alGuardar }: { persona: Persona; ficha: Ficha | null; prendas: Prenda[]; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa, puede } = useSesion();
  const editable = puede('prevencion.ficha.editar');
  const campos = ['dni', 'puesto', 'fecha_alta', 'fecha_baja', 'motivo_baja', 'telefono', 'emerg_nombre', 'emerg_tel', 'idioma'] as const;
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(campos.map((k) => [k, (ficha?.[k] as string | null) ?? ''])));
  const [tallas, setTallas] = useState<Record<string, string>>(ficha?.tallas ?? {});
  const [error, setError] = useState<string | null>(null);
  const pon = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: k === 'dni' ? e.target.value.toUpperCase().replace(/[\s.-]/g, '') : e.target.value }));
  async function guardar() {
    if (v.fecha_alta && v.fecha_baja && v.fecha_baja < v.fecha_alta) { setError('La fecha de baja no puede ser antes del alta.'); return; }
    const fila: Record<string, unknown> = Object.fromEntries(campos.map((k) => [k, v[k].trim() || null]));
    fila.tallas = Object.fromEntries(Object.entries(tallas).map(([k, x]) => [k, x.trim()]).filter(([, x]) => x));
    const { error } = await prev().from('fichas').upsert({ ...fila, persona_id: persona.id, empresa_id: empresa!.id }, { onConflict: 'persona_id' });
    if (error) { setError(textoError(error.message)); return; }
    aviso('Ficha guardada'); alGuardar();
  }
  return (
    <Ventana titulo={persona.nombre} alCerrar={alCerrar}
      pie={editable ? <><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={guardar}>Guardar</button></> : undefined}>
      <fieldset className="formulario" disabled={!editable}>
        <h3 className="subtitulo" style={{ marginTop: 0 }}>Identificación</h3>
        <div className="dos">
          <label className="campo"><span>DNI / NIE</span><input value={v.dni} maxLength={12} autoCapitalize="characters" onChange={pon('dni')} /></label>
          <label className="campo"><span>Puesto</span><input value={v.puesto} maxLength={80} placeholder={persona.categoria ?? ''} onChange={pon('puesto')} /></label>
          <label className="campo"><span>Fecha de alta</span><input type="date" value={v.fecha_alta} onChange={pon('fecha_alta')} /></label>
          <label className="campo"><span>Fecha de baja</span><input type="date" value={v.fecha_baja} onChange={pon('fecha_baja')} /></label>
        </div>
        {v.fecha_baja && <label className="campo"><span>Motivo de la baja</span>
          <select value={v.motivo_baja} onChange={pon('motivo_baja')}><option value="">—</option>{MOTIVOS_BAJA.map((m) => <option key={m}>{m}</option>)}</select></label>}
        <label className="campo"><span>Idioma que mejor entiende</span><input value={v.idioma} maxLength={40} onChange={pon('idioma')} /></label>
        <h3 className="subtitulo">Contacto</h3>
        <label className="campo"><span>Teléfono</span><input type="tel" value={v.telefono} maxLength={30} onChange={pon('telefono')} /></label>
        <div className="dos">
          <label className="campo"><span>En caso de emergencia, avisar a</span><input value={v.emerg_nombre} maxLength={80} onChange={pon('emerg_nombre')} /></label>
          <label className="campo"><span>Su teléfono</span><input type="tel" value={v.emerg_tel} maxLength={30} onChange={pon('emerg_tel')} /></label>
        </div>
        <h3 className="subtitulo">Tallas</h3>
        {ficha?.tallas_propuestas && puede('prevencion.ficha.editar') && <TallasPropuestas persona={persona.id} propuestas={ficha.tallas_propuestas}
          tallas={ficha.tallas ?? {}} nombres={Object.fromEntries(prendas.map((p) => [p.codigo, p.nombre]))} alResolver={alGuardar} />}
        {prendas.length ? <div className="dos">{prendas.map((p) => <label key={p.codigo} className="campo"><span>{p.nombre}</span>
          <input value={tallas[p.codigo] ?? ''} maxLength={10} onChange={(e) => setTallas((t) => ({ ...t, [p.codigo]: e.target.value }))} /></label>)}</div>
          : <p className="nota">No hay prendas dadas de alta (botón «Prendas con talla»).</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
      {puede('prevencion.firma.ver') && <DocumentosFirmados persona={persona} />}
    </Ventana>
  );
}

/** Todo lo que ha firmado el trabajador (para una auditoría): se queda en su ficha aunque se dé de baja. */
function DocumentosFirmados({ persona }: { persona: Persona }) {
  const ajustes = useAjustes();
  interface Linea { id: string; titulo: string; sub: string; cuando: string; anulado: string | null; pdf: () => Promise<void> }
  const [lista, setLista] = useState<Linea[] | null>(null);
  const [haciendo, setHaciendo] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const [ra, rd] = await Promise.all([
        prev().from('asistencias').select('*').eq('persona_id', persona.id),
        prev().from('documentos').select('*').eq('persona_id', persona.id).not('firma_id', 'is', null),
      ]);
      const a = (ra.data ?? []) as Asistencia[];
      const sids = [...new Set(a.map((x) => x.sesion_id))];
      const ss = sids.length ? ((await prev().from('sesiones').select('*').in('id', sids)).data ?? []) as Sesion[] : [];
      const cids = [...new Set(ss.map((x) => x.charla_id))];
      const cs = cids.length ? ((await prev().from('charlas').select('*').in('id', cids)).data ?? []) as Charla[] : [];
      const charlas: Linea[] = a.flatMap((x) => {
        const se = ss.find((y) => y.id === x.sesion_id); const c = se && cs.find((y) => y.id === se.charla_id);
        if (!se || !c) return [];
        return [{ id: x.id, titulo: se.denominacion ?? `Toolbox ${MESES[c.mes - 1]} ${c.anio}`, cuando: x.creado, anulado: x.anulada,
          sub: `${x.anulada ? `Anulada el ${fechaCorta(x.anulada)}` : `Firmada el ${fechaCorta(x.creado)}`}${c.tema ? ` · ${c.tema}` : ''}`,
          pdf: async () => { const r = await pdfCompleto(c, se, ajustes); descargar(r.bytes, r.nombre); } }];
      });
      const docs: Linea[] = ((rd.data ?? []) as Documento[]).map((d) => ({
        id: d.id, titulo: tituloDoc(d), cuando: d.firmado_en ?? d.creado, anulado: d.anulado,
        sub: d.anulado ? `Anulada el ${fechaCorta(d.anulado)}` : `Firmada el ${fechaCorta(d.firmado_en)}`,
        pdf: () => descargarDocumentos([d], ajustes),
      }));
      setLista([...charlas, ...docs].sort((x, y) => y.cuando.localeCompare(x.cuando)));
    })();
  }, [persona, ajustes]);
  async function pdf(x: Linea) {
    setHaciendo(x.id);
    try { await x.pdf(); } catch (e) { aviso('No se ha podido hacer el PDF: ' + (e as Error).message); }
    setHaciendo(null);
  }
  return (
    <section className="firmados">
      <h3 className="subtitulo">Documentos firmados</h3>
      {lista === null ? <p className="nota">Cargando…</p> : !lista.length ? <p className="nota">Todavía no ha firmado nada.</p> : (
        <div className="lista">
          {lista.map((x) => (
            <div key={x.id} className={'fila fija centrada' + (x.anulado ? ' de-baja' : '')}>
              <span className="fila-txt"><b>{x.titulo}</b><small>{x.sub}</small></span>
              {!x.anulado && <button type="button" className="boton sec peq" disabled={haciendo === x.id} onClick={() => pdf(x)}>{haciendo === x.id ? 'Haciendo…' : 'PDF'}</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Prendas({ prendas, alCerrar }: { prendas: Prenda[]; alCerrar: () => void }) {
  const { empresa } = useSesion();
  const [nueva, setNueva] = useState('');
  const [lista, setLista] = useState(prendas);
  const [error, setError] = useState<string | null>(null);
  async function anadir() {
    const nombre = nueva.trim(); if (!nombre) return;
    const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'prenda';
    let codigo = /^[a-z]/.test(base) ? base : 'p_' + base, n = 2;
    while (lista.some((p) => p.codigo === codigo)) codigo = `${base}_${n++}`;
    const { data, error } = await prev().from('prendas').insert({ empresa_id: empresa!.id, codigo, nombre, orden: lista.length + 1 }).select().single();
    if (error) { setError(error.message); return; }
    setLista((l) => [...l, data as Prenda]); setNueva('');
  }
  async function quitar(p: Prenda) {
    if (!confirm(`¿Quitar «${p.nombre}» de la lista? Las tallas ya apuntadas no se borran.`)) return;
    const { error } = await prev().from('prendas').update({ baja: new Date().toISOString() }).eq('id', p.id);
    if (error) { setError(error.message); return; }
    setLista((l) => l.filter((x) => x.id !== p.id));
  }
  return (
    <Ventana titulo="Prendas con talla" alCerrar={alCerrar}>
      <div className="lista" style={{ marginBottom: 12 }}>
        {lista.map((p) => <div key={p.id} className="fila fija centrada"><span className="fila-txt"><b>{p.nombre}</b></span>
          <button type="button" className="boton txt peq" onClick={() => quitar(p)}>Quitar</button></div>)}
        {!lista.length && <p className="nota" style={{ padding: 12 }}>Todavía no hay ninguna.</p>}
      </div>
      <div className="barra-lista">
        <input aria-label="Prenda nueva" placeholder="Por ejemplo: Botas de seguridad" value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') anadir(); }} />
        <button type="button" className="boton" onClick={anadir}>Añadir</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
