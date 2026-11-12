import { useState } from 'react';
import { nucleo, VERSION } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from './basicos';

/**
 * «Tengo un problema»: guarda la incidencia con todo lo que hace falta para entenderla
 * (pantalla, versión, móvil, conexión, empresa) sin que la persona tenga que explicarlo.
 */
export function Problema({ alCerrar }: { alCerrar: () => void }) {
  const { empresa } = useSesion();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const contexto = {
    pantalla: location.hash || '#/',
    ancho: innerWidth,
    alto: innerHeight,
    conexion: navigator.onLine,
    agente: navigator.userAgent,
    instalada: matchMedia('(display-mode: standalone)').matches,
  };

  async function enviar() {
    if (!texto.trim()) { aviso('Escribe qué ha pasado'); return; }
    setEnviando(true);
    const { error } = await nucleo().from('incidencias').insert({
      empresa_id: empresa?.id ?? null,
      modulo: (location.hash.match(/^#\/m\/([a-z]+)/) ?? [])[1] ?? 'nucleo',
      pantalla: contexto.pantalla,
      version: VERSION,
      texto: texto.trim(),
      contexto,
    });
    setEnviando(false);
    if (error) { aviso('No se pudo enviar. Revisa la conexión e inténtalo otra vez.'); return; }
    aviso('Enviado. Gracias: lo miramos lo antes posible.');
    alCerrar();
  }

  return (
    <Ventana titulo="Tengo un problema" alCerrar={alCerrar}
      pie={<>
        <button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar'}</button>
      </>}>
      <label className="campo">
        <span>¿Qué ha pasado?</span>
        <textarea id="problemaTexto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Por ejemplo: al guardar el consumo sale un error" />
      </label>
      <p className="nota">Se envía también la pantalla en la que estás, la versión ({VERSION}) y el tipo de móvil, para poder ver qué pasó.</p>
    </Ventana>
  );
}
