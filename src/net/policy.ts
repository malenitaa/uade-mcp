// Política de red: a qué hosts puede hablar el MCP y qué acciones no hace nunca.
// Se aplica en el cliente HTTP (src/net/http.ts) a cada pedido y a cada redirección,
// así que un bug en una tool no alcanza para saltearla. Ver docs/DISENO.md §4 y §5.

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'www.webcampus.uade.edu.ar',
  'inscripciones.uade.edu.ar',
  'inscripcionespia.uade.edu.ar',
  'uadeeduar.sharepoint.com', // SharePoint de UADE (solo lectura): PDF de aranceles, apuntes enlazados desde WebCampus
  'dre.uade.edu.ar', // PDFs públicos de UADE (calendario académico, cronogramas)
  'www.dre.uade.edu.ar',
  // Acortador de UADE Comunicación: los banners del home de WebCampus enlazan por acá. Solo se sigue
  // la redirección (sin cookies: no es un origen de sesión) hasta un host permitido.
  'comunicacion.short.gy',
  'login.microsoftonline.com',
  'graph.microsoft.com',
]);

interface DenyRule {
  readonly pattern: RegExp;
  readonly motivo: string;
}

// Se compara contra host + path + query, en minúsculas.
export const DENY_RULES: readonly DenyRule[] = [
  { pattern: /contenidodesvincular\.aspx/, motivo: 'desvincularse de una materia o aula' },
  { pattern: /menuitemid=508\b/, motivo: 'alta/baja de débito automático' },
  { pattern: /menuitemid=(56|303|133)\b|datospersonales/, motivo: 'datos personales y trámites' },
  { pattern: /menuitemid=253\b/, motivo: 'buscador de personas (datos de terceros)' },
  { pattern: /recupero\.uade\.edu\.ar|olvidocredencial/, motivo: 'recupero de contraseña' },
  { pattern: /\/home\/logout|lnkcerrarsesion/, motivo: 'cerrar sesión' },
  { pattern: /pago|cupon|mercadopago|pagofacil|rapipago/, motivo: 'pagos' },
  { pattern: /\bbaja|cambioasignaturapack/, motivo: 'bajas o cambios de inscripción' },
];

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export function assertAllowed(rawUrl: string | URL): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PolicyError('URL inválida');
  }
  if (url.protocol !== 'https:') throw new PolicyError(`solo https (se pidió ${url.protocol})`);
  if (url.username || url.password) throw new PolicyError('URL con credenciales embebidas');
  if (url.port && url.port !== '443') throw new PolicyError('puerto no permitido');

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) throw new PolicyError(`host fuera de la allowlist: ${host}`);

  const target = decodeURIComponent(host + url.pathname + url.search).toLowerCase();
  for (const rule of DENY_RULES) {
    if (rule.pattern.test(target)) throw new PolicyError(`bloqueado por política: ${rule.motivo}`);
  }
  return url;
}
