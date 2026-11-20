// Limpieza · pestaña «Resumen»: en pantalla, informe semanal e informe por operario (PDF y Excel). Personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '72727272-0000-0000-0000-000000000001';
const LEO = '72727272-0000-0000-0000-0000000000f1';
const MARTA = '72727272-0000-0000-0000-0000000000f2';
const dia = (f: string, n: number) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const hoy = new Date().toLocaleDateString('sv-SE');
const LUNES = dia(hoy, -((new Date(hoy + 'T12:00:00').getDay() + 6) % 7) - 7);   // el lunes de la semana pasada
const ADMIN = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.informe.ver', 'limpieza.informe.todo', 'limpieza.incidencia.editar',
  'personal.horas.editar'];
const ENCARGADO = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.trabajo.repartir', 'limpieza.informe.ver'];
const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-r', nombre: 'Unidad R', modulos: ['limpieza', 'personal'], permisos }],
});
const trabajo = (id: string, fecha: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, fecha, clase: 'suelto', tarea_id: null, titulo, descripcion: null, lugar: null, maquina: null, minutos_est: 20, minutos: null, tiempo_auto: false,
  estado: 'pendiente', inicio: null, fin: null, pausado_min: 0, hecho_por: null, hecho_por_nombre: null, asignados: [], asignados_nombres: [],
  asignados_orig_nombres: [], aviso_reparto: null, todo_equipo: false, equipo: 'Semana', turno: null, urgente: false, origen: null, problema: null,
  nota: null, checklist_puntos: 0, checklist_mal: 0, fotos: 0, creado_por_nombre: null, ...extra,
});
const hecho = (id: string, fecha: string, titulo: string, quien: [string, string], min: number, extra: Record<string, unknown> = {}) =>
  trabajo(id, fecha, titulo, { estado: 'hecho', hecho_por: quien[0], hecho_por_nombre: quien[1], asignados: [quien[0]], asignados_nombres: [quien[1]],
    minutos: min, inicio: `${fecha}T08:00:00+01:00`, fin: `${fecha}T09:00:00+01:00`, ...extra });
