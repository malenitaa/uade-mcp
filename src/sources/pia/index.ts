// Cliente de PIA (inscripcionespia.uade.edu.ar). La sesión no tiene login propio: nace al abrir el
// link firmado (`?param=`) que da el sitio de inscripciones para cada ventana abierta, y vive en
// cookies en memoria. Acá solo lectura: buscar materias y clases con vacantes y condiciones.
// El alta (carrito → finalizar) queda en alta.ts y sigue sin conectarse al envío real.
import * as cheerio from 'cheerio';
import { memoryStore, SessionClient, type SessionStore } from '../../net/session.js';
import { PIA } from '../inscripciones/index.js';
import { CONTROLES, DIAS_PIA, htmlDe, leerFormulario, parseBuscador, parseClases, parseMaterias, type Buscador, type ClasePia, type MateriaPia } from './parse.js';
import { ErrorDeUso } from '../../error-de-uso.js';

export class PiaClient extends SessionClient {
  constructor(store: SessionStore = memoryStore()) {
    super({ nombre: 'PIA (inscripciones)', origin: PIA, esLogin: (u) => /login/i.test(u.pathname), sesionPorUrl: true }, store);
  }
}

export interface Busqueda {
  materias: string[]; // códigos
  turno?: string; // nombre (MAÑANA, NOCHE, INTENSIVO…); si hay uno solo se usa ese
  dias?: string[]; // L, M, MI, J, V, S
}

export interface ResultadoBusqueda {
  cicloLectivo: string;
  periodo: string;
  carrera: string;
  turnos: string[];
  materias: MateriaPia[]; // las pedidas, con su estado ("Sin Clases en el Período"…)
  clases: ClasePia[];
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

export class Pia {
  constructor(private readonly client = new PiaClient()) {}

  // path + query del link firmado; el host ya fue validado al leer la ventana.
  private pathDe(link: string): string {
    const u = new URL(link);
    if (u.origin !== PIA) throw new Error('El link de inscripción no es de PIA.');
    return u.pathname + u.search;
  }

  private async abrir(link: string): Promise<{ path: string; buscador: Buscador }> {
    const path = this.pathDe(link);
    return { path, buscador: parseBuscador((await this.client.get(path)).html) };
  }

  // Materias de la carrera para esta ventana, con su estado (sin clases en el período, etc.).
  async materias(link: string): Promise<{ buscador: Buscador; materias: MateriaPia[]; html: string }> {
    const { path, buscador } = await this.abrir(link);
    const html = htmlDe((await this.client.postback(path, buscador.form, CONTROLES.seleccionarMaterias)).html);
    return { buscador, materias: parseMaterias(html), html };
  }

  async buscar(link: string, b: Busqueda): Promise<ResultadoBusqueda> {
    if (!b.materias.length || b.materias.length > 6) throw new Error('Elegí entre 1 y 6 materias (es el tope de PIA).');
    const path = this.pathDe(link);
    const { buscador, materias, html } = await this.materias(link);
    const form = leerFormulario(cheerio.load(html));

    const pedidas: MateriaPia[] = [];
    for (const codigo of b.materias) {
      const m = materias.find((x) => x.codigo === codigo);
      if (!m) throw new ErrorDeUso(`La materia ${codigo} no está en la lista de PIA para esta ventana. Hay ${materias.length} materias: ${materias.map((x) => x.codigo).join(', ')}.`);
      pedidas.push(m);
      if (m.chk) form[m.chk] = 'on';
    }
    const elegibles = pedidas.filter((m) => m.chk);
    if (!elegibles.length) {
      return { cicloLectivo: buscador.cicloLectivo, periodo: buscador.periodo, carrera: buscador.carrera, turnos: buscador.turnos.map((t) => t.nombre), materias: pedidas, clases: [] };
    }

    let turno = buscador.turnos.find((t) => b.turno && norm(t.nombre).includes(norm(b.turno)));
    if (!turno && !b.turno && buscador.turnos.length === 1) turno = buscador.turnos[0];
    if (!turno) throw new ErrorDeUso(`PIA pide un turno. Opciones para esta ventana: ${buscador.turnos.map((t) => t.nombre).join(', ') || 'ninguna'}.`);
    form[CONTROLES.turno] = turno.id;
    for (const d of b.dias ?? []) {
      const chk = DIAS_PIA[norm(d)];
      if (!chk) throw new ErrorDeUso(`Día inválido: ${d}. Usá L, M, MI, J, V o S.`);
      form[chk] = 'on';
    }

    // "Buscar" es un botón común: va como campo del formulario, sin __EVENTTARGET.
    const res = await this.client.postback(path, { ...form, [CONTROLES.buscar]: 'Buscar' }, '');
    const clases = parseClases(htmlDe(res.html));
    return { cicloLectivo: buscador.cicloLectivo, periodo: buscador.periodo, carrera: buscador.carrera, turnos: buscador.turnos.map((t) => t.nombre), materias: pedidas, clases };
  }
}
