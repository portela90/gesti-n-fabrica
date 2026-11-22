// Almacén → Reponer (como la app vieja): reponer hoy (hoja de carga y traslados), qué va en cada almacén (dotación),
// previsión (ritmo de consumo, qué pedir hasta fin del mes que viene, mínimos y dotación sugeridos) y falta y sobra.
// La dotación, los mínimos y los ajustes los cambian el encargado y el administrador (decidido por Cristian el 22/11).
import { useMemo, useState } from 'react';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';
import { alm, almCorto, fLarga, fmt, hoy, nombreDe, plano, stockDe, textoError, type Articulo, type Catalogo } from './datos';
import { estadoStock, faltas, horizonte, lineas, origenReposicion, prevision, type EstadoStock, type Falta, type Prevision } from './reponer';
import { FichaArticulo } from './Stock';
import { FormMovimiento, type Inicial } from './Movimientos';

export type Parte = 'hoy' | 'dotacion' | 'prevision' | 'faltasobra';

export function Reponer({ c, recargar, parte }: { c: Catalogo; recargar: () => void; parte: Parte }) {
  return (
    <>
      {parte === 'hoy' && <ReponerHoy c={c} recargar={recargar} />}
      {parte === 'dotacion' && <Dotacion c={c} recargar={recargar} />}
      {parte === 'prevision' && <PrevisionVista c={c} recargar={recargar} />}
      {parte === 'faltasobra' && <FaltaSobra c={c} recargar={recargar} />}
    </>
  );
}

