import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';
const ERRORES = {
    CORREO: 'El correo no está bien escrito.',
    NOMBRE: 'Falta el nombre.',
    NO_PERMISO: 'No tienes permiso para dar acceso en esta unidad de trabajo (o en esa nave).',
    A_TI_MISMO: 'No puedes darte roles a ti mismo.',
    ROL: 'Ese rol no vale para esta unidad de trabajo.',
    PERSONA: 'Ese trabajador no es de esta unidad de trabajo.',
    SESION: 'Tu sesión ha caducado. Sal y vuelve a entrar.',
};
/** Configuración → Usuarios: quién entra en esta unidad de trabajo, con qué rol y en qué nave. */
export function Usuarios({ ir }) {
    const { empresa, puede, estado } = useSesion();
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
    const [asigs, setAsigs] = useState(null);
    const [usus, setUsus] = useState([]);
    const [roles, setRoles] = useState([]);
    const [naves, setNaves] = useState([]);
    const [personas, setPersonas] = useState([]);
    const [formulario, setFormulario] = useState(null);
    const [error, setError] = useState(null);
    const cargar = useCallback(async () => {
        if (!empresa)
            return;
        const [a, r, c, p] = await Promise.all([
            nucleo().from('asignaciones').select('id, usuario_id, rol_id, centro_id').eq('empresa_id', empresa.id).is('hasta', null),
            nucleo().from('roles').select('*').order('nombre'),
            nucleo().from('centros').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre'),
            puede('nucleo.persona.ver') ? nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre') : Promise.resolve({ data: [] }),
        ]);
        if (a.error) {
            setError(a.error.message);
            return;
        }
        const ids = [...new Set(a.data.map((x) => x.usuario_id))];
        const u = ids.length ? await nucleo().from('usuarios').select('id, nombre, email, superadmin').in('id', ids) : { data: [] };
        setAsigs(a.data);
        setUsus((u.data ?? []));
        setRoles((r.data ?? []).filter((x) => !x.baja && (!x.empresa_id || x.empresa_id === empresa.id)));
        setNaves((c.data ?? []).filter((x) => !x.baja));
        setPersonas((p.data ?? []).filter((x) => !x.baja));
    }, [empresa, puede]);
    useEffect(() => { cargar(); }, [cargar]);
    const grupos = useMemo(() => usus
        .map((u) => ({ u, roles: (asigs ?? []).filter((a) => a.usuario_id === u.id) }))
        .sort((x, y) => x.u.nombre.localeCompare(y.u.nombre, 'es')), [usus, asigs]);
    if (!empresa)
        return null;
    const editable = puede('nucleo.usuario.editar');
    const nombreRol = (id) => roles.find((r) => r.id === id)?.nombre ?? 'Rol';
    const nombreNave = (id) => (id ? naves.find((n) => n.id === id)?.nombre ?? 'una nave' : 'todas las naves');
    async function quitar(a, u) {
        if (!confirm(`¿Quitar a ${u.nombre} el rol «${nombreRol(a.rol_id)}» (${nombreNave(a.centro_id)})?`))
            return;
        const { error } = await nucleo().from('asignaciones').delete().eq('id', a.id);
        if (error) {
            aviso('No se ha podido quitar: ' + error.message);
            return;
        }
        aviso('Rol quitado');
        cargar();
    }
    return (_jsxs("main", { className: "contenido estrecho", children: [_jsxs("button", { type: "button", className: "boton txt volver", onClick: () => ir('/config'), children: [_jsx(Icono, { d: ICONOS.volver, tam: 18 }), " Configuraci\u00F3n"] }), _jsx("h1", { className: "titulo", children: "Usuarios" }), _jsxs("p", { className: "nota", style: { margin: '-8px 0 14px' }, children: ["Qui\u00E9n entra en ", empresa.nombre, ", con qu\u00E9 rol y en qu\u00E9 nave."] }), editable && _jsx("button", { type: "button", className: "boton ancho", style: { marginBottom: 14 }, onClick: () => setFormulario({}), children: "Dar acceso a alguien" }), error && _jsx("p", { className: "error", role: "alert", children: error }), asigs === null && !error ? _jsx("p", { className: "nota", children: "Cargando\u2026" }) : (_jsxs("div", { className: "lista", children: [grupos.map(({ u, roles: rs }) => (_jsxs("div", { className: "fila fija", children: [_jsxs("span", { className: "fila-txt", children: [_jsxs("b", { children: [u.nombre, u.id === yo ? ' (tú)' : ''] }), _jsx("small", { children: u.email }), rs.map((a) => (_jsxs("span", { className: "rol-linea", children: [_jsxs("span", { children: [nombreRol(a.rol_id), " \u00B7 ", nombreNave(a.centro_id)] }), editable && u.id !== yo && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => quitar(a, u), children: "Quitar" })] }, a.id)))] }), editable && u.id !== yo && (_jsx("button", { type: "button", className: "boton sec peq", onClick: () => setFormulario({ correo: u.email ?? '', nombre: u.nombre }), children: "Otro rol" }))] }, u.id))), !grupos.length && _jsx("div", { className: "fila fija", children: _jsx("span", { className: "fila-txt", children: _jsx("small", { children: "Todav\u00EDa no hay nadie con acceso a esta unidad de trabajo." }) }) })] })), formulario && _jsx(DarAcceso, { inicial: formulario, roles: roles, naves: naves, personas: personas, empresaId: empresa.id, alCerrar: () => setFormulario(null), alTerminar: () => cargar() })] }));
}
function DarAcceso({ inicial, roles, naves, personas, empresaId, alCerrar, alTerminar }) {
    const [correo, setCorreo] = useState(inicial.correo ?? '');
    const [nombre, setNombre] = useState(inicial.nombre ?? '');
    const [rol, setRol] = useState('');
    const [nave, setNave] = useState('');
    const [persona, setPersona] = useState('');
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [hecho, setHecho] = useState(null);
    const r = roles.find((x) => x.id === rol);
    async function dar() {
        setError(null);
        if (!correo.includes('@')) {
            setError('Escribe su correo.');
            return;
        }
        if (!nombre.trim()) {
            setError('Escribe su nombre.');
            return;
        }
        if (!rol) {
            setError('Elige un rol.');
            return;
        }
        setOcupado(true);
        const { data, error } = await supabase.functions.invoke('invitar', {
            body: { correo, nombre, empresa_id: empresaId, rol_id: rol, centro_id: nave || null, persona_id: persona || null },
        });
        setOcupado(false);
        let codigo = data?.error;
        if (error && !codigo) {
            try {
                codigo = (await error.context?.json())?.error;
            }
            catch { /* sin cuerpo */ }
        }
        if (error || codigo) {
            setError(ERRORES[codigo ?? ''] ?? 'No se ha podido dar el acceso' + (codigo ? ` (${codigo}).` : '. Revisa la conexión.'));
            return;
        }
        setHecho(data);
        alTerminar();
    }
    if (hecho) {
        return (_jsx(Ventana, { titulo: "Acceso dado", alCerrar: alCerrar, pie: _jsx("button", { type: "button", className: "boton", onClick: alCerrar, children: "Hecho" }), children: hecho.nuevo && hecho.clave ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsx("b", { children: nombre }), " ya puede entrar con su correo y esta contrase\u00F1a temporal. D\u00E1sela en mano o por un mensaje privado:"] }), _jsx("p", { className: "clave-temporal", id: "claveTemporal", children: hecho.clave }), _jsx("button", { type: "button", className: "boton sec ancho", onClick: () => { navigator.clipboard?.writeText(hecho.clave).then(() => aviso('Copiada'), () => { }); }, children: "Copiar" }), _jsx("p", { className: "nota", children: "La primera vez que entre, la app le pedir\u00E1 que ponga su propia contrase\u00F1a. Esta no se vuelve a ense\u00F1ar." })] })) : (_jsxs("p", { children: [_jsx("b", { children: nombre }), " ya ten\u00EDa cuenta: entra con su correo y su contrase\u00F1a de siempre, y ahora ver\u00E1 tambi\u00E9n ", r ? `lo de «${r.nombre}»` : 'esta unidad de trabajo', "."] })) }));
    }
    return (_jsxs(Ventana, { titulo: "Dar acceso", alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: dar, children: ocupado ? 'Un momento…' : 'Dar acceso' })] }), children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Correo *" }), _jsx("input", { id: "u-correo", type: "email", inputMode: "email", autoComplete: "off", value: correo, onChange: (e) => setCorreo(e.target.value) })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Nombre *" }), _jsx("input", { id: "u-nombre", value: nombre, onChange: (e) => setNombre(e.target.value) })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Rol *" }), _jsxs("select", { id: "u-rol", value: rol, onChange: (e) => setRol(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 elige \u2014" }), roles.map((x) => _jsx("option", { value: x.id, children: x.nombre }, x.id))] }), r?.descripcion && _jsx("small", { className: "nota", children: r.descripcion })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Nave" }), _jsxs("select", { id: "u-nave", value: nave, onChange: (e) => setNave(e.target.value), children: [_jsx("option", { value: "", children: "Todas las naves" }), naves.map((n) => _jsx("option", { value: n.id, children: n.nombre }, n.id))] }), _jsx("small", { className: "nota", children: "Si eliges una, ese rol solo vale en esa nave." })] }), personas.length > 0 && (_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Es el trabajador" }), _jsxs("select", { id: "u-persona", value: persona, onChange: (e) => setPersona(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 ninguno \u2014" }), personas.map((p) => _jsx("option", { value: p.id, children: p.nombre }, p.id))] }), _jsx("small", { className: "nota", children: "Para que pueda firmar lo suyo (calendario, EPIs\u2026)." })] })), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
