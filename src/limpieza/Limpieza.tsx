import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { MiDia } from './MiDia';
import { Hoy } from './Hoy';
import { Finde } from './Finde';
import { Incidencias } from './Incidencias';
import { Resumen } from './Resumen';
import { Tablon } from '../nucleo/Tablon';
import { PersonasReparto, Semana } from './Reparto';
import { useListas, type Listas, type Maquina, type Opcion } from './listas';
import { Tabla, useOrdenador } from '../componentes/Tabla';

/** Tablas de Limpieza (esquema «limpieza»). */
export const limp = () => supabase.schema('limpieza');

// ---------- tipos ----------
export interface Tarea {
  id: string; clase: 'fija' | 'habitual'; titulo: string; descripcion: string | null; grupo: string | null; lugar: string | null;
  ubicacion_id: string | null; activo_id: string | null; minutos_est: number | null;
  dias: number[] | null; equipo_id: string | null; turno_id: string | null; asignados: string[]; todo_equipo: boolean;
  solo_para: string[]; orden: number; baja: string | null;
}
export interface Punto { texto: string; tipo: 'ok' | 'num'; minimo?: number | null; ayuda?: string | null; foto_si_mal?: boolean }
export interface Plantilla {
  id: string; nombre: string; cuando: 'trabajos' | 'encargado'; orden: number; baja: string | null;
  aplica: { codigos?: string; excluir?: string; tareas?: string[] }; puntos: Punto[];
}

const DIAS: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
const ERRORES: Record<string, string> = {
  PUNTO_MAL: 'Cada punto necesita un texto (hasta 200 letras).',
  PERSONA_DE_OTRA_UNIDAD: 'Hay una persona que no es de esta unidad de trabajo.',
  tareas_check: 'Una tarea fija necesita días y equipo.',
  'row-level security': 'No tienes permiso para hacer esto.',
};
const textoError = (m: string) => { const k = Object.keys(ERRORES).find((x) => m.includes(x)); return k ? ERRORES[k] : m; };
const textoDias = (d: number[] | null) => {
  if (!d?.length) return '';
  const s = [...d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).join(',');
  if (s === '1,2,3,4,5') return 'De lunes a viernes';
  if (s === '6,0') return 'Sábado y domingo';
  if (d.length === 7) return 'Todos los días';
  return DIAS.filter(([n]) => d.includes(n)).map(([, l]) => l).join(' ');
};

/**
 * ¿Sale esta checklist en una máquina? Las mismas reglas que la base de datos (limpieza.encaja, copiadas de la
 * app vieja), separadas por comas: «F*» = una F con número · «M3-M11» = de la 3 a la 11 · «F28» = esa ·
 * cualquier otra palabra = el nombre la contiene. Sin distinguir mayúsculas.
 */
export function encaja(texto: string, codigos: string | undefined) {
  const t = texto.toLowerCase();
  const numeros = (letras: string) => [...t.matchAll(new RegExp(`(?:^|[^a-z0-9ñ])${letras}-?(\\d+)(?=[^0-9]|$)`, 'g'))].map((m) => Number(m[1]));
  return (codigos ?? '').split(/\s*,\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean).some((tok) => {
    let m = tok.match(/^([a-zñ]+)-?\*$/);
    if (m) return new RegExp(`(^|[^a-z0-9ñ])${m[1]}-?\\d+([^0-9]|$)`).test(t);
    m = tok.match(/^([a-zñ]+)-?(\d+)\s*-\s*(?:[a-zñ]+)?-?(\d+)$/);
    if (m) { const lo = Math.min(+m[2], +m[3]), hi = Math.max(+m[2], +m[3]); return numeros(m[1]).some((n) => n >= lo && n <= hi); }
    m = tok.match(/^([a-zñ]+)-?(\d+)$/);
    if (m) return numeros(m[1]).includes(+m[2]);
    return t.includes(tok);
  });
}

type Pestana = 'hoy' | 'semana' | 'finde' | 'dia' | 'incidencias' | 'tareas' | 'checklists' | 'personas' | 'resumen';

