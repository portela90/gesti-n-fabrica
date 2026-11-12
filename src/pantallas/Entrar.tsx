import { useState, type FormEvent } from 'react';
import { direccionApp, supabase } from '../nucleo/supabase';
import { aviso } from '../componentes/basicos';

type Modo = 'clave' | 'enlace' | 'olvido';

const TEXTO_ERROR: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos',
  'Email not confirmed': 'Ese correo todavía no está confirmado',
  'Signups not allowed for otp': 'Ese correo no tiene acceso. Pide a tu administrador que te dé de alta.',
};
const traducir = (m: string) => TEXTO_ERROR[m] ?? (/rate limit/i.test(m) ? 'Demasiados intentos. Espera unos minutos.' : m);

/** Entrar con correo y contraseña, o con un enlace que llega al correo (cada uno elige). */
export function Entrar() {
  const [modo, setModo] = useState<Modo>('clave');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!correo.includes('@')) { setError('Escribe tu correo'); return; }
    setOcupado(true);
    try {
      if (modo === 'clave') {
        if (!clave) { setError('Escribe tu contraseña'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
        if (error) setError(traducir(error.message));
      } else if (modo === 'enlace') {
        const { error } = await supabase.auth.signInWithOtp({ email: correo.trim(), options: { shouldCreateUser: false, emailRedirectTo: direccionApp() } });
        if (error) setError(traducir(error.message)); else setEnviado('Te hemos enviado un enlace. Ábrelo desde este mismo móvil u ordenador para entrar.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: direccionApp() });
        if (error) setError(traducir(error.message)); else setEnviado('Te hemos enviado un enlace para poner una contraseña nueva.');
      }
    } finally { setOcupado(false); }
  }

  return (
    <main className="entrar">
      <div className="entrar-caja">
        <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" width={56} height={56} />
        <h1>Gestión de fábrica</h1>
        {enviado ? (
          <>
            <p className="entrar-ok" role="status">{enviado}</p>
            <button type="button" className="boton sec ancho" onClick={() => { setEnviado(null); setModo('clave'); }}>Volver</button>
          </>
        ) : (
          <form onSubmit={enviar} noValidate>
            <div className="segmentos" role="group" aria-label="Cómo entrar">
              <button type="button" aria-pressed={modo === 'clave'} onClick={() => setModo('clave')}>Con contraseña</button>
              <button type="button" aria-pressed={modo === 'enlace'} onClick={() => setModo('enlace')}>Con un enlace</button>
            </div>
            <label className="campo">
              <span>Correo</span>
              <input id="correo" type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            {modo === 'clave' && (
              <label className="campo">
                <span>Contraseña</span>
                <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
              </label>
            )}
            {modo === 'olvido' && <p className="nota">Te llegará un enlace al correo para poner una contraseña nueva.</p>}
            {modo === 'enlace' && <p className="nota">Te llegará un enlace al correo: al abrirlo, entras sin contraseña.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="boton ancho" disabled={ocupado}>
              {ocupado ? 'Un momento…' : modo === 'clave' ? 'Entrar' : modo === 'enlace' ? 'Enviarme el enlace' : 'Enviarme el enlace'}
            </button>
            {modo === 'clave' && <button type="button" className="boton txt" onClick={() => setModo('olvido')}>He olvidado la contraseña</button>}
            {modo === 'olvido' && <button type="button" className="boton txt" onClick={() => setModo('clave')}>Volver</button>}
          </form>
        )}
        <p className="nota centro">Los operarios de planta entrarán con su nombre y su PIN cuando llegue su módulo.</p>
      </div>
    </main>
  );
}

/** Después del enlace de «he olvidado la contraseña»: poner una nueva. */
export function NuevaClave({ alTerminar }: { alTerminar: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (clave.length < 8) { setError('Pon al menos 8 caracteres'); return; }
    const { error } = await supabase.auth.updateUser({ password: clave, data: { cambiar_clave: false } });
    if (error) { setError(traducir(error.message)); return; }
    aviso('Contraseña cambiada');
    alTerminar();
  }
  return (
    <main className="entrar">
      <form className="entrar-caja" onSubmit={guardar}>
        <h1>Pon tu contraseña</h1>
        <p className="nota" style={{ margin: '-8px 0 16px', textAlign: 'center' }}>Solo la sabrás tú. La usarás para entrar a partir de ahora.</p>
        <label className="campo"><span>Contraseña nueva</span>
          <input id="claveNueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="boton ancho">Guardar</button>
      </form>
    </main>
  );
}
