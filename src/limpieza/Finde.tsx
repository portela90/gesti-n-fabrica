// Limpieza · Fin de semana: subir el Excel del cliente (administrador), los trabajos del sábado y del domingo (cambiar de día),
// las instrucciones para el encargado y su checklist de cada día.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { durTxt, fotoAJpeg, hoy, limp, textoError } from './MiDia';
import { useListas } from './listas';
import { CAMPOS, leerHoja, norm, proximoSabado, sumarDias, type Celda, type Campo, type Lectura } from './excel';

const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'numeric' });
const diaSemana = (f: string) => new Date(f + 'T12:00').getDay();
/** El fin de semana que se ve: el de hoy si es sábado o domingo; si no, el próximo. */
const sabadoDeAhora = () => (diaSemana(hoy()) === 0 ? sumarDias(hoy(), -1) : proximoSabado(hoy()));

interface TrabajoFinde { id: string; fecha: string; titulo: string; lugar: string | null; estado: string; clase: string; asignados: string[]; todo_equipo: boolean;
  urgente: boolean; minutos_est: number | null; no_repartir: boolean }

export function Finde() {
  const { empresa, puede } = useSesion();
  const jefe = puede('limpieza.excel.editar');
  const listas = useListas();
  const [sab, setSab] = useState(sabadoDeAhora());
  const dom = sumarDias(sab, 1);
  const [lista, setLista] = useState<TrabajoFinde[] | null>(null);
  const [subir, setSubir] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const { data, error } = await limp().from('trabajos').select('id, fecha, titulo, lugar, estado, clase, asignados, todo_equipo, urgente, minutos_est, no_repartir')
      .eq('empresa_id', empresa!.id).gte('fecha', sab).lte('fecha', dom).order('titulo');
    if (error) { aviso(textoError(error.message)); setLista([]); return; }
    setLista((data ?? []) as TrabajoFinde[]);
  }, [empresa, sab, dom]);
  useEffect(() => { setLista(null); cargar(); }, [cargar]);
  const nombre = (id: string) => listas.personas.find((p) => p.id === id)?.nombre ?? 'Alguien';
  async function moverA(t: TrabajoFinde, f: string) {
    const { error } = await limp().rpc('cambiar_dia', { p_trabajo: t.id, p_fecha: f });
    if (error) return aviso(textoError(error.message));
    aviso(`Pasado al ${f === sab ? 'sábado' : 'domingo'}`); cargar();
  }
  const hoyEsFinde = [0, 6].includes(diaSemana(hoy()));
  return (
    <>
      <div className="filtros semana-nav">
        <button type="button" className="boton sec boton-flecha" aria-label="Fin de semana anterior" onClick={() => setSab(sumarDias(sab, -7))}>‹</button>
        <label className="campo"><span>Fin de semana del sábado</span>
          <input type="date" value={sab} onChange={(e) => e.target.value && setSab(sumarDias(e.target.value, -((diaSemana(e.target.value) + 1) % 7)))} /></label>
        <button type="button" className="boton sec boton-flecha" aria-label="Fin de semana siguiente" onClick={() => setSab(sumarDias(sab, 7))}>›</button>
        {sab !== sabadoDeAhora() && <button type="button" className="boton sec boton-volver" onClick={() => setSab(sabadoDeAhora())}>Este fin de semana</button>}
      </div>
      <p className="nota" style={{ marginTop: 6 }}>Sábado {fechaCorta(sab).split(' ').pop()} y domingo {fechaCorta(dom).split(' ').pop()}. Con ‹ y › vas a otros fines de semana.</p>
      <div className="acciones-cal" style={{ marginTop: 0, marginBottom: 12 }}>
        {jefe && <button type="button" className="boton" onClick={() => setSubir(true)}>Subir el Excel del fin de semana</button>}
        <button type="button" className="boton sec" onClick={() => setRevision(hoyEsFinde ? hoy() : sab <= hoy() ? sab : hoy())}>Checklist del encargado</button>
      </div>
      <Instrucciones jefe={jefe} />
      {[[sab, 'Sábado'], [dom, 'Domingo']].map(([f, n]) => {
        const del = (lista ?? []).filter((t) => t.fecha === f);
        return (
          <section key={f} className="dia-semana">
            <h2 className="subtitulo">{n} · {fechaCorta(f).split(' ').pop()}</h2>
            {lista === null ? <p className="nota">Cargando…</p> : !del.length ? <p className="nota">Sin trabajos este día.</p> : (
              <div className="lista compacta">{del.map((t) => (
                <div key={t.id} className={'fila fila-finde' + (t.estado === 'hecho' ? ' de-baja' : '')}>
                  <span className="fila-txt"><b>{t.titulo}</b>
                    <small>{[t.lugar, t.todo_equipo ? 'Todo el equipo' : t.asignados.length ? t.asignados.map(nombre).join(', ') : t.no_repartir ? 'Sin persona (lo reparte el encargado)' : 'Sin persona (reparto automático)',
                      t.minutos_est ? durTxt(t.minutos_est) : ''].filter(Boolean).join(' · ')}</small></span>
                  {t.urgente && t.estado !== 'hecho' && <span className="chapa sin-cuadrar">Urgente</span>}
                  {t.estado === 'hecho' ? <span className="chapa firmado">Hecho</span> : t.clase !== 'fija' && (
                    <span className="dias-finde" role="group" aria-label={`Día de ${t.titulo}`}>
                      {[[sab, 'Sáb'], [dom, 'Dom']].map(([d, c]) => (
                        <button key={d} type="button" className="chip" aria-pressed={t.fecha === d} disabled={d < hoy()} onClick={() => t.fecha !== d && moverA(t, d)}>{c}</button>))}
                    </span>)}
                </div>))}</div>)}
          </section>);
      })}
      {subir && <SubirExcel alCerrar={() => setSubir(false)} alCrear={(s) => { setSubir(false); setSab(s); cargar(); }} />}
      {revision && <Revision fecha={revision} alCerrar={() => setRevision(null)} />}
    </>
  );
}

