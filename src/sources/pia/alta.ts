// Resumen de una inscripción (materia o examen previo), solo lectura. El MCP no inscribe: arma el
// resumen exacto de lo que pasaría y abre la ventana de inscripción con la sesión iniciada; la
// persona hace la inscripción y aprieta Finalizar en PIA.
import type { VentanaInscripcion } from '../inscripciones/index.js';
import type { ExamenPrevio } from '../webcampus/previos.js';
import type { ClaseOfertada } from '../webcampus/parse.js';
import { ErrorDeUso } from '../../error-de-uso.js';

export interface FuentesClase {
  ventanas(): Promise<VentanaInscripcion[]>;
  oferta(materia: string): Promise<ClaseOfertada[]>;
}

export interface FuentesPrevio {
  ventanas(): Promise<VentanaInscripcion[]>;
  examenes(materia: string): Promise<ExamenPrevio[]>;
  // Si se puede rendir según historial + correlativas (uade_eligible_subjects).
  puedeRendir(materia: string): Promise<{ ok: boolean; motivo?: string }>;
}

const ddmmaaaa = (iso: string | null): string => {
  if (!iso) return 'sin fecha';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ''}` : iso;
};

const PASOS_FINALES = 'La inscripción la hacés vos en PIA: cuando llegues a la pantalla con el resumen y el arancel, revisalo y recién ahí apretá Finalizar.';

export async function resumenClase(fuentes: FuentesClase, materia: string, clase: string): Promise<string> {
  const abiertas = (await fuentes.ventanas()).filter((v) => v.tipo === 'inscripcion' && v.abierta);
  if (!abiertas.length) throw new Error('No hay ninguna ventana de inscripción a materias abierta ahora.');
  const clases = await fuentes.oferta(materia);
  const elegida = clases.find((c) => c.clase === clase);
  if (!elegida) {
    const lista = clases.map((c) => `${c.clase} (${c.sede}, ${c.turno}, ${c.dias.join('/')} ${c.horario ?? ''})`).join('; ');
    throw new ErrorDeUso(`No encontré la clase ${clase} de ${materia}. Clases programadas: ${lista || 'ninguna'}.`);
  }
  return [
    'INSCRIPCIÓN A MATERIA: todavía no se hizo nada.',
    `Materia: ${elegida.materia} (${elegida.codigo})`,
    `Clase: ${elegida.clase} · ${elegida.sede} · turno ${elegida.turno} · ${elegida.dias.join('/')} ${elegida.horario ?? ''}`,
    `Cursada: del ${ddmmaaaa(elegida.desde)} al ${ddmmaaaa(elegida.hasta)} · ${elegida.regimenAprobacion ?? ''}`,
    `Ventanas abiertas: ${abiertas.map((v) => `${v.nombre} (cierra el ${ddmmaaaa(v.hasta)})`).join('; ')}`,
    'Consecuencias: genera cuotas en tu cuenta corriente y ocupa un cupo. Las materias tienen ventana de bajas (mirá su cierre con uade_enrollment_windows); los cursos intensivos pueden retener cuotas: PIA te muestra esas condiciones antes de agregar al carrito.',
    PASOS_FINALES,
  ].join('\n');
}

export async function resumenPrevio(fuentes: FuentesPrevio, materia: string): Promise<string> {
  const ventana = (await fuentes.ventanas()).find((v) => v.tipo === 'examenes' && v.abierta);
  if (!ventana) throw new Error('No hay ninguna ventana de inscripción a exámenes previos abierta ahora.');
  const puede = await fuentes.puedeRendir(materia);
  if (!puede.ok) throw new ErrorDeUso(`Según tu historial y las correlativas no podés rendir ${materia}: ${puede.motivo}.`);
  const examenes = await fuentes.examenes(materia);
  if (!examenes.length) throw new ErrorDeUso(`No encontré ${materia} en el cronograma de previos publicado.`);
  const lineas = examenes.map((e) => `${e.sede} · ${ddmmaaaa(e.fecha)}${e.hora ? ` ${e.hora}` : ''}${e.clase ? ` · clase ${e.clase}` : ''}${e.aula ? ` · aula ${e.aula}` : ''}`);
  return [
    'INSCRIPCIÓN A EXAMEN PREVIO: todavía no se hizo nada.',
    `Materia: ${examenes[0]!.materia} (${materia})`,
    `Fechas en el cronograma: ${lineas.join('; ')}`,
    `Ventana: ${ventana.nombre}, del ${ddmmaaaa(ventana.desde)} al ${ddmmaaaa(ventana.hasta)}. Cada examen puede cerrar antes: PIA muestra el límite.`,
    'Consecuencias: al Finalizar se factura el derecho a examen (PIA muestra el monto y el vencimiento en la última pantalla) y la inscripción a examen no se puede dar de baja.',
    PASOS_FINALES,
  ].join('\n');
}
