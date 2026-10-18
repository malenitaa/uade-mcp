#!/usr/bin/env node
// Servidor MCP por stdio. Corre en la compu del estudiante; no abre puertos ni habla con
// ningún servidor propio. Las tools de WebCampus y PIA se suman en src/tools/.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadGranted, PERMISSIONS } from './auth/permissions.js';

const server = new McpServer({ name: 'uade-mcp', version: '0.0.1' });
const granted = await loadGranted();

server.registerTool(
  'uade_estado',
  {
    title: 'Estado y permisos del MCP de UADE',
    description: 'Muestra qué permisos están habilitados. No lee datos de UADE.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const lines = Object.entries(PERMISSIONS).map(
      ([p, desc]) => `${granted.has(p as keyof typeof PERMISSIONS) ? '✅' : '⛔'} ${p}: ${desc}`,
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

await server.connect(new StdioServerTransport());
