import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSesion } from './nucleo/sesion';
import { VERSION } from './nucleo/supabase';
import { ponerEmpresaErrores } from './nucleo/errores';
import { moduloPorCodigo } from './nucleo/modulos';
import { Avisos, Icono, ICONOS, useRuta, Ventana } from './componentes/basicos';
import { Problema } from './componentes/Problema';
import { Entrar, NuevaClave } from './pantallas/Entrar';
import { ElegirEmpresa, Inicio, PantallaModulo } from './pantallas/Inicio';
import { IndiceConfiguracion, ListaCatalogo, useConfigurable } from './configuracion/Configuracion';
import { Usuarios } from './configuracion/Usuarios';
import { Salud } from './configuracion/Salud';
export function App() {
    const { estado, empresa, salir, recargar } = useSesion();
    const [ruta, ir] = useRuta();
    const [menu, setMenu] = useState(false);
    const [problema, setProblema] = useState(false);
    const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW();
    const configurable = useConfigurable();
    useEffect(() => { ponerEmpresaErrores(empresa?.id ?? null); }, [empresa]);
    let cuerpo;
    if (estado.fase === 'cargando')
        cuerpo = _jsx("main", { className: "cargando", "aria-busy": "true", children: "Cargando\u2026" });
    else if (estado.fase === 'fuera')
        cuerpo = _jsx(Entrar, {});
    else if (estado.fase === 'nueva-clave')
        cuerpo = _jsx(NuevaClave, { alTerminar: recargar });
    else if (estado.fase === 'error')
        cuerpo = (_jsx("main", { className: "contenido estrecho", children: _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsx("b", { children: "No se ha podido abrir la app." }) }), _jsx("p", { className: "nota", children: estado.mensaje }), _jsx("button", { type: "button", className: "boton", onClick: recargar, children: "Reintentar" })] }) }));
    else if (estado.fase === 'sin-alta')
        cuerpo = (_jsx("main", { className: "contenido estrecho", children: _jsxs("div", { className: "vacio", children: [_jsx("p", { children: _jsxs("b", { children: ["Has entrado como ", estado.correo, ", pero todav\u00EDa no tienes acceso a la app."] }) }), _jsx("p", { children: "Pide a tu administrador que te d\u00E9 de alta." }), _jsx("button", { type: "button", className: "boton sec", onClick: salir, children: "Salir" })] }) }));
    else if (!empresa)
        cuerpo = _jsx(ElegirEmpresa, {});
    else {
        const m = ruta.match(/^\/m\/([a-z]+)/);
        const cfg = ruta.match(/^\/config(?:\/([a-z_]+))?/);
        cuerpo = m ? _jsx(PantallaModulo, { codigo: m[1], ruta: ruta, ir: ir })
            : cfg ? (cfg[1] === 'usuarios' ? _jsx(Usuarios, { ir: ir }) : cfg[1] === 'salud' ? _jsx(Salud, { ir: ir }) : cfg[1] ? _jsx(ListaCatalogo, { tabla: cfg[1], ir: ir }, cfg[1]) : _jsx(IndiceConfiguracion, { ir: ir }))
                : _jsx(Inicio, { ir: ir, configurable: configurable });
    }
    const dentro = estado.fase === 'dentro';
    const modulo = moduloPorCodigo((ruta.match(/^\/m\/([a-z]+)/) ?? [])[1] ?? '');
    const enConfig = ruta.startsWith('/config');
    const sesion = estado.fase === 'dentro' ? estado.sesion : null;
    return (_jsxs(_Fragment, { children: [dentro && (_jsxs("header", { className: "cabecera", style: modulo ? { ['--area']: modulo.color } : undefined, children: [(modulo || enConfig) && _jsx("button", { type: "button", className: "boton-icono claro", "aria-label": "Volver al inicio", onClick: () => ir('/'), children: _jsx(Icono, { d: ICONOS.volver }) }), _jsxs("div", { className: "cabecera-txt", children: [_jsx("b", { children: modulo?.nombre ?? (enConfig ? 'Configuración' : empresa?.nombre ?? 'Gestión de fábrica') }), _jsx("small", { children: modulo || enConfig ? empresa?.nombre : new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) })] }), _jsx("button", { type: "button", className: "boton-icono claro", "aria-label": "Tengo un problema", onClick: () => setProblema(true), children: _jsx(Icono, { d: ICONOS.ayuda }) }), _jsx("button", { type: "button", className: "boton-icono claro", "aria-label": "Men\u00FA", onClick: () => setMenu(true), children: _jsx(Icono, { d: ICONOS.menu }) })] })), hayNueva && (_jsxs("div", { className: "banda-nueva", role: "status", children: ["Hay una versi\u00F3n nueva de la app.", _jsx("button", { type: "button", className: "boton peq", onClick: () => updateServiceWorker(true), children: "Actualizar" })] })), cuerpo, menu && sesion && (_jsxs(Ventana, { titulo: "Men\u00FA", alCerrar: () => setMenu(false), children: [_jsxs("p", { className: "menu-quien", children: [_jsx("b", { children: sesion.usuario?.nombre }), sesion.usuario?.superadmin && _jsx("small", { children: "Superadministrador" })] }), _jsxs("div", { className: "lista", children: [sesion.empresas.length > 1 && (_jsxs("button", { type: "button", className: "fila", onClick: () => { try {
                                    localStorage.removeItem('fabrica.empresa');
                                }
                                catch { /* */ } setMenu(false); location.hash = '/'; location.reload(); }, children: [_jsx("span", { className: "fila-icono", children: _jsx(Icono, { d: ICONOS.empresa }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: "Cambiar de unidad de trabajo" }), _jsxs("small", { children: ["Ahora: ", empresa?.nombre ?? '—'] })] })] })), configurable && (_jsxs("button", { type: "button", className: "fila", onClick: () => { setMenu(false); ir('/config'); }, children: [_jsx("span", { className: "fila-icono", children: _jsx(Icono, { d: ICONOS.ajustes }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: "Configuraci\u00F3n" }), _jsx("small", { children: "Naves, m\u00E1quinas, almacenes, art\u00EDculos, trabajadores\u2026" })] })] })), _jsxs("button", { type: "button", className: "fila", onClick: () => { setMenu(false); setProblema(true); }, children: [_jsx("span", { className: "fila-icono", children: _jsx(Icono, { d: ICONOS.ayuda }) }), _jsxs("span", { className: "fila-txt", children: [_jsx("b", { children: "Tengo un problema" }), _jsx("small", { children: "Avisa con todo lo necesario para arreglarlo" })] })] }), _jsxs("button", { type: "button", className: "fila", onClick: salir, children: [_jsx("span", { className: "fila-icono", children: _jsx(Icono, { d: ICONOS.salir }) }), _jsx("span", { className: "fila-txt", children: _jsx("b", { children: "Salir" }) })] })] }), _jsxs("p", { className: "nota centro", id: "version", children: ["Versi\u00F3n ", VERSION] })] })), problema && _jsx(Problema, { alCerrar: () => setProblema(false) }), _jsx(Avisos, {})] }));
}
