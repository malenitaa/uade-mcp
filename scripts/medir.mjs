// Mide cuánto ocupa lo que el MCP le manda al agente: definiciones de tools (van en cada mensaje)
// y la respuesta típica de cada tool. ~4 caracteres por token es una aproximación razonable.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const c = new Client({ name: 'medir', version: '0' });
await c.connect(new StdioClientTransport({ command: 'node', args: [new URL('../dist/index.js', import.meta.url).pathname], stderr: 'ignore' }));
const tok = (s) => Math.round(s.length / 4);
const tools = (await c.listTools()).tools;
const instr = c.getInstructions() ?? '';
console.log(`instrucciones: ~${tok(instr)} tokens`);
console.log(`definiciones de ${tools.length} tools: ~${tok(JSON.stringify(tools))} tokens (en cada mensaje)`);
const casos = [
  ['webcampus_terms', {}], ['webcampus_class_offering', {}], ['webcampus_current_courses', {}], ['webcampus_transcript', {}], ['webcampus_account_balance', {}],
  ['webcampus_exam_schedule', {}], ['webcampus_course_calendar', {}], ['uade_enrollment_windows', {}],
  ['uade_academic_calendar', { filter: '3sedes' }],
];
let total = 0;
for (const [name, args] of casos) {
  const r = await c.callTool({ name, arguments: args });
  const t = tok(r.content[0].text); total += t;
  console.log(`${name.padEnd(28)} ~${String(t).padStart(5)} tokens${r.isError ? '  (ERROR: ' + r.content[0].text.slice(0, 60) + ')' : ''}`);
}
console.log(`total de esas respuestas: ~${total} tokens`);
await c.close();
