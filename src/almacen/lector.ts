// Lector de «Apuntar» (decidido por Cristian el 22/11: gratis, por reglas, como la app vieja, y además aprende palabras).
// Convierte «ayer cogí 2 guantes para la F27 y 10 l de aceite en nave 2» en movimientos para revisar antes de guardar.
// No sabe de pistones ni ejes (eso llega con el trozo 2): esas frases las lee como consumos normales.
import { almacenPorDefecto, plano, stockDe, sumarDias, type Catalogo, type Mov } from './datos';

export interface Propuesta {
  texto: string;
  tipo: Mov['tipo'];
  fecha: string;
  articulo_id: string | null;
  /** Las palabras con las que se nombró el artículo (para enseñarlas si se elige a mano). */
  palabras: string;
  almacen_id: string | null;
  destino_id: string | null;
  cantidad: number | null;
  activos: string[];
  centro_id: string | null;
  persona_id: string | null;
  proveedor_id: string | null;
  albaran: string | null;
  /** Campos que ha puesto la app sin que se dijeran (se marcan «auto»). */
  auto: string[];
  /** Dudas para el que revisa. */
  dudas: string[];
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, media: 0.5, medio: 0.5,
};
const VACIAS = new Set(('de del la las el los un una unos unas y en para a al con por que se me le lo he ha han hemos hay he otro otra otros otras tambien mas ' +
  'cogido cogi coger cogio sacado saque sacar sacamos gastado gaste gastar consumido consumo consumir puesto puse poner cambiado cambie cambiar necesita necesito ' +
  'entrada llegado llegaron llego recibido recibi traen traido han venido trasladar traslado trasladado bajar bajado subir subido pasar pasado llevar llevado ' +
  'reponer repuesto dejar dejado meter metido contado recuento inventario hoy ayer anteayer maquina inyectora iny nave almacen general central ' +
  'kg kilos kilo litros litro l m metros metro ud uds unidad unidades caja cajas rollo rollos par pares garrafa garrafas bote botes bidon bidones ' +
  'lunes martes miercoles jueves viernes sabado domingo esta este quedan queda nuevo nueva nuevos nuevas operario el').split(/\s+/));

const PISTAS: [Mov['tipo'], RegExp][] = [
  ['ajuste', /\b(contad[oa]s?|cuento|recuento|inventario|hay\s+\d)/],
  ['entrada', /\b(entrada|llegad[oa]s?|lleg[oóa]|llegaron|recibid[oa]s?|recib[ií]|traen|traid[oa]s?|han venido|ha venido|vino|vinieron)\b/],
  ['traslado', /\b(traslad\w*|baj[aéeo]\w*|sub[iíe]\w*|pas[aéeo]\w*|llev[aéeo]\w*|repon\w*|repuest\w*|dej[aéeo]\w*|met[iíe]\w*)\b/],
  ['salida', /\b(cambiad\w*|cambi[eé]|gast\w*|consum\w*|sac[aoó]\w*|saqu\w*|puest[oa]s?|puse|cog\w*|necesit\w*)\b/],
];

/** Singular aproximado y sin tildes, para comparar palabras («guantes» → «guante», «botes» → «bote»). */
const raiz = (w: string) => { const p = plano(w); return p.length > 4 && p.endsWith('es') && !p.endsWith('ces') ? p.slice(0, -1) : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p; };
const palabrasDe = (t: string) => plano(t).replace(/[^a-z0-9ñ.,/-]+/g, ' ').split(/\s+/).filter(Boolean);
const parecidas = (a: string, b: string) => { const x = raiz(a), y = raiz(b); return x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))); };

/** Corta el texto en frases: por punto, punto y coma o salto de línea; por «y» delante de otra cosa; y por «, otro». */
export function frases(texto: string): string[] {
  return texto.split(/[.;\n]+(?!\d)/).flatMap((f) => f.split(/,?\s+y\s+(?=(?:\d|un[oa]?\b|dos\b|tres\b|cuatro\b|cinco\b|seis\b|diez\b|otr|cambi|consum|gast|entr|lleg|baj|pas|cont|hay\b|sac|cog|recib))|,\s*(?=otr[oa]s?\b|tambi[eé]n\b)/i))
    .map((f) => f.trim()).filter((f) => f.length > 1);
}

