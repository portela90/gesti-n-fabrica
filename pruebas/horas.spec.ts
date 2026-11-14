// Personal · Horas: el cálculo de la bolsa (las cuentas de la app vieja) y las pantallas de horas.
// Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO, PERMISOS_ADMIN } from './simulador';
import { resumenMes, type DiaHoras } from '../src/personal/horas';

// ---------- el cálculo, sin pantalla ----------
const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
void NOMBRES;
/** Días de una persona de `desde` a `hasta`: 7 h de lunes a viernes salvo lo que se cambie. */
function dias(desde: string, hasta: string, cambios: Record<string, Partial<DiaHoras>> = {}, p: Partial<DiaHoras> = {}): DiaHoras[] {
  const out: DiaHoras[] = [];
  for (let d = new Date(desde + 'T12:00:00'); d.toLocaleDateString('sv-SE') <= hasta; d.setDate(d.getDate() + 1)) {
    const f = d.toLocaleDateString('sv-SE'), dow = d.getDay(), normal = dow >= 1 && dow <= 5 ? 7 : 0;
    const base: DiaHoras = { persona_id: 'p1', nombre: 'Lola', jornada: 'completa', horas_semana: 35, fecha: f, dow, tipo_dia: null, nombre_dia: null,
      horario: normal, prevista: normal, vacaciones: false, apuntado: false, trabajadas: null, fuera: 0, extra_mano: null, falta: null, nota: null, horas: normal, ...p };
    out.push({ ...base, ...(cambios[f] ?? {}) });
  }
  return out;
}

test('bolsa: una semana normal de 35 h no cambia la bolsa', () => {
  const [f] = resumenMes(dias('2031-03-03', '2031-03-09'), '2031-03', '2031-03-03', '2031-12-31');
  expect(f).toMatchObject({ jornada: 'Completa', contrato: 35, trabajadas: 35, normales: 35, bolsaInicio: 0, bolsaVariacion: 0, bolsaFin: 0, extraSemana: 0 });
});

test('bolsa: lo que pasa de 35 h va a la bolsa; lo pagado como extra a mano, no', () => {
  const ds = dias('2031-03-03', '2031-03-09', {
    '2031-03-03': { horas: 10, trabajadas: 10, extra_mano: 1, apuntado: true },  // 3 h de más, 1 pagada
    '2031-03-08': { horas: 4, trabajadas: 4, extra_mano: 4, apuntado: true },    // sábado, pagado entero
  });
  const [f] = resumenMes(ds, '2031-03', '2031-03-03', '2031-12-31');
  expect(f).toMatchObject({ trabajadas: 42, normales: 35, extraSemana: 1, extraSabado: 4, extraFestivo: 0, bolsaVariacion: 2, bolsaFin: 2 });
});

test('bolsa: vacaciones, bajas y festivos no restan; un día libre sin motivo, sí', () => {
  const ds = dias('2031-03-03', '2031-03-16', {
    '2031-03-04': { tipo_dia: 'festivo', prevista: 0, horas: 0 },
    '2031-03-07': { falta: 'vacaciones', vacaciones: true, horas: 0 },
    '2031-03-11': { falta: 'baja', horas: 0, apuntado: true },
    '2031-03-13': { falta: 'otro', horas: 0, apuntado: true },  // resta sus 7 h
  });
  const [f] = resumenMes(ds, '2031-03', '2031-03-03', '2031-12-31');
  expect(f).toMatchObject({ bolsaFin: -7, vacaciones: 1, baja: 1, otra: 1 });
});

test('bolsa: cada semana va al mes de su domingo, y solo cuenta desde que empieza la bolsa', () => {
  // la semana del 24/2 al 2/3 cuenta en marzo; la del 31/3 al 6/4, en abril
  const ds = dias('2031-02-24', '2031-04-06', { '2031-02-25': { horas: 9, trabajadas: 9 }, '2031-04-01': { horas: 12, trabajadas: 12 } });
  const [marzo] = resumenMes(ds, '2031-03', '2031-02-24', '2031-12-31');
  expect(marzo).toMatchObject({ trabajadas: 37 + 35 * 4, bolsaInicio: 0, bolsaVariacion: 2, bolsaFin: 2 });
  const [abril] = resumenMes(ds, '2031-04', '2031-02-24', '2031-12-31');
  expect(abril).toMatchObject({ bolsaInicio: 2, bolsaVariacion: 5, bolsaFin: 7 });
  // si la bolsa empieza el 3/3, esa primera semana no suma
  const [desdeMarzo] = resumenMes(ds, '2031-03', '2031-03-03', '2031-12-31');
  expect(desdeMarzo.bolsaFin).toBe(0);
});

