# UADE-MCP — diseño (v0)

MCP no oficial para que un agente (Claude, etc.) lea WebCampus, PIA y, más adelante, Teams/mail,
y sincronice materias aprobadas con PlanUADE. Este documento no contiene datos personales:
solo la estructura relevada el 2026-10-18.

---

## 1. Principios (no negociables)

1. **Corre en tu compu, por stdio.** No hay servidor nuestro en el medio. Nadie más ve tus cookies, notas ni cuota.
2. **Cero telemetría.** Ni analytics, ni crash reporting, ni "update check". El único tráfico de red
   sale a los hosts de la allowlist (sección 4). Los logs son locales y se redactan.
3. **Solo lectura por defecto.** Las herramientas que escriben vienen apagadas y se activan con un flag
   explícito en la config (`"allowWrites": ["teams.entregar"]`, por ejemplo), nunca desde el chat.
4. **El agente no puede autoconfirmarse.** Toda escritura pide confirmación **al humano, fuera del modelo**
   (ver sección 3). Un "sí, hacelo" en el chat no alcanza.
5. **Hay cosas que nunca hace**, ni aunque se las pidas (lista negra, sección 5).
6. **El contenido externo es dato, no instrucciones.** Novedades, consignas, mails y archivos se devuelven
   marcados como no confiables y no pueden disparar escrituras.

---

## 2. Identidad y credenciales

**La cuenta Microsoft de UADE (Entra ID, `@uade.edu.ar`) es la identidad base de todo**: WebCampus,
Teams, inscripciones, mail y hasta el wifi. **Todos los sitios hacen login con Microsoft (OIDC)**,
incluido WebCampus: el botón "Entrar" de `Login.aspx` redirige al tenant de UADE (verificado el 2026-10-18).

**Consecuencia: el MCP nunca maneja tu contraseña.**

- `uade-mcp login` abre un navegador visible (Chrome, Edge, Brave o Chromium) con un **perfil temporal**.
  Vos iniciás sesión en la página de Microsoft, con MFA. Cuando aparece tu WebCampus, el MCP guarda
  solo las cookies de sesión de `www.webcampus.uade.edu.ar` (sin las de analytics) en el llavero y
  cierra el navegador. No queda ni tu sesión de Microsoft ni el historial.
- No usamos el `client_id` de UADE fuera del navegador, ni flujos OAuth "por atrás".
- Para Teams y el mail (Graph) va a hacer falta una app propia con MSAL, si el tenant lo permite (§12).

Como es **una sola identidad para todo**, si se filtra una sesión se compromete tu cuenta de UADE.
Por eso las cookies van al llavero y nunca a disco.

### Almacenamiento

| Qué | Dónde | Notas |
|---|---|---|
| Cookies de sesión de WebCampus (`ASP.NET_SessionId`, `sessionuade`, `WebCampusAADCookie`, `TS…`) | Llavero del sistema (`@napi-rs/keyring`) | Si el servidor las rota, se actualizan ahí mismo |
| Tokens de Microsoft (fase Teams/mail) | Llavero del sistema, con MSAL | |
| Contraseña | **Nunca.** | La escribís vos en Microsoft |
| Permisos | `~/.uade-mcp/config.json` (modo 600) | Es el único archivo que escribe el MCP |
| Caché de datos | Por ahora no hay | Si se suma: cifrada con una clave del llavero, y `uade-mcp purge` |

- El login es un **comando que corrés vos**, no una tool. Si la sesión vence, la tool devuelve
  "corré `uade-mcp login`" y no reintenta sola.
- Las cookies **solo se mandan al host al que pertenecen**, ni siquiera a Microsoft si WebCampus redirige ahí (`src/net/http.ts`, con test).
- No se exporta nada a otro host. Si algún día hay sync entre compus, va a ser opt-in y cifrado de punta a punta.

---

## 3. Modelo de permisos

**Problema que evitamos:** una autorización vaga ("dale, conectate, hacé lo que haga falta") termina
dándole al agente un permiso amplio, y el agente lo usa para algo que el usuario no esperaba (por
ejemplo, mandar mensajes con su cuenta).

