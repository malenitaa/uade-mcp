// Inventario de lo que UADE publica para un alumno, comparado con lo que lee el MCP.
// Se corre a mano cada cuatrimestre (ver docs/INVENTARIO.md):
//
//   npm run build && node scripts/inventario.mjs            # recorre todo y actualiza docs/INVENTARIO.md
//   node scripts/inventario.mjs --solo webcampus,publico    # solo algunas fuentes (no toca el .md)
//
// Solo lectura, siempre:
// - WebCampus e Inscripciones van con el cliente del MCP (dist/), con la sesión del llavero y la misma
//   política de red (allowlist + lista negra). Solo GET: nunca un postback ni un formulario.
// - No se siguen trámites, reservas, encuestas, pagos, logout ni links de PIA (lista NO_SEGUIR abajo).
// - El sitio oficial (www.uade.edu.ar, dre.uade.edu.ar) va sin cookies: primero robots.txt, como
//   máximo un pedido por segundo, y solo las páginas útiles para alguien que ya cursa (CRITERIO_PUBLICO).
// - De lo personal se guarda solo la estructura (ids, encabezados de tablas, clases de filas,
//   cantidades), nunca valores: ni montos, ni notas, ni nombres, ni títulos de páginas personales.
// El detalle completo queda en ~/.uade-mcp/inventario/<fecha>.json (fuera del repo); en el repo va
// solo la tabla de docs/INVENTARIO.md, entre los marcadores <!-- inventario:inicio/fin -->.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { getDocumentProxy } from 'unpdf';

const dist = (p) => import(new URL(`../dist/${p}`, import.meta.url).href);
const { WebCampusClient, WEBCAMPUS } = await dist('sources/webcampus/client.js');
const { InscripcionesClient, INSCRIPCIONES } = await dist('sources/inscripciones/index.js');
const { safeFetch } = await dist('net/http.js');
const { DENY_RULES, PolicyError } = await dist('net/policy.js');
const { leerPdf } = await dist('sources/calendario/index.js');
const { textoLegible } = await dist('sources/docs/legible.js');
const { imagenesDePdf } = await dist('sources/docs/pdf-imagenes.js');
const { textoPagina, guiasEnlazadas } = await dist('sources/webcampus/secciones.js');
const { parseCuenta } = await dist('sources/webcampus/parse.js');
const { parseHome } = await dist('sources/webcampus/novedades.js');
const { setRenovador } = await dist('net/session.js');
const { iniciarSesion } = await dist('auth/login.js');

// La sesión vence cada ~3 h: igual que el servidor, se renueva sin ventana (perfil del navegador) y
// el pedido se repite una vez. Si Microsoft pide algo, el script falla y hay que correr `uade-mcp login`.
setRenovador(async () => (await iniciarSesion({ interactivo: false })).ok);

const args = process.argv.slice(2);
const solo = args.includes('--solo') ? args[args.indexOf('--solo') + 1].split(',') : ['webcampus', 'inscripciones', 'publico', 'pia'];
const FECHA = new Date().toISOString().slice(0, 10);

// ── Ritmo ─────────────────────────────────────────────────────────────────────
const PAUSA_MS = { webcampus: 1500, inscripciones: 1500, publico: 1000 };
const ultimo = {};
async function turno(fuente) {
  const espera = (ultimo[fuente] ?? 0) + PAUSA_MS[fuente] - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimo[fuente] = Date.now();
}

// ── Qué no se abre nunca (además de la lista negra del MCP) ───────────────────
// Menús de WebCampus que son trámites o escritura: no se visitan, solo se anotan.
const MENU_NO_SEGUIR = {
  248: 'lista de interesados (escritura)',
  204: 'reserva de turnos (escritura)',
  258: 'reserva de turnos (escritura)',
  323: 'reserva de turnos (escritura)',
};
const NO_SEGUIR = /logout|cerrarsesion|pago|cupon|debito|baja|inscrib|reserv|turno|encuesta|solicit|confirm|acept|enviar|tramite|atencion\.aspx|certificado|datospersonales|recupero|data-linkid|inscripcionespia|pia\.uade/i;

