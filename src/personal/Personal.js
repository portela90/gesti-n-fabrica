import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Firma } from '../componentes/Firma';
import { PorOperario } from './PorOperario';
import { Anio, fechaCorta, Leyenda, ListaDias, periodo, personal, textoError, } from './calendario';
const fmtH = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const ANIO_ACTUAL = new Date().getFullYear();
const DIAS_SEMANA = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
const leer = (k) => { try {
    return localStorage.getItem(k);
}
catch {
    return null;
} };
const guardar = (k, v) => { try {
    localStorage.setItem(k, v);
}
catch { /* sin almacenamiento */ } };
/** Los calendarios de un año, con quién va en cada uno. */
function useCalendarios(anio) {
    const { empresa } = useSesion();
    const [cals, setCals] = useState(null);
    const cargar = useCallback(async () => {
        const [c, cp] = await Promise.all([
            personal().from('calendarios').select('id, nombre, dias_semana, horas_dia, horas_anuales').eq('empresa_id', empresa.id).eq('anio', anio).order('nombre'),
            personal().from('calendario_personas').select('persona_id, calendario_id').eq('empresa_id', empresa.id).eq('anio', anio),
        ]);
        const miembros = (cp.data ?? []);
        // primero el que empieza antes la semana (lunes), luego el de fin de semana
        const primerDia = (d) => Math.min(...d.map((x) => (x + 6) % 7), 7);
        setCals((c.data ?? [])
            .map((x) => ({ id: x.id, nombre: x.nombre, dias: x.dias_semana, horas_dia: x.horas_dia, horas_anuales: x.horas_anuales,
            personas: miembros.filter((m) => m.calendario_id === x.id).map((m) => m.persona_id) }))
            .sort((a, b) => primerDia(a.dias) - primerDia(b.dias) || a.nombre.localeCompare(b.nombre, 'es')));
    }, [empresa, anio]);
    useEffect(() => { setCals(null); cargar(); }, [cargar]);
    return [cals, cargar];
}
/** Todos los trabajadores de la unidad (para elegir quién va en cada calendario). */
function usePersonas() {
    const { empresa, puede } = useSesion();
    const [personas, setPersonas] = useState([]);
    useEffect(() => {
        if (!puede('nucleo.persona.ver'))
            return;
        nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre')
            .then(({ data }) => setPersonas((data ?? [])));
    }, [empresa, puede]);
    return personas;
}
/** Módulo Personal: mi calendario (todos) y, según permisos, los calendarios del año, vacaciones y firmas. */
export function Personal({ ruta, ir }) {
    const { empresa, puede } = useSesion();
    const pestanas = [
        ['mio', 'Mi calendario', true],
        ['calendario', 'Calendario', puede('personal.calendario.ver')],
        ['vacaciones', 'Vacaciones', puede('personal.calendario.ver')],
        ['firmas', 'Firmas', puede('personal.firma.ver') || puede('personal.firma.enviar')],
    ].filter((p) => p[2]);
    const pedida = (ruta.split('/')[3] ?? '');
    const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? (pestanas.length > 1 ? 'calendario' : 'mio');
    const [anio, setAnio] = useState(ANIO_ACTUAL);
    const [cals, recargar] = useCalendarios(anio);
    const [calId, setCalId] = useState('');
    const [editando, setEditando] = useState(null);
    const editable = puede('personal.calendario.editar');
    useEffect(() => {
        if (!cals)
            return;
        setCalId((x) => (cals.some((c) => c.id === x) ? x : cals.find((c) => c.id === leer('personal.calendario.' + anio))?.id ?? cals[0]?.id ?? ''));
    }, [cals, anio]);
    if (!empresa)
        return null;
    const cal = cals?.find((c) => c.id === calId) ?? null;
    const elegir = actual !== 'mio' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "filtros", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "A\u00F1o" }), _jsx("select", { value: anio, onChange: (e) => setAnio(Number(e.target.value)), children: [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map((a) => _jsx("option", { children: a }, a)) })] }), !!cals?.length && actual !== 'calendario' && _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Calendario" }), _jsx("select", { value: calId, onChange: (e) => { setCalId(e.target.value); guardar('personal.calendario.' + anio, e.target.value); }, children: cals.map((c) => _jsx("option", { value: c.id, children: c.nombre }, c.id)) })] })] }), cal && actual !== 'calendario' && (_jsxs("div", { className: "acciones-cal no-imprimir", children: [editable
                        ? _jsxs("button", { type: "button", className: "boton sec peq", onClick: () => setEditando(cal), children: ["Para ", cal.personas.length === 1 ? '1 persona' : `${cal.personas.length} personas`, " \u00B7 cambiar"] })
                        : _jsxs("span", { className: "nota", children: ["Para ", cal.personas.length === 1 ? '1 persona' : `${cal.personas.length} personas`] }), editable && _jsx("button", { type: "button", className: "boton sec peq", onClick: () => setEditando('nuevo'), children: "+ Nuevo calendario" })] }))] }));
    return (_jsxs("main", { className: "contenido", style: { ['--area']: '#9a3412' }, children: [pestanas.length > 1 && (_jsx("nav", { className: "pestanas no-imprimir", "aria-label": "Personal", children: pestanas.map(([c, n]) => _jsx("button", { type: "button", "aria-pressed": actual === c, onClick: () => ir(`/m/personal/${c}`), children: n }, c)) })), elegir, actual !== 'mio' && actual !== 'calendario' && cals?.length === 0 && (_jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsxs("b", { children: ["Todav\u00EDa no hay calendarios de ", anio, "."] }) }), _jsxs("p", { children: ["Crea uno para cada grupo de gente que trabaja igual (por ejemplo \u00ABSemana ", anio, "\u00BB y \u00ABFin de semana ", anio, "\u00BB)."] }), editable && _jsx("button", { type: "button", className: "boton", onClick: () => setEditando('nuevo'), children: "Crear calendario" })] })), actual === 'mio' && _jsx(MiCalendario, {}), actual === 'calendario' && cals && _jsx(PorOperario, { anio: anio, cals: cals, recargar: recargar }, anio), actual === 'vacaciones' && cal && _jsx(Vacaciones, { anio: anio, equipo: cal }, cal.id), actual === 'firmas' && cal && _jsx(Firmas, { anio: anio, equipo: cal }, cal.id), editando && _jsx(FormCalendario, { anio: anio, cal: editando === 'nuevo' ? null : editando, cals: cals ?? [], alCerrar: () => setEditando(null), alGuardar: (id) => { setEditando(null); setCalId(id); guardar('personal.calendario.' + anio, id); recargar(); } })] }));
}
/** Crear un calendario o cambiar su nombre, sus días de la semana y para quién es. */
function FormCalendario({ anio, cal, cals, alCerrar, alGuardar }) {
    const { empresa } = useSesion();
    const personas = usePersonas().filter((p) => !p.baja || cal?.personas.includes(p.id));
    const [nombre, setNombre] = useState(cal?.nombre ?? '');
    // horas de un día normal por día de la semana (índice 0 = domingo); vacío = no se trabaja
    const [horasDia, setHorasDia] = useState(() => [0, 1, 2, 3, 4, 5, 6].map((d) => cal?.horas_dia ? (cal.horas_dia[d] ? String(cal.horas_dia[d]).replace('.', ',') : '') : (cal ? cal.dias : [1, 2, 3, 4, 5]).includes(d) ? '8' : ''));
    const [anuales, setAnuales] = useState(cal?.horas_anuales != null ? String(cal.horas_anuales).replace('.', ',') : '');
    const [quien, setQuien] = useState(new Set(cal?.personas ?? []));
    const [copiarDe, setCopiarDe] = useState('');
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const enOtro = (pid) => cals.find((c) => c.id !== cal?.id && c.personas.includes(pid));
    const cambia = personas.filter((p) => quien.has(p.id) && enOtro(p.id)).length;
    async function guardarCal() {
        if (!nombre.trim()) {
            setError('Ponle un nombre.');
            return;
        }
        const num = (x) => (x.trim() === '' ? 0 : Number(x.replace(',', '.')));
        const hd = horasDia.map(num);
        if (hd.some((h) => Number.isNaN(h) || h < 0 || h > 24)) {
            setError('Las horas de cada día tienen que ser un número entre 0 y 24.');
            return;
        }
        if (!hd.some((h) => h > 0)) {
            setError('Pon las horas de los días que se trabaja.');
            return;
        }
        const ha = anuales.trim() === '' ? null : num(anuales);
        if (ha !== null && (Number.isNaN(ha) || ha < 0 || ha > 4000)) {
            setError('Las horas al año no están bien escritas.');
            return;
        }
        setOcupado(true);
        setError(null);
        const fila = { nombre: nombre.trim(), dias_semana: [0, 1, 2, 3, 4, 5, 6].filter((d) => hd[d] > 0), horas_dia: hd, horas_anuales: ha };
        const r = cal ? await personal().from('calendarios').update(fila).eq('id', cal.id).select('id').single()
            : await personal().from('calendarios').insert({ ...fila, empresa_id: empresa.id, anio }).select('id').single();
        if (r.error) {
            setOcupado(false);
            setError(r.error.message.includes('duplicate') ? 'Ya hay un calendario con ese nombre este año.' : textoError(r.error.message));
            return;
        }
        const id = r.data.id;
        const p = await personal().rpc('poner_personas', { p_calendario: id, p_personas: [...quien] });
        if (p.error) {
            setOcupado(false);
            setError(textoError(p.error.message));
            return;
        }
        if (!cal && copiarDe) {
            const c = await personal().rpc('copiar_dias', { p_de: copiarDe, p_a: id });
            if (c.error) {
                setOcupado(false);
                setError(textoError(c.error.message));
                return;
            }
        }
        setOcupado(false);
        aviso(cal ? 'Calendario guardado' : 'Calendario creado');
        alGuardar(id);
    }
    async function borrar() {
        if (!cal || !confirm(`¿Borrar el calendario «${cal.nombre}» con sus días marcados? Solo se puede si no se ha enviado a nadie.`))
            return;
        const { error } = await personal().from('calendarios').delete().eq('id', cal.id);
        if (error) {
            setError(error.message.includes('foreign key') ? 'No se puede borrar: ya se ha enviado a firmar.' : textoError(error.message));
            return;
        }
        aviso('Calendario borrado');
        alGuardar('');
    }
    return (_jsxs(Ventana, { titulo: cal ? cal.nombre : `Nuevo calendario ${anio}`, alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [cal && _jsx("button", { type: "button", className: "boton sec", onClick: borrar, children: "Borrar" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: guardarCal, children: cal ? 'Guardar' : 'Crear' })] }), children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Nombre" }), _jsx("input", { value: nombre, maxLength: 80, placeholder: `Por ejemplo: Refuerzo ${anio}`, onChange: (e) => setNombre(e.target.value) })] }), _jsxs("div", { className: "campo", children: [_jsx("span", { children: "Horas de un d\u00EDa normal (vac\u00EDo = no se trabaja)" }), _jsx("div", { className: "horas-semana", role: "group", "aria-label": "Horas de un d\u00EDa normal", children: DIAS_SEMANA.map(([d, l]) => _jsxs("label", { children: [_jsx("small", { children: l }), _jsx("input", { inputMode: "decimal", "aria-label": `Horas del ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d]}`, value: horasDia[d], onChange: (e) => setHorasDia((x) => x.map((y, i) => (i === d ? e.target.value : y))) })] }, d)) })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Horas que hay que trabajar al a\u00F1o" }), _jsx("input", { inputMode: "decimal", value: anuales, placeholder: "Por ejemplo: 1712", onChange: (e) => setAnuales(e.target.value) }), _jsx("span", { className: "nota", children: "A quien tenga otras (jornada parcial\u2026), se las pones luego en el cuadro de horas." })] }), !cal && cals.length > 0 && _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Copiar los d\u00EDas marcados de (opcional)" }), _jsxs("select", { value: copiarDe, onChange: (e) => setCopiarDe(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Empezar en blanco \u2014" }), cals.map((c) => _jsx("option", { value: c.id, children: c.nombre }, c.id))] })] }), _jsxs("div", { className: "campo", children: [_jsxs("span", { children: ["\u00BFPara qui\u00E9n es? (", quien.size, ")"] }), _jsxs("div", { className: "botonera", style: { justifyContent: 'flex-start', margin: '0 0 6px' }, children: [_jsx("button", { type: "button", className: "boton txt peq", onClick: () => setQuien(new Set(personas.filter((p) => !p.baja).map((p) => p.id))), children: "Todos" }), _jsx("button", { type: "button", className: "boton txt peq", onClick: () => setQuien(new Set()), children: "Ninguno" })] }), _jsx("div", { className: "lista compacta", children: personas.map((p) => {
                            const otro = enOtro(p.id);
                            return (_jsxs("label", { className: "fila check", children: [_jsx("input", { type: "checkbox", checked: quien.has(p.id), onChange: () => setQuien((q) => { const n = new Set(q); if (n.has(p.id))
                                            n.delete(p.id);
                                        else
                                            n.add(p.id); return n; }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), otro && _jsxs("small", { children: ["Ahora en \u00AB", otro.nombre, "\u00BB"] })] })] }, p.id));
                        }) })] }), cambia > 0 && _jsxs("p", { className: "nota", children: ["Cada persona va en un solo calendario por a\u00F1o: ", cambia === 1 ? '1 persona se cambiará' : `${cambia} personas se cambiarán`, " a este."] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
// ---------------------------------------------------------------------------------------------
// Vacaciones
// ---------------------------------------------------------------------------------------------
function usePersonasEquipo(equipo) {
    const { empresa } = useSesion();
    const [personas, setPersonas] = useState(null);
    useEffect(() => {
        nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).is('baja', null).order('nombre')
            .then(({ data }) => setPersonas((data ?? []).filter((p) => equipo.personas.includes(p.id))));
    }, [empresa, equipo]);
    return personas;
}
function Vacaciones({ anio, equipo }) {
    const { empresa, puede } = useSesion();
    const personas = usePersonasEquipo(equipo);
    const [vacs, setVacs] = useState([]);
    const [editando, setEditando] = useState(null);
    const editable = puede('personal.vacaciones.editar');
    const cargar = useCallback(async () => {
        const { data } = await personal().from('vacaciones').select('id, persona_id, desde, hasta, nota')
            .eq('empresa_id', empresa.id).lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).order('desde');
        setVacs((data ?? []));
    }, [empresa, anio]);
    useEffect(() => { cargar(); }, [cargar]);
    if (personas === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    if (!personas.length)
        return _jsx("div", { className: "vacio", children: _jsxs("p", { children: ["Nadie va en \u00AB", equipo.nombre, "\u00BB. Pulsa \u00ABPara 0 personas \u00B7 cambiar\u00BB para elegir para qui\u00E9n es."] }) });
    return (_jsxs(_Fragment, { children: [editable && _jsxs("button", { type: "button", className: "boton sec ancho", style: { marginBottom: 12 }, onClick: () => setEditando({ persona_id: '*' }), children: ["Vacaciones para todo ", equipo.nombre] }), _jsx("div", { className: "lista", children: personas.map((p) => {
                    const suyas = vacs.filter((v) => v.persona_id === p.id);
                    return (_jsxs("div", { className: "fila fija", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), suyas.length === 0 && _jsxs("small", { children: ["Sin vacaciones en ", anio] }), suyas.map((v) => (_jsxs("span", { className: "rol-linea", children: [_jsxs("span", { children: [periodo(v), v.nota ? ` · ${v.nota}` : ''] }), editable && _jsx("button", { type: "button", className: "boton txt", onClick: () => setEditando(v), children: "Cambiar" })] }, v.id)))] }), editable && _jsx("button", { type: "button", className: "boton sec peq", "aria-label": `Añadir vacaciones a ${p.nombre}`, onClick: () => setEditando({ persona_id: p.id }), children: "A\u00F1adir" })] }, p.id));
                }) }), editando && _jsx(FormVacacion, { v: editando, equipo: equipo, personas: editando.persona_id === '*' ? personas : personas.filter((p) => p.id === editando.persona_id), alCerrar: () => setEditando(null), alGuardar: () => { setEditando(null); cargar(); } })] }));
}
/** Vacaciones de un trabajador o, con varios, las mismas fechas para todos (cada uno queda con las suyas y se pueden cambiar sueltas). */
function FormVacacion({ v, equipo, personas, alCerrar, alGuardar }) {
    const persona = personas[0];
    const todos = personas.length > 1;
    const { empresa } = useSesion();
    const [desde, setDesde] = useState(v.desde ?? '');
    const [hasta, setHasta] = useState(v.hasta ?? '');
    const [nota, setNota] = useState(v.nota ?? '');
    const [error, setError] = useState(null);
    async function guardar() {
        if (!desde || !hasta) {
            setError('Pon las dos fechas.');
            return;
        }
        if (hasta < desde) {
            setError('«Hasta» no puede ser antes de «Desde».');
            return;
        }
        const fila = { desde, hasta, nota: nota.trim() || null };
        const { error } = v.id ? await personal().from('vacaciones').update(fila).eq('id', v.id)
            : await personal().from('vacaciones').insert(personas.map((p) => ({ ...fila, empresa_id: empresa.id, persona_id: p.id })));
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso(todos ? `Vacaciones puestas a ${personas.length} trabajadores` : 'Vacaciones guardadas');
        alGuardar();
    }
    async function quitar() {
        if (!confirm(`¿Quitar estas vacaciones de ${persona.nombre}?`))
            return;
        const { error } = await personal().from('vacaciones').delete().eq('id', v.id);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Vacaciones quitadas');
        alGuardar();
    }
    return (_jsxs(Ventana, { titulo: `Vacaciones · ${todos ? 'todo ' + equipo.nombre : persona.nombre}`, alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [v.id && _jsx("button", { type: "button", className: "boton sec", onClick: quitar, children: "Quitar" }), _jsx("button", { type: "button", className: "boton", onClick: guardar, children: "Guardar" })] }), children: [_jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Desde" }), _jsx("input", { type: "date", value: desde, onChange: (e) => { setDesde(e.target.value); if (!hasta)
                                    setHasta(e.target.value); } })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Hasta (incluido)" }), _jsx("input", { type: "date", value: hasta, onChange: (e) => setHasta(e.target.value) })] })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Nota (opcional)" }), _jsx("input", { value: nota, maxLength: 200, onChange: (e) => setNota(e.target.value) })] }), todos && _jsxs("p", { className: "nota", children: ["Se pone a los ", personas.length, " de ", equipo.nombre, ". Luego puedes cambiarlas o quitarlas a cada uno por separado."] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
// ---------------------------------------------------------------------------------------------
// Firmas: enviar el calendario a firmar y ver quién ha firmado
// ---------------------------------------------------------------------------------------------
function Firmas({ anio, equipo }) {
    const [errorEnvio, setErrorEnvio] = useState(null);
    const [horas, setHoras] = useState([]);
    const [otrasHoras, setOtrasHoras] = useState(null);
    const cargarHoras = useCallback(async () => {
        const h = await personal().rpc('horas_personas', { p_calendario: equipo.id });
        setHoras((h.data ?? []));
    }, [equipo]);
    useEffect(() => { cargarHoras(); }, [cargarHoras]);
    const { empresa, puede } = useSesion();
    const personas = usePersonasEquipo(equipo);
    const [envios, setEnvios] = useState([]);
    const [elegidos, setElegidos] = useState(new Set());
    const [viendo, setViendo] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const enviar = puede('personal.firma.enviar');
    const cargar = useCallback(async () => {
        const { data, error } = await personal().from('v_envios').select('*').eq('empresa_id', empresa.id).eq('anio', anio).eq('calendario_id', equipo.id).order('enviado', { ascending: false });
        if (error) {
            aviso(error.message);
            return;
        }
        setEnvios((data ?? []));
    }, [empresa, anio, equipo]);
    useEffect(() => { cargar(); }, [cargar]);
    // el envío que cuenta de cada uno: el más nuevo sin anular
    const vigente = useMemo(() => new Map(personas?.map((p) => [p.id, envios.find((e) => e.persona_id === p.id && e.estado !== 'anulado')]) ?? []), [personas, envios]);
    if (personas === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    const firmados = personas.filter((p) => vigente.get(p.id)?.estado === 'firmado').length;
    async function mandar() {
        const ya = [...elegidos].filter((id) => vigente.get(id)?.estado === 'firmado');
        if (ya.length && !confirm(`${ya.length} ya lo ${ya.length === 1 ? 'ha' : 'han'} firmado. ¿Enviar otra vez el calendario de ${anio}?`))
            return;
        setOcupado(true);
        const { data, error } = await personal().rpc('enviar_calendario', { p_calendario: equipo.id, p_personas: [...elegidos] });
        setOcupado(false);
        if (error) {
            const m = error.message.match(/(NO_CUADRA|SIN_HORAS): (.*)/);
            setErrorEnvio(m ? (m[1] === 'NO_CUADRA' ? `No se puede enviar: no cuadran las horas de ${m[2]}. Míralo en la pestaña Calendario.`
                : `No se puede enviar: faltan las horas al año de ${m[2]}. Ponlas en el calendario («Para N personas · cambiar»).`) : textoError(error.message));
            return;
        }
        setErrorEnvio(null);
        aviso(`Enviado a ${data} ${data === 1 ? 'trabajador' : 'trabajadores'}`);
        setElegidos(new Set());
        cargar();
    }
    async function anular(e) {
        if (!confirm('¿Anular este envío? Ya no se podrá firmar.'))
            return;
        const { error } = await personal().rpc('anular_envio', { p_envio: e.id });
        if (error) {
            aviso(textoError(error.message));
            return;
        }
        aviso('Envío anulado');
        setViendo(null);
        cargar();
    }
    return (_jsxs(_Fragment, { children: [_jsx(CuadroHoras, { cal: equipo, horas: horas, editable: puede('personal.calendario.editar'), alCambiar: setOtrasHoras }), otrasHoras && _jsx(OtrasHoras, { cal: equipo, h: otrasHoras, alCerrar: () => setOtrasHoras(null), alGuardar: () => { setOtrasHoras(null); cargarHoras(); } }), _jsxs("p", { className: "nota", style: { marginTop: 0 }, children: ["Han firmado ", _jsx("b", { children: firmados }), " de ", personas.length, ".", enviar && ' Elige a quién enviar el calendario de ' + anio + ' para que lo firme.'] }), _jsx("div", { className: "lista", children: personas.map((p) => {
                    const e = vigente.get(p.id);
                    return (_jsxs("div", { className: "fila fija centrada", children: [enviar && _jsx("input", { type: "checkbox", className: "marca", "aria-label": `Elegir a ${p.nombre}`, checked: elegidos.has(p.id), onChange: () => setElegidos((s) => { const n = new Set(s); if (n.has(p.id))
                                    n.delete(p.id);
                                else
                                    n.add(p.id); return n; }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: p.nombre }), _jsx("small", { children: !e ? 'Sin enviar' : e.estado === 'pendiente' ? `Pendiente de firma · enviado el ${fechaCorta(e.enviado.slice(0, 10))}`
                                            : `Firmado el ${fechaCorta(e.firmado_en.slice(0, 10))}${e.conforme ? ' · conforme' : ' · con observaciones'}` })] }), _jsx("span", { className: 'chapa ' + (e?.estado ?? 'sin'), children: !e ? 'Sin enviar' : e.estado === 'firmado' ? 'Firmado' : 'Pendiente' }), e && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => setViendo(e), children: "Ver" })] }, p.id));
                }) }), errorEnvio && _jsx("p", { className: "error", role: "alert", children: errorEnvio }), enviar && (_jsxs("div", { className: "botonera no-imprimir", children: [_jsx("button", { type: "button", className: "boton txt", onClick: () => setElegidos(new Set(personas.filter((p) => !vigente.get(p.id)).map((p) => p.id))), children: "Elegir los que faltan" }), _jsxs("button", { type: "button", className: "boton", disabled: !elegidos.size || ocupado, onClick: mandar, children: ["Enviar a firmar", elegidos.size ? ` (${elegidos.size})` : ''] })] })), viendo && _jsx(Documento, { envio: viendo, alCerrar: () => setViendo(null), alFirmar: () => { setViendo(null); cargar(); }, alAnular: enviar && viendo.estado === 'pendiente' ? () => anular(viendo) : undefined })] }));
}
// ---------------------------------------------------------------------------------------------
// Mi calendario: lo que me han enviado, firmar
// ---------------------------------------------------------------------------------------------
function MiCalendario() {
    const { empresa, estado } = useSesion();
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
    const [envios, setEnvios] = useState(null);
    const [sinFicha, setSinFicha] = useState(false);
    const [viendo, setViendo] = useState(null);
    const cargar = useCallback(async () => {
        const { data: u } = await nucleo().from('usuarios').select('persona_id').eq('id', yo).maybeSingle();
        const persona = u?.persona_id;
        if (!persona) {
            setSinFicha(true);
            setEnvios([]);
            return;
        }
        const { data } = await personal().from('v_envios').select('*').eq('empresa_id', empresa.id).eq('persona_id', persona).neq('estado', 'anulado')
            .order('anio', { ascending: false });
        setEnvios((data ?? []));
    }, [empresa, yo]);
    useEffect(() => { cargar(); }, [cargar]);
    if (envios === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    if (sinFicha)
        return _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsx("b", { children: "Tu usuario no est\u00E1 enlazado con tu ficha de trabajador." }) }), _jsx("p", { children: "P\u00EDdeselo a tu administrador (Configuraci\u00F3n \u2192 Usuarios)." })] });
    if (!envios.length)
        return _jsx("div", { className: "vacio", children: _jsx("p", { children: "Todav\u00EDa no te han enviado ning\u00FAn calendario laboral." }) });
    const pendientes = envios.filter((e) => e.estado === 'pendiente');
    return (_jsxs(_Fragment, { children: [pendientes.length > 0 && _jsxs("p", { className: "aviso-linea", children: ["Tienes ", pendientes.length === 1 ? 'un calendario' : `${pendientes.length} calendarios`, " por revisar y firmar."] }), _jsx("div", { className: "lista", children: envios.map((e) => (_jsxs("button", { type: "button", className: "fila", onClick: () => setViendo(e), children: [_jsxs("span", { className: "fila-txt", children: [_jsxs("b", { children: ["Calendario laboral ", e.anio] }), _jsxs("small", { children: [e.datos.calendario ?? e.datos.equipo, " \u00B7 ", e.estado === 'firmado' ? `firmado el ${fechaCorta(e.firmado_en.slice(0, 10))}` : 'pendiente de firma'] })] }), _jsx("span", { className: 'chapa ' + e.estado, children: e.estado === 'firmado' ? 'Firmado' : 'Firmar' })] }, e.id))) }), viendo && _jsx(Documento, { envio: viendo, alCerrar: () => setViendo(null), alFirmar: () => { setViendo(null); cargar(); } })] }));
}
/** El calendario tal como se envió (la foto), con su firma o para firmarlo. También sirve para imprimir o guardar en PDF. */
function Documento({ envio, alCerrar, alFirmar, alAnular }) {
    const { estado } = useSesion();
    const d = envio.datos;
    const [firmando, setFirmando] = useState(false);
    const [conforme, setConforme] = useState(true);
    const [comentario, setComentario] = useState('');
    const [png, setPng] = useState(null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const yo = estado.fase === 'dentro' ? estado.sesion.usuario : null;
    const puedeFirmar = envio.estado === 'pendiente';
    const totalVac = d.vacaciones.reduce((n, v) => n + (Date.parse(v.hasta) - Date.parse(v.desde)) / 864e5 + 1, 0);
    async function firmar() {
        setError(null);
        if (!png) {
            setError('Falta la firma.');
            return;
        }
        if (!conforme && !comentario.trim()) {
            setError('Explica qué no está bien.');
            return;
        }
        setOcupado(true);
        const { error } = await personal().rpc('firmar_calendario', {
            p_envio: envio.id, p_conforme: conforme, p_comentario: comentario.trim() || null, p_imagen: png,
            p_dispositivo: { agente: navigator.userAgent.slice(0, 200), ancho: innerWidth, alto: innerHeight, recogida_por: yo?.nombre ?? null },
        });
        setOcupado(false);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Calendario firmado');
        alFirmar();
    }
    return (_jsx(Ventana, { titulo: `Calendario laboral ${d.anio}`, alCerrar: alCerrar, pie: firmando
            ? _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: () => setFirmando(false), children: "Atr\u00E1s" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: firmar, children: "Firmar" })] })
            : _jsxs(_Fragment, { children: [alAnular && _jsx("button", { type: "button", className: "boton sec", onClick: alAnular, children: "Anular" }), _jsx("button", { type: "button", className: "boton sec", onClick: () => window.print(), children: "Imprimir o PDF" }), puedeFirmar && _jsx("button", { type: "button", className: "boton", onClick: () => setFirmando(true), children: "Firmar" })] }), children: _jsxs("div", { className: "documento", children: [_jsxs("p", { className: "doc-cab", children: [_jsx("b", { children: d.unidad }), " \u00B7 Calendario laboral ", d.anio, _jsx("br", {}), d.trabajador, " \u00B7 ", d.calendario ?? d.equipo, d.horas_anuales != null && _jsxs(_Fragment, { children: [_jsx("br", {}), "Horas de trabajo al a\u00F1o: ", _jsxs("b", { children: [fmtH(d.horas ?? 0), " h"] }), " (de ", fmtH(d.horas_anuales), " h)"] })] }), !firmando ? (_jsxs(_Fragment, { children: [_jsx(Leyenda, {}), _jsx(Anio, { anio: d.anio, dias: d.dias, vacaciones: d.vacaciones, diasEquipo: d.dias_equipo }), _jsx("h3", { className: "subtitulo", children: "D\u00EDas especiales" }), _jsx(ListaDias, { dias: d.dias }), _jsxs("h3", { className: "subtitulo", children: ["Tus vacaciones", totalVac ? ` (${totalVac} días)` : ''] }), d.vacaciones.length ? _jsx("ul", { className: "lista-dias", children: d.vacaciones.map((v) => _jsxs("li", { children: [_jsx("i", { className: "t-vacaciones" }), _jsxs("span", { children: [periodo(v), v.nota ? ` · ${v.nota}` : ''] })] }, v.desde)) })
                            : _jsx("p", { className: "nota", children: "No tienes vacaciones apuntadas este a\u00F1o." }), envio.estado === 'firmado' && (_jsxs("div", { className: "firmado", children: [_jsxs("p", { children: [_jsx("b", { children: envio.conforme ? 'Recibido y conforme' : 'Recibido con observaciones' }), " \u00B7 ", new Date(envio.firmado_en).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })] }), envio.comentario && _jsxs("p", { children: ["\u00AB", envio.comentario, "\u00BB"] }), envio.firma_imagen && _jsx("img", { src: envio.firma_imagen, alt: `Firma de ${d.trabajador}` }), _jsxs("p", { className: "nota romper", children: ["Huella del documento: ", envio.sha256] })] }))] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "segmentos", role: "group", "aria-label": "\u00BFEst\u00E1s conforme?", children: [_jsx("button", { type: "button", "aria-pressed": conforme, onClick: () => setConforme(true), children: "Conforme" }), _jsx("button", { type: "button", "aria-pressed": !conforme, onClick: () => setConforme(false), children: "Con observaciones" })] }), !conforme && _jsxs("label", { className: "campo", children: [_jsx("span", { children: "\u00BFQu\u00E9 no est\u00E1 bien?" }), _jsx("textarea", { rows: 3, maxLength: 500, value: comentario, onChange: (e) => setComentario(e.target.value) })] }), _jsxs("p", { className: "nota", style: { marginBottom: 8 }, children: ["Firmo que he recibido mi calendario laboral de ", d.anio, conforme ? ' y estoy conforme.' : ' con las observaciones de arriba.'] }), _jsx(Firma, { alCambiar: setPng }), error && _jsx("p", { className: "error", role: "alert", children: error })] }))] }) }));
}
/** Cuadro de horas: lo que sale a cada persona frente a lo que tiene que hacer al año. */
function CuadroHoras({ cal, horas, editable, alCambiar }) {
    if (!horas.length)
        return null;
    const mal = horas.filter((h) => h.objetivo == null || Math.abs(h.horas - h.objetivo) > 0.005).length;
    return (_jsxs("section", { className: "horas", "aria-label": "Horas del a\u00F1o", children: [_jsxs("h2", { className: "subtitulo", style: { marginTop: 0 }, children: ["Horas del a\u00F1o ", mal ? _jsxs("span", { className: "chapa sin-cuadrar", children: [mal, " sin cuadrar"] }) : _jsx("span", { className: "chapa firmado", children: "Todo cuadra" })] }), cal.horas_anuales == null && _jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Este calendario a\u00FAn no tiene las horas al a\u00F1o (\u00ABPara N personas \u00B7 cambiar\u00BB)." }), _jsx("div", { className: "lista", children: horas.map((h) => {
                    const dif = h.objetivo == null ? null : Math.round((h.horas - h.objetivo) * 100) / 100;
                    return (_jsxs("div", { className: "fila fija centrada", children: [_jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: h.nombre }), _jsxs("small", { children: [fmtH(h.horas), " h", h.objetivo != null ? ` de ${fmtH(h.objetivo)} h` : '', h.vacaciones ? ` · ${h.vacaciones} días de vacaciones` : '', h.objetivo != null && cal.horas_anuales != null && h.objetivo !== cal.horas_anuales ? ' · horas propias' : ''] })] }), _jsx("span", { className: 'chapa ' + (dif === 0 ? 'firmado' : 'sin-cuadrar'), children: dif === null ? 'Sin horas' : dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${fmtH(-dif)} h` : `Sobran ${fmtH(dif)} h` }), editable && _jsx("button", { type: "button", className: "boton txt peq", onClick: () => alCambiar(h), children: "Otras horas" })] }, h.persona_id));
                }) })] }));
}
/** Horas al año propias de una persona (si no son las del calendario). */
function OtrasHoras({ cal, h, alCerrar, alGuardar }) {
    const propias = h.objetivo != null && h.objetivo !== cal.horas_anuales;
    const [v, setV] = useState(propias ? String(h.objetivo).replace('.', ',') : '');
    const [error, setError] = useState(null);
    async function guardar(valor) {
        const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
        if (n !== null && (Number.isNaN(n) || n < 0 || n > 4000)) {
            setError('No es un número de horas válido.');
            return;
        }
        const { error } = await personal().from('calendario_personas').update({ horas_anuales: n }).eq('calendario_id', cal.id).eq('persona_id', h.persona_id);
        if (error) {
            setError(textoError(error.message));
            return;
        }
        aviso('Horas guardadas');
        alGuardar();
    }
    return (_jsxs(Ventana, { titulo: `Horas al año · ${h.nombre}`, alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [propias && _jsx("button", { type: "button", className: "boton sec", onClick: () => guardar(''), children: "Usar las del calendario" }), _jsx("button", { type: "button", className: "boton", onClick: () => guardar(v), children: "Guardar" })] }), children: [_jsxs("p", { className: "nota", style: { marginTop: 0 }, children: ["Las del calendario son ", cal.horas_anuales != null ? `${fmtH(cal.horas_anuales)} h` : 'ninguna todavía', ". Pon aqu\u00ED las suyas si son otras (por ejemplo, jornada parcial)."] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Sus horas al a\u00F1o" }), _jsx("input", { inputMode: "decimal", value: v, onChange: (e) => setV(e.target.value) })] }), error && _jsx("p", { className: "error", role: "alert", children: error })] }));
}
