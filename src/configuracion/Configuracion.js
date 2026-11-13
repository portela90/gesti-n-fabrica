import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { anotarError } from '../nucleo/errores';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';
import { CATALOGOS, catalogoPorTabla, codigoDe, DIAS_SEMANA, estadosDeTexto, textoDeEstados } from './catalogos';
/** ¿Puede configurar algo en esta unidad de trabajo? (para enseñar «Configuración» en el menú) */
export function useConfigurable() {
    const { puede } = useSesion();
    return puede('nucleo.usuario.editar') || CATALOGOS.some((c) => puede(c.permiso));
}
const textoError = (e) => e.code === '23505' ? 'Ya hay uno con ese código o ese nombre.'
    : e.code === '42501' ? 'No tienes permiso para hacer esto.'
        : e.code === '23503' ? 'Está unido a otra cosa que no existe o es de otra unidad de trabajo.'
            : 'No se ha podido guardar: ' + e.message;
/** Portada de Configuración: un acceso por catálogo, con cuántos hay. */
export function IndiceConfiguracion({ ir }) {
    const { empresa, puede, estado } = useSesion();
    const superadmin = estado.fase === 'dentro' && !!estado.sesion.usuario?.superadmin;
    const mios = CATALOGOS.filter((c) => puede(c.permiso));
    const [cuantos, setCuantos] = useState({});
    useEffect(() => {
        if (!empresa)
            return;
        let vivo = true;
        Promise.all(mios.map(async (c) => {
            const { count } = await nucleo().from(c.tabla).select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id).is('baja', null);
            return [c.tabla, count ?? 0];
        })).then((r) => { if (vivo)
            setCuantos(Object.fromEntries(r)); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empresa?.id]);
    if (!empresa)
        return null;
    const usuarios = puede('nucleo.usuario.editar') || puede('nucleo.usuario.ver');
    if (!mios.length && !usuarios)
        return _jsx("main", { className: "contenido estrecho", children: _jsx("div", { className: "vacio", children: _jsx("p", { children: _jsx("b", { children: "No tienes permiso para configurar nada." }) }) }) });
    return (_jsxs("main", { className: "contenido estrecho", children: [_jsx("h1", { className: "titulo", children: "Configuraci\u00F3n" }), _jsxs("p", { className: "nota", style: { margin: '-8px 0 16px' }, children: ["Todo lo de ", empresa.nombre, " que se da de alta sin programar."] }), _jsxs("div", { className: "lista", children: [superadmin && (_jsxs("button", { type: "button", className: "fila", onClick: () => ir('/config/salud'), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: "Salud de la app" }), _jsx("small", { children: "Espacio usado, copias, errores e incidencias" })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] })), usuarios && (_jsxs("button", { type: "button", className: "fila", onClick: () => ir('/config/usuarios'), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: "Usuarios" }), _jsx("small", { children: "Qui\u00E9n entra, con qu\u00E9 rol y en qu\u00E9 nave" })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] })), mios.map((c) => (_jsxs("button", { type: "button", className: "fila", onClick: () => ir('/config/' + c.tabla), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: c.titulo }), _jsx("small", { children: c.descripcion })] }), _jsx("span", { className: "cuenta num", children: cuantos[c.tabla] ?? '' }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }, c.tabla)))] })] }));
}
/** Lista de un catálogo: buscar, añadir, cambiar y dar de baja. */
export function ListaCatalogo({ tabla, ir }) {
    const { empresa, puede } = useSesion();
    const cat = catalogoPorTabla(tabla);
    const [filas, setFilas] = useState(null);
    const [refs, setRefs] = useState({});
    const [buscar, setBuscar] = useState('');
    const [verBajas, setVerBajas] = useState(false);
    const [editando, setEditando] = useState(null);
    const [error, setError] = useState(null);
    const cargar = useCallback(async () => {
        if (!cat || !empresa)
            return;
        const tablasRef = [...new Set(cat.campos.filter((c) => c.ref).map((c) => c.ref.tabla))];
        const [principal, ...otras] = await Promise.all([cat.tabla, ...tablasRef].map((t) => nucleo().from(t).select('*').eq('empresa_id', empresa.id).order('nombre')));
        if (principal.error) {
            setError(principal.error.message);
            anotarError(new Error('config ' + tabla + ': ' + principal.error.message));
            return;
        }
        setFilas(principal.data);
        setRefs(Object.fromEntries(tablasRef.map((t, i) => [t, (t === cat.tabla ? principal.data : otras[i].data ?? [])])));
    }, [cat, empresa, tabla]);
    useEffect(() => { cargar(); }, [cargar]);
    const nombres = useCallback((t, id) => {
        if (!id)
            return '';
        const f = (refs[t] ?? []).find((x) => x.id === id);
        return f ? String(f.nombre || f.codigo || '') : '';
    }, [refs]);
    const visibles = useMemo(() => {
        const q = buscar.trim().toLowerCase();
        return (filas ?? []).filter((f) => (verBajas || !f.baja) && (!q || `${f.nombre ?? ''} ${f.codigo ?? ''}`.toLowerCase().includes(q)));
    }, [filas, buscar, verBajas]);
    if (!cat || !empresa)
        return null;
    const editable = puede(cat.permiso);
    const bajas = (filas ?? []).filter((f) => f.baja).length;
    return (_jsxs("main", { className: "contenido estrecho", children: [_jsxs("button", { type: "button", className: "boton txt volver", onClick: () => ir('/config'), children: [_jsx(Icono, { d: ICONOS.volver, tam: 18 }), " Configuraci\u00F3n"] }), _jsx("h1", { className: "titulo", children: cat.titulo }), _jsxs("div", { className: "barra-lista", children: [_jsx("input", { type: "search", "aria-label": 'Buscar en ' + cat.titulo, placeholder: `Buscar ${cat.titulo.toLowerCase()}…`, value: buscar, onChange: (e) => setBuscar(e.target.value) }), editable && _jsx("button", { type: "button", className: "boton", onClick: () => setEditando('nueva'), children: "A\u00F1adir" })] }), error && _jsx("p", { className: "error", role: "alert", children: error }), filas === null && !error ? _jsx("p", { className: "nota", children: "Cargando\u2026" }) : visibles.length === 0 ? (_jsxs("div", { className: "vacio", children: [_jsx("p", { children: buscar ? 'Nada coincide con la búsqueda.' : `Todavía no hay ${cat.titulo.toLowerCase()}.` }), editable && !buscar && _jsxs("button", { type: "button", className: "boton", onClick: () => setEditando('nueva'), children: ["A\u00F1adir ", cat.singular] })] })) : (_jsx("div", { className: "lista", children: visibles.map((f) => {
                    const det = cat.detalle(f, nombres);
                    return (_jsxs("button", { type: "button", className: 'fila' + (f.baja ? ' de-baja' : ''), onClick: () => setEditando(f), children: [_jsxs("span", { className: "fila-txt", children: [_jsxs("b", { children: [String(f.nombre || f.codigo), f.codigo && f.nombre && cat.campos.some((c) => c.clave === 'codigo') ? _jsxs("span", { className: "cod", children: [" \u00B7 ", String(f.codigo)] }) : null] }), (det || f.baja) && _jsxs("small", { children: [f.baja ? 'Dado de baja' + (det ? ' · ' : '') : '', det] })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }, f.id));
                }) })), bajas > 0 && _jsx("button", { type: "button", className: "boton txt", onClick: () => setVerBajas(!verBajas), children: verBajas ? 'Esconder los dados de baja' : `Ver los dados de baja (${bajas})` }), editando && (_jsx(FormFila, { cat: cat, fila: editando === 'nueva' ? null : editando, inicial: editando === 'nueva' ? buscar.trim() : '', refs: refs, todas: filas ?? [], editable: editable, alCerrar: () => setEditando(null), alGuardar: () => { setEditando(null); cargar(); } }))] }));
}
function valoresDe(cat, f) {
    const v = {};
    for (const c of cat.campos) {
        const x = f?.[c.clave];
        if (c.tipo === 'dias')
            v[c.clave] = (x ?? (f ? [] : [1, 2, 3, 4, 5])).map(String);
        else if (c.tipo === 'estados')
            v[c.clave] = textoDeEstados(x);
        else if (c.tipo === 'hora')
            v[c.clave] = x ? String(x).slice(0, 5) : '';
        else if (c.tipo === 'lista' && x == null && !f && c.obligatorio && c.opciones)
            v[c.clave] = c.opciones[0][0];
        else
            v[c.clave] = x == null ? '' : String(x);
    }
    return v;
}
function aGuardar(cat, v) {
    const out = {};
    for (const c of cat.campos) {
        const x = v[c.clave];
        if (c.tipo === 'dias')
            out[c.clave] = x.map(Number).sort();
        else if (c.tipo === 'estados')
            out[c.clave] = estadosDeTexto(String(x));
        else if (c.tipo === 'numero')
            out[c.clave] = String(x).trim() === '' ? null : Number(String(x).replace(',', '.'));
        else
            out[c.clave] = String(x).trim() === '' ? null : String(x).trim();
    }
    return out;
}
function FormFila({ cat, fila, inicial, refs, todas, editable, alCerrar, alGuardar }) {
    const { empresa } = useSesion();
    /* lo escrito en el buscador pasa al primer campo de texto (nombre o código) al añadir */
    const [v, setV] = useState(() => {
        const x = valoresDe(cat, fila);
        const primero = cat.campos.find((c) => c.tipo === 'texto');
        if (!fila && inicial && primero)
            x[primero.clave] = inicial;
        return x;
    });
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const pon = (k, x) => setV((a) => ({ ...a, [k]: x }));
    async function guardar() {
        setError(null);
        const falta = cat.campos.find((c) => c.obligatorio && (Array.isArray(v[c.clave]) ? !v[c.clave].length : !String(v[c.clave]).trim()));
        if (falta) {
            setError(`Falta «${falta.etiqueta}».`);
            return;
        }
        const datos = aGuardar(cat, v);
        if (Object.entries(datos).some(([k, x]) => typeof x === 'number' && Number.isNaN(x) && cat.campos.find((c) => c.clave === k))) {
            setError('Hay un número mal escrito.');
            return;
        }
        setOcupado(true);
        let res;
        if (fila) {
            res = await nucleo().from(cat.tabla).update(datos).eq('id', fila.id).select().single();
        }
        else {
            if (cat.conCodigo && !datos.codigo) {
                const base = codigoDe(String(datos.nombre ?? ''));
                let cod = base, n = 2;
                while (todas.some((t) => t.codigo === cod))
                    cod = `${base}-${n++}`;
                datos.codigo = cod;
            }
            res = await nucleo().from(cat.tabla).insert({ ...datos, empresa_id: empresa.id }).select().single();
        }
        setOcupado(false);
        if (res.error) {
            setError(textoError(res.error));
            return;
        }
        aviso('Guardado');
        alGuardar();
    }
    async function cambiarBaja() {
        if (!fila)
            return;
        setOcupado(true);
        const { error } = await nucleo().from(cat.tabla).update({ baja: fila.baja ? null : new Date().toISOString() }).eq('id', fila.id);
        setOcupado(false);
        if (error) {
            setError(textoError(error));
            return;
        }
        aviso(fila.baja ? 'Vuelve a estar en uso' : 'Dado de baja: ya no sale en las listas, pero se guarda su historia');
        alGuardar();
    }
    const titulo = fila ? String(fila.nombre || fila.codigo) : `Añadir ${cat.singular}`;
    return (_jsxs(Ventana, { titulo: titulo, alCerrar: alCerrar, pie: editable ? _jsxs(_Fragment, { children: [fila && _jsx("button", { type: "button", className: "boton sec", disabled: ocupado, onClick: cambiarBaja, children: fila.baja ? 'Volver a dar de alta' : 'Dar de baja' }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: guardar, children: ocupado ? 'Guardando…' : 'Guardar' })] }) : undefined, children: [_jsx("fieldset", { disabled: !editable, className: "formulario", children: cat.campos.map((c) => _jsx(CampoForm, { campo: c, valor: v[c.clave], pon: (x) => pon(c.clave, x), refs: refs, filaId: fila?.id }, c.clave)) }), error && _jsx("p", { className: "error", role: "alert", children: error }), !editable && _jsx("p", { className: "nota", children: "Solo puedes consultarlo." })] }));
}
function CampoForm({ campo: c, valor, pon, refs, filaId }) {
    const id = 'c-' + c.clave;
    const etiqueta = _jsxs("span", { children: [c.etiqueta, c.obligatorio ? ' *' : ''] });
    let control;
    switch (c.tipo) {
        case 'lista':
            control = _jsx("select", { id: id, value: String(valor), onChange: (e) => pon(e.target.value), children: c.opciones.map(([k, t]) => _jsx("option", { value: k, children: t }, k)) });
            break;
        case 'referencia': {
            const ops = (refs[c.ref.tabla] ?? []).filter((f) => f.id !== filaId && (!f.baja || f.id === valor));
            control = (_jsxs("select", { id: id, value: String(valor), onChange: (e) => pon(e.target.value), children: [(!c.obligatorio || !valor) && _jsx("option", { value: "", children: c.obligatorio ? '— elige —' : c.ref.vacio ?? '—' }), ops.map((f) => _jsx("option", { value: f.id, children: String(f.nombre || f.codigo) }, f.id))] }));
            break;
        }
        case 'dias': {
            const sel = valor;
            return (_jsxs("div", { className: "campo", children: [_jsxs("span", { children: [c.etiqueta, c.obligatorio ? ' *' : ''] }), _jsx("div", { className: "dias", role: "group", "aria-label": c.etiqueta, children: DIAS_SEMANA.map(([k, t]) => (_jsx("button", { type: "button", "aria-pressed": sel.includes(k), onClick: () => pon(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]), children: t }, k))) })] }));
        }
        case 'estados':
            control = _jsx("textarea", { id: id, rows: 4, value: String(valor), onChange: (e) => pon(e.target.value) });
            break;
        default:
            control = _jsx("input", { id: id, value: String(valor), onChange: (e) => pon(e.target.value), type: c.tipo === 'hora' ? 'time' : c.tipo === 'correo' ? 'email' : c.tipo === 'telefono' ? 'tel' : 'text', inputMode: c.tipo === 'numero' ? 'decimal' : undefined });
    }
    return _jsxs("label", { className: "campo", htmlFor: id, children: [etiqueta, control, c.ayuda && _jsx("small", { className: "nota", children: c.ayuda })] });
}
