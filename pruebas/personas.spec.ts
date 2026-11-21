// Personal → Horas → «Investigar»: ficha de una persona, comparar a todos y mes a mes (PDF y Excel). Personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { simular, desbordes, vigilar, USUARIO } from './simulador';
import { fichas, mesAMes, periodos } from '../src/personal/investigar';
import type { DiaHoras } from '../src/personal/horas';

const UNIDAD = '74747474-0000-0000-0000-000000000001';
const LOLA = '74747474-0000-0000-0000-0000000000f1', PEPE = '74747474-0000-0000-0000-0000000000f2';
const JEFE = ['nucleo.persona.ver', 'personal.modulo.ver', 'personal.tarea.ver', 'personal.calendario.ver', 'personal.horas.editar', 'nucleo.configuracion.editar'];
const sesion = { usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-p', nombre: 'Unidad P', modulos: ['personal'], permisos: JEFE }] };

/** Octubre de 2026 (y lo que se pida): 7 h de lunes a viernes; el 12/10 es festivo; lo de cada uno, aparte. */
const CAMBIOS: Record<string, Record<string, Partial<DiaHoras>>> = {
  [LOLA]: {
    '2026-10-05': { falta: 'baja', nota: 'Gripe' }, '2026-10-06': { falta: 'baja', nota: 'Gripe' }, '2026-10-07': { falta: 'baja', nota: 'Gripe' },
    '2026-10-20': { falta: 'baja', nota: 'Médico' }, '2026-10-26': { falta: 'vacaciones' }, '2026-10-27': { falta: 'vacaciones' },
    '2026-10-12': { trabajadas: 5 }, '2026-10-17': { trabajadas: 4 },
    '2026-10-14': { trabajadas: 8, extra_mano: 1, nota: 'Pedido urgente' }, '2026-10-15': { trabajadas: 9, fuera: 2, nota: 'Avería F4' },
  },
  [PEPE]: { '2026-10-09': { falta: 'permiso', nota: 'Mudanza' } },
};
function dias(desde: string, hasta: string): DiaHoras[] {
  const out: DiaHoras[] = [];
  for (const [id, nombre] of [[LOLA, 'Lola Prueba'], [PEPE, 'Pepe Prueba']]) {
    for (let d = new Date(desde + 'T12:00:00'); d.toLocaleDateString('sv-SE') <= hasta; d.setDate(d.getDate() + 1)) {
      const f = d.toLocaleDateString('sv-SE'), dow = d.getDay(), fes = f === '2026-10-12';
      const normal = !fes && dow >= 1 && dow <= 5 ? 7 : 0, c = CAMBIOS[id][f] ?? {};
      out.push({ persona_id: id, nombre, jornada: 'completa', horas_semana: 35, fecha: f, dow, tipo_dia: fes ? 'festivo' : null, nombre_dia: fes ? 'Fiesta Nacional' : null,
        horario: normal, prevista: normal, vacaciones: c.falta === 'vacaciones', apuntado: !!Object.keys(c).length, trabajadas: c.trabajadas ?? null, fuera: c.fuera ?? 0,
        extra_mano: c.extra_mano ?? null, falta: c.falta ?? null, nota: c.nota ?? null, horas: c.falta ? 0 : c.trabajadas ?? normal });
    }
  }
  return out;
}
const rpc = { horas_dias: (b: Record<string, unknown>) => dias(String(b.p_desde), String(b.p_hasta)) };

// ---------- las cuentas, sin pantalla ----------
test('cuentas: ficha de Lola en octubre', () => {
  const [lola, pepe] = fichas(dias('2026-10-01', '2026-10-31'), '2026-10-01', '2026-10-31', '2026-12-01');
  expect(lola).toMatchObject({ nombre: 'Lola Prueba', diasTrab: 17, horas: 117, previstas: 147, extra: 1, fuera: 2,
    faltas: { baja: 4, vacaciones: 2, permiso: 0, otro: 0 },
    porClase: { entre: { dias: 15, horas: 108 }, sabado: { dias: 1, horas: 4 }, domingo: { dias: 0, horas: 0 }, festivo: { dias: 1, horas: 5 } } });
  expect(lola.periodos).toEqual([
    { motivo: 'baja', desde: '2026-10-05', hasta: '2026-10-07', dias: 3, notas: ['Gripe'] },
    { motivo: 'baja', desde: '2026-10-20', hasta: '2026-10-20', dias: 1, notas: ['Médico'] },
    { motivo: 'vacaciones', desde: '2026-10-26', hasta: '2026-10-27', dias: 2, notas: [] }]);
  expect(pepe).toMatchObject({ diasTrab: 20, horas: 140, faltas: { permiso: 1 } });
});
test('cuentas: solo cuentan los días ya pasados', () => {
  const [lola] = fichas(dias('2026-10-01', '2026-10-31'), '2026-10-01', '2026-10-31', '2026-10-08');   // hoy = 8/10: cuenta hasta el 7
  expect(lola).toMatchObject({ diasTrab: 2, horas: 14, faltas: { baja: 3 } });   // el 1 y el 2 trabajó; del 5 al 7, de baja
});
test('cuentas: una baja que sigue en días seguidos es una sola', () => {
  expect(periodos(dias('2026-10-05', '2026-10-07').filter((d) => d.persona_id === LOLA))).toHaveLength(1);
});
test('cuentas: mes a mes', () => {
  const M = mesAMes(dias('2026-09-01', '2026-10-31'), '2026-09-01', '2026-10-31', '2026-12-01', LOLA);
  expect(M).toEqual([
    { mes: '2026-09', diasTrab: 22, horas: 154, baja: 0, vacaciones: 0, permiso: 0, otro: 0, extra: 0, fuera: 0, bajas: 0 },
    { mes: '2026-10', diasTrab: 17, horas: 117, baja: 4, vacaciones: 2, permiso: 0, otro: 0, extra: 1, fuera: 2, bajas: 2 }]);
});

// ---------- pantallas ----------
async function abrir(page: Page) {
  await page.goto('./#/m/personal/horas');
  await page.getByRole('group', { name: 'Horas' }).getByRole('button', { name: 'Investigar' }).click();
  await page.getByLabel('Desde').fill('2026-10-01');
  await page.getByLabel('Hasta').fill('2026-10-31');
  await expect(page.locator('.cifras > div b').first()).toHaveText('17');
}
const bajar = async (page: Page, nombre: string) => {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: nombre }).click()]);
  return { nombre: d.suggestedFilename(), datos: readFileSync((await d.path())!) };
};

