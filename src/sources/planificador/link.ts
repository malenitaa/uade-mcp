// Link a planuade.ar/misemana con las opciones del planificador (formato v1, ver
// facultades/docs/MISEMANA.md). Los datos van en el fragmento (#): el navegador no se los manda al
// servidor, así que Plan UADE no recibe nada; la página los lee y los guarda solo en ese navegador.
import { createHash } from 'node:crypto';
import { PLANUADE } from '../planuade/link.js';
import type { Combinacion } from './index.js';

export interface MetaSemana {
  carrera: string;
  generado: string; // dd/mm/aaaa hh:mm
  programacion: string | null; // aviso sobre de qué cuatrimestre es la programación
  filtros: string;
}

export function buildSemanaLink(combos: Combinacion[], meta: MetaSemana): string {
  if (!combos.length) throw new Error('No hay combinaciones para mostrar.');
  const cuerpo = {
    v: 1,
    origen: 'uade-mcp',
    carrera: meta.carrera.slice(0, 120),
    generado: meta.generado,
    programacion: meta.programacion ?? undefined,
    filtros: meta.filtros.slice(0, 120),
    opciones: combos.slice(0, 8).map((c) => ({
      dias: c.diasDeCursada,
      sedes: c.sedes,
      horasHueco: c.horasHueco,
      clases: c.clases.map((x) => ({ codigo: x.codigo, materia: x.materia, clase: x.clase, sede: x.sede, turno: x.turno, dias: x.dias, horario: x.horario, desde: x.desde, hasta: x.hasta })),
    })),
  };
  const h = createHash('sha256').update(JSON.stringify(cuerpo)).digest('hex');
  const payload = Buffer.from(JSON.stringify({ ...cuerpo, h }), 'utf8').toString('base64url');
  return `${PLANUADE}/misemana#semana=${payload}`;
}
