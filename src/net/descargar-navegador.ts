// Descarga un Chromium propio para el MCP (para quien solo tiene Safari). Lo hace el instalador de
// playwright-core (`playwright-core install chromium --no-shell`) en un proceso aparte, con
// PLAYWRIGHT_BROWSERS_PATH apuntando a <config>/browsers: no toca el sistema ni la caché global de
// Playwright. Es lo único que el MCP baja fuera de UADE y Microsoft: "Chrome for Testing" (la versión
// que fija playwright-core en su browsers.json) y el ffmpeg que el instalador agrega siempre, desde los
// servidores de Playwright (HOSTS_DESCARGA_NAVEGADOR). Antes de bajar nada se corre el instalador en
// modo --dry-run y se verifica que cada URL sea https a uno de esos hosts; si no, no se descarga.
//
// Integridad: Playwright no publica checksums de sus navegadores; su instalador verifica el tamaño
// (Content-Length) sobre HTTPS a su CDN. Acá además, al terminar, se corre el ejecutable con --version
// y se compara con la versión que declara playwright-core; si no coincide, se borra.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { browsersDir, navegadorDescargado } from './browser.js';
import { HOSTS_DESCARGA_NAVEGADOR, PolicyError } from './policy.js';

// Lo que pesa la descarga (zip de Chromium, 186 MB en mac-arm64 con playwright-core 1.64, más ffmpeg,
// 1,4 MB); descomprimido ocupa el doble (~370 MB). Es un valor para avisar antes de confirmar, no un tope.
export const TAMANO_APROX_MB = 190;
export const TAMANO_EN_DISCO_APROX_MB = 370;

const require = createRequire(import.meta.url);

function playwrightCore(): { cli: string; version: string; chromium: string } {
  const pkg = require.resolve('playwright-core/package.json');
  const dir = dirname(pkg);
  const browsers = JSON.parse(readFileSync(join(dir, 'browsers.json'), 'utf8')) as { browsers: { name: string; browserVersion?: string }[] };
  const chromium = browsers.browsers.find((b) => b.name === 'chromium')?.browserVersion ?? '';
  return { cli: join(dir, 'cli.js'), version: (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version, chromium };
}

export function descripcionDescarga(): string {
  const { chromium } = playwrightCore();
  return [
    `Se descarga Chromium ("Chrome for Testing" ${chromium}, el que usa Playwright), unos ${TAMANO_APROX_MB} MB de descarga (~${TAMANO_EN_DISCO_APROX_MB} MB en disco), desde los servidores de Playwright (${[...HOSTS_DESCARGA_NAVEGADOR].join(', ')}).`,
    'Queda en ~/.uade-mcp/browsers, solo para el MCP (no toca el sistema ni otros navegadores). Lo usa para la ventana de inicio de sesión, la renovación de la sesión y Teams.',
    'Se borra con: uade-mcp borrar-navegador.',
  ].join('\n');
}

// Variables con las que Playwright cambiaría de dónde baja o dónde deja los navegadores: no se
// heredan, así la descarga sale siempre de los hosts documentados y va a la carpeta del MCP.
const ENV_PROHIBIDA = /^(npm_config_|npm_package_config_)?(playwright_(download_host|chromium_download_host|firefox_download_host|webkit_download_host|cdn_mirrors|browsers_path|host_platform_override)|pw_test_cdn_that_should_work)$/i;

export function entornoDeDescarga(base: Record<string, string | undefined>, dir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !ENV_PROHIBIDA.test(k)) env[k] = v;
  env.PLAYWRIGHT_BROWSERS_PATH = dir;
  return env;
}

// URLs que imprime `install --dry-run` ("Download url:" y "Download fallback N:").
export function urlsDeDryRun(salida: string): string[] {
  return [...salida.matchAll(/^\s*Download (?:url|fallback \d+):\s*(\S+)/gm)].map((m) => m[1]!);
}

