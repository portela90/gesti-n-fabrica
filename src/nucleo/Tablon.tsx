// Tablón de avisos (todos los de la unidad de trabajo) y la bandeja de notificaciones de cada uno.
import { useCallback, useEffect, useState } from 'react';
import { nucleo } from './supabase';
import { useSesion } from './sesion';
import { aviso, Ventana } from '../componentes/basicos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const sumar = (f: string, n: number) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const corta = (f: string) => new Date(f.length === 10 ? f + 'T12:00' : f).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' });

interface Aviso { id: string; titulo: string; texto: string | null; hasta: string; anulado: string | null }

/** Los avisos del tablón que siguen en pie. Quien puede publicar, ve «+ Aviso» y «Quitar». */
export function Tablon({ compacto }: { compacto?: boolean }) {
  const { empresa, puede } = useSesion();
  const edita = puede('nucleo.aviso.editar');
  const [lista, setLista] = useState<Aviso[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const cargar = useCallback(async () => {
    const { data } = await nucleo().from('avisos').select('id, titulo, texto, hasta, anulado').eq('empresa_id', empresa!.id)
      .is('anulado', null).gte('hasta', hoy()).order('hasta');
    setLista((data ?? []) as Aviso[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  async function quitar(id: string) {
    const { error } = await nucleo().from('avisos').update({ anulado: new Date().toISOString() }).eq('id', id);
    if (error) return aviso(error.message);
    cargar();
  }
  if (!lista.length && (!edita || compacto)) return null;
  return (
    <section className="tablon" aria-label="Tablón de avisos">
      {lista.map((a) => (
        <div key={a.id} className="aviso-tablon">
          <span className="fila-txt"><b>{a.titulo}</b>{a.texto && <span className="texto-largo">{a.texto}</span>}<small>Hasta el {corta(a.hasta)}</small></span>
          {edita && !compacto && <button type="button" className="boton sec peq" onClick={() => quitar(a.id)}>Quitar</button>}
        </div>))}
      {edita && !compacto && <button type="button" className="boton sec peq" onClick={() => setNuevo(true)}>+ Aviso en el tablón</button>}
      {nuevo && <NuevoAviso alCerrar={() => setNuevo(false)} alGuardar={() => { setNuevo(false); cargar(); }} />}
    </section>
  );
}

function NuevoAviso({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: () => void }) {
  const { empresa } = useSesion();
  const [f, setF] = useState({ titulo: '', texto: '', hasta: sumar(hoy(), 7) });
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    setError(null);
    if (!f.titulo.trim()) return setError('Pon un título.');
    if (f.hasta < hoy()) return setError('«Hasta» no puede ser un día pasado.');
    const { error: e } = await nucleo().from('avisos').insert({ empresa_id: empresa!.id, titulo: f.titulo.trim(), texto: f.texto.trim() || null, hasta: f.hasta });
    if (e) return setError(e.message);
    aviso('Publicado: les llega a todos'); alGuardar();
  }
  return (
    <Ventana titulo="Aviso en el tablón" alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={guardar}>Publicar</button>}>
      <label className="campo"><span>Título</span><input maxLength={120} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Auditoría del cliente el jueves" /></label>
      <label className="campo"><span>Texto (opcional)</span><textarea rows={4} maxLength={2000} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></label>
      <label className="campo"><span>Se ve hasta el día</span><input type="date" min={hoy()} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      <p className="nota">Lo ven todos los de esta unidad de trabajo al entrar, y les llega un aviso.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

interface Notificacion { id: number; titulo: string; texto: string | null; ruta: string | null; creado: string; leido: string | null; urgente: boolean }

/** Lo que te ha llegado y aún no has visto. Al tocarlo, te lleva a donde es y queda leído. */
export function MisNotificaciones({ ir }: { ir: (r: string) => void }) {
  const { empresa } = useSesion();
  const [lista, setLista] = useState<Notificacion[]>([]);
  const cargar = useCallback(async () => {
    const { data } = await nucleo().from('notificaciones').select('id, titulo, texto, ruta, creado, leido, urgente').eq('empresa_id', empresa!.id)
      .is('leido', null).order('creado', { ascending: false }).limit(30);
    setLista((data ?? []) as Notificacion[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  async function leidas(ids: number[] | null) {
    await nucleo().rpc('marcar_leidas', { p_ids: ids });
    cargar();
  }
  if (!lista.length) return null;
  return (
    <section className="notificaciones" aria-label="Te ha llegado">
      <h2 className="subtitulo">Te ha llegado ({lista.length})</h2>
      <div className="lista compacta">{lista.map((n) => (
        <button key={n.id} type="button" className={'fila' + (n.urgente ? ' sin-leer' : '')} onClick={() => { void leidas([n.id]); if (n.ruta) ir(n.ruta); }}>
          <span className="fila-txt"><b>{n.titulo}</b><small>{[n.texto, new Date(n.creado).toLocaleString('es-ES', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</small></span>
          {n.ruta && <span className="fila-flecha" aria-hidden="true">›</span>}
        </button>))}</div>
      <button type="button" className="boton sec peq" onClick={() => leidas(null)}>Marcar todo como visto</button>
    </section>
  );
}
