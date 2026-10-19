// SharePoint de UADE (uadeeduar.sharepoint.com), con la sesión que deja el mismo login de Microsoft.
// Solo se descargan archivos a los que WebCampus enlaza (por ejemplo, el PDF de aranceles). Solo lectura.
import { keychainStore, SessionClient, type SessionStore } from '../../net/session.js';

export const SHAREPOINT = 'https://uadeeduar.sharepoint.com';
export const SHAREPOINT_ACCOUNT = 'sharepoint';

export class SharePointClient extends SessionClient {
  constructor(store: SessionStore = keychainStore(SHAREPOINT_ACCOUNT)) {
    super({ nombre: 'SharePoint de UADE', origin: SHAREPOINT, esLogin: (u) => /^\/_forms\//i.test(u.pathname) }, store);
  }

  // Descarga un archivo compartido. A los links de "compartir" (/:b:/s/…) se les pide la descarga directa.
  async descargar(link: string): Promise<Uint8Array> {
    const u = new URL(link, SHAREPOINT);
    if (u.origin !== SHAREPOINT) throw new Error('Solo se descargan archivos del SharePoint de UADE.');
    u.searchParams.set('download', '1');
    const page = await this.get(u.pathname + u.search);
    if (!(page.bytes[0] === 0x25 && page.bytes[1] === 0x50)) {
      throw new Error('SharePoint no devolvió un PDF (puede que la sesión de SharePoint haya vencido: corré login).');
    }
    return page.bytes;
  }
}
