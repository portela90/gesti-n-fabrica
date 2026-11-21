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
import { Lateral, nombreApartado } from './pantallas/Lateral';
import { IndiceConfiguracion, ListaCatalogo, useConfigurable } from './configuracion/Configuracion';
import { Usuarios } from './configuracion/Usuarios';
import { Salud } from './configuracion/Salud';

export function App() {
  const { estado, empresa, salir, recargar, puede } = useSesion();
  const [ruta, ir] = useRuta();
  const [menu, setMenu] = useState(false);          // «Tu cuenta»
  const [lateral, setLateral] = useState(false);    // el menú lateral en el móvil
  const [problema, setProblema] = useState(false);
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW();
  const configurable = useConfigurable();

  useEffect(() => { ponerEmpresaErrores(empresa?.id ?? null); }, [empresa]);

  let cuerpo;
  if (estado.fase === 'cargando') cuerpo = <main className="cargando" aria-busy="true">Cargando…</main>;
  else if (estado.fase === 'fuera') cuerpo = <Entrar />;
  else if (estado.fase === 'nueva-clave') cuerpo = <NuevaClave alTerminar={recargar} />;
  else if (estado.fase === 'error') cuerpo = (
    <main className="contenido estrecho"><div className="vacio">
      <p><b>No se ha podido abrir la app.</b></p><p className="nota">{estado.mensaje}</p>
      <button type="button" className="boton" onClick={recargar}>Reintentar</button>
    </div></main>);
  else if (estado.fase === 'sin-alta') cuerpo = (
    <main className="contenido estrecho"><div className="vacio">
      <p><b>Has entrado como {estado.correo}, pero todavía no tienes acceso a la app.</b></p>
      <p>Pide a tu administrador que te dé de alta.</p>
      <button type="button" className="boton sec" onClick={salir}>Salir</button>
    </div></main>);
  else if (!empresa) cuerpo = <ElegirEmpresa />;
  else {
    const m = ruta.match(/^\/m\/([a-z]+)/);
    const cfg = ruta.match(/^\/config(?:\/([a-z_]+))?/);
    cuerpo = m ? <PantallaModulo codigo={m[1]} ruta={ruta} ir={ir} />
      : cfg ? (cfg[1] === 'usuarios' ? <Usuarios ir={ir} /> : cfg[1] === 'salud' ? <Salud ir={ir} /> : cfg[1] ? <ListaCatalogo key={cfg[1]} tabla={cfg[1]} ir={ir} /> : <IndiceConfiguracion ir={ir} />)
      : <Inicio ir={ir} configurable={configurable} />;
  }

  const dentro = estado.fase === 'dentro';
  const modulo = moduloPorCodigo((ruta.match(/^\/m\/([a-z]+)/) ?? [])[1] ?? '');
  const enConfig = ruta.startsWith('/config');
  const sesion = estado.fase === 'dentro' ? estado.sesion : null;

  const conLateral = dentro && !!empresa;
  const apartado = conLateral ? nombreApartado(ruta, puede) : null;
  const cabecera = dentro && (
    <header className="cabecera" style={modulo ? { ['--area' as string]: modulo.color } : undefined}>
      {/* en el móvil, ≡ abre el menú lateral; sin unidad elegida (no hay menú lateral), abre «Tu cuenta» */}
      <button type="button" className={'boton-icono' + (conLateral ? ' solo-movil' : '')} aria-label="Menú"
        onClick={() => (conLateral ? setLateral(true) : setMenu(true))}><Icono d={ICONOS.menu} /></button>
      <div className="cabecera-txt">
        <b>{apartado ?? modulo?.nombre ?? (enConfig ? 'Configuración' : empresa?.nombre ?? 'Gestión de fábrica')}</b>
        <small>{apartado ? `${modulo?.nombre} · ${empresa?.nombre}` : modulo || enConfig ? empresa?.nombre : new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</small>
      </div>
      <button type="button" className="boton-icono" aria-label="Tengo un problema" onClick={() => setProblema(true)}><Icono d={ICONOS.ayuda} /></button>
    </header>
  );
  const banda = hayNueva && (
    <div className="banda-nueva" role="status">
      Hay una versión nueva de la app.
      <button type="button" className="boton peq" onClick={() => updateServiceWorker(true)}>Actualizar</button>
    </div>
  );

  return (
    <>
      {conLateral ? (
        <div className="marco">
          <Lateral ruta={ruta} ir={ir} abierto={lateral} alCerrar={() => setLateral(false)} configurable={!!configurable}
            alCuenta={() => setMenu(true)} alProblema={() => setProblema(true)} />
          <div className="marco-cuerpo">{cabecera}{banda}{cuerpo}</div>
        </div>
      ) : (<>{cabecera}{banda}{cuerpo}</>)}
      {menu && sesion && (
        <Ventana titulo="Tu cuenta" alCerrar={() => setMenu(false)}>
          <p className="menu-quien"><b>{sesion.usuario?.nombre}</b>{sesion.usuario?.superadmin && <small>Superadministrador</small>}</p>
          <div className="lista">
            {sesion.empresas.length > 1 && (
              <button type="button" className="fila" onClick={() => { try { localStorage.removeItem('fabrica.empresa'); } catch { /* */ } setMenu(false); location.hash = '/'; location.reload(); }}>
                <span className="fila-icono"><Icono d={ICONOS.empresa} /></span><span className="fila-txt"><b>Cambiar de unidad de trabajo</b><small>Ahora: {empresa?.nombre ?? '—'}</small></span>
              </button>
            )}
            {configurable && (
              <button type="button" className="fila" onClick={() => { setMenu(false); ir('/config'); }}>
                <span className="fila-icono"><Icono d={ICONOS.ajustes} /></span><span className="fila-txt"><b>Configuración</b><small>Naves, máquinas, almacenes, artículos, trabajadores…</small></span>
              </button>
            )}
            <button type="button" className="fila" onClick={() => { setMenu(false); setProblema(true); }}>
              <span className="fila-icono"><Icono d={ICONOS.ayuda} /></span><span className="fila-txt"><b>Tengo un problema</b><small>Avisa con todo lo necesario para arreglarlo</small></span>
            </button>
            <button type="button" className="fila" onClick={salir}>
              <span className="fila-icono"><Icono d={ICONOS.salir} /></span><span className="fila-txt"><b>Salir</b></span>
            </button>
          </div>
          <p className="nota centro" id="version">Versión {VERSION}</p>
        </Ventana>
      )}
      {problema && <Problema alCerrar={() => setProblema(false)} />}
      <Avisos />
    </>
  );
}
