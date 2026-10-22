// Planificador de cursada: dadas las clases ofertadas de varias materias, arma las combinaciones
// (una clase por materia) que no se solapan en día y horario, y las ordena por comodidad: menos
// días de cursada, menos huecos entre clases y menos sedes distintas. Puro, sin red: la oferta la
// trae WebCampus y acá solo se combina. PIA permite hasta seis materias por inscripción.
import type { ClaseOfertada } from '../webcampus/parse.js';

export const MAX_MATERIAS = 6;
// 4 materias reales exploran ~18.000 nodos en 90 ms; 6 materias caben acá sin truncar.
const MAX_COMBINACIONES_EXPLORADAS = 500_000;
const DIAS = ['L', 'M', 'MI', 'J', 'V', 'S', 'D'];

export interface Filtros {
  turnos?: string[]; // MAÑANA, TARDE, NOCHE, ONLINE…
  dias?: string[]; // L, M, MI, J, V, S
  sedes?: string[];
}

export interface Combinacion {
  clases: ClaseOfertada[];
  diasDeCursada: string[];
  sedes: string[];
  horasHueco: number; // suma de huecos entre clases del mismo día, en horas
  puntaje: number; // menor es mejor
}

export interface Resultado {
  combinaciones: Combinacion[];
  exploradas: number;
  truncado: boolean;
  // Materias sin ninguna clase que pase los filtros (no entran en las combinaciones).
  sinClases: string[];
  // Cuando no hay ninguna combinación completa: pares de materias cuyas clases chocan siempre.
  conflictos: string[];
}

const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function rangoHorario(c: ClaseOfertada): [number, number] | null {
  const m = c.horario?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  return m ? [minutos(m[1]!), minutos(m[2]!)] : null;
}

const fechasSolapan = (a: ClaseOfertada, b: ClaseOfertada): boolean => {
  if (!a.desde || !a.hasta || !b.desde || !b.hasta) return true; // sin fechas, se asume que sí
  return a.desde <= b.hasta && b.desde <= a.hasta;
};

// Dos clases chocan si comparten algún día, sus horarios se pisan y sus cursadas coinciden en el tiempo.
// Las clases sin horario (online asincrónico) nunca chocan.
export function solapan(a: ClaseOfertada, b: ClaseOfertada): boolean {
  const ra = rangoHorario(a);
  const rb = rangoHorario(b);
  if (!ra || !rb) return false;
  if (!a.dias.some((d) => b.dias.includes(d))) return false;
  if (!fechasSolapan(a, b)) return false;
  return ra[0] < rb[1] && rb[0] < ra[1];
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// Los cursos intensivos (Campus Costa Argentina, en verano) no se mezclan con la cursada semanal:
// solo entran si se piden por turno (INTENSIVO) o por sede (Pinamar / Costa).
// Mañana, tarde o noche según la hora de inicio; null si la clase no tiene horario.
export function turnoPorHora(c: ClaseOfertada): 'MAÑANA' | 'TARDE' | 'NOCHE' | null {
  const r = rangoHorario(c);
  if (!r) return null;
  return r[0] < 13 * 60 ? 'MAÑANA' : r[0] < 18 * 60 ? 'TARDE' : 'NOCHE';
}

export function esIntensivo(c: ClaseOfertada): boolean {
  return /INTENSIV/.test(norm(c.turno)) || /PINAMAR|COSTA/.test(norm(c.sede));
}

export function pasaFiltros(c: ClaseOfertada, f: Filtros): boolean {
  const pideIntensivo = f.turnos?.some((t) => /INTENSIV/.test(norm(t))) || f.sedes?.some((s) => /PINAMAR|COSTA/.test(norm(s)));
  if (esIntensivo(c) && !pideIntensivo) return false;
  if (f.turnos?.length && !f.turnos.some((t) => norm(c.turno).includes(norm(t)))) {
    // WebCampus clasifica las clases online con turno "ONLINE": pedir "noche" tiene que incluir la
    // online de 18:30. Pasa por su horario; sin horario (asincrónica), pasa cualquier turno pedido.
    const th = /ONLINE|VIRTUAL/.test(norm(c.turno)) ? turnoPorHora(c) : 'NO';
    if (th === 'NO' || (th !== null && !f.turnos.some((t) => norm(t) === norm(th)))) return false;
  }
  if (f.sedes?.length && !f.sedes.some((s) => norm(c.sede).includes(norm(s)))) return false;
  if (f.dias?.length) {
    const permitidos = new Set(f.dias.map(norm));
    if (c.dias.some((d) => !permitidos.has(norm(d)))) return false;
  }
  return true;
}

function evaluar(clases: ClaseOfertada[]): Omit<Combinacion, 'clases'> {
  const porDia = new Map<string, [number, number][]>();
  for (const c of clases) {
    const r = rangoHorario(c);
    if (!r) continue;
    for (const d of c.dias) porDia.set(d, [...(porDia.get(d) ?? []), r]);
  }
  let huecos = 0;
  for (const rangos of porDia.values()) {
    rangos.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < rangos.length; i++) huecos += Math.max(0, rangos[i]![0] - rangos[i - 1]![1]);
  }
  const diasDeCursada = [...porDia.keys()].sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
  const sedes = [...new Set(clases.map((c) => c.sede))].sort();
  const horasHueco = Math.round((huecos / 60) * 10) / 10;
  // Un día más de cursada pesa como 3 h de hueco; una sede más, como 2 h.
  const puntaje = diasDeCursada.length * 3 + horasHueco + (sedes.length - 1) * 2;
  return { diasDeCursada, sedes, horasHueco, puntaje };
}

