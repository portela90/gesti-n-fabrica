import { useCallback, useEffect, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { anotarError } from '../nucleo/errores';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';
import { Tabla, type Columna } from '../componentes/Tabla';
import { CATALOGOS, catalogoPorTabla, codigoDe, DIAS_HORARIO, DIAS_SEMANA, estadosDeTexto, horarioDeTexto, textoDeEstados, textoDeHorario, type Campo, type Catalogo, type Fila } from './catalogos';

/** ¿Puede configurar algo en esta unidad de trabajo? (para enseñar «Configuración» en el menú) */
export function useConfigurable() {
  const { puede } = useSesion();
  return puede('nucleo.usuario.editar') || CATALOGOS.some((c) => puede(c.permiso));
}

const textoError = (e: { code?: string; message: string }) =>
  e.code === '23505' ? 'Ya hay uno con ese código o ese nombre.'
    : e.code === '42501' ? 'No tienes permiso para hacer esto.'
    : e.code === '23503' ? 'Está unido a otra cosa que no existe o es de otra unidad de trabajo.'
    : 'No se ha podido guardar: ' + e.message;

/** Portada de Configuración: un acceso por catálogo, con cuántos hay. */
export function IndiceConfiguracion({ ir }: { ir: (r: string) => void }) {
  const { empresa, puede, estado } = useSesion();
  const superadmin = estado.fase === 'dentro' && !!estado.sesion.usuario?.superadmin;
  const mios = CATALOGOS.filter((c) => puede(c.permiso));
  const [cuantos, setCuantos] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!empresa) return;
    let vivo = true;
    Promise.all(mios.map(async (c) => {
      const { count } = await nucleo().from(c.tabla).select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id).is('baja', null);
      return [c.tabla, count ?? 0] as const;
    })).then((r) => { if (vivo) setCuantos(Object.fromEntries(r)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id]);
  if (!empresa) return null;
  const usuarios = puede('nucleo.usuario.editar') || puede('nucleo.usuario.ver');
  if (!mios.length && !usuarios) return <main className="contenido estrecho"><div className="vacio"><p><b>No tienes permiso para configurar nada.</b></p></div></main>;
  return (
    <main className="contenido estrecho">
      <h1 className="titulo">Configuración</h1>
      <p className="nota" style={{ margin: '-8px 0 16px' }}>Todo lo de {empresa.nombre} que se da de alta sin programar.</p>
      <div className="lista">
        {superadmin && (
          <button type="button" className="fila" onClick={() => ir('/config/salud')}>
            <span className="fila-txt"><b>Salud de la app</b><small>Espacio usado, copias, errores e incidencias</small></span>
            <span className="fila-flecha" aria-hidden="true">›</span>
          </button>
        )}
        {usuarios && (
          <button type="button" className="fila" onClick={() => ir('/config/usuarios')}>
            <span className="fila-txt"><b>Usuarios</b><small>Quién entra, con qué rol y en qué nave</small></span>
            <span className="fila-flecha" aria-hidden="true">›</span>
          </button>
        )}
        {mios.map((c) => (
          <button key={c.tabla} type="button" className="fila" onClick={() => ir('/config/' + c.tabla)}>
            <span className="fila-txt"><b>{c.titulo}</b><small>{c.descripcion}</small></span>
            <span className="cuenta num">{cuantos[c.tabla] ?? ''}</span>
            <span className="fila-flecha" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </main>
  );
}

/** Lista de un catálogo: buscar, añadir, cambiar y dar de baja. */
/** Las columnas de un catálogo, sacadas de sus campos: la principal (nombre o código), una por campo sencillo (las listas, naves,
 *  tipos… con su nombre) y, solo en el móvil, el resumen de siempre. */
function columnasDe(cat: Catalogo, nombres: (t: string, id: unknown) => string): Columna<Fila>[] {
  const conCodigo = cat.campos.some((c) => c.clave === 'codigo');
  const principal: Columna<Fila> = { clave: 'nombre', titulo: conCodigo && cat.campos.find((c) => c.clave === 'codigo')?.obligatorio ? 'Código' : 'Nombre',
    orden: (f) => String(f.nombre || f.codigo || ''),
    valor: (f) => <>{String(f.nombre || f.codigo)}{f.codigo && f.nombre && conCodigo ? <span className="cod"> · {String(f.codigo)}</span> : null}</> };
  const campos = cat.campos.filter((c) => !['nombre', 'codigo', 'orden'].includes(c.clave) && !['estados', 'horario'].includes(c.tipo));
  const valor = (c: Campo, f: Fila): string => {
    const x = f[c.clave];
    if (x == null || x === '') return '';
    if (c.tipo === 'referencia') return nombres(c.ref!.tabla, x);
    if (c.tipo === 'lista') return c.opciones?.find(([v]) => v === x)?.[1] ?? String(x);
    if (c.tipo === 'dias') return DIAS_COL.filter(([n]) => (x as number[]).includes(n)).map(([, l]) => l).join(' ');
    if (c.tipo === 'hora') return String(x).slice(0, 5);
    return String(x);
  };
  return [principal,
    ...campos.map((c): Columna<Fila> => ({ clave: c.clave, titulo: c.etiqueta, soloTabla: true, numero: c.tipo === 'numero', valor: (f) => valor(c, f),
      orden: c.tipo === 'numero' ? (f) => (f[c.clave] == null || f[c.clave] === '' ? null : Number(f[c.clave])) : undefined })),
    { clave: 'estado', titulo: 'Estado', soloTabla: true, valor: (f) => (f.baja ? 'Dado de baja' : ''), orden: (f) => (f.baja ? 1 : 0) },
    { clave: 'detalle', titulo: '', soloMovil: true, valor: (f) => { const det = cat.detalle(f, nombres); return f.baja ? 'Dado de baja' + (det ? ' · ' + det : '') : det; } }];
}
const DIAS_COL: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

export function ListaCatalogo({ tabla, ir }: { tabla: string; ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  const cat = catalogoPorTabla(tabla);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [refs, setRefs] = useState<Record<string, Fila[]>>({});
  const [buscar, setBuscar] = useState('');   // lo escrito en el buscador pasa al nombre al «Añadir»
  const [verBajas, setVerBajas] = useState(false);
  const [editando, setEditando] = useState<Fila | 'nueva' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!cat || !empresa) return;
    const tablasRef = [...new Set(cat.campos.filter((c) => c.ref).map((c) => c.ref!.tabla))];
    const [principal, ...otras] = await Promise.all([cat.tabla, ...tablasRef].map((t) =>
      nucleo().from(t).select('*').eq('empresa_id', empresa.id).order('nombre')));
    if (principal.error) { setError(principal.error.message); anotarError(new Error('config ' + tabla + ': ' + principal.error.message)); return; }
    setFilas(principal.data as Fila[]);
    setRefs(Object.fromEntries(tablasRef.map((t, i) => [t, (t === cat.tabla ? principal.data : otras[i].data ?? []) as Fila[]])));
  }, [cat, empresa, tabla]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombres = useCallback((t: string, id: unknown) => {
    if (!id) return '';
    const f = (refs[t] ?? []).find((x) => x.id === id);
    return f ? String(f.nombre || f.codigo || '') : '';
  }, [refs]);


  if (!cat || !empresa) return null;
  const editable = puede(cat.permiso);
  const bajas = (filas ?? []).filter((f) => f.baja).length;

  return (
    <main className="contenido">
      <button type="button" className="boton txt volver" onClick={() => ir('/config')}><Icono d={ICONOS.volver} tam={18} /> Configuración</button>
      <h1 className="titulo">{cat.titulo}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {filas === null && !error ? <p className="nota">Cargando…</p> : (
        <Tabla filas={(filas ?? []).filter((f) => verBajas || !f.baja)} clave={(f) => f.id} alAbrir={(f) => setEditando(f)}
          columnas={columnasDe(cat, nombres)} buscarEn={(f) => `${f.nombre ?? ''} ${f.codigo ?? ''}`} etiquetaBuscar={'Buscar en ' + cat.titulo} alBuscar={setBuscar} pistaBuscar={`Buscar ${cat.titulo.toLowerCase()}…`}
          claseFila={(f) => (f.baja ? 'de-baja' : '')}
          acciones={editable && <button type="button" className="boton" onClick={() => setEditando('nueva')}>Añadir</button>}
          vacio={<>Todavía no hay {cat.titulo.toLowerCase()}.{editable && <> <button type="button" className="boton txt" onClick={() => setEditando('nueva')}>Añadir {cat.singular}</button></>}</>} />
      )}
      {bajas > 0 && <button type="button" className="boton txt" onClick={() => setVerBajas(!verBajas)}>{verBajas ? 'Esconder los dados de baja' : `Ver los dados de baja (${bajas})`}</button>}
      {editando && (
        <FormFila cat={cat} fila={editando === 'nueva' ? null : editando} inicial={editando === 'nueva' ? buscar.trim() : ''} refs={refs} todas={filas ?? []} editable={editable}
          alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); cargar(); }} />
      )}
    </main>
  );
}

