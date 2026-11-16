// «Mi día» y «Trabajo abierto» del operario. Lo que hace se guarda en el móvil y se manda solo (ver cola.ts),
// así que la pantalla cambia al momento aunque no haya red.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { alVaciarse, borrarErrores, encolar, useCola } from './cola';

export interface Trabajo {
  id: string; empresa_id: string; fecha: string; clase: 'fija' | 'habitual' | 'suelto'; titulo: string; descripcion: string | null; lugar: string | null;
  minutos_est: number | null; estado: 'pendiente' | 'en_curso' | 'pausado' | 'hecho'; inicio: string | null; pausa_desde: string | null; pausado_min: number;
  fin: string | null; minutos: number | null; nota: string | null; problema: string | null; fotos: { ruta: string; momento: string }[];
  atrasado: boolean; nombres: string[]; maquina: string | null; zona: string | null; turno: string | null; mio: boolean; puedo: boolean; hecho_por_nombre: string | null;
  checklist: { texto: string; valor: unknown }[] | null; asignados: string[]; todo_equipo: boolean; equipo_id: string | null; aviso_reparto?: string | null;
}
interface Punto { texto: string; tipo: 'ok' | 'num'; minimo?: number | null; ayuda?: string | null; foto_si_mal?: boolean; plantilla: string }
interface Habitual { id: string; titulo: string; descripcion: string | null; grupo: string | null; lugar: string | null; minutos_est: number | null; maquina: string | null }

export const limp = () => supabase.schema('limpieza');
export const hoy = () => new Date().toLocaleDateString('sv-SE');
const leer = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const guardar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lleno o sin almacenamiento */ } };
export const durTxt = (m: number | null) => (m == null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
const ERRORES: Record<string, string> = {
  NO_PERMISO: 'No tienes permiso para esto.', YA_HECHO: 'Este trabajo ya está terminado.', FOTO_FALTA: 'Falta la foto de un punto que está mal.',
  CHECKLIST_MAL: 'Falta contestar algún punto.', TIEMPO_MAL: 'Pon cuánto has tardado.', SIN_FICHA: 'Tu usuario no está enlazado con tu ficha de trabajador.',
  TITULO_MAL: 'Escribe qué has hecho.', FALTA_QUIEN: 'Elige para quién es.', FALTA_EQUIPO: 'Elige el equipo.', PERSONA_DE_OTRA_UNIDAD: 'Hay una persona que no es de esta unidad de trabajo.', FALTA_NOTA: 'Escribe una nota.', ESTADO_MAL: 'Ese estado no vale.', NO_ESTA: 'Eso ya no está en el problema.', TEXTO_MAL: 'Escribe el texto (hasta 1000 letras).', FALTA_PUNTO: 'Falta por marcar un punto.', FALTA_EXPLICAR: 'Explica qué pasa o pon una foto en los puntos que están mal.', YA_CERRADA: 'Ya está enviada: no se puede cambiar.', ES_FIJA: 'Una tarea fija no se cambia de día.', REPARTO_MAL: 'Elige qué hacer con los que no traen persona.', FOTO_MAL: 'La foto no es de esta revisión.', DEMASIADAS: 'Son demasiadas a la vez.', FUERA_DE_TU_EQUIPO: 'Solo puedes repartir a la gente de tu equipo.', FECHA_MAL: 'Solo se puede para ayer, hoy o mañana.', 'Failed to fetch': 'Sin conexión: inténtalo cuando tengas red.',
};
export const textoError = (m: string) => { const k = Object.keys(ERRORES).find((x) => m.includes(x)); return k ? ERRORES[k] : m; };

/** Minutos trabajados hasta ahora (sin las pausas). */
export function minutosHastaAhora(t: Pick<Trabajo, 'inicio' | 'pausado_min' | 'pausa_desde' | 'estado'>, ahora = Date.now()) {
  if (!t.inicio) return null;
  const hasta = t.estado === 'pausado' && t.pausa_desde ? Date.parse(t.pausa_desde) : ahora;
  return Math.max(0, Math.round((hasta - Date.parse(t.inicio)) / 60000) - (t.pausado_min ?? 0));
}

/** Foto del móvil → JPEG de hasta 1600 px (para que suba rápido). */
export function fotoAJpeg(f: File): Promise<Blob> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido leer la foto'))), 'image/jpeg', 0.75);
    };
    img.onerror = () => mal(new Error('No se ha podido leer la foto'));
    img.src = URL.createObjectURL(f);
  });
}
const rutaFoto = (t: Trabajo, nombre: string) => `${t.empresa_id}/trabajos/${t.id}/${Date.now()}-${nombre}.jpg`;