const trabajos = () => [
  hecho('t1', LUNES, 'Barrer F4', [LEO, 'Leo Prueba'], 40, { clase: 'fija', minutos_est: 20, checklist_puntos: 3, checklist_mal: 1 }),
  hecho('t2', dia(LUNES, 1), 'Barrer F4', [LEO, 'Leo Prueba'], 30, { clase: 'fija', minutos_est: 20 }),
  hecho('t3', dia(LUNES, 2), 'Fregar pasillo', [MARTA, 'Marta Prueba'], 15),
  trabajo('t4', dia(LUNES, 3), 'Vaciar escoria', { asignados: [MARTA], asignados_nombres: ['Marta Prueba'], problema: 'No hay contenedor' }),
  hecho('t5', dia(LUNES, 5), 'Repaso del sábado', [LEO, 'Leo Prueba'], 25),
];
const personas = [{ id: LEO, nombre: 'Leo Prueba', equipo_id: null, equipo: 'Semana', baja: null }, { id: MARTA, nombre: 'Marta Prueba', equipo_id: null, equipo: 'Semana', baja: null }];
const horas = (desde: string, hasta: string) => {
  const out: Record<string, unknown>[] = [];
  for (let f = desde; f <= hasta; f = dia(f, 1)) for (const [id, n] of [[LEO, 'Leo Prueba'], [MARTA, 'Marta Prueba']]) {
    const dw = new Date(f + 'T12:00:00').getDay(), lab = dw >= 1 && dw <= 5;
    const hor = lab ? 7 : id === MARTA && dw === 6 ? 5 : 0;          // Marta trabaja 5 h los sábados
    const baja = id === MARTA && (f === dia(LUNES, 4) || f === dia(LUNES, 5));   // Marta de baja viernes y sábado
    const marta2 = id === MARTA && f === dia(LUNES, 2);   // Marta: 2 h fuera de presupuesto el miércoles
    const leoSab = id === LEO && f === dia(LUNES, 5);      // Leo: trabaja el sábado cubriendo a Marta
    out.push({ persona_id: id, nombre: n, jornada: 'completa', horas_semana: 35, fecha: f, dow: dw, tipo_dia: null, nombre_dia: null, horario: hor,
      prevista: hor, vacaciones: false, apuntado: marta2 || leoSab, trabajadas: leoSab ? 4 : marta2 ? 9 : null, fuera: marta2 ? 2 : 0,
      extra_mano: null, falta: baja ? 'baja' : null, nota: marta2 ? 'Avería en F4' : null,
      horas: leoSab ? 4 : marta2 ? 9 : baja ? 0 : hor });
  }
  return out;
};
const rpc = (alcance = 'todo', ts = trabajos()) => ({
  informe: (b: Record<string, unknown>) => ({ alcance, unidad: 'Unidad R', personas,
    trabajos: ts.filter((t) => t.fecha >= String(b.p_desde) && t.fecha <= String(b.p_hasta)) }),
  horas_dias: (b: Record<string, unknown>) => horas(String(b.p_desde), String(b.p_hasta)),
  problemas_lista: () => [{ tema: 'Fuga de aceite', lugar: 'F4', casos: [{ fecha: dia(LUNES, 1), titulo: 'Fuga en F4', quien: 'Leo Prueba' }, { fecha: dia(LUNES, 2), titulo: 'Otra fuga', quien: 'Marta Prueba' }] }],
});
const tablas = () => ({
  'limpieza.incidencias': [{ id: 'i1', empresa_id: UNIDAD, tema: 'Fuga de aceite', texto: 'Mancha grande junto a F4', lugar: 'F4', urgente: true, estado: 'abierta',
    creado: `${dia(LUNES, 1)}T10:15:00+01:00`, persona_id: LEO, fotos: [] }],
  'limpieza.sustituciones': [{ empresa_id: UNIDAD, ausente: MARTA, sustituto: LEO, desde: dia(LUNES, 4), hasta: dia(LUNES, 6), nota: null }],
  ajustes: [{ empresa_id: UNIDAD, modulo: 'personal', clave: 'bolsa_inicio', valor: '2026-10-05', centro_id: null }],
});

/** Pulsa cada botón de archivo de «Informe listo» y devuelve lo descargado (nombre → contenido). */
async function descargas(page: Page) {
  const v = page.getByRole('dialog', { name: 'Informe listo' });
  await expect(v).toBeVisible({ timeout: 20_000 });
  const out = new Map<string, Buffer>();
  for (const b of await v.locator('.acciones-cal button').all()) {
    const [d] = await Promise.all([page.waitForEvent('download'), b.click()]);
    out.set(d.suggestedFilename(), readFileSync((await d.path())!));
  }
  return out;
}
const textoPDF = (b: Buffer) => b.toString('latin1');

test('resumen en pantalla: cifras, por persona y cuánto tarda (en rojo si tarda más)', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: tablas(), rpc: rpc('todo', [...trabajos()].map((t) => ({ ...t, fecha: hoy }))) });
  await page.goto('./#/m/limpieza');
  await expect(page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button', { name: 'Resumen' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button', { name: 'Resumen' }).click();
  await expect(page.locator('.cifras > div b')).toHaveText(['5', '4', '80 %', '1']);
  await expect(page.locator('.lista').first().locator('.fila')).toHaveText([/Leo Prueba.*3 de 3 hechos.*1 checklist mal.*tiempo medio 32 min/, /Marta Prueba.*1 de 2 hechos.*1 con problema/]);
  await expect(page.locator('.fila', { hasText: 'Barrer F4' }).locator('.res-tarde')).toHaveText('media real 35 min');
  await expect(page.locator('.fila', { hasText: 'Fregar pasillo' }).locator('.res-tarde')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entre fechas' }).click();
  await page.getByLabel('Desde').fill('2026-10-01');
  await page.getByLabel('Hasta').fill('2026-10-31');
  await expect.poll(() => sim.filter((l) => l.ruta.includes('/rpc/informe')).map((l) => l.cuerpo).pop()).toEqual({ p_empresa: UNIDAD, p_desde: '2026-10-01', p_hasta: '2026-10-31' });
  await page.getByLabel('Hasta').fill('2026-09-01');
  await expect(page.getByRole('alert')).toContainText('«Hasta» no puede ser antes de «Desde»');
  expect(errores).toEqual([]);
});