// ── Qué lee el MCP hoy, por ítem ───────────────────────────────────────────────
// acceso: publico | login (igual para todos, detrás del login) | personal
// mcp: lee | mal (lo lee mal) | no (no lo lee) | fuera (fuera de alcance a propósito o sitio externo)
// imagen: la tool devuelve el documento como imagen si no tiene texto legible.
const MAPA = {
  'menu:12': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_account_balance', verificar: 'cuenta' },
  'menu:128': { acceso: 'personal', mcp: 'fuera', nota: 'genera el PDF con un postback' },
  'menu:56': { acceso: 'personal', mcp: 'fuera', nota: 'datos personales (lista negra)' },
  'menu:161': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_section marcaciones' },
  'menu:219': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section codigo_conducta' },
  'menu:225': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section compromiso_uade' },
  'menu:513': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section codigo_vestimenta' },
  'menu:368': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section protocolo_intervencion' },
  'menu:5': { acceso: 'publico', mcp: 'fuera', nota: 'sitio institucional (recorrido aparte, sin sesión)' },
  'menu:288': { acceso: 'personal', mcp: 'fuera', nota: 'Outlook; solo borradores con email_compose_draft' },
  'menu:6': { acceso: 'personal', mcp: 'fuera', nota: 'portal de CV' },
  'menu:14': { acceso: 'login', mcp: 'fuera', nota: 'biblioteca' },
  'menu:363': { acceso: 'login', mcp: 'fuera', nota: 'videoclases' },
  'menu:543': { acceso: 'personal', mcp: 'fuera', nota: 'parking (reservas)' },
  'menu:199': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section deportes' },
  'menu:443': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section becas' },
  'menu:194': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section ayuda_estudiante' },
  'menu:200': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section housing' },
  'menu:483': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section emergencias' },
  'menu:248': { acceso: 'personal', mcp: 'fuera', nota: 'escritura' },
  'menu:303': { acceso: 'personal', mcp: 'fuera', nota: 'trámite (lista negra)' },
  'menu:148': { acceso: 'login', mcp: 'lee', tool: 'webcampus_class_offering', nota: 'solo remite a la Programación del sitio de inscripciones' },
  'menu:508': { acceso: 'personal', mcp: 'fuera', nota: 'débito automático (lista negra)' },
  'menu:114': { acceso: 'login', mcp: 'lee', tool: 'uade_enrollment_windows y demás', nota: 'lleva al sitio de inscripciones (recorrido aparte, abajo)' },
  'menu:115': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_section comprobantes' },
  'menu:133': { acceso: 'personal', mcp: 'fuera', nota: 'trámites web (lista negra)' },
  'menu:204': { acceso: 'personal', mcp: 'fuera', nota: 'reserva (escritura)' },
  'menu:258': { acceso: 'personal', mcp: 'fuera', nota: 'reserva (escritura)' },
  'menu:323': { acceso: 'personal', mcp: 'fuera', nota: 'reserva (escritura)' },
  'menu:160': { acceso: 'login', mcp: 'lee', tool: 'uade_tuition, webcampus_section aranceles' },
  'menu:173': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section materias_intensivas_mri' },
  'menu:83': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section carreras' },
  'menu:98': { acceso: 'login', mcp: 'no', nota: 'combos en cascada (facultad → carrera → materia)' },
  'menu:273': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section optativas' },
  'menu:280': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section normativa_academica' },
  'menu:269': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section guia_alumnos' },
  'menu:358': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section intercambio' },
  'menu:378': { acceso: 'login', mcp: 'fuera', nota: 'UADE Hub' },
  'menu:403': { acceso: 'login', mcp: 'lee', tool: 'uade_academic_calendar', imagen: true },
  'menu:428': { acceso: 'login', mcp: 'lee', tool: 'uade_academic_calendar topic=inscripciones', imagen: true },
  'menu:568': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section mencion_honor' },
  'menu:588': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section minors' },
  'menu:168': { acceso: 'login', mcp: 'lee', tool: 'uade_eligible_subjects', nota: 'igual para todos los del mismo plan' },
  'menu:11': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_transcript' },
  'menu:108': { acceso: 'personal', mcp: 'fuera', nota: 'falla del lado de UADE; se usa la de cada materia' },
  'menu:253': { acceso: 'personal', mcp: 'fuera', nota: 'datos de terceros (lista negra)' },
  'menu:143': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_transcript' },
  'menu:158': { acceso: 'login', mcp: 'lee', tool: 'webcampus_transcript (plan completo)', nota: 'igual para todos los del mismo plan' },
  'menu:93': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section admision_sia' },
  'menu:408': { acceso: 'personal', mcp: 'no', nota: 'formulario interactivo' },
  'menu:593': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section lineamientos_ia' },
  'menu:0': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_current_courses' },
  'menu:333': { acceso: 'login', mcp: 'lee', tool: 'webcampus_consultation_classes' },
  '/HomeWC.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_news', verificar: 'home' },
  '/MiContenido/Novedades.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_news newsId' },
  '/MiContenido/Eventos.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_news allEvents' },
  '/MiContenido/Agenda.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_news eventId' },
  '/AgendaEventos/MisActividades.aspx': { acceso: 'personal', mcp: 'fuera', nota: 'inscripciones a eventos (escritura)' },
  '/MiContenido/Wifi.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section wifi' },
  '/Contenidos/Marcaciones.aspx': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_section marcaciones' },
  '/Atencion.aspx': { acceso: 'personal', mcp: 'fuera', nota: 'formulario que manda un mail' },
  '/MiContenido/Encuesta.aspx': { acceso: 'personal', mcp: 'fuera', nota: 'encuestas (escritura)' },
  '/Home.aspx': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_current_courses' },
  '/MiAula.aspx': { acceso: 'personal', mcp: 'no', nota: 'home del aula; lo útil sale de las páginas de abajo' },
  '/AsistenciaAlumnos.aspx': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_attendance' },
  '/Integrantes/Integrantes.aspx': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_teachers' },
  '/PlanificacionClases/MiSemana.aspx': { acceso: 'personal', mcp: 'lee', tool: 'webcampus_course_calendar' },
  '/Contenidos/NovedadHist.aspx': { acceso: 'personal', mcp: 'no', nota: 'sin ejemplo con contenido' },
  '/Contenidos/DownloadPrograma.aspx': { acceso: 'login', mcp: 'no', nota: 'programa de la materia (igual para todos los que la cursan)' },
  '/Aranceles/ArancelesWC.aspx': { acceso: 'login', mcp: 'lee', tool: 'webcampus_section aranceles' },
  '/Contenidos/PlanesEstudioListaMaterias.aspx': { acceso: 'login', mcp: 'no', nota: 'materias de cada carrera, con su código (el código abre el programa)' },
  '/contenidos/certificadoExamen.aspx': { acceso: 'personal', mcp: 'fuera', nota: 'genera un certificado' },
  'host:teams.microsoft.com': { acceso: 'personal', mcp: 'lee', tool: 'teams_channel_news (experimental)' },
  'host:uadeeduar.sharepoint.com': { acceso: 'login', mcp: 'lee', tool: 'webcampus_course_materials' },
  'host:help.uade.edu.ar': { acceso: 'login', mcp: 'fuera', nota: 'aplicación aparte con su propia sesión' },
  'host:comunicacion.short.gy': { acceso: 'publico', mcp: 'lee', tool: 'webcampus_news link' },
};

// PDFs públicos de dre.uade.edu.ar que alguna tool ya lee (por nombre de archivo).
// (Los del calendario y los cronogramas salen de seguir los links del PDF del menú, como la tool.)
const DRE_LEIDOS = [[/\/emergencia\.pdf$/i, 'webcampus_section emergencias', false]];

// ── Sitio oficial: qué se recorre y por qué ────────────────────────────────────
// El sitemap tiene ~10.000 URLs: 8.600 son eventos de la agenda y casi todo el resto es marketing para
// ingresantes (carreras, facultades, posgrados, investigación). Se toma lo que le sirve a quien ya
// cursa: preguntas frecuentes, ayuda al estudiante, normas, becas (y su cronograma), reinscripción,
// formas de pago, intercambio, sedes, deportes, housing, búsquedas laborales y pasantías, avisos del
// home, y una carrera de ejemplo (para ver cómo publica el plan de estudios).
const CRITERIO_PUBLICO = [
  /^\/$/,
  /^\/uade-faqs\/$/,
  /^\/acerca-de-uade\/(ayuda-al-estudiante|codigo-de-conducta|cursada-intensiva|uade-housing|centro-deportivo-escuela|oportunidades-para-alumnos|uade-hub)\/$/,
  /^\/acerca-de-uade\/desarrollo-profesional-uade-alumni-club\/desarrollo-profesional\/(busquedas-laborales|pasantias)\/$/,
  /^\/informacion-para\/ingresantes\/(becas|becas\/cronograma-de-becas|reinscripciones|modalidades-de-pago|sistema-de-admision|mencion-de-honor)\/$/,
  /^\/uade-internacional\/outgoing\/(postulacion\/)?$/,
  /^\/sites\/(belgrano|recoleta|costa-argentina)\/$/,
  /^\/(contacto|minors|aviso-legal-web-campus|noticias|agenda)\/$/,
  /^\/facultad-de-ingenieria-y-ciencias-exactas\/ingenieria-en-informatica\/$/,
];
const PUBLICO_HOSTS = new Set(['www.uade.edu.ar', 'dre.uade.edu.ar', 'www.dre.uade.edu.ar']);
const UA = 'uade-mcp-inventario (+https://github.com/malenitaa/uade-mcp)';

