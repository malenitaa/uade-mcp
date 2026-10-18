// Cliente HTTP único del MCP. Todo pedido pasa por acá:
// - valida cada URL (y cada salto de redirección) contra la política de red;
// - corta por tiempo y por tamaño de respuesta;
// - no manda nada más que lo que pide la tool: sin telemetría, sin headers de rastreo.
import { assertAllowed, PolicyError } from './policy.js';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export interface SafeRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  cookie?: string;
}

export interface SafeResponse {
  status: number;
  url: URL;
  headers: Headers;
  setCookies: string[];
  body: Uint8Array;
  text(): string;
}

export async function safeFetch(rawUrl: string | URL, req: SafeRequest = {}): Promise<SafeResponse> {
  let url = assertAllowed(rawUrl);
  let method = req.method ?? 'GET';
  let body = req.body;
  const setCookies: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers = new Headers(req.headers);
    if (req.cookie) headers.set('cookie', req.cookie);

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    setCookies.push(...res.headers.getSetCookie());

    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      await res.body?.cancel();
      url = assertAllowed(new URL(res.headers.get('location')!, url));
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
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
