// Renovación automática de sesión y la tool uade_login (con login simulado: no abre navegadores).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRenovador, SessionExpiredError } from '../src/net/session.js';
import { WebCampusClient, type SessionStore } from '../src/sources/webcampus/client.js';
import { registerLoginTools } from '../src/tools/login.js';

afterEach(() => { vi.unstubAllGlobals(); setRenovador(null); });

const store = (): SessionStore & { cookie: string | null } => {
  const s = { cookie: null as string | null, load: () => s.cookie, save: (c: string) => { s.cookie = c; } };
  return s;
};

describe('renovación automática', () => {
  it('con la sesión vencida, renueva una vez y reintenta con la cookie nueva', async () => {
    const cookies: (string | null)[] = [];
    vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => { cookies.push(new Headers(init.headers).get('cookie')); return new Response('<html>ok</html>'); });
    const s = store();
    const renovador = vi.fn(async () => { s.cookie = 'sessionuade=nueva'; return true; });
    setRenovador(renovador);
    const page = await new WebCampusClient(s).get('/HomeWC.aspx');
    expect(page.html).toContain('ok');
    expect(renovador).toHaveBeenCalledTimes(1);
    expect(cookies).toEqual(['sessionuade=nueva']);
  });

  it('si la renovación no alcanza, informa la sesión vencida (y no entra en bucle)', async () => {
    vi.stubGlobal('fetch', async () => new Response('x'));
    const renovador = vi.fn(async () => false);
    setRenovador(renovador);
    await expect(new WebCampusClient(store()).get('/HomeWC.aspx')).rejects.toThrow(SessionExpiredError);
    expect(renovador).toHaveBeenCalledTimes(1);
  });
});

describe('uade_login', () => {
  type Handler = () => Promise<{ content: { text: string }[]; isError?: boolean }>;
  const armar = (login: (op: { interactivo: boolean }) => Promise<{ ok: boolean; guardadas: string[]; motivo?: string }>) => {
    const tools: Record<string, Handler> = {};
    const prompts: string[] = [];
    const fake = { registerTool: (n: string, _c: unknown, cb: Handler) => { tools[n] = cb; }, registerPrompt: (n: string) => prompts.push(n) } as unknown as McpServer;
    registerLoginTools(fake, login);
    return { tool: tools.uade_login!, prompts };
  };

  it('primero intenta sin ventana; si alcanza, no abre nada', async () => {
    const login = vi.fn(async () => ({ ok: true, guardadas: ['WebCampus', 'Inscripciones'] }));
    const { tool, prompts } = armar(login);
    const r = await tool();
    expect(r.content[0]!.text).toContain('sin ventana');
    expect(login).toHaveBeenCalledWith({ interactivo: false });
    expect(login).toHaveBeenCalledTimes(1);
    expect(prompts).toEqual(['login']);
  });

  it('si no alcanza, abre la ventana, vuelve enseguida y no abre dos veces', async () => {
    let terminar!: (r: { ok: boolean; guardadas: string[] }) => void;
    const login = vi.fn(async (op: { interactivo: boolean }) => op.interactivo ? new Promise<{ ok: boolean; guardadas: string[] }>((res) => { terminar = res; }) : { ok: false, guardadas: [], motivo: 'Microsoft pidió clave' });
    const { tool } = armar(login);
    const r1 = await tool();
    expect(r1.content[0]!.text).toMatch(/Microsoft pidió clave.*Se abrió la ventana/s);
    expect(r1.content[0]!.text).toContain('Nunca tu contraseña');
    const r2 = await tool();
    expect(r2.content[0]!.text).toContain('ya está abierta');
    expect(login).toHaveBeenCalledTimes(2);
    terminar({ ok: true, guardadas: ['WebCampus'] });
  });
});