// ── Utilidades ────────────────────────────────────────────────────────────────
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
// Nada que pueda identificar a alguien: mails, números largos (legajos, DNI, montos), tokens.
const sinDatos = (s) => clean(s).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<mail>').replace(/\$\s?[\d.,]+/g, '<monto>').replace(/\d{5,}/g, '<n>').slice(0, 90);
// Parámetros que identifican a la persona o a su aula: se enmascaran en las URLs que se guardan.
function urlLimpia(u) {
  try {
    const url = new URL(u);
    for (const [k, v] of [...url.searchParams]) {
      if (/^(idaula|idusuario|periodo|idmateria|id|idnov|a|m|h|t|users|legajo)$/i.test(k) || v.length > 20) url.searchParams.set(k, '…');
    }
    if (url.hostname === 'teams.microsoft.com' || url.hostname.endsWith('sharepoint.com') || url.hostname.endsWith('pemres.net')) return `https://${url.hostname}/…`;
    // El programa de una materia que se cursa dice qué cursa la persona: va sin el nombre del archivo.
    if (/^\/Programas\//i.test(url.pathname)) return `${url.origin}/Programas/<código>_<materia>_<fecha>.pdf`;
    return decodeURIComponent(url.href);
  } catch {
    return String(u).slice(0, 80);
  }
}
const bloqueadoPor = (u) => {
  const t = (() => { try { const x = new URL(u); return decodeURIComponent(x.host + x.pathname + x.search).toLowerCase(); } catch { return String(u).toLowerCase(); } })();
  return DENY_RULES.find((r) => r.pattern.test(t))?.motivo ?? null;
};

function tipoDeBytes(b, ct = '') {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b) return /sheet|excel/i.test(ct) ? 'excel' : 'office (zip)';
  if (b[0] === 0xd0 && b[1] === 0xcf) return 'office (viejo)';
  if ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0x47 && b[1] === 0x49)) return 'imagen';
  return 'pagina';
}

async function infoPdf(bytes) {
  const out = { paginas: null, legible: null, caracteres: 0, escaneado: false, links: [] };
  try {
    const doc = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    out.paginas = doc.numPages;
    const { texto, links } = await leerPdf(bytes);
    out.caracteres = texto.length;
    out.legible = textoLegible(texto);
    out.links = links;
    if (texto.length < 100) out.escaneado = imagenesDePdf(bytes).length > 0;
  } catch (e) {
    out.error = sinDatos(e.message);
  }
  return out;
}

