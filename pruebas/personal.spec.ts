// Personal · Calendario laboral: el jefe marca días, pone vacaciones y envía a firmar; el trabajador firma el suyo.
// Unidades y personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = 'cccccccc-0000-0000-0000-000000000001';
const SEMANA = 'cccccccc-0000-0000-0000-0000000000e1';
const FINDE = 'cccccccc-0000-0000-0000-0000000000e2';
const ANA = 'cccccccc-0000-0000-0000-0000000000f1';
const BRUNO = 'cccccccc-0000-0000-0000-0000000000f2';
const ANIO = new Date().getFullYear();

const PERMISOS_JEFE = ['nucleo.persona.ver', 'personal.calendario.editar', 'personal.calendario.ver', 'personal.firma.enviar',
  'personal.firma.ver', 'personal.modulo.ver', 'personal.tarea.ver', 'personal.vacaciones.editar'];
const sesion = (permisos: string[], nombre = 'Jefa Prueba') => ({
  usuario: { id: USUARIO.id, nombre, superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-c', nombre: 'Unidad C', modulos: ['personal'], permisos }],
});

const foto = (persona: string) => ({
  anio: ANIO, unidad: 'Unidad C', equipo: 'Semana', trabajador: persona === ANA ? 'Ana Prueba' : 'Bruno Prueba', dias_equipo: [1, 2, 3, 4, 5],
  dias: [{ fecha: `${ANIO}-01-01`, tipo: 'festivo', nombre: 'Año nuevo', horario: null }, { fecha: `${ANIO}-07-01`, tipo: 'intensiva', nombre: null, horario: '7:00 a 15:00' }],
  vacaciones: [{ desde: `${ANIO}-08-03`, hasta: `${ANIO}-08-14`, nota: 'Verano' }],
});
const envio = (persona: string, estado: 'pendiente' | 'firmado') => ({
  id: 'env-' + persona.slice(-2), empresa_id: UNIDAD, anio: ANIO, equipo_id: SEMANA, persona_id: persona, datos: foto(persona), sha256: 'a'.repeat(64),
  enviado: `${ANIO}-01-10T09:00:00Z`, anulado: null, estado, firmado_en: estado === 'firmado' ? `${ANIO}-01-11T10:00:00Z` : null,
  conforme: estado === 'firmado' ? true : null, comentario: null, firma_imagen: null,
});

const tablas = () => ({
  equipos: [{ id: SEMANA, empresa_id: UNIDAD, nombre: 'Semana', dias: [1, 2, 3, 4, 5], baja: null }, { id: FINDE, empresa_id: UNIDAD, nombre: 'Fin de semana', dias: [0, 6], baja: null }],
  personas: [{ id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba', equipo_id: SEMANA, baja: null }, { id: BRUNO, empresa_id: UNIDAD, nombre: 'Bruno Prueba', equipo_id: SEMANA, baja: null }],
  usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', persona_id: ANA }],
  dias: [{ empresa_id: UNIDAD, equipo_id: SEMANA, fecha: `${ANIO}-01-01`, tipo: 'festivo', nombre: 'Año nuevo', horario: null }],
  vacaciones: [{ id: 'v1', empresa_id: UNIDAD, persona_id: ANA, desde: `${ANIO}-08-03`, hasta: `${ANIO}-08-14`, nota: 'Verano' }],
  v_envios: [envio(ANA, 'firmado'), envio(BRUNO, 'pendiente')],
});

const rpc = {
  marcar_dias: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const fechas = b.p_fechas as string[], equipos = b.p_equipos as string[];
    t.dias.splice(0, t.dias.length, ...t.dias.filter((d) => !(equipos.includes(String(d.equipo_id)) && fechas.includes(String(d.fecha)))));
    if (b.p_tipo) for (const e of equipos) for (const f of fechas) t.dias.push({ empresa_id: UNIDAD, equipo_id: e, fecha: f, tipo: b.p_tipo, nombre: b.p_nombre, horario: b.p_horario });
    return fechas.length * equipos.length;
  },
  enviar_calendario: (b: Record<string, unknown>) => (b.p_personas as string[]).length,
  firmar_calendario: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    if (!String(b.p_imagen).startsWith('data:image/png;base64,')) throw new Error('FIRMA_MAL');
    Object.assign(t.v_envios.find((e) => e.id === b.p_envio)!, { estado: 'firmado', firmado_en: new Date().toISOString(), conforme: b.p_conforme });
    return 'firma-1';
  },
};

async function firmarConElDedo(page: Page) {
  const caja = (await page.locator('.firma canvas').boundingBox())!;
  await page.mouse.move(caja.x + 30, caja.y + 120);
  await page.mouse.down();
  await page.mouse.move(caja.x + 90, caja.y + 50, { steps: 6 });
  await page.mouse.move(caja.x + 160, caja.y + 130, { steps: 6 });
  await page.mouse.up();
}

test('el jefe marca dos festivos en el calendario del equipo', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal');
  await expect(page.getByRole('button', { name: 'Calendario', pressed: true })).toBeVisible();
  await expect(page.locator('.lista-dias')).toContainText('Año nuevo');
  await page.getByRole('button', { name: new RegExp(`^6 de enero`) }).click();
  await page.getByRole('button', { name: new RegExp(`^19 de marzo`) }).click();
  await expect(page.locator('.barra-abajo')).toContainText('2 días elegidos');
  await page.locator('.barra-abajo').getByRole('button', { name: 'Marcar' }).click();
  await page.getByLabel('Nombre (opcional)').fill('Fiesta local');
  await page.getByLabel(/También en Fin de semana/).check();
  await page.locator('.ventana-pie').getByRole('button', { name: 'Marcar' }).click();
  await expect(page.locator('.lista-dias')).toContainText('Fiesta local');
  const llamada = sim.find((l) => l.ruta.includes('/rpc/marcar_dias'))!;
  expect(llamada.perfil).toBe('personal');
  expect(llamada.cuerpo).toMatchObject({ p_empresa: UNIDAD, p_equipos: [SEMANA, FINDE], p_fechas: [`${ANIO}-01-06`, `${ANIO}-03-19`], p_tipo: 'festivo', p_nombre: 'Fiesta local' });
  expect(errores).toEqual([]);
});

