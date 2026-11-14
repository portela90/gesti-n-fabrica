// Prevención: charlas del mes (escribir, preparar la sesión, enviar, firmas, recoger una firma), mis charlas y fichas.
// Unidades y personas inventadas.
import { test, expect, type Page } from '@playwright/test';
import { simular, desbordes, vigilar, USUARIO } from './simulador';

const UNIDAD = 'dddddddd-0000-0000-0000-000000000001';
const ANA = 'dddddddd-0000-0000-0000-0000000000f1';
const BRUNO = 'dddddddd-0000-0000-0000-0000000000f2';
const CARLA = 'dddddddd-0000-0000-0000-0000000000f3';
const ANIO = new Date().getFullYear();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const JEFE = ['nucleo.persona.ver', 'nucleo.configuracion.editar', 'prevencion.charla.editar', 'prevencion.charla.ver', 'prevencion.ficha.editar',
  'prevencion.ficha.ver', 'prevencion.firma.anular', 'prevencion.firma.recoger', 'prevencion.firma.ver', 'prevencion.modulo.ver', 'prevencion.tarea.ver'];
const ENCARGADO = ['nucleo.persona.ver', 'prevencion.charla.ver', 'prevencion.firma.recoger', 'prevencion.firma.ver', 'prevencion.modulo.ver', 'prevencion.tarea.ver'];
const sesion = (permisos: string[], nombre = 'Jefa Prueba') => ({
  usuario: { id: USUARIO.id, nombre, superadmin: false, empresa_actual: null },
  empresas: [{ id: UNIDAD, codigo: 'unidad-d', nombre: 'Unidad D', modulos: ['prevencion'], permisos }],
});

const charla = (mes: number) => ({
  id: 'ch-' + mes, empresa_id: UNIDAD, anio: ANIO, mes, codigo: 'COD-31', compromiso: 'Si veo algo inseguro, lo digo',
  cuerpo: 'Texto de la charla.', puntos: ['¿Qué harías si ves un cable pelado?'], tema: 'Riesgo eléctrico', tema_intro: null,
  tema_puntos: ['No toques cables pelados', 'Avisa al encargado'], imagen: null,
});
const sesionMes = (mes: number, extra = {}) => ({
  id: 'se-' + mes, empresa_id: UNIDAD, charla_id: 'ch-' + mes, denominacion: `Toolbox Talk HSE Marzo ${String(ANIO).slice(2)}`, fecha: `${ANIO}-03-05`,
  centro: 'Planta D', duracion: 15, formador: 'Jefa Prueba', observaciones: null, previstos: [ANA, BRUNO], enviada_en: `${ANIO}-03-05T08:00:00Z`, cerrada_en: null, ...extra,
});
const tablas = () => ({
  personas: [
    { id: ANA, empresa_id: UNIDAD, nombre: 'Ana Prueba', categoria: 'Peón', baja: null },
    { id: BRUNO, empresa_id: UNIDAD, nombre: 'Bruno Prueba', categoria: 'Peón', baja: null },
    { id: CARLA, empresa_id: UNIDAD, nombre: 'Carla Antigua', categoria: 'Peón', baja: '2026-01-01T00:00:00Z' },
  ],
  usuarios: [{ id: USUARIO.id, nombre: 'Ana Prueba', persona_id: ANA }],
  ajustes: [{ id: 'aj1', empresa_id: UNIDAD, centro_id: null, modulo: 'prevencion', clave: 'formador', valor: 'Jefa Prueba' },
    { id: 'aj2', empresa_id: UNIDAD, centro_id: null, modulo: 'prevencion', clave: 'correo_prl', valor: 'tecnico@ejemplo.com' }],
  charlas: [charla(3)],
  sesiones: [sesionMes(3)],
  asistencias: [{ id: 'as1', empresa_id: UNIDAD, sesion_id: 'se-3', persona_id: ANA, nombre: 'Ana Prueba', puesto: 'Peón', firma_id: 'fi1', anulada: null, creado: `${ANIO}-03-05T09:00:00Z` }],
  firmas: [{ id: 'fi1', imagen: PNG, firmado_en: `${ANIO}-03-05T09:00:00Z` }],
  fichas: [{ persona_id: ANA, empresa_id: UNIDAD, dni: '00000000T', puesto: 'Limpieza', fecha_alta: `${ANIO}-01-10`, fecha_baja: null, motivo_baja: null,
    telefono: null, emerg_nombre: null, emerg_tel: null, idioma: null, tallas: { pantalon: 'L' } }],
  prendas: [{ id: 'pr1', empresa_id: UNIDAD, codigo: 'pantalon', nombre: 'Pantalón', orden: 1, baja: null }, { id: 'pr2', empresa_id: UNIDAD, codigo: 'bota', nombre: 'Botas', orden: 2, baja: null }],
});
const rpc = {
  enviar_charla: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const s = t.sesiones.find((x) => x.id === b.p_sesion)!; s.enviada_en ??= new Date().toISOString();
    return (s.previstos as string[]).filter((p) => !t.asistencias.some((a) => a.sesion_id === s.id && a.persona_id === p)).length;
  },
  firmar_charla: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    if (!String(b.p_imagen).startsWith('data:image/png;base64,')) throw new Error('FIRMA_MAL');
    t.firmas.push({ id: 'fi-n', imagen: b.p_imagen });
    t.asistencias.push({ id: 'as-n', empresa_id: UNIDAD, sesion_id: b.p_sesion, persona_id: b.p_persona, nombre: b.p_persona === BRUNO ? 'Bruno Prueba' : 'Ana Prueba',
      puesto: b.p_puesto ?? 'Peón', firma_id: 'fi-n', anulada: null, creado: new Date().toISOString() });
    return 'as-n';
  },
  cerrar_sesion: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => { t.sesiones.find((x) => x.id === b.p_sesion)!.cerrada_en = b.p_cerrar ? new Date().toISOString() : null; return null; },
  apuntar_envio: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    Object.assign(t.sesiones.find((x) => x.id === b.p_sesion)!, { prev_enviado_en: new Date().toISOString(), prev_destino: b.p_destino }); return null; },
};

