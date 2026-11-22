// Almacén → Stock (como la app vieja): pedidos en curso, lo que hay que pedir y las existencias por familia; la ficha de cada
// artículo; la lista de pedido (por proveedor, para copiar o mandar por WhatsApp) y el inventario de un almacén.
import { useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import { bajarArchivo, cab, libro, type Celda } from '../componentes/informes';
import {
  alm, almCorto, cantPedir, codMaq, consumoDia, dias, fCorta, fLarga, fmt, hoy, llegaEl, MESES, NIVEL, nivel, nombreDe, plano, plazoDe, puntoPedido,
  signo, stockDe, sumarDias, textoError, TIPOS, type Articulo, type Catalogo, type Nivel,
} from './datos';
import { detallesMov, dondeMov, FormMovimiento, stockEnFecha, type Inicial } from './Movimientos';

const CHAPA: Record<Nivel, string> = { bad: 'chapa mal', warn: 'chapa pendiente', ok: 'chapa firmado', na: 'chapa sin' };
const ORDEN_NIVEL: Record<Nivel, number> = { bad: 0, warn: 1, ok: 2, na: 3 };

/** «Central 12 · N2 3»: el stock de cada almacén, en corto. */
const porAlmacen = (c: Catalogo, a: Articulo) =>
  c.almacenes.filter((x) => stockDe(c, a.id, x.id) !== 0).map((x) => `${almCorto(c, x.id)} ${fmt(stockDe(c, a.id, x.id))}`).join(' · ');

export function Stock({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { puede } = useSesion();
  const ordenador = useOrdenador();
  const [familia, setFamilia] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const [mov, setMov] = useState<Inicial | null>(null);
  const [ventana, setVentana] = useState<'pedido' | 'inventario' | null>(null);
  const [mas, setMas] = useState(false);
  const pide = puede('almacen.pedido.apuntar'), apunta = puede('almacen.movimiento.apuntar');

  const vivos = c.articulos.filter((a) => !a.baja);
  const niv = useMemo(() => new Map(vivos.map((a) => [a.id, nivel(c, a)])), [c]);   // eslint-disable-line react-hooks/exhaustive-deps
  const famNombre = (id: string | null) => nombreDe(c.familias, id) || 'Sin familia';
  const pedidos = vivos.filter((a) => c.fichas.get(a.id)?.pedido_en).sort((a, b) => (llegaEl(c, a) ?? '9').localeCompare(llegaEl(c, b) ?? '9'));
  const paraPedir = vivos.filter((a) => (niv.get(a.id) === 'bad' || niv.get(a.id) === 'warn') && !c.fichas.get(a.id)?.pedido_en)
    .sort((a, b) => ORDEN_NIVEL[niv.get(a.id)!] - ORDEN_NIVEL[niv.get(b.id)!] || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const trozos = plano(q).split(/\s+/).filter(Boolean);
  const textoBusca = (a: Articulo) => { const f = c.fichas.get(a.id); return plano(`${a.nombre} ${a.codigo} ${f?.ubicacion ?? ''} ${f?.ref_proveedor ?? ''} ${(f?.maquinas ?? []).map((m) => codMaq(c, m)).join(' ')}`); };
  const lista = vivos.filter((a) => (!familia || a.familia_id === familia) && trozos.every((t) => textoBusca(a).includes(t)))
    .sort((a, b) => famNombre(a.familia_id).localeCompare(famNombre(b.familia_id), 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const cifra = (a: Articulo) => stockDe(c, a.id, almacen || null);

  async function marcar(a: Articulo, cantidad: number) {
    const { error } = await alm().rpc('marcar_pedido', { p_articulo: a.id, p_cantidad: cantidad });
    if (error) return aviso(textoError(error.message));
    aviso('Marcado como pedido'); recargar();
  }
  async function anular(a: Articulo) {
    if (!confirm(`¿Quitar la marca de pedido de ${a.nombre}?`)) return;
    const { error } = await alm().rpc('anular_pedido', { p_articulo: a.id });
    if (error) return aviso(textoError(error.message));
    aviso('Pedido anulado'); recargar();
  }
  async function excel() {
    const filas: Celda[][] = [cab(['Familia', 'Artículo', 'Código', 'Stock', 'Unidad', 'Mínimo', 'Pedir al llegar a', 'Estado', ...c.almacenes.map((x) => x.nombre)])];
    lista.forEach((a) => filas.push([famNombre(a.familia_id), a.nombre, a.codigo, stockDe(c, a.id), a.unidad, a.minimo, Math.round(puntoPedido(c, a) * 100) / 100,
      NIVEL[niv.get(a.id)!], ...c.almacenes.map((x) => stockDe(c, a.id, x.id) || null)]));
    bajarArchivo(await libro([{ nombre: 'Stock', filas, anchos: [18, 40, 14, 8, 7, 8, 10, 10, ...c.almacenes.map(() => 12)] }]), `Stock almacén ${hoy()}.xlsx`);
  }

  const estado = (a: Articulo) => <span className={CHAPA[niv.get(a.id)!]}>{NIVEL[niv.get(a.id)!]}</span>;
  // repaso con Cristian del 22/11: debajo del nombre, solo el stock de cada almacén (lo demás, en la ficha)
  const lineaArt = (a: Articulo) => porAlmacen(c, a) || 'Sin existencias';
  const retrasados = pedidos.filter((a) => { const l = llegaEl(c, a); return l && l < hoy(); }).length;
  const filtrando = !!familia || !!almacen;
  const botonMas = <button type="button" className={'boton sec peq' + (filtrando ? ' con-marca' : '')} aria-expanded={mas} onClick={() => setMas((x) => !x)}>⋯ Más{filtrando ? ' (filtrado)' : ''}</button>;

  return (
    <>
      {/* pedidos en curso y para pedir, plegados con su número (repaso del 22/11) */}
      {pedidos.length > 0 && (
        <details className="plegable">
          <summary>Pedidos en curso ({pedidos.length}){retrasados ? <span className="naranja"> · {retrasados} retrasado{retrasados > 1 ? 's' : ''}</span> : null}</summary>
          <section aria-label="Pedidos en curso" className="lista">
            {pedidos.map((a) => {
              const f = c.fichas.get(a.id)!, l = llegaEl(c, a), tarde = l && l < hoy() ? dias(l, hoy()) : 0;
              return (
                <div key={a.id} className="fila">
                  <span className="fila-txt"><b>{a.nombre}</b>
                    <small>Pedido el {fCorta(f.pedido_en)}{f.pedido_cantidad ? ` · ${fmt(f.pedido_cantidad)} ${a.unidad}` : ''}{f.proveedor_id ? ` · ${nombreDe(c.proveedores, f.proveedor_id)}` : ''} · {l ? `llega el ${fCorta(l)}` : 'sin plazo de entrega'}</small>
                    <span className="botones-fila">
                      {apunta && <button type="button" className="boton peq" onClick={() => setMov({ tipo: 'entrada', articulo_id: a.id, cantidad: f.pedido_cantidad ?? undefined, proveedor_id: f.proveedor_id ?? undefined })}>Ha llegado</button>}
                      {pide && <button type="button" className="boton sec peq" onClick={() => anular(a)}>Anular pedido</button>}
                    </span></span>
                  <span className={tarde ? 'chapa mal' : l ? 'chapa firmado' : 'chapa sin'}>{tarde ? `Retrasado ${tarde} d` : l ? 'En plazo' : 'Pedido'}</span>
                </div>);
            })}
          </section>
        </details>)}
      {paraPedir.length > 0 && (
        <details className="plegable">
          <summary>Para pedir ({paraPedir.length}){paraPedir.some((a) => niv.get(a.id) === 'bad') ? <span className="error"> · {paraPedir.filter((a) => niv.get(a.id) === 'bad').length} bajo mínimo</span> : null}</summary>
          <section aria-label="Para pedir" className="lista">
            {paraPedir.map((a) => {
              const f = c.fichas.get(a.id), cp = cantPedir(c, a);
              return (
                <div key={a.id} className="fila">
                  <span className="fila-txt"><button type="button" className="enlace" onClick={() => setFicha(a)}><b>{a.nombre}</b></button>
                    <small>Mín {fmt(a.minimo ?? 0)} · pedir al llegar a {fmt(Math.round(puntoPedido(c, a)))}{f?.proveedor_id ? ` · ${nombreDe(c.proveedores, f.proveedor_id)}` : ''}</small>
                    {pide && <span className="botones-fila"><button type="button" className="boton sec peq" onClick={() => marcar(a, cp)}>Marcar pedido{cp ? ` (${fmt(cp)} ${a.unidad})` : ''}</button></span>}</span>
                  <span className="fila-cifra">{fmt(stockDe(c, a.id))} {a.unidad} {estado(a)}</span>
                </div>);
            })}
          </section>
        </details>)}

      {!ordenador && (
        <div className="buscar-mas">
          <input aria-label="Buscar artículo" value={q} placeholder="Buscar artículo, código, máquina…" onChange={(e) => setQ(e.target.value)} />
          {botonMas}
        </div>)}
      {mas && (
        <div className="panel-mas" role="group" aria-label="Más opciones del stock">
          <div className="filtros">
            <label className="campo"><span>Familia</span><select value={familia} onChange={(e) => setFamilia(e.target.value)}>
              <option value="">Todas</option>{c.familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
            <label className="campo"><span>Cifra de</span><select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">Todos los almacenes</option>{c.almacenes.filter((x) => !x.baja).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
          </div>
          <div className="acciones-cal">
            {pide && <button type="button" className="boton sec peq" onClick={() => setVentana('pedido')}>Lista de pedido{paraPedir.length ? ` · ${paraPedir.length}` : ''}</button>}
            {apunta && <button type="button" className="boton sec peq" onClick={() => setVentana('inventario')}>Inventario</button>}
            <button type="button" className="boton sec peq" onClick={excel}>Excel</button>
          </div>
        </div>)}
      {almacen && <p className="nota">Cifras de {nombreDe(c.almacenes, almacen)}.</p>}
      {ordenador ? (
        <Tabla filas={lista} clave={(a) => a.id} alAbrir={setFicha} etiquetaBuscar="Buscar artículo" pistaBuscar="Artículo, código, máquina, ubicación…" buscarEn={textoBusca}
          acciones={botonMas}
          filtros={[{ clave: 'pedir', texto: 'Crítico o pedir', cumple: (a) => niv.get(a.id) === 'bad' || niv.get(a.id) === 'warn' },
            { clave: 'sin', texto: 'Sin existencias', cumple: (a) => stockDe(c, a.id) <= 0 }]}
          columnas={[
            { clave: 'fam', titulo: 'Familia', valor: (a) => famNombre(a.familia_id) },
            { clave: 'nombre', titulo: 'Artículo', valor: (a) => <><b>{a.nombre}</b><small className="suave"> · {lineaArt(a)}</small></>, orden: (a) => a.nombre },
            { clave: 'stock', titulo: almacen ? 'Hay aquí' : 'Hay', numero: true, valor: (a) => `${fmt(cifra(a))} ${a.unidad}`, orden: cifra },
            { clave: 'min', titulo: 'Mínimo', numero: true, valor: (a) => fmt(a.minimo) },
            { clave: 'estado', titulo: 'Estado', valor: estado, orden: (a) => ORDEN_NIVEL[niv.get(a.id)!] },
          ]} />
      ) : (
        <div className="lista">
          {lista.map((a, i) => (
            <div key={a.id}>
              {!familia && (i === 0 || lista[i - 1].familia_id !== a.familia_id) && <h3 className="grupo-lista">{famNombre(a.familia_id)}</h3>}
              <button type="button" className={'fila nivel-' + niv.get(a.id)} onClick={() => setFicha(a)}>
                <span className="fila-txt"><b>{a.nombre}</b><small>{lineaArt(a)}</small></span>
                <span className="fila-cifra">{fmt(cifra(a))} {a.unidad}</span>
              </button>
            </div>))}
          {!lista.length && <div className="vacio"><p>No hay artículos{q || familia ? ' con esos filtros' : ''}.</p></div>}
        </div>
      )}
      {ficha && <FichaArticulo c={c} a={ficha} alCerrar={() => setFicha(null)} alApuntar={(i) => { setFicha(null); setMov(i); }} />}
      {mov && <FormMovimiento c={c} inicial={mov} alCerrar={() => setMov(null)} alGuardar={() => { setMov(null); recargar(); }} />}
      {ventana === 'pedido' && <ListaPedido c={c} articulos={paraPedir} alCerrar={() => setVentana(null)} alMarcar={() => { setVentana(null); recargar(); }} />}
      {ventana === 'inventario' && <Inventario c={c} alCerrar={() => setVentana(null)} alGuardar={() => { setVentana(null); recargar(); }} />}
    </>
  );
}

/** La ficha de un artículo: cifras, datos, stock por almacén, últimos movimientos y consumo por meses. */
export function FichaArticulo({ c, a, alCerrar, alApuntar }: { c: Catalogo; a: Articulo; alCerrar: () => void; alApuntar: (i: Inicial) => void }) {
  const { puede } = useSesion();
  const [pest, setPest] = useState<'general' | 'movs' | 'consumo'>('general');
  const f = c.fichas.get(a.id), n = nivel(c, a), st = stockDe(c, a.id), cd = consumoDia(c, a.id), pl = plazoDe(c, a.id);
  const dura = cd > 0 ? st / cd : null;
  const movs = c.movs.filter((m) => m.articulo_id === a.id).slice().reverse();
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - 11 + i); return d.toLocaleDateString('sv-SE').slice(0, 7); });
  const porMes = meses.map((m) => movs.filter((x) => x.tipo === 'salida' && !x.perdida && x.fecha.startsWith(m)).reduce((s, x) => s + x.cantidad, 0));
  const mx = Math.max(1, ...porMes);
  const desde90 = sumarDias(hoy(), -90);
  const destinos = new Map<string, number>();
  movs.filter((m) => m.tipo === 'salida' && m.fecha >= desde90).forEach((m) => {
    const ks = m.activos.length ? m.activos.map((x) => codMaq(c, x)) : [m.centro_id ? nombreDe(c.centros, m.centro_id) : 'Sin decir'];
    ks.forEach((k) => destinos.set(k, (destinos.get(k) ?? 0) + m.cantidad / ks.length));
  });
  const apunta = puede('almacen.movimiento.apuntar');
  const dato = (t: string, v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : <><dt>{t}</dt><dd>{v}</dd></>);
  return (
    <Ventana titulo={a.nombre} alCerrar={alCerrar} pie={apunta ? <>
      <button type="button" className="boton sec" onClick={() => alApuntar({ tipo: 'ajuste', articulo_id: a.id })}>Contar</button>
      <button type="button" className="boton sec" onClick={() => alApuntar({ tipo: 'entrada', articulo_id: a.id })}>Entrada</button>
      <button type="button" className="boton" onClick={() => alApuntar({ tipo: 'salida', articulo_id: a.id })}>Consumo</button></> : undefined}>
      <p><span className={CHAPA[n]}>{n === 'bad' ? 'Bajo mínimo' : n === 'warn' ? 'Para pedir' : n === 'ok' ? 'Correcto' : 'Sin mínimo'}</span> <span className="suave">{nombreDe(c.familias, a.familia_id)}</span></p>
      <dl className="cifras-ficha">
        <div><dt>Stock</dt><dd>{fmt(st)} {a.unidad}</dd></div>
        <div><dt>Mínimo</dt><dd>{fmt(a.minimo ?? 0)}</dd></div>
        <div><dt>Dura</dt><dd className={dura !== null && dura < 14 ? 'error' : ''}>{dura === null ? '—' : dura > 365 ? '+1 año' : `${Math.floor(dura)} días`}</dd></div>
        <div><dt>Pedir ahora</dt><dd>{fmt(cantPedir(c, a)) || '—'}</dd></div>
      </dl>
      <div className="segmentos tres" role="group" aria-label="Qué ver">
        {([['general', 'General'], ['movs', `Movimientos (${movs.length})`], ['consumo', 'Por meses']] as const).map(([k, t]) =>
          <button key={k} type="button" className={'segmento' + (pest === k ? ' activo' : '')} aria-pressed={pest === k} onClick={() => setPest(k)}>{t}</button>)}
      </div>
      {pest === 'general' && <>
        <dl className="datos-ficha">
          {dato('Código', a.codigo)}{dato('Unidad', a.unidad)}{dato('Envase', f?.envase)}{dato('Ubicación', f?.ubicacion)}
          {dato('Proveedor', nombreDe(c.proveedores, f?.proveedor_id))}{dato('Referencia del proveedor', f?.ref_proveedor)}
          {dato('Plazo de entrega', pl ? `${pl} días` : null)}{dato('Pedir al llegar a', fmt(Math.round(puntoPedido(c, a))))}
          {dato('Consumo al día', cd ? fmt(Math.round(cd * 100) / 100) : null)}
          {dato('Va en', (f?.maquinas ?? []).map((m) => codMaq(c, m)).join(', '))}{dato('Almacén principal', nombreDe(c.almacenes, f?.almacen_principal_id))}
          {dato('Pedido', f?.pedido_en ? `el ${fLarga(f.pedido_en)}${f.pedido_cantidad ? ` (${fmt(f.pedido_cantidad)} ${a.unidad})` : ''}` : null)}
          {dato('Notas', f?.notas)}
        </dl>
        <h3 className="titulo-ir">Stock por almacén</h3>
        <ul className="lista-simple">{c.almacenes.filter((x) => stockDe(c, a.id, x.id) !== 0).map((x) => <li key={x.id}>{x.nombre}: <b>{fmt(stockDe(c, a.id, x.id))} {a.unidad}</b></li>)}
          {!porAlmacen(c, a) && <li>Sin existencias</li>}</ul>
      </>}
      {pest === 'movs' && (
        <ul className="lista-simple">{movs.slice(0, 60).map((m) => (
          <li key={m.id}><b>{fCorta(m.fecha)}</b> · {TIPOS[m.tipo]} <b>{m.tipo === 'traslado' ? fmt(m.cantidad) : (signo(m) > 0 ? '+' : '') + fmt(signo(m))}</b> · {dondeMov(c, m)}
            {detallesMov(c, m) && <small className="suave"> · {detallesMov(c, m)}</small>}</li>))}
          {!movs.length && <li>Sin movimientos en el último año.</li>}</ul>)}
      {pest === 'consumo' && <>
        <div className="barras-mes" aria-label="Consumo por mes">
          {meses.map((m, i) => <div key={m} className="barra-mes" title={`${MESES[Number(m.slice(5)) - 1]}: ${fmt(porMes[i])}`}>
            <span style={{ height: `${(porMes[i] / mx) * 100}%` }} /><small>{MESES[Number(m.slice(5)) - 1].slice(0, 3)}</small><b>{porMes[i] ? fmt(Math.round(porMes[i])) : ''}</b></div>)}
        </div>
        <h3 className="titulo-ir">Para dónde (últimos 90 días)</h3>
        <ul className="lista-simple">{[...destinos].sort((x, y) => y[1] - x[1]).map(([k, v]) => <li key={k}>{k}: <b>{fmt(Math.round(v * 100) / 100)} {a.unidad}</b></li>)}
          {!destinos.size && <li>Nada en los últimos 90 días.</li>}</ul>
      </>}
    </Ventana>
  );
}

/** La lista de pedido: por proveedor, para copiar o mandar por WhatsApp; y marcarlo todo como pedido. */
function ListaPedido({ c, articulos, alCerrar, alMarcar }: { c: Catalogo; articulos: Articulo[]; alCerrar: () => void; alMarcar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const grupos = new Map<string, Articulo[]>();
  articulos.forEach((a) => { const p = nombreDe(c.proveedores, c.fichas.get(a.id)?.proveedor_id) || 'Sin proveedor'; grupos.set(p, [...(grupos.get(p) ?? []), a]); });
  const texto = [...grupos].sort((x, y) => x[0].localeCompare(y[0], 'es')).map(([p, l]) => `*${p}*\n` + l.map((a) => {
    const r = c.fichas.get(a.id)?.ref_proveedor;
    return `- ${a.nombre}${r ? ` (ref. ${r})` : ''}: pedir ${fmt(cantPedir(c, a))} ${a.unidad} (hay ${fmt(stockDe(c, a.id))}, mínimo ${fmt(a.minimo ?? 0)})${nivel(c, a) === 'bad' ? ' · URGENTE' : ''}`;
  }).join('\n')).join('\n\n');
  async function copiar() { try { await navigator.clipboard.writeText(texto); aviso('Copiado'); } catch { aviso('No se ha podido copiar: selecciónalo a mano'); } }
  async function marcarTodo() {
    if (!confirm(`¿Marcar como pedidos los ${articulos.length} artículos de la lista (hoy)?`)) return;
    setOcupado(true);
    for (const a of articulos) {
      const { error } = await alm().rpc('marcar_pedido', { p_articulo: a.id, p_cantidad: cantPedir(c, a) });
      if (error) { setOcupado(false); return aviso(textoError(error.message)); }
    }
    setOcupado(false); aviso('Marcados como pedidos'); alMarcar();
  }
  return (
    <Ventana titulo="Lista de pedido" alCerrar={alCerrar} pie={articulos.length ? <>
      <button type="button" className="boton sec" onClick={copiar}>Copiar texto</button>
      <a className="boton sec" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
      <button type="button" className="boton" disabled={ocupado} onClick={marcarTodo}>Marcar como pedido ({articulos.length})</button></> : undefined}>
      {articulos.length ? <pre className="texto-pedido">{texto}</pre> : <p>No hay nada que pedir ahora mismo.</p>}
      <p className="nota">Cuánto pedir = hasta el mínimo, más lo que se gasta mientras llega (consumo al día × plazo), menos lo que hay.</p>
    </Ventana>
  );
}

/** Inventario de un almacén: lo que dice la app, lo que has contado y la diferencia; se guarda un recuento por cada artículo contado. */
function Inventario({ c, alCerrar, alGuardar }: { c: Catalogo; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa, estado } = useSesion();
  const [almacen, setAlmacen] = useState(c.almacenes.find((x) => !x.baja)?.id ?? '');
  const [fecha, setFecha] = useState(hoy());
  const [familia, setFamilia] = useState('');
  const [todos, setTodos] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombreAlm = nombreDe(c.almacenes, almacen);
  const suyos = c.articulos.filter((a) => !a.baja && (!familia || a.familia_id === familia)
    && (todos || stockDe(c, a.id, almacen) !== 0 || c.fichas.get(a.id)?.almacen_principal_id === almacen))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const teo = (id: string) => stockEnFecha(c, id, almacen, fecha);

  async function guardar() {
    setError(null);
    const puestas = Object.entries(v).filter(([, x]) => x.trim() !== '');
    if (!puestas.length) return setError('Pon lo que has contado de algún artículo.');
    if (puestas.some(([, x]) => !(Number(x.replace(',', '.')) >= 0))) return setError('Las cantidades tienen que ser números (0 o más).');
    const filas = puestas.map(([id, x]) => {
      const n = Number(x.replace(',', '.')), t = teo(id);
      return { empresa_id: empresa!.id, fecha, tipo: 'ajuste', articulo_id: id, almacen_id: almacen, cantidad: Math.round((n - t) * 1000) / 1000, contado: n, teorico: t,
        nota: `Inventario de ${nombreAlm}`, creado_por: estado.fase === 'dentro' ? estado.sesion.usuario?.id : null };
    });
    setOcupado(true);
    const { error: e } = await alm().from('movimientos').insert(filas);
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(`Inventario guardado (${filas.length})`); alGuardar();
  }
  return (
    <Ventana titulo="Inventario" alCerrar={alCerrar} pie={<button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar el inventario</button>}>
      <div className="fila-campos">
        <label className="campo"><span>Almacén</span><select value={almacen} onChange={(e) => { setAlmacen(e.target.value); setV({}); }}>
          {c.almacenes.filter((x) => !x.baja).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label className="campo"><span>Fecha del recuento</span><input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>
      <label className="campo"><span>Familia</span><select value={familia} onChange={(e) => setFamilia(e.target.value)}>
        <option value="">Todas</option>{c.familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Ver también los artículos que no están en este almacén</label>
      <p className="nota">Pon solo lo que cuentes; lo que dejes vacío no cambia. Se guarda un recuento por cada uno (la diferencia).</p>
      <table className="tabla-inventario">
        <thead><tr><th>Artículo</th><th className="num">Según la app</th><th className="num">Contado</th><th className="num">Dif.</th></tr></thead>
        <tbody>{suyos.map((a) => {
          const t = teo(a.id), x = v[a.id] ?? '', n = Number(x.replace(',', '.')), d = x.trim() !== '' && Number.isFinite(n) ? n - t : null;
          const mucha = d !== null && Math.abs(d) > Math.max(1, Math.abs(t) * 0.1);
          return (
            <tr key={a.id}><td>{a.nombre} <small className="suave">{a.unidad}</small></td><td className="num">{fmt(t)}</td>
              <td className="num"><input inputMode="decimal" aria-label={`Contado de ${a.nombre}`} value={x} onChange={(e) => setV((o) => ({ ...o, [a.id]: e.target.value }))} /></td>
              <td className={'num' + (mucha ? ' error' : '')}>{d === null ? '' : (d > 0 ? '+' : '') + fmt(d)}</td></tr>);
        })}</tbody>
      </table>
      {!suyos.length && <p className="nota">No hay artículos en este almacén. Marca «Ver también…» para contar otros.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
