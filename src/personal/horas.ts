// Horas del mes y bolsa de horas: las mismas cuentas que el «Excel mensual» de la app vieja de Limpieza.
// No toca la base de datos: recibe los días (personal.horas_dias) y devuelve una fila por trabajador.

/** Un día de un trabajador, como lo devuelve personal.horas_dias. */
export interface DiaHoras {
  persona_id: string; nombre: string; jornada: string | null; horas_semana: number | null; fecha: string; dow: number;
  tipo_dia: string | null; nombre_dia: string | null; horario: number; prevista: number; vacaciones: boolean; apuntado: boolean;
  trabajadas: number | null; fuera: number; extra_mano: number | null; falta: string | null; nota: string | null; horas: number;
}

/** Una fila del resumen del mes (las columnas del Excel). */
export interface FilaMes {
  persona_id: string; nombre: string; jornada: 'Completa' | 'Parcial'; contrato: number | null;
  trabajadas: number; normales: number; extraSemana: number | null; extraSabado: number | null; extraFestivo: number | null; fuera: number;
  bolsaInicio: number | null; bolsaVariacion: number | null; bolsaFin: number | null;
  baja: number; vacaciones: number; permiso: number; otra: number;
}

const SIN_RESTAR = ['festivo', 'cierre', 'descanso']; // días que pone el calendario: si no se trabaja, no restan de la bolsa
export const sumaDias = (f: string, n: number) => {
  const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
export const finDeMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0).toLocaleDateString('sv-SE'); };
const n = (x: unknown) => Number(x ?? 0) || 0;

/**
 * Resumen de un mes («2026-11»). Jornada completa: cada semana (lunes a domingo) se compara lo trabajado, menos lo pagado
 * como extra a mano, con sus horas de contrato (35 si no tiene) proporcionales a los días contados, menos las de bajas,
 * vacaciones y días del calendario que no se trabajan (festivo, cierre, descanso). Lo que sobra va a la bolsa y lo que
 * falta resta. La bolsa empieza a 0 el lunes `bolsaInicio`; una semana cuenta en el mes de su domingo; solo días ya
 * pasados (hasta `hoy`). Jornada parcial: sin bolsa ni extras. Hace falta tener los días desde `bolsaInicio`.
 */
export function resumenMes(dias: DiaHoras[], mes: string, bolsaInicio: string, hoy: string): FilaMes[] {
  const ini = mes + '-01';
  const lim = finDeMes(mes) < hoy ? finDeMes(mes) : hoy;
  const porPersona = new Map<string, DiaHoras[]>();
  dias.forEach((d) => porPersona.set(d.persona_id, [...(porPersona.get(d.persona_id) ?? []), d]));
  const filas: FilaMes[] = [];
  for (const ds of porPersona.values()) {
    const p = ds[0];
    const delMes = ds.filter((d) => d.fecha >= ini && d.fecha <= lim);
    const cuenta = (f: string) => delMes.filter((d) => d.falta === f).length;
    const comun = { persona_id: p.persona_id, nombre: p.nombre, baja: cuenta('baja'), vacaciones: cuenta('vacaciones'), permiso: cuenta('permiso'), otra: cuenta('otro') };
    if (p.jornada !== 'completa') {
      const t = delMes.reduce((s, d) => s + n(d.horas), 0);
      filas.push({ ...comun, jornada: 'Parcial', contrato: p.horas_semana, trabajadas: t, normales: t, extraSemana: null, extraSabado: null,
        extraFestivo: null, fuera: delMes.reduce((s, d) => s + n(d.fuera), 0), bolsaInicio: null, bolsaVariacion: null, bolsaFin: null });
      continue;
    }
    const c = p.horas_semana ?? 35;
    let bolsa = 0, inicioMes: number | null = null;
    const M = { W: 0, nor: 0, ew: 0, sa: 0, fes: 0, fu: 0, dl: 0 };
    let wk: { ini: string; W: number; n: number; paid: number; exc: number; ew: number; sa: number; fes: number; fu: number } | null = null;
    for (const d of ds.filter((x) => x.fecha <= lim).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      if (!wk) wk = { ini: d.fecha, W: 0, n: 0, paid: 0, exc: 0, ew: 0, sa: 0, fes: 0, fu: 0 };
      const h = n(d.horas), em = Math.min(h, n(d.extra_mano));
      const noSeTrabaja = SIN_RESTAR.includes(d.tipo_dia ?? '') && h === 0;
      wk.n++;
      if (d.falta === 'baja' || d.falta === 'vacaciones' || noSeTrabaja) wk.exc += n(d.horario);
      wk.W += h; wk.paid += em; wk.fu += n(d.fuera);
      if (em > 0) { if (d.tipo_dia === 'festivo' || d.dow === 0) wk.fes += em; else if (d.dow === 6) wk.sa += em; else wk.ew += em; }
      if (d.dow === 0) {
        const cap = (c * wk.n) / 7 - wk.exc, neto = wk.W - wk.paid;
        const dl = wk.ini < bolsaInicio ? 0 : neto - cap;
        const antes = bolsa; bolsa += dl;
        if (d.fecha.slice(0, 7) === mes) {
          M.W += wk.W; M.nor += Math.min(neto, cap); M.ew += wk.ew; M.sa += wk.sa; M.fes += wk.fes; M.fu += wk.fu; M.dl += dl;
          if (inicioMes === null) inicioMes = antes;
        }
        wk = null;
      }
    }
    filas.push({ ...comun, jornada: 'Completa', contrato: c, trabajadas: M.W, normales: M.nor, extraSemana: M.ew, extraSabado: M.sa, extraFestivo: M.fes,
      fuera: M.fu, bolsaInicio: inicioMes ?? bolsa, bolsaVariacion: M.dl, bolsaFin: bolsa });
  }
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Número con coma y como mucho dos decimales (para pantalla y Excel). */
export const dec = (x: number | null) => (x == null ? '' : (Math.round(x * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }));

/** CSV que abre bien Excel en español (punto y coma, con BOM). */
export function csv(filas: (string | number | null)[][]) {
  const cel = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + filas.map((r) => r.map(cel).join(';')).join('\r\n');
}

export const CABECERA_MES = ['Nombre', 'Jornada', 'Horas de contrato', 'Horas trabajadas', 'Horas normales', 'Extra a mano entre semana', 'Extra a mano sábado',
  'Extra a mano festivo y domingo', 'Fuera de presupuesto (h)', 'Bolsa al inicio del mes (h)', 'Variación de la bolsa (h)', 'Bolsa al final del mes (h)',
  'Días de baja', 'Días de vacaciones', 'Días de permiso', 'Días de otra falta'];
export const filaExcel = (f: FilaMes) => [f.nombre, f.jornada, f.contrato ?? '', dec(f.trabajadas), dec(f.normales),
  f.extraSemana == null ? '—' : dec(f.extraSemana), f.extraSabado == null ? '—' : dec(f.extraSabado), f.extraFestivo == null ? '—' : dec(f.extraFestivo),
  dec(f.fuera), f.bolsaInicio == null ? '—' : dec(f.bolsaInicio), f.bolsaVariacion == null ? '—' : dec(f.bolsaVariacion), f.bolsaFin == null ? '—' : dec(f.bolsaFin),
  f.baja, f.vacaciones, f.permiso, f.otra];
