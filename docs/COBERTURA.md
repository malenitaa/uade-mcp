# Cobertura de WebCampus e Inscripciones

Qué parte de UADE cubre el MCP, sección por sección. Se arma a partir del menú real de WebCampus
(relevado el 18/10/2026) y se verifica con `uade-mcp doctor`, que prueba cada fila marcada ✅ contra
una cuenta real sin mostrar datos personales.

Leyenda: ✅ cubierto · 🟡 parcial · ⏳ pendiente · ⛔ fuera de alcance a propósito · ↗ sitio externo (no aplica)

## Rol alumno

### Mi cursada

| Sección | Estado | Tool |
|---|---|---|
| Mis Cursos (materias del período, horario, aula, notas, fecha de final) | ✅ | `webcampus_current_courses` |
| Asistencia por materia | ✅ | `webcampus_attendance` |
| Mi Semana por materia (parciales, recuperatorio, final) | ✅ | `webcampus_course_calendar` |
| Mi Semana general (`Misemanasel.aspx`) | ⛔ | Falla del lado de UADE; se usa la de cada materia |
| Integrantes: equipo docente | ✅ | `webcampus_teachers` (nunca compañeros) |
| Novedades de cada curso | ⏳ | |
| Novedades y agenda generales | 🟡 | Solo se usa la de exámenes previos |
| Clases de consulta (`MenuItemId=333`) | ⏳ | |
| Encuestas | ⛔ | Escritura |

### Académico

| Sección | Estado | Tool |
|---|---|---|
| Historial académico y promedio | ✅ | `webcampus_transcript` |
| Correlativas / Planes de estudio | 🟡 | El historial trae el plan completo; falta el detalle de correlativas |
| Asignaturas previas | 🟡 | Está dentro del historial |
| Exámenes previos (Excel de novedades) | ✅ | `webcampus_exam_schedule` |
| Calendario académico (PDFs por sede y cuatrimestre) | ✅ | `uade_academic_calendar` |
| Cronogramas de inscripción (PDFs) | ✅ | `uade_academic_calendar` (topic inscripciones) |
| Materias Regulares Intensivas (MRI) | ✅ | `webcampus_section` |
| Carreras – Materias | ✅ | `webcampus_section` |
| Información de Materias (programas) | ⏳ | Necesita elegir carrera y materia con filtros |
| Materias optativas, Minors, Mención de honor | ✅ | `webcampus_section` (PDFs) |
| Normativa académica, Guía institucional, Lineamientos de IA | ✅ | `webcampus_section` |
| Intercambio estudiantil | ✅ | `webcampus_section` |
| Simulación de equivalencias | ⛔ | Formulario interactivo |
| Sistema de Admisión (SIA/ENI/ENE) | ⏳ | Poco contenido para alumnos de grado |
| Lista de interesados en abrir una materia | ⛔ | Escritura |

### Inscripciones (inscripciones.uade.edu.ar)

| Sección | Estado | Tool |
|---|---|---|
| Ventanas de inscripción con fechas | ✅ | `uade_enrollment_windows` |
| Programación / disponibilidad de clases | ✅ | `webcampus_class_offering` |
| Cronograma (imagen) | ⛔ | Es una imagen; las mismas fechas salen de los PDFs de cronogramas |
| Alta de inscripción en PIA | ⏳ | Con permiso propio y confirmación; mapear cuando abra una inscripción |
| Bajas y cambios | ⛔ | Decisión de producto |

### Administrativo

| Sección | Estado | Tool |
|---|---|---|
| Cuenta corriente | ✅ | `webcampus_account_balance` |
| Aranceles | ✅ | `webcampus_section` |
| Mis comprobantes | ✅ | `webcampus_section` |
| Marcaciones (ingresos al edificio) | ✅ | `webcampus_section` |
| Becas, Ayuda al estudiante, Deportes, Housing | ✅ | `webcampus_section` |
| Códigos de conducta y vestimenta, Compromiso UADE, Protocolo | ✅ | `webcampus_section` |
| Números ante emergencias | 🟡 | El PDF es una imagen escaneada, sin texto |
| Certificado de alumno regular | ⏳ | Evaluar: puede generar un documento |
| Pagos, débito automático, datos personales, trámites, documentación | ⛔ | Lista negra |
| Buscador de personas | ⛔ | Datos de terceros |
| Reservas de turnos (Media Labs, láser, fotografía) | ⛔ | Escritura |
| Mail UADE, Biblioteca, Videoclases, Parking, UADE Hub, CV | ↗ | Sitios externos |

### Microsoft 365

| Sección | Estado | Tool |
|---|---|---|
| Borradores de mail (Outlook web) | ✅ | `email_compose_draft` (no envía) |
| Leer mail, tareas de Teams | ⏳ | Depende de que UADE permita autorizar una app de Microsoft |

## Rol docente

⏳ **Sin relevar.** Hace falta una sesión con una cuenta docente real (que inicie sesión la persona
docente, nunca con credenciales prestadas). Hay señales de vistas por rol en WebCampus
(`VistaAlumno=true`, `EsAlumno=1`, botón "Director de Carrera"). Plan: primero solo lectura (cursos,
alumnos inscriptos, asistencia y notas cargadas); la carga de notas y asistencia, recién después,
con permiso propio y confirmación por cada acción.

## Cómo se mantiene

- Cada parser exige un elemento de la página que siempre está: si UADE cambia el HTML, el MCP
  responde "UADE cambió la página X" en vez de devolver datos vacíos (`test/guards.test.ts`).
- `uade-mcp doctor` prueba todo lo marcado ✅ contra una cuenta real y muestra solo conteos.
- Los fixtures de `test/fixtures/` son sintéticos: reproducen la estructura relevada con datos inventados.
