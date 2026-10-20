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
| Apuntes y materiales de la materia (Teams → "Materiales de clase") | ✅ | `webcampus_course_materials` (API de SharePoint; lee PDF, Word .docx/.doc, Excel .xlsx/.xls, PPT) |
| Novedades del canal General de cada materia (Teams) | ✅ | `teams_channel_news` (experimental; navegador propio, `login-teams`) |
| Novedades de cada curso (WebCampus) | ⏳ | |
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
| Novedades, banners y agenda del home | ✅ | `webcampus_news` (+ lectura de lo enlazado) |
| Sesión vencida (cada ~3 h) | ✅ | renovación automática sin ventana desde el perfil del navegador; `uade_login` / `/uade:login` si Microsoft pide algo |
| Aranceles por carrera y turno | ✅ | `uade_tuition` (tabla parseada del PDF oficial; `webcampus_section aranceles_pdf` para el texto) |
| Programación / disponibilidad de clases | ✅ | `webcampus_class_offering` |
| Armar la semana sin solapamientos | ✅ | `webcampus_schedule_planner` (combinaciones de hasta 6 materias, filtros, conflictos). Sin docentes: la programación no los publica |
| Cronograma (imagen) | ⛔ | Es una imagen; las mismas fechas salen de los PDFs de cronogramas |
| Buscar clases en PIA (vacantes, condiciones) | 🟡 | `pia_class_search`: mapeado a partir de un registro de red de la autora (búsqueda, materias, clases, carrito, pantalla de finalizar con el resumen arancelario). Parsers y cliente con tests sobre fixtures; en vivo PIA responde 401 (HTTP Basic, realm uade.edu.ar) al link firmado: falta identificar qué credencial manda el navegador |
| Armar el cuatrimestre y ver la semana | ✅ | `uade_plan_next_term`: elegibilidad + oferta + combinaciones; vista HTML y `.ics` en `~/Downloads/uade-mcp`. Avisa si la programación publicada es la del cuatrimestre en curso |
| Qué puedo cursar / rendir | ✅ | `uade_eligible_subjects` (historial + correlativas de WebCampus) |
| Inscripción en PIA | 🟡 por diseño | `pia_prepare_enrollment` (resumen de materia o previo) + `uade_open_enrollment_site` (ventana con sesión). El MCP no recorre PIA ni envía inscripciones: la persona elige, agrega al carrito y aprieta Finalizar |
| Bajas y cambios | ⛔ | Decisión de producto |

### Administrativo

| Sección | Estado | Tool |
|---|---|---|
| Cuenta corriente | ✅ | `webcampus_account_balance` |
| Aranceles | ✅ | `webcampus_section` |
| Mis comprobantes | ✅ | `webcampus_section` |
| Marcaciones (ingresos al edificio) | ✅ | `webcampus_section` |
| Becas, Ayuda al estudiante, Deportes, Housing | ✅ | `webcampus_section` |
| Wi-Fi (página y guías por sistema operativo) | ✅ | `webcampus_section` (wifi) |
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
