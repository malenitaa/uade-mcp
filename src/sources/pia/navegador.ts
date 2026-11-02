// Recorre PIA dentro de la ventana visible de la persona (la de uade_open_enrollment_site) hasta la
// pantalla final de la inscripción, y se detiene ahí. Pasos: abrir la ventana de inscripción, elegir
// la materia, buscar, agregar la clase al carrito (después de que la persona lo confirme viendo las
// condiciones) y confirmar el carrito. En InscripcionFinalizar.aspx (carrito, Resumen Arancelario,
// términos y Finalizar) no toca nada: ni marca los términos ni aprieta Finalizar. Eso es de la persona.
//
// Es un navegador real con su sesión, así que no sufre el 401 del cliente HTTP (ver PIA-HANDOFF.md).
import type { Page } from 'playwright-core';
import { ConfirmationError } from '../../auth/confirm.js';
import { ErrorDeUso } from '../../error-de-uso.js';
import { PIA } from '../inscripciones/index.js';
import { CONTROLES, parseFinalizar, type Finalizar } from './parse.js';

export interface PedidoCarrito {
  codigo: string; // materia, p. ej. 3.4.082
  clase: string; // número de clase, p. ej. 3376
  turno?: string; // nombre del turno en PIA, si la ventana ofrece más de uno
}

// Recibe el resumen (clase, vacantes y las condiciones que PIA pide aceptar) y devuelve si la
// persona confirmó. Se llama una sola vez, antes de agregar nada al carrito.
export type Confirmar = (resumen: string) => Promise<boolean>;

const PASO_MS = 30_000;
const campo = (name: string) => `input[name="${name}"]`;
const exacto = (texto: string) => new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const limpio = (s: string): string => s.replace(/\s+/g, ' ').trim();

export async function llevarAFinalizar(page: Page, link: string, pedido: PedidoCarrito, confirmar: Confirmar, origen = PIA): Promise<Finalizar> {
  const u = new URL(link);
  if (u.origin !== origen) throw new Error('El link de inscripción no es de PIA.');

  // 1. La ventana de inscripción, con el link firmado que da el sitio de inscripciones.
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: PASO_MS });
  await page.locator(campo(CONTROLES.seleccionarMaterias)).first().click({ timeout: PASO_MS });
  await page.locator('table.gridViewMaterias').first().waitFor({ timeout: PASO_MS });

  // 2. La materia: su fila tiene checkbox solo si PIA la habilita; si no, dice por qué (en rojo).
  const filaMateria = page.locator('table.gridViewMaterias tr').filter({ has: page.locator('td', { hasText: exacto(pedido.codigo) }) }).first();
  if (!(await filaMateria.count())) throw new ErrorDeUso(`La materia ${pedido.codigo} no está en la lista de PIA para esta ventana.`);
  const chk = filaMateria.locator('input[type=checkbox]');
  if (!(await chk.count())) throw new ErrorDeUso(`PIA no habilita ${pedido.codigo} en esta ventana: ${limpio(await filaMateria.innerText())}.`);
  await chk.check();

  // 3. Turno (PIA lo exige) y búsqueda.
  const turnos = await page.locator(`select[name="${CONTROLES.turno}"] option`).evaluateAll((os) =>
    os.map((o) => ({ id: (o as HTMLOptionElement).value, nombre: (o.textContent ?? '').trim() })).filter((o) => o.id !== '-1' && o.nombre));
  let turno = turnos.find((t) => pedido.turno && norm(t.nombre).includes(norm(pedido.turno)));
  if (!turno && !pedido.turno && turnos.length === 1) turno = turnos[0];
  if (!turno) throw new ErrorDeUso(`PIA pide un turno. Opciones para esta ventana: ${turnos.map((t) => t.nombre).join(', ') || 'ninguna'}.`);
  await page.locator(`select[name="${CONTROLES.turno}"]`).selectOption(turno.id);
  await page.locator(campo(CONTROLES.buscar)).first().click({ timeout: PASO_MS });

  // 4. La clase pedida, en la grilla de resultados.
  await page.locator('table.grillaInscripcion, span[id*="lblMateriaDescripcion"], :text-matches("Sin Clases|No se encontraron", "i")').first().waitFor({ timeout: PASO_MS });
  const filaClase = page.locator('table.grillaInscripcion tr').filter({ has: page.locator('td.tdClase', { hasText: exacto(pedido.clase) }) }).first();
  if (!(await filaClase.count())) {
    const clases = await page.locator('table.grillaInscripcion td.tdClase').allInnerTexts().catch(() => [] as string[]);
    throw new ErrorDeUso(`No encontré la clase ${pedido.clase} de ${pedido.codigo} en PIA (turno ${turno.nombre}). Clases que muestra: ${clases.map(limpio).filter(Boolean).join(', ') || 'ninguna'}.`);
  }
  const alta = filaClase.locator('input[name$="$btnCarritoAlta"]');
  if (!(await alta.count())) throw new ErrorDeUso(`La clase ${pedido.clase} de ${pedido.codigo} no tiene el botón "Agregar al carrito" en PIA (sin vacantes, ya inscripto o no habilitada).`);
  const condiciones = limpio(await filaClase.locator('input[name$="$hiddenOfertaAmpliadaDescripcion"]').inputValue({ timeout: 2_000 }).catch(() => ''));
  const vacantes = limpio(await filaClase.locator('td.tdvacantes').innerText({ timeout: 2_000 }).catch(() => ''));

  // 5. Confirmación de la persona, con lo que PIA muestra para esa clase. Hasta acá no se escribió nada.
  const resumen = [
    `Se va a agregar al carrito de PIA la clase ${pedido.clase} de ${pedido.codigo} (turno ${turno.nombre}${vacantes ? `, vacantes: ${vacantes}` : ''}).`,
    condiciones ? `Condiciones que PIA pide aceptar para esta clase: ${condiciones}` : '',
    'Después se abre la pantalla final con el carrito y el Resumen Arancelario. No se inscribe nada: los términos y Finalizar los apretás vos.',
  ].filter(Boolean).join('\n');
  if (!(await confirmar(resumen))) throw new ConfirmationError('No confirmaste. No se agregó nada al carrito.');

  // 6. Alta al carrito. Si PIA pide aceptar las condiciones (ya mostradas y confirmadas), se acepta.
  const aceptarDialogo = (d: { accept(): Promise<void> }) => { void d.accept(); };
  page.on('dialog', aceptarDialogo);
  try {
    await alta.click({ timeout: PASO_MS });
    const aceptar = page.locator('.ui-dialog:visible button, [role=dialog] button, .modal.in button, .modal.show button').filter({ hasText: /aceptar|confirmar|^s[ií]$/i }).first();
    await aceptar.click({ timeout: 3_000 }).catch(() => undefined);
    const confirmarCarrito = page.locator(campo(CONTROLES.confirmarCarrito)).first();
    await confirmarCarrito.waitFor({ state: 'visible', timeout: PASO_MS });
    await confirmarCarrito.click({ timeout: PASO_MS });
  } finally {
    page.off('dialog', aceptarDialogo);
  }

  // 7. Pantalla final: se lee y se deja a la persona ahí. Nada más se toca.
  await page.waitForURL((x) => x.origin === origen && /InscripcionFinalizar\.aspx/i.test(x.pathname), { timeout: PASO_MS });
  await page.locator(campo(CONTROLES.terminos)).waitFor({ timeout: PASO_MS });
  await page.bringToFront().catch(() => undefined);
  return parseFinalizar(await page.content());
}
