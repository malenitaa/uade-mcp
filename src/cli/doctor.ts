// `uade-mcp doctor`: prueba cada capacidad del MCP contra la cuenta real y muestra solo
// OK / aviso / error con conteos y tiempos. Nunca imprime datos personales (ni notas, ni
// materias, ni montos), así cualquiera puede compartir el reporte para diagnosticar.
import { Calendario } from '../sources/calendario/index.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { PageChangedError } from '../sources/webcampus/parse.js';
import { SECCIONES, Secciones, type Seccion } from '../sources/webcampus/secciones.js';
import { SessionExpiredError } from '../net/session.js';

type Estado = 'ok' | 'aviso' | 'error';
interface Resultado {
  nombre: string;
  estado: Estado;
  detalle: string;
  ms: number;
}

const ICONO: Record<Estado, string> = { ok: '✅', aviso: '⚠️ ', error: '❌' };
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/;

async function probar(nombre: string, fn: () => Promise<[Estado, string]>): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const [estado, detalle] = await fn();
    return { nombre, estado, detalle, ms: Date.now() - t0 };
  } catch (err) {
    const e = err as Error;
    const tipo = e instanceof SessionExpiredError ? 'sesión vencida' : e instanceof PageChangedError ? 'UADE cambió la página' : e.name;
    return { nombre, estado: 'error', detalle: `${tipo}: ${e.message.split('.')[0]}`, ms: Date.now() - t0 };
  }
}

function fechasValidas(fechas: (string | null | undefined)[]): boolean {
  return fechas.filter(Boolean).every((f) => FECHA_ISO.test(f!) && !Number.isNaN(Date.parse(f!.slice(0, 10))));
}

export async function doctor(): Promise<void> {
  const wc = new WebCampus();
  const insc = new Inscripciones();
  const cal = new Calendario();
  const sec = new Secciones();
  const r: Resultado[] = [];
  const push = async (n: string, f: () => Promise<[Estado, string]>) => {
    const res = await probar(n, f);
    r.push(res);
    console.log(`${ICONO[res.estado]} ${res.nombre.padEnd(30)} ${res.detalle} (${(res.ms / 1000).toFixed(1)} s)`);
    return res;
  };

  console.log('uade-mcp doctor — prueba cada capacidad. No muestra datos personales.\n');

  let idAula: string | undefined;
  await push('períodos', async () => {
    const p = await wc.periodos();
    return [p.length ? 'ok' : 'aviso', `${p.length} períodos`];
  });
  await push('cursos del período', async () => {
    const c = await wc.cursada();
    idAula = c.aulas.find((a) => /cursada regular/i.test(a.seccion))?.idAula ?? c.aulas[0]?.idAula;
    const conHorario = c.aulas.filter((a) => a.horario).length;
    return [c.aulas.length ? 'ok' : 'aviso', `${c.aulas.length} cursos, ${conHorario} con horario`];
  });
  await push('asistencia', async () => {
    if (!idAula) return ['aviso', 'sin cursos para probar'];
    const a = await wc.asistencia(idAula);
    return ['ok', `${a.clases.length} clases, resumen ${a.resumen.totalClases !== null ? 'completo' : 'vacío'}`];
  });
  await push('planificación (parciales)', async () => {
    const p = await wc.planificaciones();
    const ev = p.flatMap((x) => x.actividades).filter((a) => a.actividad !== 'cursada');
    if (!fechasValidas(ev.map((a) => a.fecha))) return ['error', 'hay fechas inválidas'];
    return [ev.length ? 'ok' : 'aviso', `${p.length} materias, ${ev.length} evaluaciones/finales`];
  });
  await push('equipo docente', async () => {
    if (!idAula) return ['aviso', 'sin cursos para probar'];
    const d = await wc.docentes(idAula);
    return [d.length ? 'ok' : 'aviso', `${d.length} docentes, ${d.filter((x) => x.email).length} con mail`];
  });
  await push('historial académico', async () => {
    const h = await wc.historial();
    const ap = h.materias.filter((m) => m.situacion === 'aprobada');
    if (!fechasValidas(h.materias.flatMap((m) => [m.fechaAprobacion, m.fechaRegularizacion]))) return ['error', 'hay fechas inválidas'];
    const sinFecha = ap.filter((m) => !m.fechaAprobacion).length;
    return [sinFecha ? 'aviso' : 'ok', `${h.materias.length} materias, ${ap.length} aprobadas${sinFecha ? `, ${sinFecha} sin fecha` : ''}, promedio ${h.promedio !== null ? 'ok' : 'sin dato'}`];
  });
  await push('cuenta corriente', async () => {
    const c = await wc.cuenta();
    return ['ok', `${c.deudaVencida.length} deudas, ${c.proximosVencimientos.length} vencimientos, ${c.pagos.length} pagos`];
  });
  await push('exámenes previos (Excel)', async () => {
    try {
      const e = await wc.examenesPrevios();
      return ['ok', `cronograma encontrado, ${e.examenes.length} exámenes de tus materias`];
    } catch (err) {
      if (/No encontré una novedad/.test((err as Error).message)) return ['aviso', 'UADE no tiene publicado un cronograma de previos ahora'];
      throw err;
    }
  });
  await push('ventanas de inscripción', async () => {
    const v = await insc.ventanas();
    if (!fechasValidas(v.flatMap((x) => [x.desde, x.hasta]))) return ['error', 'hay fechas inválidas'];
    return ['ok', `${v.length} ventanas, ${v.filter((x) => x.abierta).length} abiertas`];
  });
  await push('oferta de clases', async () => {
    const link = await insc.linkProgramacion();
    const m = await wc.ofertaMaterias(link);
    if (!m.length) return ['aviso', 'sin materias programadas'];
    const clases = await wc.oferta(link, m[0]!.codigo);
    return [clases.length ? 'ok' : 'aviso', `${m.length} materias; la primera tiene ${clases.length} clases`];
  });
  for (const tema of ['calendario', 'inscripciones'] as const) {
    await push(`calendario: ${tema}`, async () => {
      const d = await cal.documentos(tema);
      const conTexto = d.filter((x) => x.texto.length > 200).length;
      return [conTexto ? 'ok' : 'aviso', `${d.length} PDFs, ${conTexto} con texto legible`];
    });
  }
  for (const s of Object.keys(SECCIONES) as Seccion[]) {
    await push(`sección: ${s}`, async () => {
      const d = await sec.consultar(s);
      const largo = 'texto' in d ? d.texto.length : 0;
      return [largo > 100 ? 'ok' : 'aviso', largo > 100 ? `${largo} caracteres` : 'sin texto legible (PDF escaneado o página con filtros)'];
    });
  }

  const n = (e: Estado) => r.filter((x) => x.estado === e).length;
  console.log(`\nResultado: ${n('ok')} OK, ${n('aviso')} avisos, ${n('error')} errores.`);
  if (r.some((x) => /sesión vencida/.test(x.detalle))) console.log('Hay sesiones vencidas: corré login y volvé a probar.');
  if (n('error')) process.exitCode = 1;
}
