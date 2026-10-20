import { describe, expect, it, vi } from 'vitest';
import { ConfirmationError, DraftStore } from '../src/auth/confirm.js';

const params = { clase: 'ABC-123', sede: 'Monserrat' };

describe('escrituras en dos pasos', () => {
  it('ejecuta solo si el humano acepta', async () => {
    const store = new DraftStore();
    const d = store.preparar('mail.enviar', 'Alta en ABC-123', params);
    const elicit = vi.fn().mockResolvedValue('accept');
    await expect(store.confirmar(d.id, 'mail.enviar', elicit)).resolves.toEqual(params);
    expect(elicit).toHaveBeenCalledWith(expect.stringContaining('Alta en ABC-123'));
  });

  it.each(['decline', 'cancel'] as const)('no ejecuta si el humano responde %s', async (answer) => {
    const store = new DraftStore();
    const d = store.preparar('mail.enviar', 'x', params);
    await expect(store.confirmar(d.id, 'mail.enviar', async () => answer)).rejects.toThrow(ConfirmationError);
  });

  it('sin elicitation no hay escrituras', async () => {
    const store = new DraftStore();
    const d = store.preparar('mail.enviar', 'x', params);
    await expect(store.confirmar(d.id, 'mail.enviar', undefined)).rejects.toThrow('elicitation');
  });

  it('un borrador sirve una sola vez', async () => {
    const store = new DraftStore();
    const d = store.preparar('mail.enviar', 'x', params);
    await store.confirmar(d.id, 'mail.enviar', async () => 'accept');
    await expect(store.confirmar(d.id, 'mail.enviar', async () => 'accept')).rejects.toThrow('venció');
  });

  it('un borrador no se puede usar para otra acción', async () => {
    const store = new DraftStore();
    const d = store.preparar('mail.enviar', 'x', params);
    await expect(store.confirmar(d.id, 'teams.entregar', async () => 'accept')).rejects.toThrow('no corresponde');
  });

  it('los borradores vencen a los 5 minutos', async () => {
    let t = 0;
    const store = new DraftStore(() => t);
    const d = store.preparar('mail.enviar', 'x', params);
    t = 5 * 60 * 1000 + 1;
    await expect(store.confirmar(d.id, 'mail.enviar', async () => 'accept')).rejects.toThrow('venció');
  });
});
