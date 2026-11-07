// `uade-mcp doctor`: prueba cada capacidad del MCP contra la cuenta real y muestra solo
// OK / aviso / error con conteos y tiempos. Nunca imprime datos personales (ni notas, ni
// materias, ni montos), así cualquiera puede compartir el reporte para diagnosticar.
import { Calendario } from '../sources/calendario/index.js';
import { comoLlego, SIN_CONTENIDO } from '../sources/docs/legible.js';
import { Inscripciones } from '../sources/inscripciones/index.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { recordatorios, recordatoriosIcs } from '../sources/webcampus/recordatorios.js';
import { PageChangedError } from '../sources/webcampus/parse.js';
import { MIN_CARRERAS_ARANCEL, parseAranceles } from '../sources/webcampus/aranceles.js';
import { SECCIONES, Secciones, TEXTO_DOCUMENTO_PESADO, type Seccion } from '../sources/webcampus/secciones.js';
import { SessionExpiredError } from '../net/session.js';
import { Teams, teamsProfileExists } from '../sources/teams/index.js';
import { SharePointClient } from '../sources/sharepoint/index.js';
import { describirNavegador, elegirNavegador } from '../net/browser.js';
import { elegibilidad } from '../sources/planificador/elegibilidad.js';
import { planificar } from '../sources/planificador/index.js';
import { Pia } from '../sources/pia/index.js';
import type { ClaseOfertada } from '../sources/webcampus/parse.js';
import { bannersConImagenes, leerLink, MAX_BANNERS, MAX_BYTES_BANNER } from '../tools/novedades.js';
import { imagenesDeAvisos } from '../tools/inscripciones.js';
import { ALLOWED_HOSTS } from '../net/policy.js';

type Estado = 'ok' | 'aviso' | 'error';

// Cuántos documentos llegaron al modelo como texto, como imagen o solo con el link; aviso si alguno
// quedó sin contenido (los nombres son de documentos públicos de UADE, no de la persona).
export function resumenDocumentos(docs: { nombre: string; texto?: string; imagenes?: unknown[] }[]): [Estado, string] {
  const por = { texto: 0, imagen: 0, link: 0 };
  const sinContenido: string[] = [];
  for (const d of docs) {
    const como = comoLlego(d);
    por[como]++;
    if (como === 'link') sinContenido.push(d.nombre);
  }
  const resumen = `${docs.length} documento${docs.length === 1 ? '' : 's'}: ${por.texto} como texto, ${por.imagen} como imagen, ${por.link} solo link`;
  return sinContenido.length ? ['aviso', `${resumen}; sin contenido: ${sinContenido.join(', ')}`] : ['ok', resumen];
}
interface Resultado {
  nombre: string;
  estado: Estado;
  detalle: string;
  ms: number;
  tools: string[]; // qué tools del MCP quedan probadas con esta prueba
}

// Tools que doctor no prueba a propósito, con el motivo. Un test (`doctor.test.ts`) exige que cada
// tool registrada esté en alguna prueba o acá: una tool nueva sin prueba hace fallar los tests.
export const TOOLS_SIN_PRUEBA: Readonly<Record<string, string>> = {
  uade_refresh: 'borra la copia local; doctor no destruye nada',
  uade_open_enrollment_site: 'abre una ventana visible en la compu',
  email_compose_draft: 'abre Outlook en el navegador',
  planuade_import_transcript: 'arma un link; es puro y está testeado en planuade-link.test.ts',
  pia_prepare_enrollment: 'puro sobre oferta y ventanas; testeado en pia.test.ts',
  pia_add_to_cart: 'escribe en el carrito de PIA en una ventana visible; el recorrido se prueba contra fixtures en pia-navegador.test.ts',
};

const ICONO: Record<Estado, string> = { ok: '✅', aviso: '⚠️ ', error: '❌' };
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/;

async function probar(nombre: string, tools: string[], fn: () => Promise<[Estado, string]>): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const [estado, detalle] = await fn();
    return { nombre, estado, detalle, ms: Date.now() - t0, tools };
  } catch (err) {
    const e = err as Error;
    const tipo = e instanceof SessionExpiredError ? 'sesión vencida' : e instanceof PageChangedError ? 'UADE cambió la página' : e.name;
    return { nombre, estado: 'error', detalle: `${tipo}: ${e.message.split('. ')[0]}`, ms: Date.now() - t0, tools };
  }
}

