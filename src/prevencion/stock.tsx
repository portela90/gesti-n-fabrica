// Stock de ropa y EPI: lo que hay de cada material y talla, pedidos recibidos, recuentos y la hoja del pedido.
// Las salidas no se apuntan aquí: las hace sola cada entrega de EPI (ver 0023_prevencion_stock.sql).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import { fechaCorta, hoy, prev, textoError } from './comun';
import { EPI_ITEMS } from './epi';
import { descargar } from './pdfToolbox';

export interface Material { id: string; nombre: string; epi: string | null; prenda: string | null; tallas: string[]; minimos: Record<string, number>; orden: number; baja: string | null }
export interface FilaStock { material_id: string; nombre: string; epi: string | null; prenda: string | null; baja: string | null; talla: string; talla_de_la_lista: boolean; stock: number; minimo: number }
const pedir = (f: FilaStock) => Math.max(f.minimo - f.stock, 0);
const nombreTalla = (t: string) => (t ? t : 'Única');

/** Material y stock de la unidad (para la pestaña Stock y para avisar en las entregas). */
export function useStock() {
  const { empresa } = useSesion();
  const [material, setMaterial] = useState<Material[] | null>(null);
  const [filas, setFilas] = useState<FilaStock[]>([]);
  const cargar = useCallback(async () => {
    const [m, s] = await Promise.all([
      prev().from('material').select('*').eq('empresa_id', empresa!.id).order('orden').order('nombre'),
      prev().from('v_stock').select('*').eq('empresa_id', empresa!.id),
    ]);
    setMaterial((m.data ?? []) as Material[]);
    setFilas((s.data ?? []) as FilaStock[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  return { material, filas, cargar };
}

/** Filas de un material ordenadas como su lista de tallas (las de fuera de la lista, al final). */
function filasDe(m: Material, filas: FilaStock[]) {
  const orden = (t: string) => { const i = m.tallas.indexOf(t); return i < 0 ? 999 : i; };
  return filas.filter((f) => f.material_id === m.id && (f.talla_de_la_lista || f.stock !== 0)).sort((a, b) => orden(a.talla) - orden(b.talla) || a.talla.localeCompare(b.talla, 'es', { numeric: true }));
}

export function Stock() {
  const { empresa } = useSesion();
  const { material, filas, cargar } = useStock();
  const [abierto, setAbierto] = useState<Material | 'nuevo' | 'recibido' | 'recuento' | null>(null);
  const [bajas, setBajas] = useState(false);
  const ordenador = useOrdenador();
  const vivos = (material ?? []).filter((m) => bajas || !m.baja);
  const nBajas = (material ?? []).filter((m) => m.baja).length;
  const totalPedir = filas.filter((f) => !f.baja).reduce((s, f) => s + pedir(f), 0);

  async function hojaPedido() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 15; let y = 20;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Pedido de ropa y EPI', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${empresa!.nombre} · ${fechaCorta(hoy())}`, M, y + 6);
    y += 16;
    const cols: [string, number, 'left' | 'right'][] = [['Material', M, 'left'], ['Talla', 105, 'left'], ['Hay', 140, 'right'], ['Mínimo', 162, 'right'], ['Pedir', 192, 'right']];
    const cab = () => { doc.setFont('helvetica', 'bold'); cols.forEach(([t, x, a]) => doc.text(t, x, y, { align: a })); doc.line(M, y + 2, 195, y + 2); y += 8; doc.setFont('helvetica', 'normal'); };
    cab();
    let pedidas = 0;
    for (const m of (material ?? []).filter((x) => !x.baja)) {
      for (const f of filasDe(m, filas)) {
        if (y > 280) { doc.addPage(); y = 20; cab(); }
        const p = pedir(f); pedidas += p;
        if (p) doc.setFont('helvetica', 'bold');
        doc.text(m.nombre.slice(0, 50), M, y); doc.text(nombreTalla(f.talla), 105, y);
        doc.text(String(f.stock), 140, y, { align: 'right' }); doc.text(String(f.minimo), 162, y, { align: 'right' }); doc.text(p ? String(p) : '—', 192, y, { align: 'right' });
        doc.setFont('helvetica', 'normal'); y += 6.5;
      }
    }
    doc.line(M, y - 3, 195, y - 3); doc.setFont('helvetica', 'bold'); doc.text('Total a pedir', M, y + 3); doc.text(String(pedidas), 192, y + 3, { align: 'right' });
    descargar(new Uint8Array(doc.output('arraybuffer')), `Pedido ropa y EPI ${hoy()}.pdf`);
  }

  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Cada entrega de EPI descuenta sola lo que se da (con la talla de la ficha si no eliges otra). Aquí apuntas lo que llega y, de vez en cuando, un recuento.</p>
      <div className="acciones-cal">
        <button type="button" className="boton peq" onClick={() => setAbierto('recibido')} disabled={!material?.length}>He recibido un pedido</button>
        <button type="button" className="boton sec peq" onClick={hojaPedido} disabled={!material?.length}>Hoja del pedido (PDF){totalPedir ? ` · ${totalPedir}` : ''}</button>
        <button type="button" className="boton sec peq" onClick={() => setAbierto('recuento')} disabled={!material?.length}>Recuento</button>
        <button type="button" className="boton sec peq" onClick={() => setAbierto('nuevo')}>+ Material</button>
      </div>
      {material === null ? <p className="nota">Cargando…</p> : !vivos.length ? (
        <div className="vacio"><p><b>Todavía no hay material.</b></p><p>Da de alta lo que tienes (botas, pantalón, gafas…), con sus tallas y cuántas quieres tener siempre. Luego haz un recuento para empezar.</p></div>
      ) : ordenador ? (
        <Tabla filas={vivos} clave={(m) => m.id} alAbrir={(m) => setAbierto(m)} etiquetaBuscar="Buscar material" claseFila={(m) => (m.baja ? 'de-baja' : '')}
          filtros={[{ clave: 'pedir', texto: 'Hay que pedir', cumple: (m) => !m.baja && filasDe(m, filas).some((f) => pedir(f) > 0) }]}
          columnas={[
            { clave: 'nombre', titulo: 'Material', valor: (m) => m.nombre },
            { clave: 'tallas', titulo: 'Hay / mínimo por talla', valor: (m) => <span className="tallas-stock">{filasDe(m, filas).map((f) => (
              <span key={f.talla} className={f.stock < f.minimo ? 'falta' : ''}>{f.talla ? `${f.talla}: ` : ''}{f.stock}{f.minimo ? `/${f.minimo}` : ''}</span>))}</span>,
              orden: (m) => filasDe(m, filas).reduce((n, f) => n + f.stock, 0) },
            { clave: 'pedir', titulo: 'Pedir', numero: true, valor: (m) => filasDe(m, filas).reduce((n, f) => n + pedir(f), 0) || '', orden: (m) => filasDe(m, filas).reduce((n, f) => n + pedir(f), 0) },
            { clave: 'estado', titulo: 'Estado', valor: (m) => { const p = filasDe(m, filas).reduce((n, f) => n + pedir(f), 0);
              return m.baja ? <span className="chapa sin">De baja</span> : p > 0 ? <span className="chapa pendiente">Pedir {p}</span> : <span className="chapa firmado">Bien</span>; } },
          ]} />
      ) : (
        <div className="lista">
          {vivos.map((m) => {
            const fs = filasDe(m, filas); const p = fs.reduce((s, f) => s + pedir(f), 0);
            return (
              <button key={m.id} type="button" className={'fila' + (m.baja ? ' de-baja' : '')} onClick={() => setAbierto(m)}>
                <span className="fila-txt"><b>{m.nombre}</b>
                  <small className="tallas-stock">{fs.map((f) => <span key={f.talla} className={f.stock < f.minimo ? 'falta' : ''}>{f.talla ? `${f.talla}: ` : ''}{f.stock}{f.minimo ? `/${f.minimo}` : ''}</span>)}</small></span>
                {m.baja ? <span className="chapa sin">De baja</span> : p > 0 ? <span className="chapa pendiente">Pedir {p}</span> : <span className="chapa firmado">Bien</span>}
              </button>
            );
          })}
        </div>
      )}
      {nBajas > 0 && <label className="check"><input type="checkbox" checked={bajas} onChange={(e) => setBajas(e.target.checked)} />Ver también el material de baja ({nBajas})</label>}
      <p className="nota">«42: 4/3» = de la talla 42 hay 4 y quieres tener 3. En rojo, lo que está por debajo del mínimo.</p>
      {(abierto === 'nuevo' || (abierto && typeof abierto === 'object')) && <EditarMaterial m={abierto === 'nuevo' ? null : abierto} todos={material ?? []} alCerrar={() => setAbierto(null)} alGuardar={() => { setAbierto(null); cargar(); }} />}
      {(abierto === 'recibido' || abierto === 'recuento') && <Cantidades modo={abierto} material={(material ?? []).filter((m) => !m.baja)} filas={filas}
        alCerrar={() => setAbierto(null)} alGuardar={() => { setAbierto(null); cargar(); }} />}
    </>
  );
}

function EditarMaterial({ m, todos, alCerrar, alGuardar }: { m: Material | null; todos: Material[]; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [prendas, setPrendas] = useState<{ codigo: string; nombre: string }[]>([]);
  const [nombre, setNombre] = useState(m?.nombre ?? '');
  const [epi, setEpi] = useState(m?.epi ?? '');
  const [prenda, setPrenda] = useState(m?.prenda ?? '');
  const [tallasTxt, setTallasTxt] = useState((m?.tallas ?? []).join(', '));
  const [minimos, setMinimos] = useState<Record<string, string>>(Object.fromEntries(Object.entries(m?.minimos ?? {}).map(([k, v]) => [k, String(v)])));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    prev().from('prendas').select('codigo, nombre').eq('empresa_id', empresa!.id).is('baja', null).order('orden').order('nombre')
      .then(({ data }) => setPrendas((data ?? []) as { codigo: string; nombre: string }[]));
  }, [empresa]);
  const tallas = useMemo(() => [...new Set(tallasTxt.split(/[,;]+/).map((t) => t.trim()).filter(Boolean))], [tallasTxt]);
  const claves = tallas.length ? tallas : [''];
  const usadoEpi = (k: string) => todos.find((x) => x.epi === k && !x.baja && x.id !== m?.id);

  async function guardar(baja?: string | null) {
    setError(null);
    if (!nombre.trim()) return setError('Ponle un nombre.');
    const mins: Record<string, number> = {};
    for (const k of claves) {
      const v = (minimos[k] ?? '').trim(); if (!v) continue;
      if (!/^\d{1,5}$/.test(v)) return setError(`El mínimo de ${nombreTalla(k)} tiene que ser un número entero.`);
      mins[k] = Number(v);
    }
    const fila = { empresa_id: empresa!.id, nombre: nombre.trim(), epi: epi || null, prenda: prenda || null, tallas, minimos: mins, ...(baja !== undefined ? { baja } : {}) };
    setOcupado(true);
    const { error: e } = m ? await prev().from('material').update(fila).eq('id', m.id) : await prev().from('material').insert(fila);
    setOcupado(false);
    if (e) return setError(e.message.includes('material_nombre') ? 'Ya hay un material con ese nombre.' : e.message.includes('material_epi') ? 'Esa línea de la hoja oficial ya es de otro material.' : textoError(e.message));
    aviso(baja ? 'Material dado de baja' : 'Guardado'); alGuardar();
  }

  return (
    <Ventana titulo={m ? m.nombre : 'Nuevo material'} alCerrar={alCerrar} pie={<>
      {m && <button type="button" className="boton sec" disabled={ocupado} onClick={() => guardar(m.baja ? null : new Date().toISOString())}>{m.baja ? 'Volver a dar de alta' : 'Dar de baja'}</button>}
      <button type="button" className="boton" disabled={ocupado} onClick={() => guardar()}>Guardar</button></>}>
      <label className="campo"><span>Nombre</span><input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Botas, Pantalón, Gafas…" /></label>
      <label className="campo"><span>En la hoja oficial de EPI es</span>
        <select value={epi} onChange={(e) => setEpi(e.target.value)}>
          <option value="">Ninguna línea (ropa de trabajo: se reconoce por el nombre)</option>
          {EPI_ITEMS.map(([k, t]) => <option key={k} value={k} disabled={!!usadoEpi(k)}>{t}{usadoEpi(k) ? ` (ya es «${usadoEpi(k)!.nombre}»)` : ''}</option>)}
        </select></label>
      <label className="campo"><span>La talla sale de la ficha, de la prenda</span>
        <select value={prenda} onChange={(e) => setPrenda(e.target.value)}>
          <option value="">Ninguna (se elige en la entrega, o talla única)</option>
          {prendas.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </select></label>
      <label className="campo"><span>Tallas que tienes (separadas por comas; vacío = talla única)</span>
        <input value={tallasTxt} onChange={(e) => setTallasTxt(e.target.value)} placeholder="38, 39, 40, 41, 42" /></label>
      <div className="campo"><span>Cuántas quieres tener siempre</span>
        <div className="minimos">
          {claves.map((k) => (
            <label key={k}><small>{nombreTalla(k)}</small>
              <input inputMode="numeric" aria-label={`Mínimo de la talla ${nombreTalla(k)}`} placeholder="0" value={minimos[k] ?? ''} onChange={(e) => setMinimos((x) => ({ ...x, [k]: e.target.value }))} /></label>
          ))}
        </div></div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** «He recibido un pedido» (suma) o «Recuento» (se pone lo que hay de verdad). */
function Cantidades({ modo, material, filas, alCerrar, alGuardar }: {
  modo: 'recibido' | 'recuento'; material: Material[]; filas: FilaStock[]; alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  const [v, setV] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const clave = (m: string, t: string) => `${m}|${t}`;

  async function guardar() {
    setError(null);
    const puestas = Object.entries(v).filter(([, x]) => x.trim() !== '');
    if (puestas.some(([, x]) => !/^\d{1,5}$/.test(x.trim()))) return setError('Las cantidades tienen que ser números enteros.');
    if (!puestas.length) return setError(modo === 'recibido' ? 'Pon cuántas han llegado de algo.' : 'Pon cuántas hay de algo.');
    setOcupado(true);
    let e;
    if (modo === 'recibido') {
      const filasMov = puestas.filter(([, x]) => Number(x) > 0).map(([k, x]) => { const [material_id, talla] = k.split('|'); return { empresa_id: empresa!.id, material_id, talla, cantidad: Number(x), tipo: 'entrada', nota: nota.trim() || null }; });
      ({ error: e } = await prev().from('stock_mov').insert(filasMov));
    } else {
      const items = puestas.map(([k, x]) => { const [material_id, talla] = k.split('|'); return { material_id, talla, hay: Number(x) }; });
      ({ error: e } = await prev().rpc('recontar_stock', { p_empresa: empresa!.id, p_items: items, p_nota: nota.trim() || null }));
    }
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso(modo === 'recibido' ? 'Pedido apuntado' : 'Recuento guardado'); alGuardar();
  }

  return (
    <Ventana titulo={modo === 'recibido' ? 'He recibido un pedido' : 'Recuento'} alCerrar={alCerrar} pie={<button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar</button>}>
      <p className="nota" style={{ marginTop: 0 }}>{modo === 'recibido' ? 'Pon cuántas han llegado de cada cosa. Lo que dejes vacío no cambia.'
        : 'Pon cuántas hay de verdad. La app apunta la diferencia (y quién la hizo). Lo que dejes vacío no cambia.'}</p>
      {material.map((m) => (
        <fieldset key={m.id} className="grupo-epi">
          <legend>{m.nombre}</legend>
          <div className="minimos">
            {filasDe(m, filas).map((f) => (
              <label key={f.talla}><small>{nombreTalla(f.talla)} · hay {f.stock}</small>
                <input inputMode="numeric" aria-label={`${modo === 'recibido' ? 'Han llegado' : 'Hay'} de ${m.nombre} talla ${nombreTalla(f.talla)}`}
                  value={v[clave(m.id, f.talla)] ?? ''} onChange={(e) => setV((x) => ({ ...x, [clave(m.id, f.talla)]: e.target.value }))} /></label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="campo"><span>{modo === 'recibido' ? 'Nota (proveedor, albarán…)' : 'Motivo del recuento'}</span><input value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** En la entrega de EPI: elegir talla de lo que es material del almacén y ver cuántas quedan. */
export function TallaStock({ m, filas, talla, alCambiar }: { m: Material; filas: FilaStock[]; talla: string; alCambiar: (t: string) => void }) {
  const fs = filasDe(m, filas);
  const quedan = (t: string) => fs.find((f) => f.talla === t)?.stock ?? 0;
  return (
    <span className="talla-stock">
      {m.tallas.length > 0 && (
        <select aria-label={`Talla de ${m.nombre}`} value={talla} onChange={(e) => alCambiar(e.target.value)}>
          <option value="">{m.prenda ? 'Talla de su ficha' : 'Sin talla'}</option>
          {m.tallas.map((t) => <option key={t} value={t}>{t} (quedan {quedan(t)})</option>)}
        </select>)}
      {m.tallas.length === 0 && <small className={quedan('') <= 0 ? 'error' : 'nota'}>Quedan {quedan('')}</small>}
      {m.tallas.length > 0 && talla && quedan(talla) <= 0 && <small className="error">No queda de la {talla}: se apunta igual</small>}
    </span>
  );
}
