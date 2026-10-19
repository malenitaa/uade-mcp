// Parsers de PIA (inscripcionespia.uade.edu.ar), el sistema donde se hace la inscripción. Es ASP.NET
// WebForms con UpdatePanels: las respuestas pueden ser HTML completo o un "delta" de MS AJAX.
// Mapeado a partir de un registro de red hecho por la autora en su propio navegador; fixtures
// sintéticas en test/fixtures/pia.
import * as cheerio from 'cheerio';
import { PageChangedError, parseFecha, type FormState } from '../webcampus/parse.js';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const PREFIJO = 'ctl00$ContentPlaceHolder1$';

export const CONTROLES = {
  seleccionarMaterias: `${PREFIJO}btnSeleccionarMaterias`,
  buscar: `${PREFIJO}btnBuscar`,
  turno: `${PREFIJO}cboTurno`,
  carrera: `${PREFIJO}cboCarrera`,
  confirmarCarrito: `${PREFIJO}btnConfirmarCarrito`,
  terminos: `${PREFIJO}chkTerminos`,
  comentarios: `${PREFIJO}txtComentarios`,
  finalizar: `${PREFIJO}btnFinalizar`,
  volver: `${PREFIJO}btnVolver`,
} as const;

export const DIAS_PIA: Record<string, string> = {
  L: `${PREFIJO}chkLunes`,
  M: `${PREFIJO}chkMartes`,
  MI: `${PREFIJO}chkMiercoles`,
  J: `${PREFIJO}chkJueves`,
  V: `${PREFIJO}chkViernes`,
  S: `${PREFIJO}chkSabado`,
};

// Estado completo del formulario tal como lo mandaría el navegador: hidden, texto, selects,
// radios y checkboxes marcados. Los botones no van (se agregan al disparar).
export function leerFormulario($: cheerio.CheerioAPI): FormState {
  const form: FormState = {};
  $('form input').each((_, i) => {
    const name = $(i).attr('name');
    const type = ($(i).attr('type') ?? 'text').toLowerCase();
    if (!name || type === 'submit' || type === 'image' || type === 'button') return;
    if (type === 'checkbox' || type === 'radio') {
      if ($(i).attr('checked') !== undefined) form[name] = $(i).attr('value') ?? 'on';
      return;
    }
    form[name] = $(i).attr('value') ?? '';
  });
  $('form textarea').each((_, t) => {
    const name = $(t).attr('name');
    if (name) form[name] = $(t).text();
  });
  $('form select').each((_, s) => {
    const name = $(s).attr('name');
    if (!name) return;
    const sel = $(s).find('option[selected]').first();
    form[name] = (sel.length ? sel : $(s).find('option').first()).attr('value') ?? '';
  });
  return form;
}

export interface Opcion {
  id: string;
  nombre: string;
}

export interface Buscador {
  form: FormState;
  cicloLectivo: string;
  periodo: string;
  carrera: string;
  carreras: Opcion[];
  turnos: Opcion[];
}

export function parseBuscador(html: string): Buscador {
  const $ = cheerio.load(html);
  if (!$(`select[name="${CONTROLES.turno}"]`).length || !$(`select[name="${CONTROLES.carrera}"]`).length) {
    throw new PageChangedError('búsqueda de clases de PIA');
  }
  const opciones = (name: string): Opcion[] =>
    $(`select[name="${name}"] option`)
      .map((_, o) => ({ id: $(o).attr('value') ?? '', nombre: clean($(o).text()) }))
      .get()
      .filter((o) => o.id !== '-1' && o.nombre);
  const form = leerFormulario($);
  const carreraSel = $(`select[name="${CONTROLES.carrera}"] option[selected]`).first();
  return {
    form,
    cicloLectivo: form[`${PREFIJO}txtCicloLectivo`] ?? '',
    periodo: clean($(`select[name="${PREFIJO}cboPeriodo"] option[selected]`).text()),
    carrera: clean(carreraSel.text()),
    carreras: opciones(CONTROLES.carrera),
    turnos: opciones(CONTROLES.turno),
  };
}

export interface MateriaPia {
  anio: string | null;
  orden: string;
  codigo: string;
  materia: string;
  cargaHoraria: string;
  regimen: string;
  info: string | null; // "Sin Clases en el Período", etc.
  chk: string | null; // name del checkbox para elegirla (null si no se puede)
}

