import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
/** Icono de trazo (24×24). */
export function Icono({ d, tam = 22 }) {
    return (_jsx("svg", { width: tam, height: tam, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: d }) }));
}
export const ICONOS = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    cerrar: 'M6 6l12 12M18 6L6 18',
    ayuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01',
    ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 1.9L6 8.3 4 8 3 11l2 1v0l-2 1 1 3 2-.3 1.4 1.4L7 19l3 1 1-2h2l1 2 3-1-.4-1.9 1.4-1.4 2 .3 1-3z',
    salir: 'M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10',
    empresa: 'M3 21V8l6 4V8l6 4V4h6v17zM3 21h18',
    volver: 'M15 18l-6-6 6-6',
};
/** Ventana encima de la pantalla (cierra con Escape o tocando fuera). */
export function Ventana({ titulo, alCerrar, children, pie }) {
    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape')
            alCerrar(); };
        addEventListener('keydown', tecla);
        return () => removeEventListener('keydown', tecla);
    }, [alCerrar]);
    return (_jsx("div", { className: "fondo", onClick: (e) => { if (e.target === e.currentTarget)
            alCerrar(); }, children: _jsxs("div", { className: "ventana", role: "dialog", "aria-modal": "true", "aria-label": titulo, children: [_jsxs("div", { className: "ventana-cab", children: [_jsx("h2", { children: titulo }), _jsx("button", { type: "button", className: "boton-icono", "aria-label": "Cerrar", onClick: alCerrar, children: _jsx(Icono, { d: ICONOS.cerrar }) })] }), _jsx("div", { className: "ventana-cuerpo", children: children }), pie && _jsx("div", { className: "ventana-pie", children: pie })] }) }));
}
/** Aviso breve abajo de la pantalla. */
let avisar = () => { };
export const aviso = (t) => avisar(t);
export function Avisos() {
    const [texto, setTexto] = useState(null);
    useEffect(() => {
        let reloj;
        avisar = (t) => { setTexto(t); clearTimeout(reloj); reloj = setTimeout(() => setTexto(null), 3000); };
        return () => clearTimeout(reloj);
    }, []);
    return texto ? _jsx("div", { className: "aviso", role: "status", children: texto }) : null;
}
/** Ruta de la app en la dirección (#/…): funciona en GitHub Pages sin servidor. */
export function useRuta() {
    const leer = () => location.hash.replace(/^#/, '') || '/';
    const [ruta, setRuta] = useState(leer);
    useEffect(() => {
        const cambio = () => setRuta(leer());
        addEventListener('hashchange', cambio);
        return () => removeEventListener('hashchange', cambio);
    }, []);
    return [ruta, (r) => { location.hash = r; }];
}
