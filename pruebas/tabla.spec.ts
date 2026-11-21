// Tabla común en el ordenador (aspecto nuevo): columnas, ordenar, buscar, filtros, abrir la ficha; y en el móvil, filas como siempre.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, EMPRESA_A, USUARIO, PERMISOS_ADMIN } from './simulador';

const E = EMPRESA_A.id;
const admin = { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ ...EMPRESA_A, permisos: [...PERMISOS_ADMIN, 'nucleo.usuario.ver', 'nucleo.usuario.editar'] }] };
const maquinas = () => ({
  centros: [{ id: 'c1', empresa_id: E, codigo: 'n1', nombre: 'Nave 1', baja: null }, { id: 'c2', empresa_id: E, codigo: 'n2', nombre: 'Nave 2', baja: null }],
  tipos_activo: [{ id: 't1', empresa_id: E, codigo: 'iny', nombre: 'Inyectora', estados: [], baja: null }, { id: 't2', empresa_id: E, codigo: 'hor', nombre: 'Horno', estados: [], baja: null }],
  activos: [
    { id: 'a1', empresa_id: E, codigo: 'F25', nombre: null, tipo_id: 't1', centro_id: 'c2', baja: null },
    { id: 'a2', empresa_id: E, codigo: 'F3', nombre: null, tipo_id: 't1', centro_id: 'c1', baja: null },
    { id: 'a3', empresa_id: E, codigo: 'H-F66', nombre: 'Horno de la F66', tipo_id: 't2', centro_id: 'c1', baja: null },
    { id: 'a4', empresa_id: E, codigo: 'F99', nombre: null, tipo_id: 't1', centro_id: null, baja: '2026-01-01' }],
});

test('ordenador: las máquinas en tabla, se ordenan, se buscan y se abren', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: admin, tablas: maquinas() });
  await page.goto('./#/config/activos');
  const tabla = page.locator('table.tabla');
  await expect(tabla.locator('thead th')).toHaveText(['Código', 'Tipo', 'Nave', 'Ubicación', 'Puesto en (máquina)', 'Estado']);
  await expect(tabla.locator('tbody th')).toHaveText(['F25', 'F3', 'Horno de la F66 · H-F66']);   // sin los dados de baja
  await expect(tabla.locator('tbody tr').first().locator('td')).toHaveText(['Inyectora', 'Nave 2', '', '', '']);
  // ordenar por código (los números en su orden: F3 antes que F25) y al revés
  await tabla.getByRole('button', { name: 'Código' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['F3', 'F25', 'Horno de la F66 · H-F66']);
  await expect(tabla.locator('thead th').first()).toHaveAttribute('aria-sort', 'ascending');
  await tabla.getByRole('button', { name: 'Nave' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['F3', 'Horno de la F66 · H-F66', 'F25']);
  await tabla.getByRole('button', { name: 'Nave' }).click();
  await expect(tabla.locator('tbody th')).toHaveText(['F25', 'F3', 'Horno de la F66 · H-F66']);
  // buscar
  await page.getByLabel('Buscar en Máquinas y piezas').fill('horno');
  await expect(tabla.locator('tbody th')).toHaveText(['Horno de la F66 · H-F66']);
  await expect(page.locator('.tabla-pie')).toHaveText('1 fila de 3');
  await page.getByLabel('Buscar en Máquinas y piezas').fill('');
  // los dados de baja, aparte
  await page.getByRole('button', { name: 'Ver los dados de baja (1)' }).click();
  await expect(tabla.locator('tbody tr.de-baja th')).toHaveText('F99');
  await expect(tabla.locator('tbody tr.de-baja td').last()).toHaveText('Dado de baja');
  // tocar una fila abre su ficha
  await tabla.locator('tbody tr', { hasText: 'F25' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#c-codigo')).toHaveValue('F25');
  expect(errores).toEqual([]);
});

test('ordenador: los usuarios en tabla, con sus roles y botones', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: admin, tablas: {
    roles: [{ id: 'r-lec', empresa_id: null, codigo: 'solo_lectura', nombre: 'Solo lectura', descripcion: 'Ve', baja: null }],
    centros: [{ id: 'c1', empresa_id: E, codigo: 'nave-1', nombre: 'Nave 1', baja: null }],
    usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', email: USUARIO.email, superadmin: false }, { id: 'u-bea', nombre: 'Persona Ejemplo', email: 'persona@ejemplo.com', superadmin: false }],
    asignaciones: [{ id: 'as-0', usuario_id: USUARIO.id, rol_id: 'r-adm', empresa_id: E, centro_id: null, hasta: null },
                   { id: 'as-1', usuario_id: 'u-bea', rol_id: 'r-lec', empresa_id: E, centro_id: 'c1', hasta: null }] } });
  await page.goto('./#/config/usuarios');
  const fila = page.locator('table.tabla tbody tr', { hasText: 'Persona Ejemplo' });
  await expect(fila).toContainText('persona@ejemplo.com');
  await expect(fila).toContainText('Solo lectura · Nave 1');
  await expect(fila.getByRole('button', { name: 'Quitar' })).toBeVisible();
  await expect(fila.getByRole('button', { name: 'Otro rol' })).toBeVisible();
  await expect(page.locator('table.tabla tbody tr', { hasText: 'Ana Prueba (tú)' }).getByRole('button', { name: 'Quitar' })).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('móvil: las máquinas siguen en filas, con su resumen', async ({ page }) => {
  await simular(page, { dentro: true, sesion: admin, tablas: maquinas() });
  await page.goto('./#/config/activos');
  await expect(page.locator('table.tabla')).toHaveCount(0);
  await expect(page.locator('.fila', { hasText: 'F25' })).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
});
