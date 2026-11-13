import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import {
  Anio, fechaCorta, Leyenda, ListaDias, periodo, personal, textoError, TIPOS,
  type Dia, type TipoDia, type Vacacion,
} from './calendario';

/** Un calendario del año (nombre, días de la semana que se trabaja y quién va en él). */
interface Equipo { id: string; nombre: string; dias: number[]; personas: string[] }
interface Persona { id: string; nombre: string; baja?: string | null }
interface Envio {
  id: string; anio: number; calendario_id: string; persona_id: string; enviado: string; anulado: string | null;
  estado: 'pendiente' | 'firmado' | 'anulado'; firmado_en: string | null; conforme: boolean | null; comentario: string | null;
  firma_imagen: string | null; sha256: string;
  datos: { anio: number; unidad: string; calendario?: string; equipo: string; trabajador: string; dias_equipo: number[] | null; dias: Dia[]; vacaciones: Vacacion[] };
}

type Pestana = 'mio' | 'calendario' | 'vacaciones' | 'firmas';
const ANIO_ACTUAL = new Date().getFullYear();
const DIAS_SEMANA: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Los calendarios de un año, con quién va en cada uno. */
function useCalendarios(anio: number) {
  const { empresa } = useSesion();
  const [cals, setCals] = useState<Equipo[] | null>(null);
  const cargar = useCallback(async () => {
    const [c, cp] = await Promise.all([
      personal().from('calendarios').select('id, nombre, dias_semana').eq('empresa_id', empresa!.id).eq('anio', anio).order('nombre'),
      personal().from('calendario_personas').select('persona_id, calendario_id').eq('empresa_id', empresa!.id).eq('anio', anio),
    ]);
    const miembros = (cp.data ?? []) as { persona_id: string; calendario_id: string }[];
    // primero el que empieza antes la semana (lunes), luego el de fin de semana
    const primerDia = (d: number[]) => Math.min(...d.map((x) => (x + 6) % 7), 7);
    setCals(((c.data ?? []) as { id: string; nombre: string; dias_semana: number[] }[])
      .map((x) => ({ id: x.id, nombre: x.nombre, dias: x.dias_semana, personas: miembros.filter((m) => m.calendario_id === x.id).map((m) => m.persona_id) }))
      .sort((a, b) => primerDia(a.dias) - primerDia(b.dias) || a.nombre.localeCompare(b.nombre, 'es')));
  }, [empresa, anio]);
  useEffect(() => { setCals(null); cargar(); }, [cargar]);
  return [cals, cargar] as const;
}

/** Todos los trabajadores de la unidad (para elegir quién va en cada calendario). */
function usePersonas() {
  const { empresa, puede } = useSesion();
  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => {
    if (!puede('nucleo.persona.ver')) return;
    nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa!.id).order('nombre')
      .then(({ data }) => setPersonas((data ?? []) as Persona[]));
  }, [empresa, puede]);
  return personas;
}

