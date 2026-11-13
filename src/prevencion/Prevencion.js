import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { descargar, pdfToolbox } from './pdfToolbox';
import { abrirDocumento, bajarDocumento, mesDelNombre, subirDocumento, unirPdfs } from './documentos';
/** Tablas y funciones de Prevención (esquema «prevencion»). */
const prev = () => supabase.schema('prevencion');
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fechaCorta = (f) => { if (!f)
    return ''; const [a, m, d] = f.slice(0, 10).split('-').map(Number); return `${d}/${m}/${a}`; };
const ANIO_ACTUAL = new Date().getFullYear();
const ERRORES = {
    NO_PERMISO: 'No tienes permiso para hacer esto.', CERRADA: 'Este mes ya está cerrado.', YA_FIRMADO: 'Ya está firmada.',
    FIRMA_MAL: 'Falta la firma.', NO_ENVIADA: 'Esta charla aún no se ha enviado.', SIN_PREVISTOS: 'Elige antes quién tiene que firmarla.',
    TIENE_SESION: 'Esta charla ya tiene sesión; no se puede borrar.', duplicate: 'Ya hay una charla para ese mes.', dni_check: 'El DNI no está bien escrito (solo letras y números, sin espacios).',
};
const textoError = (m) => { const k = Object.keys(ERRORES).find((x) => m.includes(x)); return k ? ERRORES[k] : m; };
/** Módulo Prevención: mis charlas (todos) y, según permisos, las charlas de cada mes y las fichas de los trabajadores. */
export function Prevencion({ ruta, ir }) {
    const { puede } = useSesion();
    const pestanas = [
        ['mias', 'Mis charlas', true],
        ['charlas', 'Charlas', puede('prevencion.charla.ver')],
        ['fichas', 'Fichas', puede('prevencion.ficha.ver')],
    ].filter((p) => p[2]);
    const pedida = (ruta.split('/')[3] ?? '');
    const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? (pestanas.length > 1 ? 'charlas' : 'mias');
    return (_jsxs("main", { className: "contenido", style: { ['--area']: '#b91c1c' }, children: [pestanas.length > 1 && (_jsx("nav", { className: "pestanas no-imprimir", "aria-label": "Prevenci\u00F3n", children: pestanas.map(([c, n]) => _jsx("button", { type: "button", "aria-pressed": actual === c, onClick: () => ir(`/m/prevencion/${c}`), children: n }, c)) })), actual === 'mias' && _jsx(MisCharlas, {}), actual === 'charlas' && _jsx(Charlas, {}), actual === 'fichas' && _jsx(Fichas, {})] }));
}
// ---------------------------------------------------------------------------------------------
// Charlas: los 12 meses del año
// ---------------------------------------------------------------------------------------------
function Charlas() {
    const { empresa, puede } = useSesion();
    const [anio, setAnio] = useState(ANIO_ACTUAL);
    const [charlas, setCharlas] = useState(null);
    const [sesiones, setSesiones] = useState([]);
    const [firmas, setFirmas] = useState([]);
    const [abierto, setAbierto] = useState(null);
    const [ajustes, setAjustes] = useState(false);
    const [subir, setSubir] = useState(null);
    const editable = puede('prevencion.charla.editar');
    const cargar = useCallback(async () => {
        const { data, error } = await prev().from('charlas').select('*').eq('empresa_id', empresa.id).eq('anio', anio).order('mes');
        if (error) {
            aviso(error.message);
            return;
        }
        const cs = (data ?? []);
        const ids = cs.map((c) => c.id);
        const s = ids.length ? await prev().from('sesiones').select('*').in('charla_id', ids) : { data: [] };
        const sids = (s.data ?? []).map((x) => x.id);
        const a = sids.length && puede('prevencion.firma.ver') ? await prev().from('asistencias').select('*').in('sesion_id', sids).is('anulada', null) : { data: [] };
        setCharlas(cs);
        setSesiones((s.data ?? []));
        setFirmas((a.data ?? []));
    }, [empresa, anio, puede]);
    useEffect(() => { cargar(); }, [cargar]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "filtros", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "A\u00F1o" }), _jsx("select", { value: anio, onChange: (e) => setAnio(Number(e.target.value)), children: [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => _jsx("option", { children: a }, a)) })] }), editable && _jsxs("div", { className: "campo", children: [_jsx("span", { "aria-hidden": "true", children: "\u00A0" }), _jsx("button", { type: "button", className: "boton sec", onClick: () => setAjustes(true), children: "Datos por defecto" })] }), editable && _jsxs("div", { className: "campo", children: [_jsx("span", { "aria-hidden": "true", children: "\u00A0" }), _jsxs("label", { className: "boton sec archivo", children: ["Subir documentos del a\u00F1o", _jsx("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, onChange: (e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length)
                                            setSubir(f); } })] })] })] }), charlas === null ? _jsx("p", { className: "nota", children: "Cargando\u2026" }) : (_jsx("div", { className: "lista", children: MESES.map((nombre, i) => {
                    const c = charlas.find((x) => x.mes === i + 1);
                    const s = c && sesiones.find((x) => x.charla_id === c.id);
                    const n = s ? firmas.filter((f) => f.sesion_id === s.id).length : 0;
                    const estado = !c ? 'Sin charla' : !s?.enviada_en ? 'Sin enviar' : s.cerrada_en ? 'Cerrada' : 'Firmando';
                    return (_jsxs("button", { type: "button", className: 'fila' + (!c ? ' de-baja' : ''), disabled: !c && !editable, onClick: () => setAbierto(i + 1), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: nombre }), _jsx("small", { children: c ? (c.tema || c.compromiso || c.documento_nombre) : editable ? 'Toca para subir el documento o escribirla' : 'Todavía no hay charla' }), s && _jsxs("small", { children: [s.cerrada_en ? `Cerrada el ${fechaCorta(s.cerrada_en)}` : s.enviada_en ? `Enviada el ${fechaCorta(s.enviada_en)}` : 'Sin enviar', ' · ', n, " de ", s.previstos.length, " firmas"] })] }), _jsx("span", { className: 'chapa ' + (estado === 'Cerrada' ? 'firmado' : estado === 'Firmando' ? 'pendiente' : 'sin'), children: estado })] }, nombre));
                }) })), abierto && _jsx(Mes, { anio: anio, mes: abierto, charla: charlas?.find((c) => c.mes === abierto) ?? null, sesion: sesiones.find((s) => s.charla_id === charlas?.find((c) => c.mes === abierto)?.id) ?? null, alCerrar: () => setAbierto(null), alCambiar: cargar }), ajustes && _jsx(Ajustes, { alCerrar: () => setAjustes(false) }), subir && charlas && _jsx(SubirDelAnio, { anio: anio, archivos: subir, charlas: charlas, sesiones: sesiones, alCerrar: () => setSubir(null), alSubir: () => { setSubir(null); cargar(); } })] }));
}
/** Subir de una vez los PDF del técnico de todo el año: la app reconoce el mes por el nombre y se puede corregir. */
function SubirDelAnio({ anio, archivos, charlas, sesiones, alCerrar, alSubir }) {
    const { empresa } = useSesion();
    const [meses, setMeses] = useState(() => archivos.map((f) => mesDelNombre(f.name) ?? 0));
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const cerradoEl = (mes) => { const c = charlas.find((x) => x.mes === mes); return c ? sesiones.find((s) => s.charla_id === c.id)?.cerrada_en ?? null : null; };
    const repetidos = meses.filter((m, i) => m && meses.indexOf(m) !== i);
    async function subir() {
        if (repetidos.length) {
            setError(`Hay dos documentos para ${MESES[repetidos[0] - 1]}.`);
            return;
        }
        if (meses.some((m, i) => m && cerradoEl(m) && archivos[i])) {
            setError('Algún mes elegido ya está cerrado: ese no se puede cambiar.');
            return;
        }
        setOcupado(true);
        setError(null);
        let hechos = 0;
        for (let i = 0; i < archivos.length; i++) {
            const mes = meses[i];
            if (!mes)
                continue;
            try {
                const d = await subirDocumento(empresa.id, anio, mes, archivos[i]);
                const c = charlas.find((x) => x.mes === mes);
                const { error } = c ? await prev().from('charlas').update(d).eq('id', c.id)
                    : await prev().from('charlas').insert({ ...d, empresa_id: empresa.id, anio, mes });
                if (error)
                    throw new Error(textoError(error.message));
                hechos++;
            }
            catch (e) {
                setError(`${archivos[i].name}: ${e.message}`);
                setOcupado(false);
                if (hechos)
                    aviso(`${hechos} subidos`);
                return;
            }
        }
        setOcupado(false);
        aviso(hechos === 1 ? 'Documento subido' : `${hechos} documentos subidos`);
        alSubir();
    }
    return (_jsxs(Ventana, { titulo: `Documentos del técnico · ${anio}`, alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado || !meses.some(Boolean), onClick: subir, children: ocupado ? 'Subiendo…' : 'Subir' })] }), children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Mira que cada PDF vaya a su mes. Si un mes ya ten\u00EDa documento, se cambia por este." }), _jsx("div", { className: "lista", children: archivos.map((f, i) => (_jsxs("div", { className: "fila fija centrada subir-doc", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: f.name }), meses[i] && cerradoEl(meses[i]) ? _jsx("small", { className: "error", children: "Ese mes ya est\u00E1 cerrado" }) : null] }), _jsxs("select", { "aria-label": `Mes de ${f.name}`, value: meses[i], onChange: (e) => setMeses((m) => m.map((x, j) => (j === i ? Number(e.target.value) : x))), children: [_jsx("option", { value: 0, children: "No subir" }), MESES.map((n, k) => _jsx("option", { value: k + 1, children: n }, n))] })] }, i))) }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