const nombre = (c: ClaseOfertada): string => `${c.materia} (${c.codigo})`;

export function planificar(oferta: Map<string, ClaseOfertada[]>, filtros: Filtros = {}, maximo = 5): Resultado {
  if (oferta.size > MAX_MATERIAS) throw new Error(`Como máximo ${MAX_MATERIAS} materias (es el tope de PIA).`);
  const sinClases: string[] = [];
  const grupos: ClaseOfertada[][] = [];
  const orden = [...oferta.keys()];
  for (const [codigo, clases] of oferta) {
    const ok = clases.filter((c) => pasaFiltros(c, filtros));
    if (ok.length) grupos.push(ok);
    else sinClases.push(codigo);
  }
  // Las materias con menos opciones van primero: poda antes.
  grupos.sort((a, b) => a.length - b.length);

  const combinaciones: Combinacion[] = [];
  let exploradas = 0;
  let truncado = false;
  const actual: ClaseOfertada[] = [];
  const rec = (i: number): void => {
    if (truncado) return;
    if (i === grupos.length) {
      if (actual.length) {
        // Se devuelven en el orden en que se pidieron las materias, no en el de la poda.
        const clases = [...actual].sort((a, b) => orden.indexOf(a.codigo) - orden.indexOf(b.codigo));
        combinaciones.push({ clases, ...evaluar(actual) });
      }
      return;
    }
    for (const c of grupos[i]!) {
      if (++exploradas > MAX_COMBINACIONES_EXPLORADAS) { truncado = true; return; }
      if (actual.some((x) => solapan(x, c))) continue;
      actual.push(c);
      rec(i + 1);
      actual.pop();
    }
  };
  if (grupos.length) rec(0);
  combinaciones.sort((a, b) => a.puntaje - b.puntaje);

  const conflictos: string[] = [];
  if (!combinaciones.length && grupos.length > 1) {
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const compatibles = grupos[i]!.some((a) => grupos[j]!.some((b) => !solapan(a, b)));
        if (!compatibles) conflictos.push(`${nombre(grupos[i]![0]!)} y ${nombre(grupos[j]![0]!)} chocan en todas sus clases`);
      }
    }
  }
  return { combinaciones: combinaciones.slice(0, maximo), exploradas, truncado, sinClases, conflictos };
}

// Opciones variadas: la mejor de cada combinación de sedes (todo en Monserrat, Monserrat y Belgrano,
// online…), ordenadas por puntaje. Sin esto, todas las opciones salen en la sede que más clases tiene.
export function variadas(combos: Combinacion[], maximo = 5): Combinacion[] {
  const porSedes = new Map<string, Combinacion[]>();
  for (const c of combos) {
    const k = c.sedes.join('+');
    const g = porSedes.get(k);
    if (g) g.push(c); else porSedes.set(k, [c]);
  }
  const elegidas: Combinacion[] = [];
  // Primero la mejor de cada grupo de sedes; después se completa con las siguientes mejores.
  const grupos = [...porSedes.values()].sort((a, b) => a[0]!.puntaje - b[0]!.puntaje);
  for (let ronda = 0; elegidas.length < maximo; ronda++) {
    let agregada = false;
    for (const g of grupos) {
      if (g[ronda] && elegidas.length < maximo) { elegidas.push(g[ronda]!); agregada = true; }
    }
    if (!agregada) break;
  }
  return elegidas.sort((a, b) => a.puntaje - b.puntaje);
}

// Dónde y en qué turnos se dicta cada materia (para elegir sede con datos).
export function sedesPorMateria(oferta: Map<string, ClaseOfertada[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [codigo, clases] of oferta) {
    const m = new Map<string, Set<string>>();
    for (const c of clases) {
      if (!m.has(c.sede)) m.set(c.sede, new Set());
      m.get(c.sede)!.add(c.turno.toLowerCase());
    }
    out[codigo] = [...m].map(([sede, turnos]) => `${sede} (${[...turnos].join(', ')})`);
  }
  return out;
}