// Huella de estructura de una página. Para lo personal no se guardan títulos (pueden traer nombres).
function huella(html, base, { personal }) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const raiz = $('[id^="ctl00_ContentPlaceHolderMain"]').filter((_, e) => !$(e).parents('[id^="ctl00_ContentPlaceHolderMain"]').length);
  const main = raiz.length ? raiz : $('main').length ? $('main') : $('body');
  // Solo ids con forma de id: algunas páginas usan como id una URL con parámetros (los comprobantes
  // de la cuenta corriente), y eso no se guarda.
  const ids = [...new Set(main.find('[id^="ctl00_ContentPlaceHolderMain"]').addBack('[id]').map((_, e) => $(e).attr('id').replace(/^ctl00_ContentPlaceHolderMain_?/, '').replace(/_ctl\d+/g, '_ctlN').replace(/\d+$/, 'N')).get())].filter((id) => /^[A-Za-z][\w-]{0,60}$/.test(id));
  const titulos = personal ? [] : [...new Set(main.find('h1, h2, h3, h4, .titulo, .tit_seccion').map((_, e) => sinDatos($(e).text())).get().filter(Boolean))].slice(0, 12);
  const tablas = main.find('table').addBack('table').filter((_, t) => !$(t).parents('table').length).map((_, t) => ({
    id: ($(t).attr('id') ?? '').replace(/^ctl00_ContentPlaceHolderMain_?/, '') || null,
    encabezados: $(t).find('th').map((_, th) => sinDatos($(th).text())).get().filter(Boolean).slice(0, 14),
    clasesFilas: [...new Set($(t).find('tr').map((_, tr) => $(tr).attr('class')).get().filter(Boolean))],
    filas: personal ? undefined : $(t).find('tr').length,
  })).get().slice(0, 15);
  const enviables = main.find('input[type=submit], input[type=button], button, a[href^="javascript:__doPostBack"], a[onclick*="__doPostBack"]');
  const links = main.find('a[href]').map((_, a) => $(a).attr('href')).get().filter((h) => !/^(#|javascript:|mailto:)/i.test(h));
  const hosts = {};
  for (const h of links) { try { const host = new URL(h, base).host; hosts[host] = (hosts[host] ?? 0) + 1; } catch { /* link roto */ } }
  const texto = clean(main.text());
  return {
    ids: ids.slice(0, 40),
    titulos,
    tablas,
    imagenes: main.find('img').length,
    imagenesSinAlt: main.find('img').filter((_, i) => !clean($(i).attr('alt'))).length,
    formularios: {
      enviables: enviables.length,
      botones: personal ? [] : [...new Set(enviables.map((_, b) => sinDatos($(b).attr('value') || $(b).text())).get().filter(Boolean))].slice(0, 10),
      selects: main.find('select').length,
      campos: main.find('input[type=text], textarea, input[type=file]').length,
    },
    linksPorHost: hosts,
    caracteresTexto: texto.length,
    vacia: /sin resultados|sin novedades|no hay (datos|informaci)/i.test(texto) || undefined,
  };
}

// ── Registro ──────────────────────────────────────────────────────────────────
const items = [];
function registrar(item) {
  const m = MAPA[item.clave] ?? (item.host && MAPA[`host:${item.host}`]) ?? null;
  const r = { fuente: item.fuente, grupo: item.grupo ?? null, titulo: item.titulo, url: item.url ? urlLimpia(item.url) : null, tipo: item.tipo, host: item.host ?? null, acceso: item.acceso ?? m?.acceso ?? '?', mcp: m?.mcp ?? 'no', tool: m?.tool ?? null, nota: item.nota ?? m?.nota ?? null, huella: item.huella ?? null, pdf: item.pdf ?? null };
  if (item.mcp) Object.assign(r, item.mcp);
  if (!m && !item.mcp && /^(no seguido|bloqueado)$/.test(r.tipo)) r.mcp = 'fuera';
  if (r.acceso === '?' && r.tipo === 'externo') r.acceso = '—';
  // Lo que se lee mal, medido (no anotado a mano).
  if (r.mcp === 'lee' && r.pdf) {
    if (r.pdf.legible === false && !(item.imagen ?? m?.imagen)) Object.assign(r, { mcp: 'mal', motivo: r.pdf.escaneado ? 'PDF escaneado' : 'PDF sin texto legible' });
    else if (r.pdf.legible === false) r.motivo = 'sin texto legible: va como imagen';
  }
  if (r.mcp === 'lee' && item.recortado) Object.assign(r, { mcp: 'mal', motivo: `recortado a 8.000 caracteres sin query (tiene ${item.recortado})` });
  if (item.motivo) Object.assign(r, { motivo: item.motivo });
  items.push(r);
  console.error(`  ${r.mcp.padEnd(5)} ${r.tipo.padEnd(9)} ${r.titulo}${r.motivo ? ` — ${r.motivo}` : ''}`);
  return r;
}

// ── WebCampus ─────────────────────────────────────────────────────────────────
async function wcGet(path) {
  await turno('webcampus');
  return wcClient.get(path);
}
let wcClient;

async function visitarWc(path, meta, { hijos = true } = {}) {
  const url = new URL(path, WEBCAMPUS).href;
  const base = { fuente: 'WebCampus', ...meta };
  let r;
  try {
    r = await wcGet(path);
  } catch (e) {
    if (e instanceof PolicyError) {
      if (/solo https/.test(e.message)) return registrar({ ...base, url, tipo: 'externo', acceso: MAPA[base.clave]?.acceso, nota: MAPA[base.clave]?.nota ?? 'redirige a un sitio por http, no se contactó' });
      const host = e.message.match(/allowlist: (\S+)/)?.[1];
      if (host) return registrar({ ...base, url, tipo: 'externo', host, acceso: MAPA[base.clave]?.acceso, nota: MAPA[base.clave]?.nota ?? `sitio externo (${host}), no se contactó` });
      if (/demasiado grande/.test(e.message)) return registrar({ ...base, url, tipo: 'pesado', motivo: 'pesa más de 10 MB: el MCP no lo descarga', mcp: { mcp: MAPA[base.clave]?.mcp === 'lee' ? 'mal' : MAPA[base.clave]?.mcp ?? 'no' } });
      return registrar({ ...base, url, tipo: 'bloqueado', nota: e.message.replace(/^bloqueado por política: /, 'lista negra: ') });
    }
    return registrar({ ...base, url, tipo: 'error', nota: sinDatos(e.message) });
  }
  const final = r.url.href;
  // Un link que lleva a una página ya registrada (el menú y el contenido apuntan a lo mismo) no se repite.
  if (!hijos && urlsVistas.has(final)) return null;
  urlsVistas.add(final);
  const tipo = tipoDeBytes(r.bytes);
  const personal = (meta.acceso ?? MAPA[base.clave]?.acceso ?? 'personal') === 'personal';
  const acceso = r.url.host !== new URL(WEBCAMPUS).host && PUBLICO_HOSTS.has(r.url.host) ? 'publico' : meta.acceso;
  const mcp = meta.heredado;
  if (tipo === 'pdf') {
    const pdf = await infoPdf(r.bytes);
    const reg = registrar({ ...base, url: final, tipo, host: r.url.host, acceso, pdf, mcp });
    // Calendario y cronogramas: la tool sigue los links del PDF hasta dos niveles; el inventario, igual.
    if (/uade_academic_calendar/.test(MAPA[base.clave]?.tool ?? '')) await seguirCalendario(pdf.links, 1, { grupo: meta.grupo, titulo: meta.titulo, tool: MAPA[base.clave].tool });
    return reg;
  }
  if (tipo !== 'pagina') return registrar({ ...base, url: final, tipo, host: r.url.host, acceso, mcp });
  const h = huella(r.html, final, { personal });
  let recortado;
  if (/^webcampus_section/.test(MAPA[base.clave]?.tool ?? '')) { try { const t = textoPagina(r.html).length; if (t > 8000) recortado = t; } catch { /* sin bloques */ } }
  let motivo;
  if (MAPA[base.clave]?.verificar === 'cuenta') { try { const c = parseCuenta(r.html); if (c.otras.length) motivo = `${c.otras.length} tabla(s) que el parser no conoce`; } catch (e) { motivo = sinDatos(e.message); } }
  const reg = registrar({ ...base, url: final, tipo, host: r.url.host, acceso, huella: h, recortado, motivo, mcp: motivo ? { mcp: 'mal' } : mcp });
  if (!hijos) return reg;
  // Las guías en PDF que webcampus_section sigue por su cuenta (guiasEnlazadas, hasta 6).
  const toolPadre = MAPA[base.clave]?.tool ?? '';
  const guias = /^webcampus_section/.test(toolPadre) ? new Set(guiasEnlazadas(r.html)) : new Set();
  const accesoHijos = MAPA[base.clave]?.acceso === 'personal' ? 'personal' : 'login';

  // Documentos y páginas que enlaza el contenido (un nivel).
  const $ = cheerio.load(r.html);
  const raiz = $('[id^="ctl00_ContentPlaceHolderMain"]');
  const vistos = new Set();
  let n = 0;
  for (const a of raiz.find('a[href]').toArray()) {
    const href = $(a).attr('href');
    if (!href || /^(#|javascript:|mailto:)/i.test(href)) continue;
    let u;
    try { u = new URL(href, final); } catch { continue; }
    if (vistos.has(u.href) || ++n > 12) continue;
    vistos.add(u.href);
    const titulo = `${meta.titulo} › ${sinDatos($(a).text()) || decodeURIComponent(u.pathname.split('/').pop() || u.host)}`;
    const menu = u.searchParams.get('MenuItemId');
    if (menu && u.host === r.url.host) { if (!menusVistos.has(menu)) colaMenus.push({ id: menu, titulo, grupo: `${meta.grupo} (submenú)` }); continue; }
    if (u.origin === WEBCAMPUS && /^\/(HomeWC\.aspx)?$/i.test(u.pathname)) continue; // vuelve al inicio
    const clave = u.origin === WEBCAMPUS ? u.pathname : `https://${u.hostname}${u.pathname}`;
    const heredado = guias.has(clave) ? { mcp: 'lee', tool: `${toolPadre} (guía enlazada)` } : undefined;
    await visitarEnlace(u, { titulo, grupo: meta.grupo, acceso: accesoHijos, heredado }, { texto: $(a).text() });
  }
  return reg;
}

async function visitarEnlace(u, meta, { texto = '' } = {}) {
  const base = { fuente: 'WebCampus', grupo: meta.grupo, titulo: meta.titulo, clave: u.pathname, acceso: meta.acceso, heredado: meta.heredado };
  if (u.origin === WEBCAMPUS && /https?\/\/|\/www\.|@/i.test(decodeURIComponent(u.pathname))) return registrar({ ...base, url: u.href, tipo: 'link roto', nota: 'link mal armado en la página de UADE (relativo a otro sitio)', mcp: { mcp: 'fuera' } });
  if (bloqueadoPor(u.href)) return registrar({ ...base, url: u.href, tipo: 'bloqueado', nota: `lista negra: ${bloqueadoPor(u.href)}` });
  if (NO_SEGUIR.test(u.href) || NO_SEGUIR.test(texto)) return registrar({ ...base, url: u.href, tipo: 'no seguido', host: u.host, nota: 'trámite o escritura: no se abre' });
  if (u.origin === WEBCAMPUS) return visitarWc(u.pathname + u.search, base, { hijos: false });
  if (PUBLICO_HOSTS.has(u.host) && /\.pdf$/i.test(u.pathname)) return visitarDre(u.href, { ...base, fuente: 'WebCampus', acceso: undefined });
  if (u.host === 'comunicacion.short.gy') {
    await turno('publico');
    try {
      const res = await safeFetch(u, { redireccionAfuera: 'devolver' });
      const destino = res.url;
      if (res.fueraDelMcp) return registrar({ ...base, url: destino.href, tipo: 'externo', host: destino.host, nota: `acortador → ${destino.host}`, acceso: 'publico', mcp: { mcp: 'fuera' } });
      if (PUBLICO_HOSTS.has(destino.host) && tipoDeBytes(res.body) === 'pdf') return registrar({ ...base, url: destino.href, tipo: 'pdf', host: destino.host, acceso: 'publico', pdf: await infoPdf(res.body), mcp: { mcp: 'lee', tool: 'webcampus_news link' } });
      return registrar({ ...base, url: destino.href, tipo: tipoDeBytes(res.body), host: destino.host, acceso: 'publico', mcp: { mcp: 'lee', tool: 'webcampus_news link' } });
    } catch (e) {
      return registrar({ ...base, url: u.href, tipo: 'error', host: u.host, nota: sinDatos(e.message) });
    }
  }
  const m = MAPA[`host:${u.host}`];
  return registrar({ ...base, url: u.href, tipo: 'externo', host: u.host, acceso: m?.acceso, mcp: m ? undefined : { mcp: 'fuera' }, nota: m?.nota ?? `sitio externo (${u.host}), no se contactó` });
}

const menusVistos = new Set();
const urlsVistas = new Set();

async function seguirCalendario(links, nivel, meta) {
  for (const l of links) {
    if (!/^https?:\/\/(www\.)?dre\.uade\.edu\.ar\/.+\.pdf$/i.test(l)) continue;
    const reg = await visitarDre(l, { fuente: 'WebCampus', grupo: meta.grupo, titulo: `${meta.titulo} › ${decodeURIComponent(l.split('/').pop())}`, heredado: { mcp: 'lee', tool: meta.tool }, imagen: /inscripciones/.test(meta.tool) });
    if (reg?.pdf?.links && nivel < 2) await seguirCalendario(reg.pdf.links, nivel + 1, meta);
  }
}
const colaMenus = [];

async function recorrerWebCampus() {
  console.error('WebCampus…');
  wcClient = new WebCampusClient();
  const home = await wcGet('/HomeWC.aspx');
  const $ = cheerio.load(home.html);

  // Menú completo: General, Académico, Mis Cursos (cada columna con su subtítulo).
  $('li.dmenu').each((_, li) => {
    const grupo = clean($(li).children('a').first().text());
    $(li).find('.dropdown-menu > .row > div').each((_, col) => {
      const sub = clean($(col).find('h6').first().text());
      $(col).find('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        const id = href.match(/MenuItemId=(\d+)/i)?.[1];
        if (!id) return;
        const titulo = grupo === 'Mis Cursos' ? (id === '0' ? 'Mis Cursos (un período)' : 'Clases de consulta') : clean($(a).text()).replace(/\s*\((Documento PDF|Sitio externo); se abre en otra pestaña\)/, '');
        colaMenus.push({ id, titulo, grupo: `${grupo} › ${sub}`, href });
      });
    });
  });
  // Otros MenuItemId del HTML que no estén en las columnas.
  for (const m of home.html.matchAll(/MenuItemId=(\d+)/gi)) if (!colaMenus.some((c) => c.id === m[1])) colaMenus.push({ id: m[1], titulo: `(MenuItemId ${m[1]} fuera del menú)`, grupo: 'Otros' });

  // Home: banners, novedades, agenda y la barra lateral.
  const h = parseHome(home.html);
  const sinTexto = h.banners.filter((b) => !b.titulo).length;
  registrar({ fuente: 'WebCampus', grupo: 'Home', titulo: 'Home: banners, novedades y agenda', clave: '/HomeWC.aspx', url: home.url.href, tipo: 'pagina', huella: { ...huella(home.html, home.url.href, { personal: true }), banners: h.banners.length, bannersSinTexto: sinTexto, bannersConImagen: h.banners.filter((b) => b.imagen).length, novedades: h.novedades.length, agenda: h.agenda.length }, motivo: sinTexto ? `${sinTexto} de ${h.banners.length} banners sin texto alternativo: el aviso está solo en la imagen (va como imagen)` : undefined });
  const destinosBanners = new Map();
  for (const b of h.banners) if (b.link) { try { const u = new URL(b.link, WEBCAMPUS); destinosBanners.set(u.href, u); } catch { /* link roto */ } }
  let i = 0;
  for (const u of destinosBanners.values()) await visitarEnlace(u, { titulo: `Banner ${++i}`, grupo: 'Home › banners' });

  await visitarWc('/MiContenido/Novedades.aspx?EsDC=False', { grupo: 'Home', titulo: 'Novedades (lista)', clave: '/MiContenido/Novedades.aspx' }, { hijos: false });
  if (h.novedades[0]) await visitarWc(`/MiContenido/Novedades.aspx?Id=${h.novedades[0].id}&EsDC=False`, { grupo: 'Home', titulo: 'Una novedad (ejemplo)', clave: '/MiContenido/Novedades.aspx' });
  await visitarWc('/MiContenido/Eventos.aspx?EsActiv=False', { grupo: 'Home', titulo: 'Agenda completa', clave: '/MiContenido/Eventos.aspx' }, { hijos: false });
  if (h.agenda[0]?.id) await visitarWc(`/MiContenido/Agenda.aspx?Id=${h.agenda[0].id}&EsActiv=False`, { grupo: 'Home', titulo: 'Un evento (ejemplo)', clave: '/MiContenido/Agenda.aspx' }, { hijos: false });
  await visitarWc('/AgendaEventos/MisActividades.aspx?VieneDe=Home', { grupo: 'Home', titulo: 'Mis actividades', clave: '/AgendaEventos/MisActividades.aspx' }, { hijos: false });
  await visitarWc('/MiContenido/Wifi.aspx', { grupo: 'Barra superior', titulo: 'WiFi', clave: '/MiContenido/Wifi.aspx' });
  await visitarWc('/Contenidos/Marcaciones.aspx', { grupo: 'Barra superior', titulo: 'Mis marcaciones', clave: '/Contenidos/Marcaciones.aspx' }, { hijos: false });
  for (const [titulo, path] of [['Consultas', '/Atencion.aspx'], ['Encuestas', '/MiContenido/Encuesta.aspx']]) registrar({ fuente: 'WebCampus', grupo: 'Barra lateral', titulo, clave: path, url: WEBCAMPUS + path, tipo: 'no seguido', nota: `${MAPA[path].nota}: no se abre` });
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (/^https:\/\/(www\.)?dre\.uade\.edu\.ar\/.+\.pdf$/i.test(href) && !destinosBanners.has(href) && !$(a).closest('.carousel-item').length) colaDre.push({ url: href, titulo: `Barra lateral › ${sinDatos($(a).text()) || href.split('/').pop()}`, grupo: 'Barra lateral' });
  });
  for (const d of colaDre.splice(0)) await visitarDre(d.url, { fuente: 'WebCampus', grupo: d.grupo, titulo: d.titulo });

  // Cada ítem del menú (y los submenús que aparezcan en el contenido).
  while (colaMenus.length) {
    const m = colaMenus.shift();
    const key = m.id === '0' ? '0' : m.id;
    if (menusVistos.has(key)) continue;
    menusVistos.add(key);
    const meta = { grupo: m.grupo, titulo: m.titulo, clave: `menu:${m.id}`, menuItemId: m.id };
    if (MENU_NO_SEGUIR[m.id]) { registrar({ fuente: 'WebCampus', ...meta, url: `${WEBCAMPUS}/Principal.aspx?MenuItemId=${m.id}`, tipo: 'no seguido', nota: `${MENU_NO_SEGUIR[m.id]}: no se abre` }); continue; }
    if (m.id === '0') { await misCursos(m.href, meta); continue; }
    await visitarWc(`/Principal.aspx?MenuItemId=${m.id}`, meta);
  }
}