// =====================================================================================
// Reponer hoy
// =====================================================================================
function ReponerHoy({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, estado, puede } = useSesion();
  const apunta = puede('almacen.movimiento.apuntar'), editaDot = puede('almacen.dotacion.editar');
  const h = hoy();
  const ls = lineas(c);
  const porLinea = useMemo(() => new Map(ls.map((l) => [l.id, faltas(c, l.id, h)])), [c]);   // eslint-disable-line react-hooks/exhaustive-deps
  const todas = [...porLinea.values()].flat().filter((f) => f.bajar > 0 && !f.propio);
  const [quito, setQuito] = useState<Set<string>>(new Set());   // casillas desmarcadas
  const [cant, setCant] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [mov, setMov] = useState<Inicial | null>(null);
  const [dotDe, setDotDe] = useState<string | null>(null);
  const [cambiar, setCambiar] = useState<Falta | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());   // filas con sus botones a la vista («⋯»)
  const k = (f: Falta) => `${f.almacen_id}|${f.articulo_id}`;
  const art = (id: string) => c.articulos.find((a) => a.id === id)!;
  const ubic = (id: string) => c.fichas.get(id)?.ubicacion ?? '';
  const nave = (id: string) => nombreDe(c.almacenes, id);

  // hoja de carga: por almacén de origen, ordenada por ubicación y nombre
  const origenes = [...new Set(todas.map((f) => f.origen_id ?? ''))];
  const carga = origenes.map((o) => {
    const arts = [...new Set(todas.filter((f) => (f.origen_id ?? '') === o).map((f) => f.articulo_id))]
      .sort((x, y) => ubic(x).localeCompare(ubic(y), 'es', { numeric: true }) || art(x).nombre.localeCompare(art(y).nombre, 'es', { numeric: true }));
    return { o, arts: arts.map((a) => ({ a, fs: todas.filter((f) => f.articulo_id === a && (f.origen_id ?? '') === o) })) };
  });
  const totalUd = todas.reduce((s, f) => s + f.bajar, 0);
  const textoCarga = [`BAJAR · ${fLarga(h)}`, ...carga.map(({ o, arts }) => [`DESDE ${(nombreDe(c.almacenes, o) || 'sin almacén').toUpperCase()}:`,
    ...arts.map(({ a, fs }) => `- ${art(a).nombre}: ${fmt(fs.reduce((s, f) => s + f.bajar, 0))} ${art(a).unidad} (${fs.map((f) => `${almCorto(c, f.almacen_id)} ${fmt(f.bajar)}`).join(', ')})${ubic(a) ? ` · ${ubic(a)}` : ''}`)].join('\n'))].join('\n\n');
  async function copiar() { try { await navigator.clipboard.writeText(textoCarga); aviso('Hoja de carga copiada'); } catch { aviso('No se ha podido copiar'); } }

  async function reponer(fs: Falta[]) {
    const quedan = new Map<string, number>();   // stock que queda en cada origen (art|origen) mientras se reparten
    const filas: Record<string, unknown>[] = [], falto: string[] = [];
    for (const f of fs) {
      const pide = Math.max(0, Number(String(cant[k(f)] ?? f.bajar).replace(',', '.')) || 0);
      if (!pide || !f.origen_id) continue;
      const ko = `${f.articulo_id}|${f.origen_id}`;
      const hay = quedan.get(ko) ?? stockDe(c, f.articulo_id, f.origen_id);
      const n = Math.min(pide, Math.max(0, hay));
      if (n < pide) falto.push(`${art(f.articulo_id).nombre} (${fmt(pide - n)})`);
      if (n <= 0) continue;
      quedan.set(ko, hay - n);
      filas.push({ empresa_id: empresa!.id, fecha: h, tipo: 'traslado', articulo_id: f.articulo_id, almacen_id: f.origen_id, destino_id: f.almacen_id, cantidad: n,
        nota: `Reposición ${nave(f.almacen_id)}`, creado_por: estado.fase === 'dentro' ? estado.sesion.usuario?.id : null });
    }
    if (!filas.length) return aviso(falto.length ? 'No hay stock en el almacén de origen para lo marcado.' : 'No hay nada marcado para bajar.');
    setOcupado(true);
    const { error } = await alm().from('movimientos').insert(filas);
    if (!error) {
      const tocadas = fs.filter((f) => f.cambiadoHoy);
      for (const f of tocadas) await alm().from('bajar').update({ hoy_cantidad: null, hoy_dia: null }).eq('almacen_id', f.almacen_id).eq('articulo_id', f.articulo_id);
    }
    setOcupado(false);
    if (error) return aviso(textoError(error.message));
    aviso(`Repuesto (${filas.length})${falto.length ? ` · Faltó: ${falto.join(', ')}` : ''}`);
    setCant({}); setQuito(new Set()); recargar();
  }
  async function quitar(f: Falta) {
    const { error } = await alm().from('bajar').upsert({ empresa_id: empresa!.id, almacen_id: f.almacen_id, articulo_id: f.articulo_id, quitado_stock: f.hay, quitado_en: new Date().toISOString() }, { onConflict: 'almacen_id,articulo_id' });
    if (error) return aviso(textoError(error.message));
    aviso('Quitado: solo volverá a salir lo que se gaste a partir de ahora'); recargar();
  }
  async function volverAMostrar() {
    const { error } = await alm().from('bajar').update({ quitado_stock: null, quitado_en: null }).eq('empresa_id', empresa!.id).not('quitado_en', 'is', null);
    if (error) return aviso(textoError(error.message));
    recargar();
  }
  const quitados = [...porLinea.values()].flat().filter((f) => f.quitado).length;

  if (!ls.length) return <div className="vacio"><p>Marca al menos un almacén como «de producción» (en Configuración → Almacenes) para poder reponerlo.</p></div>;
  return (
    <>
      <p className="resumen-reponer"><b>{todas.length ? `${todas.length} artículo${todas.length > 1 ? 's' : ''} para bajar · ${fmt(totalUd)} ud` : 'Hoy no hay nada que bajar'}</b>
        {ls.map((l) => { const fs = porLinea.get(l.id)!; const n = fs.filter((f) => f.bajar > 0 && !f.propio).length;
          return <span key={l.id} className={'chapa ' + (n ? 'pendiente' : fs.length ? 'firmado' : 'sin')}>{almCorto(c, l.id)}: {n ? `${n} de ${fs.length}` : fs.length ? 'completo' : 'sin dotación'}</span>; })}
      </p>
      {quitados > 0 && apunta && <p className="nota">{quitados} quitado{quitados > 1 ? 's' : ''} de «bajar a planta». <button type="button" className="enlace" onClick={volverAMostrar}>Volver a mostrar</button></p>}
      {todas.length > 0 && (
        <section className="tarjeta-seccion" aria-label="Hoja de carga">
          <h2 className="titulo-ir">Hoja de carga ({todas.length}) <button type="button" className="boton sec peq" onClick={copiar}>Copiar</button></h2>
          {carga.map(({ o, arts }) => (
            <div key={o} className="lista compacta">
              <h3 className="grupo-lista">Desde {nombreDe(c.almacenes, o) || '¿?'} ({arts.length})</h3>
              {arts.map(({ a, fs }) => { const tot = fs.reduce((s, f) => s + f.bajar, 0), hayO = o ? stockDe(c, a, o) : 0;
                return (
                  <div key={a} className="fila"><span className="fila-txt"><b>{art(a).nombre}</b>
                    <small>{fs.map((f) => `${almCorto(c, f.almacen_id)} ${fmt(f.bajar)}`).join(' · ')}{ubic(a) ? ` · ${ubic(a)}` : ''} · {hayO < tot ? <span className="error">¡Solo hay {fmt(hayO)}!</span> : `hay ${fmt(hayO)}`}</small></span>
                    <span className="fila-cifra">{fmt(tot)} {art(a).unidad}</span></div>);
              })}
            </div>))}
        </section>)}
      {ls.map((l) => {
        const fs = porLinea.get(l.id)!, pend = fs.filter((f) => f.bajar > 0 && !f.propio), propios = fs.filter((f) => f.propio && f.falta > 0), completos = fs.filter((f) => f.bajar === 0 && !(f.propio && f.falta > 0));
        const marcadas = pend.filter((f) => !quito.has(k(f)));
        return (
          <section key={l.id} className="tarjeta-seccion" aria-label={l.nombre}>
            <h2 className="titulo-ir">{l.nombre} · {pend.length ? `faltan ${pend.length}` : fs.length ? 'completo' : 'sin dotación'}
              {editaDot && <> <button type="button" className="boton sec peq" onClick={() => setDotDe(l.id)}>Dotación</button></>}</h2>
            {pend.length > 0 && <div className="lista">{pend.map((f) => { const a = art(f.articulo_id);
              return (
                <div key={k(f)} className="fila">
                  {apunta && <input type="checkbox" className="marca" aria-label={`Bajar ${a.nombre} a ${l.nombre}`} checked={!quito.has(k(f))}
                    onChange={(e) => setQuito((s) => { const n = new Set(s); if (e.target.checked) n.delete(k(f)); else n.add(k(f)); return n; })} />}
                  <span className="fila-txt"><b>{a.nombre}</b>
                    <small>hay {fmt(f.hay)} de {fmt(f.dotacion)} {a.unidad} · se baja de {almCorto(c, f.origen_id!)}{ubic(a.id) ? ` · ${ubic(a.id)}` : ''}{f.quitado ? ' · solo lo gastado desde que se quitó' : ''}{f.cambiadoHoy ? ' · cantidad cambiada hoy' : ''}</small>
                    {apunta && abiertos.has(k(f)) && <span className="botones-fila">
                      <button type="button" className="boton sec peq" onClick={() => setMov({ tipo: 'salida', articulo_id: a.id, almacen_id: l.id })}>Consumo</button>
                      <button type="button" className="boton sec peq" onClick={() => setCambiar(f)}>Cambiar</button>
                      <button type="button" className="boton sec peq" onClick={() => quitar(f)}>Quitar</button>
                      <button type="button" className="boton sec peq" disabled={ocupado} onClick={() => reponer([f])}>Repuesto</button></span>}</span>
                  {apunta && <button type="button" className="boton-icono boton-mas-fila" aria-label={`Más opciones de ${a.nombre}`} aria-expanded={abiertos.has(k(f))}
                    onClick={() => setAbiertos((x) => { const n = new Set(x); if (n.has(k(f))) n.delete(k(f)); else n.add(k(f)); return n; })}>⋯</button>}
                  {apunta ? <label className="cant-reponer"><input inputMode="decimal" aria-label={`Cuánto bajar de ${a.nombre} a ${l.nombre}`} value={cant[k(f)] ?? String(f.bajar)}
                    onChange={(e) => setCant((x) => ({ ...x, [k(f)]: e.target.value }))} /><small>de {fmt(f.falta)}</small></label>
                    : <span className="fila-cifra">{fmt(f.bajar)} {a.unidad}</span>}
                </div>);
            })}</div>}
            {apunta && pend.length > 0 && <button type="button" className="boton" disabled={ocupado || !marcadas.length} onClick={() => reponer(marcadas)}>Reponer marcados en {almCorto(c, l.id)} ({marcadas.length})</button>}
            {propios.length > 0 && <>
              <h3 className="grupo-lista">Solo están en {l.nombre} (no se bajan de otro almacén: van a la lista de pedido)</h3>
              <ul className="lista-simple">{propios.map((f) => <li key={k(f)}>{art(f.articulo_id).nombre}: hay {fmt(f.hay)} de {fmt(f.dotacion)}</li>)}</ul></>}
            {completos.length > 0 && <details><summary>{completos.length} completos</summary>
              <ul className="lista-simple">{completos.map((f) => <li key={k(f)}>{art(f.articulo_id).nombre}: hay {fmt(f.hay)} de {fmt(f.dotacion)}</li>)}</ul></details>}
          </section>);
      })}
      <p className="nota">Falta = lo que debe haber (dotación) − lo que hay. Al reponer se apunta un traslado por artículo (nunca más de lo que hay en el almacén de origen).
        «Quitar» = de momento no se baja; volverá a salir lo que se gaste desde ahora (y todo cuando entre material). El almacén de origen es: {nombreDe(c.almacenes, origenReposicion(c))}.</p>
      {mov && <FormMovimiento c={c} inicial={mov} alCerrar={() => setMov(null)} alGuardar={() => { setMov(null); recargar(); }} />}
      {dotDe && <DotacionAlmacen c={c} almacen={dotDe} alCerrar={() => setDotDe(null)} alGuardar={() => { setDotDe(null); recargar(); }} />}
      {cambiar && <CambiarHoy c={c} f={cambiar} alCerrar={() => setCambiar(null)} alGuardar={() => { setCambiar(null); recargar(); }} />}
    </>
  );
}

