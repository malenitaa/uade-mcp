// `uade-mcp instalar-navegador` y `uade-mcp borrar-navegador`: el Chromium propio del MCP, para quien
// no tiene Chrome, Edge ni Brave. La descarga (~190 MB) se confirma escribiendo "si" en la terminal.
import { createInterface } from 'node:readline/promises';
import { describirNavegador, elegirNavegador } from '../net/browser.js';
import { borrarNavegador, descripcionDescarga, instalarNavegador } from '../net/descargar-navegador.js';

export async function instalarNavegadorConConfirmacion(): Promise<void> {
  const actual = elegirNavegador();
  console.log(actual
    ? `Ya hay un navegador para el MCP: ${describirNavegador()}. Igual podés descargar el propio.`
    : 'No encontré Chrome, Edge ni Brave en esta compu (Safari no sirve: no se puede automatizar).');
  console.log('\n' + descripcionDescarga() + '\n');
  // Que lo escriba una persona: no se acepta por tubería (echo si | uade-mcp instalar-navegador).
  if (!process.stdin.isTTY) throw new Error('La descarga del navegador solo se confirma desde una terminal, escribiéndolo vos. También podés instalar Chrome, Edge o Brave.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = (await rl.question('¿Descargar el navegador propio del MCP? Escribí "si" para confirmar (cualquier otra cosa cancela): ')).trim().toLowerCase();
  rl.close();
  if (r !== 'si' && r !== 'sí') throw new Error('Cancelado. No se descargó nada.');
  await instalarNavegador({ log: console.log });
  console.log(`\nListo: ${describirNavegador()}.`);
}

export function borrarNavegadorCli(): void {
  const habia = borrarNavegador();
  console.log(habia ? 'Chromium propio del MCP borrado (~/.uade-mcp/browsers).' : 'No había un navegador descargado por el MCP (se borró la carpeta ~/.uade-mcp/browsers si existía).');
  if (!elegirNavegador()) console.log('Ahora no hay ningún navegador para el MCP: para iniciar sesión hace falta Chrome, Edge o Brave, o volver a correr instalar-navegador.');
}
