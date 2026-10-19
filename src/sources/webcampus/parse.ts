// Parsers puros de las páginas de WebCampus (HTML → JSON tipado). No hacen red.
// La estructura está relevada en docs/DISENO.md §6 y reproducida en test/fixtures/webcampus/.
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

// Si falta un elemento que la página siempre tiene (aunque no haya datos), UADE cambió el HTML:
// es mejor decirlo que devolver una lista vacía que parezca real.
export class PageChangedError extends Error {
  constructor(public readonly pagina: string) {
    super(
      `UADE cambió la página "${pagina}" y el MCP ya no la sabe leer. No es un problema de tu cuenta: ` +
        'hay que actualizar el MCP. Podés confirmarlo corriendo el comando doctor.',
    );
    this.name = 'PageChangedError';
  }
}

export function requireAnchor($: cheerio.CheerioAPI, selector: string, pagina: string): void {
  if (!$(selector).length) throw new PageChangedError(pagina);
}
const orNull = (s: string): string | null => (s === '' || s === '-' ? null : s);

// "$123.456,78" | "$111,111.11" | "1234" → número. null si no se puede.
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.replaceAll(dec === '.' ? ',' : '.', '').replace(dec, '.');
  } else if (lastComma >= 0) {
    // Solo comas: decimal si hay 1 o 2 dígitos después, miles si hay 3.
    s = /,\d{1,2}$/.test(s) ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s) && s.indexOf('.') !== lastDot) {
    s = s.replaceAll('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// d/m/yyyy o dd/mm/yyyy → yyyy-mm-dd (ISO). WebCampus a veces no pone el cero adelante.
// Ojo: el historial académico usa mes/día/año (formato de EE.UU.); para eso está parseFechaMDY.
const FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
function iso(y: string, m: string, d: string): string | null {
  const [mm, dd] = [Number(m), Number(d)];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null; // nunca devolver una fecha imposible
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
export function parseFecha(raw: string): string | null {
  const m = raw.match(FECHA);
  return m ? iso(m[3]!, m[2]!, m[1]!) : null;
}
export function parseFechaMDY(raw: string): string | null {
  const m = raw.match(FECHA);
  return m ? iso(m[3]!, m[1]!, m[2]!) : null;
}

// ── Períodos (menú "Mis Cursos") ──────────────────────────────────────────────

export interface Periodo {
  id: string;
  nombre: string;
}

export function parsePeriodos(html: string): Periodo[] {
  const $ = cheerio.load(html);
  requireAnchor($, 'a[href*="Periodo="]', 'menú Mis Cursos');
  const out: Periodo[] = [];
  $('a[href*="Periodo="]').each((_, a) => {
    const id = new URLSearchParams(($(a).attr('href') ?? '').split('?')[1]).get('Periodo');
    if (id && id !== '0' && !out.some((p) => p.id === id)) out.push({ id, nombre: clean($(a).text()) });
  });
  return out;
}

// ── Cursada: aulas del período con horario, sede y notas ──────────────────────

export interface Aula {
  seccion: string;
  idAula: string;
  materia: string;
  dia: string | null;
  horario: string | null;
  aula: string | null;
  curso: string | null;
  clase: string | null;
  desde: string | null;
  hasta: string | null;
  examenFinal: string | null;
  modalidad: string | null;
  notas: Record<string, string | null>;
  links: { teams: string | null; apuntesTeams: string | null; apuntesMateria: string | null };
}

export function parseCursada(html: string): Aula[] {
  const $ = cheerio.load(html);
  requireAnchor($, '[id$="CtrlMaterias_tblMaterias"], [id$="tbl_Aulas"]', 'cursos del período');
  const aulas: Aula[] = [];

  $('[id$="tbl_Aulas"]').each((_, cont) => {
    let seccion = '';
    let pending: { idAula: string; materia: string } | null = null;

    $(cont)
      .children()
      .each((_, row) => {
        const $row = $(row);
        const h3 = $row.find('h3');
        if (h3.length) {
          seccion = clean(h3.text());
          return;
        }
        const link = $row.find('h5 > a.link');
        if (link.length && !$row.find('table').length) {
          const idAula = new URLSearchParams((link.attr('href') ?? '').split('?')[1]).get('IdAula') ?? '';
          pending = { idAula, materia: clean(link.text()) };
          return;
        }
        if (pending && $row.find('table').length) {
          aulas.push({ seccion, ...pending, ...parseDetalle($, $row) });
          pending = null;
        }
      });
  });
  return aulas;
}

function parseDetalle($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>): Omit<Aula, 'seccion' | 'idAula' | 'materia'> {
  const info = $row.children().first();
  const ps = info.find('p').map((_, p) => clean($(p).text())).get();
  const pick = (re: RegExp) => {
    for (const p of ps) {
      const m = p.match(re);
      if (m) return clean(m[1]);
    }
    return null;
  };
  const rango = ps.map((p) => p.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/)).find(Boolean);

  const headers = $row.find('table thead th').map((_, th) => clean($(th).text())).get();
  const cells = $row.find('table tbody tr').first().find('td').map((_, td) => clean($(td).text())).get();
  const notas: Record<string, string | null> = {};
  headers.forEach((h, i) => (notas[h] = orNull(cells[i] ?? '')));

  const href = (re: RegExp) => {
    const a = $row.find('a').filter((_, a) => re.test(clean($(a).text()))).first();
    return a.attr('href') ?? null;
  };
  const modalidad = clean($row.find('.label').first().text()).match(/:\s*(.+)$/)?.[1] ?? null;

  return {
    dia: orNull(clean(info.find('.badge').first().text())),
    horario: orNull(clean(info.find('h5').first().text())),
    aula: pick(/^Aula\s+(.+)$/i)?.replace(/^-\s*/, '') || null,
    curso: pick(/^Curso:\s*(.+)$/i),
    clase: pick(/^Clase:\s*(.+)$/i),
    desde: rango ? parseFecha(rango[1]!) : null,
    hasta: rango ? parseFecha(rango[2]!) : null,
    examenFinal: parseFecha(pick(/^Examen Final:\s*(.+)$/i) ?? ''),
    modalidad,
    notas,
    links: { teams: href(/^Teams$/), apuntesTeams: href(/^Apuntes de Teams$/), apuntesMateria: href(/^Apuntes de la materia$/) },
  };
}

// ── Asistencia ────────────────────────────────────────────────────────────────

export type EstadoClase = 'presente' | 'ausente' | 'media_falta' | 'feriado' | 'sin_cargar' | 'otro';

export interface Asistencia {
  resumen: {
    totalClases: number | null;
    dictadas: number | null;
    sinCargar: number | null;
    presentes: number | null;
    inasistencias: number | null;
  };
  clases: { mes: string; dia: number; estado: EstadoClase }[];
  aviso: string | null;
}

export function parseAsistencia(html: string): Asistencia {
  const $ = cheerio.load(html);
  requireAnchor($, '[id$="pnlAsistencia"]', 'asistencia');
  const num = (id: string) => {
    const n = Number(clean($(`[id$="ctrlAsist_${id}"]`).text()));
    return clean($(`[id$="ctrlAsist_${id}"]`).text()) === '' || !Number.isFinite(n) ? null : n;
  };
  const clases: Asistencia['clases'] = [];
  $('.asist_contenedor_mes').each((_, m) => {
    const mes = clean($(m).find('.asist_mes_asistencia').text());
    $(m)
      .find('.asist_dias span')
      .each((_, s) => {
        const cls = $(s).attr('class') ?? '';
        const estado: EstadoClase = /presente/.test(cls)
          ? 'presente'
          : /media_falta/.test(cls)
            ? 'media_falta'
            : /ausente/.test(cls)
              ? 'ausente'
              : /feriado/.test(cls)
                ? 'feriado'
                : /sincargar/.test(cls)
                  ? 'sin_cargar'
                  : 'otro';
        clases.push({ mes, dia: Number(clean($(s).text())), estado });
      });
  });
  return {
    resumen: {
      totalClases: num('spanTotalClases'),
      dictadas: num('spanClasesDictadas'),
      sinCargar: num('spanSinCargar'),
      presentes: num('spanAsistencias'),
      inasistencias: num('spanInasistencias'),
    },
    clases,
    aviso: orNull(clean($('.asist_resumen_aviso').text())),
  };
}

// ── Historial académico ───────────────────────────────────────────────────────

export interface PlanCarrera {
  plan: string;
  carrera: string;
  estado: string;
  postbackTarget: string;
}

export interface FormState {
  [name: string]: string;
}

export function parsePlanes(html: string): { planes: PlanCarrera[]; form: FormState } {
  const $ = cheerio.load(html);
  requireAnchor($, 'td.carrera a', 'carreras del historial');
  const form: FormState = {};
  $('form input[type=hidden]').each((_, i) => {
    const name = $(i).attr('name');
    if (name) form[name] = $(i).attr('value') ?? '';
  });
  const planes: PlanCarrera[] = [];
  $('td.carrera a').each((_, a) => {
    const tr = $(a).closest('tr');
    const target = ($(a).attr('href') ?? '').match(/__doPostBack\('([^']+)'/)?.[1];
    if (!target) return;
    planes.push({
      plan: clean(tr.find('td.plan').text()),
      carrera: clean($(a).text()),
      estado: clean(tr.children().last().text()),
      postbackTarget: target,
    });
  });
  return { planes, form };
}

export type Situacion = 'aprobada' | 'final_pendiente' | 'cursando' | 'equivalencia' | 'sin_cursar' | 'otra';

export interface MateriaHistorial {
  codigo: string;
  nombre: string;
  horas: number | null;
  anio: string;
  situacion: Situacion;
  situacionTexto: string;
  nota: number | null;
  notaTexto: string | null;
  fechaAprobacion: string | null;
  // Para final pendiente: fecha en que quedó regularizada la cursada (corre el vencimiento de 2 años).
  fechaRegularizacion: string | null;
}

export interface Historial {
  materias: MateriaHistorial[];
  promedio: number | null;
}

const SITUACION_POR_CLASE: Record<string, Situacion> = {
  nota_aprobado: 'aprobada',
  nota_afinal: 'final_pendiente',
  nota_inscripto: 'cursando',
  nota_equivexterna: 'equivalencia',
  tr_grilla: 'sin_cursar',
};

export function parseHistorial(html: string): Historial {
  const $ = cheerio.load(html);
  requireAnchor($, '#ctl00_ContentPlaceHolderMain_Table1 tr.anio', 'historial académico');
  const materias: MateriaHistorial[] = [];
  let anio = '';

  $('#ctl00_ContentPlaceHolderMain_Table1 > tbody > tr').each((_, tr) => {
    const $tr = $(tr);
    const cls = $tr.attr('class') ?? '';
    if (cls === 'anio') {
      anio = clean($tr.text());
      return;
    }
    const situacion = SITUACION_POR_CLASE[cls] ?? (/^nota_/.test(cls) ? 'otra' : null);
    if (!situacion) return;

    const td = $tr.children('td').map((_, c) => clean($(c).text())).get();
    const nombreRaw = td[1] ?? '';
    const horas = nombreRaw.match(/\((\d+)\s*HS\.?\)\s*$/i);
    const notaTexto = orNull(td[3] ?? '');
    const notaNum = notaTexto && /^\d+([.,]\d+)?$/.test(notaTexto) ? Number(notaTexto.replace(',', '.')) : null;

    // El detalle (fila oculta siguiente) trae la fecha del acta que aprobó la materia.
    const detalle = $tr.next('tr.tr_grilla_hide');
    const fechaActa = detalle.find('tr.tr_tbl_up').filter((_, r) => /Fecha Acta/i.test($(r).text())).first().text();
    // La fila de detalle con estado "A FINAL" trae la fecha en que se regularizó la cursada.
    const regularizada = detalle
      .find('tr.tr_tbl_int')
      .filter((_, r) => /A FINAL/i.test(clean($(r).children('td').eq(4).text())))
      .first()
      .children('td')
      .first()
      .text();

    materias.push({
      codigo: td[0] ?? '',
      nombre: clean(horas ? nombreRaw.slice(0, horas.index) : nombreRaw),
      horas: horas ? Number(horas[1]) : null,
      anio,
      situacion,
      situacionTexto: td[2] ?? '',
      nota: notaNum,
      notaTexto,
      // El historial usa mes/día/año (verificado: en 43 fechas reales el segundo número pasa de 12).
      fechaAprobacion: situacion === 'aprobada' ? parseFechaMDY(fechaActa) : null,
      fechaRegularizacion: situacion === 'final_pendiente' ? parseFechaMDY(regularizada) : null,
    });
  });

  const promTxt = clean($('[id$="lblPromValor"]').text()).replace(',', '.');
  const prom = promTxt && Number.isFinite(Number(promTxt)) ? Number(promTxt) : null;
  return { materias, promedio: prom };
}

// ── Cuenta corriente ──────────────────────────────────────────────────────────

export interface LineaDetalle {
  concepto: string;
  materia: string | null;
  comprobante: string | null;
  monto: number | null;
}

export interface FilaCuenta {
  [columna: string]: string | number | null | LineaDetalle[] | boolean;
}

export interface Cuenta {
  deudaVencida: FilaCuenta[];
  proximosVencimientos: FilaCuenta[];
  pagos: FilaCuenta[];
}

function parseTablaCuenta($: cheerio.CheerioAPI, id: string): FilaCuenta[] {
  const table = $(`#ctl00_ContentPlaceHolderMain_${id}`);
  if (!table.length) return [];
  const headers = table.find('> tbody > tr > td.grillahead2020, > tbody > tr > th.grillahead2020')
    .map((_, h) => clean($(h).text()))
    .get();
  const rows: FilaCuenta[] = [];
  table.find('> tbody > tr.grilla4').each((_, tr) => {
    if ($(tr).attr('id') === 'sinicono') return; // "No posee."
    const cells = $(tr).children('td').map((_, c) => clean($(c).text())).get();
    const fila: FilaCuenta = {};
    cells.forEach((v, i) => {
      const key = headers[i] ?? `col${i + 1}`;
      fila[key] = /^\$/.test(v) ? parseMoney(v) : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) ? parseFecha(v) : orNull(v);
    });
    // El desplegable de cada pago es la fila siguiente con una tabla .adentro: materias, gastos, recargos.
    const detalle: LineaDetalle[] = [];
    $(tr).next('tr').find('table.adentro tr.grilla').each((_, d) => {
      const td = $(d).children('td').map((_, c) => clean($(c).text())).get();
      if (td.length < 4) return; // "Descargar Factura - …"
      detalle.push({ concepto: td[0] ?? '', materia: orNull(td[1] ?? ''), comprobante: orNull(td[2] ?? ''), monto: parseMoney(td[3] ?? '') });
    });
    if (detalle.length) {
      fila.detalle = detalle;
      fila.conRecargo = detalle.some((l) => /recargo/i.test(l.concepto));
    }
    rows.push(fila);
  });
  // UADE lista de más viejo a más nuevo: se devuelve lo más reciente primero.
  const fecha = (f: FilaCuenta) => String(Object.values(f).find((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ?? '');
  return rows.sort((a, b) => fecha(b).localeCompare(fecha(a)));
}

export function parseCuenta(html: string): Cuenta {
  const $ = cheerio.load(html);
  requireAnchor($, '#ctl00_ContentPlaceHolderMain_TablePagosRealizados, #ctl00_ContentPlaceHolderMain_TableDeudaVencida', 'cuenta corriente');
  return {
    deudaVencida: parseTablaCuenta($, 'TableDeudaVencida'),
    proximosVencimientos: parseTablaCuenta($, 'TableProximosVenc'),
    pagos: parseTablaCuenta($, 'TablePagosRealizados'),
  };
}

// ── Equipo docente de un aula (Integrantes) ───────────────────────────────────
// Solo se devuelven docentes: los datos de los compañeros (mail, legajo) son de terceros.

export interface Docente {
  nombre: string;
  email: string | null;
}

const ROLES_DOCENTES = /^(docente|profesor(a)?|titular|adjunt[oa]|ayudante|jtp|jefe de trabajos pr[aá]cticos|coordinador(a)?|tutor(a)?|director(a)? de carrera)\b/i;

export function parseDocentes(html: string): Docente[] {
  const $ = cheerio.load(html);
  requireAnchor($, '#tableintegrantes', 'integrantes del curso');
  const table = $('#tableintegrantes');
  const headers = table.find('thead th').map((_, th) => clean($(th).text()).toLowerCase()).get();
  if (!headers.includes('rol') || !headers.includes('email')) throw new PageChangedError('integrantes del curso');
  const col = (name: string) => headers.indexOf(name);
  const [iNombre, iEmail, iRol] = [col('nombre'), col('email'), col('rol')];
  const out: Docente[] = [];
  table.find('tbody tr').each((_, tr) => {
    const td = $(tr).children('td').map((_, c) => clean($(c).text())).get();
    // Lista blanca: solo roles de equipo docente. Cualquier otro rol (alumno, estudiante, oyente,
    // invitado…) son datos de terceros y no salen.
    if (iRol < 0 || !ROLES_DOCENTES.test(td[iRol] ?? '')) return;
    const email = td[iEmail] ?? '';
    out.push({ nombre: td[iNombre] ?? '', email: /^[^@\s]+@[^@\s]+$/.test(email) ? email : null });
  });
  return out;
}

// ── Programación de Clases (oferta) ───────────────────────────────────────────

export interface ClaseOfertada {
  codigo: string;
  materia: string;
  sede: string;
  clase: string;
  regimen: string;
  idioma: string;
  turno: string;
  anio: string;
  dias: string[];
  horario: string | null;
  desde: string | null;
  hasta: string | null;
  regimenAprobacion: string | null;
}

export interface Oferta {
  materias: { codigo: string; nombre: string }[];
  clases: ClaseOfertada[];
  siguientePagina: string | null; // __EVENTTARGET del pager, si hay más
  form: FormState;
}

const DIAS = ['L', 'M', 'MI', 'J', 'V', 'S', 'D'];

export function parseOferta(html: string): Oferta {
  const $ = cheerio.load(html);
  requireAnchor($, 'select[name$="ddlMateria"]', 'programación de clases');
  const form: FormState = {};
  $('form input[type=hidden]').each((_, i) => {
    const name = $(i).attr('name');
    if (name) form[name] = $(i).attr('value') ?? '';
  });
  $('form select').each((_, s) => {
    const name = $(s).attr('name');
    if (!name) return;
    const sel = $(s).find('option[selected]').first();
    form[name] = (sel.length ? sel : $(s).find('option').first()).attr('value') ?? '';
  });

  const materias = $('select[name$="ddlMateria"] option')
    .map((_, o) => ({ codigo: $(o).attr('value') ?? '', nombre: clean($(o).text()).replace(/\s*\([^)]*\)\s*$/, '') }))
    .get()
    .filter((m) => /^[\w.]+$/.test(m.codigo) && m.codigo !== '0');

  const headers = $('#ctl00_ContentPlaceHolderMain_RadGrid1_ctl00_Header th, #ctl00_ContentPlaceHolderMain_RadGrid1_ctl00 > thead th')
    .map((_, th) => clean($(th).text()))
    .get();
  const idx = (h: string) => headers.indexOf(h);
  const clases: ClaseOfertada[] = [];
  $('#ctl00_ContentPlaceHolderMain_RadGrid1_ctl00 > tbody > tr').each((_, tr) => {
    const tds = $(tr).children('td');
    const txt = (h: string) => clean(tds.eq(idx(h)).text());
    if (idx('Cod. Mat.') < 0 || !txt('Cod. Mat.')) return;
    const fechas = txt('Fecha').match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
    const horas = txt('Horario').match(/(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/);
    clases.push({
      codigo: txt('Cod. Mat.'),
      materia: txt('Materia'),
      sede: txt('Sede'),
      clase: txt('Clase'),
      regimen: txt('Régimen'),
      idioma: txt('Idioma'),
      turno: txt('Turno'),
      anio: txt('Año Académico'),
      dias: DIAS.filter((d) => /background-color\s*:\s*lightgrey/i.test(tds.eq(idx(d)).attr('style') ?? '')),
      horario: horas ? `${horas[1]} - ${horas[2]}` : orNull(txt('Horario')),
      desde: fechas ? parseFecha(fechas[1]!) : null,
      hasta: fechas ? parseFecha(fechas[2]!) : null,
      regimenAprobacion: orNull(txt('Regimen Aprobacion')),
    });
  });

  // El pager muestra 10 números y después "...": si el siguiente no está a la vista, se sigue por el "..." de la derecha.
  const links = $('.rgNumPart a').toArray();
  const curIdx = links.findIndex((a) => $(a).hasClass('rgCurrentPage'));
  const current = Number(clean($(links[curIdx]).text())) || 1;
  const byNum = links.find((a) => clean($(a).text()) === String(current + 1));
  const byDots = links.slice(curIdx + 1).find((a) => clean($(a).text()) === '...');
  const nextEl = byNum ?? byDots;
  const siguientePagina = nextEl ? (($(nextEl).attr('href') ?? '').match(/__doPostBack\('([^']+)'/)?.[1] ?? null) : null;

  return { materias, clases, siguientePagina, form };
}

// ── Planificación de un aula (Mi Semana): cada clase con su fecha y actividad ─────
// Ojo: acá las fechas vienen en día/mes/año (verificado: en 58 fechas reales el primer número pasa de 12).

export type TipoActividad = 'cursada' | 'evaluacion' | 'recuperatorio' | 'examen_final' | 'otra';

export interface ActividadClase {
  fecha: string | null;
  dia: string;
  horario: string | null;
  aula: string | null;
  sede: string | null;
  actividad: TipoActividad;
  actividadTexto: string;
}

export interface Planificacion {
  clase: string | null;
  materia: string | null;
  actividades: ActividadClase[];
}

const TIPO: Record<string, TipoActividad> = {
  CURSADA: 'cursada',
  EVALUACION: 'evaluacion',
  RECUPERATORIO: 'recuperatorio',
  'EXAMEN FINAL': 'examen_final',
};

export function parsePlanificacion(html: string): Planificacion {
  const $ = cheerio.load(html);
  // Sin tabla puede ser que el docente todavía no cargó la planificación; sin el título de la
  // página, cambió la página.
  if (!$('table.cursada_celdas').length) {
    if (/Mi Semana/i.test($('body').text())) return { clase: null, materia: null, actividades: [] };
    throw new PageChangedError('planificación del curso (Mi Semana)');
  }
  const table = $('table.cursada_celdas').first();
  const titulo = clean(table.find('tr.tr_ancho').first().text()).match(/^Clase:\s*(\d+)\s*-\s*(.+)$/i);
  const actividades: ActividadClase[] = [];
  table.find('tr.celda_cursada_desplegada').each((_, tr) => {
    const td = $(tr).children('td').map((_, c) => clean($(c).text())).get();
    const texto = td[7] ?? '';
    const norm = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    actividades.push({
      fecha: parseFecha(td[0] ?? ''),
      dia: td[1] ?? '',
      horario: orNull(td[2] ?? ''),
      aula: orNull(td[3] ?? ''),
      sede: orNull(td[6] ?? ''),
      actividad: TIPO[norm] ?? 'otra',
      actividadTexto: texto,
    });
  });
  return { clase: titulo?.[1] ?? null, materia: titulo?.[2] ?? null, actividades };
}
