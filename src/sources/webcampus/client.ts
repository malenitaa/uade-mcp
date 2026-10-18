// Cliente de WebCampus: GET y postbacks con la cookie de sesión guardada en el llavero.
// Todo pasa por safeFetch (allowlist + lista negra). Si la sesión venció, no reintenta:
// le pide al humano que corra `uade-mcp login`.
import { loadSession, saveSession } from '../../auth/store.js';
import { mergeCookies, safeFetch } from '../../net/http.js';
import type { FormState } from './parse.js';

export const WEBCAMPUS = 'https://www.webcampus.uade.edu.ar';
export const SESSION_ACCOUNT = 'webcampus';

export class SessionExpiredError extends Error {
  constructor() {
    super(
      'No hay sesión de WebCampus o venció. Abrí una terminal y corré `uade-mcp login` ' +
        '(se abre el navegador, iniciás sesión con tu cuenta de UADE y listo).',
    );
    this.name = 'SessionExpiredError';
  }
}

export interface Page {
  html: string;
  url: URL;
}

export interface SessionStore {
  load(): string | null;
  save(cookie: string): void;
}

export const keychainStore: SessionStore = {
  load: () => loadSession(SESSION_ACCOUNT)?.cookie ?? null,
  save: (cookie) => saveSession(SESSION_ACCOUNT, cookie),
};

export class WebCampusClient {
  private cookie: string | null;

  constructor(private readonly store: SessionStore = keychainStore) {
    this.cookie = store.load();
  }

  get(path: string): Promise<Page> {
    return this.request(path, { method: 'GET' });
  }

  // Postback de ASP.NET WebForms: reenvía el estado del formulario y el control que lo dispara.
  postback(path: string, form: FormState, eventTarget: string): Promise<Page> {
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
    if (!this.cookie) throw new SessionExpiredError();
    const res = await safeFetch(new URL(path, WEBCAMPUS), { ...init, cookie: this.cookie });

    if (res.setCookies.length) {
      const next = mergeCookies(this.cookie, res.setCookies);
      if (next !== this.cookie) {
        this.cookie = next;
        this.store.save(next);
      }
    }
    if (res.url.origin !== WEBCAMPUS || /\/login\.aspx$/i.test(res.url.pathname) || res.status === 401) {
      throw new SessionExpiredError();
    }
    if (res.status >= 400) throw new Error(`WebCampus respondió ${res.status}`);
    return { html: res.text(), url: res.url };
  }
}
