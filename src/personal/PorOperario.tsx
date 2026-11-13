import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Anio, diaSemana, iso, Leyenda, periodo, personal, textoError, type Dia, type Vacacion } from './calendario';

/** Un calendario del año tal como lo carga Personal. */
export interface CalAnio { id: string; nombre: string; dias: number[]; personas: string[]; horas_dia: number[] | null; horas_anuales: number | null }
interface Persona { id: string; nombre: string; baja: string | null }
interface Horas { persona_id: string; nombre: string; objetivo: number | null; horas: number; vacaciones: number }
type DiaEd = { tipo: 'trabaja' | 'festivo' | 'cierre' | 'descanso'; horas: number | null; nombre: string | null };

const fmtH = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const num = (x: string) => (x.trim() === '' ? NaN : Number(x.replace(',', '.')));
const DIAS: [number, string, string][] = [[1, 'L', 'lunes'], [2, 'M', 'martes'], [3, 'X', 'miércoles'], [4, 'J', 'jueves'], [5, 'V', 'viernes'], [6, 'S', 'sábado'], [0, 'D', 'domingo']];

/** Agrupa fechas sueltas en periodos seguidos. */
function periodos(fechas: string[]) {
  const dia = (f: string) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) / 864e5; };
  const out: { desde: string; hasta: string }[] = [];
  for (const f of [...fechas].sort()) {
    const ult = out[out.length - 1];
    if (ult && dia(f) - dia(ult.hasta) === 1) ult.hasta = f; else out.push({ desde: f, hasta: f });
  }
  return out;
}

/**
 * Calendario por operario: la lista de operarios con cómo van sus horas. Se elige uno (tocándolo) o varios
 * (marcándolos) y se abre el editor.
 */