**Diseño:**

1. **Permisos con nombre y alcance**, nunca genéricos. No existe "conectate". Existen permisos concretos:
   `webcampus.leer`, `pia.leer`, `teams.leer_tareas`, `teams.entregar`, `mail.leer`, `mail.enviar`.
2. **Se otorgan en la config, no en el chat.** Para habilitar `teams.entregar` editás
   `~/.uade-mcp/config.json` o corrés `uade-mcp permitir teams.entregar`. El CLI muestra:
   > Esto permite que el agente **suba archivos como entrega en tareas de Teams en tu nombre**.
   > Cada entrega igual te va a pedir confirmación. No permite enviar mensajes ni mails.
   > ¿Habilitar? Escribí `teams.entregar` para confirmar:

   Hay que tipear el nombre del permiso. Un "sí" no alcanza.
3. **Cada escritura se hace en dos pasos:**
   - `preparar_*` → devuelve un resumen legible ("Vas a entregar `tp2.pdf` (340 KB) en *Paradigmas, TP2*,
     vence el 20/10 23:59. Esto **no se puede deshacer** desde acá.") y un `id` de borrador.
   - `confirmar_*(id)` → el servidor le pide confirmación **al humano por MCP elicitation**
     (un diálogo que muestra el cliente). Eso no pasa por el modelo, así que el modelo no puede contestarse solo.
     Si el cliente no soporta elicitation, la escritura queda **deshabilitada**: no hay fallback.
   - El borrador vence a los 5 minutos y se invalida si cambia cualquier parámetro.
4. **Ninguna escritura se encadena a una lectura de contenido externo** en el mismo pedido sin confirmación
   (por ejemplo, una consigna que diga "entregá esto ya" no hace nada sola).
5. **Auditoría local:** `~/.uade-mcp/audit.log` registra cada escritura (qué, cuándo, resultado), sin contenido sensible.

---

## 4. Allowlist de red

```
www.webcampus.uade.edu.ar
inscripciones.uade.edu.ar
inscripcionespia.uade.edu.ar
login.microsoftonline.com            (solo auth)
dre.uade.edu.ar, www.dre.uade.edu.ar (PDFs públicos: calendario académico, cronogramas)
graph.microsoft.com                  (fase Teams/mail, si UADE lo permite)
teams.microsoft.com, teams.cloud.microsoft, *.office.net … (Teams web, dentro del navegador propio del MCP)
api.github.com                       (opcional)
(PlanUADE no: el MCP solo arma un link local, ver sección 8)
```

Cualquier otro host se rechaza en el cliente HTTP. Hablamos HTTP directo, sin navegador, así que **no
se ejecutan** Google Analytics, Application Insights ni **Hotjar**, que sí están embebidos en el sitio de
inscripciones (Hotjar graba sesiones).

---

## 5. Lista negra (nunca, sin excepción)

- Pagar, generar cupones de pago, alta/baja de débito automático (`MenuItemId=508`).
- **Desvincularse de materias o aulas** (`/Contenidos/ContenidoDesvincular.aspx`). Ojo: el link está en la misma pantalla de las materias.
- **Bajas** de inscripción y cambios de pack en PIA (`CambioAsignaturaPack`). Las bajas se hacen en
  inscripciones y quedan fuera del MCP por decisión de producto. Las **altas sí** se permiten (sección 7).
- Editar datos personales, cambiar o recuperar contraseña.
- Cerrar sesión de WebCampus (postback `lnkCerrarSesion`), para no romper tu sesión del navegador.
- "Enviar documentación escaneada", trámites web.
- Buscador de Personas: no se expone, porque son datos de terceros.

El cliente HTTP bloquea estas URLs por patrón, aunque haya un bug en otra parte del código.

---

## 6. Mapa relevado

### WebCampus (`www.webcampus.uade.edu.ar`): ASP.NET WebForms, sin API JSON. Todo se scrapea del HTML

| Dato | URL | Estructura |
|---|---|---|
| Notas del cuatrimestre | `/Home.aspx?Periodo={id}` (los períodos salen del menú "Mis Cursos") | Tablas por materia: Evaluación 1..4, Entrega final, Recup., Informe Cursada, Examen Final, Condición Final |
| Aulas del período | mismo HTML, `[id$=tbl_Aulas]` | Por aula: nombre, `MiAula.aspx?IdAula=`, link a Teams, SharePoint (apuntes), Asistencia, Integrantes, Mi Semana, Novedades |
| Asistencia | `/AsistenciaAlumnos.aspx?IdAula={id}` | "Resumen de clases" + "Referencias" |
| Planificación semanal | `/PlanificacionClases/MiSemana.aspx?IdAula={id}` | |
| Novedades del aula | `/Contenidos/NovedadHist.aspx?IdAula={id}&IdNov=0` | Contenido no confiable |
| Historial académico / aprobadas | `/HistorialAcademico/Plan_Acedemico.aspx` | Clases `asign_plan`, `activa`, `plan`, `carrera` |
| Correlativas | `.../Plan_Acedemico.aspx?VieneDe=Correlativa` | |
| Plan de estudios | `.../Plan_Acedemico.aspx?VieneDe=Plan` | |
| Cuenta corriente | `/Contenidos/CuentaCorrientes.aspx` | `TableDeudaVencida`, `TableProximosVenc`, `TablePagosRealizados` |
| Aranceles | `/Aranceles/ArancelesWC.aspx` | `tbl_Pago` |
| Comprobantes | `/contenidos/MisComprobantes.aspx` | `TableMisComprobantes` |
| Marcaciones (ingresos al edificio) | `/Contenidos/Marcaciones.aspx` | Filtro por rango de fechas (postback) |
| Novedades / agenda generales | `/MiContenido/Novedades.aspx`, `/MiContenido/Agenda.aspx?Id=` | |
| Fechas de exámenes | Novedades ("Exámenes previos…"), PDF Calendario académico (`MenuItemId=403`), PDF Cronogramas (`MenuItemId=428`) | Hay que parsear los PDFs |

### Inscripciones (`inscripciones.uade.edu.ar`): ASP.NET MVC, login con Microsoft Entra (tenant UADE)

| Endpoint | Tipo | Qué |
|---|---|---|
| `GET /Home/ValidarUsuario` | JSON `boolean` | Sesión válida |
| `GET /Home/ObtenerInscripciones` | HTML parcial | Ventanas de inscripción disponibles. Cada una es un link `data-linkid` a PIA con `param` cifrado y `data-tipolink` (`InscripcionAsignatura`, `CambioAsignaturaPack`) |
| `GET /Home/Logout` | | No se expone |

### PIA (`inscripcionespia.uade.edu.ar`)

- `InscripcionClaseBuscar.aspx?param=…`, `InscripcionInicio.aspx?param=…`
- Abrirlo directo hoy devuelve **401**. Puede ser porque la ventana de inscripción está cerrada o porque
  exige algo más (Referer, otra cookie). **Hay que volver a mirarlo cuando abra la próxima inscripción.**
- Alcance: **buscar asignaturas**, ver **docente** (si figura), **sede**, **horario**, cupos y tu carrito.
  **Inscripción**: el MCP no la hace. Prepara el resumen (materia o previo) y abre Inscripciones con la sesión iniciada; la persona recorre PIA y aprieta Finalizar. Nunca bajas ni cambios de pack.

### Teams / SharePoint / Mail: Microsoft 365, tenant UADE

- WebCampus ya da, por aula, el link al Team y a la carpeta de SharePoint de apuntes. Eso sirve para listar
  "dónde está cada cosa" sin Graph.
- Leer tareas, entregar y leer mail requiere Microsoft Graph (`EduAssignments.*`, `Mail.Read`, `Files.Read`).
  **Pendiente:** probar si el tenant deja que un alumno apruebe una app propia. Si no deja, se evalúa
  otra cosa (ver sección 12).

---

## 7. Herramientas

| Tool | Devuelve |
|---|---|
| `webcampus_terms` | Cuatrimestres disponibles |
| `webcampus_notas(periodo?)` | Notas por materia y evaluación, y condición final |
| `webcampus_aulas(periodo?)` | Aulas, con links a Teams y SharePoint |
| `webcampus_attendance(aula)` | Resumen de asistencia |
| `webcampus_semana(aula)` | Planificación |
| `webcampus_novedades(aula?)` | Novedades (marcadas como no confiables) |
| `webcampus_transcript` | Materias aprobadas, con nota y fecha |
| `webcampus_correlativas` | Qué te habilita cada materia |
| `webcampus_account_balance` | Deuda vencida, próximos vencimientos, pagos. **Sin pagar** |
| `webcampus_fechas_examen` | Lo que sale de novedades y PDFs |
| `uade_enrollment_windows` (✅) | Ventanas de inscripción con fechas (sitio de inscripciones, misma sesión de Microsoft) |
| `webcampus_class_offering` (✅) | Programación de Clases: sede, turno, días (celda gris), horario, fechas. El link con `IdUsuario` lo da el sitio de inscripciones |
| `webcampus_schedule_planner` (✅) | Puro sobre la oferta cacheada (`src/sources/planificador`): backtracking con poda, choque = mismo día + horario pisado + cursadas que coinciden en fechas; tope de 500.000 nodos explorados; puntaje = días×3 + horas de hueco + (sedes−1)×2 |
| `webcampus_exam_schedule` (✅) | Excel adjunto a la novedad "Exámenes Previos": fecha, hora, aula, clase, docentes |
| `webcampus_course_calendar` (✅) | Planificación de cada aula (`/PlanificacionClases/MiSemana.aspx?IdAula=`): parciales, recuperatorio y final con fecha (día/mes/año). El "Mi Semana" general del menú (`Misemanasel.aspx`) falla en UADE y no se usa |
| `uade_academic_calendar` (✅) | Menú 403/428 → `dre.uade.edu.ar/calendario.pdf` y `cronogramasUADE.pdf` → PDFs de detalle (2 niveles, máx. 20, caché 1 h). Algunos PDFs son solo imagen y no tienen texto |
| `email_compose_draft` (✅) | Borrador en Outlook web (deeplink de redacción) abierto en el navegador. No envía, no usa Graph, solo destinatarios @uade.edu.ar |
| `webcampus_teachers` (✅) | Equipo docente de un aula. **Nunca** datos de compañeros (mail, legajo) |
| `pia_buscar_asignaturas(texto?, sede?, turno?)` | Clases: docente, sede, horario, cupo |
| `pia_carrito` | Lo que tenés en el carrito o ya inscripto |
| `planuade_import_transcript` | Arma un link de PlanUADE con tus aprobadas, que **abrís y confirmás vos** (sección 8) |

**Escrituras (cada una con su permiso y confirmación por elicitation):**

| Tool | Permiso |
|---|---|
| `pia_prepare_enrollment` + `uade_open_enrollment_site` | `pia.leer` · resumen exacto (materia o previo, con elegibilidad por correlativas) y ventana visible con sesión hasta la lista de ventanas. Decisión: el MCP no automatiza PIA (ni el carrito ni Finalizar); se sacó `pia_confirm_enrollment` y el permiso `pia.inscribir` |

### PIA (inscripcionespia.uade.edu.ar), mapeado del registro de red

Flujo observado (WebForms + UpdatePanels; `src/sources/pia/parse.ts`):

1. Entrada: `data-linkid` de la ventana abierta en inscripciones (`InscripcionClaseBuscar.aspx?param=<firmado>`, lleva la sesión). PIA no tiene login propio (`sesionPorUrl`, cookies en memoria). El link nunca sale al modelo.
2. `btnSeleccionarMaterias` (postback completo) → tablas `gridViewMaterias` por año, con `chkSeleccionar` solo en las elegibles y el motivo en rojo en las otras.
3. `btnBuscar` (como campo, sin `__EVENTTARGET`; el navegador lo manda asincrónico) → por materia una `grillaInscripcion` con clase, sede, modalidad, turno, idioma, días (hidden `LU..SA`), horario, fechas, **vacantes**, régimen y, en los hidden, `ClaseId`, `HashConsistencia` (firma del servidor sobre la fila) y `OfertaAmpliadaDescripcion` (condiciones que hay que aceptar: la aceptación es solo del lado del cliente, `abrirDialogConfirmacionOfertaAmpliada`).
4. Alta: `btnCarritoAlta` de la fila → `btnConfirmarCarrito` (delta con `pageRedirect` a `InscripcionFinalizar.aspx?param=…`) → página con Pendiente Alta, **Resumen Arancelario** (importes y vencimientos reales), `chkTerminos`, `txtComentarios`, `btnFinalizar` / `btnVolver`. Quitar del carrito: `btnBorrar`. **`btnFinalizar` no está en el registro** y por eso el envío real sigue sin conectar.
5. Respuestas asincrónicas: formato delta de MS AJAX (`largo|tipo|id|contenido|`), `parseDelta`/`htmlDe`.

Pendiente: en vivo, PIA responde `401` con `WWW-Authenticate: Basic realm="uade.edu.ar"` al mismo link que en el navegador funciona; falta ver qué manda el navegador (cookie de dominio `.uade.edu.ar` o credencial Basic guardada).
| `teams_preparar_entrega` → `teams_confirmar_entrega` | `teams.entregar` (si Graph se puede usar) |
| `mail_preparar` → `mail_confirmar_envio` | `mail.enviar` (si Graph se puede usar) |

GitHub: usamos el MCP oficial de GitHub en vez de reimplementarlo.

---

## 8. PlanUADE: integración local-first

PlanUADE (`malenitaa/facultades`) guarda el progreso en `localStorage` (`uademap::state::<carrera>`),
y opcionalmente lo sincroniza en `/api/sync` usando el legajo. Los ids de materia son los mismos códigos
que usa WebCampus (`3.1.062`, …), así que el mapeo es directo.

**Diseño:** el MCP **no le habla a ningún servidor de PlanUADE**. Arma un link así:

```
https://planuade.ar/fain#importar=<base64url(JSON con un hash de integridad: detecta links cortados, NO es una firma)>
```

- Lo que va después del `#` **no viaja al servidor**: el navegador no lo manda. Vercel no lo ve y no
  aparece en ningún log.
- PlanUADE lo lee, muestra *"Se van a marcar como aprobadas estas 19 materias (con nota): … ¿Aplicar?"*,
  y recién cuando tocás aplicar lo escribe en tu `localStorage`. Si después querés sincronizar, eso
  sigue siendo decisión tuya.
- No se suma ninguna API pública nueva ni nada que autenticar. La superficie de ataque no crece.

> **Sobre `/api/sync`:** identifica solo por legajo, sin secreto, así que quien sepa un legajo puede
> leer y pisar ese progreso. PlanUADE lo **acepta por diseño** (ver su `SECURITY.md`: el dato no es
> sensible, hay historial de versiones y rate limit). El MCP no usa `/api/sync`: el import es local y
> la persona decide después si sincroniza. Si en algún momento se suman datos más sensibles, conviene
> revisar esa decisión (sería OWASP A01).

---

## 9. ¿Por qué no ScrapingBee (ni ningún servicio de scraping)?

- Para hacer el scraping, el servicio necesitaría **tu cookie de sesión de UADE**. Es decir, un tercero
  vería tus notas, tu cuenta corriente y tus datos personales. Eso choca con el principio 1 y con el 2.
- No hace falta: WebCampus es HTML que arma el servidor, sin JavaScript que ejecutar. Un `fetch` y
  `cheerio` lo parsean en milisegundos. Lo lento es la red de UADE, y eso no lo arregla ningún proxy.
- **"Nuestra API" es una capa local**: `src/sources/webcampus/*` convierte cada página en JSON tipado.
  El MCP (y más adelante una CLI) usan esa capa. Los PDFs (calendario, cronogramas) se parsean una
  sola vez y se guardan en la caché cifrada, indexados por hash del archivo.

---

## 10. Cumplimiento (a validar)

Cuando el código esté, se valida contra: **OWASP ASVS 4/5** (nivel 2), **OWASP Top 10 for LLM
Applications** (sobre todo LLM01 prompt injection, LLM06 excessive agency y LLM02 fuga de datos
sensibles), **NIST SSDF (SP 800-218)** para el proceso de desarrollo, **NIST AI RMF**, controles de
**ISO/IEC 27001:2022 Anexo A** que aplican a un proyecto chico (8.25 a 8.28: desarrollo seguro), y la
**Ley 25.326** argentina de protección de datos personales.

---

## 11. Distribución: antipatrones que no vamos a repetir

Salen de ver cómo se distribuyen otros MCP y herramientas para agentes:

| Antipatrón | Qué hacemos nosotros |
|---|---|
| Un instalador que, además del MCP, mete skills, hooks, agentes y `CLAUDE.md` en la config del usuario | El paquete es **un servidor con tools y nada más**. Cualquier extra se ofrece aparte y el usuario lo elige |
| Escribir en `~/.claude*`, en la config de Claude Desktop o de otras apps, y "restaurarla" si el usuario la cambia | **Cero escritura en configuración ajena.** Se instala con una línea que corrés vos: `claude mcp add uade -- npx -y uade-mcp` (o el equivalente de tu cliente) |
| Hooks que suben el registro de **todas** las sesiones del agente, o telemetría con detalle de tools y archivos | **Sin telemetría.** Ni opt-in por ahora. Si algún día existe, será opt-in, limitada a llamadas a este MCP y explicada en la hoja de datos |
| Tokens en texto plano en JSON de configuración | Llavero del sistema |
| Cabeceras propietarias que obligan a usar un instalador | Protocolo MCP estándar (stdio). Si hay modo remoto, OAuth estándar |
| Auto-update prendido por defecto | **Sin auto-update.** Fijás la versión (`npx uade-mcp@x.y.z`) y actualizás cuando quieras |
| App nativa o daemon para algo que es solo un servidor | Proceso stdio que arranca y termina con el cliente |

**Hoja de datos pública** (pendiente, antes de abrir el repo): qué hace cada tool, qué guarda y dónde,
a qué hosts se conecta, qué no hace nunca y cómo borrar todo (`uade-mcp logout` + borrar `~/.uade-mcp`).

---

## 12. Pendientes / a evaluar

- [x] **PlanUADE:** `#importar=` en `facultades` (sección 8; formato en `facultades/docs/IMPORTAR.md`).
- [ ] **Graph (postergado por decisión de la autora, 18/10/2026).** Resultados hasta ahora:
  - Graph Explorer (app de Microsoft, editor verificado) puede leer el mail con `Mail.Read`: ✅.
  - Registrar una app propia dentro del tenant de UADE: ❌ (el portal de Entra está restringido para alumnos).
  - Una app propia multi-tenant registrada afuera (cuenta de Azure personal): sin probar. Es la prueba que decide;
    si UADE pide "aprobación del administrador", la única vía es que Sistemas de UADE apruebe la app.
  - Mientras tanto: borradores por deeplink de Outlook y adjuntos mostrados en Finder.
- [ ] **PIA:** volver a mapear cuando abra una inscripción.
- [ ] **Stack:** propuesta TypeScript + `@modelcontextprotocol/sdk` + `undici` (HTTP con allowlist) + `cheerio` (parseo) + `keytar`/`@napi-rs/keyring` (llavero) + `@azure/msal-node`.
- [ ] **Tests:** fixtures HTML **anonimizados**. Nunca commitear HTML real con datos personales.
- [ ] Revisar normativa UADE sobre acceso automatizado (`MenuItemId=280`).
- [ ] Hoja de datos pública (§11) y publicar en npm con versión fija.
- [ ] Duración de la sesión de WebCampus. Primer dato (18/10/2026): login a las 16:42, último uso a las ~17:15 y vencida a las 20:03 (hora de Buenos Aires). O sea, dura menos de unas 3 h, probablemente por inactividad. Clave para decidir un modo remoto: obligaría a reloguearse varias veces por día.
