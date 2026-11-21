import { useEffect, useState, type FormEvent } from 'react';
import { direccionApp, supabase } from '../nucleo/supabase';
import { aviso } from '../componentes/basicos';
import { darDeAlta, entrarConPin, movilGuardado, olvidarMovil } from '../nucleo/pin';

type Modo = 'clave' | 'enlace' | 'olvido';

const TEXTO_ERROR: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos',
  'Email not confirmed': 'Ese correo todavía no está confirmado',
  'Signups not allowed for otp': 'Ese correo no tiene acceso. Pide a tu administrador que te dé de alta.',
};
const traducir = (m: string) => TEXTO_ERROR[m] ?? (/rate limit/i.test(m) ? 'Demasiados intentos. Espera unos minutos.' : m);

/** El código de alta que viene en la dirección (del QR): …#/alta/K7P2-9QXM */
const codigoDeLaDireccion = () => decodeURIComponent(location.hash.match(/^#\/alta\/([^/?]+)/)?.[1] ?? '');
const quitarCodigoDeLaDireccion = () => { if (codigoDeLaDireccion()) history.replaceState(null, '', location.pathname + location.search); };

/** Pantalla de entrar: los operarios con su PIN (o con su código de alta la primera vez); los demás, con su correo. */
export function Entrar() {
  const [vista, setVista] = useState<'pin' | 'alta' | 'correo'>(() => (codigoDeLaDireccion() ? 'alta' : movilGuardado() ? 'pin' : 'correo'));
  if (vista === 'pin') return <EntrarPin alCorreo={() => setVista('correo')} alAlta={() => setVista('alta')} />;
  if (vista === 'alta') return <AltaMovil alVolver={() => { quitarCodigoDeLaDireccion(); setVista(movilGuardado() ? 'pin' : 'correo'); }} />;
  return <EntrarCorreo alPin={movilGuardado() ? () => setVista('pin') : undefined} alAlta={() => setVista('alta')} />;
}

/** Entrar con correo y contraseña, o con un enlace que llega al correo (cada uno elige). */
function EntrarCorreo({ alPin, alAlta }: { alPin?: () => void; alAlta: () => void }) {
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
        <div className="entrar-otro">
          {alPin && <button type="button" className="boton sec ancho" onClick={alPin}>Entrar con mi PIN</button>}
          <button type="button" className="boton txt ancho" onClick={alAlta}>Soy operario: tengo un código de alta</button>
        </div>
      </div>
    </main>
  );
}

/** Un PIN demasiado fácil de adivinar: todas iguales (1111) o seguidas (1234, 9876). */
export function pinFacil(p: string) {
  const d = [...p].map(Number);
  return d.every((x) => x === d[0]) || d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1);
}

/** Teclado de números grande para el PIN (4 cifras). También vale el teclado del ordenador. */
function TecladoPin({ titulo, alCompletar, ocupado, error }: { titulo: string; alCompletar: (pin: string) => void; ocupado: boolean; error: string | null }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);
  const pulsar = (c: string) => {
    if (ocupado) return;
    if (c === '<') { setPin(pin.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const n = pin + c;
    setPin(n);
    if (n.length === 4) setTimeout(() => { alCompletar(n); setPin(''); }, 120);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (/^[0-9]$/.test(e.key)) pulsar(e.key); else if (e.key === 'Backspace') pulsar('<'); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  });
  return (
    <div className="pin">
      <p className="pin-titulo" id="pin-titulo">{titulo}</p>
      <div className="pin-puntos" role="status" aria-label={`${pin.length} de 4 cifras`}>
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? 'lleno' : ''} />)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="pin-teclas" role="group" aria-labelledby="pin-titulo">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'].map((c, i) => c === ''
          ? <span key={i} />
          : <button key={i} type="button" disabled={ocupado} aria-label={c === '<' ? 'Borrar' : c} onClick={() => pulsar(c)}>{c === '<' ? '⌫' : c}</button>)}
      </div>
      {ocupado && <p className="nota centro">Un momento…</p>}
    </div>
  );
}

