// Personal · Calendario laboral: el jefe marca días, pone vacaciones y envía a firmar; el trabajador firma el suyo.
// Unidades y personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = 'cccccccc-0000-0000-0000-000000000001';
const SEMANA = 'cccccccc-0000-0000-0000-0000000000e1'; // calendario «Semana»
const FINDE = 'cccccccc-0000-0000-0000-0000000000e2';  // calendario «Fin de semana»
const ANA = 'cccccccc-0000-0000-0000-0000000000f1';
const BRUNO = 'cccccccc-0000-0000-0000-0000000000f2';
const CARLA = 'cccccccc-0000-0000-0000-0000000000f3';
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
  id: 'env-' + persona.slice(-2), empresa_id: UNIDAD, anio: ANIO, calendario_id: SEMANA, persona_id: persona, datos: foto(persona), sha256: 'a'.repeat(64),
  enviado: `${ANIO}-01-10T09:00:00Z`, anulado: null, estado, firmado_en: estado === 'firmado' ? `${ANIO}-01-11T10:00:00Z` : null,
  conforme: estado === 'firmado' ? true : null, comentario: null, firma_imagen: null,
});

const tablas = () => ({
  calendarios: [{ id: SEMANA, empresa_id: UNIDAD, anio: ANIO, nombre: 'Semana', dias_semana: [1, 2, 3, 4, 5], horas_dia: [0, 8, 8, 8, 8, 6, 0], horas_anuales: 1712 },
    { id: FINDE, empresa_id: UNIDAD, anio: ANIO, nombre: 'Fin de semana', dias_semana: [0, 6], horas_dia: null, horas_anuales: null }],
  calendario_personas: [{ empresa_id: UNIDAD, anio: ANIO, persona_id: ANA, calendario_id: SEMANA, horas_anuales: null }, { empresa_id: UNIDAD, anio: ANIO, persona_id: BRUNO, calendario_id: SEMANA, horas_anuales: null }],
  personas: [{ id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba', baja: null }, { id: BRUNO, empresa_id: UNIDAD, nombre: 'Bruno Prueba', baja: null },
    { id: CARLA, empresa_id: UNIDAD, nombre: 'Carla Finde', baja: null }],
  usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', persona_id: ANA }],
  dias: [{ empresa_id: UNIDAD, calendario_id: SEMANA, fecha: `${ANIO}-01-01`, tipo: 'festivo', nombre: 'Año nuevo', horario: null }],
  vacaciones: [{ id: 'v1', empresa_id: UNIDAD, persona_id: ANA, desde: `${ANIO}-08-03`, hasta: `${ANIO}-08-14`, nota: 'Verano' }],
  v_envios: [envio(ANA, 'firmado'), envio(BRUNO, 'pendiente')],
});

const rpc = {
  marcar_dias: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const fechas = b.p_fechas as string[], cals = b.p_calendarios as string[];
    t.dias.splice(0, t.dias.length, ...t.dias.filter((d) => !(cals.includes(String(d.calendario_id)) && fechas.includes(String(d.fecha)))));
    if (b.p_tipo) for (const c of cals) for (const f of fechas) t.dias.push({ empresa_id: UNIDAD, calendario_id: c, fecha: f, tipo: b.p_tipo, nombre: b.p_nombre, horario: b.p_horario, horas: b.p_horas ?? null });
    return fechas.length * cals.length;
  },
  enviar_calendario: (b: Record<string, unknown>) => (b.p_personas as string[]).length,
  guardar_calendario: (b: Record<string, unknown>) => b.p_calendario ?? 'cal-nuevo',
  // horas: Ana cuadra; Bruno, que tiene sus propias 1000 h, no
  horas_personas: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => t.calendario_personas
    .filter((m) => m.calendario_id === b.p_calendario).map((m) => {
      const cal = t.calendarios.find((c) => c.id === m.calendario_id)!;
      const objetivo = (m.horas_anuales ?? cal.horas_anuales) as number | null;
      return { persona_id: m.persona_id, nombre: m.persona_id === ANA ? 'Ana Prueba' : m.persona_id === BRUNO ? 'Bruno Prueba' : 'Carla Finde',
        objetivo, horas: m.persona_id === BRUNO ? 1704 : objetivo ?? 0, vacaciones: m.persona_id === ANA ? 10 : 0 };
    }),
  poner_personas: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const ps = b.p_personas as string[];
    t.calendario_personas.splice(0, t.calendario_personas.length, ...t.calendario_personas.filter((m) => m.calendario_id !== b.p_calendario && !ps.includes(String(m.persona_id))));
    for (const p of ps) t.calendario_personas.push({ empresa_id: UNIDAD, anio: ANIO, persona_id: p, calendario_id: b.p_calendario });
    return ps.length;
  },
  copiar_dias: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const de = t.dias.filter((d) => d.calendario_id === b.p_de).map((d) => ({ ...d, calendario_id: b.p_a }));
    t.dias.push(...de); return de.length;
  },
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