export function parseMaterias(html: string): MateriaPia[] {
  const $ = cheerio.load(html);
  const tablas = $('table.gridViewMaterias');
  if (!tablas.length) throw new PageChangedError('lista de materias de PIA');
  const out: MateriaPia[] = [];
  tablas.each((_, t) => {
    // El año ("PRIMER AÑO") es el encabezado que precede a cada tabla.
    const anio = clean($(t).prevAll().filter((__, e) => /A[ÑN]O/i.test($(e).text())).first().text()) || null;
    const headers = $(t).find('tr').first().find('th').map((__, th) => clean($(th).text()).toLowerCase()).get();
    const col = (h: string) => headers.findIndex((x) => x.startsWith(h));
    $(t).find('tr').slice(1).each((__, tr) => {
      const td = $(tr).children('td');
      const codigo = clean(td.eq(col('código')).text());
      if (!codigo) return;
      out.push({
        anio,
        orden: clean(td.eq(col('or.')).text()),
        codigo,
        materia: clean(td.eq(col('materia')).text()),
        cargaHoraria: clean(td.eq(col('carga')).text()),
        regimen: clean(td.eq(col('régimen')).text()),
        info: clean(td.eq(col('información')).text()) || null,
        chk: td.find('input[type=checkbox]').attr('name') ?? null,
      });
    });
  });
  return out;
}

export interface ClasePia {
  codigo: string;
  materia: string;
  clase: string;
  claseId: string;
  sede: string;
  modalidad: string;
  turno: string;
  idioma: string;
  dias: string[];
  horario: string | null;
  desde: string | null;
  hasta: string | null;
  vacantes: number | null;
  regimenAprobacion: string | null;
  // Texto de condiciones que PIA hace aceptar antes de agregar al carrito (cursos intensivos, etc.)
  condiciones: string | null;
  hospedaje: boolean;
  btnAlta: string | null; // name del botón "Agregar al carrito"
}

const DIAS_HIDDEN: [string, string][] = [['L', 'LU'], ['M', 'MA'], ['MI', 'MI'], ['J', 'JU'], ['V', 'VI'], ['S', 'SA']];

export function parseClases(html: string): ClasePia[] {
  const $ = cheerio.load(html);
  const out: ClasePia[] = [];
  const titulos = $('span[id*="lblMateriaDescripcion"]').map((_, s) => clean($(s).text())).get();
  const tablas = $('table.grillaInscripcion[id*="grdResultados"]');
  if (!titulos.length && !tablas.length) {
    if (/Sin Clases|No se encontraron/i.test($.text())) return [];
    throw new PageChangedError('clases de PIA');
  }
  tablas.each((i, t) => {
    const titulo = titulos[i] ?? '';
    const m = titulo.match(/^([\w.]+)\s*-\s*(.+)$/);
    const headers = $(t).find('tr').first().find('th').map((__, th) => clean($(th).text()).toLowerCase()).get();
    const col = (h: string) => headers.findIndex((x) => x.startsWith(h));
    $(t).find('tr').slice(1).each((__, tr) => {
      const td = $(tr).children('td');
      const hidden = (suf: string): string => $(tr).find(`input[type=hidden][name$="$hidden${suf}"]`).attr('value') ?? '';
      const clase = clean(td.eq(col('clase')).text());
      if (!clase) return;
      const horas = clean(td.eq(col('horario')).text()).match(/(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/);
      const fechas = clean(td.eq(col('fecha')).text()).match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
      const vac = clean(td.eq(col('vacantes')).text());
      const ampliada = hidden('OfertaAmpliada') === 'True' ? clean(hidden('OfertaAmpliadaDescripcion')) : '';
      out.push({
        codigo: m?.[1] ?? '',
        materia: m?.[2] ?? titulo,
        clase,
        claseId: hidden('ClaseId'),
        sede: clean(td.eq(col('sede')).text()),
        modalidad: clean(td.eq(col('modalidad')).text()),
        turno: clean(td.eq(col('turno')).text()),
        idioma: clean(td.eq(col('idioma')).text()),
        dias: DIAS_HIDDEN.filter(([, h]) => hidden(h) === 'True').map(([d]) => d),
        horario: horas ? `${horas[1]} - ${horas[2]}` : null,
        desde: fechas ? parseFecha(fechas[1]!) : null,
        hasta: fechas ? parseFecha(fechas[2]!) : null,
        vacantes: /^\d+$/.test(vac) ? Number(vac) : null,
        regimenAprobacion: clean(td.eq(col('régimen')).text()) || null,
        condiciones: ampliada || null,
        hospedaje: $(tr).find('input[name$="$btnVerHospedaje"]').length > 0,
        btnAlta: $(tr).find('input[name$="$btnCarritoAlta"]').attr('name') ?? null,
      });
    });
  });
  return out;
}

// Respuesta "delta" de un postback asincrónico de MS AJAX: `largo|tipo|id|contenido|`…
export interface Delta {
  paneles: Map<string, string>;
  redirect: string | null;
  error: string | null;
}

export function esDelta(text: string): boolean {
  return /^\d+\|/.test(text);
}

export function parseDelta(text: string): Delta {
  const d: Delta = { paneles: new Map(), redirect: null, error: null };
  let pos = 0;
  while (pos < text.length) {
    const a = text.indexOf('|', pos);
    const b = text.indexOf('|', a + 1);
    const c = text.indexOf('|', b + 1);
    if (a < 0 || b < 0 || c < 0) break;
    const largo = Number(text.slice(pos, a));
    const tipo = text.slice(a + 1, b);
    const id = text.slice(b + 1, c);
    const contenido = text.slice(c + 1, c + 1 + largo);
    pos = c + 1 + largo + 1;
    if (tipo === 'updatePanel') d.paneles.set(id, contenido);
    else if (tipo === 'pageRedirect') d.redirect = decodeURIComponent(contenido);
    else if (tipo === 'error') d.error = contenido;
  }
  return d;
}

// HTML "completo" a partir de cualquiera de las dos respuestas, para reusar los parsers.
export function htmlDe(text: string): string {
  if (!esDelta(text)) return text;
  const d = parseDelta(text);
  if (d.error) throw new Error(`PIA devolvió un error: ${clean(d.error)}`);
  return `<form>${[...d.paneles.values()].join('\n')}</form>`;
}

export interface Arancel {
  descripcion: string;
  vencimiento: string | null;
  importe: number | null;
  moneda: string;
}

export interface PendienteAlta {
  codigo: string;
  materia: string;
  clase: string;
  sede: string;
  horario: string | null;
  desde: string | null;
  hasta: string | null;
  btnBorrar: string | null;
}

export interface Finalizar {
  form: FormState;
  pendientes: PendienteAlta[];
  aranceles: Arancel[];
  terminos: string | null; // link a los términos y condiciones
  puedeFinalizar: boolean;
}

const importe = (s: string): number | null => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && s ? n : null;
};

