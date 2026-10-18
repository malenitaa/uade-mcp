import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCookies, safeFetch } from '../src/net/http.js';
import { SessionExpiredError, WebCampusClient, type SessionStore } from '../src/sources/webcampus/client.js';

type Route = (url: URL, init: RequestInit) => Response;

function stubFetch(route: Route) {
  const calls: { url: string; cookie: string | null }[] = [];
  vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    calls.push({ url: url.href, cookie: new Headers(init.headers).get('cookie') });
    return route(url, init);
  });
  return calls;
}

const redirect = (to: string, setCookie?: string) => {
  const h = new Headers({ location: to });
  if (setCookie) h.append('set-cookie', setCookie);
  return new Response(null, { status: 302, headers: h });
};

const memStore = (cookie: string | null): SessionStore & { saved: string[] } => {
  const saved: string[] = [];
  return { saved, load: () => cookie, save: (c) => saved.push(c) };
};

afterEach(() => vi.unstubAllGlobals());

describe('safeFetch y cookies', () => {
  it('no manda la cookie a otro host al seguir una redirección', async () => {
    const calls = stubFetch((u) =>
      u.host === 'www.webcampus.uade.edu.ar' ? redirect('https://login.microsoftonline.com/x') : new Response('ok'),
    );
    await safeFetch('https://www.webcampus.uade.edu.ar/Home.aspx', { cookie: 'sessionuade=secreto' });
    expect(calls).toEqual([
      { url: 'https://www.webcampus.uade.edu.ar/Home.aspx', cookie: 'sessionuade=secreto' },
      { url: 'https://login.microsoftonline.com/x', cookie: null },
    ]);
  });

  it('no sigue redirecciones a hosts fuera de la allowlist', async () => {
    stubFetch(() => redirect('https://evil.example/robar'));
    await expect(safeFetch('https://www.webcampus.uade.edu.ar/Home.aspx', { cookie: 'a=1' })).rejects.toThrow('allowlist');
  });

  it('aplica cookies nuevas entre saltos del mismo host', async () => {
    const calls = stubFetch((u) =>
      u.pathname === '/a.aspx' ? redirect('/b.aspx', 'ASP.NET_SessionId=nuevo; path=/; HttpOnly') : new Response('ok'),
    );
    const res = await safeFetch('https://www.webcampus.uade.edu.ar/a.aspx', { cookie: 'ASP.NET_SessionId=viejo; x=1' });
    expect(calls[1]?.cookie).toBe('ASP.NET_SessionId=nuevo; x=1');
    expect(res.setCookies).toHaveLength(1);
  });

  it('mergeCookies borra cookies expiradas', () => {
    expect(mergeCookies('a=1; b=2', ['b=; expires=Thu, 01-Jan-1970 00:00:01 GMT', 'c=3'])).toBe('a=1; c=3');
  });
});

describe('WebCampusClient', () => {
  it('sin sesión pide login y no hace ningún pedido', async () => {
    const calls = stubFetch(() => new Response('ok'));
    await expect(new WebCampusClient(memStore(null)).get('/HomeWC.aspx')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(calls).toHaveLength(0);
  });

  it('detecta la sesión vencida cuando WebCampus redirige al login', async () => {
    stubFetch((u) => (u.pathname === '/Login.aspx' ? new Response('<html>login</html>') : redirect('/Login.aspx')));
    await expect(new WebCampusClient(memStore('a=1')).get('/HomeWC.aspx')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('guarda en el llavero las cookies que rota el servidor', async () => {
    stubFetch(() => new Response('<html></html>', { headers: { 'set-cookie': 'sessionuade=rotada; path=/' } }));
    const store = memStore('sessionuade=vieja');
    await new WebCampusClient(store).get('/HomeWC.aspx');
    expect(store.saved).toEqual(['sessionuade=rotada']);
  });

  it('respeta la lista negra aunque se lo pida una tool', async () => {
    stubFetch(() => new Response('ok'));
    await expect(new WebCampusClient(memStore('a=1')).get('/Contenidos/ContenidoDesvincular.aspx?IdAula=1')).rejects.toThrow('desvincular');
  });
});
