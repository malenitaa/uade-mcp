// Alta de inscripción en PIA, en dos pasos: preparar (solo lectura, arma el resumen exacto de lo que
// pasaría) → confirmar (permiso propio + confirmación del humano en un diálogo del cliente).
//
// El envío real a PIA NO está conectado todavía: PIA no se mapeó (devolvía 401 con la ventana
// cerrada) y por decisión de la autora nunca se hace una inscripción "de prueba". Por eso el
// ejecutor por defecto falla cerrado con un mensaje claro. Cuando se mapee, se reemplaza
// `ejecutarAltaReal` y el resto del circuito (permiso, borrador, diálogo) queda igual.
import { ConfirmationError, DraftStore, type Elicit } from '../../auth/confirm.js';
import type { VentanaInscripcion } from '../inscripciones/index.js';
import type { ClaseOfertada } from '../webcampus/parse.js';

export interface ParamsAlta {
  materia: string; // código
  clase: string; // número de clase
  ventana: string; // nombre de la ventana de inscripción
}

export interface Borrador {
  id: string;
  resumen: string;
  venceEn: string; // ISO
}

export interface Fuentes {
  ventanas(): Promise<VentanaInscripcion[]>;
  oferta(materia: string): Promise<ClaseOfertada[]>;
}

const borradores = new DraftStore();

const ddmmaaaa = (iso: string | null): string => {
  if (!iso) return 'sin fecha';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ''}` : iso;
};

// Solo lectura. Devuelve el resumen y un borrador que vence a los 5 minutos.
export async function prepararAlta(fuentes: Fuentes, materia: string, clase: string): Promise<Borrador> {
  const abiertas = (await fuentes.ventanas()).filter((v) => v.tipo === 'inscripcion' && v.abierta);
  if (!abiertas.length) throw new Error('No hay ninguna ventana de inscripción abierta ahora. No se puede preparar un alta.');

  const clases = await fuentes.oferta(materia);
  const elegida = clases.find((c) => c.clase === clase);
  if (!elegida) {
    const lista = clases.map((c) => `${c.clase} (${c.sede}, ${c.turno}, ${c.dias.join('/')} ${c.horario ?? ''})`).join('; ');
    throw new Error(`No encontré la clase ${clase} de ${materia}. Clases programadas: ${lista || 'ninguna'}.`);
  }

  const ventana = abiertas[0]!;
  const params: ParamsAlta = { materia, clase, ventana: ventana.nombre };
  const resumen = [
    `INSCRIPCIÓN (ALTA) EN PIA: todavía no se hizo nada.`,
    `Materia: ${elegida.materia} (${elegida.codigo})`,
    `Clase: ${elegida.clase} · ${elegida.sede} · turno ${elegida.turno} · ${elegida.dias.join('/')} ${elegida.horario ?? ''}`,
    `Cursada: del ${ddmmaaaa(elegida.desde)} al ${ddmmaaaa(elegida.hasta)} · ${elegida.regimenAprobacion ?? ''}`,
    `Ventana: ${ventana.nombre}, cierra el ${ddmmaaaa(ventana.hasta)}`,
    `Consecuencias: genera un cargo en tu cuenta corriente y ocupa un cupo. NO se puede dar de baja desde este MCP (las bajas quedaron fuera a propósito).`,
    `Para seguir hace falta el permiso pia.inscribir (lo prendés vos en la terminal) y tu confirmación en un diálogo. Este borrador vence en 5 minutos.`,
  ].join('\n');

  const d = borradores.preparar('pia.inscribir', resumen, params);
  return { id: d.id, resumen, venceEn: new Date(d.expiresAt).toISOString() };
}

// Ejecutor por defecto: PIA no está mapeado. Falla cerrado, nunca simula un éxito.
export async function ejecutarAltaReal(_params: ParamsAlta): Promise<never> {
  throw new ConfirmationError(
    'La inscripción real en PIA todavía no está conectada al MCP (PIA no se mapeó y nunca se hace una ' +
      'inscripción de prueba). Tu confirmación quedó registrada pero NO se envió nada. Hacé el alta desde ' +
      'inscripciones.uade.edu.ar → ¡INSCRIBITE!',
  );
}

// Consume el borrador (un solo uso), pide confirmación al humano por elicitation y recién ahí ejecuta.
export async function confirmarAlta(
  id: string,
  elicit: Elicit | undefined,
  ejecutar: (p: ParamsAlta) => Promise<unknown> = ejecutarAltaReal,
): Promise<unknown> {
  const params = await borradores.confirmar<ParamsAlta>(id, 'pia.inscribir', elicit);
  return ejecutar(params);
}
