// Menú lateral (aspecto «Pizarra», decidido por Cristian el 21/11): Inicio, los módulos que puede usar cada uno y, debajo del
// módulo abierto, sus apartados (las pestañas de antes); Configuración; y al pie «Tu cuenta» y «Tengo un problema».
// En el ordenador está siempre a la vista; en el móvil se abre con ≡ y se cierra al elegir.
import { useSesion } from '../nucleo/sesion';
import { MODULOS } from '../nucleo/modulos';
import { Icono, ICONOS } from '../componentes/basicos';
import { apartadosLimpieza } from '../limpieza/Limpieza';
import { apartadosPersonal } from '../personal/Personal';
import { apartadosPrevencion } from '../prevencion/Prevencion';

const APARTADOS: Record<string, (puede: (p: string) => boolean) => [string, string][]> = {
  limpieza: apartadosLimpieza, personal: apartadosPersonal, prevencion: apartadosPrevencion,
};
/** El apartado que abre cada módulo si la ruta no dice ninguno (lo mismo que hace cada módulo). */
const INICIAL: Record<string, (aps: [string, string][]) => string | undefined> = {
  limpieza: (aps) => aps[0]?.[0],
  personal: (aps) => (aps.some(([c]) => c === 'calendario') ? 'calendario' : 'mio'),
  prevencion: (aps) => (aps.length > 1 ? 'charlas' : 'mias'),
};
/** El apartado abierto de un módulo: el de la ruta o, si no dice ninguno, el de partida. */
function apartadoAbierto(mod: string, ap: string, aps: [string, string][]) {
  return aps.find(([c]) => c === ap)?.[0] ?? INICIAL[mod]?.(aps) ?? null;
}

/** El nombre del apartado abierto («Resumen», «Hoy del equipo»…), para el título de arriba. */
export function nombreApartado(ruta: string, puede: (p: string) => boolean) {
  const [, m, mod, ap] = ruta.split('/');
  if (m !== 'm' || !APARTADOS[mod]) return null;
  const aps = APARTADOS[mod](puede);
  if (aps.length < 2) return null;
  const c = apartadoAbierto(mod, ap ?? '', aps);
  return aps.find(([x]) => x === c)?.[1] ?? null;
}

export function Lateral({ ruta, ir, abierto, alCerrar, configurable, alCuenta, alProblema }: {
  ruta: string; ir: (r: string) => void; abierto: boolean; alCerrar: () => void; configurable: boolean; alCuenta: () => void; alProblema: () => void;
}) {
  const { estado, empresa, puede } = useSesion();
  if (estado.fase !== 'dentro' || !empresa) return null;
  const partes = ruta.split('/');
  const modAbierto = partes[1] === 'm' ? partes[2] : null, apAbierto = partes[3] ?? '';
  const enInicio = ruta === '/' || ruta === '', enConfig = ruta.startsWith('/config');
  const mios = MODULOS.filter((m) => empresa.modulos.includes(m.codigo));
  const vamos = (r: string) => { alCerrar(); ir(r); };
  return (
    <>
      {abierto && <div className="lateral-velo" aria-hidden="true" onClick={alCerrar} />}
      <aside className={'lateral' + (abierto ? ' abierto' : '')} aria-label="Menú">
        <div className="lateral-unidad">
          <b>{empresa.nombre}</b><small>unidad de trabajo</small>
          <button type="button" className="boton-icono lateral-cerrar" aria-label="Cerrar el menú" onClick={alCerrar}><Icono d={ICONOS.cerrar} /></button>
        </div>
        <nav className="lateral-nav" aria-label="Módulos">
          <button type="button" className={'lateral-item' + (enInicio ? ' activo' : '')} aria-current={enInicio ? 'page' : undefined} onClick={() => vamos('/')}>
            <Icono d={ICONOS.inicio} tam={18} /><span>Inicio</span></button>
          {mios.map((m) => {
            const abiertoM = modAbierto === m.codigo;
            const aps = APARTADOS[m.codigo]?.(puede) ?? [];
            const apActual = abiertoM ? apartadoAbierto(m.codigo, apAbierto, aps) : null;
            return (
              <div key={m.codigo}>
                <button type="button" className={'lateral-item' + (abiertoM ? ' abierto' : '')} aria-expanded={aps.length > 1 ? abiertoM : undefined}
                  aria-current={abiertoM && !apActual ? 'page' : undefined} onClick={() => vamos(`/m/${m.codigo}`)}>
                  <span className="lateral-punto" style={{ background: m.color }} aria-hidden="true" /><span>{m.nombre}</span></button>
                {abiertoM && aps.length > 1 && (
                  <nav className="lateral-sub" aria-label={m.nombre}>
                    {aps.map(([c, n]) => {
                      const activo = apActual === c;
                      return <button key={c} type="button" className={'lateral-subitem' + (activo ? ' activo' : '')} aria-pressed={activo}
                        onClick={() => vamos(`/m/${m.codigo}/${c}`)}>{n}</button>;
                    })}
                  </nav>
                )}
              </div>
            );
          })}
          {configurable && (
            <button type="button" className={'lateral-item' + (enConfig ? ' activo' : '')} aria-current={enConfig ? 'page' : undefined} onClick={() => vamos('/config')}>
              <Icono d={ICONOS.ajustes} tam={18} /><span>Configuración</span></button>)}
        </nav>
        <div className="lateral-pie">
          <button type="button" className="lateral-item" onClick={() => { alCerrar(); alProblema(); }}><Icono d={ICONOS.ayuda} tam={18} /><span>Tengo un problema</span></button>
          <button type="button" className="lateral-item" onClick={() => { alCerrar(); alCuenta(); }}>
            <Icono d={ICONOS.persona} tam={18} /><span className="lateral-quien"><b>Tu cuenta</b><small>{estado.sesion.usuario?.nombre}</small></span></button>
        </div>
      </aside>
    </>
  );
}
