// Limpieza · «Pregúntale»: el motor con preguntas de verdad y la pantalla (aprender, favoritas, Excel). Personas inventadas.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { simular, desbordes, vigilar, USUARIO } from './simulador';
import { Ayudas, contesta, entiende, periodoQ, type Contexto, type DatosPreg, type DicEntrada } from '../src/limpieza/preguntale';
import type { DiaHoras } from '../src/componentes/horasPersonas';

const HOY = '2026-11-20';
const ANA = '75757575-0000-0000-0000-0000000000f1', BEA = '75757575-0000-0000-0000-0000000000f2';
let n = 0;
const t = (fecha: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id: `75757575-0000-0000-0000-${String(++n).padStart(12, '0')}`, fecha, clase: 'suelto', tarea_id: null, titulo, descripcion: null, lugar: null, maquina: null,
  minutos_est: null, minutos: null, tiempo_auto: false, estado: 'pendiente', inicio: null, fin: null, pausado_min: 0, hecho_por: null, hecho_por_nombre: null, asignados: [],
  asignados_nombres: [], asignados_orig_nombres: [], aviso_reparto: null, todo_equipo: false, equipo: 'Semana', turno: null, urgente: false, origen: null, problema: null,
  nota: null, checklist_puntos: 0, checklist_mal: 0, fotos: 0, creado_por_nombre: null, ...extra,
});
const hecho = (fecha: string, titulo: string, quien: [string, string], min: number, extra: Record<string, unknown> = {}) =>
  t(fecha, titulo, { estado: 'hecho', hecho_por: quien[0], hecho_por_nombre: quien[1], asignados: [quien[0]], asignados_nombres: [quien[1]], minutos: min,
    inicio: `${fecha}T09:00:00+01:00`, fin: `${fecha}T10:00:00+01:00`, ...extra });
function datos(): DatosPreg {
  n = 0;
  const A: [string, string] = [ANA, 'Ana Prueba'], B: [string, string] = [BEA, 'Bea Prueba'];
  const T = [
    hecho('2026-11-03', 'Fuga de aceite', A, 30, { maquina: 'F19' }), hecho('2026-11-10', 'Fuga de aceite', A, 30, { maquina: 'F19' }),
    hecho('2026-11-17', 'Fuga de aceite', B, 30, { maquina: 'F19' }), hecho('2026-11-05', 'Derrame de taladrina', B, 20, { maquina: 'F20' }),
    hecho('2026-11-12', 'Barrer pasillo', A, 60, { clase: 'fija', lugar: 'Pasillo' }),
    t('2026-11-18', 'Vaciar escoria', { asignados: [BEA], asignados_nombres: ['Bea Prueba'] }),
    hecho('2026-10-20', 'Fuga de aceite', A, 30, { maquina: 'F19' }),   // del periodo anterior
  ];
  const nave = (o: typeof T[number]) => (o.maquina === 'F19' ? 'Nave 2' : o.maquina === 'F20' ? 'Nave 1' : null);
  return {
    unidad: 'Unidad T', trabajos: T as never,
    problemas: T.filter((o) => /aceite|taladrina/i.test(o.titulo)).map((o) => ({ id: o.id, tema: /aceite/i.test(o.titulo) ? 'Aceite' : 'Taladrina', sitio_clave: o.maquina!, sitio: o.maquina! })),
    tareas: [], horarios: [ANA, BEA].map((id, i) => ({ id, nombre: ['Ana Prueba', 'Bea Prueba'][i], equipo_id: null, jornada: 'completa', horas_dow: [0, 7, 7, 7, 7, 7, 0] })),
    detalles: T.map((o) => ({ id: o.id, creado: `${o.fecha}T10:15:00+01:00`, nave: nave(o) })),
    temas: [{ nombre: 'Taladrina', palabras: ['taladrin'] }, { nombre: 'Aceite', palabras: ['aceite', 'hidraulic'] }],
    naves: ['Nave 1', 'Nave 2'], maquinas: ['F19', 'F20'],
  };
}
function dias(): DiaHoras[] {
  const out: DiaHoras[] = [];
  for (const [id, nombre] of [[ANA, 'Ana Prueba'], [BEA, 'Bea Prueba']]) for (let d = new Date('2026-10-01T12:00:00'); d.toLocaleDateString('sv-SE') <= HOY; d.setDate(d.getDate() + 1)) {
    const f = d.toLocaleDateString('sv-SE'), dw = d.getDay(), h = dw >= 1 && dw <= 5 ? 7 : 0;
    const baja = id === BEA && f >= '2026-11-09' && f <= '2026-11-11', extra = id === ANA && f === '2026-11-12';
    out.push({ persona_id: id, nombre, jornada: 'completa', horas_semana: 35, fecha: f, dow: dw, tipo_dia: null, nombre_dia: null, horario: h, prevista: h, vacaciones: false,
      apuntado: baja || extra, trabajadas: extra ? 8 : null, fuera: 0, extra_mano: extra ? 1 : null, falta: baja ? 'baja' : null, nota: baja ? 'Gripe' : extra ? 'Pedido urgente' : null,
      horas: baja ? 0 : extra ? 8 : h });
  }
  return out;
}
const DIC: DicEntrada[] = [{ id: 'd1', tipo: 'persona', palabra: 'Anita', valor: 'Ana Prueba' }, { id: 'd2', tipo: 'grupo', palabra: 'hornos', valor: 'escoria, horno' }];
const ctx = (): Contexto => ({ D: datos(), dias: dias(), dic: DIC, aj: { limite: 85, hueco: 30 }, hoy: HOY, pantalla: { d0: '2026-11-01', d1: HOY, t: 'este mes' } });
const pregunta = (q: string) => { const C = ctx(), A = new Ayudas(C), E = entiende(q, C, A); return { E, r: contesta(E, C, A) }; };

