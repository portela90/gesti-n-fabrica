import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { nucleo, supabase } from './supabase';
import type { EmpresaSesion, Sesion } from './tipos';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'fuera' }                       // sin entrar
  | { fase: 'nueva-clave' }                 // vino del enlace de «he olvidado la contraseña»
  | { fase: 'sin-alta'; correo: string }    // entró, pero no tiene usuario en la app
  | { fase: 'error'; mensaje: string }
  | { fase: 'dentro'; sesion: Sesion };

interface Contexto {
  estado: Estado;
  empresa: EmpresaSesion | null;
  elegirEmpresa: (id: string) => void;
  puede: (permiso: string) => boolean;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Contexto | null>(null);
const CLAVE_EMPRESA = 'fabrica.empresa';

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** ¿cumple «permiso» alguno de la lista? (la lista ya viene resuelta por la base de datos, sin comodines) */
export const tienePermiso = (lista: string[], permiso: string) => lista.includes(permiso);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [empresaId, setEmpresaId] = useState<string | null>(leer(CLAVE_EMPRESA));

  const cargar = useCallback(async (s: Session | null) => {
    if (!s) { setEstado({ fase: 'fuera' }); return; }
    // dado de alta con contraseña temporal: lo primero es poner la suya
    if (s.user.user_metadata?.cambiar_clave) { setEstado({ fase: 'nueva-clave' }); return; }
    const { data, error } = await nucleo().rpc('mi_sesion');
    if (error) { setEstado({ fase: 'error', mensaje: error.message }); return; }
    const sesion = data as Sesion;
    if (!sesion.usuario) { setEstado({ fase: 'sin-alta', correo: s.user.email ?? '' }); return; }
    setEstado({ fase: 'dentro', sesion });
  }, []);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => { if (vivo) cargar(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') { setEstado({ fase: 'nueva-clave' }); return; }
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') cargar(s);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [cargar]);

  const empresas = estado.fase === 'dentro' ? estado.sesion.empresas : [];
  const empresa = useMemo(() => {
    if (!empresas.length) return null;
    const pref = empresaId ?? (estado.fase === 'dentro' ? estado.sesion.usuario?.empresa_actual : null);
    return empresas.find((e) => e.id === pref) ?? (empresas.length === 1 ? empresas[0] : null);
  }, [empresas, empresaId, estado]);

  const valor: Contexto = {
    estado,
    empresa,
    elegirEmpresa: (id) => { guardar(CLAVE_EMPRESA, id); setEmpresaId(id); },
    puede: (p) => !!empresa && tienePermiso(empresa.permisos, p),
    recargar: async () => { const { data } = await supabase.auth.getSession(); await cargar(data.session); },
    salir: async () => { await supabase.auth.signOut(); setEstado({ fase: 'fuera' }); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion fuera de ProveedorSesion');
  return c;
}
