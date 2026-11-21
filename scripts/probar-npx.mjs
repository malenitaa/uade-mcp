// ¿`npx -y <paquete>` se actualiza solo cuando sale una versión nueva? Prueba reproducible, sin
// publicar nada y sin tocar tu caché de npm: levanta un registro de mentira en 127.0.0.1 con un
// paquete de juguete, "publica" la 1.1.0 después de haber corrido la 1.0.0 y mira qué versión corre
// cada comando. El resultado y lo que se decidió con él están en docs/ACTUALIZAR.md.
//
//   node scripts/probar-npx.mjs                      con el npx de tu PATH
//   NPX_CLI=/ruta/a/npm/bin/npx-cli.js node scripts/probar-npx.mjs   con otro npm
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const NOMBRE = 'paquete-de-juguete';
const raiz = mkdtempSync(join(tmpdir(), 'probar-npx-'));
const npx = process.env.NPX_CLI ? [process.execPath, [process.env.NPX_CLI]] : ['npx', []];

// Dos versiones del paquete: su único comando imprime la versión.
const versiones = {};
for (const v of ['1.0.0', '1.1.0']) {
  const dir = join(raiz, v);
  mkdirSync(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: NOMBRE, version: v, bin: 'bin.js' }));
  writeFileSync(join(dir, 'bin.js'), `#!/usr/bin/env node\nconsole.log('${v}');\n`);
  await exec('npm', ['pack', '--pack-destination', raiz], { cwd: dir });
  const tgz = readFileSync(join(raiz, `${NOMBRE}-${v}.tgz`));
  versiones[v] = { tgz, integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}` };
}

// El registro de mentira. `publicadas` y `maxAge` cambian durante la prueba. El registro real
// responde `cache-control: max-age=300`: npm no vuelve a preguntar por 5 minutos.
let publicadas = ['1.0.0'];
let maxAge = 300;
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tgz = req.url.match(/-(\d+\.\d+\.\d+)\.tgz$/);
  if (tgz) return res.end(versiones[tgz[1]].tgz);
  const manifiesto = (v) => ({ name: NOMBRE, version: v, bin: { [NOMBRE]: 'bin.js' }, dist: { tarball: `${base}/${NOMBRE}/-/${NOMBRE}-${v}.tgz`, integrity: versiones[v].integrity } });
  // Como el registro real: la versión resumida y la completa del documento se cachean por separado.
  res.setHeader('content-type', /install-v1/.test(req.headers.accept ?? '') ? 'application/vnd.npm.install-v1+json' : 'application/json');
  res.setHeader('vary', 'accept-encoding, accept');
  res.setHeader('cache-control', `public, max-age=${maxAge}`);
  res.end(JSON.stringify({ name: NOMBRE, 'dist-tags': { latest: publicadas.at(-1) }, versions: Object.fromEntries(publicadas.map((v) => [v, manifiesto(v)])) }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

let cache;
async function correr(...args) {
  const env = { ...process.env, npm_config_cache: cache, npm_config_registry: `http://127.0.0.1:${server.address().port}/`, npm_config_update_notifier: 'false', npm_config_audit: 'false' };
  try {
    return (await exec(npx[0], [...npx[1], '-y', ...args], { env, cwd: raiz })).stdout.trim();
  } catch (e) {
    return `falló (${String(e.stderr).trim().split('\n')[0]})`;
  }
}

// Cada caso arranca con una caché nueva donde ya se corrió la 1.0.0 con ese mismo comando.
async function caso(titulo, spec, { minutos, antes = async () => {} }, ...comando) {
  cache = mkdtempSync(join(raiz, 'cache-'));
  publicadas = ['1.0.0'];
  maxAge = minutos < 5 ? 300 : 0; // con 0, npm revalida: es lo que pasa cuando ya vencieron los 5 minutos
  const primera = await correr(spec);
  publicadas = ['1.0.0', '1.1.0'];
  await antes();
  console.log(`${titulo.padEnd(74)} ${primera} -> ${await correr(...comando)}`);
}

console.log(`npm ${(await exec(npx[0], [...npx[1], '--version'])).stdout.trim()}, node ${process.version}. Antes -> después de publicarse la 1.1.0:\n`);
await caso('npx -y paquete            (recién publicada, menos de 5 min)', NOMBRE, { minutos: 1 }, NOMBRE);
await caso('npx -y paquete            (pasados los 5 min)', NOMBRE, { minutos: 6 }, NOMBRE);
await caso('npx -y paquete@latest     (recién publicada, menos de 5 min)', `${NOMBRE}@latest`, { minutos: 1 }, `${NOMBRE}@latest`);
await caso('npx -y paquete@latest     (pasados los 5 min)', `${NOMBRE}@latest`, { minutos: 6 }, `${NOMBRE}@latest`);
await caso('npx -y paquete@1.0.0      (versión fijada, pasados los 5 min)', `${NOMBRE}@1.0.0`, { minutos: 6 }, `${NOMBRE}@1.0.0`);
await caso('npx -y paquete, y después npx -y paquete@latest (menos de 5 min)', NOMBRE, { minutos: 1 }, `${NOMBRE}@latest`);
await caso('npx -y paquete, y después npx -y paquete@1.1.0  (menos de 5 min)', NOMBRE, { minutos: 1 }, `${NOMBRE}@1.1.0`);
await caso('npx -y --prefer-online paquete@latest            (menos de 5 min)', NOMBRE, { minutos: 1 }, '--prefer-online', `${NOMBRE}@latest`);
await caso('borrar <caché de npm>/_npx y npx -y paquete      (menos de 5 min)', NOMBRE, { minutos: 1, antes: async () => rmSync(join(cache, '_npx'), { recursive: true }) }, NOMBRE);

server.close();
rmSync(raiz, { recursive: true, force: true });
