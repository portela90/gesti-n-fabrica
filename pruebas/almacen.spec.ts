// Almacén (trozo 1b): Stock con pedidos y ficha, Movimientos con su formulario, Apuntar con el lector por reglas, notas,
// inventario, lista de pedido, y que nada se aplaste a 320 px. Unidad, artículos, máquinas y personas inventados.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO, irApartado } from './simulador';

const U = 'a1a1a1a1-0000-0000-0000-000000000001';
const N1 = 'a1a1a1a1-0000-0000-0000-0000000000c1', N2 = 'a1a1a1a1-0000-0000-0000-0000000000c2';
const GEN = 'a1a1a1a1-0000-0000-0000-0000000000a1', PN2 = 'a1a1a1a1-0000-0000-0000-0000000000a2';
const GUANTE = 'a1a1a1a1-0000-0000-0000-0000000000d1', ACEITE = 'a1a1a1a1-0000-0000-0000-0000000000d2', TRAPO = 'a1a1a1a1-0000-0000-0000-0000000000d3';
const F27 = 'a1a1a1a1-0000-0000-0000-0000000000e1', F30 = 'a1a1a1a1-0000-0000-0000-0000000000e2';
const OP37 = 'a1a1a1a1-0000-0000-0000-0000000000f1', GEST = 'a1a1a1a1-0000-0000-0000-0000000000f2';
const PROV = 'a1a1a1a1-0000-0000-0000-0000000000b1';
const ENCARGADO = ['nucleo.persona.ver', 'almacen.stock.ver', 'almacen.movimiento.apuntar', 'almacen.movimiento.corregir', 'almacen.pedido.apuntar', 'almacen.dotacion.editar'];
const LECTURA = ['almacen.stock.ver'];
const hoy = () => new Date().toLocaleDateString('sv-SE');
const antes = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };

const sesion = (permisos: string[]) => ({
  usuario: { id: USUARIO.id, nombre: 'Encargada Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: U, codigo: 'fab-p', nombre: 'Fábrica P', modulos: ['almacen'], permisos }],
});
let n = 0;
const mov = (o: Record<string, unknown>) => ({
  id: `m${++n}`, empresa_id: U, fecha: hoy(), destino_id: null, contado: null, teorico: null, centro_id: null, activos: [], persona_id: null, gestor_id: null,
  proveedor_id: null, albaran: null, pedido_en: null, motivo: null, perdida: false, nota: null, origen: 'colada-mapri:alm_mov:x' + n, extra: {}, creado: new Date().toISOString(), creado_por: null, ...o,
});
const tablas = () => ({
  familias: [{ id: 'fa1', empresa_id: U, codigo: 'consumible', nombre: 'Consumibles', orden: 0, baja: null }],
  articulos: [
    { id: GUANTE, empresa_id: U, codigo: 'guantes-de-nitrilo', nombre: 'Guantes de nitrilo', unidad: 'ud', minimo: 20, familia_id: 'fa1', baja: null },
    { id: ACEITE, empresa_id: U, codigo: 'AC-46', nombre: 'Aceite hidráulico 46', unidad: 'l', minimo: 50, familia_id: 'fa1', baja: null },
    { id: TRAPO, empresa_id: U, codigo: 'trapos', nombre: 'Trapos de algodón', unidad: 'kg', minimo: null, familia_id: 'fa1', baja: null },
  ],
  almacenes: [
    { id: GEN, empresa_id: U, codigo: 'gen', nombre: 'Almacén general', tipo: 'general', centro_id: null, orden: 1, baja: null },
    { id: PN2, empresa_id: U, codigo: 'n2', nombre: 'Almacén producción N2', tipo: 'produccion', centro_id: N2, orden: 2, baja: null },
  ],
  centros: [{ id: N1, empresa_id: U, codigo: 'nave', nombre: 'NAVE 1', baja: null }, { id: N2, empresa_id: U, codigo: 'nave-2', nombre: 'NAVE 2', baja: null }],
  activos: [{ id: F27, empresa_id: U, codigo: 'F27', nombre: null, centro_id: N2, baja: null }, { id: F30, empresa_id: U, codigo: 'F30', nombre: null, centro_id: N1, baja: null }],
  proveedores: [{ id: PROV, empresa_id: U, codigo: 'suministros-x', nombre: 'Suministros Inventados', contacto: { plazo_dias: 7 }, baja: null }],
  personas: [{ id: OP37, empresa_id: U, nombre: 'Operario 37', baja: null }, { id: GEST, empresa_id: U, nombre: 'Gestor Uno', baja: null }],
  'almacen.gestores': [{ persona_id: GEST, empresa_id: U }],
  'almacen.fichas': [
    { articulo_id: GUANTE, empresa_id: U, proveedor_id: PROV, ref_proveedor: 'GN-9', plazo_dias: null, punto_pedido: 30, almacen_principal_id: GEN, ubicacion: 'Estante 3', notas: null,
      pedido_en: null, pedido_cantidad: null, envase: 'caja de 100', maquinas: [], por_maquina: null, atributos: {} },
    { articulo_id: ACEITE, empresa_id: U, proveedor_id: PROV, ref_proveedor: null, plazo_dias: 10, punto_pedido: null, almacen_principal_id: GEN, ubicacion: null, notas: null,
      pedido_en: antes(20), pedido_cantidad: 200, envase: null, maquinas: [F27], por_maquina: null, atributos: {} },
  ],
  'almacen.sinonimos': [],
  'almacen.notas': [],
  'almacen.dotacion': [
    { empresa_id: U, almacen_id: PN2, articulo_id: GUANTE, cantidad: 10 },   // hay 4: faltan 6
    { empresa_id: U, almacen_id: PN2, articulo_id: ACEITE, cantidad: 20 },   // hay 30: completo
  ],
  'almacen.bajar': [],
  ajustes: [],
  'almacen.stock': [
    { empresa_id: U, articulo_id: GUANTE, almacen_id: GEN, cantidad: 10 }, { empresa_id: U, articulo_id: GUANTE, almacen_id: PN2, cantidad: 4 },
    { empresa_id: U, articulo_id: ACEITE, almacen_id: PN2, cantidad: 30 }, { empresa_id: U, articulo_id: TRAPO, almacen_id: GEN, cantidad: 12 },
  ],
  'almacen.movimientos': [
    mov({ fecha: antes(30), tipo: 'entrada', articulo_id: GUANTE, almacen_id: GEN, cantidad: 30 }),
    mov({ fecha: antes(10), tipo: 'salida', articulo_id: GUANTE, almacen_id: GEN, cantidad: 2, activos: [F27], centro_id: N2, extra: { se_lo_llevo: 'KEPA' } }),
    mov({ fecha: antes(5), tipo: 'salida', articulo_id: GUANTE, almacen_id: GEN, cantidad: 2, activos: [F27], centro_id: N2 }),
  ],
});
const rpc = {
  marcar_pedido: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => { const f = t['almacen.fichas'].find((x) => x.articulo_id === b.p_articulo); if (f) { f.pedido_en = hoy(); f.pedido_cantidad = b.p_cantidad; } return null; },
  poner_minimos: (b: Record<string, unknown>) => (b.p_minimos as unknown[]).length,
  guardar_ajuste: () => null,
  anular_pedido: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => { const f = t['almacen.fichas'].find((x) => x.articulo_id === b.p_articulo); if (f) f.pedido_en = null; return null; },
};
const posts = (ll: { metodo: string; ruta: string; cuerpo: unknown }[], ruta: string) => ll.filter((l) => l.metodo === 'POST' && l.ruta.startsWith(ruta)).map((l) => l.cuerpo);

async function abrir(page: Page, apartado = 'stock', permisos = ENCARGADO) {
  const ll = await simular(page, { dentro: true, sesion: sesion(permisos), tablas: tablas(), rpc });
  await page.goto(`./#/m/almacen/${apartado}`);
  return ll;
}

test('stock: pedidos en curso, para pedir (y marcarlo), existencias y la ficha del artículo', async ({ page }) => {
  const err = vigilar(page);
  const ll = await abrir(page);
  await page.getByText('Pedidos en curso (1)').click();
  await page.getByText('Para pedir (1)').click();
  const enCurso = page.getByRole('region', { name: 'Pedidos en curso' });
  await expect(enCurso.locator('.fila', { hasText: 'Aceite hidráulico 46' })).toContainText('200 l');
  await expect(enCurso.locator('.chapa')).toContainText('Retrasado 10 d');   // pedido hace 20 días con 10 de plazo
  const pedir = page.getByRole('region', { name: 'Para pedir' });
  await expect(pedir.locator('.fila', { hasText: 'Guantes de nitrilo' })).toContainText('Mín 20');   // hay 14 < 20: crítico
  await expect(pedir.locator('.chapa')).toHaveText('Crítico');
  await pedir.getByRole('button', { name: /Marcar pedido/ }).click();
  expect(posts(ll, '/rest/v1/rpc/marcar_pedido')[0]).toMatchObject({ p_articulo: GUANTE });
  await expect(page.getByText('Pedidos en curso (2)')).toBeVisible();
  await expect(enCurso.locator('.fila', { hasText: 'Guantes de nitrilo' })).toBeVisible();
  // la ficha
  await page.locator('.lista .fila', { hasText: 'Trapos de algodón' }).click();
  const v = page.getByRole('dialog', { name: 'Trapos de algodón' });
  await expect(v.locator('.cifras-ficha')).toContainText('12 kg');
  await expect(v).toContainText('Sin mínimo');
  await v.getByRole('button', { name: 'Cerrar' }).click();
  // «Ha llegado» abre la entrada rellena
  await enCurso.locator('.fila', { hasText: 'Aceite' }).getByRole('button', { name: 'Ha llegado' }).click();
  const f = page.getByRole('dialog', { name: 'Apuntar un movimiento' });
  await expect(f.getByLabel(/^Cantidad/)).toHaveValue('200');
  await f.getByRole('button', { name: 'Guardar' }).click();
  await expect(f).toBeHidden();
  expect(posts(ll, '/rest/v1/movimientos')[0]).toMatchObject({ tipo: 'entrada', articulo_id: ACEITE, almacen_id: GEN, cantidad: 200, proveedor_id: PROV, creado_por: USUARIO.id });
  expect(err).toEqual([]);
});

test('consumo a mano: máquina, nave, quién se lo lleva y gestor; avisa una vez si queda en negativo', async ({ page }) => {
  const ll = await abrir(page, 'apuntar');
  await page.getByRole('button', { name: 'Consumo', exact: true }).click();
  const f = page.getByRole('dialog', { name: 'Apuntar un movimiento' });
  await f.getByLabel('Buscar artículo').fill('guant');
  await expect(f.getByLabel('Almacén')).toHaveValue(PN2);   // salida: primero el de producción con stock
  await f.getByLabel(/^Cantidad/).fill('6');
  await expect(f.locator('.calculo')).toContainText('quedan -2');
  await f.getByLabel('Para (máquina o nave, si se sabe)').selectOption({ label: 'F27' });
  await f.getByLabel('Quién se lo lleva').selectOption({ label: 'Operario 37' });
  await f.getByLabel('Gestor de relevo').selectOption({ label: 'Gestor Uno' });
  await f.getByRole('button', { name: 'Guardar' }).click();
  await expect(f.getByRole('alert')).toContainText('quedaría en negativo');
  expect(posts(ll, '/rest/v1/movimientos')).toHaveLength(0);
  await f.getByRole('button', { name: 'Guardar de todas formas' }).click();
  await expect(f).toBeHidden();
  expect(posts(ll, '/rest/v1/movimientos')[0]).toMatchObject({ tipo: 'salida', articulo_id: GUANTE, almacen_id: PN2, cantidad: 6, activos: [F27], centro_id: N2, persona_id: OP37, gestor_id: GEST });
});

test('apuntar escribiendo: el lector hace las tarjetas, se elige lo que no conoce y aprende la palabra', async ({ page }) => {
  const err = vigilar(page);
  const ll = await abrir(page, 'apuntar');
  await page.getByLabel('¿Qué ha pasado? Escríbelo o díctalo como lo dirías').fill('ayer 2 guantes para la F27 el 37 y 10 litros de aceite en N2. Llegaron 5 kg de mopas al general');
  await page.getByRole('button', { name: 'Entender' }).click();
  const t = page.locator('.tarjeta-apunte');
  await expect(t).toHaveCount(3);
  await expect(t.nth(0).getByLabel('Artículo', { exact: true })).toHaveValue(GUANTE);
  await expect(t.nth(0).getByLabel('Quién se lo lleva')).toHaveValue(OP37);
  await expect(t.nth(0).locator('.calculo')).toContainText('Para F27');
  await expect(t.nth(1).getByLabel('Artículo', { exact: true })).toHaveValue(ACEITE);
  await expect(t.nth(1).getByLabel(/^Almacén/)).toHaveValue(PN2);
  await expect(t.nth(2).getByLabel('Qué')).toHaveValue('entrada');
  await expect(t.nth(2)).toContainText('No conozco «mopas»');
  await expect(page.getByRole('button', { name: 'Faltan datos en 1 de 3' })).toBeDisabled();
  await t.nth(2).getByLabel('Artículo', { exact: true }).selectOption(TRAPO);
  await expect(t.nth(2)).toContainText('La próxima vez, «mopas» será Trapos de algodón');
  await page.getByRole('button', { name: 'Guardar todo (3)' }).click();
  await expect(page.locator('.tarjeta-apunte')).toHaveCount(0);
  const m = posts(ll, '/rest/v1/movimientos')[0] as Record<string, unknown>[];
  expect(m).toHaveLength(3);
  expect(m[0]).toMatchObject({ tipo: 'salida', articulo_id: GUANTE, cantidad: 2, fecha: antes(1), activos: [F27], persona_id: OP37 });
  expect(m[1]).toMatchObject({ tipo: 'salida', articulo_id: ACEITE, cantidad: 10, almacen_id: PN2, fecha: antes(1) });
  expect(m[2]).toMatchObject({ tipo: 'entrada', articulo_id: TRAPO, cantidad: 5, almacen_id: GEN });
  expect(posts(ll, '/rest/v1/sinonimos')[0]).toMatchObject({ palabra: 'mopas', articulo_id: TRAPO });
  expect(err).toEqual([]);
});

test('notas pendientes: se guarda lo escrito y luego se procesa y se borra', async ({ page }) => {
  const ll = await abrir(page, 'apuntar');
  await page.getByLabel('¿Qué ha pasado? Escríbelo o díctalo como lo dirías').fill('3 guantes para la F30');
  await page.getByRole('button', { name: 'Guardar como nota' }).click();
  await expect(page.getByRole('region', { name: 'Notas pendientes' })).toContainText('3 guantes para la F30');
  await page.getByRole('button', { name: 'Procesar todas' }).click();
  await page.getByRole('button', { name: 'Guardar todo (1)' }).click();
  await expect(page.getByRole('region', { name: 'Notas pendientes' })).toHaveCount(0);
  expect(ll.some((l) => l.metodo === 'DELETE' && l.ruta.startsWith('/rest/v1/notas'))).toBe(true);
});

test('recuento: guarda la diferencia con lo que dice la app; inventario de un almacén', async ({ page }) => {
  const ll = await abrir(page, 'stock');
  await page.getByRole('button', { name: /Más/ }).click();
  await page.getByRole('button', { name: 'Inventario' }).click();
  const v = page.getByRole('dialog', { name: 'Inventario' });
  await v.getByLabel('Contado de Guantes de nitrilo').fill('7');
  await expect(v.locator('tr', { hasText: 'Guantes' })).toContainText('-3');
  await v.getByRole('button', { name: 'Guardar el inventario' }).click();
  expect(posts(ll, '/rest/v1/movimientos')[0]).toEqual([expect.objectContaining({ tipo: 'ajuste', articulo_id: GUANTE, almacen_id: GEN, cantidad: -3, contado: 7, teorico: 10, nota: 'Inventario de Almacén general' })]);
});

test('lista de pedido por proveedor, para copiar o mandar por WhatsApp', async ({ page }) => {
  await abrir(page, 'stock');
  await page.getByRole('button', { name: /Más/ }).click();
  await page.getByRole('button', { name: /Lista de pedido/ }).click();
  const v = page.getByRole('dialog', { name: 'Lista de pedido' });
  await expect(v.locator('.texto-pedido')).toContainText('*Suministros Inventados*');
  await expect(v.locator('.texto-pedido')).toContainText('Guantes de nitrilo (ref. GN-9): pedir');
  await expect(v.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /wa\.me/);
});

test('movimientos: el mes, con quién se lo llevó (texto de la vieja); solo lectura no apunta ni corrige', async ({ page }) => {
  await abrir(page, 'movimientos', LECTURA);
  await expect(page.locator('.lista .fila', { hasText: 'Se lo llevó: KEPA' })).toBeVisible();
  await page.locator('.lista .fila', { hasText: 'KEPA' }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Corregir movimiento' })).toHaveCount(0);   // solo lectura: tocarlo no abre nada
  await expect(page.locator('.lateral-nav button', { hasText: 'Apuntar' })).toHaveCount(0);
});

test('movimientos: tocar uno lo abre para corregirlo, con «Borrar» dentro; filtros en «⋯ Más»', async ({ page }) => {
  const ll = await abrir(page, 'movimientos');
  await page.getByRole('button', { name: /Más/ }).click();
  await page.getByLabel('Qué').selectOption('perdida');
  await expect(page.locator('.lista .fila')).toHaveCount(0);
  await page.getByLabel('Qué').selectOption('');
  await page.locator('.lista .fila', { hasText: 'KEPA' }).click();
  const v = page.getByRole('dialog', { name: 'Corregir movimiento' });
  page.once('dialog', (d) => d.accept());
  await v.getByRole('button', { name: 'Borrar' }).click();
  await expect(v).toBeHidden();
  expect(ll.some((l) => l.metodo === 'DELETE' && l.ruta.startsWith('/rest/v1/movimientos'))).toBe(true);
});

test('ordenador: stock y movimientos en tabla', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrir(page, 'stock');
  await expect(page.locator('table.tabla tbody tr', { hasText: 'Guantes de nitrilo' })).toContainText('14 ud');
  await irApartado(page, 'Almacén', 'Movimientos');
  await expect(page.locator('table.tabla tbody tr', { hasText: 'KEPA' })).toContainText('-2 ud');
});

test('Almacén en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await abrir(page, 'stock');
  await page.getByText('Para pedir (1)').click();
  await expect(page.getByRole('region', { name: 'Para pedir' })).toBeVisible();
  await page.getByRole('button', { name: /Más/ }).click();
  expect(await desbordes(page), 'stock').toEqual([]);
  await page.locator('.lista .fila', { hasText: 'Guantes de nitrilo' }).last().click();
  expect(await desbordes(page), 'ficha').toEqual([]);
  await page.getByRole('dialog', { name: 'Guantes de nitrilo' }).getByRole('button', { name: 'Consumo', exact: true }).click();
  await page.getByLabel('Para (máquina o nave, si se sabe)').selectOption('varias');
  expect(await desbordes(page), 'consumo').toEqual([]);
  await page.goto('./#/m/almacen/apuntar');
  await page.getByLabel('¿Qué ha pasado? Escríbelo o díctalo como lo dirías').fill('2 guantes para la F27 y 3 cosas raras');
  await page.getByRole('button', { name: 'Entender' }).click();
  await expect(page.locator('.tarjeta-apunte')).toHaveCount(2);
  expect(await desbordes(page), 'apuntar').toEqual([]);
  await page.goto('./#/m/almacen/movimientos');
  await expect(page.locator('.lista .fila').first()).toBeVisible();
  expect(await desbordes(page), 'movimientos').toEqual([]);
});

