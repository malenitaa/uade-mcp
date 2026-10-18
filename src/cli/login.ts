// `uade-mcp login`: abre un navegador visible, vos iniciás sesión con tu cuenta Microsoft de UADE
// (contraseña y MFA los escribís vos, en la página de Microsoft), y nos quedamos solo con las
// cookies de sesión de WebCampus e Inscripciones, que van al llavero. Este código nunca ve tu contraseña.
//
// Usa un perfil temporal: al cerrar no queda nada en disco (ni la sesión de Microsoft).
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { saveSession } from '../auth/store.js';
import { INSCRIPCIONES, INSCRIPCIONES_ACCOUNT } from '../sources/inscripciones/index.js';
import { SESSION_ACCOUNT, WEBCAMPUS } from '../sources/webcampus/client.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

// Cookies de analytics que no hacen falta para la sesión y no guardamos.
const TRACKING = /^(_ga|_gid|_hj|__utm|_fbp|_gcl)/;

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
    throw new Error(
      'No encontré Chrome, Edge, Brave ni Chromium. Instalá uno o indicá la ruta con UADE_MCP_BROWSER=/ruta/al/navegador',
    );
  }
  return found;
}

export async function login(): Promise<void> {
  const executablePath = findBrowser();
  console.log(
    [
      '',
      'Se va a abrir una ventana del navegador en WebCampus.',
      '  1. Iniciá sesión con tu cuenta de UADE (lo escribís vos, en la página de Microsoft).',
      '  2. Cuando veas tu WebCampus, la ventana se cierra sola.',
      '',
      'Qué se guarda: solo las cookies de sesión de WebCampus y de Inscripciones, en el llavero de tu sistema.',
      'Qué NO se guarda: tu contraseña, tu sesión de Microsoft ni el historial del navegador.',
      '',
    ].join('\n'),
  );

  const browser = await chromium.launch({ executablePath, headless: false, args: ['--no-first-run', '--no-default-browser-check'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEBCAMPUS}/Login.aspx`);
    // El botón "Entrar" solo redirige al login de Microsoft; no manda credenciales.
    await page.click('#ctl00_ContentPlaceHolderMain_btnEntrar').catch(() => {});
    await page.waitForURL((u) => u.origin === WEBCAMPUS && /\/homewc\.aspx$/i.test(u.pathname), { timeout: LOGIN_TIMEOUT_MS });

    const cookies = (await context.cookies(WEBCAMPUS)).filter((c) => !TRACKING.test(c.name));
    if (!cookies.some((c) => c.name === '.ASPXAUTH' || c.name === 'sessionuade')) {
      throw new Error('Se completó el login pero no apareció la cookie de sesión. No se guardó nada.');
    }
    saveSession(SESSION_ACCOUNT, cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    console.log(`Listo: sesión de WebCampus guardada en el llavero (${cookies.length} cookies: ${cookies.map((c) => c.name).join(', ')}).`);

    // Inscripciones usa el mismo login de Microsoft: con la sesión recién abierta entra solo.
    await page.goto(`${INSCRIPCIONES}/`);
    try {
      await page.waitForURL((u) => u.origin === INSCRIPCIONES && !/^\/account\//i.test(u.pathname), { timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      const ins = (await context.cookies(INSCRIPCIONES)).filter((c) => !TRACKING.test(c.name));
      if (ins.length) {
        saveSession(INSCRIPCIONES_ACCOUNT, ins.map((c) => `${c.name}=${c.value}`).join('; '));
        console.log(`Listo: sesión de Inscripciones guardada (${ins.length} cookies: ${ins.map((c) => c.name).join(', ')}).`);
      }
    } catch {
      console.log('No se pudo abrir Inscripciones (WebCampus quedó guardado igual). Las tools de inscripciones van a pedir login.');
    }
  } finally {
    await browser.close();
  }
}