test('informe semanal del administrador: PDF con horas, incidencias y repetidos; Excel con sus hojas', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: tablas(), rpc: rpc() });
  await page.goto(`./#/m/limpieza/resumen/informes/${dia(LUNES, 3)}`);   // como el aviso del lunes (cualquier día lleva a su semana)
  await expect(page.locator('.res-semana b')).toContainText(`${LUNES.slice(8, 10)}/${LUNES.slice(5, 7)} al`);
  await page.getByRole('button', { name: 'Descargar PDF + Excel' }).click();
  const f = await descargas(page);
  const nombres = [...f.keys()].sort();
  expect(nombres).toHaveLength(2);
  expect(nombres[0]).toMatch(new RegExp(`^informe-limpieza-semana-\\d+-${LUNES}\\.pdf$`));
  const pdf = textoPDF(f.get(nombres[0])!);
  expect(pdf.startsWith('%PDF')).toBe(true);
  for (const t of ['Informe semanal de limpieza', 'Unidad R', 'Por persona', 'Horas de la semana', 'Avería en F4', 'Sustituye a',
    'Con problema o sin hacer', 'No hay contenedor', 'Problemas que se repiten', 'Fuga de aceite', 'Mancha grande junto a F4', 'Detalle de todos los trabajos'])
    expect(pdf, t).toContain(t);
  const hojas = await readXlsxFile(f.get(nombres[1])!);
  expect(hojas.map((h) => h.sheet)).toEqual(['Resumen', 'Trabajos', 'Incidencias', 'Repetidos', 'Horas']);
  const horasH = hojas.find((h) => h.sheet === 'Horas')!.data;
  expect(horasH[0]).toEqual(['Persona', 'Jornada', 'Horas trabajadas', 'Extra a mano', 'Fuera de presupuesto', 'Por sustitución', 'Bolsa de la semana (h)']);
  // Leo: 5 días de 7 h + 4 h el sábado cubriendo a Marta (ella hace 5 h los sábados y él no tiene horario: 4 h por sustitución); bolsa 39 − 35 = 4
  expect(horasH.find((r) => r[0] === 'Leo Prueba')).toEqual(['Leo Prueba', 'Completa', 39, 0, 0, 4, 4]);
  // Marta: 7+7+9+7 = 30 h, 2 fuera; la baja del viernes (7 h) y del sábado (5 h) bajan sus 35 a 23: 30 − 23 = 7
  expect(horasH.find((r) => r[0] === 'Marta Prueba')).toEqual(['Marta Prueba', 'Completa', 30, 0, 2, 0, 7]);
  expect(hojas.find((h) => h.sheet === 'Trabajos')!.data).toHaveLength(6);
  expect(sim.some((l) => l.ruta.includes('/rpc/horas_dias') && l.perfil === 'personal')).toBe(true);
  expect(errores).toEqual([]);
});

test('informe semanal: una semana sin trabajos avisa y no hace archivos', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: tablas(), rpc: rpc('todo', []) });
  await page.goto('./#/m/limpieza/resumen/informes');
  await page.getByRole('button', { name: 'Solo PDF' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Sin trabajos esa semana' })).toBeVisible();
});

