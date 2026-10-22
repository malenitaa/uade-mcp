// uade_login: abre la ventana de inicio de sesión de UADE (la persona escribe su clave ahí; el MCP
// nunca la ve). También el prompt "login", que en Claude Code aparece como /uade:login.
// Si en la compu no hay Chrome, Edge ni Brave, la tool no descarga nada sola: explica qué bajaría y
// pide que el agente le pregunte a la persona; recién con descargarNavegador: true descarga.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { iniciarSesion, mensajeVentana, type Resultado } from '../auth/login.js';
import { COMANDO_INSTALAR, elegirNavegador, type Navegador } from '../net/browser.js';
import { descripcionDescarga, instalarNavegador } from '../net/descargar-navegador.js';
import type { ToolResult } from './common.js';

type Estado =
  | { fase: 'nada' }
  | { fase: 'descargando'; desde: number }
  | { fase: 'descarga-fallida'; motivo: string }
  | { fase: 'abierta'; desde: number; promesa: Promise<Resultado> }
  | { fase: 'lista'; resultado: Resultado; cuando: number };

export interface Dependencias {
  navegador: () => Navegador | null;
  descargar: () => Promise<unknown>;
  descripcion: () => string;
}

const reales: Dependencias = { navegador: () => elegirNavegador(), descargar: () => instalarNavegador(), descripcion: descripcionDescarga };

export function registerLoginTools(server: McpServer, login: (op: { interactivo: boolean }) => Promise<Resultado> = iniciarSesion, deps: Dependencias = reales): void {
  let estado: Estado = { fase: 'nada' };
  const texto = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], isError });

  server.registerTool(
    'uade_login',
    {
      title: 'Open the UADE sign-in window',
      description:
        'Use this whenever a tool says the session expired. First tries a silent renewal (no window) using the Microsoft session the browser profile remembers; if that is not enough, opens a browser window on the student\'s computer where THEY sign in with their UADE account (the server never sees the password). Returns immediately; the student tells you when they are done, then retry the original tool. Never ask the student for their password. If the computer has no Chrome, Edge or Brave, the tool explains what it would download (a ~190 MB Chromium for the MCP only) and you must ask the student first; only call again with descargarNavegador=true after they say yes.',
      inputSchema: { descargarNavegador: z.boolean().optional().describe('true only after the student explicitly agreed to download the MCP\'s own Chromium (~190 MB download, ~370 MB on disk).') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ descargarNavegador }) => {
      if (estado.fase === 'abierta') {
        return texto(`La ventana de inicio de sesión ya está abierta desde hace ${Math.round((Date.now() - estado.desde) / 1000)} s. Pedile a la persona que termine de iniciar sesión ahí y vuelva a intentar.`);
      }
      if (estado.fase === 'descargando') {
        return texto(`El navegador propio del MCP se sigue descargando (empezó hace ${Math.round((Date.now() - estado.desde) / 1000)} s; son unos minutos según la conexión). Esperá un minuto y volvé a llamar uade_login.`);
      }
      if (estado.fase === 'descarga-fallida') {
        const motivo = estado.motivo;
        estado = { fase: 'nada' };
        return texto(`La descarga del navegador falló: ${motivo}. Se puede volver a intentar con uade_login (descargarNavegador: true) o en una terminal con ${COMANDO_INSTALAR}.`, true);
      }

      let navegador: Navegador | null;
      try {
        navegador = deps.navegador();
      } catch (err) {
        return texto((err as Error).message, true);
      }
      if (!navegador) {
        if (!descargarNavegador) {
          return texto([
            'En esta compu no hay Chrome, Edge ni Brave, y el MCP necesita un navegador Chromium para la ventana de inicio de sesión (Safari no sirve: no se puede automatizar).',
            'Preguntale a la persona si quiere que el MCP descargue uno propio, explicándole esto:',
            deps.descripcion(),
            `Si dice que sí, volvé a llamar uade_login con descargarNavegador: true. Si prefiere, puede instalar Chrome, Edge o Brave, o correr en una terminal: ${COMANDO_INSTALAR}.`,
          ].join('\n'));
        }
        estado = { fase: 'descargando', desde: Date.now() };
        deps.descargar().then(
          () => { estado = { fase: 'nada' }; },
          (err: Error) => { estado = { fase: 'descarga-fallida', motivo: err.message }; },
        );
        return texto('Empezó la descarga del navegador propio del MCP (unos minutos, según la conexión). Avisale a la persona y, en un minuto o dos, volvé a llamar uade_login: cuando termine, sigue con el inicio de sesión.');
      }

      const silenciosa = await login({ interactivo: false });
      if (silenciosa.ok) {
        estado = { fase: 'lista', resultado: silenciosa, cuando: Date.now() };
        return texto(`Sesión renovada sin ventana: ${silenciosa.guardadas.join(', ')}. Volvé a llamar la tool que había fallado.`);
      }
      const promesa = login({ interactivo: true });
      estado = { fase: 'abierta', desde: Date.now(), promesa };
      void promesa.then((r) => { estado = { fase: 'lista', resultado: r, cuando: Date.now() }; }, (err: Error) => { estado = { fase: 'lista', resultado: { ok: false, guardadas: [], motivo: err.message }, cuando: Date.now() }; });
      return texto(`${silenciosa.motivo ? `No se pudo renovar sola (${silenciosa.motivo}). ` : ''}Se abrió la ventana. Decile a la persona, con estas palabras:\n${mensajeVentana(navegador.nombre)}\nCuando avise que terminó, volvé a llamar la tool que había fallado.`);
    },
  );

  server.registerPrompt(
    'login',
    { title: 'Iniciar sesión en UADE', description: 'Abre la ventana para iniciar sesión en WebCampus con tu cuenta de UADE.' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Iniciá sesión en UADE: llamá la tool uade_login y decime qué tengo que hacer. Cuando te diga que terminé, confirmame que la sesión quedó bien con webcampus_terms.' } }] }),
  );
}
