// Tabla común de los listados (aspecto nuevo, decidido por Cristian el 21/11): en el ordenador (≥ 900 px) una tabla con buscador,
// filtros y columnas que se ordenan tocando su título; en el móvil, las filas de siempre (la columna principal en negrita y el resto
// debajo). Tocar una fila hace lo mismo en los dos (abrir su ficha). Cada pantalla solo dice sus columnas, su búsqueda y sus filtros.
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Columna<T> {
  clave: string;
  titulo: string;
  valor: (f: T) => ReactNode;
  /** Para ordenar (si no, el texto de `valor`). */
  orden?: (f: T) => string | number | null;
  /** Números y horas: a la derecha y en cifras iguales. */
  numero?: boolean;
  /** En el móvil no se enseña (detalles que solo caben en la tabla). */
  soloTabla?: boolean;
  /** Solo en el móvil (un resumen que en la tabla ya está repartido en columnas). */
  soloMovil?: boolean;
}
export interface Filtro<T> { clave: string; texto: string; cumple: (f: T) => boolean }

/** ¿Pantalla de ordenador? (a la vez que el menú lateral fijo: 900 px). */
export function useOrdenador() {
  const q = '(min-width: 900px)';
  const [si, setSi] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), f = () => setSi(m.matches);
    m.addEventListener('change', f); f();
    return () => m.removeEventListener('change', f);
  }, []);
  return si;
}

/** Un clic en un botón, enlace o casilla de la fila no abre la ficha. */
const dentroDeControl = (t: EventTarget) => t instanceof Element && !!t.closest('button, a, input, select, label, textarea');
const plano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (n: ReactNode): string => (n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n)
  : Array.isArray(n) ? n.map(texto).join(' ') : '');

