// Escrituras en dos pasos: preparar → confirmar.
// La confirmación la da el humano por MCP elicitation (un diálogo del cliente),
// así el modelo no puede contestarse a sí mismo. Sin elicitation, no hay escrituras.
import { createHash, randomUUID } from 'node:crypto';
import type { Permission } from './permissions.js';

const DRAFT_TTL_MS = 5 * 60 * 1000;

export interface Draft<P> {
  id: string;
  permission: Permission;
  resumen: string;
  params: P;
  hash: string;
  expiresAt: number;
}

export type Elicit = (mensaje: string) => Promise<'accept' | 'decline' | 'cancel'>;

export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

function hashParams(permission: Permission, params: unknown): string {
  return createHash('sha256').update(permission).update(JSON.stringify(params)).digest('hex');
}

export class DraftStore {
  private readonly drafts = new Map<string, Draft<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  preparar<P>(permission: Permission, resumen: string, params: P): Draft<P> {
    this.purge();
    const draft: Draft<P> = {
      id: randomUUID(),
      permission,
      resumen,
      params,
      hash: hashParams(permission, params),
      expiresAt: this.now() + DRAFT_TTL_MS,
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  // Consume el borrador (un solo uso) y pide confirmación al humano.
  async confirmar<P>(id: string, permission: Permission, elicit: Elicit | undefined): Promise<P> {
    const draft = this.drafts.get(id) as Draft<P> | undefined;
    this.drafts.delete(id);

    if (!draft || draft.expiresAt < this.now()) {
      throw new ConfirmationError('El borrador no existe o venció. Hay que prepararlo de nuevo.');
    }
    if (draft.permission !== permission || draft.hash !== hashParams(permission, draft.params)) {
      throw new ConfirmationError('El borrador no corresponde a esta acción.');
    }
    if (!elicit) {
      throw new ConfirmationError(
        'Tu cliente MCP no soporta confirmaciones (elicitation), así que las escrituras están deshabilitadas.',
      );
    }

    const answer = await elicit(`${draft.resumen}\n\n¿Confirmás esta acción?`);
    if (answer !== 'accept') throw new ConfirmationError('No confirmaste la acción. No se hizo nada.');
    return draft.params;
  }

  private purge(): void {
    const t = this.now();
    for (const [id, d] of this.drafts) if (d.expiresAt < t) this.drafts.delete(id);
  }
}
