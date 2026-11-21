// Limpieza · lo que prepara el administrador: tareas fijas y habituales y checklists.
// Unidades, personas y máquinas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO, irApartado } from './simulador';

const UNIDAD = 'dddddddd-0000-0000-0000-000000000001';
const SEMANA = 'dddddddd-0000-0000-0000-0000000000e1';
const FINDE = 'dddddddd-0000-0000-0000-0000000000e2';
const TARDE = 'dddddddd-0000-0000-0000-0000000000d1';
const ANA = 'dddddddd-0000-0000-0000-0000000000f1';
const BRUNO = 'dddddddd-0000-0000-0000-0000000000f2';
const F90 = 'dddddddd-0000-0000-0000-0000000000a1';

const JEFE = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.plan.ver', 'limpieza.plan.editar'];
const ENCARGADO = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.plan.ver'];
const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-d', nombre: 'Unidad D', modulos: ['limpieza'], permisos }],
});
const tablas = () => ({
  equipos: [{ id: SEMANA, empresa_id: UNIDAD, nombre: 'Semana', baja: null }, { id: FINDE, empresa_id: UNIDAD, nombre: 'Fin de semana', baja: null }],
  turnos: [{ id: TARDE, empresa_id: UNIDAD, nombre: 'Tarde', baja: null }],
  personas: [{ id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba', baja: null }, { id: BRUNO, empresa_id: UNIDAD, nombre: 'Bruno Prueba', baja: null }],
  activos: [{ id: F90, empresa_id: UNIDAD, codigo: 'F90', nombre: null, baja: null },
    { id: 'dddddddd-0000-0000-0000-0000000000a2', empresa_id: UNIDAD, codigo: 'F91', nombre: null, baja: null },
    { id: 'dddddddd-0000-0000-0000-0000000000a3', empresa_id: UNIDAD, codigo: 'M3', nombre: 'Centro de mecanizado', baja: null }],
  tareas: [
    { id: 't1', empresa_id: UNIDAD, clase: 'fija', titulo: 'Basuras Nave Z', descripcion: null, grupo: null, lugar: null, ubicacion_id: null, activo_id: null,
      minutos_est: 30, dias: [1, 2, 3, 4, 5], equipo_id: SEMANA, turno_id: TARDE, asignados: [ANA], todo_equipo: false, solo_para: [], orden: 0, baja: null },
    { id: 't2', empresa_id: UNIDAD, clase: 'habitual', titulo: 'Cambiar taladrina F90', descripcion: null, grupo: 'limpieza', lugar: null, ubicacion_id: null, activo_id: F90,
      minutos_est: null, dias: null, equipo_id: null, turno_id: null, asignados: [], todo_equipo: false, solo_para: [BRUNO], orden: 0, baja: null },
    { id: 't3', empresa_id: UNIDAD, clase: 'habitual', titulo: 'Tarea vieja', descripcion: null, grupo: 'limpieza', lugar: null, ubicacion_id: null, activo_id: null,
      minutos_est: null, dias: null, equipo_id: null, turno_id: null, asignados: [], todo_equipo: false, solo_para: [], orden: 0, baja: '2030-01-01T00:00:00Z' },
  ],
  plantillas: [
    { id: 'p1', empresa_id: UNIDAD, nombre: 'Inyectoras y zonas', cuando: 'trabajos', aplica: { codigos: 'F*', excluir: 'horno' }, orden: 0, baja: null,
      puntos: [{ texto: 'Robot limpio', tipo: 'ok', foto_si_mal: true }, { texto: 'Canaletas', tipo: 'ok' }] },
    { id: 'p2', empresa_id: UNIDAD, nombre: 'Cierre', cuando: 'encargado', aplica: {}, orden: 0, baja: null, puntos: [{ texto: 'Luces apagadas', tipo: 'ok' }] },
  ],
});

test('tareas fijas y habituales: el administrador ve las de cada clase y crea una fija', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  const fila = page.locator('.fila', { hasText: 'Basuras Nave Z' });
  await expect(fila).toContainText('De lunes a viernes · Tarde · 30 min');
  await expect(fila).toContainText('Ana Prueba');
  await expect(page.getByRole('heading', { name: 'Semana' })).toBeVisible();
  await page.getByRole('group', { name: 'Clase de tarea' }).getByRole('button', { name: 'Habituales' }).click();
  await expect(page.locator('.fila', { hasText: 'Cambiar taladrina F90' })).toContainText('Solo: Bruno Prueba');
  await expect(page.locator('.fila', { hasText: 'Tarea vieja' })).toHaveCount(0);
  await page.getByLabel('Ver también las de baja (1)').check();
  await expect(page.locator('.fila', { hasText: 'Tarea vieja' }).locator('.chapa')).toHaveText('De baja');

  await page.getByRole('group', { name: 'Clase de tarea' }).getByRole('button', { name: 'Fijas' }).click();
  await page.getByRole('button', { name: '+ Nueva tarea fija' }).click();
  const v = page.getByRole('dialog', { name: 'Nueva tarea fija' });
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(v.getByRole('alert')).toHaveText('Escribe qué hay que hacer.');
  await v.getByLabel('Qué hay que hacer').fill('Pasillos Nave Z');
  // de lunes a viernes por defecto: quito el viernes y pongo el sábado
  await v.getByRole('group', { name: 'Qué días' }).getByRole('button', { name: 'V' }).click();
  await v.getByRole('group', { name: 'Qué días' }).getByRole('button', { name: 'S' }).click();
  await v.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Fin de semana' });
  await v.getByLabel('Turno').selectOption({ label: 'Tarde' });
  await v.getByLabel('Bruno Prueba').check();
  await v.getByLabel('Máquina').selectOption({ label: 'M3 · Centro de mecanizado' });
  await v.getByLabel('Minutos que suele llevar').fill('45');
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tarea guardada')).toBeVisible();
  const alta = sim.find((l) => l.metodo === 'POST' && l.ruta.startsWith('/rest/v1/tareas'))!;
  expect(alta.perfil).toBe('limpieza');
  expect(alta.cuerpo).toMatchObject({ empresa_id: UNIDAD, clase: 'fija', titulo: 'Pasillos Nave Z', dias: [1, 2, 3, 4, 6], equipo_id: FINDE, turno_id: TARDE,
    asignados: [BRUNO], todo_equipo: false, solo_para: [], minutos_est: 45, activo_id: 'dddddddd-0000-0000-0000-0000000000a3', grupo: null });
  await expect(page.locator('.fila', { hasText: 'Pasillos Nave Z' })).toContainText('L M X J S · Tarde · M3 · 45 min');
  expect(errores).toEqual([]);
});

test('tareas: dar de baja una habitual y que «todo el equipo» no guarde personas', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  await page.locator('.fila', { hasText: 'Basuras Nave Z' }).click();
  const v = page.getByRole('dialog', { name: 'Cambiar tarea' });
  await v.getByLabel('La hace todo el equipo').check();
  await expect(v.getByLabel('Ana Prueba')).toHaveCount(0);
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'Basuras Nave Z' })).toContainText('Todo el equipo');
  expect(sim.find((l) => l.metodo === 'PATCH')!.cuerpo).toMatchObject({ todo_equipo: true, asignados: [] });

  await page.getByRole('group', { name: 'Clase de tarea' }).getByRole('button', { name: 'Habituales' }).click();
  await page.locator('.fila', { hasText: 'Cambiar taladrina F90' }).click();
  await page.getByRole('dialog', { name: 'Cambiar tarea' }).getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.getByText('Tarea dada de baja')).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Cambiar taladrina F90' })).toHaveCount(0);
  expect(sim.tablas.tareas.find((t) => t.id === 't2')!.baja).toBeTruthy();
  expect(sim.some((l) => l.metodo === 'DELETE')).toBe(false);
});