/** Cambiar cuánto se baja hoy de un artículo (solo vale hoy). */
function CambiarHoy({ c, f, alCerrar, alGuardar }: { c: Catalogo; f: Falta; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [v, setV] = useState(String(f.bajar));
  const a = c.articulos.find((x) => x.id === f.articulo_id)!;
  async function guardar() {
    const n = Number(v.replace(',', '.'));
    if (!(n >= 0)) return aviso('Pon una cantidad (0 o más).');
    const { error } = await alm().from('bajar').upsert({ empresa_id: empresa!.id, almacen_id: f.almacen_id, articulo_id: f.articulo_id, hoy_cantidad: n, hoy_dia: hoy() }, { onConflict: 'almacen_id,articulo_id' });
    if (error) return aviso(textoError(error.message));
    aviso('Cambiado para hoy'); alGuardar();
  }
  return (
    <Ventana titulo={`Bajar hoy: ${a.nombre}`} alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={guardar}>Guardar</button>}>
      <p>En {nombreDe(c.almacenes, f.almacen_id)} hay {fmt(f.hay)} de {fmt(f.dotacion)} {a.unidad} (faltan {fmt(f.falta)}).</p>
      <label className="campo"><span>Cuánto se baja hoy</span><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <p className="nota">Solo vale para hoy; mañana vuelve a salir lo que falte.</p>
    </Ventana>
  );
}

