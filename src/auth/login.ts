// Inicio de sesión en UADE con un navegador propio del MCP. La contraseña y el MFA los escribe la
// persona en la página de Microsoft; este código nunca los ve. Se quedan en el llavero solo las
// cookies de sesión de WebCampus, Inscripciones y SharePoint.
//
// El navegador usa un perfil persistente (<config>/browser-profile) para recordar la sesión de
// Microsoft ("¿Mantener la sesión iniciada?" → Sí). Con eso, cuando WebCampus vence (cada ~3 h)
// el MCP vuelve a entrar solo, sin ventana y sin pedir nada: abre el perfil en modo oculto, Microsoft
// lo reconoce y WebCampus entrega cookies nuevas. Si Microsoft pide algo (clave, MFA), se avisa y
// hace falta la ventana. `logout` borra el perfil.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';
import { findBrowser } from '../net/browser.js';
import { INSCRIPCIONES, INSCRIPCIONES_ACCOUNT } from '../sources/inscripciones/index.js';
import { SHAREPOINT, SHAREPOINT_ACCOUNT } from '../sources/sharepoint/index.js';
import { SESSION_ACCOUNT, WEBCAMPUS } from '../sources/webcampus/client.js';
import { configDir } from './permissions.js';
import { saveSession } from './store.js';

const INTERACTIVO_MS = 10 * 60 * 1000;

// Playwright arranca Chromium con un llavero de mentira (--use-mock-keychain / --password-store=basic):
// las cookies del perfil quedan cifradas con una clave fija que cualquier programa conoce. Sin esos
// flags, el navegador usa el llavero del sistema ("Chrome Safe Storage" en macOS), como cuando lo
// abrís vos. Las cookies de UADE (WebCampus, Inscripciones, SharePoint) ya iban al llavero; esto cubre
// la sesión persistente de Microsoft que vive en el perfil.
export const SIN_LLAVERO_FALSO = ['--use-mock-keychain', '--password-store=basic'];
const SILENCIOSO_MS = 45 * 1000;

// Cookies de analytics que no hacen falta para la sesión y no guardamos.
const TRACKING = /^(_ga|_gid|_hj|__utm|_fbp|_gcl|ai_user|ai_session)/;

export function browserProfileDir(): string {
  return join(configDir(), 'browser-profile');
}

export function browserProfileExists(): boolean {
  return existsSync(join(browserProfileDir(), 'Default'));
}

export function borrarPerfil(): void {
  rmSync(browserProfileDir(), { recursive: true, force: true });
}

export interface Opciones {
  interactivo: boolean; // true: ventana visible, hasta 10 min; false: oculto, 45 s, sin pedir nada
  log?: (linea: string) => void;
}

export interface Resultado {
  ok: boolean;
  guardadas: string[]; // sitios con sesión guardada
  motivo?: string;
}

export function mensajeVentana(navegador: string): string {
  return [
    `Se va a abrir una ventana de ${navegador} en WebCampus (si no la ves, buscala en el Dock o detrás de otras ventanas).`,
    '  1. Iniciá sesión con tu cuenta de UADE (lo escribís vos, en la página de Microsoft).',
    '  2. Si Microsoft pregunta "¿Quiere mantener la sesión iniciada?", elegí Sí: así el MCP renueva WebCampus solo cuando vence.',
    '  3. Cuando veas tu WebCampus, la ventana se cierra sola.',
    'Qué se guarda: las cookies de sesión de WebCampus, Inscripciones y SharePoint en el llavero, y la sesión de Microsoft en un perfil de navegador propio del MCP (~/.uade-mcp/browser-profile). Nunca tu contraseña.',
  ].join('\n');
}

// Una sola renovación a la vez: si varias tools vencen juntas, comparten el mismo intento.
let enCurso: Promise<Resultado> | null = null;

export function iniciarSesion(op: Opciones): Promise<Resultado> {
  if (!enCurso) enCurso = correr(op).finally(() => { enCurso = null; });
  return enCurso;
}

// Ventana visible que el MCP dejó abierta para la persona (uade_open_enrollment_site). Mientras
// está abierta, el perfil está en uso: la renovación usa esa misma ventana con una pestaña aparte.
let ventana: BrowserContext | null = null;

