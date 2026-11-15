// Leer el Excel de trabajos del fin de semana (el del cliente). Igual que la app vieja: busca la fila de títulos,
// adivina qué columna es cada cosa (se puede cambiar a mano) y el fin de semana («Fin de semana 17-18 octubre»).
export type Celda = string | number | boolean | Date | null;
export type Campo = 'titulo' | 'lugar' | 'fecha' | 'quien' | 'descripcion' | 'minutos' | 'urgente';
export const CAMPOS: [Campo, string, RegExp][] = [
  ['titulo', 'Trabajo', /^(trabajos?|tareas?|actividad(es)?|puntos?|superficies?|que hacer|operacion(es)?|descripcion|puntos y superficies|elementos?)\b|trabajo a realizar|a limpiar/],
  ['lugar', 'Dónde', /^(zona|lugar|maquina|ubicacion|nave|sitio|area|linea)s?\b/],
  ['fecha', 'Día', /^(dia|fecha)s?\b/],
  ['quien', 'Quién', /^(quien|operari[oa]s?|responsables?|asignad[oa]s?|personas?|trabajador(es)?|nombres?)\b/],
  ['descripcion', 'Notas', /^(observaciones?|notas?|detalles?|comentarios?|instrucciones?)\b/],
  ['minutos', 'Tiempo', /^(tiempo|horas?|minutos?|duracion)\b/],
  ['urgente', 'Urgente', /^(urgente|prioridad)\b/],
];
export const norm = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const iso = (d: Date) => d.toLocaleDateString('sv-SE');
export const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const diaSemana = (f: string) => new Date(f + 'T12:00').getDay();
/** El sábado del fin de semana que toca: hoy si es sábado; si no, el próximo. */
export const proximoSabado = (hoy: string) => sumarDias(hoy, (6 - diaSemana(hoy) + 7) % 7);

export interface Persona { id: string; nombre: string }
export interface Maquina { id: string; codigo: string }
export interface Fila {
  titulo: string; lugar: string; descripcion: string; fecha: string; quien: string; mal: string[]; minutos_est: number | null;
  urgente: boolean; activo_id: string | null; grupo: string | null; crear: boolean; repetido: boolean;
}
export interface Lectura { cab: number; mapa: Partial<Record<Campo, number | null>>; sabado: string; delExcel: boolean; filas: Fila[]; filasConDatos: number; columnas: string[] }

