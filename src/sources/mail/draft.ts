// Email drafts: builds an Outlook web "compose" link with recipients, subject and body already
// filled in. Nothing is sent: the student reviews it in their own browser session and presses
// Send (or closes it). Recipients are limited to @uade.edu.ar so a prompt injection cannot get the
// agent to put the student's data in an email to an outside address.

// outlook.cloud.microsoft es el dominio actual de Outlook web; con outlook.office.com Microsoft
// pide iniciar sesión de nuevo aunque ya estés adentro en la otra dirección.
import { ErrorDeUso } from '../../error-de-uso.js';

export const COMPOSE_URL = 'https://outlook.cloud.microsoft/mail/deeplink/compose';
const ALLOWED_DOMAIN = /@uade\.edu\.ar$/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_URL = 7000; // margen holgado para navegadores y Outlook

export interface Draft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}

function checkRecipients(list: string[] | undefined, field: string): string[] {
  const out = (list ?? []).map((e) => e.trim()).filter(Boolean);
  for (const e of out) {
    if (!EMAIL.test(e)) throw new ErrorDeUso(`"${e}" no es un mail válido (${field}).`);
    if (!ALLOWED_DOMAIN.test(e)) {
      throw new ErrorDeUso(`Solo se pueden armar borradores para direcciones @uade.edu.ar ("${e}" no lo es).`);
    }
  }
  return [...new Set(out.map((e) => e.toLowerCase()))];
}

export function buildDraftUrl(d: Draft): string {
  const to = checkRecipients(d.to, 'para');
  if (!to.length) throw new Error('Falta al menos un destinatario.');
  const cc = checkRecipients(d.cc, 'cc');
  const subject = d.subject.trim();
  if (!subject) throw new Error('Falta el asunto.');

  // encodeURIComponent (no URLSearchParams): Outlook muestra los "+" de URLSearchParams tal cual.
  const params = [`to=${encodeURIComponent(to.join(';'))}`];
  if (cc.length) params.push(`cc=${encodeURIComponent(cc.join(';'))}`);
  params.push(`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(d.body.replace(/\r\n/g, '\n'))}`);
  const url = `${COMPOSE_URL}?${params.join('&')}`;
  if (url.length > MAX_URL) throw new Error('El mail es demasiado largo para abrirlo como borrador. Acortalo un poco.');
  return url;
}