async function firmarConElDedo(page: Page) {
  await page.locator('.firma canvas').scrollIntoViewIfNeeded();
  const caja = (await page.locator('.firma canvas').boundingBox())!;
  await page.mouse.move(caja.x + 30, caja.y + 120); await page.mouse.down();
  await page.mouse.move(caja.x + 90, caja.y + 50, { steps: 6 }); await page.mouse.move(caja.x + 160, caja.y + 130, { steps: 6 }); await page.mouse.up();
}

test('el jefe escribe la charla de un mes nuevo, prepara la sesión y la envía', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion');
  await expect(page.getByRole('button', { name: 'Charlas', pressed: true })).toBeVisible();
  await expect(page.locator('.fila', { hasText: 'Marzo' })).toContainText('1 de 2 firmas');
  await page.locator('.fila', { hasText: 'Abril' }).click();
  await page.getByRole('button', { name: 'Escribir también el texto de la charla' }).click();
  await page.getByLabel('Compromiso del mes').fill('Pido ayuda si no sé hacerlo');
  await page.getByLabel('Preguntas para hablar (una por línea)').fill('¿A quién pides ayuda?\n¿Por qué cuesta?');
  await page.getByLabel('Tema HSE del mes').fill('Caídas al mismo nivel');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Charla guardada')).toBeVisible();
  expect(sim.tablas.charlas.find((c) => c.mes === 4)).toMatchObject({ empresa_id: UNIDAD, anio: ANIO, compromiso: 'Pido ayuda si no sé hacerlo',
    puntos: ['¿A quién pides ayuda?', '¿Por qué cuesta?'], tema: 'Caídas al mismo nivel' });

  // la sesión: denominación y formador por defecto, todos los activos en la lista
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sesión', pressed: true })).toBeVisible();
  await expect(page.getByLabel('Denominación')).toHaveValue(`Toolbox Talk HSE Abril ${String(ANIO).slice(2)}`);
  await expect(page.getByLabel('Formador')).toHaveValue('Jefa Prueba');
  await expect(page.getByText('Tienen que firmarla (2):')).toBeVisible();
  await page.getByLabel('Fecha').fill(`${ANIO}-04-07`);
  await page.getByRole('button', { name: 'Enviar a firmar' }).click();
  await expect(page.getByText('Enviada: faltan 2 por firmar')).toBeVisible();
  const s = sim.tablas.sesiones.find((x) => x.charla_id !== 'ch-3')!;
  expect(s).toMatchObject({ empresa_id: UNIDAD, fecha: `${ANIO}-04-07`, formador: 'Jefa Prueba', previstos: [ANA, BRUNO] });
  expect(s.enviada_en).toBeTruthy();
  expect(errores).toEqual([]);
});

