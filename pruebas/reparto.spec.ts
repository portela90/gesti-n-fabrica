// Limpieza · reparto: «Repartir lo que queda», faltas y sustitutos, quién entra en el reparto y plan de la semana. Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '35353535-0000-0000-0000-000000000001';
const LEO = '35353535-0000-0000-0000-0000000000f1';
const MARTA = '35353535-0000-0000-0000-0000000000f2';
const hoy = new Date().toLocaleDateString('sv-SE');
const JEFE = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.plan.ver', 'limpieza.plan.editar', 'limpieza.trabajo.ver', 'limpieza.trabajo.apuntar',
  'limpieza.trabajo.corregir', 'limpieza.trabajo.repartir'];
const sesion = (permisos = JEFE) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-p', nombre: 'Unidad P', modulos: ['limpieza'], permisos }],
});
const trabajo = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, empresa_id: UNIDAD, fecha: hoy, clase: 'fija', titulo, descripcion: null, lugar: null, minutos_est: 20, estado: 'pendiente', inicio: null,
  pausa_desde: null, pausado_min: 0, fin: null, minutos: null, nota: null, problema: null, fotos: [], atrasado: false, nombres: [],
  maquina: null, zona: null, turno: null, mio: false, puedo: true, hecho_por_nombre: null, checklist: null, asignados: [], todo_equipo: false, equipo_id: null, ...extra,
});
const tablas = () => ({
  usuarios: [{ id: USUARIO.id, nombre: 'Jefa Prueba', persona_id: null }],
  personas: [{ id: LEO, empresa_id: UNIDAD, nombre: 'Leo Prueba', baja: null, equipo_id: null }, { id: MARTA, empresa_id: UNIDAD, nombre: 'Marta Prueba', baja: null, equipo_id: null }],
  'limpieza.personas': [{ persona_id: LEO, empresa_id: UNIDAD, en_reparto: true, grupos: ['hornos'] }],
  sustituciones: [] as Record<string, unknown>[],
  ausencias: [{ empresa_id: UNIDAD, persona_id: LEO, desde: hoy, hasta: hoy, motivo: 'vacaciones' }],
  tareas: [{ empresa_id: UNIDAD, grupo: 'hornos', baja: null }],
  activos: [{ id: 'a53', empresa_id: UNIDAD, codigo: 'F53', nombre: 'Inyectora', baja: null }, { id: 'a7', empresa_id: UNIDAD, codigo: 'F7', nombre: null, baja: null }],
});
const semana = () => Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
  const f = d.toLocaleDateString('sv-SE');
  return {
    fecha: f,
    trabajos: f === hoy ? [{ id: 't1', titulo: 'Basuras', minutos_est: 20, estado: 'pendiente', previsto: false, todo_equipo: false, equipo: null, aviso: 'Marta Prueba cubre a Leo Prueba', nombres: ['Marta Prueba'] }]
      : [{ id: null, titulo: 'Basuras', minutos_est: 20, estado: 'pendiente', previsto: true, todo_equipo: false, equipo: null, aviso: null, nombres: ['Leo Prueba'] }],
    personas: [{ persona_id: LEO, nombre: 'Leo Prueba', horario_min: 480, ausencia: f === hoy ? 'vacaciones' : null, trabajo_min: f === hoy ? 0 : 20 },
      { persona_id: MARTA, nombre: 'Marta Prueba', horario_min: 0, ausencia: null, trabajo_min: f === hoy ? 20 : 0 }],
  };
});
const rpc = (d = [trabajo('t1', 'Basuras', { asignados: [MARTA], nombres: ['Marta Prueba'], aviso_reparto: 'Marta Prueba cubre a Leo Prueba' }), trabajo('t2', 'Pasillo')]) => ({
  mi_dia: () => d, puntos: () => [], semana: () => semana(),
  repartir_lo_que_queda: () => { Object.assign(d[1], { asignados: [MARTA], nombres: ['Marta Prueba'], aviso_reparto: 'Repartido solo' }); return 1; },
  habituales_para_mi: () => [{ id: 'h1', titulo: 'Derrame de aceite', descripcion: null, grupo: null, lugar: null, minutos_est: 15, maquina: null }],
  crear_trabajo: () => { d.push(trabajo('t9', 'Derrame de aceite', { clase: 'habitual' })); return 't9'; },
});

