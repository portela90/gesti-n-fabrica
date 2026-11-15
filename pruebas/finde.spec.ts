// Limpieza · Fin de semana: subir el Excel, cambiar de día, instrucciones y checklist del encargado. Personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '36363636-0000-0000-0000-000000000001';
const LEO = '36363636-0000-0000-0000-0000000000f1';
const MARTA = '36363636-0000-0000-0000-0000000000f2';
const FINDE = '36363636-0000-0000-0000-0000000000e1';
const JEFE = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.plan.ver', 'limpieza.plan.editar', 'limpieza.trabajo.ver', 'limpieza.trabajo.apuntar',
  'limpieza.trabajo.corregir', 'limpieza.trabajo.repartir', 'limpieza.excel.editar'];
const ENCARGADO = JEFE.filter((p) => !['limpieza.plan.editar', 'limpieza.excel.editar'].includes(p));
const sesion = (permisos = JEFE) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-z', nombre: 'Unidad Z', modulos: ['limpieza'], permisos }],
});
// lunes 16/11/2026: el fin de semana es el 21-22
const LUNES = new Date('2026-11-16T10:00:00');
const tablas = () => ({
  usuarios: [{ id: USUARIO.id, nombre: 'Jefa Prueba', persona_id: null }],
  personas: [{ id: LEO, empresa_id: UNIDAD, nombre: 'Leo Prueba', baja: null, equipo_id: FINDE }, { id: MARTA, empresa_id: UNIDAD, nombre: 'Marta Prueba', baja: null, equipo_id: FINDE }],
  equipos: [{ id: FINDE, empresa_id: UNIDAD, nombre: 'Finde', baja: null }],
  activos: [{ id: 'a30', empresa_id: UNIDAD, codigo: 'F30', nombre: null, baja: null }],
  tareas: [{ empresa_id: UNIDAD, titulo: 'Limpieza horno de prueba', grupo: 'hornos', baja: null }],
  trabajos: [
    { id: 'w1', empresa_id: UNIDAD, fecha: '2026-11-21', titulo: 'Suelo del taller', lugar: 'Nave 2', estado: 'pendiente', clase: 'suelto', asignados: [], todo_equipo: false,
      urgente: false, minutos_est: 30, no_repartir: true },
    { id: 'w2', empresa_id: UNIDAD, fecha: '2026-11-22', titulo: 'Basuras', lugar: null, estado: 'hecho', clase: 'fija', asignados: [LEO], todo_equipo: false,
      urgente: false, minutos_est: 20, no_repartir: false },
  ] as Record<string, unknown>[],
  instrucciones: [{ id: 'i1', empresa_id: UNIDAD, desde: '2026-11-21', hasta: '2026-11-22', titulo: 'Carretillas', texto: 'Limpiar las dos', leido_en: null, anulado: null }] as Record<string, unknown>[],
  revisiones: [] as Record<string, unknown>[],
});
const rpc = (t = tablas()) => ({
  importar: () => ({ creados: 2, repetidos: 0, sin_persona: 1 }),
  cambiar_dia: (b: Record<string, unknown>) => { Object.assign(t.trabajos.find((x) => x.id === b.p_trabajo)!, { fecha: b.p_fecha }); return null; },
  instruccion_leida: (b: Record<string, unknown>) => { Object.assign(t.instrucciones.find((x) => x.id === b.p_id)!, { leido_en: '2026-11-16T10:00:00Z' }); return null; },
  puntos_encargado: () => [{ plantilla: 'Cierre', texto: 'Cuarto cerrado', tipo: 'ok' }, { plantilla: 'Cierre', texto: 'Botiquín', tipo: 'ok', foto_si_mal: true }],
  guardar_revision: () => null,
  mi_dia: () => [], semana: () => [],
});
async function abrir(page: Page, permisos = JEFE, t = tablas()) {
  await page.clock.install({ time: LUNES });
  const sim = await simular(page, { dentro: true, sesion: sesion(permisos), tablas: t, rpc: rpc(t) });
  await page.goto('./#/m/limpieza/finde');
  return sim;
}