// =====================================================================================
// Subir el Excel
// =====================================================================================
type SinPersona = 'auto' | 'encargado' | 'equipo';

function SubirExcel({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (sabado: string) => void }) {
  const { empresa } = useSesion();
  const listas = useListas();
  const [hojas, setHojas] = useState<{ sheet: string; data: Celda[][] }[] | null>(null);
  const [archivo, setArchivo] = useState('');
  const [hoja, setHoja] = useState(0);
  const [ajuste, setAjuste] = useState<{ cab?: number; mapa?: Partial<Record<Campo, number | null>>; sabado?: string }>({});
  const [lect, setLect] = useState<Lectura | null>(null);
  const [grupos, setGrupos] = useState<Record<string, string>>({});
  const [sinPersona, setSinPersona] = useState<SinPersona>(() => { try { return (localStorage.getItem('limpieza.excel.sin') as SinPersona) || 'encargado'; } catch { return 'encargado'; } });
  const [equipo, setEquipo] = useState(() => { try { return localStorage.getItem('limpieza.excel.equipo') ?? ''; } catch { return ''; } });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{ creados: number; repetidos: number; sin_persona: number; sabado: string } | null>(null);

  useEffect(() => {   // el grupo de cada tarea (para que el reparto respete «hornos»…)
    limp().from('tareas').select('titulo, grupo').eq('empresa_id', empresa!.id).is('baja', null).not('grupo', 'is', null).then(({ data }) =>
      setGrupos(Object.fromEntries(((data ?? []) as { titulo: string; grupo: string }[]).map((t) => [norm(t.titulo), t.grupo]))));
  }, [empresa]);

  async function leer(f: File | undefined) {
    if (!f) return;
    setError(null); setHojas(null); setLect(null); setAjuste({}); setArchivo(f.name);
    if (!/\.xlsx$/i.test(f.name)) return setError('Tiene que ser un archivo .xlsx. Si es .xls o .ods, ábrelo y guárdalo como «Libro de Excel (.xlsx)».');
    try {
      const { default: leerExcel } = await import('read-excel-file/browser');
      const h = (await leerExcel(f)) as unknown as { sheet: string; data: Celda[][] }[];
      setHojas(h); setHoja(Math.max(0, h.findIndex((x) => x.data.length > 1)));
    } catch (e) { setError(`No he podido leer el archivo: ${(e as Error).message}`); }
  }

  // leer la hoja (y volver a leer cuando se cambia algo a mano)
  const vivas = useMemo(() => listas.personas.filter((p) => !p.baja), [listas.personas]);
  useEffect(() => {
    if (!hojas) return;
    const l = leerHoja(hojas[hoja]?.data ?? [], { archivo, hoy: hoy(), personas: vivas, maquinas: listas.maquinas.filter((m) => !m.baja), grupos, ...ajuste });
    setLect(l);
    // los que ya están creados ese fin de semana no se marcan
    limp().from('trabajos').select('fecha, titulo, lugar').eq('empresa_id', empresa!.id).gte('fecha', l.sabado).lte('fecha', sumarDias(l.sabado, 1)).then(({ data }) => {
      const ya = new Set(((data ?? []) as { fecha: string; titulo: string; lugar: string | null }[]).map((x) => `${x.fecha}|${norm(x.titulo)}|${norm(x.lugar)}`));
      if (!ya.size) return;
      setLect((a) => a && { ...a, filas: a.filas.map((f) => (ya.has(`${f.fecha}|${norm(f.titulo)}|${norm(f.lugar)}`) ? { ...f, repetido: true, crear: false } : f)) });
    });
  }, [hojas, hoja, ajuste, archivo, vivas, listas.maquinas, grupos, empresa]);

  const sab = lect?.sabado ?? proximoSabado(hoy()), dom = sumarDias(sab, 1);
  const cambia = (i: number, c: Partial<Lectura['filas'][number]>) => setLect((l) => l && { ...l, filas: l.filas.map((f, j) => (j === i ? { ...f, ...c } : f)) });
  const elegidos = (lect?.filas ?? []).filter((f) => f.crear);

  async function crear() {
    setError(null);
    if (!elegidos.length) return;
    if (sinPersona === 'equipo' && !equipo) return setError('Elige el equipo.');
    if (elegidos.some((f) => f.fecha < hoy())) return setError('Hay trabajos en un día que ya ha pasado: ponlos en otro día o quítalos.');
    setOcupado(true);
    const { data, error: e } = await limp().rpc('importar', {
      p_empresa: empresa!.id, p_sin_persona: sinPersona, p_equipo: equipo || null, p_archivo: archivo,
      p_items: elegidos.map((f) => ({ titulo: f.titulo, lugar: f.lugar, descripcion: f.descripcion, fecha: f.fecha, asignados: f.quien ? [f.quien] : [],
        minutos_est: f.minutos_est, urgente: f.urgente, activo_id: f.activo_id, grupo: f.grupo })),
    });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    try { localStorage.setItem('limpieza.excel.sin', sinPersona); localStorage.setItem('limpieza.excel.equipo', equipo); } catch { /* sin almacenamiento */ }
    setHecho({ ...(data as { creados: number; repetidos: number; sin_persona: number }), sabado: sab });
  }

  if (hecho) return (
    <Ventana titulo="Excel del fin de semana" alCerrar={() => alCrear(hecho.sabado)} pie={<button type="button" className="boton" onClick={() => alCrear(hecho.sabado)}>Ver los trabajos</button>}>
      <p className="ok-grande">{hecho.creados} trabajos creados{hecho.repetidos ? ` · ${hecho.repetidos} ya existían` : ''}</p>
      {hecho.sin_persona > 0 && <p className="nota">{hecho.sin_persona} sin persona: {sinPersona === 'auto' ? 'se reparten solos ese día por la mañana.' : 'los reparte el encargado.'}</p>}
    </Ventana>);

  return (
    <Ventana titulo="Excel del fin de semana" alCerrar={alCerrar}
      pie={lect && <button type="button" className="boton" disabled={ocupado || !elegidos.length} onClick={crear}>Crear {elegidos.length} trabajo{elegidos.length === 1 ? '' : 's'}</button>}>
      <label className="boton sec" style={{ display: 'block', textAlign: 'center' }}>{archivo ? `Otro archivo (ahora: ${archivo})` : 'Elegir el Excel (.xlsx)'}
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void leer(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {archivo && !hojas && !error && <p className="nota">Leyendo «{archivo}»…</p>}
      {lect && hojas && <>
        <label className="campo" style={{ marginTop: 12 }}><span>Sábado del fin de semana{lect.delExcel ? ' (sacado del Excel)' : ''}</span>
          <input type="date" value={sab} onChange={(e) => e.target.value && setAjuste((a) => ({ ...a, sabado: sumarDias(e.target.value, (6 - diaSemana(e.target.value) + 7) % 7) }))} /></label>
        <p className={'nota' + (lect.filas.length < lect.filasConDatos ? ' aviso-reparto' : '')}>
          {lect.filas.length} trabajo{lect.filas.length === 1 ? '' : 's'}{lect.filas.length < lect.filasConDatos ? ` de ${lect.filasConDatos} filas: revisa «Si sale algo raro»` : ''}.
        </p>
        <fieldset className="campo sin-borde"><legend>Los que no traen persona</legend>
          {([['auto', 'Reparto automático'], ['encargado', 'Para el encargado'], ['equipo', 'Para todo el equipo']] as [SinPersona, string][]).map(([k, t]) => (
            <label key={k} className="check"><input type="radio" name="sin-persona" checked={sinPersona === k} onChange={() => setSinPersona(k)} />{t}</label>))}
        </fieldset>
        <label className="campo"><span>Equipo del fin de semana{sinPersona === 'equipo' ? '' : ' (para el reparto, si quieres)'}</span>
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)}><option value="">—</option>
            {listas.equipos.filter((q) => !q.baja).map((q) => <option key={q.id} value={q.id}>{q.nombre}</option>)}</select></label>
        <div className="acciones-cal"><span className="nota" style={{ margin: 0 }}>Poner todos en:</span>
          <button type="button" className="boton sec peq" disabled={sab < hoy()} onClick={() => setLect((l) => l && { ...l, filas: l.filas.map((f) => ({ ...f, fecha: sab })) })}>Sábado</button>
          <button type="button" className="boton sec peq" onClick={() => setLect((l) => l && { ...l, filas: l.filas.map((f) => ({ ...f, fecha: dom })) })}>Domingo</button></div>
        {!lect.filas.length ? <p className="nota">No encuentro trabajos. Abre «Si sale algo raro» y elige la columna de los trabajos.</p> : (
          <div className="lista compacta">{lect.filas.map((f, i) => (
            <div key={i} className={'fila fila-excel' + (f.crear ? '' : ' de-baja')}>
              <input type="checkbox" aria-label={`Crear «${f.titulo}»`} checked={f.crear} onChange={(e) => cambia(i, { crear: e.target.checked })} />
              <span className="fila-txt"><b>{f.titulo}</b>
                {(f.lugar || f.descripcion) && <small>{[f.lugar, f.descripcion].filter(Boolean).join(' · ')}</small>}
                {f.repetido && <small className="aviso-reparto">Ya está creado</small>}
                {f.mal.length > 0 && <small className="aviso-reparto">No conozco a: {f.mal.join(', ')}</small>}
                {(f.urgente || f.grupo || f.minutos_est) && <small>{[f.urgente ? 'Urgente' : '', f.grupo ? `Grupo ${f.grupo}` : '', f.minutos_est ? durTxt(f.minutos_est) : ''].filter(Boolean).join(' · ')}</small>}
                <span className="excel-elegir">
                  <span className="dias-finde" role="group" aria-label={`Día de ${f.titulo}`}>
                    {[[sab, 'Sáb'], [dom, 'Dom']].map(([d, c]) => <button key={d} type="button" className="chip" aria-pressed={f.fecha === d} disabled={d < hoy()} onClick={() => cambia(i, { fecha: d })}>{c}</button>)}
                  </span>
                  <select aria-label={`Quién hace «${f.titulo}»`} value={f.quien} onChange={(e) => cambia(i, { quien: e.target.value })}>
                    <option value="">Sin persona</option>{vivas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                </span>
              </span>
            </div>))}</div>)}
        <details className="ajustes-excel"><summary>Si sale algo raro, toca aquí</summary>
          {hojas.length > 1 && <label className="campo"><span>Hoja</span>
            <select value={hoja} onChange={(e) => { setHoja(+e.target.value); setAjuste({}); }}>{hojas.map((h, i) => <option key={i} value={i}>{h.sheet}</option>)}</select></label>}
          <label className="campo"><span>Fila de títulos</span>
            <select value={lect.cab} onChange={(e) => setAjuste((a) => ({ ...a, cab: +e.target.value, mapa: undefined }))}>
              {(hojas[hoja]?.data ?? []).slice(0, 15).map((r, i) => <option key={i} value={i}>Fila {i + 1}: {r.filter(Boolean).slice(0, 3).join(' · ').slice(0, 50)}</option>)}</select></label>
          <div className="dos-col">{CAMPOS.map(([k, t]) => (
            <label key={k} className="campo"><span>{t}{k === 'titulo' ? ' *' : ''}</span>
              <select value={lect.mapa[k] ?? ''} onChange={(e) => setAjuste((a) => ({ ...a, cab: lect.cab, mapa: { ...lect.mapa, [k]: e.target.value === '' ? null : +e.target.value } }))}>
                <option value="">— ninguna —</option>{lect.columnas.map((c, j) => <option key={j} value={j}>{c}</option>)}</select></label>))}</div>
        </details>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// =====================================================================================
// Instrucciones para el encargado
// =====================================================================================
interface Instruccion { id: string; desde: string; hasta: string; titulo: string; texto: string | null; leido_en: string | null; anulado: string | null }

export function Instrucciones({ jefe }: { jefe: boolean }) {
  const { empresa } = useSesion();
  const [lista, setLista] = useState<Instruccion[] | null>(null);
  const [editando, setEditando] = useState<Partial<Instruccion> | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await limp().from('instrucciones').select('id, desde, hasta, titulo, texto, leido_en, anulado').eq('empresa_id', empresa!.id)
      .is('anulado', null).gte('hasta', sumarDias(hoy(), jefe ? -30 : 0)).order('desde', { ascending: false });
    setLista((data ?? []) as Instruccion[]);
  }, [empresa, jefe]);
  useEffect(() => { cargar(); }, [cargar]);
  async function leida(id: string) {
    const { error } = await limp().rpc('instruccion_leida', { p_id: id });
    if (error) return aviso(textoError(error.message));
    cargar();
  }
  async function quitar(id: string) {
    const { error } = await limp().from('instrucciones').update({ anulado: new Date().toISOString() }).eq('id', id);
    if (error) return aviso(textoError(error.message));
    setEditando(null); cargar();
  }
  const rango = (x: Instruccion) => (x.desde === x.hasta ? fechaCorta(x.desde) : `${fechaCorta(x.desde)} a ${fechaCorta(x.hasta)}`);
  if (!jefe && lista && !lista.length) return null;
  return (
    <section className="instrucciones">
      <h2 className="subtitulo">Instrucciones para el encargado</h2>
      {lista === null ? <p className="nota">Cargando…</p> : !lista.length ? <p className="nota">No hay instrucciones.</p> : (
        <div className="lista compacta">{lista.map((x) => (
          <div key={x.id} className={'fila fila-finde' + (!jefe && !x.leido_en ? ' sin-leer' : '')}>
            <span className="fila-txt"><b>{x.titulo}</b><small>{rango(x)}</small>{x.texto && <span className="texto-largo">{x.texto}</span>}</span>
            {jefe ? <>
              <span className={'chapa ' + (x.leido_en ? 'firmado' : 'pendiente')}>{x.leido_en ? 'Leído' : 'Sin leer'}</span>
              <button type="button" className="boton sec peq" onClick={() => setEditando(x)}>Cambiar</button></>
              : x.leido_en ? <span className="chapa firmado">Leído</span>
              : <button type="button" className="boton peq" onClick={() => leida(x.id)}>Leído</button>}
          </div>))}</div>)}
      {jefe && <div className="acciones-cal"><button type="button" className="boton sec" onClick={() => setEditando({})}>+ Instrucciones</button></div>}
      {editando && <EditarInstruccion x={editando} alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); cargar(); }} alQuitar={quitar} />}
    </section>
  );
}