// Mis Cursos: el período actual y un aula de ejemplo, con sus páginas.
async function misCursos(href, meta) {
  const p = await visitarWc(new URL(href, WEBCAMPUS).pathname + new URL(href, WEBCAMPUS).search, { ...meta, clave: 'menu:0' }, { hijos: false });
  const r = await wcGet(new URL(href, WEBCAMPUS).pathname + new URL(href, WEBCAMPUS).search);
  const $ = cheerio.load(r.html);
  const hosts = new Set();
  $('[id^="ctl00_ContentPlaceHolderMain"] a[href^="http"]').each((_, a) => { try { hosts.add(new URL($(a).attr('href')).host); } catch { /* */ } });
  for (const host of hosts) registrar({ fuente: 'WebCampus', grupo: meta.grupo, titulo: `Mis Cursos › links a ${host}`, url: `https://${host}/…`, tipo: 'externo', host, clave: `host:${host}` });
  const aula = $('h5 > a.link').first().attr('href');
  if (!aula) return p;
  const u = new URL(aula, r.url);
  const idAula = u.searchParams.get('IdAula');
  const rAula = await wcGet(u.pathname + u.search);
  registrar({ fuente: 'WebCampus', grupo: 'Mis Cursos › aula de ejemplo', titulo: 'Home del aula', clave: '/MiAula.aspx', url: rAula.url.href, tipo: 'pagina', huella: { ...huella(rAula.html, rAula.url.href, { personal: true }), menuDelAula: cheerio.load(rAula.html)('a[href*="CtrlAulaAluDer"]').map((_, a) => clean(cheerio.load(rAula.html)(a).text())).get() } });
  const $a = cheerio.load(rAula.html);
  for (const [titulo, path] of [['Asistencia', `/AsistenciaAlumnos.aspx?IdAula=${idAula}`], ['Integrantes', `/Integrantes/Integrantes.aspx?IdAula=${idAula}`], ['Mi Semana', `/PlanificacionClases/MiSemana.aspx?IdAula=${idAula}`], ['Historial de novedades', `/Contenidos/NovedadHist.aspx?IdAula=${idAula}&IdNov=0`]]) {
    await visitarWc(path, { grupo: 'Mis Cursos › aula de ejemplo', titulo, clave: path.split('?')[0] }, { hijos: false });
  }
  const programa = $a('a[href*="DownloadPrograma.aspx"]').first().attr('href');
  if (programa) { const pu = new URL(programa, rAula.url); await visitarWc(pu.pathname + pu.search, { grupo: 'Mis Cursos › aula de ejemplo', titulo: 'Programa de la materia', clave: '/Contenidos/DownloadPrograma.aspx' }, { hijos: false }); }
  if ($a('a[href*="certificadoExamen"]').length) registrar({ fuente: 'WebCampus', grupo: 'Mis Cursos › aula de ejemplo', titulo: 'Certificado de examen', clave: '/contenidos/certificadoExamen.aspx', url: `${WEBCAMPUS}/contenidos/certificadoExamen.aspx`, tipo: 'no seguido', nota: 'genera un certificado: no se abre' });
  return p;
}

