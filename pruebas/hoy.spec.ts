// Limpieza · «Hoy del equipo»: todos los trabajos del día por persona y repartirlos. Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '34343434-0000-0000-0000-000000000001';
const LEO = '34343434-0000-0000-0000-0000000000f1';
const MARTA = '34343434-0000-0000-0000-0000000000f2';
const SEMANA = '34343434-0000-0000-0000-0000000000e1';
const hoy = new Date().toLocaleDateString('sv-SE');
const JEFE = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.plan.ver', 'limpieza.plan.editar', 'limpieza.trabajo.ver', 'limpieza.trabajo.apuntar',
  'limpieza.trabajo.corregir', 'limpieza.trabajo.repartir'];
const sesion = (permisos = JEFE) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-h', nombre: 'Unidad H', modulos: ['limpieza'], permisos }],
});
const trabajo = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, empresa_id: UNIDAD, fecha: hoy, clase: 'fija', titulo, descripcion: null, lugar: null, minutos_est: 20, estado: 'pendiente', inicio: null,
  pausa_desde: null, pausado_min: 0, fin: null, minutos: null, nota: null, problema: null, fotos: [], atrasado: false, nombres: [],
  maquina: null, zona: null, turno: null, mio: false, puedo: true, hecho_por_nombre: null, checklist: null, asignados: [], todo_equipo: false, equipo_id: SEMANA, ...extra,
});
const dia = () => [
  trabajo('t1', 'Basuras Nave Z', { asignados: [LEO], nombres: ['Leo Prueba'] }),
  trabajo('t2', 'Pasillo', { todo_equipo: true }),
  trabajo('t3', 'Derrame', { clase: 'suelto' }),
  trabajo('t4', 'Fregar', { asignados: [LEO, MARTA], nombres: ['Leo Prueba', 'Marta Prueba'], estado: 'hecho', minutos: 30 }),
];
const tablas = () => ({
  usuarios: [{ id: USUARIO.id, nombre: 'Jefa Prueba', persona_id: null }],
  personas: [{ id: LEO, empresa_id: UNIDAD, nombre: 'Leo Prueba', baja: null, equipo_id: SEMANA }, { id: MARTA, empresa_id: UNIDAD, nombre: 'Marta Prueba', baja: null, equipo_id: SEMANA }],
  equipos: [{ id: SEMANA, empresa_id: UNIDAD, nombre: 'Semana', baja: null }],
});
const rpc = (d = dia()) => ({
  mi_dia: () => d, puntos: () => [],
  repartir: (b: Record<string, unknown>) => { Object.assign(d.find((x) => x.id === b.p_trabajo)!, { asignados: b.p_personas, todo_equipo: b.p_todo_equipo }); return null; },
  habituales_para_mi: () => [{ id: 'h1', titulo: 'Cambiar taladrina', descripcion: null, grupo: null, lugar: null, minutos_est: 15, maquina: null }],
  crear_trabajo: () => { d.push(trabajo('t9', 'Cambiar taladrina', { clase: 'habitual', asignados: [MARTA] })); return 't9'; },
});

test('hoy del equipo: los trabajos por persona, sin asignar primero, y repartir uno', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await expect(page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button')).toHaveText(['Hoy del equipo', 'Semana', 'Fin de semana', 'Mi día', 'Tareas', 'Checklists', 'Personas']);
  await expect(page.getByText('1 de 4 hechos.')).toBeVisible();
  await expect(page.locator('.subtitulo')).toHaveText(['Sin asignar · 0/1', 'Leo Prueba · 1/2', 'Marta Prueba · 1/1', 'Todo el equipo Semana · 0/1']);
  await page.locator('.grupo-tareas', { hasText: 'Sin asignar' }).locator('.fila', { hasText: 'Derrame' }).click();
  await page.getByRole('button', { name: 'Cambiar a quién le toca' }).click();
  const v = page.getByRole('dialog', { name: '¿A quién le toca? · Derrame' });
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(v.getByRole('alert')).toContainText('Elige al menos a una persona');
  await v.getByLabel('Marta Prueba').check();
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Repartido')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/repartir'))!.cuerpo).toEqual({ p_trabajo: 't3', p_personas: [MARTA], p_todo_equipo: false, p_equipo: null });
  await expect(page.locator('.grupo-tareas', { hasText: 'Marta Prueba' }).locator('.fila', { hasText: 'Derrame' })).toBeVisible();
  await expect(page.locator('.subtitulo', { hasText: 'Sin asignar' })).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('hoy del equipo: un trabajo hecho no se reparte; crear uno para otra persona', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/hoy');
  await page.locator('.fila', { hasText: 'Fregar' }).first().click();
  await expect(page.getByRole('button', { name: 'Cambiar a quién le toca' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: '+ Trabajo' }).click();
  await page.getByLabel('Para quién').selectOption({ label: 'Marta Prueba' });
  await page.locator('.fila', { hasText: 'Cambiar taladrina' }).click();
  expect(sim.find((l) => l.ruta.includes('/rpc/crear_trabajo'))!.cuerpo).toMatchObject({ p_tarea: 'h1', p_para: [MARTA] });
  await expect(page.getByRole('dialog', { name: 'Cambiar taladrina' })).toBeVisible();
});

test('el encargado sin permiso de repartir ve el día pero no reparte', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(JEFE.filter((p) => p !== 'limpieza.trabajo.repartir')), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/hoy');
  await page.locator('.fila', { hasText: 'Derrame' }).click();
  await expect(page.getByRole('button', { name: 'Cambiar a quién le toca' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('button', { name: '+ Trabajo' })).toHaveCount(0);
});

test('Hoy del equipo en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/hoy');
  await expect(page.locator('.fila', { hasText: 'Derrame' })).toBeVisible();
  expect(await desbordes(page), 'hoy').toEqual([]);
  await page.locator('.fila', { hasText: 'Derrame' }).click();
  await page.getByRole('button', { name: 'Cambiar a quién le toca' }).click();
  expect(await desbordes(page), 'repartir').toEqual([]);
});
