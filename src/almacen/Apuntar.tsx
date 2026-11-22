// Almacén → Apuntar (como la app vieja): escribes o dictas lo que ha pasado, la app lo lee por reglas (gratis) y te enseña una
// tarjeta por movimiento para revisar antes de guardar. Si eliges a mano un artículo que no conocía, aprende la palabra.
// También: botones directos, escáner de códigos, notas pendientes, «lo que sueles apuntar» y «apuntado hoy».
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { alm, almCorto, codMaq, fmt, hoy, nombreDe, nomAlmacen, plano, signo, stockDe, sumarDias, textoError, TIPOS, type Articulo, type Catalogo, type Mov } from './datos';
import { faltan, leer, type Propuesta } from './lector';
import { ElegirArticulo, FormMovimiento, stockEnFecha, type Inicial } from './Movimientos';
import { FichaArticulo } from './Stock';

interface Nota { id: string; texto: string; creado: string }

export function Apuntar({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id ?? null : null;
  const [texto, setTexto] = useState('');
  const [props, setProps] = useState<Propuesta[] | null>(null);
  const [desdeNotas, setDesdeNotas] = useState<string[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [form, setForm] = useState<Inicial | null>(null);
  const [escaner, setEscaner] = useState(false);
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [oyendo, setOyendo] = useState(false);
  const [vez, setVez] = useState(0);

  useEffect(() => {
    alm().from('notas').select('id, texto, creado').eq('empresa_id', empresa!.id).order('creado')
      .then(({ data }) => setNotas((data ?? []) as Nota[]));
  }, [empresa, vez]);

  function entender(t = texto, notasUsadas: string[] = []) {
    const l = leer(t, c, hoy());
    if (!l.length) return aviso('Escribe qué ha pasado (por ejemplo: «2 guantes para la F27»).');
    setProps(l); setDesdeNotas(notasUsadas);
  }
  async function guardarNota() {
    if (!texto.trim()) return;
    const { error } = await alm().from('notas').insert({ empresa_id: empresa!.id, texto: texto.trim().slice(0, 2000) });
    if (error) return aviso(textoError(error.message));
    setTexto(''); aviso('Guardado como nota'); setVez((v) => v + 1);
  }
  function dictar() {
    type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start: () => void };
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return aviso('Este móvil no deja dictar desde la app: pulsa el micrófono del teclado.');
    const r = new R(); r.lang = 'es-ES'; r.interimResults = false;
    r.onresult = (e) => setTexto((t) => (t ? t.trimEnd() + '. ' : '') + Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = () => setOyendo(false); r.onerror = () => setOyendo(false);
    setOyendo(true); r.start();
  }

  const cambiar = (i: number, p: Partial<Propuesta>) => setProps((l) => l!.map((x, k) => (k === i ? { ...x, ...p, auto: (p.auto ?? x.auto).filter((a) => !Object.keys(p).includes(a)) } : x)));
  const conFaltas = (props ?? []).filter((p) => faltan(p).length).length;

  async function guardarTodo() {
    if (!props?.length || conFaltas) return;
    setOcupado(true);
    const filas = props.map((p) => {
      const teorico = p.tipo === 'ajuste' ? stockEnFecha(c, p.articulo_id!, p.almacen_id!, p.fecha) : null;
      return {
        empresa_id: empresa!.id, fecha: p.fecha, tipo: p.tipo, articulo_id: p.articulo_id, almacen_id: p.almacen_id, destino_id: p.tipo === 'traslado' ? p.destino_id : null,
        cantidad: p.tipo === 'ajuste' ? Math.round((p.cantidad! - teorico!) * 1000) / 1000 : p.cantidad, contado: p.tipo === 'ajuste' ? p.cantidad : null, teorico,
        centro_id: p.tipo === 'salida' ? p.centro_id : null, activos: p.tipo === 'salida' ? p.activos : [], persona_id: p.tipo === 'salida' ? p.persona_id : null,
        proveedor_id: p.tipo === 'entrada' ? p.proveedor_id : null, albaran: p.tipo === 'entrada' ? p.albaran : null, nota: p.texto.slice(0, 1000), creado_por: yo,
      };
    });
    const { error } = await alm().from('movimientos').insert(filas);
    if (error) { setOcupado(false); return aviso(textoError(error.message)); }
    // aprender las palabras de los artículos elegidos a mano
    const nuevas = props.filter((p) => p.auto.includes('aprender') && p.palabras && p.articulo_id)
      .filter((p) => !c.sinonimos.some((s) => plano(s.palabra) === plano(p.palabras)));
    const vistas = new Set<string>();
    for (const p of nuevas) {
      if (vistas.has(plano(p.palabras))) continue; vistas.add(plano(p.palabras));
      await alm().from('sinonimos').insert({ empresa_id: empresa!.id, palabra: p.palabras.slice(0, 80), articulo_id: p.articulo_id });
    }
    if (desdeNotas.length) await alm().from('notas').delete().in('id', desdeNotas);
    setOcupado(false); setProps(null); setTexto(''); setDesdeNotas([]);
    aviso(`Apuntado (${filas.length})${vistas.size ? ` · he aprendido ${vistas.size === 1 ? 'una palabra' : `${vistas.size} palabras`}` : ''}`);
    setVez((v) => v + 1); recargar();
  }

  // «Lo que sueles apuntar»: consumos que se repiten (artículo + almacén + máquina) en 60 días, con la cantidad más habitual
  const sueles = useMemo(() => {
    const desde = sumarDias(hoy(), -60), g = new Map<string, Mov[]>();
    c.movs.filter((m) => m.tipo === 'salida' && m.fecha >= desde).forEach((m) => { const k = `${m.articulo_id}|${m.almacen_id}|${m.activos.join(',')}`; g.set(k, [...(g.get(k) ?? []), m]); });
    return [...g.values()].filter((l) => l.length >= 2).sort((a, b) => b.length - a.length).slice(0, 8).map((l) => {
      const n = new Map<number, number>(); l.forEach((m) => n.set(m.cantidad, (n.get(m.cantidad) ?? 0) + 1));
      const cant = [...n].sort((a, b) => b[1] - a[1])[0][0];
      return { m: l[0], cant, veces: l.length };
    });
  }, [c]);
  const deHoy = c.movs.filter((m) => m.fecha === hoy() && !m.origen).slice().reverse();

  return (
    <>
      <h2 className="titulo-ir">¿Qué quieres apuntar?</h2>
      <div className="acciones-cal">
        <button type="button" className="boton peq" onClick={() => setForm({ tipo: 'salida' })}>Consumo</button>
        <button type="button" className="boton sec peq" onClick={() => setForm({ tipo: 'entrada' })}>Entrada</button>
        <button type="button" className="boton sec peq" onClick={() => setForm({ tipo: 'traslado' })}>Traslado</button>
        <button type="button" className="boton sec peq" onClick={() => setForm({ tipo: 'ajuste' })}>Recuento</button>
        <button type="button" className="boton sec peq" onClick={() => setEscaner(true)}>Escanear código</button>
      </div>

      <label className="campo"><span>O escríbelo (o díctalo) como lo dirías</span>
        <textarea rows={3} value={texto} maxLength={2000} placeholder="Ej.: 2 guantes para la F27 y 10 l de aceite en N2. Ayer llegaron 20 cajas de trapos, albarán 1234"
          onChange={(e) => setTexto(e.target.value)} /></label>
      <div className="acciones-cal">
        <button type="button" className="boton" onClick={() => entender()} disabled={!texto.trim()}>Entender</button>
        <button type="button" className="boton sec" onClick={dictar} disabled={oyendo}>{oyendo ? 'Escuchando…' : 'Dictar'}</button>
        <button type="button" className="boton sec" onClick={guardarNota} disabled={!texto.trim()}>Guardar como nota</button>
      </div>

      {props && (
        <section className="tarjetas-apuntar" aria-label="Para revisar">
          <h2 className="titulo-ir">Revisa antes de guardar</h2>
          {props.map((p, i) => <TarjetaPropuesta key={i} c={c} p={p} alCambiar={(x) => cambiar(i, x)} alQuitar={() => setProps((l) => l!.filter((_, k) => k !== i))} />)}
          <div className="pie-apuntar">
            <button type="button" className="boton" disabled={ocupado || !props.length || conFaltas > 0} onClick={guardarTodo}>
              {conFaltas ? `Faltan datos en ${conFaltas} de ${props.length}` : `Guardar todo (${props.length})`}</button>
            <button type="button" className="boton sec" onClick={() => { setProps(null); setDesdeNotas([]); }}>Descartar</button>
          </div>
        </section>)}

      {notas.length > 0 && (
        <section aria-label="Notas pendientes">
          <h2 className="titulo-ir">Notas pendientes ({notas.length})</h2>
          <div className="lista">{notas.map((n) => (
            <div key={n.id} className="fila"><span className="fila-txt"><b>{n.texto}</b><small>{new Date(n.creado).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              <span className="botones-fila"><button type="button" className="boton sec peq" onClick={() => entender(n.texto, [n.id])}>Procesar</button>
                <button type="button" className="boton sec peq" onClick={async () => { await alm().from('notas').delete().eq('id', n.id); setVez((v) => v + 1); }}>Borrar</button></span></span></div>))}
          </div>
          <button type="button" className="boton sec peq" onClick={() => entender(notas.map((n) => n.texto).join('.\n'), notas.map((n) => n.id))}>Procesar todas</button>
        </section>)}

      {sueles.length > 0 && (
        <section aria-label="Lo que sueles apuntar">
          <h2 className="titulo-ir">Lo que sueles apuntar</h2>
          <div className="mosaicos-cortos">{sueles.map(({ m, cant }) => (
            <button key={m.articulo_id + m.almacen_id + m.activos.join()} type="button" className="boton sec peq"
              onClick={() => setForm({ tipo: 'salida', articulo_id: m.articulo_id, almacen_id: m.almacen_id, activos: m.activos, centro_id: m.centro_id ?? undefined, cantidad: cant })}>
              {fmt(cant)} {nombreDe(c.articulos, m.articulo_id)}{m.activos.length ? ` · ${m.activos.map((x) => codMaq(c, x)).join(', ')}` : ''} · {almCorto(c, m.almacen_id)}</button>))}
          </div>
        </section>)}

      <section aria-label="Apuntado hoy">
        <h2 className="titulo-ir">Apuntado hoy ({deHoy.length})</h2>
        {deHoy.length ? <ul className="lista-simple">{deHoy.map((m) => (
          <li key={m.id}>{new Date(m.creado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {TIPOS[m.tipo]} <b>{m.tipo === 'traslado' ? fmt(m.cantidad) : (signo(m) > 0 ? '+' : '') + fmt(signo(m))}</b> {nombreDe(c.articulos, m.articulo_id)} · {almCorto(c, m.almacen_id)}</li>))}</ul>
          : <p className="nota">Todavía nada hoy.</p>}
      </section>

      {form && <FormMovimiento c={c} inicial={form} alCerrar={() => setForm(null)} alGuardar={() => { setForm(null); setVez((v) => v + 1); recargar(); }} />}
      {escaner && <Escaner c={c} alCerrar={() => setEscaner(false)} alElegir={(a, que) => { setEscaner(false); if (que === 'ficha') setFicha(a); else setForm({ tipo: que, articulo_id: a.id }); }} />}
      {ficha && <FichaArticulo c={c} a={ficha} alCerrar={() => setFicha(null)} alApuntar={(i) => { setFicha(null); setForm(i); }} />}
    </>
  );
}

/** Una tarjeta del lector: lo que ha entendido, con todo cambiable. */
function TarjetaPropuesta({ c, p, alCambiar, alQuitar }: { c: Catalogo; p: Propuesta; alCambiar: (x: Partial<Propuesta>) => void; alQuitar: () => void }) {
  const f = faltan(p);
  const a = c.articulos.find((x) => x.id === p.articulo_id);
  const hay = p.articulo_id && p.almacen_id ? stockDe(c, p.articulo_id, p.almacen_id) : null;
  const queda = hay === null || p.cantidad === null ? null : p.tipo === 'entrada' ? hay + p.cantidad : p.tipo === 'ajuste' ? p.cantidad : hay - p.cantidad;
  const auto = (k: string) => (p.auto.includes(k) ? <small className="suave"> · auto</small> : null);
  const almacenes = c.almacenes.filter((x) => !x.baja);
  return (
    <div className={'tarjeta-apunte' + (f.length ? ' con-faltas' : '')}>
      <p className="suave">«{p.texto}»</p>
      <div className="fila-campos">
        <label className="campo"><span>Qué{auto('tipo')}</span>
          <select value={p.tipo} onChange={(e) => alCambiar({ tipo: e.target.value as Mov['tipo'] })}>
            {(['salida', 'entrada', 'traslado', 'ajuste'] as const).map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}</select></label>
        <label className="campo"><span>{p.tipo === 'ajuste' ? 'Hay (contados)' : 'Cantidad'}{a ? ` (${a.unidad})` : ''}</span>
          <input inputMode="decimal" value={p.cantidad ?? ''} onChange={(e) => alCambiar({ cantidad: e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.')) })} /></label>
        <label className="campo"><span>Fecha</span><input type="date" value={p.fecha} max={hoy()} onChange={(e) => alCambiar({ fecha: e.target.value })} /></label>
      </div>
      <ElegirArticulo c={c} valor={p.articulo_id ?? ''} alCambiar={(id) => alCambiar({ articulo_id: id || null, auto: [...p.auto.filter((x) => x !== 'aprender'), ...(p.palabras && id ? ['aprender'] : [])] })} />
      {p.dudas.filter((d) => !(p.articulo_id && /artículo|¿Cuál|No conozco/.test(d)) && !(p.cantidad !== null && /cuántos/.test(d))).map((d) => <p key={d} className="aviso-linea">{d}</p>)}
      {p.auto.includes('aprender') && p.palabras && <p className="nota">La próxima vez, «{p.palabras}» será {a?.nombre}.</p>}
      <div className="fila-campos">
        <label className="campo"><span>{p.tipo === 'traslado' ? 'Desde' : 'Almacén'}{auto('almacen')}</span>
          <select value={p.almacen_id ?? ''} onChange={(e) => alCambiar({ almacen_id: e.target.value || null })}><option value="">Elige</option>
            {almacenes.map((x) => <option key={x.id} value={x.id}>{x.nombre}{p.articulo_id ? ` (${fmt(stockDe(c, p.articulo_id, x.id))})` : ''}</option>)}</select></label>
        {p.tipo === 'traslado' && <label className="campo"><span>Hasta{auto('destino')}</span>
          <select value={p.destino_id ?? ''} onChange={(e) => alCambiar({ destino_id: e.target.value || null })}><option value="">Elige</option>
            {almacenes.filter((x) => x.id !== p.almacen_id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
        {p.tipo === 'salida' && <label className="campo"><span>Quién se lo lleva</span>
          <select value={p.persona_id ?? ''} onChange={(e) => alCambiar({ persona_id: e.target.value || null })}><option value="">—</option>
            {c.personas.filter((x) => !x.baja && !c.gestores.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
      </div>
      <p className="calculo">
        {p.tipo === 'salida' && (p.activos.length || p.centro_id) ? <>Para {p.activos.length ? p.activos.map((x) => codMaq(c, x)).join(', ') : nombreDe(c.centros, p.centro_id)} · </> : null}
        {p.tipo === 'entrada' && p.proveedor_id ? <>{nombreDe(c.proveedores, p.proveedor_id)}{p.albaran ? ` · alb. ${p.albaran}` : ''} · </> : null}
        {hay !== null && <>En {nomAlmacen(c, p.almacen_id)} hay <b>{fmt(hay)}</b>{queda !== null && <> → {p.tipo === 'ajuste' ? 'pasa a' : 'quedan'} <b className={queda < 0 ? 'error' : ''}>{fmt(queda)}</b></>}</>}
      </p>
      <div className="pie-tarjeta">
        {f.length ? <span className="error">Falta: {f.join(', ')}</span> : <span className="chapa firmado">Listo</span>}
        <button type="button" className="boton sec peq" onClick={alQuitar}>Quitar</button>
      </div>
    </div>
  );
}

/** Escáner: el lector del móvil (BarcodeDetector) o, si no lo tiene (iPhone), la librería ZXing (gratis). */
function Escaner({ c, alCerrar, alElegir }: { c: Catalogo; alCerrar: () => void; alElegir: (a: Articulo, que: 'ficha' | 'entrada' | 'salida') => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [leido, setLeido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aMano, setAMano] = useState('');
  const art = leido ? buscarPorCodigo(c, leido) : null;
  useEffect(() => {
    if (leido) return;
    let parar = () => {};
    (async () => {
      try {
        type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
        const W = window as unknown as { BarcodeDetector?: new (o?: object) => BD };
        if (W.BarcodeDetector) {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.current!.srcObject = s; await video.current!.play();
          const d = new W.BarcodeDetector();
          let vivo = true; parar = () => { vivo = false; s.getTracks().forEach((t) => t.stop()); };
          const mirar = async () => { if (!vivo) return; try { const r = await d.detect(video.current!); if (r[0]) { setLeido(r[0].rawValue); parar(); return; } } catch { /* sigue */ } setTimeout(mirar, 250); };
          mirar();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const lector = new BrowserMultiFormatReader();
          const ctl = await lector.decodeFromVideoDevice(undefined, video.current!, (r) => { if (r) { setLeido(r.getText()); ctl.stop(); } });
          parar = () => ctl.stop();
        }
      } catch { setError('No puedo abrir la cámara. Escribe el código abajo.'); }
    })();
    return () => parar();
  }, [leido]);
  return (
    <Ventana titulo="Escanear código" alCerrar={alCerrar} pie={art ? <>
      <button type="button" className="boton sec" onClick={() => alElegir(art, 'ficha')}>Ver ficha</button>
      <button type="button" className="boton sec" onClick={() => alElegir(art, 'entrada')}>Entrada</button>
      <button type="button" className="boton" onClick={() => alElegir(art, 'salida')}>Consumo</button></> : undefined}>
      {!leido && !error && <video ref={video} className="video-escaner" muted playsInline />}
      {error && <p className="aviso-linea">{error}</p>}
      {leido && (art ? <p>Leído <b>{leido}</b>: <b>{art.nombre}</b> (hay {fmt(stockDe(c, art.id))} {art.unidad}).</p>
        : <p className="aviso-linea">Leído «{leido}»: no hay ningún artículo con ese código.</p>)}
      <div className="fila-campos">
        <label className="campo"><span>Código a mano</span><input value={aMano} onChange={(e) => setAMano(e.target.value)} /></label>
        <button type="button" className="boton sec" onClick={() => aMano.trim() && setLeido(aMano.trim())}>Buscar</button>
        {leido && <button type="button" className="boton sec" onClick={() => { setLeido(null); setAMano(''); }}>Leer otro</button>}
      </div>
    </Ventana>
  );
}

/** Artículo de un código leído: código, referencia del proveedor o EAN exactos; si no, un código de 4+ letras contenido en lo leído. */
export function buscarPorCodigo(c: Catalogo, leido: string): Articulo | null {
  const l = plano(leido).replace(/\s+/g, '');
  const vivos = c.articulos.filter((a) => !a.baja);
  const exacto = vivos.find((a) => plano(a.codigo) === l || plano(c.fichas.get(a.id)?.ref_proveedor) === l || plano(c.fichas.get(a.id)?.atributos?.ean) === l);
  if (exacto) return exacto;
  return vivos.filter((a) => a.codigo.length >= 4 && l.includes(plano(a.codigo))).sort((a, b) => b.codigo.length - a.codigo.length)[0] ?? null;
}