test('el jefe pone vacaciones y envía el calendario a quien falta por firmar', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/vacaciones');
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' })).toContainText('12 días · Verano');
  await page.getByRole('button', { name: 'Añadir vacaciones a Bruno Prueba' }).click();
  await page.getByLabel('Desde').fill(`${ANIO}-09-07`);
  await page.getByLabel('Hasta (incluido)').fill(`${ANIO}-09-11`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'Bruno Prueba' })).toContainText('5 días');
  expect(sim.tablas.vacaciones.find((v) => v.persona_id === BRUNO)).toMatchObject({ empresa_id: UNIDAD, desde: `${ANIO}-09-07`, hasta: `${ANIO}-09-11` });

  await page.getByRole('button', { name: 'Firmas' }).click();
  await expect(page.getByText(/Han firmado 1 de 2/)).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' }).locator('.chapa')).toHaveText('Firmado');
  await page.getByLabel('Elegir a Bruno Prueba').check();
  await page.getByRole('button', { name: 'Enviar a firmar (1)' }).click();
  await expect(page.getByText('Enviado a 1 trabajador')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/enviar_calendario'))!.cuerpo).toMatchObject({ p_empresa: UNIDAD, p_anio: ANIO, p_equipo: SEMANA, p_personas: [BRUNO] });
});

test('la trabajadora ve su calendario pendiente y lo firma con el dedo', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas(); t.v_envios = [envio(ANA, 'pendiente')];
  const sim = await simular(page, { dentro: true, sesion: sesion(['personal.tarea.ver'], 'Ana Prueba'), tablas: t, rpc });
  await page.goto('./#/');
  await page.locator('.mosaico', { hasText: 'Personal' }).click();
  await expect(page.locator('.pestanas')).toHaveCount(0);
  await expect(page.getByText('Tienes un calendario por revisar y firmar.')).toBeVisible();
  await page.locator('.fila', { hasText: `Calendario laboral ${ANIO}` }).click();
  await expect(page.locator('.documento')).toContainText('Ana Prueba · Semana');
  await expect(page.locator('.documento')).toContainText('Tus vacaciones (12 días)');
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await expect(page.getByText('Falta la firma.')).toBeVisible();
  await firmarConElDedo(page);
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await expect(page.getByText('Calendario firmado')).toBeVisible();
  await expect(page.locator('.fila .chapa')).toHaveText('Firmado');
  const b = sim.find((l) => l.ruta.includes('/rpc/firmar_calendario'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_envio: 'env-f1', p_conforme: true, p_comentario: null });
  expect(String(b.p_imagen)).toMatch(/^data:image\/png;base64,/);
  expect(errores).toEqual([]);
});

test('no conforme: hay que explicar por qué', async ({ page }) => {
  const t = tablas(); t.v_envios = [envio(ANA, 'pendiente')];
  const sim = await simular(page, { dentro: true, sesion: sesion(['personal.tarea.ver'], 'Ana Prueba'), tablas: t, rpc });
  await page.goto('./#/m/personal');
  await page.locator('.fila', { hasText: `Calendario laboral ${ANIO}` }).click();
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await page.getByRole('button', { name: 'Con observaciones' }).click();
  await firmarConElDedo(page);
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await expect(page.getByText('Explica qué no está bien.')).toBeVisible();
  await page.getByLabel('¿Qué no está bien?').fill('Faltan mis vacaciones de octubre');
  await page.locator('.ventana-pie').getByRole('button', { name: 'Firmar' }).click();
  await expect(page.getByText('Calendario firmado')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/firmar_calendario'))!.cuerpo).toMatchObject({ p_conforme: false, p_comentario: 'Faltan mis vacaciones de octubre' });
});

test('Personal en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  for (const p of ['calendario', 'vacaciones', 'firmas']) {
    await page.goto(`./#/m/personal/${p}`);
    await expect(page.getByRole('button', { name: p === 'calendario' ? 'Calendario' : p === 'vacaciones' ? 'Vacaciones' : 'Firmas', pressed: true })).toBeVisible();
    await expect(page.locator('.lista, .anio').first()).toBeVisible();
    expect(await desbordes(page), p).toEqual([]);
  }
  await page.locator('.fila', { hasText: 'Ana Prueba' }).getByRole('button', { name: 'Ver' }).click();
  await expect(page.locator('.documento .anio')).toBeVisible();
  expect(await desbordes(page), 'documento').toEqual([]);
});
