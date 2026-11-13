import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { direccionApp, supabase } from '../nucleo/supabase';
import { aviso } from '../componentes/basicos';
const TEXTO_ERROR = {
    'Invalid login credentials': 'Correo o contraseña incorrectos',
    'Email not confirmed': 'Ese correo todavía no está confirmado',
    'Signups not allowed for otp': 'Ese correo no tiene acceso. Pide a tu administrador que te dé de alta.',
};
const traducir = (m) => TEXTO_ERROR[m] ?? (/rate limit/i.test(m) ? 'Demasiados intentos. Espera unos minutos.' : m);
/** Entrar con correo y contraseña, o con un enlace que llega al correo (cada uno elige). */
export function Entrar() {
    const [modo, setModo] = useState('clave');
    const [correo, setCorreo] = useState('');
    const [clave, setClave] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [enviado, setEnviado] = useState(null);
    const [error, setError] = useState(null);
    async function enviar(e) {
        e.preventDefault();
        setError(null);
        if (!correo.includes('@')) {
            setError('Escribe tu correo');
            return;
        }
        setOcupado(true);
        try {
            if (modo === 'clave') {
                if (!clave) {
                    setError('Escribe tu contraseña');
                    return;
                }
                const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
                if (error)
                    setError(traducir(error.message));
            }
            else if (modo === 'enlace') {
                const { error } = await supabase.auth.signInWithOtp({ email: correo.trim(), options: { shouldCreateUser: false, emailRedirectTo: direccionApp() } });
                if (error)
                    setError(traducir(error.message));
                else
                    setEnviado('Te hemos enviado un enlace. Ábrelo desde este mismo móvil u ordenador para entrar.');
            }
            else {
                const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: direccionApp() });
                if (error)
                    setError(traducir(error.message));
                else
                    setEnviado('Te hemos enviado un enlace para poner una contraseña nueva.');
            }
        }
        finally {
            setOcupado(false);
        }
    }
    return (_jsx("main", { className: "entrar", children: _jsxs("div", { className: "entrar-caja", children: [_jsx("img", { src: `${import.meta.env.BASE_URL}icono.svg`, alt: "", width: 56, height: 56 }), _jsx("h1", { children: "Gesti\u00F3n de f\u00E1brica" }), enviado ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "entrar-ok", role: "status", children: enviado }), _jsx("button", { type: "button", className: "boton sec ancho", onClick: () => { setEnviado(null); setModo('clave'); }, children: "Volver" })] })) : (_jsxs("form", { onSubmit: enviar, noValidate: true, children: [_jsxs("div", { className: "segmentos", role: "group", "aria-label": "C\u00F3mo entrar", children: [_jsx("button", { type: "button", "aria-pressed": modo === 'clave', onClick: () => setModo('clave'), children: "Con contrase\u00F1a" }), _jsx("button", { type: "button", "aria-pressed": modo === 'enlace', onClick: () => setModo('enlace'), children: "Con un enlace" })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Correo" }), _jsx("input", { id: "correo", type: "email", autoComplete: "email", inputMode: "email", value: correo, onChange: (e) => setCorreo(e.target.value) })] }), modo === 'clave' && (_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Contrase\u00F1a" }), _jsx("input", { id: "clave", type: "password", autoComplete: "current-password", value: clave, onChange: (e) => setClave(e.target.value) })] })), modo === 'olvido' && _jsx("p", { className: "nota", children: "Te llegar\u00E1 un enlace al correo para poner una contrase\u00F1a nueva." }), modo === 'enlace' && _jsx("p", { className: "nota", children: "Te llegar\u00E1 un enlace al correo: al abrirlo, entras sin contrase\u00F1a." }), error && _jsx("p", { className: "error", role: "alert", children: error }), _jsx("button", { type: "submit", className: "boton ancho", disabled: ocupado, children: ocupado ? 'Un momento…' : modo === 'clave' ? 'Entrar' : modo === 'enlace' ? 'Enviarme el enlace' : 'Enviarme el enlace' }), modo === 'clave' && _jsx("button", { type: "button", className: "boton txt", onClick: () => setModo('olvido'), children: "He olvidado la contrase\u00F1a" }), modo === 'olvido' && _jsx("button", { type: "button", className: "boton txt", onClick: () => setModo('clave'), children: "Volver" })] })), _jsx("p", { className: "nota centro", children: "Los operarios de planta entrar\u00E1n con su nombre y su PIN cuando llegue su m\u00F3dulo." })] }) }));
}
/** Después del enlace de «he olvidado la contraseña»: poner una nueva. */
export function NuevaClave({ alTerminar }) {
    const [clave, setClave] = useState('');
    const [error, setError] = useState(null);
    async function guardar(e) {
        e.preventDefault();
        if (clave.length < 8) {
            setError('Pon al menos 8 caracteres');
            return;
        }
        const { error } = await supabase.auth.updateUser({ password: clave, data: { cambiar_clave: false } });
        if (error) {
            setError(traducir(error.message));
            return;
        }
        aviso('Contraseña cambiada');
        alTerminar();
    }
    return (_jsx("main", { className: "entrar", children: _jsxs("form", { className: "entrar-caja", onSubmit: guardar, children: [_jsx("h1", { children: "Pon tu contrase\u00F1a" }), _jsx("p", { className: "nota", style: { margin: '-8px 0 16px', textAlign: 'center' }, children: "Solo la sabr\u00E1s t\u00FA. La usar\u00E1s para entrar a partir de ahora." }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Contrase\u00F1a nueva" }), _jsx("input", { id: "claveNueva", type: "password", autoComplete: "new-password", value: clave, onChange: (e) => setClave(e.target.value) })] }), error && _jsx("p", { className: "error", role: "alert", children: error }), _jsx("button", { type: "submit", className: "boton ancho", children: "Guardar" })] }) }));
}
