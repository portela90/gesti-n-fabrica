import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { supabase } from '../nucleo/supabase';
/** Tablas y funciones de Personal (esquema «personal»). */
export const personal = () => supabase.schema('personal');
export const TIPOS = [
    { tipo: 'festivo', nombre: 'Festivo', ayuda: 'No se trabaja' },
    { tipo: 'cierre', nombre: 'Cierre de fábrica', ayuda: 'La fábrica cierra' },
    { tipo: 'intensiva', nombre: 'Jornada intensiva', ayuda: 'Horario reducido' },
    { tipo: 'especial', nombre: 'Horario especial', ayuda: 'Otro horario ese día' },
    { tipo: 'trabaja', nombre: 'Trabaja', ayuda: 'Día de trabajo aunque no sea de su equipo (p. ej. un lunes del fin de semana)' },
    { tipo: 'descanso', nombre: 'Descanso', ayuda: 'No trabaja aunque sea un día de su equipo' },
];
export const nombreTipo = (t) => TIPOS.find((x) => x.tipo === t)?.nombre ?? t;
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
/** Fecha «aaaa-mm-dd» sin líos de zona horaria. */
export const iso = (a, m, d) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const fechaCorta = (f) => { const [a, m, d] = f.split('-').map(Number); return `${d}/${m}/${a}`; };
export const fechaLarga = (f) => { const [, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1].toLowerCase()}`; };
export const diaSemana = (f) => { const [a, m, d] = f.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
export const diasEntre = (desde, hasta) => {
    const [a1, m1, d1] = desde.split('-').map(Number), [a2, m2, d2] = hasta.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 864e5) + 1;
};
export const periodo = (v) => v.desde === v.hasta ? fechaCorta(v.desde) : `${fechaCorta(v.desde)} – ${fechaCorta(v.hasta)} · ${diasEntre(v.desde, v.hasta)} días`;
/**
 * El año entero, mes a mes. Colores por tipo de día; vacaciones en verde; los días que el equipo no trabaja,
 * apagados. Si se pasa «alTocar», los días se pueden elegir.
 */
export function Anio({ anio, dias, vacaciones = [], diasEquipo, elegidos, alTocar, horas }) {
    const porFecha = new Map(dias.map((d) => [d.fecha, d]));
    const deVacaciones = (f) => vacaciones.some((v) => v.desde <= f && f <= v.hasta);
    return (_jsx("div", { className: "anio", children: MESES.map((mes, m) => {
            const hueco = (new Date(Date.UTC(anio, m, 1)).getUTCDay() + 6) % 7;
            const total = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
            return (_jsxs("section", { className: "mes", "aria-label": `${mes} ${anio}`, children: [_jsx("h3", { children: mes }), _jsxs("div", { className: "mes-dias", children: [SEMANA.map((s) => _jsx("span", { className: "mes-sem", "aria-hidden": "true", children: s }, s)), Array.from({ length: hueco }, (_, i) => _jsx("span", {}, 'h' + i)), Array.from({ length: total }, (_, i) => {
                                const f = iso(anio, m, i + 1);
                                const d = porFecha.get(f);
                                const h = horas?.get(f);
                                const vac = deVacaciones(f);
                                const libre = h == null && diasEquipo && !diasEquipo.includes(diaSemana(f));
                                const clase = ['dia', d ? 't-' + d.tipo : vac ? 't-vacaciones' : h != null ? 'con-horas' : '', libre ? 'libre' : '', elegidos?.has(f) ? 'elegido' : ''].join(' ');
                                const hTxt = h != null ? String(h).replace('.', ',') : '';
                                const titulo = [fechaLarga(f), d && (d.nombre || nombreTipo(d.tipo)), h != null && `${hTxt} h`, d?.horario, vac && 'Vacaciones'].filter(Boolean).join(' · ');
                                const dentro = h != null ? _jsxs(_Fragment, { children: [_jsx("span", { children: i + 1 }), _jsx("small", { children: hTxt })] }) : i + 1;
                                return alTocar
                                    ? _jsx("button", { type: "button", className: clase, title: titulo, "aria-label": titulo, "aria-pressed": elegidos?.has(f) ?? false, onClick: () => alTocar(f), children: dentro }, f)
                                    : _jsx("span", { className: clase, title: titulo, children: dentro }, f);
                            })] })] }, mes));
        }) }));
}
export function Leyenda({ conVacaciones = true, conHoras = false, sinTipos = false }) {
    return (_jsxs("div", { className: "leyenda", children: [TIPOS.filter((t) => !sinTipos || t.tipo === 'festivo' || t.tipo === 'cierre').map((t) => _jsxs("span", { children: [_jsx("i", { className: 't-' + t.tipo }), t.nombre] }, t.tipo)), conVacaciones && _jsxs("span", { children: [_jsx("i", { className: "t-vacaciones" }), "Vacaciones"] }), conHoras && _jsxs("span", { children: [_jsx("i", { className: "con-horas" }), "D\u00EDa de trabajo (con sus horas)"] }), _jsxs("span", { children: [_jsx("i", { className: "libre" }), "No trabaja"] })] }));
}
/** Lista de los días marcados (para leerlos sin tener que mirar los colores). */
export function ListaDias({ dias: todos }) {
    // los días de trabajo con sus horas no se listan uno a uno (pueden ser 250): se resumen
    const trabajo = todos.filter((d) => d.tipo === 'trabaja' && d.horas != null);
    const dias = todos.filter((d) => !(d.tipo === 'trabaja' && d.horas != null));
    const suma = trabajo.reduce((n, d) => n + Number(d.horas), 0);
    if (!todos.length)
        return _jsx("p", { className: "nota", children: "No hay d\u00EDas marcados." });
    return (_jsxs("ul", { className: "lista-dias", children: [trabajo.length > 0 && _jsxs("li", { children: [_jsx("i", { className: "con-horas", "aria-hidden": "true" }), _jsxs("b", { children: [trabajo.length, " d\u00EDas de trabajo"] }), _jsxs("span", { children: [suma.toLocaleString('es-ES', { maximumFractionDigits: 2 }), " h en total (las horas de cada d\u00EDa se ven en el calendario)"] })] }), dias.map((d) => (_jsxs("li", { children: [_jsx("i", { className: 't-' + d.tipo, "aria-hidden": "true" }), _jsx("b", { children: fechaCorta(d.fecha) }), _jsxs("span", { children: [d.nombre || nombreTipo(d.tipo), d.horas != null ? ` · ${String(d.horas).replace('.', ',')} h` : '', d.horario ? ` · ${d.horario}` : ''] })] }, d.fecha)))] }));
}
/** Mensajes de error de la base de datos, en cristiano. */
export function textoError(m) {
    const c = {
        NO_PERMISO: 'No tienes permiso para hacer esto.',
        YA_FIRMADO: 'Ya está firmado.',
        ANULADO: 'Este envío se anuló; habrá uno más nuevo.',
        FALTA_COMENTARIO: 'Si no estás conforme, explica por qué.',
        FIRMA_MAL: 'Falta la firma.',
        MISMO_EQUIPO: 'Elige otro equipo.',
        DEMASIADAS: 'Son demasiados días de golpe.',
    };
    const k = Object.keys(c).find((x) => m.includes(x));
    return k ? c[k] : m;
}
