// Almacén → Movimientos: el historial por meses (con filtros) y el formulario de entrada, consumo, traslado y recuento.
// Las comprobaciones son las de la app vieja: que no quede en negativo, «cantidad rara» (avisa una vez), destino distinto del origen.
import { useEffect, useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import {
  alm, almacenPorDefecto, almCorto, codMaq, fCorta, fLarga, fmt, hoy, nombreDe, nomAlmacen, nomMes, plano, relevoAhora, signo, stockDe, textoError, todas, TIPOS,
  type Catalogo, type Mov,
} from './datos';
import { libro, bajarArchivo, cab, type Celda } from '../componentes/informes';

export type Inicial = Partial<Pick<Mov, 'tipo' | 'articulo_id' | 'almacen_id' | 'destino_id' | 'cantidad' | 'proveedor_id' | 'centro_id' | 'activos' | 'persona_id' | 'nota' | 'albaran' | 'fecha'>>;

/** Lo que se va a guardar de un movimiento (sin id). */
export type Nuevo = Omit<Mov, 'id' | 'creado' | 'creado_por' | 'origen'>;

/** Avisos de «cantidad rara» (como la vieja): se enseñan una vez; si se vuelve a pulsar Guardar, se guarda. */
export function cantidadRara(c: Catalogo, m: Pick<Mov, 'tipo' | 'articulo_id' | 'almacen_id' | 'cantidad'>): string | null {
  const art = c.articulos.find((a) => a.id === m.articulo_id);
  if (m.tipo === 'salida' && m.cantidad > stockDe(c, m.articulo_id, m.almacen_id))
    return `En ${nomAlmacen(c, m.almacen_id)} solo hay ${fmt(stockDe(c, m.articulo_id, m.almacen_id))}: quedaría en negativo.`;
  if (m.tipo === 'entrada' || m.tipo === 'salida') {
    const antes = c.movs.filter((x) => x.articulo_id === m.articulo_id && x.tipo === m.tipo).map((x) => x.cantidad);
    if (antes.length >= 3) {
      const mx = Math.max(...antes);
      if (m.cantidad > 3 * mx && m.cantidad - mx >= 3) return `Es mucho más de lo normal (lo más apuntado en un año: ${fmt(mx)}).`;
    } else if (m.tipo === 'entrada' && art?.minimo && m.cantidad > 20 * art.minimo) return `Es más de 20 veces el mínimo (${fmt(art.minimo)}).`;
  }
  return null;
}

/** Stock que había en un almacén al final de un día (para los recuentos con fecha pasada). */
export const stockEnFecha = (c: Catalogo, art: string, almacen: string, f: string) =>
  stockDe(c, art, almacen) - c.movs.filter((m) => m.articulo_id === art && m.fecha > f && (m.almacen_id === almacen || m.destino_id === almacen))
    .reduce((s, m) => s + signo(m, almacen), 0);

/** Elegir artículo: escribes un trozo del nombre o del código y se queda con lo que cuadra (los más usados, primero). */
export function ElegirArticulo({ c, valor, alCambiar, etiqueta = 'Artículo' }: { c: Catalogo; valor: string; alCambiar: (id: string) => void; etiqueta?: string }) {
  const [q, setQ] = useState('');
  const usados = useMemo(() => {
    const n = new Map<string, number>(); const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('sv-SE');
    c.movs.forEach((m) => { if (m.tipo === 'salida' && m.fecha >= desde) n.set(m.articulo_id, (n.get(m.articulo_id) ?? 0) + 1); });
    return n;
  }, [c]);
  const trozos = plano(q).split(/\s+/).filter(Boolean);
  const lista = c.articulos.filter((a) => !a.baja || a.id === valor).filter((a) => { const t = plano(`${a.nombre} ${a.codigo}`); return trozos.every((x) => t.includes(x)); })
    .sort((a, b) => (usados.get(b.id) ?? 0) - (usados.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  useEffect(() => { if (trozos.length && lista.length === 1 && lista[0].id !== valor) alCambiar(lista[0].id); });
  return (
    <div className="campo"><span>{etiqueta}</span>
      <input aria-label="Buscar artículo" placeholder="Escribe parte del nombre o del código" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label={etiqueta} value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">{lista.length ? `Elige (${lista.length})` : 'Nada con ese nombre'}</option>
        {lista.slice(0, 300).map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.codigo && !/^[a-z0-9-]+$/.test(a.codigo) || /\d/.test(a.codigo) ? ` · ${a.codigo}` : ''}</option>)}
        {valor && !lista.some((a) => a.id === valor) && <option value={valor}>{nombreDe(c.articulos, valor)}</option>}
      </select>
    </div>
  );
}

/** Formulario de un movimiento (nuevo o para corregir uno). */
export function FormMovimiento({ c, inicial, editar, alCerrar, alGuardar, soloSalida }: {
  c: Catalogo; inicial?: Inicial; editar?: Mov; alCerrar: () => void; alGuardar: () => void; soloSalida?: boolean;
}) {
  const { empresa, estado } = useSesion();
  const base = editar ?? inicial ?? {};
  const [tipo, setTipo] = useState<Mov['tipo']>(base.tipo ?? 'salida');
  const [fecha, setFecha] = useState(base.fecha ?? hoy());
  const [art, setArt] = useState(base.articulo_id ?? '');
  const [desde, setDesde] = useState(base.almacen_id ?? '');
  const [hasta, setHasta] = useState(base.destino_id ?? '');
  const [cant, setCant] = useState(editar ? String(editar.tipo === 'ajuste' ? editar.contado ?? '' : editar.cantidad) : base.cantidad != null ? String(base.cantidad) : '');
  const [para, setPara] = useState(() => {
    const a = base.activos ?? [];
    return a.length > 1 ? 'varias' : a.length === 1 ? 'm:' + a[0] : base.centro_id ? 'c:' + base.centro_id : '';
  });
  const [varias, setVarias] = useState<string[]>(base.activos && base.activos.length > 1 ? base.activos : []);
  const [persona, setPersona] = useState(base.persona_id ?? '');
  const [gestor, setGestor] = useState(editar?.gestor_id ?? '');
  const [relevo, setRelevo] = useState(String(editar?.extra?.relevo ?? (fecha === hoy() ? relevoAhora() : '')));
  const [perdida, setPerdida] = useState(editar?.perdida ?? false);
  const [motivo, setMotivo] = useState(editar?.motivo ?? '');
  const [prov, setProv] = useState(base.proveedor_id ?? '');
  const [albaran, setAlbaran] = useState(base.albaran ?? '');
  const [nota, setNota] = useState(base.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [avisado, setAvisado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // al elegir artículo (o cambiar de tipo) se pone el almacén de siempre
  const ponerAlmacenes = (t: Mov['tipo'], a: string) => {
    if (!a) return;
    const d = almacenPorDefecto(c, t, a, desde || null);
    setDesde(d.desde ?? ''); setHasta(d.hasta ?? '');
    if (t === 'entrada') { const f = c.fichas.get(a); if (f?.proveedor_id && !prov) setProv(f.proveedor_id); if (f?.pedido_cantidad && !cant) setCant(String(f.pedido_cantidad)); }
  };
  const elegirArt = (a: string) => { setArt(a); if (!editar) ponerAlmacenes(tipo, a); };
  const elegirTipo = (t: Mov['tipo']) => { setTipo(t); setAvisado(null); if (!editar) ponerAlmacenes(t, art); };

  const a = c.articulos.find((x) => x.id === art);
  const n = Number(String(cant).replace(',', '.'));
  const hay = art && desde ? stockDe(c, art, desde) - (editar ? signo(editar, desde) : 0) : 0;
  const teorico = art && desde && tipo === 'ajuste' ? stockEnFecha(c, art, desde, fecha) - (editar?.tipo === 'ajuste' ? editar.cantidad : 0) : 0;
  const despues = tipo === 'entrada' ? hay + n : tipo === 'ajuste' ? n : hay - n;
  const maquinasPara = para === 'varias' ? varias : para.startsWith('m:') ? [para.slice(2)] : [];
  const naveDe = (id: string) => c.maquinas.find((m) => m.id === id)?.centro_id ?? null;
  const vivas = c.maquinas.filter((m) => !m.baja);
  const gestores = c.personas.filter((p) => c.gestores.has(p.id) && !p.baja);
  const operarios = c.personas.filter((p) => !p.baja && !c.gestores.has(p.id));

  async function guardar() {
    setError(null);
    if (!art) return setError('Elige el artículo.');
    if (!desde) return setError('Elige el almacén.');
    if (!fecha) return setError('Pon la fecha.');
    if (!(String(cant).trim() !== '' && Number.isFinite(n) && (tipo === 'ajuste' ? n >= 0 : n > 0))) return setError(tipo === 'ajuste' ? 'Pon cuántos hay de verdad (0 o más).' : 'Pon una cantidad mayor que 0.');
    if (tipo === 'traslado' && (!hasta || hasta === desde)) return setError('Elige a qué almacén va (distinto del de salida).');
    if (para === 'varias' && varias.length < 2) return setError('Marca al menos dos máquinas (o elige una sola).');
    const cantidad = tipo === 'ajuste' ? Math.round((n - teorico) * 1000) / 1000 : n;
    const rara = tipo === 'ajuste' || editar ? null : cantidadRara(c, { tipo, articulo_id: art, almacen_id: desde, cantidad: n });
    const falta = tipo === 'salida' && !persona && !editar ? 'No has dicho quién se lo lleva.' : null;
    const av = [rara, falta].filter(Boolean).join(' ');
    if (av && avisado !== av) { setAvisado(av); return; }
    const centro = tipo === 'salida' ? (para.startsWith('c:') ? para.slice(2) : maquinasPara.length ? naveDe(maquinasPara[0]) : null) : null;
    const fila: Nuevo = {
      empresa_id: empresa!.id, fecha, tipo, articulo_id: art, almacen_id: desde, destino_id: tipo === 'traslado' ? hasta : null, cantidad,
      contado: tipo === 'ajuste' ? n : null, teorico: tipo === 'ajuste' ? teorico : null,
      centro_id: centro, activos: tipo === 'salida' ? maquinasPara : [], persona_id: tipo === 'salida' ? persona || null : null,
      gestor_id: tipo === 'salida' ? gestor || null : null, perdida: tipo === 'salida' && perdida, motivo: motivo.trim() || null,
      proveedor_id: tipo === 'entrada' ? prov || null : null, albaran: tipo === 'entrada' ? albaran.trim() || null : null,
      pedido_en: tipo === 'entrada' ? editar?.pedido_en ?? null : null,
      nota: tipo === 'ajuste' && !nota.trim() && cantidad === 0 ? 'Recuento sin diferencias' : nota.trim() || null,
      extra: { ...(editar?.extra ?? {}), ...(tipo === 'salida' && relevo ? { relevo } : {}) },
    };
    setOcupado(true);
    const { error: e } = editar ? await alm().from('movimientos').update(fila).eq('id', editar.id)
      : await alm().from('movimientos').insert({ ...fila, creado_por: estado.fase === 'dentro' ? estado.sesion.usuario?.id : null });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(editar ? 'Corregido' : 'Apuntado'); alGuardar();
  }

  const almacenes = c.almacenes.filter((x) => !x.baja || x.id === desde || x.id === hasta);
  const conStock = (id: string) => (art ? stockDe(c, art, id) : 0);
  const opcionesAlm = (excluir?: string) => {
    const donde = almacenes.filter((x) => x.id !== excluir && art && conStock(x.id) !== 0), otros = almacenes.filter((x) => x.id !== excluir && !donde.includes(x));
    const op = (x: typeof almacenes[number]) => <option key={x.id} value={x.id}>{x.nombre}{art ? ` (${fmt(conStock(x.id))})` : ''}</option>;
    return <>{donde.length > 0 && <optgroup label="Donde está este artículo">{donde.map(op)}</optgroup>}{otros.length > 0 && <optgroup label={donde.length ? 'Otros almacenes' : 'Almacenes'}>{otros.map(op)}</optgroup>}</>;
  };

  return (
    <Ventana titulo={editar ? 'Corregir movimiento' : soloSalida ? 'Apuntar un consumo' : 'Apuntar un movimiento'} alCerrar={alCerrar}
      pie={<button type="button" className="boton" disabled={ocupado} onClick={guardar}>{avisado ? 'Guardar de todas formas' : 'Guardar'}</button>}>
      {!soloSalida && !editar && (
        <div className="segmentos" role="group" aria-label="Qué es">
          {(['entrada', 'salida', 'traslado', 'ajuste'] as const).map((t) => (
            <button key={t} type="button" className={'segmento' + (tipo === t ? ' activo' : '')} aria-pressed={tipo === t} onClick={() => elegirTipo(t)}>{TIPOS[t]}</button>))}
        </div>)}
      <label className="campo"><span>Fecha</span><input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></label>
      <ElegirArticulo c={c} valor={art} alCambiar={elegirArt} />
      <label className="campo"><span>{tipo === 'traslado' ? 'Desde' : 'Almacén'}</span>
        <select value={desde} onChange={(e) => setDesde(e.target.value)}><option value="">Elige</option>{opcionesAlm()}</select></label>
      {tipo === 'traslado' && <label className="campo"><span>Hasta</span>
        <select value={hasta} onChange={(e) => setHasta(e.target.value)}><option value="">Elige</option>{opcionesAlm(desde)}</select></label>}
      <label className="campo"><span>{tipo === 'ajuste' ? 'Cuántos hay de verdad (contados)' : `Cantidad${a ? ` (${a.unidad})` : ''}`}</span>
        <input inputMode="decimal" value={cant} onChange={(e) => { setCant(e.target.value); setAvisado(null); }} /></label>
      {art && desde && (
        <p className="calculo" aria-live="polite">
          {tipo === 'ajuste'
            ? <>Según la app, en {almCorto(c, desde)} {fecha === hoy() ? 'hay' : `había el ${fCorta(fecha)}`} <b>{fmt(teorico)}</b>{String(cant).trim() !== '' && Number.isFinite(n) && <> · ajuste <b>{n - teorico > 0 ? '+' : ''}{fmt(n - teorico)}</b></>}</>
            : <>En {almCorto(c, desde)} hay <b>{fmt(hay)}</b>{Number.isFinite(n) && n > 0 && <> → quedan <b className={despues < 0 ? 'error' : ''}>{fmt(tipo === 'traslado' ? hay - n : despues)}</b></>}
              {tipo === 'traslado' && hasta && Number.isFinite(n) && n > 0 && <> · en {almCorto(c, hasta)}: <b>{fmt(stockDe(c, art, hasta) + n)}</b></>}</>}
        </p>)}
      {tipo === 'salida' && <>
        <label className="campo"><span>Para (máquina o nave, si se sabe)</span>
          <select value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">—</option>
            <optgroup label="Naves">{c.centros.filter((x) => !x.baja).map((x) => <option key={x.id} value={'c:' + x.id}>{x.nombre}</option>)}</optgroup>
            <optgroup label="Máquinas">{vivas.map((m) => <option key={m.id} value={'m:' + m.id}>{m.codigo}</option>)}</optgroup>
            <option value="varias">Varias máquinas…</option>
          </select></label>
        {para === 'varias' && (
          <fieldset className="maquinas-varias"><legend>Marca las máquinas (cada una se lleva su parte)</legend>
            {vivas.map((m) => <label key={m.id} className="check"><input type="checkbox" checked={varias.includes(m.id)}
              onChange={(e) => setVarias((v) => (e.target.checked ? [...v, m.id] : v.filter((x) => x !== m.id)))} />{m.codigo}</label>)}
          </fieldset>)}
        <label className="campo"><span>Quién se lo lleva</span>
          <select value={persona} onChange={(e) => { setPersona(e.target.value); setAvisado(null); }}>
            <option value="">—</option>{operarios.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {editar?.extra?.se_lo_llevo ? <small className="nota">En la app vieja: {String(editar.extra.se_lo_llevo)}</small> : null}</label>
        <div className="fila-campos">
          <label className="campo"><span>Gestor de relevo</span>
            <select value={gestor} onChange={(e) => setGestor(e.target.value)}><option value="">—</option>{gestores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label className="campo"><span>Relevo</span>
            <select value={relevo} onChange={(e) => setRelevo(e.target.value)}><option value="">—</option>{['Mañana', 'Tarde', 'Noche'].map((r) => <option key={r}>{r}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" checked={perdida} onChange={(e) => setPerdida(e.target.checked)} />Es una pérdida (rotura, robo, caducado…): no cuenta como consumo normal</label>
        {perdida && <label className="campo"><span>Qué ha pasado</span><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} /></label>}
      </>}
      {tipo === 'entrada' && <div className="fila-campos">
        <label className="campo"><span>Proveedor</span>
          <select value={prov} onChange={(e) => setProv(e.target.value)}><option value="">—</option>{c.proveedores.filter((p) => !p.baja || p.id === prov).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label className="campo"><span>Nº de albarán</span><input value={albaran} maxLength={80} onChange={(e) => setAlbaran(e.target.value)} /></label>
      </div>}
      <label className="campo"><span>Nota</span><input value={nota} maxLength={1000} placeholder={tipo === 'ajuste' ? 'Recuento físico' : ''} onChange={(e) => setNota(e.target.value)} /></label>
      {avisado && <p className="aviso-linea" role="alert">{avisado} Si está bien, pulsa «Guardar de todas formas».</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** Texto de «dónde» de un movimiento: «A → B» o «almacén · máquinas o nave». */
export function dondeMov(c: Catalogo, m: Mov) {
  if (m.tipo === 'traslado') return `${almCorto(c, m.almacen_id)} → ${almCorto(c, m.destino_id!)}`;
  const para = m.activos.length ? m.activos.map((x) => codMaq(c, x)).join(', ') : m.centro_id ? nombreDe(c.centros, m.centro_id) : '';
  return [almCorto(c, m.almacen_id), para].filter(Boolean).join(' · ');
}
/** Los detalles de un movimiento (quién, proveedor, albarán, nota…). */
export function detallesMov(c: Catalogo, m: Mov) {
  return [
    m.tipo === 'ajuste' && m.contado != null ? `contados ${fmt(m.contado)}` : '',
    m.proveedor_id ? nombreDe(c.proveedores, m.proveedor_id) : '', m.albaran ? `Alb. ${m.albaran}` : '',
    m.persona_id ? `Se lo lleva: ${nombreDe(c.personas, m.persona_id)}` : m.extra?.se_lo_llevo ? `Se lo llevó: ${String(m.extra.se_lo_llevo)}` : '',
    m.gestor_id ? `Gestor: ${nombreDe(c.personas, m.gestor_id)}${m.extra?.relevo ? ` (${String(m.extra.relevo)})` : m.extra?.unidad ? ` (${String(m.extra.unidad)})` : ''}` : '',
    m.perdida ? `Pérdida${m.motivo ? `: ${m.motivo}` : ''}` : m.motivo ?? '', m.nota ?? '',
  ].filter(Boolean).join(' · ');
}

/** El historial: un mes cada vez (el actual por defecto), con filtros. */
export function Movimientos({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, puede } = useSesion();
  const ordenador = useOrdenador();
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [L, setL] = useState<Mov[] | null>(null);
  const [tipo, setTipo] = useState<'' | Mov['tipo'] | 'perdida'>('');
  const [almacen, setAlmacen] = useState('');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState<Mov | 'nuevo' | null>(null);
  const [vez, setVez] = useState(0);
  const corrige = puede('almacen.movimiento.corregir'), apunta = puede('almacen.movimiento.apuntar');
  const meses = useMemo(() => { const out: string[] = []; const d = new Date(); for (let i = 0; i < 24; i++) { out.push(new Date(d.getFullYear(), d.getMonth() - i, 15).toLocaleDateString('sv-SE').slice(0, 7)); } return out; }, []);

  useEffect(() => {
    setL(null);
    const [a, m] = mes.split('-').map(Number);
    const fin = new Date(a, m, 0).toLocaleDateString('sv-SE');
    todas<Mov>((x, y) => alm().from('movimientos').select('*').eq('empresa_id', empresa!.id).gte('fecha', mes + '-01').lte('fecha', fin)
      .order('fecha', { ascending: false }).order('creado', { ascending: false }).range(x, y))
      .then((d) => setL(d.map((x) => ({ ...x, cantidad: Number(x.cantidad) })))).catch((e) => { aviso(textoError(e.message)); setL([]); });
  }, [empresa, mes, vez]);

  const vistos = (L ?? []).filter((m) => (!tipo || (tipo === 'perdida' ? m.perdida : m.tipo === tipo)) && (!almacen || m.almacen_id === almacen || m.destino_id === almacen)
    && (!q || plano(`${nombreDe(c.articulos, m.articulo_id)} ${detallesMov(c, m)} ${dondeMov(c, m)}`).includes(plano(q))));
  const ud = (m: Mov) => c.articulos.find((a) => a.id === m.articulo_id)?.unidad ?? '';
  const cantTxt = (m: Mov) => `${m.tipo === 'traslado' ? '' : signo(m) > 0 ? '+' : ''}${fmt(m.tipo === 'traslado' ? m.cantidad : signo(m))} ${ud(m)}`;
  const listo = () => { setAbierto(null); setVez((v) => v + 1); recargar(); };

  async function borrar(m: Mov) {
    if (!confirm(`¿Borrar este movimiento (${TIPOS[m.tipo].toLowerCase()} de ${nombreDe(c.articulos, m.articulo_id)})? El stock se recalcula.`)) return;
    const { error } = await alm().from('movimientos').delete().eq('id', m.id);
    if (error) return aviso(textoError(error.message));
    aviso('Borrado'); listo();
  }
  async function excel() {
    const filas: Celda[][] = [cab(['Fecha', 'Tipo', 'Artículo', 'Cantidad', 'Unidad', 'Dónde', 'Detalles'])];
    vistos.forEach((m) => filas.push([fLarga(m.fecha), TIPOS[m.tipo], nombreDe(c.articulos, m.articulo_id), m.tipo === 'traslado' ? m.cantidad : signo(m), ud(m), dondeMov(c, m), detallesMov(c, m)]));
    bajarArchivo(await libro([{ nombre: 'Movimientos', filas, anchos: [11, 10, 40, 10, 8, 26, 60] }]), `Movimientos almacén ${mes}.xlsx`);
  }

  const botones = (m: Mov) => corrige && (
    <span className="botones-fila">
      <button type="button" className="boton sec peq" onClick={() => setAbierto(m)}>Corregir</button>
      <button type="button" className="boton sec peq" onClick={() => borrar(m)}>Borrar</button>
    </span>);

  return (
    <>
      <div className="acciones-cal">
        {apunta && <button type="button" className="boton peq" onClick={() => setAbierto('nuevo')}>+ Apuntar un movimiento</button>}
        <button type="button" className="boton sec peq" disabled={!vistos.length} onClick={excel}>Excel</button>
      </div>
      <div className="filtros">
        <label className="campo"><span>Mes</span><select value={mes} onChange={(e) => setMes(e.target.value)}>{meses.map((m) => <option key={m} value={m}>{nomMes(m)}</option>)}</select></label>
        <label className="campo"><span>Qué</span><select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="">Todo</option>{(['entrada', 'salida', 'traslado', 'ajuste'] as const).map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}<option value="perdida">Pérdidas</option></select></label>
        <label className="campo"><span>Almacén</span><select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
          <option value="">Todos</option>{c.almacenes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        {!ordenador && <label className="campo"><span>Buscar</span><input value={q} placeholder="Artículo, persona, máquina, nota…" onChange={(e) => setQ(e.target.value)} /></label>}
      </div>
      {L === null ? <p className="nota">Cargando…</p> : ordenador ? (
        <Tabla filas={vistos} clave={(m) => m.id} etiquetaBuscar="Buscar en los movimientos" pistaBuscar="Artículo, persona, máquina, nota…"
          buscarEn={(m) => `${nombreDe(c.articulos, m.articulo_id)} ${detallesMov(c, m)} ${dondeMov(c, m)}`} vacio={<p>No hay movimientos en {nomMes(mes)}{tipo || almacen ? ' con esos filtros' : ''}.</p>}
          ordenInicial={{ clave: 'fecha', asc: false }} claseFila={(m) => (m.perdida ? 'naranja' : '')}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', valor: (m) => fCorta(m.fecha), orden: (m) => m.fecha + m.creado },
            { clave: 'tipo', titulo: 'Qué', valor: (m) => TIPOS[m.tipo] },
            { clave: 'art', titulo: 'Artículo', valor: (m) => <><b>{nombreDe(c.articulos, m.articulo_id)}</b>{detallesMov(c, m) && <small className="suave"> · {detallesMov(c, m)}</small>}</> , orden: (m) => nombreDe(c.articulos, m.articulo_id) },
            { clave: 'cant', titulo: 'Cantidad', numero: true, valor: cantTxt, orden: (m) => signo(m) },
            { clave: 'donde', titulo: 'Dónde', valor: (m) => dondeMov(c, m) },
            ...(corrige ? [{ clave: 'acc', titulo: '', valor: (m: Mov) => botones(m), orden: () => null }] : []),
          ]} />
      ) : !vistos.length ? <div className="vacio"><p>No hay movimientos en {nomMes(mes)}{tipo || almacen || q ? ' con esos filtros' : ''}.</p></div> : (
        <div className="lista">
          {vistos.map((m) => (
            <div key={m.id} className={'fila' + (m.perdida ? ' naranja' : '')}>
              <span className="fila-txt"><b>{nombreDe(c.articulos, m.articulo_id)}</b>
                <small>{fCorta(m.fecha)} · {TIPOS[m.tipo]} · {dondeMov(c, m)}</small>
                {detallesMov(c, m) && <small>{detallesMov(c, m)}</small>}
                {botones(m)}</span>
              <span className="fila-cifra">{cantTxt(m)}</span>
            </div>))}
        </div>
      )}
      <p className="nota">{vistos.length} de {(L ?? []).length} movimientos de {nomMes(mes)}.</p>
      {abierto && <FormMovimiento c={c} editar={abierto === 'nuevo' ? undefined : abierto} alCerrar={() => setAbierto(null)} alGuardar={listo} />}
    </>
  );
}
