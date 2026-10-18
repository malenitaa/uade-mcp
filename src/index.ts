#!/usr/bin/env node
// Sin argumentos: servidor MCP por stdio. Con argumentos: CLI para el humano (login, permisos).
// Corre en la compu del estudiante; no abre puertos ni habla con ningún servidor propio.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadGranted, PERMISSIONS } from './auth/permissions.js';
import { runCli } from './cli/index.js';
import { registerPlanUadeTools } from './tools/planuade.js';
import { registerWebCampusTools } from './tools/webcampus.js';

const args = process.argv.slice(2);

if (args.length) {
  try {
    await runCli(args);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
} else {
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
  registerWebCampusTools(server, granted);
  registerPlanUadeTools(server, granted);

  await server.connect(new StdioServerTransport());
}
