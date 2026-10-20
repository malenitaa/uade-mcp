// Resumen de inscripción (materia o previo): solo lectura, con las consecuencias de Finalizar.
// El MCP no inscribe: no hay ninguna función que envíe nada a PIA.
import { describe, expect, it } from 'vitest';
import * as alta from '../src/sources/pia/alta.js';
import { resumenClase, resumenPrevio, type FuentesClase, type FuentesPrevio } from '../src/sources/pia/alta.js';
import type { VentanaInscripcion } from '../src/sources/inscripciones/index.js';

const clase = {
  codigo: '3.4.082', materia: 'APLICACIONES INTERACTIVAS', sede: 'MONSERRAT', clase: '3376', regimen: 'SEMANAL', idioma: 'ESPAÑOL',
  turno: 'MAÑANA', anio: 'TERCER AÑO', dias: ['L'], horario: '07:45 - 11:45', desde: '2026-08-03', hasta: '2026-12-07', regimenAprobacion: 'TRABAJO FINAL OBLIGATORIO',
};
const vMaterias: VentanaInscripcion = { sede: 'Buenos Aires - Grado', nombre: 'Asignaturas Verano 2027', tipo: 'inscripcion', abierta: true, desde: '2026-10-05T12:00', hasta: '2027-02-28' };
const vPrevios: VentanaInscripcion = { sede: 'Buenos Aires - Grado', nombre: 'Exámenes Previos Noviembre/Diciembre 2026', tipo: 'examenes', abierta: true, desde: '2026-10-19T12:00', hasta: '2026-12-15' };
const fc = (over: Partial<FuentesClase> = {}): FuentesClase => ({ ventanas: async () => [vMaterias], oferta: async () => [clase], ...over });
const fp = (over: Partial<FuentesPrevio> = {}): FuentesPrevio => ({
  ventanas: async () => [vMaterias, vPrevios],
  examenes: async () => [{ sede: 'MONSERRAT', codigo: '3.4.131', materia: 'GESTIÓN DE PERSONAS', fecha: '2026-11-12', hora: '15:30', aula: null, clase: '21975', docentes: [] }],
  puedeRendir: async () => ({ ok: true }),
  ...over,
});

describe('resumen de materia', () => {
  it('clase, horario y fechas en dd/mm/aaaa, cierre de ventana, consecuencias y que Finalizar es de la persona', async () => {
    const r = await resumenClase(fc(), '3.4.082', '3376');
    for (const frag of ['todavía no se hizo nada', 'APLICACIONES INTERACTIVAS (3.4.082)', '3376 · MONSERRAT · turno MAÑANA · L 07:45 - 11:45', 'del 03/08/2026 al 07/12/2026', 'cierra el 28/02/2027', 'ventana de bajas', 'apretá Finalizar']) {
      expect(r).toContain(frag);
    }
  });
  it('sin ventana de materias abierta, o clase inexistente, no arma nada', async () => {
    await expect(resumenClase(fc({ ventanas: async () => [vPrevios] }), '3.4.082', '3376')).rejects.toThrow('ninguna ventana');
    await expect(resumenClase(fc(), '3.4.082', '9999')).rejects.toThrow('3376 (MONSERRAT, MAÑANA, L 07:45 - 11:45)');
  });
});

describe('resumen de previo', () => {
  it('fechas del cronograma, ventana y que se factura sin baja', async () => {
    const r = await resumenPrevio(fp(), '3.4.131');
    for (const frag of ['EXAMEN PREVIO', 'GESTIÓN DE PERSONAS (3.4.131)', 'MONSERRAT · 12/11/2026 15:30 · clase 21975', 'del 19/10/2026 12:00 al 15/12/2026', 'se factura el derecho a examen', 'no se puede dar de baja']) {
      expect(r).toContain(frag);
    }
  });
  it('sin ventana de previos, o si no se puede rendir, lo dice y no sigue', async () => {
    await expect(resumenPrevio(fp({ ventanas: async () => [vMaterias] }), '3.4.131')).rejects.toThrow('exámenes previos');
    await expect(resumenPrevio(fp({ puedeRendir: async () => ({ ok: false, motivo: 'faltan aprobar 3.4.001 X (sin cursar)' }) }), '3.4.131')).rejects.toThrow('no podés rendir 3.4.131: faltan aprobar');
  });
});

it('el módulo no exporta nada que envíe una inscripción', () => {
  expect(Object.keys(alta).sort()).toEqual(['resumenClase', 'resumenPrevio']);
});
