// SharePoint de UADE (uadeeduar.sharepoint.com), con la sesión que deja el mismo login de Microsoft.
// Solo lectura, y solo en sitios habilitados: el PDF de aranceles y la biblioteca "Materiales de clase"
// de cada materia (los apuntes que comparte el docente en Teams). La sesión de SharePoint (rtFa) abre
// todo Microsoft 365, por eso se acota a esos sitios a conciencia.
import { keychainStore, SessionClient, type SessionStore } from '../../net/session.js';
import { ErrorDeUso } from '../../error-de-uso.js';

export const SHAREPOINT = 'https://uadeeduar.sharepoint.com';
export const SHAREPOINT_ACCOUNT = 'sharepoint';
export const SITIOS_PERMITIDOS = [
  /^\/:[a-z]:\/s\/ArchivosAranceles\//i,
  /^\/sites\/ArchivosAranceles\//i,
  // Apuntes de una materia: la carpeta "Materiales de clase" (o "Class Materials") del equipo.
  /^\/sites\/[^/]+\/(Materiales de clase|Class Materials)(\/|$)/i,
];

// Segmentos "." o ".." (también escapados) saldrían de la carpeta habilitada: no se aceptan.
export function rutaSana(serverRelativePath: string): boolean {
  let p = serverRelativePath;
  try { p = decodeURIComponent(p); } catch { return false; }
  return !p.split('/').some((seg) => seg === '.' || seg === '..') && !/[\x00-\x1f\\]/.test(p);
}

export interface EntradaSP {
  nombre: string;
  tipo: 'carpeta' | 'archivo';
  ruta: string; // server-relative
  tamanoKB?: number;
  modificado?: string;
}

const permitido = (serverRelativePath: string): boolean => rutaSana(serverRelativePath) && SITIOS_PERMITIDOS.some((r) => r.test(serverRelativePath));
const siteDe = (serverRelativePath: string): string => serverRelativePath.match(/^(\/sites\/[^/]+)/i)?.[1] ?? '';
const quote = (p: string): string => `decodedurl='${p.replace(/'/g, "''")}'`;

export class SharePointClient extends SessionClient {
  constructor(store: SessionStore = keychainStore(SHAREPOINT_ACCOUNT)) {
    super({ nombre: 'SharePoint de UADE', origin: SHAREPOINT, esLogin: (u) => /^\/_forms\//i.test(u.pathname) }, store);
  }

  private async api(serverRelativePath: string, kind: 'Files' | 'Folders'): Promise<EntradaSP[]> {
    const site = siteDe(serverRelativePath);
    const sel = kind === 'Files' ? 'Name,ServerRelativeUrl,Length,TimeLastModified' : 'Name,ServerRelativeUrl,TimeLastModified';
    const path = `${site}/_api/web/GetFolderByServerRelativePath(${quote(serverRelativePath)})/${kind}?$select=${sel}`;
    const page = await this.get(path, { accept: 'application/json;odata=nometadata' });
    const value = (JSON.parse(page.html).value ?? []) as { Name: string; ServerRelativeUrl: string; Length?: string; TimeLastModified?: string }[];
    return value
      .filter((e) => kind === 'Folders' && e.Name === 'Forms' ? false : true)
      .map((e) => ({
        nombre: e.Name,
        tipo: kind === 'Files' ? 'archivo' : 'carpeta',
        ruta: e.ServerRelativeUrl,
        tamanoKB: e.Length ? Math.round(Number(e.Length) / 1024) : undefined,
        modificado: e.TimeLastModified?.slice(0, 10),
      }));
  }

  async listar(serverRelativePath: string): Promise<EntradaSP[]> {
    if (!permitido(serverRelativePath)) throw new Error('Esa carpeta de SharePoint no está habilitada en el MCP.');
    const [carpetas, archivos] = await Promise.all([this.api(serverRelativePath, 'Folders'), this.api(serverRelativePath, 'Files')]);
    return [...carpetas, ...archivos];
  }

  async bajarArchivo(serverRelativeUrl: string): Promise<Uint8Array> {
    if (!permitido(serverRelativeUrl)) throw new Error('Ese archivo de SharePoint no está habilitado en el MCP.');
    const site = siteDe(serverRelativeUrl);
    const page = await this.get(`${site}/_api/web/GetFileByServerRelativePath(${quote(serverRelativeUrl)})/$value`);
    return page.bytes;
  }

  // Un archivo publicado por UADE con link de "compartir" (/:x:/s/<sitio>/…), como los que enlazan los
  // banners y novedades de WebCampus. Solo descarga (nunca lista ni recorre el sitio) y devuelve el
  // nombre que informa SharePoint para saber cómo leerlo.
  async descargarCompartido(link: string): Promise<{ nombre: string; bytes: Uint8Array }> {
    const u = new URL(link, SHAREPOINT);
    if (u.origin !== SHAREPOINT) throw new Error('Solo se descargan archivos del SharePoint de UADE.');
    if (!/^\/:[a-z]:\/s\/[^/]+\//i.test(u.pathname)) throw new Error('Ese link de SharePoint no es un archivo compartido.');
    const page = await this.get(u.pathname + u.search);
    const esDoc = (b: Uint8Array) => (b[0] === 0x25 && b[1] === 0x50) || (b[0] === 0x50 && b[1] === 0x4b);
    if (esDoc(page.bytes)) return { nombre: decodeURIComponent(page.url.pathname.split('/').pop() ?? '') || 'archivo', bytes: page.bytes };
    // Los links nuevos abren el visor de Office: la página trae la URL de descarga y el nombre del archivo.
    const descarga = page.html.match(/"FileGetUrl":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&');
    const nombre = page.html.match(/"FileName":"([^"]+)"/)?.[1] ?? 'archivo';
    if (!descarga) throw new Error('SharePoint no mostró el archivo compartido (puede que la sesión de SharePoint haya vencido: corré uade_login).');
    const d = new URL(descarga);
    if (d.origin !== SHAREPOINT || !/\/_layouts\/15\/download\.aspx$/i.test(d.pathname)) throw new Error('SharePoint devolvió una descarga inesperada.');
    let file;
    try {
      file = await this.get(d.pathname + d.search);
    } catch (err) {
      // Compartido solo para ver en el visor (sin descarga): se respeta y se devuelve el link.
      if (/403/.test((err as Error).message)) throw new ErrorDeUso(`"${nombre}" está compartido solo para verlo en el navegador, no para descargarlo. Abrilo vos: ${u.href}`);
      throw err;
    }
    if (!esDoc(file.bytes)) throw new ErrorDeUso(`No pude descargar ${nombre} de SharePoint.`);
    return { nombre, bytes: file.bytes };
  }

  // Descarga un archivo por su link de "compartir" (usado por el PDF de aranceles).
  async descargar(link: string): Promise<Uint8Array> {
    const u = new URL(link, SHAREPOINT);
    if (u.origin !== SHAREPOINT) throw new Error('Solo se descargan archivos del SharePoint de UADE.');
    if (!permitido(u.pathname)) throw new Error('Ese sitio de SharePoint no está habilitado en el MCP.');
    u.searchParams.set('download', '1');
    const page = await this.get(u.pathname + u.search);
    if (!(page.bytes[0] === 0x25 && page.bytes[1] === 0x50)) {
      throw new Error('SharePoint no devolvió un PDF (puede que la sesión de SharePoint haya vencido: corré login).');
    }
    return page.bytes;
  }
}