test('checklists: se ve en qué máquinas sale y se crea una con puntos', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas() });
  await page.goto('./#/m/limpieza/checklists');
  await expect(page.locator('.fila', { hasText: 'Inyectoras y zonas' })).toContainText('2 puntos · 2 máquinas');
  await expect(page.locator('.fila', { hasText: 'Cierre' })).toContainText('1 punto');
  await expect(page.getByRole('heading', { name: 'Del encargado' })).toBeVisible();

  await page.getByRole('button', { name: '+ Nueva checklist' }).click();
  const v = page.getByRole('dialog', { name: 'Nueva checklist' });
  await v.getByLabel('Nombre', { exact: true }).fill('Centros de mecanizado');
  await v.getByLabel(/^Máquinas/).fill('m3, F*');
  await expect(v.getByText('Sale en 3: F90, F91, M3')).toBeVisible();
  await v.getByLabel(/^Máquinas/).fill('M3');
  await expect(v.getByText('Sale en 1: M3')).toBeVisible();
  await v.getByLabel('Cambiar taladrina F90').check();
  await v.getByLabel('Punto 1', { exact: true }).fill('Virutas recogidas');
  await v.getByLabel('Foto si está mal').check();
  await v.getByRole('button', { name: '+ Añadir punto' }).click();
  await v.getByLabel('Punto 2', { exact: true }).fill('Bidones de taladrina');
  await v.getByLabel('Cómo se contesta el punto 2').selectOption({ label: 'Un número' });
  await v.getByLabel('Mínimo del punto 2').fill('2');
  await v.getByRole('button', { name: '+ Añadir punto' }).click(); // uno vacío: no se guarda
  await v.getByRole('button', { name: 'Subir el punto 2' }).click();
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Checklist guardada')).toBeVisible();
  const alta = sim.find((l) => l.metodo === 'POST' && l.ruta.startsWith('/rest/v1/plantillas'))!;
  expect(alta.perfil).toBe('limpieza');
  expect(alta.cuerpo).toEqual({ empresa_id: UNIDAD, nombre: 'Centros de mecanizado', cuando: 'trabajos', aplica: { codigos: 'M3', tareas: ['t2'] },
    puntos: [{ texto: 'Bidones de taladrina', tipo: 'num', minimo: 2 }, { texto: 'Virutas recogidas', tipo: 'ok', foto_si_mal: true }] });
  await expect(page.locator('.fila', { hasText: 'Centros de mecanizado' })).toContainText('2 puntos · 1 máquina y 1 tarea');
  expect(errores).toEqual([]);
});

