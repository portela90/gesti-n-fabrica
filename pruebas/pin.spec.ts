// Entrar con código de alta + PIN (parte 8). Personas inventadas; la función «pin» está simulada.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO, PERMISOS_ADMIN, EMPRESA_A } from './simulador';

const E = EMPRESA_A.id;
const OLI = 'aaaaaaaa-0000-0000-0000-0000000000f1', PEPA = 'aaaaaaaa-0000-0000-0000-0000000000f2', LUIS = 'aaaaaaaa-0000-0000-0000-0000000000f3';
const operario = { usuario: { id: USUARIO.id, nombre: 'Oli Prueba', superadmin: false, empresa_actual: null }, empresas: [{ ...EMPRESA_A, permisos: [] }] };
const MOVIL = { movil: 'm-1', llave: 'a'.repeat(64), nombre: 'Oli Prueba' };

async function teclear(page: Page, pin: string) {
  for (const c of pin) await page.getByRole('group', { name: /PIN/ }).getByRole('button', { name: c, exact: true }).click();
}

test('el administrador saca el código de alta de un operario, con su QR; ve quién está bloqueado', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true,
    sesion: { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null },
      empresas: [{ ...EMPRESA_A, permisos: [...PERMISOS_ADMIN, 'nucleo.usuario.ver', 'nucleo.usuario.editar'] }] },
    tablas: {
      roles: [{ id: 'r-ope', empresa_id: null, codigo: 'operario', nombre: 'Operario', descripcion: null, baja: null },
        { id: 'r-adm', empresa_id: null, codigo: 'admin_empresa', nombre: 'Administrador', descripcion: null, baja: null }],
      personas: [{ id: OLI, empresa_id: E, nombre: 'Oli Prueba', baja: null }, { id: PEPA, empresa_id: E, nombre: 'Pepa Prueba', baja: null },
        { id: LUIS, empresa_id: E, nombre: 'Luis Prueba', baja: null }],
      usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', email: USUARIO.email, superadmin: false, persona_id: null },
        { id: 'u-pepa', nombre: 'Pepa Prueba', email: null, superadmin: false, persona_id: PEPA }],
      asignaciones: [{ id: 'as-0', usuario_id: USUARIO.id, rol_id: 'r-adm', empresa_id: E, centro_id: null, hasta: null },
        { id: 'as-1', usuario_id: 'u-pepa', rol_id: 'r-ope', empresa_id: E, centro_id: null, hasta: null }],
      moviles: [{ id: 'm-p', usuario_id: 'u-pepa', empresa_id: E, fallos: 5, bloqueado: '2026-11-20T10:00:00Z', ultimo: null, baja: null, creado: '2026-11-01T10:00:00Z' }],
      codigos_alta: [{ id: 'c-l', empresa_id: E, persona_id: LUIS, rol_id: 'r-ope', centro_id: null, caduca: '2099-01-01T00:00:00Z', usado: null, anulado: null }],
    },
    rpc: { codigo_alta: () => 'K7P2-9QXM', codigo_anular: () => null } });
  await page.goto('./#/config/usuarios');
  const pepa = page.locator('.fila', { hasText: 'Pepa Prueba' });
  await expect(pepa).toContainText('Bloqueado: dale un código nuevo');
  await expect(pepa.getByRole('button', { name: 'Otro rol' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Códigos de alta sin usar' })).toContainText('Luis Prueba');

  await page.getByRole('button', { name: 'Operario: código de alta (PIN)' }).click();
  const v = page.getByRole('dialog');
  await expect(v.locator('#pin-rol')).toHaveValue('r-ope');   // el rol de operario, de partida
  await v.getByRole('button', { name: 'Sacar el código' }).click();
  await expect(v.getByRole('alert')).toHaveText('Elige el trabajador.');
  await v.locator('#pin-persona').selectOption({ label: 'Oli Prueba' });
  await v.getByRole('button', { name: 'Sacar el código' }).click();
  await expect(page.locator('#codigoAlta')).toHaveText('K7P2-9QXM');
  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  expect(sim.find((l) => l.ruta.endsWith('/rpc/codigo_alta'))!.cuerpo).toEqual({ p_persona: OLI, p_rol: 'r-ope', p_centro: null });
  await page.getByRole('button', { name: 'Hecho' }).click();

  // el bloqueado: código nuevo con su mismo rol
  await pepa.getByRole('button', { name: 'Nuevo código de alta' }).click();
  await expect(page.getByRole('dialog').locator('#pin-persona')).toHaveValue(PEPA);
  await expect(page.getByRole('dialog').locator('#pin-persona')).toBeDisabled();
  expect(errores).toEqual([]);
});

test('el operario da de alta su móvil con el QR y elige su PIN (no uno fácil, y dos veces igual)', async ({ page }) => {
  const errores = vigilar(page);
  let pedido: Record<string, unknown> | null = null;
  const sim = await simular(page, { sesion: operario, funciones: {
    pin: (b) => { pedido = b; return b.codigo === 'K7P29QXM' ? [200, { movil: 'm-1', nombre: 'Oli Prueba', token_hash: 'vale-1' }] : [400, { error: 'CODIGO' }]; } } });
  await page.goto('./#/alta/K7P2-9QXM');
  await expect(page.getByRole('heading', { name: 'Dar de alta este móvil' })).toBeVisible();
  await expect(page.getByText('Código K7P2-9QXM.')).toBeVisible();
  await teclear(page, '1234');
  await expect(page.getByRole('alert')).toContainText('muy fácil de adivinar');
  await teclear(page, '2580');
  await expect(page.getByText('Repite tu PIN')).toBeVisible();
  await teclear(page, '2581');
  await expect(page.getByRole('alert')).toHaveText('No es el mismo PIN. Vuelve a elegirlo.');
  await expect(page.getByText('Elige tu PIN', { exact: true })).toBeVisible();
  await teclear(page, '2580');
  await expect(page.getByText('Repite tu PIN')).toBeVisible();
  await teclear(page, '2580');
  await expect(page.locator('.cabecera')).toBeAttached();
  expect(pedido).toMatchObject({ accion: 'alta', codigo: 'K7P29QXM', pin: '2580' });
  expect(String(pedido!.llave)).toMatch(/^[0-9a-f]{64}$/);
  expect(sim.find((l) => l.ruta.startsWith('/auth/v1/verify'))!.cuerpo).toMatchObject({ token_hash: 'vale-1', type: 'email' });
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('gf-moviles-pin') ?? '[]'));
  expect(guardado).toEqual([{ movil: 'm-1', llave: pedido!.llave, nombre: 'Oli Prueba' }]);   // el PIN no se guarda
  expect(page.url()).not.toContain('K7P2');   // el código se quita de la dirección
  expect(errores).toEqual([]);
});

