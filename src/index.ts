#!/usr/bin/env node
// No arguments: MCP server over stdio. With arguments: CLI for the student (login, permissions).
// Runs on the student's computer; opens no ports and talks to no server of ours.
import './node-version.js'; // primero: en Node < 22 sale acá, antes de cargar pdf.js
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runCli } from './cli/index.js';
import { iniciarSesion } from './auth/login.js';
import { setRenovador } from './net/session.js';
import { crearServidor } from './servidor.js';

const args = process.argv.slice(2);

if (args.length) {
  try {
    await runCli(args);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
} else {
  const server = await crearServidor({ name: 'uade-mcp', version: '0.7.1' });
  // WebCampus vence cada ~3 h: cuando una tool se encuentra la sesión vencida, se renueva sola
  // (sin ventana, con la sesión de Microsoft que recuerda el perfil del navegador) y se reintenta.
  setRenovador(async () => (await iniciarSesion({ interactivo: false })).ok);
  await server.connect(new StdioServerTransport());
}
