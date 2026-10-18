// Arma el link de importación de PlanUADE (formato v1, ver facultades/docs/IMPORTAR.md).
// Los datos van en el fragmento (#), que el navegador no manda al servidor: el MCP no le habla
// a PlanUADE y PlanUADE no recibe el historial. La persona abre el link y confirma ahí.
import { createHash } from 'node:crypto';
import type { Historial, MateriaHistorial } from '../webcampus/parse.js';
import { PLANES, type Facultad } from './planes.js';

export const PLANUADE = 'https://planuade.ar';

type Estado = 'approved' | 'pending' | 'cursando';

interface MateriaLink {
  id: string;
  st: Estado;
  nota?: number;
  desde?: string;
  // Solo para mostrar en el diálogo cuando el código no está en el plan (equivalencias externas).
  nombre?: string;
}

export interface ImportLink {
  url: string;
  facultad: Facultad;
  carrera: string | null;
  resumen: { aprobadas: number; conNota: number; finalesPendientes: number; cursando: number; omitidas: number };
}

function toMateria(m: MateriaHistorial): MateriaLink | null {
  switch (m.situacion) {
    case 'aprobada':
    case 'equivalencia': {
      const out: MateriaLink = { id: m.codigo, st: 'approved' };
      if (m.situacion === 'equivalencia') out.nombre = m.nombre.slice(0, 120);
      if (m.nota !== null && m.nota >= 4 && m.nota <= 10) out.nota = m.nota;
      if (m.fechaAprobacion) out.desde = m.fechaAprobacion;
      return out;
    }
    case 'final_pendiente': {
      const out: MateriaLink = { id: m.codigo, st: 'pending' };
      if (m.fechaRegularizacion) out.desde = m.fechaRegularizacion;
      return out;
    }
    case 'cursando':
      return { id: m.codigo, st: 'cursando' };
    default:
      return null;
  }
}

export function buildImportLink(h: Historial & { plan: string }, facultadOverride?: Facultad): ImportLink {
  const destino = PLANES[h.plan];
  const facultad = facultadOverride ?? destino?.facultad;
  if (!facultad) {
    throw new Error(
      `El plan ${h.plan} no está en el mapa de PlanUADE. Preguntale a la persona de qué facultad es la carrera ` +
        'y volvé a llamar la tool con el parámetro facultad.',
    );
  }

  const materias = h.materias.map(toMateria).filter((m): m is MateriaLink => m !== null && /^[\w.-]{1,40}$/.test(m.id));
  const body = { v: 1, origen: 'uade-mcp', plan: h.plan, materias };
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const payload = Buffer.from(JSON.stringify({ ...body, h: hash }), 'utf8').toString('base64url');

  return {
    url: `${PLANUADE}/${facultad}#importar=${payload}`,
    facultad,
    carrera: destino?.carrera ?? null,
    resumen: {
      aprobadas: materias.filter((m) => m.st === 'approved').length,
      conNota: materias.filter((m) => m.nota !== undefined).length,
      finalesPendientes: materias.filter((m) => m.st === 'pending').length,
      cursando: materias.filter((m) => m.st === 'cursando').length,
      omitidas: h.materias.length - materias.length,
    },
  };
}