// ---------- el motor ----------
test('motor: entiende el periodo escrito', () => {
  expect(periodoQ('el mes pasado', HOY)).toEqual({ d0: '2026-10-01', d1: '2026-10-31', t: 'el mes pasado' });
  expect(periodoQ('desde el 10/11', HOY)).toEqual({ d0: '2026-11-10', d1: HOY, t: 'desde el 10/11' });
  expect(periodoQ('en octubre', HOY)).toMatchObject({ d0: '2026-10-01', d1: '2026-10-31' });
  expect(periodoQ('los ultimos 7 dias', HOY)).toMatchObject({ d0: '2026-11-14', d1: HOY });
  expect(periodoQ('del 9/11 al 13/11', HOY)).toMatchObject({ d0: '2026-11-09', d1: '2026-11-13' });
  expect(periodoQ('entre el 2/11 y el 6/11', HOY)).toMatchObject({ d0: '2026-11-02', d1: '2026-11-06' });
  expect(periodoQ('en octubre y noviembre', HOY)).toEqual({ d0: '2026-10-01', d1: HOY, t: 'de octubre a noviembre' });
  expect(periodoQ('de noviembre a febrero de 2027', '2027-03-10')).toMatchObject({ d0: '2026-11-01', d1: '2027-02-28' });
});
test('motor: «¿Cuántas veces ha perdido aceite la F19 este mes?»', () => {
  const { E, r } = pregunta('¿Cuántas veces ha perdido aceite la F19 este mes?');
  expect(E).toMatchObject({ cat: 'Aceite', sitio: { k: 'maq', v: 'F19' }, int: 'gen', met: 'n', libres: [] });
  expect(r.frase).toBe('Aceite en la F19 este mes: 3 veces, 1 h 30 min. En el periodo anterior: 1 vez (ha subido).');
});
test('motor: «¿Qué máquinas pierden más aceite?» agrupa por sitio', () => {
  const { E, r } = pregunta('¿Qué máquinas pierden más aceite este mes?');
  expect(E.grupo).toBe('sit');
  expect(r.filas[0]).toEqual(['F19', 3, '1 h 30 min', '30 min']);
});
test('motor: «Compara la Nave 1 con la Nave 2»', () => {
  const { E, r } = pregunta('Compara la Nave 1 con la Nave 2 este mes');
  expect(E.int).toBe('naves');
  expect(r.filas.slice(0, 2)).toEqual([['Veces', 1, 3], ['Tiempo', '20 min', '1 h 30 min']]);   // la taladrina de la F20 (Nave 1) y las fugas de la F19 (Nave 2)
  expect(r.frase).toContain('En la Nave 2 se va 1 h 10 min más.');
});
test('motor: «¿Dónde se repiten las fugas de aceite?»', () => {
  const { E, r } = pregunta('¿Dónde se repiten las fugas de aceite?');
  expect(E.int).toBe('rep');
  expect(r.filas[0].slice(0, 3)).toEqual(['F19', 'Aceite', 3]);
});
test('motor: «¿Qué se ha quedado sin hacer esta semana?»', () => {
  const { E, r } = pregunta('¿Qué se ha quedado sin hacer esta semana?');
  expect(E.int).toBe('pend');
  expect(r.frase).toBe('Sin hacer esta semana: 1 trabajos (1 pendientes, 0 con problema y 0 empezados sin terminar). El que más se queda sin hacer: «Vaciar escoria» (1 vez).');
});
test('motor: lo enseñado (un mote y un grupo)', () => {
  const a = pregunta('¿Cuántas veces hornos este mes?');
  expect(a.E.conj).toEqual({ n: 'Hornos', w: ['escoria', 'horno'] });
  expect(a.r.L.map((o) => o.titulo)).toEqual(['Vaciar escoria']);
  const b = pregunta('horas trabajadas de anita este mes');
  expect(b.E.pers).toEqual(['Ana Prueba']);
  expect(b.r.frase).toBe('Ana Prueba este mes: 14 días trabajados y 99 h (previstas 98 h).');
});
test('motor: personas — días de baja de una persona y quién ha hecho más horas extra', () => {
  const a = pregunta('¿Cuántos días de baja ha tenido Bea este mes?');
  expect(a.E).toMatchObject({ int: 'personas', medida: 'baja', pers: ['Bea Prueba'] });
  expect(a.r.frase).toBe('Bea Prueba este mes: 3 días de baja en 1 baja: del 09/11 al 11/11 (Gripe).');
  const b = pregunta('¿Quién ha hecho más horas extra este mes?');
  expect(b.r.frase).toBe('Quien más horas extra este mes: Ana Prueba (1 h). En total, 1 h entre 2 personas.');
  expect(b.r.filas).toEqual([['Ana Prueba', '1 h'], ['Bea Prueba', '0 h']]);
  const c = pregunta('días de baja mes a mes desde el 1/10');
  expect(c.r.filas).toEqual([['octubre 2026', '0', 0], ['noviembre 2026', '3', 1]]);
});
test('motor: «¿qué días ha trabajado …?» da la lista de días', () => {
  const { E, r } = pregunta('¿Qué días ha trabajado Bea del 9/11 hasta el 13/11?');
  expect(E).toMatchObject({ int: 'personas', medida: 'dias', pers: ['Bea Prueba'] });
  expect(r.frase).toBe('Bea Prueba del 09/11 al 13/11: 2 días trabajados (14 h): jue 12/11, vie 13/11.');
  expect(r.filas).toEqual([['jue 12/11', '7 h', ''], ['vie 13/11', '7 h', '']]);
});
test('motor: una palabra que no encaja se ignora y se dice', () => {
  const { E } = pregunta('¿Cuántas veces cachimbo este mes?');
  expect(E.ignoradas).toEqual(['cachimbo']);
});

