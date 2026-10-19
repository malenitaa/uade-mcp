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

async function correr(op: Opciones): Promise<Resultado> {
  const log = op.log ?? (() => {});
  const executablePath = findBrowser();
  if (!op.interactivo && !browserProfileExists()) return { ok: false, guardadas: [], motivo: 'todavía no iniciaste sesión nunca' };
  const ctx: BrowserContext = await chromium.launchPersistentContext(browserProfileDir(), {
    executablePath,
    headless: !op.interactivo,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const guardadas: string[] = [];
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
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
    await ctx.close().catch(() => {});
  }
}
