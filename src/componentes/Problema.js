import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { nucleo, VERSION } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from './basicos';
/**
 * «Tengo un problema»: guarda la incidencia con todo lo que hace falta para entenderla
 * (pantalla, versión, móvil, conexión, empresa) sin que la persona tenga que explicarlo.
 */
export function Problema({ alCerrar }) {
    const { empresa } = useSesion();
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const contexto = {
        pantalla: location.hash || '#/',
        ancho: innerWidth,
        alto: innerHeight,
        conexion: navigator.onLine,
        agente: navigator.userAgent,
        instalada: matchMedia('(display-mode: standalone)').matches,
    };
    async function enviar() {
        if (!texto.trim()) {
            aviso('Escribe qué ha pasado');
            return;
        }
        setEnviando(true);
        const { error } = await nucleo().from('incidencias').insert({
            empresa_id: empresa?.id ?? null,
            modulo: (location.hash.match(/^#\/m\/([a-z]+)/) ?? [])[1] ?? 'nucleo',
            pantalla: contexto.pantalla,
            version: VERSION,
            texto: texto.trim(),
            contexto,
        });
        setEnviando(false);
        if (error) {
            aviso('No se pudo enviar. Revisa la conexión e inténtalo otra vez.');
            return;
        }
        aviso('Enviado. Gracias: lo miramos lo antes posible.');
        alCerrar();
    }
    return (_jsxs(Ventana, { titulo: "Tengo un problema", alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", disabled: enviando, onClick: enviar, children: enviando ? 'Enviando…' : 'Enviar' })] }), children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "\u00BFQu\u00E9 ha pasado?" }), _jsx("textarea", { id: "problemaTexto", rows: 5, value: texto, onChange: (e) => setTexto(e.target.value), placeholder: "Por ejemplo: al guardar el consumo sale un error" })] }), _jsxs("p", { className: "nota", children: ["Se env\u00EDa tambi\u00E9n la pantalla en la que est\u00E1s, la versi\u00F3n (", VERSION, ") y el tipo de m\u00F3vil, para poder ver qu\u00E9 pas\u00F3."] })] }));
}
