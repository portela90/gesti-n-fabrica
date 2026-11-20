// «Investigar» (dentro de Resumen, solo el administrador): saturación, pasar trabajos, tiempos, problemas y sitios.
// Las cuentas están en investigar.ts; el PDF y el Excel en pdfInvestigar.ts (se carga al pulsar).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { limp, textoError } from './MiDia';
import { fCorta, fDM, sumaD, tiempoReal, type DatosInf, type DiaH, type TrabInf } from './informe';
import {
  AJUSTES_PARTIDA, anterior, cambiaTiempo, candidatoTxt, DIAS_LARGOS, diasEntre, diasTareaTxt, fraseSitio, horasTxt, investigar, minutosDe, necesarias,
  pasables, pctN, periodo, quienTardaMas, sinTiempoFiable,
  type Ajustes, type Candidato, type ClavePeriodo, type DatosInv, type Investigacion, type Pasable, type Periodo, type Repetido, type Saturacion, type TareaInf, type Tiempo,
} from './investigar';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const archivos = () => import('./pdfInvestigar');
async function bajar(b: Blob, nombre: string) {
  const f = new File([b], nombre, { type: b.type });
  try { if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; } }
  catch (e) { if ((e as Error).name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
}
const nivel = (p: number | null, lim: number) => (p == null ? '' : p >= lim ? 'res-mal' : p >= 60 ? '' : 'res-poco');

// ---------- ajustes (85 % y 30 min) ----------
const CLAVES = { limite: 'investigar_limite', hueco: 'investigar_hueco' } as const;
function useAjustes(): [Ajustes | null, () => void] {
  const { empresa } = useSesion();
  const [a, setA] = useState<Ajustes | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await nucleo().from('ajustes').select('clave, valor').eq('empresa_id', empresa!.id).eq('modulo', 'limpieza').is('centro_id', null);
    const v = (k: string, d: number) => { const x = Number((data ?? []).find((f: { clave: string }) => f.clave === k)?.valor); return Number.isFinite(x) && x > 0 ? x : d; };
    setA({ limite: v(CLAVES.limite, AJUSTES_PARTIDA.limite), hueco: v(CLAVES.hueco, AJUSTES_PARTIDA.hueco) });
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  return [a, cargar];
}
async function guardarAjuste(empresa: string, clave: string, valor: number) {
  const { data: ya } = await nucleo().from('ajustes').select('id').eq('empresa_id', empresa).eq('modulo', 'limpieza').eq('clave', clave).is('centro_id', null).maybeSingle();
  const { error } = ya ? await nucleo().from('ajustes').update({ valor }).eq('id', (ya as { id: string }).id)
    : await nucleo().from('ajustes').insert({ empresa_id: empresa, modulo: 'limpieza', clave, valor });
  if (error) throw new Error(textoError(error.message));
}

// =====================================================================================
export function Investigar() {
  const { empresa, puede, estado } = useSesion();
  const quien = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  const [aj, recargarAj] = useAjustes();
  const [per, setPer] = useState<Periodo>(() => periodo('mes', hoy()));
  const [D, setD] = useState<(DatosInv & Pick<DatosInf, 'unidad'>) | null>(null);
  const [horas, setHoras] = useState<DiaH[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const conHoras = !!empresa?.modulos.includes('personal') && puede('personal.horas.editar');
  useEffect(() => {
    setD(null); setError(null);
    if (per.d0 > per.d1) { setError('La fecha «desde» es después de «hasta».'); return; }
    const A = anterior(per.d0, per.d1), d4 = sumaD(hoy(), -120), ini = A.d0 < d4 ? A.d0 : d4;   // los tiempos, con 4 meses como poco
    Promise.all([
      limp().rpc('investigar', { p_empresa: empresa!.id, p_desde: ini, p_hasta: per.d1 }),
      conHoras ? supabase.schema('personal').rpc('horas_dias', { p_empresa: empresa!.id, p_desde: per.d0, p_hasta: per.d1 }) : Promise.resolve({ data: null, error: null }),
    ]).then(([r, h]) => {
      if (r.error) throw new Error(textoError(r.error.message));
      setHoras(h.error ? null : (h.data as DiaH[] | null)); setD(r.data as DatosInv & Pick<DatosInf, 'unidad'>);
    }).catch((e) => setError((e as Error).message));
  }, [empresa, per.d0, per.d1, conHoras, vuelta]);
  const X = useMemo(() => (D && aj ? investigar(D, horas, per.d0, per.d1, hoy(), aj) : null), [D, horas, per, aj]);
  const recargar = () => setVuelta((v) => v + 1);
  const [ficha, setFicha] = useState<Saturacion | null>(null);
  const [sitio, setSitio] = useState<Repetido | null>(null);
  const [lista, setLista] = useState<{ titulo: string; L: TrabInf[] } | null>(null);
  const [pasar, setPasar] = useState<{ x: Pasable; de: Saturacion; a: Candidato } | null>(null);
  const [cambiandoAj, setCambiandoAj] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const sacar = async (que: 'pdf' | 'excel') => {
    setOcupado(true);
    try {
      const m = await archivos(), base = `investigacion-limpieza-${per.d0}_${per.d1}`;
      if (que === 'pdf') await bajar(await m.pdfInvestigar(X!, D!.unidad, quien, per.d0, per.d1, aj!), `${base}.pdf`);
      else await bajar(await m.excelInvestigar(X!, D!.problemas), `${base}.xlsx`);
    } catch (e) { aviso((e as Error).message); }
    setOcupado(false);
  };

  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Saturación del equipo, tiempo que se va en problemas y las máquinas o zonas donde se repiten. Solo lo ves tú.</p>
      <div className="res-chips" role="group" aria-label="Periodo de Investigar">
        {([['sem', 'Esta semana'], ['mes', 'Este mes'], ['mesant', 'Mes pasado'], ['3m', '3 meses'], ['ano', 'Este año']] as [ClavePeriodo, string][]).map(([k, n]) =>
          <button key={k} type="button" className="boton sec peq" aria-pressed={per.k === k} onClick={() => setPer(periodo(k, hoy()))}>{n}</button>)}
      </div>
      <div className="res-fechas">
        <label className="campo"><span>Desde</span><input type="date" value={per.d0} onChange={(e) => e.target.value && setPer({ k: '', d0: e.target.value, d1: per.d1, t: `del ${fDM(e.target.value)} al ${fDM(per.d1)}` })} /></label>
        <label className="campo"><span>Hasta</span><input type="date" value={per.d1} onChange={(e) => e.target.value && setPer({ k: '', d0: per.d0, d1: e.target.value, t: `del ${fDM(per.d0)} al ${fDM(e.target.value)}` })} /></label>
      </div>
      {aj && <p className="nota">Muy cargado desde el {aj.limite} % · huecos de hasta {aj.hueco} min = desplazamiento y preparación.{' '}
        <button type="button" className="enlace" onClick={() => setCambiandoAj(true)}>Cambiar</button></p>}
      {!conHoras && <p className="nota">Sin horas de Personal: la jornada sale del horario de cada ficha.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!error && !X && <p className="nota">Cargando…</p>}
      {X && aj && (
        <>
          <div className="cifras">
            <div><b>{X.tot.jor ? `${pctN(X.tot.cont, X.tot.jor)} %` : '—'}</b><small>Saturación del equipo</small></div>
            {X.tot.sinNada.length > 0 && X.tot.jorAp > 0 && <div><b>{pctN(X.tot.contAp, X.tot.jorAp)} %</b><small>De quien apunta sus trabajos</small></div>}
            <div><b>{horasTxt(X.tot.jor)}</b><small>Horas de jornada</small></div>
            <div><b>{horasTxt(X.tot.min)}</b><small>En trabajos</small></div>
            <div><b>{horasTxt(X.tot.desp)}</b><small>Desplazamiento y preparación</small></div>
            <div><b>{horasTxt(X.tot.sin)}</b><small>Sin justificar</small></div>
            <div><b>{horasTxt(X.tot.prob)}</b><small>En problemas</small></div>
          </div>
          <div className="acciones-cal">
            <button type="button" className="boton" disabled={ocupado} onClick={() => sacar('pdf')}>Informe PDF</button>
            <button type="button" className="boton sec" disabled={ocupado} onClick={() => sacar('excel')}>Excel</button>
          </div>

          <section className="res-tarjeta">
            <h3>Saturación de cada trabajador <small className="res-sub">{per.t}</small></h3>
            <p className="nota">Saturación = (tiempo en trabajos + desplazamiento y preparación) / horas de jornada. Los huecos de hasta {aj.hueco} min entre un trabajo y el siguiente
              son desplazamiento y preparación; lo que queda es tiempo sin justificar. Un día nunca cuenta más que su jornada.</p>
            {X.tot.sinNada.length > 0 && <div className="caja-aviso">
              {X.tot.sinNada.length === 1 ? '1 persona no tiene' : `${X.tot.sinNada.length} personas no tienen`} ningún trabajo apuntado a su nombre: {X.tot.sinNada.map((p) => p.n).join(', ')}.
              <small className="res-bloque">Toda su jornada sale sin justificar y baja la saturación del equipo. Si sus trabajos los apunta otra persona, la saturación real es más alta:
                la de quien sí apunta es {X.tot.jorAp ? `${pctN(X.tot.contAp, X.tot.jorAp)} %` : '—'}.</small></div>}
            {!X.sat.length ? <p className="nota">Nadie tiene horas ni trabajos en este periodo.</p> : (
              <div className="lista">{X.sat.map((p) => { const pc = pctN(p.cont, p.jor); return (
                <button key={p.id} type="button" className="fila" onClick={() => setFicha(p)}>
                  <span className="fila-txt"><b>{p.n} <span className={nivel(pc, aj.limite)}>{pc == null ? '—' : `${pc} %`}</span></b>
                    <small>Jornada {horasTxt(p.jor)} · trabajos {horasTxt(p.min)}{p.desp ? ` · desplaz. ${horasTxt(p.desp)}` : ''} · sin justificar {horasTxt(p.sin)}</small>
                    <small>{p.nt} {p.nt === 1 ? 'trabajo' : 'trabajos'}{p.nt && p.real < p.nt ? ` · ${pctN(p.real, p.nt)} % con tiempo real` : ''}</small>
                    <span className={'res-barra' + (pc != null && pc >= aj.limite ? ' llena' : '')} aria-hidden="true"><i style={{ width: `${Math.min(100, pc ?? 0)}%` }} /></span>
                  </span><span className="fila-flecha" aria-hidden="true">›</span>
                </button>); })}</div>)}
            <p className="nota">En rojo: {aj.limite} % o más (muy cargado). Los trabajos sin «Empezar» cuentan con su tiempo previsto.</p>
          </section>

          <TarjetaPasar X={X} D={D!} per={per} aj={aj} alPasar={(x, de, a) => setPasar({ x, de, a })} />

          {X.raros.length > 0 && (
            <details className="res-tarjeta">
              <summary><h3>Tiempos que no cuadran <span className="res-pildora">{X.raros.length}</span></h3></summary>
              <p className="nota">Ya están ajustados y no deforman la saturación, pero conviene revisarlos: trabajos que se quedaron abiertos, días con más trabajo que horas y trabajo en días sin horas.</p>
              <div className="lista compacta">{X.raros.slice(0, 60).map((r, i) => (
                <div key={i} className="fila fija"><span className="fila-txt"><b>{fCorta(r.f)} · {r.n}</b><small>{r.t} · {horasTxt(r.min)} · {r.motivo}</small></span></div>))}</div>
            </details>
          )}

          <section className="res-tarjeta">
            <h3>Tiempo perdido en problemas <small className="res-sub">{X.P.length} avisos</small></h3>
            {!X.tipos.length ? <p className="nota">Ningún problema en este periodo (sale lo que encaja con los temas de Incidencias).</p> : (
              <div className="lista compacta">{X.tipos.map((t) => (
                <div key={t.tema} className="fila fija"><span className="fila-txt"><b>{t.tema}</b>
                  <small>{t.n} {t.n === 1 ? 'vez' : 'veces'} · {horasTxt(t.min)}{t.n ? ` · ${horasTxt(t.min / t.n)} de media` : ''} · {t.sitios} {t.sitios === 1 ? 'sitio' : 'sitios'} ·{' '}
                    <span className={t.n > t.ant ? 'res-mal' : t.n < t.ant ? 'res-bien' : ''}>antes {t.ant}{t.n > t.ant ? ' ↑' : t.n < t.ant ? ' ↓' : ' ='}</span></small></span></div>))}</div>)}
            <p className="nota">«Antes»: las veces del periodo anterior de la misma duración ({fDM(anterior(per.d0, per.d1).d0)} al {fDM(anterior(per.d0, per.d1).d1)}).</p>
          </section>

          <section className="res-tarjeta">
            <h3>Máquinas y zonas donde se repite <small className="res-sub">{X.rep.length ? `${X.rep.length} sitios` : ''}</small></h3>
            {!X.rep.length ? <p className="nota">Ningún problema se ha repetido en el mismo sitio en este periodo.</p> : (
              <div className="lista">{X.rep.map((g) => (
                <button key={g.clave + g.tema} type="button" className="fila" onClick={() => setSitio(g)}>
                  <span className="fila-txt"><b>{g.sitio} · {g.tema}</b>
                    <small>{g.n} veces · {horasTxt(g.min)} de limpieza{g.cada != null ? ` · una cada ${String(Math.round(g.cada * 10) / 10).replace('.', ',')} días` : ''} · última {fCorta(g.ult)}</small>
                    <small>{g.sigue ? <span className="res-mal">Sigue pasando</span> : <span className="res-bien">Hace {diasEntre(g.ult, hoy())} días que no</span>}{g.ant ? ` · antes: ${g.ant}` : ''} · ver todas y sacar informe</small>
                  </span><span className="fila-flecha" aria-hidden="true">›</span>
                </button>))}</div>)}
            <p className="nota">El sitio sale de la máquina del trabajo o del lugar que se apunta. Para que cuadre, que se apunte siempre en qué máquina es.</p>
          </section>

          <details className="res-tarjeta">
            <summary><h3>En qué se va el tiempo <small className="res-sub">{X.trab.length} trabajos distintos</small></h3></summary>
            {!X.trab.length ? <p className="nota">Ningún trabajo hecho en este periodo.</p> : (
              <div className="lista compacta">{X.trab.slice(0, 25).map((t) => (
                <button key={t.t} type="button" className="fila" onClick={() => setLista({ titulo: t.t, L: t.L })}>
                  <span className="fila-txt"><b>{t.t}{t.prob ? <span className="res-pildora mal">problema</span> : t.plan ? <span className="res-pildora">fija</span> : null}</b>
                    <small>{t.n} {t.n === 1 ? 'vez' : 'veces'} · {horasTxt(t.min)} · media {horasTxt(t.min / t.n)} · máx. {horasTxt(t.max)}</small></span>
                  <span className="fila-flecha" aria-hidden="true">›</span></button>))}</div>)}
          </details>

          <TarjetaTiempos X={X} alAplicar={recargar} />

          {X.P.length > 0 && (
            <details className="res-tarjeta">
              <summary><h3>Qué días pasan más los problemas</h3></summary>
              <div className="lista compacta">{[1, 2, 3, 4, 5, 6, 0].filter((d) => X.dia[d]).map((d) => (
                <div key={d} className="fila fija"><span className="fila-txt"><b>{DIAS_LARGOS[d]} · {X.dia[d]}</b>
                  <span className="res-barra" aria-hidden="true"><i style={{ width: `${Math.round((X.dia[d] * 100) / Math.max(...X.dia))}%` }} /></span></span></div>))}</div>
            </details>
          )}
        </>
      )}
      {ficha && X && aj && D && <FichaPersona p={ficha} X={X} D={D} per={per} aj={aj} alCerrar={() => setFicha(null)}
        alPasar={(x, a) => { setFicha(null); setPasar({ x, de: ficha, a }); }} alLista={(titulo, L) => setLista({ titulo, L })} />}
      {sitio && X && D && <FichaSitio g={sitio} X={X} unidad={D.unidad} quien={quien} per={per} alCerrar={() => setSitio(null)} />}
      {lista && X && D && <ListaTrabajos titulo={lista.titulo} L={lista.L} X={X} D={D} per={per} alCerrar={() => setLista(null)} />}
      {pasar && <ConfirmarPasar {...pasar} alCerrar={() => setPasar(null)} alHecho={() => { setPasar(null); recargar(); }} />}
      {cambiandoAj && aj && <CambiarAjustes aj={aj} alCerrar={() => setCambiandoAj(false)} alGuardar={() => { setCambiandoAj(false); recargarAj(); }} />}
    </>
  );
}

// ---------- trabajos que se pueden pasar ----------
function ListaPasar({ p, X, D, per, aj, alPasar }: { p: Saturacion; X: Investigacion; D: DatosInv; per: Periodo; aj: Ajustes; alPasar: (x: Pasable, a: Candidato) => void }) {
  const L = pasables(p, D, X, per.d0, per.d1, aj);
  if (!L.length) return <p className="nota">No tiene trabajos fijos con tiempo que se puedan pasar en este periodo.</p>;
  const nec = necesarias(p, L, aj);
  return (
    <div className="lista">{L.map((x) => { const mejor = x.cands.find((c) => !c.sin), otros = x.cands.filter((c) => c !== mejor); return (
      <div key={x.t.id} className="fila fija">
        <span className="fila-txt"><b>{x.t.titulo}{nec.has(x.t.id) ? '' : ' (opcional)'}</b>
          <small>{diasTareaTxt(x.t.dias)} · {x.veces} {x.veces === 1 ? 'vez' : 'veces'} en el periodo · {horasTxt(x.m)}. {p.n} bajaría del {x.antes} % al {x.despues} %.</small>
          {mejor ? <small>Mejor opción: {candidatoTxt(mejor)}</small> : <small>Nadie del equipo que trabaje esos días tiene hueco sin pasar del {aj.limite} %.</small>}
          {otros.length > 0 && <small>Otras opciones: {otros.slice(0, 3).map(candidatoTxt).join(' · ')}</small>}
        </span>
        {mejor && <button type="button" className="boton peq" onClick={() => alPasar(x, mejor)}>Pasar</button>}
      </div>); })}</div>
  );
}
function TarjetaPasar({ X, D, per, aj, alPasar }: { X: Investigacion; D: DatosInv; per: Periodo; aj: Ajustes; alPasar: (x: Pasable, de: Saturacion, a: Candidato) => void }) {
  const P = X.sat.filter((p) => p.jor && p.nt && (pctN(p.cont, p.jor) ?? 0) >= aj.limite);
  return (
    <section className="res-tarjeta">
      <h3>Trabajos que se pueden pasar a otro <small className="res-sub">{P.length ? `${P.length} ${P.length === 1 ? 'persona muy cargada' : 'personas muy cargadas'}` : `nadie pasa del ${aj.limite} %`}</small></h3>
      <p className="nota">Para quien pasa del {aj.limite} %: sus trabajos fijos que puede hacer otra persona del mismo equipo que trabaja esos días y que con el cambio no pasa del {aj.limite} %.
        Primero quien ya lo ha hecho y lo hace más rápido. «Pasar» cambia la tarea fija desde hoy, después de confirmarlo.</p>
      {!P.length ? <p className="nota">Nadie con trabajos apuntados pasa del {aj.limite} % en este periodo.</p>
        : P.map((p) => <div key={p.id} className="res-grupo"><b>{p.n} · {pctN(p.cont, p.jor)} %</b><ListaPasar p={p} X={X} D={D} per={per} aj={aj} alPasar={(x, a) => alPasar(x, p, a)} /></div>)}
    </section>
  );
}
function ConfirmarPasar({ x, de, a, alCerrar, alHecho }: { x: Pasable; de: Saturacion; a: Candidato; alCerrar: () => void; alHecho: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function hacer() {
    setOcupado(true); setError(null);
    const { data, error: e } = await limp().rpc('pasar_tarea', { p_tarea: x.t.id, p_de: de.id, p_a: a.id });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(`Pasado a ${a.nombre}${data ? ` (y ${data} ${data === 1 ? 'trabajo pendiente' : 'trabajos pendientes'})` : ''}`);
    alHecho();
  }
  return (
    <Ventana titulo="Pasar un trabajo fijo" alCerrar={alCerrar} pie={<>
      <button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
      <button type="button" className="boton" disabled={ocupado} onClick={hacer}>Pasar</button></>}>
      <p>Desde hoy, «{x.t.titulo}» ({diasTareaTxt(x.t.dias).toLowerCase()}) lo hará <b>{a.nombre}</b> en vez de <b>{de.n}</b>.</p>
      <p className="nota">Cambian también los trabajos de esta tarea que aún están pendientes. Los ya hechos no se tocan. Si te arrepientes, lo cambias en Tareas.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// ---------- tiempos de cada trabajo ----------
function TarjetaTiempos({ X, alAplicar }: { X: Investigacion; alAplicar: () => void }) {
  const { empresa } = useSesion();
  const T = [...X.tiempos.values()].filter((g) => g.hechas > 0 && g.n > 0)
    .sort((a, b) => (Number(cambiaTiempo(b)) - Number(cambiaTiempo(a))) || (Math.abs((b.prop ?? 0) - (b.est ?? 0)) - Math.abs((a.prop ?? 0) - (a.est ?? 0))));
  const ap = T.filter(cambiaTiempo);
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const SF = sinTiempoFiable(X.tiempos), QM = quienTardaMas(X.tiempos);
  async function aplicar(gs: Tiempo[]) {
    setOcupado(true);
    const { error } = await limp().rpc('poner_tiempos', { p_empresa: empresa!.id, p_items: gs.map((g) => ({ id: g.ref!.id, minutos: g.prop })) });
    setOcupado(false);
    if (error) return aviso(textoError(error.message));
    aviso(gs.length === 1 ? `Guardado: ${horasTxt(gs[0].prop)}` : `${gs.length} tiempos guardados`);
    if (gs.length > 1) alAplicar(); else setHechos((h) => new Set([...h, gs[0].k]));
  }
  return (
    <details className="res-tarjeta">
      <summary><h3>Tiempos de cada trabajo <small className="res-sub">{ap.length ? `${ap.length} para ajustar` : 'al día'}</small></h3></summary>
      <p className="nota">«Real» es el tiempo del medio de las últimas 20 veces con «Empezar» y «Terminar» (sin las que pasan del triple de lo normal). «Propuesto» mezcla tu previsto con lo real:
        con pocas veces pesa más lo tuyo y con muchas lo real (con 5 veces, mitad y mitad). Nada cambia hasta que pulsas «Aplicar».</p>
      {ap.length > 0 && <div className="acciones-cal"><button type="button" className="boton" disabled={ocupado} onClick={() => aplicar(ap.filter((g) => !hechos.has(g.k)))}>Aplicar todos ({ap.filter((g) => !hechos.has(g.k)).length})</button></div>}
      {!T.length ? <p className="nota">Todavía no hay trabajos con tiempo real (con «Empezar» y «Terminar»).</p> : (
        <div className="lista compacta">{T.slice(0, 80).map((g) => (
          <div key={g.k} className="fila fija">
            <span className="fila-txt"><b>{g.titulo}</b>
              <small>{g.tipo === 'fija' ? 'Fija' : g.tipo === 'habitual' ? 'Habitual' : 'Aviso'} · previsto {g.est ? horasTxt(g.est) : '—'} · real {g.med ? `${horasTxt(g.med)} (${g.n})` : '—'} ·
                propuesto <b>{g.prop ? horasTxt(g.prop) : '—'}</b>{g.prop && g.est && g.prop !== g.est ? ` (${g.prop > g.est ? '+' : ''}${g.prop - g.est} min)` : ''}</small></span>
            {cambiaTiempo(g) && (hechos.has(g.k) ? <span className="res-pildora bien">Aplicado</span>
              : <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => aplicar([g])}>Aplicar</button>)}
          </div>))}</div>)}
      <h4 className="res-titulo">Trabajos sin tiempo fiable</h4>
      {SF.length ? <>
        <p className="nota">Se hacen a menudo pero casi nunca con «Empezar» y «Terminar»: su tiempo es una suposición. Son los primeros en los que insistir al equipo.</p>
        <div className="lista compacta">{SF.slice(0, 30).map((g) => <div key={g.k} className="fila fija"><span className="fila-txt"><b>{g.titulo}</b>
          <small>{g.hechas} hechos · {g.real} con «Empezar» ({pctN(g.real, g.hechas)} %)</small></span></div>)}</div></>
        : <p className="nota">Ninguno: los trabajos que más se repiten tienen tiempo real.</p>}
      <h4 className="res-titulo">Quién tarda mucho más en un trabajo</h4>
      {QM.length ? <>
        <p className="nota">Personas que tardan al menos la mitad más que los demás en el mismo trabajo (con 3 veces o más). Puede ser formación, material o que le toca la zona peor: mejor preguntar antes de sacar conclusiones.</p>
        <div className="lista compacta">{QM.slice(0, 30).map((q, i) => <div key={i} className="fila fija"><span className="fila-txt"><b>{q.titulo} · {q.quien}</b>
          <small>Su tiempo {horasTxt(q.med)} ({q.c} veces) · los demás {horasTxt(q.otros)}</small></span></div>)}</div></>
        : <p className="nota">Nadie tarda mucho más que los demás en el mismo trabajo (con los datos que hay).</p>}
    </details>
  );
}

// ---------- fichas ----------
function FichaPersona({ p, X, D, per, aj, alCerrar, alPasar, alLista }: {
  p: Saturacion; X: Investigacion; D: DatosInv; per: Periodo; aj: Ajustes; alCerrar: () => void; alPasar: (x: Pasable, a: Candidato) => void; alLista: (t: string, L: TrabInf[]) => void;
}) {
  const pc = pctN(p.cont, p.jor);
  const h = D.horarios.find((x) => x.id === p.id);
  const fijas: TareaInf[] = D.tareas.filter((t) => t.clase === 'fija' && (t.todo_equipo ? !!h?.equipo_id && t.equipo_id === h.equipo_id : t.asignados.includes(p.id)));
  const G = new Map<string, { t: string; fija: boolean; n: number; min: number; real: number; L: TrabInf[] }>();
  X.H.filter((o) => o.hecho_por === p.id).forEach((o) => {
    const k = o.tarea_id ?? `a:${o.titulo}`;
    const g = G.get(k) ?? { t: o.titulo.replace(/\s*·.*$/, ''), fija: o.clase === 'fija', n: 0, min: 0, real: 0, L: [] as TrabInf[] };
    g.n++; g.min += minutosDe(o, X); if (tiempoReal(o)) g.real++; g.L.push(o); G.set(k, g);
  });
  const hechos = [...G.values()].sort((a, b) => b.min - a.min);
  return (
    <Ventana titulo={p.n} alCerrar={alCerrar} pie={<button type="button" className="boton sec" onClick={alCerrar}>Cerrar</button>}>
      <p><b>{per.t.charAt(0).toUpperCase() + per.t.slice(1)}: {pc == null ? 'sin horas de jornada' : `${pc} % de saturación (${horasTxt(p.cont)} de ${horasTxt(p.jor)} de jornada)`}.
        {' '}{p.nt} {p.nt === 1 ? 'trabajo' : 'trabajos'}{p.nt ? `, ${pctN(p.real, p.nt)} % con tiempo real` : ''}.</b></p>
      {!p.nt && <div className="caja-aviso">No tiene ningún trabajo apuntado a su nombre: su saturación no se puede saber. Si trabaja sin apuntarlo, que pulse «Empezar» y «Terminar».</div>}
      {pc != null && pc >= aj.limite && <><h4 className="res-titulo">Trabajos que podría hacer otro</h4><ListaPasar p={p} X={X} D={D} per={per} aj={aj} alPasar={alPasar} /></>}
      <h4 className="res-titulo">Cada día</h4>
      {p.D.size ? <div className="lista compacta">{[...p.D.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, d]) => (
        <div key={f} className="fila fija"><span className="fila-txt"><b>{fCorta(f)} · {d.jor ? `${pctN(d.cont, d.jor)} %` : '—'}</b><small>Jornada {horasTxt(d.jor)} · ocupado {horasTxt(d.cont)}</small></span></div>))}</div>
        : <p className="nota">Sin días con jornada en el periodo.</p>}
      <h4 className="res-titulo">Sus trabajos fijos</h4>
      {fijas.length ? <div className="lista compacta">{fijas.map((t) => { const g = X.tiempos.get(`f:${t.id}`); return (
        <div key={t.id} className="fila fija"><span className="fila-txt"><b>{t.titulo}{t.todo_equipo ? ' (todo el equipo)' : ''}</b>
          <small>{diasTareaTxt(t.dias)} · previsto {t.minutos_est ? horasTxt(t.minutos_est) : 'sin tiempo'}{g?.prop && g.prop !== t.minutos_est ? ` · propuesto ${horasTxt(g.prop)}` : ''}</small></span></div>); })}</div>
        : <p className="nota">No tiene trabajos fijos asignados.</p>}
      <h4 className="res-titulo">Lo que ha hecho en el periodo</h4>
      {hechos.length ? <div className="lista compacta">{hechos.map((g) => (
        <button key={g.t + g.fija} type="button" className="fila" onClick={() => alLista(`${g.t} · ${p.n}`, g.L)}>
          <span className="fila-txt"><b>{g.t}{g.fija ? '' : ' (aviso)'}</b><small>{g.n} {g.n === 1 ? 'vez' : 'veces'} · {horasTxt(g.min)} · media {horasTxt(g.min / g.n)} · con «Empezar» {g.real} de {g.n}</small></span>
          <span className="fila-flecha" aria-hidden="true">›</span></button>))}</div>
        : <p className="nota">Nada hecho a su nombre en el periodo.</p>}
    </Ventana>
  );
}

function FichaSitio({ g, X, unidad, quien, per, alCerrar }: { g: Repetido; X: Investigacion; unidad: string; quien: string; per: Periodo; alCerrar: () => void }) {
  const nombre = `repeticiones-${g.sitio.replace(/\W+/g, '_')}-${g.tema.replace(/\W+/g, '_')}`;
  const [ocupado, setOcupado] = useState(false);
  const sacar = async (que: 'pdf' | 'excel') => {
    setOcupado(true);
    try {
      const m = await archivos();
      if (que === 'pdf') await bajar(await m.pdfSitio(g, X, unidad, quien, per.d0, per.d1), `${nombre}.pdf`);
      else await bajar(await m.excelLista(fraseSitio(g, hoy()), g.L.map((o) => ({ o, sitio: g.sitio })), X), `${nombre}.xlsx`);
    } catch (e) { aviso((e as Error).message); }
    setOcupado(false);
  };
  return (
    <Ventana titulo={`${g.sitio} · ${g.tema}`} alCerrar={alCerrar} pie={<>
      <button type="button" className="boton sec" onClick={alCerrar}>Cerrar</button>
      <button type="button" className="boton sec" disabled={ocupado} onClick={() => sacar('excel')}>Excel</button>
      <button type="button" className="boton" disabled={ocupado} onClick={() => sacar('pdf')}>Informe PDF</button></>}>
      <p><b>{fraseSitio(g, hoy())}</b></p>
      <div className="lista compacta">{[...g.L].reverse().map((o) => (
        <div key={o.id} className="fila fija"><span className="fila-txt"><b>{fCorta(o.fecha)} · {o.titulo}</b>
          <small>{[o.descripcion, o.hecho_por_nombre ?? o.asignados_nombres.join(', '), o.estado === 'hecho' ? horasTxt(minutosDe(o, X)) + (tiempoReal(o) ? '' : ' (prev.)') : 'Sin hacer',
            o.fotos ? `${o.fotos} fotos` : null].filter(Boolean).join(' · ')}</small></span></div>))}</div>
      <p className="nota">Periodo: {per.t}. Las fotos están en cada trabajo.</p>
    </Ventana>
  );
}

function ListaTrabajos({ titulo, L, X, D, per, alCerrar }: { titulo: string; L: TrabInf[]; X: Investigacion; D: DatosInv; per: Periodo; alCerrar: () => void }) {
  const pr = new Map(D.problemas.map((p) => [p.id, p]));
  const orden = [...L].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const H = orden.filter((o) => o.estado === 'hecho'), min = H.reduce((s, o) => s + minutosDe(o, X), 0);
  const sitio = (o: TrabInf) => pr.get(o.id)?.sitio ?? ([o.maquina, o.lugar].filter(Boolean).join(' · ') || '—');
  const excel = async () => { try { const m = await archivos(); await bajar(await m.excelLista(titulo, orden.map((o) => ({ o, sitio: sitio(o) })), X), `trabajos-${titulo.replace(/\W+/g, '_').slice(0, 40)}.xlsx`); } catch (e) { aviso((e as Error).message); } };
  return (
    <Ventana titulo={titulo} alCerrar={alCerrar} pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cerrar</button><button type="button" className="boton" onClick={excel}>Excel</button></>}>
      <p><b>{L.length} {L.length === 1 ? 'vez' : 'veces'} {per.t}{H.length ? `: ${horasTxt(min)} en total, ${horasTxt(min / H.length)} de media (${H.filter(tiempoReal).length} con tiempo real).` : '.'}</b></p>
      <div className="lista compacta">{orden.slice(0, 300).map((o) => (
        <div key={o.id} className="fila fija"><span className="fila-txt"><b>{fCorta(o.fecha)} · {o.titulo}</b>
          <small>{[sitio(o), o.hecho_por_nombre ?? o.asignados_nombres.join(', '), o.estado === 'hecho' ? horasTxt(minutosDe(o, X)) + (tiempoReal(o) ? '' : ' (prev.)') : 'Sin hacer',
            o.fotos ? `${o.fotos} fotos` : null].filter(Boolean).join(' · ')}</small></span></div>))}</div>
      <p className="nota">«(prev.)»: no se pulsó «Empezar» y se cuenta el tiempo previsto.</p>
    </Ventana>
  );
}

