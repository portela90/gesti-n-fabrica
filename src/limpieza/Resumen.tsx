// Pestaña «Resumen» de Limpieza (administrador y encargados): En pantalla e Informes (semanal y por operario).
// Cada uno ve lo que le toca (lo decide la base de datos en limpieza.informe). Las horas, solo el administrador.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

/** «Investigar» solo lo usa el administrador: se descarga al abrirlo. */
const Investigar = lazy(() => import('./Investigar').then((m) => ({ default: m.Investigar })));
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { Ventana } from '../componentes/basicos';
import { limp, textoError } from './MiDia';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import {
  cuentas, durTxt, fDM, fDMA, horasPorPersona, lunesDe, numSemana, pct, sumaD,
  type DatosInf, type DiaH, type HorasPersona, type Sust,
} from './informe';
import type { IncInf, RepInf } from './pdfInforme';

/** El código de los PDF y Excel se carga solo al sacar un informe. */
const informes = () => import('./pdfInforme');

const hoy = () => new Date().toLocaleDateString('sv-SE');
type Sub = 'pantalla' | 'informes' | 'investigar';

export function Resumen({ ruta, ir }: { ruta: string; ir: (r: string) => void }) {
  const { puede } = useSesion();
  const investiga = puede('limpieza.informe.todo');   // Investigar: solo el administrador
  const partes = ruta.split('/');
  const sub: Sub = partes[4] === 'informes' ? 'informes' : partes[4] === 'investigar' && investiga ? 'investigar' : 'pantalla';
  const lunes = /^\d{4}-\d{2}-\d{2}$/.test(partes[5] ?? '') ? lunesDe(partes[5]) : null;
  return (
    <>
      <div className={'segmentos no-imprimir' + (investiga ? ' tres' : '')} role="group" aria-label="Resumen">
        <button type="button" aria-pressed={sub === 'pantalla'} onClick={() => ir('/m/limpieza/resumen/pantalla')}>En pantalla</button>
        <button type="button" aria-pressed={sub === 'informes'} onClick={() => ir('/m/limpieza/resumen/informes')}>Informes</button>
        {investiga && <button type="button" aria-pressed={sub === 'investigar'} onClick={() => ir('/m/limpieza/resumen/investigar')}>Investigar</button>}
      </div>
      {sub === 'pantalla' ? <EnPantalla /> : sub === 'informes' ? <Informes lunes={lunes} /> : <Suspense fallback={<p className="nota">Cargando…</p>}><Investigar /></Suspense>}
    </>
  );
}