test('hoy: solo «lo urgente», una línea por aviso que lleva a su sitio; lo demás, plegado en «Más…»', async ({ page }) => {
  const err = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(ENCARGADO), tablas: tablas(), rpc });
  await page.goto('./#/m/almacen');
  await expect(page.locator('.cifra-hoy')).toHaveCount(0);
  const urgente = page.getByRole('region', { name: 'Lo urgente' });
  await expect(urgente.locator('.linea-aviso').first()).toContainText('1 artículo para pedir (1 bajo mínimo)');
  await expect(urgente).toContainText('1 pedido retrasado');
  await expect(page.getByRole('region', { name: 'Este mes' })).toBeHidden();
  await page.getByText('Más… (apuntado hoy y este mes)').click();
  await expect(page.getByRole('region', { name: 'Este mes' })).toContainText('Consumos');
  await urgente.getByRole('button', { name: /Bajar 1 artículo a planta/ }).click();
  await expect(page.getByRole('region', { name: 'Hoja de carga' })).toBeVisible();
  expect(err).toEqual([]);
});

test('reponer hoy: hoja de carga, cambiar cuánto y reponer crea el traslado (sin pasar de lo que hay en el origen)', async ({ page }) => {
  const err = vigilar(page);
  const ll = await abrir(page, 'reponer');
  const carga = page.getByRole('region', { name: 'Hoja de carga' });
  await expect(carga.locator('.fila', { hasText: 'Guantes de nitrilo' })).toContainText('6 ud');
  await expect(carga).toContainText('Desde Almacén general');
  const n2 = page.getByRole('region', { name: 'Almacén producción N2' });
  await expect(n2).toContainText('faltan 1');
  await expect(n2.locator('details')).toContainText('1 completos');
  await n2.getByLabel('Cuánto bajar de Guantes de nitrilo a Almacén producción N2').fill('20');   // en el general solo hay 10
  await n2.getByRole('button', { name: /Reponer marcados/ }).click();
  await expect(page.locator('.aviso')).toContainText('Faltó');
  expect(posts(ll, '/rest/v1/movimientos')[0]).toEqual([expect.objectContaining({ tipo: 'traslado', articulo_id: GUANTE, almacen_id: GEN, destino_id: PN2, cantidad: 10, nota: 'Reposición Almacén producción N2' })]);
  expect(err).toEqual([]);
});

