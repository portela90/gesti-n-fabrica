// Lo que Prevención aporta a «Pendientes de firmar» del panel de Inicio. Quien gestiona: firmas de charlas que faltan (sesiones
// enviadas y sin cerrar), documentos enviados sin firmar y cursos caducados o que caducan en 60 días. Cada trabajador: sus charlas y
// documentos por firmar. Las mismas cuentas que Charlas, Documentos, Fichas y «Mis charlas».
import type { LineaPendiente } from '../componentes/Panel';
import { prev } from './comun';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const en60 = () => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toLocaleDateString('sv-SE'); };

export async function pendientesPrevencion(empresa: string, puede: (p: string) => boolean, persona: string | null): Promise<LineaPendiente[]> {
  const L: LineaPendiente[] = [];
  const gestiona = puede('prevencion.charla.ver') || puede('prevencion.documento.ver') || puede('prevencion.ficha.ver');
  if (gestiona) {
    const [s, a, d, c] = await Promise.all([
      puede('prevencion.charla.ver') && puede('prevencion.firma.ver')
        ? prev().from('sesiones').select('id, previstos').eq('empresa_id', empresa).not('enviada_en', 'is', null).is('cerrada_en', null) : Promise.resolve({ data: [] }),
      puede('prevencion.firma.ver') ? prev().from('asistencias').select('sesion_id, persona_id').eq('empresa_id', empresa).is('anulada', null) : Promise.resolve({ data: [] }),
      puede('prevencion.documento.ver')
        ? prev().from('documentos').select('id').eq('empresa_id', empresa).not('enviado_en', 'is', null).is('firmado_en', null).is('anulado', null) : Promise.resolve({ data: [] }),
      puede('prevencion.ficha.ver') ? prev().from('cursos').select('caduca').eq('empresa_id', empresa).lte('caduca', en60()) : Promise.resolve({ data: [] }),
    ]);
    const asis = (a.data ?? []) as { sesion_id: string; persona_id: string }[];
    const faltan = ((s.data ?? []) as { id: string; previstos: string[] }[])
      .reduce((n, x) => n + x.previstos.filter((p) => !asis.some((y) => y.sesion_id === x.id && y.persona_id === p)).length, 0);
    if (faltan) L.push({ n: faltan, texto: faltan === 1 ? 'firma de charla pendiente' : 'firmas de charlas pendientes', ruta: '/m/prevencion/charlas' });
    const docs = (d.data ?? []).length;
    if (docs) L.push({ n: docs, texto: docs === 1 ? 'documento sin firmar' : 'documentos sin firmar', ruta: '/m/prevencion/documentos' });
    const cs = (c.data ?? []) as { caduca: string | null }[], h = hoy();
    const cad = cs.filter((x) => x.caduca && x.caduca < h).length, pronto = cs.filter((x) => x.caduca && x.caduca >= h).length;
    if (cad) L.push({ n: cad, texto: cad === 1 ? 'curso caducado' : 'cursos caducados', ruta: '/m/prevencion/fichas', aviso: true });
    if (pronto) L.push({ n: pronto, texto: pronto === 1 ? 'curso caduca pronto' : 'cursos caducan pronto', ruta: '/m/prevencion/fichas', aviso: true });
    return L;
  }
  if (!persona) return L;
  const [s, a, d] = await Promise.all([
    prev().from('sesiones').select('id').eq('empresa_id', empresa).contains('previstos', [persona]).not('enviada_en', 'is', null).is('cerrada_en', null),
    prev().from('asistencias').select('sesion_id').eq('persona_id', persona).is('anulada', null),
    prev().from('documentos').select('id').eq('empresa_id', empresa).eq('persona_id', persona).not('enviado_en', 'is', null).is('firmado_en', null).is('anulado', null),
  ]);
  const firmadas = new Set(((a.data ?? []) as { sesion_id: string }[]).map((x) => x.sesion_id));
  const ch = ((s.data ?? []) as { id: string }[]).filter((x) => !firmadas.has(x.id)).length;
  if (ch) L.push({ n: ch, texto: ch === 1 ? 'charla por leer y firmar' : 'charlas por leer y firmar', ruta: '/m/prevencion/mias' });
  const docs = (d.data ?? []).length;
  if (docs) L.push({ n: docs, texto: docs === 1 ? 'documento por firmar' : 'documentos por firmar', ruta: '/m/prevencion/mias' });
  return L;
}
