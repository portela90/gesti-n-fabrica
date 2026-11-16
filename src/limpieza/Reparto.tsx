// Limpieza · lo del reparto: faltas y sustitutos, quién entra en el reparto (y qué sabe hacer) y el plan de la semana.
import { useCallback, useEffect, useState } from 'react';
import { nucleo } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { aviso, Ventana } from '../componentes/basicos';
import { durTxt, hoy, limp, textoError } from './MiDia';
import { useListas, type Opcion } from './listas';

const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'numeric' });
const sumar = (f: string, dias: number) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + dias); return d.toLocaleDateString('sv-SE'); };
const lunesDe = (f: string) => { const d = new Date(f + 'T12:00'); return sumar(f, -((d.getDay() + 6) % 7)); };
const MOTIVO: Record<string, string> = { vacaciones: 'Vacaciones', baja: 'Baja', permiso: 'Permiso', otro: 'Falta', festivo: 'Festivo' };

// =====================================================================================
// Faltas y sustitutos
// =====================================================================================
interface Sustitucion { id: string; ausente: string; sustituto: string; desde: string; hasta: string; nota: string | null }
interface Ausencia { persona_id: string; desde: string; hasta: string; motivo: string }

export function Sustitutos({ personas, alCerrar }: { personas: Opcion[]; alCerrar: () => void }) {
  const { empresa } = useSesion();
  const [lista, setLista] = useState<Sustitucion[] | null>(null);
  const [faltan, setFaltan] = useState<Ausencia[]>([]);
  const [f, setF] = useState({ ausente: '', sustituto: '', desde: hoy(), hasta: hoy() });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? '—';
  const cargar = useCallback(async () => {
    const [s, a] = await Promise.all([
      limp().from('sustituciones').select('id, ausente, sustituto, desde, hasta, nota').eq('empresa_id', empresa!.id).gte('hasta', hoy()).order('desde'),
      nucleo().from('ausencias').select('persona_id, desde, hasta, motivo').eq('empresa_id', empresa!.id).neq('motivo', 'festivo').gte('hasta', hoy()).lte('desde', sumar(hoy(), 14)).order('desde'),
    ]);
    setLista((s.data ?? []) as Sustitucion[]);
    setFaltan((a.data ?? []) as Ausencia[]);
  }, [empresa]);
  useEffect(() => { cargar(); }, [cargar]);
  async function apuntar() {
    setError(null);
    if (!f.ausente || !f.sustituto) return setError('Elige quién falta y quién le cubre.');
    if (f.ausente === f.sustituto) return setError('No puede cubrirse a sí mismo.');
    if (f.hasta < f.desde) return setError('«Hasta» no puede ser antes de «desde».');
    setOcupado(true);
    const { error: e } = await limp().from('sustituciones').insert({ empresa_id: empresa!.id, ...f });
    setOcupado(false);
    if (e) return setError(textoError(e.message));
    aviso('Apuntado'); setF({ ausente: '', sustituto: '', desde: hoy(), hasta: hoy() }); cargar();
  }
  async function quitar(id: string) {
    const { error: e } = await limp().from('sustituciones').delete().eq('id', id);
    if (e) return aviso(textoError(e.message));
    cargar();
  }
  const vivas = personas.filter((p) => !p.baja);
  return (
    <Ventana titulo="Faltas y sustitutos" alCerrar={alCerrar}>
      <h3 className="subtitulo" style={{ marginTop: 0 }}>Quién falta (próximas 2 semanas)</h3>
      {!faltan.length ? <p className="nota">Nadie. Las faltas y vacaciones se apuntan en Personal.</p> : (
        <div className="lista compacta">{faltan.map((a, i) => (
          <div key={i} className="fila"><span className="fila-txt"><b>{nombre(a.persona_id)}</b>
            <small>{MOTIVO[a.motivo] ?? a.motivo} · {a.desde === a.hasta ? fechaCorta(a.desde) : `${fechaCorta(a.desde)} a ${fechaCorta(a.hasta)}`}</small></span></div>))}
        </div>)}
      <h3 className="subtitulo">Quién cubre a quién</h3>
      {lista === null ? <p className="nota">Cargando…</p> : !lista.length ? <p className="nota">No hay ningún sustituto apuntado.</p> : (
        <div className="lista compacta">{lista.map((s) => (
          <div key={s.id} className="fila"><span className="fila-txt"><b>{nombre(s.sustituto)} cubre a {nombre(s.ausente)}</b>
            <small>{s.desde === s.hasta ? fechaCorta(s.desde) : `${fechaCorta(s.desde)} a ${fechaCorta(s.hasta)}`}</small></span>
            <button type="button" className="boton sec peq" onClick={() => quitar(s.id)}>Quitar</button></div>))}
        </div>)}
      <p className="nota">El sustituto se lleva los trabajos del que falta solo los días que falta de verdad (según Personal).</p>
      <div className="dos-col">
        <label className="campo"><span>Falta</span>
          <select value={f.ausente} onChange={(e) => setF({ ...f, ausente: e.target.value })}><option value="">Elige…</option>
            {vivas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label className="campo"><span>Le cubre</span>
          <select value={f.sustituto} onChange={(e) => setF({ ...f, sustituto: e.target.value })}><option value="">Elige…</option>
            {vivas.filter((p) => p.id !== f.ausente).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label className="campo"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value, hasta: e.target.value > f.hasta ? e.target.value : f.hasta })} /></label>
        <label className="campo"><span>Hasta</span><input type="date" value={f.hasta} min={f.desde} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      <div className="acciones-cal"><button type="button" className="boton" disabled={ocupado} onClick={apuntar}>Apuntar sustituto</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </Ventana>
  );
}

