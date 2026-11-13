import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSesion } from '../nucleo/sesion';
import { MODULOS, moduloPorCodigo } from '../nucleo/modulos';
import { Icono, ICONOS } from '../componentes/basicos';
import { Personal } from '../personal/Personal';
import { Prevencion } from '../prevencion/Prevencion';
/** Elegir unidad de trabajo (en la base de datos, «empresa»): solo si tiene más de una y aún no ha elegido. */
export function ElegirEmpresa() {
    const { estado, elegirEmpresa } = useSesion();
    if (estado.fase !== 'dentro')
        return null;
    return (_jsxs("main", { className: "contenido estrecho", children: [_jsx("h1", { className: "titulo", children: "\u00BFEn qu\u00E9 unidad de trabajo vas a trabajar?" }), _jsx("div", { className: "lista", children: estado.sesion.empresas.map((e) => (_jsxs("button", { type: "button", className: "fila", onClick: () => elegirEmpresa(e.id), children: [_jsx("span", { className: "fila-icono", children: _jsx(Icono, { d: ICONOS.empresa }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: e.nombre }), _jsxs("small", { children: [e.modulos.length, " ", e.modulos.length === 1 ? 'módulo' : 'módulos'] })] }), _jsx("span", { className: "fila-flecha", "aria-hidden": "true", children: "\u203A" })] }, e.id))) })] }));
}
/** Inicio: los módulos que esta persona puede usar en esta unidad de trabajo (lo decide la base de datos). */
export function Inicio({ ir, configurable }) {
    const { estado, empresa } = useSesion();
    if (estado.fase !== 'dentro' || !empresa)
        return null;
    const mios = MODULOS.filter((m) => empresa.modulos.includes(m.codigo));
    const nombre = estado.sesion.usuario?.nombre.split(' ')[0] ?? '';
    return (_jsxs("main", { className: "contenido", children: [_jsxs("h1", { className: "titulo", children: ["Hola, ", nombre] }), mios.length === 0 && !configurable ? (_jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsxs("b", { children: ["Todav\u00EDa no tienes ning\u00FAn m\u00F3dulo en ", empresa.nombre, "."] }) }), _jsx("p", { children: "Los m\u00F3dulos se ir\u00E1n encendiendo seg\u00FAn avance el plan. Si crees que deber\u00EDas ver alguno, p\u00EDdeselo a tu administrador." })] })) : (_jsxs("div", { className: "mosaicos", children: [mios.map((m) => (_jsxs("button", { type: "button", className: "mosaico", style: { ['--area']: m.color }, onClick: () => ir(`/m/${m.codigo}`), children: [_jsx("span", { className: "mosaico-icono", children: _jsx(Icono, { d: m.icono, tam: 26 }) }), _jsx("b", { children: m.nombre }), _jsx("small", { children: m.descripcion })] }, m.codigo))), configurable && (_jsxs("button", { type: "button", className: "mosaico", style: { ['--area']: '#64748b' }, onClick: () => ir('/config'), children: [_jsx("span", { className: "mosaico-icono", children: _jsx(Icono, { d: ICONOS.ajustes, tam: 26 }) }), _jsx("b", { children: "Configuraci\u00F3n" }), _jsx("small", { children: "Naves, m\u00E1quinas, almacenes, art\u00EDculos, trabajadores\u2026" })] }))] }))] }));
}
/** Pantalla de un módulo (mientras no llega, dice en qué fase llega). */
export function PantallaModulo({ codigo, ruta, ir }) {
    const { empresa } = useSesion();
    const m = moduloPorCodigo(codigo);
    if (!m || !empresa?.modulos.includes(codigo)) {
        return (_jsx("main", { className: "contenido estrecho", children: _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsx("b", { children: "No tienes acceso a esta pantalla." }) }), _jsx("button", { type: "button", className: "boton", onClick: () => ir('/'), children: "Ir al inicio" })] }) }));
    }
    if (codigo === 'personal')
        return _jsx(Personal, { ruta: ruta, ir: ir });
    if (codigo === 'prevencion')
        return _jsx(Prevencion, { ruta: ruta, ir: ir });
    return (_jsxs("main", { className: "contenido estrecho", style: { ['--area']: m.color }, children: [_jsxs("h1", { className: "titulo con-icono", children: [_jsx("span", { className: "mosaico-icono", children: _jsx(Icono, { d: m.icono }) }), m.nombre] }), _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsxs("b", { children: ["Este m\u00F3dulo llega en la Fase ", m.fase, "."] }) }), _jsx("p", { children: "Mientras tanto se sigue usando la app de ahora. Cuando est\u00E9 listo, se pasar\u00E1n sus datos y se avisar\u00E1." })] })] }));
}