test('bolsa: solo días ya pasados (la semana a medias no cuenta) y horas de contrato propias', () => {
  const ds = dias('2031-03-03', '2031-03-16', { '2031-03-10': { horas: 10 } }, { horas_semana: 38 });
  const [f] = resumenMes(ds, '2031-03', '2031-03-03', '2031-03-12');
  expect(f).toMatchObject({ contrato: 38, trabajadas: 35, bolsaFin: -3 }); // solo la 1.ª semana: 35 h de 38
});

test('jornada parcial: suma lo del mes, sin bolsa ni extras', () => {
  const ds = dias('2031-03-01', '2031-03-31', {}, { jornada: 'parcial', horas_semana: 16 });
  const [f] = resumenMes(ds, '2031-03', '2031-03-03', '2031-12-31');
  expect(f).toMatchObject({ jornada: 'Parcial', contrato: 16, bolsaFin: null, extraSemana: null });
  expect(f.trabajadas).toBe(7 * 21);
});

// ---------- las pantallas ----------
const UNIDAD = 'eeeeeeee-0000-0000-0000-000000000001';
const LOLA = 'eeeeeeee-0000-0000-0000-0000000000f1';
const PEPE = 'eeeeeeee-0000-0000-0000-0000000000f2';
const hoy = new Date().toLocaleDateString('sv-SE');
const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-e', nombre: 'Unidad E', modulos: ['personal'], permisos }],
});
const JEFE = ['nucleo.persona.ver', 'personal.modulo.ver', 'personal.tarea.ver', 'personal.calendario.ver', 'personal.horas.editar', 'nucleo.configuracion.editar'];
const OPERARIO = ['personal.modulo.ver', 'personal.tarea.ver'];
const rpc = {
  horas_dias: (b: Record<string, unknown>) => {
    const ps = [{ persona_id: LOLA, nombre: 'Lola Prueba', jornada: 'completa', horas_semana: 35 }, { persona_id: PEPE, nombre: 'Pepe Prueba', jornada: 'parcial', horas_semana: 16 }]
      .filter((p) => !b.p_persona || p.persona_id === b.p_persona);
    return ps.flatMap((p) => dias(String(b.p_desde), String(b.p_hasta), p.persona_id === LOLA ? { [hoy]: { tipo_dia: 'intensiva', prevista: 6, horas: 6 } } : {}, p));
  },
  guardar_horas_dia: (b: Record<string, unknown>) => (b.p_items as unknown[]).length,
};
const tablas = () => ({
  personas: [{ id: LOLA, empresa_id: UNIDAD, nombre: 'Lola Prueba', jornada: 'completa', horas_semana: 35, horario: { lunes: [['08:00', '13:00'], ['14:00', '16:00']] }, baja: null }],
  usuarios: [{ id: USUARIO.id, nombre: 'Lola Prueba', persona_id: LOLA }],
  ajustes: [{ id: 'aj1', empresa_id: UNIDAD, modulo: 'personal', clave: 'bolsa_inicio', valor: '2026-10-05', centro_id: null }],
  calendarios: [], calendario_personas: [], v_envios: [], dias: [], vacaciones: [],
});

test('horas del día: salen las que le tocan a cada uno y se apunta lo distinto con su motivo', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/horas');
  const lola = page.locator('.horas-dia', { hasText: 'Lola Prueba' });
  const pepe = page.locator('.horas-dia', { hasText: 'Pepe Prueba' });
  await expect(lola).toContainText('Le tocan 6 h · Jornada intensiva');
  await expect(page.getByLabel('Horas trabajadas de Lola Prueba')).toHaveAttribute('placeholder', '6');
  await page.getByLabel('Horas trabajadas de Lola Prueba').fill('8,5');
  await page.getByLabel('Extra a mano de Lola Prueba').fill('2');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Escribe el motivo de las horas fuera de presupuesto o extra (Lola Prueba).');
  await page.getByLabel('Motivo de Lola Prueba').fill('Derrame en la F99');
  await page.getByLabel('Falta de Pepe Prueba').selectOption({ label: 'Baja' });
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Horas guardadas')).toBeVisible();
  const b = sim.find((l) => l.ruta.includes('/rpc/guardar_horas_dia'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_empresa: UNIDAD, p_fecha: hoy });
  expect(b.p_items).toEqual([
    { persona_id: LOLA, trabajadas: 8.5, fuera: 0, extra_mano: 2, falta: null, nota: 'Derrame en la F99' },
    { persona_id: PEPE, trabajadas: null, fuera: 0, extra_mano: null, falta: 'baja', nota: null }]);
  await expect(pepe).toBeVisible();
  expect(errores).toEqual([]);
});