// =====================================================================================
// Personas: quién entra en el reparto automático y qué grupos sabe hacer
// =====================================================================================
interface EnReparto { persona_id: string; en_reparto: boolean; grupos: string[] }

export function PersonasReparto() {
  const { empresa, puede } = useSesion();
  const edita = puede('limpieza.plan.editar');
  const { personas } = useListas();
  const [filas, setFilas] = useState<Record<string, EnReparto> | null>(null);
  const [gruposTareas, setGruposTareas] = useState<string[]>([]);
  const [resp, setResp] = useState<Record<string, string[]>>({});
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  useEffect(() => {
    limp().from('responsables').select('persona_id, operarios').eq('empresa_id', empresa!.id).then(({ data }) =>
      setResp(Object.fromEntries(((data ?? []) as { persona_id: string; operarios: string[] }[]).map((r) => [r.persona_id, r.operarios]))));
    limp().from('personas').select('persona_id, en_reparto, grupos').eq('empresa_id', empresa!.id).then(({ data }) =>
      setFilas(Object.fromEntries(((data ?? []) as EnReparto[]).map((r) => [r.persona_id, r]))));
    limp().from('tareas').select('grupo').eq('empresa_id', empresa!.id).is('baja', null).not('grupo', 'is', null).then(({ data }) =>
      setGruposTareas([...new Set(((data ?? []) as { grupo: string }[]).map((x) => x.grupo))].sort((a, b) => a.localeCompare(b, 'es'))));
  }, [empresa]);
  async function guardar(id: string, c: Partial<EnReparto>) {
    const antes = filas?.[id];
    const r = { persona_id: id, en_reparto: antes?.en_reparto ?? false, grupos: antes?.grupos ?? [], ...c };
    setFilas((f) => ({ ...f, [id]: r }));
    const { error } = await limp().from('personas').upsert({ ...r, empresa_id: empresa!.id }, { onConflict: 'persona_id' });
    if (error) { aviso(textoError(error.message)); setFilas((f) => ({ ...f, [id]: antes ?? { persona_id: id, en_reparto: false, grupos: [] } })); }
  }
  const vivas = personas.filter((p) => !p.baja);
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? '—';
  async function guardarResp(id: string, ops: string[]) {
    const { error } = ops.length
      ? await limp().from('responsables').upsert({ persona_id: id, empresa_id: empresa!.id, operarios: ops }, { onConflict: 'persona_id' })
      : await limp().from('responsables').delete().eq('persona_id', id);
    if (error) return aviso(textoError(error.message));
    setResp((r) => { const n = { ...r }; if (ops.length) n[id] = ops; else delete n[id]; return n; });
    setEligiendo(null); aviso('Guardado');
  }
  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>
        Cada mañana, lo que sale sin asignar se reparte solo entre los que <b>entran en el reparto</b>, tienen horario ese día y no faltan,
        a partes iguales por minutos. Si a alguien le pones un grupo (por ejemplo «hornos»), los trabajos de ese grupo solo van a quien lo tenga.
      </p>
      {filas === null ? <p className="nota">Cargando…</p> : !vivas.length ? <div className="vacio"><p>No hay trabajadores de alta.</p></div> : (
        <div className="lista">{vivas.map((p) => {
          const r = filas[p.id];
          return (
            <div key={p.id} className="fila fila-reparto">
              <span className="fila-txt"><b>{p.nombre}</b>
                <label className="check"><input type="checkbox" disabled={!edita} checked={!!r?.en_reparto} onChange={(e) => guardar(p.id, { en_reparto: e.target.checked })} />Entra en el reparto</label>
                <label className="campo"><span>Sabe hacer (grupos)</span>
                  <input aria-label={`Grupos de ${p.nombre}`} disabled={!edita} list="grupos-limpieza" defaultValue={(r?.grupos ?? []).join(', ')} placeholder="hornos"
                    onBlur={(e) => {
                      const g = [...new Set(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))];
                      if (g.join(',') !== (r?.grupos ?? []).join(',')) guardar(p.id, { grupos: g });
                    }} /></label>
                <small>{resp[p.id] ? `Reparte solo a: ${resp[p.id].map(nombre).join(', ')}` : ''}</small>
                {edita && <button type="button" className="boton sec peq" onClick={() => setEligiendo(p.id)}>{resp[p.id] ? 'Cambiar a quién reparte' : 'Es responsable de un equipo'}</button>}
              </span>
            </div>);
        })}</div>)}
      {eligiendo && <ElegirEquipo nombre={nombre(eligiendo)} personas={vivas.filter((p) => p.id !== eligiendo)} elegidos={resp[eligiendo] ?? []}
        alCerrar={() => setEligiendo(null)} alGuardar={(ops) => guardarResp(eligiendo, ops)} />}
      <datalist id="grupos-limpieza">{gruposTareas.map((g) => <option key={g} value={g} />)}</datalist>
    </>
  );
}