test('informe por operario del administrador: tiempo real y horas con detalle, sin fin de semana si se quita', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza/resumen/informes');
  const tarjeta = page.locator('.res-tarjeta', { hasText: 'Informe por operario' });
  await tarjeta.getByRole('button', { name: 'Solo PDF' }).click();
  await expect(tarjeta.getByRole('alert')).toContainText('Marca al menos un operario');
  await tarjeta.getByLabel('Leo Prueba').check();
  await tarjeta.getByLabel('Cualquier día de la semana').fill(dia(LUNES, 2));
  await tarjeta.getByRole('button', { name: 'PDF + Excel' }).click();
  const f = await descargas(page);
  const pdfN = [...f.keys()].find((n) => n.endsWith('.pdf'))!, xN = [...f.keys()].find((n) => n.endsWith('.xlsx'))!;
  expect(pdfN).toBe(`informe-leo-prueba-semana-${LUNES}.pdf`);
  const pdf = textoPDF(f.get(pdfN)!);
  for (const t of ['Informe por operario', 'Leo Prueba', 'Horas día a día', 'Tiempo real', 'Repaso del sábado', 'Por sustitución']) expect(pdf, t).toContain(t);
  expect(pdf).not.toContain('Fregar pasillo');
  const hojas = await readXlsxFile(f.get(xN)!);
  expect(hojas.map((h) => h.sheet)).toEqual(['Resumen', 'Trabajos', 'Horas día a día']);
  const res = hojas[0].data;
  const cab = res[3] as string[], leo = res[4];
  expect(leo[0]).toBe('Leo Prueba');
  expect(leo[cab.indexOf('Trabajos hechos')]).toBe(3);
  expect(leo[cab.indexOf('Minutos reales')]).toBe(95);
  expect(leo[cab.indexOf('Días trabajados')]).toBe(6);
  expect(leo[cab.indexOf('Horas entre semana')]).toBe(35);
  expect(leo[cab.indexOf('Horas fin de semana')]).toBe(4);
  expect(leo[cab.indexOf('Por sustitución')]).toBe(4);
  const sab = hojas[2].data.find((r) => r[1] === dia(LUNES, 5))!;
  expect([sab[7], sab[8]]).toEqual([4, 'Marta Prueba']);
  await page.getByRole('dialog', { name: 'Informe listo' }).getByRole('button', { name: 'Cerrar' }).first().click();

  // sin fin de semana: el trabajo del sábado no sale
  await tarjeta.getByLabel('Incluir el fin de semana').uncheck();
  await tarjeta.getByRole('button', { name: 'Solo Excel' }).click();
  const g = await descargas(page);
  const h2 = await readXlsxFile([...g.values()][0]);
  expect(h2[1].data.map((r) => r[2])).not.toContain('Repaso del sábado');
  expect(errores).toEqual([]);
});

test('el encargado: ve el Resumen de su equipo, sin horas ni incidencias', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ENCARGADO), tablas: tablas(), rpc: rpc('equipo') });
  await page.goto('./#/m/limpieza/resumen');
  await expect(page.getByText('Ves los trabajos de tu equipo.')).toBeVisible();
  await page.getByRole('button', { name: 'Informes' }).click();
  await expect(page.locator('.res-tarjeta', { hasText: 'Informe semanal' })).not.toContainText('incidencias');
  await page.getByRole('button', { name: 'Descargar PDF + Excel' }).click();
  const f = await descargas(page);
  const pdf = textoPDF([...f.entries()].find(([n]) => n.endsWith('.pdf'))![1]);
  expect(pdf).toContain('Por persona');
  expect(pdf).not.toContain('Horas de la semana');
  expect(pdf).not.toContain('Incidencias');
  const hojas = await readXlsxFile([...f.entries()].find(([n]) => n.endsWith('.xlsx'))![1]);
  expect(hojas.map((h) => h.sheet)).toEqual(['Resumen', 'Trabajos']);
  expect(sim.some((l) => l.ruta.includes('horas_dias') || l.ruta.includes('problemas_lista') || l.ruta.includes('incidencias'))).toBe(false);
  expect(errores).toEqual([]);
});

test('el operario no ve la pestaña Resumen', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(['limpieza.modulo.ver', 'limpieza.trabajo.apuntar']), rpc: { mi_dia: () => [] } });
  await page.goto('./#/m/limpieza');
  await expect(page.getByRole('navigation', { name: 'Limpieza' }).getByRole('button')).toHaveText(['Mi día', 'Incidencias']);
});

test('nada se sale a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: tablas(), rpc: rpc('todo', [...trabajos()].map((t) => ({ ...t, fecha: hoy }))) });
  await page.goto('./#/m/limpieza/resumen');
  await expect(page.locator('.cifras')).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Entre fechas' }).click();
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Informes' }).click();
  await expect(page.locator('.res-marcas')).toBeVisible();
  await page.getByRole('button', { name: 'Entre fechas' }).click();
  expect(await desbordes(page)).toEqual([]);
});