// Abre inscripciones.uade.edu.ar en una ventana visible, con la sesión ya iniciada, y la deja
// abierta para que la persona siga. No navega más allá de la lista de ventanas de inscripción.
export async function abrirInscripciones(): Promise<void> {
  if (!ventana) {
    ventana = await chromium.launchPersistentContext(browserProfileDir(), {
      executablePath: findBrowser(),
      headless: false,
      viewport: null,
      ignoreDefaultArgs: SIN_LLAVERO_FALSO,
      args: ['--no-first-run', '--no-default-browser-check', '--start-maximized'],
    });
    ventana.on('close', () => { ventana = null; });
  }
  const page = ventana.pages()[0] ?? (await ventana.newPage());
  await page.goto(`${INSCRIPCIONES}/`);
  if (/^\/account\/login/i.test(new URL(page.url()).pathname)) {
    await page.getByRole('button', { name: /iniciar sesi/i }).or(page.getByRole('link', { name: /iniciar sesi/i })).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForURL((u) => u.origin === INSCRIPCIONES && !/^\/account\//i.test(u.pathname), { timeout: 60_000 }).catch(() => {});
  }
  await page.bringToFront().catch(() => {});
}

async function correr(op: Opciones): Promise<Resultado> {
  const log = op.log ?? (() => {});
  if (!op.interactivo && !browserProfileExists()) return { ok: false, guardadas: [], motivo: 'todavía no iniciaste sesión nunca' };
  // Chrome/Edge/Brave instalado o el Chromium propio del MCP; sin ninguno, NavegadorFaltante dice cómo descargarlo.
  const executablePath = findBrowser();
  const propia = !ventana;
  const ctx: BrowserContext = ventana ?? (await chromium.launchPersistentContext(browserProfileDir(), {
    executablePath,
    headless: !op.interactivo,
    ignoreDefaultArgs: SIN_LLAVERO_FALSO,
    args: ['--no-first-run', '--no-default-browser-check'],
  }));
  const guardadas: string[] = [];
  const page = propia ? (ctx.pages()[0] ?? (await ctx.newPage())) : await ctx.newPage();
  try {
    await page.goto(`${WEBCAMPUS}/Login.aspx`);
    if (op.interactivo) await page.bringToFront().catch(() => {});
    // El botón "Entrar" solo redirige al login de Microsoft; no manda credenciales.
    await page.click('#ctl00_ContentPlaceHolderMain_btnEntrar', { timeout: 10_000 }).catch(() => {});
    try {
      await page.waitForURL((u) => u.origin === WEBCAMPUS && /\/homewc\.aspx$/i.test(u.pathname), { timeout: op.interactivo ? INTERACTIVO_MS : SILENCIOSO_MS });
    } catch {
      return {
        ok: false,
        guardadas,
        motivo: op.interactivo
          ? 'pasaron 10 minutos sin que termine el login; no se guardó nada'
          : 'Microsoft pidió iniciar sesión de nuevo (clave o MFA): hace falta la ventana',
      };
    }
    const cookies = (await ctx.cookies(WEBCAMPUS)).filter((c) => !TRACKING.test(c.name));
    if (!cookies.some((c) => c.name === '.ASPXAUTH' || c.name === 'sessionuade')) return { ok: false, guardadas, motivo: 'WebCampus no entregó la cookie de sesión' };
    saveSession(SESSION_ACCOUNT, cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    guardadas.push('WebCampus');
    log(`Sesión de WebCampus guardada (${cookies.length} cookies: ${cookies.map((c) => c.name).join(', ')}).`);

    // Inscripciones y SharePoint usan el mismo login de Microsoft: con la sesión abierta entran solos.
    await page.goto(`${INSCRIPCIONES}/`).catch(() => {});
    // Inscripciones muestra su propia portada con "Iniciar sesión": ese botón solo manda a Microsoft,
    // que ya reconoce la sesión y vuelve solo.
    if (/^\/account\/login/i.test(new URL(page.url()).pathname)) {
      await page.getByRole('button', { name: /iniciar sesi/i }).or(page.getByRole('link', { name: /iniciar sesi/i })).first().click({ timeout: 10_000 }).catch(() => {});
    }
    try {
      await page.waitForURL((u) => u.origin === INSCRIPCIONES && !/^\/account\//i.test(u.pathname), { timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      const ins = (await ctx.cookies(INSCRIPCIONES)).filter((c) => !TRACKING.test(c.name));
      if (ins.length) {
        saveSession(INSCRIPCIONES_ACCOUNT, ins.map((c) => `${c.name}=${c.value}`).join('; '));
        guardadas.push('Inscripciones');
        log(`Sesión de Inscripciones guardada (${ins.map((c) => c.name).join(', ')}).`);
      }
    } catch {
      log('No se pudo abrir Inscripciones (WebCampus quedó guardado igual).');
    }
    await page.goto(`${SHAREPOINT}/`).catch(() => {});
    try {
      await page.waitForURL((u) => u.origin === SHAREPOINT, { timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      const sp = (await ctx.cookies(SHAREPOINT)).filter((c) => /^(FedAuth|rtFa)$/.test(c.name));
      if (sp.length) {
        saveSession(SHAREPOINT_ACCOUNT, sp.map((c) => `${c.name}=${c.value}`).join('; '));
        guardadas.push('SharePoint');
        log(`Sesión de SharePoint guardada (${sp.map((c) => c.name).join(', ')}).`);
      } else log('SharePoint no dejó sesión: el PDF de aranceles no va a estar disponible.');
    } catch {
      log('No se pudo abrir SharePoint (lo demás quedó guardado igual).');
    }
    return { ok: true, guardadas };
  } finally {
    if (propia) await ctx.close().catch(() => {});
    else await page.close().catch(() => {});
  }
}
