// "Nuestra API" de WebCampus: funciones de alto nivel que devuelven JSON tipado.
import { WebCampusClient, WEBCAMPUS } from './client.js';
import { parseCorrelativas, type Correlativas } from './correlativas.js';
import { parseHome, parseNovedad, type Home, type Novedad } from './novedades.js';
import { coincide, parseAdjuntoPrevios, parseLinksNovedades, parsePreviosXlsx, type ExamenPrevio } from './previos.js';
import {
  parsePlanificacion,
  type Planificacion,
  parseDocentes,
  parseOferta,
  type ClaseOfertada,
  type Docente,
  parseAsistencia,
  parseCuenta,
  parseCursada,
  parseHistorial,
  parsePeriodos,
  parsePlanes,
  type Asistencia,
  type Aula,
  type Cuenta,
  type Historial,
  type Periodo,
} from './parse.js';

const ID = /^\d{1,12}$/;

export class WebCampus {
  constructor(private readonly client = new WebCampusClient()) {}

  async periodos(): Promise<Periodo[]> {
    return parsePeriodos((await this.client.get('/HomeWC.aspx')).html);
  }

  async cursada(periodo?: string): Promise<{ periodo: Periodo; aulas: Aula[] }> {
    const periodos = await this.periodos();
    const p = periodo ? periodos.find((x) => x.id === periodo) : periodos[0];
    if (!p) throw new Error(periodo ? `No existe el período ${periodo}` : 'No se encontraron períodos');
    return { periodo: p, aulas: parseCursada((await this.client.get(`/Home.aspx?Periodo=${p.id}`)).html) };
  }

  async asistencia(idAula: string): Promise<Asistencia> {
    if (!ID.test(idAula)) throw new Error('idAula inválido');
    return parseAsistencia((await this.client.get(`/AsistenciaAlumnos.aspx?IdAula=${idAula}`)).html);
  }

  // Correlativas del plan (Académico > Correlativas): misma elección de plan que el historial.
  async correlativas(plan?: string): Promise<Correlativas> {
    const path = '/HistorialAcademico/Plan_Acedemico.aspx?VieneDe=Correlativa';
    const { planes, form } = parsePlanes((await this.client.get(path)).html);
    const elegido = plan ? planes.find((p) => p.plan === plan) : (planes.find((p) => /activa/i.test(p.estado)) ?? planes[0]);
    if (!elegido) throw new Error(plan ? `No existe el plan ${plan}` : 'No se encontraron carreras');
    return parseCorrelativas((await this.client.postback(path, form, elegido.postbackTarget)).html);
  }

  // Carreras/planes de la persona (una sola lectura, sin el historial completo).
  async carreras(): Promise<{ carrera: string; plan: string; estado: string }[]> {
    const { planes } = parsePlanes((await this.client.get('/HistorialAcademico/Plan_Acedemico.aspx')).html);
    return planes.map(({ carrera, plan, estado }) => ({ carrera, plan, estado }));
  }

  async historial(plan?: string): Promise<Historial & { carrera: string; plan: string }> {
    const path = '/HistorialAcademico/Plan_Acedemico.aspx';
    const { planes, form } = parsePlanes((await this.client.get(path)).html);
    const elegido = plan ? planes.find((p) => p.plan === plan) : (planes.find((p) => /activa/i.test(p.estado)) ?? planes[0]);
    if (!elegido) throw new Error(plan ? `No existe el plan ${plan}` : 'No se encontraron carreras');
    const page = await this.client.postback(path, form, elegido.postbackTarget);
    return { carrera: elegido.carrera, plan: elegido.plan, ...parseHistorial(page.html) };
  }

  async cuenta(): Promise<Cuenta> {
    return parseCuenta((await this.client.get('/Contenidos/CuentaCorrientes.aspx')).html);
  }

  async planificacion(idAula: string): Promise<Planificacion> {
    if (!ID.test(idAula)) throw new Error('idAula inválido');
    return parsePlanificacion((await this.client.get(`/PlanificacionClases/MiSemana.aspx?IdAula=${idAula}`)).html);
  }

  // Planificación de todas las materias de cursada regular del período más reciente.
  async planificaciones(): Promise<(Planificacion & { idAula: string })[]> {
    const { aulas } = await this.cursada();
    const regulares = aulas.filter((a) => /cursada regular/i.test(a.seccion));
    return Promise.all(regulares.map(async (a) => ({ idAula: a.idAula, ...(await this.planificacion(a.idAula)), materia: a.materia })));
  }

  // Home: banners, novedades y agenda. Y cada novedad con sus adjuntos.
  async home(): Promise<Home> {
    return parseHome((await this.client.get('/HomeWC.aspx')).html);
  }

