// Qué navegador elige el MCP y qué pasa cuando no hay ninguno: nada de esto descarga nada.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { COMANDO_INSTALAR, describirNavegador, elegirNavegador, findBrowser, NavegadorFaltante, navegadorDescargado, type Entorno } from '../src/net/browser.js';
import { entornoDeDescarga, urlsDeDryRun, verificarUrlDeDescarga } from '../src/net/descargar-navegador.js';
import { ALLOWED_HOSTS, assertAllowed, HOSTS_DESCARGA_NAVEGADOR, PolicyError } from '../src/net/policy.js';
import { registerLoginTools, type Dependencias } from '../src/tools/login.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = '/home/x/.uade-mcp/browsers';
const DESCARGADO = `${DIR}/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

function entorno(existen: string[], carpetas: string[] = [], env: Record<string, string> = {}): Entorno {
  return { plataforma: 'darwin', arquitectura: 'arm64', env, existe: (p) => existen.includes(p), listar: (d) => (d === DIR ? carpetas : []), browsersDir: DIR };
}

describe('elección del navegador', () => {
  it('prefiere el instalado en el sistema', () => {
    const e = entorno([CHROME, DESCARGADO, `${DIR}/chromium-1248/INSTALLATION_COMPLETE`], ['chromium-1248']);
    expect(elegirNavegador(e)).toEqual({ ruta: CHROME, origen: 'instalado', nombre: 'Google Chrome' });
    expect(describirNavegador(e)).toBe('Google Chrome (instalado en el sistema)');
  });

  it('sin Chrome/Edge/Brave usa el Chromium descargado, solo si la descarga terminó', () => {
    const marcador = `${DIR}/chromium-1248/INSTALLATION_COMPLETE`;
    expect(navegadorDescargado(entorno([DESCARGADO], ['chromium-1248']))).toBeNull(); // sin marcador: a medio bajar
    expect(navegadorDescargado(entorno([marcador], ['chromium-1248']))).toBeNull(); // marcador sin ejecutable
    const e = entorno([DESCARGADO, marcador], ['chromium-1248', '.links', 'ffmpeg-1013']);
    expect(elegirNavegador(e)).toEqual({ ruta: DESCARGADO, origen: 'descargado', nombre: 'Chromium propio del MCP' });
    expect(describirNavegador(e)).toContain('descargado por el MCP');
    expect(findBrowser(e)).toBe(DESCARGADO);
  });

  it('con dos revisiones descargadas usa la más nueva', () => {
    const nuevo = DESCARGADO.replace('1248', '1300');
    const e = entorno([DESCARGADO, `${DIR}/chromium-1248/INSTALLATION_COMPLETE`, nuevo, `${DIR}/chromium-1300/INSTALLATION_COMPLETE`], ['chromium-1248', 'chromium-1300']);
    expect(navegadorDescargado(e)).toBe(nuevo);
  });

  it('UADE_MCP_BROWSER manda, y si no existe es un error de uso', () => {
    expect(elegirNavegador(entorno([CHROME, '/opt/mi-chrome'], [], { UADE_MCP_BROWSER: '/opt/mi-chrome' }))).toMatchObject({ ruta: '/opt/mi-chrome', origen: 'UADE_MCP_BROWSER' });
    expect(() => elegirNavegador(entorno([], [], { UADE_MCP_BROWSER: '/no/existe' }))).toThrow('no existe');
  });

  it('sin ninguno: null, y findBrowser explica cómo descargarlo (sin bajar nada)', () => {
    const e = entorno([]);
    expect(elegirNavegador(e)).toBeNull();
    expect(describirNavegador(e)).toContain('ninguno');
    expect(() => findBrowser(e)).toThrow(NavegadorFaltante);
    expect(() => findBrowser(e)).toThrow(COMANDO_INSTALAR);
  });

  it('en una plataforma sin build de Chromium no inventa una ruta', () => {
    const e = { ...entorno([DESCARGADO], ['chromium-1248']), plataforma: 'freebsd' };
    expect(navegadorDescargado(e)).toBeNull();
  });
});

describe('descarga del navegador: política', () => {
  it('los hosts de descarga no entran en la allowlist del cliente HTTP', () => {
    for (const h of HOSTS_DESCARGA_NAVEGADOR) {
      expect(ALLOWED_HOSTS.has(h)).toBe(false);
      expect(() => assertAllowed(`https://${h}/builds/x.zip`)).toThrow(PolicyError);
    }
  });

  it('solo acepta https a los servidores de Playwright', () => {
    expect(() => verificarUrlDeDescarga('https://cdn.playwright.dev/builds/cft/156.0.8078.4/mac-arm64/chrome-mac-arm64.zip')).not.toThrow();
    expect(() => verificarUrlDeDescarga('https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip')).not.toThrow();
    expect(() => verificarUrlDeDescarga('http://cdn.playwright.dev/x.zip')).toThrow(PolicyError);
    expect(() => verificarUrlDeDescarga('https://cdn.playwright.dev.evil.com/x.zip')).toThrow(PolicyError);
    expect(() => verificarUrlDeDescarga('https://example.com/x.zip')).toThrow(PolicyError);
    expect(() => verificarUrlDeDescarga('no-url')).toThrow(PolicyError);
  });

  it('lee las URLs (principal y alternativas) del --dry-run del instalador', () => {
    const salida = [
      'Chrome for Testing 156.0.8078.4 (playwright chromium v1248)',
      '  Install location:    /x/chromium-1248',
      '  Download url:        https://cdn.playwright.dev/builds/cft/156.0.8078.4/mac-arm64/chrome-mac-arm64.zip',
      '',
      'FFmpeg (playwright ffmpeg v1013)',
      '  Download url:        https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip',
      '  Download fallback 1: https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip',
      '  Download fallback 2: https://cdn.playwright.dev/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip',
    ].join('\n');
    expect(urlsDeDryRun(salida)).toHaveLength(4);
    expect(urlsDeDryRun(salida).every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('no hereda variables con las que Playwright bajaría de otro host o a otra carpeta', () => {
    const env = entornoDeDescarga({
      PATH: '/bin', HOME: '/home/x', PLAYWRIGHT_DOWNLOAD_HOST: 'https://evil', PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST: 'https://evil',
      PLAYWRIGHT_CDN_MIRRORS: 'https://evil', npm_config_playwright_download_host: 'https://evil', PLAYWRIGHT_BROWSERS_PATH: '/otro', PLAYWRIGHT_SKIP_BROWSER_GC: '1',
    }, DIR);
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/x', PLAYWRIGHT_SKIP_BROWSER_GC: '1', PLAYWRIGHT_BROWSERS_PATH: DIR });
  });
});

describe('uade_login sin navegador', () => {
  type Handler = (args: { descargarNavegador?: boolean }) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  const armar = (deps: Partial<Dependencias>) => {
    const tools: Record<string, Handler> = {};
    const fake = { registerTool: (n: string, _c: unknown, cb: Handler) => { tools[n] = cb; }, registerPrompt: () => {} } as unknown as McpServer;
    const login = vi.fn(async () => ({ ok: true, guardadas: ['WebCampus'] }));
    registerLoginTools(fake, login, { navegador: () => null, descargar: vi.fn(async () => {}), descripcion: () => 'DESCRIPCION', ...deps });
    return { tool: tools.uade_login!, login };
  };

  it('sin confirmación no descarga ni abre nada: pide preguntarle a la persona', async () => {
    const descargar = vi.fn(async () => {});
    const { tool, login } = armar({ descargar });
    const r = await tool({});
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text).toContain('DESCRIPCION');
    expect(r.content[0]!.text).toContain('descargarNavegador: true');
    expect(r.content[0]!.text).toContain(COMANDO_INSTALAR);
    expect(descargar).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('con confirmación descarga en segundo plano y, cuando termina, sigue con el login', async () => {
    let terminar!: () => void;
    const descargar = vi.fn(() => new Promise<void>((res) => { terminar = res; }));
    let hay = false;
    const { tool, login } = armar({ descargar, navegador: () => (hay ? { ruta: '/x', origen: 'descargado', nombre: 'Chromium propio del MCP' } : null) });
    expect((await tool({ descargarNavegador: true })).content[0]!.text).toContain('Empezó la descarga');
    expect(descargar).toHaveBeenCalledTimes(1);
    expect((await tool({ descargarNavegador: true })).content[0]!.text).toContain('se sigue descargando');
    expect(descargar).toHaveBeenCalledTimes(1);
    hay = true;
    terminar();
    await new Promise((r) => setTimeout(r, 0));
    expect((await tool({})).content[0]!.text).toContain('Sesión renovada sin ventana');
    expect(login).toHaveBeenCalledWith({ interactivo: false });
  });

  it('si la descarga falla lo informa una vez y deja reintentar', async () => {
    const descargar = vi.fn(async () => { throw new Error('sin red'); });
    const { tool } = armar({ descargar });
    await tool({ descargarNavegador: true });
    await new Promise((r) => setTimeout(r, 0));
    const r = await tool({});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('sin red');
    expect((await tool({})).content[0]!.text).toContain('Preguntale a la persona');
  });
});
