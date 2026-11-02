#!/usr/bin/env node
// Eval de elección de tool: arranca el servidor MCP por stdio, le pasa sus tools e instrucciones a
// Claude y, por cada pregunta de alumno de evals/preguntas.json, mira qué tool elegiría (no la
// ejecuta). Cada pregunta se corre varias veces por modelo y se mide el porcentaje de acierto.
// Sirve para mejorar nombres y descripciones de tools; no corre en CI (necesita clave y cuesta plata).
//
//   ANTHROPIC_API_KEY=... npm run evals -- [--modelos a,b] [--umbral 85] [--repeticiones 3]

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function flag(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
}
const modelos = flag('modelos', 'claude-haiku-5-5,claude-sonnet-5-5').split(',').map((m) => m.trim()).filter(Boolean);
const umbral = Number(flag('umbral', '85'));
const repeticiones = Number(flag('repeticiones', '3'));
const soloId = flag('solo', '');

if (!process.env.ANTHROPIC_API_KEY) {
  console.log(
    'No hay ANTHROPIC_API_KEY en el entorno, así que no se corre nada (cada corrida usa la API y cuesta plata).\n' +
      'Para correrlo: ANTHROPIC_API_KEY=sk-ant-... npm run evals\n' +
      'Flags: --modelos claude-haiku-5-5,claude-sonnet-5-5 · --umbral 85 · --repeticiones 3 · --solo <id>',
  );
  process.exit(0);
}
if (!existsSync(join(raiz, 'dist/index.js'))) {
  console.error('Falta dist/index.js: corré npm run build primero.');
  process.exit(1);
}

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { preguntas } = JSON.parse(readFileSync(join(raiz, 'evals/preguntas.json'), 'utf8'));
const set = soloId ? preguntas.filter((p) => p.id === soloId) : preguntas;
if (!set.length) { console.error(`No hay ninguna pregunta con id "${soloId}".`); process.exit(1); }

// El servidor arranca con una carpeta de datos vacía: no toca sesiones ni la copia local real.
const mcp = new Client({ name: 'uade-mcp-evals', version: '0' });
await mcp.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(raiz, 'dist/index.js')],
  env: { ...process.env, UADE_MCP_HOME: mkdtempSync(join(tmpdir(), 'uade-mcp-evals-')) },
  stderr: 'ignore',
}));
const system = mcp.getInstructions() ?? '';
const tools = (await mcp.listTools()).tools.map((t) => ({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema }));
await mcp.close();
console.log(`${tools.length} tools del servidor · ${set.length} preguntas · ${repeticiones} repeticiones · modelos: ${modelos.join(', ')}\n`);

const claude = new Anthropic();

async function elegir(modelo, pregunta) {
  const r = await claude.messages.create({
    model: modelo,
    max_tokens: 1024,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: pregunta }],
  });
  return r.content.filter((b) => b.type === 'tool_use').map((b) => ({ tool: b.name, args: b.input ?? {} }));
}

// Comparación flexible: sin tildes ni mayúsculas; un string esperado tiene que estar contenido en el
// real; un array esperado, cada elemento en el real; booleanos y números, iguales.
const plano = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function coincideValor(esperado, real) {
  if (real === undefined || real === null) return false;
  if (Array.isArray(esperado)) return Array.isArray(real) && esperado.every((e) => real.some((r) => plano(r).includes(plano(e))));
  if (typeof esperado === 'string') return typeof real === 'string' && plano(real).includes(plano(esperado));
  return esperado === real;
}
function acierta(aceptables, llamadas) {
  if (!aceptables.length) return llamadas.length === 0;
  const primera = llamadas[0];
  if (!primera) return false;
  return aceptables.some((a) => a.tool === primera.tool && Object.entries(a.args ?? {}).every(([k, v]) => coincideValor(v, primera.args[k])));
}
const describir = (llamadas) => (llamadas.length ? llamadas.map((l) => `${l.tool}(${JSON.stringify(l.args)})`).join(' → ') : 'ninguna');

