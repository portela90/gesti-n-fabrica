// Función de servidor «avisos»: manda al móvil lo que hay en la bandeja de notificaciones (nucleo.notificaciones).
//  · La llama la base de datos (al apuntar una notificación y, por si falla, cada 5 minutos) con una contraseña
//    que está en la caja fuerte de Supabase (Vault). Sin esa contraseña no hace nada.
//  · La primera vez crea las claves del «push» (VAPID) y las guarda en la caja fuerte; después siempre usa esas.
//    La clave privada no sale nunca de Supabase.
//  · Si un móvil ya no existe (el servidor de avisos responde 404 o 410), lo apaga.
// La clave de servidor (SUPABASE_SERVICE_ROLE_KEY) la pone Supabase sola en el entorno; no está en el código.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVIDOR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// contacto de quien manda los avisos (obligatorio). Apple rechaza (403) los inventados: va la dirección de la app.
const CONTACTO = 'https://portela90.github.io/gesti-n-fabrica/';

interface Movil { endpoint: string; p256dh: string; auth: string }
interface Pendiente { id: number; titulo: string; texto: string | null; ruta: string | null; etiqueta: string | null; urgente: boolean; moviles: Movil[] }

const responde = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responde({ error: 'METODO' }, 405);
  let secreto = '';
  try { secreto = String((await req.json()).secreto ?? ''); } catch { return responde({ error: 'DATOS' }, 400); }
  if (secreto.length < 32) return responde({ error: 'NO_PERMISO' }, 401);
  const bd = createClient(URL, SERVIDOR, { auth: { persistSession: false }, db: { schema: 'nucleo' } });

  // claves: las de la caja fuerte o, la primera vez, unas nuevas
  const conf = await bd.rpc('_push_config', { p_secreto: secreto });
  if (conf.error) return responde({ error: 'NO_PERMISO' }, 401);
  let { publica, privada } = (conf.data ?? {}) as { publica: string | null; privada: string | null };
  if (!publica || !privada) {
    const nuevas = webpush.generateVAPIDKeys();
    const g = await bd.rpc('_push_guardar_claves', { p_secreto: secreto, p_publica: nuevas.publicKey, p_privada: nuevas.privateKey });
    if (g.error) return responde({ error: 'CLAVES' }, 500);
    const otra = await bd.rpc('_push_config', { p_secreto: secreto });   // por si otra llamada las creó a la vez
    ({ publica, privada } = (otra.data ?? {}) as { publica: string; privada: string });
  }
  webpush.setVapidDetails(CONTACTO, publica!, privada!);

  const p = await bd.rpc('_push_pendientes', { p_secreto: secreto });
  if (p.error) return responde({ error: 'PENDIENTES' }, 500);
  const pendientes = (p.data ?? []) as Pendiente[];
  const enviadas: number[] = [];
  const errores: Record<string, string> = {};
  const muertos = new Set<string>();

  for (const n of pendientes) {
    if (!n.moviles.length) { enviadas.push(n.id); continue; }   // sin móvil: se queda en la app, no hay nada que mandar
    const carga = JSON.stringify({ titulo: n.titulo, texto: n.texto ?? '', ruta: n.ruta ?? '/', etiqueta: n.etiqueta ?? `n-${n.id}`, urgente: n.urgente });
    let alguno = false;
    for (const m of n.moviles) {
      try {
        await webpush.sendNotification({ endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } }, carga,
          { TTL: 24 * 3600, urgency: n.urgente ? 'high' : 'normal', topic: (n.etiqueta ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined });
        alguno = true;
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        if (estado === 404 || estado === 410) muertos.add(m.endpoint);
        else errores[String(n.id)] = `${estado ?? ''} ${(e as Error).message}`.trim().slice(0, 300);
      }
    }
    if (alguno || !errores[String(n.id)]) enviadas.push(n.id);
  }

  const r = await bd.rpc('_push_resultado', { p_secreto: secreto, p_enviadas: enviadas, p_errores: errores, p_muertos: [...muertos] });
  if (r.error) return responde({ error: 'RESULTADO' }, 500);
  return responde({ mandadas: enviadas.length, errores: Object.keys(errores).length, apagados: muertos.size });
});
