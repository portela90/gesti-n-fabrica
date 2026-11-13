import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
/**
 * Recuadro para firmar con el dedo (o el ratón). Devuelve la firma como PNG en base64 (data:image/png;base64,…),
 * o null mientras está vacío. Lo usan Personal (calendario) y Prevención (charlas, EPIs…).
 */
export function Firma({ alCambiar, etiqueta = 'Firma aquí con el dedo' }) {
    const lienzo = useRef(null);
    const [vacia, setVacia] = useState(true);
    const trazando = useRef(false);
    useEffect(() => {
        const c = lienzo.current;
        const r = c.getBoundingClientRect();
        const k = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(r.width * k);
        c.height = Math.round(r.height * k);
        const g = c.getContext('2d');
        if (!g)
            return;
        g.scale(k, k);
        g.lineWidth = 2.4;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = '#0b1f4d';
    }, []);
    const punto = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };
    const empieza = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        trazando.current = true;
        const g = e.currentTarget.getContext('2d');
        if (!g)
            return;
        const [x, y] = punto(e);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 0.1, y + 0.1);
        g.stroke();
    };
    const mueve = (e) => {
        if (!trazando.current)
            return;
        const g = e.currentTarget.getContext('2d');
        if (!g)
            return;
        const [x, y] = punto(e);
        g.lineTo(x, y);
        g.stroke();
    };
    const acaba = () => {
        if (!trazando.current)
            return;
        trazando.current = false;
        setVacia(false);
        alCambiar(lienzo.current.toDataURL('image/png'));
    };
    const borrar = () => {
        const c = lienzo.current;
        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        setVacia(true);
        alCambiar(null);
    };
    return (_jsxs("div", { className: "firma", children: [_jsx("canvas", { ref: lienzo, "aria-label": etiqueta, role: "img", onPointerDown: empieza, onPointerMove: mueve, onPointerUp: acaba, onPointerCancel: acaba }), vacia ? _jsx("span", { className: "firma-ayuda", "aria-hidden": "true", children: etiqueta })
                : _jsx("button", { type: "button", className: "boton txt peq firma-borrar", onClick: borrar, children: "Borrar" })] }));
}
