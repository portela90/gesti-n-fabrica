// La app: entrar, elegir empresa, menú según permisos, «Tengo un problema» y que nada se aplaste en un móvil estrecho.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, EMPRESA_A, EMPRESA_B, USUARIO } from './simulador';

test('sin entrar sale la pantalla de entrar; con correo y contraseña entra y ve sus módulos', async ({ page }) => {
  const err = vigilar(page);
  const llamadas = await simular(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Gestión de fábrica' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Escribe tu correo');
  await page.fill('#correo', 'admin@ejemplo.com');
  await page.fill('#clave', 'secreta123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  const login = llamadas.find((l) => l.ruta.startsWith('/auth/v1/token'));
  expect(login?.cuerpo).toMatchObject({ email: 'admin@ejemplo.com', password: 'secreta123' });
  const ses = llamadas.find((l) => l.ruta === '/rest/v1/rpc/mi_sesion');
  expect(ses?.perfil).toBe('nucleo');
  expect(err).toEqual([]);
});

test('entrar con un enlace al correo: no crea usuarios nuevos', async ({ page }) => {
  const llamadas = await simular(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Con un enlace' }).click();
  await expect(page.locator('#clave')).toHaveCount(0);
  await page.fill('#correo', 'jefe@ejemplo.com');
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByRole('status')).toContainText('Te hemos enviado un enlace');
  const otp = llamadas.find((l) => l.ruta.startsWith('/auth/v1/otp'));
  expect(otp?.cuerpo).toMatchObject({ email: 'jefe@ejemplo.com', create_user: false });
});

test('el menú solo trae los módulos que la base de datos permite (Unidad A: Almacén y Mantenimiento, sin Coladas)', async ({ page }) => {
  const err = vigilar(page);
  await simular(page, { dentro: true });
  await page.goto('./');
  await expect(page.locator('.mosaico')).toHaveCount(2);
  await expect(page.locator('.mosaico', { hasText: 'Almacén' })).toBeVisible();
  await expect(page.locator('.mosaico', { hasText: 'Coladas' })).toHaveCount(0);
  await page.locator('.mosaico', { hasText: 'Mantenimiento' }).click();
  await expect(page.locator('.cabecera')).toContainText('Mantenimiento');
  await expect(page.getByText('Este módulo llega en la Fase 3')).toBeVisible();
  // un módulo sin permiso, aunque se escriba la dirección a mano
  await page.goto('./#/m/coladas');
  await expect(page.getByText('No tienes acceso a esta pantalla.')).toBeVisible();
  expect(err).toEqual([]);
});

test('con dos unidades de trabajo pregunta en cuál trabajar y la recuerda', async ({ page }) => {
  await simular(page, { dentro: true, sesion: { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: true, empresa_actual: null }, empresas: [EMPRESA_A, EMPRESA_B] } });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '¿En qué unidad de trabajo vas a trabajar?' })).toBeVisible();
  await page.locator('.fila', { hasText: 'Unidad B' }).click();
  await expect(page.locator('.mosaico')).toHaveCount(3);
  await expect(page.locator('.mosaico', { hasText: 'Limpieza' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.cabecera')).toContainText('Unidad B');
  await page.getByRole('button', { name: 'Menú' }).click();
  await expect(page.locator('.menu-quien')).toContainText('Superadministrador');
  await expect(page.locator('#version')).toContainText('Versión ');
  await expect(page.locator('.fila', { hasText: 'Cambiar de unidad de trabajo' })).toBeVisible();
});

test('quien entra pero no tiene usuario en la app ve un aviso claro', async ({ page }) => {
  await simular(page, { dentro: true, sesion: { usuario: null, empresas: [] } });
  await page.goto('./');
  await expect(page.getByText('todavía no tienes acceso a la app')).toBeVisible();
});

test('«Tengo un problema» envía la incidencia con la pantalla, la versión y la unidad de trabajo', async ({ page }) => {
  const llamadas = await simular(page, { dentro: true });
  await page.goto('./#/m/almacen');
  await page.getByRole('button', { name: 'Tengo un problema' }).click();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('status')).toHaveText('Escribe qué ha pasado');
  await page.fill('#problemaTexto', 'No me sale el stock');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('status')).toContainText('Enviado');
  const inc = llamadas.find((l) => l.ruta.startsWith('/rest/v1/incidencias'));
  expect(inc?.perfil).toBe('nucleo');
  expect(inc?.cuerpo).toMatchObject({ texto: 'No me sale el stock', modulo: 'almacen', pantalla: '#/m/almacen', empresa_id: EMPRESA_A.id });
  expect((inc?.cuerpo as { version: string }).version).toMatch(/^\d{4}\.\d{2}\.\d{2}-/);
});

test('en el móvil más estrecho (320 px) nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page);
  await page.goto('./');
  expect(await desbordes(page), 'entrar').toEqual([]);
  await page.unrouteAll();
  await simular(page, { dentro: true, sesion: { usuario: { id: USUARIO.id, nombre: 'Ana Prueba Con Un Nombre Muy Largo', superadmin: true, empresa_actual: null }, empresas: [{ ...EMPRESA_B, nombre: 'Una empresa con un nombre bastante largo, S.L.' }] } });
  await page.goto('./');
  await expect(page.locator('.mosaico')).toHaveCount(3);
  expect(await desbordes(page), 'inicio').toEqual([]);
  await page.getByRole('button', { name: 'Menú' }).click();
  expect(await desbordes(page), 'menú').toEqual([]);
});
