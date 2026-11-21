import { useCallback, useEffect, useMemo, useState } from 'react';
import { direccionApp, nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';
import { Tabla, useOrdenador } from '../componentes/Tabla';

interface Asig { id: string; usuario_id: string; rol_id: string; centro_id: string | null }
interface Rol { id: string; empresa_id: string | null; codigo: string; nombre: string; descripcion: string | null; baja: string | null }
interface Ref { id: string; nombre: string; baja?: string | null }
interface Usu { id: string; nombre: string; email: string | null; superadmin: boolean; persona_id: string | null }
interface Movil { id: string; usuario_id: string; fallos: number; bloqueado: string | null; ultimo: string | null; baja: string | null; creado: string }
interface Codigo { id: string; persona_id: string; rol_id: string; centro_id: string | null; caduca: string; usado: string | null; anulado: string | null }
const fecha = (f: string) => new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });

const ERRORES: Record<string, string> = {
  CORREO: 'El correo no está bien escrito.',
  NOMBRE: 'Falta el nombre.',
  NO_PERMISO: 'No tienes permiso para dar acceso en esta unidad de trabajo (o en esa nave).',
  A_TI_MISMO: 'No puedes darte roles a ti mismo.',
  ROL: 'Ese rol no vale para esta unidad de trabajo.',
  TIENE_CORREO: 'Ese trabajador ya entra con su correo: no hace falta código.',
  PERSONA: 'Ese trabajador no es de esta unidad de trabajo o está de baja.',
  SESION: 'Tu sesión se ha cerrado (por ejemplo, al salir en otro dispositivo o en otra app con tu misma cuenta). Sal de la app y vuelve a entrar.',
};

