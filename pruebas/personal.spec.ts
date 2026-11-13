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

test('el jefe marca dos festivos en el calendario del equipo', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal');
  await expect(page.getByRole('button', { name: 'Calendario', pressed: true })).toBeVisible();
  await expect(page.locator('.lista-dias').first()).toContainText('Año nuevo');
  await page.getByRole('button', { name: new RegExp(`^6 de enero`) }).click();
  await page.getByRole('button', { name: new RegExp(`^19 de marzo`) }).click();
  await expect(page.locator('.barra-abajo')).toContainText('2 días elegidos');
  await page.locator('.barra-abajo').getByRole('button', { name: 'Marcar' }).click();
  await page.getByLabel('Nombre (opcional)').fill('Fiesta local');
  await page.getByLabel(/También en Fin de semana/).check();
  await page.locator('.ventana-pie').getByRole('button', { name: 'Marcar' }).click();
  await expect(page.locator('.lista-dias').first()).toContainText('Fiesta local');
  const llamada = sim.find((l) => l.ruta.includes('/rpc/marcar_dias'))!;
  expect(llamada.perfil).toBe('personal');
  expect(llamada.cuerpo).toMatchObject({ p_calendarios: [SEMANA, FINDE], p_fechas: [`${ANIO}-01-06`, `${ANIO}-03-19`], p_tipo: 'festivo', p_nombre: 'Fiesta local' });
  expect(errores).toEqual([]);
});

test('desde el calendario: elegir días y ponerlos de vacaciones a quien se quiera', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await expect(page.locator('.lista-dias').last()).toContainText('Ana Prueba');
  for (const d of ['^20 de abril', '^21 de abril', '^24 de abril']) await page.getByRole('button', { name: new RegExp(d) }).click();
  await page.locator('.barra-abajo').getByRole('button', { name: 'Marcar' }).click();
  await page.getByRole('dialog').locator('.opcion', { hasText: 'Para todos los de este calendario' }).click();
  await expect(page.getByText('¿Quién? (2 de 2)')).toBeVisible();
  await page.locator('.fila.check', { hasText: 'Bruno Prueba' }).getByRole('checkbox').uncheck();
  await page.getByLabel('Nota (opcional)').fill('Semana Santa');
  await page.getByRole('button', { name: 'Poner vacaciones' }).click();
  await expect(page.getByText('Vacaciones puestas')).toBeVisible();
  const nuevas = sim.tablas.vacaciones.filter((v) => v.nota === 'Semana Santa');
  expect(nuevas.map((v) => [v.persona_id, v.desde, v.hasta])).toEqual([[ANA, `${ANIO}-04-20`, `${ANIO}-04-21`], [ANA, `${ANIO}-04-24`, `${ANIO}-04-24`]]);
  await expect(page.locator('.lista-dias').last()).toContainText('Semana Santa');
  expect(errores).toEqual([]);
});

test('crear un calendario solo para algunos, copiando los días de otro', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await expect(page.getByRole('button', { name: 'Para 2 personas · cambiar' })).toBeVisible();
  await page.getByRole('button', { name: '+ Nuevo calendario' }).click();
  await page.getByLabel('Nombre').fill(`Refuerzo ${ANIO}`);
  await page.getByLabel('Horas del martes').fill('');
  await page.getByLabel('Horas del jueves').fill('');
  await page.getByLabel('Horas del viernes').fill('6,5');
  await page.getByLabel('Horas que hay que trabajar al año').fill('1000');
  await page.getByLabel('Copiar los días marcados de (opcional)').selectOption({ label: 'Semana' });
  await page.locator('.fila.check', { hasText: 'Bruno Prueba' }).getByRole('checkbox').check();
  await expect(page.locator('.fila.check', { hasText: 'Bruno Prueba' })).toContainText('Ahora en «Semana»');
  await expect(page.getByText('1 persona se cambiará a este')).toBeVisible();
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Calendario creado')).toBeVisible();
  const nuevo = sim.tablas.calendarios.find((c) => c.nombre === `Refuerzo ${ANIO}`)!;
  expect(nuevo).toMatchObject({ empresa_id: UNIDAD, anio: ANIO, dias_semana: [1, 3, 5], horas_dia: [0, 8, 0, 8, 0, 6.5, 0], horas_anuales: 1000 });
  expect(sim.find((l) => l.ruta.includes('/rpc/poner_personas'))!.cuerpo).toEqual({ p_calendario: nuevo.id, p_personas: [BRUNO] });
  expect(sim.find((l) => l.ruta.includes('/rpc/copiar_dias'))!.cuerpo).toEqual({ p_de: SEMANA, p_a: nuevo.id });
  await expect(page.getByLabel('Calendario')).toHaveValue(String(nuevo.id));
  await expect(page.getByRole('button', { name: 'Para 1 persona · cambiar' })).toBeVisible();
  await expect(page.locator('.lista-dias').first()).toContainText('Año nuevo');
  expect(errores).toEqual([]);
});

