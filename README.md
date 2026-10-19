# UADE-MCP

MCP no oficial para que tu agente (Claude, ChatGPT o cualquier cliente MCP) lea tu **WebCampus**,
busque e inscriba en **PIA** y, más adelante, maneje **Teams** y el **mail** de UADE. También le
pasa tus materias aprobadas a [Plan UADE](https://planuade.ar).

Proyecto hecho por estudiantes, sin afiliación con la universidad. Página: [planuade.ar/mcp](https://planuade.ar/mcp).

> **Estado: v0, en construcción.** Funciona la lectura de WebCampus: períodos, materias del cuatrimestre
> (horario, sede, notas, fecha de final), asistencia, historial académico y cuenta corriente.
> También exámenes previos, docentes, ventanas de inscripción y oferta de clases.
> Inscribirse en PIA, Teams y mail vienen después.

## Uso

```bash
npm install && npm run build
node dist/index.js login      # se abre el navegador; iniciás sesión vos con tu cuenta de UADE
node dist/index.js estado     # sesión y permisos
node dist/index.js doctor     # prueba todo contra tu cuenta, sin mostrar datos personales
node dist/index.js login-teams  # (opcional) iniciás sesión en Teams para leer novedades de los canales
```

Para sumarlo a Claude Code (lo corrés vos; el MCP nunca toca la configuración de tu cliente):

```bash
claude mcp add uade -- node /ruta/a/uade-mcp/dist/index.js
```

| Tool | Qué devuelve |
|---|---|
| `webcampus_terms` | Tus cuatrimestres |
| `webcampus_current_courses` | Materias con día, horario, aula y sede, notas, fecha de final, links a Teams y apuntes |
| `webcampus_attendance` | Presentes, inasistencias y detalle por clase |
| `webcampus_transcript` | Todas las materias del plan con situación, nota y fecha, y el promedio |
| `webcampus_account_balance` | Deuda, próximos vencimientos y pagos (solo lectura: no paga) |
| `webcampus_course_calendar` | **Tus** fechas de parciales, recuperatorio y final de cada materia (de su planificación), con día, hora y aula |
| `uade_academic_calendar` | Calendario académico y cronogramas oficiales (PDFs de UADE, encontrados desde el menú de WebCampus): semanas de parciales por turno y sede, feriados, inscripciones |
| `webcampus_exam_schedule` | Fecha, hora, sede, clase y docentes de los finales (por defecto, de tus materias pendientes) |
| `webcampus_teachers` | Nombre y mail del equipo docente de una materia (no datos de compañeros) |
| `uade_enrollment_windows` | Ventanas de inscripción con apertura, cierre y si están abiertas |
| `webcampus_class_offering` | Clases programadas de cada materia: sede, turno, días, horario, fechas |
| `webcampus_schedule_planner` | Planificador de cursada: hasta 6 materias, combina una clase por materia sin solapamientos (filtros por turno, días y sede), ordenadas por menos días, menos huecos y menos sedes. Si no hay combinación, dice qué materias chocan |
| `webcampus_course_materials` | Lista y lee los apuntes que el docente comparte en Teams ("Materiales de clase": Casos, Material Teórico…), por la API de SharePoint. Lee PDF, Word (.docx y .doc), Excel (.xlsx y .xls) y PowerPoint, o los baja a Descargas |
| `pia_class_search` | Busca clases en PIA para una ventana abierta: sede, turno, días, horario, fechas, vacantes, régimen y las condiciones que PIA hace aceptar (no agrega nada al carrito). En verificación: PIA responde 401 al link fuera del navegador |
| `pia_prepare_enrollment` | Solo lectura: arma el resumen exacto de un alta (clase, sede, horario, fechas, cierre de ventana, cargo, cupo, no reversible) y un borrador de 5 minutos. No inscribe |
| `pia_confirm_enrollment` | Escritura: exige el permiso `pia.inscribir` (lo prendés vos en la terminal) y tu confirmación en un diálogo que el agente no puede contestar. **El envío real a PIA todavía no está conectado** (falla cerrado, nunca simula): hoy el alta se hace en inscripciones.uade.edu.ar |
| `teams_channel_news` | Novedades del canal General de una materia en Teams (lo último que posteó el docente). Experimental: usa un navegador propio; se activa con `login-teams` |
| `webcampus_news` | Lo que UADE comunica en el home de WebCampus: banners (parking, aulas silenciosas, campañas…), novedades con sus adjuntos y agenda; lee los documentos enlazados (PDF, SharePoint, adjuntos) |
| `uade_login` | Renueva la sesión sola (perfil de navegador que recuerda la sesión de Microsoft) o abre la ventana para iniciar sesión; también como prompt `/uade:login`. Nunca ve la contraseña |
| `uade_tuition` | Aranceles oficiales por carrera y turno (matrícula cuatrimestral, cuota mensual de referencia por 5 materias, cuota por materia, derecho de admisión, vigencia), del PDF que enlaza WebCampus; sin carrera, la propia |
| `webcampus_section` | Cualquier sección informativa del menú (aranceles, MRI, normativa, guía, becas, optativas, minors, comprobantes, marcaciones, códigos…), con búsqueda dentro del texto |
| `email_compose_draft` | Abre en Outlook web un mail ya escrito (por ejemplo, a tu docente) para que lo revises y lo mandes vos. **No envía nada** y solo acepta direcciones @uade.edu.ar |
| `planuade_import_transcript` | Abre [Plan UADE](https://planuade.ar) en tu navegador con tus aprobadas, finales pendientes y cursadas; confirmás ahí |

Los nombres y descripciones de las tools están en inglés (así los entienden mejor todos los agentes),
pero el servidor le indica al agente que **te responda en castellano rioplatense, con fechas dd/mm/aaaa y
hora de 24 h**. Todo se lee en vivo desde UADE: no hay fechas cargadas a mano, así que se actualiza solo
cada cuatrimestre.

## Cómo trata tus datos

- **Corre en tu compu**, por stdio. No hay ningún servidor nuestro en el medio.
- **Sin telemetría.** Solo habla con los dominios de UADE y de Microsoft. Cualquier otro host se bloquea en el código.
- **Nunca ve tu contraseña.** El login es con Microsoft en un navegador; solo se guarda la cookie de sesión, en el llavero.
- **Lectura por defecto.** Las escrituras (inscribirte, entregar, mandar mails) vienen apagadas. Las prendés
  vos desde la terminal y cada una te pide confirmación en un diálogo que el agente no puede contestar solo.
- **Hay cosas que no hace nunca:** pagar, darse de baja, desvincularse de materias, tocar tus datos personales.

El detalle completo está en [docs/DISENO.md](docs/DISENO.md), [docs/COBERTURA.md](docs/COBERTURA.md) y [SECURITY.md](SECURITY.md).

## Desarrollo

```bash
npm install
npm test
npm run build
```

## Licencia

[MIT](LICENSE).