type Valores = Record<string, string | string[]>;

function valoresDe(cat: Catalogo, f: Fila | null): Valores {
  const v: Valores = {};
  for (const c of cat.campos) {
    const x = f?.[c.clave];
    if (c.tipo === 'dias') v[c.clave] = ((x as number[]) ?? (f ? [] : [1, 2, 3, 4, 5])).map(String);
    else if (c.tipo === 'estados') v[c.clave] = textoDeEstados(x);
    else if (c.tipo === 'horario') v[c.clave] = textoDeHorario(x);
    else if (c.tipo === 'hora') v[c.clave] = x ? String(x).slice(0, 5) : '';
    else if (c.tipo === 'lista' && x == null && !f && c.obligatorio && c.opciones) v[c.clave] = c.opciones[0][0];
    else v[c.clave] = x == null ? '' : String(x);
  }
  return v;
}

function aGuardar(cat: Catalogo, v: Valores) {
  const out: Record<string, unknown> = {};
  for (const c of cat.campos) {
    const x = v[c.clave];
    if (c.tipo === 'dias') out[c.clave] = (x as string[]).map(Number).sort();
    else if (c.tipo === 'estados') out[c.clave] = estadosDeTexto(String(x));
    else if (c.tipo === 'horario') out[c.clave] = horarioDeTexto(x as string[]);
    else if (c.tipo === 'numero') out[c.clave] = String(x).trim() === '' ? null : Number(String(x).replace(',', '.'));
    else out[c.clave] = String(x).trim() === '' ? null : String(x).trim();
  }
  return out;
}

