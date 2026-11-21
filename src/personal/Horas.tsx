import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import { personal, textoError } from './calendario';
import { CABECERA_MES, csv, dec, filaExcel, finDeMes, resumenMes, sumaDias, type DiaHoras, type FilaMes } from './horas';

const hoy = () => new Date().toLocaleDateString('sv-SE');
/** «Investigar personas» se descarga al abrirlo. */
const InvestigarPersonas = lazy(() => import('./InvestigarPersonas').then((m) => ({ default: m.InvestigarPersonas })));
const FALTAS: [string, string][] = [['', 'Ninguna'], ['baja', 'Baja'], ['vacaciones', 'Vacaciones'], ['permiso', 'Permiso'], ['otro', 'Otra falta']];
const TIPO_DIA: Record<string, string> = { festivo: 'Festivo', cierre: 'Cierre', descanso: 'Descanso', intensiva: 'Jornada intensiva', especial: 'Horario especial', trabaja: 'Trabaja' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const fechaLarga = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const num = (s: string) => { const x = parseFloat(s.replace(',', '.')); return Number.isFinite(x) ? x : null; };
const txt = (x: number | null) => (x == null ? '' : String(x).replace('.', ','));

/** Los días de horas de la unidad (o de una persona) en trozos de un año como mucho. */
export async function leerDias(empresa: string, desde: string, hasta: string, persona?: string) {
  const todos: DiaHoras[] = [];
  for (let d = desde; d <= hasta; d = sumaDias(d, 366)) {
    const h = sumaDias(d, 365) < hasta ? sumaDias(d, 365) : hasta;
    const { data, error } = await personal().rpc('horas_dias', { p_empresa: empresa, p_desde: d, p_hasta: h, ...(persona ? { p_persona: persona } : {}) });
    if (error) throw new Error(error.message);
    todos.push(...((data ?? []) as DiaHoras[]));
  }
  return todos;
}

/** Desde cuándo cuenta la bolsa (ajuste de Personal «bolsa_inicio»). */
function useBolsaInicio() {
  const { empresa } = useSesion();
  const [v, setV] = useState<string | null | undefined>(undefined);
  const cargar = useCallback(async () => {
    const { data } = await nucleo().from('ajustes').select('valor').eq('empresa_id', empresa!.id).eq('modulo', 'personal').eq('clave', 'bolsa_inicio').is('centro_id', null).maybeSingle();
    const x = (data as { valor: unknown } | null)?.valor;
    setV(typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  return [v, cargar] as const;
}

// =====================================================================================
// Administrador: horas del día y del mes
// =====================================================================================
export function Horas() {
  const [vista, setVista] = useState<'dia' | 'mes' | 'investigar'>('dia');
  return (
    <>
      <div className="segmentos tres" role="group" aria-label="Horas">
        <button type="button" aria-pressed={vista === 'dia'} onClick={() => setVista('dia')}>Horas del día</button>
        <button type="button" aria-pressed={vista === 'mes'} onClick={() => setVista('mes')}>Horas del mes</button>
        <button type="button" aria-pressed={vista === 'investigar'} onClick={() => setVista('investigar')}>Investigar</button>
      </div>
      {vista === 'dia' ? <HorasDia /> : vista === 'mes' ? <HorasMes /> : <Suspense fallback={<p className="nota">Cargando…</p>}><InvestigarPersonas /></Suspense>}
    </>
  );
}

interface FilaDia { d: DiaHoras; tra: string; fu: string; em: string; fa: string; nota: string }

function HorasDia() {
  const { empresa } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const [filas, setFilas] = useState<FilaDia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    setFilas(null); setError(null);
    try {
      const ds = await leerDias(empresa!.id, fecha, fecha);
      setFilas(ds.map((d) => ({ d, tra: d.apuntado && d.trabajadas != null && !d.falta ? txt(d.trabajadas) : '', fu: d.fuera ? txt(d.fuera) : '',
        em: txt(d.extra_mano), fa: d.apuntado ? d.falta ?? '' : '', nota: d.nota ?? '' })));
    } catch (e) { setError(textoError((e as Error).message)); setFilas([]); }
  }, [empresa, fecha]);
  useEffect(() => { cargar(); }, [cargar]);
  const cambiar = (i: number, c: Partial<FilaDia>) => setFilas((fs) => fs!.map((f, j) => (j === i ? { ...f, ...c } : f)));

  async function guardar() {
    setError(null);
    const items = [];
    for (const f of filas!) {
      const tra = f.tra.trim() ? num(f.tra) : null, fu = f.fu.trim() ? num(f.fu) : 0, em = f.em.trim() ? num(f.em) : null;
      if ((f.tra.trim() && (tra == null || tra < 0 || tra > 24)) || fu == null || fu < 0 || fu > 24 || (f.em.trim() && (em == null || em < 0 || em > 24)))
        return setError(`Revisa las horas de ${f.d.nombre}.`);
      const base = tra ?? (f.fa ? 0 : f.d.prevista);
      if (fu > base) return setError(`Lo de fuera de presupuesto no puede ser más que lo trabajado (${f.d.nombre}).`);
      if ((fu > 0 || (em ?? 0) > 0) && !f.nota.trim()) return setError(`Escribe el motivo de las horas fuera de presupuesto o extra (${f.d.nombre}).`);
      // si no cambia nada respecto a lo previsto, no se apunta (y si había algo, se quita)
      items.push({ persona_id: f.d.persona_id, trabajadas: tra, fuera: fu, extra_mano: em, falta: f.fa || null, nota: f.nota.trim() || null });
    }
    setOcupado(true);
    const { error: e } = await personal().rpc('guardar_horas_dia', { p_empresa: empresa!.id, p_fecha: fecha, p_items: items });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso('Horas guardadas');
    cargar();
  }

  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Día</span><input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
      </div>
      <p className="nota" style={{ marginTop: 0 }}>Salen las horas que le tocan a cada uno según su horario y su calendario. Cambia solo a quien haya trabajado distinto.
        «Fuera de presupuesto»: horas de ese día que no paga el servicio. «Extra a mano»: horas que se pagan como extra.</p>
      {filas === null ? <p className="nota">Cargando…</p> : !filas.length ? (
        <div className="vacio"><p><b>No hay trabajadores con horas este día.</b></p><p>Pon la jornada y el horario de cada uno en Configuración → Trabajadores.</p></div>
      ) : (
        <div className="lista">
          {filas.map((f, i) => {
            const tipo = f.d.tipo_dia ? TIPO_DIA[f.d.tipo_dia] + (f.d.nombre_dia ? ` (${f.d.nombre_dia})` : '') : '';
            return (
              <div key={f.d.persona_id} className="fila fija horas-dia">
                <span className="fila-txt"><b>{f.d.nombre}</b>
                  <small>Le tocan {dec(f.d.prevista)} h{tipo ? ` · ${tipo}` : ''}{f.d.vacaciones ? ' · de vacaciones' : ''}</small></span>
                <div className="horas-campos">
                  <label className="campo"><span>Horas trabajadas</span>
                    <input inputMode="decimal" aria-label={`Horas trabajadas de ${f.d.nombre}`} placeholder={dec(f.fa ? 0 : f.d.prevista)} value={f.tra} onChange={(e) => cambiar(i, { tra: e.target.value })} /></label>
                  <label className="campo"><span>Fuera de presupuesto</span>
                    <input inputMode="decimal" aria-label={`Fuera de presupuesto de ${f.d.nombre}`} placeholder="0" value={f.fu} onChange={(e) => cambiar(i, { fu: e.target.value })} /></label>
                  <label className="campo"><span>Extra a mano</span>
                    <input inputMode="decimal" aria-label={`Extra a mano de ${f.d.nombre}`} placeholder="0" value={f.em} onChange={(e) => cambiar(i, { em: e.target.value })} /></label>
                  <label className="campo"><span>Falta</span>
                    <select aria-label={`Falta de ${f.d.nombre}`} value={f.fa} onChange={(e) => cambiar(i, { fa: e.target.value })}>
                      {FALTAS.map(([v, t]) => <option key={v} value={v}>{t}{!v && f.d.vacaciones ? ' (sale de vacaciones)' : ''}</option>)}
                    </select></label>
                </div>
                <label className="campo motivo"><span>Motivo (obligatorio si pones horas fuera o extra)</span>
                  <input aria-label={`Motivo de ${f.d.nombre}`} maxLength={500} value={f.nota} onChange={(e) => cambiar(i, { nota: e.target.value })} /></label>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {!!filas?.length && <div className="acciones-cal"><button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar</button></div>}
    </>
  );
}

function HorasMes() {
  const { empresa } = useSesion();
  const ordenador = useOrdenador();
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [bolsaInicio, recargarBolsa] = useBolsaInicio();
  const [dias, setDias] = useState<DiaHoras[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cambiandoInicio, setCambiandoInicio] = useState(false);
  const desde = bolsaInicio && bolsaInicio < mes + '-01' ? bolsaInicio : mes + '-01';
  useEffect(() => {
    if (bolsaInicio === undefined) return;
    setDias(null); setError(null);
    leerDias(empresa!.id, desde, finDeMes(mes)).then(setDias, (e) => { setError(textoError((e as Error).message)); setDias([]); });
  }, [empresa, mes, desde, bolsaInicio]);
  const filas = useMemo(() => (dias && bolsaInicio !== undefined ? resumenMes(dias, mes, bolsaInicio ?? '9999-12-31', hoy()) : null), [dias, mes, bolsaInicio]);

  function bajar(nombre: string, texto: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const excelMes = () => bajar(`horas_${mes}.csv`, csv([CABECERA_MES, ...filas!.map(filaExcel)]));
  const excelDetalle = () => {
    const lim = finDeMes(mes) < hoy() ? finDeMes(mes) : hoy();
    const ds = dias!.filter((d) => d.fecha >= mes + '-01' && d.fecha <= lim && (d.fuera > 0 || (d.extra_mano ?? 0) > 0));
    bajar(`horas_detalle_${mes}.csv`, csv([['Fecha', 'Nombre', 'Jornada', 'Horas trabajadas', 'Fuera de presupuesto (h)', 'Extra a mano (h)', 'Motivo'],
      ...ds.map((d) => [d.fecha, d.nombre, d.jornada === 'completa' ? 'Completa' : d.jornada === 'parcial' ? 'Parcial' : 'Sin poner', dec(d.horas), dec(d.fuera), dec(d.extra_mano ?? 0), d.nota ?? ''])]));
  };

  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Mes</span><input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></label>
      </div>
      <p className="nota" style={{ marginTop: 0 }}>
        {bolsaInicio ? <>La bolsa de horas cuenta desde el lunes {new Date(bolsaInicio + 'T12:00:00').toLocaleDateString('es-ES')} (empezó con 0 h). </>
          : <>Todavía no has dicho desde cuándo cuenta la bolsa de horas. </>}
        <button type="button" className="enlace" onClick={() => setCambiandoInicio(true)}>{bolsaInicio ? 'Cambiar' : 'Ponerlo'}</button>
        {' '}Solo cuentan los días ya pasados; cada semana va al mes de su domingo.</p>
      {cambiandoInicio && <InicioBolsa actual={bolsaInicio ?? ''} alCerrar={() => setCambiandoInicio(false)} alGuardar={() => { setCambiandoInicio(false); recargarBolsa(); }} />}
      {error && <p className="error" role="alert">{error}</p>}
      {filas === null ? <p className="nota">Cargando…</p> : !filas.length ? <div className="vacio"><p>No hay horas de {nombreMes(mes)}.</p></div> : (
        <>
          <div className="acciones-cal">
            <button type="button" className="boton sec peq" onClick={excelMes}>Excel del mes</button>
            <button type="button" className="boton sec peq" onClick={excelDetalle}>Detalle de extras y fuera de presupuesto</button>
          </div>
          {ordenador ? <TablaMes filas={filas} /> : <div className="lista">{filas.map((f) => <FilaResumen key={f.persona_id} f={f} />)}</div>}
        </>
      )}
    </>
  );
}

/** Horas del mes en el ordenador: una columna por dato (h = horas; los días de falta, en días). */
function TablaMes({ filas }: { filas: FilaMes[] }) {
  const h = (x: number | null) => (x ? dec(x) : '');
  const extras = (f: FilaMes) => (f.extraSemana ?? 0) + (f.extraSabado ?? 0) + (f.extraFestivo ?? 0);
  const n = (c: string, t: string, v: (f: FilaMes) => number | null) => ({ clave: c, titulo: t, numero: true, valor: (f: FilaMes) => h(v(f)), orden: v });
  return (
    <Tabla filas={filas} clave={(f) => f.persona_id} etiquetaBuscar="Buscar persona"
      filtros={[{ clave: 'extra', texto: 'Con extras', cumple: (f) => extras(f) > 0 }, { clave: 'fuera', texto: 'Fuera de presupuesto', cumple: (f) => f.fuera > 0 },
        { clave: 'falta', texto: 'Con faltas', cumple: (f) => f.baja + f.vacaciones + f.permiso + f.otra > 0 }, { clave: 'bolsa', texto: 'Bolsa en negativo', cumple: (f) => (f.bolsaFin ?? 0) < 0 }]}
      columnas={[
        { clave: 'nombre', titulo: 'Persona', valor: (f) => f.nombre },
        { clave: 'jornada', titulo: 'Jornada', valor: (f) => `${f.jornada}${f.contrato != null ? ` · ${dec(f.contrato)} h/sem` : ''}` },
        n('trab', 'Trabajadas (h)', (f) => f.trabajadas), n('extra', 'Extra (h)', extras), n('fuera', 'Fuera de presupuesto (h)', (f) => f.fuera),
        n('baja', 'Baja (días)', (f) => f.baja), n('vac', 'Vacaciones (días)', (f) => f.vacaciones), n('perm', 'Permiso (días)', (f) => f.permiso), n('otra', 'Otra falta (días)', (f) => f.otra),
        { clave: 'bolsa', titulo: 'Bolsa (h)', numero: true, orden: (f) => f.bolsaFin, valor: (f) => (f.bolsaFin == null ? '' : (
          <span className={'chapa ' + (f.bolsaFin < 0 ? 'sin-cuadrar' : 'firmado')} title={`Empezó el mes con ${dec(f.bolsaInicio)} h y ha cambiado ${dec(f.bolsaVariacion)} h`}>{dec(f.bolsaFin)}</span>)) },
      ]} />
  );
}

function FilaResumen({ f }: { f: FilaMes }) {
  const extras = (f.extraSemana ?? 0) + (f.extraSabado ?? 0) + (f.extraFestivo ?? 0);
  const faltas = [f.baja && `${f.baja} de baja`, f.vacaciones && `${f.vacaciones} de vacaciones`, f.permiso && `${f.permiso} de permiso`, f.otra && `${f.otra} de otra falta`].filter(Boolean);
  return (
    <div className="fila fija centrada">
      <span className="fila-txt"><b>{f.nombre}</b>
        <small>{f.jornada}{f.contrato != null ? ` · ${dec(f.contrato)} h/semana` : ''} · {dec(f.trabajadas)} h trabajadas{extras ? ` · ${dec(extras)} h extra` : ''}{f.fuera ? ` · ${dec(f.fuera)} h fuera de presupuesto` : ''}</small>
        {faltas.length > 0 && <small>Días: {faltas.join(', ')}</small>}
      </span>
      {f.bolsaFin != null && <span className={'chapa ' + (f.bolsaFin < 0 ? 'sin-cuadrar' : 'firmado')} title={`Empezó el mes con ${dec(f.bolsaInicio)} h y ha cambiado ${dec(f.bolsaVariacion)} h`}>Bolsa {dec(f.bolsaFin)} h</span>}
    </div>
  );
}

function InicioBolsa({ actual, alCerrar, alGuardar }: { actual: string; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [f, setF] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return setError('Elige un día.');
    if (new Date(f + 'T12:00:00').getDay() !== 1) return setError('Tiene que ser un lunes (la bolsa va por semanas de lunes a domingo).');
    const { data: ya } = await nucleo().from('ajustes').select('id').eq('empresa_id', empresa!.id).eq('modulo', 'personal').eq('clave', 'bolsa_inicio').is('centro_id', null).maybeSingle();
    const { error: e } = ya
      ? await nucleo().from('ajustes').update({ valor: f }).eq('id', (ya as { id: string }).id)
      : await nucleo().from('ajustes').insert({ empresa_id: empresa!.id, modulo: 'personal', clave: 'bolsa_inicio', valor: f });
    if (e) return setError(textoError(e.message));
    aviso('Guardado'); alGuardar();
  }
  return (
    <div className="caja-aviso">
      <label className="campo"><span>La bolsa de horas empieza (con 0 h) el lunes</span><input type="date" value={f} onChange={(e) => setF(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones-cal"><button type="button" className="boton sec peq" onClick={alCerrar}>Cancelar</button><button type="button" className="boton peq" onClick={guardar}>Guardar</button></div>
    </div>
  );
}

// =====================================================================================
// Cada trabajador: mis horas
// =====================================================================================
export function MisHoras() {
  const { empresa, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [persona, setPersona] = useState<string | null | undefined>(undefined);
  const [bolsaInicio] = useBolsaInicio();
  const [dias, setDias] = useState<DiaHoras[] | null>(null);
  useEffect(() => {
    nucleo().from('usuarios').select('persona_id').eq('id', yo!).maybeSingle()
      .then(({ data }) => setPersona((data as { persona_id: string | null } | null)?.persona_id ?? null));
  }, [yo]);
  const desde = bolsaInicio && bolsaInicio < mes + '-01' ? bolsaInicio : mes + '-01';
  useEffect(() => {
    if (!persona || bolsaInicio === undefined) return;
    setDias(null);
    leerDias(empresa!.id, desde, finDeMes(mes), persona).then(setDias, () => setDias([]));
  }, [empresa, persona, mes, desde, bolsaInicio]);

  if (persona === null) return <div className="vacio"><p><b>Tu usuario no está enlazado con tu ficha de trabajador.</b></p><p>Pídeselo a tu administrador (Configuración → Usuarios).</p></div>;
  const f = dias && bolsaInicio !== undefined ? resumenMes(dias, mes, bolsaInicio ?? '9999-12-31', hoy())[0] : null;
  const lim = finDeMes(mes) < hoy() ? finDeMes(mes) : hoy();
  const delMes = (dias ?? []).filter((d) => d.fecha >= mes + '-01' && d.fecha <= lim && (d.apuntado || d.falta || d.tipo_dia)).reverse();
  return (
    <>
      <div className="filtros">
        <label className="campo"><span>Mes</span><input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></label>
      </div>
      {dias === null ? <p className="nota">Cargando…</p> : !f ? <div className="vacio"><p>No tienes horas en {nombreMes(mes)}.</p></div> : (
        <>
          <div className="cifras">
            <div><b>{dec(f.trabajadas)} h</b><small>trabajadas</small></div>
            {f.jornada === 'Completa' && <div><b>{dec((f.extraSemana ?? 0) + (f.extraSabado ?? 0) + (f.extraFestivo ?? 0))} h</b><small>extra pagadas</small></div>}
            {f.bolsaFin != null && <div><b>{dec(f.bolsaFin)} h</b><small>en tu bolsa</small></div>}
          </div>
          <p className="nota">Hasta hoy. {f.jornada === 'Completa' ? 'Cada semana cuenta en el mes de su domingo.' : ''}</p>
          {delMes.length > 0 && <>
            <h2 className="subtitulo">Días distintos</h2>
            <ul className="lista-dias">
              {delMes.map((d) => (
                <li key={d.fecha}><b>{fechaLarga(d.fecha)}</b>
                  {d.falta ? FALTAS.find((x) => x[0] === d.falta)?.[1] : `${dec(d.horas)} h`}
                  {d.tipo_dia && !d.falta ? ` · ${TIPO_DIA[d.tipo_dia]}` : ''}
                  {(d.extra_mano ?? 0) > 0 ? ` · ${dec(d.extra_mano)} h extra` : ''}</li>
              ))}
            </ul>
          </>}
        </>
      )}
    </>
  );
}