export function parseFinalizar(html: string): Finalizar {
  const $ = cheerio.load(html);
  const grdTotales = $('#ContentPlaceHolder1_grdTotales');
  const carrito = $('[id*="grdClasesAlta_grdResultados"]').filter('table');
  if (!$(`input[name="${CONTROLES.terminos}"]`).length) throw new PageChangedError('finalizar inscripción de PIA');
  const pendientes: PendienteAlta[] = [];
  carrito.find('tr').slice(1).each((_, tr) => {
    const hidden = (suf: string): string => $(tr).find(`input[type=hidden][name$="$hidden${suf}"]`).attr('value') ?? '';
    if (!hidden('ClaseId')) return;
    const horas = hidden('HorarioDescripcion').match(/(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/);
    const fechas = hidden('FechaCursadaDescripcion').match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
    pendientes.push({
      codigo: hidden('MateriaCodigo'),
      materia: hidden('MateriaNombre'),
      clase: clean($(tr).find('td.tdClase').text()),
      sede: hidden('CodigoSede'),
      horario: horas ? `${horas[1]} - ${horas[2]}` : null,
      desde: fechas ? parseFecha(fechas[1]!) : null,
      hasta: fechas ? parseFecha(fechas[2]!) : null,
      btnBorrar: $(tr).find('input[name$="$btnBorrar"]').attr('name') ?? null,
    });
  });
  const aranceles: Arancel[] = [];
  grdTotales.find('tr').slice(1).each((_, tr) => {
    const td = $(tr).children('td').map((__, c) => clean($(c).text())).get();
    if (td.length < 4) return;
    aranceles.push({ descripcion: td[0]!, vencimiento: parseFecha(td[1]!), importe: importe(td[2]!), moneda: td[3]! });
  });
  return {
    form: leerFormulario($),
    pendientes,
    aranceles,
    terminos: $('#ContentPlaceHolder1_lblTerminos a, a[href*="erminos"]').first().attr('href') ?? null,
    puedeFinalizar: $(`input[name="${CONTROLES.finalizar}"]`).length > 0,
  };
}
