// Cliente con sesión (cookies en el llavero) para un sitio de UADE. Todo pasa por safeFetch
// (allowlist + lista negra). Si la sesión venció no reintenta: pide `uade-mcp login`.
import { loadSession, saveSession } from '../auth/store.js';
import { mergeCookies, safeFetch } from './http.js';

export class SessionExpiredError extends Error {
  constructor(sitio: string) {
    super(
      `No hay sesión de ${sitio} o venció. Abrí una terminal y corré \`uade-mcp login\` ` +
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
}

export class SessionClient {
  private cookie: string | null;

  constructor(
    private readonly site: SiteConfig,
    private readonly store: SessionStore,
  ) {
    this.cookie = store.load();
  }

  get(path: string): Promise<Page> {
    return this.request(path, { method: 'GET' });
  }

  // Postback de ASP.NET WebForms: reenvía el estado del formulario y el control que lo dispara.
  postback(path: string, form: Record<string, string>, eventTarget: string): Promise<Page> {
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
    if (!this.cookie) throw new SessionExpiredError(this.site.nombre);
    const res = await safeFetch(new URL(path, this.site.origin), { ...init, cookie: this.cookie });

    if (res.setCookies.length) {
      const next = mergeCookies(this.cookie, res.setCookies);
      if (next !== this.cookie) {
        this.cookie = next;
        this.store.save(next);
      }
    }
    if (res.url.origin !== this.site.origin || this.site.esLogin(res.url) || res.status === 401) {
      throw new SessionExpiredError(this.site.nombre);
    }
    if (res.status >= 400) throw new Error(`${this.site.nombre} respondió ${res.status}`);
    return { html: res.text(), url: res.url, bytes: res.body };
  }
}