export function Tabla<T>({ filas, columnas, clave, alAbrir, buscarEn, etiquetaBuscar, filtros, acciones, vacio, claseFila, ordenInicial, sinBuscador, alBuscar, pistaBuscar, eleccion }: {
  filas: T[];
  columnas: Columna<T>[];
  clave: (f: T) => string;
  alAbrir?: (f: T) => void;
  /** El texto en el que busca el buscador (si no, en todas las columnas). */
  buscarEn?: (f: T) => string;
  etiquetaBuscar?: string;
  filtros?: Filtro<T>[];
  /** Botones a la derecha del buscador («Añadir»…). */
  acciones?: ReactNode;
  vacio?: ReactNode;
  claseFila?: (f: T) => string;
  ordenInicial?: { clave: string; asc: boolean };
  sinBuscador?: boolean;
  /** Avisa de lo escrito en el buscador (por ejemplo, para ponerlo de nombre al «Añadir»). */
  alBuscar?: (q: string) => void;
  /** El texto gris del buscador (si no, «Buscar…»). */
  pistaBuscar?: string;
  /** Casillas para elegir varias filas (solo en la tabla; el móvil de cada pantalla pone las suyas). */
  eleccion?: { elegidos: Set<string>; cambiar: (elegidos: Set<string>) => void; nombre: (f: T) => string };
}) {
  const ordenador = useOrdenador();
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(ordenInicial ?? null);
  const enTabla = columnas.filter((c) => !c.soloMovil);
  const vistas = useMemo(() => {
    const b = plano(q.trim());
    let L = filas.filter((f) => (!b || plano(buscarEn ? buscarEn(f) : columnas.map((c) => texto(c.valor(f))).join(' ')).includes(b))
      && (!filtro || (filtros?.find((x) => x.clave === filtro)?.cumple(f) ?? true)));
    const c = orden && columnas.find((x) => x.clave === orden.clave);
    if (c) {
      const v = (f: T) => (c.orden ? c.orden(f) : texto(c.valor(f)));
      L = [...L].sort((a, b) => {
        const x = v(a), y = v(b);
        if (x == null || x === '') return 1; if (y == null || y === '') return -1;
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
        return orden!.asc ? r : -r;
      });
    }
    return L;
  }, [filas, q, filtro, filtros, orden, columnas, buscarEn]);
  const ordenar = (k: string) => setOrden((o) => (o?.clave === k ? (o.asc ? { clave: k, asc: false } : null) : { clave: k, asc: true }));

  const barra = (!sinBuscador || filtros?.length || acciones) && (
    <div className="tabla-barra">
      {!sinBuscador && <input type="search" className="tabla-buscar" aria-label={etiquetaBuscar ?? 'Buscar'} placeholder={pistaBuscar ?? `${etiquetaBuscar ?? 'Buscar'}…`}
        value={q} onChange={(e) => { setQ(e.target.value); alBuscar?.(e.target.value); }} />}
      {filtros && filtros.length > 0 && (
        <div className="tabla-filtros" role="group" aria-label="Filtros">
          <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)}>Todos</button>
          {filtros.map((x) => <button key={x.clave} type="button" aria-pressed={filtro === x.clave} onClick={() => setFiltro(filtro === x.clave ? null : x.clave)}>{x.texto}</button>)}
        </div>
      )}
      {acciones && <div className="tabla-acciones">{acciones}</div>}
    </div>
  );
  const nada = vistas.length === 0 && <div className="vacio"><p>{q || filtro ? 'Nada coincide con la búsqueda.' : vacio ?? 'No hay nada todavía.'}</p></div>;

  if (!ordenador) {
    const [p, ...resto] = columnas.filter((c) => !c.soloTabla);
    return (
      <>
        {barra}
        {nada || (
          <div className="lista">
            {vistas.map((f) => {
              const sub = resto.map((c) => texto(c.valor(f)) ? c.valor(f) : null).filter((x) => x != null);
              const dentro = <><span className="fila-txt"><b>{p.valor(f)}</b>{sub.length > 0 && <small>{sub.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</small>}</span>
                {alAbrir && <span className="fila-flecha" aria-hidden="true">›</span>}</>;
              return alAbrir
                ? <button key={clave(f)} type="button" className={'fila ' + (claseFila?.(f) ?? '')} onClick={() => alAbrir(f)}>{dentro}</button>
                : <div key={clave(f)} className={'fila fija ' + (claseFila?.(f) ?? '')}>{dentro}</div>;
            })}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      {barra}
      {nada || (
        <div className="tabla-caja">
          <table className="tabla">
            <thead><tr>{eleccion && (
              <th scope="col" className="tabla-marca"><input type="checkbox" aria-label="Elegir todos"
                checked={vistas.length > 0 && vistas.every((f) => eleccion.elegidos.has(clave(f)))}
                onChange={(e) => { const n = new Set(eleccion.elegidos); vistas.forEach((f) => (e.target.checked ? n.add(clave(f)) : n.delete(clave(f)))); eleccion.cambiar(n); }} /></th>)}
              {enTabla.map((c) => (
              <th key={c.clave} scope="col" className={c.numero ? 'num' : undefined}
                aria-sort={orden?.clave === c.clave ? (orden.asc ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => ordenar(c.clave)}>{c.titulo}<span className="tabla-flecha" aria-hidden="true">
                  {orden?.clave === c.clave ? (orden.asc ? ' ▲' : ' ▼') : ''}</span></button>
              </th>))}</tr></thead>
            <tbody>{vistas.map((f) => (
              <tr key={clave(f)} className={(alAbrir ? 'abre ' : '') + (claseFila?.(f) ?? '')} onClick={alAbrir ? (e) => { if (!dentroDeControl(e.target)) alAbrir(f); } : undefined}
                tabIndex={alAbrir ? 0 : undefined} onKeyDown={alAbrir ? (e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alAbrir(f); } } : undefined}>
                {eleccion && <td className="tabla-marca"><input type="checkbox" aria-label={`Elegir a ${eleccion.nombre(f)}`} checked={eleccion.elegidos.has(clave(f))}
                  onChange={() => { const n = new Set(eleccion.elegidos); if (n.has(clave(f))) n.delete(clave(f)); else n.add(clave(f)); eleccion.cambiar(n); }} /></td>}
                {enTabla.map((c, i) => i === 0
                  ? <th key={c.clave} scope="row" className={c.numero ? 'num' : undefined}>{c.valor(f)}</th>
                  : <td key={c.clave} className={c.numero ? 'num' : undefined}>{c.valor(f)}</td>)}
              </tr>))}</tbody>
          </table>
          <p className="tabla-pie">{vistas.length} {vistas.length === 1 ? 'fila' : 'filas'}{vistas.length !== filas.length ? ` de ${filas.length}` : ''}</p>
        </div>
      )}
    </>
  );
}
