// Personal → Horas → «Investigar» (solo quien edita horas): ficha de una persona, comparar a todos y mes a mes.
// Las cuentas están en investigar.ts; el PDF y el Excel en pdfPersonas.ts (se cargan al pulsar).
import { useEffect, useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso } from '../componentes/basicos';
import { bajarArchivo } from '../componentes/informes';
import { dec, type DiaHoras } from './horas';
import { leerDias } from './Horas';
import { textoError } from './calendario';
import { CLASE, fichas, limite, MOTIVO, mesAMes, nombreMes, ORDEN, ordenar, sumaDias, type ClaseDia, type Ficha, type Motivo, type Orden } from './investigar';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const fDMA = (f: string) => f.split('-').reverse().join('/');
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fCorta = (f: string) => `${DIAS[new Date(f + 'T12:00:00').getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
const archivos = () => import('./pdfPersonas');
type Clave = 'mes' | 'mesant' | '3m' | 'ano' | '';
function periodo(k: Clave, h: string): { k: Clave; d0: string; d1: string } {
  const y = h.slice(0, 4), m = Number(h.slice(5, 7));
  if (k === 'mesant') { const pm = m === 1 ? 12 : m - 1, py = m === 1 ? Number(y) - 1 : Number(y); return { k, d0: `${py}-${String(pm).padStart(2, '0')}-01`, d1: sumaDias(h.slice(0, 8) + '01', -1) }; }
  if (k === '3m') return { k, d0: sumaDias(h, -89), d1: h };
  if (k === 'ano') return { k, d0: `${y}-01-01`, d1: h };
  return { k: 'mes', d0: h.slice(0, 8) + '01', d1: h };
}
type Vista = 'persona' | 'todos' | 'meses';
const CLASES: ClaseDia[] = ['entre', 'sabado', 'domingo', 'festivo'];

export function InvestigarPersonas() {
  const { empresa, estado } = useSesion();
  const quien = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  const [per, setPer] = useState(() => periodo('mes', hoy()));
  const [vista, setVista] = useState<Vista>('persona');
  const [dias, setDias] = useState<DiaHoras[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState<string>('');
  const [personaMes, setPersonaMes] = useState<string>('*');   // en «Mes a mes»: «*» = todos
  const [orden, setOrden] = useState<Orden>('nombre');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setDias(null); setError(null);
    if (per.d0 > per.d1) { setError('«Desde» es después de «Hasta».'); return; }
    leerDias(empresa!.id, per.d0, per.d1).then(setDias, (e) => setError(textoError((e as Error).message)));
  }, [empresa, per.d0, per.d1]);
  const F = useMemo(() => (dias ? fichas(dias, per.d0, per.d1, hoy()) : null), [dias, per]);
  useEffect(() => { if (F?.length && !F.some((f) => f.persona_id === persona)) setPersona(F[0].persona_id); }, [F, persona]);
  const f = F?.find((x) => x.persona_id === persona) ?? null;
  const meses = useMemo(() => (dias ? mesAMes(dias, per.d0, per.d1, hoy(), personaMes !== '*' ? personaMes : null) : []), [dias, per, personaMes]);
  const lim = limite(per.d1, hoy());

  async function sacar(que: 'pdf' | 'excel') {
    setOcupado(true);
    try {
      const m = await archivos();
      if (que === 'pdf' && f) await bajarArchivo(await m.pdfFicha(f, empresa!.nombre, quien, per.d0, lim), `ficha-${f.nombre.replace(/\s+/g, '-').toLowerCase()}-${per.d0}_${lim}.pdf`);
      if (que === 'excel') {
        const de = personaMes !== '*' ? F?.find((x) => x.persona_id === personaMes)?.nombre : null;
        await bajarArchivo(await m.excelPersonas(F!, meses, de ?? 'todos', per.d0, lim), `investigar-personas-${per.d0}_${lim}.xlsx`);
      }
    } catch (e) { aviso((e as Error).message); }
    setOcupado(false);
  }

  return (
    <>
      <div className="res-chips" role="group" aria-label="Periodo">
        {([['mes', 'Este mes'], ['mesant', 'Mes pasado'], ['3m', '3 meses'], ['ano', 'Este año']] as [Clave, string][]).map(([k, n]) =>
          <button key={k} type="button" className="boton sec peq" aria-pressed={per.k === k} onClick={() => setPer(periodo(k, hoy()))}>{n}</button>)}
      </div>
      <div className="res-fechas">
        <label className="campo"><span>Desde</span><input type="date" value={per.d0} onChange={(e) => e.target.value && setPer({ k: '', d0: e.target.value, d1: per.d1 })} /></label>
        <label className="campo"><span>Hasta</span><input type="date" value={per.d1} onChange={(e) => e.target.value && setPer({ k: '', d0: per.d0, d1: e.target.value })} /></label>
      </div>
      <p className="nota">Cuentan los días ya pasados (hasta el {fDMA(lim)}).</p>
      <div className="segmentos tres" role="group" aria-label="Investigar">
        {([['persona', 'Una persona'], ['todos', 'Todos'], ['meses', 'Mes a mes']] as [Vista, string][]).map(([k, n]) =>
          <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}>{n}</button>)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && !F && <p className="nota">Cargando…</p>}
      {F && !F.length && <div className="vacio"><p>No hay días en estas fechas.</p></div>}
      {F && F.length > 0 && (
        <>
          {vista !== 'todos' && (
            <label className="campo"><span>Persona</span>
              <select value={vista === 'meses' ? personaMes : persona} onChange={(e) => (vista === 'meses' ? setPersonaMes : setPersona)(e.target.value)}>
                {vista === 'meses' && <option value="*">Todos</option>}
                {F.map((x) => <option key={x.persona_id} value={x.persona_id}>{x.nombre}</option>)}
              </select></label>)}
          <div className="acciones-cal">
            {vista === 'persona' && <button type="button" className="boton" disabled={ocupado || !f} onClick={() => sacar('pdf')}>Ficha en PDF</button>}
            <button type="button" className={vista === 'persona' ? 'boton sec' : 'boton'} disabled={ocupado} onClick={() => sacar('excel')}>Excel</button>
          </div>
          {vista === 'persona' && f && <FichaPersona f={f} />}
          {vista === 'todos' && <Todos F={F} orden={orden} setOrden={setOrden} />}
          {vista === 'meses' && <MesAMes M={meses} />}
        </>
      )}
    </>
  );
}

function FichaPersona({ f }: { f: Ficha }) {
  return (
    <>
      <div className="cifras">
        <div><b>{f.diasTrab}</b><small>Días trabajados</small></div>
        <div><b>{dec(f.horas)} h</b><small>Horas trabajadas (previstas {dec(f.previstas)})</small></div>
        <div><b className={f.faltas.baja ? 'res-mal' : ''}>{f.faltas.baja}</b><small>Días de baja</small></div>
        <div><b>{f.faltas.vacaciones}</b><small>Días de vacaciones</small></div>
        <div><b>{f.faltas.permiso + f.faltas.otro}</b><small>Permisos y otras faltas (días)</small></div>
        <div><b>{dec(f.extra + f.fuera)} h</b><small>Extra {dec(f.extra)} · fuera {dec(f.fuera)}</small></div>
      </div>
      <h3 className="res-titulo">Días y horas trabajadas</h3>
      <div className="lista compacta">{CLASES.map((c) => (
        <div key={c} className="fila fija"><span className="fila-txt"><b>{CLASE[c]}</b><small>{f.porClase[c].dias} {f.porClase[c].dias === 1 ? 'día' : 'días'} · {dec(f.porClase[c].horas)} h</small></span></div>))}</div>
      <h3 className="res-titulo">Bajas, vacaciones, permisos y otras faltas</h3>
      {f.periodos.length ? <div className="lista compacta">{f.periodos.map((p, i) => (
        <div key={i} className="fila fija"><span className="fila-txt"><b className={p.motivo === 'baja' ? 'res-mal' : ''}>{MOTIVO[p.motivo]}: {p.desde === p.hasta ? fDMA(p.desde) : `del ${fDMA(p.desde)} al ${fDMA(p.hasta)}`}</b>
          <small>{p.dias} {p.dias === 1 ? 'día' : 'días'}{p.notas.length ? ` · ${p.notas.join(' · ')}` : ''}</small></span></div>))}</div>
        : <p className="nota">Ninguna falta en este periodo.</p>}
      <h3 className="res-titulo">Horas extra y fuera de presupuesto</h3>
      {f.extras.length ? <div className="lista compacta">{f.extras.map((e) => (
        <div key={e.fecha} className="fila fija"><span className="fila-txt"><b>{fCorta(e.fecha)}</b>
          <small>{e.extra ? `${dec(e.extra)} h extra` : ''}{e.extra && e.fuera ? ' · ' : ''}{e.fuera ? `${dec(e.fuera)} h fuera de presupuesto` : ''}{e.nota ? ` · ${e.nota}` : ''}</small></span></div>))}</div>
        : <p className="nota">Ninguna en este periodo.</p>}
      <details className="res-tarjeta">
        <summary><h3>Día a día <small className="res-sub">{f.dias.length} días</small></h3></summary>
        <div className="lista compacta">{f.dias.map((d) => (
          <div key={d.fecha} className="fila fija"><span className="fila-txt"><b>{fCorta(d.fecha)} · {dec(d.horas)} h{d.falta ? ` · ${MOTIVO[d.falta as Motivo]}` : ''}</b>
            <small>{[d.nombre_dia ?? d.tipo_dia, `previstas ${dec(d.prevista)}`, d.extra_mano ? `extra ${dec(d.extra_mano)}` : null, d.fuera ? `fuera ${dec(d.fuera)}` : null, d.nota]
              .filter(Boolean).join(' · ')}</small></span></div>))}</div>
      </details>
    </>
  );
}

function Todos({ F, orden, setOrden }: { F: Ficha[]; orden: Orden; setOrden: (o: Orden) => void }) {
  const L = ordenar(F, orden);
  return (
    <>
      <label className="campo"><span>Ordenar por</span>
        <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>{ORDEN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <div className="lista">{L.map((f) => {
        const bajas = f.periodos.filter((p) => p.motivo === 'baja').length;
        return (
          <div key={f.persona_id} className="fila fija"><span className="fila-txt"><b>{f.nombre}</b>
            <small>{f.diasTrab} días · {dec(f.horas)} h trabajadas · extra {dec(f.extra)} h · fuera {dec(f.fuera)} h</small>
            <small><span className={f.faltas.baja ? 'res-mal' : ''}>{f.faltas.baja} días de baja{bajas ? ` (${bajas} ${bajas === 1 ? 'baja' : 'bajas'})` : ''}</span>
              {' · '}{f.faltas.vacaciones} de vacaciones · {f.faltas.permiso} de permiso{f.faltas.otro ? ` · ${f.faltas.otro} de otra falta` : ''}</small></span></div>);
      })}</div>
    </>
  );
}

function MesAMes({ M }: { M: ReturnType<typeof mesAMes> }) {
  const max = Math.max(1, ...M.map((m) => m.horas));
  return (
    <div className="lista">{M.map((m) => (
      <div key={m.mes} className="fila fija"><span className="fila-txt"><b>{nombreMes(m.mes)}</b>
        <small>{m.diasTrab} días · {dec(m.horas)} h trabajadas · extra {dec(m.extra)} h · fuera {dec(m.fuera)} h</small>
        <small><span className={m.baja ? 'res-mal' : ''}>{m.baja} días de baja{m.bajas ? ` (${m.bajas} ${m.bajas === 1 ? 'nueva' : 'nuevas'})` : ''}</span> · {m.vacaciones} de vacaciones · {m.permiso + m.otro} de permisos y otras faltas</small>
        <span className="res-barra" aria-hidden="true"><i style={{ width: `${Math.round((m.horas * 100) / max)}%` }} /></span></span></div>))}</div>
  );
}
