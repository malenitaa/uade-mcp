// CLI para el humano. Lo que acá se hace (login, permisos) no tiene tool equivalente:
// el agente no puede iniciar sesión ni darse permisos.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { configDir, loadGranted, PERMISSIONS, type Permission } from '../auth/permissions.js';
import { deleteSession, loadSession } from '../auth/store.js';
import { cache } from '../cache/cache.js';
import { INSCRIPCIONES_ACCOUNT } from '../sources/inscripciones/index.js';
import { SHAREPOINT_ACCOUNT } from '../sources/sharepoint/index.js';
import { SESSION_ACCOUNT } from '../sources/webcampus/client.js';
import { doctor } from './doctor.js';
import { rmSync } from 'node:fs';
import { borrarPerfil } from '../auth/login.js';
import { login } from './login.js';
import { loginTeams, teamsProfileDir } from '../sources/teams/index.js';

const USO = `uade-mcp — MCP no oficial de UADE

Uso:
  uade-mcp                     arranca el servidor MCP (stdio). Esto lo usa tu cliente MCP.
  uade-mcp login               iniciás sesión en WebCampus con tu cuenta de UADE
  uade-mcp login-teams         iniciás sesión en Teams (solo si querés leer novedades de los canales)
  uade-mcp logout              borra la sesión guardada del llavero
  uade-mcp estado              muestra sesión y permisos
  uade-mcp doctor              prueba todas las capacidades contra tu cuenta (sin mostrar datos personales)
  uade-mcp permitir <permiso>  habilita un permiso (te explica qué permite y pide confirmación)
  uade-mcp revocar <permiso>   deshabilita un permiso

Para sumarlo a Claude Code (lo corrés vos, en el scope que quieras):
  claude mcp add uade -- npx -y uade-mcp
`;

async function writeGranted(perms: ReadonlySet<Permission>): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const file = join(configDir(), 'config.json');
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    /* config nueva */
  }
  await writeFile(file, JSON.stringify({ ...current, permisos: [...perms].sort() }, null, 2) + '\n', { mode: 0o600 });
}

function asPermission(p: string | undefined): Permission {
  if (!p || !(p in PERMISSIONS)) {
    throw new Error(`Permiso desconocido: ${p ?? '(vacío)'}. Válidos: ${Object.keys(PERMISSIONS).join(', ')}`);
  }
  return p as Permission;
}

export async function runCli(args: string[]): Promise<void> {
  const [cmd, arg] = args;
  switch (cmd) {
    case 'login':
      return login();

    case 'login-teams':
      return loginTeams();

    case 'doctor':
      return doctor();

    case 'logout': {
      const borradas = [SESSION_ACCOUNT, INSCRIPCIONES_ACCOUNT, SHAREPOINT_ACCOUNT].filter((a) => deleteSession(a));
      console.log(borradas.length ? `Sesiones borradas del llavero: ${borradas.join(', ')}.` : 'No había sesiones guardadas.');
      cache.destroy();
      rmSync(teamsProfileDir(), { recursive: true, force: true });
      borrarPerfil();
      console.log('Copia local (caché), su clave, el perfil del navegador (sesión de Microsoft) y el perfil de Teams borrados.');
      return;
    }

    case 'estado': {
      const s = loadSession(SESSION_ACCOUNT);
      console.log(s ? `Sesión de WebCampus guardada el ${s.savedAt}.` : 'Sin sesión de WebCampus. Corré: uade-mcp login');
      for (const [cuenta, nombre] of [[INSCRIPCIONES_ACCOUNT, 'Inscripciones'], [SHAREPOINT_ACCOUNT, 'SharePoint']] as const) {
        const x = loadSession(cuenta);
        console.log(x ? `Sesión de ${nombre} guardada el ${x.savedAt}.` : `Sin sesión de ${nombre}. Corré: uade-mcp login`);
      }
      const granted = await loadGranted();
      for (const [p, d] of Object.entries(PERMISSIONS)) console.log(`${granted.has(p as Permission) ? '✅' : '⛔'} ${p}: ${d}`);
      return;
    }

    case 'permitir': {
      const p = asPermission(arg);
      // Que lo tipee una persona: no se acepta por tubería (echo … | uade-mcp permitir …).
      if (!process.stdin.isTTY) throw new Error('permitir solo se puede usar desde una terminal, escribiendo vos la confirmación.');
      console.log(`\nEsto permite: ${PERMISSIONS[p]}\n`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question(`Para habilitarlo escribí exactamente "${p}" (cualquier otra cosa cancela): `)).trim();
      rl.close();
      if (answer !== p) {
        console.log('Cancelado. No se cambió nada.');
        return;
      }
      const granted = new Set(await loadGranted());
      granted.add(p);
      await writeGranted(granted);
      console.log(`Habilitado ${p}. Reiniciá el MCP en tu cliente para que tome el cambio.`);
      return;
    }

    case 'revocar': {
      const p = asPermission(arg);
      const granted = new Set(await loadGranted());
      granted.delete(p);
      await writeGranted(granted);
      console.log(`Revocado ${p}.`);
      return;
    }

    default:
      console.log(USO);
  }
}
