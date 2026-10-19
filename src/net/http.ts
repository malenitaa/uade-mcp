// Cliente HTTP único del MCP. Todo pedido pasa por acá:
// - valida cada URL (y cada salto de redirección) contra la política de red;
// - corta por tiempo y por tamaño de respuesta;
// - no manda nada más que lo que pide la tool: sin telemetría, sin headers de rastreo.
import { ALLOWED_HOSTS, assertAllowed, PolicyError } from './policy.js';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export interface SafeRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  // Se manda solo al host del pedido original, nunca a un host al que se redirija.
  cookie?: string;
  // Qué hacer si una redirección va a un host que no es del MCP: error (default) o devolver el destino sin contactarlo.
  redireccionAfuera?: 'error' | 'devolver';
}

export interface SafeResponse {
  status: number;
  url: URL;
  headers: Headers;
  // Solo los Set-Cookie del host original.
  setCookies: string[];
  body: Uint8Array;
  text(): string;
  // true si la respuesta es una redirección a un sitio fuera del MCP que no se siguió (ver redireccionAfuera).
  fueraDelMcp?: boolean;
}

export async function safeFetch(rawUrl: string | URL, req: SafeRequest = {}): Promise<SafeResponse> {
  let url = assertAllowed(rawUrl);
  const originHost = url.host;
  let method = req.method ?? 'GET';
  let body = req.body;
  const setCookies: string[] = [];
  let cookie = req.cookie;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Headers propios solo al host original (mañana puede haber un Authorization).
    const headers = new Headers(url.host === originHost ? req.headers : undefined);
    if (cookie && url.host === originHost) headers.set('cookie', cookie);

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (url.host === originHost) {
      const fresh = res.headers.getSetCookie();
      setCookies.push(...fresh);
      if (cookie !== undefined) cookie = mergeCookies(cookie, fresh);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      await res.body?.cancel();
      const next = new URL(res.headers.get('location')!, url);
      // Algunos menús de UADE redirigen a http://: si el host está permitido se pasa a https
      // en vez de viajar sin cifrar (y en vez de fallar).
      if (next.protocol === 'http:' && ALLOWED_HOSTS.has(next.hostname.toLowerCase())) next.protocol = 'https:';
      // Con `redireccionAfuera: 'devolver'`, una redirección a un sitio que no es del MCP no se sigue:
      // se devuelve el destino (para decir "esto está afuera") sin contactarlo.
      if (req.redireccionAfuera === 'devolver' && !ALLOWED_HOSTS.has(next.hostname.toLowerCase())) {
        return { status: res.status, url: next, headers: res.headers, setCookies, body: new Uint8Array(), fueraDelMcp: true, text: () => '' };
      }
      url = assertAllowed(next);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST') || url.host !== originHost) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    const bytes = await readCapped(res);
    return {
      status: res.status,
      url,
      headers: res.headers,
      setCookies,
      body: bytes,
      text: () => new TextDecoder().decode(bytes),
    };
  }
  throw new PolicyError('demasiadas redirecciones');
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new PolicyError('respuesta demasiado grande');
  if (!res.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_BODY_BYTES) throw new PolicyError('respuesta demasiado grande');
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// Aplica Set-Cookie (solo nombre=valor) sobre un header Cookie existente.
export function mergeCookies(cookie: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  for (const sc of setCookies) {
    const first = sc.split(';')[0] ?? '';
    const i = first.indexOf('=');
    if (i <= 0) continue;
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (value === '' || /expires=thu, 01[- ]jan[- ]1970/i.test(sc) || /max-age=0\b/i.test(sc)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
