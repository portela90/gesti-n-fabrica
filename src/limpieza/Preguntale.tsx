// «Pregúntale» (arriba de Investigar, solo el administrador): la caja de la pregunta, la respuesta y lo que aprende.
// El motor (entender y contestar) está en preguntale.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { bajarArchivo, cab, libro, neg } from '../componentes/informes';
import type { DiaHoras } from '../componentes/horasPersonas';
import { limp, textoError } from './MiDia';
import { fCorta, sumaD } from './informe';
import { anterior, horasTxt, type Ajustes } from './investigar';
import { Ayudas, contesta, EJEMPLOS, entiende, plano, type Contexto, type DatosPreg, type DicEntrada, type Entendido, type Periodo, type Respuesta } from './preguntale';
import type { TrabInf } from './informe';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const QUE: Partial<Record<Entendido['int'], [string, string]>> = {
  pasar: ['Quiero saber', 'qué trabajos se pueden pasar a otro'], mejora: ['Quiero saber', 'cómo ahorrar tiempo'], avisos: ['Quiero saber', 'qué avisos se repiten más'],
  sobra: ['Quiero saber', 'cuánto tiempo sobra'], naves: ['Compara', 'las naves'], ahorro: ['Quiero saber', 'cuánto se ahorraría'], vuelto: ['Quiero saber', 'si ha vuelto a pasar'],
  pend: ['Quiero saber', 'lo que se ha quedado sin hacer'], res: ['Quiero', 'un resumen'], rep: ['Quiero saber', 'dónde se repite'], sat: ['Quiero saber', 'la carga de trabajo'],
  cal: ['Quiero saber', 'quién no pulsa «Empezar»'],
};
const MEDIDA_TXT: Record<string, string> = { baja: 'las bajas', vacaciones: 'las vacaciones', permiso: 'los permisos', faltas: 'las faltas', extra: 'las horas extra',
  fuera: 'las horas fuera de presupuesto', dias: 'los días trabajados', horas: 'las horas trabajadas' };
const TIPOS: [DicEntrada['tipo'], string, string, string][] = [
  ['persona', 'Una persona', 'Cuando escriba…', 'Es…'], ['lugar', 'Un lugar como se apunta', 'Lugar apuntado en los trabajos', 'Se llama…'],
  ['problema', 'Un tipo de problema', 'Cuando escriba…', 'Es un problema de…'], ['frase', 'Otras palabras', 'Cuando escriba…', 'Quiero decir…'],
  ['grupo', 'Un grupo de trabajos', 'Nombre del grupo (cuando escriba…)', 'Trabajos con alguna de estas palabras (separadas por comas)'],
];

/** Los datos de unas fechas (Investigar va de 400 en 400 días) y las horas de Personal si se pueden ver. */
async function cargar(empresa: string, d0: string, d1: string, conHoras: boolean): Promise<{ D: DatosPreg; dias: DiaHoras[] | null }> {
  let D = null as DatosPreg | null;
  for (let a = d0; a <= d1; ) {
    const b = sumaD(a, 399) < d1 ? sumaD(a, 399) : d1;
    const { data, error } = await limp().rpc('investigar', { p_empresa: empresa, p_desde: a, p_hasta: b });
    if (error) throw new Error(textoError(error.message));
    const x = data as DatosPreg;
    D = D ? { ...D, trabajos: [...D.trabajos, ...x.trabajos], problemas: [...D.problemas, ...x.problemas], detalles: [...D.detalles, ...x.detalles] } : x;
    a = sumaD(b, 1);
  }
  let dias: DiaHoras[] | null = null;
  if (conHoras) {
    dias = [];
    for (let a = d0; a <= d1; ) {
      const b = sumaD(a, 365) < d1 ? sumaD(a, 365) : d1;
      const { data, error } = await supabase.schema('personal').rpc('horas_dias', { p_empresa: empresa, p_desde: a, p_hasta: b });
      if (error) { dias = null; break; }
      dias.push(...((data ?? []) as DiaHoras[]));
      a = sumaD(b, 1);
    }
  }
  return { D: D!, dias };
}