/** Configuración → Usuarios: quién entra en esta unidad de trabajo, con qué rol y en qué nave. */
export function Usuarios({ ir }: { ir: (r: string) => void }) {
  const ordenador = useOrdenador();   // en el ordenador, tabla; en el móvil, las filas de siempre
  const { empresa, puede, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
  const [asigs, setAsigs] = useState<Asig[] | null>(null);
  const [usus, setUsus] = useState<Usu[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [naves, setNaves] = useState<Ref[]>([]);
  const [personas, setPersonas] = useState<Ref[]>([]);
  const [formulario, setFormulario] = useState<{ correo?: string; nombre?: string } | null>(null);
  const [enlazando, setEnlazando] = useState<Usu | null>(null);
  const [moviles, setMoviles] = useState<Movil[]>([]);
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [conPin, setConPin] = useState<{ persona?: string; rol?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!empresa) return;
    const [a, r, c, p, mv, co] = await Promise.all([
      nucleo().from('asignaciones').select('id, usuario_id, rol_id, centro_id').eq('empresa_id', empresa.id).is('hasta', null),
      nucleo().from('roles').select('*').order('nombre'),
      nucleo().from('centros').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre'),
      puede('nucleo.persona.ver') ? nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre') : Promise.resolve({ data: [] as Ref[] }),
      nucleo().from('moviles').select('id, usuario_id, fallos, bloqueado, ultimo, baja, creado').eq('empresa_id', empresa.id).is('baja', null),
      nucleo().from('codigos_alta').select('id, persona_id, rol_id, centro_id, caduca, usado, anulado').eq('empresa_id', empresa.id).is('usado', null).is('anulado', null),
    ]);
    setMoviles((mv.data ?? []) as Movil[]);
    setCodigos(((co.data ?? []) as Codigo[]).filter((x) => x.caduca > new Date().toISOString()));
    if (a.error) { setError(a.error.message); return; }
    const ids = [...new Set((a.data as Asig[]).map((x) => x.usuario_id))];
    const u = ids.length ? await nucleo().from('usuarios').select('id, nombre, email, superadmin, persona_id').in('id', ids) : { data: [] };
    setAsigs(a.data as Asig[]); setUsus((u.data ?? []) as Usu[]);
    setRoles(((r.data ?? []) as Rol[]).filter((x) => !x.baja && (!x.empresa_id || x.empresa_id === empresa.id)));
    setNaves(((c.data ?? []) as Ref[]).filter((x) => !x.baja)); setPersonas(((p.data ?? []) as Ref[]).filter((x) => !x.baja));
  }, [empresa, puede]);
  useEffect(() => { cargar(); }, [cargar]);

  const grupos = useMemo(() => usus
    .map((u) => ({ u, roles: (asigs ?? []).filter((a) => a.usuario_id === u.id) }))
    .sort((x, y) => x.u.nombre.localeCompare(y.u.nombre, 'es')), [usus, asigs]);

  if (!empresa) return null;
  const editable = puede('nucleo.usuario.editar');
  const nombreRol = (id: string) => roles.find((r) => r.id === id)?.nombre ?? 'Rol';
  const nombreNave = (id: string | null) => (id ? naves.find((n) => n.id === id)?.nombre ?? 'una nave' : 'todas las naves');

  /** Los que entran con PIN: sin correo y enlazados con su ficha. */
  const esPin = (u: Usu) => !u.email && !!u.persona_id && !u.superadmin;
  const estadoPin = (u: Usu) => {
    const m = moviles.find((x) => x.usuario_id === u.id);
    if (!m) return codigos.some((c) => c.persona_id === u.persona_id) ? 'Código sin usar' : 'Sin móvil (dale un código)';
    if (m.bloqueado) return 'Bloqueado: dale un código nuevo';
    return m.ultimo ? `Con PIN · entró el ${fecha(m.ultimo)}` : `Con PIN · móvil del ${fecha(m.creado)}`;
  };
  const rolDe = (u: Usu) => (asigs ?? []).find((a) => a.usuario_id === u.id)?.rol_id;
  async function anular(c: Codigo) {
    if (!confirm('¿Anular este código? Ya no servirá para dar de alta el móvil.')) return;
    const { error } = await nucleo().rpc('codigo_anular', { p_codigo: c.id });
    if (error) { aviso('No se ha podido anular: ' + error.message); return; }
    aviso('Código anulado'); cargar();
  }

  async function quitar(a: Asig, u: Usu) {
    if (!confirm(`¿Quitar a ${u.nombre} el rol «${nombreRol(a.rol_id)}» (${nombreNave(a.centro_id)})?`)) return;
    const { error } = await nucleo().from('asignaciones').delete().eq('id', a.id);
    if (error) { aviso('No se ha podido quitar: ' + error.message); return; }
    aviso('Rol quitado'); cargar();
  }

  return (
    <main className={ordenador ? "contenido" : "contenido estrecho"}>
      <button type="button" className="boton txt volver" onClick={() => ir('/config')}><Icono d={ICONOS.volver} tam={18} /> Configuración</button>
      <h1 className="titulo">Usuarios</h1>
      <p className="nota" style={{ margin: '-8px 0 14px' }}>Quién entra en {empresa.nombre}, con qué rol y en qué nave.</p>
      {editable && (
        <div className="acciones-cal" style={{ marginTop: 0, marginBottom: 14 }}>
          <button type="button" className="boton" onClick={() => setFormulario({})}>Dar acceso con correo</button>
          {personas.length > 0 && <button type="button" className="boton sec" onClick={() => setConPin({})}>Operario: código de alta (PIN)</button>}
        </div>
      )}
      {editable && codigos.length > 0 && (
        <section className="codigos-pendientes" aria-label="Códigos de alta sin usar">
          <h2 className="subtitulo">Códigos de alta sin usar</h2>
          <div className="lista compacta">{codigos.map((c) => (
            <div key={c.id} className="fila fija centrada">
              <span className="fila-txt"><b>{personas.find((p) => p.id === c.persona_id)?.nombre ?? 'Trabajador'}</b>
                <small>{nombreRol(c.rol_id)} · caduca el {fecha(c.caduca)}</small></span>
              <button type="button" className="boton txt peq" onClick={() => anular(c)}>Anular</button>
            </div>))}</div>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {asigs === null && !error ? <p className="nota">Cargando…</p> : ordenador ? (
        <Tabla filas={grupos} clave={(g) => g.u.id} etiquetaBuscar="Buscar usuario" pistaBuscar="Buscar por nombre, correo o trabajador…"
          buscarEn={(g) => `${g.u.nombre} ${g.u.email ?? ''} ${personas.find((p) => p.id === g.u.persona_id)?.nombre ?? ''}`}
          filtros={personas.length ? [{ clave: 'sin', texto: 'Sin enlazar con su ficha', cumple: (g) => !g.u.persona_id && !g.u.superadmin }] : undefined}
          columnas={[
            { clave: 'nombre', titulo: 'Usuario', valor: (g) => <>{g.u.nombre}{g.u.id === yo ? ' (tú)' : ''}</>, orden: (g) => g.u.nombre },
            { clave: 'email', titulo: 'Entra con', valor: (g) => (esPin(g.u)
              ? <span className={/Bloqueado|Sin móvil/.test(estadoPin(g.u)) ? 'naranja' : ''}>{estadoPin(g.u)}</span> : g.u.email ?? ''), orden: (g) => g.u.email ?? estadoPin(g.u) },
            ...(personas.length ? [{ clave: 'trabajador', titulo: 'Trabajador', orden: (g: typeof grupos[number]) => personas.find((p) => p.id === g.u.persona_id)?.nombre ?? '',
              valor: (g: typeof grupos[number]) => (g.u.persona_id ? personas.find((p) => p.id === g.u.persona_id)?.nombre ?? 'de otra unidad'
                : g.u.superadmin ? '' : <span className="aviso-texto">Sin enlazar</span>) }] : []),
            { clave: 'roles', titulo: 'Roles y nave', orden: (g) => g.roles.map((a) => nombreRol(a.rol_id)).join(' '), valor: (g) => (
              <span className="roles-celda">{g.roles.map((a) => (
                <span key={a.id} className="rol-linea"><span>{nombreRol(a.rol_id)} · {nombreNave(a.centro_id)}</span>
                  {editable && g.u.id !== yo && <button type="button" className="boton txt peq" onClick={() => quitar(a, g.u)}>Quitar</button>}</span>))}</span>) },
            ...(editable ? [{ clave: 'acciones', titulo: '', valor: (g: typeof grupos[number]) => (
              <span className="botones-fila">
                {g.u.id !== yo && !esPin(g.u) && <button type="button" className="boton sec peq" onClick={() => setFormulario({ correo: g.u.email ?? '', nombre: g.u.nombre })}>Otro rol</button>}
                {esPin(g.u) && <button type="button" className="boton sec peq" onClick={() => setConPin({ persona: g.u.persona_id!, rol: rolDe(g.u) })}>Nuevo código de alta</button>}
                {personas.length > 0 && <button type="button" className="boton txt peq" onClick={() => setEnlazando(g.u)}>{g.u.persona_id ? 'Cambiar trabajador' : 'Enlazar con su ficha'}</button>}
              </span>) }] : []),
          ]} />
      ) : (
        <div className="lista">
          {grupos.map(({ u, roles: rs }) => (
            <div key={u.id} className="fila fija">
              <span className="fila-txt">
                <b>{u.nombre}{u.id === yo ? ' (tú)' : ''}</b>
                <small>{esPin(u) ? estadoPin(u) : u.email}</small>
                {personas.length > 0 && (u.persona_id
                  ? <small>Es el trabajador: <b>{personas.find((p) => p.id === u.persona_id)?.nombre ?? 'de otra unidad'}</b></small>
                  : !u.superadmin && <small className="aviso-texto">Sin enlazar con su ficha de trabajador: no le saldrá nada para firmar</small>)}
                {rs.map((a) => (
                  <span key={a.id} className="rol-linea">
                    <span>{nombreRol(a.rol_id)} · {nombreNave(a.centro_id)}</span>
                    {editable && u.id !== yo && <button type="button" className="boton txt peq" onClick={() => quitar(a, u)}>Quitar</button>}
                  </span>
                ))}
              </span>
              {editable && (
                <span className="botones-fila">
                  {u.id !== yo && !esPin(u) && <button type="button" className="boton sec peq" onClick={() => setFormulario({ correo: u.email ?? '', nombre: u.nombre })}>Otro rol</button>}
                  {esPin(u) && <button type="button" className="boton sec peq" onClick={() => setConPin({ persona: u.persona_id!, rol: rolDe(u) })}>Nuevo código de alta</button>}
                  {personas.length > 0 && <button type="button" className="boton txt peq" onClick={() => setEnlazando(u)}>{u.persona_id ? 'Cambiar trabajador' : 'Enlazar con su ficha'}</button>}
                </span>
              )}
            </div>
          ))}
          {!grupos.length && <div className="fila fija"><span className="fila-txt"><small>Todavía no hay nadie con acceso a esta unidad de trabajo.</small></span></div>}
        </div>
      )}
      {enlazando && <Enlazar usuario={enlazando} personas={personas} ocupadas={usus.filter((x) => x.id !== enlazando.id).map((x) => x.persona_id).filter(Boolean) as string[]}
        alCerrar={() => setEnlazando(null)} alGuardar={() => { setEnlazando(null); cargar(); }} />}
      {conPin && <CodigoAlta inicial={conPin} roles={roles} naves={naves}
        personas={personas.filter((p) => !usus.some((u) => u.persona_id === p.id && u.email))}
        alCerrar={() => setConPin(null)} alHacer={() => cargar()} />}
      {formulario && <DarAcceso inicial={formulario} roles={roles} naves={naves} personas={personas} empresaId={empresa.id}
        alCerrar={() => setFormulario(null)} alTerminar={() => cargar()} />}
    </main>
  );
}

/** Enlazar un usuario con su ficha de trabajador (así le sale lo suyo para firmar: calendario, charlas, EPI…). */
function Enlazar({ usuario, personas, ocupadas, alCerrar, alGuardar }: { usuario: Usu; personas: Ref[]; ocupadas: string[]; alCerrar: () => void; alGuardar: () => void }) {
  const [persona, setPersona] = useState(usuario.persona_id ?? '');
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    const { error } = await nucleo().from('usuarios').update({ persona_id: persona || null }).eq('id', usuario.id);
    if (error) { setError('No se ha podido guardar: ' + error.message); return; }
    aviso(persona ? 'Enlazado con su ficha' : 'Ya no está enlazado'); alGuardar();
  }
  return (
    <Ventana titulo={`¿Qué trabajador es ${usuario.nombre}?`} alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button><button type="button" className="boton" onClick={guardar}>Guardar</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Así, cuando entre con su correo, le saldrá lo suyo para firmar: su calendario, las charlas y los documentos de prevención.</p>
      <label className="campo"><span>Es el trabajador</span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">— ninguno —</option>
          {personas.map((p) => <option key={p.id} value={p.id} disabled={ocupadas.includes(p.id)}>{p.nombre}{ocupadas.includes(p.id) ? ' (ya tiene usuario)' : ''}</option>)}
        </select></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

function DarAcceso({ inicial, roles, naves, personas, empresaId, alCerrar, alTerminar }: {
  inicial: { correo?: string; nombre?: string }; roles: Rol[]; naves: Ref[]; personas: Ref[]; empresaId: string;
  alCerrar: () => void; alTerminar: () => void;
}) {
  const [correo, setCorreo] = useState(inicial.correo ?? '');
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [rol, setRol] = useState('');
  const [nave, setNave] = useState('');
  const [persona, setPersona] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{ nuevo: boolean; clave: string | null } | null>(null);
  const r = roles.find((x) => x.id === rol);

  async function dar() {
    setError(null);
    if (!correo.includes('@')) { setError('Escribe su correo.'); return; }
    if (!nombre.trim()) { setError('Escribe su nombre.'); return; }
    if (!rol) { setError('Elige un rol.'); return; }
    setOcupado(true);
    const llamar = async () => {
      const { data, error } = await supabase.functions.invoke('invitar', {
        body: { correo, nombre, empresa_id: empresaId, rol_id: rol, centro_id: nave || null, persona_id: persona || null },
      });
      let codigo: string | undefined = (data as { error?: string } | null)?.error;
      if (error && !codigo) { try { codigo = (await (error as { context?: Response }).context?.json())?.error; } catch { /* sin cuerpo */ } }
      return { data, error, codigo };
    };
    let { data, error, codigo } = await llamar();
    // la sesión puede estar caducada o cerrada desde otro sitio: se intenta renovar y se prueba otra vez
    if (codigo === 'SESION') {
      const { error: eRenovar } = await supabase.auth.refreshSession();
      if (!eRenovar) ({ data, error, codigo } = await llamar());
    }
    setOcupado(false);
    if (error || codigo) { setError(ERRORES[codigo ?? ''] ?? 'No se ha podido dar el acceso' + (codigo ? ` (${codigo}).` : '. Revisa la conexión.')); return; }
    setHecho(data as { nuevo: boolean; clave: string | null });
    alTerminar();
  }

  if (hecho) {
    return (
      <Ventana titulo="Acceso dado" alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={alCerrar}>Hecho</button>}>
        {hecho.nuevo && hecho.clave ? (
          <>
            <p><b>{nombre}</b> ya puede entrar con su correo y esta contraseña temporal. Dásela en mano o por un mensaje privado:</p>
            <p className="clave-temporal" id="claveTemporal">{hecho.clave}</p>
            <button type="button" className="boton sec ancho" onClick={() => { navigator.clipboard?.writeText(hecho.clave!).then(() => aviso('Copiada'), () => {}); }}>Copiar</button>
            <p className="nota">La primera vez que entre, la app le pedirá que ponga su propia contraseña. Esta no se vuelve a enseñar.</p>
          </>
        ) : (
          <p><b>{nombre}</b> ya tenía cuenta: entra con su correo y su contraseña de siempre, y ahora verá también {r ? `lo de «${r.nombre}»` : 'esta unidad de trabajo'}.</p>
        )}
      </Ventana>
    );
  }
  return (
    <Ventana titulo="Dar acceso" alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={dar}>{ocupado ? 'Un momento…' : 'Dar acceso'}</button></>}>
      <label className="campo"><span>Correo *</span><input id="u-correo" type="email" inputMode="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} /></label>
      <label className="campo"><span>Nombre *</span><input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label className="campo"><span>Rol *</span>
        <select id="u-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">— elige —</option>
          {roles.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
        {r?.descripcion && <small className="nota">{r.descripcion}</small>}
      </label>
      <label className="campo"><span>Nave</span>
        <select id="u-nave" value={nave} onChange={(e) => setNave(e.target.value)}>
          <option value="">Todas las naves</option>
          {naves.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
        <small className="nota">Si eliges una, ese rol solo vale en esa nave.</small>
      </label>
      {personas.length > 0 && (
        <label className="campo"><span>Es el trabajador</span>
          <select id="u-persona" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">— ninguno —</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <small className="nota">Para que pueda firmar lo suyo (calendario, EPIs…).</small>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

/** Sacar el código de alta de un operario: lo escribe en su móvil (o escanea el QR) y elige su PIN. */
function CodigoAlta({ inicial, roles, naves, personas, alCerrar, alHacer }: {
  inicial: { persona?: string; rol?: string }; roles: Rol[]; naves: Ref[]; personas: Ref[]; alCerrar: () => void; alHacer: () => void;
}) {
  const [persona, setPersona] = useState(inicial.persona ?? '');
  const [rol, setRol] = useState(inicial.rol ?? roles.find((r) => r.codigo === 'operario')?.id ?? '');
  const [nave, setNave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<{ codigo: string; qr: string | null } | null>(null);
  const nombre = personas.find((p) => p.id === persona)?.nombre ?? '';

  async function sacar() {
    setError(null);
    if (!persona) { setError('Elige el trabajador.'); return; }
    if (!rol) { setError('Elige un rol.'); return; }
    setOcupado(true);
    const { data, error } = await nucleo().rpc('codigo_alta', { p_persona: persona, p_rol: rol, p_centro: nave || null });
    setOcupado(false);
    if (error) { const m = error.message.match(/[A-Z_]{4,}/)?.[0] ?? ''; setError(ERRORES[m] ?? 'No se ha podido sacar el código: ' + error.message); return; }
    const codigo = String(data);
    let qr: string | null = null;
    try { qr = await (await import('qrcode')).toDataURL(`${direccionApp()}#/alta/${codigo}`, { margin: 1, width: 440 }); } catch { /* sin QR, vale el código */ }
    setHecho({ codigo, qr });
    alHacer();
  }

  if (hecho) {
    return (
      <Ventana titulo={`Código de alta de ${nombre}`} alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={alCerrar}>Hecho</button>}>
        <p style={{ marginTop: 0 }}>Que lo escanee con la cámara de su móvil, o que abra la app y toque <b>«Soy operario: tengo un código de alta»</b> y escriba:</p>
        <p className="codigo-alta" id="codigoAlta">{hecho.codigo}</p>
        {hecho.qr && <img className="qr-alta" src={hecho.qr} alt={`Código QR para dar de alta el móvil de ${nombre}`} />}
        <p className="nota">Sirve una sola vez y caduca en 7 días. Después elegirá su PIN de 4 cifras. Si tenía otro móvil o un código anterior, ya no sirven.</p>
      </Ventana>
    );
  }
  return (
    <Ventana titulo="Código de alta (entrar con PIN)" alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado} onClick={sacar}>{ocupado ? 'Un momento…' : 'Sacar el código'}</button></>}>
      <p className="nota" style={{ marginTop: 0 }}>Para los operarios que no tienen correo: con el código dan de alta su móvil y eligen un PIN. Desde otro móvil no se puede entrar con su PIN.</p>
      <label className="campo"><span>Trabajador *</span>
        <select id="pin-persona" value={persona} disabled={!!inicial.persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">— elige —</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select></label>
      <label className="campo"><span>Rol *</span>
        <select id="pin-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">— elige —</option>
          {roles.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select></label>
      <label className="campo"><span>Nave</span>
        <select id="pin-nave" value={nave} onChange={(e) => setNave(e.target.value)}>
          <option value="">Todas las naves</option>
          {naves.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select></label>
      {inicial.persona && <p className="nota">Al sacar el código nuevo, su móvil de ahora deja de servir hasta que lo vuelva a dar de alta.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}
