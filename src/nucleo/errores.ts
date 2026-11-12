import { nucleo, VERSION } from './supabase';

/**
 * Registro de errores: cualquier fallo de la app se guarda en nucleo.errores (agrupado: el mismo error suma veces).
 * Sin conexión o si falla el envío, no hace nada (nunca rompe la app por anotar un error).
 */
let empresaActual: string | null = null;
export const ponerEmpresaErrores = (id: string | null) => { empresaActual = id; };

const enviados = new Map<string, number>();

function firmaDe(mensaje: string, pila: string) {
  const primera = (pila.split('\n').find((l) => l.includes('/src/') || l.includes('.js')) ?? '').trim();
  let h = 0;
  for (const c of mensaje + primera) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${VERSION.split('-')[0]}:${(h >>> 0).toString(36)}`;
}

export async function anotarError(e: unknown, extra = '') {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const pila = (err.stack ?? '') + (extra ? `\n${extra}` : '');
    const firma = firmaDe(err.message, pila);
    const ahora = Date.now();
    if ((enviados.get(firma) ?? 0) > ahora - 60_000) return; // como mucho una vez por minuto el mismo error
    enviados.set(firma, ahora);
    if (!navigator.onLine) return;
    await nucleo().rpc('anotar_error', {
      p_firma: firma, p_mensaje: err.message.slice(0, 1000), p_pila: pila.slice(0, 4000), p_url: location.href.slice(0, 500),
      p_agente: navigator.userAgent.slice(0, 300), p_version: VERSION, p_empresa: empresaActual,
    });
  } catch { /* nunca romper por esto */ }
}

export function vigilarErrores() {
  addEventListener('error', (ev) => anotarError(ev.error ?? ev.message));
  addEventListener('unhandledrejection', (ev) => anotarError(ev.reason));
}