export function Preguntale({ pantalla, aj }: { pantalla: Periodo; aj: Ajustes }) {
  const { empresa, puede } = useSesion();
  const conHoras = !!empresa?.modulos.includes('personal') && puede('personal.horas.editar');
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ E: Entendido; r: Respuesta; id: string | null } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dic, setDic] = useState<DicEntrada[]>([]);
  const [ensenar, setEnsenar] = useState<{ palabra: string; tipo: DicEntrada['tipo'] } | null>(null);
  const [verDic, setVerDic] = useState(false);
  const [lista, setLista] = useState<{ titulo: string; L: TrabInf[] } | null>(null);
  const [servido, setServido] = useState<'' | 'si' | 'no' | 'pidiendo'>('');
  const cache = useRef(new Map<string, { D: DatosPreg; dias: DiaHoras[] | null }>());
  const ultimo = useRef<{ D: DatosPreg; dias: DiaHoras[] | null } | null>(null);
  const cargarDic = useCallback(async () => {
    const { data } = await limp().from('preguntas_dic').select('id, tipo, palabra, valor').eq('empresa_id', empresa!.id).order('creado');
    setDic((data ?? []) as DicEntrada[]); return (data ?? []) as DicEntrada[];
  }, [empresa]);
  useEffect(() => { cargarDic(); }, [cargarDic]);

  async function preguntar(texto = q, dicNuevo?: DicEntrada[]) {
    const dicAhora = dicNuevo ?? dic;   // tras enseñarle algo, con lo recién aprendido
    const pregunta = texto.trim(); if (!pregunta) return;
    setQ(pregunta); setBuscando(true); setError(null); setServido('');
    try {
      // primero, el periodo que dice la pregunta (con el anterior para comparar y 4 meses para los tiempos)
      const base: Contexto = { D: { trabajos: [], problemas: [], tareas: [], horarios: [], detalles: [], temas: [], naves: [], maquinas: [], unidad: '' }, dias: null, dic: dicAhora, aj, hoy: hoy(), pantalla };
      const E0 = entiende(pregunta, base, new Ayudas(base));
      const A = anterior(E0.per.d0, E0.per.d1), d4 = sumaD(hoy(), -120), ini = A.d0 < d4 ? A.d0 : d4, k = `${ini}|${E0.per.d1}`;
      const datos = cache.current.get(k) ?? await cargar(empresa!.id, ini, E0.per.d1, conHoras);
      cache.current.set(k, datos); ultimo.current = datos;
      const C: Contexto = { ...base, D: datos.D, dias: datos.dias };
      const Ay = new Ayudas(C), E = entiende(pregunta, C, Ay), r = contesta(E, C, Ay);
      const { data } = await limp().from('preguntas').insert({ empresa_id: empresa!.id, q: pregunta, respuesta: r.frase.slice(0, 4000),
        entendido: { periodo: E.per, personas: E.pers, sitio: E.sitio, problema: E.cat, dia: E.dsem, palabras: E.libres, ignoradas: E.ignoradas, que: E.int, grupo: E.grupo, medida: E.medida } })
        .select('id').maybeSingle();
      setRes({ E, r, id: (data as { id: string } | null)?.id ?? null });
    } catch (e) { setError((e as Error).message || 'No he podido contestar'); }
    setBuscando(false);
  }
  async function marcar(ok: boolean, queria?: string) {
    if (res?.id) await limp().from('preguntas').update({ ok, ...(queria ? { queria } : {}) }).eq('id', res.id);
    setServido(ok ? 'si' : 'no');
  }
  async function guardarFavorita() {
    const { error: e } = await limp().from('preguntas_dic').insert({ empresa_id: empresa!.id, tipo: 'favorita', palabra: res!.E.q });
    if (e) return aviso(textoError(e.message.includes('duplicate') ? 'Ya la tenías guardada.' : e.message));
    aviso('Guardada en tus preguntas'); cargarDic();
  }
  async function excel() {
    if (!res) return;
    const { E, r } = res;
    const filas = [[neg('Pregunta'), E.q], ['Periodo', `${E.per.t} (${E.per.d0} a ${E.per.d1})`], ['Respuesta', r.frase], [],
      ...(r.cols ? [cab(r.cols.map((c) => c || ' ')), ...r.filas] : []), ...(r.extra ?? []).flatMap((x) => [[], [neg(x.titulo)], cab(x.cols), ...x.filas])];
    const L = [...r.L].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const b = await libro([{ nombre: 'Respuesta', filas, anchos: [40, 18, 18, 14, 14, 14, 18, 14] },
      { nombre: 'Trabajos', anchos: [11, 30, 30, 18, 22, 10, 9, 11], filas: [cab(['Fecha', 'Trabajo', 'Descripción', 'Dónde', 'Quién', 'Estado', 'Minutos', 'Tiempo real']),
        ...(L.length ? L.map((o) => [o.fecha, o.titulo, o.descripcion ?? '', [o.maquina, o.lugar].filter(Boolean).join(' · '), o.hecho_por_nombre ?? o.asignados_nombres.join(', '), o.estado,
          o.estado === 'hecho' ? o.minutos ?? o.minutos_est ?? null : null, o.estado === 'hecho' ? (o.tiempo_auto ? 'Previsto' : 'Sí') : '']) : [['Ningún trabajo']])] }]);
    await bajarArchivo(b, 'pregunta-limpieza.xlsx');
  }

  const favoritas = dic.filter((d) => d.tipo === 'favorita');
  const nombres = [...new Set([...(ultimo.current?.D.horarios.map((h) => h.nombre) ?? []), ...(ultimo.current?.dias?.map((d) => d.nombre) ?? [])])].sort((a, b) => a.localeCompare(b, 'es'));
  const temas = ultimo.current?.D.temas.map((t) => t.nombre) ?? [];
  return (
    <section className="res-tarjeta">
      <div className="res-cab"><h3>Pregúntale</h3><button type="button" className="boton sec peq" onClick={() => setVerDic(true)}>Enséñale</button></div>
      <form className="res-pregunta" onSubmit={(e) => { e.preventDefault(); preguntar(); }}>
        <input type="search" aria-label="Tu pregunta" placeholder="Escribe tu pregunta…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="boton" disabled={buscando}>Preguntar</button>
      </form>
      {favoritas.length > 0 && <div className="res-chips">{favoritas.map((f) => <button key={f.id} type="button" className="boton sec peq" onClick={() => preguntar(f.palabra)}>☆ {f.palabra}</button>)}</div>}
      <details className="res-ejemplos"><summary>Ejemplos de preguntas</summary>
        <div className="res-chips">{EJEMPLOS.map((x) => <button key={x} type="button" className="boton sec peq" onClick={() => preguntar(x)}>{x}</button>)}</div></details>
      {buscando && <p className="nota">Buscando…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {res && !buscando && <RespuestaVista res={res} alLista={(titulo, L) => setLista({ titulo, L })}
        alEnsenar={(p) => setEnsenar({ palabra: p, tipo: 'frase' })} servido={servido} alServido={marcar} alPedir={() => setServido('pidiendo')}
        alFavorita={favoritas.some((f) => plano(f.palabra).trim() === plano(res.E.q).trim()) ? null : guardarFavorita} alExcel={excel} />}
      {servido === 'pidiendo' && <NoServido alCerrar={() => setServido('')} alEnviar={(t) => marcar(false, t)} />}
      {lista && <ListaTrabajos {...lista} alCerrar={() => setLista(null)} />}
      {ensenar && <Ensenar {...ensenar} nombres={nombres} temas={temas} alCerrar={() => setEnsenar(null)}
        alGuardar={async () => { setEnsenar(null); const d = await cargarDic(); aviso('Aprendido'); if (res) preguntar(res.E.q, d); }} />}
      {verDic && <Diccionario dic={dic} alCerrar={() => setVerDic(false)} alCambio={cargarDic} alEnsenar={() => { setVerDic(false); setEnsenar({ palabra: '', tipo: 'frase' }); }} />}
    </section>
  );
}

