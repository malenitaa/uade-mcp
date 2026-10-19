// Tabla de aranceles del PDF oficial (SharePoint ArchivosAranceles), que WebCampus enlaza desde
// Aranceles. Por carrera y turno trae tres valores: matrícula cuatrimestral, cuota mensual de
// referencia (5 materias de 68 hs) y cuota mensual por materia individual. El texto del PDF sale
// desordenado (títulos después de las filas), así que se leen las filas por su código de carrera:
// cada código aparece tres veces, en ese orden de tablas.
import { PageChangedError } from './parse.js';

export interface PorTurno {
  manana: number | null;
  tarde: number | null;
  noche: number | null;
}

export interface ArancelCarrera {
  codigo: string;
  carrera: string;
  facultad: string | null;
  campus: 'Buenos Aires' | 'Costa Argentina';
  matriculaCuatrimestral: PorTurno | null;
  cuotaMensual5Materias: PorTurno | null;
  cuotaMensualPorMateria: PorTurno | null;
}

export interface Aranceles {
  vigenciaDesde: string | null; // ISO
  derechoAdmision: number | null;
  derechoAdmisionCosta: number | null;
  carreras: ArancelCarrera[];
  notas: string[];
}

// Hoy el PDF trae ~140 carreras. Si un día salen muchas menos, cambió el formato y no hay que
// responder con una tabla a medias.
export const MIN_CARRERAS_ARANCEL = 40;

const VALOR = '(\\d{1,3}(?:\\.\\d{3})+|----)';
// código (P = Costa Argentina; los V = online se saltean: su fila no trae tres valores), nombre sin
// dígitos (así nunca se come el código de la fila siguiente) y tres valores.
const FILA = new RegExp(`(?<![\\d.])(P?\\d{1,4})\\s+([^\\d]{3,120}?)\\s+${VALOR}\\s+${VALOR}\\s+${VALOR}(?![\\d.])`, 'g');

const num = (s: string): number | null => (s === '----' ? null : Number(s.replace(/\./g, '')));
const limpiar = (s: string): string => s.replace(/\s+/g, ' ').replace(/\s*\(\*+\)\s*$/, '').trim();

export function parseAranceles(texto: string, minimoCarreras = MIN_CARRERAS_ARANCEL): Aranceles {
  const t = texto.replace(/\s+/g, ' ');
  const facultades: { pos: number; nombre: string }[] = [];
  for (const m of t.matchAll(/Facultad de [A-Za-zÁÉÍÓÚÑáéíóúñ ]+?(?= - Carreras| \(Online\)| Mañana| Cod)/g)) facultades.push({ pos: m.index!, nombre: m[0].trim() });
  const facultadEn = (pos: number): string | null => facultades.filter((f) => f.pos < pos).at(-1)?.nombre ?? null;

  const porCodigo = new Map<string, ArancelCarrera & { vistas: number }>();
  for (const m of t.matchAll(FILA)) {
    const [, codigo, nombre, a, b, c] = m as unknown as [string, string, string, string, string, string];
    if (/Cod\.|Facultad|Carreras|Turnos|Valor/.test(nombre)) continue; // encabezados pegados
    const valores: PorTurno = { manana: num(a), tarde: num(b), noche: num(c) };
    let fila = porCodigo.get(codigo);
    if (!fila) {
      fila = {
        codigo,
        carrera: limpiar(nombre),
        facultad: facultadEn(m.index!),
        campus: codigo.startsWith('P') ? 'Costa Argentina' : 'Buenos Aires',
        matriculaCuatrimestral: null,
        cuotaMensual5Materias: null,
        cuotaMensualPorMateria: null,
        vistas: 0,
      };
      porCodigo.set(codigo, fila);
    }
    const campo = (['matriculaCuatrimestral', 'cuotaMensual5Materias', 'cuotaMensualPorMateria'] as const)[fila.vistas];
    if (campo) fila[campo] = valores;
    fila.vistas++;
  }
  const carreras = [...porCodigo.values()].filter((f) => f.vistas >= 2).map(({ vistas: _v, ...f }) => f);
  if (carreras.length < minimoCarreras) {
    throw new PageChangedError(`tabla de aranceles (el PDF cambió de formato: ${carreras.length} carreras legibles; consultá el texto con webcampus_section aranceles_pdf)`);
  }

  const vig = t.match(/VIGENTES A PARTIR DEL (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const admision = t.match(/Derecho de Admisión (\d[\d.]*)/);
  const admisionCosta = t.match(/Derecho de Admisión - Costa Argentina (\d[\d.]*)/);
  const notas: string[] = [];
  const virtual = t.match(/Los aranceles del Turno Virtual[^.]+\.(?:[^.]+ONLINE\.)?/);
  if (virtual) notas.push(limpiar(virtual[0]));
  const sujeto = t.match(/El valor del arancel está sujeto a la fecha en la que se concreta su pago\.?/);
  if (sujeto) notas.push(sujeto[0]);
  return {
    vigenciaDesde: vig ? `${vig[3]}-${vig[2]!.padStart(2, '0')}-${vig[1]!.padStart(2, '0')}` : null,
    derechoAdmision: admision ? num(admision[1]!) : null,
    derechoAdmisionCosta: admisionCosta ? num(admisionCosta[1]!) : null,
    carreras,
    notas,
  };
}

const ABREV: Record<string, string> = { tec: 'tecnologia', inf: 'informacion', adm: 'administracion', cs: 'ciencias', lic: 'lic', ing: 'ingenieria', gest: 'gestion' };
const tokens = (s: string): string[] =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(plan[^)]*\)/g, '').split(/[^a-z0-9]+/)
    .map((x) => ABREV[x] ?? x).filter((x) => x.length > 2 && !['del', 'las', 'los', 'con', 'por', 'para'].includes(x));

// Puntaje 0..1: qué parte de las palabras de la consulta aparece (por prefijo) en el nombre de la
// carrera. Sirve tanto para "gestion de tecnologia" como para el nombre abreviado de WebCampus.
export function coincidencia(consulta: string, carrera: string): number {
  const q = tokens(consulta);
  const c = tokens(carrera);
  if (!q.length) return 0;
  const ok = q.filter((w) => c.some((x) => x.startsWith(w) || w.startsWith(x))).length;
  return ok / q.length;
}

export function buscarCarrera(a: Aranceles, consulta: string, maximo = 5): ArancelCarrera[] {
  const costa = /costa|pinamar/i.test(consulta);
  return a.carreras
    .map((c) => ({ c, p: coincidencia(consulta, c.carrera) }))
    .filter(({ c, p }) => p >= 0.6 && (costa || c.campus === 'Buenos Aires'))
    .sort((x, y) => y.p - x.p || x.c.carrera.length - y.c.carrera.length)
    .slice(0, maximo)
    .map(({ c }) => c);
}
