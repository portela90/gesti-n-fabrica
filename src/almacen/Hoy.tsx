// Almacén → Hoy (como la app vieja, con lo que ya existe en la nueva): cuatro cifras, «lo urgente» con su botón,
// lo apuntado hoy y este mes. Los avisos de pistones, ejes, aceites y averías llegan con sus trozos (2 a 4).
import { useEffect, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { alm, cantPedir, fCorta, fmt, hoy, llegaEl, MESES, nivel, nombreDe, almCorto, signo, TIPOS, type Catalogo } from './datos';
import { paraBajar, prevision } from './reponer';
import { FormMovimiento, type Inicial } from './Movimientos';

interface Aviso { clave: string; nivel: 'bad' | 'warn' | 'info'; texto: string; detalle?: string; boton: string; accion: () => void }

const OCULTOS = 'gf-almacen-avisos-ocultos';
const leerOcultos = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(OCULTOS) ?? '{}'); } catch { return {}; } };

export function Hoy({ c, recargar, ir }: { c: Catalogo; recargar: () => void; ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  const h = hoy();
  const [mov, setMov] = useState<Inicial | null>(null);
  const [todos, setTodos] = useState(false);
  const [ocultos, setOcultos] = useState(leerOcultos);
  const [notas, setNotas] = useState(0);
  const apunta = puede('almacen.movimiento.apuntar');
  useEffect(() => {
    if (!apunta) return;
    alm().from('notas').select('id').eq('empresa_id', empresa!.id).then(({ data }) => setNotas((data ?? []).length));
  }, [empresa, apunta]);

  const vivos = c.articulos.filter((a) => !a.baja);
  const pedir = vivos.filter((a) => ['bad', 'warn'].includes(nivel(c, a)) && !c.fichas.get(a.id)?.pedido_en);
  const bajoMin = pedir.filter((a) => nivel(c, a) === 'bad');
  const bajar = paraBajar(c, h);
  const nBajar = new Set(bajar.map((f) => f.articulo_id)).size;
  const negativos: { art: string; alm: string; n: number }[] = [];
  c.stock.forEach((m, art) => m.forEach((n, a) => { if (n < -1e-9 && vivos.some((x) => x.id === art)) negativos.push({ art, alm: a, n }); }));
  const retrasados = vivos.filter((a) => { const l = llegaEl(c, a); return c.fichas.get(a.id)?.pedido_en && l && l < h; });
  const previstos = vivos.filter((a) => !c.fichas.get(a.id)?.pedido_en && (prevision(c, a, h)?.pedir ?? 0) > 0);
  const naves = [...new Set(bajar.map((f) => almCorto(c, f.almacen_id)))];

  const avisos: Aviso[] = [
    ...(pedir.length ? [{ clave: 'pedir', nivel: bajoMin.length ? 'bad' : 'warn', texto: `${pedir.length} artículo${pedir.length > 1 ? 's' : ''} para pedir${bajoMin.length ? ` (${bajoMin.length} bajo mínimo)` : ''}`,
      detalle: pedir.slice(0, 4).map((a) => `${a.nombre} (${fmt(cantPedir(c, a))} ${a.unidad})`).join(' · ') + (pedir.length > 4 ? '…' : ''), boton: 'Ver en Stock', accion: () => ir('/m/almacen/stock') }] as Aviso[] : []),
    ...(negativos.length ? [{ clave: 'negativos', nivel: 'bad', texto: `${negativos.length} artículo${negativos.length > 1 ? 's' : ''} no cuadra${negativos.length > 1 ? 'n' : ''} (sale en negativo)`,
      detalle: negativos.slice(0, 4).map((x) => `${nombreDe(c.articulos, x.art)} en ${almCorto(c, x.alm)}: ${fmt(x.n)}`).join(' · '), boton: 'Contar',
      accion: () => setMov({ tipo: 'ajuste', articulo_id: negativos[0].art, almacen_id: negativos[0].alm }) }] as Aviso[] : []),
    ...(retrasados.length ? [{ clave: 'retrasados', nivel: 'warn', texto: `${retrasados.length} pedido${retrasados.length > 1 ? 's' : ''} retrasado${retrasados.length > 1 ? 's' : ''}`,
      detalle: retrasados.map((a) => `${a.nombre} (llegaba el ${fCorta(llegaEl(c, a))})`).join(' · '), boton: 'Ver pedidos', accion: () => ir('/m/almacen/stock') }] as Aviso[] : []),
    ...(nBajar ? [{ clave: 'bajar', nivel: 'warn', texto: `Bajar ${nBajar} artículo${nBajar > 1 ? 's' : ''} a planta`, detalle: `A ${naves.join(', ')}`, boton: 'Reponer', accion: () => ir('/m/almacen/reponer') }] as Aviso[] : []),
    ...(previstos.length ? [{ clave: 'previsto-' + h.slice(0, 7), nivel: 'info', texto: `Pedido previsto hasta fin del mes que viene: ${previstos.length} artículo${previstos.length > 1 ? 's' : ''}`,
      boton: 'Ver previsión', accion: () => ir('/m/almacen/reponer') }] as Aviso[] : []),
    ...(notas ? [{ clave: 'notas-' + h, nivel: 'info', texto: `${notas} nota${notas > 1 ? 's' : ''} sin procesar en Apuntar`, boton: 'Apuntar', accion: () => ir('/m/almacen/apuntar') }] as Aviso[] : []),
  ];
  const orden = { bad: 0, warn: 1, info: 2 };
  const visibles = avisos.filter((a) => !(a.nivel === 'info' && ocultos[a.clave])).sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  const nOcultos = avisos.length - visibles.length;
  const tope = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 900px)').matches ? 6 : 4;
  const ocultar = (k: string) => { const o = { ...ocultos, [k]: h }; setOcultos(o); try { localStorage.setItem(OCULTOS, JSON.stringify(o)); } catch { /* sin almacenamiento */ } };
  const mostrarOcultos = () => { setOcultos({}); try { localStorage.removeItem(OCULTOS); } catch { /* */ } };

  const deHoy = c.movs.filter((m) => m.fecha === h && (m.tipo === 'entrada' || m.tipo === 'salida')).slice().reverse();
  const mes = h.slice(0, 7);
  const delMes = c.movs.filter((m) => m.fecha.startsWith(mes));

  return (
    <>
      <div className="cifras-hoy">
        <button type="button" className={'cifra-hoy' + (bajoMin.length ? ' mal' : pedir.length ? ' ojo' : '')} onClick={() => ir('/m/almacen/stock')}>
          <b>{pedir.length}</b><span>para pedir{bajoMin.length ? ` · ${bajoMin.length} bajo mínimo` : ''}</span></button>
        <button type="button" className={'cifra-hoy' + (nBajar ? ' ojo' : '')} onClick={() => ir('/m/almacen/reponer')}><b>{nBajar}</b><span>para bajar a planta</span></button>
        <button type="button" className={'cifra-hoy' + (negativos.length ? ' mal' : '')} onClick={() => negativos[0] && setMov({ tipo: 'ajuste', articulo_id: negativos[0].art, almacen_id: negativos[0].alm })}>
          <b>{negativos.length}</b><span>no cuadran</span></button>
        <button type="button" className={'cifra-hoy' + (retrasados.length ? ' ojo' : '')} onClick={() => ir('/m/almacen/stock')}><b>{retrasados.length}</b><span>pedidos retrasados</span></button>
      </div>

      <div className="hoy-columnas">
        <section aria-label="Lo urgente">
          <h2 className="titulo-ir">Lo urgente <small className="suave">· {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</small></h2>
          {!visibles.length ? <div className="vacio"><p>Todo en orden. No hay nada urgente.</p></div> : (
            <div className="lista">{visibles.slice(0, todos ? undefined : tope).map((a) => (
              <div key={a.clave} className={'fila aviso-' + a.nivel}>
                <span className="fila-txt"><b>{a.texto}</b>{a.detalle && <small>{a.detalle}</small>}
                  <span className="botones-fila"><button type="button" className="boton sec peq" onClick={a.accion}>{a.boton}</button>
                    {a.nivel === 'info' && <button type="button" className="boton sec peq" aria-label={`Ocultar: ${a.texto}`} onClick={() => ocultar(a.clave)}>Ocultar</button>}</span></span>
              </div>))}</div>)}
          {visibles.length > tope && <button type="button" className="enlace" onClick={() => setTodos((x) => !x)}>{todos ? 'Ver menos' : `Ver ${visibles.length - tope} avisos más`}</button>}
          {nOcultos > 0 && <p className="nota"><button type="button" className="enlace" onClick={mostrarOcultos}>Ver {nOcultos} aviso{nOcultos > 1 ? 's' : ''} oculto{nOcultos > 1 ? 's' : ''}</button></p>}
        </section>

        <section aria-label="Apuntado hoy">
          <h2 className="titulo-ir">Apuntado hoy ({deHoy.length}) {apunta && <button type="button" className="boton sec peq" onClick={() => ir('/m/almacen/apuntar')}>+ Apuntar</button>}</h2>
          {deHoy.length ? <ul className="lista-simple">{deHoy.slice(0, 12).map((m) => (
            <li key={m.id}>{TIPOS[m.tipo]} <b>{(signo(m) > 0 ? '+' : '') + fmt(signo(m))}</b> {nombreDe(c.articulos, m.articulo_id)} · {almCorto(c, m.almacen_id)}</li>))}</ul>
            : <p className="nota">Todavía nada hoy.</p>}
          <h2 className="titulo-ir">Este mes ({MESES[Number(mes.slice(5)) - 1]})</h2>
          <dl className="datos-ficha">
            <dt>Consumos</dt><dd>{delMes.filter((m) => m.tipo === 'salida' && !m.perdida).length}</dd>
            <dt>Entradas</dt><dd>{delMes.filter((m) => m.tipo === 'entrada').length}</dd>
            <dt>Pérdidas</dt><dd>{delMes.filter((m) => m.perdida).length}</dd>
            <dt>Artículos en rojo</dt><dd>{bajoMin.length} bajo mínimo · {pedir.length - bajoMin.length} para pedir</dd>
          </dl>
        </section>
      </div>
      {mov && <FormMovimiento c={c} inicial={mov} alCerrar={() => setMov(null)} alGuardar={() => { setMov(null); recargar(); }} />}
    </>
  );
}
