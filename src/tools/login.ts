// uade_login: abre la ventana de inicio de sesión de UADE (la persona escribe su clave ahí; el MCP
// nunca la ve). También el prompt "login", que en Claude Code aparece como /uade:login.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { iniciarSesion, mensajeVentana, type Resultado } from '../auth/login.js';
import { findBrowser } from '../net/browser.js';
import type { ToolResult } from './common.js';

type Estado = { fase: 'nada' } | { fase: 'abierta'; desde: number; promesa: Promise<Resultado> } | { fase: 'lista'; resultado: Resultado; cuando: number };

export function registerLoginTools(server: McpServer, login: (op: { interactivo: boolean }) => Promise<Resultado> = iniciarSesion): void {
  let estado: Estado = { fase: 'nada' };
  const texto = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], isError });

  server.registerTool(
    'uade_login',
    {
      title: 'Open the UADE sign-in window',
      description:
        'Use this whenever a tool says the session expired. First tries a silent renewal (no window) using the Microsoft session the browser profile remembers; if that is not enough, opens a browser window on the student\'s computer where THEY sign in with their UADE account (the server never sees the password). Returns immediately; the student tells you when they are done, then retry the original tool. Never ask the student for their password.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      if (estado.fase === 'abierta') {
        return texto(`La ventana de inicio de sesión ya está abierta desde hace ${Math.round((Date.now() - estado.desde) / 1000)} s. Pedile a la persona que termine de iniciar sesión ahí y vuelva a intentar.`);
      }
      const silenciosa = await login({ interactivo: false });
      if (silenciosa.ok) {
        estado = { fase: 'lista', resultado: silenciosa, cuando: Date.now() };
        return texto(`Sesión renovada sin ventana: ${silenciosa.guardadas.join(', ')}. Volvé a llamar la tool que había fallado.`);
      }
      let navegador = 'navegador';
      try {
        navegador = findBrowser().split('/').pop()?.replace(/\.exe$/i, '') ?? navegador;
      } catch (err) {
        return texto((err as Error).message, true);
      }
      const promesa = login({ interactivo: true });
      estado = { fase: 'abierta', desde: Date.now(), promesa };
      void promesa.then((r) => { estado = { fase: 'lista', resultado: r, cuando: Date.now() }; }, (err: Error) => { estado = { fase: 'lista', resultado: { ok: false, guardadas: [], motivo: err.message }, cuando: Date.now() }; });
      return texto(`${silenciosa.motivo ? `No se pudo renovar sola (${silenciosa.motivo}). ` : ''}Se abrió la ventana. Decile a la persona, con estas palabras:\n${mensajeVentana(navegador)}\nCuando avise que terminó, volvé a llamar la tool que había fallado.`);
    },
  );

  server.registerPrompt(
    'login',
    { title: 'Iniciar sesión en UADE', description: 'Abre la ventana para iniciar sesión en WebCampus con tu cuenta de UADE.' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Iniciá sesión en UADE: llamá la tool uade_login y decime qué tengo que hacer. Cuando te diga que terminé, confirmame que la sesión quedó bien con webcampus_terms.' } }] }),
  );
}
