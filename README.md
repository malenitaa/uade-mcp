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

El detalle completo está en [docs/DISENO.md](docs/DISENO.md) y [SECURITY.md](SECURITY.md).

## Desarrollo

```bash
npm install
npm test
npm run build
```

## Licencia

[MIT](LICENSE).