test('hoy del equipo: el aviso del sustituto y «Repartir lo que queda»', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/hoy');
  await expect(page.locator('.fila', { hasText: 'Basuras' }).locator('.aviso-reparto')).toHaveText('Marta Prueba cubre a Leo Prueba');
  await page.getByRole('button', { name: 'Repartir lo que queda (1)' }).click();
  await expect(page.getByText('Repartidos 1')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/repartir_lo_que_queda'))!.cuerpo).toEqual({ p_empresa: UNIDAD, p_fecha: hoy });
  await expect(page.locator('.fila', { hasText: 'Pasillo' }).locator('.aviso-reparto')).toHaveText('Repartido solo');
  await expect(page.getByRole('button', { name: /Repartir lo que queda/ })).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('faltas y sustitutos: ver quién falta y apuntar quién le cubre', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/hoy');
  await page.getByRole('button', { name: 'Faltas y sustitutos' }).click();
  const v = page.getByRole('dialog', { name: 'Faltas y sustitutos' });
  await expect(v.locator('.fila', { hasText: 'Leo Prueba' })).toContainText('Vacaciones');
  await v.getByRole('button', { name: 'Apuntar sustituto' }).click();
  await expect(v.getByRole('alert')).toContainText('Elige quién falta');
  await v.getByLabel('Falta').selectOption({ label: 'Leo Prueba' });
  await v.getByLabel('Le cubre').selectOption({ label: 'Marta Prueba' });
  await v.getByRole('button', { name: 'Apuntar sustituto' }).click();
  await expect(v.getByText('Marta Prueba cubre a Leo Prueba')).toBeVisible();
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/sustituciones'))!.cuerpo)
    .toMatchObject({ empresa_id: UNIDAD, ausente: LEO, sustituto: MARTA, desde: hoy, hasta: hoy });
});

test('personas: quién entra en el reparto y qué grupos sabe hacer', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/personas');
  const leo = page.locator('.fila', { hasText: 'Leo Prueba' });
  await expect(leo.getByLabel('Entra en el reparto')).toBeChecked();
  await expect(leo.getByLabel('Grupos de Leo Prueba')).toHaveValue('hornos');
  const marta = page.locator('.fila', { hasText: 'Marta Prueba' });
  await expect(marta.getByLabel('Entra en el reparto')).not.toBeChecked();
  await marta.getByLabel('Entra en el reparto').check();
  await expect.poll(() => sim.find((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/personas'))?.cuerpo)
    .toMatchObject({ persona_id: MARTA, en_reparto: true, grupos: [], empresa_id: UNIDAD });
  await marta.getByLabel('Grupos de Marta Prueba').fill('hornos, , hornos');
  await marta.getByLabel('Grupos de Marta Prueba').blur();
  await expect.poll(() => sim.filter((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/personas')).at(-1)?.cuerpo).toMatchObject({ persona_id: MARTA, grupos: ['hornos'] });
});

test('plan de la semana: 7 días, horas por persona y lo previsto', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/semana');
  await expect(page.locator('.dia-semana')).toHaveCount(7);
  const deHoy = page.locator('.dia-semana.es-hoy');
  await expect(deHoy.locator('.gente-dia')).toContainText('Leo Prueba: Vacaciones');
  await expect(deHoy.locator('.gente-dia')).toContainText('Marta Prueba: 20 min de 0 min');
  await expect(deHoy.locator('.gente-dia .chapa.sin-cuadrar')).toHaveText('Marta Prueba: 20 min de 0 min');
  await expect(page.locator('.dia-semana:not(.es-hoy)').first()).toContainText('Leo Prueba · 20 min · previsto');
});

test('+ Trabajo: el operario elige la máquina', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(['limpieza.modulo.ver', 'limpieza.trabajo.apuntar']), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/dia');
  await page.getByRole('button', { name: '+ Trabajo' }).click();
  await expect(page.getByLabel('Máquina (si es en una)').locator('option')).toHaveText(['Ninguna', 'F7', 'F53 · Inyectora']);
  await page.getByLabel('Máquina (si es en una)').selectOption({ label: 'F53 · Inyectora' });
  await page.locator('.fila', { hasText: 'Derrame de aceite' }).click();
  expect(sim.find((l) => l.ruta.includes('/rpc/crear_trabajo'))!.cuerpo).toMatchObject({ p_tarea: 'h1', p_activo: 'a53' });
  await expect(page.getByLabel('Para quién')).toHaveCount(0);
});

test('reparto en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/semana');
  await expect(page.locator('.dia-semana')).toHaveCount(7);
  expect(await desbordes(page), 'semana').toEqual([]);
  await page.goto('./#/m/limpieza/personas');
  await expect(page.locator('.fila', { hasText: 'Leo Prueba' })).toBeVisible();
  expect(await desbordes(page), 'personas').toEqual([]);
  await page.goto('./#/m/limpieza/hoy');
  await page.getByRole('button', { name: 'Faltas y sustitutos' }).click();
  await expect(page.getByRole('dialog', { name: 'Faltas y sustitutos' })).toBeVisible();
  expect(await desbordes(page), 'sustitutos').toEqual([]);
});

test('responsable de un equipo: solo reparte a su gente, sin «todo el equipo» ni botones de toda la unidad', async ({ page }) => {
  const d = [trabajo('t1', 'Basuras', { asignados: [LEO], nombres: ['Leo Prueba'] })];
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: { ...rpc(d), mi_equipo: () => [LEO],
    repartir: (b: Record<string, unknown>) => { Object.assign(d[0], { asignados: b.p_personas, nombres: [] }); return null; } } });
  await page.goto('./#/m/limpieza/hoy');
  await expect(page.locator('.fila', { hasText: 'Basuras' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Faltas y sustitutos' })).toHaveCount(0);
  await page.locator('.fila', { hasText: 'Basuras' }).click();
  await page.getByRole('button', { name: 'Cambiar a quién le toca' }).click();
  const v = page.getByRole('dialog', { name: '¿A quién le toca? · Basuras' });
  await expect(v.getByLabel('Todo el equipo')).toHaveCount(0);
  await expect(v.locator('.fila')).toHaveText(['Leo Prueba']);
  await v.getByRole('button', { name: 'Dejar sin asignar' }).click();
  await expect(page.getByText('Queda sin asignar')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/repartir'))!.cuerpo).toEqual({ p_trabajo: 't1', p_personas: [], p_todo_equipo: false, p_equipo: null });
  await expect(page.locator('.subtitulo', { hasText: 'Sin asignar' })).toBeVisible();
});

test('personas: hacer a alguien responsable de un equipo', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: { ...tablas(), responsables: [] }, rpc: rpc() });
  await page.goto('./#/m/limpieza/personas');
  await page.locator('.fila', { hasText: 'Marta Prueba' }).getByRole('button', { name: 'Es responsable de un equipo' }).click();
  const v = page.getByRole('dialog', { name: 'Equipo de Marta Prueba' });
  await expect(v.locator('.fila')).toHaveText(['Leo Prueba']);
  await v.getByLabel('Leo Prueba').check();
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.fila', { hasText: 'Marta Prueba' })).toContainText('Reparte solo a: Leo Prueba');
  expect(sim.find((l) => l.metodo === 'POST' && l.ruta.includes('/rest/v1/responsables'))!.cuerpo).toMatchObject({ persona_id: MARTA, operarios: [LEO] });
});