function RespuestaVista({ res, alLista, alEnsenar, servido, alServido, alPedir, alFavorita, alExcel }: {
  res: { E: Entendido; r: Respuesta }; alLista: (t: string, L: TrabInf[]) => void; alEnsenar: (p: string) => void; servido: string;
  alServido: (ok: boolean) => void; alPedir: () => void; alFavorita: (() => void) | null; alExcel: () => void;
}) {
  const { E, r } = res;
  const ent = [['Periodo', E.per.t], E.pers.length ? ['Persona', E.pers.join(', ')] : null, E.sitio ? ['Dónde', E.sitio.v] : null,
    E.conj ? ['Grupo', `${E.conj.n} (${E.conj.w.join(', ')})`] : null, E.cat ? ['Problema', E.cat === '*' ? 'todos los problemas' : E.cat] : null,
    E.dsem ? ['Día', E.dsem.map((d) => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d]).join(' y ')] : null, E.turno ? ['Turno', E.turno] : null,
    E.int === 'personas' && E.medida ? ['Quiero saber', MEDIDA_TXT[E.medida]] : QUE[E.int] ?? null,
    E.libres.length && E.ignoradas.length < E.libres.length ? ['Trabajo', E.libres.filter((w) => !E.ignoradas.includes(w)).join(' ')] : null].filter(Boolean) as [string, string][];
  const L = [...r.L].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const filas = (cols: string[], fs: (string | number)[][], rowL?: TrabInf[][]) => (
    <div className="lista compacta">{fs.slice(0, 60).map((f, i) => {
      const resto = f.slice(1).map((v, j) => (cols[j + 1] ? `${cols[j + 1]}: ${v}` : String(v))).join(' · ');
      const L2 = rowL?.[i];
      return L2?.length
        ? <button key={i} type="button" className="fila" onClick={() => alLista(String(f[0]).replace(/^\s*·\s*/, ''), L2)}>
          <span className="fila-txt"><b>{String(f[0])}</b><small>{resto}</small></span><span className="fila-flecha" aria-hidden="true">›</span></button>
        : <div key={i} className="fila fija"><span className="fila-txt"><b>{String(f[0])}</b><small>{resto}</small></span></div>;
    })}</div>
  );
  return (
    <div className="res-respuesta">
      <div className="res-entendido"><small>He entendido:</small>{ent.map(([a, b]) => <span key={a} className="res-pildora">{a}: {b}</span>)}</div>
      {E.ignoradas.length > 0 && (
        <div className="res-ignoradas"><p className="nota">No encuentro trabajos con «{E.ignoradas.join(' ')}»: no lo he tenido en cuenta.</p>
          <button type="button" className="boton sec peq" onClick={() => alEnsenar(E.ignoradas[0])}>Enseñar «{E.ignoradas[0]}»</button></div>)}
      <p className="res-frase">{r.frase}</p>
      {r.cols && r.filas.length > 0 && filas(r.cols, r.filas, r.rowL)}
      {r.rowL?.some((a) => a?.length) && <p className="nota">Toca una fila para ver sus trabajos.</p>}
      {(r.extra ?? []).filter((x) => x.filas.length).map((x) => <div key={x.titulo}><h4 className="res-titulo">{x.titulo}</h4>{filas(x.cols, x.filas)}</div>)}
      {L.length > 0 && (
        <details className="res-ejemplos"><summary>{L.length === 1 ? 'Ver el trabajo' : `Ver los ${L.length} trabajos`}</summary>
          <div className="lista compacta">{L.slice(0, 200).map((o) => <FilaTrabajo key={o.id} o={o} />)}</div></details>)}
      <div className="res-servido">
        {servido === '' && <><small>¿Te ha servido?</small>
          <button type="button" className="boton sec peq" onClick={() => alServido(true)}>Sí</button>
          <button type="button" className="boton sec peq" onClick={alPedir}>No es lo que quería</button></>}
        {servido === 'si' && <><small>Gracias, apuntado.</small>{alFavorita && <button type="button" className="boton sec peq" onClick={alFavorita}>☆ Guardar como favorita</button>}</>}
        {servido === 'no' && <small>Apuntado para revisarlo.</small>}
      </div>
      <div className="acciones-cal"><button type="button" className="boton sec peq" onClick={alExcel}>Excel de esta respuesta</button></div>
    </div>
  );
}