export function MiDia() {
  const { empresa } = useSesion();
  const clave = `limpieza.midia.${empresa!.id}`;
  const [lista, setLista] = useState<Trabajo[] | null>(() => { const c = leer(clave); return c?.fecha === hoy() ? c.lista : null; });
  const [sinRed, setSinRed] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const cola = useCola();

  const cargar = useCallback(async () => {
    const { data, error } = await limp().rpc('mi_dia', { p_empresa: empresa!.id, p_fecha: hoy() });
    if (error) { setSinRed(true); if (!/Failed to fetch|NetworkError|Load failed/i.test(error.message)) aviso(textoError(error.message)); setLista((l) => l ?? []); return; }
    setSinRed(false);
    setLista(data as Trabajo[]);
    guardar(clave, { fecha: hoy(), lista: data });
  }, [empresa, clave]);
  useEffect(() => { cargar(); alVaciarse(cargar); return () => alVaciarse(null); }, [cargar]);

  /** Cambia un trabajo en la pantalla (y en lo guardado) sin esperar a la red. */
  const cambiar = (id: string, c: Partial<Trabajo>) => setLista((l) => {
    const n = (l ?? []).map((t) => (t.id === id ? { ...t, ...c } : t));
    guardar(clave, { fecha: hoy(), lista: n });
    return n;
  });

  const mios = (lista ?? []).filter((t) => t.mio);
  const enCurso = mios.filter((t) => t.estado === 'en_curso' || t.estado === 'pausado');
  const pendientes = mios.filter((t) => t.estado === 'pendiente');
  const atrasados = pendientes.filter((t) => t.atrasado);
  const deHoy = pendientes.filter((t) => !t.atrasado);
  const hechos = mios.filter((t) => t.estado === 'hecho');
  const siguiente = enCurso[0] ?? deHoy[0] ?? null;
  const despues = deHoy.filter((t) => t !== siguiente);
  const t = (lista ?? []).find((x) => x.id === abierto) ?? null;

  return (
    <>
      {(sinRed || cola.pendientes.length > 0) && (
        <p className="aviso-linea sin-red" role="status">
          {sinRed ? 'Sin conexión. ' : ''}{cola.pendientes.length ? `${cola.pendientes.length === 1 ? '1 cosa' : `${cola.pendientes.length} cosas`} por enviar: se mandan solas cuando haya red.` : 'Lo que hagas se guarda en el móvil.'}
        </p>)}
      {cola.errores.length > 0 && (
        <div className="error" role="alert">{cola.errores.map((e, i) => <p key={i} style={{ margin: 0 }}>{e}</p>)}
          <button type="button" className="boton sec peq" onClick={borrarErrores}>Entendido</button></div>)}
      {lista === null ? <p className="nota">Cargando…</p> : !mios.length ? (
        <div className="vacio"><p><b>Hoy no tienes trabajos.</b></p><p>Si haces algo, apúntalo con «+ Trabajo».</p></div>
      ) : (
        <>
          {siguiente && <>
            <h2 className="subtitulo">{enCurso.includes(siguiente) ? 'Ahora' : 'Siguiente'}</h2>
            <div className="lista"><FilaTrabajo t={siguiente} grande abrir={() => setAbierto(siguiente.id)} /></div>
          </>}
          {enCurso.length > 1 && <div className="lista">{enCurso.slice(1).map((x) => <FilaTrabajo key={x.id} t={x} abrir={() => setAbierto(x.id)} />)}</div>}
          {atrasados.length > 0 && <>
            <h2 className="subtitulo">Atrasados</h2>
            <div className="lista">{atrasados.map((x) => <FilaTrabajo key={x.id} t={x} abrir={() => setAbierto(x.id)} />)}</div>
          </>}
          {despues.length > 0 && <>
            <h2 className="subtitulo">Después</h2>
            <div className="lista">{despues.map((x) => <FilaTrabajo key={x.id} t={x} abrir={() => setAbierto(x.id)} />)}</div>
          </>}
          {hechos.length > 0 && <>
            <h2 className="subtitulo">Hechos hoy</h2>
            <div className="lista">{hechos.map((x) => <FilaTrabajo key={x.id} t={x} abrir={() => setAbierto(x.id)} />)}</div>
          </>}
        </>
      )}
      <div className="acciones-cal" style={{ marginTop: 14 }}>
        <button type="button" className="boton" onClick={() => setNuevo(true)}>+ Trabajo</button>
      </div>
      {t && <TrabajoAbierto t={t} cambiar={(c) => cambiar(t.id, c)} alCerrar={() => setAbierto(null)} />}
      {nuevo && <NuevoTrabajo alCerrar={() => setNuevo(false)} alCrear={(id) => { setNuevo(false); cargar().then(() => setAbierto(id)); }} />}
    </>
  );
}