test('el jefe ve quién ha firmado, recoge la firma de Bruno en su móvil y cierra el mes', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/charlas');
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Firmas', pressed: true })).toBeVisible();
  await expect(page.getByText(/Han firmado 1 de 2/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Firma de Ana Prueba' })).toBeVisible();
  await page.locator('.fila', { hasText: 'Bruno Prueba' }).getByRole('button', { name: 'Firmar aquí' }).click();
  await expect(page.getByText('Si veo algo inseguro, lo digo')).toBeVisible();
  await page.getByRole('button', { name: 'La he leído, firmar' }).click();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText(/Han firmado 2 de 2/)).toBeVisible();
  const b = sim.find((l) => l.ruta.includes('/rpc/firmar_charla'))!.cuerpo as Record<string, unknown>;
  expect(b).toMatchObject({ p_sesion: 'se-3', p_persona: BRUNO });
  expect(sim.find((l) => l.ruta.includes('/rpc/firmar_charla'))!.perfil).toBe('prevencion');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Sesión' }).click();
  await page.getByRole('button', { name: 'Cerrar el mes' }).click();
  await expect(page.getByText('Mes cerrado')).toBeVisible();
  expect(sim.tablas.sesiones[0].cerrada_en).toBeTruthy();
});

test('PDF oficial del Toolbox (SH-CORP-FO-IB-031)', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/charlas');
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF oficial' }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toBe(`SH-CORP-FO-IB-031 Toolbox Talk HSE_Marzo ${String(ANIO).slice(2)}.pdf`);
  const bytes = await (await import('node:fs/promises')).readFile(await d.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(20000); // lleva el logo, los iconos y la firma
  expect(errores).toEqual([]);
});

test('mes cerrado: enviar a prevención desde mi correo y apuntarlo', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas(); t.sesiones[0].cerrada_en = `${ANIO}-03-31T10:00:00Z`;
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: t, rpc });
  await page.goto('./#/m/prevencion/charlas');
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sesión' }).click();
  const envio = page.getByRole('region', { name: 'Enviar a prevención' });
  await expect(envio).toContainText('Sin enviar · a tecnico@ejemplo.com');
  await envio.getByRole('button', { name: 'Enviar desde mi correo' }).click();
  await expect(envio.getByRole('button', { name: 'Abrir el correo' })).toBeVisible();
  await envio.getByRole('button', { name: 'Ya lo he enviado' }).click();
  await expect(page.getByText('Apuntado como enviado a prevención')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/apuntar_envio'))!.cuerpo).toEqual({ p_sesion: 'se-3', p_destino: 'tecnico@ejemplo.com (desde mi correo)' });
  expect(errores).toEqual([]);
});

test('datos por defecto: correo de prevención y firma del formador', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/charlas');
  await page.getByRole('button', { name: 'Datos por defecto' }).click();
  await expect(page.getByLabel('Correo del técnico de prevención (para enviarle el mes)')).toHaveValue('tecnico@ejemplo.com');
  await page.getByLabel('Nombre del técnico de prevención').fill('Pedro');
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  expect(sim.tablas.ajustes.find((a) => a.clave === 'correo_prl_nombre')).toMatchObject({ valor: 'Pedro', modulo: 'prevencion' });
  expect(String(sim.tablas.ajustes.find((a) => a.clave === 'firma_formador')?.valor)).toMatch(/^data:image\/png;base64,/);
});

