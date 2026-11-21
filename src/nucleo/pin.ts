// Entrar con código de alta + PIN (los operarios). Este móvil guarda su llave secreta (64 cifras al azar) y el número de
// su alta; el PIN no se guarda nunca. La función de servidor «pin» comprueba todo y devuelve un vale de un solo uso con
// el que se abre la sesión (sin correo). Ver supabase/functions/pin y la migración 0035.
import { supabase } from './supabase';

const CLAVE = 'gf-movil-pin';
export interface MovilPin { movil: string; llave: string; nombre: string }

export function movilGuardado(): MovilPin | null {
  try {
    const m = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as MovilPin | null;
    return m?.movil && m.llave ? m : null;
  } catch { return null; }
}
export function olvidarMovil() { try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } }

const llaveNueva = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

export const ERRORES_PIN: Record<string, string> = {
  CODIGO: 'Ese código no vale: puede que esté mal escrito, que ya se haya usado o que haya caducado (duran 7 días). Pide otro.',
  PIN: 'PIN incorrecto.',
  PIN_MAL: 'El PIN tiene que ser de 4 cifras.',
  BLOQUEADO: 'Este móvil se ha bloqueado por fallar el PIN 5 veces. Pide un código nuevo a tu administrador.',
  MOVIL: 'Este móvil ya no está dado de alta (se ha sacado un código nuevo). Pide un código a tu administrador.',
  BAJA: 'Tu acceso está dado de baja. Habla con tu administrador.',
  OTRO_USUARIO: 'Ese código no se puede usar. Pide otro a tu administrador.',
  DATOS: 'Faltan datos. Vuelve a intentarlo.',
};

async function llamar(cuerpo: Record<string, unknown>): Promise<{ datos?: Record<string, unknown>; error?: string; quedan?: number }> {
  const { data, error } = await supabase.functions.invoke('pin', { body: cuerpo });
  if (!error) return { datos: data as Record<string, unknown> };
  let r: { error?: string; quedan?: number } | undefined;
  try { r = await (error as { context?: Response }).context?.json(); } catch { /* sin cuerpo */ }
  return { error: r?.error ?? 'RED', quedan: r?.quedan };
}

async function abrirSesion(token: string) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' });
  return error ? 'SESION' : null;
}

/** Texto para enseñar de un error (con los intentos que quedan). */
export function textoErrorPin(e: string, quedan?: number) {
  if (e === 'PIN' && quedan != null) return `PIN incorrecto. ${quedan === 1 ? 'Te queda 1 intento' : `Te quedan ${quedan} intentos`} antes de que se bloquee este móvil.`;
  return ERRORES_PIN[e] ?? (e === 'RED' ? 'No hay conexión con el servidor. Vuelve a intentarlo.' : `No se ha podido entrar (${e}).`);
}

/** Dar de alta este móvil con un código y un PIN nuevo; si va bien, ya queda dentro. */
export async function darDeAlta(codigo: string, pin: string): Promise<{ error?: string }> {
  const llave = llaveNueva();
  const r = await llamar({ accion: 'alta', codigo, pin, llave });
  if (r.error) return { error: textoErrorPin(r.error) };
  const d = r.datos as { movil: string; nombre: string; token_hash: string };
  try { localStorage.setItem(CLAVE, JSON.stringify({ movil: d.movil, llave, nombre: d.nombre })); } catch { /* sin almacenamiento */ }
  const e = await abrirSesion(d.token_hash);
  return e ? { error: 'Alta hecha, pero no se ha podido entrar. Pon tu PIN para entrar.' } : {};
}

/** Entrar con el PIN desde este móvil. */
export async function entrarConPin(pin: string): Promise<{ error?: string; olvidar?: boolean }> {
  const m = movilGuardado();
  if (!m) return { error: ERRORES_PIN.MOVIL, olvidar: true };
  const r = await llamar({ accion: 'entrar', movil: m.movil, llave: m.llave, pin });
  if (r.error) return { error: textoErrorPin(r.error, r.quedan), olvidar: r.error === 'MOVIL' };
  const e = await abrirSesion(String((r.datos as { token_hash: string }).token_hash));
  return e ? { error: 'No se ha podido entrar. Vuelve a intentarlo.' } : {};
}