test('reponer: quitar una fila y la dotación de un almacén', async ({ page }) => {
  const ll = await abrir(page, 'reponer');
  const n2 = page.getByRole('region', { name: 'Almacén producción N2' });
  await n2.getByRole('button', { name: 'Más opciones de Guantes de nitrilo' }).click();
  await n2.getByRole('button', { name: 'Quitar' }).click();
  expect(posts(ll, '/rest/v1/bajar')[0]).toMatchObject({ almacen_id: PN2, articulo_id: GUANTE, quitado_stock: 4 });
  await expect(page.getByText('Hoy no hay nada que bajar')).toBeVisible();   // ya no sale: no se ha gastado nada desde que se quitó
  await page.getByRole('button', { name: 'Volver a mostrar' }).click();
  await expect(page.getByRole('region', { name: 'Hoja de carga' })).toBeVisible();
  await page.getByRole('region', { name: 'Almacén producción N2' }).getByRole('button', { name: 'Dotación' }).click();
  const v = page.getByRole('dialog', { name: 'Dotación de Almacén producción N2' });
  await v.getByLabel('Debe haber de Guantes de nitrilo').fill('8');
  await v.getByRole('button', { name: 'Guardar' }).click();
  expect(posts(ll, '/rest/v1/dotacion')[0]).toEqual([expect.objectContaining({ almacen_id: PN2, articulo_id: GUANTE, cantidad: 8 })]);
});

