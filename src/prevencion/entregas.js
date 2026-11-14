import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Entregas de EPI (SH-CORP-SP-FO-014): hacerlas (jefe o encargado), enviarlas a firmar, recoger la firma en el móvil,
// que el trabajador las lea y firme, anular y sacar el PDF oficial.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { descargar } from './pdfToolbox';
import { fechaCorta, hoy, prev, textoError, useAjustes, usePersonas } from './comun';
import { CODIGO_EPI, EPI_DECL, EPI_GRUPOS, EPI_INTRO, EPI_ITEMS, MOTIVOS_EPI, lineasEpi, pdfEpi, } from './epi';
const ANIO_ACTUAL = new Date().getFullYear();
const ROPA = ['Pantalón de trabajo', 'Camiseta manga corta', 'Camiseta manga larga', 'Polo', 'Camisa', 'Chaqueta', 'Forro polar', 'Chaleco', 'Sudadera', 'Bata', 'Gorra', 'Calcetines'];
export function estadoDoc(d) {
    if (d.anulado)
        return ['Anulado', 'sin'];
    if (d.firma_id)
        return ['Firmado', 'firmado'];
    if (d.enviado_en)
        return ['Sin firmar', 'pendiente'];
    return ['Sin enviar', 'sin'];
}
/** PDF oficial (FO-014) de una o varias entregas, con las firmas, el DNI y el puesto (si se pueden ver) y el sello. */
export async function pdfEntregas(docs, ajustes) {
    const pids = [...new Set(docs.map((d) => d.persona_id))];
    const fids = docs.map((d) => d.firma_id).filter(Boolean);
    const [fichas, personas, firmas] = await Promise.all([
        prev().from('fichas').select('persona_id, dni, puesto').in('persona_id', pids),
        nucleo().from('personas').select('id, categoria').in('id', pids),
        fids.length ? nucleo().from('firmas').select('id, imagen').in('id', fids) : Promise.resolve({ data: [] }),
    ]);
    const fi = (fichas.data ?? []);
    const pe = (personas.data ?? []);
    const fr = (firmas.data ?? []);
    return pdfEpi(docs.map((d) => {
        const f = fi.find((x) => x.persona_id === d.persona_id);
        return {
            nombre: d.nombre ?? '', dni: f?.dni ?? null, puesto: f?.puesto ?? pe.find((x) => x.id === d.persona_id)?.categoria ?? null,
            fecha: d.fecha, datos: d.datos, firma: fr.find((x) => x.id === d.firma_id)?.imagen ?? null, firmado_en: d.firmado_en,
        };
    }), ajustes.sello || ajustes.firma_formador || null);
}
export async function descargarEntregas(docs, ajustes, nombre) {
    try {
        descargar(await pdfEntregas(docs, ajustes), nombre);
    }
    catch (e) {
        aviso('No se ha podido hacer el PDF: ' + e.message);
    }
}
const nombrePdf = (d) => `${CODIGO_EPI} Entrega de EPI ${d.nombre ?? ''} ${d.fecha}.pdf`;
// ---------------------------------------------------------------------------------------------
// Lista de entregas del año
// ---------------------------------------------------------------------------------------------
export function Entregas() {
    const { empresa, puede } = useSesion();
    const ajustes = useAjustes();
    const [anio, setAnio] = useState(ANIO_ACTUAL);
    const [docs, setDocs] = useState(null);
    const [nueva, setNueva] = useState(false);
    const [abierto, setAbierto] = useState(null);
    const [haciendo, setHaciendo] = useState(false);
    const editable = puede('prevencion.documento.editar');
    const cargar = useCallback(async () => {
        const { data } = await prev().from('documentos').select('*').eq('empresa_id', empresa.id).eq('tipo', 'epi')
            .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha', { ascending: false });
        setDocs((data ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.nombre ?? '').localeCompare(b.nombre ?? '')));
    }, [empresa, anio]);
    useEffect(() => { cargar(); }, [cargar]);
    const firmados = (docs ?? []).filter((d) => d.firma_id && !d.anulado);
    const sinFirmar = (docs ?? []).filter((d) => !d.firma_id && !d.anulado);
    const doc = docs?.find((d) => d.id === abierto) ?? null;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "filtros", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "A\u00F1o" }), _jsx("select", { value: anio, onChange: (e) => setAnio(Number(e.target.value)), children: [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => _jsx("option", { children: a }, a)) })] }), editable && _jsxs("div", { className: "campo", children: [_jsx("span", { "aria-hidden": "true", children: "\u00A0" }), _jsx("button", { type: "button", className: "boton", onClick: () => setNueva(true), children: "\uFF0B Entrega de EPI" })] })] }), docs === null ? _jsx("p", { className: "nota", children: "Cargando\u2026" }) : !docs.length ? _jsx("div", { className: "vacio", children: _jsxs("p", { children: ["No hay entregas de EPI en ", anio, "."] }) }) : (_jsxs(_Fragment, { children: [_jsxs("p", { className: "nota", style: { marginTop: 0 }, children: [docs.length, " entrega", docs.length === 1 ? '' : 's', " en ", anio, sinFirmar.length ? ` · ${sinFirmar.length} sin firmar` : '', "."] }), _jsx("div", { className: "lista", children: docs.map((d) => {
                            const [t, c] = estadoDoc(d);
                            return (_jsxs("button", { type: "button", className: 'fila' + (d.anulado ? ' de-baja' : ''), onClick: () => setAbierto(d.id), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: d.nombre }), _jsxs("small", { children: [fechaCorta(d.fecha), " \u00B7 ", lineasEpi(d.datos).map((l) => l.split(' · ')[0].replace(/\s*\(.*\)$/, '')).join(', ') || '—'] })] }), _jsx("span", { className: 'chapa ' + c, children: t })] }, d.id));
                        }) }), _jsxs("div", { className: "botonera", children: [editable && sinFirmar.some((d) => !d.enviado_en) && _jsx("button", { type: "button", className: "boton sec", onClick: async () => {
                                    const { data, error } = await prev().rpc('enviar_documentos', { p_ids: sinFirmar.map((d) => d.id) });
                                    if (error) {
                                        aviso(textoError(error.message));
                                        return;
                                    }
                                    aviso(`Enviadas: faltan ${data} por firmar`);
                                    cargar();
                                }, children: "Enviar las que faltan" }), firmados.length > 0 && _jsx("button", { type: "button", className: "boton sec", disabled: haciendo, onClick: async () => {
                                    setHaciendo(true);
                                    await descargarEntregas(firmados, ajustes, `${CODIGO_EPI} Entregas de EPI ${anio}.pdf`);
                                    setHaciendo(false);
                                }, children: haciendo ? 'Haciendo el PDF…' : `PDF de todas las firmadas (${firmados.length})` })] })] })), nueva && _jsx(EditarEntrega, { doc: null, alCerrar: () => setNueva(false), alGuardar: () => { setNueva(false); cargar(); } }), doc && _jsx(DetalleEntrega, { doc: doc, alCerrar: () => setAbierto(null), alCambiar: cargar })] }));
}
// ---------------------------------------------------------------------------------------------
// Hacer o cambiar una entrega
// ---------------------------------------------------------------------------------------------
function Motivo({ v, alCambiar }) {
    return (_jsxs("span", { className: "motivo", children: [_jsx("select", { "aria-label": "Motivo", value: v.motivo ?? 'Primera entrega', onChange: (e) => alCambiar({ ...v, motivo: e.target.value }), children: MOTIVOS_EPI.map((m) => _jsx("option", { children: m }, m)) }), v.motivo === 'Otro' && _jsx("input", { "aria-label": "Escribe el motivo", placeholder: "Escribe el motivo", maxLength: 80, value: v.mtxt ?? '', onChange: (e) => alCambiar({ ...v, mtxt: e.target.value }) })] }));
}
function EditarEntrega({ doc, alCerrar, alGuardar }) {
    const { empresa } = useSesion();
    const personas = usePersonas();
    const ajustes = useAjustes();
    const [elegidos, setElegidos] = useState(new Set());
    const [fecha, setFecha] = useState(doc?.fecha ?? hoy());
    const [lugar, setLugar] = useState(doc?.datos.lugar ?? null);
    const [items, setItems] = useState(doc?.datos.items ?? {});
    const [otros, setOtros] = useState(() => { const o = [...(doc?.datos.otros ?? [])]; while (o.length < 4)
        o.push({ t: '' }); return o; });
    const [prendas, setPrendas] = useState([]);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        prev().from('prendas').select('nombre').eq('empresa_id', empresa.id).is('baja', null)
            .then(({ data }) => setPrendas((data ?? []).map((x) => x.nombre)));
    }, [empresa]);
    const activos = personas.filter((p) => !p.baja);
    const marca = (k, on) => setItems((x) => { const n = { ...x }; if (on)
        n[k] = n[k] ?? { u: '1', motivo: 'Primera entrega' };
    else
        delete n[k]; return n; });
    const pon = (k, v) => setItems((x) => ({ ...x, [k]: v }));
    const ponOtro = (i, v) => setOtros((o) => o.map((x, j) => (j === i ? v : x)));
    async function guardar(enviar) {
        const datos = {
            items, lugar: (lugar ?? ajustes.centro ?? '').trim(),
            otros: otros.filter((o) => o.t.trim()).map((o) => ({ ...o, t: o.t.trim(), motivo: o.motivo ?? 'Primera entrega' })),
        };
        if (!Object.keys(items).length && !datos.otros.length) {
            setError('Marca al menos un equipo o prenda.');
            return;
        }
        if (!doc && !elegidos.size) {
            setError('Elige al menos un trabajador.');
            return;
        }
        if (!fecha) {
            setError('Falta la fecha.');
            return;
        }
        setOcupado(true);
        setError(null);
        let ids = [];
        if (doc) {
            const { error } = await prev().from('documentos').update({ fecha, datos }).eq('id', doc.id);
            if (error) {
                setOcupado(false);
                setError(textoError(error.message));
                return;
            }
            ids = [doc.id];
        }
        else {
            const { data, error } = await prev().from('documentos')
                .insert([...elegidos].map((p) => ({ empresa_id: empresa.id, tipo: 'epi', persona_id: p, fecha, datos }))).select('id');
            if (error) {
                setOcupado(false);
                setError(textoError(error.message));
                return;
            }
            ids = (data ?? []).map((x) => x.id);
        }
        if (enviar && ids.length) {
            const { error } = await prev().rpc('enviar_documentos', { p_ids: ids });
            if (error) {
                setOcupado(false);
                setError(textoError(error.message));
                return;
            }
        }
        setOcupado(false);
        aviso(enviar ? 'Guardada y enviada a firmar' : 'Guardada');
        alGuardar();
    }
    return (_jsxs(Ventana, { titulo: doc ? `Entrega de EPI · ${doc.nombre}` : 'Nueva entrega de EPI', alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", disabled: ocupado, onClick: () => guardar(false), children: "Guardar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: () => guardar(true), children: doc?.enviado_en ? 'Guardar y avisar' : 'Guardar y enviar' })] }), children: [!doc && (_jsxs("fieldset", { className: "grupo-epi", children: [_jsxs("legend", { children: ["Trabajadores ", _jsx("small", { children: "(se hace una para cada uno)" })] }), _jsxs("div", { className: "botonera", style: { justifyContent: 'flex-start', marginTop: 0 }, children: [_jsx("button", { type: "button", className: "boton txt peq", onClick: () => setElegidos(new Set(activos.map((p) => p.id))), children: "Todos" }), _jsx("button", { type: "button", className: "boton txt peq", onClick: () => setElegidos(new Set()), children: "Ninguno" })] }), activos.map((p) => (_jsxs("label", { className: "marca", children: [_jsx("input", { type: "checkbox", checked: elegidos.has(p.id), onChange: (e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked)
                                    n.add(p.id);
                                else
                                    n.delete(p.id); return n; }) }), " ", p.nombre] }, p.id)))] })), _jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: fecha, onChange: (e) => setFecha(e.target.value) })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Lugar (\u00ABEn \u2026, a \u2026\u00BB)" }), _jsx("input", { value: lugar ?? ajustes.centro ?? '', maxLength: 80, onChange: (e) => setLugar(e.target.value) })] })] }), EPI_GRUPOS.map(([g, claves]) => (_jsxs("fieldset", { className: "grupo-epi", children: [_jsx("legend", { children: g }), claves.map((k) => {
                        const it = EPI_ITEMS.find((i) => i[0] === k);
                        const v = items[k];
                        return (_jsxs("div", { className: "linea-epi", children: [_jsxs("label", { className: "marca", children: [_jsx("input", { type: "checkbox", checked: !!v, onChange: (e) => marca(k, e.target.checked) }), " ", it[1]] }), v && _jsxs(_Fragment, { children: [_jsx("input", { className: "ud", "aria-label": `Unidades de ${it[1]}`, type: "number", min: 1, inputMode: "numeric", value: v.u ?? '', onChange: (e) => pon(k, { ...v, u: e.target.value }) }), _jsx(Motivo, { v: v, alCambiar: (x) => pon(k, x) }), it[5] && _jsx("span", { className: "cats", children: it[5].map((c) => (_jsxs("label", { className: "marca peq", children: [_jsx("input", { type: "checkbox", checked: (v.cat ?? []).includes(c), onChange: (e) => pon(k, { ...v, cat: e.target.checked ? [...(v.cat ?? []), c] : (v.cat ?? []).filter((x) => x !== c) }) }), " ", c] }, c))) })] })] }, k));
                    })] }, g))), _jsxs("fieldset", { className: "grupo-epi", children: [_jsxs("legend", { children: ["Ropa de trabajo y otros ", _jsx("small", { children: "(hasta 4)" })] }), _jsx("datalist", { id: "ropa-epi", children: [...new Set([...prendas, ...ROPA])].map((r) => _jsx("option", { value: r }, r)) }), otros.map((o, i) => (_jsxs("div", { className: "linea-epi", children: [_jsx("input", { className: "otro", list: "ropa-epi", "aria-label": `Prenda ${i + 1}`, placeholder: "Prenda o elemento", maxLength: 60, value: o.t, onChange: (e) => ponOtro(i, { ...o, t: e.target.value }) }), _jsx("input", { className: "ud", "aria-label": `Unidades de la prenda ${i + 1}`, type: "number", min: 1, inputMode: "numeric", placeholder: "Ud.", value: o.u ?? '', onChange: (e) => ponOtro(i, { ...o, u: e.target.value }) }), o.t.trim() && _jsx(Motivo, { v: o, alCambiar: (x) => ponOtro(i, { ...o, ...x }) })] }, i)))] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
// ---------------------------------------------------------------------------------------------
// Una entrega: lo que lee el trabajador, su estado y lo que se puede hacer
// ---------------------------------------------------------------------------------------------
export function TextoEntrega({ d }) {
    return (_jsxs("div", { className: "charla", children: [_jsxs("p", { className: "nota", style: { marginTop: 0 }, children: [CODIGO_EPI, " \u00B7 Entrega de EPI \u00B7 ", fechaCorta(d.fecha)] }), _jsx("h3", { className: "subtitulo", style: { marginTop: 0 }, children: "Equipos que recibes" }), _jsx("ul", { children: lineasEpi(d.datos).map((l) => _jsx("li", { children: l }, l)) }), _jsx("p", { children: EPI_INTRO }), _jsx("p", { children: _jsx("b", { children: "Al firmar declaras que:" }) }), _jsx("ol", { children: EPI_DECL.map((t) => _jsx("li", { children: t }, t)) })] }));
}
function DetalleEntrega({ doc, alCerrar, alCambiar }) {
    const { puede } = useSesion();
    const ajustes = useAjustes();
    const [editando, setEditando] = useState(false);
    const [firmando, setFirmando] = useState(false);
    const [firma, setFirma] = useState(null);
    const [haciendo, setHaciendo] = useState(false);
    useEffect(() => {
        if (!doc.firma_id)
            return;
        nucleo().from('firmas').select('imagen').eq('id', doc.firma_id).maybeSingle().then(({ data }) => setFirma(data?.imagen ?? null));
    }, [doc.firma_id]);
    const editable = puede('prevencion.documento.editar') && !doc.firma_id;
    const [t, c] = estadoDoc(doc);
    async function enviar() {
        const { error } = await prev().rpc('enviar_documentos', { p_ids: [doc.id] });
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso(doc.enviado_en ? 'Aviso enviado' : 'Enviada a firmar');
        alCambiar();
    }
    async function borrar() {
        if (!confirm(`¿Borrar la entrega de ${doc.nombre}?`))
            return;
        const { error } = await prev().from('documentos').delete().eq('id', doc.id);
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso('Borrada');
        alCerrar();
        alCambiar();
    }
    async function anular() {
        if (!confirm(`¿Anular la entrega firmada de ${doc.nombre}? La firma queda guardada, pero deja de contar.`))
            return;
        const { error } = await prev().rpc('anular_documento', { p_documento: doc.id });
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso('Anulada');
        alCambiar();
    }
    return (_jsxs(Ventana, { titulo: `${doc.nombre} · ${fechaCorta(doc.fecha)}`, alCerrar: alCerrar, children: [_jsxs("p", { style: { marginTop: 0 }, children: [_jsx("span", { className: 'chapa ' + c, children: t }), ' ', _jsx("small", { className: "nota", children: doc.firmado_en ? `Firmado el ${new Date(doc.firmado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
                            : doc.enviado_en ? `Enviada el ${fechaCorta(doc.enviado_en)}; esperando a que firme.` : 'Todavía no se le ha enviado.' })] }), firma && _jsx("img", { className: "firma-guardada", src: firma, alt: `Firma de ${doc.nombre}` }), _jsx(TextoEntrega, { d: doc }), _jsxs("div", { className: "botonera", children: [editable && _jsx("button", { type: "button", className: "boton sec", onClick: () => setEditando(true), children: "Cambiar" }), editable && _jsx("button", { type: "button", className: "boton txt peligro", onClick: borrar, children: "Borrar" }), editable && _jsx("button", { type: "button", className: "boton sec", onClick: enviar, children: doc.enviado_en ? 'Recordar' : 'Enviar al trabajador' }), !doc.firma_id && !doc.anulado && puede('prevencion.firma.recoger') && _jsx("button", { type: "button", className: "boton", onClick: () => setFirmando(true), children: "Firmar aqu\u00ED" }), doc.firma_id && !doc.anulado && puede('prevencion.firma.anular') && _jsx("button", { type: "button", className: "boton txt peligro", onClick: anular, children: "Anular" }), _jsx("button", { type: "button", className: "boton sec", disabled: haciendo, onClick: async () => { setHaciendo(true); await descargarEntregas([doc], ajustes, nombrePdf(doc)); setHaciendo(false); }, children: haciendo ? 'Haciendo el PDF…' : 'PDF oficial' })] }), editando && _jsx(EditarEntrega, { doc: doc, alCerrar: () => setEditando(false), alGuardar: () => { setEditando(false); alCambiar(); } }), firmando && _jsx(FirmarEntrega, { doc: doc, alCerrar: () => setFirmando(false), alFirmar: () => { setFirmando(false); alCambiar(); } })] }));
}
/** Leer y firmar una entrega: el propio trabajador o, en el móvil del jefe o del encargado, el trabajador. */
export function FirmarEntrega({ doc, alCerrar, alFirmar }) {
    const { estado } = useSesion();
    const [leida, setLeida] = useState(false);
    const [png, setPng] = useState(null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
    async function firmar() {
        if (!png) {
            setError('Falta la firma.');
            return;
        }
        setOcupado(true);
        setError(null);
        const { error } = await prev().rpc('firmar_documento', {
            p_documento: doc.id, p_imagen: png,
            p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
        });
        setOcupado(false);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Firmada');
        alFirmar();
    }
    return (_jsx(Ventana, { titulo: "Entrega de EPI", alCerrar: alCerrar, pie: leida
            ? _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: () => setLeida(false), children: "Atr\u00E1s" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: firmar, children: "Firmar" })] })
            : _jsx("button", { type: "button", className: "boton", onClick: () => setLeida(true), children: "He recibido los equipos, firmar" }), children: !leida ? _jsx(TextoEntrega, { d: doc }) : (_jsxs(_Fragment, { children: [_jsx("p", { style: { marginTop: 0 }, children: _jsx("b", { children: doc.nombre }) }), _jsx("p", { className: "nota", style: { marginBottom: 8 }, children: "Firmo que he recibido los equipos y conozco su uso correcto." }), _jsx(Firma, { alCambiar: setPng }), error && _jsx("p", { className: "error", role: "alert", children: error })] })) }));
}
// ---------------------------------------------------------------------------------------------
// Para el trabajador: lo que tiene por firmar y sus tallas
// ---------------------------------------------------------------------------------------------
export function MisEntregas({ persona }) {
    const [docs, setDocs] = useState(null);
    const [firmando, setFirmando] = useState(null);
    const cargar = useCallback(async () => {
        const { data } = await prev().from('documentos').select('*').eq('persona_id', persona).is('anulado', null).order('fecha', { ascending: false });
        setDocs((data ?? []));
    }, [persona]);
    useEffect(() => { cargar(); }, [cargar]);
    const pendientes = (docs ?? []).filter((d) => !d.firma_id);
    if (!pendientes.length)
        return null;
    return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "aviso-linea", children: ["Tienes ", pendientes.length === 1 ? 'una entrega de EPI' : `${pendientes.length} entregas de EPI`, " por firmar."] }), _jsx("div", { className: "lista", style: { marginBottom: 16 }, children: pendientes.map((d) => (_jsxs("button", { type: "button", className: "fila", onClick: () => setFirmando(d), children: [_jsxs("span", { className: "fila-txt", children: [_jsxs("b", { children: ["Entrega de EPI \u00B7 ", fechaCorta(d.fecha)] }), _jsx("small", { children: lineasEpi(d.datos).map((l) => l.split(' · ')[0].replace(/\s*\(.*\)$/, '')).join(', ') })] }), _jsx("span", { className: "chapa pendiente", children: "Firmar" })] }, d.id))) }), firmando && _jsx(FirmarEntrega, { doc: firmando, alCerrar: () => setFirmando(null), alFirmar: () => { setFirmando(null); cargar(); } })] }));
}
export function MisTallas({ persona }) {
    const { empresa } = useSesion();
    const [prendas, setPrendas] = useState([]);
    const [ficha, setFicha] = useState(null);
    const [v, setV] = useState({});
    const [abierta, setAbierta] = useState(false);
    const [error, setError] = useState(null);
    const cargar = useCallback(async () => {
        const [p, f] = await Promise.all([
            prev().from('prendas').select('codigo, nombre').eq('empresa_id', empresa.id).is('baja', null).order('orden'),
            prev().from('fichas').select('tallas, tallas_propuestas').eq('persona_id', persona).maybeSingle(),
        ]);
        setPrendas((p.data ?? []));
        setFicha(f.data ?? { tallas: {}, tallas_propuestas: null });
    }, [empresa, persona]);
    useEffect(() => { cargar(); }, [cargar]);
    if (!ficha || !prendas.length)
        return null;
    const actual = (k) => ficha.tallas_propuestas?.[k] ?? ficha.tallas?.[k] ?? '';
    async function enviar() {
        const tallas = Object.fromEntries(prendas.map((p) => [p.codigo, (v[p.codigo] ?? actual(p.codigo)).trim()]));
        const { error } = await prev().rpc('proponer_tallas', { p_tallas: tallas });
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Tallas enviadas');
        setAbierta(false);
        cargar();
    }
    return (_jsxs(_Fragment, { children: [_jsx("h2", { className: "subtitulo", children: "Mis tallas" }), _jsx("div", { className: "lista", children: _jsxs("button", { type: "button", className: "fila", onClick: () => { setV({}); setAbierta(true); }, children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: prendas.map((p) => `${p.nombre}: ${ficha.tallas?.[p.codigo] || '—'}`).join(' · ') }), _jsx("small", { children: ficha.tallas_propuestas ? 'Has enviado cambios: falta que los revisen' : 'Toca para cambiarlas' })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }) }), abierta && (_jsxs(Ventana, { titulo: "Mis tallas", alCerrar: () => setAbierta(false), pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: () => setAbierta(false), children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", onClick: enviar, children: "Enviar" })] }), children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Tu ficha cambia cuando tu responsable acepte las tallas." }), _jsx("div", { className: "dos", children: prendas.map((p) => (_jsxs("label", { className: "campo", children: [_jsx("span", { children: p.nombre }), _jsx("input", { maxLength: 10, value: v[p.codigo] ?? actual(p.codigo), onChange: (e) => setV((x) => ({ ...x, [p.codigo]: e.target.value })) })] }, p.codigo))) }), error && _jsx("p", { className: "error", role: "alert", children: error })] }))] }));
}
/** En la ficha: tallas que ha propuesto el trabajador, para aceptarlas o rechazarlas. */
export function TallasPropuestas({ persona, propuestas, tallas, nombres, alResolver }) {
    const cambios = useMemo(() => Object.entries(propuestas).filter(([k, x]) => tallas[k] !== x), [propuestas, tallas]);
    async function resolver(aceptar) {
        const { error } = await prev().from('fichas').update(aceptar
            ? { tallas: { ...tallas, ...propuestas }, tallas_propuestas: null, tallas_propuestas_en: null }
            : { tallas_propuestas: null, tallas_propuestas_en: null }).eq('persona_id', persona);
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso(aceptar ? 'Tallas aceptadas' : 'Cambios rechazados');
        alResolver();
    }
    return (_jsxs("div", { className: "propuesta", children: [_jsx("b", { children: "Tallas propuestas por el trabajador" }), _jsx("p", { className: "nota", style: { margin: '4px 0' }, children: cambios.length ? cambios.map(([k, x]) => `${nombres[k] ?? k}: ${tallas[k] || '—'} → ${x}`).join(' · ') : 'Son las mismas que ya tiene.' }), _jsxs("div", { className: "botonera", style: { marginTop: 6 }, children: [_jsx("button", { type: "button", className: "boton sec peq", onClick: () => resolver(false), children: "Rechazar" }), _jsx("button", { type: "button", className: "boton peq", onClick: () => resolver(true), children: "Aceptar" })] })] }));
}
