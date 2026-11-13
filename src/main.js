import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProveedorSesion } from './nucleo/sesion';
import { vigilarErrores } from './nucleo/errores';
import { App } from './App';
import './estilos.css';
vigilarErrores();
createRoot(document.getElementById('raiz')).render(_jsx(StrictMode, { children: _jsx(ProveedorSesion, { children: _jsx(App, {}) }) }));
