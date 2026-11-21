// Limpieza · Resumen → «Investigar» (solo el administrador): saturación, pasar trabajos, tiempos, problemas y sitios. Personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '73737373-0000-0000-0000-000000000001';
const ANA = '73737373-0000-0000-0000-0000000000f1', BEA = '73737373-0000-0000-0000-0000000000f2', CIRO = '73737373-0000-0000-0000-0000000000f3';
const EQ = '73737373-0000-0000-0000-0000000000e1';
const BARRER = '73737373-0000-0000-0000-0000000000b1', FREGAR = '73737373-0000-0000-0000-0000000000b2', REPASO = '73737373-0000-0000-0000-0000000000b3';
const LUNES = '2026-11-02', DIAS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const ADMIN = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.plan.ver', 'limpieza.plan.editar', 'limpieza.informe.ver',
  'limpieza.informe.todo', 'personal.horas.editar', 'nucleo.configuracion.editar'];
const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-s', nombre: 'Unidad S', modulos: ['limpieza', 'personal'], permisos }],
});
let n = 0;
const trabajo = (fecha: string, titulo: string, quien: [string, string], ini: string, min: number, extra: Record<string, unknown> = {}) => {
  const i = new Date(`${fecha}T${ini}:00+01:00`), f = new Date(i.getTime() + min * 60000);
  return { id: `73737373-0000-0000-0000-${String(++n).padStart(12, '0')}`, fecha, clase: 'suelto', tarea_id: null, titulo, descripcion: null, lugar: null, maquina: null,
    minutos_est: null, minutos: min, tiempo_auto: false, estado: 'hecho', inicio: i.toISOString(), fin: f.toISOString(), pausado_min: 0, hecho_por: quien[0],
    hecho_por_nombre: quien[1], asignados: [quien[0]], asignados_nombres: [quien[1]], asignados_orig_nombres: [], aviso_reparto: null, todo_equipo: false,
    equipo: 'Semana', turno: null, urgente: false, origen: null, problema: null, nota: null, checklist_puntos: 0, checklist_mal: 0, fotos: 0, creado_por_nombre: null, ...extra };
};
function datos() {
  n = 0;
  const A: [string, string] = [ANA, 'Ana Prueba'], B: [string, string] = [BEA, 'Bea Prueba'];
  const T = DIAS.flatMap((f, i) => [
    trabajo(f, 'Barrer pasillo', A, '08:00', 300, { clase: 'fija', tarea_id: BARRER, minutos_est: 300 }),
    trabajo(f, 'Fregar', A, '13:10', 90, { clase: 'fija', tarea_id: FREGAR, minutos_est: 90 }),
    i === 0 || i === 2 ? trabajo(f, 'Fuga de aceite', B, '09:00', 60, { maquina: 'F19' }) : trabajo(f, 'Repaso', B, '09:00', 120, { clase: 'habitual', tarea_id: REPASO, minutos_est: 60 }),
  ]);
  T.push(trabajo('2026-11-07', 'Repaso del sábado', B, '09:00', 30));
  const fugas = T.filter((t) => t.titulo === 'Fuga de aceite');
  return {
    alcance: 'todo', unidad: 'Unidad S', personas: [], trabajos: T,
    problemas: fugas.map((t) => ({ id: t.id, tema: 'Aceite', sitio_clave: 'F19', sitio: 'F19' })),
    tareas: [
      { id: BARRER, clase: 'fija', titulo: 'Barrer pasillo', minutos_est: 300, dias: [1, 2, 3, 4, 5], equipo_id: EQ, asignados: [ANA], todo_equipo: false },
      { id: FREGAR, clase: 'fija', titulo: 'Fregar', minutos_est: 90, dias: [1, 2, 3, 4, 5], equipo_id: EQ, asignados: [ANA], todo_equipo: false },
      { id: REPASO, clase: 'habitual', titulo: 'Repaso', minutos_est: 60, dias: null, equipo_id: null, asignados: [], todo_equipo: false },
    ],
    horarios: [ANA, BEA, CIRO].map((id, i) => ({ id, nombre: ['Ana Prueba', 'Bea Prueba', 'Ciro Prueba'][i], equipo_id: EQ, jornada: 'completa', horas_dow: [0, 7, 7, 7, 7, 7, 0] })),
  };
}
const horas = (b: Record<string, unknown>) => {
  const out: Record<string, unknown>[] = [];
  for (let d = new Date(`${b.p_desde}T12:00:00`); d.toLocaleDateString('sv-SE') <= String(b.p_hasta); d.setDate(d.getDate() + 1)) {
    const f = d.toLocaleDateString('sv-SE'), dw = d.getDay(), h = dw >= 1 && dw <= 5 ? 7 : 0;
    for (const [id, nom] of [[ANA, 'Ana Prueba'], [BEA, 'Bea Prueba'], [CIRO, 'Ciro Prueba']]) out.push({ persona_id: id, nombre: nom, jornada: 'completa', horas_semana: 35, fecha: f,
      dow: dw, tipo_dia: null, nombre_dia: null, horario: h, prevista: h, vacaciones: false, apuntado: false, trabajadas: null, fuera: 0, extra_mano: null, falta: null, nota: null, horas: h });
  }
  return out;
};
const rpc = () => ({ investigar: () => datos(), horas_dias: horas, pasar_tarea: () => 2, poner_tiempos: (b: Record<string, unknown>) => (b.p_items as unknown[]).length,
  informe: () => ({ alcance: 'todo', unidad: 'Unidad S', personas: [], trabajos: [] }) });