test('calendario de un operario: al tocar los días se suman las horas al momento', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' })).toContainText('Semana · 1712 h de 1712 h');
  await expect(page.locator('.fila', { hasText: 'Carla Finde' }).locator('.chapa')).toHaveText('Sin hacer');
  await page.getByRole('button', { name: /^Ana Prueba/ }).click();
  await expect(page.getByText('se parte del calendario «Semana»')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Borrar todo' }).click();
  await page.getByLabel('Horas al año').fill('22');
  const contador = page.getByRole('status', { name: 'Horas que llevas' });
  await expect(contador).toContainText('Llevas 0 h de 22 h · faltan 22 h');
  // con 8 h en el pincel: cada toque suma 8 al momento
  await page.getByRole('button', { name: /^2 de marzo/ }).click();
  await expect(contador).toContainText('Llevas 8 h de 22 h · faltan 14 h');
  await page.getByRole('button', { name: /^3 de marzo/ }).click();
  await expect(contador).toContainText('Llevas 16 h de 22 h · faltan 6 h');
  await page.getByRole('button', { name: /^4 de marzo/ }).click();
  await expect(contador).toContainText('Llevas 24 h de 22 h · sobran 2 h');
  await page.getByRole('button', { name: /^4 de marzo/ }).click(); // tocar otra vez lo quita
  await expect(contador).toContainText('Llevas 16 h de 22 h · faltan 6 h');
  // cambio a 6 h y toco el viernes
  await page.getByLabel('Horas que se ponen al tocar un día').fill('6');
  await page.getByRole('button', { name: /^6 de marzo/ }).click();
  await expect(contador).toContainText('22 h de 22 h · Cuadra al 100 %');
  await expect(page.getByRole('button', { name: /^6 de marzo · 6 h/ })).toBeVisible();
  // festivo
  await page.getByRole('group', { name: 'Al tocar un día se pone' }).getByRole('button', { name: 'Festivo' }).click();
  await page.getByRole('button', { name: /^19 de marzo/ }).click();
  await expect(page.getByRole('button', { name: /^19 de marzo · Festivo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Calendario guardado')).toBeVisible();
  const b = sim.find((l) => l.ruta.includes('/rpc/guardar_calendario'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_empresa: UNIDAD, p_anio: ANIO, p_calendario: null, p_nombre: `Ana Prueba ${ANIO}`, p_horas_anuales: 22, p_personas: [ANA], p_vacaciones: [] });
  expect(b.p_dias).toEqual([
    { fecha: `${ANIO}-03-02`, tipo: 'trabaja', horas: 8, nombre: null }, { fecha: `${ANIO}-03-03`, tipo: 'trabaja', horas: 8, nombre: null },
    { fecha: `${ANIO}-03-06`, tipo: 'trabaja', horas: 6, nombre: null }, { fecha: `${ANIO}-03-19`, tipo: 'festivo', horas: null, nombre: null }]);
  expect(errores).toEqual([]);
});

test('varios operarios a la vez, con vacaciones que restan al momento, y rellenar por días de la semana', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await page.getByLabel('Elegir a Ana Prueba').check();
  await page.getByLabel('Elegir a Bruno Prueba').check();
  await page.getByRole('button', { name: 'Hacer su calendario' }).click();
  await expect(page.getByText('Ana Prueba, Bruno Prueba')).toBeVisible();
  await expect(page.getByLabel('Nombre del calendario')).toHaveValue('Semana');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Borrar todo' }).click();
  await page.getByRole('button', { name: 'Rellenar por días de la semana' }).click();
  await page.getByLabel('Horas del viernes').fill('');
  await page.getByRole('button', { name: 'Rellenar', exact: true }).click();
  await expect(page.getByRole('button', { name: /^5 de enero · 8 h/ })).toBeVisible(); // lunes
  await expect(page.getByRole('button', { name: /^2 de enero$/ })).toBeVisible();      // viernes: sin horas
  const contador = page.getByRole('status', { name: 'Horas que llevas' });
  const antes = await contador.textContent();
  await page.getByRole('group', { name: 'Al tocar un día se pone' }).getByRole('button', { name: 'Vacaciones' }).click();
  // 10 y 11 de agosto (lunes y martes de 2026): a cada uno le restan 16 h
  await page.getByRole('button', { name: /^10 de agosto/ }).click();
  await page.getByRole('button', { name: /^11 de agosto/ }).click();
  await expect(contador).not.toHaveText(antes ?? '');
  await expect(page.getByText('Vacaciones nuevas (se guardan al pulsar Guardar)')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Calendario guardado')).toBeVisible();
  const b = sim.find((l) => l.ruta.includes('/rpc/guardar_calendario'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_calendario: SEMANA, p_nombre: 'Semana', p_personas: [ANA, BRUNO] });
  // Ana ya tenía vacaciones esos días (guardadas): solo se le ponen a Bruno
  expect(b.p_vacaciones).toEqual([{ persona_id: BRUNO, desde: `${ANIO}-08-10`, hasta: `${ANIO}-08-11`, nota: null }]);
  const dias = b.p_dias as { fecha: string; horas: number }[];
  expect(dias.every((d) => new Date(d.fecha + 'T12:00:00Z').getUTCDay() >= 1 && new Date(d.fecha + 'T12:00:00Z').getUTCDay() <= 4 && d.horas === 8)).toBe(true);
});

test('salir sin guardar avisa', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await page.getByRole('button', { name: /^Bruno Prueba/ }).click();
  await page.getByLabel('Horas al año').fill('100');
  let pregunta = '';
  page.once('dialog', (d) => { pregunta = d.message(); d.dismiss(); });
  await page.getByRole('button', { name: 'Salir' }).click();
  expect(pregunta).toContain('Hay cambios sin guardar');
  await expect(page.getByLabel('Horas al año')).toHaveValue('100');
  expect(sim.some((l) => l.ruta.includes('guardar_calendario'))).toBe(false);
});

test('firmas: cuadro de horas, horas propias y no dejar enviar si no cuadra', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas();
  t.calendario_personas[1].horas_anuales = 1000;
  const r = { ...rpc, enviar_calendario: () => { throw new Error('NO_CUADRA: Bruno Prueba'); } };
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: t, rpc: r });
  await page.goto('./#/m/personal/firmas');
  const cuadro = page.getByRole('region', { name: 'Horas del año' });
  await expect(cuadro).toContainText('1 sin cuadrar');
  await expect(cuadro.locator('.fila', { hasText: 'Ana Prueba' }).locator('.chapa')).toHaveText('Cuadra');
  await expect(cuadro.locator('.fila', { hasText: 'Bruno Prueba' }).locator('.chapa')).toHaveText('Sobran 704 h');
  await cuadro.locator('.fila', { hasText: 'Bruno Prueba' }).getByRole('button', { name: 'Otras horas' }).click();
  await page.getByLabel('Sus horas al año').fill('1704');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(cuadro).toContainText('Todo cuadra');
  expect(sim.tablas.calendario_personas[1].horas_anuales).toBe(1704);
  await page.getByLabel('Elegir a Bruno Prueba').check();
  await page.getByRole('button', { name: 'Enviar a firmar (1)' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se puede enviar: no cuadran las horas de Bruno Prueba. Míralo en la pestaña Calendario.');
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

  await page.getByRole('button', { name: 'Vacaciones para todo Semana' }).click();
  await page.getByLabel('Desde').fill(`${ANIO}-12-24`);
  await page.getByLabel('Hasta (incluido)').fill(`${ANIO}-12-31`);
  await page.getByLabel('Nota (opcional)').fill('Navidad');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vacaciones puestas a 2 trabajadores')).toBeVisible();
  expect(sim.tablas.vacaciones.filter((v) => v.nota === 'Navidad').map((v) => v.persona_id).sort()).toEqual([ANA, BRUNO]);
  await expect(page.locator('.fila', { hasText: 'Bruno Prueba' })).toContainText('8 días · Navidad');

  await page.getByRole('button', { name: 'Firmas' }).click();
  await expect(page.getByText(/Han firmado 1 de 2/)).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' }).filter({ has: page.getByRole('checkbox') }).locator('.chapa')).toHaveText('Firmado');
  await page.getByLabel('Elegir a Bruno Prueba').check();
  await page.getByRole('button', { name: 'Enviar a firmar (1)' }).click();
  await expect(page.getByText('Enviado a 1 trabajador')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/enviar_calendario'))!.cuerpo).toMatchObject({ p_calendario: SEMANA, p_personas: [BRUNO] });
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
  await page.goto('./#/m/personal/calendario');
  await page.getByRole('button', { name: /^Ana Prueba/ }).click();
  await expect(page.getByRole('group', { name: 'Al tocar un día se pone' })).toBeVisible();
  expect(await desbordes(page), 'editor').toEqual([]);
});
