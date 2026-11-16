// Limpieza · «Mi día» del operario: siguiente / después / atrasados / hechos, empezar, pausar, terminar con checklist,
// fotos, sin red y crear un trabajo de la lista. Unidades, personas y máquinas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '12121212-0000-0000-0000-000000000001';
const LEO = '12121212-0000-0000-0000-0000000000f1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const hoy = new Date().toLocaleDateString('sv-SE');
const sesion = (permisos = ['limpieza.modulo.ver', 'limpieza.trabajo.apuntar']) => ({
  usuario: { id: USUARIO.id, nombre: 'Leo Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-l', nombre: 'Unidad L', modulos: ['limpieza'], permisos }],
});
const trabajo = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, empresa_id: UNIDAD, fecha: hoy, clase: 'fija', titulo, descripcion: null, lugar: null, minutos_est: null, estado: 'pendiente', inicio: null,
  pausa_desde: null, pausado_min: 0, fin: null, minutos: null, nota: null, problema: null, fotos: [], atrasado: false, nombres: ['Leo Prueba'],
  maquina: null, zona: null, turno: null, mio: true, puedo: true, hecho_por_nombre: null, checklist: null, ...extra,
});
const DIA = () => [
  trabajo('t1', 'Limpieza F77', { maquina: 'F77', minutos_est: 30, turno: 'Tarde', nombres: ['Leo Prueba', 'Marta Prueba'] }),
  trabajo('t2', 'Barrer pasillo', { minutos_est: 20 }),
  trabajo('t3', 'Recoger cartones', { clase: 'suelto', atrasado: true, fecha: '2000-01-01' }),
  trabajo('t4', 'Vaciar basuras', { estado: 'hecho', minutos: 15, fin: new Date().toISOString() }),
  trabajo('t5', 'De otra persona', { mio: false }),
];
const PUNTOS = [{ texto: 'Robot', tipo: 'ok', foto_si_mal: true, plantilla: 'Inyectoras' }, { texto: 'Bidones', tipo: 'num', minimo: 2, plantilla: 'Inyectoras' }];
const rpc = (dia = DIA()) => ({
  mi_dia: () => dia, puntos: (b: Record<string, unknown>) => (b.p_trabajo === 't1' ? PUNTOS : []),
  // como la base de datos: cambian el trabajo (así, al recargar, sale como quedó)
  empezar: (b: Record<string, unknown>) => { Object.assign(dia.find((x) => x.id === b.p_trabajo)!, { estado: 'en_curso', inicio: b.p_cuando }); return null; },
  pausar: (b: Record<string, unknown>) => { Object.assign(dia.find((x) => x.id === b.p_trabajo)!, { estado: 'pausado', pausa_desde: b.p_cuando }); return null; },
  seguir: (b: Record<string, unknown>) => { Object.assign(dia.find((x) => x.id === b.p_trabajo)!, { estado: 'en_curso', pausa_desde: null }); return null; },
  terminar: (b: Record<string, unknown>) => { Object.assign(dia.find((x) => x.id === b.p_trabajo)!, { estado: 'hecho', minutos: b.p_minutos, fin: b.p_cuando }); return null; },
  poner_foto: () => null,
  avisar_problema: (b: Record<string, unknown>) => { Object.assign(dia.find((x) => x.id === b.p_trabajo)!, { problema: b.p_texto }); return null; },
  habituales_para_mi: () => [{ id: 'h1', titulo: 'Cambiar taladrina', descripcion: null, grupo: 'limpieza', lugar: null, minutos_est: 15, maquina: 'M7' }],
  crear_trabajo: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => { dia.push(trabajo('t9', 'Cambiar taladrina', { clase: 'habitual', maquina: 'M7' })); void b; void t; return 't9'; },
});
const tablas = () => ({ usuarios: [{ id: USUARIO.id, nombre: 'Leo Prueba', persona_id: LEO }] });

