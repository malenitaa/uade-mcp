// planuade_link_importar: lee el historial de WebCampus y arma un link de PlanUADE.
// No escribe nada en ningún lado: la escritura la hace PlanUADE en el navegador de la persona,
// después de que ella acepta un diálogo. Por eso alcanza con el permiso de lectura.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requirePermission, type Permission } from '../auth/permissions.js';
import { buildImportLink } from '../sources/planuade/link.js';
import { FACULTADES } from '../sources/planuade/planes.js';
import { WebCampus } from '../sources/webcampus/index.js';

export function registerPlanUadeTools(server: McpServer, granted: ReadonlySet<Permission>, wc = new WebCampus()): void {
  server.registerTool(
    'planuade_link_importar',
    {
      title: 'Link para cargar tu historial en Plan UADE',
      description:
        'Lee el historial académico de WebCampus y arma un link de planuade.ar que, al abrirlo, ofrece marcar las ' +
        'materias aprobadas (con nota), con final pendiente y cursando. No modifica nada: la persona abre el link y ' +
        'confirma en Plan UADE. Dale el link completo a la persona tal cual, sin acortarlo ni pasarlo por otro servicio.',
      inputSchema: {
        plan: z.string().regex(/^\d+$/).optional().describe('código de plan, si la persona tiene más de una carrera'),
        facultad: z.enum(FACULTADES).optional().describe('solo si la tool lo pide porque no reconoce el plan'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ plan, facultad }) => {
      try {
        requirePermission(granted, 'webcampus.leer');
        const h = await wc.historial(plan);
        const link = buildImportLink(h, facultad);
        const r = link.resumen;
        const text = [
          `Carrera: ${h.carrera} (plan ${h.plan}) → planuade.ar/${link.facultad}`,
          `Incluye: ${r.aprobadas} aprobadas (${r.conNota} con nota), ${r.finalesPendientes} con final pendiente, ${r.cursando} cursando.`,
          '',
          'Link (abrilo en tu navegador; Plan UADE te muestra qué cambia y pide confirmación antes de aplicar):',
          link.url,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
      }
    },
  );
}
