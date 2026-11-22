// Módulo Almacén (Fábrica, Fase 3, trozo 1; decidido por Cristian el 22/11): Hoy, Apuntar, Stock, Reponer y Movimientos.
// Lo ve quien tiene «almacen.stock.ver»; Apuntar, quien además puede apuntar movimientos.
import { useSesion } from '../nucleo/sesion';
import { Tablon } from '../nucleo/Tablon';
import { useCatalogo } from './datos';
import { Stock } from './Stock';
import { Movimientos } from './Movimientos';
import { Apuntar } from './Apuntar';
import { Hoy } from './Hoy';
import { Reponer } from './Reponer';

type Pestana = 'hoy' | 'stock' | 'apuntar' | 'reponer' | 'dotacion' | 'prevision' | 'faltasobra' | 'movimientos';

export function apartadosAlmacen(puede: (p: string) => boolean): [Pestana, string][] {
  const ve = puede('almacen.stock.ver');
  // Reponer, Dotación, Previsión y Falta y sobra, cada uno en el menú (repaso con Cristian del 22/11)
  return ([['hoy', 'Hoy', ve], ['apuntar', 'Apuntar', ve && puede('almacen.movimiento.apuntar')], ['stock', 'Stock', ve], ['reponer', 'Reponer', ve],
    ['dotacion', 'Dotación', ve], ['prevision', 'Previsión', ve], ['faltasobra', 'Falta y sobra', ve], ['movimientos', 'Movimientos', ve]] as [Pestana, string, boolean][])
    .filter((p) => p[2]).map(([c, n]) => [c, n]);
}

export function Almacen({ ruta, ir }: { ruta: string; ir: (r: string) => void }) {
  const { puede } = useSesion();
  const pestanas = apartadosAlmacen(puede);
  const pedida = (ruta.split('/')[3] ?? '') as Pestana;
  const actual = pestanas.find((p) => p[0] === pedida)?.[0] ?? pestanas[0]?.[0];
  const { cat, error, cargar } = useCatalogo();
  return (
    <main className="contenido" style={{ ['--area' as string]: '#475569' }}>
      <Tablon compacto />
      {!pestanas.length ? <div className="vacio"><p><b>No tienes nada del Almacén.</b></p><p>Si crees que deberías, díselo a tu administrador.</p></div>
        : error ? <div className="vacio"><p><b>No se ha podido cargar el almacén.</b></p><p className="nota">{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button></div>
        : !cat ? <p className="cargando" aria-busy="true">Cargando…</p>
        : <>
          {actual === 'hoy' && <Hoy c={cat} recargar={cargar} ir={ir} />}
          {actual === 'stock' && <Stock c={cat} recargar={cargar} />}
          {(actual === 'reponer' || actual === 'dotacion' || actual === 'prevision' || actual === 'faltasobra') && <Reponer c={cat} recargar={cargar} parte={actual === 'reponer' ? 'hoy' : actual} />}
          {actual === 'apuntar' && <Apuntar c={cat} recargar={cargar} />}
          {actual === 'movimientos' && <Movimientos c={cat} recargar={cargar} />}
        </>}
    </main>
  );
}
