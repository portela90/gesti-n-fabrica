// Función de servidor «pin»: los operarios entran con su móvil y un PIN de 4 cifras (decidido por Cristian el 21/11).
//  · «alta»: el operario escribe (o escanea) su código de alta y elige su PIN. Si no tenía cuenta, se le crea una sin
//    correo de verdad (pin-<su ficha>@pin.invalid: nunca se le manda nada). Se gasta el código y su móvil queda apuntado.
//  · «entrar»: con la llave secreta que guarda su móvil y su PIN.
//  · En los dos casos devuelve un vale de un solo uso (token_hash) con el que la app abre la sesión (verifyOtp).
//    No se envía ningún correo.
// Las comprobaciones (código válido, huellas, 5 fallos = bloqueado) están en la base de datos: nucleo.pin_codigo,
// nucleo.pin_alta y nucleo.pin_entrar (migración 0035), que solo puede llamar esta función.
// Se instala sin comprobar sesión (verify_jwt = false): quien la llama todavía no ha entrado.
// La clave de servidor (SUPABASE_SERVICE_ROLE_KEY) la pone Supabase sola en el entorno; no está en el código.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVIDOR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responde = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fallo = (codigo: string, estado = 400, extra: Record<string, unknown> = {}) => responde({ error: codigo, ...extra }, estado);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LLAVE = /^[0-9a-f]{64}$/i;
const PIN = /^[0-9]{4}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fallo('METODO', 405);
  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return fallo('DATOS'); }
  const llave = String(p.llave ?? '');
  const pin = String(p.pin ?? '');
  if (!LLAVE.test(llave) || !PIN.test(pin)) return fallo('DATOS');

  const servidor = createClient(URL, SERVIDOR, { auth: { persistSession: false }, db: { schema: 'nucleo' } });

  /** Vale de un solo uso para abrir la sesión de ese correo (no envía nada). */
  async function vale(correo: string) {
    const { data, error } = await servidor.auth.admin.generateLink({ type: 'magiclink', email: correo });
    return error ? null : data.properties?.hashed_token ?? null;
  }

  if (p.accion === 'alta') {
    const codigo = String(p.codigo ?? '').slice(0, 20);
    const { data: c, error: eC } = await servidor.rpc('pin_codigo', { p_codigo: codigo });
    if (eC) return fallo('SERVIDOR', 500);
    if (c?.error) return fallo(c.error, 400);
    const correo = `pin-${c.persona_id}@pin.invalid`;
    let usuario: string | null = c.usuario_id ?? null;
    if (!usuario) {
      const { data: nuevo, error } = await servidor.auth.admin.createUser({ email: correo, email_confirm: true, user_metadata: { nombre: c.nombre, pin: true } });
      if (nuevo?.user) usuario = nuevo.user.id;
      else {
        // ya se creó en un intento anterior que no terminó: se busca
        for (let pagina = 1; pagina < 50 && !usuario; pagina++) {
          const { data, error: eL } = await servidor.auth.admin.listUsers({ page: pagina, perPage: 1000 });
          if (eL) break;
          usuario = data.users.find((u) => (u.email ?? '').toLowerCase() === correo)?.id ?? null;
          if (data.users.length < 1000) break;
        }
        if (!usuario) return fallo(error ? 'CREAR_CUENTA' : 'SERVIDOR', 500);
      }
    }
    const { data: a, error: eA } = await servidor.rpc('pin_alta', { p_codigo: codigo, p_usuario: usuario, p_llave: llave, p_pin: pin });
    if (eA) return fallo('SERVIDOR', 500);
    if (a?.error) return fallo(a.error, 400);
    const { data: u } = await servidor.auth.admin.getUserById(usuario);
    const t = u?.user?.email ? await vale(u.user.email) : null;
    if (!t) return fallo('SESION', 500);
    return responde({ movil: a.movil, nombre: a.nombre, token_hash: t });
  }

  if (p.accion === 'entrar') {
    const movil = String(p.movil ?? '');
    if (!UUID.test(movil)) return fallo('DATOS');
    const { data: r, error } = await servidor.rpc('pin_entrar', { p_movil: movil, p_llave: llave, p_pin: pin });
    if (error) return fallo('SERVIDOR', 500);
    if (r?.error) return fallo(r.error, r.error === 'PIN' ? 401 : 403, r.quedan != null ? { quedan: r.quedan } : {});
    const { data: u } = await servidor.auth.admin.getUserById(r.usuario);
    const t = u?.user?.email ? await vale(u.user.email) : null;
    if (!t) return fallo('SESION', 500);
    return responde({ token_hash: t });
  }

  return fallo('DATOS');
});