export function PorOperario({ anio, cals, recargar }: { anio: number; cals: CalAnio[]; recargar: () => void }) {
  const { empresa, puede } = useSesion();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [horas, setHoras] = useState<Horas[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string[] | null>(null);
  const editable = puede('personal.calendario.editar');

  const cargar = useCallback(async () => {
    const { data } = await nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa!.id).is('baja', null).order('nombre');
    setPersonas((data ?? []) as Persona[]);
    const hs = await Promise.all(cals.map((c) => personal().rpc('horas_personas', { p_calendario: c.id })));
    setHoras(hs.flatMap((r) => (r.data ?? []) as Horas[]));
  }, [empresa, cals]);
  useEffect(() => { cargar(); }, [cargar]);

  if (personas === null) return <p className="nota">Cargando…</p>;
  if (editando) {
    return <Editor anio={anio} cals={cals} personas={personas.filter((p) => editando.includes(p.id))}
      alSalir={(guardado) => { setEditando(null); setElegidos(new Set()); if (guardado) recargar(); }} />;
  }
  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>{editable ? 'Toca un operario para hacer su calendario, o marca varios para hacerles el mismo.' : 'Cómo van las horas de cada uno.'}</p>
      <div className="lista">
        {personas.map((p) => {
          const cal = cals.find((c) => c.personas.includes(p.id));
          const h = horas.find((x) => x.persona_id === p.id);
          const dif = h && h.objetivo != null ? Math.round((h.horas - h.objetivo) * 100) / 100 : null;
          return (
            <div key={p.id} className="fila fija centrada">
              {editable && <input type="checkbox" className="marca" aria-label={`Elegir a ${p.nombre}`} checked={elegidos.has(p.id)}
                onChange={() => setElegidos((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />}
              <button type="button" className="fila-txt boton-fila" disabled={!editable} onClick={() => setEditando([p.id])}>
                <b>{p.nombre}</b>
                <small>{!cal ? `Sin calendario de ${anio}` : `${cal.nombre}${h ? ` · ${fmtH(h.horas)} h${h.objetivo != null ? ` de ${fmtH(h.objetivo)} h` : ''}` : ''}`}</small>
              </button>
              <span className={'chapa ' + (!cal ? 'sin' : dif === 0 ? 'firmado' : 'sin-cuadrar')}>
                {!cal ? 'Sin hacer' : dif === null ? 'Sin horas' : dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${fmtH(-dif)} h` : `Sobran ${fmtH(dif)} h`}</span>
            </div>
          );
        })}
      </div>
      {editable && elegidos.size > 0 && (
        <div className="barra-abajo no-imprimir">
          <span><b>{elegidos.size}</b> {elegidos.size === 1 ? 'operario' : 'operarios'}</span>
          <button type="button" className="boton txt" onClick={() => setElegidos(new Set())}>Quitar</button>
          <button type="button" className="boton" onClick={() => setEditando([...elegidos])}>Hacer su calendario</button>
        </div>
      )}
    </>
  );
}

/** El editor: horas al año, tocar días, ponerles horas, festivos y vacaciones, y al final Guardar. */
function Editor({ anio, cals, personas, alSalir }: { anio: number; cals: CalAnio[]; personas: Persona[]; alSalir: (guardado: boolean) => void }) {
  const { empresa, puede } = useSesion();
  const ids = personas.map((p) => p.id);
  // si todos los elegidos (y solo ellos) comparten calendario, se cambia ese; si no, se hace uno nuevo partiendo del del primero
  const deUno = cals.find((c) => c.personas.includes(ids[0]));
  const mismo = deUno && ids.every((id) => deUno.personas.includes(id)) && deUno.personas.length === ids.length ? deUno : null;
  const [nombre, setNombre] = useState(mismo?.nombre ?? `${personas.length === 1 ? personas[0].nombre : `${personas[0].nombre} y ${personas.length - 1} más`} ${anio}`);
  const [anuales, setAnuales] = useState(deUno?.horas_anuales != null ? String(deUno.horas_anuales).replace('.', ',') : '');
  const [dias, setDias] = useState<Map<string, DiaEd> | null>(null);
  const [vacs, setVacs] = useState<(Vacacion & { persona_id: string })[]>([]);
  const [nuevasVac, setNuevasVac] = useState<{ persona_id: string; desde: string; hasta: string; nota: string | null }[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [horasPoner, setHorasPoner] = useState('8');
  const [cambiado, setCambiado] = useState(false);
  const [rellenar, setRellenar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conVacaciones = puede('personal.vacaciones.editar');

  // cargar los días de partida (con las horas de un día normal si el calendario de partida las usaba por semana)
  useEffect(() => {
    (async () => {
      const m = new Map<string, DiaEd>();
      if (deUno) {
        const { data } = await personal().from('dias').select('fecha, tipo, nombre, horario, horas').eq('calendario_id', deUno.id);
        const marcados = new Map(((data ?? []) as Dia[]).map((d) => [d.fecha, d]));
        const hd = deUno.horas_dia;
        for (let mes = 0; mes < 12; mes++) for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
          const f = iso(anio, mes, d), x = marcados.get(f), normal = hd?.[diaSemana(f)] ?? 0;
          if (x && (x.tipo === 'festivo' || x.tipo === 'cierre' || x.tipo === 'descanso')) m.set(f, { tipo: x.tipo, horas: null, nombre: x.nombre });
          else if (x) { const h = x.horas ?? normal; if (h > 0) m.set(f, { tipo: 'trabaja', horas: h, nombre: null }); }
          else if (normal > 0) m.set(f, { tipo: 'trabaja', horas: normal, nombre: null });
        }
      }
      setDias(m);
      const { data: v } = await personal().from('vacaciones').select('id, persona_id, desde, hasta, nota').eq('empresa_id', empresa!.id)
        .lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).in('persona_id', ids);
      setVacs((v ?? []) as (Vacacion & { persona_id: string })[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todasVac = useMemo(() => [...vacs, ...nuevasVac], [vacs, nuevasVac]);
  const deVac = (pid: string, f: string) => todasVac.some((v) => v.persona_id === pid && v.desde <= f && f <= v.hasta);
  const objetivo = num(anuales);
  const cuentas = useMemo(() => personas.map((p) => {
    let h = 0; dias?.forEach((d, f) => { if (d.tipo === 'trabaja' && d.horas && !deVac(p.id, f)) h += d.horas; });
    return { p, horas: Math.round(h * 100) / 100 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dias, todasVac, personas]);
  const iguales = cuentas.every((c) => c.horas === cuentas[0].horas);

  const tocar = (f: string) => setElegidos((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  function aplicar(fn: (m: Map<string, DiaEd>, f: string) => void) {
    setDias((d) => { const m = new Map(d!); elegidos.forEach((f) => fn(m, f)); return m; });
    setElegidos(new Set()); setCambiado(true); setError(null);
  }
  function ponerHoras() {
    const h = num(horasPoner);
    if (Number.isNaN(h) || h <= 0 || h > 24) { setError('Pon las horas (un número entre 0 y 24).'); return; }
    aplicar((m, f) => m.set(f, { tipo: 'trabaja', horas: h, nombre: null }));
  }
  function ponerVacaciones() {
    const ps = periodos([...elegidos]);
    setNuevasVac((v) => [...v, ...ids.flatMap((pid) => ps.map((r) => ({ persona_id: pid, ...r, nota: null })))]);
    setElegidos(new Set()); setCambiado(true);
  }
  function quitarVacacionesNuevas(f: string) { setNuevasVac((v) => v.filter((x) => !(x.desde <= f && f <= x.hasta))); }

  async function guardar() {
    if (!nombre.trim()) { setError('Ponle un nombre al calendario.'); return; }
    if (Number.isNaN(objetivo) || objetivo < 0) { setError('Pon las horas que hay que trabajar al año.'); return; }
    setOcupado(true); setError(null);
    const lista = [...dias!.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, d]) => ({ fecha, tipo: d.tipo, horas: d.horas, nombre: d.nombre }));
    const { error } = await personal().rpc('guardar_calendario', {
      p_empresa: empresa!.id, p_anio: anio, p_calendario: mismo?.id ?? null, p_nombre: nombre.trim(), p_horas_anuales: objetivo,
      p_personas: ids, p_dias: lista, p_vacaciones: nuevasVac,
    });
    setOcupado(false);
    if (error) { setError(error.message.includes('duplicate') ? 'Ya hay otro calendario con ese nombre este año.' : textoError(error.message)); return; }
    aviso('Calendario guardado'); alSalir(true);
  }
  function salir() { if (!cambiado || confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) alSalir(false); }

  if (!dias) return <p className="nota">Cargando…</p>;
  const horasMap = new Map([...dias].filter(([, d]) => d.tipo === 'trabaja' && d.horas != null).map(([f, d]) => [f, d.horas!]));
  const especiales: Dia[] = [...dias].filter(([, d]) => d.tipo !== 'trabaja').map(([f, d]) => ({ fecha: f, tipo: d.tipo, nombre: d.nombre, horario: null }));
  // en verde, los días que están de vacaciones todos los elegidos
  const vacTodos: Vacacion[] = [];
  for (let mes = 0; mes < 12; mes++) for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
    const f = iso(anio, mes, d); if (ids.every((pid) => deVac(pid, f))) vacTodos.push({ desde: f, hasta: f, nota: null });
  }
  const resumen = (h: number) => {
    if (Number.isNaN(objetivo)) return <>{fmtH(h)} h</>;
    const dif = Math.round((h - objetivo) * 100) / 100;
    return <>{fmtH(h)} h de {fmtH(objetivo)} h · <b className={dif === 0 ? 'bien' : 'mal'}>{dif === 0 ? 'Cuadra al 100 %' : dif < 0 ? `faltan ${fmtH(-dif)} h` : `sobran ${fmtH(dif)} h`}</b></>;
  };

  return (
    <div className="editor-cal">
      <button type="button" className="boton txt volver" onClick={salir}>‹ Operarios</button>
      <h2 className="titulo" style={{ margin: '0 0 4px' }}>Calendario {anio}</h2>
      <p className="nota" style={{ margin: '0 0 12px' }}>{personas.map((p) => p.nombre).join(', ')}
        {!mismo && deUno ? ` · se parte del calendario «${deUno.nombre}»` : ''}</p>
      <div className="dos">
        <label className="campo"><span>Horas al año</span>
          <input inputMode="decimal" value={anuales} placeholder="Por ejemplo: 1712" onChange={(e) => { setAnuales(e.target.value); setCambiado(true); }} /></label>
        <label className="campo"><span>Nombre del calendario</span>
          <input value={nombre} maxLength={80} onChange={(e) => { setNombre(e.target.value); setCambiado(true); }} /></label>
      </div>
      <div className="contador" role="status" aria-label="Horas que llevas">
        {iguales ? <span>Llevas {resumen(cuentas[0].horas)}</span>
          : cuentas.map((c) => <span key={c.p.id}>{c.p.nombre.split(' ')[0]}: {resumen(c.horas)}</span>)}
      </div>
      <div className="botonera" style={{ justifyContent: 'flex-start', margin: '0 0 10px' }}>
        <button type="button" className="boton sec peq" onClick={() => setRellenar(true)}>Rellenar por días de la semana</button>
        <button type="button" className="boton txt peq" onClick={() => { if (confirm('¿Borrar todos los días de este calendario?')) { setDias(new Map()); setCambiado(true); } }}>Borrar todo</button>
      </div>
      <p className="nota" style={{ margin: '0 0 8px' }}>Toca los días y abajo ponles las horas, márcalos como festivo{conVacaciones ? ' o vacaciones' : ''}, o quítalos.</p>
      <Leyenda conHoras sinTipos />
      <Anio anio={anio} dias={especiales} vacaciones={vacTodos} diasEquipo={[]} horas={horasMap} elegidos={elegidos} alTocar={tocar} />
      {nuevasVac.length > 0 && <>
        <h3 className="subtitulo">Vacaciones nuevas (se guardan al pulsar Guardar)</h3>
        <ul className="lista-dias">{nuevasVac.filter((v, i, a) => a.findIndex((x) => x.desde === v.desde && x.hasta === v.hasta) === i)
          .map((r) => <li key={r.desde + r.hasta}><i className="t-vacaciones" /><span>{periodo(r)}</span>
            <button type="button" className="boton txt peq" onClick={() => quitarVacacionesNuevas(r.desde)}>Quitar</button></li>)}</ul></>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="barra-abajo no-imprimir">
        {elegidos.size > 0 ? (
          <div className="acciones-dias">
            <span><b>{elegidos.size}</b> {elegidos.size === 1 ? 'día' : 'días'}</span>
            <input inputMode="decimal" aria-label="Horas de los días elegidos" value={horasPoner} onChange={(e) => setHorasPoner(e.target.value)} />
            <button type="button" className="boton peq" onClick={ponerHoras}>Poner horas</button>
            <button type="button" className="boton sec peq" onClick={() => aplicar((m, f) => m.set(f, { tipo: 'festivo', horas: null, nombre: null }))}>Festivo</button>
            {conVacaciones && <button type="button" className="boton sec peq" onClick={ponerVacaciones}>Vacaciones</button>}
            <button type="button" className="boton txt peq" onClick={() => aplicar((m, f) => m.delete(f))}>Quitar</button>
          </div>
        ) : (
          <>
            <button type="button" className="boton sec" onClick={salir}>Salir</button>
            <button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar</button>
          </>
        )}
      </div>
      {rellenar && <Rellenar anio={anio} dias={dias} alCerrar={() => setRellenar(false)}
        alAplicar={(m) => { setDias(m); setCambiado(true); setRellenar(false); }} />}
    </div>
  );
}

/** Rellenar todo el año según el día de la semana (sin tocar los días que ya tienen algo). */
function Rellenar({ anio, dias, alCerrar, alAplicar }: { anio: number; dias: Map<string, DiaEd>; alCerrar: () => void; alAplicar: (m: Map<string, DiaEd>) => void }) {
  const [h, setH] = useState<string[]>(['', '8', '8', '8', '8', '6', '']);
  const [pisar, setPisar] = useState(false);
  function aplicar() {
    const hs = h.map((x) => (x.trim() === '' ? 0 : num(x)));
    if (hs.some((x) => Number.isNaN(x) || x < 0 || x > 24)) return;
    const m = new Map(dias);
    for (let mes = 0; mes < 12; mes++) for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
      const f = iso(anio, mes, d), x = hs[diaSemana(f)];
      const actual = m.get(f);
      if (actual && !pisar) continue;
      if (actual && actual.tipo !== 'trabaja') continue; // los festivos no se pisan nunca
      if (x > 0) m.set(f, { tipo: 'trabaja', horas: x, nombre: null }); else if (pisar) m.delete(f);
    }
    alAplicar(m);
  }
  return (
    <Ventana titulo="Rellenar por días de la semana" alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={aplicar}>Rellenar</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Pone estas horas a todos los días del año según el día de la semana. Luego cambias a mano los que sean distintos. Los festivos no se tocan.</p>
      <div className="horas-semana" role="group" aria-label="Horas por día de la semana">
        {DIAS.map(([d, l, n]) => <label key={d}><small>{l}</small>
          <input inputMode="decimal" aria-label={`Horas del ${n}`} value={h[d]} onChange={(e) => setH((x) => x.map((y, i) => (i === d ? e.target.value : y)))} /></label>)}
      </div>
      <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={pisar} onChange={(e) => setPisar(e.target.checked)} />
        Cambiar también los días que ya tienen horas</label>
    </Ventana>
  );
}