export function verificarUrlDeDescarga(raw: string): void {
  let u: URL;
  try { u = new URL(raw); } catch { throw new PolicyError('URL de descarga inválida'); }
  if (u.protocol !== 'https:') throw new PolicyError('la descarga del navegador solo va por https');
  if (!HOSTS_DESCARGA_NAVEGADOR.has(u.hostname.toLowerCase())) throw new PolicyError(`host de descarga fuera de la allowlist: ${u.hostname}`);
}

export interface Proceso { code: number | null; salida: string }
export type Correr = (cmd: string, args: string[], env: Record<string, string>, log: (l: string) => void, timeoutMs: number) => Promise<Proceso>;

const correr: Correr = (cmd, args, env, log, timeoutMs) =>
  new Promise((resolve, reject) => {
    const cp = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    let resto = '';
    const leer = (chunk: Buffer) => {
      salida += chunk.toString();
      resto += chunk.toString();
      const lineas = resto.split(/\r?\n/);
      resto = lineas.pop() ?? '';
      for (const l of lineas) if (l.trim()) log(l.trimEnd());
    };
    cp.stdout.on('data', leer);
    cp.stderr.on('data', leer);
    const t = setTimeout(() => { cp.kill(); reject(new Error('la descarga del navegador tardó demasiado')); }, timeoutMs);
    cp.on('error', (e) => { clearTimeout(t); reject(e); });
    cp.on('close', (code) => { clearTimeout(t); if (resto.trim()) log(resto); resolve({ code, salida }); });
  });

export interface OpcionesDescarga {
  log?: (linea: string) => void;
  // Para tests: reemplaza al instalador real.
  correr?: Correr;
}

// Descarga (si hace falta) y devuelve la ruta del ejecutable. Lento: minutos, según la conexión.
export async function instalarNavegador(op: OpcionesDescarga = {}): Promise<string> {
  const log = op.log ?? (() => {});
  const run = op.correr ?? correr;
  const { cli, version, chromium } = playwrightCore();
  const dir = browsersDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const env = entornoDeDescarga(process.env, dir);
  const args = [cli, 'install', 'chromium', '--no-shell'];

  // 1. Qué bajaría y de dónde, sin bajar nada: cada URL tiene que ser https a un host permitido.
  const plan = await run(process.execPath, [...args, '--dry-run'], env, () => {}, 60_000);
  if (plan.code !== 0) throw new Error('no pude planificar la descarga del navegador (playwright-core install --dry-run falló)');
  const urls = urlsDeDryRun(plan.salida);
  if (!urls.length) throw new Error('no pude planificar la descarga del navegador (sin URLs en el --dry-run)');
  for (const u of urls) verificarUrlDeDescarga(u);
  log(`Descargando Chromium ${chromium} (playwright-core ${version}) desde ${new URL(urls[0]!).hostname} a ${dir}…`);

  // 2. La descarga real, con el mismo entorno.
  const r = await run(process.execPath, args, env, log, 30 * 60_000);
  if (r.code !== 0) throw new Error('la descarga del navegador falló (revisá la conexión y volvé a intentar)');
  const ruta = navegadorDescargado();
  if (!ruta) throw new Error('la descarga terminó pero no encontré el ejecutable del navegador');

  // 3. Que lo que quedó sea el Chromium que playwright-core declara.
  const v = await run(ruta, ['--version'], env, () => {}, 30_000);
  if (chromium && !v.salida.includes(chromium)) {
    borrarNavegador();
    throw new Error('el navegador descargado no es la versión esperada; se borró. Volvé a intentar');
  }
  return ruta;
}

// Borra el Chromium propio (toda la carpeta <config>/browsers). true si había algo.
export function borrarNavegador(): boolean {
  const habia = navegadorDescargado() !== null;
  rmSync(browsersDir(), { recursive: true, force: true });
  return habia;
}
