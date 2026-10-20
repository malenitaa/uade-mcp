// Vista de la semana: un archivo HTML autocontenido (sin nada externo) con cada combinación del
// planificador en una grilla de lunes a sábado, y un .ics con las clases de la combinación elegida
// para importarlas a cualquier calendario. Se generan en tu compu; no se suben a ningún lado.
import type { ClaseOfertada } from '../webcampus/parse.js';
import type { Combinacion } from './index.js';
import { rangoHorario } from './index.js';

const DIAS = ['L', 'M', 'MI', 'J', 'V', 'S'] as const;
const NOMBRE_DIA: Record<string, string> = { L: 'Lunes', M: 'Martes', MI: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado' };
const BYDAY: Record<string, string> = { L: 'MO', M: 'TU', MI: 'WE', J: 'TH', V: 'FR', S: 'SA', D: 'SU' };
const COLORES = ['#ff4f97', '#4ad295', '#5aa8ff', '#f5b14c', '#b98cff', '#3fd1d1'];

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ddmm = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'sin fecha');
const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface Meta {
  carrera: string;
  generado: Date;
  filtros: string;
  periodo?: string; // aviso sobre qué cuatrimestre es la programación
}

export function semanaHtml(combos: Combinacion[], meta: Meta): string {
  const todas = combos.flatMap((c) => c.clases);
  const rangos = todas.map(rangoHorario).filter((r): r is [number, number] => !!r);
  // La grilla va de la primera clase a la última (redondeado a la hora), no de 8 a 23 siempre.
  const ini = rangos.length ? Math.floor(Math.min(...rangos.map((r) => r[0])) / 60) * 60 : 8 * 60;
  const fin = rangos.length ? Math.ceil(Math.max(...rangos.map((r) => r[1])) / 60) * 60 : 18 * 60;
  const alto = (fin - ini) * 1.1; // px por minuto
  const color = new Map<string, string>();
  for (const c of todas) if (!color.has(c.codigo)) color.set(c.codigo, COLORES[color.size % COLORES.length]!);

  const horas: string[] = [];
  for (let m = ini; m <= fin; m += 60) horas.push(`<div class="h" style="top:${(m - ini) * 1.1}px">${hhmm(m)}</div>`);

  const vista = (combo: Combinacion, i: number): string => {
    const cols = DIAS.map((d) => {
      const bloques = combo.clases.filter((c) => c.dias.includes(d)).map((c) => {
        const r = rangoHorario(c);
        if (!r) return '';
        return `<div class="b" style="top:${(r[0] - ini) * 1.1}px;height:${(r[1] - r[0]) * 1.1 - 4}px;--c:${color.get(c.codigo)}"><b>${esc(c.materia)}</b><span>${esc(c.horario ?? '')}</span><span>${esc(c.sede)} · clase ${esc(c.clase)}</span></div>`;
      }).join('');
      return `<div class="col"><div class="dh">${NOMBRE_DIA[d]}</div><div class="cuerpo" style="height:${alto}px">${bloques}</div></div>`;
    }).join('');
    const sinHorario = combo.clases.filter((c) => !rangoHorario(c));
    const lista = combo.clases.map((c) => `<tr><td><i style="--c:${color.get(c.codigo)}"></i>${esc(c.materia)} <small>${esc(c.codigo)}</small></td><td>${esc(c.clase)}</td><td>${esc(c.sede)}</td><td>${esc(c.turno)}</td><td>${c.dias.map((d) => NOMBRE_DIA[d]?.slice(0, 3) ?? d).join(', ')} ${esc(c.horario ?? '')}</td><td>${ddmm(c.desde)} al ${ddmm(c.hasta)}</td></tr>`).join('');
    return `<section class="combo" id="c${i}" ${i ? 'hidden' : ''}>
  <p class="meta">${combo.diasDeCursada.length} días de cursada · ${combo.horasHueco} h de huecos · ${combo.sedes.map(esc).join(' y ')}</p>
  <div class="grilla"><div class="horas" style="height:${alto}px">${horas.join('')}</div>${cols}</div>
  ${sinHorario.length ? `<p class="meta">Sin horario fijo: ${sinHorario.map((c) => esc(c.materia)).join(', ')}</p>` : ''}
  <div class="tabla"><table><thead><tr><th>Materia</th><th>Clase</th><th>Sede</th><th>Turno</th><th>Días y horario</th><th>Cursada</th></tr></thead><tbody>${lista}</tbody></table></div>
</section>`;
  };

  const tabs = combos.map((c, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}">Opción ${i + 1}<small>${c.diasDeCursada.map((d) => NOMBRE_DIA[d]?.slice(0, 3)).join(' · ')}</small><small>${c.sedes.map((x) => esc(x.replace(/^UADE /, ''))).join(' + ')}</small></button>`).join('');

  return `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tu semana · ${esc(meta.carrera)}</title>
<style>
:root{--bg:#f4f4f1;--panel:#fff;--border:#dcdcd6;--text:#121318;--muted:#5d6070;--brand:#e11d6f;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#07080c;--panel:#11131b;--border:#1f2230;--text:#eceef5;--muted:#8c90a3;--brand:#ff4f97}}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--text);padding:28px 18px 48px}
main{max-width:1180px;margin:0 auto;display:grid;gap:18px}
.lab{font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
h1{margin:0;font-size:clamp(30px,5vw,48px);letter-spacing:-.04em;line-height:1}
.meta{margin:0;color:var(--muted);font-size:14px}
[role=tablist]{display:flex;flex-wrap:wrap;gap:8px}
[role=tab]{display:grid;gap:3px;text-align:left;font:600 14px system-ui;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px 14px;cursor:pointer}
[role=tab] small{font:400 12px ui-monospace,Menlo,monospace;color:var(--muted)}
[role=tab][aria-selected=true]{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 18%,transparent)}
.combo{display:grid;gap:14px}
.grilla{display:grid;grid-template-columns:52px repeat(6,minmax(110px,1fr));border:1px solid var(--border);border-radius:14px;background:var(--panel);overflow-x:auto;padding-bottom:10px}
.horas{position:relative;margin-top:38px}.h{position:absolute;left:8px;font:400 11px ui-monospace,Menlo,monospace;color:var(--muted);transform:translateY(-50%)}
.col{border-left:1px solid var(--border)}.dh{height:38px;display:flex;align-items:center;padding:0 10px;font-weight:600;font-size:14px;border-bottom:1px solid var(--border)}
.cuerpo{position:relative;background:repeating-linear-gradient(var(--border) 0 1px,transparent 1px 66px)}
.b{position:absolute;left:5px;right:5px;border-radius:10px;padding:8px 9px;display:grid;align-content:start;gap:3px;overflow:hidden;background:color-mix(in srgb,var(--c) 18%,var(--panel));border:1px solid color-mix(in srgb,var(--c) 55%,transparent);border-left:3px solid var(--c)}
.b b{font-size:12.5px;line-height:1.2}.b span{font:400 11px ui-monospace,Menlo,monospace;color:var(--muted)}
.tabla{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font:500 11px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:12px}td{padding:12px;border-top:1px solid var(--border);vertical-align:top}
td small{color:var(--muted);font-family:ui-monospace,Menlo,monospace}td i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:8px}
.pasos{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--brand);border-radius:14px;padding:16px 18px;display:grid;gap:8px;font-size:15px}
.pasos ol{margin:0;padding-left:20px;display:grid;gap:4px}
@media print{[role=tablist],.pasos{display:none}.combo[hidden]{display:grid!important;break-before:page}}
</style></head><body><main>
<p class="lab">Plan UADE MCP · vista de tu semana</p>
<h1>Tu semana</h1>
<p class="meta">${esc(meta.carrera)} · ${esc(meta.filtros)} · generado el ${meta.generado.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} con la programación de clases de WebCampus. Los cupos y horarios pueden cambiar: confirmalos al inscribirte.</p>
${meta.periodo ? `<p class="meta"><b>${esc(meta.periodo)}</b></p>` : ''}
<div role="tablist" aria-label="Opciones">${tabs}</div>
${combos.map(vista).join('\n')}
<div class="pasos"><b>Para anotarte</b><ol><li>Pedile al agente el resumen de la inscripción de cada clase (qué se factura y si tiene baja).</li><li>Pedile que abra Inscripciones: se abre con tu sesión iniciada.</li><li>Elegí la ventana, agregá cada clase al carrito con su número, revisá la última pantalla y apretá Finalizar vos.</li></ol></div>
</main>
<script>
document.querySelectorAll('[role=tab]').forEach(function(t){t.addEventListener('click',function(){
document.querySelectorAll('[role=tab]').forEach(function(x){x.setAttribute('aria-selected',String(x===t))});
document.querySelectorAll('.combo').forEach(function(c,i){c.hidden=String(i)!==t.dataset.i});});});
</script>
</body></html>`;
}

// Primera fecha >= desde que cae en alguno de los días de la clase.
function primerDia(desde: string, dias: string[]): string {
  const idx: Record<string, number> = { D: 0, L: 1, M: 2, MI: 3, J: 4, V: 5, S: 6 };
  const quiero = new Set(dias.map((d) => idx[d]));
  const f = new Date(`${desde}T12:00:00Z`);
  for (let i = 0; i < 7 && !quiero.has(f.getUTCDay()); i++) f.setUTCDate(f.getUTCDate() + 1);
  return f.toISOString().slice(0, 10);
}

const icsTexto = (s: string): string => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

export function semanaIcs(clases: ClaseOfertada[], generado = new Date()): string {
  const stamp = generado.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const eventos = clases.flatMap((c) => {
    const r = rangoHorario(c);
    if (!r || !c.desde || !c.hasta || !c.dias.length) return [];
    const dia = primerDia(c.desde, c.dias).replace(/-/g, '');
    const t = (m: number) => `${hhmm(m).replace(':', '')}00`;
    return [
      'BEGIN:VEVENT',
      `UID:uade-mcp-${c.codigo}-${c.clase}@planuade.ar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/Argentina/Buenos_Aires:${dia}T${t(r[0])}`,
      `DTEND;TZID=America/Argentina/Buenos_Aires:${dia}T${t(r[1])}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${c.dias.map((d) => BYDAY[d]).join(',')};UNTIL=${c.hasta.replace(/-/g, '')}T235959Z`,
      `SUMMARY:${icsTexto(c.materia)}`,
      `LOCATION:${icsTexto(`UADE ${c.sede}`)}`,
      `DESCRIPTION:${icsTexto(`${c.codigo} · clase ${c.clase} · turno ${c.turno}. Generado por Plan UADE MCP con la programación de clases; confirmalo al inscribirte.`)}`,
      'END:VEVENT',
    ];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan UADE MCP//Semana//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR', ''].join('\r\n');
}
