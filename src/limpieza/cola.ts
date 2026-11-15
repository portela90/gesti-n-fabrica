// Cola «sin red» de Limpieza: lo que hace el operario (empezar, pausar, seguir, terminar, fotos, aviso de problema)
// se guarda en el móvil (IndexedDB) y se manda en orden en cuanto hay conexión. Si llega repetido, la base de datos
// no hace nada (o contesta YA_HECHO, que aquí cuenta como hecho).
import { useEffect, useState } from 'react';
import { supabase } from '../nucleo/supabase';

export type Accion =
  | { tipo: 'rpc'; fn: string; args: Record<string, unknown>; trabajo: string; texto: string }
  | { tipo: 'foto'; ruta: string; blob: Blob; trabajo: string; momento: string; texto: string };
type Guardada = Accion & { n?: number; en: string };

const BD = 'limpieza-cola', ALMACEN = 'acciones';
function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: 'n', autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function conAlmacen<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const tx = db.transaction(ALMACEN, modo); const r = f(tx.objectStore(ALMACEN));
    tx.oncomplete = () => { db.close(); ok(r.result); };
    tx.onerror = () => { db.close(); mal(tx.error); };
  });
}
const todas = () => conAlmacen<Guardada[]>('readonly', (s) => s.getAll() as IDBRequest<Guardada[]>);
const quitar = (n: number) => conAlmacen('readwrite', (s) => s.delete(n));

// ---------- avisos para la pantalla ----------
type Estado = { pendientes: Guardada[]; errores: string[]; enviando: boolean };
let estado: Estado = { pendientes: [], errores: [], enviando: false };
const oyentes = new Set<(e: Estado) => void>();
const avisar = (c: Partial<Estado>) => { estado = { ...estado, ...c }; oyentes.forEach((f) => f(estado)); };
let alTerminar: (() => void) | null = null;
/** Lo que hay que hacer cuando la cola se vacía (p. ej. volver a cargar el día). */
export const alVaciarse = (f: (() => void) | null) => { alTerminar = f; };

export function useCola() {
  const [e, setE] = useState(estado);
  useEffect(() => { oyentes.add(setE); todas().then((p) => avisar({ pendientes: p })).catch(() => {}); return () => { oyentes.delete(setE); }; }, []);
  return e;
}

const esDeRed = (m: string) => /Failed to fetch|NetworkError|Load failed|network|fetch failed|timeout/i.test(m);

/** Guarda una acción y la intenta mandar ya. */
export async function encolar(a: Accion) {
  await conAlmacen('readwrite', (s) => s.add({ ...a, en: new Date().toISOString() }));
  avisar({ pendientes: await todas() });
  void enviar();
}

let enMarcha: Promise<void> | null = null;
/** Manda lo que haya, en orden. Para en el primer fallo de red (se reintenta luego). */
export function enviar(): Promise<void> {
  if (enMarcha) return enMarcha;
  enMarcha = (async () => {
    avisar({ enviando: true });
    let mandada = false;
    try {
      for (const a of await todas()) {
        let error: string | null = null;
        try {
          if (a.tipo === 'rpc') {
            const r = await supabase.schema('limpieza').rpc(a.fn, a.args);
            if (r.error) error = r.error.message || 'error';
          } else {
            const up = await supabase.storage.from('limpieza').upload(a.ruta, a.blob, { contentType: a.blob.type || 'image/jpeg', upsert: false });
            if (up.error && !/exists|Duplicate|409/i.test(up.error.message)) error = up.error.message;
            else {
              const r = await supabase.schema('limpieza').rpc('poner_foto', { p_trabajo: a.trabajo, p_ruta: a.ruta, p_momento: a.momento });
              if (r.error) error = r.error.message;
            }
          }
        } catch (e) { error = (e as Error).message || 'Failed to fetch'; }
        if (error && esDeRed(error)) break;                        // sin red: se queda para luego
        if (error && !/YA_HECHO/.test(error)) avisar({ errores: [...estado.errores, `${a.texto}: ${error}`] });
        await quitar(a.n!); mandada = true;
        avisar({ pendientes: await todas() });
      }
    } finally {
      avisar({ enviando: false });
      enMarcha = null;
      if (mandada && !estado.pendientes.length) alTerminar?.();
    }
  })();
  return enMarcha;
}
export const borrarErrores = () => avisar({ errores: [] });

// reintentar al volver la red y cada medio minuto
if (typeof window !== 'undefined') {
  addEventListener('online', () => { void enviar(); });
  setInterval(() => { if (navigator.onLine) void enviar(); }, 30000);
}
