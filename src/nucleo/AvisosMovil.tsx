// «Recibir avisos en este móvil»: apuntar este navegador para que le lleguen las notificaciones (push).
import { useEffect, useState } from 'react';
import { nucleo } from './supabase';
import { aviso } from '../componentes/basicos';

type Estado = 'mirando' | 'no-se-puede' | 'iphone' | 'bloqueado' | 'apuntado' | 'sin-apuntar';

const soporta = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.matchMedia?.('(display-mode: standalone)').matches);
function aBytes(base64: string) {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}
async function guardar(s: PushSubscription) {
  const j = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await nucleo().rpc('guardar_suscripcion', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent.slice(0, 300) });
  if (error) throw new Error(error.message);
}

export function AvisosMovil() {
  const [estado, setEstado] = useState<Estado>('mirando');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!soporta()) { setEstado(esIphone() ? 'iphone' : 'no-se-puede'); return; }
    if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
    const espera = setTimeout(() => setEstado((e) => (e === 'mirando' ? 'sin-apuntar' : e)), 3000);   // por si el navegador no contesta
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const s = await reg?.pushManager.getSubscription();
      if (s) { await guardar(s).catch(() => undefined); setEstado('apuntado'); } else setEstado('sin-apuntar');   // por si en este navegador entra otra persona
    }).catch(() => setEstado('sin-apuntar')).finally(() => clearTimeout(espera));
    return () => clearTimeout(espera);
  }, []);

  async function apuntar() {
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'sin-apuntar'); return; }
      const { data: clave, error } = await nucleo().rpc('clave_push');
      if (error) throw new Error(error.message);
      if (!clave) { aviso('Se están preparando los avisos: vuelve a pulsar en unos segundos.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave as string) });
      await guardar(s);
      setEstado('apuntado'); aviso('Listo: este móvil recibirá los avisos');
    } catch (e) { aviso(`No se ha podido: ${(e as Error).message}`); } finally { setOcupado(false); }
  }
  async function quitar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const s = await reg?.pushManager.getSubscription();
      if (s) { await nucleo().rpc('quitar_suscripcion', { p_endpoint: s.endpoint }); await s.unsubscribe(); }
      setEstado('sin-apuntar'); aviso('Este móvil ya no recibirá avisos');
    } finally { setOcupado(false); }
  }

  if (estado === 'mirando') return null;
  return (
    <section className="avisos-movil" aria-label="Avisos en este móvil">
      <h2 className="subtitulo">Avisos en este móvil</h2>
      {estado === 'apuntado' && <><p className="nota">Este móvil recibe los avisos.</p>
        <button type="button" className="boton sec peq" disabled={ocupado} onClick={quitar}>Dejar de recibirlos aquí</button></>}
      {estado === 'sin-apuntar' && <><p className="nota">Te llegarán al móvil, aunque la app esté cerrada, las cosas que te toquen.</p>
        <button type="button" className="boton" disabled={ocupado} onClick={apuntar}>Recibir avisos en este móvil</button></>}
      {estado === 'bloqueado' && <p className="nota">Este navegador tiene bloqueados los avisos de esta app. Para recibirlos, permítelos en los ajustes del navegador (Notificaciones).</p>}
      {estado === 'iphone' && <p className="nota">En iPhone, primero añade la app a la pantalla de inicio (botón Compartir → «Añadir a pantalla de inicio»), ábrela desde ahí y vuelve aquí.</p>}
      {estado === 'no-se-puede' && <p className="nota">Este navegador no puede recibir avisos. Prueba con Chrome, Edge o Firefox.</p>}
    </section>
  );
}