// =====================================================================================
// Dotación (qué va en cada almacén)
// =====================================================================================
async function guardarDotacion(emp: string, cambios: { almacen: string; articulo: string; cantidad: number | null }[]) {
  const poner = cambios.filter((x) => x.cantidad && x.cantidad > 0).map((x) => ({ empresa_id: emp, almacen_id: x.almacen, articulo_id: x.articulo, cantidad: x.cantidad }));
  if (poner.length) { const { error } = await alm().from('dotacion').upsert(poner, { onConflict: 'almacen_id,articulo_id' }); if (error) return error; }
  for (const x of cambios.filter((y) => !y.cantidad)) {
    const { error } = await alm().from('dotacion').delete().eq('almacen_id', x.almacen).eq('articulo_id', x.articulo);
    if (error) return error;
  }
  return null;
}

/** La dotación de un almacén (ventana): buscador, «hay» y «debe haber». En blanco o 0, se quita. */
function DotacionAlmacen({ c, almacen, alCerrar, alGuardar }: { c: Catalogo; almacen: string; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [q, setQ] = useState('');
  const [v, setV] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const dot = c.dotacion.get(almacen) ?? new Map();
  const lista = c.articulos.filter((a) => !a.baja && (dot.has(a.id) || (q && plano(`${a.nombre} ${a.codigo}`).includes(plano(q)))))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  async function guardar() {
    const cambios = Object.entries(v).map(([art, x]) => ({ almacen, articulo: art, cantidad: x.trim() === '' ? null : Number(x.replace(',', '.')) }))
      .filter((x) => (x.cantidad ?? 0) !== (dot.get(x.articulo) ?? 0));
    if (cambios.some((x) => x.cantidad !== null && !(x.cantidad >= 0))) return aviso('Las cantidades tienen que ser números.');
    setOcupado(true);
    const e = await guardarDotacion(empresa!.id, cambios);
    setOcupado(false);
    if (e) return aviso(textoError(e.message));
    aviso(`Dotación guardada (${cambios.length})`); alGuardar();
  }
  return (
    <Ventana titulo={`Dotación de ${nombreDe(c.almacenes, almacen)}`} alCerrar={alCerrar} pie={<button type="button" className="boton" disabled={ocupado} onClick={guardar}>Guardar</button>}>
      <label className="campo"><span>Añadir un artículo</span><input value={q} placeholder="Busca por nombre o código" onChange={(e) => setQ(e.target.value)} /></label>
      <table className="tabla-inventario">
        <thead><tr><th>Artículo</th><th className="num">Hay</th><th className="num">Debe haber</th></tr></thead>
        <tbody>{lista.map((a) => (
          <tr key={a.id}><td>{a.nombre} <small className="suave">{a.unidad}</small></td><td className="num">{fmt(stockDe(c, a.id, almacen))}</td>
            <td className="num"><input inputMode="decimal" aria-label={`Debe haber de ${a.nombre}`} value={v[a.id] ?? (dot.has(a.id) ? String(dot.get(a.id)) : '')}
              onChange={(e) => setV((o) => ({ ...o, [a.id]: e.target.value }))} /></td></tr>))}</tbody>
      </table>
      <p className="nota">En blanco o 0, ese artículo deja de reponerse en este almacén.</p>
    </Ventana>
  );
}

/** Qué va en cada almacén: artículos × almacenes de producción. */
function Dotacion({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, puede } = useSesion();
  const edita = puede('almacen.dotacion.editar');
  const ls = lineas(c);
  const [familia, setFamilia] = useState(c.familias.find((f) => f.codigo === 'consumible')?.id ?? '');
  const [q, setQ] = useState('');
  const [soloCon, setSoloCon] = useState(true);
  const [v, setV] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const dotDe = (l: string, a: string) => c.dotacion.get(l)?.get(a);
  const lista = c.articulos.filter((a) => !a.baja && (!familia || a.familia_id === familia) && (!q || plano(`${a.nombre} ${a.codigo}`).includes(plano(q)))
    && (!soloCon || ls.some((l) => dotDe(l.id, a.id))))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  const cambios = Object.entries(v).map(([kk, x]) => { const [l, a] = kk.split('|'); return { almacen: l, articulo: a, cantidad: x.trim() === '' ? null : Number(x.replace(',', '.')) }; })
    .filter((x) => (x.cantidad ?? 0) !== (dotDe(x.almacen, x.articulo) ?? 0));
  async function guardar() {
    if (cambios.some((x) => x.cantidad !== null && !(x.cantidad >= 0))) return aviso('Las cantidades tienen que ser números.');
    setOcupado(true);
    const e = await guardarDotacion(empresa!.id, cambios);
    setOcupado(false);
    if (e) return aviso(textoError(e.message));
    aviso(`Dotación guardada (${cambios.length})`); setV({}); recargar();
  }
  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>Lo que debe haber de cada artículo en cada almacén de producción. Es lo que se repone.{!edita && ' (Solo lo cambian el encargado y el administrador.)'}</p>
      <div className="filtros">
        <label className="campo"><span>Familia</span><select value={familia} onChange={(e) => setFamilia(e.target.value)}>
          <option value="">Todas</option>{c.familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
        <label className="campo"><span>Buscar</span><input value={q} placeholder="Artículo o código" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={soloCon} onChange={(e) => setSoloCon(e.target.checked)} />Solo los que ya tienen dotación</label>
      <div className="tabla-scroll">
        <table className="tabla-inventario">
          <thead><tr><th>Artículo</th>{ls.map((l) => <th key={l.id} className="num">{almCorto(c, l.id)}</th>)}</tr></thead>
          <tbody>{lista.map((a) => (
            <tr key={a.id}><td>{a.nombre} <small className="suave">{a.unidad}</small></td>
              {ls.map((l) => { const kk = `${l.id}|${a.id}`, d = dotDe(l.id, a.id);
                return <td key={l.id} className="num">{edita
                  ? <input inputMode="decimal" aria-label={`Dotación de ${a.nombre} en ${l.nombre}`} value={v[kk] ?? (d ? String(d) : '')} onChange={(e) => setV((o) => ({ ...o, [kk]: e.target.value }))} />
                  : d ? fmt(d) : ''}</td>; })}</tr>))}</tbody>
        </table>
      </div>
      {!lista.length && <p className="nota">No hay artículos con esos filtros.</p>}
      {edita && <div className="pie-apuntar"><button type="button" className="boton" disabled={ocupado || !cambios.length} onClick={guardar}>Guardar cambios ({cambios.length})</button></div>}
    </>
  );
}

// =====================================================================================
// Previsión
// =====================================================================================
function usePrevisiones(c: Catalogo) {
  return useMemo(() => {
    const h = hoy();
    return new Map(c.articulos.filter((a) => !a.baja).map((a) => [a.id, prevision(c, a, h)] as const));
  }, [c]);
}

function PrevisionVista({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, puede } = useSesion();
  const edita = puede('almacen.dotacion.editar');
  const P = usePrevisiones(c);
  const { fin } = horizonte(hoy());
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const [aplicar, setAplicar] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const con = c.articulos.filter((a) => !a.baja && P.get(a.id));
  const sin = c.articulos.filter((a) => !a.baja && !P.get(a.id));
  const aPedir = con.filter((a) => P.get(a.id)!.pedir > 0);
  const diasMax = Math.max(0, ...con.map((a) => P.get(a.id)!.diasDatos));
  const ordenador = useOrdenador();
  const texto = (() => {
    const g = new Map<string, Articulo[]>();
    aPedir.forEach((a) => { const p = nombreDe(c.proveedores, c.fichas.get(a.id)?.proveedor_id) || 'Sin proveedor'; g.set(p, [...(g.get(p) ?? []), a]); });
    return [`Pedido previsto hasta el ${fLarga(fin)}`, ...[...g].map(([p, l]) => `*${p}*\n` + l.map((a) => `- ${a.nombre}: ${fmt(P.get(a.id)!.pedir)} ${a.unidad}`).join('\n'))].join('\n\n');
  })();
  async function copiar() { try { await navigator.clipboard.writeText(texto); aviso('Pedido previsto copiado'); } catch { aviso('No se ha podido copiar'); } }
  const fila = (a: Articulo) => P.get(a.id)!;
  return (
    <>
      <dl className="cifras-ficha">
        <div><dt>Datos de consumo</dt><dd>{diasMax} días</dd></div>
        <div><dt>Artículos a pedir</dt><dd>{aPedir.length}</dd></div>
        <div><dt>Nivel de servicio</dt><dd>{c.ajustes.prevision.nivel} %</dd></div>
      </dl>
      {diasMax < 90 && <p className="aviso-linea">Hay menos de 90 días de consumos: la previsión todavía es poco fiable.</p>}
      <div className="acciones-cal">
        {edita && <button type="button" className="boton peq" onClick={() => setAplicar(true)}>Aplicar lo sugerido</button>}
        <button type="button" className="boton sec peq" disabled={!aPedir.length} onClick={copiar}>Copiar pedido previsto</button>
        {edita && <button type="button" className="boton sec peq" onClick={() => setAjustes(true)}>Ajustes</button>}
      </div>
      <p className="nota">Con el consumo de los últimos 6 meses: cuánto se gasta al día, el mínimo que cubre el plazo de entrega {c.ajustes.prevision.nivel} de cada 100 veces y lo que hay que pedir para llegar al {fLarga(fin)} con ese mínimo.</p>
      {ordenador ? (
        <Tabla filas={con} clave={(a) => a.id} alAbrir={setFicha} etiquetaBuscar="Buscar artículo" ordenInicial={{ clave: 'pedir', asc: false }}
          filtros={[{ clave: 'pedir', texto: 'A pedir', cumple: (a) => fila(a).pedir > 0 }]}
          columnas={[
            { clave: 'nombre', titulo: 'Artículo', valor: (a) => <b>{a.nombre}</b>, orden: (a) => a.nombre },
            { clave: 'ritmo', titulo: 'Al día', numero: true, valor: (a) => fmt(Math.round(fila(a).ritmo * 100) / 100), orden: (a) => fila(a).ritmo },
            { clave: 'mes', titulo: 'Mes que viene', numero: true, valor: (a) => `${fmt(fila(a).mesLo)}–${fmt(fila(a).mesHi)}`, orden: (a) => fila(a).mesHi },
            { clave: 'hay', titulo: 'Hay', numero: true, valor: (a) => fmt(stockDe(c, a.id)), orden: (a) => stockDe(c, a.id) },
            { clave: 'min', titulo: 'Mínimo (ahora → sugerido)', numero: true, valor: (a) => `${fmt(a.minimo ?? 0)} → ${fmt(fila(a).minimo)}`, orden: (a) => fila(a).minimo },
            { clave: 'pedir', titulo: 'Pedir', numero: true, valor: (a) => (fila(a).pedir ? <b>{fmt(fila(a).pedir)} {a.unidad}</b> : ''), orden: (a) => fila(a).pedir },
          ]} />
      ) : (
        <div className="lista">{con.sort((a, b) => fila(b).pedir - fila(a).pedir || a.nombre.localeCompare(b.nombre, 'es')).map((a) => (
          <button key={a.id} type="button" className="fila" onClick={() => setFicha(a)}>
            <span className="fila-txt"><b>{a.nombre}</b><small>{fmt(Math.round(fila(a).ritmo * 100) / 100)} al día · mes que viene {fmt(fila(a).mesLo)}–{fmt(fila(a).mesHi)} · mínimo {fmt(a.minimo ?? 0)} → {fmt(fila(a).minimo)} · hay {fmt(stockDe(c, a.id))}</small></span>
            {fila(a).pedir > 0 && <span className="fila-cifra">Pedir {fmt(fila(a).pedir)} {a.unidad}</span>}
          </button>))}</div>
      )}
      {sin.length > 0 && <details><summary>{sin.length} sin consumos</summary><p className="nota">{sin.map((a) => a.nombre).join(' · ')}</p></details>}
      {ficha && <FichaArticulo c={c} a={ficha} alCerrar={() => setFicha(null)} alApuntar={() => setFicha(null)} />}
      {aplicar && <AplicarSugerido c={c} P={P} alCerrar={() => setAplicar(false)} alGuardar={() => { setAplicar(false); recargar(); }} />}
      {ajustes && <AjustesPrevision c={c} alCerrar={() => setAjustes(false)} alGuardar={() => { setAjustes(false); recargar(); }} empresa={empresa!.id} />}
    </>
  );
}

function AplicarSugerido({ c, P, alCerrar, alGuardar }: { c: Catalogo; P: Map<string, Prevision | null>; alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [minimos, setMinimos] = useState(true);
  const [dot, setDot] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ps = [...P.values()].filter((p): p is Prevision => !!p);
  const cambiosMin = ps.filter((p) => (c.articulos.find((a) => a.id === p.articulo_id)?.minimo ?? 0) !== p.minimo);
  const ls = lineas(c);
  const cambiosDot = ps.flatMap((p) => ls.filter((l) => p.planta.has(l.id) && c.dotacion.get(l.id)?.get(p.articulo_id) !== p.planta.get(l.id))
    .map((l) => ({ almacen: l.id, articulo: p.articulo_id, cantidad: p.planta.get(l.id)! })));
  async function guardar() {
    setOcupado(true);
    if (minimos && cambiosMin.length) {
      const { error } = await alm().rpc('poner_minimos', { p_empresa: empresa!.id, p_minimos: cambiosMin.map((p) => ({ articulo: p.articulo_id, minimo: p.minimo || null })) });
      if (error) { setOcupado(false); return aviso(textoError(error.message)); }
    }
    if (dot && cambiosDot.length) { const e = await guardarDotacion(empresa!.id, cambiosDot); if (e) { setOcupado(false); return aviso(textoError(e.message)); } }
    setOcupado(false); aviso('Aplicado'); alGuardar();
  }
  return (
    <Ventana titulo="Aplicar lo sugerido" alCerrar={alCerrar} pie={<button type="button" className="boton" disabled={ocupado || (!minimos && !dot)} onClick={guardar}>Aplicar</button>}>
      <label className="check"><input type="checkbox" checked={minimos} onChange={(e) => setMinimos(e.target.checked)} />Mínimos de los artículos ({cambiosMin.length} cambian)</label>
      <label className="check"><input type="checkbox" checked={dot} onChange={(e) => setDot(e.target.checked)} />Dotación de los almacenes de producción ({cambiosDot.length} cambian; solo los que tienen consumo allí)</label>
      <p className="nota">Solo se cambia lo que tiene consumos. Lo puedes volver a cambiar a mano cuando quieras (queda en el historial).</p>
    </Ventana>
  );
}

function AjustesPrevision({ c, empresa, alCerrar, alGuardar }: { c: Catalogo; empresa: string; alCerrar: () => void; alGuardar: () => void }) {
  const [nivel, setNivel] = useState(String(c.ajustes.prevision.nivel));
  const [plazo, setPlazo] = useState(String(c.ajustes.prevision.plazo));
  const [cob, setCob] = useState(String(c.ajustes.prevision.cobertura));
  const [origen, setOrigen] = useState(origenReposicion(c) ?? '');
  async function guardar() {
    const v = { nivel: Number(nivel), plazo: Number(plazo), cobertura: Number(cob) };
    if (!(v.plazo >= 0 && v.plazo <= 120 && v.cobertura >= 1 && v.cobertura <= 60)) return aviso('Revisa los días (plazo de 0 a 120, reposición de 1 a 60).');
    const r1 = await alm().rpc('guardar_ajuste', { p_empresa: empresa, p_clave: 'prevision', p_valor: v });
    const r2 = await alm().rpc('guardar_ajuste', { p_empresa: empresa, p_clave: 'origen_reposicion', p_valor: origen || null });
    const e = r1.error ?? r2.error;
    if (e) return aviso(textoError(e.message));
    aviso('Ajustes guardados'); alGuardar();
  }
  return (
    <Ventana titulo="Ajustes de la previsión" alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={guardar}>Guardar</button>}>
      <label className="campo"><span>Nivel de servicio (cuántas de cada 100 veces tiene que llegar el stock)</span>
        <select value={nivel} onChange={(e) => setNivel(e.target.value)}>{['90', '95', '99'].map((n) => <option key={n} value={n}>{n} %</option>)}</select></label>
      <label className="campo"><span>Plazo de entrega si el artículo no tiene (días)</span><input inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></label>
      <label className="campo"><span>Cada cuántos días se repone la planta</span><input inputMode="numeric" value={cob} onChange={(e) => setCob(e.target.value)} /></label>
      <label className="campo"><span>Almacén de donde se repone (no se repone él)</span>
        <select value={origen} onChange={(e) => setOrigen(e.target.value)}>{c.almacenes.filter((a) => !a.baja).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
    </Ventana>
  );
}

// =====================================================================================
// Falta y sobra
// =====================================================================================
const ESTADO: Record<EstadoStock, [string, string]> = { falta: ['Falta', 'chapa mal'], sobra: ['Sobra', 'chapa pendiente'], justo: ['Justo', 'chapa firmado'], 'sin-datos': ['Sin datos', 'chapa sin'] };

function FaltaSobra({ c, recargar }: { c: Catalogo; recargar: () => void }) {
  const { empresa, puede } = useSesion();
  const edita = puede('almacen.dotacion.editar');
  const P = usePrevisiones(c);
  const [filtro, setFiltro] = useState<EstadoStock | ''>('');
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const vivos = c.articulos.filter((a) => !a.baja);
  const est = new Map(vivos.map((a) => [a.id, estadoStock(c, a, P.get(a.id) ?? null)]));
  const n = (e: EstadoStock) => vivos.filter((a) => est.get(a.id) === e).length;
  const lista = vivos.filter((a) => !filtro || est.get(a.id) === filtro)
    .sort((a, b) => ['falta', 'sobra', 'justo', 'sin-datos'].indexOf(est.get(a.id)!) - ['falta', 'sobra', 'justo', 'sin-datos'].indexOf(est.get(b.id)!) || a.nombre.localeCompare(b.nombre, 'es'));
  async function fijar() {
    const ps = vivos.map((a) => P.get(a.id)).filter((p): p is Prevision => !!p).filter((p) => (c.articulos.find((a) => a.id === p.articulo_id)?.minimo ?? 0) !== p.minimo);
    if (!ps.length) return aviso('Los mínimos ya son los sugeridos.');
    if (!confirm(`¿Poner el mínimo sugerido a ${ps.length} artículos?`)) return;
    const { error } = await alm().rpc('poner_minimos', { p_empresa: empresa!.id, p_minimos: ps.map((p) => ({ articulo: p.articulo_id, minimo: p.minimo || null })) });
    if (error) return aviso(textoError(error.message));
    aviso('Mínimos puestos'); recargar();
  }
  return (
    <>
      <dl className="cifras-ficha">
        <div><dt>Faltan</dt><dd className={n('falta') ? 'error' : ''}>{n('falta')}</dd></div>
        <div><dt>Sobran</dt><dd>{n('sobra')}</dd></div>
        <div><dt>Justos</dt><dd>{n('justo')}</dd></div>
      </dl>
      <div className="acciones-cal">
        {edita && <button type="button" className="boton sec peq" onClick={fijar}>Fijar estos mínimos</button>}
        {(['', 'falta', 'sobra', 'justo', 'sin-datos'] as const).map((e) => (
          <button key={e} type="button" className={'boton peq' + (filtro === e ? '' : ' sec')} aria-pressed={filtro === e} onClick={() => setFiltro(e)}>{e ? ESTADO[e][0] : 'Todos'}</button>))}
      </div>
      <p className="nota">Compara lo que hay en total con el mínimo sugerido (falta) y con lo que se gasta hasta fin del mes que viene más el mínimo (sobra).</p>
      <div className="lista">{lista.map((a) => { const p = P.get(a.id), e = est.get(a.id)!;
        return (
          <button key={a.id} type="button" className="fila" onClick={() => setFicha(a)}>
            <span className="fila-txt"><b>{a.nombre}</b><small>hay {fmt(stockDe(c, a.id))} {a.unidad}{p ? ` · mínimo ${fmt(p.minimo)} · máximo ${fmt(p.maximo)}` : ''}</small></span>
            <span className={ESTADO[e][1]}>{ESTADO[e][0]}</span>
          </button>); })}</div>
      {ficha && <FichaArticulo c={c} a={ficha} alCerrar={() => setFicha(null)} alApuntar={() => setFicha(null)} />}
    </>
  );
}
