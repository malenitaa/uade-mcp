// Qué navegador Chromium usa el MCP para el login y para leer Teams. Por orden:
//   1. UADE_MCP_BROWSER=/ruta/al/navegador (si la persona lo fuerza).
//   2. Chrome, Edge, Brave o Chromium instalados en el sistema.
//   3. El Chromium propio que el MCP descargó en <config>/browsers (ver descargar-navegador.ts),
//      para quien solo tiene Safari.
// Si no hay ninguno, falla con un error que dice cómo descargarlo.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../auth/permissions.js';
import { ErrorDeUso } from '../error-de-uso.js';

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

// Dónde queda el ejecutable dentro de la carpeta que descarga Playwright (chromium-<revisión>/…).
// Es la misma tabla que usa playwright-core ("Chrome for Testing").
const EJECUTABLE_DESCARGADO: Record<string, string[]> = {
  'darwin-arm64': ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  'darwin-x64': ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  'win32-x64': ['chrome-win64', 'chrome.exe'],
  'linux-x64': ['chrome-linux64', 'chrome'],
  'linux-arm64': ['chrome-linux-arm64', 'chrome'],
};

export const COMANDO_INSTALAR = 'uade-mcp instalar-navegador';

export type Origen = 'UADE_MCP_BROWSER' | 'instalado' | 'descargado';

export interface Navegador {
  ruta: string;
  origen: Origen;
  nombre: string; // "Google Chrome", "Chromium propio del MCP"…
}

// Carpeta del Chromium propio: <config>/browsers (PLAYWRIGHT_BROWSERS_PATH al descargar).
export function browsersDir(): string {
  return join(configDir(), 'browsers');
}

export interface Entorno {
  plataforma: string; // process.platform
  arquitectura: string; // process.arch
  env: Record<string, string | undefined>;
  existe: (ruta: string) => boolean;
  listar: (dir: string) => string[]; // nombres dentro de un directorio ([] si no existe)
  browsersDir: string;
}

export function entornoReal(): Entorno {
  return {
    plataforma: process.platform,
    arquitectura: process.arch,
    env: process.env,
    existe: existsSync,
    listar: (dir) => { try { return readdirSync(dir); } catch { return []; } },
    browsersDir: browsersDir(),
  };
}

function nombreDeRuta(ruta: string): string {
  return ruta.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? 'navegador';
}

// El Chromium descargado, si está completo. Playwright lo deja en chromium-<revisión>/ con un
// marcador INSTALLATION_COMPLETE; si hay más de uno (quedó uno viejo), se usa el de revisión más alta.
export function navegadorDescargado(e: Entorno = entornoReal()): string | null {
  const tokens = EJECUTABLE_DESCARGADO[`${e.plataforma}-${e.arquitectura}`];
  if (!tokens) return null;
  const carpetas = e.listar(e.browsersDir)
    .filter((n) => /^chromium(_[a-z0-9]+_special)?-\d+$/.test(n))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const c of carpetas) {
    const dir = join(e.browsersDir, c);
    const ruta = join(dir, ...tokens);
    if (e.existe(join(dir, 'INSTALLATION_COMPLETE')) && e.existe(ruta)) return ruta;
  }
  return null;
}

export function elegirNavegador(e: Entorno = entornoReal()): Navegador | null {
  const override = e.env.UADE_MCP_BROWSER;
  if (override) {
    if (!e.existe(override)) throw new ErrorDeUso(`UADE_MCP_BROWSER apunta a un archivo que no existe: ${override}`);
    return { ruta: override, origen: 'UADE_MCP_BROWSER', nombre: nombreDeRuta(override) };
  }
  const instalado = (CANDIDATES[e.plataforma] ?? []).find((p) => e.existe(p));
  if (instalado) return { ruta: instalado, origen: 'instalado', nombre: nombreDeRuta(instalado) };
  const descargado = navegadorDescargado(e);
  if (descargado) return { ruta: descargado, origen: 'descargado', nombre: 'Chromium propio del MCP' };
  return null;
}

export class NavegadorFaltante extends Error {
  constructor() {
    super(
      'No encontré Chrome, Edge, Brave ni Chromium en esta compu, y el MCP todavía no descargó su navegador propio. ' +
        `Opciones: instalar uno de esos, o dejar que el MCP descargue un Chromium propio (en una terminal: ${COMANDO_INSTALAR}; ` +
        'o la tool uade_login con descargarNavegador: true, después de que la persona lo confirme), o indicar la ruta con UADE_MCP_BROWSER=/ruta/al/navegador.',
    );
    this.name = 'NavegadorFaltante';
  }
}

export function findBrowser(e: Entorno = entornoReal()): string {
  const n = elegirNavegador(e);
  if (!n) throw new NavegadorFaltante();
  return n.ruta;
}

// Para doctor/estado: qué navegador se usa, sin rutas (una ruta lleva el nombre de usuario de la compu).
export function describirNavegador(e: Entorno = entornoReal()): string {
  const n = elegirNavegador(e);
  if (!n) return 'ninguno (corré ' + COMANDO_INSTALAR + ' o instalá Chrome, Edge o Brave)';
  const origen = { UADE_MCP_BROWSER: 'indicado con UADE_MCP_BROWSER', instalado: 'instalado en el sistema', descargado: 'descargado por el MCP en ~/.uade-mcp/browsers' }[n.origen];
  return `${n.nombre} (${origen})`;
}
