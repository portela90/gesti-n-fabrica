import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import {
  Anio, fechaCorta, Leyenda, ListaDias, periodo, personal, textoError, TIPOS,
  type Dia, type TipoDia, type Vacacion,
} from './calendario';

interface Equipo { id: string; nombre: string; dias: number[] }
interface Persona { id: string; nombre: string; equipo_id: string | null }
interface Envio {
  id: string; anio: number; equipo_id: string; persona_id: string; enviado: string; anulado: string | null;
  estado: 'pendiente' | 'firmado' | 'anulado'; firmado_en: string | null; conforme: boolean | null; comentario: string | null;
  firma_imagen: string | null; sha256: string;
  datos: { anio: number; unidad: string; equipo: string; trabajador: string; dias_equipo: number[] | null; dias: Dia[]; vacaciones: Vacacion[] };
}

type Pestana = 'mio' | 'calendario' | 'vacaciones' | 'firmas';
const ANIO_ACTUAL = new Date().getFullYear();

/** Módulo Personal: mi calendario (todos) y, según permisos, calendario por equipo, vacaciones y firmas. */
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
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [equipoId, setEquipoId] = useState<string>('');

  useEffect(() => {
    if (!empresa) return;
    nucleo().from('equipos').select('id, nombre, dias, baja').eq('empresa_id', empresa.id).is('baja', null).order('nombre')
      .then(({ data }) => {
        // primero el equipo que empieza antes la semana (lunes), luego el de fin de semana
        const primerDia = (e: Equipo) => Math.min(...(e.dias ?? []).map((d) => (d + 6) % 7), 7);
        const eq = ((data ?? []) as Equipo[]).sort((a, b) => primerDia(a) - primerDia(b) || a.nombre.localeCompare(b.nombre, 'es'));
        let guardado: string | null = null;
        try { guardado = localStorage.getItem('personal.equipo'); } catch { /* sin almacenamiento */ }
        setEquipos(eq); setEquipoId((x) => x || eq.find((e) => e.id === guardado)?.id || eq[0]?.id || '');
      });
  }, [empresa]);

  if (!empresa) return null;
  const equipo = equipos.find((e) => e.id === equipoId) ?? null;
  const elegirAnioEquipo = actual !== 'mio' && (
    <div className="filtros">
      <label className="campo"><span>Año</span>
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
          {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map((a) => <option key={a}>{a}</option>)}
        </select></label>
      <label className="campo"><span>Equipo</span>
        <select value={equipoId} onChange={(e) => { setEquipoId(e.target.value); try { localStorage.setItem('personal.equipo', e.target.value); } catch { /* */ } }}>
          {equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select></label>
    </div>
  );

  return (
    <main className="contenido" style={{ ['--area' as string]: '#9a3412' }}>
      {pestanas.length > 1 && (
        <nav className="pestanas no-imprimir" aria-label="Personal">
          {pestanas.map(([c, n]) => <button key={c} type="button" aria-pressed={actual === c} onClick={() => ir(`/m/personal/${c}`)}>{n}</button>)}
        </nav>
      )}
      {elegirAnioEquipo}
      {actual !== 'mio' && !equipos.length && (
        <div className="vacio"><p><b>No hay equipos.</b></p><p>Da de alta los equipos (por ejemplo «Semana» y «Fin de semana») en Configuración → Equipos.</p></div>)}
      {actual === 'mio' && <MiCalendario />}
      {actual === 'calendario' && equipo && <Calendario key={equipo.id + anio} anio={anio} equipo={equipo} equipos={equipos} />}
      {actual === 'vacaciones' && equipo && <Vacaciones key={equipo.id + anio} anio={anio} equipo={equipo} />}
      {actual === 'firmas' && equipo && <Firmas key={equipo.id + anio} anio={anio} equipo={equipo} />}
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendario del equipo: marcar festivos, cierres, intensiva y horarios especiales
// ---------------------------------------------------------------------------------------------
function Calendario({ anio, equipo, equipos }: { anio: number; equipo: Equipo; equipos: Equipo[] }) {
  const { empresa, puede } = useSesion();
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [marcar, setMarcar] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const editable = puede('personal.calendario.editar');

  const cargar = useCallback(async () => {
    const { data, error } = await personal().from('dias').select('fecha, tipo, nombre, horario')
      .eq('empresa_id', empresa!.id).eq('equipo_id', equipo.id).gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha');
    if (error) { aviso(error.message); return; }
    setDias((data ?? []) as Dia[]);
  }, [empresa, equipo, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  const tocar = (f: string) => setElegidos((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const cuenta = (t: TipoDia) => (dias ?? []).filter((d) => d.tipo === t).length;

  return (
    <>
      <div className="cifras-linea">
        {TIPOS.map((t) => <span key={t.tipo}><i className={'t-' + t.tipo} /> {t.nombre}: <b>{cuenta(t.tipo)}</b></span>)}
      </div>
      {editable && (
        <p className="nota no-imprimir">Toca los días para elegirlos y pulsa «Marcar». {equipos.length > 1 &&
          <button type="button" className="boton txt peq" onClick={() => setCopiar(true)}>Copiar de otro equipo</button>}</p>)}
      <Leyenda conVacaciones={false} />
      {dias === null ? <p className="nota">Cargando…</p>
        : <Anio anio={anio} dias={dias} diasEquipo={equipo.dias} elegidos={editable ? elegidos : undefined} alTocar={editable ? tocar : undefined} />}
      <h2 className="subtitulo">Días marcados</h2>
      <ListaDias dias={dias ?? []} />
      {editable && elegidos.size > 0 && (
        <div className="barra-abajo no-imprimir">
          <span><b>{elegidos.size}</b> {elegidos.size === 1 ? 'día elegido' : 'días elegidos'}</span>
          <button type="button" className="boton txt" onClick={() => setElegidos(new Set())}>Quitar</button>
          <button type="button" className="boton" onClick={() => setMarcar(true)}>Marcar</button>
        </div>
      )}
      {marcar && <Marcar fechas={[...elegidos].sort()} equipo={equipo} equipos={equipos} dias={dias ?? []}
        alCerrar={() => setMarcar(false)} alGuardar={() => { setMarcar(false); setElegidos(new Set()); cargar(); }} />}
      {copiar && <Copiar anio={anio} equipo={equipo} equipos={equipos} alCerrar={() => setCopiar(false)} alGuardar={() => { setCopiar(false); cargar(); }} />}
    </>
  );
}

function Marcar({ fechas, equipo, equipos, dias, alCerrar, alGuardar }: {
  fechas: string[]; equipo: Equipo; equipos: Equipo[]; dias: Dia[]; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const uno = fechas.length === 1 ? dias.find((d) => d.fecha === fechas[0]) : undefined;
  const [tipo, setTipo] = useState<TipoDia | ''>(uno?.tipo ?? 'festivo');
  const [nombre, setNombre] = useState(uno?.nombre ?? '');
  const [horario, setHorario] = useState(uno?.horario ?? '');
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setOcupado(true); setError(null);
    const { error } = await personal().rpc('marcar_dias', {
      p_empresa: empresa!.id, p_equipos: todos ? equipos.map((e) => e.id) : [equipo.id], p_fechas: fechas,
      p_tipo: tipo || null, p_nombre: nombre || null, p_horario: ['intensiva', 'especial', 'trabaja'].includes(tipo) ? horario || null : null,
    });
    setOcupado(false);
    if (error) { setError(textoError(error.message)); return; }
    aviso(tipo ? 'Días marcados' : 'Marcas quitadas'); alGuardar();
  }

  return (
    <Ventana titulo={fechas.length === 1 ? fechaCorta(fechas[0]) : `${fechas.length} días`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={guardar}>{tipo ? 'Marcar' : 'Quitar la marca'}</button></>}>
      <fieldset className="formulario">
        <legend className="nota" style={{ marginBottom: 8 }}>Tipo de día</legend>
        <div className="opciones">
          {TIPOS.map((t) => (
            <label key={t.tipo} className={'opcion' + (tipo === t.tipo ? ' sel' : '')}>
              <input type="radio" name="tipo" checked={tipo === t.tipo} onChange={() => setTipo(t.tipo)} />
              <i className={'t-' + t.tipo} /><span><b>{t.nombre}</b><small>{t.ayuda}</small></span></label>
          ))}
          <label className={'opcion' + (tipo === '' ? ' sel' : '')}>
            <input type="radio" name="tipo" checked={tipo === ''} onChange={() => setTipo('')} />
            <i /><span><b>Normal</b><small>Quitar la marca</small></span></label>
        </div>
      </fieldset>
      {tipo && <label className="campo"><span>Nombre (opcional)</span>
        <input value={nombre} maxLength={120} placeholder={tipo === 'festivo' ? 'Por ejemplo: Fiesta local' : ''} onChange={(e) => setNombre(e.target.value)} /></label>}
      {['intensiva', 'especial', 'trabaja'].includes(tipo) && <label className="campo"><span>Horario</span>
        <input value={horario} maxLength={120} placeholder="Por ejemplo: 7:00 a 15:00" onChange={(e) => setHorario(e.target.value)} /></label>}
      {equipos.length > 1 && <label className="check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
        También en {equipos.filter((e) => e.id !== equipo.id).map((e) => e.nombre).join(' y ')}</label>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

function Copiar({ anio, equipo, equipos, alCerrar, alGuardar }: { anio: number; equipo: Equipo; equipos: Equipo[]; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const otros = equipos.filter((e) => e.id !== equipo.id);
  const [de, setDe] = useState(otros[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  async function copiar() {
    const { data, error } = await personal().rpc('copiar_dias', { p_empresa: empresa!.id, p_anio: anio, p_de: de, p_a: equipo.id });
    if (error) { setError(textoError(error.message)); return; }
    aviso(`${data} días copiados`); alGuardar();
  }
  return (
    <Ventana titulo={`Copiar ${anio} a ${equipo.nombre}`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={copiar}>Copiar</button></>}>
      <label className="campo"><span>Copiar los días marcados de</span>
        <select value={de} onChange={(e) => setDe(e.target.value)}>{otros.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
      <p className="nota">Lo que ya tenga marcado {equipo.nombre} en {anio} se sustituye.</p>
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
    nucleo().from('personas').select('id, nombre, equipo_id, baja').eq('empresa_id', empresa!.id).is('baja', null).order('nombre')
      .then(({ data }) => setPersonas(((data ?? []) as Persona[]).filter((p) => p.equipo_id === equipo.id)));
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
  if (!personas.length) return <div className="vacio"><p>No hay trabajadores en {equipo.nombre}. Se asignan en Configuración → Trabajadores.</p></div>;
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
    const { data, error } = await personal().from('v_envios').select('*').eq('empresa_id', empresa!.id).eq('anio', anio).eq('equipo_id', equipo.id).order('enviado', { ascending: false });
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
    const { data, error } = await personal().rpc('enviar_calendario', { p_empresa: empresa!.id, p_anio: anio, p_equipo: equipo.id, p_personas: [...elegidos] });
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
            <span className="fila-txt"><b>Calendario laboral {e.anio}</b><small>{e.datos.equipo} · {e.estado === 'firmado' ? `firmado el ${fechaCorta(e.firmado_en!.slice(0, 10))}` : 'pendiente de firma'}</small></span>
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
        <p className="doc-cab"><b>{d.unidad}</b> · Calendario laboral {d.anio}<br />{d.trabajador} · {d.equipo}</p>
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