test('horas del mes: resumen con la bolsa y Excel como el de la app vieja', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/horas');
  await page.getByRole('group', { name: 'Horas' }).getByRole('button', { name: 'Horas del mes' }).click();
  await expect(page.getByText('La bolsa de horas cuenta desde el lunes 5/10/2026')).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Lola Prueba' })).toContainText('Completa · 35 h/semana');
  await expect(page.locator('.fila', { hasText: 'Lola Prueba' }).locator('.chapa')).toContainText('Bolsa');
  await expect(page.locator('.fila', { hasText: 'Pepe Prueba' })).toContainText('Parcial · 16 h/semana');
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel del mes' }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toBe(`horas_${hoy.slice(0, 7)}.csv`);
  const texto = (await (await import('node:fs/promises')).readFile((await d.path())!)).toString('utf8');
  expect(texto.split('\r\n')[0]).toContain('Nombre;Jornada;Horas de contrato;Horas trabajadas;Horas normales');
  expect(texto).toContain('Pepe Prueba;Parcial;16;');
  // cambiar desde cuándo cuenta la bolsa: tiene que ser lunes
  await page.getByRole('button', { name: 'Cambiar' }).click();
  await page.getByLabel('La bolsa de horas empieza (con 0 h) el lunes').fill('2026-10-06');
  await page.locator('.caja-aviso').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.caja-aviso').getByRole('alert')).toContainText('Tiene que ser un lunes');
});

test('mis horas: el trabajador ve sus horas y su bolsa, y no la pestaña de todos', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(OPERARIO), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/mis-horas');
  await expect(page.locator('.cifras')).toContainText('trabajadas');
  await expect(page.locator('.cifras')).toContainText('en tu bolsa');
  await expect(page.getByRole('button', { name: 'Horas', exact: true })).toHaveCount(0);
  const pedida = sim.filter((l) => l.ruta.includes('/rpc/horas_dias')).map((l) => l.cuerpo as Record<string, unknown>);
  expect(pedida.every((b) => b.p_persona === LOLA)).toBe(true);
});

test('la ficha del trabajador: horas de contrato y horario escrito a mano', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: { ...sesion([...PERMISOS_ADMIN]), empresas: [{ id: UNIDAD, codigo: 'unidad-e', nombre: 'Unidad E', modulos: ['personal'], permisos: PERMISOS_ADMIN }] }, tablas: tablas() });
  await page.goto('./#/config/personas');
  await page.locator('.fila', { hasText: 'Lola Prueba' }).click();
  await expect(page.getByLabel('Horario del lunes')).toHaveValue('8-13, 14-16');
  await page.getByLabel('Horario del viernes').fill('7 a 14');
  await page.getByLabel('Horario del sábado').fill('14-8');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toContainText('El horario del sábado no cuadra');
  await page.getByLabel('Horario del sábado').fill('');
  await page.getByLabel('Horas de contrato a la semana').fill('38');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'PATCH' && l.ruta.startsWith('/rest/v1/personas'))!.cuerpo).toMatchObject({
    horas_semana: 38, horario: { lunes: [['08:00', '13:00'], ['14:00', '16:00']], viernes: [['07:00', '14:00']] } });
});

test('Horas en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/horas');
  await expect(page.locator('.horas-dia', { hasText: 'Lola Prueba' })).toBeVisible();
  expect(await desbordes(page), 'día').toEqual([]);
  await page.getByRole('group', { name: 'Horas' }).getByRole('button', { name: 'Horas del mes' }).click();
  await expect(page.locator('.fila', { hasText: 'Lola Prueba' })).toBeVisible();
  expect(await desbordes(page), 'mes').toEqual([]);
});