test('la trabajadora ve la charla pendiente, la lee y la firma', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas(); t.asistencias = []; t.firmas = [];
  const sim = await simular(page, { dentro: true, sesion: sesion(['prevencion.tarea.ver'], 'Ana Prueba'), tablas: t, rpc });
  await page.goto('./#/m/prevencion');
  await expect(page.locator('.pestanas')).toHaveCount(0);
  await expect(page.getByText('Tienes una charla por leer y firmar.')).toBeVisible();
  await page.locator('.fila', { hasText: 'Toolbox Talk HSE Marzo' }).click();
  await expect(page.locator('.charla')).toContainText('No toques cables pelados');
  await page.getByRole('button', { name: 'La he leído, firmar' }).click();
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText('Falta la firma.')).toBeVisible();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText('No tienes ninguna charla por firmar.')).toBeVisible();
  expect(sim.find((l) => l.ruta.includes('/rpc/firmar_charla'))!.cuerpo).toMatchObject({ p_sesion: 'se-3', p_persona: ANA, p_puesto: null });
  expect(errores).toEqual([]);
});

test('fichas: el jefe pone el DNI y una talla; el encargado no ve las fichas', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/fichas');
  await expect(page.locator('.fila', { hasText: 'Bruno Prueba' })).toContainText('Falta: DNI, fecha de alta, tallas');
  await expect(page.locator('.fila', { hasText: 'Carla Antigua' })).toHaveCount(0);
  await page.locator('.fila', { hasText: 'Bruno Prueba' }).click();
  await page.getByLabel('DNI / NIE').fill('12345678-z');
  await expect(page.getByLabel('DNI / NIE')).toHaveValue('12345678Z');
  await page.getByLabel('Botas').fill('43');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ficha guardada')).toBeVisible();
  expect(sim.tablas.fichas.find((f) => f.persona_id === BRUNO)).toMatchObject({ empresa_id: UNIDAD, dni: '12345678Z', tallas: { bota: '43' } });
  expect(sim.tablas.fichas.filter((f) => f.persona_id === ANA)).toHaveLength(1);
});

