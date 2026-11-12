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
  tablas?: Record<string, Record<string, unknown>[]>; // filas iniciales de las tablas del núcleo (se guardan en memoria)
}

/** Permisos de un administrador de unidad: configurar todo el núcleo. */
export const PERMISOS_ADMIN = ['nave', 'ubicacion', 'turno', 'equipo', 'activo', 'almacen', 'articulo', 'proveedor', 'configuracion', 'persona']
  .map((c) => `nucleo.${c}.editar`).concat(['nucleo.persona.ver']);

export interface Llamada { metodo: string; ruta: string; cuerpo: unknown; perfil: string | null }

export async function simular(page: Page, op: Opciones = {}) {
  const llamadas: Llamada[] = [];
  const vacias = ['centros', 'ubicaciones', 'tipos_activo', 'activos', 'almacenes', 'familias', 'articulos', 'proveedores', 'turnos', 'equipos', 'personas', 'asignaciones', 'usuarios', 'roles'];
  const tablas: Record<string, Record<string, unknown>[]> = Object.fromEntries(vacias.map((t) => [t, [...(op.tablas?.[t] ?? [])]]));
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
    if (u.pathname === '/functions/v1/invitar') {
      const b = r.postDataJSON() as { correo: string; nombre: string; rol_id: string; empresa_id: string; centro_id: string | null };
      if (b.correo === USUARIO.email) return json({ error: 'A_TI_MISMO' }, 400);
      let usu = tablas.usuarios.find((x) => x.email === b.correo);
      const nuevo = !usu;
      if (!usu) { usu = { id: `u-${tablas.usuarios.length + 1}`, nombre: b.nombre, email: b.correo, superadmin: false }; tablas.usuarios.push(usu); }
      tablas.asignaciones.push({ id: `as-${tablas.asignaciones.length + 1}`, usuario_id: usu.id, rol_id: b.rol_id, empresa_id: b.empresa_id, centro_id: b.centro_id, hasta: null });
      return json({ usuario_id: usu.id, nuevo, clave: nuevo ? 'Temporal234' : null });
    }
    // tablas del núcleo en memoria (lo justo de PostgREST: filtros eq/is, contar, insertar y cambiar)
    const tabla = u.pathname.replace('/rest/v1/', '');
    if (tablas[tabla] !== undefined) {
      const filtros = [...u.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit', 'columns'].includes(k));
      const cumple = (f: Record<string, unknown>) => filtros.every(([k, v]) =>
        v.startsWith('eq.') ? String(f[k]) === v.slice(3) : v === 'is.null' ? f[k] == null
          : v.startsWith('in.(') ? v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(f[k])) : true);
      const uno = (r.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (r.method() === 'HEAD' || (r.method() === 'GET' && (r.headers()['prefer'] ?? '').includes('count=exact'))) {
        const n = tablas[tabla].filter(cumple).length;
        return route.fulfill({ status: 200, headers: { 'content-range': `0-${Math.max(n - 1, 0)}/${n}`, 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: '[]' });
      }
      if (r.method() === 'GET') return json(tablas[tabla].filter(cumple).sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''))));
      if (r.method() === 'POST') {
        const nueva = { id: `id-${tabla}-${tablas[tabla].length + 1}`, baja: null, ...(r.postDataJSON() as object) } as Record<string, unknown>;
        if (tablas[tabla].some((f) => f.codigo && f.codigo === nueva.codigo && f.empresa_id === nueva.empresa_id))
          return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        tablas[tabla].push(nueva);
        return json(uno ? nueva : [nueva], 201);
      }
      if (r.method() === 'DELETE') {
        const quedan = tablas[tabla].filter((f) => !cumple(f));
        tablas[tabla].splice(0, tablas[tabla].length, ...quedan);
        return route.fulfill({ status: 204 });
      }
      if (r.method() === 'PATCH') {
        const cambio = r.postDataJSON() as object;
        const tocadas = tablas[tabla].filter(cumple);
        tocadas.forEach((f) => Object.assign(f, cambio));
        return json(uno ? tocadas[0] : tocadas);
      }
    }
    return json({ message: 'no simulado: ' + u.pathname }, 404);
  });
  return Object.assign(llamadas, { tablas });
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
