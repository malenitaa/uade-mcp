// Lee las novedades del canal "General" de un equipo de Teams. Teams web es una app pesada que no
// se puede leer con fetch+cheerio (como WebCampus): necesita un navegador de verdad. Por eso usa un
// perfil propio y aislado (<config>/teams-profile), separado del login normal y creado solo si usás
// Teams. Corre el Teams web real, así que contacta los dominios de Microsoft, igual que si lo abrieras
// vos; no manda nada a nadie más. Es lo más frágil del MCP: si Teams cambia su interfaz, puede dejar
// de leer, y en ese caso avisa en vez de inventar.
import { createInterface } from 'node:readline/promises';
import { chromium, type BrowserContext } from 'playwright-core';
import { findBrowser } from '../../net/browser.js';
import { browserProfileDir, browserProfileExists, SIN_LLAVERO_FALSO } from '../../auth/login.js';

// Mismo perfil que el login general: la sesión de Microsoft es una sola para WebCampus, Teams y el resto.
export function teamsProfileDir(): string {
  return browserProfileDir();
}

export function teamsProfileExists(): boolean {
  return browserProfileExists();
}

export class TeamsLoginError extends Error {
  constructor() {
    super('No hay sesión de Microsoft para Teams, o venció. Llamá la tool uade_login (o en una terminal: node "' + process.argv[1] + '" login) e intentá de nuevo.');
    this.name = 'TeamsLoginError';
  }
}

export interface PostCanal {
  autor: string | null;
  fecha: string | null;
  texto: string;
}

// Solo el Teams web: con el perfil del MCP (sesión de Microsoft) no se abre ningún otro sitio.
export const TEAMS_HOST = /^teams\.(microsoft\.com|cloud\.microsoft)$/i;

async function abrir(headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(teamsProfileDir(), {
    executablePath: findBrowser(),
    headless,
    ignoreDefaultArgs: SIN_LLAVERO_FALSO,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
}

// Login interactivo (comando login-teams): abre Teams, la persona inicia sesión, se cierra guardando el perfil.
export async function loginTeams(): Promise<void> {
  console.log('\nSe va a abrir Teams en el navegador. Iniciá sesión con tu cuenta de UADE.');
  console.log('Cuando veas tus equipos, volvé a esta terminal y presioná Enter.\n');
  const ctx = await abrir(false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('https://teams.microsoft.com/');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('');
    rl.close();
    console.log('Listo: sesión de Teams guardada en el perfil del MCP.');
  } finally {
    await ctx.close();
  }
}

export class Teams {
  // Novedades del canal General de un equipo, de la más nueva a la más vieja.
  async novedades(teamUrl: string, limite = 10): Promise<PostCanal[]> {
    const u = new URL(teamUrl);
    if (u.protocol !== 'https:' || !TEAMS_HOST.test(u.hostname)) throw new Error('El link no es de Teams.');
    if (!teamsProfileExists()) throw new TeamsLoginError();

    // El link /l/team/... abre una página "launcher" que quiere la app de escritorio. Con /v2/#/l/...
    // se fuerza la versión web (Teams redirige solo a teams.cloud.microsoft).
    const web = teamUrl.replace(/teams\.microsoft\.com\/l\//, 'teams.microsoft.com/v2/#/l/');

    const ctx = await abrir(true);
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(web, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // Espera a que cargue el canal (o detecta que la sesión venció).
      for (let i = 0; i < 10; i++) {
        if (/login\.microsoftonline\.com/.test(page.url())) throw new TeamsLoginError();
        if (await page.locator('[data-tid="channel-pane-message"]').count()) break;
        await page.waitForTimeout(3000);
      }
      if (!(await page.locator('[data-tid="channel-pane-message"]').count())) {
        throw new Error('No encontré mensajes en el canal (puede estar vacío, tardar en cargar, o Teams cambió su interfaz).');
      }

      const posts: PostCanal[] = await page.evaluate((limite) => {
        const limpio = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
        const out: { autor: string | null; fecha: string | null; texto: string }[] = [];
        const msgs = document.querySelectorAll('[data-tid="channel-pane-message"]');
        for (const m of Array.from(msgs)) {
          const cuerpo = m.querySelector('[data-tid="message-body"]');
          const texto = limpio((cuerpo as HTMLElement | null)?.innerText);
          if (!texto) continue;
          const header = m.querySelector('[data-tid="post-message-subheader"], [data-tid="message-author-name"]');
          const autor = limpio((header?.querySelector('[data-tid="message-author-name"]') as HTMLElement | null)?.innerText || (header as HTMLElement | null)?.innerText?.split('\n')[0]) || null;
          const fecha = m.querySelector('time')?.getAttribute('datetime') ?? limpio((m.querySelector('time') as HTMLElement | null)?.innerText) ?? null;
          out.push({ autor, fecha, texto });
        }
        return out;
      }, limite);

      // Más nuevo primero. "dd/mm hh:mm" o ISO; sin año, se asume el actual.
      const clave = (f: string | null): number => {
        if (!f) return 0;
        if (/^\d{4}-\d{2}-\d{2}/.test(f)) return Date.parse(f) || 0; // ISO del atributo datetime
        const m = f.match(/(\d{1,2})\/(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/); // "dd/mm hh:mm" (Teams en es-AR)
        if (!m) return 0;
        return new Date(new Date().getFullYear(), Number(m[2]) - 1, Number(m[1]), Number(m[3] ?? 0), Number(m[4] ?? 0)).getTime();
      };
      posts.sort((a, b) => clave(b.fecha) - clave(a.fecha));
      return posts.slice(0, limite);
    } finally {
      await ctx.close();
    }
  }
}
