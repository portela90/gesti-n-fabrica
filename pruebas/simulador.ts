// Supabase simulado para las pruebas de pantallas: contesta a /auth/v1 y /rest/v1 sin salir a internet.
// Empresas y personas inventadas.
import type { Page, Request } from '@playwright/test';

export const USUARIO = { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin@ejemplo.com' };

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwtFalso = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO.id, email: USUARIO.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.firma`;

export const sesionAuth = () => ({
  access_token: jwtFalso(), refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: USUARIO.id, aud: 'authenticated', role: 'authenticated', email: USUARIO.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
});

export const EMPRESA_A = { id: 'aaaaaaaa-0000-0000-0000-000000000001', codigo: 'empresa-a', nombre: 'Unidad A', modulos: ['almacen', 'mantenimiento'], permisos: ['almacen.stock.ver'] };
export const EMPRESA_B = { id: 'bbbbbbbb-0000-0000-0000-000000000001', codigo: 'empresa-b', nombre: 'Unidad B', modulos: ['limpieza', 'personal', 'prevencion'], permisos: [] };

export interface Opciones {
  dentro?: boolean;            // ya ha entrado (sesión guardada en el navegador)
  sesion?: object;             // lo que devuelve nucleo.mi_sesion()
}

export interface Llamada { metodo: string; ruta: string; cuerpo: unknown; perfil: string | null }

export async function simular(page: Page, op: Opciones = {}) {
  const llamadas: Llamada[] = [];
  const sesion = op.sesion ?? { usuario: { id: USUARIO.id, nombre: 'Ana Prueba', superadmin: false, empresa_actual: null }, empresas: [EMPRESA_A] };
  if (op.dentro) {
    await page.addInitScript((s) => { localStorage.setItem('sb-whemhkcrgwyjucpaswrm-auth-token', JSON.stringify(s)); }, sesionAuth());
  }
  const anota = (r: Request) => {
    let cuerpo: unknown = null;
    try { cuerpo = r.postDataJSON(); } catch { cuerpo = r.postData(); }
    const u = new URL(r.url());
    llamadas.push({ metodo: r.method(), ruta: u.pathname + u.search, cuerpo, perfil: r.headers()['content-profile'] ?? r.headers()['accept-profile'] ?? null });
  };
  await page.route('https://whemhkcrgwyjucpaswrm.supabase.co/**', async (route) => {
    const r = route.request(); anota(r);
    const u = new URL(r.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/auth/v1/token') return json(sesionAuth());
    if (u.pathname === '/auth/v1/otp' || u.pathname === '/auth/v1/recover') return json({});
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (u.pathname === '/auth/v1/user') return json(sesionAuth().user);
    if (u.pathname === '/rest/v1/rpc/mi_sesion') return json(sesion);
    if (u.pathname === '/rest/v1/rpc/anotar_error') return route.fulfill({ status: 204 });
    if (u.pathname === '/rest/v1/incidencias' && r.method() === 'POST') return route.fulfill({ status: 201 });
    return json({ message: 'no simulado: ' + u.pathname }, 404);
  });
  return llamadas;
}

/** Textos aplastados (letra a letra) o cosas que se salen por la derecha. */
export async function desbordes(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, out: string[] = [];
    if (document.documentElement.scrollWidth > W + 1) out.push('la página es más ancha que la pantalla');
    document.querySelectorAll('body *').forEach((e) => {
      const el = e as HTMLElement;
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1) out.push(`se sale: ${el.tagName}.${el.className} «${(el.textContent ?? '').trim().slice(0, 30)}»`);
      const propio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, '');
      const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
      if (propio.length >= 4 && r.width > 0 && r.width < fs * 2.6 && r.height > fs * 4.5) out.push(`texto aplastado «${propio.slice(0, 30)}»`);
    });
    return out.slice(0, 5);
  });
}

/** Errores de la página (excepciones y errores de consola). */
export function vigilar(page: Page) {
  const err: string[] = [];
  page.on('pageerror', (e) => err.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) err.push(m.text()); });
  return err;
}
