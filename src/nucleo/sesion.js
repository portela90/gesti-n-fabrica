import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from './supabase';
const Ctx = createContext(null);
const CLAVE_EMPRESA = 'fabrica.empresa';
const leer = (k) => { try {
    return localStorage.getItem(k);
}
catch {
    return null;
} };
const guardar = (k, v) => { try {
    localStorage.setItem(k, v);
}
catch { /* sin almacenamiento */ } };
/** ¿cumple «permiso» alguno de la lista? (la lista ya viene resuelta por la base de datos, sin comodines) */
export const tienePermiso = (lista, permiso) => lista.includes(permiso);
export function ProveedorSesion({ children }) {
    const [estado, setEstado] = useState({ fase: 'cargando' });
    const [empresaId, setEmpresaId] = useState(leer(CLAVE_EMPRESA));
    const cargar = useCallback(async (s) => {
        if (!s) {
            setEstado({ fase: 'fuera' });
            return;
        }
        // dado de alta con contraseña temporal: lo primero es poner la suya
        if (s.user.user_metadata?.cambiar_clave) {
            setEstado({ fase: 'nueva-clave' });
            return;
        }
        const { data, error } = await nucleo().rpc('mi_sesion');
        if (error) {
            setEstado({ fase: 'error', mensaje: error.message });
            return;
        }
        const sesion = data;
        if (!sesion.usuario) {
            setEstado({ fase: 'sin-alta', correo: s.user.email ?? '' });
            return;
        }
        setEstado({ fase: 'dentro', sesion });
    }, []);
    useEffect(() => {
        let vivo = true;
        supabase.auth.getSession().then(({ data }) => { if (vivo)
            cargar(data.session); });
        const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
            if (evento === 'PASSWORD_RECOVERY') {
                setEstado({ fase: 'nueva-clave' });
                return;
            }
            if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED')
                cargar(s);
        });
        return () => { vivo = false; sub.subscription.unsubscribe(); };
    }, [cargar]);
    const empresas = estado.fase === 'dentro' ? estado.sesion.empresas : [];
    const empresa = useMemo(() => {
        if (!empresas.length)
            return null;
        const pref = empresaId ?? (estado.fase === 'dentro' ? estado.sesion.usuario?.empresa_actual : null);
        return empresas.find((e) => e.id === pref) ?? (empresas.length === 1 ? empresas[0] : null);
    }, [empresas, empresaId, estado]);
    const valor = {
        estado,
        empresa,
        elegirEmpresa: (id) => { guardar(CLAVE_EMPRESA, id); setEmpresaId(id); },
        puede: (p) => !!empresa && tienePermiso(empresa.permisos, p),
        recargar: async () => { const { data } = await supabase.auth.getSession(); await cargar(data.session); },
        salir: async () => { await supabase.auth.signOut(); setEstado({ fase: 'fuera' }); },
    };
    return _jsx(Ctx.Provider, { value: valor, children: children });
}
export function useSesion() {
    const c = useContext(Ctx);
    if (!c)
        throw new Error('useSesion fuera de ProveedorSesion');
    return c;
}