/** Un operario con su móvil ya dado de alta: solo su PIN. */
function EntrarPin({ alCorreo, alAlta }: { alCorreo: () => void; alAlta: () => void }) {
  const m = movilGuardado();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perdido, setPerdido] = useState(false);
  async function probar(pin: string) {
    setOcupado(true); setError(null);
    const r = await entrarConPin(pin);
    setOcupado(false);
    if (r.error) { setError(r.error); if (r.olvidar) { olvidarMovil(); setPerdido(true); } }
  }
  return (
    <main className="entrar">
      <div className="entrar-caja">
        <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" width={56} height={56} />
        <h1>Hola{m ? `, ${m.nombre.split(' ')[0]}` : ''}</h1>
        {perdido ? <p className="error" role="alert">{error}</p>
          : <TecladoPin titulo="Pon tu PIN" alCompletar={probar} ocupado={ocupado} error={error} />}
        <div className="entrar-otro">
          <button type="button" className="boton txt ancho" onClick={alAlta}>Tengo un código de alta nuevo</button>
          <button type="button" className="boton txt ancho" onClick={alCorreo}>Entrar con correo</button>
        </div>
      </div>
    </main>
  );
}

/** Dar de alta este móvil: el código que le han dado (o el del QR) y su PIN, dos veces. */
function AltaMovil({ alVolver }: { alVolver: () => void }) {
  const [codigo, setCodigo] = useState(codigoDeLaDireccion);
  const [paso, setPaso] = useState<'codigo' | 'pin' | 'repetir'>(() => (codigoDeLaDireccion() ? 'pin' : 'codigo'));
  const [primero, setPrimero] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');

  async function terminar(pin: string) {
    if (pin !== primero) { setError('No es el mismo PIN. Vuelve a elegirlo.'); setPrimero(''); setPaso('pin'); return; }
    setOcupado(true); setError(null);
    const r = await darDeAlta(limpio, pin);
    setOcupado(false);
    if (r.error) { setError(r.error); setPrimero(''); setPaso(/código/i.test(r.error) ? 'codigo' : 'pin'); return; }
    quitarCodigoDeLaDireccion();
  }
  return (
    <main className="entrar">
      <div className="entrar-caja">
        <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" width={56} height={56} />
        <h1>Dar de alta este móvil</h1>
        {paso === 'codigo' ? (
          <form noValidate onSubmit={(e) => {
            e.preventDefault();
            if (limpio.length !== 8) { setError('El código tiene 8 letras y números (por ejemplo, K7P2-9QXM).'); return; }
            setError(null); setPaso('pin');
          }}>
            <p className="nota centro">Escribe el código que te ha dado tu administrador. Solo hace falta una vez.</p>
            <label className="campo"><span>Código de alta</span>
              <input id="codigo-alta" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder="XXXX-XXXX"
                value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="boton ancho">Siguiente</button>
          </form>
        ) : paso === 'pin' ? (
          <>
            <p className="nota centro">Código {limpio.slice(0, 4)}-{limpio.slice(4)}. Ahora elige tu PIN: 4 cifras que solo sabrás tú. Lo pondrás cada vez que entres.</p>
            <TecladoPin titulo="Elige tu PIN" ocupado={ocupado} error={error} alCompletar={(p) => {
              if (pinFacil(p)) { setError('Ese PIN es muy fácil de adivinar (todas iguales o seguidas). Elige otro.'); return; }
              setError(null); setPrimero(p); setPaso('repetir');
            }} />
          </>
        ) : (
          <TecladoPin titulo="Repite tu PIN" ocupado={ocupado} error={error} alCompletar={terminar} />
        )}
        <div className="entrar-otro">
          <button type="button" className="boton txt ancho" onClick={alVolver}>Volver</button>
        </div>
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