async function abrir(page: Page) {
  await page.goto('./#/m/limpieza/resumen/investigar');
  await page.getByLabel('Desde').fill(LUNES);
  await page.getByLabel('Hasta').fill('2026-11-08');
  await expect(page.locator('.cifras > div b').first()).toHaveText('39 %');
}

test('investigar: saturación, problemas, sitios repetidos y lo que no cuadra', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(ADMIN), rpc: rpc() });
  await page.goto('./#/m/limpieza/resumen');
  await expect(page.getByRole('group', { name: 'Resumen' }).getByRole('button')).toHaveText(['En pantalla', 'Informes', 'Investigar']);
  await abrir(page);
  // equipo: (2000 + 480) / 6300 = 39 %; de quien apunta: 2480 / 4200 = 59 %
  await expect(page.locator('.cifras > div')).toHaveText([/39 %Saturación del equipo/, /59 %De quien apunta/, /105 hHoras de jornada/, /40 h 30 minEn trabajos/,
    /50 minDesplazamiento/, /63 h 40 minSin justificar/, /2 hEn problemas/]);
  const sat = page.locator('.res-tarjeta', { hasText: 'Saturación de cada trabajador' });
  await expect(sat.locator('.lista .fila b')).toHaveText(['Ana Prueba 95 %', 'Bea Prueba 23 %', 'Ciro Prueba 0 %']);
  await expect(sat.locator('.res-mal')).toHaveText('95 %');
  await expect(sat).toContainText('1 persona no tiene ningún trabajo apuntado a su nombre: Ciro Prueba');
  await expect(page.locator('.res-tarjeta', { hasText: 'Tiempo perdido en problemas' }).locator('.fila')).toContainText('Aceite2 veces · 2 h · 1 h de media · 1 sitio');
  const rep = page.locator('.res-tarjeta', { hasText: 'Máquinas y zonas donde se repite' });
  await expect(rep.locator('.fila')).toHaveCount(1);
  await expect(rep.locator('.fila')).toContainText('F19 · Aceite2 veces · 2 h de limpieza · una cada 2 días');
  await page.getByText('Tiempos que no cuadran').click();
  await expect(page.locator('details', { hasText: 'Tiempos que no cuadran' })).toContainText('sáb 07/11 · Bea Prueba');
  await expect(page.locator('details', { hasText: 'Tiempos que no cuadran' })).toContainText('trabajo en un día sin horas de jornada');
  expect(errores).toEqual([]);
});

test('investigar: pasar un trabajo fijo desde la ficha de quien está muy cargado', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ADMIN), rpc: rpc() });
  await abrir(page);
  const pasar = page.locator('.res-tarjeta', { hasText: 'Trabajos que se pueden pasar a otro' });
  await expect(pasar).toContainText('Ana Prueba · 95 %');
  await expect(pasar.locator('.fila', { hasText: 'Barrer pasillo' })).toContainText('Nadie del equipo que trabaje esos días tiene hueco');
  await expect(pasar.locator('.fila', { hasText: 'Fregar' })).toContainText('Mejor opción: Bea Prueba: del 23 % al 44 %');
  await page.locator('.res-tarjeta', { hasText: 'Saturación de cada trabajador' }).locator('.fila', { hasText: 'Ana Prueba' }).click();
  const ficha = page.getByRole('dialog', { name: 'Ana Prueba' });
  await expect(ficha).toContainText('95 % de saturación (33 h 20 min de 35 h de jornada)');
  await ficha.locator('.fila', { hasText: 'Fregar' }).getByRole('button', { name: 'Pasar' }).click();
  const conf = page.getByRole('dialog', { name: 'Pasar un trabajo fijo' });
  await expect(conf).toContainText('Desde hoy, «Fregar» (de lunes a viernes) lo hará Bea Prueba en vez de Ana Prueba.');
  await conf.getByRole('button', { name: 'Pasar' }).click();
  await expect(page.getByText('Pasado a Bea Prueba (y 2 trabajos pendientes)')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/pasar_tarea'))!.cuerpo).toEqual({ p_tarea: FREGAR, p_de: ANA, p_a: BEA });
  expect(errores).toEqual([]);
});

