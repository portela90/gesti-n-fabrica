// Incidencias, problemas repetidos, tablón y «Te ha llegado». Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '37373737-0000-0000-0000-000000000001';
const OLI = '37373737-0000-0000-0000-0000000000f1';
const hoy = new Date().toLocaleDateString('sv-SE');
const ADMIN = ['nucleo.persona.ver', 'nucleo.aviso.editar', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.trabajo.apuntar', 'limpieza.incidencia.editar'];
const OPERARIO = ['limpieza.modulo.ver', 'limpieza.trabajo.apuntar'];
const sesion = (permisos = ADMIN) => ({
  usuario: { id: USUARIO.id, nombre: 'Ada Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-i', nombre: 'Unidad I', modulos: ['limpieza'], permisos }],
});
const inc = (id: string, texto: string, extra: Record<string, unknown> = {}) => ({
  id, empresa_id: UNIDAD, tema: 'Aceite', texto, lugar: 'F30', urgente: false, fotos: [], estado: 'abierta', origen: 'trabajo',
  creado: `${hoy}T08:00:00Z`, persona_id: OLI, trabajo_id: null, ...extra,
});
const tablas = () => ({
  usuarios: [{ id: USUARIO.id, nombre: 'Ada Prueba', persona_id: null }],
  personas: [{ id: OLI, empresa_id: UNIDAD, nombre: 'Oli Prueba', baja: null }],
  activos: [{ id: 'a30', empresa_id: UNIDAD, codigo: 'F30', baja: null }],
  incidencias: [inc('i1', 'Hay aceite en el suelo'), inc('i2', 'Botiquín sin tiritas', { urgente: true, tema: null, lugar: null, origen: 'encargado' }),
    inc('i3', 'Ya arreglado', { estado: 'resuelta' })] as Record<string, unknown>[],
  incidencia_notas: [{ id: 'n1', incidencia_id: 'i1', texto: 'Y ahora gotea más', estado: null, creado: `${hoy}T08:10:00Z`, creado_por: null }],
  temas: [{ id: 'tm1', empresa_id: UNIDAD, nombre: 'Aceite', palabras: ['aceite', 'hidraulic'], orden: 1, baja: null }],
  avisos: [{ id: 'av1', empresa_id: UNIDAD, titulo: 'Auditoría del cliente', texto: 'El jueves', hasta: hoy, anulado: null }] as Record<string, unknown>[],
  notificaciones: [{ id: 1, empresa_id: UNIDAD, titulo: 'Incidencia: Hay aceite en el suelo', texto: 'F30', ruta: '/m/limpieza/incidencias', creado: `${hoy}T08:00:00Z`, leido: null, urgente: false }] as Record<string, unknown>[],
});
const problema = { id: 'p1', tema: 'Aceite', lugar: 'F30', lugar_clave: 'F30', estado: 'pendiente', primera: hoy, ultima: hoy, reabierto: 0,
  casos: [{ caso: 'c1', fecha: hoy, titulo: 'Derrame de aceite', quien: 'Oli Prueba' }, { caso: 'c2', fecha: hoy, titulo: 'Hay aceite en el suelo', quien: 'Oli Prueba' }], notas: [] };
const rpc = (t = tablas()) => ({
  incidencia_estado: (b: Record<string, unknown>) => { Object.assign(t.incidencias.find((x) => x.id === b.p_id)!, { estado: b.p_estado }); return null; },
  incidencia_nota: () => null, crear_incidencia: () => 'i9', problemas_lista: () => [problema], problema_estado: () => null, problema_quitar: () => null,
  marcar_leidas: (b: Record<string, unknown>) => { t.notificaciones.forEach((n) => { if (!b.p_ids || (b.p_ids as number[]).includes(n.id as number)) n.leido = 'ya'; }); return null; },
});

test('la administradora: incidencias abiertas (urgentes primero), ponerla en proceso con nota', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas();
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: t, rpc: rpc(t) });
  await page.goto('./#/m/limpieza/incidencias');
  await expect(page.locator('.lista').first().locator('.fila b')).toHaveText(['Botiquín sin tiritas', 'Hay aceite en el suelo']);
  await expect(page.locator('.fila', { hasText: 'Hay aceite' })).toContainText('F30 · Aceite · Oli Prueba');
  await page.locator('.fila', { hasText: 'Hay aceite' }).click();
  const v = page.getByRole('dialog', { name: 'Incidencia' });
  await expect(v.locator('.seguimiento')).toContainText('Y ahora gotea más');
  await v.getByRole('button', { name: 'En proceso' }).click();
  await expect(v.getByRole('alert')).toContainText('Escribe una nota');
  await v.getByLabel(/Nota \(qué se ha hecho/).fill('Avisado a mantenimiento');
  await v.getByRole('button', { name: 'En proceso' }).click();
  await expect(page.getByText('Ahora: en proceso')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/incidencia_estado'))!.cuerpo).toEqual({ p_id: 'i1', p_estado: 'en_proceso', p_nota: 'Avisado a mantenimiento' });
  await page.getByRole('button', { name: 'Cerradas' }).click();
  await expect(page.locator('.fila', { hasText: 'Ya arreglado' })).toContainText('Resuelta');
  expect(errores).toEqual([]);
});

