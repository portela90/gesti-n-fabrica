// Prevención · Stock de ropa y EPI: material con tallas y mínimos, pedido recibido, recuento, hoja del pedido
// y la talla en la entrega de EPI. Unidades, personas y material inventados.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = 'ffffffff-0000-0000-0000-000000000001';
const ANA = 'ffffffff-0000-0000-0000-0000000000f1';
const BOTAS = 'ffffffff-0000-0000-0000-0000000000b1';
const GAFAS = 'ffffffff-0000-0000-0000-0000000000b2';
const JEFE = ['nucleo.persona.ver', 'prevencion.modulo.ver', 'prevencion.tarea.ver', 'prevencion.documento.ver', 'prevencion.documento.editar', 'prevencion.stock.editar'];
const ENCARGADO = ['nucleo.persona.ver', 'prevencion.modulo.ver', 'prevencion.tarea.ver', 'prevencion.documento.ver', 'prevencion.documento.editar'];
const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-f', nombre: 'Unidad F', modulos: ['prevencion'], permisos }],
});
const fila = (material_id: string, nombre: string, talla: string, stock: number, minimo: number, epi: string | null = null) =>
  ({ material_id, empresa_id: UNIDAD, nombre, epi, prenda: null, baja: null, talla, talla_de_la_lista: true, stock, minimo });
const tablas = () => ({
  personas: [{ id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba', categoria: 'Peón', baja: null }],
  usuarios: [{ id: USUARIO.id, nombre: 'Jefa Prueba', persona_id: null }],
  ajustes: [], charlas: [], sesiones: [], asistencias: [], documentos: [], fichas: [], cursos: [], stock_mov: [],
  prendas: [{ id: 'pr1', empresa_id: UNIDAD, codigo: 'bota', nombre: 'Botas', orden: 0, baja: null }],
  material: [
    { id: BOTAS, empresa_id: UNIDAD, nombre: 'Botas', epi: 'bota', prenda: 'bota', tallas: ['42', '43'], minimos: { 42: 3, 43: 2 }, orden: 0, baja: null },
    { id: GAFAS, empresa_id: UNIDAD, nombre: 'Gafas', epi: 'gafas', prenda: null, tallas: [], minimos: { '': 10 }, orden: 1, baja: null },
  ],
  v_stock: [fila(BOTAS, 'Botas', '42', 4, 3, 'bota'), fila(BOTAS, 'Botas', '43', 0, 2, 'bota'), fila(GAFAS, 'Gafas', '', 6, 10, 'gafas')],
});
const rpc = { recontar_stock: (b: Record<string, unknown>) => (b.p_items as unknown[]).length, enviar_documentos: (b: Record<string, unknown>) => (b.p_ids as unknown[]).length };

test('stock: se ve lo que hay de cada talla, lo que falta y se saca la hoja del pedido', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/stock');
  const botas = page.locator('.fila', { hasText: 'Botas' });
  await expect(botas).toContainText('42: 4/3');
  await expect(botas.locator('.falta')).toHaveText('43: 0/2');
  await expect(botas.locator('.chapa')).toHaveText('Pedir 2');
  await expect(page.locator('.fila', { hasText: 'Gafas' }).locator('.chapa')).toHaveText('Pedir 4');
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Hoja del pedido/ }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/^Pedido ropa y EPI \d{4}-\d{2}-\d{2}\.pdf$/);
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(await (await import('node:fs/promises')).readFile((await d.path())!))).getPageCount()).toBe(1);
  expect(errores).toEqual([]);
});

test('stock: dar de alta material con sus tallas y mínimos', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/stock');
  await page.getByRole('button', { name: '+ Material' }).click();
  const v = page.getByRole('dialog', { name: 'Nuevo material' });
  await v.getByRole('textbox', { name: 'Nombre' }).fill('Guantes');
  await v.getByLabel('En la hoja oficial de EPI es').selectOption({ label: 'Guantes mecánica (EN 388)' });
  await expect(v.getByRole('option', { name: /Bota \(EN ISO 20345\) \(ya es «Botas»\)/ })).toHaveAttribute('disabled', '');
  await v.getByLabel(/^Tallas que tienes/).fill('8, 9, 8');
  await v.getByLabel('Mínimo de la talla 8').fill('5');
  await v.getByLabel('Mínimo de la talla 9').fill('dos');
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(v.getByRole('alert')).toContainText('El mínimo de 9');
  await v.getByLabel('Mínimo de la talla 9').fill('');
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.startsWith('/rest/v1/material'))!.cuerpo)
    .toEqual({ empresa_id: UNIDAD, nombre: 'Guantes', epi: 'guantes_mec', prenda: null, tallas: ['8', '9'], minimos: { 8: 5 } });
});