function EditarInstruccion({ x, alCerrar, alGuardar, alQuitar }: { x: Partial<Instruccion>; alCerrar: () => void; alGuardar: () => void; alQuitar: (id: string) => void }) {
  const { empresa } = useSesion();
  const sab = proximoSabado(hoy());
  const [f, setF] = useState({ desde: x.desde ?? sab, hasta: x.hasta ?? sumarDias(sab, 1), titulo: x.titulo ?? '', texto: x.texto ?? '' });
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    setError(null);
    if (!f.titulo.trim()) return setError('Pon un título.');
    if (f.hasta < f.desde) return setError('Las fechas están al revés.');
    const fila = { desde: f.desde, hasta: f.hasta, titulo: f.titulo.trim(), texto: f.texto.trim() || null };
    const { error: e } = x.id ? await limp().from('instrucciones').update(fila).eq('id', x.id)
      : await limp().from('instrucciones').insert({ ...fila, empresa_id: empresa!.id });
    if (e) return setError(textoError(e.message));
    aviso(x.id ? 'Cambiado: el encargado tendrá que volver a leerlo' : 'Enviado al encargado'); alGuardar();
  }
  const rapido = (t: string, d: string, h: string) => <button type="button" className="chip" aria-pressed={f.desde === d && f.hasta === h} onClick={() => setF({ ...f, desde: d, hasta: h })}>{t}</button>;
  return (
    <Ventana titulo={x.id ? 'Cambiar instrucciones' : 'Instrucciones para el encargado'} alCerrar={alCerrar}
      pie={<>{x.id && <button type="button" className="boton sec" onClick={() => alQuitar(x.id!)}>Quitar</button>}
        <button type="button" className="boton" onClick={guardar}>{x.id ? 'Guardar' : 'Enviar'}</button></>}>
      <div className="chips">{rapido('Este fin de semana', sab, sumarDias(sab, 1))}{rapido('Hoy', hoy(), hoy())}{rapido('Mañana', sumarDias(hoy(), 1), sumarDias(hoy(), 1))}</div>
      <div className="dos-col">
        <label className="campo"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="campo"><span>Hasta</span><input type="date" value={f.hasta} min={f.desde} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      <label className="campo"><span>Título</span><input maxLength={120} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Fin de semana: limpieza F28" /></label>
      <label className="campo"><span>Qué tiene que hacer o tener en cuenta</span><textarea rows={6} maxLength={4000} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></label>
      <p className="nota">El encargado lo ve al entrar en Limpieza. Cuando lo lea, aquí verás «Leído».{x.id ? ' Si lo cambias, tendrá que volver a leerlo.' : ''}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// =====================================================================================
// Checklist del encargado (una por día)
// =====================================================================================
interface PuntoEnc { plantilla: string; texto: string; tipo?: 'ok' | 'num'; minimo?: number | null; ayuda?: string | null; foto_si_mal?: boolean }
interface Item { plantilla: string; texto: string; tipo: string; estado: 'bien' | 'mal' | null; valor: string; nota: string; foto: string | null }

function Revision({ fecha: f0, alCerrar }: { fecha: string; alCerrar: () => void }) {
  const { empresa, puede } = useSesion();
  const [fecha, setFecha] = useState(f0);
  const [puntos, setPuntos] = useState<PuntoEnc[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [nota, setNota] = useState('');
  const [cerrada, setCerrada] = useState<string | null>(null);
  const [historial, setHistorial] = useState<{ fecha: string; cerrado: string | null; items: Item[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    setPuntos(null); setError(null);
    const [p, r, h] = await Promise.all([
      limp().rpc('puntos_encargado', { p_empresa: empresa!.id }),
      limp().from('revisiones').select('items, nota, cerrado').eq('empresa_id', empresa!.id).eq('fecha', fecha).maybeSingle(),
      limp().from('revisiones').select('fecha, cerrado, items').eq('empresa_id', empresa!.id).order('fecha', { ascending: false }).limit(12),
    ]);
    if (p.error) { setError(textoError(p.error.message)); setPuntos([]); return; }
    const antes = ((r.data?.items ?? []) as Item[]);
    const pts = (p.data ?? []) as PuntoEnc[];
    setItems(pts.map((x) => {
      const a = antes.find((y) => y.plantilla === x.plantilla && y.texto === x.texto);
      return { plantilla: x.plantilla, texto: x.texto, tipo: x.tipo ?? 'ok', estado: a?.estado ?? null, valor: a?.valor == null ? '' : String(a.valor), nota: a?.nota ?? '', foto: a?.foto ?? null };
    }));
    setNota(r.data?.nota ?? ''); setCerrada(r.data?.cerrado ?? null); setPuntos(pts);
    setHistorial((h.data ?? []) as { fecha: string; cerrado: string | null; items: Item[] }[]);
  }, [empresa, fecha]);
  useEffect(() => { cargar(); }, [cargar]);
  const bloqueada = !!cerrada && !puede('limpieza.plan.editar');
  const pon = (i: number, c: Partial<Item>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
  async function foto(i: number, file: File | undefined) {
    if (!file) return;
    try {
      const blob = await fotoAJpeg(file);
      const ruta = `${empresa!.id}/revisiones/${fecha}/${crypto.randomUUID()}.jpg`;
      const { error: e } = await supabase.storage.from('limpieza').upload(ruta, blob, { contentType: 'image/jpeg' });
      if (e) throw e;
      pon(i, { foto: ruta });
    } catch (e) { aviso(textoError((e as Error).message)); }
  }
  async function guardar(cerrar: boolean) {
    setError(null);
    const p = puntos ?? [];
    if (cerrar) {
      const falta = items.find((x) => !x.estado);
      if (falta) return setError(`Falta por marcar: ${falta.texto}`);
      const sinExp = items.find((x, i) => x.estado === 'mal' && (p[i]?.tipo ?? 'ok') === 'ok' && !x.nota.trim() && !x.foto);
      if (sinExp) return setError(`Explica qué pasa o pon una foto: ${sinExp.texto}`);
      const sinFoto = items.find((x, i) => x.estado === 'mal' && p[i]?.foto_si_mal && !x.foto);
      if (sinFoto) return setError(`Pon una foto: ${sinFoto.texto}`);
    }
    setOcupado(true);
    const { error: e } = await limp().rpc('guardar_revision', {
      p_empresa: empresa!.id, p_fecha: fecha, p_nota: nota, p_cerrar: cerrar,
      p_items: items.filter((x) => x.estado).map((x) => ({ plantilla: x.plantilla, texto: x.texto, tipo: x.tipo, estado: x.estado,
        valor: x.tipo === 'num' && x.valor !== '' ? Number(x.valor) : null, nota: x.nota.trim() || null, foto: x.foto })),
    });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(cerrar ? 'Enviada' : 'Guardada. Puedes seguir luego.');
    if (cerrar) alCerrar(); else cargar();
  }
  const hechos = items.filter((x) => x.estado).length, mal = items.filter((x) => x.estado === 'mal').length;
  let grupo = '';
  return (
    <Ventana titulo={`Checklist del encargado · ${fechaCorta(fecha)}`} alCerrar={alCerrar}
      pie={!bloqueada && puntos?.length ? <>
        <button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(false)}>Guardar y seguir luego</button>
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar(true)}>Terminar y enviar</button></> : undefined}>
      <label className="campo"><span>Día</span><input type="date" value={fecha} max={hoy()} min={sumarDias(hoy(), -7)} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
      {![0, 6].includes(diaSemana(fecha)) && <p className="nota">Ojo: este día no es fin de semana.</p>}
      {cerrada && <p className="aviso-linea">Enviada{bloqueada ? '. Ya no se puede cambiar.' : '. Como administrador, la puedes cambiar.'}</p>}
      {puntos === null ? <p className="nota">Cargando…</p> : !puntos.length ? <p className="nota">No hay puntos. Ponlos en Limpieza → Checklists, como «del encargado».</p> : <>
        <p className="nota">{hechos} de {items.length} revisados{mal ? ` · ${mal} con problema` : ''}</p>
        {items.map((x, i) => {
          const p = puntos[i]; const titulo = x.plantilla !== grupo ? (grupo = x.plantilla) : null;
          return (
            <div key={x.plantilla + x.texto}>
              {titulo && <h3 className="subtitulo">{titulo}</h3>}
              <div className={'punto-enc' + (x.estado === 'mal' ? ' mal' : '')}>
                <b>{x.texto}</b>
                {(p.ayuda || (p.tipo === 'num' && p.minimo != null)) && <small className="nota">{[p.ayuda, p.tipo === 'num' && p.minimo != null ? `Mínimo: ${p.minimo}` : ''].filter(Boolean).join(' · ')}</small>}
                {p.tipo === 'num' ? (
                  <input type="number" inputMode="decimal" min={0} aria-label={x.texto} disabled={bloqueada} value={x.valor} placeholder="Escribe el número"
                    onChange={(e) => { const v = e.target.value; pon(i, { valor: v, estado: v === '' ? null : p.minimo != null && Number(v) < p.minimo ? 'mal' : 'bien' }); }} />
                ) : (
                  <span className="bien-mal" role="group" aria-label={x.texto}>
                    <button type="button" className="chip" aria-pressed={x.estado === 'bien'} disabled={bloqueada} onClick={() => pon(i, { estado: 'bien' })}>Bien</button>
                    <button type="button" className="chip mal" aria-pressed={x.estado === 'mal'} disabled={bloqueada} onClick={() => pon(i, { estado: 'mal' })}>Mal</button>
                  </span>)}
                {x.estado === 'mal' && <>
                  <input aria-label={`Qué pasa: ${x.texto}`} disabled={bloqueada} value={x.nota} onChange={(e) => pon(i, { nota: e.target.value })}
                    placeholder={p.tipo === 'num' ? 'Nota (opcional)' : `¿Qué pasa?${p.foto_si_mal ? ' (y pon una foto)' : ''}`} />
                  {!bloqueada && <label className="boton sec peq">{x.foto ? 'Cambiar foto' : 'Foto'}
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void foto(i, e.target.files?.[0]); e.target.value = ''; }} /></label>}
                  {x.foto && <small className="nota">Foto puesta.</small>}
                </>}
              </div>
            </div>);
        })}
        <label className="campo"><span>Nota general (opcional)</span><textarea rows={3} maxLength={2000} disabled={bloqueada} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      {historial.length > 0 && <details className="ajustes-excel"><summary>Checklists anteriores</summary>
        <div className="lista compacta">{historial.map((h) => {
          const m = (h.items ?? []).filter((x) => x.estado === 'mal').length;
          return (
            <button key={h.fecha} type="button" className="fila" onClick={() => setFecha(h.fecha)}>
              <span className="fila-txt"><b>{fechaCorta(h.fecha)}</b></span>
              {m > 0 && <span className="chapa sin-cuadrar">{m} mal</span>}
              <span className={'chapa ' + (h.cerrado ? 'firmado' : 'pendiente')}>{h.cerrado ? 'Enviada' : 'A medias'}</span>
            </button>);
        })}</div></details>}
    </Ventana>
  );
}