function FormFila({ cat, fila, inicial, refs, todas, editable, alCerrar, alGuardar }: {
  cat: Catalogo; fila: Fila | null; inicial: string; refs: Record<string, Fila[]>; todas: Fila[]; editable: boolean;
  alCerrar: () => void; alGuardar: () => void;
}) {
  const { empresa } = useSesion();
  /* lo escrito en el buscador pasa al primer campo de texto (nombre o código) al añadir */
  const [v, setV] = useState<Valores>(() => {
    const x = valoresDe(cat, fila);
    const primero = cat.campos.find((c) => c.tipo === 'texto');
    if (!fila && inicial && primero) x[primero.clave] = inicial;
    return x;
  });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pon = (k: string, x: string | string[]) => setV((a) => ({ ...a, [k]: x }));

  async function guardar() {
    setError(null);
    const falta = cat.campos.find((c) => c.obligatorio && (Array.isArray(v[c.clave]) ? !(v[c.clave] as string[]).length : !String(v[c.clave]).trim()));
    if (falta) { setError(`Falta «${falta.etiqueta}».`); return; }
    let datos: Record<string, unknown>;
    try { datos = aGuardar(cat, v); } catch (e) { setError((e as Error).message); return; }
    if (Object.entries(datos).some(([k, x]) => typeof x === 'number' && Number.isNaN(x) && cat.campos.find((c) => c.clave === k))) { setError('Hay un número mal escrito.'); return; }
    setOcupado(true);
    let res;
    if (fila) {
      res = await nucleo().from(cat.tabla).update(datos).eq('id', fila.id).select().single();
    } else {
      if (cat.conCodigo && !datos.codigo) {
        const base = codigoDe(String(datos.nombre ?? ''));
        let cod = base, n = 2;
        while (todas.some((t) => t.codigo === cod)) cod = `${base}-${n++}`;
        datos.codigo = cod;
      }
      res = await nucleo().from(cat.tabla).insert({ ...datos, empresa_id: empresa!.id }).select().single();
    }
    setOcupado(false);
    if (res.error) { setError(textoError(res.error)); return; }
    aviso('Guardado');
    alGuardar();
  }

  async function cambiarBaja() {
    if (!fila) return;
    setOcupado(true);
    const { error } = await nucleo().from(cat.tabla).update({ baja: fila.baja ? null : new Date().toISOString() }).eq('id', fila.id);
    setOcupado(false);
    if (error) { setError(textoError(error)); return; }
    aviso(fila.baja ? 'Vuelve a estar en uso' : 'Dado de baja: ya no sale en las listas, pero se guarda su historia');
    alGuardar();
  }

  const titulo = fila ? String(fila.nombre || fila.codigo) : `Añadir ${cat.singular}`;
  return (
    <Ventana titulo={titulo} alCerrar={alCerrar}
      pie={editable ? <>
        {fila && <button type="button" className="boton sec" disabled={ocupado} onClick={cambiarBaja}>{fila.baja ? 'Volver a dar de alta' : 'Dar de baja'}</button>}
        <button type="button" className="boton" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </> : undefined}>
      <fieldset disabled={!editable} className="formulario">
        {cat.campos.map((c) => <CampoForm key={c.clave} campo={c} valor={v[c.clave]} pon={(x) => pon(c.clave, x)} refs={refs} filaId={fila?.id} />)}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      {!editable && <p className="nota">Solo puedes consultarlo.</p>}
    </Ventana>
  );
}