// ---------- datos ----------
async function leerInforme(empresa: string, desde: string, hasta: string): Promise<DatosInf> {
  const { data, error } = await limp().rpc('informe', { p_empresa: empresa, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(textoError(error.message));
  return data as DatosInf;
}

/** ¿Puede ver horas? Solo el administrador de horas y si la unidad tiene Personal encendido. */
function useHoras() {
  const { empresa, puede } = useSesion();
  return !!empresa && empresa.modulos.includes('personal') && puede('personal.horas.editar');
}
async function leerHoras(empresa: string, desde: string, hasta: string): Promise<HorasPersona[]> {
  const [d, s, b] = await Promise.all([
    supabase.schema('personal').rpc('horas_dias', { p_empresa: empresa, p_desde: desde, p_hasta: hasta }),
    limp().from('sustituciones').select('ausente, sustituto, desde, hasta, nota').eq('empresa_id', empresa).lte('desde', hasta).gte('hasta', desde),
    nucleo().from('ajustes').select('valor').eq('empresa_id', empresa).eq('modulo', 'personal').eq('clave', 'bolsa_inicio').is('centro_id', null).maybeSingle(),
  ]);
  if (d.error) throw new Error(textoError(d.error.message));
  const bi = (b.data as { valor: unknown } | null)?.valor;
  return horasPorPersona((d.data ?? []) as DiaH[], (s.data ?? []) as Sust[], desde, hasta, hoy(), typeof bi === 'string' ? bi : null);
}

// =====================================================================================
// En pantalla
// =====================================================================================
type Periodo = '7' | '30' | 'fechas';
function EnPantalla() {
  const ordenador = useOrdenador();
  const { empresa } = useSesion();
  const [per, setPer] = useState<Periodo>('7');
  const [desde, setDesde] = useState(sumaD(hoy(), -29));
  const [hasta, setHasta] = useState(hoy());
  const [datos, setDatos] = useState<DatosInf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rango = per === 'fechas' ? [desde, hasta] : [sumaD(hoy(), -(Number(per) - 1)), hoy()];
  useEffect(() => {
    setDatos(null); setError(null);
    if (!rango[0] || !rango[1] || rango[1] < rango[0]) { setError('«Hasta» no puede ser antes de «Desde».'); return; }
    leerInforme(empresa!.id, rango[0], rango[1]).then(setDatos, (e) => setError((e as Error).message));
  }, [empresa, rango[0], rango[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const X = useMemo(() => (datos ? cuentas(datos.trabajos) : null), [datos]);

  return (
    <>
      <div className="segmentos tres no-imprimir" role="group" aria-label="Periodo">
        {([['7', '7 días'], ['30', '30 días'], ['fechas', 'Entre fechas']] as [Periodo, string][]).map(([k, n]) =>
          <button key={k} type="button" aria-pressed={per === k} onClick={() => setPer(k)}>{n}</button>)}
      </div>
      {per === 'fechas' && (
        <div className="res-fechas">
          <label className="campo"><span>Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="campo"><span>Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {!error && !X && <p className="nota">Cargando…</p>}
      {X && (
        <>
          {datos!.alcance !== 'todo' && <p className="nota">Ves los trabajos de tu equipo.</p>}
          <div className="cifras">
            <div><b>{X.total}</b><small>Trabajos</small></div>
            <div><b>{X.hechos.length}</b><small>Hechos</small></div>
            <div><b>{X.total ? `${pct(X.hechos.length, X.total)} %` : '—'}</b><small>Hecho</small></div>
            <div><b>{X.mal}</b><small>Checklists con algo mal</small></div>
          </div>
          <h3 className="res-titulo">Por persona</h3>
          {!X.porPersona.length ? <div className="vacio"><p>No hay trabajos en estas fechas.</p></div> : (
            ordenador ? <Tabla filas={X.porPersona} clave={(p) => p.nombre} sinBuscador columnas={[
              { clave: 'nombre', titulo: 'Persona', valor: (p) => p.nombre },
              { clave: 'h', titulo: 'Hechos', numero: true, valor: (p) => `${p.h} de ${p.t}`, orden: (p) => p.h },
              { clave: 'pct', titulo: '% hecho', numero: true, valor: (p) => <span className="res-celda-barra">{pct(p.h, p.t)} %<span className="res-barra" aria-hidden="true"><i style={{ width: `${pct(p.h, p.t)}%` }} /></span></span>, orden: (p) => (p.t ? p.h / p.t : 0) },
              { clave: 'prob', titulo: 'Con problema', numero: true, valor: (p) => p.prob || '', orden: (p) => p.prob },
              { clave: 'mal', titulo: 'Checklist mal', numero: true, valor: (p) => p.mal || '', orden: (p) => p.mal },
              { clave: 'media', titulo: 'Tiempo medio', numero: true, valor: (p) => (p.nm ? durTxt(p.minReal / p.nm) : '—'), orden: (p) => (p.nm ? p.minReal / p.nm : null) },
            ]} /> : <div className="lista">
              {X.porPersona.map((p) => (
                <div key={p.nombre} className="fila fija centrada">
                  <span className="fila-txt"><b>{p.nombre}</b>
                    <small>{p.h} de {p.t} hechos{p.prob ? ` · ${p.prob} con problema` : ''}{p.mal ? ` · ${p.mal} checklist mal` : ''} · tiempo medio {p.nm ? durTxt(p.minReal / p.nm) : '—'}</small>
                    <span className="res-barra" aria-hidden="true"><i style={{ width: `${pct(p.h, p.t)}%` }} /></span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <h3 className="res-titulo">Cuánto tarda cada trabajo</h3>
          {!X.tarda.length ? <div className="vacio"><p>Todavía no hay tiempos. Salen cuando los trabajos se empiezan con «Empezar» y se terminan con «Terminar».</p></div> : (
            ordenador ? <Tabla filas={X.tarda} clave={(t) => t.titulo} etiquetaBuscar="Buscar trabajo" columnas={[
              { clave: 'titulo', titulo: 'Trabajo', valor: (t) => t.titulo },
              { clave: 'est', titulo: 'Previsto', numero: true, valor: (t) => (t.est ? durTxt(t.est) : '—'), orden: (t) => t.est },
              { clave: 'media', titulo: 'Media real', numero: true, valor: (t) => <span className={t.tarde ? 'res-tarde' : ''}>{durTxt(t.media)}</span>, orden: (t) => t.media },
              { clave: 'n', titulo: 'Veces', numero: true, valor: (t) => t.n, orden: (t) => t.n },
              { clave: 'mn', titulo: 'Más rápido', numero: true, valor: (t) => durTxt(t.mn), orden: (t) => t.mn },
              { clave: 'mx', titulo: 'Más lento', numero: true, valor: (t) => durTxt(t.mx), orden: (t) => t.mx },
            ]} /> : <div className="lista">
              {X.tarda.map((t) => (
                <div key={t.titulo} className="fila fija centrada">
                  <span className="fila-txt"><b>{t.titulo}</b>
                    <small>Previsto {t.est ? durTxt(t.est) : '—'} · <span className={t.tarde ? 'res-tarde' : ''}>media real {durTxt(t.media)}</span> · {t.n} {t.n === 1 ? 'vez' : 'veces'} · {durTxt(t.mn)} – {durTxt(t.mx)}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
          {X.tarda.some((t) => t.tarde) && <p className="nota">En rojo: tarda de media más de un 25 % de lo previsto.</p>}
        </>
      )}
    </>
  );
}

// =====================================================================================
// Informes
// =====================================================================================
function Informes({ lunes }: { lunes: string | null }) {
  return (<><InformeSemanal lunesInicial={lunes} /><InformeOperario /></>);
}

/** Guardar o compartir un archivo: en el móvil, el menú de compartir («Guardar en Archivos»); si no, se descarga. */
async function bajar(f: File) {
  try {
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
}
const puedeCompartir = () => {
  try { return /Android|iPhone|iPad/i.test(navigator.userAgent) && !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Que = 'ambos' | 'pdf' | 'excel' | 'compartir';

/** Ventana de «Preparando…» y luego «Informe listo» con un botón por archivo. */
function useHacer() {
  const [prep, setPrep] = useState<{ t: string; p: number } | null>(null);
  const [listos, setListos] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function hacer(que: Que, base: string, pdf: (pr: (t: string, p: number) => void) => Promise<Blob>, excel: () => Promise<Blob>) {
    setError(null); setPrep({ t: 'Leyendo los trabajos…', p: 3 });
    try {
      const files: File[] = [];
      const pr = (t: string, p: number) => setPrep({ t, p });
      if (que !== 'excel') { pr('Montando el PDF…', 15); files.push(new File([await pdf(pr)], `${base}.pdf`, { type: 'application/pdf' })); }
      if (que !== 'pdf') { pr('Montando el Excel…', 90); files.push(new File([await excel()], `${base}.xlsx`, { type: XLSX })); }
      setPrep(null);
      if (que === 'compartir') {
        try { await navigator.share({ files }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      setListos(files);
    } catch (e) { setPrep(null); setError(textoError((e as Error).message)); }
  }
  const ventanas = (
    <>
      {prep && (
        <Ventana titulo="Preparando el informe" alCerrar={() => undefined}>
          <p>{prep.t}</p><div className="res-barra grande"><i style={{ width: `${Math.round(prep.p)}%` }} /></div>
        </Ventana>
      )}
      {listos && (
        <Ventana titulo="Informe listo" alCerrar={() => setListos(null)} pie={<button type="button" className="boton sec" onClick={() => setListos(null)}>Cerrar</button>}>
          <p className="nota">Toca cada archivo: en el móvil se abre el menú para guardarlo o enviarlo (en el iPhone: «Guardar en Archivos»).</p>
          <div className="acciones-cal">{listos.map((f) => <button key={f.name} type="button" className="boton" onClick={() => bajar(f)}>{f.name}</button>)}</div>
        </Ventana>
      )}
    </>
  );
  return { hacer, ventanas, error, ocupado: !!prep };
}

/** Lo que el informe necesita además de los trabajos: incidencias y repetidos (administrador) y horas. */
async function extras(empresa: string, D: DatosInf, desde: string, hasta: string, conInc: boolean, conHoras: boolean) {
  const nombre = new Map(D.personas.map((p) => [p.id, p.nombre]));
  let incidencias: IncInf[] | null = null, repetidos: RepInf[] | null = null, horas: HorasPersona[] | null = null;
  if (conInc) {
    const [i, r] = await Promise.all([
      limp().from('incidencias').select('id, tema, texto, lugar, urgente, estado, creado, persona_id, fotos').eq('empresa_id', empresa)
        .gte('creado', `${desde}T00:00:00`).lt('creado', `${sumaD(hasta, 1)}T00:00:00`).order('creado'),
      limp().rpc('problemas_lista', { p_empresa: empresa, p_cerrados: true }),
    ]);
    incidencias = ((i.data ?? []) as (Omit<IncInf, 'quien'> & { persona_id: string | null })[]).map((x) => ({ ...x, quien: x.persona_id ? nombre.get(x.persona_id) ?? null : null }));
    repetidos = ((r.data ?? []) as { tema: string; lugar: string | null; casos: { fecha: string; titulo: string | null; quien: string | null }[] }[])
      .map((p) => ({ p, c: p.casos.filter((c) => c.fecha.slice(0, 10) >= desde && c.fecha.slice(0, 10) <= hasta) }))
      .filter((x) => x.c.length).map(({ p, c }) => ({ tema: p.tema, lugar: p.lugar, veces: c.length, ultima: c.map((y) => y.fecha.slice(0, 10)).sort().pop()!,
        quien: [...new Set(c.map((y) => y.quien).filter(Boolean) as string[])], casos: c.map((y) => `${y.fecha.slice(0, 10)} ${y.titulo ?? ''}`) }));
  }
  if (conHoras) horas = await leerHoras(empresa, desde, hasta);
  return { incidencias, repetidos, horas };
}
const urlFoto = async (ruta: string) => (await supabase.storage.from('limpieza').createSignedUrl(ruta, 600)).data?.signedUrl ?? null;

function InformeSemanal({ lunesInicial }: { lunesInicial: string | null }) {
  const { empresa, puede, estado } = useSesion();
  const conHoras = useHoras();
  const actual = lunesDe(hoy());
  const [lun, setLun] = useState(lunesInicial && lunesInicial <= actual ? lunesInicial : sumaD(actual, -7));
  const [vacia, setVacia] = useState(false);
  const { hacer, ventanas, error, ocupado } = useHacer();
  const quien = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  async function sacar(que: Que) {
    const desde = lun, hasta = sumaD(lun, 6);
    let datos: Awaited<ReturnType<typeof preparar>> | null = null;
    async function preparar() {
      const D = await leerInforme(empresa!.id, desde, hasta);
      const ex = await extras(empresa!.id, D, desde, hasta, puede('limpieza.incidencia.editar') && D.alcance === 'todo', conHoras && D.alcance === 'todo');
      return { unidad: D.unidad, quien, desde, hasta, trabajos: D.trabajos, ...ex, urlFoto };
    }
    try { datos = await preparar(); } catch (e) { void hacer(que, '', () => Promise.reject(e), () => Promise.reject(e)); return; }
    if (!datos.trabajos.length) { setVacia(true); return; }
    const base = `informe-limpieza-semana-${numSemana(desde)}-${desde}`;
    await hacer(que, base, async (pr) => (await informes()).pdfSemanal({ ...datos!, progreso: pr }), async () => (await informes()).excelSemanal(datos!));
  }
  return (
    <section className="res-tarjeta">
      <h3>Informe semanal</h3>
      <div className="res-semana">
        <button type="button" className="boton sec peq" aria-label="Semana anterior" onClick={() => setLun(sumaD(lun, -7))}>◀</button>
        <b>Semana {numSemana(lun)} · {fDM(lun)} al {fDM(sumaD(lun, 6))}{lun === actual ? ' (en curso)' : ''}</b>
        <button type="button" className="boton sec peq" aria-label="Semana siguiente" disabled={lun >= actual} onClick={() => setLun(sumaD(lun, 7))}>▶</button>
      </div>
      <p className="nota">PDF con el resumen, lo hecho por cada persona{conHoras ? ', las horas' : ''}, lo que tuvo problema o quedó sin hacer
        {puede('limpieza.incidencia.editar') ? ' y las incidencias con sus fotos' : ''}. El Excel lleva el detalle de cada trabajo.
        Cada lunes a las 9:00 le llega un aviso al administrador cuando está listo el de la semana anterior.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones-cal">
        {puedeCompartir() && <button type="button" className="boton" disabled={ocupado} onClick={() => sacar('compartir')}>Enviar PDF + Excel</button>}
        <button type="button" className={puedeCompartir() ? 'boton sec' : 'boton'} disabled={ocupado} onClick={() => sacar('ambos')}>Descargar PDF + Excel</button>
        <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => sacar('pdf')}>Solo PDF</button>
        <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => sacar('excel')}>Solo Excel</button>
      </div>
      {vacia && (
        <Ventana titulo="Sin trabajos esa semana" alCerrar={() => setVacia(false)} pie={<button type="button" className="boton sec" onClick={() => setVacia(false)}>Cerrar</button>}>
          <p>Esa semana no tiene trabajos. Usa las flechas para elegir otra semana.</p>
        </Ventana>
      )}
      {ventanas}
    </section>
  );
}

// ---------- informe por operario ----------
type TipoPer = 'dia' | 'semana' | 'mes' | 'rango';
const CLAVE = 'limpieza.informeOperario';
function leerCfg(): { tipo?: TipoPer; ops?: string[]; finde?: boolean } {
  try { const c = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); return c && typeof c === 'object' ? c : {}; } catch { return {}; }
}
function guardarCfg(c: { tipo: TipoPer; ops: string[]; finde: boolean }) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento */ } }
export function rangoPeriodo(tipo: TipoPer, f: string, h: string): [string, string] {
  if (tipo === 'dia') return [f, f];
  if (tipo === 'rango') return [f, h];
  if (tipo === 'semana') { const l = lunesDe(f); return [l, sumaD(l, 6)]; }
  const [y, m] = f.split('-').map(Number);
  return [`${f.slice(0, 7)}-01`, `${f.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
}

function InformeOperario() {
  const { empresa, estado } = useSesion();
  const conHoras = useHoras();
  const cfg = useMemo(leerCfg, []);
  const [tipo, setTipo] = useState<TipoPer>(cfg.tipo ?? 'semana');
  const [ops, setOps] = useState<string[]>(Array.isArray(cfg.ops) ? cfg.ops : []);
  const [finde, setFinde] = useState(cfg.finde !== false);
  const [f, setF] = useState(hoy());
  const [h, setH] = useState(hoy());
  const [gente, setGente] = useState<DatosInf['personas'] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { hacer, ventanas, error, ocupado } = useHacer();
  const quien = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
  useEffect(() => {   // la gente que me toca (de hoy): la da la base de datos
    leerInforme(empresa!.id, hoy(), hoy()).then((D) => setGente(D.personas.filter((p) => !p.baja)), () => setGente([]));
  }, [empresa]);
  useEffect(() => { guardarCfg({ tipo, ops, finde }); }, [tipo, ops, finde]);
  const marcar = (id: string, si: boolean) => setOps((o) => (si ? [...new Set([...o, id])] : o.filter((x) => x !== id)));
  const todos = gente ?? [];

  async function sacar(que: Que) {
    setAviso(null);
    const sel = todos.filter((p) => ops.includes(p.id));
    if (!sel.length) { setAviso('Marca al menos un operario.'); return; }
    if (tipo === 'rango' && h < f) { setAviso('«Hasta» no puede ser antes de «Desde».'); return; }
    const [desde, hasta] = rangoPeriodo(tipo, f, h);
    const periodo = `${({ dia: 'Día', semana: 'Semana', mes: 'Mes', rango: 'Periodo' } as const)[tipo]}: ${fDMA(desde)}${desde !== hasta ? ` al ${fDMA(hasta)}` : ''}`;
    let D: DatosInf, horas: HorasPersona[] | null = null;
    try {
      D = await leerInforme(empresa!.id, desde, hasta);
      if (conHoras && D.alcance === 'todo') horas = (await leerHoras(empresa!.id, desde, hasta)).filter((x) => ops.includes(x.persona_id));
    } catch (e) { setAviso((e as Error).message); return; }
    const personas = D.personas.filter((p) => ops.includes(p.id));
    const datos = { unidad: D.unidad, quien, desde, hasta, periodo, conFinde: finde, personas, trabajos: D.trabajos, horas, hoy: hoy() };
    const base = `${personas.length === 1 ? `informe-${personas[0].nombre.replace(/\s+/g, '-').toLowerCase()}` : 'informe-operarios'}-${tipo}-${desde}`;
    await hacer(que, base, async () => (await informes()).pdfOperarios(datos), async () => (await informes()).excelOperarios(datos));
  }

  return (
    <section className="res-tarjeta">
      <h3>Informe por operario</h3>
      <p className="nota">Lo que ha hecho cada persona, con el tiempo previsto y el real de cada trabajo, y lo que no se hizo
        {conHoras ? '; y sus horas: días y horas trabajadas, entre semana y fin de semana, extra, fuera de presupuesto, por sustitución y faltas, día a día' : ''}.
        Si marcas varios, cada uno sale en su página.</p>
      <div className="res-titulo-campo">Operarios</div>
      {gente === null ? <p className="nota">Cargando…</p> : !todos.length ? <p className="nota">No hay nadie en tu equipo.</p> : (
        <>
          <button type="button" className="boton sec peq" onClick={() => setOps(ops.length < todos.length ? todos.map((p) => p.id) : [])}>Marcar / quitar todos</button>
          <div className="res-marcas">
            {todos.map((p) => (
              <label key={p.id} className="res-marca"><input type="checkbox" checked={ops.includes(p.id)} onChange={(e) => marcar(p.id, e.target.checked)} /><span>{p.nombre}</span></label>
            ))}
          </div>
        </>
      )}
      <div className="res-titulo-campo">Periodo</div>
      <div className="segmentos res-cuatro" role="group" aria-label="Periodo del informe">
        {([['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['rango', 'Entre fechas']] as [TipoPer, string][]).map(([k, n]) =>
          <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{n}</button>)}
      </div>
      {tipo === 'rango' ? (
        <div className="res-fechas">
          <label className="campo"><span>Desde</span><input type="date" value={f} onChange={(e) => setF(e.target.value)} /></label>
          <label className="campo"><span>Hasta</span><input type="date" value={h} onChange={(e) => setH(e.target.value)} /></label>
        </div>
      ) : (
        <label className="campo"><span>{tipo === 'mes' ? 'Cualquier día del mes' : tipo === 'semana' ? 'Cualquier día de la semana' : 'Día'}</span>
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} /></label>
      )}
      <label className="res-marca"><input type="checkbox" checked={finde} onChange={(e) => setFinde(e.target.checked)} /><span>Incluir el fin de semana</span></label>
      {(aviso || error) && <p className="error" role="alert">{aviso || error}</p>}
      <div className="acciones-cal">
        <button type="button" className="boton" disabled={ocupado} onClick={() => sacar('ambos')}>PDF + Excel</button>
        <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => sacar('pdf')}>Solo PDF</button>
        <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => sacar('excel')}>Solo Excel</button>
      </div>
      {ventanas}
    </section>
  );
}