// ---------- la pantalla ----------
const UNIDAD = '75757575-0000-0000-0000-000000000001';
const ADMIN = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.plan.ver', 'limpieza.informe.ver', 'limpieza.informe.todo', 'personal.horas.editar'];
const sesion = { usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-t', nombre: 'Unidad T', modulos: ['limpieza', 'personal'], permisos: ADMIN }] };
const rpc = {
  investigar: () => ({ alcance: 'todo', personas: [], ...datos() }),
  horas_dias: (b: Record<string, unknown>) => dias().filter((d) => d.fecha >= String(b.p_desde) && d.fecha <= String(b.p_hasta)),
};
const tablas = () => ({ 'limpieza.preguntas_dic': [] as Record<string, unknown>[], 'limpieza.preguntas': [] as Record<string, unknown>[], ajustes: [] });

test('pantalla: preguntar, ver lo entendido y la respuesta, y abrir los trabajos de una fila', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion, tablas: tablas(), rpc });
  await page.goto('./#/m/limpieza/resumen/investigar');
  await page.getByLabel('Tu pregunta').fill('¿Qué máquinas pierden más aceite en octubre y noviembre de 2026?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  const r = page.locator('.res-respuesta');
  await expect(r.locator('.res-entendido')).toContainText('Problema: Aceite');
  await expect(r.locator('.res-entendido')).toContainText('Periodo: de octubre a noviembre');
  await expect(r.locator('.res-frase')).toContainText('4 en total, 2 h');
  await expect(r.locator('.res-frase')).toContainText('El que más: F19');
  await r.locator('.fila', { hasText: 'F19' }).first().click();
  await expect(page.getByRole('dialog', { name: 'F19' })).toContainText('Fuga de aceite');
  await page.getByRole('dialog', { name: 'F19' }).getByRole('button', { name: 'Cerrar' }).last().click();
  expect(sim.tablas['limpieza.preguntas']).toHaveLength(1);
  expect(sim.tablas['limpieza.preguntas'][0]).toMatchObject({ empresa_id: UNIDAD, q: '¿Qué máquinas pierden más aceite en octubre y noviembre de 2026?' });
  // ¿te ha servido? → sí → favorita
  await r.getByRole('button', { name: 'Sí' }).click();
  await r.getByRole('button', { name: '☆ Guardar como favorita' }).click();
  await expect(page.getByText('Guardada en tus preguntas')).toBeVisible();
  expect(sim.tablas['limpieza.preguntas'][0].ok).toBe(true);
  expect(sim.tablas['limpieza.preguntas_dic'][0]).toMatchObject({ tipo: 'favorita', palabra: '¿Qué máquinas pierden más aceite en octubre y noviembre de 2026?' });
  await expect(page.locator('.res-tarjeta', { hasText: 'Pregúntale' }).locator('.res-chips').first().getByRole('button')).toHaveText(['☆ ¿Qué máquinas pierden más aceite en octubre y noviembre de 2026?']);
  // Excel de la respuesta
  const [d] = await Promise.all([page.waitForEvent('download'), r.getByRole('button', { name: 'Excel de esta respuesta' }).click()]);
  const hojas = await readXlsxFile(readFileSync((await d.path())!));
  expect(hojas.map((h) => h.sheet)).toEqual(['Respuesta', 'Trabajos']);
  expect(hojas[0].data[0].slice(0, 2)).toEqual(['Pregunta', '¿Qué máquinas pierden más aceite en octubre y noviembre de 2026?']);
  expect(errores).toEqual([]);
});