/** Datos por defecto para las sesiones nuevas (en nucleo.ajustes, módulo prevención). */
const CLAVES_AJUSTES = [['centro', 'Lugar donde se da'], ['duracion', 'Duración (minutos)'], ['formador', 'Formador'],
    ['correo_prl', 'Correo del técnico de prevención (para enviarle el mes)'], ['correo_prl_nombre', 'Nombre del técnico de prevención'],
    ['empresa', 'Empresa (sale en el asunto del correo)']];
function useAjustes() {
    const { empresa } = useSesion();
    const [v, setV] = useState({});
    useEffect(() => {
        nucleo().from('ajustes').select('clave, valor, centro_id').eq('empresa_id', empresa.id).eq('modulo', 'prevencion').is('centro_id', null)
            .then(({ data }) => setV(Object.fromEntries((data ?? []).map((x) => [x.clave, String(x.valor ?? '')]))));
    }, [empresa]);
    return v;
}
function Ajustes({ alCerrar }) {
    const { empresa } = useSesion();
    const actuales = useAjustes();
    const [v, setV] = useState({});
    const [error, setError] = useState(null);
    const valor = (k) => v[k] ?? actuales[k] ?? '';
    const [firmando, setFirmando] = useState(false);
    async function guardar() {
        for (const k of [...CLAVES_AJUSTES.map(([c]) => c), 'firma_formador']) {
            if (v[k] === undefined)
                continue;
            const { error } = await nucleo().from('ajustes').upsert({ empresa_id: empresa.id, centro_id: null, modulo: 'prevencion', clave: k, valor: v[k].trim() }, { onConflict: 'empresa_id,centro_id,modulo,clave' });
            if (error) {
                setError(error.message);
                return;
            }
        }
        aviso('Guardado');
        alCerrar();
    }
    return (_jsxs(Ventana, { titulo: "Datos por defecto de las charlas", alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", onClick: guardar, children: "Guardar" })] }), children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Se ponen solos cada vez que preparas la sesi\u00F3n de un mes nuevo. Luego puedes cambiarlos en cada mes." }), CLAVES_AJUSTES.map(([k, n]) => _jsxs("label", { className: "campo", children: [_jsx("span", { children: n }), _jsx("input", { value: valor(k), type: k === 'correo_prl' ? 'email' : undefined, inputMode: k === 'duracion' ? 'numeric' : undefined, onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) })] }, k)), _jsxs("div", { className: "campo", children: [_jsx("span", { children: "Firma del formador (sale en el PDF oficial)" }), firmando ? _jsx(Firma, { alCambiar: (png) => setV((x) => ({ ...x, firma_formador: png ?? '' })) })
                        : _jsxs(_Fragment, { children: [valor('firma_formador') ? _jsx("img", { src: valor('firma_formador'), alt: "Firma del formador", className: "firma-guardada" }) : _jsx("p", { className: "nota", style: { margin: 0 }, children: "Todav\u00EDa no hay firma." }), _jsx("button", { type: "button", className: "boton sec peq", style: { alignSelf: 'flex-start' }, onClick: () => setFirmando(true), children: valor('firma_formador') ? 'Cambiar la firma' : 'Firmar' })] })] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
// ---------------------------------------------------------------------------------------------
// Un mes: contenido, sesión y firmas
// ---------------------------------------------------------------------------------------------
function Mes({ anio, mes, charla, sesion, alCerrar, alCambiar }) {
    const { puede } = useSesion();
    const [pest, setPest] = useState(charla ? (sesion ? 'firmas' : 'sesion') : 'contenido');
    // recién escrita la charla de un mes nuevo, lo siguiente es preparar la sesión
    const [habia] = useState(!!charla);
    useEffect(() => { if (charla && !habia && !sesion)
        setPest('sesion'); }, [charla, habia, sesion]);
    const titulo = `${MESES[mes - 1]} ${anio}`;
    if (!charla) {
        return puede('prevencion.charla.editar')
            ? _jsx(EditarCharla, { titulo: `Charla de ${titulo}`, anio: anio, mes: mes, charla: null, alCerrar: alCerrar, alGuardar: () => { alCambiar(); } })
            : null;
    }
    return (_jsxs(Ventana, { titulo: titulo, alCerrar: alCerrar, children: [_jsxs("div", { className: "segmentos tres no-imprimir", role: "group", "aria-label": "Partes del mes", children: [_jsx("button", { type: "button", "aria-pressed": pest === 'contenido', onClick: () => setPest('contenido'), children: "Contenido" }), _jsx("button", { type: "button", "aria-pressed": pest === 'sesion', onClick: () => setPest('sesion'), children: "Sesi\u00F3n" }), _jsx("button", { type: "button", "aria-pressed": pest === 'firmas', onClick: () => setPest('firmas'), disabled: !sesion, children: "Firmas" })] }), pest === 'contenido' && _jsx(VerCharla, { charla: charla, sesion: sesion, alCambiar: alCambiar }), pest === 'sesion' && _jsx(DatosSesion, { anio: anio, mes: mes, charla: charla, sesion: sesion, alGuardar: () => { alCambiar(); } }), pest === 'firmas' && sesion && _jsx(FirmasSesion, { charla: charla, sesion: sesion, alCambiar: alCambiar })] }));
}
/** El texto de la charla tal como lo lee el trabajador. */
function TextoCharla({ c }) {
    return (_jsxs("div", { className: "charla", children: [c.documento_ruta && _jsx(BotonDocumento, { c: c }), c.imagen && _jsx("img", { src: c.imagen, alt: "" }), c.compromiso && _jsxs("p", { className: "charla-compromiso", children: ["\u00AB", c.compromiso, "\u00BB"] }), c.cuerpo && c.cuerpo.split(/\n+/).map((p, i) => _jsx("p", { children: p }, i)), c.puntos.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { className: "subtitulo", children: "Para hablar" }), _jsx("ul", { children: c.puntos.map((p, i) => _jsx("li", { children: p }, i)) })] }), c.tema && _jsx("h3", { className: "subtitulo", children: c.tema }), c.tema_intro && _jsx("p", { children: c.tema_intro }), c.tema_puntos.length > 0 && _jsx("ul", { children: c.tema_puntos.map((p, i) => _jsx("li", { children: p }, i)) })] }));
}
/** Abre el PDF del técnico. */
function BotonDocumento({ c }) {
    const [abriendo, setAbriendo] = useState(false);
    return (_jsxs("div", { className: "documento-tecnico", children: [_jsxs("span", { children: ["\uD83D\uDCC4 ", _jsx("b", { children: c.documento_nombre ?? 'Documento del técnico' })] }), _jsx("button", { type: "button", className: "boton", disabled: abriendo, onClick: async () => {
                    setAbriendo(true);
                    try {
                        await abrirDocumento(c.documento_ruta);
                    }
                    catch (e) {
                        aviso(e.message);
                    }
                    setAbriendo(false);
                }, children: "Abrir el documento" })] }));
}
function VerCharla({ charla, sesion, alCambiar }) {
    const { puede } = useSesion();
    const [editando, setEditando] = useState(false);
    const cerrada = !!sesion?.cerrada_en;
    return (_jsxs(_Fragment, { children: [_jsx(TextoCharla, { c: charla }), puede('prevencion.charla.editar') && !cerrada && (_jsx("div", { className: "botonera", children: _jsx("button", { type: "button", className: "boton sec", onClick: () => setEditando(true), children: "Cambiar el contenido" }) })), sesion?.enviada_en && !cerrada && _jsx("p", { className: "nota", children: "Ya se ha enviado: si lo cambias, quien firme a partir de ahora firmar\u00E1 el texto nuevo." }), editando && _jsx(EditarCharla, { titulo: "Cambiar el contenido", anio: charla.anio, mes: charla.mes, charla: charla, alCerrar: () => setEditando(false), alGuardar: () => { setEditando(false); alCambiar(); } })] }));
}
/** Reduce una foto a JPEG de como mucho 1000 px (para que no pese). */
function aJpeg(archivo) {
    return new Promise((ok, mal) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, 1000 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            ok(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => mal(new Error('No se ha podido leer la imagen'));
        img.src = URL.createObjectURL(archivo);
    });
}
const lineas = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
function EditarCharla({ titulo, anio, mes, charla, alCerrar, alGuardar }) {
    const { empresa } = useSesion();
    const [v, setV] = useState({
        compromiso: charla?.compromiso ?? '', cuerpo: charla?.cuerpo ?? '', puntos: (charla?.puntos ?? []).join('\n'),
        tema: charla?.tema ?? '', tema_intro: charla?.tema_intro ?? '', tema_puntos: (charla?.tema_puntos ?? []).join('\n'), codigo: charla?.codigo ?? '',
    });
    const [imagen, setImagen] = useState(charla?.imagen ?? null);
    const [doc, setDoc] = useState(null);
    const [quitarDoc, setQuitarDoc] = useState(false);
    const [escribir, setEscribir] = useState(!!charla?.compromiso);
    const docActual = !quitarDoc ? charla?.documento_nombre ?? null : null;
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const pon = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
    async function guardar() {
        const tieneDoc = !!doc || !!docActual;
        if (!v.compromiso.trim() && !tieneDoc) {
            setError('Sube el documento del técnico o escribe el compromiso del mes.');
            return;
        }
        setOcupado(true);
        setError(null);
        let documento = {};
        if (doc) {
            try {
                documento = { ...await subirDocumento(empresa.id, anio, mes, doc) };
            }
            catch (e) {
                setOcupado(false);
                setError(e.message);
                return;
            }
        }
        else if (quitarDoc)
            documento = { documento_ruta: null, documento_nombre: null, documento_sha256: null };
        const fila = {
            ...documento,
            compromiso: v.compromiso.trim() || null, cuerpo: v.cuerpo.trim() || null, puntos: lineas(v.puntos), tema: v.tema.trim() || null,
            tema_intro: v.tema_intro.trim() || null, tema_puntos: lineas(v.tema_puntos), imagen, codigo: v.codigo.trim() || null,
        };
        const { error } = charla ? await prev().from('charlas').update(fila).eq('id', charla.id)
            : await prev().from('charlas').insert({ ...fila, empresa_id: empresa.id, anio, mes });
        setOcupado(false);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Charla guardada');
        alGuardar();
    }
    return (_jsxs(Ventana, { titulo: titulo, alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: guardar, children: "Guardar" })] }), children: [_jsxs("div", { className: "campo", children: [_jsx("span", { children: "Documento del t\u00E9cnico (PDF)" }), (doc || docActual) && _jsxs("p", { className: "nota", style: { margin: '0 0 6px' }, children: ["\uD83D\uDCC4 ", doc?.name ?? docActual] }), _jsxs("div", { className: "botonera", style: { justifyContent: 'flex-start', marginTop: 0 }, children: [_jsxs("label", { className: "boton sec peq archivo", children: [doc || docActual ? 'Cambiar el PDF' : 'Subir el PDF del técnico', _jsx("input", { type: "file", accept: "application/pdf,.pdf", onChange: (e) => { const f = e.target.files?.[0]; if (f) {
                                            setDoc(f);
                                            setQuitarDoc(false);
                                        } } })] }), (doc || docActual) && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => { setDoc(null); setQuitarDoc(!!charla?.documento_ruta); }, children: "Quitar" })] })] }), !escribir && _jsx("button", { type: "button", className: "boton txt", onClick: () => setEscribir(true), children: "Escribir tambi\u00E9n el texto de la charla" }), escribir && _jsxs(_Fragment, { children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Compromiso del mes" }), _jsx("textarea", { rows: 2, maxLength: 500, value: v.compromiso, onChange: pon('compromiso') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Texto de la charla" }), _jsx("textarea", { rows: 5, maxLength: 4000, value: v.cuerpo, onChange: pon('cuerpo') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Preguntas para hablar (una por l\u00EDnea)" }), _jsx("textarea", { rows: 3, value: v.puntos, onChange: pon('puntos') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Tema HSE del mes" }), _jsx("input", { maxLength: 200, value: v.tema, onChange: pon('tema') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Introducci\u00F3n del tema (opcional)" }), _jsx("textarea", { rows: 2, maxLength: 2000, value: v.tema_intro, onChange: pon('tema_intro') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Consejos del tema (uno por l\u00EDnea)" }), _jsx("textarea", { rows: 4, value: v.tema_puntos, onChange: pon('tema_puntos') })] }), _jsxs("div", { className: "campo", children: [_jsx("span", { children: "Imagen (opcional)" }), imagen && _jsx("img", { src: imagen, alt: "Imagen de la charla", className: "miniatura" }), _jsxs("div", { className: "botonera", style: { justifyContent: 'flex-start', marginTop: 0 }, children: [_jsxs("label", { className: "boton sec peq archivo", children: [imagen ? 'Cambiar imagen' : 'Elegir imagen', _jsx("input", { type: "file", accept: "image/*", onChange: async (e) => { const f = e.target.files?.[0]; if (f) {
                                                    try {
                                                        setImagen(await aJpeg(f));
                                                    }
                                                    catch (x) {
                                                        setError(x.message);
                                                    }
                                                } } })] }), imagen && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => setImagen(null), children: "Quitar" })] })] })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "C\u00F3digo del documento (opcional)" }), _jsx("input", { maxLength: 60, value: v.codigo, onChange: pon('codigo') })] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
