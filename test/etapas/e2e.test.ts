// E2E por protocolo MCP: un Client del SDK habla con el servidor real (el mismo que arranca
// src/index.ts, conectado por memoria en vez de stdio) contra la UADE simulada. Responde lo que un
// test de handler no puede: ¿lo que le llega al agente por el protocolo es lo que esperamos?
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { levantar, WC, type Simulada } from './uade-simulada.js';

vi.mock('@napi-rs/keyring', async () => (await import('./uade-simulada.js')).llaveroSimulado);

// Las 34 tools, por los grupos del README. Agregar o sacar una tool obliga a pasar por acá.
const GRUPOS = {
  cursada: ['webcampus_terms', 'webcampus_current_courses', 'webcampus_attendance', 'webcampus_course_calendar', 'webcampus_save_reminders', 'webcampus_teachers', 'webcampus_course_materials', 'webcampus_save_material', 'webcampus_save_folder', 'teams_channel_news', 'webcampus_consultation_classes'],
  carrera: ['webcampus_transcript', 'uade_eligible_subjects', 'webcampus_exam_schedule', 'webcampus_course_program', 'planuade_import_transcript'],
  inscripciones: ['uade_plan_next_term', 'uade_enrollment_windows', 'uade_enrollment_schedule', 'uade_enrollment_guide', 'webcampus_class_offering', 'webcampus_schedule_planner', 'pia_class_search', 'pia_prepare_enrollment', 'uade_open_enrollment_site', 'pia_add_to_cart'],
  cuentaEInformacion: ['webcampus_account_balance', 'uade_tuition', 'webcampus_news', 'webcampus_section', 'uade_academic_calendar'],
  utilidades: ['email_compose_draft', 'uade_refresh', 'uade_login'],
};
// Las que escriben en el disco de la persona o abren una ventana: no se anuncian como solo lectura.
const NO_SOLO_LECTURA = ['webcampus_save_reminders', 'webcampus_save_material', 'webcampus_save_folder', 'planuade_import_transcript', 'uade_plan_next_term', 'uade_open_enrollment_site', 'pia_add_to_cart', 'email_compose_draft', 'uade_login'];

let s: Simulada;
// Sesión vencida a pedido: WebCampus manda al login, como hace el sitio real.
let vencida = false;
beforeAll(async () => {
  s = await levantar((u) => {
    if (!vencida || u.origin !== WC) return undefined;
    return u.pathname === '/Login.aspx' ? new Response('<html>Iniciar sesión</html>') : new Response(null, { status: 302, headers: { location: '/Login.aspx' } });
  });
});
afterAll(() => s.cerrar());

