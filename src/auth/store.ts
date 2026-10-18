// Sesiones guardadas en el llavero del sistema (Llavero de macOS, Credential Manager, libsecret).
// Nunca en archivos planos. Solo se guardan cookies de sesión, nunca la contraseña.
import { Entry } from '@napi-rs/keyring';

const SERVICE = 'uade-mcp';

export interface StoredSession {
  cookie: string; // header Cookie listo para mandar
  savedAt: string; // ISO
}

function entry(account: string): Entry {
  return new Entry(SERVICE, account);
}

export function loadSession(account: string): StoredSession | null {
  const raw = entry(account).getPassword();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredSession;
    return typeof s.cookie === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(account: string, cookie: string): void {
  entry(account).setPassword(JSON.stringify({ cookie, savedAt: new Date().toISOString() } satisfies StoredSession));
}

export function deleteSession(account: string): boolean {
  return entry(account).deletePassword();
}
