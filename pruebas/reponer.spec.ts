// Cuentas de Reponer y Previsión (almacén), sin navegador. Catálogo inventado.
import { test, expect } from '@playwright/test';

(globalThis as Record<string, unknown>).__VERSION__ = 'pruebas';
const HOY = '2026-11-18';

async function cat(extra: Record<string, unknown> = {}) {
  const r = await import('../src/almacen/reponer');
  const art = (id: string, unidad = 'ud', minimo: number | null = null) => ({ id, nombre: id, codigo: id, unidad, minimo, familia_id: null, baja: null });
  const movs: Record<string, unknown>[] = [];
  // 2 al día durante 120 días en N2 (salidas)
  for (let i = 0; i < 120; i++) { const d = new Date(HOY + 'T12:00'); d.setDate(d.getDate() - i); movs.push({ id: 'm' + i, articulo_id: 'gu', tipo: 'salida', almacen_id: 'n2', destino_id: null, cantidad: 2, perdida: false, fecha: d.toLocaleDateString('sv-SE'), creado: d.toISOString() }); }
  const c = {
    articulos: [art('gu'), art('ac', 'l'), art('pr')], familias: [], proveedores: [], maquinas: [], centros: [], personas: [], gestores: new Set(), sinonimos: [],
    almacenes: [{ id: 'gen', nombre: 'General', tipo: 'general', baja: null }, { id: 'n1', nombre: 'N1', tipo: 'produccion', baja: null }, { id: 'n2', nombre: 'N2', tipo: 'produccion', baja: null }],
    fichas: new Map([['gu', { almacen_principal_id: 'gen', plazo_dias: 7 }]]),
    stock: new Map([['gu', new Map([['gen', 10], ['n2', 3]])], ['ac', new Map([['n1', 5]])], ['pr', new Map([['n2', 1]])]]),
    dotacion: new Map([['n2', new Map([['gu', 10], ['pr', 4]])], ['n1', new Map([['ac', 5]])]]),
    bajar: [], movs, ajustes: { origen: null, prevision: { nivel: 95, plazo: 7, cobertura: 7 } }, ...extra,
  };
  return { r, c: c as never };
}

test('reponer: falta = dotación − lo que hay, desde su almacén principal; completo si no falta', async () => {
  const { r, c } = await cat();
  const f = r.faltas(c, 'n2', HOY);
  expect(f.find((x) => x.articulo_id === 'gu')).toMatchObject({ falta: 7, bajar: 7, origen_id: 'gen', propio: false });
  expect(r.faltas(c, 'n1', HOY)[0]).toMatchObject({ articulo_id: 'ac', falta: 0, bajar: 0 });
  expect(r.lineas(c).map((l: { id: string }) => l.id)).toEqual(['n1', 'n2']);
});

test('reponer: lo que solo está en ese almacén no se baja de ningún sitio', async () => {
  const { r, c } = await cat({ almacenes: [{ id: 'n2', nombre: 'N2', tipo: 'produccion', baja: null }, { id: 'n1', nombre: 'N1', tipo: 'produccion', baja: null }] });
  // sin almacén general: el origen es el primero (N2), que no se repone; N1 sí
  expect(r.origenReposicion(c)).toBe('n2');
});

test('reponer: «Quitar» deja solo lo gastado después; la cantidad de hoy manda solo hoy', async () => {
  const { r, c } = await cat({ bajar: [{ almacen_id: 'n2', articulo_id: 'gu', quitado_stock: 5, quitado_en: HOY + 'T23:00:00Z', hoy_cantidad: null, hoy_dia: null },
    { almacen_id: 'n2', articulo_id: 'pr', quitado_stock: null, quitado_en: null, hoy_cantidad: 1, hoy_dia: HOY }] });
  const f = r.faltas(c, 'n2', HOY);
  expect(f.find((x) => x.articulo_id === 'gu')).toMatchObject({ falta: 7, bajar: 2, quitado: true });   // tenía 5 al quitarlo; ahora 3: se bajan 2
  expect(f.find((x) => x.articulo_id === 'pr')).toMatchObject({ falta: 3, bajar: 1, cambiadoHoy: true });
  expect(r.faltas(c, 'n2', '2026-11-19').find((x) => x.articulo_id === 'pr')!.bajar).toBe(3);   // al día siguiente ya no vale
});

test('previsión: 2 al día → mínimo para 7 días de plazo, pedido hasta fin del mes que viene, dotación de N2', async () => {
  const { r, c } = await cat();
  const p = r.prevision(c, (c as { articulos: { id: string }[] }).articulos[0] as never, HOY)!;
  expect(p.ritmo).toBeCloseTo(2, 5);
  const { H } = r.horizonte(HOY);
  expect(H).toBe(43);   // del 18/11 al 31/12
  expect(p.minimo).toBeGreaterThan(0);   // lo que se pasa de 14 en 7 días, 95 de cada 100 veces
  expect(p.pedir).toBe(Math.ceil(2 * H + p.minimo - 13));
  expect(p.planta.get('n2')).toBeGreaterThanOrEqual(14);
  expect(r.prevision(c, (c as { articulos: { id: string }[] }).articulos[1] as never, HOY)).toBeNull();   // sin consumos
});

test('cuantil de Poisson y normal', async () => {
  const { r } = await cat();
  expect(r.cuantil(14, 14, 95, true)).toBe(20);   // P(X ≤ 20) = 0,952
  expect(r.cuantil(0, 0, 95, true)).toBe(0);
  expect(r.cuantil(10, 40, 95, false)).toBeCloseTo(20.5, 5);   // 10 + 1,6449·√40 = 20,40 → 20,5
});
