import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { PorOperario } from './PorOperario';
import {
  Anio, fechaCorta, Leyenda, ListaDias, periodo, personal, textoError,
  type Dia, type Vacacion,
} from './calendario';

/** Un calendario del año (nombre, días de la semana que se trabaja y quién va en él). */
interface Equipo { id: string; nombre: string; dias: number[]; personas: string[]; horas_dia: number[] | null; horas_anuales: number | null }
interface Horas { persona_id: string; nombre: string; objetivo: number | null; horas: number; vacaciones: number }
const fmtH = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
interface Persona { id: string; nombre: string; baja?: string | null }
interface Envio {
  id: string; anio: number; calendario_id: string; persona_id: string; enviado: string; anulado: string | null;
  estado: 'pendiente' | 'firmado' | 'anulado'; firmado_en: string | null; conforme: boolean | null; comentario: string | null;
  firma_imagen: string | null; sha256: string;
  datos: { anio: number; unidad: string; calendario?: string; equipo: string; trabajador: string; dias_equipo: number[] | null; dias: Dia[]; vacaciones: Vacacion[];
    horas_anuales?: number | null; horas?: number | null };
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
      personal().from('calendarios').select('id, nombre, dias_semana, horas_dia, horas_anuales').eq('empresa_id', empresa!.id).eq('anio', anio).order('nombre'),
      personal().from('calendario_personas').select('persona_id, calendario_id').eq('empresa_id', empresa!.id).eq('anio', anio),
    ]);
    const miembros = (cp.data ?? []) as { persona_id: string; calendario_id: string }[];
    // primero el que empieza antes la semana (lunes), luego el de fin de semana
    const primerDia = (d: number[]) => Math.min(...d.map((x) => (x + 6) % 7), 7);
    setCals(((c.data ?? []) as { id: string; nombre: string; dias_semana: number[]; horas_dia: number[] | null; horas_anuales: number | null }[])
      .map((x) => ({ id: x.id, nombre: x.nombre, dias: x.dias_semana, horas_dia: x.horas_dia, horas_anuales: x.horas_anuales,
        personas: miembros.filter((m) => m.calendario_id === x.id).map((m) => m.persona_id) }))
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
        {!!cals?.length && actual !== 'calendario' && <label className="campo"><span>Calendario</span>
          <select value={calId} onChange={(e) => { setCalId(e.target.value); guardar('personal.calendario.' + anio, e.target.value); }}>
            {cals.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>}
      </div>
      {cal && actual !== 'calendario' && (
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
      {actual !== 'mio' && actual !== 'calendario' && cals?.length === 0 && (
        <div className="vacio"><p><b>Todavía no hay calendarios de {anio}.</b></p>
          <p>Crea uno para cada grupo de gente que trabaja igual (por ejemplo «Semana {anio}» y «Fin de semana {anio}»).</p>
          {editable && <button type="button" className="boton" onClick={() => setEditando('nuevo')}>Crear calendario</button>}</div>)}
      {actual === 'mio' && <MiCalendario />}
      {actual === 'calendario' && cals && <PorOperario key={anio} anio={anio} cals={cals} recargar={recargar} />}
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
  // horas de un día normal por día de la semana (índice 0 = domingo); vacío = no se trabaja
  const [horasDia, setHorasDia] = useState<string[]>(() => [0, 1, 2, 3, 4, 5, 6].map((d) =>
    cal?.horas_dia ? (cal.horas_dia[d] ? String(cal.horas_dia[d]).replace('.', ',') : '') : (cal ? cal.dias : [1, 2, 3, 4, 5]).includes(d) ? '8' : ''));
  const [anuales, setAnuales] = useState(cal?.horas_anuales != null ? String(cal.horas_anuales).replace('.', ',') : '');
  const [quien, setQuien] = useState<Set<string>>(new Set(cal?.personas ?? []));
  const [copiarDe, setCopiarDe] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enOtro = (pid: string) => cals.find((c) => c.id !== cal?.id && c.personas.includes(pid));
  const cambia = personas.filter((p) => quien.has(p.id) && enOtro(p.id)).length;

  async function guardarCal() {
    if (!nombre.trim()) { setError('Ponle un nombre.'); return; }
    const num = (x: string) => (x.trim() === '' ? 0 : Number(x.replace(',', '.')));
    const hd = horasDia.map(num);
    if (hd.some((h) => Number.isNaN(h) || h < 0 || h > 24)) { setError('Las horas de cada día tienen que ser un número entre 0 y 24.'); return; }
    if (!hd.some((h) => h > 0)) { setError('Pon las horas de los días que se trabaja.'); return; }
    const ha = anuales.trim() === '' ? null : num(anuales);
    if (ha !== null && (Number.isNaN(ha) || ha < 0 || ha > 4000)) { setError('Las horas al año no están bien escritas.'); return; }
    // quien sale de este calendario se queda sin calendario del año: avisar con nombres antes de hacerlo
    const salen = (cal?.personas ?? []).filter((id) => !quien.has(id)).map((id) => personas.find((p) => p.id === id)?.nombre ?? 'alguien');
    if (salen.length && !confirm(`Vas a quitar de «${cal!.nombre}» a ${salen.length === 1 ? salen[0] : `${salen.length} personas (${salen.join(', ')})`}. `
      + `${salen.length === 1 ? 'Se quedará' : 'Se quedarán'} sin calendario de ${anio}. ¿Seguir?`)) return;
    setOcupado(true); setError(null);
    const fila = { nombre: nombre.trim(), dias_semana: [0, 1, 2, 3, 4, 5, 6].filter((d) => hd[d] > 0), horas_dia: hd, horas_anuales: ha };
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
      <div className="campo"><span>Horas de un día normal (vacío = no se trabaja)</span>
        <div className="horas-semana" role="group" aria-label="Horas de un día normal">
          {DIAS_SEMANA.map(([d, l]) => <label key={d}><small>{l}</small>
            <input inputMode="decimal" aria-label={`Horas del ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d]}`} value={horasDia[d]}
              onChange={(e) => setHorasDia((x) => x.map((y, i) => (i === d ? e.target.value : y)))} /></label>)}
        </div></div>
      <label className="campo"><span>Horas que hay que trabajar al año</span>
        <input inputMode="decimal" value={anuales} placeholder="Por ejemplo: 1712" onChange={(e) => setAnuales(e.target.value)} />
        <span className="nota">A quien tenga otras (jornada parcial…), se las pones luego en el cuadro de horas.</span></label>
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
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [horas, setHoras] = useState<Horas[]>([]);
  const [otrasHoras, setOtrasHoras] = useState<Horas | null>(null);
  const cargarHoras = useCallback(async () => {
    const h = await personal().rpc('horas_personas', { p_calendario: equipo.id });
    setHoras((h.data ?? []) as Horas[]);
  }, [equipo]);
  useEffect(() => { cargarHoras(); }, [cargarHoras]);
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
    if (error) {
      const m = error.message.match(/(NO_CUADRA|SIN_HORAS): (.*)/);
      setErrorEnvio(m ? (m[1] === 'NO_CUADRA' ? `No se puede enviar: no cuadran las horas de ${m[2]}. Míralo en la pestaña Calendario.`
        : `No se puede enviar: faltan las horas al año de ${m[2]}. Ponlas en el calendario («Para N personas · cambiar»).`) : textoError(error.message));
      return;
    }
    setErrorEnvio(null);
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
      <CuadroHoras cal={equipo} horas={horas} editable={puede('personal.calendario.editar')} alCambiar={setOtrasHoras} />
      {otrasHoras && <OtrasHoras cal={equipo} h={otrasHoras} alCerrar={() => setOtrasHoras(null)} alGuardar={() => { setOtrasHoras(null); cargarHoras(); }} />}
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
      {errorEnvio && <p className="error" role="alert">{errorEnvio}</p>}
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
        <p className="doc-cab"><b>{d.unidad}</b> · Calendario laboral {d.anio}<br />{d.trabajador} · {d.calendario ?? d.equipo}
          {d.horas_anuales != null && <><br />Horas de trabajo al año: <b>{fmtH(d.horas ?? 0)} h</b> (de {fmtH(d.horas_anuales)} h)</>}</p>
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


/** Cuadro de horas: lo que sale a cada persona frente a lo que tiene que hacer al año. */
function CuadroHoras({ cal, horas, editable, alCambiar }: { cal: Equipo; horas: Horas[]; editable: boolean; alCambiar: (h: Horas) => void }) {
  if (!horas.length) return null;
  const mal = horas.filter((h) => h.objetivo == null || Math.abs(h.horas - h.objetivo) > 0.005).length;
  return (
    <section className="horas" aria-label="Horas del año">
      <h2 className="subtitulo" style={{ marginTop: 0 }}>Horas del año {mal ? <span className="chapa sin-cuadrar">{mal} sin cuadrar</span> : <span className="chapa firmado">Todo cuadra</span>}</h2>
      {cal.horas_anuales == null && <p className="nota" style={{ marginTop: 0 }}>Este calendario aún no tiene las horas al año («Para N personas · cambiar»).</p>}
      <div className="lista">
        {horas.map((h) => {
          const dif = h.objetivo == null ? null : Math.round((h.horas - h.objetivo) * 100) / 100;
          return (
            <div key={h.persona_id} className="fila fija centrada">
              <span className="fila-txt"><b>{h.nombre}</b>
                <small>{fmtH(h.horas)} h{h.objetivo != null ? ` de ${fmtH(h.objetivo)} h` : ''}{h.vacaciones ? ` · ${h.vacaciones} días de vacaciones` : ''}
                  {h.objetivo != null && cal.horas_anuales != null && h.objetivo !== cal.horas_anuales ? ' · horas propias' : ''}</small></span>
              <span className={'chapa ' + (dif === 0 ? 'firmado' : 'sin-cuadrar')}>{dif === null ? 'Sin horas' : dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${fmtH(-dif)} h` : `Sobran ${fmtH(dif)} h`}</span>
              {editable && <button type="button" className="boton txt peq" onClick={() => alCambiar(h)}>Otras horas</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Horas al año propias de una persona (si no son las del calendario). */
function OtrasHoras({ cal, h, alCerrar, alGuardar }: { cal: Equipo; h: Horas; alCerrar: () => void; alGuardar: () => void }) {
  const propias = h.objetivo != null && h.objetivo !== cal.horas_anuales;
  const [v, setV] = useState(propias ? String(h.objetivo).replace('.', ',') : '');
  const [error, setError] = useState<string | null>(null);
  async function guardar(valor: string) {
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
    if (n !== null && (Number.isNaN(n) || n < 0 || n > 4000)) { setError('No es un número de horas válido.'); return; }
    const { error } = await personal().from('calendario_personas').update({ horas_anuales: n }).eq('calendario_id', cal.id).eq('persona_id', h.persona_id);
    if (error) { setError(textoError(error.message)); return; }
    aviso('Horas guardadas'); alGuardar();
  }
  return (
    <Ventana titulo={`Horas al año · ${h.nombre}`} alCerrar={alCerrar}
      pie={<>{propias && <button type="button" className="boton sec" onClick={() => guardar('')}>Usar las del calendario</button>}
        <button type="button" className="boton" onClick={() => guardar(v)}>Guardar</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Las del calendario son {cal.horas_anuales != null ? `${fmtH(cal.horas_anuales)} h` : 'ninguna todavía'}. Pon aquí las suyas si son otras (por ejemplo, jornada parcial).</p>
      <label className="campo"><span>Sus horas al año</span><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