test('fin de semana: el sábado y el domingo, y pasar un trabajo de día', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await abrir(page);
  await expect(page.getByLabel('Fin de semana del sábado')).toHaveValue('2026-11-21');
  const sab = page.locator('.dia-semana', { hasText: 'Sábado' });
  await expect(sab.locator('.fila', { hasText: 'Suelo del taller' })).toContainText('Sin persona (lo reparte el encargado)');
  await expect(page.locator('.dia-semana', { hasText: 'Domingo' }).locator('.fila', { hasText: 'Basuras' }).getByRole('button')).toHaveCount(0);
  await sab.getByRole('group', { name: 'Día de Suelo del taller' }).getByRole('button', { name: 'Dom' }).click();
  await expect(page.getByText('Pasado al domingo')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/cambiar_dia'))!.cuerpo).toEqual({ p_trabajo: 'w1', p_fecha: '2026-11-22' });
  await expect(page.locator('.dia-semana', { hasText: 'Domingo' }).locator('.fila', { hasText: 'Suelo del taller' })).toBeVisible();
  expect(errores).toEqual([]);
});

test('subir el Excel: columnas, fin de semana, personas y máquina adivinados; elegir qué hacer con los sin persona', async ({ page }) => {
  const sim = await abrir(page);
  await page.getByRole('button', { name: 'Subir el Excel del fin de semana' }).click();
  const v = page.getByRole('dialog', { name: 'Excel del fin de semana' });
  await v.locator('input[type=file]').setInputFiles('pruebas/datos/finde-inventado.xlsx');
  await expect(v.getByLabel(/Sábado del fin de semana/)).toHaveValue('2026-11-21');
  await expect(v.getByText('(sacado del Excel)')).toBeVisible();
  await expect(v.locator('.fila-excel b')).toHaveText(['Limpieza F30', 'Suelo del taller', 'Limpieza horno de prueba']);
  await expect(v.locator('.fila-excel', { hasText: 'Suelo del taller' })).toContainText('Ya está creado');
  await expect(v.locator('.fila-excel', { hasText: 'Suelo del taller' }).getByRole('checkbox')).not.toBeChecked();
  await expect(v.locator('.fila-excel', { hasText: 'Limpieza horno' })).toContainText('No conozco a: pepito');
  await expect(v.locator('.fila-excel', { hasText: 'Limpieza horno' })).toContainText('Grupo hornos');
  await expect(v.getByLabel('Quién hace «Limpieza F30»')).toHaveValue(LEO);
  await expect(v.locator('.fila-excel', { hasText: 'Limpieza F30' })).toContainText('Urgente · 1 h');
  await v.getByLabel('Reparto automático').check();
  await v.getByLabel(/Equipo del fin de semana/).selectOption({ label: 'Finde' });
  await v.locator('.fila-excel', { hasText: 'Limpieza horno' }).getByRole('button', { name: 'Dom' }).click();
  await v.getByRole('button', { name: 'Crear 2 trabajos' }).click();
  await expect(v.getByText('2 trabajos creados')).toBeVisible();
  const c = sim.find((l) => l.ruta.includes('/rpc/importar'))!.cuerpo as Record<string, unknown>;
  expect(c).toMatchObject({ p_empresa: UNIDAD, p_sin_persona: 'auto', p_equipo: FINDE, p_archivo: 'finde-inventado.xlsx' });
  expect(c.p_items).toEqual([
    { titulo: 'Limpieza F30', lugar: 'F30', descripcion: 'Bajo la máquina', fecha: '2026-11-21', asignados: [LEO], minutos_est: 60, urgente: true, activo_id: 'a30', grupo: null },
    { titulo: 'Limpieza horno de prueba', lugar: '', descripcion: '', fecha: '2026-11-22', asignados: [], minutos_est: null, urgente: false, activo_id: null, grupo: 'hornos' },
  ]);
});