test('el encargado no tiene la pestaña de fichas', async ({ page }) => {
  await simular(page, { dentro: true, sesion: sesion(ENCARGADO, 'Carla'), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/fichas');
  await expect(page.getByRole('button', { name: 'Charlas', pressed: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fichas' })).toHaveCount(0);
});

test('Prevención en el móvil más estrecho: nada se aplasta ni se sale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/charlas');
  await expect(page.locator('.fila', { hasText: 'Marzo' })).toBeVisible();
  expect(await desbordes(page), 'charlas').toEqual([]);
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  await expect(page.getByText(/Han firmado 1 de 2/)).toBeVisible();
  expect(await desbordes(page), 'firmas').toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Sesión' }).click();
  expect(await desbordes(page), 'sesión').toEqual([]);
  await page.getByRole('button', { name: 'Cerrar' }).first().click();
  await page.goto('./#/m/prevencion/fichas');
  await page.locator('.fila', { hasText: 'Ana Prueba' }).click();
  await expect(page.getByLabel('DNI / NIE')).toHaveValue('00000000T');
  expect(await desbordes(page), 'ficha').toEqual([]);
});

/** Un PDF pequeño de verdad (una página por cada texto), como los que manda el técnico. */
async function pdfDelTecnico(...textos: string[]) {
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create();
  textos.forEach((t) => d.addPage().drawText(t, { x: 50, y: 700 }));
  return Buffer.from(await d.save());
}

test('el jefe sube los PDF del técnico de todo el año y la app pone cada uno en su mes', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/charlas');
  const pdf = await pdfDelTecnico('Charla');
  await page.locator('label', { hasText: 'Subir documentos del año' }).locator('input').setInputFiles([
    { name: 'Toolbox Enero.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: '04 - Caídas.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'otro.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]);
  await expect(page.getByLabel('Mes de Toolbox Enero.pdf')).toHaveValue('1');
  await expect(page.getByLabel('Mes de 04 - Caídas.pdf')).toHaveValue('4');
  await expect(page.getByLabel('Mes de otro.pdf')).toHaveValue('0');
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await desbordes(page)).toEqual([]);
  await page.getByLabel('Mes de otro.pdf').selectOption({ label: 'Mayo' });
  await page.getByRole('button', { name: 'Subir', exact: true }).click();
  await expect(page.getByText('3 documentos subidos')).toBeVisible();
  const nuevas = sim.tablas.charlas.filter((c) => c.documento_ruta);
  expect(nuevas.map((c) => c.mes).sort()).toEqual([1, 4, 5]);
  expect(nuevas.every((c) => String(c.documento_ruta).startsWith(`${UNIDAD}/charlas/${ANIO}-`) && /^[0-9a-f]{64}$/.test(String(c.documento_sha256)))).toBe(true);
  expect(sim.archivos.size).toBe(3);
  await expect(page.locator('.fila', { hasText: 'Abril' })).toContainText('04 - Caídas.pdf');
  expect(errores).toEqual([]);
});

test('una charla que es solo el PDF del técnico: se abre, se firma y el PDF oficial lo lleva detrás', async ({ page }) => {
  const errores = vigilar(page);
  const ruta = `${UNIDAD}/charlas/${ANIO}-03-1.pdf`;
  const t = tablas();
  t.charlas = [{ ...charla(3), compromiso: null, cuerpo: null, puntos: [], tema: null, tema_puntos: [],
    documento_ruta: ruta, documento_nombre: 'Toolbox Marzo.pdf', documento_sha256: 'a'.repeat(64) } as unknown as ReturnType<typeof charla>];
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: t, rpc, archivos: [[`prevencion/${ruta}`, await pdfDelTecnico('Uno', 'Dos')]] });
  await page.goto('./#/m/prevencion/charlas');
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  await page.getByRole('button', { name: 'Contenido' }).click();
  await expect(page.getByRole('dialog').getByText('Toolbox Marzo.pdf')).toBeVisible();
  const abre = page.context().waitForEvent('request', (r) => /\/storage\/v1\/object\/sign\/prevencion\/.+token=/.test(r.url()));
  await page.getByRole('button', { name: 'Abrir el documento' }).click();
  await abre; // la pestaña nueva va al enlace firmado del PDF
  await page.getByRole('button', { name: 'Firmas', exact: true }).click();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF oficial' }).click();
  const bytes = await (await import('node:fs/promises')).readFile(await (await descarga).path());
  const { PDFDocument } = await import('pdf-lib');
  const total = await PDFDocument.load(bytes);
  expect(total.getPageCount()).toBeGreaterThanOrEqual(3); // la hoja oficial + las 2 páginas del técnico
  expect(errores).toEqual([]);
});

test('la trabajadora abre el documento del técnico antes de firmar', async ({ page }) => {
  const ruta = `${UNIDAD}/charlas/${ANIO}-03-1.pdf`;
  const t = tablas();
  t.asistencias = [];
  t.charlas = [{ ...charla(3), compromiso: null, documento_ruta: ruta, documento_nombre: 'Toolbox Marzo.pdf' } as unknown as ReturnType<typeof charla>];
  await simular(page, { dentro: true, sesion: sesion(['prevencion.modulo.ver'], 'Ana Prueba'), tablas: t, rpc, archivos: [[`prevencion/${ruta}`, await pdfDelTecnico('Uno')]] });
  await page.goto('./#/m/prevencion');
  await page.locator('.fila', { hasText: 'Firmar' }).click();
  await expect(page.getByRole('button', { name: 'Abrir el documento' })).toBeVisible();
  await page.getByRole('button', { name: 'La he leído, firmar' }).click();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText('Firmada', { exact: true }).first()).toBeVisible();
});

test('auditoría: en la ficha de la trabajadora están los documentos que ha firmado, con su PDF; la charla firmada ya no se cambia', async ({ page }) => {
  const errores = vigilar(page);
  await simular(page, { dentro: true, sesion: sesion(JEFE), tablas: tablas(), rpc });
  await page.goto('./#/m/prevencion/fichas');
  await page.locator('.fila', { hasText: 'Ana Prueba' }).click();
  const firmados = page.locator('.firmados');
  await expect(firmados).toContainText('Documentos firmados');
  await expect(firmados.locator('.fila')).toContainText(`Firmada el 5/3/${ANIO}`);
  const descarga = page.waitForEvent('download');
  await firmados.getByRole('button', { name: 'PDF' }).click();
  expect((await descarga).suggestedFilename()).toContain('Toolbox');
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await desbordes(page)).toEqual([]);
  await page.goto('./#/m/prevencion/charlas');
  await page.locator('.fila', { hasText: 'Marzo' }).click();
  await page.getByRole('button', { name: 'Contenido' }).click();
  await expect(page.getByText('Ya la ha firmado alguien')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar el contenido' })).toHaveCount(0);
  expect(errores).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Entregas de EPI (FO-014) y tallas
// ---------------------------------------------------------------------------------------------
const rpcEntregas = {
  ...rpc,
  enviar_documentos: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    const ds = t.documentos.filter((d) => (b.p_ids as string[]).includes(String(d.id)));
    ds.forEach((d) => { d.enviado_en ??= new Date().toISOString(); });
    return ds.filter((d) => !d.firma_id).length;
  },
  firmar_documento: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    if (!String(b.p_imagen).startsWith('data:image/png;base64,')) throw new Error('FIRMA_MAL');
    t.firmas.push({ id: 'fi-d', imagen: b.p_imagen, firmado_en: new Date().toISOString() });
    Object.assign(t.documentos.find((d) => d.id === b.p_documento)!, { firma_id: 'fi-d', firmado_en: new Date().toISOString() });
    return 'fi-d';
  },
  anular_documento: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    Object.assign(t.documentos.find((d) => d.id === b.p_documento)!, { anulado: new Date().toISOString() }); return null; },
  proponer_tallas: (b: Record<string, unknown>, t: Record<string, Record<string, unknown>[]>) => {
    Object.assign(t.fichas.find((f) => f.persona_id === ANA)!, { tallas_propuestas: b.p_tallas, tallas_propuestas_en: new Date().toISOString() }); return null; },
};
const JEFE_EPI = [...JEFE, 'prevencion.documento.ver', 'prevencion.documento.editar'];
const entrega = (extra = {}) => ({
  id: 'do-1', empresa_id: UNIDAD, tipo: 'epi', persona_id: ANA, nombre: 'Ana Prueba', fecha: `${ANIO}-03-02`,
  datos: { items: { bota: { u: '1', cat: ['Agua'], motivo: 'Primera entrega' } }, otros: [{ t: 'Pantalón de trabajo', u: '2', motivo: 'Cambio de talla' }], lugar: 'Planta D' },
  enviado_en: `${ANIO}-03-02T08:00:00Z`, firma_id: null, firmado_en: null, anulado: null, creado: `${ANIO}-03-02T08:00:00Z`, ...extra,
});