test('horas del año: ver quién cuadra, poner horas propias y no dejar enviar si no cuadra', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas();
  t.calendario_personas[1].horas_anuales = 1000;
  const r = { ...rpc, enviar_calendario: () => { throw new Error('NO_CUADRA: Bruno Prueba'); } };
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: t, rpc: r });
  await page.goto('./#/m/personal/calendario');
  const cuadro = page.getByRole('region', { name: 'Horas del año' });
  await expect(cuadro).toContainText('1 sin cuadrar');
  await expect(cuadro.locator('.fila', { hasText: 'Ana Prueba' })).toContainText('1712 h de 1712 h · 10 días de vacaciones');
  await expect(cuadro.locator('.fila', { hasText: 'Ana Prueba' }).locator('.chapa')).toHaveText('Cuadra');
  await expect(cuadro.locator('.fila', { hasText: 'Bruno Prueba' })).toContainText('horas propias');
  await expect(cuadro.locator('.fila', { hasText: 'Bruno Prueba' }).locator('.chapa')).toHaveText('Sobran 704 h');
  await cuadro.locator('.fila', { hasText: 'Bruno Prueba' }).getByRole('button', { name: 'Otras horas' }).click();
  await page.getByLabel('Sus horas al año').fill('1704');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(cuadro).toContainText('Todo cuadra');
  expect(sim.tablas.calendario_personas[1].horas_anuales).toBe(1704);

  // si no cuadra, la app no deja enviar y dice a quién
  await page.getByRole('button', { name: 'Firmas' }).click();
  await page.getByLabel('Elegir a Bruno Prueba').check();
  await page.getByRole('button', { name: 'Enviar a firmar (1)' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se puede enviar: no cuadran las horas de Bruno Prueba. Míralo en la pestaña Calendario.');
  expect(errores).toEqual([]);
});

test('marcar un día que trabaja pide sus horas', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(PERMISOS_JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/personal/calendario');
  await page.getByRole('button', { name: new RegExp('^4 de julio') }).click();
  await page.locator('.barra-abajo').getByRole('button', { name: 'Marcar' }).click();
  await page.getByRole('dialog').locator('.opcion', { hasText: 'Día de trabajo aunque no sea' }).click();
  await page.locator('.ventana-pie').getByRole('button', { name: 'Marcar' }).click();
  await expect(page.getByText('Pon cuántas horas se trabaja ese día.')).toBeVisible();
  await page.getByLabel(/^Horas de ese día/).fill('4,5');
  await page.locator('.ventana-pie').getByRole('button', { name: 'Marcar' }).click();
  await expect(page.locator('.lista-dias').first()).toContainText('Trabaja · 4,5 h');
  expect(sim.find((l) => l.ruta.includes('/rpc/marcar_dias'))!.cuerpo).toMatchObject({ p_tipo: 'trabaja', p_horas: 4.5 });
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
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' }).locator('.chapa')).toHaveText('Firmado');
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
});
