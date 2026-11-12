import { useSesion } from '../nucleo/sesion';
import { MODULOS, moduloPorCodigo } from '../nucleo/modulos';
import { Icono, ICONOS } from '../componentes/basicos';
import { Personal } from '../personal/Personal';

/** Elegir unidad de trabajo (en la base de datos, «empresa»): solo si tiene más de una y aún no ha elegido. */
export function ElegirEmpresa() {
  const { estado, elegirEmpresa } = useSesion();
  if (estado.fase !== 'dentro') return null;
  return (
    <main className="contenido estrecho">
      <h1 className="titulo">¿En qué unidad de trabajo vas a trabajar?</h1>
      <div className="lista">
        {estado.sesion.empresas.map((e) => (
          <button key={e.id} type="button" className="fila" onClick={() => elegirEmpresa(e.id)}>
            <span className="fila-icono"><Icono d={ICONOS.empresa} /></span>
            <span className="fila-txt"><b>{e.nombre}</b><small>{e.modulos.length} {e.modulos.length === 1 ? 'módulo' : 'módulos'}</small></span>
            <span className="fila-flecha" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </main>
  );
}

/** Inicio: los módulos que esta persona puede usar en esta unidad de trabajo (lo decide la base de datos). */
export function Inicio({ ir, configurable }: { ir: (r: string) => void; configurable?: boolean }) {
  const { estado, empresa } = useSesion();
  if (estado.fase !== 'dentro' || !empresa) return null;
  const mios = MODULOS.filter((m) => empresa.modulos.includes(m.codigo));
  const nombre = estado.sesion.usuario?.nombre.split(' ')[0] ?? '';
  return (
    <main className="contenido">
      <h1 className="titulo">Hola, {nombre}</h1>
      {mios.length === 0 && !configurable ? (
        <div className="vacio">
          <p><b>Todavía no tienes ningún módulo en {empresa.nombre}.</b></p>
          <p>Los módulos se irán encendiendo según avance el plan. Si crees que deberías ver alguno, pídeselo a tu administrador.</p>
        </div>
      ) : (
        <div className="mosaicos">
          {mios.map((m) => (
            <button key={m.codigo} type="button" className="mosaico" style={{ ['--area' as string]: m.color }} onClick={() => ir(`/m/${m.codigo}`)}>
              <span className="mosaico-icono"><Icono d={m.icono} tam={26} /></span>
              <b>{m.nombre}</b>
              <small>{m.descripcion}</small>
            </button>
          ))}
          {configurable && (
            <button type="button" className="mosaico" style={{ ['--area' as string]: '#64748b' }} onClick={() => ir('/config')}>
              <span className="mosaico-icono"><Icono d={ICONOS.ajustes} tam={26} /></span>
              <b>Configuración</b>
              <small>Naves, máquinas, almacenes, artículos, trabajadores…</small>
            </button>
          )}
        </div>
      )}
    </main>
  );
}

/** Pantalla de un módulo (mientras no llega, dice en qué fase llega). */
export function PantallaModulo({ codigo, ruta, ir }: { codigo: string; ruta: string; ir: (r: string) => void }) {
  const { empresa } = useSesion();
  const m = moduloPorCodigo(codigo);
  if (!m || !empresa?.modulos.includes(codigo)) {
    return (
      <main className="contenido estrecho">
        <div className="vacio"><p><b>No tienes acceso a esta pantalla.</b></p>
          <button type="button" className="boton" onClick={() => ir('/')}>Ir al inicio</button></div>
      </main>
    );
  }
  if (codigo === 'personal') return <Personal ruta={ruta} ir={ir} />;
  return (
    <main className="contenido estrecho" style={{ ['--area' as string]: m.color }}>
      <h1 className="titulo con-icono"><span className="mosaico-icono"><Icono d={m.icono} /></span>{m.nombre}</h1>
      <div className="vacio">
        <p><b>Este módulo llega en la Fase {m.fase}.</b></p>
        <p>Mientras tanto se sigue usando la app de ahora. Cuando esté listo, se pasarán sus datos y se avisará.</p>
      </div>
    </main>
  );
}
