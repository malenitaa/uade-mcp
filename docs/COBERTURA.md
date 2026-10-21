# Cobertura de WebCampus e Inscripciones

Qué parte de UADE cubre el MCP, sección por sección. Se arma a partir del menú real de WebCampus
(relevado el 18/10/2026; recorrido completo otra vez el 21/10/2026, incluido el sitio de inscripciones
pestaña por pestaña) y se verifica con `uade-mcp doctor`, que prueba cada fila marcada ✅ contra
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
| Novedades de cada curso (WebCampus, `NovedadHist.aspx?IdAula=`) | ⏳ | Relevada: en todas las aulas vistas dice "Sin Novedades cargadas", así que no hay un ejemplo con contenido del que escribir el parser. Lo que el docente publica llega por Teams (`teams_channel_news`) |
| Novedades y agenda generales | ✅ | `webcampus_news`: novedades (con adjuntos), agenda completa (`allEvents`) y detalle de cada evento (`eventId`: fecha, hora, sede, texto). Inscribirse al evento queda fuera (escritura) |
| Clases de consulta (`MenuItemId=333`) | ✅ | `webcampus_consultation_classes`: carrera → materias con clases de consulta → grilla. Relevado con la grilla vacía ("Sin Resultados"): las filas se devuelven con los encabezados que tenga |
| Mis actividades (`AgendaEventos/MisActividades.aspx`) | ⛔ | Vacía en las cuentas vistas; son las inscripciones a eventos (escritura) |
| Encuestas | ⛔ | Escritura |
| Consultas (`Atencion.aspx`) | ⛔ | Formulario que manda un mail a soporte: escritura |

### Académico

| Sección | Estado | Tool |
|---|---|---|
| Historial académico y promedio | ✅ | `webcampus_transcript` |
| Correlativas / Planes de estudio | ✅ | `uade_eligible_subjects` lee la página de correlativas del plan; el historial trae el plan completo |
| Asignaturas previas | ✅ | `webcampus_transcript`: por materia, cada acta (cursadas, exámenes, recursa, ausente, final desaprobado) y la "Fecha De Vencimiento" oficial de la regularidad de los finales pendientes (`uade_eligible_subjects` la usa en vez de calcular dos años) |
| Exámenes previos (Excel de novedades) | ✅ | `webcampus_exam_schedule` |
| Calendario académico (PDFs por sede y cuatrimestre) | ✅ | `uade_academic_calendar` |
| Cronogramas de inscripción (PDFs) | ✅ | `uade_academic_calendar` (topic inscripciones) |
| Materias Regulares Intensivas (MRI) | ✅ | `webcampus_section` |
| Carreras – Materias | ✅ | `webcampus_section` |
| Información de Materias (programas, `MenuItemId=98`) | ⏳ | Combos en cascada de Telerik (facultad → carrera → materia) y el link directo `HomeMateria.aspx?idMateria=` responde "No fue posible procesar su solicitud" fuera de ese flujo. Queda para cuando haga falta: el programa de una materia se pregunta poco |
| Materias optativas, Minors, Mención de honor | ✅ | `webcampus_section` (PDFs) |
| Normativa académica, Guía institucional, Lineamientos de IA | ✅ | `webcampus_section` |
| Intercambio estudiantil | ✅ | `webcampus_section` |
| Simulación de equivalencias | ⛔ | Formulario interactivo |
| Sistema de Admisión (SIA/ENI/ENE) | ✅ | `webcampus_section admision_sia`: nivel de inglés (ENI), avisos de SIA/ENE y la guía de ingreso (PDF) |
| Lista de interesados en abrir una materia | ⛔ | Escritura |

### Inscripciones (inscripciones.uade.edu.ar)