test('mi día: lo siguiente, lo de después, lo atrasado y lo hecho; solo lo mío', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await expect(page.getByRole('heading', { name: 'Siguiente' })).toBeVisible();
  const sig = page.locator('.fila-grande');
  await expect(sig).toContainText('Limpieza F77');
  await expect(sig).toContainText('F77 · Tarde · suele llevar 30 min');
  await expect(sig).toContainText('Con Leo Prueba, Marta Prueba');
  await expect(page.locator('.fila', { hasText: 'Recoger cartones' }).locator('.chapa')).toHaveText('Atrasado');
  await expect(page.locator('.fila', { hasText: 'Barrer pasillo' })).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Vaciar basuras' }).locator('.chapa')).toHaveText('Hecho');
  await expect(page.locator('.fila', { hasText: 'De otra persona' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Limpieza' })).toHaveCount(0); // el operario no ve Tareas ni Checklists
  expect(errores).toEqual([]);
});

test('trabajo: empezar, pausar, seguir y terminar con la checklist (foto obligatoria si está mal)', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await page.locator('.fila-grande').click();
  const v = page.getByRole('dialog', { name: 'Limpieza F77' });
  await v.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.fila-grande .chapa')).toHaveText('En curso');
  await v.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.locator('.fila-grande .chapa')).toHaveText('En pausa');
  await v.getByRole('button', { name: 'Seguir' }).click();
  await v.getByRole('button', { name: 'Terminar' }).click();
  const tv = page.getByRole('dialog', { name: 'Terminar: Limpieza F77' });
  await tv.getByRole('group', { name: 'Robot' }).getByRole('button', { name: 'Mal' }).click();
  await tv.getByLabel('Bidones').fill('1');
  await expect(tv.getByText('Por debajo del mínimo: avisa a tu encargado.')).toBeVisible();
  // acaba de empezar: pregunta el tiempo
  await expect(tv.getByText('Has pulsado «Empezar» y «Terminar» casi a la vez. ¿Cuánto has tardado?')).toBeVisible();
  await tv.getByRole('button', { name: 'Sí, 30 min' }).click();
  await tv.getByRole('button', { name: 'Terminar' }).click();
  await expect(tv.getByRole('alert')).toHaveText('«Robot» está mal: haz una foto.');
  await tv.getByLabel('Foto de Robot').setInputFiles({ name: 'robot.png', mimeType: 'image/png', buffer: PNG });
  await expect(tv.getByText('Foto hecha ✓ (cambiar)')).toBeVisible();
  await tv.getByRole('button', { name: 'Terminar' }).click();
  await expect(page.getByText('Trabajo terminado')).toBeVisible();
  await expect.poll(() => sim.some((l) => l.ruta.includes('/rpc/terminar'))).toBe(true);
  const nombres = sim.filter((l) => l.ruta.includes('/rpc/') || l.ruta.includes('/storage/')).map((l) => l.ruta.replace(/\?.*$/, '').replace(/^.*\/(rpc|object)\//, ''));
  expect(nombres.filter((n) => !['mi_dia', 'puntos', 'mi_sesion'].some((x) => n.startsWith(x)))).toEqual(
    ['empezar', 'pausar', 'seguir', expect.stringMatching(new RegExp(`^limpieza/${UNIDAD}/trabajos/t1/\\d+-punto-1\\.jpg$`)), 'poner_foto', 'terminar']);
  const b = sim.find((l) => l.ruta.includes('/rpc/terminar'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_trabajo: 't1', p_minutos: 30, p_nota: null });
  expect(b.p_checklist).toEqual([{ valor: 'mal', foto: expect.stringMatching(/\/trabajos\/t1\//) }, { valor: 1 }]);
  expect(sim.find((l) => l.ruta.includes('/rpc/empezar'))!.perfil).toBe('limpieza');
  await expect(page.locator('.fila', { hasText: 'Limpieza F77' }).locator('.chapa')).toHaveText('Hecho');
  expect(errores).toEqual([]);
});

test('sin red: lo que hace se queda en el móvil y se manda solo al volver la red', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await expect(page.locator('.fila-grande')).toBeVisible();
  await page.route('**/rest/v1/rpc/empezar', (r) => r.abort('internetdisconnected'));
  await page.locator('.fila', { hasText: 'Barrer pasillo' }).click();
  await page.getByRole('dialog', { name: 'Barrer pasillo' }).getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 cosa por enviar' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('.fila', { hasText: 'Barrer pasillo' }).locator('.chapa')).toHaveText('En curso'); // cambia al momento
  // vuelve la red
  await page.unroute('**/rest/v1/rpc/empezar');
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText('por enviar')).toHaveCount(0);
  const b = sim.filter((l) => l.ruta.includes('/rpc/empezar')).at(-1)!.cuerpo as Record<string, unknown>;
  expect(b.p_trabajo).toBe('t2');
  expect(Date.parse(String(b.p_cuando))).toBeLessThanOrEqual(Date.now()); // con la hora a la que lo pulsó
});

test('hay un problema y crear un trabajo de la lista', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await page.locator('.fila', { hasText: 'Barrer pasillo' }).click();
  await page.getByRole('button', { name: 'Hay un problema' }).click();
  await page.getByLabel('¿Qué pasa?').fill('No hay escoba');
  await page.getByRole('button', { name: 'Avisar' }).click();
  await expect(page.getByText('Aviso: No hay escoba')).toBeVisible();
  await expect.poll(() => (sim.find((l) => l.ruta.includes('/rpc/avisar_problema'))?.cuerpo as Record<string, unknown>)?.p_texto).toBe('No hay escoba');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: '+ Trabajo' }).click();
  await page.getByLabel('Buscar en la lista').fill('tala');
  await page.locator('.fila', { hasText: 'Cambiar taladrina' }).click();
  await expect(page.getByRole('dialog', { name: 'Cambiar taladrina' })).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/crear_trabajo'))!.cuerpo).toMatchObject({ p_empresa: UNIDAD, p_fecha: hoy, p_tarea: 'h1', p_titulo: null });
});

test('terminar sin haber pulsado Empezar y sin tiempo previsto: elige cuánto', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc([trabajo('t6', 'Fregar oficina')]) });
  await page.goto('./#/m/limpieza');
  await page.locator('.fila-grande').click();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  const tv = page.getByRole('dialog', { name: 'Terminar: Fregar oficina' });
  await tv.getByRole('group', { name: 'Minutos' }).getByRole('button', { name: '45 min' }).click();
  await tv.getByRole('button', { name: 'Terminar' }).click();
  await expect.poll(() => (sim.find((l) => l.ruta.includes('/rpc/terminar'))?.cuerpo as Record<string, unknown>)?.p_minutos).toBe(45);
});