/** Los apartados de Limpieza que puede ver cada uno (salen en el menú lateral, debajo de «Limpieza»). */
export function apartadosLimpieza(puede: (p: string) => boolean): [Pestana, string][] {
  const ve = puede('limpieza.plan.ver') || puede('limpieza.plan.editar');
  const apunta = puede('limpieza.trabajo.apuntar');
  return ([['hoy', 'Hoy del equipo', puede('limpieza.trabajo.ver')], ['semana', 'Semana', puede('limpieza.trabajo.ver')],
    ['finde', 'Fin de semana', puede('limpieza.trabajo.repartir') || puede('limpieza.excel.editar')], ['dia', 'Mi día', apunta],
    ['incidencias', 'Incidencias', apunta || puede('limpieza.incidencia.editar')], ['tareas', 'Tareas', ve], ['checklists', 'Checklists', ve], ['personas', 'Personas', ve],
    ['resumen', 'Resumen', puede('limpieza.informe.ver') || puede('limpieza.informe.todo')]] as [Pestana, string, boolean][])
    .filter((p) => p[2]).map(([c, n]) => [c, n]);
}

/** Módulo Limpieza: el apartado que diga la ruta (los apartados están en el menú lateral). */
export function Limpieza({ ruta, ir }: { ruta: string; ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  const pestanas = apartadosLimpieza(puede);
  const pedida = (ruta.split('/')[3] ?? '') as Pestana;
  const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? pestanas[0]?.[0];
  if (!empresa) return null;
  return (
    <main className="contenido" style={{ ['--area' as string]: '#0f766e' }}>
      <Tablon compacto />
      {puede('limpieza.trabajo.repartir') && !puede('limpieza.excel.editar') && actual !== 'finde' && <AvisoInstrucciones ir={() => ir('/m/limpieza/finde')} />}
      {!pestanas.length && (
        <div className="vacio"><p><b>No tienes nada de Limpieza.</b></p>
          <p>Si crees que deberías, díselo a tu administrador.</p></div>)}
      {actual === 'hoy' && <Hoy />}
      {actual === 'dia' && <MiDia />}
      {actual === 'tareas' && <Tareas />}
      {actual === 'checklists' && <Checklists />}
      {actual === 'semana' && <Semana />}
      {actual === 'personas' && <PersonasReparto />}
      {actual === 'finde' && <Finde />}
      {actual === 'incidencias' && <Incidencias />}
      {actual === 'resumen' && <Resumen ruta={ruta} ir={ir} />}
    </main>
  );
}

/** Al encargado: «Tienes instrucciones nuevas» (las que no ha leído y aún valen). */
function AvisoInstrucciones({ ir }: { ir: () => void }) {
  const { empresa } = useSesion();
  const [n, setN] = useState(0);
  useEffect(() => {
    supabase.schema('limpieza').from('instrucciones').select('id').eq('empresa_id', empresa!.id).is('leido_en', null).is('anulado', null)
      .gte('hasta', new Date().toLocaleDateString('sv-SE')).then(({ data }) => setN((data ?? []).length));
  }, [empresa]);
  if (!n) return null;
  return <button type="button" className="aviso-linea aviso-instrucciones" onClick={ir}>{n === 1 ? 'Tienes instrucciones nuevas' : `Tienes ${n} instrucciones nuevas`}: tócalas para leerlas.</button>;
}

// =====================================================================================
// Tareas fijas y habituales
// =====================================================================================
function useTareas() {
  const { empresa } = useSesion();
  const [t, setT] = useState<Tarea[] | null>(null);
  const cargar = useCallback(async () => {
    const { data, error } = await limp().from('tareas').select('*').eq('empresa_id', empresa!.id).order('orden').order('titulo');
    if (error) aviso(textoError(error.message));
    setT((data ?? []) as Tarea[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  return [t, cargar] as const;
}

function Tareas() {
  const { puede } = useSesion();
  const ordenador = useOrdenador();
  const editable = puede('limpieza.plan.editar');
  const listas = useListas();
  const [tareas, recargar] = useTareas();
  const [clase, setClase] = useState<'fija' | 'habitual'>('fija');
  const [bajas, setBajas] = useState(false);
  const [abierta, setAbierta] = useState<Tarea | 'nueva' | null>(null);
  const nombre = (l: Opcion[], id: string | null) => l.find((x) => x.id === id)?.nombre ?? '';
  const maquina = (id: string | null) => listas.maquinas.find((x) => x.id === id)?.codigo ?? '';

  const deClase = (tareas ?? []).filter((t) => t.clase === clase);
  const vistas = deClase.filter((t) => bajas || !t.baja);
  const nBajas = deClase.filter((t) => t.baja).length;
  // las fijas, agrupadas por equipo; las habituales, por grupo
  const grupos = useMemo(() => {
    const g = new Map<string, Tarea[]>();
    vistas.forEach((t) => {
      const k = clase === 'fija' ? nombre(listas.equipos, t.equipo_id) || 'Sin equipo' : t.grupo || 'Sin grupo';
      g.set(k, [...(g.get(k) ?? []), t]);
    });
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [vistas, clase, listas.equipos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="segmentos" role="group" aria-label="Clase de tarea">
        <button type="button" aria-pressed={clase === 'fija'} onClick={() => setClase('fija')}>Fijas</button>
        <button type="button" aria-pressed={clase === 'habitual'} onClick={() => setClase('habitual')}>Habituales</button>
      </div>
      <p className="nota" style={{ marginTop: 0 }}>
        {clase === 'fija'
          ? 'Salen solas cada día que toca, para un equipo (y turno).'
          : 'Las que se piden a menudo: se eligen de la lista cuando hacen falta.'}
      </p>
      {editable && <div className="acciones-cal"><button type="button" className="boton" onClick={() => setAbierta('nueva')}>+ Nueva tarea {clase === 'fija' ? 'fija' : 'habitual'}</button></div>}
      {tareas === null ? <p className="nota">Cargando…</p> : !vistas.length ? (
        <div className="vacio"><p><b>Todavía no hay tareas {clase === 'fija' ? 'fijas' : 'habituales'}.</b></p></div>
      ) : ordenador ? (
        <Tabla key={clase} filas={vistas} clave={(t) => t.id} alAbrir={(t) => setAbierta(t)} etiquetaBuscar="Buscar tarea" pistaBuscar="Buscar tarea, sitio o persona…"
          claseFila={(t) => (t.baja ? 'de-baja' : '')}
          filtros={grupos.length > 1 ? grupos.map(([g]) => ({ clave: g, texto: g,
            cumple: (t: Tarea) => (clase === 'fija' ? nombre(listas.equipos, t.equipo_id) || 'Sin equipo' : t.grupo || 'Sin grupo') === g })) : undefined}
          columnas={[
            { clave: 'titulo', titulo: 'Tarea', valor: (t) => t.titulo },
            clase === 'fija' ? { clave: 'equipo', titulo: 'Equipo', valor: (t) => nombre(listas.equipos, t.equipo_id) } : { clave: 'grupo', titulo: 'Grupo', valor: (t) => t.grupo ?? '' },
            ...(clase === 'fija' ? [{ clave: 'dias', titulo: 'Días', valor: (t: Tarea) => textoDias(t.dias) }, { clave: 'turno', titulo: 'Turno', valor: (t: Tarea) => nombre(listas.turnos, t.turno_id) }] : []),
            { clave: 'donde', titulo: 'Dónde', valor: (t) => [maquina(t.activo_id), nombre(listas.zonas, t.ubicacion_id) || t.lugar].filter(Boolean).join(' · ') },
            { clave: 'quien', titulo: clase === 'fija' ? 'Quién' : 'Solo para', valor: (t) => (clase === 'fija'
              ? (t.todo_equipo ? 'Todo el equipo' : t.asignados.length ? t.asignados.map((p) => nombre(listas.personas, p)).filter(Boolean).join(', ') : 'Sin asignar')
              : t.solo_para.map((p) => nombre(listas.personas, p)).filter(Boolean).join(', ')) },
            { clave: 'min', titulo: 'Previsto', numero: true, valor: (t) => (t.minutos_est ? `${t.minutos_est} min` : ''), orden: (t) => t.minutos_est },
            { clave: 'estado', titulo: 'Estado', valor: (t) => (t.baja ? 'De baja' : '') },
          ]} />
      ) : grupos.map(([g, ts]) => (
        <section key={g} className="grupo-tareas">
          <h2 className="subtitulo">{g}</h2>
          <div className="lista">
            {ts.map((t) => (
              <button key={t.id} type="button" className={'fila' + (t.baja ? ' de-baja' : '')} onClick={() => setAbierta(t)}>
                <span className="fila-txt"><b>{t.titulo}</b>
                  <small>{[
                    clase === 'fija' ? textoDias(t.dias) : '',
                    clase === 'fija' ? nombre(listas.turnos, t.turno_id) : '',
                    maquina(t.activo_id), nombre(listas.zonas, t.ubicacion_id) || t.lugar,
                    t.minutos_est ? `${t.minutos_est} min` : '',
                  ].filter(Boolean).join(' · ')}</small>
                  {clase === 'fija' && <small>{t.todo_equipo ? 'Todo el equipo' : t.asignados.length ? t.asignados.map((p) => nombre(listas.personas, p)).filter(Boolean).join(', ') : 'Sin asignar'}</small>}
                  {clase === 'habitual' && t.solo_para.length > 0 && <small>Solo: {t.solo_para.map((p) => nombre(listas.personas, p)).filter(Boolean).join(', ')}</small>}
                </span>
                {t.baja && <span className="chapa sin">De baja</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
      {nBajas > 0 && <label className="check"><input type="checkbox" checked={bajas} onChange={(e) => setBajas(e.target.checked)} />Ver también las de baja ({nBajas})</label>}
      {abierta && <EditarTarea tarea={abierta === 'nueva' ? null : abierta} clase={abierta === 'nueva' ? clase : abierta.clase} listas={listas}
        grupos={[...new Set((tareas ?? []).map((t) => t.grupo).filter(Boolean) as string[])]}
        editable={editable} alCerrar={() => setAbierta(null)} alGuardar={() => { setAbierta(null); recargar(); }} />}
    </>
  );
}

/** Lista de personas para marcar (quién la hace, o quién puede hacerla). */
function ElegirPersonas({ personas, marcadas, cambiar, deshabilitado }: {
  personas: Opcion[]; marcadas: string[]; cambiar: (v: string[]) => void; deshabilitado?: boolean;
}) {
  const vivas = personas.filter((p) => !p.baja || marcadas.includes(p.id));
  if (!vivas.length) return <p className="nota" style={{ margin: 0 }}>No hay trabajadores dados de alta.</p>;
  return (
    <div className="lista compacta">
      {vivas.map((p) => (
        <label key={p.id} className="fila check">
          <input type="checkbox" className="casilla" disabled={deshabilitado} checked={marcadas.includes(p.id)}
            onChange={(e) => cambiar(e.target.checked ? [...marcadas, p.id] : marcadas.filter((x) => x !== p.id))} />
          <span className="fila-txt">{p.nombre}</span>
        </label>
      ))}
    </div>
  );
}

function EditarTarea({ tarea, clase, listas, grupos, editable, alCerrar, alGuardar }: {
  tarea: Tarea | null; clase: 'fija' | 'habitual'; listas: Listas; grupos: string[]; editable: boolean; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const [titulo, setTitulo] = useState(tarea?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '');
  const [grupo, setGrupo] = useState(tarea?.grupo ?? '');
  const [lugar, setLugar] = useState(tarea?.lugar ?? '');
  const [zona, setZona] = useState(tarea?.ubicacion_id ?? '');
  const [maquina, setMaquina] = useState(tarea?.activo_id ?? '');
  const [minutos, setMinutos] = useState(tarea?.minutos_est ? String(tarea.minutos_est) : '');
  const [dias, setDias] = useState<number[]>(tarea?.dias ?? [1, 2, 3, 4, 5]);
  const [equipo, setEquipo] = useState(tarea?.equipo_id ?? listas.equipos.find((e) => !e.baja)?.id ?? '');
  const [turno, setTurno] = useState(tarea?.turno_id ?? '');
  const [todo, setTodo] = useState(tarea?.todo_equipo ?? false);
  const [asignados, setAsignados] = useState<string[]>(tarea?.asignados ?? []);
  const [soloPara, setSoloPara] = useState<string[]>(tarea?.solo_para ?? []);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fija = clase === 'fija';

  async function guardar(baja?: string | null) {
    setError(null);
    if (!titulo.trim()) return setError('Escribe qué hay que hacer.');
    if (fija && !dias.length) return setError('Marca al menos un día.');
    if (fija && !equipo) return setError('Elige el equipo.');
    const min = minutos.trim() ? Number(minutos.replace(',', '.')) : null;
    if (min !== null && !(Number.isInteger(min) && min >= 1 && min <= 1440)) return setError('Los minutos tienen que ser un número entero entre 1 y 1440.');
    const fila = {
      empresa_id: empresa!.id, clase, titulo: titulo.trim(), descripcion: descripcion.trim() || null,
      grupo: fija ? null : grupo.trim() || null, lugar: lugar.trim() || null,
      ubicacion_id: zona || null, activo_id: maquina || null, minutos_est: min,
      dias: fija ? dias : null, equipo_id: fija ? equipo : null, turno_id: fija ? turno || null : null,
      todo_equipo: fija && todo, asignados: fija && !todo ? asignados : [], solo_para: fija ? [] : soloPara,
      ...(baja !== undefined ? { baja } : {}),
    };
    setOcupado(true);
    const { error: e } = tarea ? await limp().from('tareas').update(fila).eq('id', tarea.id) : await limp().from('tareas').insert(fila);
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(baja ? 'Tarea dada de baja' : baja === null ? 'Tarea recuperada' : 'Tarea guardada');
    alGuardar();
  }

  const t = tarea ? (editable ? 'Cambiar tarea' : 'Tarea') : fija ? 'Nueva tarea fija' : 'Nueva tarea habitual';
  return (
    <Ventana titulo={t} alCerrar={alCerrar} pie={editable && (
      <>
        {tarea && <button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(tarea.baja ? null : new Date().toISOString())}>{tarea.baja ? 'Recuperar' : 'Dar de baja'}</button>}
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar()}>Guardar</button>
      </>)}>
      <fieldset disabled={!editable} className="sin-borde">
        <label className="campo"><span>Qué hay que hacer</span>
          <input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} placeholder={fija ? 'Basuras Nave 1' : 'Cambiar taladrina'} /></label>
        <label className="campo"><span>Explicación (opcional)</span>
          <textarea value={descripcion} maxLength={2000} rows={3} onChange={(e) => setDescripcion(e.target.value)} /></label>
        {fija ? (
          <>
            <div className="campo"><span>Qué días</span>
              <div className="dias" role="group" aria-label="Qué días">
                {DIAS.map(([n, l]) => <button key={n} type="button" aria-pressed={dias.includes(n)}
                  onClick={() => setDias((d) => d.includes(n) ? d.filter((x) => x !== n) : [...d, n])}>{l}</button>)}
              </div></div>
            <div className="filtros">
              <label className="campo"><span>Equipo</span>
                <select aria-label="Equipo" value={equipo} onChange={(e) => setEquipo(e.target.value)}>
                  <option value="">—</option>
                  {listas.equipos.filter((e) => !e.baja || e.id === equipo).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select></label>
              <label className="campo"><span>Turno</span>
                <select aria-label="Turno" value={turno} onChange={(e) => setTurno(e.target.value)}>
                  <option value="">Cualquiera</option>
                  {listas.turnos.filter((e) => !e.baja || e.id === turno).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select></label>
            </div>
            <label className="check"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />La hace todo el equipo</label>
            {!todo && <div className="campo"><span>Quién la hace</span>
              <ElegirPersonas personas={listas.personas} marcadas={asignados} cambiar={setAsignados} deshabilitado={!editable} /></div>}
          </>
        ) : (
          <>
            <label className="campo"><span>Grupo</span>
              <input value={grupo} maxLength={60} list="grupos-tareas" onChange={(e) => setGrupo(e.target.value)} placeholder="limpieza, hornos…" />
              <datalist id="grupos-tareas">{grupos.map((g) => <option key={g} value={g} />)}</datalist></label>
            <div className="campo"><span>Solo la pueden hacer (vacío = cualquiera)</span>
              <ElegirPersonas personas={listas.personas} marcadas={soloPara} cambiar={setSoloPara} deshabilitado={!editable} /></div>
          </>
        )}
        <div className="filtros">
          <label className="campo"><span>Máquina</span>
            <select aria-label="Máquina" value={maquina} onChange={(e) => setMaquina(e.target.value)}>
              <option value="">Ninguna</option>
              {listas.maquinas.filter((m) => !m.baja || m.id === maquina).map((m) => <option key={m.id} value={m.id}>{m.codigo}{m.nombre ? ` · ${m.nombre}` : ''}</option>)}
            </select></label>
          <label className="campo"><span>Zona</span>
            <select aria-label="Zona" value={zona} onChange={(e) => setZona(e.target.value)}>
              <option value="">Ninguna</option>
              {listas.zonas.filter((z) => !z.baja || z.id === zona).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select></label>
        </div>
        <div className="filtros">
          <label className="campo"><span>Otro sitio (texto)</span>
            <input value={lugar} maxLength={120} onChange={(e) => setLugar(e.target.value)} /></label>
          <label className="campo"><span>Minutos que suele llevar</span>
            <input value={minutos} inputMode="numeric" onChange={(e) => setMinutos(e.target.value)} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
    </Ventana>
  );
}

// =====================================================================================
// Checklists
// =====================================================================================
function Checklists() {
  const { empresa, puede } = useSesion();
  const editable = puede('limpieza.plan.editar');
  const listas = useListas();
  const ordenador = useOrdenador();
  const [tareas] = useTareas();
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [abierta, setAbierta] = useState<Plantilla | 'nueva' | null>(null);
  const [bajas, setBajas] = useState(false);
  const cargar = useCallback(async () => {
    const { data, error } = await limp().from('plantillas').select('*').eq('empresa_id', empresa!.id).order('orden').order('nombre');
    if (error) aviso(textoError(error.message));
    setPlantillas((data ?? []) as Plantilla[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  const vistas = (plantillas ?? []).filter((p) => bajas || !p.baja);
  const nBajas = (plantillas ?? []).filter((p) => p.baja).length;

  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Las del encargado las rellena él (por ejemplo, el cierre del fin de semana). Las demás salen al terminar los trabajos de las máquinas o tareas que elijas.</p>
      {editable && <div className="acciones-cal"><button type="button" className="boton" onClick={() => setAbierta('nueva')}>+ Nueva checklist</button></div>}
      {plantillas === null ? <p className="nota">Cargando…</p> : !vistas.length ? (
        <div className="vacio"><p><b>Todavía no hay checklists.</b></p></div>
      ) : ordenador ? (
        <Tabla filas={[...vistas].sort((a, b) => Number(a.cuando !== 'encargado') - Number(b.cuando !== 'encargado'))} clave={(p) => p.id} alAbrir={(p) => setAbierta(p)} etiquetaBuscar="Buscar checklist" claseFila={(p) => (p.baja ? 'de-baja' : '')}
          filtros={[{ clave: 'enc', texto: 'Del encargado', cumple: (p) => p.cuando === 'encargado' }, { clave: 'trab', texto: 'Al terminar trabajos', cumple: (p) => p.cuando === 'trabajos' }]}
          columnas={[
            { clave: 'nombre', titulo: 'Checklist', valor: (p) => p.nombre },
            { clave: 'cuando', titulo: 'Cuándo', valor: (p) => (p.cuando === 'encargado' ? 'Del encargado' : 'Al terminar trabajos') },
            { clave: 'puntos', titulo: 'Puntos', numero: true, valor: (p) => p.puntos.length, orden: (p) => p.puntos.length },
            { clave: 'sale', titulo: 'Sale en', valor: (p) => {
              if (p.cuando !== 'trabajos') return '';
              const n = listas.maquinas.filter((m) => !m.baja && encaja(m.codigo, p.aplica.codigos)).length, nt = (p.aplica.tareas ?? []).length;
              return [n ? `${n} máquina${n === 1 ? '' : 's'}` : '', nt ? `${nt} tarea${nt === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ') || 'sin enganchar a nada'; } },
            { clave: 'estado', titulo: 'Estado', valor: (p) => (p.baja ? 'De baja' : '') },
          ]} />
      ) : (['encargado', 'trabajos'] as const).map((c) => {
        const ps = vistas.filter((p) => p.cuando === c);
        if (!ps.length) return null;
        return (
          <section key={c} className="grupo-tareas">
            <h2 className="subtitulo">{c === 'encargado' ? 'Del encargado' : 'Al terminar trabajos'}</h2>
            <div className="lista">
              {ps.map((p) => {
                const n = listas.maquinas.filter((m) => !m.baja && encaja(m.codigo, p.aplica.codigos)).length;
                const nt = (p.aplica.tareas ?? []).length;
                return (
                  <button key={p.id} type="button" className={'fila' + (p.baja ? ' de-baja' : '')} onClick={() => setAbierta(p)}>
                    <span className="fila-txt"><b>{p.nombre}</b>
                      <small>{p.puntos.length === 1 ? '1 punto' : `${p.puntos.length} puntos`}
                        {c === 'trabajos' && ` · ${[n ? `${n} máquina${n === 1 ? '' : 's'}` : '', nt ? `${nt} tarea${nt === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ') || 'sin enganchar a nada'}`}</small></span>
                    {p.baja && <span className="chapa sin">De baja</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {nBajas > 0 && <label className="check"><input type="checkbox" checked={bajas} onChange={(e) => setBajas(e.target.checked)} />Ver también las de baja ({nBajas})</label>}
      {abierta && <EditarPlantilla plantilla={abierta === 'nueva' ? null : abierta} maquinas={listas.maquinas}
        habituales={(tareas ?? []).filter((t) => t.clase === 'habitual' && (!t.baja || (abierta !== 'nueva' && abierta.aplica.tareas?.includes(t.id))))}
        editable={editable} alCerrar={() => setAbierta(null)} alGuardar={() => { setAbierta(null); cargar(); }} />}
    </>
  );
}

function EditarPlantilla({ plantilla, maquinas, habituales, editable, alCerrar, alGuardar }: {
  plantilla: Plantilla | null; maquinas: Maquina[]; habituales: Tarea[]; editable: boolean; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '');
  const [cuando, setCuando] = useState<'trabajos' | 'encargado'>(plantilla?.cuando ?? 'trabajos');
  const [codigos, setCodigos] = useState(plantilla?.aplica.codigos ?? '');
  const [excluir, setExcluir] = useState(plantilla?.aplica.excluir ?? '');
  const [conTareas, setConTareas] = useState<string[]>(plantilla?.aplica.tareas ?? []);
  const [puntos, setPuntos] = useState<Punto[]>(plantilla?.puntos.length ? plantilla.puntos : [{ texto: '', tipo: 'ok' }]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salen = maquinas.filter((m) => !m.baja && encaja(m.codigo, codigos));

  const cambiar = (i: number, p: Partial<Punto>) => setPuntos((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const mover = (i: number, d: number) => setPuntos((ps) => { const c = [...ps]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); return c; });

  async function guardar(baja?: string | null) {
    setError(null);
    if (!nombre.trim()) return setError('Ponle un nombre a la checklist.');
    const limpios = puntos.filter((p) => p.texto.trim()).map((p) => ({
      texto: p.texto.trim(), tipo: p.tipo,
      ...(p.tipo === 'num' && p.minimo != null && !Number.isNaN(p.minimo) ? { minimo: p.minimo } : {}),
      ...(p.ayuda?.trim() ? { ayuda: p.ayuda.trim() } : {}),
      ...(p.foto_si_mal ? { foto_si_mal: true } : {}),
    }));
    if (!limpios.length) return setError('Escribe al menos un punto.');
    const fila = {
      empresa_id: empresa!.id, nombre: nombre.trim(), cuando, puntos: limpios,
      aplica: cuando === 'trabajos' ? { ...(codigos.trim() ? { codigos: codigos.trim() } : {}), ...(excluir.trim() ? { excluir: excluir.trim() } : {}), ...(conTareas.length ? { tareas: conTareas } : {}) } : {},
      ...(baja !== undefined ? { baja } : {}),
    };
    setOcupado(true);
    const { error: e } = plantilla ? await limp().from('plantillas').update(fila).eq('id', plantilla.id) : await limp().from('plantillas').insert(fila);
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(baja ? 'Checklist dada de baja' : baja === null ? 'Checklist recuperada' : 'Checklist guardada');
    alGuardar();
  }

  return (
    <Ventana titulo={plantilla ? (editable ? 'Cambiar checklist' : 'Checklist') : 'Nueva checklist'} alCerrar={alCerrar} pie={editable && (
      <>
        {plantilla && <button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(plantilla.baja ? null : new Date().toISOString())}>{plantilla.baja ? 'Recuperar' : 'Dar de baja'}</button>}
        <button type="button" className="boton" disabled={ocupado} onClick={() => guardar()}>Guardar</button>
      </>)}>
      <fieldset disabled={!editable} className="sin-borde">
        <label className="campo"><span>Nombre</span>
          <input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Inyectoras y zonas" /></label>
        <div className="segmentos" role="group" aria-label="Cuándo sale">
          <button type="button" aria-pressed={cuando === 'trabajos'} onClick={() => setCuando('trabajos')}>Al terminar trabajos</button>
          <button type="button" aria-pressed={cuando === 'encargado'} onClick={() => setCuando('encargado')}>Del encargado</button>
        </div>
        {cuando === 'trabajos' && (
          <>
            <label className="campo"><span>Máquinas o palabras del nombre del trabajo (separadas por comas: F* = una F con número · M3-M11 = de la 3 a la 11 · F28 = esa · otra palabra = el nombre la contiene)</span>
              <input value={codigos} maxLength={2000} onChange={(e) => setCodigos(e.target.value)} placeholder="F*, M3, M4" /></label>
            <p className="nota" style={{ marginTop: -6 }}>{codigos.trim()
              ? salen.length ? `Sale en ${salen.length}: ${salen.slice(0, 12).map((m) => m.codigo).join(', ')}${salen.length > 12 ? '…' : ''}` : 'Ninguna máquina encaja con eso.'
              : 'Sin máquinas: solo sale en las tareas que marques abajo.'}</p>
            <label className="campo"><span>Menos en los trabajos que digan (palabras separadas por comas)</span>
              <input value={excluir} maxLength={2000} onChange={(e) => setExcluir(e.target.value)} placeholder="horno, derrame" /></label>
            {habituales.length > 0 && <div className="campo"><span>Y en estas tareas habituales</span>
              <div className="lista compacta">
                {habituales.map((t) => (
                  <label key={t.id} className="fila check">
                    <input type="checkbox" className="casilla" checked={conTareas.includes(t.id)}
                      onChange={(e) => setConTareas((c) => e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id))} />
                    <span className="fila-txt">{t.titulo}</span>
                  </label>))}
              </div></div>}
          </>
        )}
        <h3 className="subtitulo">Puntos</h3>
        <ol className="puntos">
          {puntos.map((p, i) => (
            <li key={i} className="punto">
              <input aria-label={`Punto ${i + 1}`} value={p.texto} maxLength={200} onChange={(e) => cambiar(i, { texto: e.target.value })} placeholder="Robot limpio" />
              <div className="punto-opciones">
                <select aria-label={`Cómo se contesta el punto ${i + 1}`} value={p.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as Punto['tipo'] })}>
                  <option value="ok">Bien / mal</option>
                  <option value="num">Un número</option>
                </select>
                {p.tipo === 'num' && <input aria-label={`Mínimo del punto ${i + 1}`} className="minimo" inputMode="decimal" placeholder="Mínimo"
                  value={p.minimo ?? ''} onChange={(e) => cambiar(i, { minimo: e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.')) })} />}
                {p.tipo === 'ok' && <label className="check peq"><input type="checkbox" checked={!!p.foto_si_mal} onChange={(e) => cambiar(i, { foto_si_mal: e.target.checked })} />Foto si está mal</label>}
                {editable && <span className="botones-punto">
                  <button type="button" className="boton-icono" aria-label={`Subir el punto ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="boton-icono" aria-label={`Bajar el punto ${i + 1}`} disabled={i === puntos.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" className="boton-icono" aria-label={`Quitar el punto ${i + 1}`} onClick={() => setPuntos((ps) => ps.filter((_, j) => j !== i))}>✕</button>
                </span>}
              </div>
            </li>
          ))}
        </ol>
        {editable && <button type="button" className="boton sec" onClick={() => setPuntos((ps) => [...ps, { texto: '', tipo: 'ok' }])}>+ Añadir punto</button>}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
    </Ventana>
  );
}