/** La fecha que dice la frase (o null). */
export function fechaDe(t: string, hoy: string): string | null {
  const p = plano(t);
  if (/\banteayer\b/.test(p)) return sumarDias(hoy, -2);
  if (/\bayer\b/.test(p)) return sumarDias(hoy, -1);
  if (/\bhoy\b/.test(p)) return hoy;
  const ds = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const d = ds.findIndex((x) => new RegExp(`\\b(el\\s+)?${x}\\b`).test(p));
  if (d >= 0) { const h = new Date(hoy + 'T12:00').getDay(); return sumarDias(hoy, -(((h - d) + 7) % 7 || 7)); }
  const m = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(hoy.slice(0, 4));
    const f = `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return !m[3] && f > hoy ? `${a - 1}${f.slice(4)}` : f;
  }
  return null;
}

/** Máquinas que nombra: su código («F27», «f-27», «M3»), o «la 27» / «máquina 27» si solo hay una con ese número. */
function maquinasDe(t: string, c: Catalogo): { ids: string[]; quitar: string[] } {
  const p = ' ' + plano(t).replace(/[^a-z0-9ñ]+/g, ' ') + ' ', ids: string[] = [], quitar: string[] = [];
  for (const m of c.maquinas.filter((x) => !x.baja)) {
    const cod = plano(m.codigo).replace(/[^a-z0-9ñ]+/g, ' ').trim();
    if (!cod) continue;
    const pegado = cod.replace(/\s+/g, '');
    const conGuion = cod.replace(/^([a-z]+)\s*(\d+)$/, '$1 $2');
    if (p.includes(` ${cod} `) || p.includes(` ${pegado} `) || p.includes(` ${conGuion} `)) { ids.push(m.id); quitar.push(...cod.split(' '), pegado); }
  }
  for (const x of p.matchAll(/\b(?:la|maquina|inyectora|iny|en la)\s+(\d{1,3})\b/g)) {
    const n = x[1], cand = c.maquinas.filter((m) => !m.baja && plano(m.codigo).replace(/[^0-9]/g, '') === n && /^[a-z]+\s*-?\s*\d+$/.test(plano(m.codigo)));
    if (cand.length === 1 && !ids.includes(cand[0].id)) { ids.push(cand[0].id); quitar.push(n); }
  }
  return { ids, quitar };
}

/** Nombres con los que se llama a cada almacén («general», «central», «n2», «nave 2», «consumibles»…). */
export function aliasAlmacenes(c: Catalogo): [string, string][] {
  const out: [string, string][] = [];
  for (const a of c.almacenes.filter((x) => !x.baja)) {
    const n = plano(a.nombre).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const sin = n.replace(/^almacen\s+(de\s+)?(produccion\s+)?(de\s+)?/, '').trim();
    const al = new Set([n, sin, plano(a.codigo)]);
    const u = n.split(' ').pop()!;
    if (u.length <= 4) al.add(u);
    if (/\bgeneral\b|\bcentral\b/.test(n)) { al.add('general'); al.add('central'); }
    if (/\bconsumibles\b/.test(n)) al.add('consumibles');
    const nm = u.match(/^n(\d)([a-z]?)$/);
    if (nm && a.tipo === 'produccion') { al.add(`nave ${nm[1]}${nm[2]}`); al.add(`nave ${nm[1]} ${nm[2]}`.trim()); al.add(`n ${nm[1]}${nm[2]}`); }
    al.forEach((x) => { if (x && x.length >= 2) out.push([x, a.id]); });
  }
  return out.sort((x, y) => y[0].length - x[0].length);
}

/** El artículo que nombra la frase: palabra enseñada, código exacto o el que más palabras comparte (si empatan, ninguno). */
export function articuloDe(t: string, c: Catalogo, quitar: string[] = []): { id: string | null; palabras: string; empate: string[] } {
  const p = ' ' + plano(t).replace(/[^a-z0-9ñ.\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const vivos = c.articulos.filter((a) => !a.baja);
  // 1) palabras enseñadas (la más larga gana)
  const s = c.sinonimos.filter((x) => p.includes(` ${plano(x.palabra)} `) && vivos.some((a) => a.id === x.articulo_id)).sort((a, b) => b.palabra.length - a.palabra.length)[0];
  if (s) return { id: s.articulo_id, palabras: s.palabra, empate: [] };
  // 2) código exacto (solo los que tienen cifras: «JPC-375»)
  const cod = vivos.find((a) => /\d/.test(a.codigo) && a.codigo.length >= 3 && p.includes(` ${plano(a.codigo)} `));
  if (cod) return { id: cod.id, palabras: cod.codigo, empate: [] };
  // 3) palabras del nombre
  const fuera = new Set(quitar.map(plano));
  const mias = palabrasDe(t).filter((w) => !VACIAS.has(w) && !fuera.has(w) && !/^\d+([.,]\d+)?$/.test(w) && !NUMEROS[w] && w.length >= 3);
  let mejor = 0, ganan: string[] = [];
  for (const a of vivos) {
    const suyas = palabrasDe(a.nombre).filter((w) => w.length >= 3 && !VACIAS.has(w));
    const n = mias.filter((w) => suyas.some((x) => parecidas(w, x))).length
      + mias.filter((w) => /\d/.test(w) && palabrasDe(a.nombre).includes(w)).length;   // «80» en «Pistón Ø 80»
    if (!n) continue;
    const pt = n + n / Math.max(suyas.length, 1) / 10;   // a igualdad, el nombre más corto (más exacto)
    if (pt > mejor + 1e-9) { mejor = pt; ganan = [a.id]; } else if (Math.abs(pt - mejor) < 1e-9) ganan.push(a.id);
  }
  return ganan.length === 1 ? { id: ganan[0], palabras: mias.join(' '), empate: [] } : { id: null, palabras: mias.join(' '), empate: ganan.slice(0, 6) };
}

/** Cantidad: el primer número que queda (o uno en palabras: «dos», «media»). */
function cantidadDe(t: string, quitar: string[]): number | null {
  const fuera = new Set(quitar);
  const p = plano(t).replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  for (const w of p.split(/[^a-z0-9ñ.,]+/)) {
    if (!w || fuera.has(w)) continue;
    if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.'));
    if (NUMEROS[w] !== undefined) return NUMEROS[w];
  }
  return null;
}

/** Una persona: «el 37», «operario 37», «nº 211» (su número entre paréntesis o «Operario 37»), o su nombre. */
function personaDe(t: string, c: Catalogo): { id: string | null; quitar: string[] } {
  const p = plano(t), vivas = c.personas.filter((x) => !x.baja && !c.gestores.has(x.id));
  const numDe = (n: string) => (plano(n).match(/\((\d{2,3})\)\s*$/) ?? plano(n).match(/^operario\s+(\d{2,3})$/))?.[1];
  for (const x of p.matchAll(/\b(?:el|operario|n[ºo°]?|numero)\s*(\d{2,3})\b/g)) {
    const q = vivas.find((v) => numDe(v.nombre) === x[1]);
    if (q) return { id: q.id, quitar: [x[1]] };
  }
  const q = vivas.find((v) => { const n = plano(v.nombre).replace(/\s*\(\d+\)$/, ''); return !/^operario \d+$/.test(n) && n.length >= 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(p); });
  return { id: q?.id ?? null, quitar: [] };
}

/** Lee el texto y propone los movimientos. `hoy` se pasa para que las pruebas no dependan del día. */
export function leer(texto: string, c: Catalogo, hoy: string): Propuesta[] {
  const alias = aliasAlmacenes(c);
  const out: Propuesta[] = [];
  let fecha = hoy, previa: Propuesta | null = null;
  for (const t of frases(texto)) {
    const p = ' ' + plano(t).replace(/[^a-z0-9ñ/ ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    fecha = fechaDe(t, hoy) ?? fecha;
    const maq = maquinasDe(t, c);
    // almacenes, por orden de aparición
    const vistos: { id: string; pos: number; alias: string }[] = [];
    for (const [al, id] of alias) {
      const i = p.indexOf(` ${al} `);
      if (i >= 0 && !vistos.some((v) => v.id === id) && !vistos.some((v) => i >= v.pos && i < v.pos + v.alias.length + 1)) vistos.push({ id, pos: i, alias: al });
    }
    vistos.sort((a, b) => a.pos - b.pos);
    const quitarAlm = vistos.flatMap((v) => v.alias.split(' '));
    const per = personaDe(t, c);
    const albaran = (t.match(/albar[aá]n\s*(?:n[ºo°]?\s*)?([A-Za-z0-9-/]+)/i) ?? [])[1] ?? null;
    const prov = c.proveedores.find((x) => !x.baja && x.nombre.length >= 3 && p.includes(` ${plano(x.nombre).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `));
    const quitar = [...maq.quitar, ...quitarAlm, ...per.quitar, ...(albaran ? [plano(albaran)] : []), ...(prov ? palabrasDe(prov.nombre) : [])];
    let tipo = PISTAS.find(([, re]) => re.test(plano(t)))?.[0] ?? null;
    let art = articuloDe(t, c, quitar);
    const cantidad = cantidadDe(t, quitar);
    const auto: string[] = [], dudas: string[] = [];
    // «… y 220 en nave 2»: repite el artículo (y el tipo) de la frase anterior
    if (!art.id && !art.empate.length && previa?.articulo_id && !art.palabras) { art = { id: previa.articulo_id, palabras: previa.palabras, empate: [] }; }
    if (!tipo) { tipo = previa?.tipo ?? 'salida'; auto.push('tipo'); }
    let desde: string | null = null, hasta: string | null = null;
    if (tipo === 'traslado') {
      if (vistos.length >= 2) { desde = vistos[0].id; hasta = vistos[1].id; }
      else if (vistos.length === 1) { if (new RegExp(`\\b(de|desde|del)\\s+${vistos[0].alias}\\b`).test(p)) desde = vistos[0].id; else hasta = vistos[0].id; }
    } else if (vistos.length) desde = vistos[0].id;
    // si no lo dice: el de la nave de la máquina (con stock) o el de siempre
    if (art.id && !desde) {
      const nave = maq.ids.length ? c.maquinas.find((m) => m.id === maq.ids[0])?.centro_id : null;
      const deNave = tipo === 'salida' && nave ? c.almacenes.find((a) => !a.baja && a.tipo === 'produccion' && a.centro_id === nave && stockDe(c, art.id!, a.id) > 0) : null;
      desde = deNave?.id ?? almacenPorDefecto(c, tipo, art.id, null).desde; if (desde) auto.push('almacen');
    }
    if (art.id && tipo === 'traslado' && !hasta) { hasta = almacenPorDefecto(c, 'traslado', art.id, desde).hasta; if (hasta === desde) hasta = null; if (hasta) auto.push('destino'); }
    const centro = tipo === 'salida' ? (maq.ids.length ? c.maquinas.find((m) => m.id === maq.ids[0])?.centro_id ?? null : desde ? c.almacenes.find((a) => a.id === desde && a.tipo === 'produccion')?.centro_id ?? null : null) : null;
    if (!art.id) dudas.push(art.empate.length ? `¿Cuál de estos? ${art.empate.map((id) => c.articulos.find((a) => a.id === id)?.nombre).join(' · ')}` : art.palabras ? `No conozco «${art.palabras}»: elige el artículo y la app aprenderá la palabra.` : 'No sé qué artículo es.');
    if (cantidad === null) dudas.push('No sé cuántos.');
    if (tipo === 'traslado' && (!desde || !hasta)) dudas.push('No sé de qué almacén a qué almacén.');
    const pr: Propuesta = {
      texto: t, tipo, fecha, articulo_id: art.id, palabras: art.palabras, almacen_id: desde, destino_id: hasta, cantidad,
      activos: tipo === 'salida' ? maq.ids : [], centro_id: centro, persona_id: tipo === 'salida' ? per.id : null,
      proveedor_id: tipo === 'entrada' ? prov?.id ?? (art.id ? c.fichas.get(art.id)?.proveedor_id ?? null : null) : null,
      albaran: tipo === 'entrada' ? albaran : null, auto, dudas,
    };
    out.push(pr); previa = pr;
  }
  return out;
}

/** Lo que falta para poder guardar una propuesta. */
export function faltan(p: Propuesta): string[] {
  const f: string[] = [];
  if (!p.articulo_id) f.push('artículo');
  if (!(p.cantidad !== null && (p.tipo === 'ajuste' ? p.cantidad >= 0 : p.cantidad > 0))) f.push('cantidad');
  if (!p.almacen_id) f.push('almacén');
  if (p.tipo === 'traslado' && (!p.destino_id || p.destino_id === p.almacen_id)) f.push('destino');
  return f;
}