test('el encargado hace una entrega de EPI a Ana y a Bruno y la envía a firmar', async ({ page }) => {
  const errores = vigilar(page);
  const sim = await simular(page, { dentro: true, sesion: sesion([...ENCARGADO, 'prevencion.documento.ver', 'prevencion.documento.editar'], 'Encargado Prueba'), tablas: { ...tablas(), documentos: [] }, rpc: rpcEntregas });
  await page.goto('./#/m/prevencion/entregas');
  await page.getByRole('button', { name: '＋ Entrega de EPI' }).click();
  await page.getByRole('dialog').getByLabel('Ana Prueba').check();
  await page.getByRole('dialog').getByLabel('Bruno Prueba').check();
  await page.getByLabel('Bota (EN ISO 20345)').check();
  await page.getByRole('dialog').locator('.linea-epi', { hasText: 'Bota (EN ISO 20345)' }).getByLabel('Agua').check();
  await page.getByLabel('Prenda 1', { exact: true }).fill('Pantalón de trabajo');
  await page.getByLabel('Unidades de la prenda 1').fill('2');
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await desbordes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();
  await expect(page.getByText('Guardada y enviada a firmar')).toBeVisible();
  expect(sim.tablas.documentos).toHaveLength(2);
  expect(sim.tablas.documentos[0]).toMatchObject({ tipo: 'epi', empresa_id: UNIDAD, datos: { items: { bota: { u: '1', cat: ['Agua'], motivo: 'Primera entrega' } }, otros: [{ t: 'Pantalón de trabajo', u: '2' }] } });
  expect(sim.tablas.documentos.every((d) => d.enviado_en)).toBe(true);
  expect(errores).toEqual([]);
});