test('código escrito a mano: si no vale, lo dice', async ({ page }) => {
  await simular(page, { sesion: operario, funciones: { pin: () => [400, { error: 'CODIGO' }] } });
  await page.goto('./');
  await page.getByRole('button', { name: 'Soy operario: tengo un código de alta' }).click();
  await page.locator('#codigo-alta').fill('abc');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('alert')).toContainText('8 letras y números');
  await page.locator('#codigo-alta').fill('zzzz zzzz');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await teclear(page, '2580');
  await expect(page.getByText('Repite tu PIN')).toBeVisible();
  await teclear(page, '2580');
  await expect(page.getByRole('alert')).toContainText('Ese código no vale');
  await expect(page.locator('#codigo-alta')).toBeVisible();
});

test('con el móvil ya dado de alta: solo el PIN; avisa de los intentos que quedan', async ({ page }) => {
  const errores = vigilar(page);
  const pedidos: Record<string, unknown>[] = [];
  await page.addInitScript((m) => localStorage.setItem('gf-movil-pin', JSON.stringify(m)), MOVIL);
  await simular(page, { sesion: operario, funciones: {
    pin: (b) => { pedidos.push(b); return b.pin === '2580' ? [200, { token_hash: 'vale-2' }] : [401, { error: 'PIN', quedan: 3 }]; } } });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Hola, Oli' })).toBeVisible();
  await teclear(page, '1111');
  await expect(page.getByRole('alert')).toHaveText('PIN incorrecto. Te quedan 3 intentos antes de que se bloquee este móvil.');
  // también con el teclado del ordenador
  await page.keyboard.type('2580');
  await expect(page.getByText('Pon tu PIN')).toHaveCount(0);
  expect(pedidos.at(-1)).toEqual({ accion: 'entrar', movil: 'm-1', llave: MOVIL.llave, pin: '2580' });
  expect(errores).toEqual([]);
});