/** Personas de la unidad (para la lista de quién tiene que firmar). */
function usePersonas() {
    const { empresa, puede } = useSesion();
    const [personas, setPersonas] = useState([]);
    useEffect(() => {
        if (!puede('nucleo.persona.ver'))
            return;
        nucleo().from('personas').select('id, nombre, categoria, baja').eq('empresa_id', empresa.id).order('nombre')
            .then(({ data }) => setPersonas((data ?? [])));
    }, [empresa, puede]);
    return personas;
}
function DatosSesion({ anio, mes, charla, sesion, alGuardar }) {
    const { empresa, puede } = useSesion();
    const ajustes = useAjustes();
    const personas = usePersonas();
    const activas = personas.filter((p) => !p.baja);
    const editable = puede('prevencion.charla.editar') && !sesion?.cerrada_en;
    const [v, setV] = useState({});
    const [previstos, setPrevistos] = useState(sesion ? new Set(sesion.previstos) : null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const inicial = {
        denominacion: sesion?.denominacion ?? `Toolbox Talk HSE ${MESES[mes - 1]} ${String(anio).slice(2)}`,
        fecha: sesion?.fecha ?? '', centro: sesion?.centro ?? ajustes.centro ?? '', duracion: String(sesion?.duracion ?? ajustes.duracion ?? ''),
        formador: sesion?.formador ?? ajustes.formador ?? '', observaciones: sesion?.observaciones ?? '',
    };
    const val = (k) => v[k] ?? inicial[k];
    const lista = previstos ?? new Set(activas.map((p) => p.id));
    const pon = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
    async function guardar() {
        const dur = val('duracion').trim();
        if (dur && !/^\d+$/.test(dur)) {
            setError('La duración son minutos (un número).');
            return null;
        }
        const fila = {
            denominacion: val('denominacion').trim() || null, fecha: val('fecha') || null, centro: val('centro').trim() || null,
            duracion: dur ? Number(dur) : null, formador: val('formador').trim() || null, observaciones: val('observaciones').trim() || null, previstos: [...lista],
        };
        const r = sesion ? await prev().from('sesiones').update(fila).eq('id', sesion.id).select('id').single()
            : await prev().from('sesiones').insert({ ...fila, empresa_id: empresa.id, charla_id: charla.id }).select('id').single();
        if (r.error) {
            setError(textoError(r.error.message));
            return null;
        }
        return r.data.id;
    }
    async function soloGuardar() { setOcupado(true); setError(null); const id = await guardar(); setOcupado(false); if (id) {
        aviso('Sesión guardada');
        alGuardar();
    } }
    async function enviar() {
        setOcupado(true);
        setError(null);
        const id = await guardar();
        if (!id) {
            setOcupado(false);
            return;
        }
        const { data, error } = await prev().rpc('enviar_charla', { p_sesion: id });
        setOcupado(false);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso(data ? `Enviada: faltan ${data} por firmar` : 'Enviada: ya han firmado todos');
        alGuardar();
    }
    async function cerrar(c) {
        if (c && !confirm('¿Cerrar el mes? Ya no se podrá firmar ni cambiar (se puede reabrir).'))
            return;
        const { error } = await prev().rpc('cerrar_sesion', { p_sesion: sesion.id, p_cerrar: c });
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso(c ? 'Mes cerrado' : 'Mes reabierto');
        alGuardar();
    }
    return (_jsxs(_Fragment, { children: [_jsxs("fieldset", { className: "formulario", disabled: !editable, children: [sesion?.cerrada_en && _jsxs("p", { className: "aviso-linea", children: ["Cerrado el ", fechaCorta(sesion.cerrada_en), "."] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Denominaci\u00F3n" }), _jsx("input", { value: val('denominacion'), maxLength: 200, onChange: pon('denominacion') })] }), _jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { type: "date", value: val('fecha'), onChange: pon('fecha') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Duraci\u00F3n (min)" }), _jsx("input", { inputMode: "numeric", value: val('duracion'), onChange: pon('duracion') })] })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Lugar" }), _jsx("input", { value: val('centro'), maxLength: 200, onChange: pon('centro') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Formador" }), _jsx("input", { value: val('formador'), maxLength: 120, onChange: pon('formador') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Observaciones" }), _jsx("textarea", { rows: 2, maxLength: 1000, value: val('observaciones'), onChange: pon('observaciones') })] }), _jsxs("p", { className: "nota", style: { margin: '0 0 6px' }, children: ["Tienen que firmarla (", lista.size, "):"] }), _jsxs("div", { className: "lista compacta", children: [activas.map((p) => (_jsxs("label", { className: "fila check", children: [_jsx("input", { type: "checkbox", checked: lista.has(p.id), onChange: () => setPrevistos(() => { const n = new Set(lista); if (n.has(p.id))
                                            n.delete(p.id);
                                        else
                                            n.add(p.id); return n; }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), p.categoria && _jsx("small", { children: p.categoria })] })] }, p.id))), !activas.length && _jsx("p", { className: "nota", style: { padding: 12 }, children: "No hay trabajadores en esta unidad." })] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }), sesion?.cerrada_en && puede('prevencion.charla.editar') && _jsx(EnvioPrevencion, { anio: anio, mes: mes, charla: charla, sesion: sesion, alApuntar: alGuardar }), puede('prevencion.charla.editar') && (_jsx("div", { className: "botonera", children: sesion?.cerrada_en ? _jsx("button", { type: "button", className: "boton sec", onClick: () => cerrar(false), children: "Reabrir el mes" }) : _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", disabled: ocupado, onClick: soloGuardar, children: "Guardar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado || !lista.size, onClick: enviar, children: sesion?.enviada_en ? 'Guardar y volver a avisar' : 'Enviar a firmar' }), sesion?.enviada_en && _jsx("button", { type: "button", className: "boton sec", onClick: () => cerrar(true), children: "Cerrar el mes" })] }) }))] }));
}
/** Quién ha firmado: ver firmas, recoger la de alguien en este móvil, anular una mal hecha, imprimir. */
function FirmasSesion({ charla, sesion, alCambiar }) {
    const { puede } = useSesion();
    const personas = usePersonas();
    const [asis, setAsis] = useState(null);
    const [imagenes, setImagenes] = useState({});
    const [recoger, setRecoger] = useState(null);
    const [haciendo, setHaciendo] = useState(false);
    const ajustes = useAjustes();
    async function pdf() {
        setHaciendo(true);
        try {
            const r = await pdfCompleto(charla, sesion, ajustes);
            descargar(r.bytes, r.nombre);
        }
        catch (e) {
            aviso('No se ha podido hacer el PDF: ' + e.message);
        }
        setHaciendo(false);
    }
    const cerrada = !!sesion.cerrada_en;
    const cargar = useCallback(async () => {
        const { data } = await prev().from('asistencias').select('*').eq('sesion_id', sesion.id).is('anulada', null).order('creado');
        const a = (data ?? []);
        setAsis(a);
        const ids = a.map((x) => x.firma_id).filter(Boolean);
        if (ids.length) {
            const f = await nucleo().from('firmas').select('id, imagen').in('id', ids);
            setImagenes(Object.fromEntries((f.data ?? []).map((x) => [x.id, x.imagen])));
        }
    }, [sesion]);
    useEffect(() => { cargar(); }, [cargar]);
    const faltan = useMemo(() => sesion.previstos.filter((id) => !asis?.some((a) => a.persona_id === id))
        .map((id) => personas.find((p) => p.id === id) ?? { id, nombre: 'Trabajador', categoria: null, baja: null }), [sesion, asis, personas]);
    async function anular(a) {
        if (!confirm(`¿Anular la firma de ${a.nombre}? Tendrá que volver a firmar.`))
            return;
        const { error } = await prev().rpc('anular_asistencia', { p_asistencia: a.id });
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso('Firma anulada');
        cargar();
        alCambiar();
    }
    if (asis === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "nota", style: { marginTop: 0 }, children: ["Han firmado ", _jsx("b", { children: asis.length }), " de ", sesion.previstos.length, "."] }), _jsxs("div", { className: "lista", children: [asis.map((a) => (_jsxs("div", { className: "fila fija centrada", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: a.nombre }), _jsxs("small", { children: [a.puesto ?? '', a.puesto ? ' · ' : '', new Date(a.creado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })] })] }), a.firma_id && imagenes[a.firma_id] && _jsx("img", { className: "firma-mini", src: imagenes[a.firma_id], alt: `Firma de ${a.nombre}` }), !cerrada && puede('prevencion.firma.anular') && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => anular(a), children: "Anular" })] }, a.id))), faltan.map((p) => (_jsxs("div", { className: "fila fija centrada", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), _jsx("small", { children: "Falta por firmar" })] }), _jsx("span", { className: "chapa pendiente", children: "Falta" }), !cerrada && puede('prevencion.firma.recoger') && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => setRecoger(p), children: "Firmar aqu\u00ED" })] }, p.id)))] }), _jsx("div", { className: "botonera", children: _jsx("button", { type: "button", className: "boton sec", disabled: haciendo, onClick: pdf, children: haciendo ? 'Haciendo el PDF…' : 'PDF oficial' }) }), recoger && _jsx(FirmarCharla, { charla: charla, sesion: sesion, persona: recoger, alCerrar: () => setRecoger(null), alFirmar: () => { setRecoger(null); cargar(); alCambiar(); } })] }));
}
/** PDF oficial de firmas y, detrás, el documento del técnico (si lo hay). */
async function pdfCompleto(charla, sesion, ajustes) {
    const r = await pdfToolbox(await datosToolbox(charla, sesion, ajustes));
    if (!charla.documento_ruta)
        return r;
    return { nombre: r.nombre, bytes: await unirPdfs(r.bytes, await bajarDocumento(charla.documento_ruta)) };
}
/** Todo lo que lleva el PDF oficial del mes: charla, sesión, firmas (con su imagen) y datos por defecto. */
async function datosToolbox(charla, sesion, ajustes) {
    const { data } = await prev().from('asistencias').select('*').eq('sesion_id', sesion.id).is('anulada', null);
    const asis = (data ?? []);
    const ids = asis.map((a) => a.firma_id).filter(Boolean);
    const f = ids.length ? ((await nucleo().from('firmas').select('id, imagen, firmado_en').in('id', ids)).data ?? []) : [];
    return {
        anio: charla.anio, mes: charla.mes, charla, sesion,
        firmas: asis.map((a) => { const x = f.find((y) => y.id === a.firma_id); return { nombre: a.nombre, puesto: a.puesto, imagen: x?.imagen ?? null, firmado_en: x?.firmado_en ?? a.creado }; }),
        ajustes,
    };
}
/** Enviar a prevención el mes cerrado: la app prepara el PDF y el correo, se envía desde el móvil y se apunta. */
function EnvioPrevencion({ anio, mes, charla, sesion, alApuntar }) {
    const { estado } = useSesion();
    const ajustes = useAjustes();
    const [paso, setPaso] = useState('inicio');
    const [archivo, setArchivo] = useState(null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.nombre ?? '' : '';
    const destino = ajustes.correo_prl ?? '';
    const mesTxt = `${MESES[mes - 1]} ${anio}`;
    const asunto = `Documentación PRL ${mesTxt} · Toolbox` + (ajustes.empresa ? ` · ${ajustes.empresa}` : '');
    async function preparar() {
        setOcupado(true);
        setError(null);
        try {
            setArchivo(await pdfCompleto(charla, sesion, ajustes));
            setPaso('enviar');
        }
        catch (e) {
            setError('No se ha podido hacer el PDF: ' + e.message);
        }
        setOcupado(false);
    }
    function texto(firmados) {
        return [`Hola${ajustes.correo_prl_nombre ? ' ' + ajustes.correo_prl_nombre : ''},`, '',
            `Te adjunto la documentación de prevención de ${mesTxt}${ajustes.centro ? ' (' + ajustes.centro + ')' : ''}:`, '',
            `- Toolbox del mes${charla.tema ? ': ' + charla.tema : ''}. Han firmado ${firmados} de ${sesion.previstos.length}.`, '',
            'Un saludo,', yo].join('\n');
    }
    async function abrirCorreo() {
        if (!archivo)
            return;
        const { count } = await prev().from('asistencias').select('id', { count: 'exact', head: true }).eq('sesion_id', sesion.id).is('anulada', null);
        const cuerpo = texto(count ?? 0);
        const file = new File([archivo.bytes], archivo.nombre, { type: 'application/pdf' });
        // en el móvil: compartir (se elige Outlook o el correo, con el PDF y el texto ya puestos)
        if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: asunto, text: cuerpo });
            }
            catch (e) {
                if (e.name !== 'AbortError')
                    setError(e.message);
            }
            return;
        }
        // en el ordenador: se descarga el PDF y se abre un correo nuevo con todo puesto
        descargar(archivo.bytes, archivo.nombre);
        setTimeout(() => { location.href = `mailto:${destino.split(/\s*[,;]\s*/).filter(Boolean).map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`; }, 600);
    }
    async function hecho() {
        setOcupado(true);
        const { error } = await prev().rpc('apuntar_envio', { p_sesion: sesion.id, p_destino: (destino || 'sin correo puesto') + ' (desde mi correo)' });
        setOcupado(false);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Apuntado como enviado a prevención');
        setPaso('inicio');
        alApuntar();
    }
    return (_jsxs("section", { className: "envio-prev", "aria-label": "Enviar a prevenci\u00F3n", children: [_jsx("h3", { className: "subtitulo", style: { marginTop: 0 }, children: "Enviar a prevenci\u00F3n" }), sesion.prev_enviado_en
                ? _jsxs("p", { children: [_jsx("span", { className: "chapa firmado", children: "Enviado" }), " el ", new Date(sesion.prev_enviado_en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }), sesion.prev_destino ? ` · ${sesion.prev_destino}` : ''] })
                : _jsxs("p", { children: [_jsx("span", { className: "chapa pendiente", children: "Sin enviar" }), destino ? ` · a ${destino}` : ''] }), !destino && _jsx("p", { className: "nota", children: "Pon el correo del t\u00E9cnico de prevenci\u00F3n en \u00ABDatos por defecto\u00BB (en la lista de meses) para que salga ya puesto." }), paso === 'inicio' ? (_jsx("button", { type: "button", className: "boton ancho", disabled: ocupado, onClick: preparar, children: ocupado ? 'Haciendo el PDF…' : sesion.prev_enviado_en ? 'Volver a enviar desde mi correo' : 'Enviar desde mi correo' })) : (_jsxs("div", { className: "pasos-envio", children: [_jsxs("ol", { children: [_jsxs("li", { children: ["Pulsa ", _jsx("b", { children: "Abrir el correo" }), ": en el m\u00F3vil, elige Outlook (o tu correo); el PDF y el texto ya van puestos."] }), _jsxs("li", { children: ["Pon el destinatario si no sale", destino ? ` (${destino})` : '', " y dale a ", _jsx("b", { children: "Enviar" }), "."] }), _jsxs("li", { children: ["Vuelve aqu\u00ED y pulsa ", _jsx("b", { children: "Ya lo he enviado" }), "."] })] }), _jsx("button", { type: "button", className: "boton ancho", onClick: abrirCorreo, children: "Abrir el correo" }), _jsx("button", { type: "button", className: "boton sec ancho", disabled: ocupado, onClick: hecho, children: "Ya lo he enviado" }), _jsx("button", { type: "button", className: "boton txt ancho", onClick: () => setPaso('inicio'), children: "Cancelar" })] })), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
/** Firmar una charla: el propio trabajador o, en el móvil del jefe, otro trabajador. */
function FirmarCharla({ charla, sesion, persona, alCerrar, alFirmar }) {
    const { estado } = useSesion();
    const [leida, setLeida] = useState(false);
    const [puesto, setPuesto] = useState('');
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
        const { error } = await prev().rpc('firmar_charla', {
            p_sesion: sesion.id, p_persona: persona.id, p_puesto: puesto.trim() || null, p_imagen: png,
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
    return (_jsx(Ventana, { titulo: sesion.denominacion ?? 'Charla', alCerrar: alCerrar, pie: leida
            ? _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: () => setLeida(false), children: "Atr\u00E1s" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: firmar, children: "Firmar" })] })
            : _jsx("button", { type: "button", className: "boton", onClick: () => setLeida(true), children: "La he le\u00EDdo, firmar" }), children: !leida ? _jsx(TextoCharla, { c: charla }) : (_jsxs(_Fragment, { children: [_jsx("p", { style: { marginTop: 0 }, children: _jsx("b", { children: persona.nombre }) }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Puesto (si lo dejas vac\u00EDo, el de su ficha)" }), _jsx("input", { value: puesto, maxLength: 80, placeholder: persona.categoria ?? '', onChange: (e) => setPuesto(e.target.value) })] }), _jsxs("p", { className: "nota", style: { marginBottom: 8 }, children: ["Firmo que he asistido a la charla \u00AB", sesion.denominacion, "\u00BB y la he entendido."] }), _jsx(Firma, { alCambiar: setPng }), error && _jsx("p", { className: "error", role: "alert", children: error })] })) }));
}
// ---------------------------------------------------------------------------------------------
// Mis charlas (cualquier trabajador)
// ---------------------------------------------------------------------------------------------
function MisCharlas() {
    const { empresa, estado } = useSesion();
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
    const [datos, setDatos] = useState(null);
    const [sinFicha, setSinFicha] = useState(false);
    const [firmando, setFirmando] = useState(null);
    const cargar = useCallback(async () => {
        const { data: u } = await nucleo().from('usuarios').select('persona_id').eq('id', yo).maybeSingle();
        const pid = u?.persona_id;
        if (!pid) {
            setSinFicha(true);
            return;
        }
        const [p, s, a] = await Promise.all([
            nucleo().from('personas').select('id, nombre, categoria').eq('id', pid).maybeSingle(),
            prev().from('sesiones').select('*').eq('empresa_id', empresa.id).contains('previstos', [pid]).not('enviada_en', 'is', null).is('cerrada_en', null),
            prev().from('asistencias').select('*').eq('persona_id', pid).is('anulada', null),
        ]);
        const mias = (a.data ?? []);
        const ses = (s.data ?? []).filter((x) => !mias.some((m) => m.sesion_id === x.id));
        const cids = ses.map((x) => x.charla_id);
        const cs = cids.length ? ((await prev().from('charlas').select('*').in('id', cids)).data ?? []) : [];
        setDatos({
            persona: p.data ?? { id: pid, nombre: '', categoria: null },
            pendientes: ses.map((x) => ({ s: x, c: cs.find((c) => c.id === x.charla_id) })).filter((x) => x.c),
            firmadas: [...mias].sort((x, y) => y.creado.localeCompare(x.creado)),
        });
    }, [empresa, yo]);
    useEffect(() => { cargar(); }, [cargar]);
    if (sinFicha)
        return _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsx("b", { children: "Tu usuario no est\u00E1 enlazado con tu ficha de trabajador." }) }), _jsx("p", { children: "P\u00EDdeselo a tu administrador (Configuraci\u00F3n \u2192 Usuarios)." })] });
    if (!datos)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    return (_jsxs(_Fragment, { children: [datos.pendientes.length > 0
                ? _jsxs("p", { className: "aviso-linea", children: ["Tienes ", datos.pendientes.length === 1 ? 'una charla' : `${datos.pendientes.length} charlas`, " por leer y firmar."] })
                : _jsx("div", { className: "vacio", style: { marginBottom: 12 }, children: _jsx("p", { children: "No tienes ninguna charla por firmar." }) }), datos.pendientes.length > 0 && (_jsx("div", { className: "lista", style: { marginBottom: 16 }, children: datos.pendientes.map((x) => (_jsxs("button", { type: "button", className: "fila", onClick: () => setFirmando(x), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: x.s.denominacion ?? `${MESES[x.c.mes - 1]} ${x.c.anio}` }), _jsx("small", { children: x.c.tema ?? x.c.compromiso ?? x.c.documento_nombre })] }), _jsx("span", { className: "chapa pendiente", children: "Firmar" })] }, x.s.id))) })), datos.firmadas.length > 0 && _jsxs(_Fragment, { children: [_jsx("h2", { className: "subtitulo", children: "Ya firmadas" }), _jsx("div", { className: "lista", children: datos.firmadas.map((a) => (_jsxs("div", { className: "fila fija", children: [_jsxs("span", { className: "fila-txt", children: [_jsxs("b", { children: ["Firmada el ", fechaCorta(a.creado)] }), a.puesto && _jsx("small", { children: a.puesto })] }), _jsx("span", { className: "chapa firmado", children: "Firmada" })] }, a.id))) })] }), firmando && _jsx(FirmarCharla, { charla: firmando.c, sesion: firmando.s, persona: datos.persona, alCerrar: () => setFirmando(null), alFirmar: () => { setFirmando(null); cargar(); } })] }));
}
const MOTIVOS_BAJA = ['Fin de contrato', 'Dimisión', 'Despido', 'Excedencia', 'Fin de obra o proyecto', 'Otro'];
function Fichas() {
    const { empresa, puede } = useSesion();
    const personas = usePersonas();
    const [fichas, setFichas] = useState(null);
    const [prendas, setPrendas] = useState([]);
    const [abierta, setAbierta] = useState(null);
    const [verBajas, setVerBajas] = useState(false);
    const [editarPrendas, setEditarPrendas] = useState(false);
    const cargar = useCallback(async () => {
        const [f, p] = await Promise.all([
            prev().from('fichas').select('*').eq('empresa_id', empresa.id),
            prev().from('prendas').select('*').eq('empresa_id', empresa.id).order('orden'),
        ]);
        setFichas((f.data ?? []));
        setPrendas((p.data ?? []).filter((x) => !x.baja));
    }, [empresa]);
    useEffect(() => { cargar(); }, [cargar]);
    if (fichas === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    const visibles = personas.filter((p) => verBajas || !p.baja);
    const bajas = personas.filter((p) => p.baja).length;
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Datos personales: solo los ve quien tiene permiso. El encargado no los ve." }), _jsx("div", { className: "lista", children: visibles.map((p) => {
                    const f = fichas.find((x) => x.persona_id === p.id);
                    const faltan = [!f?.dni && 'DNI', !f?.fecha_alta && 'fecha de alta', prendas.some((x) => !f?.tallas?.[x.codigo]) && 'tallas'].filter(Boolean);
                    return (_jsxs("button", { type: "button", className: 'fila' + (p.baja ? ' de-baja' : ''), onClick: () => setAbierta(p), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), _jsxs("small", { children: [p.baja ? 'Dado de baja · ' : '', f?.puesto ?? p.categoria ?? '', faltan.length ? `${f?.puesto || p.categoria ? ' · ' : ''}Falta: ${faltan.join(', ')}` : ''] })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }, p.id));
                }) }), _jsxs("div", { className: "botonera", children: [bajas > 0 && _jsx("button", { type: "button", className: "boton txt", onClick: () => setVerBajas(!verBajas), children: verBajas ? 'Esconder los dados de baja' : `Ver los dados de baja (${bajas})` }), puede('prevencion.ficha.editar') && _jsx("button", { type: "button", className: "boton sec", onClick: () => setEditarPrendas(true), children: "Prendas con talla" })] }), abierta && _jsx(FormFicha, { persona: abierta, ficha: fichas.find((x) => x.persona_id === abierta.id) ?? null, prendas: prendas, alCerrar: () => setAbierta(null), alGuardar: () => { setAbierta(null); cargar(); } }), editarPrendas && _jsx(Prendas, { prendas: prendas, alCerrar: () => { setEditarPrendas(false); cargar(); } })] }));
}
function FormFicha({ persona, ficha, prendas, alCerrar, alGuardar }) {
    const { empresa, puede } = useSesion();
    const editable = puede('prevencion.ficha.editar');
    const campos = ['dni', 'puesto', 'fecha_alta', 'fecha_baja', 'motivo_baja', 'telefono', 'emerg_nombre', 'emerg_tel', 'idioma'];
    const [v, setV] = useState(Object.fromEntries(campos.map((k) => [k, ficha?.[k] ?? ''])));
    const [tallas, setTallas] = useState(ficha?.tallas ?? {});
    const [error, setError] = useState(null);
    const pon = (k) => (e) => setV((x) => ({ ...x, [k]: k === 'dni' ? e.target.value.toUpperCase().replace(/[\s.-]/g, '') : e.target.value }));
    async function guardar() {
        if (v.fecha_alta && v.fecha_baja && v.fecha_baja < v.fecha_alta) {
            setError('La fecha de baja no puede ser antes del alta.');
            return;
        }
        const fila = Object.fromEntries(campos.map((k) => [k, v[k].trim() || null]));
        fila.tallas = Object.fromEntries(Object.entries(tallas).map(([k, x]) => [k, x.trim()]).filter(([, x]) => x));
        const { error } = await prev().from('fichas').upsert({ ...fila, persona_id: persona.id, empresa_id: empresa.id }, { onConflict: 'persona_id' });
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Ficha guardada');
        alGuardar();
    }
    return (_jsx(Ventana, { titulo: persona.nombre, alCerrar: alCerrar, pie: editable ? _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", onClick: guardar, children: "Guardar" })] }) : undefined, children: _jsxs("fieldset", { className: "formulario", disabled: !editable, children: [_jsx("h3", { className: "subtitulo", style: { marginTop: 0 }, children: "Identificaci\u00F3n" }), _jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "DNI / NIE" }), _jsx("input", { value: v.dni, maxLength: 12, autoCapitalize: "characters", onChange: pon('dni') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Puesto" }), _jsx("input", { value: v.puesto, maxLength: 80, placeholder: persona.categoria ?? '', onChange: pon('puesto') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Fecha de alta" }), _jsx("input", { type: "date", value: v.fecha_alta, onChange: pon('fecha_alta') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Fecha de baja" }), _jsx("input", { type: "date", value: v.fecha_baja, onChange: pon('fecha_baja') })] })] }), v.fecha_baja && _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Motivo de la baja" }), _jsxs("select", { value: v.motivo_baja, onChange: pon('motivo_baja'), children: [_jsx("option", { value: "", children: "\u2014" }), MOTIVOS_BAJA.map((m) => _jsx("option", { children: m }, m))] })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Idioma que mejor entiende" }), _jsx("input", { value: v.idioma, maxLength: 40, onChange: pon('idioma') })] }), _jsx("h3", { className: "subtitulo", children: "Contacto" }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Tel\u00E9fono" }), _jsx("input", { type: "tel", value: v.telefono, maxLength: 30, onChange: pon('telefono') })] }), _jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "En caso de emergencia, avisar a" }), _jsx("input", { value: v.emerg_nombre, maxLength: 80, onChange: pon('emerg_nombre') })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Su tel\u00E9fono" }), _jsx("input", { type: "tel", value: v.emerg_tel, maxLength: 30, onChange: pon('emerg_tel') })] })] }), _jsx("h3", { className: "subtitulo", children: "Tallas" }), prendas.length ? _jsx("div", { className: "dos", children: prendas.map((p) => _jsxs("label", { className: "campo", children: [_jsx("span", { children: p.nombre }), _jsx("input", { value: tallas[p.codigo] ?? '', maxLength: 10, onChange: (e) => setTallas((t) => ({ ...t, [p.codigo]: e.target.value })) })] }, p.codigo)) })
                    : _jsx("p", { className: "nota", children: "No hay prendas dadas de alta (bot\u00F3n \u00ABPrendas con talla\u00BB)." }), error && _jsx("p", { className: "error", role: "alert", children: error })] }) }));
}
function Prendas({ prendas, alCerrar }) {
    const { empresa } = useSesion();
    const [nueva, setNueva] = useState('');
    const [lista, setLista] = useState(prendas);
    const [error, setError] = useState(null);
    async function anadir() {
        const nombre = nueva.trim();
        if (!nombre)
            return;
        const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'prenda';
        let codigo = /^[a-z]/.test(base) ? base : 'p_' + base, n = 2;
        while (lista.some((p) => p.codigo === codigo))
            codigo = `${base}_${n++}`;
        const { data, error } = await prev().from('prendas').insert({ empresa_id: empresa.id, codigo, nombre, orden: lista.length + 1 }).select().single();
        if (error) {
            setError(error.message);
            return;
        }
        setLista((l) => [...l, data]);
        setNueva('');
    }
    async function quitar(p) {
        if (!confirm(`¿Quitar «${p.nombre}» de la lista? Las tallas ya apuntadas no se borran.`))
            return;
        const { error } = await prev().from('prendas').update({ baja: new Date().toISOString() }).eq('id', p.id);
        if (error) {
            setError(error.message);
            return;
        }
        setLista((l) => l.filter((x) => x.id !== p.id));
    }
    return (_jsxs(Ventana, { titulo: "Prendas con talla", alCerrar: alCerrar, children: [_jsxs("div", { className: "lista", style: { marginBottom: 12 }, children: [lista.map((p) => _jsxs("div", { className: "fila fija centrada", children: [_jsx("span", { className: "fila-txt", children: _jsx("b", { children: p.nombre }) }), _jsx("button", { type: "button", className: "boton txt peq", onClick: () => quitar(p), children: "Quitar" })] }, p.id)), !lista.length && _jsx("p", { className: "nota", style: { padding: 12 }, children: "Todav\u00EDa no hay ninguna." })] }), _jsxs("div", { className: "barra-lista", children: [_jsx("input", { "aria-label": "Prenda nueva", placeholder: "Por ejemplo: Botas de seguridad", value: nueva, onChange: (e) => setNueva(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                            anadir(); } }), _jsx("button", { type: "button", className: "boton", onClick: anadir, children: "A\u00F1adir" })] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