test('instrucciones: la jefa las escribe y ve si están leídas', async ({ page }) => {
  const sim = await abrir(page);
  const ins = page.locator('.instrucciones');
  await expect(ins.locator('.fila', { hasText: 'Carretillas' })).toContainText('Sin leer');
  await ins.getByRole('button', { name: '+ Instrucciones' }).click();
  const v = page.getByRole('dialog', { name: 'Instrucciones para el encargado' });
  await v.getByRole('button', { name: 'Enviar' }).click();
  await expect(v.getByRole('alert')).toHaveText('Pon un título.');
  await v.getByLabel('Título').fill('Patio');
  await v.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Enviado al encargado')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/instrucciones'))!.cuerpo).toMatchObject({ titulo: 'Patio', desde: '2026-11-21', hasta: '2026-11-22', empresa_id: UNIDAD });
});

test('el encargado: aviso de instrucciones nuevas, las marca leídas; no sube el Excel', async ({ page }) => {
  await page.clock.install({ time: LUNES });
  const t = tablas();
  await simular(page, { dentro: true, sesion: sesion(ENCARGADO), tablas: t, rpc: rpc(t) });
  await page.goto('./#/m/limpieza/hoy');
  await page.getByRole('button', { name: /Tienes instrucciones nuevas/ }).click();
  await expect(page.getByRole('button', { name: 'Subir el Excel del fin de semana' })).toHaveCount(0);
  await page.locator('.instrucciones .fila', { hasText: 'Carretillas' }).getByRole('button', { name: 'Leído' }).click();
  await expect(page.locator('.instrucciones .fila', { hasText: 'Carretillas' }).locator('.chapa')).toHaveText('Leído');
});

test('checklist del encargado: no se envía hasta marcarlo todo; lo que está mal pide nota o foto', async ({ page }) => {
  const sim = await abrir(page, ENCARGADO);
  await page.getByRole('button', { name: 'Checklist del encargado' }).click();
  const v = page.getByRole('dialog', { name: /Checklist del encargado/ });
  await v.getByRole('group', { name: 'Cuarto cerrado' }).getByRole('button', { name: 'Bien' }).click();
  await v.getByRole('button', { name: 'Terminar y enviar' }).click();
  await expect(v.getByRole('alert')).toHaveText('Falta por marcar: Botiquín');
  await v.getByRole('group', { name: 'Botiquín' }).getByRole('button', { name: 'Mal' }).click();
  await v.getByLabel('Qué pasa: Botiquín').fill('Faltan tiritas');
  await v.getByRole('button', { name: 'Terminar y enviar' }).click();
  await expect(v.getByRole('alert')).toHaveText('Pon una foto: Botiquín');
  await v.getByRole('button', { name: 'Guardar y seguir luego' }).click();
  await expect(page.getByText('Guardada. Puedes seguir luego.')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/guardar_revision'))!.cuerpo).toMatchObject({
    p_empresa: UNIDAD, p_fecha: '2026-11-16', p_cerrar: false,
    p_items: [{ plantilla: 'Cierre', texto: 'Cuarto cerrado', estado: 'bien' }, { plantilla: 'Cierre', texto: 'Botiquín', estado: 'mal', nota: 'Faltan tiritas', foto: null }],
  });
});

test('fin de semana en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await abrir(page);
  await expect(page.locator('.dia-semana')).toHaveCount(2);
  expect(await desbordes(page), 'fin de semana').toEqual([]);
  await page.getByRole('button', { name: 'Subir el Excel del fin de semana' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles('pruebas/datos/finde-inventado.xlsx');
  await expect(page.locator('.fila-excel')).toHaveCount(3);
  expect(await desbordes(page), 'excel').toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Checklist del encargado' }).click();
  await page.getByRole('group', { name: 'Botiquín' }).getByRole('button', { name: 'Mal' }).click();
  expect(await desbordes(page), 'checklist').toEqual([]);
});
