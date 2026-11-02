// Recorrido por el PIA de exámenes previos (pia.uade.edu.ar/Pia/Vistas/Inscripcion), dentro de la
// ventana visible de la persona, hasta la pantalla que sigue al carrito, donde se detiene. Pasos
// relevados en vivo el 01/11/2026: entrada (InscripcionAgregar) → "Seleccionar Clases" → código de
// materia + tilde que resuelve el nombre → Buscar → grilla con "Agregar al Carrito" (PIA avisa con un
// alert "Se ha agregado la clase al carrito") → Confirmar Carrito → "Terminos y Condiciones" (Paso 3:
// tilde "Tomo conocimiento y acepto…" + Continuar / Cancelar; probado en vivo el 02/11/2026) → "Cálculo
// de Aranceles" con Finalizar / Cancelar. El recorrido para en la primera de esas dos que aparezca: la
// tilde, Continuar y Finalizar son de la persona; acá no se nombran ni se tocan.
import type { Page } from 'playwright-core';
import { ConfirmationError } from '../../auth/confirm.js';
import { ErrorDeUso } from '../../error-de-uso.js';
import { PIA_EXAMEN } from '../inscripciones/index.js';
import { parseArancelExamen, parseTerminosExamen, type ArancelExamen, type TerminosExamen } from './parse.js';

export interface PedidoExamen {
  codigo: string; // materia
  clase?: string; // número de clase del examen; si la grilla trae una sola, no hace falta
}

export type ConfirmarExamen = (resumen: string) => Promise<boolean>;

const PASO_MS = 30_000;
const P = '#ctl00_ContentPlaceHolder1_';
const limpio = (s: string): string => s.replace(/\s+/g, ' ').trim();

export interface ClaseExamenVista {
  sede: string;
  clase: string;
  vacantes: string;
  materia: string;
  turno: string;
  dia: string;
  horario: string;
  fecha: string;
}

export interface FinalExamen {
  pantalla: 'terminos' | 'aranceles';
  terminos: TerminosExamen | null; // pantalla 'terminos'
  aranceles: ArancelExamen[]; // pantalla 'aranceles'
  puedeFinalizar: boolean; // solo se mira
  clase: ClaseExamenVista;
  avisoPia: string | null;
}

