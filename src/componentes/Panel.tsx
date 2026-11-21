// Tarjetas del panel de Inicio (aspecto «Pizarra»): un título, una cifra grande, unas líneas y, si hace falta, una barra.
// Tocarla lleva a su apartado. Cada módulo pone sus tarjetas; esto solo las dibuja.
import type { ReactNode } from 'react';

/** Una línea de «Pendientes de firmar» (la aporta cada módulo). */
export interface LineaPendiente { n: number; texto: string; ruta: string; aviso?: boolean }

export function Tarjeta({ titulo, cifra, unidad, lineas, barra, ruta, ir, cargando, vacio, tono }: {
  titulo: string; cifra?: ReactNode; unidad?: string; lineas?: ReactNode[]; barra?: number | null; ruta?: string; ir: (r: string) => void;
  cargando?: boolean; vacio?: string; tono?: 'mal' | 'aviso';
}) {
  const cuerpo = (
    <>
      <span className="tarjeta-tit">{titulo}</span>
      {cargando ? <span className="tarjeta-nota">Cargando…</span> : (
        <>
          {cifra != null && <span className={'tarjeta-num' + (tono ? ` ${tono}` : '')}>{cifra}{unidad && <small> {unidad}</small>}</span>}
          {barra != null && <span className="tarjeta-barra" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, barra))}%` }} /></span>}
          {lineas && lineas.length > 0 ? <ul className="tarjeta-lineas">{lineas.map((l, i) => <li key={i}>{l}</li>)}</ul>
            : vacio ? <span className="tarjeta-nota">{vacio}</span> : null}
        </>
      )}
    </>
  );
  return ruta
    ? <button type="button" className="tarjeta-panel" onClick={() => ir(ruta)} aria-label={titulo}>{cuerpo}</button>
    : <div className="tarjeta-panel">{cuerpo}</div>;
}
