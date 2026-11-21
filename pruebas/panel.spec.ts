// Panel de Inicio (aspecto nuevo): las tarjetas de cada uno según sus permisos. Personas inventadas.
import { test, expect } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = '78787878-0000-0000-0000-000000000001';
const ANA = '78787878-0000-0000-0000-0000000000f1', BEA = '78787878-0000-0000-0000-0000000000f2', LUIS = '78787878-0000-0000-0000-0000000000f3';
const S1 = '78787878-0000-0000-0000-0000000000s1'.replace('s1', 'a1');
const dia = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const HOY = dia(0), ANIO = new Date().getFullYear();
const sesion = (permisos: string[]) => ({ usuario: { id: USUARIO.id, nombre: 'Jefa Prueba', superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-p', nombre: 'Unidad P', modulos: ['limpieza', 'personal', 'prevencion'], permisos }] });
const JEFA = ['nucleo.persona.ver', 'limpieza.modulo.ver', 'limpieza.trabajo.ver', 'limpieza.trabajo.repartir', 'limpieza.incidencia.editar', 'limpieza.informe.ver',
  'limpieza.informe.todo', 'personal.modulo.ver', 'personal.horas.editar', 'personal.firma.ver', 'prevencion.modulo.ver', 'prevencion.charla.ver', 'prevencion.firma.ver',
  'prevencion.documento.ver', 'prevencion.ficha.ver'];
const OPERARIO = ['limpieza.modulo.ver', 'limpieza.trabajo.apuntar', 'personal.modulo.ver', 'personal.tarea.ver', 'prevencion.modulo.ver'];
const t = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({ id, fecha: HOY, clase: 'fija', titulo, estado: 'pendiente', asignados: [ANA], todo_equipo: false,
  minutos_est: 20, minutos: null, nota: null, problema: null, fotos: [], ...extra });

test('el panel de quien lo ve todo: limpieza de hoy, incidencias, quién falta y pendientes de firmar', async ({ page }) => {
  const errores = vigilar(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await simular(page, { dentro: true, sesion: sesion(JEFA),
    rpc: {
      mi_dia: () => [t('t1', 'Barrer', { estado: 'hecho', minutos: 30 }), t('t2', 'Fregar', { estado: 'hecho', minutos: 20 }), t('t3', 'Basuras'), t('t4', 'Derrame', { asignados: [] })],
      problemas_lista: () => [
        { id: 'p1', tema: 'Aceite', lugar: 'F19', lugar_clave: 'F19', estado: 'pendiente', primera: dia(-6), ultima: dia(-1), reabierto: 0,
          casos: [{ caso: 'c1', fecha: dia(-6), titulo: 'Fuga de aceite', quien: 'Ana Prueba' }, { caso: 'c2', fecha: dia(-1), titulo: 'Fuga de aceite', quien: 'Bea Prueba' }], notas: [] },
        { id: 'p2', tema: 'Agua', lugar: 'Pasillo', lugar_clave: 'PASILLO', estado: 'solucionado', primera: dia(-20), ultima: dia(-15), reabierto: 0, casos: [], notas: [] }],
      investigar: () => ({ alcance: 'todo', unidad: 'Unidad P', personas: [], problemas: [], tareas: [], detalles: [], temas: [], naves: [], maquinas: [],
        horarios: [{ id: ANA, nombre: 'Ana Prueba', equipo_id: null, jornada: 'completa', horas_dow: [7, 7, 7, 7, 7, 7, 7] }],
        trabajos: [{ id: 'x1', fecha: HOY, clase: 'fija', tarea_id: null, titulo: 'Barrer', descripcion: null, lugar: null, maquina: null, minutos_est: null, minutos: 210, tiempo_auto: false,
          estado: 'hecho', inicio: `${HOY}T08:00:00Z`, fin: `${HOY}T11:30:00Z`, pausado_min: 0, hecho_por: ANA, hecho_por_nombre: 'Ana Prueba', asignados: [ANA], asignados_nombres: ['Ana Prueba'],
          asignados_orig_nombres: [], aviso_reparto: null, todo_equipo: false, equipo: null, turno: null, urgente: false, origen: null, problema: null, nota: null,
          checklist_puntos: 0, checklist_mal: 0, fotos: 0, creado_por_nombre: null }] }),
    },
    tablas: {
      usuarios: [{ id: USUARIO.id, nombre: 'Jefa Prueba', persona_id: null }],
      personas: [{ id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba' }, { id: BEA, empresa_id: UNIDAD, nombre: 'Bea Prueba' }, { id: LUIS, empresa_id: UNIDAD, nombre: 'Luis Prueba' }],
      'limpieza.incidencias': [
        { id: 'i1', empresa_id: UNIDAD, tema: 'Aceite', texto: 'Fuga en F19', urgente: true, estado: 'abierta', creado: `${HOY}T09:00:00Z` },
        { id: 'i2', empresa_id: UNIDAD, tema: null, texto: 'Bombilla fundida', urgente: false, estado: 'en_proceso', creado: `${dia(-2)}T09:00:00Z` },
        { id: 'i3', empresa_id: UNIDAD, tema: null, texto: 'Ya está', urgente: false, estado: 'resuelta', creado: `${dia(-3)}T09:00:00Z` }],
      ausencias: [{ empresa_id: UNIDAD, persona_id: ANA, desde: dia(-1), hasta: dia(1), motivo: 'baja' }, { empresa_id: UNIDAD, persona_id: LUIS, desde: HOY, hasta: dia(5), motivo: 'vacaciones' },
        { empresa_id: UNIDAD, persona_id: BEA, desde: HOY, hasta: HOY, motivo: 'festivo' }, { empresa_id: UNIDAD, persona_id: BEA, desde: dia(3), hasta: dia(4), motivo: 'permiso' }],
      'limpieza.sustituciones': [{ empresa_id: UNIDAD, ausente: ANA, sustituto: BEA, desde: dia(-1), hasta: dia(1) }],
      v_envios: [{ empresa_id: UNIDAD, anio: ANIO, estado: 'pendiente' }, { empresa_id: UNIDAD, anio: ANIO, estado: 'pendiente' }, { empresa_id: UNIDAD, anio: ANIO, estado: 'firmado' }],
      sesiones: [{ id: S1, empresa_id: UNIDAD, previstos: [ANA, BEA, LUIS], enviada_en: `${dia(-5)}T09:00:00Z`, cerrada_en: null }],
      asistencias: [{ empresa_id: UNIDAD, sesion_id: S1, persona_id: ANA, anulada: null }],
      documentos: [{ id: 'd1', empresa_id: UNIDAD, persona_id: BEA, enviado_en: `${dia(-1)}T09:00:00Z`, firmado_en: null, anulado: null },
        { id: 'd2', empresa_id: UNIDAD, persona_id: BEA, enviado_en: `${dia(-9)}T09:00:00Z`, firmado_en: `${dia(-8)}T09:00:00Z`, anulado: null }],
      cursos: [{ empresa_id: UNIDAD, caduca: dia(-10) }, { empresa_id: UNIDAD, caduca: dia(20) }, { empresa_id: UNIDAD, caduca: dia(200) }],
    } });
  await page.goto('./#/');
  const panel = page.getByRole('region', { name: 'Panel' });
  const hoyT = panel.getByRole('button', { name: 'Limpieza de hoy' });
  await expect(hoyT.locator('.tarjeta-num')).toHaveText('2 de 4 hechos');
  await expect(hoyT.locator('.tarjeta-lineas li')).toHaveText(['2 pendientes · 1 sin asignar', /^Saturación de la semana \d+ %$/]);
  const inc = panel.getByRole('button', { name: 'Incidencias' });
  await expect(inc.locator('.tarjeta-num')).toHaveText('2 abiertas');
  await expect(inc.locator('.tarjeta-lineas li')).toHaveText(['1 urgente', '1 problema que se repite', 'Última: Aceite: Fuga en F19']);
  const falta = panel.getByRole('button', { name: 'Quién falta hoy' });
  await expect(falta.locator('.tarjeta-num')).toHaveText('2');
  await expect(falta.locator('.tarjeta-lineas li')).toHaveText(['Ana Prueba · baja · cubre Bea Prueba', 'Luis Prueba · vacaciones']);
  const firm = panel.getByRole('button', { name: 'Pendientes de firmar' });
  await expect(firm.locator('.tarjeta-num')).toHaveText('5');
  await expect(firm.locator('.tarjeta-lineas li')).toHaveText(['2 calendarios sin firmar', '2 firmas de charlas pendientes', '1 documento sin firmar', '1 curso caducado', '1 curso caduca pronto']);
  await expect(panel.locator('.aviso')).toHaveCount(0);   // nada del panel puede usar la clase de los mensajes flotantes
  await inc.click();
  await expect(page).toHaveURL(/#\/m\/limpieza\/incidencias$/);
  expect(errores).toEqual([]);
});

test('el panel del operario: sus trabajos de hoy y lo suyo por firmar, nada del equipo', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(OPERARIO),
    rpc: { mi_dia: () => [t('t1', 'Barrer', { estado: 'hecho', minutos: 30 }), t('t2', 'Vaciar papeleras')] },
    tablas: {
      usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', persona_id: ANA }],
      v_envios: [{ empresa_id: UNIDAD, persona_id: ANA, anio: ANIO, estado: 'pendiente' }, { empresa_id: UNIDAD, persona_id: BEA, anio: ANIO, estado: 'pendiente' }],
      sesiones: [{ id: S1, empresa_id: UNIDAD, previstos: [ANA, BEA], enviada_en: `${dia(-5)}T09:00:00Z`, cerrada_en: null }],
      asistencias: [],
      documentos: [{ id: 'd1', empresa_id: UNIDAD, persona_id: ANA, enviado_en: `${dia(-1)}T09:00:00Z`, firmado_en: null, anulado: null }],
    } });
  await page.goto('./#/');
  const panel = page.getByRole('region', { name: 'Panel' });
  await expect(panel.locator('.tarjeta-tit')).toHaveText(['Tus trabajos de hoy', 'Pendientes de firmar']);
  const mios = panel.getByRole('button', { name: 'Tus trabajos de hoy' });
  await expect(mios.locator('.tarjeta-num')).toHaveText('1 de 2 hechos');
  await expect(mios.locator('.tarjeta-lineas li').first()).toHaveText('Lo siguiente: Vaciar papeleras');
  const firm = panel.getByRole('button', { name: 'Pendientes de firmar' });
  await expect(firm.locator('.tarjeta-lineas li')).toHaveText(['1 calendario tuyo por firmar', '1 charla por leer y firmar', '1 documento por firmar']);
  await mios.click();
  await expect(page).toHaveURL(/#\/m\/limpieza\/dia$/);
  expect(errores).toEqual([]);
});

test('el panel a 320 px: nada se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await simular(page, { dentro: true, sesion: sesion(JEFA), rpc: { mi_dia: () => [t('t1', 'Barrer con un nombre de trabajo bastante largo para ver si cabe')], problemas_lista: () => [] },
    tablas: { 'limpieza.incidencias': [{ id: 'i1', empresa_id: UNIDAD, tema: 'Aceite', texto: 'Una fuga muy larga que no debería salirse de la tarjeta en un móvil estrecho', urgente: false, estado: 'abierta', creado: HOY }],
      ausencias: [], v_envios: [], sesiones: [], asistencias: [], documentos: [], cursos: [] } });
  await page.goto('./#/');
  await expect(page.getByRole('region', { name: 'Panel' }).locator('.tarjeta-panel')).toHaveCount(4);
  await expect(page.getByText('No hay nada pendiente de firmar.')).toBeVisible();
  expect(await desbordes(page)).toEqual([]);
});