// ── PDFs públicos (dre.uade.edu.ar) ───────────────────────────────────────────
const colaDre = [];
const dreVistos = new Set();
async function visitarDre(url, meta) {
  const u = url.replace(/^http:/, 'https:');
  if (dreVistos.has(u)) return null;
  dreVistos.add(u);
  await turno('publico');
  try {
    const res = await fetchPublico(u);
    const tipo = tipoDeBytes(res.body);
    const leido = DRE_LEIDOS.find(([re]) => re.test(u));
    const mcp = meta.heredado ?? (meta.fuente === 'WebCampus' && meta.titulo.startsWith('Banner') ? { mcp: 'lee', tool: 'webcampus_news link' } : leido ? { mcp: 'lee', tool: leido[1] } : undefined);
    const imagen = meta.imagen ?? !!leido?.[2];
    const pdf = tipo === 'pdf' ? await infoPdf(res.body) : null;
    const r = registrar({ ...meta, url: u, tipo, host: new URL(u).host, acceso: 'publico', pdf, mcp: mcp ?? { mcp: meta.mcpPorDefecto ?? 'no' }, imagen });
    return r;
  } catch (e) {
    if (/10 MB/.test(e.message)) return registrar({ ...meta, url: u, tipo: 'pesado', host: new URL(u).host, acceso: 'publico', mcp: { mcp: meta.heredado ? 'mal' : 'no', tool: meta.heredado?.tool }, motivo: 'pesa más de 10 MB: el MCP no lo descarga' });
    return registrar({ ...meta, url: u, tipo: 'error', host: new URL(u).host, acceso: 'publico', nota: sinDatos(e.message) });
  }
}

