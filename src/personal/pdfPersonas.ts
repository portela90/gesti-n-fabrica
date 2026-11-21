// PDF de la ficha de una persona y Excel de «Investigar personas». Se carga solo al pulsar el botón.
import { cab, libro, neg, nuevoPDF, type Celda } from '../componentes/informes';
import { dec } from './horas';
import { CLASE, MOTIVO, nombreMes, type ClaseDia, type Ficha, type Mes, type Motivo } from './investigar';

const fDMA = (f: string) => f.split('-').reverse().join('/');
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fCorta = (f: string) => `${DIAS[new Date(f + 'T12:00:00').getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
const CLASES: ClaseDia[] = ['entre', 'sabado', 'domingo', 'festivo'];
const MOTIVOS: Motivo[] = ['baja', 'vacaciones', 'permiso', 'otro'];

export async function pdfFicha(f: Ficha, unidad: string, quien: string, desde: string, hasta: string): Promise<Blob> {
  const P = await nuevoPDF(); const { doc, tabla, titulo, frase } = P;
  P.cabecera(`Ficha de ${f.nombre}`, `${unidad}  ·  del ${fDMA(desde)} al ${fDMA(hasta)}  ·  jornada ${f.jornada.toLowerCase()}`);
  P.cajas([['Días trabajados', String(f.diasTrab)], ['Horas trabajadas', dec(f.horas)], ['Horas previstas', dec(f.previstas)], ['Días de baja', String(f.faltas.baja), f.faltas.baja > 0],
    ['Vacaciones (días)', String(f.faltas.vacaciones)], ['Permisos (días)', String(f.faltas.permiso)], ['Extra (h)', dec(f.extra)], ['Fuera de presupuesto (h)', dec(f.fuera), f.fuera > 0]]);
  titulo('Días y horas trabajadas');
  tabla(['', 'Días', 'Horas'], [...CLASES.map((c) => [CLASE[c], f.porClase[c].dias, dec(f.porClase[c].horas)]), ['Total', f.diasTrab, dec(f.horas)]]);
  titulo('Bajas, vacaciones, permisos y otras faltas');
  if (f.periodos.length) tabla(['Qué', 'Desde', 'Hasta', 'Días', 'Nota'], f.periodos.map((p) => [MOTIVO[p.motivo], fDMA(p.desde), fDMA(p.hasta), p.dias, p.notas.join(' · ')]),
    { columnStyles: { 4: { cellWidth: 70 } } });
  else frase('Ninguna falta en este periodo.');
  titulo('Horas extra y fuera de presupuesto');
  if (f.extras.length) tabla(['Día', 'Extra (h)', 'Fuera de presupuesto (h)', 'Motivo'], f.extras.map((e) => [fCorta(e.fecha), dec(e.extra), dec(e.fuera), e.nota ?? '']));
  else frase('Ninguna en este periodo.');
  titulo('Día a día');
  tabla(['Día', 'Calendario', 'Previstas', 'Horas', 'Extra', 'Fuera', 'Falta', 'Nota'], f.dias.map((d) => [fCorta(d.fecha), d.nombre_dia ?? d.tipo_dia ?? '', dec(d.prevista),
    dec(d.horas), d.extra_mano ? dec(d.extra_mano) : '', d.fuera ? dec(d.fuera) : '', d.falta ? MOTIVO[d.falta as Motivo] : '', d.nota ?? '']),
    { styles: { fontSize: 7.5, cellPadding: 1.2 } });
  P.pie(quien, unidad);
  return doc.output('blob');
}

export async function excelPersonas(F: Ficha[], meses: Mes[], mesesDe: string, desde: string, hasta: string): Promise<Blob> {
  const titulo: Celda[][] = [[neg(`Investigar personas · del ${fDMA(desde)} al ${fDMA(hasta)}`)], []];
  return libro([
    { nombre: 'Todos', anchos: [24, 11, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 9, 10, 12],
      filas: [...titulo, cab(['Persona', 'Jornada', 'Días trabajados', 'Horas trabajadas', 'Horas previstas', ...CLASES.flatMap((c) => [`${CLASE[c]} (días)`, `${CLASE[c]} (h)`]),
        ...MOTIVOS.map((m) => `${MOTIVO[m]} (días)`), 'Bajas (veces)', 'Extra (h)', 'Fuera de presupuesto (h)']),
        ...F.map((f) => [f.nombre, f.jornada, f.diasTrab, f.horas, f.previstas, ...CLASES.flatMap((c) => [f.porClase[c].dias, f.porClase[c].horas]),
          ...MOTIVOS.map((m) => f.faltas[m]), f.periodos.filter((p) => p.motivo === 'baja').length, f.extra, f.fuera])] },
    { nombre: 'Faltas', anchos: [24, 12, 11, 11, 7, 50],
      filas: [cab(['Persona', 'Qué', 'Desde', 'Hasta', 'Días', 'Nota']), ...F.flatMap((f) => f.periodos.map((p) => [f.nombre, MOTIVO[p.motivo], p.desde, p.hasta, p.dias, p.notas.join(' · ')]))] },
    { nombre: 'Extra y fuera', anchos: [24, 11, 10, 14, 50],
      filas: [cab(['Persona', 'Fecha', 'Extra (h)', 'Fuera de presupuesto (h)', 'Motivo']), ...F.flatMap((f) => f.extras.map((e) => [f.nombre, e.fecha, e.extra, e.fuera, e.nota ?? '']))] },
    { nombre: 'Mes a mes', anchos: [16, 12, 12, 10, 10, 10, 10, 10, 10, 12],
      filas: [[neg(`Mes a mes · ${mesesDe}`)], [], cab(['Mes', 'Días trabajados', 'Horas trabajadas', 'Bajas (veces)', 'Días de baja', 'Vacaciones (días)', 'Permisos (días)',
        'Otras faltas (días)', 'Extra (h)', 'Fuera de presupuesto (h)']),
        ...meses.map((m) => [nombreMes(m.mes), m.diasTrab, m.horas, m.bajas, m.baja, m.vacaciones, m.permiso, m.otro, m.extra, m.fuera])] },
    { nombre: 'Día a día', anchos: [24, 11, 14, 10, 10, 9, 9, 12, 40],
      filas: [cab(['Persona', 'Fecha', 'Calendario', 'Previstas', 'Horas', 'Extra', 'Fuera', 'Falta', 'Nota']),
        ...F.flatMap((f) => f.dias.map((d) => [f.nombre, d.fecha, d.nombre_dia ?? d.tipo_dia ?? '', Number(d.prevista) || 0, Number(d.horas) || 0, d.extra_mano ?? null,
          Number(d.fuera) || 0, d.falta ? MOTIVO[d.falta as Motivo] : '', d.nota ?? '']))] },
  ]);
}