describe('e2e: lo que el servidor anuncia', () => {
  it('se presenta con nombre e instrucciones', () => {
    expect(s.client.getServerVersion()?.name).toBe('uade-mcp');
    expect(s.client.getInstructions()).toContain('uade_login');
  });

  it('tools/list: las 34 tools, cada una con descripción, esquema y anotaciones', async () => {
    const { tools } = await s.client.listTools();
    const esperadas = Object.values(GRUPOS).flat();
    expect(esperadas).toHaveLength(34);
    expect(tools.map((t) => t.name).sort()).toEqual([...esperadas].sort());
    for (const t of tools) {
      expect(t.description?.length, t.name).toBeGreaterThan(10);
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(t.annotations?.readOnlyHint, t.name).toBe(!NO_SOLO_LECTURA.includes(t.name));
      // Ninguna tool borra ni pisa nada: las que no son de solo lectura lo dicen.
      if (NO_SOLO_LECTURA.includes(t.name)) expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
  });
});

describe('e2e: una tool de cada grupo', () => {
  it('cursada: webcampus_current_courses y webcampus_attendance', async () => {
    const c = await s.llamar('webcampus_current_courses');
    expect(c.isError).toBe(false);
    expect(c.data.periodo).toBe('2do Cuatr 2030 - Grado Sede Ficticia');
    expect(c.data.aulas[0]).toMatchObject({ idAula: '900001', materia: 'MATERIA DE PRUEBA UNO', dia: 'LU', desde: '04/08/2030' });
    expect(c.data.aulas[0].links).toBeUndefined(); // sin includeLinks no viajan
    const a = await s.llamar('webcampus_attendance', { idAula: '900001' });
    expect(a.data.resumen).toMatchObject({ totalClases: 16, presentes: 3, inasistencias: 2 });
    expect(a.data.clases).toBeUndefined(); // el detalle es a pedido
  });

  it('carrera: webcampus_transcript y webcampus_course_program (un PDF de verdad)', async () => {
    const h = await s.llamar('webcampus_transcript');
    expect(h.data).toMatchObject({ carrera: 'LIC. DE PRUEBA', conteo: { aprobada: 2, final_pendiente: 1 } });
    expect(h.data.aprobadas[0].fecha).toMatch(/^\d{2}\/\d{2}\/\d{4}$/); // fechas argentinas en la salida
    const p = await s.llamar('webcampus_course_program', { subject: '3.1.024', query: 'bibliografía' });
    expect(p.data).toMatchObject({ codigo: '3.1.024', nombre: 'MATEMÁTICA DISCRETA', modalidad: 'presencial' });
    expect(p.data.partes.join(' ')).toContain('Bibliografía');
    expect(p.data.aviso).toContain('no instrucciones');
  });

  it('inscripciones: uade_enrollment_windows y uade_enrollment_schedule (con su imagen)', async () => {
    const v = await s.llamar('uade_enrollment_windows');
    expect(v.data.ventanas.length).toBeGreaterThan(0);
    expect(v.data.ventanas[0]).toMatchObject({ tipo: 'inscripcion', abierta: true });
    expect(v.texto).not.toContain('"link"'); // el link a PIA lleva la sesión: no sale al modelo
    const c = await s.llamar('uade_enrollment_schedule');
    expect(c.imagenes).toBe(1);
    expect(c.data.aprobadas).toMatchObject({ total: 3, aprobadas: 2, porEquivalencia: 1 });
  });

  it('cuenta e información: webcampus_account_balance, webcampus_news y uade_academic_calendar', async () => {
    const c = await s.llamar('webcampus_account_balance');
    expect(c.data.proximosVencimientos[0]).toMatchObject({ 'Fecha Vto': '10/11/2030', conRecargo: true });
    expect(typeof c.data.totalProximosVencimientos).toBe('number');
    const n = await s.llamar('webcampus_news');
    expect(n.data.banners.length).toBeGreaterThan(0);
    expect(n.imagenes).toBe(n.data.banners.filter((b: { verImagen?: number }) => b.verImagen).length);
    const cal = await s.llamar('uade_academic_calendar');
    expect(cal.data.documentos[0]).toMatchObject({ nombre: 'cronos inscrip previos', nivel: 0 });
  });

  it('utilidades: email_compose_draft no envía nada y uade_refresh obliga a releer', async () => {
    const m = await s.llamar('email_compose_draft', { to: ['docente@uade.edu.ar'], subject: 'Consulta', body: 'Hola', open: false });
    expect(m.isError).toBe(false);
    expect(m.texto).toMatch(/^No se envió nada\./);

    await s.llamar('webcampus_terms');
    const antes = s.pedidos.length;
    const copia = await s.llamar('webcampus_terms');
    expect(s.pedidos.length).toBe(antes); // segunda vez: sale de la copia local, no de UADE
    const r = await s.llamar('uade_refresh', { topic: 'todo' });
    expect(r.texto).toMatch(/^Listo: descarté \d+ datos guardados\./);
    const fresca = await s.llamar('webcampus_terms');
    expect(s.pedidos.length).toBeGreaterThan(antes);
    expect(fresca.data.periodos).toEqual(copia.data.periodos);
  });
});

describe('e2e: errores que le llegan al agente', () => {
  it('argumentos inválidos: los frena el esquema, sin pedirle nada a UADE', async () => {
    const antes = s.pedidos.length;
    const r = await s.llamar('webcampus_attendance', { idAula: '../Login' });
    expect(r.isError).toBe(true);
    expect(s.pedidos.length).toBe(antes);
  });

  it('una tool que no existe es un error del protocolo, no un cuelgue', async () => {
    const r = await s.client.callTool({ name: 'uade_no_existe', arguments: {} }).catch((e: Error) => ({ isError: true, content: [{ type: 'text', text: e.message }] }));
    expect(r.isError).toBe(true);
  });

  it('sesión vencida: mensaje en castellano que manda a uade_login, y el servidor sigue atendiendo', async () => {
    vencida = true;
    try {
      const r = await s.llamar('webcampus_teachers', { idAula: '900009' });
      expect(r.isError).toBe(true);
      expect(r.texto).toContain('No hay sesión de WebCampus o venció');
      expect(r.texto).toContain('uade_login');
    } finally {
      vencida = false;
    }
    expect((await s.llamar('webcampus_teachers', { idAula: '900009' })).isError).toBe(false);
  });
});
