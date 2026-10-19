// uade_refresh: discards the local cache (all of it or one topic) so the next answer is read fresh from UADE.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { cache } from '../cache/cache.js';
import { run } from './common.js';

const TEMAS = ['todo', 'cursada', 'asistencia', 'historial', 'cuenta', 'previos', 'planificacion', 'docentes', 'ventanas', 'oferta', 'calendario', 'seccion'] as const;

export function registerCacheTools(server: McpServer, granted: ReadonlySet<Permission>): void {
  server.registerTool(
    'uade_refresh',
    {
      title: 'Refresh data',
      description: 'Answers come from a local encrypted copy (each says when it was read). Call this when the student asks for the latest data, then call the tool again.',
      inputSchema: { topic: z.enum(TEMAS).default('todo') },
      annotations: { readOnlyHint: true },
    },
    ({ topic }) =>
      run(granted, 'webcampus.leer', async () => {
        const n = cache.clear(topic === 'todo' ? undefined : topic);
        return `Listo: descarté ${n} datos guardados${topic === 'todo' ? '' : ` de ${topic}`}. La próxima consulta los lee de UADE.`;
      }),
  );
}
