// Lo que Personal aporta a «Pendientes de firmar» del panel de Inicio: quien ve las firmas, los calendarios sin firmar de este
// año; cada trabajador, el suyo. Las mismas cuentas que la pestaña Firmas y «Mi calendario».
import type { LineaPendiente } from '../componentes/Panel';
import { personal } from './calendario';

export async function pendientesPersonal(empresa: string, puede: (p: string) => boolean, persona: string | null): Promise<LineaPendiente[]> {
  if (puede('personal.firma.ver')) {
    const { data } = await personal().from('v_envios').select('id').eq('empresa_id', empresa).eq('anio', new Date().getFullYear()).eq('estado', 'pendiente');
    const n = (data ?? []).length;
    return n ? [{ n, texto: n === 1 ? 'calendario sin firmar' : 'calendarios sin firmar', ruta: '/m/personal/firmas' }] : [];
  }
  if (!persona) return [];
  const { data } = await personal().from('v_envios').select('id').eq('empresa_id', empresa).eq('persona_id', persona).eq('estado', 'pendiente');
  const n = (data ?? []).length;
  return n ? [{ n, texto: n === 1 ? 'calendario tuyo por firmar' : 'calendarios tuyos por firmar', ruta: '/m/personal/mio' }] : [];
}
