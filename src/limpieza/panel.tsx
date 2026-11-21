// Tarjetas de Limpieza para el panel de Inicio (decidido por Cristian el 21/11): Limpieza de hoy (con la saturación de la semana
// para quien ve todo y las horas), o «Tus trabajos de hoy» para el operario; Incidencias; y Quién falta hoy (con quién le cubre).
// Cada una sale según los permisos de siempre y se lee de lo que ya hay (sin funciones nuevas).
import { useEffect, useState } from 'react';
import { nucleo, supabase } from '../nucleo/supabase';
import { useSesion } from '../nucleo/sesion';
import { Tarjeta } from '../componentes/Panel';
import { limp, type Trabajo } from './MiDia';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const MOTIVO: Record<string, string> = { baja: 'baja', vacaciones: 'vacaciones', permiso: 'permiso', otro: 'falta' };

export function TarjetasLimpieza({ ir }: { ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  if (!empresa?.modulos.includes('limpieza')) return null;
  const equipo = puede('limpieza.trabajo.ver');
  return (
    <>
      {equipo ? <LimpiezaHoy ir={ir} /> : puede('limpieza.trabajo.apuntar') ? <MisTrabajos ir={ir} /> : null}
      {puede('limpieza.incidencia.editar') && <Incidencias ir={ir} />}
      {puede('nucleo.persona.ver') && puede('limpieza.trabajo.repartir') && <QuienFalta ir={ir} />}
    </>
  );
}

function useHoy() {
  const { empresa } = useSesion();
  const [t, setT] = useState<Trabajo[] | null>(null);
  useEffect(() => { limp().rpc('mi_dia', { p_empresa: empresa!.id, p_fecha: hoy() }).then(({ data }) => setT((data ?? []) as Trabajo[])); }, [empresa]);
  return t;
}

function LimpiezaHoy({ ir }: { ir: (r: string) => void }) {
  const { empresa, puede } = useSesion();
  const t = useHoy();
  const [sat, setSat] = useState<number | null>(null);
  const conSat = puede('limpieza.informe.todo') && puede('personal.horas.editar') && !!empresa?.modulos.includes('personal');
  useEffect(() => {
    if (!conSat) return;
    // la saturación de la semana (lunes a hoy), con las mismas cuentas que «Investigar»
    const h = hoy(), d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const lunes = d.toLocaleDateString('sv-SE');
    Promise.all([import('./investigar'), limp().rpc('investigar', { p_empresa: empresa!.id, p_desde: lunes, p_hasta: h }),
      supabase.schema('personal').rpc('horas_dias', { p_empresa: empresa!.id, p_desde: lunes, p_hasta: h })])
      .then(([m, r, hd]) => {
        if (r.error || !r.data) return;
        const X = m.investigar(r.data, hd.error ? null : hd.data, lunes, h, h, m.AJUSTES_PARTIDA);
        setSat(X.tot.jor ? Math.round((X.tot.cont * 100) / X.tot.jor) : null);
      }).catch(() => undefined);
  }, [empresa, conSat]);
  if (!t) return <Tarjeta titulo="Limpieza de hoy" ir={ir} cargando />;
  const hechos = t.filter((x) => x.estado === 'hecho').length;
  const pend = t.length - hechos, sin = t.filter((x) => x.estado !== 'hecho' && !x.todo_equipo && !x.asignados.length).length;
  return (
    <Tarjeta titulo="Limpieza de hoy" ruta="/m/limpieza/hoy" ir={ir} cifra={hechos} unidad={`de ${t.length} hechos`}
      barra={t.length ? (hechos * 100) / t.length : 0} vacio="Hoy no hay trabajos."
      lineas={t.length ? [<><b>{pend}</b> pendientes{sin ? <> · <b className="naranja">{sin}</b> sin asignar</> : null}</>,
        ...(sat != null ? [<>Saturación de la semana <b>{sat} %</b></>] : [])] : []} />
  );
}

function MisTrabajos({ ir }: { ir: (r: string) => void }) {
  const t = useHoy();
  if (!t) return <Tarjeta titulo="Tus trabajos de hoy" ir={ir} cargando />;
  const hechos = t.filter((x) => x.estado === 'hecho').length, sig = t.find((x) => x.estado !== 'hecho');
  return (
    <Tarjeta titulo="Tus trabajos de hoy" ruta="/m/limpieza/dia" ir={ir} cifra={hechos} unidad={`de ${t.length} hechos`}
      barra={t.length ? (hechos * 100) / t.length : 0} vacio="Hoy no tienes trabajos."
      lineas={t.length ? [sig ? <>Lo siguiente: <b>{sig.titulo}</b></> : <>Todo hecho. ¡Bien!</>, <>Toca para ir a «Mi día»</>] : []} />
  );
}

function Incidencias({ ir }: { ir: (r: string) => void }) {
  const { empresa } = useSesion();
  const [d, setD] = useState<{ n: number; urg: number; rep: number; ultima: string | null } | null>(null);
  useEffect(() => {
    Promise.all([
      limp().from('incidencias').select('tema, texto, urgente, creado').eq('empresa_id', empresa!.id).in('estado', ['abierta', 'en_proceso']).order('creado', { ascending: false }),
      limp().rpc('problemas_lista', { p_empresa: empresa!.id, p_cerrados: false }),
    ]).then(([i, p]) => {
      const L = (i.data ?? []) as { tema: string | null; texto: string; urgente: boolean }[];
      const rep = ((p.data ?? []) as { estado: string }[]).filter((x) => x.estado === 'pendiente' || x.estado === 'en_marcha').length;
      setD({ n: L.length, urg: L.filter((x) => x.urgente).length, rep, ultima: L[0] ? (L[0].tema ? `${L[0].tema}: ${L[0].texto}` : L[0].texto) : null });
    });
  }, [empresa]);
  if (!d) return <Tarjeta titulo="Incidencias" ir={ir} cargando />;
  return (
    <Tarjeta titulo="Incidencias" ruta="/m/limpieza/incidencias" ir={ir} cifra={d.n} unidad={d.n === 1 ? 'abierta' : 'abiertas'} tono={d.urg ? 'mal' : undefined}
      lineas={[...(d.urg ? [<><b className="mal">{d.urg}</b> {d.urg === 1 ? 'urgente' : 'urgentes'}</>] : []),
        ...(d.rep ? [<><b>{d.rep}</b> {d.rep === 1 ? 'problema que se repite' : 'problemas que se repiten'}</>] : []),
        ...(d.ultima ? [<span className="tarjeta-corta">Última: {d.ultima}</span>] : [])]}
      vacio="No hay incidencias abiertas." />
  );
}

function QuienFalta({ ir }: { ir: (r: string) => void }) {
  const { empresa } = useSesion();
  const [d, setD] = useState<{ nombre: string; motivo: string; cubre: string | null }[] | null>(null);
  useEffect(() => {
    const h = hoy();
    Promise.all([
      nucleo().from('ausencias').select('persona_id, motivo').eq('empresa_id', empresa!.id).lte('desde', h).gte('hasta', h).neq('motivo', 'festivo'),
      nucleo().from('personas').select('id, nombre').eq('empresa_id', empresa!.id),
      limp().from('sustituciones').select('ausente, sustituto').eq('empresa_id', empresa!.id).lte('desde', h).gte('hasta', h),
    ]).then(([a, p, s]) => {
      const nom = new Map(((p.data ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
      const orden = ['baja', 'vacaciones', 'permiso', 'otro'], por = new Map<string, string>();
      ((a.data ?? []) as { persona_id: string; motivo: string }[]).forEach((x) => {
        const ya = por.get(x.persona_id); if (!ya || orden.indexOf(x.motivo) < orden.indexOf(ya)) por.set(x.persona_id, x.motivo);
      });
      const sus = (s.data ?? []) as { ausente: string; sustituto: string }[];
      setD([...por.entries()].map(([id, m]) => ({ nombre: nom.get(id) ?? 'Alguien', motivo: MOTIVO[m] ?? m, cubre: nom.get(sus.find((x) => x.ausente === id)?.sustituto ?? '') ?? null }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')));
    });
  }, [empresa]);
  if (!d) return <Tarjeta titulo="Quién falta hoy" ir={ir} cargando />;
  return (
    <Tarjeta titulo="Quién falta hoy" ruta="/m/limpieza/hoy" ir={ir} cifra={d.length} vacio="Hoy no falta nadie."
      lineas={d.slice(0, 5).map((x) => <>{x.nombre} · {x.motivo}{x.cubre ? <> · cubre {x.cubre}</> : null}</>).concat(d.length > 5 ? [<>y {d.length - 5} más</>] : [])} />
  );
}
