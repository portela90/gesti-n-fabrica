import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';
const mb = (b) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
const cuando = (f) => new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const horasDesde = (f) => (Date.now() - Date.parse(f)) / 36e5;
/** Panel de salud (solo superadministrador): ¿va todo bien? Espacio, copias, errores e incidencias. */
export function Salud({ ir }) {
    const [c, setC] = useState(null);
    const [errores, setErrores] = useState([]);
    const [incs, setIncs] = useState([]);
    const [fallo, setFallo] = useState(null);
    const [abierta, setAbierta] = useState(null);
    const cargar = useCallback(async () => {
        const [s, e, i] = await Promise.all([
            nucleo().rpc('salud'),
            nucleo().from('errores').select('*').eq('visto', false).order('ultimo', { ascending: false }).limit(30),
            nucleo().from('incidencias').select('*').neq('estado', 'cerrada').order('creado', { ascending: false }).limit(30),
        ]);
        if (s.error) {
            setFallo(s.error.message.includes('NO_PERMISO') ? 'Solo el superadministrador puede ver esto.' : s.error.message);
            return;
        }
        setC(s.data);
        setErrores((e.data ?? []));
        setIncs((i.data ?? []));
    }, []);
    useEffect(() => { cargar(); }, [cargar]);
    async function visto(f) {
        const { error } = await nucleo().from('errores').update({ visto: true }).eq('firma', f);
        if (error) {
            aviso('No se ha podido marcar');
            return;
        }
        cargar();
    }
    const uso = c ? c.bd_bytes / c.bd_limite : 0;
    const copiaVieja = !c?.ultima_copia || horasDesde(c.ultima_copia.en) > 36;
    return (_jsxs("main", { className: "contenido estrecho", children: [_jsxs("button", { type: "button", className: "boton txt volver", onClick: () => ir('/config'), children: [_jsx(Icono, { d: ICONOS.volver, tam: 18 }), " Configuraci\u00F3n"] }), _jsx("h1", { className: "titulo", children: "Salud de la app" }), fallo && _jsx("div", { className: "vacio", children: _jsx("p", { children: fallo }) }), c && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "cifras", children: [_jsxs("div", { className: 'cifra' + (uso > 0.7 ? ' mal' : ''), children: [_jsxs("b", { className: "num", children: [Math.round(uso * 100), " %"] }), _jsx("span", { children: "Espacio usado" }), _jsxs("small", { children: [mb(c.bd_bytes), " de ", mb(c.bd_limite)] }), _jsx("div", { className: "barra", "aria-hidden": "true", children: _jsx("div", { style: { width: `${Math.min(100, uso * 100)}%` } }) })] }), _jsxs("div", { className: 'cifra' + (copiaVieja ? ' mal' : ''), children: [_jsx("b", { children: c.ultima_copia ? cuando(c.ultima_copia.en) : 'Ninguna' }), _jsx("span", { children: "\u00DAltima copia" }), _jsx("small", { children: c.ultima_copia ? `${mb(c.ultima_copia.bytes)} · ${c.ultima_copia.tablas} tablas` : 'Falta configurar la copia nocturna' })] }), _jsxs("div", { className: 'cifra' + (c.errores_sin_ver ? ' mal' : ''), children: [_jsx("b", { className: "num", children: c.errores_sin_ver }), _jsx("span", { children: "Errores sin ver" }), _jsxs("small", { children: [c.errores_24h, " en las \u00FAltimas 24 h"] })] }), _jsxs("div", { className: 'cifra' + (c.incidencias_abiertas ? ' mal' : ''), children: [_jsx("b", { className: "num", children: c.incidencias_abiertas }), _jsx("span", { children: "Incidencias abiertas" }), _jsxs("small", { children: [c.usuarios, " usuarios en la app"] })] })] }), _jsx("h2", { className: "subtitulo", children: "Incidencias (\u00ABTengo un problema\u00BB)" }), incs.length === 0 ? _jsx("p", { className: "nota", children: "No hay ninguna abierta." }) : (_jsx("div", { className: "lista", children: incs.map((i) => (_jsxs("button", { type: "button", className: "fila", onClick: () => setAbierta(i), children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: i.texto }), _jsxs("small", { children: [cuando(i.creado), " \u00B7 ", i.modulo ?? '—', " \u00B7 ", i.pantalla ?? '', " \u00B7 versi\u00F3n ", i.version ?? '?'] })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }, i.id))) })), _jsx("h2", { className: "subtitulo", children: "Errores de la app" }), errores.length === 0 ? _jsx("p", { className: "nota", children: "Ning\u00FAn error sin ver." }) : (_jsx("div", { className: "lista", children: errores.map((e) => (_jsxs("div", { className: "fila fija", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { className: "romper", children: e.mensaje }), _jsxs("small", { children: [e.veces, " ", e.veces === 1 ? 'vez' : 'veces', " \u00B7 \u00FAltimo ", cuando(e.ultimo), " \u00B7 versi\u00F3n ", e.app_version ?? '?'] })] }), _jsx("button", { type: "button", className: "boton sec peq", onClick: () => visto(e.firma), children: "Visto" })] }, e.firma))) }))] })), abierta && _jsx(ContestarIncidencia, { inc: abierta, alCerrar: () => setAbierta(null), alGuardar: () => { setAbierta(null); cargar(); } })] }));
}
function ContestarIncidencia({ inc, alCerrar, alGuardar }) {
    const [respuesta, setRespuesta] = useState(inc.respuesta ?? '');
    async function guardar(cerrar) {
        const { error } = await nucleo().from('incidencias')
            .update({ respuesta: respuesta.trim() || null, estado: cerrar ? 'cerrada' : 'en_curso', cerrado: cerrar ? new Date().toISOString() : null }).eq('id', inc.id);
        if (error) {
            aviso('No se ha podido guardar');
            return;
        }
        aviso(cerrar ? 'Incidencia cerrada' : 'Guardada');
        alGuardar();
    }
    const ctx = inc.contexto ?? {};
    return (_jsxs(Ventana, { titulo: "Incidencia", alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: () => guardar(false), children: "Guardar" }), _jsx("button", { type: "button", className: "boton", onClick: () => guardar(true), children: "Cerrar incidencia" })] }), children: [_jsx("p", { children: _jsx("b", { children: inc.texto }) }), _jsxs("p", { className: "nota", children: [cuando(inc.creado), " \u00B7 pantalla ", inc.pantalla ?? '—', " \u00B7 versi\u00F3n ", inc.version ?? '?', _jsx("br", {}), String(ctx.ancho ?? '?'), "\u00D7", String(ctx.alto ?? '?'), " \u00B7 ", ctx.conexion ? 'con conexión' : 'sin conexión', " \u00B7 ", ctx.instalada ? 'app instalada' : 'en el navegador'] }), _jsxs("label", { className: "campo", style: { marginTop: 12 }, children: [_jsx("span", { children: "Qu\u00E9 se ha hecho" }), _jsx("textarea", { id: "respuesta", rows: 4, value: respuesta, onChange: (e) => setRespuesta(e.target.value) })] })] }));
}