test('el encargado ve tareas y checklists pero no puede cambiarlas', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(ENCARGADO), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  await expect(page.locator('.fila', { hasText: 'Basuras Nave Z' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nueva tarea/ })).toHaveCount(0);
  await page.locator('.fila', { hasText: 'Basuras Nave Z' }).click();
  const v = page.getByRole('dialog', { name: 'Tarea' });
  await expect(v.getByLabel('Qué hay que hacer')).toBeDisabled();
  await expect(v.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
  await v.getByRole('button', { name: 'Cerrar' }).click();
  await irApartado(page, 'Limpieza', 'Checklists');
  await expect(page.getByRole('button', { name: '+ Nueva checklist' })).toHaveCount(0);
});

test('quien no tiene estos permisos no ve las listas', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(['limpieza.modulo.ver']), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  await expect(page.getByText('No tienes nada de Limpieza.')).toBeVisible();
  await expect(page.locator('.fila')).toHaveCount(0);
});

test('Limpieza en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  await expect(page.locator('.fila', { hasText: 'Basuras Nave Z' })).toBeVisible();
  expect(await desbordes(page), 'tareas').toEqual([]);
  await page.locator('.fila', { hasText: 'Basuras Nave Z' }).click();
  expect(await desbordes(page), 'tarea fija').toEqual([]);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.goto('./#/m/limpieza/checklists');
  await page.locator('.fila', { hasText: 'Inyectoras y zonas' }).click();
  await page.getByRole('button', { name: '+ Añadir punto' }).click();
  await page.getByLabel('Cómo se contesta el punto 3').selectOption({ label: 'Un número' });
  expect(await desbordes(page), 'checklist').toEqual([]);
});

test('ordenador: tareas y checklists en tabla, con los equipos como filtros', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas() });
  await page.goto('./#/m/limpieza/tareas');
  const tabla = page.locator('table.tabla');
  await expect(tabla.locator('thead th')).toHaveText(['Tarea', 'Equipo', 'Días', 'Turno', 'Dónde', 'Quién', 'Previsto', 'Estado']);
  await expect(tabla.locator('tbody tr').first().locator('th, td')).toHaveText(['Basuras Nave Z', 'Semana', 'De lunes a viernes', 'Tarde', '', 'Ana Prueba', '30 min', '']);
  await page.getByRole('group', { name: 'Clase de tarea' }).getByRole('button', { name: 'Habituales' }).click();
  await expect(tabla.locator('thead th')).toHaveText(['Tarea', 'Grupo', 'Dónde', 'Solo para', 'Previsto', 'Estado']);
  await expect(tabla.locator('tbody th')).toHaveText(['Cambiar taladrina F90']);
  await tabla.locator('tbody tr').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('./#/m/limpieza/checklists');
  await expect(tabla.locator('tbody th')).toHaveText(['Cierre', 'Inyectoras y zonas']);
  await expect(tabla.locator('tbody tr', { hasText: 'Inyectoras' }).locator('td')).toHaveText(['Al terminar trabajos', '2', '2 máquinas', '']);
  await page.getByRole('group', { name: 'Filtros' }).getByRole('button', { name: 'Del encargado' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Cierre']);
  expect(errores).toEqual([]);
});
