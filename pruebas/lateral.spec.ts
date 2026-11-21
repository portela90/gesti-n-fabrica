// Menú lateral (aspecto «Pizarra»): siempre a la vista en el ordenador; en el móvil se abre con ≡ y se cierra al elegir. Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '77777777-0000-0000-0000-000000000001';
const sesion = (permisos: string[], modulos = ['limpieza', 'personal', 'prevencion']) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-m', nombre: 'Unidad M', modulos, permisos }],
});
const JEFA = ['limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.plan.ver', 'limpieza.informe.ver', 'personal.modulo.ver', 'personal.calendario.ver'];
const rpc = { mi_dia: () => [], mi_equipo: () => null, informe: () => ({ alcance: 'todo', unidad: 'Unidad M', personas: [], trabajos: [] }) };

test('ordenador: el menú se ve siempre, con los apartados del módulo abierto, y el título dice dónde estás', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: sesion(JEFA), rpc });
  await page.goto('./#/');
  const menu = page.getByRole('complementary', { name: 'Menú' });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menú' })).toBeHidden();
  await expect(menu.getByRole('navigation', { name: 'Módulos' }).locator('.lateral-item')).toHaveText(['Inicio', 'Limpieza', 'Personal', 'Prevención']);
  await expect(menu.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('button', { name: 'Limpieza' }).click();
  await expect(page.locator('.cabecera b')).toHaveText('Hoy del equipo');
  await expect(menu.getByRole('navigation', { name: 'Limpieza' }).getByRole('button', { name: 'Hoy del equipo' })).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('navigation', { name: 'Limpieza' }).getByRole('button', { name: 'Resumen' }).click();
  await expect(page).toHaveURL(/#\/m\/limpieza\/resumen$/);
  await expect(page.locator('.cabecera b')).toHaveText('Resumen');
  await expect(page.locator('.cabecera small')).toHaveText('Limpieza · Unidad M');
  await expect(menu.getByRole('navigation', { name: 'Personal' })).toHaveCount(0);   // los apartados, solo del módulo abierto
  expect(errores).toEqual([]);
});

test('móvil: ≡ abre el menú, elegir un apartado lo cierra; «Tu cuenta» abre la cuenta', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(JEFA), rpc });
  await page.goto('./#/m/limpieza');
  const menu = page.locator('.lateral');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Menú' }).click();
  await expect(menu).toBeVisible();
  await page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button', { name: 'Semana' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('.cabecera b')).toHaveText('Semana');
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('button', { name: 'Cerrar el menú' }).click();
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('button', { name: /Tu cuenta/ }).click();
  await expect(page.getByRole('dialog', { name: 'Tu cuenta' })).toContainText('Salir');
  expect(errores).toEqual([]);
});

test('cada uno ve sus módulos y apartados: el operario, solo lo suyo', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(['limpieza.modulo.ver', 'limpieza.trabajo.apuntar'], ['limpieza']), rpc });
  await page.goto('./#/m/limpieza');
  await page.getByRole('button', { name: 'Menú' }).click();
  await expect(page.getByRole('navigation', { name: 'Módulos' }).locator('.lateral-item')).toHaveText(['Inicio', 'Limpieza']);
  await expect(page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button')).toHaveText(['Mi día', 'Incidencias']);
});

test('móvil más estrecho: el menú abierto no se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(JEFA), rpc });
  await page.goto('./#/m/limpieza/resumen');
  expect(await desbordes(page), 'cerrado').toEqual([]);
  await page.getByRole('button', { name: 'Menú' }).click();
  expect(await desbordes(page), 'abierto').toEqual([]);
});