function FilaTrabajo({ o }: { o: TrabInf }) {
  const t = o.estado === 'hecho' ? horasTxt(o.minutos ?? o.minutos_est ?? 0) + (o.tiempo_auto || o.minutos == null ? ' (prev.)' : '') : 'Sin hacer';
  return <div className="fila fija"><span className="fila-txt"><b>{fCorta(o.fecha)} · {o.titulo}</b>
    <small>{[[o.maquina, o.lugar].filter(Boolean).join(' · '), o.hecho_por_nombre ?? o.asignados_nombres.join(', '), t].filter(Boolean).join(' · ')}</small></span></div>;
}
function ListaTrabajos({ titulo, L, alCerrar }: { titulo: string; L: TrabInf[]; alCerrar: () => void }) {
  return (
    <Ventana titulo={titulo} alCerrar={alCerrar} pie={<button type="button" className="boton sec" onClick={alCerrar}>Cerrar</button>}>
      <p><b>{L.length} {L.length === 1 ? 'vez' : 'veces'}</b></p>
      <div className="lista compacta">{[...L].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 300).map((o) => <FilaTrabajo key={o.id} o={o} />)}</div>
    </Ventana>
  );
}
function NoServido({ alCerrar, alEnviar }: { alCerrar: () => void; alEnviar: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <Ventana titulo="¿Qué querías saber?" alCerrar={alCerrar} pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
      <button type="button" className="boton" onClick={() => alEnviar(t)}>Enviar</button></>}>
      <p className="nota">Escríbelo con tus palabras. Se guarda para revisarlo y enseñarle a la app a entenderlo. Si es una palabra que no conoce (un mote, cómo llamáis a una máquina…), enséñasela ya en «Enséñale».</p>
      <label className="campo"><span>Lo que querías saber</span><textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} /></label>
    </Ventana>
  );
}
function Ensenar({ palabra, tipo, nombres, temas, alCerrar, alGuardar }: {
  palabra: string; tipo: DicEntrada['tipo']; nombres: string[]; temas: string[]; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const [s, setS] = useState({ tipo, palabra, valor: '' });
  const [error, setError] = useState<string | null>(null);
  const T = TIPOS.find((x) => x[0] === s.tipo)!;
  async function guardar() {
    if (!s.palabra.trim()) return setError('Escribe la palabra.');
    if (!s.valor.trim()) return setError('Falta lo que quiere decir.');
    const { error: e } = await limp().from('preguntas_dic').insert({ empresa_id: empresa!.id, tipo: s.tipo, palabra: s.palabra.trim(), valor: s.valor.trim() });
    if (e) return setError(e.message.includes('duplicate') ? 'Eso ya se lo habías enseñado.' : textoError(e.message));
    alGuardar();
  }
  return (
    <Ventana titulo="Enséñale" alCerrar={alCerrar} pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
      <button type="button" className="boton" onClick={guardar}>Guardar</button></>}>
      <label className="campo"><span>¿Qué le enseñas?</span>
        <select value={s.tipo} onChange={(e) => setS({ ...s, tipo: e.target.value as DicEntrada['tipo'], valor: '' })}>{TIPOS.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
      <label className="campo"><span>{T[2]}</span><input value={s.palabra} autoComplete="off" onChange={(e) => setS({ ...s, palabra: e.target.value })} /></label>
      <label className="campo"><span>{T[3]}</span>
        {s.tipo === 'persona' ? <select value={s.valor} onChange={(e) => setS({ ...s, valor: e.target.value })}><option value="">Elige</option>{nombres.map((n) => <option key={n}>{n}</option>)}</select>
          : s.tipo === 'problema' ? <select value={s.valor} onChange={(e) => setS({ ...s, valor: e.target.value })}><option value="">Elige</option>{temas.map((n) => <option key={n}>{n}</option>)}</select>
            : <input value={s.valor} autoComplete="off" onChange={(e) => setS({ ...s, valor: e.target.value })} />}</label>
      <p className="nota">{s.tipo === 'lugar' ? 'Escribe el lugar tal como aparece en los trabajos y cómo quieres que salga (por ejemplo «punto de consumo junto a m3» → «Punto de consumo M3»).'
        : s.tipo === 'grupo' ? 'Por ejemplo «hornos» → «horno, escoria, bolon». Basta con el principio de la palabra; las de 4 letras o menos valen enteras o en plural.'
          : s.tipo === 'frase' ? 'Sirve para motes y formas de decir las cosas: «la gorda» → «F19», «el finde» → «fin de semana».'
            : s.tipo === 'persona' ? 'Un mote o una forma corta del nombre: «Juanjo» → Juan José.' : 'Una palabra que quiere decir uno de los temas de Incidencias.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
function Diccionario({ dic, alCerrar, alCambio, alEnsenar }: { dic: DicEntrada[]; alCerrar: () => void; alCambio: () => void; alEnsenar: () => void }) {
  const { empresa } = useSesion();
  const [malas, setMalas] = useState<{ q: string; queria: string | null }[]>([]);
  useEffect(() => {
    limp().from('preguntas').select('q, queria').eq('empresa_id', empresa!.id).eq('ok', false).order('creado', { ascending: false }).limit(40)
      .then(({ data }) => setMalas((data ?? []) as { q: string; queria: string | null }[]));
  }, [empresa]);
  const NOM: Record<DicEntrada['tipo'], string> = { persona: 'Personas', lugar: 'Lugares', problema: 'Problemas', frase: 'Otras palabras', grupo: 'Grupos de trabajos', favorita: 'Preguntas favoritas' };
  async function borrar(id: string) {
    const { error } = await limp().from('preguntas_dic').delete().eq('id', id);
    if (error) return aviso(textoError(error.message));
    alCambio();
  }
  return (
    <Ventana titulo="Lo que sabe la app" alCerrar={alCerrar} pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cerrar</button>
      <button type="button" className="boton" onClick={alEnsenar}>＋ Enseñarle algo</button></>}>
      {!dic.length && <p className="nota">Todavía no le has enseñado nada.</p>}
      {(Object.keys(NOM) as DicEntrada['tipo'][]).map((k) => { const L = dic.filter((d) => d.tipo === k); if (!L.length) return null; return (
        <div key={k}><h4 className="res-titulo">{NOM[k]}</h4>
          <div className="lista compacta">{L.map((d) => (
            <div key={d.id} className="fila fija"><span className="fila-txt"><b>«{d.palabra}»</b>{k !== 'favorita' && <small>→ {d.valor}</small>}</span>
              <button type="button" className="boton sec peq" onClick={() => borrar(d.id)}>Borrar</button></div>))}</div></div>); })}
      {malas.length > 0 && (
        <details className="res-ejemplos"><summary>Preguntas que no ha entendido ({malas.length})</summary>
          <div className="lista compacta">{malas.map((p, i) => <div key={i} className="fila fija"><span className="fila-txt"><b>{p.q}</b>{p.queria && <small>Querías: {p.queria}</small>}</span></div>)}</div>
          <p className="nota">Para que aprenda las que no ha entendido, dile a Claude: «revisa las preguntas que no ha entendido la app».</p></details>)}
    </Ventana>
  );
}