function ElegirEquipo({ nombre, personas, elegidos, alCerrar, alGuardar }: { nombre: string; personas: Opcion[]; elegidos: string[]; alCerrar: () => void; alGuardar: (ops: string[]) => void }) {
  const [sel, setSel] = useState(elegidos);
  return (
    <Ventana titulo={`Equipo de ${nombre}`} alCerrar={alCerrar} pie={<button type="button" className="boton" onClick={() => alGuardar(sel)}>Guardar</button>}>
      <p className="nota" style={{ marginTop: 0 }}>Solo verá y repartirá los trabajos de estas personas (y los sin asignar de los grupos que saben hacer). Sin nadie marcado, deja de ser responsable de un equipo.</p>
      <div className="lista compacta">{personas.map((p) => (
        <label key={p.id} className="fila check">
          <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
          <span className="fila-txt">{p.nombre}</span></label>))}</div>
    </Ventana>
  );
}

// =====================================================================================
// Plan de la semana
// =====================================================================================
interface DiaSemana {
  fecha: string;
  trabajos: { id: string | null; titulo: string; minutos_est: number | null; estado: string; previsto: boolean; todo_equipo: boolean; equipo: string | null; aviso: string | null; nombres: string[] }[];
  personas: { persona_id: string; nombre: string; horario_min: number; ausencia: string | null; trabajo_min: number }[];
}

export function Semana() {
  const { empresa } = useSesion();
  const [lunes, setLunes] = useState(lunesDe(hoy()));
  const [dias, setDias] = useState<DiaSemana[] | null>(null);
  useEffect(() => {
    setDias(null);
    limp().rpc('semana', { p_empresa: empresa!.id, p_lunes: lunes }).then(({ data, error }) => {
      if (error) { aviso(textoError(error.message)); setDias([]); return; }
      setDias((data ?? []) as DiaSemana[]);
    });
  }, [empresa, lunes]);
  return (
    <>
      <div className="filtros semana-nav">
        <button type="button" className="boton sec boton-flecha" aria-label="Semana anterior" onClick={() => setLunes(sumar(lunes, -7))}>‹</button>
        <label className="campo"><span>Semana del</span><input type="date" value={lunes} onChange={(e) => e.target.value && setLunes(lunesDe(e.target.value))} /></label>
        <button type="button" className="boton sec boton-flecha" aria-label="Semana siguiente" onClick={() => setLunes(sumar(lunes, 7))}>›</button>
        {lunes !== lunesDe(hoy()) && <button type="button" className="boton sec boton-volver" onClick={() => setLunes(lunesDe(hoy()))}>Esta semana</button>}
      </div>
      <p className="nota" style={{ marginTop: 0 }}>Los días que aún no han llegado salen con lo previsto por las tareas fijas. Junto a cada persona: minutos de trabajo frente a los de su horario.</p>
      {dias === null ? <p className="nota">Cargando…</p> : dias.map((d) => {
        const gente = d.personas.filter((p) => p.horario_min > 0 || p.trabajo_min > 0 || p.ausencia);
        return (
          <section key={d.fecha} className={'dia-semana' + (d.fecha === hoy() ? ' es-hoy' : '')}>
            <h2 className="subtitulo">{fechaCorta(d.fecha)}</h2>
            {gente.length > 0 && <div className="gente-dia">{gente.map((p) => (
              <span key={p.persona_id} className={'chapa ' + (p.ausencia ? 'sin' : p.trabajo_min > p.horario_min ? 'sin-cuadrar' : 'firmado')}>
                {p.nombre}: {p.ausencia ? MOTIVO[p.ausencia] ?? p.ausencia : `${durTxt(p.trabajo_min) || '0 min'} de ${durTxt(p.horario_min) || '0 min'}`}
              </span>))}</div>}
            {!d.trabajos.length ? <p className="nota">Sin trabajos.</p> : (
              <div className="lista compacta">{d.trabajos.map((t, i) => (
                <div key={(t.id ?? 'p') + i} className={'fila' + (t.estado === 'hecho' ? ' de-baja' : '')}>
                  <span className="fila-txt"><b>{t.titulo}</b>
                    <small>{[t.todo_equipo ? `Todo el equipo ${t.equipo ?? ''}`.trim() : t.nombres.length ? t.nombres.join(', ') : 'Sin asignar',
                      t.minutos_est ? durTxt(t.minutos_est) : '', t.previsto ? 'previsto' : ''].filter(Boolean).join(' · ')}</small>
                    {t.aviso && t.estado !== 'hecho' && <small className="aviso-reparto">{t.aviso}</small>}</span>
                  {t.estado === 'hecho' && <span className="chapa firmado">Hecho</span>}
                </div>))}</div>)}
          </section>);
      })}
    </>
  );
}