test('pantalla: personas, «No es lo que quería» y enseñarle una palabra', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion, tablas: tablas(), rpc });
  await page.goto('./#/m/limpieza/resumen/investigar');
  await page.getByLabel('Tu pregunta').fill('¿Cuántos días de baja ha tenido Bea en noviembre de 2026?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect(page.locator('.res-frase')).toHaveText('Bea Prueba noviembre: 3 días de baja en 1 baja: del 09/11 al 11/11 (Gripe).');
  await expect(page.locator('.res-entendido')).toContainText('Quiero saber: las bajas');
  await page.getByRole('button', { name: 'No es lo que quería' }).click();
  const v = page.getByRole('dialog', { name: '¿Qué querías saber?' });
  await v.getByLabel('Lo que querías saber').fill('Las de todo el año');
  await v.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Apuntado para revisarlo.')).toBeVisible();
  expect(sim.tablas['limpieza.preguntas'][0]).toMatchObject({ ok: false, queria: 'Las de todo el año' });
  // una palabra que no conoce → «Enseñar»
  await page.getByLabel('Tu pregunta').fill('¿Cuántas veces la gorda este mes?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await page.getByRole('button', { name: 'Enseñar «gorda»' }).click();
  const e = page.getByRole('dialog', { name: 'Enséñale' });
  await expect(e.getByLabel('Cuando escriba…')).toHaveValue('gorda');
  await e.getByLabel('Quiero decir…').fill('F19');
  await e.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Aprendido')).toBeVisible();
  expect(sim.tablas['limpieza.preguntas_dic'][0]).toMatchObject({ empresa_id: UNIDAD, tipo: 'frase', palabra: 'gorda', valor: 'F19' });
  // vuelve a preguntar solo y ahora entiende la máquina
  await expect(page.locator('.res-entendido')).toContainText('Dónde: F19');
  expect(errores).toEqual([]);
});

test('pantalla: lo que sabe la app (diccionario) y borrar', async ({ page }) => {
  const errores = vigilar(page);
  const T = tablas();
  T['limpieza.preguntas_dic'].push({ id: 'x1', empresa_id: UNIDAD, tipo: 'persona', palabra: 'Anita', valor: 'Ana Prueba', creado: '2026-11-01' });
  T['limpieza.preguntas'].push({ id: 'p1', empresa_id: UNIDAD, q: '¿Quién barre peor?', ok: false, queria: 'Quién tarda más en barrer', creado: '2026-11-02' });
  const sim = await simular(page, { dentro: true, sesion, tablas: T, rpc });
  await page.goto('./#/m/limpieza/resumen/investigar');
  await page.getByRole('button', { name: 'Enséñale' }).click();
  const v = page.getByRole('dialog', { name: 'Lo que sabe la app' });
  await expect(v).toContainText('«Anita»→ Ana Prueba');
  await v.getByText('Preguntas que no ha entendido (1)').click();
  await expect(v).toContainText('Querías: Quién tarda más en barrer');
  await v.getByRole('button', { name: 'Borrar' }).click();
  await expect(v).toContainText('Todavía no le has enseñado nada.');
  expect(sim.tablas['limpieza.preguntas_dic']).toHaveLength(0);
  expect(errores).toEqual([]);
});

test('pantalla: Pregúntale a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await simular(page, { dentro: true, sesion, tablas: tablas(), rpc });
  await page.goto('./#/m/limpieza/resumen/investigar');
  await page.getByText('Ejemplos de preguntas').click();
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Compara la Nave 1 con la Nave 2' }).click();
  await expect(page.locator('.res-frase')).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
});
