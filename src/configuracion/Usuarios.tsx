import { useCallback, useEffect, useMemo, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';

interface Asig { id: string; usuario_id: string; rol_id: string; centro_id: string | null }
interface Rol { id: string; empresa_id: string | null; codigo: string; nombre: string; descripcion: string | null; baja: string | null }
interface Ref { id: string; nombre: string; baja?: string | null }
interface Usu { id: string; nombre: string; email: string | null; superadmin: boolean }

const ERRORES: Record<string, string> = {
  CORREO: 'El correo no está bien escrito.',
  NOMBRE: 'Falta el nombre.',
  NO_PERMISO: 'No tienes permiso para dar acceso en esta unidad de trabajo (o en esa nave).',
  A_TI_MISMO: 'No puedes darte roles a ti mismo.',
  ROL: 'Ese rol no vale para esta unidad de trabajo.',
  PERSONA: 'Ese trabajador no es de esta unidad de trabajo.',
  SESION: 'Tu sesión ha caducado. Sal y vuelve a entrar.',
};

/** Configuración → Usuarios: quién entra en esta unidad de trabajo, con qué rol y en qué nave. */
export function Usuarios({ ir }: { ir: (r: string) => void }) {
  const { empresa, puede, estado } = useSesion();
  const yo = estado.fase === 'dentro' ? estado.sesion.usuario?.id : null;
  const [asigs, setAsigs] = useState<Asig[] | null>(null);
  const [usus, setUsus] = useState<Usu[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [naves, setNaves] = useState<Ref[]>([]);
  const [personas, setPersonas] = useState<Ref[]>([]);
  const [formulario, setFormulario] = useState<{ correo?: string; nombre?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!empresa) return;
    const [a, r, c, p] = await Promise.all([
      nucleo().from('asignaciones').select('id, usuario_id, rol_id, centro_id').eq('empresa_id', empresa.id).is('hasta', null),
      nucleo().from('roles').select('*').order('nombre'),
      nucleo().from('centros').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre'),
      puede('nucleo.persona.ver') ? nucleo().from('personas').select('id, nombre, baja').eq('empresa_id', empresa.id).order('nombre') : Promise.resolve({ data: [] as Ref[] }),
    ]);
    if (a.error) { setError(a.error.message); return; }
    const ids = [...new Set((a.data as Asig[]).map((x) => x.usuario_id))];
    const u = ids.length ? await nucleo().from('usuarios').select('id, nombre, email, superadmin').in('id', ids) : { data: [] };
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

  async function quitar(a: Asig, u: Usu) {
    if (!confirm(`¿Quitar a ${u.nombre} el rol «${nombreRol(a.rol_id)}» (${nombreNave(a.centro_id)})?`)) return;
    const { error } = await nucleo().from('asignaciones').delete().eq('id', a.id);
    if (error) { aviso('No se ha podido quitar: ' + error.message); return; }
    aviso('Rol quitado'); cargar();
  }

  return (
    <main className="contenido estrecho">
      <button type="button" className="boton txt volver" onClick={() => ir('/config')}><Icono d={ICONOS.volver} tam={18} /> Configuración</button>
      <h1 className="titulo">Usuarios</h1>
      <p className="nota" style={{ margin: '-8px 0 14px' }}>Quién entra en {empresa.nombre}, con qué rol y en qué nave.</p>
      {editable && <button type="button" className="boton ancho" style={{ marginBottom: 14 }} onClick={() => setFormulario({})}>Dar acceso a alguien</button>}
      {error && <p className="error" role="alert">{error}</p>}
      {asigs === null && !error ? <p className="nota">Cargando…</p> : (
        <div className="lista">
          {grupos.map(({ u, roles: rs }) => (
            <div key={u.id} className="fila fija">
              <span className="fila-txt">
                <b>{u.nombre}{u.id === yo ? ' (tú)' : ''}</b>
                <small>{u.email}</small>
                {rs.map((a) => (
                  <span key={a.id} className="rol-linea">
                    <span>{nombreRol(a.rol_id)} · {nombreNave(a.centro_id)}</span>
                    {editable && u.id !== yo && <button type="button" className="boton txt peq" onClick={() => quitar(a, u)}>Quitar</button>}
                  </span>
                ))}
              </span>
              {editable && u.id !== yo && (
                <button type="button" className="boton sec peq" onClick={() => setFormulario({ correo: u.email ?? '', nombre: u.nombre })}>Otro rol</button>
              )}
            </div>
          ))}
          {!grupos.length && <div className="fila fija"><span className="fila-txt"><small>Todavía no hay nadie con acceso a esta unidad de trabajo.</small></span></div>}
        </div>
      )}
      {formulario && <DarAcceso inicial={formulario} roles={roles} naves={naves} personas={personas} empresaId={empresa.id}
        alCerrar={() => setFormulario(null)} alTerminar={() => cargar()} />}
    </main>
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
    const { data, error } = await supabase.functions.invoke('invitar', {
      body: { correo, nombre, empresa_id: empresaId, rol_id: rol, centro_id: nave || null, persona_id: persona || null },
    });
    setOcupado(false);
    let codigo: string | undefined = (data as { error?: string } | null)?.error;
    if (error && !codigo) { try { codigo = (await (error as { context?: Response }).context?.json())?.error; } catch { /* sin cuerpo */ } }
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