/** Fila de títulos: entre las 15 primeras, la que más se parece a nombres de columna. */
export function filaDeTitulos(filas: Celda[][]): number {
  let mejor = 0, cual = 0;
  filas.slice(0, 15).forEach((r, i) => {
    const n = r.filter((c) => typeof c === 'string' && c.trim().length <= 40 && CAMPOS.some(([, , rx]) => rx.test(norm(c)))).length;
    if (n > mejor) { mejor = n; cual = i; }
  });
  return cual;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «Fin de semana 17-18 OCTUBRE» (en las filas de arriba o en el nombre del archivo) → el sábado 17. */
export function sabadoDelTexto(texto: string, hoy: string): string | null {
  const m = norm(texto).match(/(\d{1,2})\s*(?:-|y|al|a)\s*(\d{1,2})\s*(?:de\s*)?([a-z]+)/);
  if (!m) return null;
  const mes = MESES.findIndex((x) => m[3].startsWith(x.slice(0, 3)));
  if (mes < 0) return null;
  let y = +hoy.slice(0, 4);
  const f = (a: number) => `${a}-${String(mes + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  if (f(y) < sumarDias(hoy, -60)) y++;
  const s = f(y);
  return !isNaN(new Date(s + 'T12:00').getTime()) && diaSemana(s) === 6 ? s : null;
}

function aFecha(x: Celda, sab: string): string | null {
  if (x instanceof Date && !isNaN(x.getTime())) return x.toISOString().slice(0, 10);
  const t = norm(x);
  if (!t) return null;
  const m = t.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/);
  if (m) {
    let y = m[3] ? +m[3] : +sab.slice(0, 4); if (y < 100) y += 2000;
    const f = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    if (!isNaN(new Date(f + 'T12:00').getTime())) return f;
  }
  if (/sab/.test(t)) return sab;
  if (/dom/.test(t)) return sumarDias(sab, 1);
  return null;
}

/** Nombres de la columna «Quién» → personas (por nombre entero, nombre de pila, un apellido o el principio). */
export function quienes(x: Celda, personas: Persona[]): { ids: string[]; mal: string[] } {
  const t = norm(x); const ids: string[] = [], mal: string[] = [];
  if (!t) return { ids, mal };
  t.split(/[,;/+\n]| y /).map((z) => z.trim()).filter(Boolean).forEach((tok) => {
    if (/todos|equipo/.test(tok)) return;
    const nn = (p: Persona) => norm(p.nombre);
    const p = personas.find((w) => nn(w) === tok) ?? personas.find((w) => nn(w).split(' ')[0] === tok)
      ?? personas.find((w) => nn(w).split(' ').some((q) => q.length > 3 && q === tok)) ?? personas.find((w) => nn(w).startsWith(tok))
      ?? personas.find((w) => tok.length > 3 && tok.includes(nn(w).split(' ')[0]));
    if (p) { if (!ids.includes(p.id)) ids.push(p.id); } else mal.push(tok);
  });
  return { ids, mal };
}

/** Lee la hoja y saca los trabajos. `antes` = lo ya decidido a mano (fila de títulos, columnas, sábado). */
export function leerHoja(filas: Celda[][], o: {
  archivo: string; hoy: string; personas: Persona[]; maquinas: Maquina[]; grupos: Record<string, string>;
  cab?: number; mapa?: Partial<Record<Campo, number | null>>; sabado?: string;
}): Lectura {
  const cab = o.cab ?? filaDeTitulos(filas);
  const titulos = (filas[cab] ?? []).map((c) => String(c ?? '').trim());
  const ncol = Math.max(0, ...filas.map((r) => r.length));
  const columnas = Array.from({ length: ncol }, (_, j) => titulos[j] || `Columna ${String.fromCharCode(65 + (j % 26))}`);
  let mapa = o.mapa;
  if (!mapa) {
    mapa = {}; const usadas = new Set<number>();
    CAMPOS.forEach(([k, , rx]) => { const i = titulos.findIndex((c, j) => !usadas.has(j) && rx.test(norm(c))); if (i >= 0) { mapa![k] = i; usadas.add(i); } });
    if (mapa.titulo == null) {   // sin cabecera clara: la columna con más texto
      let bi = 0, bl = 0;
      for (let j = 0; j < ncol; j++) { const l = filas.slice(cab + 1).reduce((a, r) => a + String(r[j] ?? '').length, 0); if (l > bl) { bl = l; bi = j; } }
      mapa.titulo = bi;
    }
  }
  const delTexto = o.sabado ? null : sabadoDelTexto(filas.slice(0, Math.max(1, cab)).map((r) => r.join(' ')).join(' ') + ' ' + o.archivo, o.hoy);
  const sabado = o.sabado ?? delTexto ?? proximoSabado(o.hoy);
  const domingo = sumarDias(sabado, 1);
  const val = (r: Celda[], k: Campo) => (mapa![k] == null ? '' : r[mapa![k] as number] ?? '');
  const salida: Fila[] = [];
  filas.slice(cab + 1).forEach((r) => {
    const tit = String(val(r, 'titulo') ?? '').trim();
    if (!tit || norm(tit) === norm(titulos[mapa!.titulo as number])) return;
    let fecha = mapa!.fecha != null ? aFecha(val(r, 'fecha'), sabado) : null;
    if (fecha !== sabado && fecha !== domingo) fecha = sabado;
    const q = quienes(val(r, 'quien'), o.personas);
    const mn = parseFloat(String(val(r, 'minutos')).replace(',', '.'));
    const enHoras = /hora|h$/i.test(titulos[mapa!.minutos as number] ?? '');
    const minutos = isNaN(mn) ? null : Math.round(mn <= 12 && enHoras ? mn * 60 : mn);
    let lugar = String(val(r, 'lugar') ?? '').trim(), titulo = tit;
    if (/^\d+$/.test(lugar)) lugar = `Nave ${lugar}`;                       // columna Nave con 1 o 2
    const cm = tit.match(/^([A-Za-z]{1,2})\s*-?\s*(\d{1,3})$/);              // «F-30» → «Limpieza F30» en la F30
    if (cm) { const z = cm[1].toUpperCase() + cm[2]; titulo = `Limpieza ${z}`; lugar = z; }
    const codigo = norm(lugar).replace(/[\s-]/g, '') || (titulo.match(/\b([a-z]{1,2}-?\d{1,3})\b/i)?.[1] ?? '').toLowerCase().replace('-', '');
    const maq = o.maquinas.find((m) => norm(m.codigo).replace(/[\s-]/g, '') === codigo) ?? null;
    salida.push({
      titulo: titulo.slice(0, 120), lugar: lugar.slice(0, 120), descripcion: String(val(r, 'descripcion') ?? '').trim(), fecha, quien: q.ids[0] ?? '', mal: q.mal,
      minutos_est: minutos != null && minutos >= 1 && minutos <= 1440 ? minutos : null,
      urgente: /^(si|x|1|urgente|alta)$/.test(norm(val(r, 'urgente'))), activo_id: maq?.id ?? null,
      grupo: o.grupos[norm(titulo)] ?? null, crear: true, repetido: false,
    });
  });
  const filasConDatos = filas.slice(cab + 1).filter((r) => r.some((c) => String(c ?? '').trim())).length;
  return { cab, mapa, sabado, delExcel: !o.sabado && !!delTexto, filas: salida, filasConDatos, columnas };
}