function CampoForm({ campo: c, valor, pon, refs, filaId }: { campo: Campo; valor: string | string[]; pon: (x: string | string[]) => void; refs: Record<string, Fila[]>; filaId?: string }) {
  const id = 'c-' + c.clave;
  const etiqueta = <span>{c.etiqueta}{c.obligatorio ? ' *' : ''}</span>;
  let control;
  switch (c.tipo) {
    case 'lista':
      control = <select id={id} value={String(valor)} onChange={(e) => pon(e.target.value)}>{c.opciones!.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>;
      break;
    case 'referencia': {
      const ops = (refs[c.ref!.tabla] ?? []).filter((f) => f.id !== filaId && (!f.baja || f.id === valor));
      control = (
        <select id={id} value={String(valor)} onChange={(e) => pon(e.target.value)}>
          {(!c.obligatorio || !valor) && <option value="">{c.obligatorio ? '— elige —' : c.ref!.vacio ?? '—'}</option>}
          {ops.map((f) => <option key={f.id} value={f.id}>{String(f.nombre || f.codigo)}</option>)}
        </select>);
      break;
    }
    case 'dias': {
      const sel = valor as string[];
      return (
        <div className="campo"><span>{c.etiqueta}{c.obligatorio ? ' *' : ''}</span>
          <div className="dias" role="group" aria-label={c.etiqueta}>
            {DIAS_SEMANA.map(([k, t]) => (
              <button key={k} type="button" aria-pressed={sel.includes(k)} onClick={() => pon(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])}>{t}</button>
            ))}
          </div>
        </div>);
    }
    case 'horario': {
      const lineas = valor as string[];
      return (
        <div className="campo"><span>{c.etiqueta}</span>
          <div className="horario">
            {DIAS_HORARIO.map(([k, n], i) => (
              <label key={k}><small>{n}</small>
                <input aria-label={`Horario del ${n.toLowerCase()}`} value={lineas[i] ?? ''} placeholder="—"
                  onChange={(e) => pon(lineas.map((x, j) => (j === i ? e.target.value : x)))} /></label>
            ))}
          </div>
          {c.ayuda && <small className="nota">{c.ayuda}</small>}
        </div>);
    }
    case 'estados':
      control = <textarea id={id} rows={4} value={String(valor)} onChange={(e) => pon(e.target.value)} />;
      break;
    default:
      control = <input id={id} value={String(valor)} onChange={(e) => pon(e.target.value)}
        type={c.tipo === 'hora' ? 'time' : c.tipo === 'correo' ? 'email' : c.tipo === 'telefono' ? 'tel' : 'text'}
        inputMode={c.tipo === 'numero' ? 'decimal' : undefined} />;
  }
  return <label className="campo" htmlFor={id}>{etiqueta}{control}{c.ayuda && <small className="nota">{c.ayuda}</small>}</label>;
}
