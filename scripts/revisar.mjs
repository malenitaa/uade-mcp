// Revisión de seguridad automática: corre en cada commit (hook pre-commit) y cuando quieras con
// `npm run revisar`. Si algo falla, frena. No toca cuentas ni datos: solo el código del repo.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function patronesLocales() {
  try {
    return readFileSync(join(process.env.UADE_MCP_HOME ?? join(homedir(), '.uade-mcp'), 'datos-personales.txt'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  } catch {
    return [];
  }
}

const pasos = [
  ['Compilación (tsc)', 'npx tsc --noEmit'],
  ['Tests (incluye auditoría)', 'npx vitest run'],
  ['Dependencias (npm audit)', 'npm audit --omit=dev'],
];
let fallo = false;
for (const [nombre, cmd] of pasos) {
  process.stdout.write(`• ${nombre}… `);
  try { execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }); console.log('ok'); }
  catch (e) { fallo = true; console.log('FALLÓ\n' + (e.stdout?.toString() || e.message).slice(-1500)); }
}

// Secretos y datos personales en lo que se va a commitear (staged).
process.stdout.write('• Secretos y datos personales en el diff… ');
const diff = execSync('git diff --cached -U0', { encoding: 'utf8' });
const PATRONES = [
  /(FedAuth|rtFa|ASPXAUTH|sessionuade|WebCampusAADCookie)=[A-Za-z0-9%._-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(gh[pous]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/,
  // Datos personales de quien desarrolla (legajo, nombre, mails, ids): viven en un archivo local,
  // fuera del repo, una línea por patrón (texto literal, sin distinguir mayúsculas).
  ...patronesLocales(),
];
const sumadas = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
const hits = sumadas.filter((l) => PATRONES.some((p) => p.test(l)));
if (hits.length) { fallo = true; console.log('FALLÓ\n  ' + hits.slice(0, 5).map((l) => l.slice(0, 100)).join('\n  ')); }
else console.log('ok');

if (fallo) { console.error('\nLa revisión encontró problemas. No se commitea hasta arreglarlos (o `git commit --no-verify` bajo tu responsabilidad).'); process.exit(1); }
console.log('\n✅ Revisión OK.');
