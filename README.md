# uade-mcp

Servidor [MCP](https://modelcontextprotocol.io) **no oficial** para alumnos de UADE: le da a tu agente de
IA (Claude, ChatGPT o cualquier cliente MCP) acceso de **lectura** a tu WebCampus, a las inscripciones,
a los apuntes de tus materias en Teams/SharePoint y a la información oficial que publica la universidad.

Corre en tu compu, sin servidores intermedios ni telemetría, y nunca ve tu contraseña.

> Proyecto de estudiantes, sin afiliación con UADE. **Beta (v0.1):** probado en macOS con una cuenta de grado; Windows y Linux, en prueba.

## Qué podés preguntarle

- "¿Qué materias puedo cursar el próximo cuatrimestre y qué finales puedo rendir?"
- "Armame la semana con estas 5 materias, solo de noche y sin huecos."
- "¿Qué día me toca inscribirme si curso de noche?" (lee el cronograma de UADE y cuenta tus aprobadas)
- "¿Por qué me dice que las reglas de validación impiden continuar la inscripción?"
- "¿Cuándo es el final de Gestión de Personas y cuánto sale el derecho a examen?"
- "¿Cuánto debo? ¿Cuándo vence la próxima cuota?"
- "¿Cuánto sale la cuota de mi carrera a la mañana y a la noche?"
- "Leeme el último apunte que subió el docente de Aplicaciones Interactivas."
- "¿Qué hay de nuevo en UADE? ¿Dónde reservo el estacionamiento?"
- "Armame un mail para mi docente pidiendo revisión del parcial." (queda en borrador, lo mandás vos)

## Requisitos

- Node.js 20 o más nuevo.
- Chrome, Edge o Brave (para la ventana donde iniciás sesión con tu cuenta de UADE). Si no tenés ninguno
  (solo Safari), el MCP te ofrece bajar un Chromium propio (~190 MB) que queda en `~/.uade-mcp/browsers`
  y no toca nada más; lo borrás con `uade-mcp borrar-navegador`.
- macOS, Windows o Linux (probado en macOS).

## Instalación

No hace falta clonar nada: `npx` baja el paquete y lo corre.

```bash
npx -y uade-mcp login     # se abre una ventana: iniciás sesión vos con tu cuenta de UADE
npx -y uade-mcp doctor    # prueba todo contra tu cuenta sin mostrar datos personales
```

Sumarlo a Claude Code (el MCP nunca toca la configuración de tu cliente; lo hacés vos):

```bash
claude mcp add uade -- npx -y uade-mcp
```

En cualquier otro cliente MCP: comando `npx`, argumentos `-y uade-mcp`, transporte stdio. Si preferís
tenerlo instalado: `npm i -g uade-mcp` y después `uade-mcp login`.

Desde el código (para desarrollar): `git clone`, `npm install`, `npm run build` y `node dist/index.js`.

### Sesión

Iniciás sesión una vez. WebCampus vence cada ~3 horas: el MCP la renueva solo, sin ventana, con la sesión
de Microsoft que recuerda su perfil de navegador. Si Microsoft pide la clave o el segundo factor, el agente
llama `uade_login` (o escribís `/uade:login`) y se abre la ventana para que la completes vos.

### Comandos de terminal

| Comando | Qué hace |
|---|---|
| `login` | Iniciar sesión (o renovarla sin ventana si se puede) |
| `estado` | Qué sesiones hay guardadas y qué permisos están activos |
| `doctor` | Prueba cada función contra tu cuenta y muestra solo cantidades |
| `permitir <permiso>` / `revocar <permiso>` | Prende o apaga un permiso (solo desde una terminal, escribiéndolo vos) |
| `logout` | Borra sesiones, la copia local cifrada, su clave y el perfil del navegador (el Chromium propio, si lo bajaste, queda) |
| `instalar-navegador` | Si no tenés Chrome, Edge ni Brave: baja un Chromium solo para el MCP (~190 MB, te pide confirmación) |
| `borrar-navegador` | Borra ese Chromium propio |

## Herramientas

Los nombres de las tools están en inglés (los agentes los entienden mejor); el servidor le pide al agente
que responda en castellano rioplatense, con fechas dd/mm/aaaa y horas de 24 h.

**Tu cursada**

| Tool | Qué devuelve |
|---|---|
| `webcampus_terms` | Tus cuatrimestres |
| `webcampus_current_courses` | Materias del cuatrimestre: día, horario, aula, sede, notas, fecha de final, links a Teams y apuntes |
| `webcampus_attendance` | Presentes, faltas y detalle por clase |
| `webcampus_course_calendar` | Fechas de parciales, recuperatorio y final de cada materia |
| `webcampus_teachers` | Nombre y mail del equipo docente (nunca datos de compañeros) |
| `webcampus_course_materials` | Lista y lee (PDF, Word, Excel, PowerPoint) los apuntes de "Materiales de clase"; no escribe nada |
| `webcampus_save_material` | Guarda una copia de un apunte en `Downloads/uade-mcp` (nunca pisa un archivo) |
| `webcampus_save_folder` | Baja una carpeta entera de "Materiales de clase" (una clase, por ejemplo) a `Downloads/uade-mcp/<carpeta>`; filtra por tipo (`pdf`, `pptx`) y opcionalmente entra a subcarpetas |
| `teams_channel_news` | Lo último que se publicó en el canal General de una materia (experimental) |
| `webcampus_consultation_classes` | Clases de consulta programadas para tu carrera: materias, días y horarios |

**Tu carrera**

| Tool | Qué devuelve |
|---|---|
| `webcampus_transcript` | Historial: aprobadas, finales pendientes (con vencimiento de la regularidad), recursadas y ausentes anteriores, cursando, sin cursar y promedio |
| `uade_eligible_subjects` | Qué podés cursar y qué finales podés rendir, cruzando historial y correlativas del plan |
| `webcampus_exam_schedule` | Cronograma oficial de exámenes previos (por defecto, de tus finales pendientes) |
| `planuade_import_transcript` | Abre [Plan UADE](https://planuade.ar) con tu historial para importarlo; confirmás ahí |

**Inscripciones**

| Tool | Qué devuelve |
|---|---|
| `uade_plan_next_term` | Todo el armado en un pedido: qué podés cursar (y qué se habilita si aprobás lo que cursás), qué se dicta, las mejores semanas sin superposiciones y, si querés, la vista en [planuade.ar/misemana](https://planuade.ar/misemana) (los datos van en el link, no al servidor) o un archivo local con calendario `.ics`. Esa página también se usa sin MCP, pegando la Programación de Clases |
| `uade_enrollment_windows` | Ventanas de inscripción (materias, previos, bajas) con apertura, cierre y si están abiertas |
| `uade_enrollment_schedule` | Qué día te toca inscribirte: el cronograma oficial (la imagen por turno y cantidad de aprobadas, que el agente lee) junto con tus aprobadas y tu turno |
| `uade_enrollment_guide` | Avisos, tutoriales y preguntas frecuentes oficiales del sitio de inscripciones (packs, optativas, MRI, "adeuda correlativas", reglas de validación) |
| `webcampus_class_offering` | Clases de cada materia el próximo cuatrimestre: sede, turno, días, horario, fechas |
| `webcampus_schedule_planner` | Combina hasta 6 materias sin solapamientos, con filtros, ordenadas por menos días y huecos |
| `pia_class_search` | Clases en PIA con vacantes y condiciones (en verificación: PIA rechaza el acceso fuera del navegador) |
| `pia_prepare_enrollment` | Resumen exacto de una inscripción a materia o a previo: qué, cuándo, cuánto y si tiene baja |
| `uade_open_enrollment_site` | Abre Inscripciones con tu sesión iniciada; la inscripción y el Finalizar los hacés vos |

**Plata y trámites**

| Tool | Qué devuelve |
|---|---|
| `webcampus_account_balance` | Deuda, próximos vencimientos y pagos (no paga) |
| `uade_tuition` | Aranceles oficiales por carrera y turno, del PDF vigente |

**Información de UADE**

| Tool | Qué devuelve |
|---|---|
| `webcampus_news` | Banners, novedades, la agenda completa de eventos (charlas, talleres, con detalle) y lo que enlazan |
| `webcampus_section` | Secciones informativas: normativa, guía del alumno, Wi-Fi, becas, MRI, optativas, admisión (SIA/ENI), códigos… Los PDFs escaneados vuelven como imagen |
| `uade_academic_calendar` | Calendario académico y cronogramas oficiales |

**Utilidades**

| Tool | Qué hace |
|---|---|
| `email_compose_draft` | Abre en Outlook web un mail ya escrito a una dirección @uade.edu.ar. No envía |
| `uade_refresh` | Borra la copia local para releer de UADE |
| `uade_login` | Renueva la sesión o abre la ventana para iniciarla |

## Si UADE cambia una página

El MCP no tiene datos cargados a mano: lee en vivo la programación, las ventanas, el cronograma (es una
imagen: se la pasa al agente para que la lea), las novedades, los PDFs, los aranceles y tu historial, así
que el **contenido se actualiza solo**. Lo que puede romperse es la
**estructura**: si UADE rediseña una página, el parser deja de entenderla. En ese caso:

- La tool no inventa: avisa que UADE cambió la página y devuelve igual su **texto plano** ("modo degradado"),
  marcado como sin estructura, para que el agente pueda responder mientras se actualiza el parser.
- `doctor` lo detecta. Para enterarte antes que los alumnos, programalo:

```bash
npx -y uade-mcp doctor --json
```

Imprime una línea JSON por capacidad, sin datos personales, renueva la sesión sola si venció y termina con
código 1 si algo se rompió. En macOS/Linux, por ejemplo cada mañana con `crontab -e`:

```
0 9 * * * npx -y uade-mcp doctor --json >> "$HOME/uade-mcp-doctor.log" 2>&1
```

En Windows, el Programador de tareas con el mismo comando. Si el log muestra `"estado":"error"`, hay que
actualizar el MCP (`npx` usa siempre la última versión publicada; con `npm i -g`, `npm update -g uade-mcp`) o, si es nuevo, abrir un issue.

## Privacidad y seguridad

- **Local.** Corre en tu compu por stdio; no hay ningún servidor del proyecto en el medio.
- **Sin telemetría.** Solo habla con dominios de UADE y Microsoft; cualquier otro host está bloqueado en el código (salvo el reporte de errores, si lo activás vos, y la descarga del Chromium propio desde los servidores de Playwright, solo si no tenés Chrome, Edge ni Brave y la confirmás).
- **Sin contraseñas.** Iniciás sesión vos, en la página de Microsoft. Se guardan cookies de sesión en el
  llavero del sistema y la sesión de Microsoft en un perfil de navegador propio (`~/.uade-mcp/browser-profile`).
- **Copia local cifrada** (AES-256-GCM, clave en el llavero) para no pedir lo mismo dos veces. Cada respuesta dice de cuándo es.
- **Solo lectura.** No inscribe, no paga, no da de baja, no manda mails, no toca datos personales.
- **Reportes de errores, apagados por defecto.** Si activás `reportes.errores`, cuando UADE cambia una página
  o una tool falla el MCP le avisa al proyecto (`planuade.ar/api/mcp-error`, el único destino fuera de UADE y
  Microsoft) con la versión, el nombre de la tool, el tipo de error y qué página. Nunca tu pregunta, tus datos
  ni el contenido; a lo sumo un aviso por error por día. Lo apagás con `revocar reportes.errores`.
- **Tus datos y nada más.** Nunca devuelve datos de otros alumnos.

Detalle en [SECURITY.md](SECURITY.md) y en la [auditoría](docs/AUDITORIA.md).

## Estructura

```
src/
  index.ts        servidor MCP (sin argumentos) o CLI (con argumentos)
  tools/          una tool por archivo temático: qué recibe, qué devuelve
  sources/        cómo se lee cada sitio (WebCampus, Inscripciones, PIA, SharePoint, Teams…)
  net/            política de red (allowlist y bloqueos), cliente HTTP, sesiones
  auth/           login, permisos, llavero
  cache/          copia local cifrada
  cli/            comandos de terminal y doctor
test/             tests con datos sintéticos (fixtures anonimizados)
docs/             diseño, cobertura y auditoría
scripts/          revisión pre-commit y utilidades
experimentos/     tu espacio para probar código aparte del MCP (ver su README)
```

## Desarrollo

```bash
npm install
npm test           # tests
npm run revisar    # lo mismo que corre antes de cada commit: tipos, tests, npm audit y secretos
npm run build
```

Activá el hook una vez: `git config core.hooksPath .githooks`.

Documentación: [diseño](docs/DISENO.md) · [qué cubre](docs/COBERTURA.md) · [auditoría](docs/AUDITORIA.md).

## Licencia

[MIT](LICENSE).