function CambiarAjustes({ aj, alCerrar, alGuardar }: { aj: Ajustes; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [lim, setLim] = useState(String(aj.limite));
  const [hue, setHue] = useState(String(aj.hueco));
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    const l = Number(lim), h = Number(hue);
    if (!Number.isInteger(l) || l < 50 || l > 100) return setError('El límite tiene que ser un número entre 50 y 100.');
    if (!Number.isInteger(h) || h < 0 || h > 120) return setError('El hueco tiene que ser un número de minutos entre 0 y 120.');
    try { await guardarAjuste(empresa!.id, CLAVES.limite, l); await guardarAjuste(empresa!.id, CLAVES.hueco, h); }
    catch (e) { return setError((e as Error).message); }
    alGuardar();
  }
  return (
    <Ventana titulo="Números de Investigar" alCerrar={alCerrar} pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={guardar}>Guardar</button></>}>
      <label className="campo"><span>Muy cargado desde (%)</span><input inputMode="numeric" value={lim} onChange={(e) => setLim(e.target.value)} /></label>
      <p className="nota">A partir de aquí alguien sale en rojo y se buscan trabajos para pasar a otro. De partida, 85.</p>
      <label className="campo"><span>Desplazamiento y preparación (minutos)</span><input inputMode="numeric" value={hue} onChange={(e) => setHue(e.target.value)} /></label>
      <p className="nota">Un hueco entre dos trabajos de hasta estos minutos cuenta como ir a por material, cambiar de nave o recoger; más largo, es tiempo sin justificar. De partida, 30.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
