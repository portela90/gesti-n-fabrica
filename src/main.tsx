import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProveedorSesion } from './nucleo/sesion';
import { vigilarErrores } from './nucleo/errores';
import { App } from './App';
import './estilos.css';

vigilarErrores();
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProveedorSesion>
      <App />
    </ProveedorSesion>
  </StrictMode>,
);
