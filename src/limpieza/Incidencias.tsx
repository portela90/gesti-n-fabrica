// Limpieza · Incidencias y problemas repetidos. Solo el administrador las ve todas y las gestiona;
// cada uno ve las suyas y cómo van, y puede crear una a mano.
import { useCallback, useEffect, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { fotoAJpeg, limp, textoError } from './MiDia';
import { Tabla, useOrdenador } from '../componentes/Tabla';

type Estado = 'abierta' | 'en_proceso' | 'resuelta' | 'descartada';
interface Incidencia { id: string; tema: string | null; texto: string; lugar: string | null; urgente: boolean; fotos: string[]; estado: Estado; origen: string;
  creado: string; persona_id: string | null; trabajo_id: string | null }
interface Nota { id: string; texto: string | null; estado: Estado | null; creado: string; creado_por: string | null }

const ESTADO: Record<Estado, [string, string]> = {
  abierta: ['Abierta', 'sin-cuadrar'], en_proceso: ['En proceso', 'pendiente'], resuelta: ['Resuelta', 'firmado'], descartada: ['Descartada', 'sin'],
};
const ORIGEN: Record<string, string> = { trabajo: '«Hay un problema» en un trabajo', checklist: 'Punto mal de una checklist', encargado: 'Checklist del encargado', mano: 'Creada a mano' };
const cuando = (f: string) => new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Incidencias() {
  const { empresa, puede } = useSesion();
  const admin = puede('limpieza.incidencia.editar');
  const ordenador = useOrdenador();
  const [ver, setVer] = useState<'abiertas' | 'cerradas'>('abiertas');
  const [lista, setLista] = useState<Incidencia[] | null>(null);
  const [personas, setPersonas] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<Incidencia | null>(null);
  const [nueva, setNueva] = useState(false);
  const cargar = useCallback(async () => {
    let q = limp().from('incidencias').select('id, tema, texto, lugar, urgente, fotos, estado, origen, creado, persona_id, trabajo_id').eq('empresa_id', empresa!.id);
    q = ver === 'abiertas' ? q.in('estado', ['abierta', 'en_proceso']) : q.in('estado', ['resuelta', 'descartada']);
    const { data, error } = await q.order('creado', { ascending: false }).limit(200);
    if (error) { aviso(textoError(error.message)); setLista([]); return; }
    const l = (data ?? []) as Incidencia[];
    setLista(admin ? l.sort((a, b) => Number(b.urgente) - Number(a.urgente)) : l);
  }, [empresa, ver, admin]);
  useEffect(() => { setLista(null); cargar(); }, [cargar]);
  useEffect(() => {
    if (!admin) return;
    nucleo().from('personas').select('id, nombre').eq('empresa_id', empresa!.id).then(({ data }) =>
      setPersonas(Object.fromEntries(((data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]))));
  }, [empresa, admin]);
  return (
    <>
      <div className="acciones-cal" style={{ marginTop: 0, marginBottom: 12 }}>
        <span className="segmentos" role="group" aria-label="Qué incidencias">
          <button type="button" aria-pressed={ver === 'abiertas'} onClick={() => setVer('abiertas')}>Abiertas</button>
          <button type="button" aria-pressed={ver === 'cerradas'} onClick={() => setVer('cerradas')}>Cerradas</button>
        </span>
        {puede('limpieza.trabajo.apuntar') && <button type="button" className="boton" onClick={() => setNueva(true)}>+ Incidencia</button>}
      </div>
      {!admin && <p className="nota" style={{ marginTop: 0 }}>Aquí ves las incidencias que has abierto tú y cómo van.</p>}
      {lista === null ? <p className="nota">Cargando…</p> : !lista.length ? <div className="vacio"><p>{ver === 'abiertas' ? 'No hay incidencias abiertas.' : 'No hay incidencias cerradas.'}</p></div> : ordenador ? (
        <Tabla key={ver} filas={lista} clave={(i) => i.id} alAbrir={(i) => setAbierta(i)} etiquetaBuscar="Buscar incidencia" pistaBuscar="Buscar incidencia, sitio o tema…"
          claseFila={(i) => (i.urgente && ver === 'abiertas' ? 'sin-leer' : '')}
          filtros={ver === 'abiertas' ? [{ clave: 'urg', texto: 'Urgentes', cumple: (i) => i.urgente }, { clave: 'ab', texto: 'Abiertas', cumple: (i) => i.estado === 'abierta' },
            { clave: 'pro', texto: 'En proceso', cumple: (i) => i.estado === 'en_proceso' }]
            : [{ clave: 'res', texto: 'Resueltas', cumple: (i) => i.estado === 'resuelta' }, { clave: 'des', texto: 'Descartadas', cumple: (i) => i.estado === 'descartada' }]}
          columnas={[
            { clave: 'texto', titulo: 'Incidencia', valor: (i) => i.texto },
            { clave: 'lugar', titulo: 'Dónde', valor: (i) => i.lugar ?? '' },
            { clave: 'tema', titulo: 'Tema', valor: (i) => i.tema ?? '' },
            ...(admin ? [{ clave: 'quien', titulo: 'Quién', valor: (i: Incidencia) => (i.persona_id ? personas[i.persona_id] ?? '' : '') }] : []),
            { clave: 'cuando', titulo: 'Cuándo', valor: (i) => cuando(i.creado), orden: (i) => i.creado },
            { clave: 'estado', titulo: 'Estado', orden: (i) => (i.urgente && ver === 'abiertas' ? 'a' : 'b') + i.estado, valor: (i) => <>
              {i.urgente && ver === 'abiertas' && <span className="chapa sin-cuadrar">Urgente</span>}{' '}
              <span className={'chapa ' + ESTADO[i.estado][1]}>{ESTADO[i.estado][0]}</span></> },
          ]} />
      ) : (
        <div className="lista">{lista.map((i) => (
          <button key={i.id} type="button" className={'fila fila-finde' + (i.urgente && ver === 'abiertas' ? ' sin-leer' : '')} onClick={() => setAbierta(i)}>
            <span className="fila-txt"><b>{i.texto}</b>
              <small>{[i.lugar, i.tema, admin && i.persona_id ? personas[i.persona_id] : '', cuando(i.creado)].filter(Boolean).join(' · ')}</small></span>
            {i.urgente && ver === 'abiertas' && <span className="chapa sin-cuadrar">Urgente</span>}
            <span className={'chapa ' + ESTADO[i.estado][1]}>{ESTADO[i.estado][0]}</span>
          </button>))}</div>)}
      {admin && ver === 'abiertas' && <Problemas />}
      {admin && <Temas />}
      {abierta && <DetalleIncidencia i={abierta} admin={admin} quien={abierta.persona_id ? personas[abierta.persona_id] : undefined}
        alCerrar={() => setAbierta(null)} alCambiar={() => { setAbierta(null); cargar(); }} />}
      {nueva && <NuevaIncidencia alCerrar={() => setNueva(false)} alCrear={() => { setNueva(false); setVer('abiertas'); cargar(); }} />}
    </>
  );
}

function Foto({ ruta }: { ruta: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { supabase.storage.from('limpieza').createSignedUrl(ruta, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [ruta]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img className="foto-mini" src={url} alt="Foto de la incidencia" /></a> : <span className="foto-mini" />;
}

function DetalleIncidencia({ i, admin, quien, alCerrar, alCambiar }: { i: Incidencia; admin: boolean; quien?: string; alCerrar: () => void; alCambiar: () => void }) {
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [fotosTrabajo, setFotosTrabajo] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    limp().from('incidencia_notas').select('id, texto, estado, creado, creado_por').eq('incidencia_id', i.id).order('creado').then(({ data }) => setNotas((data ?? []) as Nota[]));
    if (i.trabajo_id && i.origen === 'trabajo') {
      limp().from('trabajos').select('fotos').eq('id', i.trabajo_id).maybeSingle().then(({ data }) =>
        setFotosTrabajo(((data?.fotos ?? []) as { ruta: string; momento: string }[]).filter((f) => f.momento === 'problema').map((f) => f.ruta)));
    }
  }, [i.id, i.trabajo_id, i.origen]);
  async function hacer(estado: Estado | null) {
    setError(null);
    if (!texto.trim() && (estado === null || estado !== 'abierta')) return setError(estado ? 'Escribe una nota: qué se ha hecho o por qué.' : 'Escribe la nota.');
    setOcupado(true);
    const { error: e } = estado ? await limp().rpc('incidencia_estado', { p_id: i.id, p_estado: estado, p_nota: texto.trim() || null })
      : await limp().rpc('incidencia_nota', { p_id: i.id, p_texto: texto.trim() });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(estado ? `Ahora: ${ESTADO[estado][0].toLowerCase()}` : 'Nota añadida'); alCambiar();
  }
  const cerrada = i.estado === 'resuelta' || i.estado === 'descartada';
  const fotos = [...i.fotos, ...fotosTrabajo];
  return (
    <Ventana titulo="Incidencia" alCerrar={alCerrar}>
      <p style={{ marginTop: 0 }}><b>{i.texto}</b></p>
      <dl className="datos-trabajo">
        <dt>Estado</dt><dd><span className={'chapa ' + ESTADO[i.estado][1]}>{ESTADO[i.estado][0]}</span>{i.urgente ? ' · urgente' : ''}</dd>
        {i.lugar && <><dt>Dónde</dt><dd>{i.lugar}</dd></>}
        {i.tema && <><dt>Tema</dt><dd>{i.tema}</dd></>}
        <dt>De dónde sale</dt><dd>{ORIGEN[i.origen] ?? i.origen}</dd>
        <dt>Cuándo</dt><dd>{cuando(i.creado)}{quien ? ` · ${quien}` : ''}</dd>
      </dl>
      {fotos.length > 0 && <div className="fotos-mini">{fotos.map((f) => <Foto key={f} ruta={f} />)}</div>}
      <h3 className="subtitulo">Seguimiento</h3>
      {notas === null ? <p className="nota">Cargando…</p> : !notas.length ? <p className="nota">Todavía nada.</p> : (
        <ol className="seguimiento">{notas.map((n) => (
          <li key={n.id}><small>{cuando(n.creado)}{n.estado ? ` · ${ESTADO[n.estado][0]}` : ''}</small>{n.texto && <span className="texto-largo">{n.texto}</span>}</li>))}</ol>)}
      <label className="campo"><span>{admin ? 'Nota (qué se ha hecho, a quién se ha avisado…)' : 'Añadir una nota'}</span>
        <textarea rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      <div className="acciones-cal">
        <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer(null)}>Añadir nota</button>
        {admin && !cerrada && i.estado !== 'en_proceso' && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('en_proceso')}>En proceso</button>}
        {admin && !cerrada && <button type="button" className="boton" disabled={ocupado} onClick={() => hacer('resuelta')}>Resuelta</button>}
        {admin && !cerrada && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('descartada')}>Descartar</button>}
        {admin && cerrada && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('abierta')}>Reabrir</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

function NuevaIncidencia({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: () => void }) {
  const { empresa } = useSesion();
  const [id] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ texto: '', lugar: '', maquina: '', urgente: false });
  const [fotos, setFotos] = useState<string[]>([]);
  const [maquinas, setMaquinas] = useState<{ id: string; codigo: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    nucleo().from('activos').select('id, codigo').eq('empresa_id', empresa!.id).is('baja', null).then(({ data }) =>
      setMaquinas(((data ?? []) as { id: string; codigo: string }[]).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))));
  }, [empresa]);
  async function foto(file: File | undefined) {
    if (!file) return;
    if (fotos.length >= 5) return setError('Como mucho 5 fotos.');
    try {
      const blob = await fotoAJpeg(file);
      const ruta = `${empresa!.id}/incidencias/${id}/${crypto.randomUUID()}.jpg`;
      const { error: e } = await supabase.storage.from('limpieza').upload(ruta, blob, { contentType: 'image/jpeg' });
      if (e) throw e;
      setFotos((x) => [...x, ruta]);
    } catch (e) { setError(textoError((e as Error).message)); }
  }
  async function crear() {
    setError(null);
    if (!f.texto.trim()) return setError('Escribe qué pasa.');
    setOcupado(true);
    const { error: e } = await limp().rpc('crear_incidencia', { p_empresa: empresa!.id, p_texto: f.texto.trim(), p_lugar: f.lugar.trim() || null,
      p_activo: f.maquina || null, p_urgente: f.urgente, p_fotos: fotos, p_id: id });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso('Incidencia creada'); alCrear();
  }
  return (
    <Ventana titulo="Nueva incidencia" alCerrar={alCerrar} pie={<button type="button" className="boton" disabled={ocupado} onClick={crear}>Crear</button>}>
      <label className="campo"><span>¿Qué pasa?</span><textarea rows={3} maxLength={1000} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Fuga de aceite debajo de la máquina" /></label>
      <div className="dos-col">
        <label className="campo"><span>Máquina</span>
          <select aria-label="Máquina" value={f.maquina} onChange={(e) => setF({ ...f, maquina: e.target.value })}><option value="">Ninguna</option>
            {maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}</select></label>
        <label className="campo"><span>O dónde</span><input maxLength={120} value={f.lugar} onChange={(e) => setF({ ...f, lugar: e.target.value })} placeholder="Pasillo Nave 2" /></label>
      </div>
      <label className="check"><input type="checkbox" checked={f.urgente} onChange={(e) => setF({ ...f, urgente: e.target.checked })} />Es urgente</label>
      <div className="acciones-cal">
        <label className="boton sec peq">Añadir foto<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void foto(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {fotos.length > 0 && <span className="nota">{fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`}</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// =====================================================================================
// Problemas repetidos
// =====================================================================================
interface Problema { id: string; tema: string; lugar: string | null; lugar_clave: string; estado: 'pendiente' | 'en_marcha' | 'solucionado' | 'descartado';
  primera: string | null; ultima: string | null; reabierto: number;
  casos: { caso: string; fecha: string; titulo: string | null; quien: string | null }[]; notas: { texto: string | null; estado: string | null; creado: string; quien: string | null }[] }
const EST_P: Record<Problema['estado'], [string, string]> = {
  pendiente: ['Pendiente', 'sin-cuadrar'], en_marcha: ['En marcha', 'pendiente'], solucionado: ['Solucionado', 'firmado'], descartado: ['Descartado', 'sin'],
};

function Problemas() {
  const { empresa } = useSesion();
  const ordenador = useOrdenador();
  const [lista, setLista] = useState<Problema[] | null>(null);
  const [abierto, setAbierto] = useState<Problema | null>(null);
  const cargar = useCallback(async () => {
    const { data, error } = await limp().rpc('problemas_lista', { p_empresa: empresa!.id, p_cerrados: false });
    if (error) { setLista([]); return; }
    setLista((data ?? []) as Problema[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!lista?.length) return null;
  const fecha = (f: string | null) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }) : '');
  return (
    <section style={{ marginTop: 18 }}>
      <h2 className="subtitulo">Problemas que se repiten</h2>
      {ordenador ? (
        <Tabla filas={lista} clave={(p) => p.id} alAbrir={(p) => setAbierto(p)} sinBuscador
          columnas={[
            { clave: 'prob', titulo: 'Problema', valor: (p) => `${p.tema} en ${p.lugar ?? p.lugar_clave}` },
            { clave: 'veces', titulo: 'Veces', numero: true, valor: (p) => p.casos.length, orden: (p) => p.casos.length },
            { clave: 'fechas', titulo: 'Fechas', valor: (p) => `${fecha(p.primera)}${p.ultima && p.ultima !== p.primera ? ` a ${fecha(p.ultima)}` : ''}`, orden: (p) => p.ultima ?? p.primera },
            { clave: 'vuelto', titulo: 'Ha vuelto', numero: true, valor: (p) => (p.reabierto ? `${p.reabierto} ${p.reabierto === 1 ? 'vez' : 'veces'}` : ''), orden: (p) => p.reabierto },
            { clave: 'estado', titulo: 'Estado', valor: (p) => <span className={'chapa ' + EST_P[p.estado][1]}>{EST_P[p.estado][0]}</span>, orden: (p) => p.estado },
          ]} />
      ) : <div className="lista">{lista.map((p) => (
        <button key={p.id} type="button" className="fila fila-finde" onClick={() => setAbierto(p)}>
          <span className="fila-txt"><b>{p.tema} en {p.lugar ?? p.lugar_clave}</b>
            <small>{p.casos.length} veces · {fecha(p.primera)}{p.ultima && p.ultima !== p.primera ? ` a ${fecha(p.ultima)}` : ''}{p.reabierto ? ` · ha vuelto a pasar ${p.reabierto === 1 ? '1 vez' : `${p.reabierto} veces`}` : ''}</small></span>
          <span className={'chapa ' + EST_P[p.estado][1]}>{EST_P[p.estado][0]}</span>
        </button>))}</div>}
      {abierto && <DetalleProblema p={abierto} alCerrar={() => setAbierto(null)} alCambiar={() => { setAbierto(null); cargar(); }} />}
    </section>
  );
}

function DetalleProblema({ p, alCerrar, alCambiar }: { p: Problema; alCerrar: () => void; alCambiar: () => void }) {
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function estado(e: Problema['estado']) {
    setError(null);
    if (!nota.trim()) return setError('Escribe una nota: qué se ha hecho o por qué.');
    const { error: x } = await limp().rpc('problema_estado', { p_id: p.id, p_estado: e, p_nota: nota.trim() });
    if (x) return setError(textoError(x.message));
    aviso(`Ahora: ${EST_P[e][0].toLowerCase()}`); alCambiar();
  }
  async function quitar(caso: string) {
    const { error: x } = await limp().rpc('problema_quitar', { p_id: p.id, p_caso: caso, p_nota: nota.trim() || null });
    if (x) return setError(textoError(x.message));
    aviso('Quitado'); alCambiar();
  }
  return (
    <Ventana titulo={`${p.tema} en ${p.lugar ?? p.lugar_clave}`} alCerrar={alCerrar}>
      <p className="nota" style={{ marginTop: 0 }}>Ha pasado {p.casos.length} veces. Si alguna no es lo mismo, quítala.</p>
      <div className="lista compacta">{p.casos.map((c) => (
        <div key={c.caso} className="fila fila-finde">
          <span className="fila-txt"><b>{c.titulo ?? '—'}</b><small>{[new Date(c.fecha + 'T12:00').toLocaleDateString('es-ES'), c.quien].filter(Boolean).join(' · ')}</small></span>
          <button type="button" className="boton sec peq" onClick={() => quitar(c.caso)}>No es lo mismo</button>
        </div>))}</div>
      {p.notas.length > 0 && <>
        <h3 className="subtitulo">Seguimiento</h3>
        <ol className="seguimiento">{p.notas.map((n, i) => (
          <li key={i}><small>{cuando(n.creado)}{n.quien ? ` · ${n.quien}` : ''}{n.estado ? ` · ${EST_P[n.estado as Problema['estado']]?.[0] ?? n.estado}` : ''}</small>
            {n.texto && <span className="texto-largo">{n.texto}</span>}</li>))}</ol></>}
      <label className="campo"><span>Nota</span><textarea rows={3} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Avisado a mantenimiento para cambiar el latiguillo" /></label>
      <div className="acciones-cal">
        {p.estado !== 'en_marcha' && <button type="button" className="boton sec" onClick={() => estado('en_marcha')}>En marcha</button>}
        <button type="button" className="boton" onClick={() => estado('solucionado')}>Solucionado</button>
        <button type="button" className="boton sec" onClick={() => estado('descartado')}>Descartar</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// =====================================================================================
// Temas (de qué va un problema)
// =====================================================================================
interface Tema { id?: string; nombre: string; palabras: string[]; orden: number; baja?: string | null }

function Temas() {
  const { empresa } = useSesion();
  const [lista, setLista] = useState<Tema[]>([]);
  const [nuevo, setNuevo] = useState({ nombre: '', palabras: '' });
  const cargar = useCallback(async () => {
    const { data } = await limp().from('temas').select('id, nombre, palabras, orden, baja').eq('empresa_id', empresa!.id).is('baja', null).order('orden');
    setLista((data ?? []) as Tema[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  const partir = (t: string) => [...new Set(t.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  async function guardar(t: Tema, palabras: string) {
    const p = partir(palabras);
    if (!p.length || p.join(',') === t.palabras.join(',')) return;
    const { error } = await limp().from('temas').update({ palabras: p }).eq('id', t.id!);
    if (error) return aviso(textoError(error.message));
    aviso('Guardado'); cargar();
  }
  async function crear() {
    const p = partir(nuevo.palabras);
    if (!nuevo.nombre.trim() || !p.length) return aviso('Pon el nombre y al menos una palabra.');
    const { error } = await limp().from('temas').insert({ empresa_id: empresa!.id, nombre: nuevo.nombre.trim(), palabras: p, orden: (lista.at(-1)?.orden ?? 0) + 1 });
    if (error) return aviso(textoError(error.message));
    setNuevo({ nombre: '', palabras: '' }); cargar();
  }
  async function quitar(t: Tema) {
    const { error } = await limp().from('temas').update({ baja: new Date().toISOString() }).eq('id', t.id!);
    if (error) return aviso(textoError(error.message));
    cargar();
  }
  return (
    <details className="ajustes-excel">
      <summary>Temas de los problemas ({lista.length})</summary>
      <p className="nota">Si el texto lleva alguna de estas palabras (o empieza igual), es de ese tema. Gana el de más arriba. Sirven para saber si un problema se repite.</p>
      <div className="lista compacta">{lista.map((t) => (
        <div key={t.id} className="fila fila-reparto">
          <span className="fila-txt"><b>{t.nombre}</b>
            <label className="campo"><span>Palabras (separadas por comas)</span>
              <input aria-label={`Palabras de ${t.nombre}`} defaultValue={t.palabras.join(', ')} onBlur={(e) => guardar(t, e.target.value)} /></label>
            <button type="button" className="boton sec peq" onClick={() => quitar(t)}>Quitar tema</button></span>
        </div>))}</div>
      <div className="dos-col" style={{ marginTop: 10 }}>
        <label className="campo"><span>Tema nuevo</span><input maxLength={60} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Polvo" /></label>
        <label className="campo"><span>Palabras</span><input value={nuevo.palabras} onChange={(e) => setNuevo({ ...nuevo, palabras: e.target.value })} placeholder="polvo, granalla" /></label>
      </div>
      <button type="button" className="boton sec peq" onClick={crear}>+ Tema</button>
    </details>
  );
}