/** Módulo Personal: mi calendario (todos) y, según permisos, los calendarios del año, vacaciones y firmas. */
export function Personal({ ruta, ir }: { ruta: string; ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  const pestanas = ([
    ['mio', 'Mi calendario', true],
    ['calendario', 'Calendario', puede('personal.calendario.ver')],
    ['vacaciones', 'Vacaciones', puede('personal.calendario.ver')],
    ['firmas', 'Firmas', puede('personal.firma.ver') || puede('personal.firma.enviar')],
  ] as [Pestana, string, boolean][]).filter((p) => p[2]);
  const pedida = (ruta.split('/')[3] ?? '') as Pestana;
  const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? (pestanas.length > 1 ? 'calendario' : 'mio');
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [cals, recargar] = useCalendarios(anio);
  const [calId, setCalId] = useState<string>('');
  const [editando, setEditando] = useState<Equipo | 'nuevo' | null>(null);
  const editable = puede('personal.calendario.editar');

  useEffect(() => {
    if (!cals) return;
    setCalId((x) => (cals.some((c) => c.id === x) ? x : cals.find((c) => c.id === leer('personal.calendario.' + anio))?.id ?? cals[0]?.id ?? ''));
  }, [cals, anio]);

  if (!empresa) return null;
  const cal = cals?.find((c) => c.id === calId) ?? null;
  const elegir = actual !== 'mio' && (
    <>
      <div className="filtros">
        <label className="campo"><span>Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map((a) => <option key={a}>{a}</option>)}
          </select></label>
        {!!cals?.length && <label className="campo"><span>Calendario</span>
          <select value={calId} onChange={(e) => { setCalId(e.target.value); guardar('personal.calendario.' + anio, e.target.value); }}>
            {cals.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>}
      </div>
      {cal && (
        <div className="acciones-cal no-imprimir">
          {editable
            ? <button type="button" className="boton sec peq" onClick={() => setEditando(cal)}>Para {cal.personas.length === 1 ? '1 persona' : `${cal.personas.length} personas`} · cambiar</button>
            : <span className="nota">Para {cal.personas.length === 1 ? '1 persona' : `${cal.personas.length} personas`}</span>}
          {editable && <button type="button" className="boton sec peq" onClick={() => setEditando('nuevo')}>+ Nuevo calendario</button>}
        </div>)}
    </>
  );

  return (
    <main className="contenido" style={{ ['--area' as string]: '#9a3412' }}>
      {pestanas.length > 1 && (
        <nav className="pestanas no-imprimir" aria-label="Personal">
          {pestanas.map(([c, n]) => <button key={c} type="button" aria-pressed={actual === c} onClick={() => ir(`/m/personal/${c}`)}>{n}</button>)}
        </nav>
      )}
      {elegir}
      {actual !== 'mio' && cals?.length === 0 && (
        <div className="vacio"><p><b>Todavía no hay calendarios de {anio}.</b></p>
          <p>Crea uno para cada grupo de gente que trabaja igual (por ejemplo «Semana {anio}» y «Fin de semana {anio}»).</p>
          {editable && <button type="button" className="boton" onClick={() => setEditando('nuevo')}>Crear calendario</button>}</div>)}
      {actual === 'mio' && <MiCalendario />}
      {actual === 'calendario' && cal && <Calendario key={cal.id} anio={anio} equipo={cal} equipos={cals!} />}
      {actual === 'vacaciones' && cal && <Vacaciones key={cal.id} anio={anio} equipo={cal} />}
      {actual === 'firmas' && cal && <Firmas key={cal.id} anio={anio} equipo={cal} />}
      {editando && <FormCalendario anio={anio} cal={editando === 'nuevo' ? null : editando} cals={cals ?? []}
        alCerrar={() => setEditando(null)} alGuardar={(id) => { setEditando(null); setCalId(id); guardar('personal.calendario.' + anio, id); recargar(); }} />}
    </main>
  );
}

/** Crear un calendario o cambiar su nombre, sus días de la semana y para quién es. */
function FormCalendario({ anio, cal, cals, alCerrar, alGuardar }: {
  anio: number; cal: Equipo | null; cals: Equipo[]; alCerrar: () => void; alGuardar: (id: string) => void;
}) {
  const { empresa } = useSesion();
  const personas = usePersonas().filter((p) => !p.baja || cal?.personas.includes(p.id));
  const [nombre, setNombre] = useState(cal?.nombre ?? '');
  const [dias, setDias] = useState<number[]>(cal?.dias ?? [1, 2, 3, 4, 5]);
  const [quien, setQuien] = useState<Set<string>>(new Set(cal?.personas ?? []));
  const [copiarDe, setCopiarDe] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enOtro = (pid: string) => cals.find((c) => c.id !== cal?.id && c.personas.includes(pid));
  const cambia = personas.filter((p) => quien.has(p.id) && enOtro(p.id)).length;

  async function guardarCal() {
    if (!nombre.trim()) { setError('Ponle un nombre.'); return; }
    if (!dias.length) { setError('Elige qué días de la semana se trabaja.'); return; }
    setOcupado(true); setError(null);
    const fila = { nombre: nombre.trim(), dias_semana: [...dias].sort() };
    const r = cal ? await personal().from('calendarios').update(fila).eq('id', cal.id).select('id').single()
      : await personal().from('calendarios').insert({ ...fila, empresa_id: empresa!.id, anio }).select('id').single();
    if (r.error) { setOcupado(false); setError(r.error.message.includes('duplicate') ? 'Ya hay un calendario con ese nombre este año.' : textoError(r.error.message)); return; }
    const id = (r.data as { id: string }).id;
    const p = await personal().rpc('poner_personas', { p_calendario: id, p_personas: [...quien] });
    if (p.error) { setOcupado(false); setError(textoError(p.error.message)); return; }
    if (!cal && copiarDe) {
      const c = await personal().rpc('copiar_dias', { p_de: copiarDe, p_a: id });
      if (c.error) { setOcupado(false); setError(textoError(c.error.message)); return; }
    }
    setOcupado(false);
    aviso(cal ? 'Calendario guardado' : 'Calendario creado'); alGuardar(id);
  }
  async function borrar() {
    if (!cal || !confirm(`¿Borrar el calendario «${cal.nombre}» con sus días marcados? Solo se puede si no se ha enviado a nadie.`)) return;
    const { error } = await personal().from('calendarios').delete().eq('id', cal.id);
    if (error) { setError(error.message.includes('foreign key') ? 'No se puede borrar: ya se ha enviado a firmar.' : textoError(error.message)); return; }
    aviso('Calendario borrado'); alGuardar('');
  }

  return (
    <Ventana titulo={cal ? cal.nombre : `Nuevo calendario ${anio}`} alCerrar={alCerrar}
      pie={<>{cal && <button type="button" className="boton sec" onClick={borrar}>Borrar</button>}
        <button type="button" className="boton" disabled={ocupado} onClick={guardarCal}>{cal ? 'Guardar' : 'Crear'}</button></>}>
      <label className="campo"><span>Nombre</span><input value={nombre} maxLength={80} placeholder={`Por ejemplo: Refuerzo ${anio}`} onChange={(e) => setNombre(e.target.value)} /></label>
      <div className="campo"><span>Días de la semana que se trabaja</span>
        <div className="dias" role="group" aria-label="Días de la semana que se trabaja">
          {DIAS_SEMANA.map(([d, l]) => <button key={d} type="button" aria-pressed={dias.includes(d)}
            onClick={() => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>{l}</button>)}
        </div></div>
      {!cal && cals.length > 0 && <label className="campo"><span>Copiar los días marcados de (opcional)</span>
        <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
          <option value="">— Empezar en blanco —</option>{cals.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select></label>}
      <div className="campo"><span>¿Para quién es? ({quien.size})</span>
        <div className="botonera" style={{ justifyContent: 'flex-start', margin: '0 0 6px' }}>
          <button type="button" className="boton txt peq" onClick={() => setQuien(new Set(personas.filter((p) => !p.baja).map((p) => p.id)))}>Todos</button>
          <button type="button" className="boton txt peq" onClick={() => setQuien(new Set())}>Ninguno</button>
        </div>
        <div className="lista compacta">
          {personas.map((p) => {
            const otro = enOtro(p.id);
            return (
              <label key={p.id} className="fila check">
                <input type="checkbox" checked={quien.has(p.id)} onChange={() => setQuien((q) => { const n = new Set(q); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                <span className="fila-txt"><b>{p.nombre}</b>{otro && <small>Ahora en «{otro.nombre}»</small>}</span>
              </label>
            );
          })}
        </div></div>
      {cambia > 0 && <p className="nota">Cada persona va en un solo calendario por año: {cambia === 1 ? '1 persona se cambiará' : `${cambia} personas se cambiarán`} a este.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Un calendario: marcar festivos, cierres, intensiva, horarios especiales, trabaja, descanso y vacaciones
// ---------------------------------------------------------------------------------------------
function Calendario({ anio, equipo, equipos }: { anio: number; equipo: Equipo; equipos: Equipo[] }) {
  const { empresa, puede } = useSesion();
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [marcar, setMarcar] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const editable = puede('personal.calendario.editar') || puede('personal.vacaciones.editar');
  const personas = usePersonasEquipo(equipo);
  const [vacs, setVacs] = useState<Vacacion[]>([]);

  const cargar = useCallback(async () => {
    const [d, v] = await Promise.all([
      personal().from('dias').select('fecha, tipo, nombre, horario')
        .eq('calendario_id', equipo.id).order('fecha'),
      personal().from('vacaciones').select('id, persona_id, desde, hasta, nota')
        .eq('empresa_id', empresa!.id).lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).order('desde'),
    ]);
    if (d.error) { aviso(d.error.message); return; }
    setDias((d.data ?? []) as Dia[]); setVacs((v.data ?? []) as Vacacion[]);
  }, [empresa, equipo, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  // vacaciones de la gente de este calendario; sale en verde el día que están de vacaciones todos
  const delEquipo = useMemo(() => vacs.filter((v) => personas?.some((p) => p.id === v.persona_id)), [vacs, personas]);
  const deTodos = useMemo(() => {
    if (!personas?.length) return [] as Vacacion[];
    const dias: string[] = [];
    for (let m = 0; m < 12; m++) for (let d = 1; d <= new Date(Date.UTC(anio, m + 1, 0)).getUTCDate(); d++) {
      const f = `${anio}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (personas.every((p) => delEquipo.some((v) => v.persona_id === p.id && v.desde <= f && f <= v.hasta))) dias.push(f);
    }
    return dias.map((f) => ({ desde: f, hasta: f, nota: null }));
  }, [personas, delEquipo, anio]);

  const tocar = (f: string) => setElegidos((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const cuenta = (t: TipoDia) => (dias ?? []).filter((d) => d.tipo === t).length;

  return (
    <>
      <div className="cifras-linea">
        {TIPOS.map((t) => <span key={t.tipo}><i className={'t-' + t.tipo} /> {t.nombre}: <b>{cuenta(t.tipo)}</b></span>)}
      </div>
      {editable && (
        <p className="nota no-imprimir">Toca los días para elegirlos y pulsa «Marcar». {equipos.length > 1 &&
          <button type="button" className="boton txt peq" onClick={() => setCopiar(true)}>Copiar de otro calendario</button>}</p>)}
      <Leyenda />
      {dias === null ? <p className="nota">Cargando…</p>
        : <Anio anio={anio} dias={dias} vacaciones={deTodos} diasEquipo={equipo.dias} elegidos={editable ? elegidos : undefined} alTocar={editable ? tocar : undefined} />}
      <p className="nota">En verde, los días que están de vacaciones todos los de este calendario. Las de cada uno, en la lista de abajo.</p>
      <h2 className="subtitulo">Días marcados</h2>
      <ListaDias dias={dias ?? []} />
      <h2 className="subtitulo">Vacaciones de la gente de este calendario</h2>
      {delEquipo.length ? (
        <ul className="lista-dias">
          {delEquipo.map((v) => <li key={v.id}><i className="t-vacaciones" aria-hidden="true" /><b>{personas?.find((p) => p.id === v.persona_id)?.nombre}</b>
            <span>{periodo(v)}{v.nota ? ` · ${v.nota}` : ''}</span></li>)}
        </ul>) : <p className="nota">Nadie de {equipo.nombre} tiene vacaciones en {anio}.</p>}
      {editable && elegidos.size > 0 && (
        <div className="barra-abajo no-imprimir">
          <span><b>{elegidos.size}</b> {elegidos.size === 1 ? 'día elegido' : 'días elegidos'}</span>
          <button type="button" className="boton txt" onClick={() => setElegidos(new Set())}>Quitar</button>
          <button type="button" className="boton" onClick={() => setMarcar(true)}>Marcar</button>
        </div>
      )}
      {marcar && <Marcar fechas={[...elegidos].sort()} equipo={equipo} equipos={equipos} dias={dias ?? []} personas={personas ?? []}
        alCerrar={() => setMarcar(false)} alGuardar={() => { setMarcar(false); setElegidos(new Set()); cargar(); }} />}
      {copiar && <Copiar anio={anio} equipo={equipo} equipos={equipos} alCerrar={() => setCopiar(false)} alGuardar={() => { setCopiar(false); cargar(); }} />}
    </>
  );
}

/** Agrupa fechas sueltas en periodos seguidos: [1,2,3,7] → 1–3 y 7. */
function periodos(fechas: string[]) {
  const dia = (f: string) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) / 864e5; };
  const out: { desde: string; hasta: string }[] = [];
  for (const f of [...fechas].sort()) {
    const ult = out[out.length - 1];
    if (ult && dia(f) - dia(ult.hasta) === 1) ult.hasta = f; else out.push({ desde: f, hasta: f });
  }
  return out;
}

function Marcar({ fechas, equipo, equipos, dias, personas, alCerrar, alGuardar }: {
  fechas: string[]; equipo: Equipo; equipos: Equipo[]; dias: Dia[]; personas: Persona[]; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa, puede } = useSesion();
  const uno = fechas.length === 1 ? dias.find((d) => d.fecha === fechas[0]) : undefined;
  const conDias = puede('personal.calendario.editar'), conVacaciones = puede('personal.vacaciones.editar');
  const [tipo, setTipo] = useState<TipoDia | '' | 'vacaciones'>(uno?.tipo ?? (conDias ? 'festivo' : 'vacaciones'));
  const [quien, setQuien] = useState<Set<string>>(new Set(personas.map((p) => p.id)));
  const [nombre, setNombre] = useState(uno?.nombre ?? '');
  const [horario, setHorario] = useState(uno?.horario ?? '');
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setOcupado(true); setError(null);
    if (tipo === 'vacaciones') {
      if (!quien.size) { setOcupado(false); setError('Elige a quién.'); return; }
      const filas = [...quien].flatMap((pid) => periodos(fechas).map((r) => ({ ...r, nota: nombre.trim() || null, empresa_id: empresa!.id, persona_id: pid })));
      const { error } = await personal().from('vacaciones').insert(filas);
      setOcupado(false);
      if (error) { setError(textoError(error.message)); return; }
      aviso(quien.size === 1 ? 'Vacaciones puestas' : `Vacaciones puestas a ${quien.size} trabajadores`); alGuardar();
      return;
    }
    const { error } = await personal().rpc('marcar_dias', {
      p_calendarios: todos ? equipos.map((e) => e.id) : [equipo.id], p_fechas: fechas,
      p_tipo: tipo || null, p_nombre: nombre || null, p_horario: ['intensiva', 'especial', 'trabaja'].includes(tipo) ? horario || null : null,
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso(tipo ? 'Días marcados' : 'Marcas quitadas'); alGuardar();
  }

  return (
    <Ventana titulo={fechas.length === 1 ? fechaCorta(fechas[0]) : `${fechas.length} días`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={guardar}>{tipo === 'vacaciones' ? 'Poner vacaciones' : tipo ? 'Marcar' : 'Quitar la marca'}</button></>}>
      <fieldset className="formulario">
        <legend className="nota" style={{ marginBottom: 8 }}>Tipo de día</legend>
        <div className="opciones">
          {conVacaciones && (
            <label className={'opcion' + (tipo === 'vacaciones' ? ' sel' : '')}>
              <input type="radio" name="tipo" checked={tipo === 'vacaciones'} onChange={() => setTipo('vacaciones')} />
              <i className="t-vacaciones" /><span><b>Vacaciones</b><small>Para todos los de este calendario o solo para algunos</small></span></label>)}
          {conDias && TIPOS.map((t) => (
            <label key={t.tipo} className={'opcion' + (tipo === t.tipo ? ' sel' : '')}>
              <input type="radio" name="tipo" checked={tipo === t.tipo} onChange={() => setTipo(t.tipo)} />
              <i className={'t-' + t.tipo} /><span><b>{t.nombre}</b><small>{t.ayuda}</small></span></label>
          ))}
          {conDias && <label className={'opcion' + (tipo === '' ? ' sel' : '')}>
            <input type="radio" name="tipo" checked={tipo === ''} onChange={() => setTipo('')} />
            <i /><span><b>Normal</b><small>Quitar la marca</small></span></label>}
        </div>
      </fieldset>
      {tipo === 'vacaciones' && (
        <>
          <p className="nota" style={{ margin: '0 0 6px' }}>¿Quién? ({quien.size} de {personas.length})</p>
          <div className="lista compacta" style={{ marginBottom: 12 }}>
            {personas.map((p) => (
              <label key={p.id} className="fila check">
                <input type="checkbox" checked={quien.has(p.id)} onChange={() => setQuien((q) => { const n = new Set(q); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                <span className="fila-txt"><b>{p.nombre}</b></span>
              </label>
            ))}
          </div>
          <label className="campo"><span>Nota (opcional)</span><input value={nombre} maxLength={200} placeholder="Por ejemplo: Verano" onChange={(e) => setNombre(e.target.value)} /></label>
          <p className="nota">Para cambiar o quitar las vacaciones de alguien, ve a la pestaña Vacaciones.</p>
        </>
      )}
      {tipo && tipo !== 'vacaciones' && <label className="campo"><span>Nombre (opcional)</span>
        <input value={nombre} maxLength={120} placeholder={tipo === 'festivo' ? 'Por ejemplo: Fiesta local' : ''} onChange={(e) => setNombre(e.target.value)} /></label>}
      {['intensiva', 'especial', 'trabaja'].includes(tipo) && <label className="campo"><span>Horario</span>
        <input value={horario} maxLength={120} placeholder="Por ejemplo: 7:00 a 15:00" onChange={(e) => setHorario(e.target.value)} /></label>}
      {tipo !== 'vacaciones' && equipos.length > 1 && <label className="check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
        También en {equipos.filter((e) => e.id !== equipo.id).map((e) => e.nombre).join(' y ')}</label>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

function Copiar({ anio, equipo, equipos, alCerrar, alGuardar }: { anio: number; equipo: Equipo; equipos: Equipo[]; alCerrar: () => void; alGuardar: () => void }) {
  const otros = equipos.filter((e) => e.id !== equipo.id);
  const [de, setDe] = useState(otros[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  async function copiar() {
    const { data, error } = await personal().rpc('copiar_dias', { p_de: de, p_a: equipo.id });
    if (error) { setError(textoError(error.message)); return; }
    aviso(`${data} días copiados`); alGuardar();
  }
  return (
    <Ventana titulo={`Copiar ${anio} a ${equipo.nombre}`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={copiar}>Copiar</button></>}>
      <label className="campo"><span>Copiar los días marcados de</span>
        <select value={de} onChange={(e) => setDe(e.target.value)}>{otros.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
      <p className="nota">Lo que ya tenga marcado «{equipo.nombre}» se sustituye.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Vacaciones
// ---------------------------------------------------------------------------------------------
function usePersonasEquipo(equipo: Equipo) {
  const { empresa } = useSesion();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  useEffect(() => {
    nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa!.id).is('baja', null).order('nombre')
      .then(({ data }) => setPersonas(((data ?? []) as Persona[]).filter((p) => equipo.personas.includes(p.id))));
  }, [empresa, equipo]);
  return personas;
}

function Vacaciones({ anio, equipo }: { anio: number; equipo: Equipo }) {
  const { empresa, puede } = useSesion();
  const personas = usePersonasEquipo(equipo);
  const [vacs, setVacs] = useState<Vacacion[]>([]);
  const [editando, setEditando] = useState<Partial<Vacacion> | null>(null);
  const editable = puede('personal.vacaciones.editar');

  const cargar = useCallback(async () => {
    const { data } = await personal().from('vacaciones').select('id, persona_id, desde, hasta, nota')
      .eq('empresa_id', empresa!.id).lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).order('desde');
    setVacs((data ?? []) as Vacacion[]);
  }, [empresa, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  if (personas === null) return <p className="nota">Cargando…</p>;
  if (!personas.length) return <div className="vacio"><p>Nadie va en «{equipo.nombre}». Pulsa «Para 0 personas · cambiar» para elegir para quién es.</p></div>;
  return (
    <>
      {editable && <button type="button" className="boton sec ancho" style={{ marginBottom: 12 }} onClick={() => setEditando({ persona_id: '*' })}>
        Vacaciones para todo {equipo.nombre}</button>}
      <div className="lista">
        {personas.map((p) => {
          const suyas = vacs.filter((v) => v.persona_id === p.id);
          return (
            <div key={p.id} className="fila fija">
              <span className="fila-txt">
                <b>{p.nombre}</b>
                {suyas.length === 0 && <small>Sin vacaciones en {anio}</small>}
                {suyas.map((v) => (
                  <span key={v.id} className="rol-linea"><span>{periodo(v)}{v.nota ? ` · ${v.nota}` : ''}</span>
                    {editable && <button type="button" className="boton txt" onClick={() => setEditando(v)}>Cambiar</button>}</span>
                ))}
              </span>
              {editable && <button type="button" className="boton sec peq" aria-label={`Añadir vacaciones a ${p.nombre}`} onClick={() => setEditando({ persona_id: p.id })}>Añadir</button>}
            </div>
          );
        })}
      </div>
      {editando && <FormVacacion v={editando} equipo={equipo} personas={editando.persona_id === '*' ? personas : personas.filter((p) => p.id === editando.persona_id)} alCerrar={() => setEditando(null)}
        alGuardar={() => { setEditando(null); cargar(); }} />}
    </>
  );
}

/** Vacaciones de un trabajador o, con varios, las mismas fechas para todos (cada uno queda con las suyas y se pueden cambiar sueltas). */
function FormVacacion({ v, equipo, personas, alCerrar, alGuardar }: { v: Partial<Vacacion>; equipo: Equipo; personas: Persona[]; alCerrar: () => void; alGuardar: () => void }) {
  const persona = personas[0];
  const todos = personas.length > 1;
  const { empresa } = useSesion();
  const [desde, setDesde] = useState(v.desde ?? '');
  const [hasta, setHasta] = useState(v.hasta ?? '');
  const [nota, setNota] = useState(v.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    if (!desde || !hasta) { setError('Pon las dos fechas.'); return; }
    if (hasta < desde) { setError('«Hasta» no puede ser antes de «Desde».'); return; }
    const fila = { desde, hasta, nota: nota.trim() || null };
    const { error } = v.id ? await personal().from('vacaciones').update(fila).eq('id', v.id)
      : await personal().from('vacaciones').insert(personas.map((p) => ({ ...fila, empresa_id: empresa!.id, persona_id: p.id })));
    if (error) { setError(textoError(error.message)); return; }
    aviso(todos ? `Vacaciones puestas a ${personas.length} trabajadores` : 'Vacaciones guardadas'); alGuardar();
  }
  async function quitar() {
    if (!confirm(`¿Quitar estas vacaciones de ${persona.nombre}?`)) return;
    const { error } = await personal().from('vacaciones').delete().eq('id', v.id!);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Vacaciones quitadas'); alGuardar();
  }
  return (
    <Ventana titulo={`Vacaciones · ${todos ? 'todo ' + equipo.nombre : persona.nombre}`} alCerrar={alCerrar}
      pie={<>{v.id && <button type="button" className="boton sec" onClick={quitar}>Quitar</button>}<button type="button" className="boton" onClick={guardar}>Guardar</button></>}>
      <div className="dos">
        <label className="campo"><span>Desde</span><input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); if (!hasta) setHasta(e.target.value); }} /></label>
        <label className="campo"><span>Hasta (incluido)</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      <label className="campo"><span>Nota (opcional)</span><input value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} /></label>
      {todos && <p className="nota">Se pone a los {personas.length} de {equipo.nombre}. Luego puedes cambiarlas o quitarlas a cada uno por separado.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------------------------------------------------------------------------------------------
// Firmas: enviar el calendario a firmar y ver quién ha firmado
// ---------------------------------------------------------------------------------------------
function Firmas({ anio, equipo }: { anio: number; equipo: Equipo }) {
  const { empresa, puede } = useSesion();
  const personas = usePersonasEquipo(equipo);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [viendo, setViendo] = useState<Envio | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = puede('personal.firma.enviar');

  const cargar = useCallback(async () => {
    const { data, error } = await personal().from('v_envios').select('*').eq('empresa_id', empresa!.id).eq('anio', anio).eq('calendario_id', equipo.id).order('enviado', { ascending: false });
    if (error) { aviso(error.message); return; }
    setEnvios((data ?? []) as Envio[]);
  }, [empresa, anio, equipo]);
  useEffect(() => { cargar(); }, [cargar]);

  // el envío que cuenta de cada uno: el más nuevo sin anular
  const vigente = useMemo(() => new Map(personas?.map((p) => [p.id, envios.find((e) => e.persona_id === p.id && e.estado !== 'anulado')]) ?? []), [personas, envios]);
  if (personas === null) return <p className="nota">Cargando…</p>;
  const firmados = personas.filter((p) => vigente.get(p.id)?.estado === 'firmado').length;

  async function mandar() {
    const ya = [...elegidos].filter((id) => vigente.get(id)?.estado === 'firmado');
    if (ya.length && !confirm(`${ya.length} ya lo ${ya.length === 1 ? 'ha' : 'han'} firmado. ¿Enviar otra vez el calendario de ${anio}?`)) return;
    setOcupado(true);
    const { data, error } = await personal().rpc('enviar_calendario', { p_calendario: equipo.id, p_personas: [...elegidos] });
    setOcupado(false);
    if (error) { aviso(textoError(error.message)); return; }
    aviso(`Enviado a ${data} ${data === 1 ? 'trabajador' : 'trabajadores'}`); setElegidos(new Set()); cargar();
  }
  async function anular(e: Envio) {
    if (!confirm('¿Anular este envío? Ya no se podrá firmar.')) return;
    const { error } = await personal().rpc('anular_envio', { p_envio: e.id });
    if (error) { aviso(textoError(error.message)); return; }
    aviso('Envío anulado'); setViendo(null); cargar();
  }

  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Han firmado <b>{firmados}</b> de {personas.length}.
        {enviar && ' Elige a quién enviar el calendario de ' + anio + ' para que lo firme.'}</p>
      <div className="lista">
        {personas.map((p) => {
          const e = vigente.get(p.id);
          return (
            <div key={p.id} className="fila fija centrada">
              {enviar && <input type="checkbox" className="marca" aria-label={`Elegir a ${p.nombre}`} checked={elegidos.has(p.id)}
                onChange={() => setElegidos((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />}
              <span className="fila-txt"><b>{p.nombre}</b>
                <small>{!e ? 'Sin enviar' : e.estado === 'pendiente' ? `Pendiente de firma · enviado el ${fechaCorta(e.enviado.slice(0, 10))}`
                  : `Firmado el ${fechaCorta(e.firmado_en!.slice(0, 10))}${e.conforme ? ' · conforme' : ' · con observaciones'}`}</small></span>
              <span className={'chapa ' + (e?.estado ?? 'sin')}>{!e ? 'Sin enviar' : e.estado === 'firmado' ? 'Firmado' : 'Pendiente'}</span>
              {e && <button type="button" className="boton txt peq" onClick={() => setViendo(e)}>Ver</button>}
            </div>
          );
        })}
      </div>
      {enviar && (
        <div className="botonera no-imprimir">
          <button type="button" className="boton txt" onClick={() => setElegidos(new Set(personas.filter((p) => !vigente.get(p.id)).map((p) => p.id)))}>Elegir los que faltan</button>
          <button type="button" className="boton" disabled={!elegidos.size || ocupado} onClick={mandar}>Enviar a firmar{elegidos.size ? ` (${elegidos.size})` : ''}</button>
        </div>
      )}
      {viendo && <Documento envio={viendo} alCerrar={() => setViendo(null)} alFirmar={() => { setViendo(null); cargar(); }}
        alAnular={enviar && viendo.estado === 'pendiente' ? () => anular(viendo) : undefined} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Mi calendario: lo que me han enviado, firmar
// ---------------------------------------------------------------------------------------------
function MiCalendario() {
  const { empresa, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [sinFicha, setSinFicha] = useState(false);
  const [viendo, setViendo] = useState<Envio | null>(null);

  const cargar = useCallback(async () => {
    const { data: u } = await nucleo().from('usuarios').select('persona_id').eq('id', yo!).maybeSingle();
    const persona = (u as { persona_id: string | null } | null)?.persona_id;
    if (!persona) { setSinFicha(true); setEnvios([]); return; }
    const { data } = await personal().from('v_envios').select('*').eq('empresa_id', empresa!.id).eq('persona_id', persona).neq('estado', 'anulado')
      .order('anio', { ascending: false });
    setEnvios((data ?? []) as Envio[]);
  }, [empresa, yo]);
  useEffect(() => { cargar(); }, [cargar]);

  if (envios === null) return <p className="nota">Cargando…</p>;
  if (sinFicha) return <div className="vacio"><p><b>Tu usuario no está enlazado con tu ficha de trabajador.</b></p><p>Pídeselo a tu administrador (Configuración → Usuarios).</p></div>;
  if (!envios.length) return <div className="vacio"><p>Todavía no te han enviado ningún calendario laboral.</p></div>;
  const pendientes = envios.filter((e) => e.estado === 'pendiente');
  return (
    <>
      {pendientes.length > 0 && <p className="aviso-linea">Tienes {pendientes.length === 1 ? 'un calendario' : `${pendientes.length} calendarios`} por revisar y firmar.</p>}
      <div className="lista">
        {envios.map((e) => (
          <button key={e.id} type="button" className="fila" onClick={() => setViendo(e)}>
            <span className="fila-txt"><b>Calendario laboral {e.anio}</b><small>{e.datos.calendario ?? e.datos.equipo} · {e.estado === 'firmado' ? `firmado el ${fechaCorta(e.firmado_en!.slice(0, 10))}` : 'pendiente de firma'}</small></span>
            <span className={'chapa ' + e.estado}>{e.estado === 'firmado' ? 'Firmado' : 'Firmar'}</span>
          </button>
        ))}
      </div>
      {viendo && <Documento envio={viendo} alCerrar={() => setViendo(null)} alFirmar={() => { setViendo(null); cargar(); }} />}
    </>
  );
}

/** El calendario tal como se envió (la foto), con su firma o para firmarlo. También sirve para imprimir o guardar en PDF. */
function Documento({ envio, alCerrar, alFirmar, alAnular }: { envio: Envio; alCerrar: () => void; alFirmar: () => void; alAnular?: () => void }) {
  const { estado } = useSesion();
  const d = envio.datos;
  const [firmando, setFirmando] = useState(false);
  const [conforme, setConforme] = useState(true);
  const [comentario, setComentario] = useState('');
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
  const puedeFirmar = envio.estado === 'pendiente';
  const totalVac = d.vacaciones.reduce((n, v) => n + (Date.parse(v.hasta) - Date.parse(v.desde)) / 864e5 + 1, 0);

  async function firmar() {
    setError(null);
    if (!png) { setError('Falta la firma.'); return; }
    if (!conforme && !comentario.trim()) { setError('Explica qué no está bien.'); return; }
    setOcupado(true);
    const { error } = await personal().rpc('firmar_calendario', {
      p_envio: envio.id, p_conforme: conforme, p_comentario: comentario.trim() || null, p_imagen: png,
      p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Calendario firmado'); alFirmar();
  }

  return (
    <Ventana titulo={`Calendario laboral ${d.anio}`} alCerrar={alCerrar}
      pie={firmando
        ? <><button type="button" className="boton sec" onClick={() => setFirmando(false)}>Atrás</button><button type="button" className="boton" disabled={ocupado} onClick={firmar}>Firmar</button></>
        : <>{alAnular && <button type="button" className="boton sec" onClick={alAnular}>Anular</button>}
          <button type="button" className="boton sec" onClick={() => window.print()}>Imprimir o PDF</button>
          {puedeFirmar && <button type="button" className="boton" onClick={() => setFirmando(true)}>Firmar</button>}</>}>
      <div className="documento">
        <p className="doc-cab"><b>{d.unidad}</b> · Calendario laboral {d.anio}<br />{d.trabajador} · {d.calendario ?? d.equipo}</p>
        {!firmando ? (
          <>
            <Leyenda />
            <Anio anio={d.anio} dias={d.dias} vacaciones={d.vacaciones} diasEquipo={d.dias_equipo} />
            <h3 className="subtitulo">Días especiales</h3>
            <ListaDias dias={d.dias} />
            <h3 className="subtitulo">Tus vacaciones{totalVac ? ` (${totalVac} días)` : ''}</h3>
            {d.vacaciones.length ? <ul className="lista-dias">{d.vacaciones.map((v) => <li key={v.desde}><i className="t-vacaciones" /><span>{periodo(v)}{v.nota ? ` · ${v.nota}` : ''}</span></li>)}</ul>
              : <p className="nota">No tienes vacaciones apuntadas este año.</p>}
            {envio.estado === 'firmado' && (
              <div className="firmado">
                <p><b>{envio.conforme ? 'Recibido y conforme' : 'Recibido con observaciones'}</b> · {new Date(envio.firmado_en!).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</p>
                {envio.comentario && <p>«{envio.comentario}»</p>}
                {envio.firma_imagen && <img src={envio.firma_imagen} alt={`Firma de ${d.trabajador}`} />}
                <p className="nota romper">Huella del documento: {envio.sha256}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="segmentos" role="group" aria-label="¿Estás conforme?">
              <button type="button" aria-pressed={conforme} onClick={() => setConforme(true)}>Conforme</button>
              <button type="button" aria-pressed={!conforme} onClick={() => setConforme(false)}>Con observaciones</button>
            </div>
            {!conforme && <label className="campo"><span>¿Qué no está bien?</span><textarea rows={3} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></label>}
            <p className="nota" style={{ marginBottom: 8 }}>Firmo que he recibido mi calendario laboral de {d.anio}{conforme ? ' y estoy conforme.' : ' con las observaciones de arriba.'}</p>
            <Firma alCambiar={setPng} />
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </Ventana>
  );
}

