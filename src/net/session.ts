// Cliente con sesión (cookies en el llavero) para un sitio de UADE. Todo pasa por safeFetch
// (allowlist + lista negra). Si la sesión venció no reintenta: pide `uade-mcp login`.
import { loadSession, saveSession } from '../auth/store.js';
import { mergeCookies, safeFetch } from './http.js';
import { DENY_RULES, PolicyError } from './policy.js';

// El comando de login tal como lo tiene que escribir la persona en SU compu: si el MCP corre
// desde una carpeta (node …/dist/index.js), con esa ruta; si está instalado, `uade-mcp login`.
export function loginCommand(entry: string | undefined = process.argv[1]): string {
  if (entry && /[\\/]dist[\\/]index\.js$/.test(entry)) return `node "${entry}" login`;
  return 'uade-mcp login';
}

export class SessionExpiredError extends Error {
  constructor(sitio: string) {
    super(
      `No hay sesión de ${sitio} o venció. Abrí una terminal y corré: ${loginCommand()} ` +
        '(se abre el navegador, iniciás sesión con tu cuenta de UADE y listo).',
    );
    this.name = 'SessionExpiredError';
  }
}

export interface Page {
  html: string;
  url: URL;
  bytes: Uint8Array;
}

export interface SessionStore {
  load(): string | null;
  save(cookie: string): void;
}

export const keychainStore = (account: string): SessionStore => ({
  load: () => loadSession(account)?.cookie ?? null,
  save: (cookie) => saveSession(account, cookie),
});

export interface SiteConfig {
  nombre: string; // para los mensajes
  origin: string;
  // true si la respuesta es la página de login (sesión vencida)
  esLogin(url: URL): boolean;
  // Sitios sin login propio (PIA): la sesión la crea el servidor en la primera visita a un link
  // firmado que da otro sitio, así que se arranca sin cookies y se guardan las que vengan.
  sesionPorUrl?: boolean;
}

// Cookies solo en memoria (duran lo que el proceso). Para sitios con `sesionPorUrl`.
export const memoryStore = (): SessionStore => {
  let cookie = '';
  return { load: () => cookie, save: (c) => { cookie = c; } };
};

export class SessionClient {
  private cookie: string | null;

  constructor(
    private readonly site: SiteConfig,
    private readonly store: SessionStore,
  ) {
    this.cookie = store.load();
  }

  get(path: string, headers?: Record<string, string>): Promise<Page> {
    return this.request(path, { method: 'GET', headers });
  }

  // Postback de ASP.NET WebForms: reenvía el estado del formulario y el control que lo dispara.
  async postback(path: string, form: Record<string, string>, eventTarget: string): Promise<Page> {
    // El control que dispara el postback sale del HTML de la página: se chequea con la misma lista
    // negra que las URLs (por ejemplo, el botón de cerrar sesión).
    const t = eventTarget.toLowerCase();
    for (const r of DENY_RULES) if (r.pattern.test(t)) throw new PolicyError(`bloqueado por política: ${r.motivo}`);
    const body = new URLSearchParams({ ...form, __EVENTTARGET: eventTarget, __EVENTARGUMENT: '' });
    return this.request(path, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
  }

  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: URLSearchParams; headers?: Record<string, string> },
  ): Promise<Page> {
    // El llavero es la fuente de verdad: si la persona volvió a iniciar sesión con el MCP abierto
    // se toma la sesión nueva, y si hizo logout no queda nada en memoria que la resucite.
    this.cookie = this.store.load();
    if (!this.cookie && !this.site.sesionPorUrl) throw new SessionExpiredError(this.site.nombre);
    // Un path como "//otro-host/x" resolvería fuera del sitio y le mandaría estas cookies a otro host.
    const target = new URL(path, this.site.origin);
    if (target.origin !== this.site.origin) throw new PolicyError(`dirección fuera de ${this.site.nombre}`);
    const res = await safeFetch(target, { ...init, cookie: this.cookie ?? '' });

    if (res.setCookies.length) {
      const next = mergeCookies(this.cookie ?? '', res.setCookies);
      if (next !== this.cookie) {
        this.cookie = next;
        this.store.save(next);
      }
    }
    // Vencida = terminó en el login (del sitio o de Microsoft) o 401. Terminar en otro sitio
    // permitido (por ejemplo un PDF de dre.uade.edu.ar al que redirige el menú) no es estar vencida.
    const enLoginMicrosoft = res.url.origin === 'https://login.microsoftonline.com';
    if (enLoginMicrosoft || (res.url.origin === this.site.origin && this.site.esLogin(res.url)) || res.status === 401) {
      // Un sitio sin login propio no se arregla con `login`: el link que nos dieron no alcanzó.
      if (this.site.sesionPorUrl) throw new Error(`${this.site.nombre} rechazó el acceso (${res.status}). El link de la ventana de inscripción no alcanzó para entrar.`);
      throw new SessionExpiredError(this.site.nombre);
    }
    if (res.status >= 400) throw new Error(`${this.site.nombre} respondió ${res.status}`);
    return { html: res.text(), url: res.url, bytes: res.body };
  }
}
