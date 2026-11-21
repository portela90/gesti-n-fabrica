// «Hoy del equipo» (administrador y encargado): todos los trabajos del día, por persona, y repartirlos.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { alVaciarse } from './cola';
import { durTxt, FilaTrabajo, hoy, limp, NuevoTrabajo, textoError, TrabajoAbierto, type Trabajo } from './MiDia';
import { useListas, type Opcion } from './listas';
import { Sustitutos } from './Reparto';
import { Tabla, useOrdenador } from '../componentes/Tabla';

export function Hoy() {
  const ordenador = useOrdenador();
  const { empresa, puede } = useSesion();
  const reparte = puede('limpieza.trabajo.repartir');
  const listas = useListas();
  // si soy responsable de un equipo (Encargado hornos), solo reparto a mi gente
  const [miEquipo, setMiEquipo] = useState<string[] | null | undefined>(undefined);
  useEffect(() => { limp().rpc('mi_equipo', { p_empresa: empresa!.id }).then(({ data }) => setMiEquipo((data as string[] | null) ?? null)); }, [empresa]);
  const conEquipo = !!miEquipo;
  const gente = conEquipo ? listas.personas.filter((p) => miEquipo!.includes(p.id)) : listas.personas;
  const [fecha, setFecha] = useState(hoy());
  const [lista, setLista] = useState<Trabajo[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [repartiendo, setRepartiendo] = useState<Trabajo | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [sustitutos, setSustitutos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    const { data, error } = await limp().rpc('mi_dia', { p_empresa: empresa!.id, p_fecha: fecha });
    if (error) { aviso(textoError(error.message)); setLista((l) => l ?? []); return; }
    setLista(data as Trabajo[]);
  }, [empresa, fecha]);
  useEffect(() => { setLista(null); cargar(); alVaciarse(cargar); return () => alVaciarse(null); }, [cargar]);
  const cambiar = (id: string, c: Partial<Trabajo>) => setLista((l) => (l ?? []).map((t) => (t.id === id ? { ...t, ...c } : t)));
  const nombre = (l: Opcion[], id: string | null) => l.find((x) => x.id === id)?.nombre ?? '';

  // grupos: sin asignar, todo un equipo, y cada persona (un trabajo de varios sale con cada uno)
  const grupos = useMemo(() => {
    const g = new Map<string, Trabajo[]>();
    const pon = (k: string, t: Trabajo) => g.set(k, [...(g.get(k) ?? []), t]);
    (lista ?? []).forEach((t) => {
      if (t.todo_equipo) pon(`Todo el equipo ${nombre(listas.equipos, t.equipo_id)}`.trim(), t);
      else if (!t.asignados.length) pon('Sin asignar', t);
      else t.asignados.forEach((p) => pon(nombre(listas.personas, p) || 'Alguien', t));
    });
    return [...g.entries()].sort(([a], [b]) => (a === 'Sin asignar' ? -1 : b === 'Sin asignar' ? 1 : a.localeCompare(b, 'es')));
  }, [lista, listas]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = (lista ?? []).find((x) => x.id === abierto) ?? null;
  const total = lista?.length ?? 0, hechos = (lista ?? []).filter((x) => x.estado === 'hecho').length;
  const sinAsignar = (lista ?? []).filter((x) => x.estado !== 'hecho' && !x.todo_equipo && !x.asignados.length).length;
  const manana = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
  async function repartirQueda() {
    setOcupado(true);
    const { data, error } = await limp().rpc('repartir_lo_que_queda', { p_empresa: empresa!.id, p_fecha: fecha });
    setOcupado(false);
    if (error) return aviso(textoError(error.message));
    aviso(data ? `Repartidos ${data}` : 'No había nadie libre para repartir: mira quién entra en el reparto en «Personas».');
    cargar();
  }

  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Día</span><input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
      </div>
      {lista && total > 0 && <p className="nota" style={{ marginTop: 0 }}>{hechos} de {total} hechos.</p>}
      {reparte && !conEquipo && miEquipo !== undefined && (
        <div className="acciones-cal" style={{ marginTop: 0, marginBottom: 12 }}>
          {sinAsignar > 0 && (fecha === hoy() || fecha === manana) &&
            <button type="button" className="boton" disabled={ocupado} onClick={repartirQueda}>Repartir lo que queda ({sinAsignar})</button>}
          <button type="button" className="boton sec" onClick={() => setSustitutos(true)}>Faltas y sustitutos</button>
        </div>)}
      {lista === null ? <p className="nota">Cargando…</p> : !total ? <div className="vacio"><p>No hay trabajos este día.</p></div>
        : ordenador ? (
          <Tabla filas={lista} clave={(x) => x.id} alAbrir={(x) => setAbierto(x.id)} etiquetaBuscar="Buscar trabajo" pistaBuscar="Buscar trabajo, sitio o persona…"
            claseFila={(x) => (x.estado === 'hecho' ? 'de-baja' : '')}
            filtros={[{ clave: 'pend', texto: 'Pendientes', cumple: (x) => x.estado !== 'hecho' },
              { clave: 'sin', texto: 'Sin asignar', cumple: (x) => x.estado !== 'hecho' && !x.todo_equipo && !x.asignados.length },
              { clave: 'prob', texto: 'Con problema', cumple: (x) => !!x.problema }, { clave: 'hecho', texto: 'Hechos', cumple: (x) => x.estado === 'hecho' }]}
            columnas={[
              { clave: 'titulo', titulo: 'Trabajo', valor: (x) => x.titulo },
              { clave: 'donde', titulo: 'Dónde', valor: (x) => [x.maquina, x.zona, x.lugar].filter(Boolean).join(' · ') },
              { clave: 'quien', titulo: 'Quién', valor: (x) => (x.todo_equipo ? `Todo el equipo ${nombre(listas.equipos, x.equipo_id)}`.trim()
                : x.asignados.length ? x.asignados.map((p) => nombre(listas.personas, p) || 'Alguien').join(', ') : <span className="naranja">Sin asignar</span>),
                orden: (x) => (x.todo_equipo ? 'Todo' : x.asignados.map((p) => nombre(listas.personas, p)).join(', ') || '') },
              { clave: 'turno', titulo: 'Turno', valor: (x) => x.turno ?? '' },
              { clave: 'estado', titulo: 'Estado', orden: (x) => ['pendiente', 'en_curso', 'pausado', 'hecho'].indexOf(x.estado), valor: (x) => {
                const c = x.estado === 'hecho' ? ['Hecho', 'firmado'] : x.estado === 'en_curso' ? ['En curso', 'pendiente'] : x.estado === 'pausado' ? ['En pausa', 'pendiente']
                  : x.problema ? ['Con problema', 'sin-cuadrar'] : x.atrasado ? ['Atrasado', 'sin-cuadrar'] : ['Pendiente', 'sin'];
                return <span className={'chapa ' + c[1]}>{c[0]}</span>; } },
              { clave: 'prev', titulo: 'Previsto', numero: true, valor: (x) => (x.minutos_est ? durTxt(x.minutos_est) : ''), orden: (x) => x.minutos_est },
              { clave: 'real', titulo: 'Real', numero: true, valor: (x) => (x.estado === 'hecho' ? durTxt(x.minutos) : ''), orden: (x) => x.minutos },
            ]} />
        ) : grupos.map(([g, ts]) => (
          <section key={g} className="grupo-tareas">
            <h2 className="subtitulo">{g} <span className="nota">· {ts.filter((x) => x.estado === 'hecho').length}/{ts.length}</span></h2>
            <div className="lista">{ts.map((x) => <FilaTrabajo key={g + x.id} t={x} abrir={() => setAbierto(x.id)} />)}</div>
          </section>))}
      {reparte && fecha === hoy() && <div className="acciones-cal" style={{ marginTop: 14 }}><button type="button" className="boton" onClick={() => setNuevo(true)}>+ Trabajo</button></div>}
      {t && !repartiendo && <TrabajoAbierto t={t} cambiar={(c) => cambiar(t.id, c)} alCerrar={() => setAbierto(null)}
        alRepartir={reparte ? () => setRepartiendo(t) : undefined} />}
      {repartiendo && <Repartir t={repartiendo} personas={gente} equipos={listas.equipos} sinEquipo={conEquipo}
        alCerrar={() => setRepartiendo(null)} alGuardar={() => { setRepartiendo(null); cargar(); }} />}
      {sustitutos && <Sustitutos personas={listas.personas} alCerrar={() => { setSustitutos(false); cargar(); }} />}
      {nuevo && <NuevoTrabajo personas={gente} alCerrar={() => setNuevo(false)} alCrear={(id) => { setNuevo(false); cargar().then(() => setAbierto(id)); }} />}
    </>
  );
}