test('previsión y falta y sobra; solo lectura no cambia la dotación', async ({ page }) => {
  const ll = await abrir(page, 'prevision');
  await expect(page.locator('.cifras-ficha')).toContainText('Artículos a pedir');
  await expect(page.getByText('menos de 90 días')).toBeVisible();
  await expect(page.locator('.lista .fila', { hasText: 'Guantes de nitrilo' })).toContainText('al día');
  await page.getByRole('button', { name: 'Aplicar lo sugerido' }).click();
  await page.getByRole('dialog', { name: 'Aplicar lo sugerido' }).getByRole('button', { name: 'Aplicar' }).click();
  expect(posts(ll, '/rest/v1/rpc/poner_minimos')[0]).toMatchObject({ p_empresa: U });
  await page.goto('./#/m/almacen/faltasobra');
  await expect(page.locator('.cifras-ficha')).toContainText('Faltan');
  await expect(page.locator('.lista .fila', { hasText: 'Trapos de algodón' }).locator('.chapa')).toHaveText('Sin datos');
  await irApartado(page, 'Almacén', 'Dotación');
  await expect(page.getByLabel('Dotación de Guantes de nitrilo en Almacén producción N2')).toHaveValue('10');
});

test('Hoy y Reponer en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await abrir(page, 'hoy');
  await expect(page.getByRole('region', { name: 'Lo urgente' })).toBeVisible();
  expect(await desbordes(page), 'hoy').toEqual([]);
  await page.goto('./#/m/almacen/reponer');
  await expect(page.getByRole('region', { name: 'Hoja de carga' })).toBeVisible();
  expect(await desbordes(page), 'reponer').toEqual([]);
  await page.getByRole('region', { name: 'Almacén producción N2' }).getByRole('button', { name: 'Más opciones de Guantes de nitrilo' }).click();
  expect(await desbordes(page), 'reponer con botones').toEqual([]);
  for (const p of ['dotacion', 'prevision', 'faltasobra']) {
    await page.goto('./#/m/almacen/' + p);
    await page.locator('main .nota, main .cifras-ficha').first().waitFor();
    expect(await desbordes(page), p).toEqual([]);
  }
});
