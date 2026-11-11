// Presupuesto de tiempo por tool, en milisegundos: el único lugar donde viven los umbrales.
// Se mide una llamada en frío (sin copia local) por el protocolo MCP contra las fixtures, así que
// lo que cuenta es el trabajo propio: parsers de HTML, lectores de PDF y armado de la respuesta.
//
// El margen es amplio a propósito. En una notebook de 2026 las de HTML tardan 1 a 10 ms y las que
// abren un PDF 30 a 120 ms; el presupuesto es unas 40 a 50 veces eso para que un runner lento de GitHub
// no lo haga fallar. No busca detectar un 20 % más lento: busca frenar una regresión de otro orden
// (un parser que se vuelve cuadrático, un PDF que se lee dos veces, una espera olvidada).
// Si una tool lo supera con razón (hace más cosas), se sube acá, en el mismo PR, y se dice por qué.
const HTML = 500;
const PDF = 5000;

export const PRESUPUESTOS: Record<string, { args: Record<string, unknown>; ms: number }> = {
  webcampus_terms: { args: {}, ms: HTML },
  webcampus_current_courses: { args: {}, ms: HTML },
  webcampus_attendance: { args: { idAula: '900001' }, ms: HTML },
  webcampus_course_calendar: { args: {}, ms: HTML },
  webcampus_teachers: { args: { idAula: '900001' }, ms: HTML },
  webcampus_consultation_classes: { args: {}, ms: HTML },
  webcampus_transcript: { args: { detail: true }, ms: HTML },
  uade_eligible_subjects: { args: {}, ms: HTML },
  webcampus_course_program: { args: { subject: '3.1.024' }, ms: PDF },
  uade_plan_next_term: { args: {}, ms: HTML },
  uade_enrollment_windows: { args: {}, ms: HTML },
  uade_enrollment_schedule: { args: {}, ms: HTML },
  uade_enrollment_guide: { args: {}, ms: HTML },
  webcampus_class_offering: { args: {}, ms: HTML },
  webcampus_account_balance: { args: { allPayments: true }, ms: HTML },
  webcampus_news: { args: {}, ms: HTML },
  webcampus_section: { args: { section: 'becas' }, ms: PDF },
  uade_academic_calendar: { args: {}, ms: PDF },
  email_compose_draft: { args: { to: ['docente@uade.edu.ar'], subject: 'Consulta', body: 'Hola', open: false }, ms: HTML },
  uade_refresh: { args: {}, ms: HTML },
};

// Tools sin presupuesto, con el motivo. Una tool nueva tiene que quedar en una de las dos listas.
export const SIN_MEDIR: Record<string, string> = {
  uade_login: 'abre una ventana de inicio de sesión',
  uade_open_enrollment_site: 'abre una ventana del navegador',
  pia_add_to_cart: 'maneja una ventana del navegador y un diálogo de confirmación',
  pia_class_search: 'necesita una ventana de inscripción abierta con link firmado a PIA',
  pia_prepare_enrollment: 'ídem pia_class_search',
  teams_channel_news: 'usa el navegador propio contra Teams',
  webcampus_course_materials: 'lee SharePoint, que no tiene fixtures',
  webcampus_save_material: 'escribe en Downloads/uade-mcp',
  webcampus_save_folder: 'escribe en Downloads/uade-mcp',
  webcampus_save_reminders: 'escribe en Downloads/uade-mcp',
  planuade_import_transcript: 'el plan de las fixtures es inventado y no está en el mapa de Plan UADE',
  webcampus_exam_schedule: 'necesita un Excel de exámenes previos, que no está en las fixtures',
  webcampus_schedule_planner: 'necesita la programación de varias materias; el planificador se mide en sus tests unitarios',
  uade_tuition: 'lee el PDF de aranceles desde SharePoint, que no tiene fixtures',
};
