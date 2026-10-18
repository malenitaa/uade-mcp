// Cliente de WebCampus: sesión propia, login en /Login.aspx.
import { keychainStore, SessionClient, type SessionStore } from '../../net/session.js';

export { SessionExpiredError, type Page, type SessionStore } from '../../net/session.js';

export const WEBCAMPUS = 'https://www.webcampus.uade.edu.ar';
export const SESSION_ACCOUNT = 'webcampus';

export class WebCampusClient extends SessionClient {
  constructor(store: SessionStore = keychainStore(SESSION_ACCOUNT)) {
    super({ nombre: 'WebCampus', origin: WEBCAMPUS, esLogin: (u) => /\/login\.aspx$/i.test(u.pathname) }, store);
  }
}
