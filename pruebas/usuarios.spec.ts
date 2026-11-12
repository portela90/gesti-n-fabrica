// Usuarios: dar acceso con contraseña temporal, otro rol a quien ya tiene cuenta, quitar un rol, y la primera entrada.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, sesionAuth, EMPRESA_A, USUARIO, PERMISOS_ADMIN } from './simulador';

const E = EMPRESA_A.id;
const admin = { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ ...EMPRESA_A, permisos: [...PERMISOS_ADMIN, 'nucleo.usuario.ver', 'nucleo.usuario.editar'] }] };
const tablas = () => ({
  roles: [{ id: 'r-enc', empresa_id: null, codigo: 'encargado', nombre: 'Encargado', descripcion: 'Ve sus módulos, apunta y corrige', baja: null },
          { id: 'r-lec', empresa_id: null, codigo: 'solo_lectura', nombre: 'Solo lectura', descripcion: 'Ve, sin cambiar nada', baja: null }],
  centros: [{ id: 'c1', empresa_id: E, codigo: 'nave-1', nombre: 'Nave 1', baja: null }],
  usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', email: USUARIO.email, superadmin: false },
             { id: 'u-bea', nombre: 'Persona Ejemplo', email: 'persona@ejemplo.com', superadmin: false }],
  asignaciones: [{ id: 'as-0', usuario_id: USUARIO.id, rol_id: 'r-adm', empresa_id: E, centro_id: null, hasta: null },
                 { id: 'as-1', usuario_id: 'u-bea', rol_id: 'r-lec', empresa_id: E, centro_id: null, hasta: null }],
});

test('dar acceso a alguien nuevo: enseña la contraseña temporal una vez', async ({ page }) => {
  const err = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: admin, tablas: tablas() });
  await page.goto('./#/config');
  await page.locator('.fila', { hasText: 'Usuarios' }).click();
  await expect(page.locator('.fila', { hasText: 'Persona Ejemplo' })).toContainText('Solo lectura · todas las naves');
  await expect(page.locator('.fila', { hasText: 'Ana Prueba (tú)' }).getByRole('button', { name: 'Quitar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dar acceso a alguien' }).click();
  await page.getByRole('button', { name: 'Dar acceso', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Escribe su correo.');
  await page.fill('#u-correo', 'nuevo@ejemplo.com');
  await page.fill('#u-nombre', 'Operario Nuevo');
  await page.selectOption('#u-rol', 'r-enc');
  await expect(page.getByText('Ve sus módulos, apunta y corrige')).toBeVisible();
  await page.selectOption('#u-nave', 'c1');
  await page.getByRole('button', { name: 'Dar acceso', exact: true }).click();
  await expect(page.locator('#claveTemporal')).toHaveText('Temporal234');
  const llamada = sim.find((l) => l.ruta === '/functions/v1/invitar');
  expect(llamada?.cuerpo).toMatchObject({ correo: 'nuevo@ejemplo.com', nombre: 'Operario Nuevo', empresa_id: E, rol_id: 'r-enc', centro_id: 'c1' });
  await page.getByRole('button', { name: 'Hecho' }).click();
  await expect(page.locator('.fila', { hasText: 'Operario Nuevo' })).toContainText('Encargado · Nave 1');
  expect(err).toEqual([]);
});

test('a quien ya tiene cuenta solo se le da el rol (sin contraseña nueva) y se le puede quitar', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: admin, tablas: tablas() });
  await page.goto('./#/config/usuarios');
  await page.locator('.fila', { hasText: 'Persona Ejemplo' }).getByRole('button', { name: 'Otro rol' }).click();
  await expect(page.locator('#u-correo')).toHaveValue('persona@ejemplo.com');
  await page.selectOption('#u-rol', 'r-enc');
  await page.getByRole('button', { name: 'Dar acceso', exact: true }).click();
  await expect(page.getByText('ya tenía cuenta')).toBeVisible();
  await expect(page.locator('#claveTemporal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hecho' }).click();
  page.on('dialog', (d) => d.accept());
  const fila = page.locator('.fila', { hasText: 'Persona Ejemplo' });
  await expect(fila.locator('.rol-linea')).toHaveCount(2);
  await fila.locator('.rol-linea', { hasText: 'Solo lectura' }).getByRole('button', { name: 'Quitar' }).click();
  await expect(fila.locator('.rol-linea')).toHaveCount(1);
  expect(sim.tablas.asignaciones.some((a) => a.id === 'as-1')).toBe(false);
});

test('no te puedes dar roles a ti mismo: el error se explica', async ({ page }) => {
  await simular(page, { dentro: true, sesion: admin, tablas: tablas() });
  await page.goto('./#/config/usuarios');
  await page.getByRole('button', { name: 'Dar acceso a alguien' }).click();
  await page.fill('#u-correo', USUARIO.email);
  await page.fill('#u-nombre', 'Yo');
  await page.selectOption('#u-rol', 'r-enc');
  await page.getByRole('button', { name: 'Dar acceso', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('No puedes darte roles a ti mismo.');
});

test('la primera vez que entra con contraseña temporal le pide poner la suya', async ({ page }) => {
  await simular(page, { dentro: false });
  const s = sesionAuth();
  let cambio: unknown = null; (s.user as Record<string, unknown>).user_metadata = { cambiar_clave: true };
  await page.addInitScript((x) => { localStorage.setItem('sb-whemhkcrgwyjucpaswrm-auth-token', JSON.stringify(x)); }, s);
  await page.route('https://whemhkcrgwyjucpaswrm.supabase.co/auth/v1/user', (route) => {
    if (route.request().method() === 'PUT') cambio = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...s.user, user_metadata: { cambiar_clave: false } }) });
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Pon tu contraseña' })).toBeVisible();
  await page.fill('#claveNueva', 'corta');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pon al menos 8 caracteres');
  await page.fill('#claveNueva', 'una-clave-larga');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  expect(cambio).toMatchObject({ password: 'una-clave-larga', data: { cambiar_clave: false } });
});

test('Usuarios en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: admin, tablas: tablas() });
  await page.goto('./#/config/usuarios');
  await expect(page.locator('.rol-linea')).toHaveCount(2);
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Dar acceso a alguien' }).click();
  expect(await desbordes(page), 'ventana').toEqual([]);
});
