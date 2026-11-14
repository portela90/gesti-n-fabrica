// Lo que comparten las pantallas de Prevención.
import { useEffect, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';

/** Tablas y funciones de Prevención (esquema «prevencion»). */
export const prev = () => supabase.schema('prevencion');

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const fechaCorta = (f: string | null) => { if (!f) return ''; const [a, m, d] = f.slice(0, 10).split('-').map(Number); return `${d}/${m}/${a}`; };
export const hoy = () => new Date().toLocaleDateString('sv-SE');

export interface Persona { id: string; nombre: string; categoria: string | null; baja: string | null }

export const ERRORES: Record<string, string> = {
  NO_PERMISO: 'No tienes permiso para hacer esto.', CERRADA: 'Este mes ya está cerrado.', YA_FIRMADO: 'Ya está firmado.', YA_FIRMADA: 'Ya la ha firmado alguien: para cambiarla, anula antes sus firmas.',
  FIRMA_MAL: 'Falta la firma.', NO_ENVIADA: 'Esta charla aún no se ha enviado.', SIN_PREVISTOS: 'Elige antes quién tiene que firmarla.',
  TIENE_SESION: 'Esta charla ya tiene sesión; no se puede borrar.', duplicate: 'Ya hay una charla para ese mes.', ANULADO: 'Este documento está anulado.', SOLO_FIRMANDO: 'La firma solo la pone quien firma.', SIN_FICHA: 'Tu usuario no está enlazado con tu ficha de trabajador.', dni_check: 'El DNI no está bien escrito (solo letras y números, sin espacios).',
};
export const textoError = (m: string) => { const k = Object.keys(ERRORES).find((x) => m.includes(x)); return k ? ERRORES[k] : m; };

/** Datos por defecto de Prevención (nucleo.ajustes, módulo prevención). */
export function useAjustes() {
  const { empresa } = useSesion();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    nucleo().from('ajustes').select('clave, valor, centro_id').eq('empresa_id', empresa!.id).eq('modulo', 'prevencion').is('centro_id', null)
      .then(({ data }) => setV(Object.fromEntries(((data ?? []) as { clave: string; valor: unknown }[]).map((x) => [x.clave, String(x.valor ?? '')]))));
  }, [empresa]);
  return v;
}

/** Personas de la unidad (para la lista de quién tiene que firmar). */
export function usePersonas() {
  const { empresa, puede } = useSesion();
  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => {
    if (!puede('nucleo.persona.ver')) return;
    nucleo().from('personas').select('id, nombre, categoria, baja').eq('empresa_id', empresa!.id).order('nombre')
      .then(({ data }) => setPersonas((data ?? []) as Persona[]));
  }, [empresa, puede]);
  return personas;
}