export function FilaTrabajo({ t, abrir, grande }: { t: Trabajo; abrir: () => void; grande?: boolean }) {
  const donde = [t.maquina, t.zona, t.lugar].filter(Boolean).join(' · ');
  const otros = t.nombres.length > 1 ? `Con ${t.nombres.join(', ')}` : '';
  const chapa = t.estado === 'hecho' ? ['Hecho', 'firmado'] : t.estado === 'en_curso' ? ['En curso', 'pendiente'] : t.estado === 'pausado' ? ['En pausa', 'pendiente'] : t.atrasado ? ['Atrasado', 'sin-cuadrar'] : null;
  return (
    <button type="button" className={'fila' + (grande ? ' fila-grande' : '') + (t.estado === 'hecho' ? ' de-baja' : '')} onClick={abrir}>
      <span className="fila-txt"><b>{t.titulo}</b>
        <small>{[donde, t.turno, t.estado === 'hecho' ? durTxt(t.minutos) : t.minutos_est ? `suele llevar ${durTxt(t.minutos_est)}` : ''].filter(Boolean).join(' · ')}</small>
        {otros && <small>{otros}</small>}
        {t.aviso_reparto && t.estado !== 'hecho' && <small className="aviso-reparto">{t.aviso_reparto}</small>}</span>
      {chapa && <span className={'chapa ' + chapa[1]}>{chapa[0]}</span>}
    </button>
  );
}

