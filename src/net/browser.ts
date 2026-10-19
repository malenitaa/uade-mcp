// Encuentra un navegador Chromium instalado (Chrome, Edge, Brave o Chromium), para el login y
// para leer Teams. Se puede forzar con UADE_MCP_BROWSER=/ruta/al/navegador.
import { existsSync } from 'node:fs';

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

export function findBrowser(): string {
  const override = process.env.UADE_MCP_BROWSER;
  if (override) {
    if (!existsSync(override)) throw new Error(`UADE_MCP_BROWSER apunta a un archivo que no existe: ${override}`);
    return override;
  }
  const found = (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p));
  if (!found) {
    throw new Error('No encontré Chrome, Edge, Brave ni Chromium. Instalá uno o indicá la ruta con UADE_MCP_BROWSER=/ruta/al/navegador');
  }
  return found;
}