function Repartir({ t, personas, equipos, sinEquipo, alCerrar, alGuardar }: { t: Trabajo; personas: Opcion[]; equipos: Opcion[]; sinEquipo?: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const [quien, setQuien] = useState<string[]>(t.todo_equipo ? [] : t.asignados);
  const [todo, setTodo] = useState(t.todo_equipo);
  const [equipo, setEquipo] = useState(t.equipo_id ?? equipos.find((e) => !e.baja)?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function guardar(soltar = false) {
    setError(null);
    if (!soltar && !todo && !quien.length) return setError('Elige al menos a una persona, o «todo el equipo».');
    setOcupado(true);
    const { error: e } = await limp().rpc('repartir', soltar ? { p_trabajo: t.id, p_personas: [], p_todo_equipo: false, p_equipo: null }
      : { p_trabajo: t.id, p_personas: todo ? [] : quien, p_todo_equipo: todo, p_equipo: todo ? equipo || null : null });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(soltar ? 'Queda sin asignar' : 'Repartido'); alGuardar();
  }
  const vivas = personas.filter((p) => !p.baja || quien.includes(p.id));
  return (
    <Ventana titulo={`¿A quién le toca? · ${t.titulo}`} alCerrar={alCerrar} pie={<>
      {(t.asignados.length > 0 || t.todo_equipo) && <button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(true)}>Dejar sin asignar</button>}
      <button type="button" className="boton" disabled={ocupado} onClick={() => guardar()}>Guardar</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Solo cambia este trabajo de este día; la tarea fija se queda como estaba.</p>
      {!sinEquipo && <label className="check"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />Todo el equipo</label>}
      {todo ? (
        <label className="campo"><span>Equipo</span>
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)}>{equipos.filter((e) => !e.baja || e.id === equipo).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
      ) : (
        <div className="lista compacta">
          {vivas.map((p) => (
            <label key={p.id} className="fila check">
              <input type="checkbox" checked={quien.includes(p.id)} onChange={(e) => setQuien((q) => (e.target.checked ? [...q, p.id] : q.filter((x) => x !== p.id)))} />
              <span className="fila-txt">{p.nombre}</span>
            </label>))}
        </div>)}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
