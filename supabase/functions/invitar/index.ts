// Función de servidor «invitar»: da acceso a una persona en una unidad de trabajo con un rol (y, si se quiere, solo en una nave).
//  · Comprueba que quien invita tiene «nucleo.usuario.editar» en esa unidad (y nave) — con SU sesión, no con la del servidor.
//  · Si el correo no tiene cuenta, la crea con una contraseña temporal que se devuelve UNA vez para dársela en mano
//    (el servidor de correo gratuito de Supabase no envía a cualquiera). Al entrar, la app le obliga a poner la suya.
//  · Si ya tiene cuenta (por ejemplo, de las apps de ahora), solo le da el acceso: entra con su contraseña de siempre.
//  · El alta en nucleo.usuarios y el rol se guardan con la sesión de quien invita: así quedan en el historial con su nombre
//    y las reglas de seguridad de la base de datos se vuelven a comprobar.
// La clave de servidor (SUPABASE_SERVICE_ROLE_KEY) la pone Supabase sola en el entorno; no está en el código.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVIDOR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responde = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fallo = (codigo: string, estado = 400) => responde({ error: codigo }, estado);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contraseña temporal fácil de dictar: sin letras que se confunden (l, 1, O, 0). */
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fallo('METODO', 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return fallo('SESION', 401);

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return fallo('DATOS'); }
  const correo = String(p.correo ?? '').trim().toLowerCase();
  const nombre = String(p.nombre ?? '').trim();
  const empresa = String(p.empresa_id ?? '');
  const rol = String(p.rol_id ?? '');
  const centro = p.centro_id ? String(p.centro_id) : null;
  const persona = p.persona_id ? String(p.persona_id) : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return fallo('CORREO');
  if (!nombre) return fallo('NOMBRE');
  if (![empresa, rol].every((x) => UUID.test(x)) || [centro, persona].some((x) => x && !UUID.test(x))) return fallo('DATOS');

  // quien invita, con su propia sesión (las reglas de la base de datos valen para él)
  const comoEl = createClient(URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false }, db: { schema: 'nucleo' } });
  const { data: yo, error: eYo } = await comoEl.auth.getUser();
  if (eYo || !yo.user) return fallo('SESION', 401);
  const { data: puede } = await comoEl.rpc('tiene_permiso', { p_permiso: 'nucleo.usuario.editar', p_empresa: empresa, p_centro: centro });
  if (puede !== true) return fallo('NO_PERMISO', 403);

  const servidor = createClient(URL, SERVIDOR, { auth: { persistSession: false }, db: { schema: 'nucleo' } });
  // el rol tiene que ser de partida o de esta unidad
  const { data: r } = await servidor.from('roles').select('id, empresa_id, baja').eq('id', rol).maybeSingle();
  if (!r || r.baja || (r.empresa_id && r.empresa_id !== empresa)) return fallo('ROL');
  if (persona) {
    const { data: pe } = await servidor.from('personas').select('empresa_id').eq('id', persona).maybeSingle();
    if (!pe || pe.empresa_id !== empresa) return fallo('PERSONA');
  }

  // ¿ya tiene cuenta?
  let usuarioId: string | null = null;
  for (let pagina = 1; pagina < 50 && !usuarioId; pagina++) {
    const { data, error } = await servidor.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) return fallo('SERVIDOR', 500);
    usuarioId = data.users.find((u) => (u.email ?? '').toLowerCase() === correo)?.id ?? null;
    if (data.users.length < 1000) break;
  }
  let clave: string | null = null;
  if (!usuarioId) {
    clave = claveTemporal();
    const { data, error } = await servidor.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, user_metadata: { nombre, cambiar_clave: true } });
    if (error || !data.user) return fallo('CREAR_CUENTA', 500);
    usuarioId = data.user.id;
  }
  if (usuarioId === yo.user.id) return fallo('A_TI_MISMO');

  // alta en la app (si no la tenía) y su rol, con la sesión de quien invita
  const { data: ya } = await servidor.from('usuarios').select('id, persona_id').eq('id', usuarioId).maybeSingle();
  if (!ya) {
    const { error } = await comoEl.from('usuarios').insert({ id: usuarioId, nombre, email: correo, persona_id: persona });
    if (error) return fallo('ALTA_USUARIO', 403);
  } else if (persona && !ya.persona_id) {
    await comoEl.from('usuarios').update({ persona_id: persona }).eq('id', usuarioId);
  }
  const { error: eAsig } = await comoEl.from('asignaciones')
    .upsert({ usuario_id: usuarioId, rol_id: rol, empresa_id: empresa, centro_id: centro }, { onConflict: 'usuario_id,rol_id,empresa_id,centro_id', ignoreDuplicates: true });
  if (eAsig) return fallo('ROL_NO_GUARDADO', 403);

  return responde({ usuario_id: usuarioId, nuevo: !!clave, clave });
});