// ── Sitio de inscripciones ────────────────────────────────────────────────────
async function recorrerInscripciones() {
  console.error('Inscripciones…');
  const c = new InscripcionesClient();
  const get = async (p) => { await turno('inscripciones'); return c.get(p); };
  const home = await get('/');
  const $ = cheerio.load(home.html);
  const F = 'Inscripciones';
  const mapaPestanas = [
    [/importante/i, 'uade_enrollment_guide'],
    [/instructivo/i, 'uade_enrollment_guide'],
    [/preguntas/i, 'uade_enrollment_guide'],
    [/cronograma/i, 'uade_enrollment_schedule'],
    [/inscrib/i, 'uade_enrollment_windows'],
  ];
  $('.nav-tabs a').each((_, a) => {
    const titulo = sinDatos($(a).text());
    const href = $(a).attr('href') ?? '';
    if (/^https?:/i.test(href)) {
      const host = new URL(href).host;
      registrar({ fuente: F, grupo: 'Pestañas', titulo, url: href, tipo: 'externo', host, clave: `host:${host}` });
      return;
    }
    const panel = href.startsWith('#') ? $(href) : $();
    const tool = mapaPestanas.find(([re]) => re.test(titulo))?.[1];
    const hu = panel.length ? huella(cheerio.load(`<main>${panel.html()}</main>`).html(), INSCRIPCIONES, { personal: false }) : null;
    if (hu) { hu.titulos = []; hu.acordeones = panel.find('.panel').length; hu.avisos = panel.find('.alert').length; }
    registrar({ fuente: F, grupo: 'Pestañas', titulo, url: `${INSCRIPCIONES}/${href}`, tipo: 'pestaña', huella: hu, acceso: 'login', mcp: tool ? { mcp: 'lee', tool } : { mcp: 'no' } });
  });
  // Ventanas (el panel que carga por AJAX): estructura y tipos de link, sin seguir ninguno.
  try {
    const v = await get('/Home/ObtenerInscripciones');
    const $v = cheerio.load(v.html);
    registrar({ fuente: F, grupo: 'Ventanas', titulo: 'Ventanas de inscripción (panel)', url: `${INSCRIPCIONES}/Home/ObtenerInscripciones`, tipo: 'pagina', acceso: 'personal', huella: { paneles: $v('.panel').length, tiposDeLink: [...new Set($v('[data-tipolink]').map((_, e) => $v(e).attr('data-tipolink')).get())], clases: [...new Set($v('.panel').map((_, e) => $v(e).attr('class')).get())] }, mcp: { mcp: 'lee', tool: 'uade_enrollment_windows' }, nota: 'los links a PIA (data-linkid) no se siguen' });
  } catch (e) {
    registrar({ fuente: F, grupo: 'Ventanas', titulo: 'Ventanas de inscripción (panel)', tipo: 'error', nota: sinDatos(e.message) });
  }
  // Documentos e imágenes enlazados desde cualquier pestaña.
  const vistos = new Set();
  for (const a of $('.tab-content a[href], #menu2 img[src], .tab-content img[src]').toArray()) {
    const raw = $(a).attr('href') ?? $(a).attr('src');
    if (!raw || /^(#|javascript:|mailto:)/i.test(raw)) continue;
    let u;
    try { u = new URL(raw.replace(/^~/, ''), INSCRIPCIONES); } catch { continue; }
    if (vistos.has(u.href)) continue;
    vistos.add(u.href);
    const pestana = $(a).closest('.tab-pane').attr('id') ?? '?';
    const titulo = `${pestana} › ${sinDatos($(a).text() || $(a).attr('alt')) || decodeURIComponent(u.pathname.split('/').pop() || u.host)}`;
    const meta = { fuente: F, grupo: `Pestaña ${pestana}`, titulo };
    if (bloqueadoPor(u.href) || NO_SEGUIR.test(u.href)) { registrar({ ...meta, url: u.href, tipo: 'no seguido', host: u.host, nota: 'trámite o PIA: no se abre' }); continue; }
    if (u.origin === INSCRIPCIONES) {
      try {
        const r = await get(u.pathname + u.search);
        const tipo = tipoDeBytes(r.bytes);
        registrar({ ...meta, url: u.href, tipo, host: u.host, acceso: 'login', pdf: tipo === 'pdf' ? await infoPdf(r.bytes) : null, mcp: tipo === 'imagen' && pestana === 'menu2' ? { mcp: 'lee', tool: 'uade_enrollment_schedule (imagen)' } : tipo === 'imagen' && pestana === 'menuImportante' ? { mcp: 'mal', tool: 'uade_enrollment_guide', motivo: 'aviso en imagen: la guía manda el texto y descarta la imagen' } : { mcp: 'no' } });
      } catch (e) { registrar({ ...meta, url: u.href, tipo: 'error', nota: sinDatos(e.message) }); }
      continue;
    }
    if (PUBLICO_HOSTS.has(u.host) && /\.pdf$/i.test(u.pathname)) { await visitarDre(u.href, { ...meta, mcpPorDefecto: 'no' }); continue; }
    if (u.origin === WEBCAMPUS) { registrar({ ...meta, url: u.href, tipo: 'pagina', host: u.host, acceso: 'personal', mcp: /MiProgramacion/i.test(u.pathname) ? { mcp: 'lee', tool: 'webcampus_class_offering' } : { mcp: 'no' } }); continue; }
    registrar({ ...meta, url: u.href, tipo: 'externo', host: u.host, acceso: 'publico', mcp: { mcp: 'lee', tool: 'uade_enrollment_guide (solo el link)' } });
  }
}

// ── Sitio oficial público ─────────────────────────────────────────────────────
async function fetchPublico(raw, saltos = 0) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !PUBLICO_HOSTS.has(u.host)) throw new Error(`fuera del recorrido público: ${u.host}`);
  if (bloqueadoPor(u.href)) throw new Error(`lista negra: ${bloqueadoPor(u.href)}`);
  if (!permitidoPorRobots(u)) throw new Error('robots.txt no lo permite');
  const res = await fetch(u, { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && saltos < 5) { await res.body?.cancel(); await turno('publico'); return fetchPublico(new URL(res.headers.get('location'), u).href, saltos + 1); }
  if (Number(res.headers.get('content-length') ?? 0) > 10 * 1024 * 1024) { await res.body?.cancel(); throw new Error('pesa más de 10 MB'); }
  const body = new Uint8Array(await res.arrayBuffer());
  if (res.status >= 400) throw new Error(`respondió ${res.status}`);
  return { url: u, body, status: res.status, text: () => new TextDecoder().decode(body), ct: res.headers.get('content-type') ?? '' };
}

const robots = {};
function permitidoPorRobots(u) {
  const reglas = robots[u.host] ?? [];
  return !reglas.some((r) => u.pathname.startsWith(r));
}
async function leerRobots(host) {
  await turno('publico');
  const res = await fetch(`https://${host}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const txt = res && res.ok && /text\/plain/i.test(res.headers.get('content-type') ?? '') ? await res.text() : '';
  // Solo el grupo "User-agent: *" (el script no tiene nombre propio en ningún robots de UADE).
  let aplica = false;
  const disallow = [];
  for (const l of txt.split('\n').map((x) => x.split('#')[0].trim())) {
    const [k, ...v] = l.split(':');
    const val = v.join(':').trim();
    if (/^user-agent$/i.test(k)) aplica = val === '*';
    else if (aplica && /^disallow$/i.test(k) && val) disallow.push(val);
  }
  robots[host] = disallow;
  return { host, estado: res ? res.status : 'sin respuesta', esRobots: !!txt, disallow };
}

async function recorrerPublico() {
  console.error('Sitio oficial…');
  const r1 = await leerRobots('www.uade.edu.ar');
  const r2 = await leerRobots('dre.uade.edu.ar');
  meta.robots = [r1, r2];
  await turno('publico');
  const sm = await fetchPublico('https://www.uade.edu.ar/sitemap.xml');
  const urls = [...sm.text().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  meta.sitemap = { urls: urls.length, agenda: urls.filter((u) => /\/agenda\//.test(u)).length };
  const elegidas = urls.filter((u) => { try { const x = new URL(u); return x.host === 'www.uade.edu.ar' && CRITERIO_PUBLICO.some((re) => re.test(x.pathname)); } catch { return false; } });
  if (!elegidas.includes('https://www.uade.edu.ar/')) elegidas.unshift('https://www.uade.edu.ar/');
  meta.sitemap.elegidas = elegidas.length;
  let pdfs = 0;
  for (const url of elegidas) {
    await turno('publico');
    let res;
    try { res = await fetchPublico(url); } catch (e) { registrar({ fuente: 'Sitio oficial', titulo: new URL(url).pathname, url, tipo: 'error', acceso: 'publico', nota: sinDatos(e.message) }); continue; }
    const $ = cheerio.load(res.text());
    const titulo = sinDatos(($('title').first().text() || $('h1').first().text()).split('|')[0]) || new URL(url).pathname;
    const h = huella(res.text(), url, { personal: false });
    const docs = [...new Set($('main a[href], .main a[href], article a[href], #content a[href], body a[href]').map((_, a) => $(a).attr('href')).get()
      .map((h) => { try { return new URL(h, url); } catch { return null; } })
      .filter((x) => x && PUBLICO_HOSTS.has(x.host) && /\.(pdf|xlsx?|docx?)$/i.test(x.pathname)).map((x) => x.href))];
    h.documentos = docs.length;
    registrar({ fuente: 'Sitio oficial', grupo: new URL(url).pathname.split('/')[1] || 'home', titulo: `${new URL(url).pathname} — ${titulo}`, url, tipo: 'pagina', host: 'www.uade.edu.ar', acceso: 'publico', huella: h, mcp: { mcp: 'no' }, nota: 'www.uade.edu.ar no está en la allowlist del MCP' });
    for (const d of docs.slice(0, 4)) { if (pdfs++ >= 40) break; await visitarDre(d, { fuente: 'Sitio oficial', grupo: 'documentos', titulo: `${new URL(url).pathname} › ${decodeURIComponent(d.split('/').pop())}` }); }
  }
}

// ── PIA ───────────────────────────────────────────────────────────────────────
function pia() {
  registrar({ fuente: 'PIA', titulo: 'PIA (inscripcionespia.uade.edu.ar y pia.uade.edu.ar)', url: 'https://inscripcionespia.uade.edu.ar/', tipo: 'no seguido', acceso: 'personal', mcp: { mcp: 'mal', tool: 'pia_class_search, pia_prepare_enrollment, pia_add_to_cart, uade_open_enrollment_site', motivo: 'la búsqueda de clases responde 401 en vivo con el link firmado' }, nota: 'no se recorre: su puerta pide la contraseña personal. Resumen de inscripción y carrito con confirmación en la ventana de la persona, que aprieta Finalizar' });
}

// ── Salida ────────────────────────────────────────────────────────────────────
const meta = { fecha: FECHA, fuentes: solo };
const errores = [];
for (const [f, fn] of [['webcampus', recorrerWebCampus], ['inscripciones', recorrerInscripciones], ['publico', recorrerPublico], ['pia', pia]]) {
  if (!solo.includes(f)) continue;
  try { await fn(); } catch (e) { errores.push(`${f}: ${sinDatos(e.message)}`); console.error(`✗ ${f}: ${e.message}`); }
}
meta.errores = errores;

const dir = join(process.env.UADE_MCP_HOME ?? join(homedir(), '.uade-mcp'), 'inventario');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const archivo = join(dir, `${FECHA}.json`);
writeFileSync(archivo, JSON.stringify({ meta, items }, null, 2), { mode: 0o600 });
console.error(`\nDetalle: ${archivo}`);

const ETIQUETA = { lee: '✅ lee', mal: '🟡 lee mal', no: '❌ no lee', fuera: '⛔ fuera' };
const ACCESO = { publico: 'público', login: 'igual para todos (login)', personal: 'personal', '?': '? (sin clasificar)', '—': '—' };
function resumenHuella(it) {
  const h = it.huella;
  const p = it.pdf;
  const partes = [];
  if (p) partes.push(`${p.paginas ?? '?'} pág., ${p.legible ? 'texto legible' : p.escaneado ? 'escaneado' : p.legible === false ? 'sin texto legible' : 'no se pudo leer'}`);
  if (h?.banners !== undefined) partes.push(`${h.banners} banners (${h.bannersSinTexto} sin texto), ${h.novedades} novedades, ${h.agenda} eventos`);
  if (h?.tablas?.length) partes.push(h.tablas.slice(0, 3).map((t) => `${t.id ?? 'tabla'}${t.encabezados.length ? `: ${t.encabezados.slice(0, 5).join(' / ')}` : ''}${t.clasesFilas.length ? ` [${t.clasesFilas.slice(0, 4).join(', ')}]` : ''}`).join('; '));
  if (h?.imagenes) partes.push(`${h.imagenes} img`);
  if (h?.formularios?.enviables) partes.push(`${h.formularios.enviables} controles que envían`);
  if (h?.formularios?.selects) partes.push(`${h.formularios.selects} combos`);
  if (h?.documentos) partes.push(`${h.documentos} documentos`);
  if (h?.acordeones) partes.push(`${h.acordeones} preguntas`);
  if (h?.avisos) partes.push(`${h.avisos} avisos`);
  if (h?.tiposDeLink) partes.push(`links: ${h.tiposDeLink.join(', ')}`);
  if (h?.vacia) partes.push('vacía');
  return partes.join('; ').replace(/\|/g, '/');
}
const celda = (s) => (s ?? '').toString().replace(/\|/g, '/').replace(/\n/g, ' ');
const porFuente = {};
for (const it of items) (porFuente[it.fuente] ??= []).push(it);
let md = `<!-- inventario:inicio (lo genera scripts/inventario.mjs; no editar a mano) -->\n\nRecorrido del ${FECHA.split('-').reverse().join('/')}: ${items.length} ítems.`;
const cuenta = (k) => items.filter((i) => i.mcp === k).length;
md += ` ✅ ${cuenta('lee')} · 🟡 ${cuenta('mal')} · ❌ ${cuenta('no')} · ⛔ ${cuenta('fuera')}.`;
if (meta.robots) md += ` robots.txt: ${meta.robots.map((r) => `${r.host} ${r.esRobots ? `(${r.disallow.length} reglas)` : `no tiene (${r.estado})`}`).join(', ')}.`;
if (meta.sitemap) md += ` Sitemap: ${meta.sitemap.urls} URLs (${meta.sitemap.agenda} de agenda), ${meta.sitemap.elegidas} elegidas por el criterio.`;
if (errores.length) md += `\n\nErrores: ${errores.join('; ')}`;
for (const [fuente, lista] of Object.entries(porFuente)) {
  md += `\n\n### ${fuente}\n\n| Ítem | Tipo | Destino | Acceso | MCP | Tool / motivo | Estructura |\n|---|---|---|---|---|---|---|\n`;
  for (const it of lista) {
    const destino = it.tipo === 'externo' ? it.host : it.url ? it.url.replace(/^https:\/\/(www\.)?webcampus\.uade\.edu\.ar/, '').replace(/^https:\/\//, '') : '';
    md += `| ${celda(it.grupo ? `${it.grupo} › ${it.titulo}` : it.titulo)} | ${it.tipo} | ${celda(destino).slice(0, 70)} | ${ACCESO[it.acceso] ?? it.acceso} | ${ETIQUETA[it.mcp]} | ${celda([it.tool, it.motivo, it.nota].filter(Boolean).join(' — '))} | ${celda(resumenHuella(it))} |\n`;
  }
}
md += '\n<!-- inventario:fin -->';

if (args.includes('--solo')) {
  console.log(md);
} else {
  const docPath = new URL('../docs/INVENTARIO.md', import.meta.url);
  let doc;
  try { doc = readFileSync(docPath, 'utf8'); } catch { doc = '# Inventario\n\n<!-- inventario:inicio -->\n<!-- inventario:fin -->\n'; }
  const nuevo = doc.replace(/<!-- inventario:inicio[\s\S]*?<!-- inventario:fin -->/, md);
  writeFileSync(docPath, nuevo);
  console.error(`Tablas actualizadas en docs/INVENTARIO.md`);
}
