// Circuito de alta en PIA: preparar es solo lectura; confirmar exige borrador válido, un solo uso,
// y la confirmación del humano. El envío real nunca se ejecuta en tests: el ejecutor es un mock.
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationError } from '../src/auth/confirm.js';
import { confirmarAlta, ejecutarAltaReal, prepararAlta, type Fuentes } from '../src/sources/pia/alta.js';

const clase = {
  codigo: '3.4.082', materia: 'APLICACIONES INTERACTIVAS', sede: 'MONSERRAT', clase: '3376', regimen: 'SEMANAL', idioma: 'ESPAÑOL',
  turno: 'MAÑANA', anio: 'TERCER AÑO', dias: ['L'], horario: '07:45 - 11:45', desde: '2026-08-03', hasta: '2026-12-07', regimenAprobacion: 'TRABAJO FINAL OBLIGATORIO',
};
const ventanaAbierta = { sede: 'Buenos Aires - Grado', nombre: 'Asignaturas Verano 2027', tipo: 'inscripcion' as const, abierta: true, desde: '2026-10-05T12:00', hasta: '2027-02-28' };
const fuentes = (over: Partial<Fuentes> = {}): Fuentes => ({ ventanas: async () => [ventanaAbierta], oferta: async () => [clase], ...over });

describe('preparar alta', () => {
  it('arma el resumen exacto, en dd/mm/aaaa, con las consecuencias, sin enviar nada', async () => {
    const b = await prepararAlta(fuentes(), '3.4.082', '3376');
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const frag of ['todavía no se hizo nada', 'APLICACIONES INTERACTIVAS (3.4.082)', '3376 · MONSERRAT · turno MAÑANA · L 07:45 - 11:45', 'del 03/08/2026 al 07/12/2026', 'cierra el 28/02/2027', 'genera un cargo', 'ocupa un cupo', 'NO se puede dar de baja', 'pia.inscribir']) {
      expect(b.resumen).toContain(frag);
    }
  });

  it('sin ventana abierta no prepara nada', async () => {
    await expect(prepararAlta(fuentes({ ventanas: async () => [{ ...ventanaAbierta, abierta: false }] }), '3.4.082', '3376')).rejects.toThrow('ninguna ventana');
    await expect(prepararAlta(fuentes({ ventanas: async () => [{ ...ventanaAbierta, tipo: 'bajas_o_cambios' }] }), '3.4.082', '3376')).rejects.toThrow('ninguna ventana');
  });

  it('clase inexistente: lista las que hay', async () => {
    await expect(prepararAlta(fuentes(), '3.4.082', '9999')).rejects.toThrow('3376 (MONSERRAT, MAÑANA, L 07:45 - 11:45)');
  });
});

describe('confirmar alta', () => {
  it('solo ejecuta si la persona acepta en el diálogo, y pasa los params del borrador', async () => {
    const b = await prepararAlta(fuentes(), '3.4.082', '3376');
    const ejecutar = vi.fn(async (p) => ({ ok: true, p }));
    const elicit = vi.fn(async () => 'accept' as const);
    await expect(confirmarAlta(b.id, elicit, ejecutar)).resolves.toMatchObject({ ok: true, p: { materia: '3.4.082', clase: '3376', ventana: 'Asignaturas Verano 2027' } });
    expect(elicit).toHaveBeenCalledWith(expect.stringContaining('APLICACIONES INTERACTIVAS'));
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it.each(['decline', 'cancel'] as const)('si la persona responde %s, no ejecuta', async (resp) => {
    const b = await prepararAlta(fuentes(), '3.4.082', '3376');
    const ejecutar = vi.fn();
    await expect(confirmarAlta(b.id, async () => resp, ejecutar)).rejects.toThrow(ConfirmationError);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('sin soporte de diálogos del cliente, se rechaza (falla cerrado)', async () => {
    const b = await prepararAlta(fuentes(), '3.4.082', '3376');
    const ejecutar = vi.fn();
    await expect(confirmarAlta(b.id, undefined, ejecutar)).rejects.toThrow('elicitation');
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('un borrador sirve una sola vez y uno inventado no sirve', async () => {
    const b = await prepararAlta(fuentes(), '3.4.082', '3376');
    const ejecutar = vi.fn(async () => 'ok');
    await confirmarAlta(b.id, async () => 'accept', ejecutar);
    await expect(confirmarAlta(b.id, async () => 'accept', ejecutar)).rejects.toThrow('venció');
    await expect(confirmarAlta('00000000-0000-4000-8000-000000000000', async () => 'accept', ejecutar)).rejects.toThrow(ConfirmationError);
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it('el ejecutor real NO está conectado: falla cerrado sin simular éxito', async () => {
    await expect(ejecutarAltaReal({ materia: '3.4.082', clase: '3376', ventana: 'x' })).rejects.toThrow('no está conectada');
  });
});