// =====================================================================================
// Trabajo abierto
// =====================================================================================
export function TrabajoAbierto({ t, cambiar, alCerrar, alRepartir }: { t: Trabajo; cambiar: (c: Partial<Trabajo>) => void; alCerrar: () => void; alRepartir?: () => void }) {
  const [paso, setPaso] = useState<'ver' | 'terminar' | 'problema'>('ver');
  const [problema, setProblema] = useState('');
  const ahora = () => new Date().toISOString();
  const accion = (fn: string, texto: string, c: Partial<Trabajo>) => {
    void encolar({ tipo: 'rpc', fn, args: { p_trabajo: t.id, p_cuando: ahora() }, trabajo: t.id, texto: `${texto} «${t.titulo}»` });
    cambiar(c);
  };
  const empezar = () => accion('empezar', 'Empezar', { estado: 'en_curso', inicio: ahora() });
  const pausar = () => accion('pausar', 'Pausar', { estado: 'pausado', pausa_desde: ahora() });
  const seguir = () => accion('seguir', 'Seguir', {
    estado: 'en_curso', pausa_desde: null,
    pausado_min: t.pausado_min + (t.pausa_desde ? Math.round((Date.now() - Date.parse(t.pausa_desde)) / 60000) : 0) });

  async function ponerFoto(f: File | undefined) {
    if (!f) return;
    try {
      const blob = await fotoAJpeg(f); const ruta = rutaFoto(t, 'foto');
      await encolar({ tipo: 'foto', ruta, blob, trabajo: t.id, momento: 'trabajo', texto: `Foto de «${t.titulo}»` });
      cambiar({ fotos: [...t.fotos, { ruta, momento: 'trabajo' }] });
      aviso('Foto guardada');
    } catch (e) { aviso((e as Error).message); }
  }
  function mandarProblema() {
    if (!problema.trim()) return;
    void encolar({ tipo: 'rpc', fn: 'avisar_problema', args: { p_trabajo: t.id, p_texto: problema.trim() }, trabajo: t.id, texto: `Aviso de «${t.titulo}»` });
    cambiar({ problema: problema.trim() }); setPaso('ver'); aviso('Aviso guardado');
  }

  if (paso === 'terminar') return <Terminar t={t} alVolver={() => setPaso('ver')} alTerminar={(c) => { cambiar(c); alCerrar(); aviso('Trabajo terminado'); }} />;
  const hecho = t.estado === 'hecho';
  return (
    <Ventana titulo={t.titulo} alCerrar={alCerrar} pie={t.puedo && !hecho && (
      t.estado === 'pendiente' ? <button type="button" className="boton grande" onClick={empezar}>Empezar</button>
        : <>
          {t.estado === 'en_curso' ? <button type="button" className="boton sec" onClick={pausar}>Pausar</button> : <button type="button" className="boton sec" onClick={seguir}>Seguir</button>}
          <button type="button" className="boton" onClick={() => setPaso('terminar')}>Terminar</button>
        </>)}>
      {t.descripcion && <p style={{ marginTop: 0 }}>{t.descripcion}</p>}
      <dl className="datos-trabajo">
        {(t.maquina || t.zona || t.lugar) && <><dt>Dónde</dt><dd>{[t.maquina, t.zona, t.lugar].filter(Boolean).join(' · ')}</dd></>}
        {t.minutos_est && <><dt>Suele llevar</dt><dd>{durTxt(t.minutos_est)}</dd></>}
        {t.nombres.length > 1 && <><dt>Con</dt><dd>{t.nombres.join(', ')}</dd></>}
        {t.estado !== 'pendiente' && !hecho && <><dt>Llevas</dt><dd>{durTxt(minutosHastaAhora(t)) || '0 min'}{t.estado === 'pausado' ? ' (en pausa)' : ''}</dd></>}
        {hecho && <><dt>Hecho</dt><dd>{durTxt(t.minutos)}{t.hecho_por_nombre ? ` · ${t.hecho_por_nombre}` : ''}</dd></>}
        {t.nota && <><dt>Nota</dt><dd>{t.nota}</dd></>}
      </dl>
      {t.problema && <p className="aviso-linea">Aviso: {t.problema}</p>}
      {t.fotos.length > 0 && <p className="nota">{t.fotos.length === 1 ? '1 foto' : `${t.fotos.length} fotos`} guardadas.</p>}
      {t.puedo && <div className="acciones-cal">
        <label className="boton sec peq">Añadir foto<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void ponerFoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {paso === 'ver' && <button type="button" className="boton sec peq" onClick={() => setPaso('problema')}>Hay un problema</button>}
      </div>}
      {alRepartir && !hecho && <div className="acciones-cal"><button type="button" className="boton sec peq" onClick={alRepartir}>Cambiar a quién le toca</button></div>}
      {paso === 'problema' && (
        <div className="caja-aviso">
          <label className="campo"><span>¿Qué pasa?</span><textarea rows={3} maxLength={1000} value={problema} onChange={(e) => setProblema(e.target.value)} placeholder="No queda taladrina, la máquina gotea…" /></label>
          <div className="acciones-cal"><button type="button" className="boton sec peq" onClick={() => setPaso('ver')}>Cancelar</button><button type="button" className="boton peq" onClick={mandarProblema}>Avisar</button></div>
        </div>)}
    </Ventana>
  );
}

