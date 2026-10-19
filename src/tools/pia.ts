// pia_prepare_enrollment (read-only) and pia_confirm_enrollment (write: own permission + human dialog).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Elicit } from '../auth/confirm.js';
import type { Permission } from '../auth/permissions.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { confirmarAlta, prepararAlta } from '../sources/pia/alta.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { READ_ONLY, run } from './common.js';

// La confirmación la responde la persona en un diálogo del cliente (MCP elicitation), no el modelo.
// Si el cliente no soporta diálogos, devuelve undefined y la escritura se rechaza (falla cerrado).
export function elicitDelCliente(server: McpServer): Elicit | undefined {
  if (!server.server.getClientCapabilities()?.elicitation) return undefined;
  return async (mensaje) => {
    const r = await server.server.elicitInput({
      message: mensaje,
      requestedSchema: {
        type: 'object',
        properties: { confirmar: { type: 'boolean', title: 'Confirmo la inscripción (no se puede deshacer)' } },
        required: ['confirmar'],
      },
    });
    if (r.action !== 'accept') return r.action === 'decline' ? 'decline' : 'cancel';
    return (r.content as { confirmar?: boolean } | undefined)?.confirmar === true ? 'accept' : 'decline';
  };
}

export function registerPiaTools(
  server: McpServer,
  granted: ReadonlySet<Permission>,
  wc = new WebCampus(),
  insc = new Inscripciones(),
  elicit: () => Elicit | undefined = () => elicitDelCliente(server),
): void {
  const fuentes = {
    ventanas: () => insc.ventanas(),
    oferta: async (materia: string) => wc.oferta(await insc.linkProgramacion(), materia),
  };

  server.registerTool(
    'pia_prepare_enrollment',
    {
      title: 'Prepare an enrollment (nothing is sent)',
      description:
        'Read-only. Checks an enrollment window is open, finds the class (code + class number from webcampus_class_offering) and returns the exact summary of what enrolling would do (campus, shift, schedule, dates, window deadline, charge, seat, not reversible) plus a draft id valid 5 minutes. Show the summary to the student verbatim. Nothing is enrolled.',
      inputSchema: { subject: z.string().regex(/^[A-Z]?\d+(\.\d+)+$/), classNumber: z.string().regex(/^\d+$/) },
      annotations: READ_ONLY,
    },
    ({ subject, classNumber }) => run(granted, 'pia.leer', () => prepararAlta(fuentes, subject, classNumber)),
  );

  server.registerTool(
    'pia_confirm_enrollment',
    {
      title: 'Confirm an enrollment (write)',
      description:
        'Write action. Needs the pia.inscribir permission (the student enables it in the terminal) and the student confirming in a client dialog; the model cannot confirm on its own. Only call it when the student explicitly asked to enroll after reading the summary. Never call it as a test.',
      inputSchema: { draftId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    ({ draftId }) => run(granted, 'pia.inscribir', () => confirmarAlta(draftId, elicit())),
  );
}
