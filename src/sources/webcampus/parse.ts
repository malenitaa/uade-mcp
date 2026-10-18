// Parsers puros de las páginas de WebCampus (HTML → JSON tipado). No hacen red.
// La estructura está relevada en docs/DISENO.md §6 y reproducida en test/fixtures/webcampus/.
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
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
const FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
export function parseFecha(raw: string): string | null {
  const m = raw.match(FECHA);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}

// ── Períodos (menú "Mis Cursos") ──────────────────────────────────────────────

export interface Periodo {
  id: string;
  nombre: string;
}

export function parsePeriodos(html: string): Periodo[] {
  const $ = cheerio.load(html);
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

    materias.push({
      codigo: td[0] ?? '',
      nombre: clean(horas ? nombreRaw.slice(0, horas.index) : nombreRaw),
      horas: horas ? Number(horas[1]) : null,
      anio,
      situacion,
      situacionTexto: td[2] ?? '',
      nota: notaNum,
      notaTexto,
      fechaAprobacion: situacion === 'aprobada' ? parseFecha(fechaActa) : null,
    });
  });

  const promTxt = clean($('[id$="lblPromValor"]').text()).replace(',', '.');
  const prom = promTxt && Number.isFinite(Number(promTxt)) ? Number(promTxt) : null;
  return { materias, promedio: prom };
}

// ── Cuenta corriente ──────────────────────────────────────────────────────────

export interface FilaCuenta {
  [columna: string]: string | number | null;
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
    rows.push(fila);
  });
  return rows;
}

export function parseCuenta(html: string): Cuenta {
  const $ = cheerio.load(html);
  return {
    deudaVencida: parseTablaCuenta($, 'TableDeudaVencida'),
    proximosVencimientos: parseTablaCuenta($, 'TableProximosVenc'),
    pagos: parseTablaCuenta($, 'TablePagosRealizados'),
  };
}