  async novedad(id: string): Promise<Novedad> {
    if (!ID.test(id)) throw new Error('id de novedad inválido');
    return parseNovedad((await this.client.get(`/MiContenido/Novedades.aspx?Id=${id}&EsDC=False`)).html, id);
  }

  // Un archivo publicado en WebCampus (adjunto de una novedad): solo rutas del propio sitio.
  async archivo(path: string): Promise<{ nombre: string; bytes: Uint8Array }> {
    const u = new URL(path, WEBCAMPUS);
    if (u.origin !== WEBCAMPUS || !/^\/DocsDownload\//i.test(u.pathname)) throw new Error('Solo se leen adjuntos publicados en WebCampus.');
    const page = await this.client.get(u.pathname + u.search);
    return { nombre: decodeURIComponent(u.pathname.split('/').pop() ?? 'archivo'), bytes: page.bytes };
  }

  async docentes(idAula: string): Promise<Docente[]> {
    if (!ID.test(idAula)) throw new Error('idAula inválido');
    return parseDocentes((await this.client.get(`/Integrantes/Integrantes.aspx?IdAula=${idAula}`)).html);
  }

  // linkProgramacion: path con IdUsuario que da el sitio de inscripciones.
  async ofertaMaterias(linkProgramacion: string): Promise<{ codigo: string; nombre: string }[]> {
    return parseOferta((await this.client.get(linkProgramacion)).html).materias;
  }

  async oferta(linkProgramacion: string, materia: string): Promise<ClaseOfertada[]> {
    const inicial = parseOferta((await this.client.get(linkProgramacion)).html);
    if (!inicial.materias.some((m) => m.codigo === materia)) {
      throw new Error(`La materia ${materia} no está en la programación de tu carrera para este cuatrimestre.`);
    }
    const ddl = Object.keys(inicial.form).find((k) => k.endsWith('$ddlMateria'));
    if (!ddl) throw new Error('No encontré el filtro de materia en la Programación de Clases.');
    let page = parseOferta(
      (await this.client.postback(linkProgramacion, { ...inicial.form, [ddl]: materia }, ddl)).html,
    );
    const clases = [...page.clases];
    for (let i = 0; i < 30 && page.siguientePagina; i++) {
      page = parseOferta((await this.client.postback(linkProgramacion, page.form, page.siguientePagina)).html);
      clases.push(...page.clases);
    }
    return clases.filter((c) => c.codigo === materia || c.codigo.replace(/^[A-Z]/, '') === materia);
  }

  // Busca la novedad de "Exámenes Previos" y lee su Excel. Sin filtros devuelve los exámenes de
  // las materias con final pendiente o que estás cursando.
  async examenesPrevios(
    consulta?: string,
  ): Promise<{ archivo: string; filtro: string; examenes: (ExamenPrevio & { tuSituacion?: string })[] }> {
    const ids = new Set<string>();
    for (const p of ['/HomeWC.aspx', '/MiContenido/Novedades.aspx?EsDC=False']) {
      parseLinksNovedades((await this.client.get(p)).html).forEach((id) => ids.add(id));
    }
    let archivo: string | null = null;
    for (const id of ids) {
      archivo = parseAdjuntoPrevios((await this.client.get(`/MiContenido/Novedades.aspx?Id=${id}&EsDC=False`)).html);
      if (archivo) break;
    }
    if (!archivo) throw new Error('No encontré una novedad con el cronograma de exámenes previos publicado.');
    const todos = await parsePreviosXlsx((await this.client.get(archivo)).bytes);
    const h = await this.historial();
    const situacion = (e: ExamenPrevio) => h.materias.find((m) => coincide(e, m.codigo))?.situacion;

    if (consulta) {
      const encontrados = todos.filter((e) => coincide(e, consulta));
      // Por nombre hay homónimos de otras carreras ("Gestión de las Personas…"): primero los de tu plan.
      const deTuPlan = encontrados.filter((e) => situacion(e));
      const examenes = (deTuPlan.length ? deTuPlan : encontrados).map((e) => ({ ...e, tuSituacion: situacion(e) }));
      return {
        archivo,
        filtro: deTuPlan.length ? `${consulta} (solo materias de tu plan)` : `${consulta} (ninguna es de tu plan; se muestran todas)`,
        examenes,
      };
    }
    const mias = h.materias.filter((m) => m.situacion === 'final_pendiente' || m.situacion === 'cursando');
    return {
      archivo,
      filtro: `tus materias con final pendiente o cursando: ${mias.map((m) => m.codigo).join(', ')}`,
      examenes: todos.filter((e) => mias.some((m) => coincide(e, m.codigo))).map((e) => ({ ...e, tuSituacion: situacion(e) })),
    };
  }
}