test('ficha de una persona: días y horas, bajas, vacaciones, extra y fuera; en PDF', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion, rpc });
  await abrir(page);
  await expect(page.getByRole('group', { name: 'Horas' }).getByRole('button')).toHaveText(['Horas del día', 'Horas del mes', 'Investigar']);
  await expect(page.getByRole('combobox', { name: /^Persona/ })).toHaveValue(LOLA);
  await expect(page.locator('.cifras > div')).toHaveText([/17Días trabajados/, /117 hHoras trabajadas \(previstas 147\)/, /4Días de baja/, /2Días de vacaciones/,
    /0Permisos/, /3 hExtra 1 · fuera 2/]);
  await expect(page.locator('.lista').first().locator('.fila')).toHaveText(['Entre semana15 días · 108 h', 'Sábados1 día · 4 h', 'Domingos0 días · 0 h', 'Festivos1 día · 5 h']);
  await expect(page.locator('.lista').nth(1).locator('.fila')).toHaveText(['Baja: del 05/10/2026 al 07/10/20263 días · Gripe', 'Baja: 20/10/20261 día · Médico',
    'Vacaciones: del 26/10/2026 al 27/10/20262 días']);
  await expect(page.locator('.lista').nth(2).locator('.fila')).toHaveText(['mié 14/101 h extra · Pedido urgente', 'jue 15/102 h fuera de presupuesto · Avería F4']);
  const pdf = await bajar(page, 'Ficha en PDF');
  expect(pdf.nombre).toBe('ficha-lola-prueba-2026-10-01_2026-10-31.pdf');
  for (const t of ['Ficha de Lola Prueba', 'Unidad P', 'Gripe', 'Pedido urgente', 'Fiesta Nacional']) expect(pdf.datos.toString('latin1'), t).toContain(t);
  await page.getByRole('combobox', { name: /^Persona/ }).selectOption({ label: 'Pepe Prueba' });
  await expect(page.locator('.cifras > div b').first()).toHaveText('20');
  await expect(page.locator('.lista').nth(1)).toContainText('Permiso: 09/10/20261 día · Mudanza');
  expect(errores).toEqual([]);
});

