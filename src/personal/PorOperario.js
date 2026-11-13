import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { Anio, diaSemana, iso, Leyenda, periodo, personal, textoError } from './calendario';
const fmtH = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const num = (x) => (x.trim() === '' ? NaN : Number(x.replace(',', '.')));
const DIAS = [[1, 'L', 'lunes'], [2, 'M', 'martes'], [3, 'X', 'miércoles'], [4, 'J', 'jueves'], [5, 'V', 'viernes'], [6, 'S', 'sábado'], [0, 'D', 'domingo']];
/** Agrupa fechas sueltas en periodos seguidos. */
function periodos(fechas) {
    const dia = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) / 864e5; };
    const out = [];
    for (const f of [...fechas].sort()) {
        const ult = out[out.length - 1];
        if (ult && dia(f) - dia(ult.hasta) === 1)
            ult.hasta = f;
        else
            out.push({ desde: f, hasta: f });
    }
    return out;
}
/**
 * Calendario por operario: la lista de operarios con cómo van sus horas. Se elige uno (tocándolo) o varios
 * (marcándolos) y se abre el editor.
 */
export function PorOperario({ anio, cals, recargar }) {
    const { empresa, puede } = useSesion();
    const [personas, setPersonas] = useState(null);
    const [horas, setHoras] = useState([]);
    const [elegidos, setElegidos] = useState(new Set());
    const [editando, setEditando] = useState(null);
    const editable = puede('personal.calendario.editar');
    const cargar = useCallback(async () => {
        const { data } = await nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).is('baja', null).order('nombre');
        setPersonas((data ?? []));
        const hs = await Promise.all(cals.map((c) => personal().rpc('horas_personas', { p_calendario: c.id })));
        setHoras(hs.flatMap((r) => (r.data ?? [])));
    }, [empresa, cals]);
    useEffect(() => { cargar(); }, [cargar]);
    if (personas === null)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    if (editando) {
        return _jsx(Editor, { anio: anio, cals: cals, personas: personas.filter((p) => editando.includes(p.id)), alSalir: (guardado) => { setEditando(null); setElegidos(new Set()); if (guardado)
                recargar(); } });
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: editable ? 'Toca un operario para hacer su calendario, o marca varios para hacerles el mismo.' : 'Cómo van las horas de cada uno.' }), _jsx("div", { className: "lista", children: personas.map((p) => {
                    const cal = cals.find((c) => c.personas.includes(p.id));
                    const h = horas.find((x) => x.persona_id === p.id);
                    const dif = h && h.objetivo != null ? Math.round((h.horas - h.objetivo) * 100) / 100 : null;
                    return (_jsxs("div", { className: "fila fija centrada", children: [editable && _jsx("input", { type: "checkbox", className: "marca", "aria-label": `Elegir a ${p.nombre}`, checked: elegidos.has(p.id), onChange: () => setElegidos((s) => { const n = new Set(s); if (n.has(p.id))
                                    n.delete(p.id);
                                else
                                    n.add(p.id); return n; }) }), _jsxs("button", { type: "button", className: "fila-txt boton-fila", disabled: !editable, onClick: () => setEditando([p.id]), children: [_jsx("b", { children: p.nombre }), _jsx("small", { children: !cal ? `Sin calendario de ${anio}` : `${cal.nombre}${h ? ` · ${fmtH(h.horas)} h${h.objetivo != null ? ` de ${fmtH(h.objetivo)} h` : ''}` : ''}` })] }), _jsx("span", { className: 'chapa ' + (!cal ? 'sin' : dif === 0 ? 'firmado' : 'sin-cuadrar'), children: !cal ? 'Sin hacer' : dif === null ? 'Sin horas' : dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${fmtH(-dif)} h` : `Sobran ${fmtH(dif)} h` })] }, p.id));
                }) }), editable && elegidos.size > 0 && (_jsxs("div", { className: "barra-abajo no-imprimir", children: [_jsxs("span", { children: [_jsx("b", { children: elegidos.size }), " ", elegidos.size === 1 ? 'operario' : 'operarios'] }), _jsx("button", { type: "button", className: "boton txt", onClick: () => setElegidos(new Set()), children: "Quitar" }), _jsx("button", { type: "button", className: "boton", onClick: () => setEditando([...elegidos]), children: "Hacer su calendario" })] }))] }));
}
/** El editor: horas al año, tocar días, ponerles horas, festivos y vacaciones, y al final Guardar. */
function Editor({ anio, cals, personas, alSalir }) {
    const { empresa, puede } = useSesion();
    const ids = personas.map((p) => p.id);
    // si todos los elegidos (y solo ellos) comparten calendario, se cambia ese; si no, se hace uno nuevo partiendo del del primero
    const deUno = cals.find((c) => c.personas.includes(ids[0]));
    const mismo = deUno && ids.every((id) => deUno.personas.includes(id)) && deUno.personas.length === ids.length ? deUno : null;
    const [nombre, setNombre] = useState(mismo?.nombre ?? `${personas.length === 1 ? personas[0].nombre : `${personas[0].nombre} y ${personas.length - 1} más`} ${anio}`);
    const [anuales, setAnuales] = useState(deUno?.horas_anuales != null ? String(deUno.horas_anuales).replace('.', ',') : '');
    const [dias, setDias] = useState(null);
    const [vacs, setVacs] = useState([]);
    // vacaciones nuevas: los días tocados en modo Vacaciones (valen para todos los elegidos)
    const [nuevasVac, setNuevasVac] = useState(new Set());
    // el «pincel»: lo que se pone al tocar un día
    const [modo, setModo] = useState('horas');
    const [horasPincel, setHorasPincel] = useState('8');
    const [cambiado, setCambiado] = useState(false);
    const [rellenar, setRellenar] = useState(false);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const conVacaciones = puede('personal.vacaciones.editar');
    // cargar los días de partida (con las horas de un día normal si el calendario de partida las usaba por semana)
    useEffect(() => {
        (async () => {
            const m = new Map();
            if (deUno) {
                const { data } = await personal().from('dias').select('fecha, tipo, nombre, horario, horas').eq('calendario_id', deUno.id);
                const marcados = new Map((data ?? []).map((d) => [d.fecha, d]));
                const hd = deUno.horas_dia;
                for (let mes = 0; mes < 12; mes++)
                    for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
                        const f = iso(anio, mes, d), x = marcados.get(f), normal = hd?.[diaSemana(f)] ?? 0;
                        if (x && (x.tipo === 'festivo' || x.tipo === 'cierre' || x.tipo === 'descanso'))
                            m.set(f, { tipo: x.tipo, horas: null, nombre: x.nombre });
                        else if (x) {
                            const h = x.horas ?? normal;
                            if (h > 0)
                                m.set(f, { tipo: 'trabaja', horas: h, nombre: null });
                        }
                        else if (normal > 0)
                            m.set(f, { tipo: 'trabaja', horas: normal, nombre: null });
                    }
            }
            setDias(m);
            const { data: v } = await personal().from('vacaciones').select('id, persona_id, desde, hasta, nota').eq('empresa_id', empresa.id)
                .lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).in('persona_id', ids);
            setVacs((v ?? []));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const nuevasPeriodos = useMemo(() => periodos([...nuevasVac]), [nuevasVac]);
    const guardadaVac = (pid, f) => vacs.some((v) => v.persona_id === pid && v.desde <= f && f <= v.hasta);
    // vacaciones nuevas de cada uno: los días tocados que aún no tenía de vacaciones
    const nuevasDe = (pid) => periodos([...nuevasVac].filter((f) => !guardadaVac(pid, f))).map((r) => ({ persona_id: pid, ...r, nota: null }));
    const todasVac = useMemo(() => [...vacs, ...ids.flatMap(nuevasDe)], 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vacs, nuevasVac]);
    const deVac = (pid, f) => todasVac.some((v) => v.persona_id === pid && v.desde <= f && f <= v.hasta);
    const objetivo = num(anuales);
    const cuentas = useMemo(() => personas.map((p) => {
        let h = 0;
        dias?.forEach((d, f) => { if (d.tipo === 'trabaja' && d.horas && !deVac(p.id, f))
            h += d.horas; });
        return { p, horas: Math.round(h * 100) / 100 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [dias, todasVac, personas]);
    const iguales = cuentas.every((c) => c.horas === cuentas[0].horas);
    // tocar un día pone lo que haya en el pincel; si ya lo tenía, se quita. El contador se recalcula al momento.
    function tocar(f) {
        setError(null);
        if (modo === 'vacaciones') {
            if (ids.every((pid) => guardadaVac(pid, f)) && !nuevasVac.has(f)) {
                setError('Ese día ya estaba de vacaciones (guardado): se cambia en la pestaña Vacaciones.');
                return;
            }
            setNuevasVac((s) => { const n = new Set(s); if (n.has(f))
                n.delete(f);
            else
                n.add(f); return n; });
            setCambiado(true);
            return;
        }
        let h = 0;
        if (modo === 'horas') {
            h = num(horasPincel);
            if (Number.isNaN(h) || h <= 0 || h > 24) {
                setError('Escribe arriba las horas que quieres poner (entre 0 y 24).');
                return;
            }
        }
        setDias((d) => {
            const m = new Map(d), x = m.get(f);
            if (modo === 'horas') {
                if (x?.tipo === 'trabaja' && x.horas === h)
                    m.delete(f);
                else
                    m.set(f, { tipo: 'trabaja', horas: h, nombre: null });
            }
            else if (x?.tipo === 'festivo')
                m.delete(f);
            else
                m.set(f, { tipo: 'festivo', horas: null, nombre: null });
            return m;
        });
        setNuevasVac((s) => { if (!s.has(f))
            return s; const n = new Set(s); n.delete(f); return n; });
        setCambiado(true);
    }
    async function guardar() {
        if (!nombre.trim()) {
            setError('Ponle un nombre al calendario.');
            return;
        }
        if (Number.isNaN(objetivo) || objetivo < 0) {
            setError('Pon las horas que hay que trabajar al año.');
            return;
        }
        setOcupado(true);
        setError(null);
        const lista = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, d]) => ({ fecha, tipo: d.tipo, horas: d.horas, nombre: d.nombre }));
        const { error } = await personal().rpc('guardar_calendario', {
            p_empresa: empresa.id, p_anio: anio, p_calendario: mismo?.id ?? null, p_nombre: nombre.trim(), p_horas_anuales: objetivo,
            p_personas: ids, p_dias: lista, p_vacaciones: ids.flatMap(nuevasDe),
        });
        setOcupado(false);
        if (error) {
            setError(error.message.includes('duplicate') ? 'Ya hay otro calendario con ese nombre este año.' : textoError(error.message));
            return;
        }
        aviso('Calendario guardado');
        alSalir(true);
    }
    function salir() { if (!cambiado || confirm('Hay cambios sin guardar. ¿Salir sin guardar?'))
        alSalir(false); }
    // borrar el calendario que tiene ahora (con todos sus días); su gente se queda sin calendario de ese año
    async function borrar() {
        if (!deUno)
            return;
        const otros = deUno.personas.length - ids.filter((id) => deUno.personas.includes(id)).length;
        if (!confirm(`¿Borrar el calendario «${deUno.nombre}» con todos sus días?` + (otros > 0 ? ` También lo tienen ${otros} ${otros === 1 ? 'persona más' : 'personas más'}, que se quedarán sin calendario.` : '')
            + ' Las vacaciones no se borran.'))
            return;
        setOcupado(true);
        const { error } = await personal().from('calendarios').delete().eq('id', deUno.id);
        setOcupado(false);
        if (error) {
            setError(error.message.includes('foreign key') || error.message.includes('envios')
                ? 'No se puede borrar: ya se ha enviado a firmar a alguien. Los envíos y las firmas quedan guardados siempre.' : textoError(error.message));
            return;
        }
        aviso('Calendario borrado');
        alSalir(true);
    }
    if (!dias)
        return _jsx("p", { className: "nota", children: "Cargando\u2026" });
    const horasMap = new Map([...dias].filter(([, d]) => d.tipo === 'trabaja' && d.horas != null).map(([f, d]) => [f, d.horas]));
    const especiales = [...dias].filter(([, d]) => d.tipo !== 'trabaja').map(([f, d]) => ({ fecha: f, tipo: d.tipo, nombre: d.nombre, horario: null }));
    // en verde, los días que están de vacaciones todos los elegidos
    const vacTodos = [];
    for (let mes = 0; mes < 12; mes++)
        for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
            const f = iso(anio, mes, d);
            if (ids.every((pid) => deVac(pid, f)))
                vacTodos.push({ desde: f, hasta: f, nota: null });
        }
    const resumen = (h) => {
        if (Number.isNaN(objetivo))
            return _jsxs(_Fragment, { children: [fmtH(h), " h"] });
        const dif = Math.round((h - objetivo) * 100) / 100;
        return _jsxs(_Fragment, { children: [fmtH(h), " h de ", fmtH(objetivo), " h \u00B7 ", _jsx("b", { className: dif === 0 ? 'bien' : 'mal', children: dif === 0 ? 'Cuadra al 100 %' : dif < 0 ? `faltan ${fmtH(-dif)} h` : `sobran ${fmtH(dif)} h` })] });
    };
    return (_jsxs("div", { className: "editor-cal", children: [_jsx("button", { type: "button", className: "boton txt volver", onClick: salir, children: "\u2039 Operarios" }), _jsxs("h2", { className: "titulo", style: { margin: '0 0 4px' }, children: ["Calendario ", anio] }), _jsxs("p", { className: "nota", style: { margin: '0 0 12px' }, children: [personas.map((p) => p.nombre).join(', '), !mismo && deUno ? ` · se parte del calendario «${deUno.nombre}»` : ''] }), _jsxs("div", { className: "dos", children: [_jsxs("label", { className: "campo", children: [_jsx("span", { children: "Horas al a\u00F1o" }), _jsx("input", { inputMode: "decimal", value: anuales, placeholder: "Por ejemplo: 1712", onChange: (e) => { setAnuales(e.target.value); setCambiado(true); } })] }), _jsxs("label", { className: "campo", children: [_jsx("span", { children: "Nombre del calendario" }), _jsx("input", { value: nombre, maxLength: 80, onChange: (e) => { setNombre(e.target.value); setCambiado(true); } })] })] }), _jsxs("div", { className: "pegado", children: [_jsx("div", { className: "contador", role: "status", "aria-label": "Horas que llevas", children: iguales ? _jsxs("span", { children: ["Llevas ", resumen(cuentas[0].horas)] })
                            : cuentas.map((c) => _jsxs("span", { children: [c.p.nombre.split(' ')[0], ": ", resumen(c.horas)] }, c.p.id)) }), _jsxs("div", { className: "pincel", role: "group", "aria-label": "Al tocar un d\u00EDa se pone", children: [_jsx("span", { children: "Al tocar:" }), _jsxs("label", { className: 'pincel-horas' + (modo === 'horas' ? ' sel' : ''), onClick: () => setModo('horas'), children: [_jsx("input", { inputMode: "decimal", "aria-label": "Horas que se ponen al tocar un d\u00EDa", value: horasPincel, onFocus: () => setModo('horas'), onChange: (e) => { setHorasPincel(e.target.value); setModo('horas'); } }), " h"] }), _jsx("button", { type: "button", "aria-pressed": modo === 'festivo', onClick: () => setModo('festivo'), children: "Festivo" }), conVacaciones && _jsx("button", { type: "button", "aria-pressed": modo === 'vacaciones', onClick: () => setModo('vacaciones'), children: "Vacaciones" })] })] }), _jsxs("div", { className: "botonera", style: { justifyContent: 'flex-start', margin: '0 0 10px' }, children: [_jsx("button", { type: "button", className: "boton sec peq", onClick: () => setRellenar(true), children: "Rellenar por d\u00EDas de la semana" }), deUno && _jsxs("button", { type: "button", className: "boton txt peq peligro", disabled: ocupado, onClick: borrar, children: ["Borrar el calendario \u00AB", deUno.nombre, "\u00BB"] }), _jsx("button", { type: "button", className: "boton txt peq", onClick: () => { if (confirm('¿Borrar todos los días de este calendario?')) {
                            setDias(new Map());
                            setCambiado(true);
                        } }, children: "Borrar todo" })] }), _jsxs("p", { className: "nota", style: { margin: '0 0 8px' }, children: ["Elige arriba qu\u00E9 poner (unas horas, festivo", conVacaciones ? ' o vacaciones' : '', ") y toca los d\u00EDas: se suma al momento. Tocar otra vez lo quita."] }), _jsx(Leyenda, { conHoras: true, sinTipos: true }), _jsx(Anio, { anio: anio, dias: especiales, vacaciones: vacTodos, diasEquipo: [], horas: horasMap, elegidos: new Set(), alTocar: tocar }), nuevasPeriodos.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { className: "subtitulo", children: "Vacaciones nuevas (se guardan al pulsar Guardar)" }), _jsx("ul", { className: "lista-dias", children: nuevasPeriodos.map((r) => _jsxs("li", { children: [_jsx("i", { className: "t-vacaciones" }), _jsx("span", { children: periodo(r) })] }, r.desde)) })] }), error && _jsx("p", { className: "error", role: "alert", children: error }), _jsxs("div", { className: "barra-abajo no-imprimir", children: [_jsx("button", { type: "button", className: "boton sec", onClick: salir, children: "Salir" }), _jsx("button", { type: "button", className: "boton", disabled: ocupado, onClick: guardar, children: "Guardar" })] }), rellenar && _jsx(Rellenar, { anio: anio, dias: dias, alCerrar: () => setRellenar(false), alAplicar: (m) => { setDias(m); setCambiado(true); setRellenar(false); } })] }));
}
/** Rellenar todo el año según el día de la semana (sin tocar los días que ya tienen algo). */
function Rellenar({ anio, dias, alCerrar, alAplicar }) {
    const [h, setH] = useState(['', '8', '8', '8', '8', '6', '']);
    const [pisar, setPisar] = useState(false);
    function aplicar() {
        const hs = h.map((x) => (x.trim() === '' ? 0 : num(x)));
        if (hs.some((x) => Number.isNaN(x) || x < 0 || x > 24))
            return;
        const m = new Map(dias);
        for (let mes = 0; mes < 12; mes++)
            for (let d = 1; d <= new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); d++) {
                const f = iso(anio, mes, d), x = hs[diaSemana(f)];
                const actual = m.get(f);
                if (actual && !pisar)
                    continue;
                if (actual && actual.tipo !== 'trabaja')
                    continue; // los festivos no se pisan nunca
                if (x > 0)
                    m.set(f, { tipo: 'trabaja', horas: x, nombre: null });
                else if (pisar)
                    m.delete(f);
            }
        alAplicar(m);
    }
    return (_jsxs(Ventana, { titulo: "Rellenar por d\u00EDas de la semana", alCerrar: alCerrar, pie: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "boton sec", onClick: alCerrar, children: "Cancelar" }), _jsx("button", { type: "button", className: "boton", onClick: aplicar, children: "Rellenar" })] }), children: [_jsx("p", { className: "nota", style: { marginTop: 0 }, children: "Pone estas horas a todos los d\u00EDas del a\u00F1o seg\u00FAn el d\u00EDa de la semana. Luego cambias a mano los que sean distintos. Los festivos no se tocan." }), _jsx("div", { className: "horas-semana", role: "group", "aria-label": "Horas por d\u00EDa de la semana", children: DIAS.map(([d, l, n]) => _jsxs("label", { children: [_jsx("small", { children: l }), _jsx("input", { inputMode: "decimal", "aria-label": `Horas del ${n}`, value: h[d], onChange: (e) => setH((x) => x.map((y, i) => (i === d ? e.target.value : y))) })] }, d)) }), _jsxs("label", { className: "check", style: { marginTop: 10 }, children: [_jsx("input", { type: "checkbox", checked: pisar, onChange: (e) => setPisar(e.target.checked) }), "Cambiar tambi\u00E9n los d\u00EDas que ya tienen horas"] })] }));
}