test('investigar: tiempos propuestos y «Aplicar»; cambiar el 85 % y los 30 min', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(ADMIN), tablas: { ajustes: [] }, rpc: rpc() });
  await abrir(page);
  await page.getByText('Tiempos de cada trabajo').click();
  const t = page.locator('details', { hasText: 'Tiempos de cada trabajo' });
  // Repaso: (5 × 60 + 3 × 120) / 8 = 82,5 → 83 min
  await expect(t.locator('.fila').first()).toContainText('Repaso');
  await expect(t.locator('.fila').first()).toContainText('previsto 1 h · real 2 h (3) · propuesto 1 h 23 min (+23 min)');
  await expect(t.getByRole('button', { name: 'Aplicar todos (1)' })).toBeVisible();
  await t.locator('.fila').first().getByRole('button', { name: 'Aplicar' }).click();
  await expect(t.locator('.fila').first().getByText('Aplicado')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/poner_tiempos'))!.cuerpo).toEqual({ p_empresa: UNIDAD, p_items: [{ id: REPASO, minutos: 83 }] });

  await page.getByRole('button', { name: 'Cambiar' }).click();
  const v = page.getByRole('dialog', { name: 'Números de Investigar' });
  await v.getByLabel('Muy cargado desde (%)').fill('120');
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(v.getByRole('alert')).toContainText('entre 50 y 100');
  await v.getByLabel('Muy cargado desde (%)').fill('96');
  await v.getByLabel('Desplazamiento y preparación (minutos)').fill('5');
  await v.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Muy cargado desde el 96 % · huecos de hasta 5 min')).toBeVisible();
  expect(sim.tablas.ajustes.map((a) => [a.modulo, a.clave, a.valor])).toEqual([['limpieza', 'investigar_limite', 96], ['limpieza', 'investigar_hueco', 5]]);
  // con huecos de 5 min, los 10 min entre «Barrer» y «Fregar» ya no cuentan: Ana baja a 2000 − 50 = 1950 / 2100 = 93 %, y ya no pasa del 96 %
  await expect(page.locator('.res-tarjeta', { hasText: 'Saturación de cada trabajador' }).locator('.lista .fila b').first()).toHaveText('Ana Prueba 93 %');
  await expect(page.locator('.res-tarjeta', { hasText: 'Trabajos que se pueden pasar a otro' })).toContainText('nadie pasa del 96 %');
  expect(errores).toEqual([]);
});

test('investigar: informe PDF + Excel y la ficha de un sitio en PDF', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(ADMIN), rpc: rpc() });
  await abrir(page);
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Informe PDF' }).click()]);
  expect(d1.suggestedFilename()).toBe('investigacion-limpieza-2026-11-02_2026-11-08.pdf');
  const pdf = readFileSync((await d1.path())!).toString('latin1');
  for (const s of ['Investigación de Limpieza', 'Saturación de cada trabajador', 'Tiempo perdido en problemas', 'Máquinas y zonas donde se repite', 'Ana Prueba'])
    expect(pdf, s).toContain(s);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
  const hojas = await readXlsxFile(readFileSync((await d2.path())!));
  expect(hojas.map((h) => h.sheet)).toEqual(['Saturación', 'No cuadran', 'Problemas', 'Repetidos', 'Avisos de problemas', 'Trabajos']);
  expect(hojas[0].data[1].slice(0, 6)).toEqual(['Ana Prueba', 35, 32.5, 0.8, 1.7, 95]);
  await page.locator('.res-tarjeta', { hasText: 'Máquinas y zonas donde se repite' }).locator('.fila').click();
  const v = page.getByRole('dialog', { name: 'F19 · Aceite' });
  await expect(v).toContainText('F19 ha tenido 2 veces «Aceite» entre el 02/11/2026 y el 04/11/2026: una cada 2 días de media. Se han empleado 2 h en limpiarlas.');
  const [d3] = await Promise.all([page.waitForEvent('download'), v.getByRole('button', { name: 'Informe PDF' }).click()]);
  expect(d3.suggestedFilename()).toBe('repeticiones-F19-Aceite.pdf');
  expect(readFileSync((await d3.path())!).toString('latin1')).toContain('Fuga de aceite');
  expect(errores).toEqual([]);
});

test('investigar: el encargado no lo ve', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(['limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.informe.ver']), rpc: rpc() });
  await page.goto('./#/m/limpieza/resumen/investigar');
  await expect(page.getByRole('group', { name: 'Resumen' }).getByRole('button')).toHaveText(['En pantalla', 'Informes']);
  await expect(page.getByRole('button', { name: 'En pantalla' })).toHaveAttribute('aria-pressed', 'true');
});

test('investigar: nada se sale a 320 px, tampoco las fichas', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await simular(page, { dentro: true, sesion: sesion(ADMIN), rpc: rpc() });
  await abrir(page);
  for (const d of ['Tiempos que no cuadran', 'En qué se va el tiempo', 'Tiempos de cada trabajo', 'Qué días pasan más']) await page.locator('details.res-tarjeta > summary', { hasText: d }).click();
  expect(await desbordes(page)).toEqual([]);
  await page.locator('.res-tarjeta', { hasText: 'Saturación de cada trabajador' }).locator('.fila', { hasText: 'Ana Prueba' }).click();
  await expect(page.getByRole('dialog', { name: 'Ana Prueba' })).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
});
