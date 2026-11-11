// UADE simulada para las etapas e2e, estrés y tiempos: el servidor MCP real (src/servidor.ts) con
// sus tools, su caché cifrada y su política de red de verdad; lo único de mentira es lo que está
// afuera del proceso: `fetch` responde con las fixtures sintéticas de test/fixtures/ y el llavero
// vive en memoria. Nada sale a la red y no hace falta ninguna sesión.
//
// Cada archivo de test que lo use tiene que declarar (vitest lo sube arriba de los imports):
//   vi.mock('@napi-rs/keyring', async () => (await import('./uade-simulada.js')).llaveroSimulado);
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const fx = (p: string) => readFileSync(new URL(`../fixtures/${p}`, import.meta.url));
const html = (cuerpo: string | Uint8Array, init?: ResponseInit) => new Response(cuerpo, { headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

export const WC = 'https://www.webcampus.uade.edu.ar';
export const INSC = 'https://inscripciones.uade.edu.ar';
export const PROGRAMA = '/Programas/3.1.024_MATEM%c3%81TICA%20DISCRETA%20(PRESENCIAL)_12-08-2026.pdf';

// Llavero en memoria. Arranca con una sesión inventada de WebCampus y de Inscripciones (las tools
// no piden nada sin una) y guarda ahí la clave de la caché cifrada.
const guardado = new Map<string, string>();
export const llaveroSimulado = {
  Entry: class {
    private readonly k: string;
    constructor(servicio: string, cuenta: string) { this.k = `${servicio}/${cuenta}`; }
    getPassword() { return guardado.get(this.k) ?? (this.k.endsWith('/cache-key') ? null : JSON.stringify({ cookie: 'sesion=simulada', savedAt: '2030-01-01T00:00:00.000Z' })); }
    setPassword(v: string) { guardado.set(this.k, v); }
    deletePassword() { return guardado.delete(this.k); }
  },
};

export type Ruta = (u: URL, init: RequestInit) => Response | Promise<Response> | undefined;

// Qué responde cada dirección de UADE. Las páginas son las fixtures de siempre.
function uade(u: URL, init: RequestInit): Response {
  const p = u.pathname.toLowerCase();
  if (u.origin === INSC) {
    if (p === '/') return html(fx('inscripciones/home.html'));
    if (p === '/home/obtenerinscripciones') return html(fx('inscripciones/obtener.html'));
    if (p.startsWith('/content/images/')) return new Response(fx('webcampus/banner.png'), { headers: { 'content-type': 'image/png' } });
  }
  if (u.origin === WC) {
    // El home real trae en una sola página el menú de períodos y los banners/novedades.
    if (p === '/homewc.aspx') return html(Buffer.concat([fx('webcampus/homewc.html'), fx('webcampus/home.html')]));
    if (p === '/home.aspx') return html(fx('webcampus/cursada.html'));
    if (p === '/asistenciaalumnos.aspx') return html(fx('webcampus/asistencia.html'));
    if (p === '/historialacademico/plan_acedemico.aspx') {
      if (init.method !== 'POST') return html(fx('webcampus/planes.html'));
      return html(fx(u.searchParams.get('VieneDe') === 'Correlativa' ? 'webcampus/correlativas.html' : 'webcampus/historial.html'));
    }
    if (p === '/contenidos/cuentacorrientes.aspx') return html(fx('webcampus/cuenta.html'));
    if (p === '/planificacionclases/misemana.aspx') return html(fx('webcampus/misemana.html'));
    if (p === '/integrantes/integrantes.aspx') return html(fx('webcampus/integrantes.html'));
    if (p === '/contenidos/misclasesapoyo.aspx') return html(fx('webcampus/consultas.html'));
    if (p === '/micontenido/novedades.aspx') return html(fx('webcampus/novedad.html'));
    if (p === '/micontenido/eventos.aspx') return html(fx('webcampus/eventos.html'));
    if (p === '/micontenido/agenda.aspx') return html(fx('webcampus/agenda.html'));
    if (p === '/miprogramacion/contenidos/miprogramacion.aspx') return html(fx('webcampus/oferta.html'));
    if (p.startsWith('/imgpublicidad/')) return new Response(fx('webcampus/banner.png'), { headers: { 'content-type': 'image/png' } });
    if (p === '/contenidos/downloadprograma.aspx') return new Response(null, { status: 302, headers: { location: PROGRAMA } });
    if (p.startsWith('/programas/')) return new Response(fx('programas/matematica-discreta.pdf'), { headers: { 'content-type': 'application/pdf' } });
    // Menú > Calendario académico: redirige a un PDF público de dre.uade.edu.ar.
    if (p === '/principal.aspx') return new Response(null, { status: 302, headers: { location: 'https://dre.uade.edu.ar/calendario/cronos_inscrip_previos.pdf' } });
  }
  if (u.host === 'dre.uade.edu.ar') return new Response(fx('calendario/cronos_inscrip_previos.pdf'), { headers: { 'content-type': 'application/pdf' } });
  return new Response('no existe en la UADE simulada', { status: 404 });
}

export interface Simulada {
  client: Client;
  // Direcciones pedidas a "UADE", en orden.
  pedidos: string[];
  // Llama una tool y devuelve su primer bloque de texto ya leído como JSON (o el texto, si no lo es).
  llamar(name: string, args?: Record<string, unknown>): Promise<{ data: any; texto: string; isError: boolean; imagenes: number }>;
  cerrar(): Promise<void>;
}

// Levanta el servidor real conectado por memoria a un Client del SDK. `ruta` permite que un test
// responda algunas direcciones a su manera (devolviendo undefined sigue con las fixtures).
export async function levantar(ruta: Ruta = () => undefined): Promise<Simulada> {
  // Carpeta de datos propia y vacía: la copia cifrada de quien corre los tests no se toca. Va antes
  // de importar el servidor, que arma la caché al cargarse.
  process.env.UADE_MCP_HOME = mkdtempSync(join(tmpdir(), 'uade-mcp-etapas-'));
  const pedidos: string[] = [];
  vi.stubGlobal('fetch', async (input: URL | string, init: RequestInit = {}) => {
    const u = new URL(input);
    pedidos.push(u.href);
    return (await ruta(u, init)) ?? uade(u, init);
  });
  const { crearServidor } = await import('../../src/servidor.js');
  const server = await crearServidor({ name: 'uade-mcp', version: 'etapas' });
  const [deCliente, deServidor] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'etapas', version: '0' });
  await Promise.all([server.connect(deServidor), client.connect(deCliente)]);
  return {
    client,
    pedidos,
    async llamar(name, args = {}) {
      const r = await client.callTool({ name, arguments: args });
      const content = r.content as { type: string; text?: string }[];
      const texto = content[0]?.text ?? '';
      let data: unknown = texto;
      try { data = JSON.parse(texto); } catch { /* respuesta en texto plano */ }
      return { data, texto, isError: r.isError === true, imagenes: content.filter((c) => c.type === 'image').length };
    },
    async cerrar() {
      await client.close();
      vi.unstubAllGlobals();
    },
  };
}