test('problemas repetidos: ver los casos y quitar uno que no es lo mismo', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/incidencias');
  await page.locator('.fila', { hasText: 'Aceite en F30' }).click();
  const v = page.getByRole('dialog', { name: 'Aceite en F30' });
  await expect(v.locator('.fila b')).toHaveText(['Derrame de aceite', 'Hay aceite en el suelo']);
  await v.locator('.fila', { hasText: 'Derrame de aceite' }).getByRole('button', { name: 'No es lo mismo' }).click();
  expect(sim.find((l) => l.ruta.includes('/rpc/problema_quitar'))!.cuerpo).toMatchObject({ p_id: 'p1', p_caso: 'c1' });
});

test('crear una incidencia a mano', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(OPERARIO), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/incidencias');
  await expect(page.getByText('Aquí ves las incidencias que has abierto tú')).toBeVisible();
  await page.getByRole('button', { name: '+ Incidencia' }).click();
  const v = page.getByRole('dialog', { name: 'Nueva incidencia' });
  await v.getByRole('button', { name: 'Crear' }).click();
  await expect(v.getByRole('alert')).toHaveText('Escribe qué pasa.');
  await v.getByLabel('¿Qué pasa?').fill('Fuga debajo de la máquina');
  await v.getByLabel('Máquina', { exact: true }).selectOption({ label: 'F30' });
  await v.getByLabel('Es urgente').check();
  await v.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Incidencia creada')).toBeVisible();
  const c = sim.find((l) => l.ruta.includes('/rpc/crear_incidencia'))!.cuerpo as Record<string, unknown>;
  expect(c).toMatchObject({ p_empresa: UNIDAD, p_texto: 'Fuga debajo de la máquina', p_activo: 'a30', p_urgente: true, p_fotos: [] });
  expect(String(c.p_id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.locator('.acciones-cal').getByRole('button', { name: 'Cerradas' })).toBeVisible();
});

test('inicio: el tablón y «Te ha llegado»; publicar un aviso', async ({ page }) => {
  const t = tablas();
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: t, rpc: rpc(t) });
  await page.goto('./');
  await expect(page.locator('.aviso-tablon')).toContainText('Auditoría del cliente');
  await expect(page.locator('.notificaciones')).toContainText('Te ha llegado (1)');
  await page.locator('.notificaciones .fila', { hasText: 'Hay aceite' }).click();
  await expect(page).toHaveURL(/#\/m\/limpieza\/incidencias/);
  expect(sim.find((l) => l.ruta.includes('/rpc/marcar_leidas'))!.cuerpo).toEqual({ p_ids: [1] });
  await page.goto('./');
  await page.getByRole('button', { name: '+ Aviso en el tablón' }).click();
  const v = page.getByRole('dialog', { name: 'Aviso en el tablón' });
  await v.getByLabel('Título').fill('Simulacro de incendio');
  await v.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Publicado: les llega a todos')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/avisos'))!.cuerpo).toMatchObject({ empresa_id: UNIDAD, titulo: 'Simulacro de incendio' });
});

test('el operario ve el tablón pero no publica', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(OPERARIO), tablas: tablas(), rpc: rpc() });
  await page.goto('./');
  await expect(page.locator('.aviso-tablon')).toContainText('Auditoría del cliente');
  await expect(page.getByRole('button', { name: '+ Aviso en el tablón' })).toHaveCount(0);
  await expect(page.locator('.aviso-tablon').getByRole('button', { name: 'Quitar' })).toHaveCount(0);
});

test('incidencias en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/incidencias');
  await expect(page.locator('.fila', { hasText: 'Hay aceite' })).toBeVisible();
  expect(await desbordes(page), 'lista').toEqual([]);
  await page.locator('.fila', { hasText: 'Hay aceite' }).click();
  expect(await desbordes(page), 'detalle').toEqual([]);
  await page.goto('./');
  await expect(page.locator('.aviso-tablon')).toBeVisible();
  expect(await desbordes(page), 'inicio').toEqual([]);
});