test('entrega de EPI: el jefe recoge la firma en su móvil y saca el PDF oficial FO-014', async ({ page }) => {
  const errores = vigilar(page);
  const t = tablas();
  await simular(page, { dentro: true, sesion: sesion(JEFE_EPI), tablas: { ...t, documentos: [entrega()] }, rpc: rpcEntregas });
  await page.goto('./#/m/prevencion/entregas');
  await expect(page.locator('.fila', { hasText: 'Ana Prueba' })).toContainText('Sin firmar');
  await page.locator('.fila', { hasText: 'Ana Prueba' }).click();
  await page.getByRole('button', { name: 'Firmar aquí' }).click();
  await page.getByRole('button', { name: 'He recibido los equipos, firmar' }).click();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText('Firmada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0);
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF oficial' }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toBe(`SH-CORP-SP-FO-014 Entrega de EPI Ana Prueba ${ANIO}-03-02.pdf`);
  const bytes = await (await import('node:fs/promises')).readFile(await d.path());
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(errores).toEqual([]);
});

test('la trabajadora firma su entrega de EPI y propone sus tallas; el jefe las acepta en su ficha', async ({ page }) => {
  const sim = await simular(page, { dentro: true, sesion: sesion(['prevencion.modulo.ver', 'prevencion.tarea.ver'], 'Ana Prueba'), tablas: { ...tablas(), asistencias: [], documentos: [entrega()] }, rpc: rpcEntregas });
  await page.goto('./#/m/prevencion');
  await expect(page.getByText('Tienes una entrega de EPI por firmar.')).toBeVisible();
  await page.locator('.fila', { hasText: 'Entrega de EPI' }).click();
  await expect(page.getByText('Bota (EN ISO 20345) · 1 ud. · Agua · Primera entrega')).toBeVisible();
  await page.getByRole('button', { name: 'He recibido los equipos, firmar' }).click();
  await firmarConElDedo(page);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByText('Tienes una entrega de EPI por firmar.')).toHaveCount(0);
  await page.locator('.fila', { hasText: 'Toca para cambiarlas' }).click();
  await page.getByLabel('Botas').fill('41');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Tallas enviadas')).toBeVisible();
  expect(sim.tablas.fichas.find((f) => f.persona_id === ANA)).toMatchObject({ tallas: { pantalon: 'L' }, tallas_propuestas: { pantalon: 'L', bota: '41' } });
});

test('ficha: tallas propuestas por la trabajadora y su entrega de EPI firmada entre sus documentos', async ({ page }) => {
  const t = tablas();
  t.fichas[0] = { ...t.fichas[0], tallas_propuestas: { pantalon: 'L', bota: '41' } } as typeof t.fichas[0];
  const sim = await simular(page, { dentro: true, sesion: sesion(JEFE_EPI), rpc: rpcEntregas,
    tablas: { ...t, documentos: [entrega({ firma_id: 'fi1', firmado_en: `${ANIO}-03-03T10:00:00Z` })] } });
  await page.goto('./#/m/prevencion/fichas');
  await page.locator('.fila', { hasText: 'Ana Prueba' }).click();
  await expect(page.locator('.propuesta')).toContainText('Botas: — → 41');
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByText('Tallas aceptadas')).toBeVisible();
  expect(sim.tablas.fichas.find((f) => f.persona_id === ANA)).toMatchObject({ tallas: { pantalon: 'L', bota: '41' }, tallas_propuestas: null });
  await page.locator('.fila', { hasText: 'Ana Prueba' }).click();
  await expect(page.locator('.firmados')).toContainText(`Entrega de EPI · 2/3/${ANIO}`);
  const descarga = page.waitForEvent('download');
  await page.locator('.firmados .fila', { hasText: 'Entrega de EPI' }).getByRole('button', { name: 'PDF' }).click();
  expect((await descarga).suggestedFilename()).toContain('SH-CORP-SP-FO-014');
});
