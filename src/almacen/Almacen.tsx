// Módulo Almacén (Fábrica, Fase 3, trozo 1b; decidido por Cristian el 22/11): Stock, Movimientos y Apuntar.
// Lo ve quien tiene «almacen.stock.ver»; Apuntar, quien además puede apuntar movimientos.
import { useSesion } from '../nucleo/sesion';
import { Tablon } from '../nucleo/Tablon';
import { useCatalogo } from './datos';
import { Stock } from './Stock';
import { Movimientos } from './Movimientos';
import { Apuntar } from './Apuntar';

type Pestana = 'stock' | 'apuntar' | 'movimientos';

export function apartadosAlmacen(puede: (p: string) => boolean): [Pestana, string][] {
  const ve = puede('almacen.stock.ver');
  return ([['stock', 'Stock', ve], ['apuntar', 'Apuntar', ve && puede('almacen.movimiento.apuntar')], ['movimientos', 'Movimientos', ve]] as [Pestana, string, boolean][])
    .filter((p) => p[2]).map(([c, n]) => [c, n]);
}

export function Almacen({ ruta }: { ruta: string; ir?: (r: string) => void }) {
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
          {actual === 'stock' && <Stock c={cat} recargar={cargar} />}
          {actual === 'apuntar' && <Apuntar c={cat} recargar={cargar} />}
          {actual === 'movimientos' && <Movimientos c={cat} recargar={cargar} />}
        </>}
    </main>
  );
}
