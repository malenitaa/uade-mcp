// "Nuestra API" de WebCampus: funciones de alto nivel que devuelven JSON tipado.
import { WebCampusClient } from './client.js';
import {
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
}
