// Caché local cifrada: una copia de lo que ya se leyó de UADE, para no volver a pedirlo en cada
// pregunta. No es telemetría: nunca sale de la compu. Se guarda en <config>/cache.enc cifrado con
// AES-256-GCM; la clave vive en el llavero. `logout` borra el archivo y la clave.
// Se desactiva con UADE_MCP_CACHE=0.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Entry } from '@napi-rs/keyring';
import { configDir } from '../auth/permissions.js';

const HORA = 60 * 60 * 1000;
export const TTL = {
  corto: 3 * HORA, // notas, asistencia, cuenta corriente, ventanas de inscripción
  medio: 12 * HORA, // planificación, oferta, exámenes previos
  dia: 24 * HORA, // cursos, docentes, historial
  semana: 7 * 24 * HORA, // calendario, secciones (PDFs)
} as const;

interface Item {
  at: number;
  ttl: number;
  value: unknown;
}

export interface KeyStore {
  get(): Buffer | null;
  set(k: Buffer): void;
  delete(): void;
}

const keychainKey: KeyStore = {
  get: () => {
    const v = new Entry('uade-mcp', 'cache-key').getPassword();
    return v ? Buffer.from(v, 'base64') : null;
  },
  set: (k) => new Entry('uade-mcp', 'cache-key').setPassword(k.toString('base64')),
  delete: () => void new Entry('uade-mcp', 'cache-key').deletePassword(),
};

export class Cache {
  private data: Record<string, Item> | null = null;

  constructor(
    private readonly file = join(configDir(), 'cache.enc'),
    private readonly keys: KeyStore = keychainKey,
    private readonly enabled = process.env.UADE_MCP_CACHE !== '0',
    private readonly now: () => number = Date.now,
  ) {}

  private key(): Buffer {
    let k = this.keys.get();
    if (!k || k.length !== 32) {
      k = randomBytes(32);
      this.keys.set(k);
    }
    return k;
  }

  private load(): Record<string, Item> {
    if (this.data) return this.data;
    try {
      const raw = readFileSync(this.file);
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const d = createDecipheriv('aes-256-gcm', this.key(), iv);
      d.setAuthTag(tag);
      this.data = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
    } catch {
      this.data = {}; // no existe, se cambió la clave o está corrupto: se empieza de cero
    }
    return this.data!;
  }

  private save(): void {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([c.update(JSON.stringify(this.data ?? {}), 'utf8'), c.final()]);
    mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  // Devuelve lo guardado si no venció; si no, lo pide, lo guarda y lo devuelve. `actualizado` es la
  // hora en que se leyó de UADE (ISO), para que la respuesta diga qué tan fresco es.
  async get<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<{ value: T; actualizado: string }> {
    if (this.enabled) {
      const hit = this.load()[key];
      if (hit && this.now() - hit.at < hit.ttl) return { value: hit.value as T, actualizado: new Date(hit.at).toISOString() };
    }
    let value: T;
    try {
      value = await fn();
    } catch (err) {
      // Si UADE no responde (sesión vencida, caída) pero hay una copia vieja, se devuelve esa y se
      // avisa en `actualizado` por qué no se pudo refrescar. Mejor una respuesta fechada que ninguna.
      const viejo = this.enabled ? this.load()[key] : undefined;
      if (!viejo) throw err;
      const motivo = err instanceof Error && err.name === 'SessionExpiredError' ? 'sesión vencida' : 'UADE no respondió';
      return { value: viejo.value as T, actualizado: `${new Date(viejo.at).toISOString()} (copia guardada, no se pudo actualizar: ${motivo})` };
    }
    const at = this.now();
    if (this.enabled) {
      this.load()[key] = { at, ttl, value };
      // Lo vencido se conserva hasta 30 días como copia de respaldo; después se descarta.
      for (const [k, v] of Object.entries(this.data!)) if (at - v.at >= v.ttl + 30 * 24 * HORA) delete this.data![k];
      this.save();
    }
    return { value, actualizado: new Date(at).toISOString() };
  }

  clear(prefix?: string): number {
    const d = this.load();
    const keys = Object.keys(d).filter((k) => !prefix || k.startsWith(prefix));
    for (const k of keys) delete d[k];
    if (this.enabled) this.save();
    return keys.length;
  }

  // Borra el archivo y la clave (logout).
  destroy(): void {
    rmSync(this.file, { force: true });
    try {
      this.keys.delete();
    } catch {
      /* no había clave */
    }
    this.data = null;
  }
}

export const cache = new Cache();
