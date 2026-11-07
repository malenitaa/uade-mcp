// Programa de una materia: el PDF oficial que enlaza cada aula ("Programa de la materia"). El mismo
// link sirve para cualquier materia, no solo las que se cursan: DownloadPrograma.aspx redirige a
// /Programas/<código>_<MATERIA> (PRESENCIAL)_<dd-mm-aaaa>.pdf. Sin `VieneDe=P` devuelve una página
// vacía; si no hay programa para ese código, redirige a /Archivo404.aspx. Igual para todos los alumnos.
import { leerPdf } from '../calendario/index.js';
import { fragmentos } from '../docs/fragmentos.js';
import { textoOImagenes } from '../docs/legible.js';
import { ErrorDeUso } from '../../error-de-uso.js';
import { WEBCAMPUS, type WebCampusClient } from './client.js';

// Códigos como los del historial y la oferta: 3.1.024, 1.2.001.
export const CODIGO_MATERIA = /^\d{1,2}\.\d{1,2}\.\d{3}$/;

export type Modalidad = 'presencial' | 'virtual';

export interface Programa {
  codigo: string;
  nombre?: string;
  modalidad: Modalidad;
  fecha?: string; // ISO, la del nombre del archivo (aprobación del programa)
  link: string;
  texto: string;
  imagenes?: { mimeType: string; base64: string }[]; // páginas dibujadas, si el texto no se puede leer
}

// "3.1.024_MATEMÁTICA DISCRETA (PRESENCIAL)_12-08-2026.pdf" → nombre y fecha.
export function datosDelArchivo(pathname: string): { nombre?: string; fecha?: string } {
  const archivo = decodeURIComponent(pathname.split('/').pop() ?? '');
  const m = archivo.match(/^[^_]+_(.+)_(\d{2})-(\d{2})-(\d{4})\.pdf$/i);
  if (!m) return {};
  return { nombre: m[1]!.replace(/\s*\((PRESENCIAL|VIRTUAL)\)\s*$/i, '').trim(), fecha: `${m[4]}-${m[3]}-${m[2]}` };
}

export async function programa(client: WebCampusClient, codigo: string, modalidad: Modalidad = 'presencial'): Promise<Programa> {
  if (!CODIGO_MATERIA.test(codigo)) throw new ErrorDeUso(`"${codigo}" no es un código de materia (tienen la forma 3.1.024).`);
  const r = await client.get(`/Contenidos/DownloadPrograma.aspx?IdMateria=${codigo}&VieneDe=P&EsVirtual=${modalidad === 'virtual' ? 'True' : 'False'}`);
  const esPdf = r.bytes[0] === 0x25 && r.bytes[1] === 0x50; // "%P"
  if (r.url.origin !== WEBCAMPUS || !/^\/Programas\/[^/]+\.pdf$/i.test(r.url.pathname) || !esPdf) {
    if (r.url.origin === WEBCAMPUS && (/archivo404/i.test(r.url.pathname) || !esPdf)) {
      throw new ErrorDeUso(`UADE no tiene publicado un programa ${modalidad} para la materia ${codigo}.${modalidad === 'presencial' ? ' Probá con modality virtual.' : ''}`);
    }
    throw new Error('El link del programa no llevó a un PDF de WebCampus como se esperaba.');
  }
  const base = { codigo, modalidad, ...datosDelArchivo(r.url.pathname), link: r.url.href };
  // El camino común para PDFs (texto, fotos o páginas dibujadas). No leerArchivo: recorta a 12.000
  // caracteres y el cronograma, al final del programa, quedaría afuera.
  return { ...base, ...(await textoOImagenes((await leerPdf(r.bytes)).texto, r.bytes)) };
}

// Materias del plan que coinciden con un nombre (sin tildes ni mayúsculas): la igual, o las que lo contienen.
export function buscarMateria<T extends { codigo: string; nombre: string }>(materias: T[], nombre: string): T[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const q = norm(nombre);
  const unicas = [...new Map(materias.map((m) => [m.codigo, m])).values()];
  const iguales = unicas.filter((m) => norm(m.nombre) === q);
  return iguales.length ? iguales : unicas.filter((m) => norm(m.nombre).includes(q));
}

// Con una consulta, las secciones enteras del programa que la mencionan (los programas siguen una
// plantilla con títulos "I. Objetivos" … "VIII. Bibliografía", "IX. Cronograma"). Fragmentos de 700
// caracteres no alcanzan: la bibliografía empieza con un párrafo de derechos de autor y los libros
// quedan afuera. Sin esa plantilla, fragmentos alrededor de cada aparición.
export function partesDelPrograma(texto: string, consulta: string): string[] {
  const secciones = texto.split(/\s(?=(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\. [A-ZÁÉÍÓÚ])/);
  if (secciones.length < 4) return fragmentos(texto, consulta);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palabras = norm(consulta).split(/\s+/).filter((w) => w.length >= 3);
  return secciones.filter((s) => palabras.some((w) => norm(s).includes(w))).map((s) => s.trim());
}
