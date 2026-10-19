// `uade-mcp login`: la misma ventana que abre la tool uade_login, desde la terminal.
import { browserProfileExists, iniciarSesion, mensajeVentana } from '../auth/login.js';
import { findBrowser } from '../net/browser.js';

export async function login(): Promise<void> {
  const navegador = findBrowser().split('/').pop()?.replace(/\.exe$/i, '') ?? 'navegador';
  // Primero sin ventana: si Microsoft todavía recuerda la sesión, alcanza.
  if (browserProfileExists()) {
    console.log('Probando renovar la sesión sin pedirte nada…');
    const r = await iniciarSesion({ interactivo: false, log: console.log });
    if (r.ok) return console.log(`Listo, sin ventana: ${r.guardadas.join(', ')}.`);
    console.log(`No alcanzó (${r.motivo}).`);
  }
  console.log('\n' + mensajeVentana(navegador) + '\n');
  const r = await iniciarSesion({ interactivo: true, log: console.log });
  if (!r.ok) throw new Error(`No se completó el login: ${r.motivo}. Volvé a correr el mismo comando.`);
  console.log(`Listo: ${r.guardadas.join(', ')}.`);
}