test('móvil bloqueado o dado de baja: lo explica y deja usar un código nuevo', async ({ page }) => {
  await page.addInitScript((m) => localStorage.setItem('gf-movil-pin', JSON.stringify(m)), MOVIL);
  await simular(page, { sesion: operario, funciones: { pin: () => [403, { error: 'MOVIL' }] } });
  await page.goto('./');
  await teclear(page, '2580');
  await expect(page.getByRole('alert')).toContainText('ya no está dado de alta');
  expect(await page.evaluate(() => localStorage.getItem('gf-moviles-pin'))).toBe('[]');
  await page.getByRole('button', { name: /Tengo un código de alta/ }).click();
  await expect(page.locator('#codigo-alta')).toBeVisible();
});

test('la pantalla del PIN cabe en el móvil más estrecho', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript((m) => localStorage.setItem('gf-movil-pin', JSON.stringify(m)), MOVIL);
  await simular(page, { sesion: operario });
  await page.goto('./');
  await expect(page.getByText('Pon tu PIN')).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
  await page.goto('./#/alta/K7P2-9QXM');
  await page.reload();
  await expect(page.getByText('Elige tu PIN', { exact: true })).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
});

test.describe('iPhone en Safari', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  test('el QR abierto en Safari dice que el alta se hace dentro de la app (si no, luego no la reconoce)', async ({ page }) => {
    await simular(page, { sesion: operario });
    await page.goto('./#/alta/K7P2-9QXM');
    const aviso = page.getByRole('note');
    await expect(aviso).toContainText('En el iPhone, el alta se hace dentro de la app');
    await expect(aviso.locator('.codigo-alta')).toHaveText('K7P2-9QXM');
    await expect(page.getByRole('group', { name: /PIN/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Usar la app aquí en Safari de todas formas' }).click();
    await expect(page.getByText('Elige tu PIN', { exact: true })).toBeVisible();
    expect(await desbordes(page)).toEqual([]);
  });
});

test('«He olvidado mi PIN»: avisa al administrador desde el móvil', async ({ page }) => {
  const errores = vigilar(page);
  const pedidos: Record<string, unknown>[] = [];
  await page.addInitScript((m) => localStorage.setItem('gf-movil-pin', JSON.stringify(m)), MOVIL);
  await simular(page, { sesion: operario, funciones: { pin: (b) => { pedidos.push(b); return pedidos.length === 1 ? [200, { ok: true }] : [400, { error: 'YA_AVISADO' }]; } } });
  await page.goto('./');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'He olvidado mi PIN: avisar al administrador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aviso enviado' })).toBeVisible();
  expect(pedidos[0]).toEqual({ accion: 'olvido', movil: 'm-1', llave: MOVIL.llave });
  await expect(page.getByRole('button', { name: 'He olvidado mi PIN: avisar al administrador' })).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('cambiar de usuario: en el móvil salen solo las personas dadas de alta en él, cada una con su PIN', async ({ page }) => {
  const errores = vigilar(page);
  const pedidos: Record<string, unknown>[] = [];
  await page.addInitScript((l) => { if (!localStorage.getItem('gf-moviles-pin')) localStorage.setItem('gf-moviles-pin', JSON.stringify(l)); },
    [MOVIL, { movil: 'm-2', llave: 'b'.repeat(64), nombre: 'Pepa Prueba' }]);
  await simular(page, { sesion: operario, funciones: { pin: (b) => { pedidos.push(b); return [200, { token_hash: 'vale' }]; } } });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '¿Quién eres?' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Personas de este móvil' }).getByRole('button')).toHaveText([/^Oli Prueba/, /^Pepa Prueba/]);
  await page.getByRole('button', { name: 'Pepa Prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Pepa' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar de usuario' }).click();
  await page.getByRole('button', { name: 'Oli Prueba' }).click();
  await teclear(page, '2580');
  await expect(page.getByText('Pon tu PIN')).toHaveCount(0);
  expect(pedidos.at(-1)).toMatchObject({ accion: 'entrar', movil: 'm-1', llave: MOVIL.llave });
  expect(await page.evaluate(() => localStorage.getItem('gf-movil-pin-actual'))).toBe('m-1');   // la próxima vez, directo a Oli
  expect(errores).toEqual([]);
});

test('día del cambio: la hoja de códigos saca los de los que no tienen acceso y hace el PDF', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  let n = 0;
  const sim = await simular(page, { dentro: true,
    sesion: { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null },
      empresas: [{ ...EMPRESA_A, permisos: [...PERMISOS_ADMIN, 'nucleo.usuario.ver', 'nucleo.usuario.editar'] }] },
    tablas: {
      roles: [{ id: 'r-ope', empresa_id: null, codigo: 'operario', nombre: 'Operario', descripcion: null, baja: null }],
      personas: [{ id: OLI, empresa_id: E, nombre: 'Oli Prueba', baja: null }, { id: PEPA, empresa_id: E, nombre: 'Pepa Prueba', baja: null },
        { id: LUIS, empresa_id: E, nombre: 'Luis Prueba Con Un Nombre Bastante Largo', baja: null }, { id: 'p-ana', empresa_id: E, nombre: 'Ana Prueba', baja: null }],
      usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', email: USUARIO.email, superadmin: false, persona_id: 'p-ana' },
        { id: 'u-pepa', nombre: 'Pepa Prueba', email: null, superadmin: false, persona_id: PEPA }],
      asignaciones: [{ id: 'as-0', usuario_id: USUARIO.id, rol_id: 'r-ope', empresa_id: E, centro_id: null, hasta: null },
        { id: 'as-1', usuario_id: 'u-pepa', rol_id: 'r-ope', empresa_id: E, centro_id: null, hasta: null }],
      moviles: [{ id: 'm-p', usuario_id: 'u-pepa', empresa_id: E, fallos: 0, bloqueado: null, ultimo: null, baja: null, creado: '2026-11-01T10:00:00Z' }],
      codigos_alta: [],
    },
    rpc: { codigo_alta: () => ['K7P2-9QXM', 'B4CD-7XYZ', 'Q2RS-8TUV'][n++] } });
  await page.goto('./#/config/usuarios');
  await page.getByRole('button', { name: 'Hoja de códigos (PDF)' }).click();
  const v = page.getByRole('dialog');
  // ni Pepa (ya tiene móvil) ni Ana (entra con correo)
  await expect(v.locator('label.fila')).toHaveText([/Luis Prueba/, /Oli Prueba/]);
  const descarga = page.waitForEvent('download');
  await v.getByRole('button', { name: 'Sacar 2 códigos y hacer el PDF' }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/^codigos-de-alta-\d{4}-\d{2}-\d{2}\.pdf$/);
  await d.saveAs('/tmp/claude-0/-home-user-gesti-n-fabrica/ea8319cf-9414-597f-b890-3c1857ecd8db/scratchpad/hoja-codigos.pdf');
  await expect(v).toContainText('2 códigos en el PDF');
  expect(sim.filter((l) => l.ruta.endsWith('/rpc/codigo_alta')).map((l) => (l.cuerpo as { p_persona: string }).p_persona)).toEqual([LUIS, OLI]);
  expect(errores).toEqual([]);
});
