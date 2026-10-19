// webcampus_section: reads any informational section of the WebCampus menu (page or PDF).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { SECCIONES, Secciones, type Seccion } from '../sources/webcampus/secciones.js';
import { READ_ONLY, run } from './common.js';

export function registerSeccionesTools(server: McpServer, granted: ReadonlySet<Permission>, sec = new Secciones()): void {
  const nombres = Object.keys(SECCIONES) as [Seccion, ...Seccion[]];
  server.registerTool(
    'webcampus_section',
    {
      title: 'WebCampus section',
      description: 'Text of an informational WebCampus section (page or official PDF, plus the PDF guides it links). normativa_academica = official academic rules (attendance %, regularity, exams, failed exams limits, deadlines): use it for any rules question. aranceles_pdf = official fee amounts per degree and shift. Also Wi-Fi setup per OS, fees and payment methods, MRI, rules, student guide, scholarships, minors, electives, honors, invoices, building entries, codes of conduct… Pass query (e.g. "macOS") to get only the relevant passages.',
      inputSchema: { section: z.enum(nombres), query: z.string().min(3).max(80).optional() },
      annotations: READ_ONLY,
    },
    ({ section, query }) => run(granted, 'webcampus.leer', () => sec.consultar(section, query)),
  );
}