test('un trabajo que se quedó en marcha 19 h: pregunta cuánto se tardó de verdad', async ({ page }) => {
  const inicio = new Date(Date.now() - 19 * 3600e3).toISOString();
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(),
    rpc: rpc([trabajo('t7', 'Derrame de aceite', { estado: 'en_curso', inicio, minutos_est: 30 })]) });
  await page.goto('./#/m/limpieza');
  await page.locator('.fila-grande').click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  const tv = page.getByRole('dialog', { name: 'Terminar: Derrame de aceite' });
  await expect(tv).toContainText('Lleva 19 h en marcha: seguramente se quedó sin terminar.');
  await tv.getByRole('button', { name: 'No, otro' }).click();
  await tv.getByLabel('U otro (minutos)').fill('25');
  await tv.getByRole('button', { name: 'Terminar' }).click();
  await expect.poll(() => (sim.find((l) => l.ruta.includes('/rpc/terminar'))?.cuerpo as Record<string, unknown>)?.p_minutos).toBe(25);
});

test('el tiempo medido se puede corregir', async ({ page }) => {
  const inicio = new Date(Date.now() - 50 * 60e3).toISOString();
  const sim = await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc([trabajo('t8', 'Fregar', { estado: 'en_curso', inicio })]) });
  await page.goto('./#/m/limpieza');
  await page.locator('.fila-grande').click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  const tv = page.getByRole('dialog', { name: 'Terminar: Fregar' });
  await expect(tv).toContainText('Has tardado 50 min.');
  await tv.getByRole('button', { name: 'No, he tardado otra cosa' }).click();
  await tv.getByRole('group', { name: 'Minutos' }).getByRole('button', { name: '30 min', exact: true }).click();
  await tv.getByRole('button', { name: 'Terminar' }).click();
  await expect.poll(() => (sim.find((l) => l.ruta.includes('/rpc/terminar'))?.cuerpo as Record<string, unknown>)?.p_minutos).toBe(30);
});

test('Mi día en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(), tablas: tablas(), rpc: rpc() });
  await page.goto('./#/m/limpieza');
  await expect(page.locator('.fila-grande')).toBeVisible();
  expect(await desbordes(page), 'mi día').toEqual([]);
  await page.locator('.fila-grande').click();
  expect(await desbordes(page), 'trabajo').toEqual([]);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await page.getByRole('group', { name: 'Robot' }).getByRole('button', { name: 'Mal' }).click();
  expect(await desbordes(page), 'terminar').toEqual([]);
});
