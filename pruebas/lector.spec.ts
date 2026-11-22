// Lector de «Apuntar» (almacén): frases de ejemplo → movimientos. Sin navegador: solo las reglas. Catálogo inventado.
import { test, expect } from '@playwright/test';

(globalThis as Record<string, unknown>).__VERSION__ = 'pruebas';
const HOY = '2026-11-18';   // miércoles

async function preparar() {
  const { leer, frases, fechaDe, faltan } = await import('../src/almacen/lector');
  const art = (id: string, nombre: string, codigo: string, unidad = 'ud') => ({ id, nombre, codigo, unidad, minimo: null, familia_id: null, baja: null });
  const c = {
    familias: [], fichas: new Map([['ac', { articulo_id: 'ac', almacen_principal_id: 'gen' }]]), proveedores: [{ id: 'pv', codigo: 'pv', nombre: 'Suministros Pérez', contacto: {}, baja: null }],
    articulos: [art('gn', 'Guantes de nitrilo', 'guantes-de-nitrilo'), art('gc', 'Guantes de corte', 'guantes-de-corte'), art('ac', 'Aceite hidráulico 46', 'AC-46', 'l'),
      art('p80', 'Pistón Ø 80', 'PIST-80'), art('tr', 'Trapos de algodón', 'trapos', 'kg')],
    almacenes: [{ id: 'gen', codigo: 'gen', nombre: 'Almacén general', tipo: 'general', centro_id: null, orden: 1, baja: null },
      { id: 'n1a', codigo: 'n1', nombre: 'Almacén producción N1A', tipo: 'produccion', centro_id: 'c1', orden: 2, baja: null },
      { id: 'n2', codigo: 'n2', nombre: 'Almacén producción N2', tipo: 'produccion', centro_id: 'c2', orden: 3, baja: null }],
    maquinas: [{ id: 'f27', codigo: 'F27', nombre: null, centro_id: 'c2', baja: null }, { id: 'f4', codigo: 'F4', nombre: null, centro_id: 'c1', baja: null },
      { id: 'm3', codigo: 'M3', nombre: null, centro_id: 'c2', baja: null }],
    centros: [{ id: 'c1', codigo: 'nave', nombre: 'NAVE 1', baja: null }, { id: 'c2', codigo: 'nave-2', nombre: 'NAVE 2', baja: null }],
    personas: [{ id: 'o37', nombre: 'Operario 37', baja: null }, { id: 'pepe', nombre: 'Pepe Inventado (40)', baja: null }], gestores: new Set<string>(),
    sinonimos: [{ id: 's1', palabra: 'junta gorda', articulo_id: 'p80' }],
    stock: new Map([['gn', new Map([['gen', 50], ['n2', 5]])], ['ac', new Map([['gen', 100]])]]), movs: [],
  };
  return { leer: (t: string) => leer(t, c as never, HOY), frases, fechaDe, faltan };
}

test('cortar en frases', async () => {
  const { frases } = await preparar();
  expect(frases('2 guantes para la F27 y 10 l de aceite. Ayer llegaron trapos; hay 3 pistones')).toEqual(['2 guantes para la F27', '10 l de aceite', 'Ayer llegaron trapos', 'hay 3 pistones']);
  expect(frases('aceite y agua para la F4')).toEqual(['aceite y agua para la F4']);   // «y» sin otra cosa detrás: no corta
});

test('fechas: ayer, anteayer, el lunes, 15/11', async () => {
  const { fechaDe } = await preparar();
  expect(fechaDe('ayer', HOY)).toBe('2026-11-17');
  expect(fechaDe('anteayer', HOY)).toBe('2026-11-16');
  expect(fechaDe('el lunes cogí', HOY)).toBe('2026-11-16');
  expect(fechaDe('el miércoles', HOY)).toBe('2026-11-11');   // el mismo día de la semana: el de la semana pasada
  expect(fechaDe('el 15/11', HOY)).toBe('2026-11-15');
  expect(fechaDe('el 20/12', HOY)).toBe('2025-12-20');      // sin año y en el futuro: el año pasado
});

test('consumo con máquina, persona y almacén de su nave; «y 3 más» repite el artículo', async () => {
  const { leer } = await preparar();
  const [a, b] = leer('2 guantes de nitrilo para la F27 el 37 y 3 en el general');
  expect(a).toMatchObject({ tipo: 'salida', articulo_id: 'gn', cantidad: 2, activos: ['f27'], centro_id: 'c2', persona_id: 'o37', almacen_id: 'n2' });
  expect(a.auto).toContain('almacen');
  expect(b).toMatchObject({ tipo: 'salida', articulo_id: 'gn', cantidad: 3, almacen_id: 'gen' });
});

test('dos que se parecen: pregunta cuál', async () => {
  const { leer, faltan } = await preparar();
  const [a] = leer('4 guantes para la F4');
  expect(a.articulo_id).toBeNull();
  expect(a.dudas[0]).toContain('Guantes de nitrilo');
  expect(a.dudas[0]).toContain('Guantes de corte');
  expect(faltan(a)).toEqual(['artículo', 'almacén']);
});

test('código, palabra enseñada, máquina «la 27» y nombre de persona', async () => {
  const { leer } = await preparar();
  expect(leer('cambiado 1 PIST-80 en la M3')[0]).toMatchObject({ articulo_id: 'p80', activos: ['m3'], cantidad: 1 });
  expect(leer('una junta gorda para la 27')[0]).toMatchObject({ articulo_id: 'p80', activos: ['f27'], cantidad: 1 });
  expect(leer('dos trapos para Pepe Inventado')[0]).toMatchObject({ articulo_id: 'tr', persona_id: 'pepe', cantidad: 2 });
});

test('entrada con proveedor y albarán; traslado de un almacén a otro; recuento', async () => {
  const { leer } = await preparar();
  expect(leer('han llegado 200 litros de aceite de Suministros Pérez, albarán 12345A26')[0])
    .toMatchObject({ tipo: 'entrada', articulo_id: 'ac', cantidad: 200, proveedor_id: 'pv', albaran: '12345A26', almacen_id: 'gen' });
  expect(leer('baja 20 guantes de nitrilo del general a N1A')[0]).toMatchObject({ tipo: 'traslado', articulo_id: 'gn', cantidad: 20, almacen_id: 'gen', destino_id: 'n1a' });
  expect(leer('repón 10 guantes de nitrilo en nave 2')[0]).toMatchObject({ tipo: 'traslado', almacen_id: 'gen', destino_id: 'n2' });
  expect(leer('hay 12 kg de trapos en el general')[0]).toMatchObject({ tipo: 'ajuste', articulo_id: 'tr', cantidad: 12, almacen_id: 'gen' });
});

test('lo que no conoce: lo dice con sus palabras', async () => {
  const { leer } = await preparar();
  const [a] = leer('3 mopas azules para la F4');
  expect(a.articulo_id).toBeNull();
  expect(a.palabras).toBe('mopas azules');
  expect(a.dudas[0]).toContain('No conozco «mopas azules»');
});