test('todos: ordenar por días de baja o por horas; Excel con sus hojas', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion, rpc });
  await abrir(page);
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Todos' }).click();
  await page.getByLabel('Ordenar por').selectOption({ label: 'Días de baja' });
  await expect(page.locator('.lista .fila b')).toHaveText(['Lola Prueba', 'Pepe Prueba']);
  await expect(page.locator('.lista .fila').first()).toContainText('4 días de baja (2 bajas) · 2 de vacaciones · 0 de permiso');
  await page.getByLabel('Ordenar por').selectOption({ label: 'Horas trabajadas' });
  await expect(page.locator('.lista .fila b')).toHaveText(['Pepe Prueba', 'Lola Prueba']);
  const x = await bajar(page, 'Excel');
  expect(x.nombre).toBe('investigar-personas-2026-10-01_2026-10-31.xlsx');
  const hojas = await readXlsxFile(x.datos);
  expect(hojas.map((h) => h.sheet)).toEqual(['Todos', 'Faltas', 'Extra y fuera', 'Mes a mes', 'Día a día']);
  const todos = hojas[0].data, c = todos[2] as string[], lola = todos.find((r) => r[0] === 'Lola Prueba')!;
  expect([lola[c.indexOf('Días trabajados')], lola[c.indexOf('Horas trabajadas')], lola[c.indexOf('Baja (días)')], lola[c.indexOf('Bajas (veces)')],
    lola[c.indexOf('Festivos (h)')]]).toEqual([17, 117, 4, 2, 5]);
  expect(hojas[1].data.slice(1).map((r) => [r[0], r[1], r[4]])).toEqual([['Lola Prueba', 'Baja', 3], ['Lola Prueba', 'Baja', 1], ['Lola Prueba', 'Vacaciones', 2],
    ['Pepe Prueba', 'Permiso', 1]]);
  expect(errores).toEqual([]);
});

test('mes a mes: de una persona o de todos', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion, rpc });
  await abrir(page);
  await page.getByLabel('Desde').fill('2026-09-01');
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Mes a mes' }).click();
  await page.getByRole('combobox', { name: /^Persona/ }).selectOption({ label: 'Lola Prueba' });
  await expect(page.locator('.lista .fila')).toHaveText([/septiembre 2026.*22 días · 154 h trabajadas.*0 días de baja/, /octubre 2026.*17 días · 117 h trabajadas.*4 días de baja \(2 nuevas\)/]);
  await page.getByRole('combobox', { name: /^Persona/ }).selectOption({ label: 'Todos' });
  await expect(page.locator('.lista .fila').last()).toContainText('37 días · 257 h trabajadas');
  expect(errores).toEqual([]);
});

test('investigar personas: nada se sale a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await simular(page, { dentro: true, sesion, rpc });
  await abrir(page);
  await page.getByText('Día a día').click();
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Todos' }).click();
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Mes a mes' }).click();
  expect(await desbordes(page)).toEqual([]);
});

test('ordenador: todos y mes a mes en tabla, ordenando por la columna', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion, rpc });
  await abrir(page);
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Todos' }).click();
  const tabla = page.locator('table.tabla');
  await expect(tabla.locator('thead th')).toHaveText(['Persona', 'Días trabajados', 'Horas', 'Extra (h)', 'Fuera (h)', 'Baja (días)', 'Vacaciones (días)', 'Permiso (días)', 'Otra falta (días)']);
  await expect(tabla.locator('tbody tr', { hasText: 'Lola Prueba' }).locator('td')).toHaveText(['17', '117', '1', '2', '4 (2 bajas)', '2', '', '']);
  await tabla.getByRole('button', { name: 'Horas' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Lola Prueba', 'Pepe Prueba']);
  await tabla.getByRole('button', { name: 'Horas' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Pepe Prueba', 'Lola Prueba']);
  await page.getByRole('group', { name: 'Filtros' }).getByRole('button', { name: 'Con bajas' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Lola Prueba']);
  await page.getByRole('group', { name: 'Investigar' }).getByRole('button', { name: 'Mes a mes' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['octubre 2026']);
  expect(errores).toEqual([]);
});
