// Panel de salud: solo superadministrador; cifras, errores (visto) e incidencias (contestar y cerrar).
import { test, expect } from '@playwright/test';
import { simular, desbordes, EMPRESA_A, USUARIO, PERMISOS_ADMIN } from './simulador';

const sesion = (superadmin: boolean) => ({ usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin, empresa_actual: null }, empresas: [{ ...EMPRESA_A, permisos: PERMISOS_ADMIN }] });
const salud = { bd_bytes: 40 * 1024 * 1024, bd_limite: 500 * 1024 * 1024, ultima_copia: null, errores_sin_ver: 1, errores_24h: 1, incidencias_abiertas: 1, usuarios: 3 };
const tablas = () => ({
  errores: [{ firma: 'e1', mensaje: 'Cannot read properties of undefined (reading length) en una línea muy muy larga sin espacios_____________________', app_version: '2026.11.12-abc', veces: 3, ultimo: new Date().toISOString(), visto: false }],
  incidencias: [{ id: 'i1', texto: 'No me sale el stock', modulo: 'almacen', pantalla: '#/m/almacen', version: '2026.11.12-abc', estado: 'abierta', respuesta: null, creado: new Date().toISOString(), contexto: { ancho: 390, alto: 844, conexion: true, instalada: true } }],
});

test('un administrador de unidad no ve «Salud de la app»', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(false) });
  await page.goto('./#/config');
  await expect(page.locator('.fila', { hasText: 'Naves' })).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Salud de la app' })).toHaveCount(0);
});

test('el superadministrador ve las cifras, marca un error como visto y cierra una incidencia', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(true), salud, tablas: tablas() });
  await page.goto('./#/config');
  await page.locator('.fila', { hasText: 'Salud de la app' }).click();
  await expect(page.locator('.cifra', { hasText: 'Espacio usado' })).toContainText('8 %');
  await expect(page.locator('.cifra', { hasText: 'Última copia' })).toContainText('Falta configurar la copia nocturna');
  await expect(page.locator('.cifra.mal', { hasText: 'Última copia' })).toBeVisible();
  await page.locator('.fila', { hasText: 'Cannot read' }).getByRole('button', { name: 'Visto' }).click();
  await expect(page.getByText('Ningún error sin ver.')).toBeVisible();
  expect(sim.tablas.errores[0].visto).toBe(true);
  await page.locator('.fila', { hasText: 'No me sale el stock' }).click();
  await expect(page.locator('.ventana')).toContainText('390×844 · con conexión · app instalada');
  await page.fill('#respuesta', 'Arreglado en la versión siguiente');
  await page.getByRole('button', { name: 'Cerrar incidencia' }).click();
  await expect(page.getByText('No hay ninguna abierta.')).toBeVisible();
  expect(sim.tablas.incidencias[0]).toMatchObject({ estado: 'cerrada', respuesta: 'Arreglado en la versión siguiente' });
});

test('Salud en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(true), salud, tablas: tablas() });
  await page.goto('./#/config/salud');
  await expect(page.locator('.cifra')).toHaveCount(4);
  expect(await desbordes(page)).toEqual([]);
});