// ---------- terminar: checklist, tiempo y nota ----------
const OPCIONES_MIN = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

function Terminar({ t, alVolver, alTerminar }: { t: Trabajo; alVolver: () => void; alTerminar: (c: Partial<Trabajo>) => void }) {
  const clave = `limpieza.puntos.${t.id}`;
  const [puntos, setPuntos] = useState<Punto[] | null>(() => leer(clave));
  const [resp, setResp] = useState<{ valor?: string; foto?: string }[]>([]);
  const [nota, setNota] = useState('');
  const medido = minutosHastaAhora(t);
  // se pregunta si no pulsó Empezar, si pulsó Empezar y Terminar casi a la vez, si lleva más de 12 h (se quedó sin terminar)
  // o si dice que el tiempo medido no es el bueno
  const demasiado = medido != null && medido > 720;
  const [corregir, setCorregir] = useState(false);
  const preguntar = medido == null || medido < 2 || demasiado || corregir;
  const [siPrevisto, setSiPrevisto] = useState<boolean | null>(null);
  const [minutos, setMinutos] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    limp().rpc('puntos', { p_trabajo: t.id }).then(({ data, error: e }) => {
      if (e) { setPuntos((p) => p ?? null); if (!puntos) setError('Sin conexión y sin la checklist guardada: abre el trabajo con red una vez.'); return; }
      setPuntos(data as Punto[]); guardar(clave, data);
    });
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (puntos) setResp((r) => puntos.map((_, i) => r[i] ?? {})); }, [puntos]);
  const pon = (i: number, c: { valor?: string; foto?: string }) => setResp((r) => r.map((x, j) => (j === i ? { ...x, ...c } : x)));

  async function fotoPunto(i: number, f: File | undefined) {
    if (!f) return;
    try {
      const blob = await fotoAJpeg(f); const ruta = rutaFoto(t, `punto-${i + 1}`);
      await encolar({ tipo: 'foto', ruta, blob, trabajo: t.id, momento: 'punto', texto: `Foto de «${puntos![i].texto}»` });
      pon(i, { foto: ruta });
    } catch (e) { setError((e as Error).message); }
  }

  const minutosFinal = useMemo(() => {
    if (!preguntar) return medido!;
    if (t.minutos_est && siPrevisto) return t.minutos_est;
    const n = parseInt(minutos, 10); return Number.isFinite(n) ? n : null;
  }, [preguntar, medido, t.minutos_est, siPrevisto, minutos]);

  function terminar() {
    setError(null);
    if (!puntos) return setError('Falta la checklist: abre el trabajo con red una vez.');
    for (let i = 0; i < puntos.length; i++) {
      const p = puntos[i], r = resp[i] ?? {};
      if (p.tipo === 'ok' && !r.valor) return setError(`Contesta «${p.texto}».`);
      if (p.tipo === 'num' && (r.valor == null || r.valor.trim() === '' || Number.isNaN(Number(r.valor.replace(',', '.'))))) return setError(`Pon el número de «${p.texto}».`);
      if (p.tipo === 'ok' && r.valor === 'mal' && p.foto_si_mal && !r.foto) return setError(`«${p.texto}» está mal: haz una foto.`);
    }
    if (!minutosFinal || minutosFinal < 1 || minutosFinal > 720) return setError(minutosFinal && minutosFinal > 720 ? 'Como mucho 12 horas: di cuánto has tardado de verdad.' : 'Di cuánto has tardado.');
    const checklist = puntos.map((p, i) => ({ valor: p.tipo === 'num' ? Number((resp[i].valor ?? '').replace(',', '.')) : resp[i].valor, ...(resp[i].foto ? { foto: resp[i].foto } : {}) }));
    const cuando = new Date().toISOString();
    void encolar({ tipo: 'rpc', fn: 'terminar', args: { p_trabajo: t.id, p_minutos: minutosFinal, p_checklist: checklist, p_nota: nota.trim() || null, p_cuando: cuando },
      trabajo: t.id, texto: `Terminar «${t.titulo}»` });
    alTerminar({ estado: 'hecho', fin: cuando, minutos: t.minutos_est ? Math.max(minutosFinal, t.minutos_est) : minutosFinal, nota: nota.trim() || t.nota });
  }

  return (
    <Ventana titulo={`Terminar: ${t.titulo}`} alCerrar={alVolver} pie={<>
      <button type="button" className="boton sec" onClick={alVolver}>Volver</button>
      <button type="button" className="boton" onClick={terminar}>Terminar</button></>}>
      {puntos === null && !error && <p className="nota">Cargando la checklist…</p>}
      {puntos && puntos.length > 0 && <>
        <h3 className="subtitulo" style={{ marginTop: 0 }}>Checklist</h3>
        <ol className="puntos">
          {puntos.map((p, i) => {
            const r = resp[i] ?? {};
            return (
              <li key={i} className="punto">
                <b>{p.texto}</b>{p.ayuda && <small className="nota">{p.ayuda}</small>}
                {p.tipo === 'ok' ? (
                  <div className="si-no" role="group" aria-label={p.texto}>
                    <button type="button" aria-pressed={r.valor === 'bien'} onClick={() => pon(i, { valor: 'bien' })}>Bien</button>
                    <button type="button" aria-pressed={r.valor === 'mal'} onClick={() => pon(i, { valor: 'mal' })}>Mal</button>
                  </div>
                ) : (
                  <label className="campo"><span>{p.minimo != null ? `Cuántos (mínimo ${p.minimo})` : 'Cuántos'}</span>
                    <input inputMode="decimal" aria-label={p.texto} value={r.valor ?? ''} onChange={(e) => pon(i, { valor: e.target.value })} /></label>
                )}
                {p.tipo === 'num' && p.minimo != null && r.valor && Number(r.valor.replace(',', '.')) < p.minimo && <small className="error">Por debajo del mínimo: avisa a tu encargado.</small>}
                {p.tipo === 'ok' && r.valor === 'mal' && (
                  <label className={'boton peq ' + (r.foto ? 'sec' : '')}>{r.foto ? 'Foto hecha ✓ (cambiar)' : p.foto_si_mal ? 'Hacer foto (obligatoria)' : 'Hacer foto'}
                    <input type="file" accept="image/*" capture="environment" hidden aria-label={`Foto de ${p.texto}`} onChange={(e) => { void fotoPunto(i, e.target.files?.[0]); e.target.value = ''; }} /></label>)}
              </li>
            );
          })}
        </ol>
      </>}
      <h3 className="subtitulo">Tiempo</h3>
      {!preguntar ? <>
        <p style={{ marginTop: 0 }}>Has tardado <b>{durTxt(medido)}</b>{t.minutos_est && medido! < t.minutos_est ? ` (se apunta lo previsto: ${durTxt(t.minutos_est)})` : ''}.</p>
        <button type="button" className="boton sec peq" onClick={() => setCorregir(true)}>No, he tardado otra cosa</button></> : (
        <>
          <p className="nota" style={{ marginTop: 0 }}>{medido == null ? 'No pulsaste «Empezar».' : demasiado ? `Lleva ${durTxt(medido)} en marcha: seguramente se quedó sin terminar.`
            : corregir ? '' : 'Has pulsado «Empezar» y «Terminar» casi a la vez.'} ¿Cuánto has tardado?</p>
          {t.minutos_est ? (
            <div className="si-no" role="group" aria-label={`¿Has tardado ${durTxt(t.minutos_est)}?`}>
              <button type="button" aria-pressed={siPrevisto === true} onClick={() => setSiPrevisto(true)}>Sí, {durTxt(t.minutos_est)}</button>
              <button type="button" aria-pressed={siPrevisto === false} onClick={() => setSiPrevisto(false)}>No, otro</button>
            </div>) : null}
          {(!t.minutos_est || siPrevisto === false) && (
            <div className="opciones-min" role="group" aria-label="Minutos">
              {OPCIONES_MIN.map((m) => <button key={m} type="button" aria-pressed={minutos === String(m)} onClick={() => setMinutos(String(m))}>{durTxt(m)}</button>)}
            </div>)}
          {(!t.minutos_est || siPrevisto === false) && (
            <label className="campo"><span>U otro (minutos)</span>
              <input type="number" inputMode="numeric" min={1} max={720} value={OPCIONES_MIN.includes(Number(minutos)) ? '' : minutos}
                onChange={(e) => setMinutos(e.target.value)} placeholder="por ejemplo, 25" /></label>)}
        </>
      )}
      <label className="campo"><span>Nota (opcional)</span><input maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------- crear un trabajo: de la lista o a mano ----------
export function NuevoTrabajo({ alCerrar, alCrear, personas }: { alCerrar: () => void; alCrear: (id: string) => void; personas?: { id: string; nombre: string; baja?: string | null }[] }) {
  const { empresa } = useSesion();
  const [lista, setLista] = useState<Habitual[] | null>(null);
  const [buscar, setBuscar] = useState('');
  const [titulo, setTitulo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [para, setPara] = useState('');
  const [maquina, setMaquina] = useState('');
  const [maquinas, setMaquinas] = useState<{ id: string; codigo: string; nombre: string | null }[]>([]);
  useEffect(() => {
    nucleo().from('activos').select('id, codigo, nombre').eq('empresa_id', empresa!.id).is('baja', null).then(({ data }) =>
      setMaquinas(((data ?? []) as { id: string; codigo: string; nombre: string | null }[]).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))));
  }, [empresa]);
  useEffect(() => {
    limp().rpc('habituales_para_mi', { p_empresa: empresa!.id }).then(({ data, error: e }) => {
      if (e) { setError(textoError(e.message)); setLista([]); return; }
      setLista(data as Habitual[]);
    });
  }, [empresa]);
  async function crear(tarea: string | null) {
    setError(null);
    if (!tarea && !titulo.trim()) return setError('Escribe qué has hecho o elige uno de la lista.');
    setOcupado(true);
    const { data, error: e } = await limp().rpc('crear_trabajo', { p_empresa: empresa!.id, p_fecha: hoy(), p_tarea: tarea, p_titulo: tarea ? null : titulo.trim(),
      ...(maquina ? { p_activo: maquina } : {}), ...(para ? { p_para: [para] } : {}) });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    alCrear(data as string);
  }
  const vistas = (lista ?? []).filter((h) => !buscar.trim() || h.titulo.toLowerCase().includes(buscar.trim().toLowerCase()));
  return (
    <Ventana titulo="Nuevo trabajo" alCerrar={alCerrar}>
      {personas && (
        <label className="campo"><span>Para quién</span>
          <select value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">Para mí</option>
            {personas.filter((p) => !p.baja).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></label>)}
      {maquinas.length > 0 && (
        <label className="campo"><span>Máquina (si es en una)</span>
          <select value={maquina} onChange={(e) => setMaquina(e.target.value)}>
            <option value="">Ninguna</option>
            {maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo}{m.nombre ? ` · ${m.nombre}` : ''}</option>)}
          </select></label>)}
      <label className="campo"><span>Buscar en la lista</span><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="taladrina, derrame…" /></label>
      {lista === null ? <p className="nota">Cargando…</p> : (
        <div className="lista compacta">
          {vistas.map((h) => (
            <button key={h.id} type="button" className="fila" disabled={ocupado} onClick={() => crear(h.id)}>
              <span className="fila-txt"><b>{h.titulo}</b><small>{[h.maquina, h.lugar, h.minutos_est ? durTxt(h.minutos_est) : ''].filter(Boolean).join(' · ')}</small></span>
            </button>))}
          {!vistas.length && <p className="nota" style={{ padding: '0 12px' }}>No hay ninguno con ese nombre.</p>}
        </div>)}
      <label className="campo" style={{ marginTop: 14 }}><span>¿No está? Escríbelo</span><input maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Recoger cartones de la Nave 2" /></label>
      <div className="acciones-cal"><button type="button" className="boton" disabled={ocupado} onClick={() => crear(null)}>Crear</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