test('stock: llega un pedido y luego un recuento', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/stock');
  await page.getByRole('button', { name: 'He recibido un pedido' }).click();
  await page.getByLabel('Han llegado de Botas talla 43').fill('2');
  await page.getByLabel('Han llegado de Gafas talla Única').fill('10');
  await page.getByLabel('Nota (proveedor, albarán…)').fill('Albarán inventado 1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Pedido apuntado')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.startsWith('/rest/v1/stock_mov'))!.cuerpo).toEqual([
    { empresa_id: UNIDAD, material_id: BOTAS, talla: '43', cantidad: 2, tipo: 'entrada', nota: 'Albarán inventado 1' },
    { empresa_id: UNIDAD, material_id: GAFAS, talla: '', cantidad: 10, tipo: 'entrada', nota: 'Albarán inventado 1' }]);
  await page.getByRole('button', { name: 'Recuento' }).click();
  await page.getByLabel('Hay de Botas talla 42').fill('3');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Recuento guardado')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/recontar_stock'))!.cuerpo).toEqual({ p_empresa: UNIDAD, p_items: [{ material_id: BOTAS, talla: '42', hay: 3 }], p_nota: null });
});

test('entrega de EPI: la talla del material del almacén y cuántas quedan', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ENCARGADO), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/documentos');
  await expect(page.getByRole('button', { name: 'Stock' })).toHaveCount(0); // la pestaña es solo del que lleva el stock
  await page.getByRole('button', { name: '＋ Entrega de EPI' }).click();
  await page.getByRole('dialog').getByLabel('Ana Prueba').check();
  await page.getByLabel('Bota (EN ISO 20345)').check();
  const talla = page.getByLabel('Talla de Botas');
  await expect(talla).toHaveValue('');
  await expect(talla.locator('option')).toHaveText(['Talla de su ficha', '42 (quedan 4)', '43 (quedan 0)']);
  await talla.selectOption('43');
  await expect(page.getByText('No queda de la 43: se apunta igual')).toBeVisible();
  await page.getByLabel('Gafas de protección (EN 166)').check();
  await expect(page.locator('.linea-epi', { hasText: 'Gafas de protección' })).toContainText('Quedan 6');
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();
  await expect(page.getByText(/Guardado/)).toBeVisible();
  expect(sim.tablas.documentos[0]).toMatchObject({ datos: { items: { bota: { u: '1', talla: '43' }, gafas: { u: '1' } } } });
  expect(errores).toEqual([]);
});

test('Stock en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/stock');
  await expect(page.locator('.fila', { hasText: 'Botas' })).toBeVisible();
  expect(await desbordes(page), 'lista').toEqual([]);
  await page.locator('.fila', { hasText: 'Botas' }).click();
  expect(await desbordes(page), 'material').toEqual([]);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Recuento' }).click();
  expect(await desbordes(page), 'recuento').toEqual([]);
});

test('ordenador: el stock en tabla, con lo que hay que pedir', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/stock');
  const tabla = page.locator('table.tabla');
  await expect(tabla.locator('thead th')).toHaveText(['Material', 'Hay / mínimo por talla', 'Pedir', 'Estado']);
  const botas = tabla.locator('tbody tr', { hasText: 'Botas' });
  await expect(botas.locator('.falta')).toHaveText('43: 0/2');
  await expect(botas.locator('td').nth(1)).toHaveText('2');
  await tabla.getByRole('button', { name: 'Pedir' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Botas', 'Gafas']);
  await tabla.getByRole('button', { name: 'Pedir' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['Gafas', 'Botas']);
  await botas.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errores).toEqual([]);
});
