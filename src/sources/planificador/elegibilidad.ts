// Qué materias podés cursar y qué finales podés rendir, cruzando el historial con las correlativas
// del plan (las dos cosas salen de WebCampus). Es un cálculo, no una interpretación del modelo.
//
// Regla para rendir: final pendiente (cursada regularizada) y todas las correlativas anteriores
// aprobadas. Para cursar UADE no publica la regla en WebCampus, así que no se inventa: se separa
// "todas las correlativas aprobadas" (podés cursar) de "alguna solo regularizada" (lo confirma PIA,
// que muestra solo las materias habilitadas).
import type { Correlativas, MateriaPlan } from '../webcampus/correlativas.js';
import type { MateriaHistorial } from '../webcampus/parse.js';

export interface Pendiente {
  codigo: string;
  nombre: string;
  anio: string | null;
  faltan?: string[]; // "código nombre (estado)"
}

export interface Elegibilidad {
  rendir: (Pendiente & { regularizada: string | null; venceRegularidad: string | null })[];
  rendirBloqueadas: Pendiente[];
  cursar: Pendiente[];
  cursarConRegularizadas: Pendiente[];
  // Les falta solo lo que estás cursando ahora: el próximo cuatrimestre, si lo aprobás o regularizás.
  cursarSiTerminasLoActual: Pendiente[];
  cursarBloqueadas: Pendiente[];
  cursando: string[];
  aprobadas: number;
  totalPlan: number;
}

const APROBADA = new Set<MateriaHistorial['situacion']>(['aprobada', 'equivalencia']);

const dosAnios = (iso: string | null): string | null => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return `${Number(a) + 2}-${m}-${d}`;
};

export function elegibilidad(historial: MateriaHistorial[], plan: Correlativas): Elegibilidad {
  const estado = new Map(historial.map((m) => [m.codigo, m]));
  const nombre = new Map(plan.materias.map((m) => [m.codigo, m.nombre]));
  const etiqueta = (c: string) => {
    const h = estado.get(c);
    const s = !h || h.situacion === 'sin_cursar' ? 'sin cursar' : h.situacion === 'final_pendiente' ? 'final pendiente' : h.situacion;
    return `${c} ${nombre.get(c) ?? h?.nombre ?? ''} (${s})`.replace(/\s+\(/, ' (');
  };
  const aprobada = (c: string) => APROBADA.has(estado.get(c)?.situacion ?? 'sin_cursar');
  const regularizada = (c: string) => estado.get(c)?.situacion === 'final_pendiente';
  const base = (m: MateriaPlan): Pendiente => ({ codigo: m.codigo, nombre: m.nombre, anio: m.anio });

  const r: Elegibilidad = { rendir: [], rendirBloqueadas: [], cursar: [], cursarConRegularizadas: [], cursarSiTerminasLoActual: [], cursarBloqueadas: [], cursando: [], aprobadas: 0, totalPlan: plan.materias.length };
  for (const m of plan.materias) {
    const h = estado.get(m.codigo);
    const s = h?.situacion ?? 'sin_cursar';
    const noAprobadas = m.anteriores.filter((c) => !aprobada(c));
    if (APROBADA.has(s)) { r.aprobadas++; continue; }
    if (s === 'cursando') { r.cursando.push(`${m.codigo} ${m.nombre}`); continue; }
    if (s === 'final_pendiente') {
      if (noAprobadas.length) r.rendirBloqueadas.push({ ...base(m), faltan: noAprobadas.map(etiqueta) });
      // El vencimiento lo publica WebCampus (mes/año); si no está, se calculan los 2 años desde la regularización.
      else r.rendir.push({ ...base(m), regularizada: h?.fechaRegularizacion ?? null, venceRegularidad: h?.vencimientoRegularidad ?? dosAnios(h?.fechaRegularizacion ?? null) });
      continue;
    }
    if (!noAprobadas.length) r.cursar.push(base(m));
    else if (noAprobadas.every(regularizada)) r.cursarConRegularizadas.push({ ...base(m), faltan: noAprobadas.map(etiqueta) });
    else if (noAprobadas.every((x) => regularizada(x) || estado.get(x)?.situacion === 'cursando')) r.cursarSiTerminasLoActual.push({ ...base(m), faltan: noAprobadas.map(etiqueta) });
    else r.cursarBloqueadas.push({ ...base(m), faltan: noAprobadas.map(etiqueta) });
  }
  return r;
}