export async function llevarAFinalExamen(page: Page, link: string, pedido: PedidoExamen, confirmar: ConfirmarExamen, origen = PIA_EXAMEN): Promise<FinalExamen> {
  if (new URL(link).origin !== origen) throw new Error('El link de inscripción a exámenes no es de PIA.');

  // 1. Entrada y "Seleccionar Clases".
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: PASO_MS });
  await page.getByText('Seleccionar Clases', { exact: true }).first().click({ timeout: PASO_MS });
  await page.waitForURL((u) => u.origin === origen && /InscripcionExamenSeleccionarClase\.aspx/i.test(u.pathname), { timeout: PASO_MS });

  // 2. Código de materia: el tilde al lado del campo hace un postback que resuelve el nombre.
  await page.locator(`${P}pesMateria_TextBoxCodigo`).fill(pedido.codigo, { timeout: PASO_MS });
  await page.locator(`${P}pesMateria_ctl01`).click({ timeout: PASO_MS });
  await page.waitForLoadState('networkidle', { timeout: PASO_MS }).catch(() => undefined);

  // 3. Buscar y leer la grilla.
  await page.locator(`${P}btnBuscar`).click({ timeout: PASO_MS });
  await page.waitForLoadState('networkidle', { timeout: PASO_MS }).catch(() => undefined);
  const filas = page.locator('[id*="grdClaseInscripcion"] tr').filter({ has: page.locator('input[name$="$btnAgregarCarrito"]') });
  await filas.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  const headers = (await page.locator('[id*="grdClaseInscripcion"] th').allInnerTexts()).map((h) => limpio(h).toLowerCase());
  const vistas: ClaseExamenVista[] = [];
  for (let i = 0; i < (await filas.count()); i++) {
    const celdas = (await filas.nth(i).locator('td').allInnerTexts()).map(limpio);
    // La grilla tiene celdas de más (íconos, sede repetida): se alinea desde la derecha, que es fija.
    const desdeFin = (h: string) => { const k = headers.findIndex((x) => x.startsWith(h)); return k < 0 ? '' : celdas[celdas.length - (headers.length - k)] ?? ''; };
    vistas.push({ sede: desdeFin('sede'), clase: desdeFin('clase'), vacantes: desdeFin('vacantes'), materia: desdeFin('materia'), turno: desdeFin('turno'), dia: desdeFin('día') || desdeFin('dia'), horario: desdeFin('horario'), fecha: desdeFin('fecha') });
  }
  if (!vistas.length) throw new ErrorDeUso(`PIA no muestra clases de examen para ${pedido.codigo} en esta sesión de previos (revisá el código, o que la materia esté habilitada para rendir).`);
  const describir = (c: ClaseExamenVista) => `clase ${c.clase} · ${c.sede} · ${c.dia} ${c.horario} · examen ${c.fecha} · vacantes ${c.vacantes}`;
  const idx = pedido.clase ? vistas.findIndex((c) => c.clase === pedido.clase) : vistas.length === 1 ? 0 : -1;
  if (idx < 0) {
    throw new ErrorDeUso(pedido.clase
      ? `No encontré la clase ${pedido.clase} de ${pedido.codigo} en PIA. Clases de examen que muestra: ${vistas.map(describir).join('; ')}.`
      : `PIA muestra ${vistas.length} clases de examen para ${pedido.codigo}; hace falta elegir una (classNumber): ${vistas.map(describir).join('; ')}.`);
  }
  const elegida = vistas[idx]!;

  // 4. Confirmación de la persona. Hasta acá no se escribió nada.
  const resumen = [
    `Se va a agregar al carrito de PIA el examen previo de ${pedido.codigo} (${elegida.materia}): ${describir(elegida)}.`,
    'Después PIA pasa a "Terminos y Condiciones" (o directo a "Cálculo de Aranceles") y ahí queda. No se inscribe nada: la tilde de los términos, Continuar y Finalizar los apretás vos.',
  ].join('\n');
  if (!(await confirmar(resumen))) throw new ConfirmationError('No confirmaste. No se agregó nada al carrito.');

  // 5. Alta al carrito: PIA responde con un alert que se acepta (es solo un aviso) y se guarda su texto.
  let avisoPia: string | null = null;
  const aceptarDialogo = (d: { message(): string; accept(): Promise<void> }) => { avisoPia = limpio(d.message()); void d.accept(); };
  page.on('dialog', aceptarDialogo);
  try {
    await filas.nth(idx).locator('input[name$="$btnAgregarCarrito"]').click({ timeout: PASO_MS });
    await page.waitForLoadState('networkidle', { timeout: PASO_MS }).catch(() => undefined);
    await page.waitForTimeout(500);
  } finally {
    page.off('dialog', aceptarDialogo);
  }

  // 6. Confirmar el carrito → "Terminos y Condiciones" (lo habitual) o directo a aranceles. Se lee la
  // pantalla que apareció y se deja a la persona ahí.
  await page.locator(`${P}btnConfirmarCarrito`).click({ timeout: PASO_MS });
  await page.waitForURL((u) => u.origin === origen && /TerminosYCondiciones|ArancelInscripcion\.aspx/i.test(u.pathname), { timeout: PASO_MS });
  const enTerminos = /TerminosYCondiciones/i.test(new URL(page.url()).pathname);
  await (enTerminos ? page.locator('input[type=checkbox]').first() : page.locator('th', { hasText: /plan de cuotas/i }).first()).waitFor({ timeout: PASO_MS });
  await page.bringToFront().catch(() => undefined);
  const html = await page.content();
  if (enTerminos) return { pantalla: 'terminos', terminos: parseTerminosExamen(html), aranceles: [], puedeFinalizar: false, clase: elegida, avisoPia };
  return { pantalla: 'aranceles', terminos: null, ...parseArancelExamen(html), clase: elegida, avisoPia };
}
