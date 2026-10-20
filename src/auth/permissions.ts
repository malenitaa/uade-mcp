// Permisos con nombre y alcance. Se otorgan editando la config (o con la CLI),
// nunca desde el chat: el agente no tiene ninguna tool que los modifique.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const PERMISSIONS = {
  'webcampus.leer': 'Leer notas, asistencia, historial, cuenta corriente y novedades de WebCampus.',
  'pia.leer': 'Buscar asignaturas, docentes, sedes, horarios y ver tu carrito en PIA.',
  'teams.leer_tareas': 'Leer tareas y consignas de Teams.',
  'teams.leer_novedades': 'Leer las novedades del canal General de tus materias en Teams (con el navegador propio del MCP).',
  'teams.entregar':
    'Subir archivos como entrega en tareas de Teams en tu nombre. Cada entrega igual te pide confirmación. No permite mandar mensajes.',
  'mail.leer': 'Leer tu mail institucional.',
  'mail.enviar': 'Enviar mails desde tu cuenta institucional. Cada envío igual te pide confirmación.',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Lectura habilitada por defecto; toda escritura arranca apagada.
const DEFAULT_GRANTED: readonly Permission[] = ['webcampus.leer', 'pia.leer', 'teams.leer_novedades'];

const ConfigSchema = z
  .object({
    permisos: z.array(z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]])).optional(),
  })
  .strict();

export function configDir(): string {
  return process.env.UADE_MCP_HOME ?? join(homedir(), '.uade-mcp');
}

export async function loadGranted(): Promise<ReadonlySet<Permission>> {
  let raw: string;
  try {
    raw = await readFile(join(configDir(), 'config.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Set(DEFAULT_GRANTED);
    throw err;
  }
  // Una config inválida no habilita nada extra: se falla cerrado.
  const parsed = ConfigSchema.parse(JSON.parse(raw));
  return new Set(parsed.permisos ?? DEFAULT_GRANTED);
}

export class PermissionError extends Error {
  constructor(public readonly permission: Permission) {
    super(
      `Falta el permiso "${permission}": ${PERMISSIONS[permission]} ` +
        `Lo habilitás vos desde la terminal con: uade-mcp permitir ${permission}`,
    );
    this.name = 'PermissionError';
  }
}

export function requirePermission(granted: ReadonlySet<Permission>, p: Permission): void {
  if (!granted.has(p)) throw new PermissionError(p);
}