// Corre todo con un poco de paralelismo para no tardar una eternidad ni pegarle de más a la API.
const tareas = [];
for (const modelo of modelos) for (const p of set) for (let i = 0; i < repeticiones; i++) tareas.push({ modelo, p });
const resultados = []; // { modelo, id, ok, llamadas }
let cursor = 0;
async function obrero() {
  while (cursor < tareas.length) {
    const { modelo, p } = tareas[cursor++];
    try {
      const llamadas = await elegir(modelo, p.pregunta);
      resultados.push({ modelo, id: p.id, ok: acierta(p.aceptables, llamadas), llamadas });
    } catch (err) {
      resultados.push({ modelo, id: p.id, ok: false, llamadas: [], error: err.message });
    }
    process.stdout.write(`\r${resultados.length}/${tareas.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, obrero));
console.log();

// Reporte: tabla por pregunta y por modelo, con lo que eligió cada modelo cuando falló.
const pct = (xs) => (xs.length ? Math.round((100 * xs.filter((r) => r.ok).length) / xs.length) : 0);
const de = (modelo, id) => resultados.filter((r) => r.modelo === modelo && (id === undefined || r.id === id));
const fuerte = modelos[modelos.length - 1]; // el último de la lista se toma como el modelo más capaz
const col = (s, n) => String(s).padEnd(n);
const ancho = Math.max(...set.map((p) => p.id.length), 8);
console.log(`${col('pregunta', ancho)}  ${modelos.map((m) => col(m, 18)).join('')}observación`);
const mejorar = [];
const fallanTodos = [];
for (const p of set) {
  const porModelo = modelos.map((m) => pct(de(m, p.id)));
  const fuerteAcierta = pct(de(fuerte, p.id)) >= 67;
  const alguienFalla = porModelo.some((x) => x < 67);
  let obs = '';
  if (porModelo.every((x) => x === 100)) obs = 'ok';
  else if (fuerteAcierta && alguienFalla) { obs = 'descripción a mejorar'; mejorar.push(p); }
  else if (porModelo.every((x) => x < 67)) { obs = 'fallan todos: revisar la pregunta o la descripción'; fallanTodos.push(p); }
  else obs = 'inestable';
  console.log(`${col(p.id, ancho)}  ${porModelo.map((x) => col(`${x}%`, 18)).join('')}${obs}`);
}
console.log(`${col('PROMEDIO', ancho)}  ${modelos.map((m) => col(`${pct(de(m))}%`, 18)).join('')}`);

const detalle = (p) => {
  console.log(`\n• ${p.id}: "${p.pregunta}"\n  esperado: ${p.aceptables.length ? p.aceptables.map((a) => `${a.tool}${a.args ? ' ' + JSON.stringify(a.args) : ''}`).join(' | ') : 'ninguna tool'}`);
  for (const m of modelos) {
    const fallos = de(m, p.id).filter((r) => !r.ok);
    if (fallos.length) console.log(`  ${m} eligió: ${fallos.map((r) => r.error ? `error: ${r.error}` : describir(r.llamadas)).join(' / ')}`);
  }
};
if (mejorar.length) {
  console.log(`\n== Descripción a mejorar (${fuerte} acierta, otro modelo no) ==`);
  mejorar.forEach(detalle);
}
if (fallanTodos.length) {
  console.log('\n== Fallan todos los modelos ==');
  fallanTodos.forEach(detalle);
}
const errores = resultados.filter((r) => r.error);
if (errores.length) console.log(`\n${errores.length} llamadas a la API fallaron (cuentan como error): ${[...new Set(errores.map((r) => r.error))].join(' | ')}`);

const promedio = pct(resultados);
console.log(`\nPromedio general: ${promedio}% (umbral ${umbral}%)`);
if (promedio < umbral) { console.error('Por debajo del umbral.'); process.exit(1); }
