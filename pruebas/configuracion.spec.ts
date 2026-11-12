// Configuración: dar de alta sin programar (naves, máquinas…), cambiar, dar de baja, y quién la ve.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, EMPRESA_A, USUARIO, PERMISOS_ADMIN } from './simulador';

const admin = { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null }, empresas: [{ ...EMPRESA_A, permisos: PERMISOS_ADMIN }] };

test('sin permisos de configuración no sale «Configuración» ni se puede entrar', async ({ page }) => {
  await simular(page, { dentro: true });
  await page.goto('./');
  await expect(page.locator('.mosaico', { hasText: 'Configuración' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Menú' }).click();
  await expect(page.locator('.fila', { hasText: 'Configuración' })).toHaveCount(0);
  await page.goto('./#/config');
  await expect(page.getByText('No tienes permiso para configurar nada.')).toBeVisible();
});

test('el administrador da de alta una nave y una máquina en esa nave, sin programar', async ({ page }) => {
  const err = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: admin, tablas: { tipos_activo: [{ id: 't1', empresa_id: EMPRESA_A.id, codigo: 'inyectora', nombre: 'Inyectora', estados: [], baja: null }] } });
  await page.goto('./');
  await page.locator('.mosaico', { hasText: 'Configuración' }).click();
  await expect(page.locator('.cabecera')).toContainText('Configuración');
  await expect(page.locator('.fila', { hasText: 'Tipos de máquina' }).locator('.cuenta')).toHaveText('1');
  await page.locator('.fila', { hasText: 'Naves' }).click();
  await expect(page.getByText('Todavía no hay naves.')).toBeVisible();
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Falta «Nombre».');
  await page.fill('#c-nombre', 'Nave 1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'Nave 1' })).toBeVisible();
  expect(sim.tablas.centros[0]).toMatchObject({ nombre: 'Nave 1', codigo: 'nave-1', empresa_id: EMPRESA_A.id });
  // la máquina, en esa nave
  await page.goto('./#/config/activos');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.fill('#c-codigo', 'F25');
  await page.selectOption('#c-tipo_id', 't1');
  await page.selectOption('#c-centro_id', { label: 'Nave 1' });
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'F25' })).toContainText('Inyectora · Nave 1');
  expect(sim.tablas.activos[0]).toMatchObject({ codigo: 'F25', tipo_id: 't1', centro_id: sim.tablas.centros[0].id });
  expect(err).toEqual([]);
});

test('cambiar un equipo (días) y darlo de baja: no se borra, se esconde', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: admin, tablas: { equipos: [{ id: 'e1', empresa_id: EMPRESA_A.id, codigo: 'semana', nombre: 'Semana', dias: [1, 2, 3, 4, 5], baja: null }] } });
  await page.goto('./#/config/equipos');
  await expect(page.locator('.fila', { hasText: 'Semana' })).toContainText('L M X J V');
  await page.locator('.fila', { hasText: 'Semana' }).click();
  await page.getByRole('button', { name: 'S', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'Semana' })).toContainText('L M X J V S');
  expect(sim.tablas.equipos[0].dias).toEqual([1, 2, 3, 4, 5, 6]);
  await page.locator('.fila', { hasText: 'Semana' }).click();
  await page.getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.locator('.fila', { hasText: 'Semana' })).toHaveCount(0);
  expect(sim.tablas.equipos).toHaveLength(1);
  expect(sim.tablas.equipos[0].baja).toBeTruthy();
  await page.getByRole('button', { name: 'Ver los dados de baja (1)' }).click();
  await expect(page.locator('.fila.de-baja', { hasText: 'Semana' })).toBeVisible();
});

test('un código repetido avisa claro', async ({ page }) => {
  await simular(page, { dentro: true, sesion: admin, tablas: { activos: [{ id: 'a1', empresa_id: EMPRESA_A.id, codigo: 'F25', nombre: null, tipo_id: 't1', baja: null }], tipos_activo: [{ id: 't1', empresa_id: EMPRESA_A.id, codigo: 'iny', nombre: 'Inyectora', estados: [], baja: null }] } });
  await page.goto('./#/config/activos');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.fill('#c-codigo', 'F25');
  await page.selectOption('#c-tipo_id', 't1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Ya hay uno con ese código o ese nombre.');
});

test('Configuración en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: admin, tablas: { personas: [{ id: 'p1', empresa_id: EMPRESA_A.id, nombre: 'Persona Con Un Nombre Bastante Largo De Prueba', categoria: 'Oficial de primera', baja: null }] } });
  await page.goto('./#/config');
  await expect(page.locator('.fila')).toHaveCount(11);
  expect(await desbordes(page), 'portada').toEqual([]);
  await page.goto('./#/config/personas');
  await page.locator('.fila').first().click();
  expect(await desbordes(page), 'ficha de un trabajador').toEqual([]);
});

test('lo escrito en el buscador pasa al nombre al pulsar «Añadir»', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: admin });
  await page.goto('./#/config/centros');
  await expect(page.getByPlaceholder('Buscar naves…')).toBeVisible();
  await page.getByPlaceholder('Buscar naves…').fill('Nave 2');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.locator('#c-nombre')).toHaveValue('Nave 2');
  await expect(page.getByText('Opcional. 1, 2, 3…')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toHaveText('Guardado');
  expect(sim.tablas.centros[0]).toMatchObject({ nombre: 'Nave 2', codigo: 'nave-2' });
});

