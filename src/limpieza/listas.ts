// Listas de la unidad que usan varias pantallas de Limpieza (equipos, turnos, personas, zonas y máquinas).
import { useEffect, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';

export interface Opcion { id: string; nombre: string; baja?: string | null; equipo_id?: string | null }
export interface Maquina { id: string; codigo: string; nombre: string | null; baja: string | null }
export interface Listas { equipos: Opcion[]; turnos: Opcion[]; personas: Opcion[]; zonas: Opcion[]; maquinas: Maquina[] }

/** Equipos, turnos, personas, zonas y máquinas de la unidad (para elegir en los formularios). */
export function useListas() {
  const { empresa, puede } = useSesion();
  const [l, setL] = useState<Listas>({ equipos: [], turnos: [], personas: [], zonas: [], maquinas: [] });
  useEffect(() => {
    const e = empresa!.id;
    Promise.all([
      nucleo().from('equipos').select('id, nombre, baja').eq('empresa_id', e).order('nombre'),
      nucleo().from('turnos').select('id, nombre, baja').eq('empresa_id', e).order('orden').order('nombre'),
      puede('nucleo.persona.ver') ? nucleo().from('personas').select('id, nombre, baja, equipo_id').eq('empresa_id', e).order('nombre') : Promise.resolve({ data: [] }),
      nucleo().from('ubicaciones').select('id, nombre, baja').eq('empresa_id', e).order('nombre'),
      nucleo().from('activos').select('id, codigo, nombre, baja').eq('empresa_id', e).order('codigo'),
    ]).then(([q, t, p, z, a]) => setL({
      equipos: (q.data ?? []) as Opcion[], turnos: (t.data ?? []) as Opcion[], personas: (p.data ?? []) as Opcion[],
      zonas: (z.data ?? []) as Opcion[],
      maquinas: ((a.data ?? []) as Maquina[]).sort((x, y) => x.codigo.localeCompare(y.codigo, 'es', { numeric: true })),
    }));
  }, [empresa, puede]);
  return l;
}

