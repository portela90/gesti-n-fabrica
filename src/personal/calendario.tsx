import { supabase } from '../nucleo/supabase';

/** Tablas y funciones de Personal (esquema «personal»). */
export const personal = () => supabase.schema('personal');

export type TipoDia = 'festivo' | 'cierre' | 'intensiva' | 'especial';
export interface Dia { fecha: string; tipo: TipoDia; nombre: string | null; horario: string | null }
export interface Vacacion { id?: string; persona_id?: string; desde: string; hasta: string; nota: string | null }

export const TIPOS: { tipo: TipoDia; nombre: string; ayuda: string }[] = [
  { tipo: 'festivo', nombre: 'Festivo', ayuda: 'No se trabaja' },
  { tipo: 'cierre', nombre: 'Cierre de fábrica', ayuda: 'La fábrica cierra' },
  { tipo: 'intensiva', nombre: 'Jornada intensiva', ayuda: 'Horario reducido' },
  { tipo: 'especial', nombre: 'Horario especial', ayuda: 'Otro horario ese día' },
];
export const nombreTipo = (t: string) => TIPOS.find((x) => x.tipo === t)?.nombre ?? t;

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Fecha «aaaa-mm-dd» sin líos de zona horaria. */
export const iso = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const fechaCorta = (f: string) => { const [a, m, d] = f.split('-').map(Number); return `${d}/${m}/${a}`; };
export const fechaLarga = (f: string) => { const [, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1].toLowerCase()}`; };
export const diaSemana = (f: string) => { const [a, m, d] = f.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
export const diasEntre = (desde: string, hasta: string) => {
  const [a1, m1, d1] = desde.split('-').map(Number), [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 864e5) + 1;
};
export const periodo = (v: { desde: string; hasta: string }) =>
  v.desde === v.hasta ? fechaCorta(v.desde) : `${fechaCorta(v.desde)} – ${fechaCorta(v.hasta)} · ${diasEntre(v.desde, v.hasta)} días`;

/**
 * El año entero, mes a mes. Colores por tipo de día; vacaciones en verde; los días que el equipo no trabaja,
 * apagados. Si se pasa «alTocar», los días se pueden elegir.
 */
export function Anio({ anio, dias, vacaciones = [], diasEquipo, elegidos, alTocar }: {
  anio: number; dias: Dia[]; vacaciones?: Vacacion[]; diasEquipo?: number[] | null;
  elegidos?: Set<string>; alTocar?: (fecha: string) => void;
}) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const deVacaciones = (f: string) => vacaciones.some((v) => v.desde <= f && f <= v.hasta);
  return (
    <div className="anio">
      {MESES.map((mes, m) => {
        const hueco = (new Date(Date.UTC(anio, m, 1)).getUTCDay() + 6) % 7;
        const total = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
        return (
          <section key={mes} className="mes" aria-label={`${mes} ${anio}`}>
            <h3>{mes}</h3>
            <div className="mes-dias">
              {SEMANA.map((s) => <span key={s} className="mes-sem" aria-hidden="true">{s}</span>)}
              {Array.from({ length: hueco }, (_, i) => <span key={'h' + i} />)}
              {Array.from({ length: total }, (_, i) => {
                const f = iso(anio, m, i + 1);
                const d = porFecha.get(f);
                const libre = diasEquipo && !diasEquipo.includes(diaSemana(f));
                const clase = ['dia', d ? 't-' + d.tipo : deVacaciones(f) ? 't-vacaciones' : '', libre ? 'libre' : '', elegidos?.has(f) ? 'elegido' : ''].join(' ');
                const titulo = [fechaLarga(f), d && (d.nombre || nombreTipo(d.tipo)), d?.horario, deVacaciones(f) && 'Vacaciones'].filter(Boolean).join(' · ');
                return alTocar
                  ? <button key={f} type="button" className={clase} title={titulo} aria-label={titulo} aria-pressed={elegidos?.has(f) ?? false} onClick={() => alTocar(f)}>{i + 1}</button>
                  : <span key={f} className={clase} title={titulo}>{i + 1}</span>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Leyenda({ conVacaciones = true }: { conVacaciones?: boolean }) {
  return (
    <div className="leyenda">
      {TIPOS.map((t) => <span key={t.tipo}><i className={'t-' + t.tipo} />{t.nombre}</span>)}
      {conVacaciones && <span><i className="t-vacaciones" />Vacaciones</span>}
      <span><i className="libre" />No trabaja</span>
    </div>
  );
}

/** Lista de los días marcados (para leerlos sin tener que mirar los colores). */
export function ListaDias({ dias }: { dias: Dia[] }) {
  if (!dias.length) return <p className="nota">No hay días marcados.</p>;
  return (
    <ul className="lista-dias">
      {dias.map((d) => (
        <li key={d.fecha}><i className={'t-' + d.tipo} aria-hidden="true" /><b>{fechaCorta(d.fecha)}</b>
          <span>{d.nombre || nombreTipo(d.tipo)}{d.horario ? ` · ${d.horario}` : ''}</span></li>
      ))}
    </ul>
  );
}

/** Mensajes de error de la base de datos, en cristiano. */
export function textoError(m: string) {
  const c: Record<string, string> = {
    NO_PERMISO: 'No tienes permiso para hacer esto.',
    YA_FIRMADO: 'Ya está firmado.',
    ANULADO: 'Este envío se anuló; habrá uno más nuevo.',
    FALTA_COMENTARIO: 'Si no estás conforme, explica por qué.',
    FIRMA_MAL: 'Falta la firma.',
    MISMO_EQUIPO: 'Elige otro equipo.',
    DEMASIADAS: 'Son demasiados días de golpe.',
  };
  const k = Object.keys(c).find((x) => m.includes(x));
  return k ? c[k] : m;
}