function fechasValidas(fechas: (string | null | undefined)[]): boolean {
  return fechas.filter(Boolean).every((f) => FECHA_ISO.test(f!) && !Number.isNaN(Date.parse(f!.slice(0, 10))));
}

export async function doctor(opciones: { json?: boolean } = {}): Promise<void> {
  const log = opciones.json ? () => {} : console.log;
  const wc = new WebCampus();
  const insc = new Inscripciones();
  const cal = new Calendario();
  const sec = new Secciones();
  const r: Resultado[] = [];
  const push = async (n: string, tools: string[], f: () => Promise<[Estado, string]>) => {
    const res = await probar(n, tools, f);
    r.push(res);
    log(`${ICONO[res.estado]} ${res.nombre.padEnd(30)} ${res.detalle} (${(res.ms / 1000).toFixed(1)} s)`);
    return res;
  };

  log('uade-mcp doctor — prueba cada capacidad. No muestra datos personales.\n');

  // Qué navegador usa el MCP para el login (sin rutas: una ruta lleva el nombre de usuario de la compu).
  await push('navegador', ['uade_login'], async () => [elegirNavegador() ? 'ok' : 'aviso', describirNavegador()]);

  let idAula: string | undefined;
  await push('períodos', ['webcampus_terms'], async () => {
    const p = await wc.periodos();
    return [p.length ? 'ok' : 'aviso', `${p.length} períodos`];
  });
  await push('cursos del período', ['webcampus_current_courses'], async () => {
    const c = await wc.cursada();
    idAula = c.aulas.find((a) => /cursada regular/i.test(a.seccion))?.idAula ?? c.aulas[0]?.idAula;
    const conHorario = c.aulas.filter((a) => a.horario).length;
    return [c.aulas.length ? 'ok' : 'aviso', `${c.aulas.length} cursos, ${conHorario} con horario`];
  });
  await push('asistencia', ['webcampus_attendance'], async () => {
    if (!idAula) return ['aviso', 'sin cursos para probar'];
    const a = await wc.asistencia(idAula);
    return ['ok', `${a.clases.length} clases, resumen ${a.resumen.totalClases !== null ? 'completo' : 'vacío'}`];
  });
  await push('planificación (parciales) y recordatorios', ['webcampus_course_calendar', 'webcampus_save_reminders'], async () => {
    const p = await wc.planificaciones();
    const ev = p.flatMap((x) => x.actividades).filter((a) => a.actividad !== 'cursada');
    if (!fechasValidas(ev.map((a) => a.fecha))) return ['error', 'hay fechas inválidas'];
    // El .ics se arma en memoria (no se escribe nada en Downloads desde doctor).
    const eventos = (recordatoriosIcs(recordatorios(p)).match(/BEGIN:VEVENT/g) ?? []).length;
    return [ev.length ? 'ok' : 'aviso', `${p.length} materias, ${ev.length} evaluaciones/finales, ${eventos} recordatorios .ics`];
  });
  await push('equipo docente', ['webcampus_teachers'], async () => {
    if (!idAula) return ['aviso', 'sin cursos para probar'];
    const d = await wc.docentes(idAula);
    return [d.length ? 'ok' : 'aviso', `${d.length} docentes, ${d.filter((x) => x.email).length} con mail`];
  });
  await push('historial académico', ['webcampus_transcript'], async () => {
    const h = await wc.historial();
    const ap = h.materias.filter((m) => m.situacion === 'aprobada');
    if (!fechasValidas(h.materias.flatMap((m) => [m.fechaAprobacion, m.fechaRegularizacion]))) return ['error', 'hay fechas inválidas'];
    const sinFecha = ap.filter((m) => !m.fechaAprobacion).length;
    const fp = h.materias.filter((m) => m.situacion === 'final_pendiente');
    const conVenc = fp.filter((m) => m.vencimientoRegularidad).length;
    return [sinFecha ? 'aviso' : 'ok', `${h.materias.length} materias, ${ap.length} aprobadas${sinFecha ? `, ${sinFecha} sin fecha` : ''}, ${fp.length} a final (${conVenc} con vencimiento), ${h.materias.reduce((n, m) => n + m.intentos.length, 0)} actas, promedio ${h.promedio !== null ? 'ok' : 'sin dato'}`];
  });
  await push('cuenta corriente', ['webcampus_account_balance'], async () => {
    const c = await wc.cuenta();
    const filas = `${c.deudaVencida.length} deudas, ${c.proximosVencimientos.length} facturado a vencer (total ${c.totalProximosVencimientos !== null ? 'ok' : 'sin dato'}), ${c.pagos.length} pagos`;
    return c.otras.length ? ['aviso', `${filas}; ${c.otras.length} tablas no reconocidas: ${c.otras.map((t) => `${t.id} (${t.filas.length} filas)`).join(', ')}`] : ['ok', filas];
  });
  await push('exámenes previos (Excel)', ['webcampus_exam_schedule'], async () => {
    try {
      const e = await wc.examenesPrevios();
      return ['ok', `cronograma encontrado, ${e.examenes.length} exámenes de tus materias`];
    } catch (err) {
      if (/No encontré una novedad/.test((err as Error).message)) return ['aviso', 'UADE no tiene publicado un cronograma de previos ahora'];
      throw err;
    }
  });
  await push('tabla de aranceles (PDF)', ['uade_tuition'], async () => {
    const a = parseAranceles((await sec.textoCompleto('aranceles_pdf')).texto);
    const completas = a.carreras.filter((c) => c.cuotaMensualPorMateria).length;
    if (a.carreras.length < MIN_CARRERAS_ARANCEL || !a.vigenciaDesde) return ['error', `el PDF cambió de formato: ${a.carreras.length} carreras, vigencia ${a.vigenciaDesde ?? 'no encontrada'}`];
    return ['ok', `${a.carreras.length} carreras (${completas} con los tres valores), vigente desde ${a.vigenciaDesde}`];
  });
  await push('ventanas de inscripción', ['uade_enrollment_windows'], async () => {
    const v = await insc.ventanas();
    if (!fechasValidas(v.flatMap((x) => [x.desde, x.hasta]))) return ['error', 'hay fechas inválidas'];
    return ['ok', `${v.length} ventanas, ${v.filter((x) => x.abierta).length} abiertas`];
  });
  await push('cronograma (imagen)', ['uade_enrollment_schedule'], async () => {
    const c = await insc.cronograma();
    return [c.bytes.length > 10_000 ? 'ok' : 'aviso', `${c.mimeType}, ${Math.round(c.bytes.length / 1024)} KB`];
  });
  await push('guía de inscripciones', ['uade_enrollment_guide'], async () => {
    const g = await insc.guia();
    const { imagenes, notas } = await imagenesDeAvisos(g.imagenesImportante.map((path, i) => ({ n: i + 1, path })), insc);
    const imgs = g.imagenesImportante.length ? `, ${imagenes.length} de ${g.imagenesImportante.length} imágenes de avisos bajadas${notas.length ? ` (${notas.length} solo link)` : ''}` : '';
    return [g.preguntasFrecuentes.length && !notas.length ? 'ok' : 'aviso', `${g.importante.length} avisos${imgs}, ${g.instructivos.length} instructivos, ${g.preguntasFrecuentes.length} preguntas frecuentes`];
  });
  await push('agenda de eventos', ['webcampus_news'], async () => {
    const e = await wc.eventos();
    if (!fechasValidas(e.map((x) => x.fecha))) return ['error', 'hay fechas inválidas'];
    const primero = e.find((x) => x.id);
    if (!primero?.id) return ['aviso', 'sin eventos publicados'];
    const d = await wc.evento(primero.id);
    return [d.titulo ? 'ok' : 'aviso', `${e.length} eventos; el primero ${d.titulo ? 'con detalle' : 'sin detalle'}`];
  });
  await push('novedades y banners', ['webcampus_news'], async () => {
    const h = await wc.home();
    const { imagenes } = await bannersConImagenes(h.banners, async (url) => {
      const { mimeType, bytes } = await wc.imagenBanner(url);
      return bytes.length > MAX_BYTES_BANNER ? { tamanio: bytes.length } : { tamanio: bytes.length, mimeType, base64: '-' };
    });
    const esperadas = Math.min(h.banners.filter((b) => b.imagen).length, MAX_BANNERS);
    const banners = `${h.banners.length} banners, ${imagenes.length} como imagen${imagenes.length < esperadas ? ` (${esperadas - imagenes.length} no se pudieron bajar)` : ''}`;
    const primera = h.novedades[0];
    if (!primera) return ['aviso', `${banners}, sin novedades publicadas`];
    const n = await wc.novedad(primera.id);
    // Los documentos que enlazan los banners y los adjuntos de la primera novedad, por el mismo camino
    // que webcampus_news link= (los links a sitios fuera del MCP no son documentos y no cuentan).
    const sp = new SharePointClient();
    const docs: { nombre: string; texto?: string; imagenes?: unknown[] }[] = [];
    for (const link of [...h.banners.map((b) => b.link), ...(n.adjuntos ?? [])]) {
      if (!link) continue;
      const nombre = decodeURIComponent(link.split('/').pop() ?? link);
      try {
        const l = await leerLink(link, { wc, sp });
        if (l.nota && /fuera del MCP/.test(l.nota)) continue;
        docs.push({ nombre: decodeURIComponent(new URL(l.url).pathname.split('/').pop() || nombre), texto: l.texto, imagenes: l.imagenes });
      } catch {
        docs.push({ nombre });
      }
    }
    const [estadoDocs, detalleDocs] = resumenDocumentos(docs);
    const bien = n.titulo && imagenes.length === esperadas && estadoDocs === 'ok';
    return [bien ? 'ok' : 'aviso', `${banners}, ${h.novedades.length} novedades; la primera ${n.titulo ? 'con detalle' : 'sin detalle'}${n.adjuntos?.length ? `, ${n.adjuntos.length} adjuntos` : ''}; ${detalleDocs}`];
  });
  await push('correlativas y elegibilidad', ['uade_eligible_subjects'], async () => {
    const [h, plan] = await Promise.all([wc.historial(), wc.correlativas()]);
    if (!plan.materias.length) return ['aviso', 'el plan no tiene materias con correlativas'];
    const e = elegibilidad(h.materias, plan);
    return ['ok', `plan de ${plan.materias.length} materias: ${e.cursar.length} para cursar, ${e.rendir.length} para rendir, ${e.cursando.length} cursando`];
  });
  await push('clases de consulta', ['webcampus_consultation_classes'], async () => {
    const c = await wc.clasesDeConsulta();
    return ['ok', c.materias.length ? `${c.materias.length} materias con clases de consulta` : 'ninguna materia con clases de consulta ahora'];
  });
  const oferta = new Map<string, ClaseOfertada[]>();
  await push('oferta de clases', ['webcampus_class_offering'], async () => {
    const link = await insc.linkProgramacion();
    const m = await wc.ofertaMaterias(link);
    if (!m.length) return ['aviso', 'sin materias programadas'];
    for (const materia of m.slice(0, 2)) oferta.set(materia.codigo, await wc.oferta(link, materia.codigo));
    const clases = oferta.get(m[0]!.codigo)!;
    return [clases.length ? 'ok' : 'aviso', `${m.length} materias; la primera tiene ${clases.length} clases`];
  });
  await push('planificador de semana', ['webcampus_schedule_planner', 'uade_plan_next_term'], async () => {
    if (!oferta.size) return ['aviso', 'sin oferta para probar'];
    const r = planificar(oferta, {}, 3);
    return [r.combinaciones.length || r.conflictos.length ? 'ok' : 'aviso', `${oferta.size} materias: ${r.combinaciones.length} semanas posibles, ${r.conflictos.length} conflictos, ${r.exploradas} nodos`];
  });
  await push('PIA (buscador)', ['pia_class_search'], async () => {
    const abierta = (await insc.ventanas()).find((v) => v.tipo === 'inscripcion' && v.abierta && v.link);
    if (!abierta?.link) return ['aviso', 'sin ventana de inscripción abierta: no se puede probar'];
    try {
      const { materias } = await new Pia().materias(abierta.link);
      return [materias.length ? 'ok' : 'aviso', `${materias.length} materias en la ventana abierta`];
    } catch (err) {
      if (/rechazó el acceso/.test((err as Error).message)) return ['aviso', 'PIA rechazó el link de la ventana (límite conocido, docs/PIA-HANDOFF.md)'];
      throw err;
    }
  });
  await push('materiales (Teams/SharePoint)', ['webcampus_course_materials', 'webcampus_save_material', 'webcampus_save_folder'], async () => {
    const { aulas } = await wc.cursada();
    const aula = aulas.find((a) => a.links.apuntesTeams || a.links.apuntesMateria);
    if (!aula) return ['aviso', 'ninguna materia tiene apuntes de Teams enlazados'];
    const link = aula.links.apuntesTeams ?? aula.links.apuntesMateria!;
    const site = new URL(link).pathname.match(/^(\/sites\/[^/]+)/)?.[1];
    if (!site) return ['aviso', 'no pude resolver el sitio de SharePoint'];
    const sp = new SharePointClient();
    for (const lib of ['Materiales de clase', 'Class Materials']) {
      try { const e = await sp.listar(`${site}/${lib}`); return [e.length ? 'ok' : 'aviso', `${e.length} items en "${lib}"`]; } catch { /* probar otro */ }
    }
    return ['aviso', 'no encontré la carpeta de materiales (quizá la sesión de SharePoint venció: corré login)'];
  });
  await push('Teams (novedades del canal)', ['teams_channel_news'], async () => {
    if (!teamsProfileExists()) return ['aviso', 'sin configurar: corré login-teams para leer canales de Teams'];
    const { aulas } = await wc.cursada();
    const conTeams = aulas.find((a) => a.links.teams);
    if (!conTeams) return ['aviso', 'ninguna materia tiene equipo de Teams'];
    const posts = await new Teams().novedades(conTeams.links.teams!, 3);
    return [posts.length ? 'ok' : 'aviso', posts.length ? `${posts.length} mensajes leídos de una materia` : 'canal vacío o Teams cambió su interfaz'];
  });
  for (const tema of ['calendario', 'inscripciones'] as const) {
    await push(`calendario: ${tema}`, ['uade_academic_calendar'], async () => {
      const d = await cal.documentos(tema);
      const conTexto = d.filter((x) => comoLlego(x) === 'texto').length;
      const conImagenes = d.filter((x) => comoLlego(x) === 'imagen').length;
      const ilegibles = d.filter((x) => comoLlego(x) === 'link').map((x) => x.nombre);
      const resumen = `${d.length} PDFs, ${conTexto} con texto legible${conImagenes ? `, ${conImagenes} como imagen` : ''}`;
      return ilegibles.length ? ['aviso', `${resumen}; ilegibles: ${ilegibles.join(', ')}`] : [conTexto ? 'ok' : 'aviso', resumen];
    });
  }
  for (const s of Object.keys(SECCIONES) as Seccion[]) {
    await push(`sección: ${s}`, ['webcampus_section'], async () => {
      const d = await sec.consultar(s);
      const texto = 'texto' in d ? d.texto : '';
      const imgs = d.imagenes?.length ?? 0;
      if (texto.startsWith(TEXTO_DOCUMENTO_PESADO)) return ['aviso', 'pesa más de 10 MB: la tool devuelve el link'];
      // Guías enlazadas que no dieron ni texto ni imágenes (el texto de la sección lo dice).
      const guiasSinContenido = texto.split(SIN_CONTENIDO).length - 1 + (texto.match(/\(no se pudo leer\)/g)?.length ?? 0);
      // La legibilidad ya la midió Secciones en cada PDF; acá solo importa qué quedó: el documento
      // principal como imágenes (su texto es el aviso "(PDF …"), sin contenido, o texto.
      const como = imgs && texto.startsWith('(PDF') ? 'imagen' : texto.length <= 100 || texto.startsWith(SIN_CONTENIDO) ? 'link' : 'texto';
      const detalle = `${como === 'imagen' ? `como imagen (${imgs})` : como === 'texto' ? `como texto (${texto.length} caracteres)${imgs ? ` y ${imgs} imágenes de guías` : ''}` : 'solo link: sin texto legible ni imágenes'}${guiasSinContenido ? `; ${guiasSinContenido} guías solo link` : ''}`;
      return [como !== 'link' && !guiasSinContenido ? 'ok' : 'aviso', detalle];
    });
  }

  const n = (e: Estado) => r.filter((x) => x.estado === e).length;
  const probadas = [...new Set(r.flatMap((x) => x.tools))];
  const rotas = [...new Set(r.filter((x) => x.estado === 'error').flatMap((x) => x.tools))];
  if (opciones.json) {
    // Para programarlo (cron, launchd, Programador de tareas): una línea por resultado, sin datos
    // personales, y código de salida 1 si algo se rompió.
    console.log(JSON.stringify({ fecha: new Date().toISOString(), ok: n('ok'), avisos: n('aviso'), errores: n('error'), toolsProbadas: probadas, toolsRotas: rotas, toolsSinPrueba: Object.keys(TOOLS_SIN_PRUEBA), resultados: r }));
  } else {
    log(`\nResultado: ${n('ok')} OK, ${n('aviso')} avisos, ${n('error')} errores. Tools probadas: ${probadas.length} (sin prueba a propósito: ${Object.keys(TOOLS_SIN_PRUEBA).length}).`);
    if (rotas.length) log(`Tools afectadas: ${rotas.join(', ')}.`);
    if (r.some((x) => /sesión vencida/.test(x.detalle))) log('Hay sesiones vencidas: corré login y volvé a probar.');
  }
  if (n('error')) process.exitCode = 1;
}
