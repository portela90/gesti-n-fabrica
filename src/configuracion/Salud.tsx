import { useCallback, useEffect, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { aviso, Icono, ICONOS, Ventana } from '../componentes/basicos';

interface Cifras {
  bd_bytes: number; bd_limite: number;
  ultima_copia: { en: string; bytes: number; tablas: number } | null;
  errores_sin_ver: number; errores_24h: number; incidencias_abiertas: number; usuarios: number;
}
interface ErrorApp { firma: string; mensaje: string; app_version: string | null; url: string | null; veces: number; ultimo: string; visto: boolean }
interface Incidencia { id: string; texto: string; modulo: string | null; pantalla: string | null; version: string | null; estado: string; respuesta: string | null; creado: string; contexto: Record<string, unknown> }

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
const cuando = (f: string) => new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const horasDesde = (f: string) => (Date.now() - Date.parse(f)) / 36e5;

/** Panel de salud (solo superadministrador): ¿va todo bien? Espacio, copias, errores e incidencias. */
export function Salud({ ir }: { ir: (r: string) => void }) {
  const [c, setC] = useState<Cifras | null>(null);
  const [errores, setErrores] = useState<ErrorApp[]>([]);
  const [incs, setIncs] = useState<Incidencia[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Incidencia | null>(null);

  const cargar = useCallback(async () => {
    const [s, e, i] = await Promise.all([
      nucleo().rpc('salud'),
      nucleo().from('errores').select('*').eq('visto', false).order('ultimo', { ascending: false }).limit(30),
      nucleo().from('incidencias').select('*').neq('estado', 'cerrada').order('creado', { ascending: false }).limit(30),
    ]);
    if (s.error) { setFallo(s.error.message.includes('NO_PERMISO') ? 'Solo el superadministrador puede ver esto.' : s.error.message); return; }
    setC(s.data as Cifras); setErrores((e.data ?? []) as ErrorApp[]); setIncs((i.data ?? []) as Incidencia[]);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function visto(f: string) {
    const { error } = await nucleo().from('errores').update({ visto: true }).eq('firma', f);
    if (error) { aviso('No se ha podido marcar'); return; }
    cargar();
  }

  const uso = c ? c.bd_bytes / c.bd_limite : 0;
  const copiaVieja = !c?.ultima_copia || horasDesde(c.ultima_copia.en) > 36;
  return (
    <main className="contenido estrecho">
      <button type="button" className="boton txt volver" onClick={() => ir('/config')}><Icono d={ICONOS.volver} tam={18} /> Configuración</button>
      <h1 className="titulo">Salud de la app</h1>
      {fallo && <div className="vacio"><p>{fallo}</p></div>}
      {c && (
        <>
          <div className="cifras">
            <div className={'cifra' + (uso > 0.7 ? ' mal' : '')}>
              <b className="num">{Math.round(uso * 100)} %</b>
              <span>Espacio usado</span>
              <small>{mb(c.bd_bytes)} de {mb(c.bd_limite)}</small>
              <div className="barra" aria-hidden="true"><div style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
            </div>
            <div className={'cifra' + (copiaVieja ? ' mal' : '')}>
              <b>{c.ultima_copia ? cuando(c.ultima_copia.en) : 'Ninguna'}</b>
              <span>Última copia</span>
              <small>{c.ultima_copia ? `${mb(c.ultima_copia.bytes)} · ${c.ultima_copia.tablas} tablas` : 'Falta configurar la copia nocturna'}</small>
            </div>
            <div className={'cifra' + (c.errores_sin_ver ? ' mal' : '')}>
              <b className="num">{c.errores_sin_ver}</b>
              <span>Errores sin ver</span>
              <small>{c.errores_24h} en las últimas 24 h</small>
            </div>
            <div className={'cifra' + (c.incidencias_abiertas ? ' mal' : '')}>
              <b className="num">{c.incidencias_abiertas}</b>
              <span>Incidencias abiertas</span>
              <small>{c.usuarios} usuarios en la app</small>
            </div>
          </div>

          <h2 className="subtitulo">Incidencias («Tengo un problema»)</h2>
          {incs.length === 0 ? <p className="nota">No hay ninguna abierta.</p> : (
            <div className="lista">
              {incs.map((i) => (
                <button key={i.id} type="button" className="fila" onClick={() => setAbierta(i)}>
                  <span className="fila-txt"><b>{i.texto}</b><small>{cuando(i.creado)} · {i.modulo ?? '—'} · {i.pantalla ?? ''} · versión {i.version ?? '?'}</small></span>
                  <span className="fila-flecha" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}

          <h2 className="subtitulo">Errores de la app</h2>
          {errores.length === 0 ? <p className="nota">Ningún error sin ver.</p> : (
            <div className="lista">
              {errores.map((e) => (
                <div key={e.firma} className="fila fija">
                  <span className="fila-txt"><b className="romper">{e.mensaje}</b>
                    <small>{e.veces} {e.veces === 1 ? 'vez' : 'veces'} · último {cuando(e.ultimo)} · versión {e.app_version ?? '?'}</small></span>
                  <button type="button" className="boton sec peq" onClick={() => visto(e.firma)}>Visto</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {abierta && <ContestarIncidencia inc={abierta} alCerrar={() => setAbierta(null)} alGuardar={() => { setAbierta(null); cargar(); }} />}
    </main>
  );
}

function ContestarIncidencia({ inc, alCerrar, alGuardar }: { inc: Incidencia; alCerrar: () => void; alGuardar: () => void }) {
  const [respuesta, setRespuesta] = useState(inc.respuesta ?? '');
  async function guardar(cerrar: boolean) {
    const { error } = await nucleo().from('incidencias')
      .update({ respuesta: respuesta.trim() || null, estado: cerrar ? 'cerrada' : 'en_curso', cerrado: cerrar ? new Date().toISOString() : null }).eq('id', inc.id);
    if (error) { aviso('No se ha podido guardar'); return; }
    aviso(cerrar ? 'Incidencia cerrada' : 'Guardada');
    alGuardar();
  }
  const ctx = inc.contexto ?? {};
  return (
    <Ventana titulo="Incidencia" alCerrar={alCerrar}
      pie={<><button type="button" className="boton sec" onClick={() => guardar(false)}>Guardar</button>
        <button type="button" className="boton" onClick={() => guardar(true)}>Cerrar incidencia</button></>}>
      <p><b>{inc.texto}</b></p>
      <p className="nota">{cuando(inc.creado)} · pantalla {inc.pantalla ?? '—'} · versión {inc.version ?? '?'}<br />
        {String(ctx.ancho ?? '?')}×{String(ctx.alto ?? '?')} · {ctx.conexion ? 'con conexión' : 'sin conexión'} · {ctx.instalada ? 'app instalada' : 'en el navegador'}</p>
      <label className="campo" style={{ marginTop: 12 }}><span>Qué se ha hecho</span>
        <textarea id="respuesta" rows={4} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} /></label>
    </Ventana>
  );
}