| Sección | Estado | Tool |
|---|---|---|
| Ventanas de inscripción con fechas | ✅ | `uade_enrollment_windows` |
| Novedades, banners y agenda del home | ✅ | `webcampus_news` (+ lectura de lo enlazado) |
| Avisar al proyecto cuando algo se rompe | ✅ opt-in | permiso `reportes.errores`; endpoint `api/mcp-error` en planuade.ar que manda el mail |
| UADE cambia una página | 🟡 | modo degradado: la tool devuelve el texto plano marcado como sin estructura; `doctor --json` programable para detectarlo |
| Sesión vencida (cada ~3 h) | ✅ | renovación automática sin ventana desde el perfil del navegador; `uade_login` / `/uade:login` si Microsoft pide algo |
| Aranceles por carrera y turno | ✅ | `uade_tuition` (tabla parseada del PDF oficial; `webcampus_section aranceles_pdf` para el texto) |
| Programación / disponibilidad de clases | ✅ | `webcampus_class_offering` |
| Armar la semana sin solapamientos | ✅ | `webcampus_schedule_planner` (combinaciones de hasta 6 materias, filtros, conflictos). Sin docentes: la programación no los publica |
| Cronograma de inscripción por turno y cantidad de aprobadas (imagen) | ✅ | `uade_enrollment_schedule`: baja la imagen con la sesión y la devuelve como contenido de imagen del MCP (el modelo la lee con visión), con el link, la cantidad de aprobadas de la persona (historial), su turno actual (inferido de los horarios) y las ventanas abiertas; `file=true` la guarda en Descargas para clientes sin visión. OCR local descartado: `tesseract.js` leyó mal los números grandes de la grilla ("12"→"1", "29"→"9", "11"→"Tl") y además baja sus datos de idioma de un host externo. Nada hardcodeado: UADE la cambia cada cuatrimestre y los PDFs de cronogramas (`uade_academic_calendar`) no traen estas fechas |
| Importante, Instructivos y Preguntas Frecuentes del sitio de inscripciones | ✅ | `uade_enrollment_guide`: avisos del momento, links a los tutoriales y las preguntas frecuentes oficiales (cuándo inscribirse, "adeuda correlativas", "las reglas de validación impiden continuar", packs, optativas, MRI, inglés/ENI); `query` filtra |
| Ayuda (`help.uade.edu.ar`) | ↗ | Aplicación aparte (Angular) cuya API (`helpapi.uade.edu.ar`) responde 401 sin una sesión propia, con Google Analytics y Hotjar. Se devuelve el link |
| Disponibilidad de Clases (`MenuItemId=148`) | ↗ | Solo dice que está en el sitio de inscripciones (la Programación de Clases, `webcampus_class_offering`) |
| Buscar clases en PIA (vacantes, condiciones) | 🟡 | `pia_class_search`: mapeado a partir de un registro de red de la autora (búsqueda, materias, clases, carrito, pantalla de finalizar con el resumen arancelario). Parsers y cliente con tests sobre fixtures; en vivo PIA responde 401 (HTTP Basic, realm uade.edu.ar) al link firmado: falta identificar qué credencial manda el navegador |
| Armar el cuatrimestre y ver la semana | ✅ | `uade_plan_next_term`: elegibilidad + oferta + combinaciones; `view` abre planuade.ar/misemana (datos en el fragmento), `file` deja HTML + `.ics` en `~/Downloads/uade-mcp`. Avisa si la programación publicada es la del cuatrimestre en curso. La misma página arma la semana sin MCP (pegando la Programación de Clases), con el mismo planificador portado a JS |
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
| Becas, Ayuda al estudiante (con los PDFs de talleres de AYUES), Deportes, Housing | ✅ | `webcampus_section` (sigue los PDFs públicos de `dre.uade.edu.ar` que enlaza la página) |
| Wi-Fi (página y guías por sistema operativo) | ✅ | `webcampus_section` (wifi) |
| Códigos de conducta y vestimenta, Compromiso UADE, Protocolo | ✅ | `webcampus_section` |
| Números ante emergencias | 🟡 | El PDF no tiene texto ni fotos: los números están dibujados como trazos (vectores, sin fuentes), y leerlo pediría renderizar la página con un motor gráfico. Se devuelve el link. Los PDFs escaneados de verdad (una foto por página) sí se leen: `webcampus_section` y `webcampus_news link=` los devuelven como imagen |
| Certificado de alumno regular (`MenuItemId=128`) | ⛔ | Genera el PDF con un postback (acción con efecto, no lectura). El agente explica cómo sacarlo: Administrativo > Certificado de Alumno Regular, elegir la carrera, "Imprimir certificado"; solo con al menos una materia en curso |
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
- Lo que UADE publica como imagen (cronograma de inscripción, PDFs escaneados) se devuelve como
  contenido de imagen del MCP para que el modelo lo lea; no se transcribe con OCR ni se carga a mano.
- Los fixtures de `test/fixtures/` son sintéticos: reproducen la estructura relevada con datos inventados.
