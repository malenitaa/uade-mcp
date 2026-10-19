# Auditoría de seguridad y privacidad — uade-mcp

**Fecha:** 18/10/2026 · **Versión revisada:** 0.1.0 (commit posterior a `c11ae12`) · **Alcance:** todo `src/`,
dependencias y el historial de git.

**Qué es y qué no es.** Es una autoevaluación técnica: una revisión independiente del código
(hecha por un agente que no escribió el código), chequeos automáticos y pruebas contra una cuenta
real. **No** es una certificación ISO ni una auditoría de un tercero acreditado. Para una
certificación haría falta un auditor externo y un sistema de gestión formal. Lo que sigue sirve como
base para esa instancia.

## Resumen

| Severidad | Encontrados | Corregidos | Aceptados (con justificación) |
|---|---|---|---|
| Crítica | 0 | — | — |
| Alta | 1 | 1 | 0 |
| Media | 9 | 8 | 1 (M6) |
| Baja | 7 | 5 | 2 (L1, L6) |

Chequeos automáticos: `npm audit` sin vulnerabilidades (producción y desarrollo); historial de git
sin secretos ni datos personales (solo valores ficticios de tests); licencias MIT/Apache-2.0; la
única dependencia con script de instalación (`fsevents`) es opcional de desarrollo y npm la bloquea.

## Hallazgos

| ID | Hallazgo | Estado | Dónde | Test |
|---|---|---|---|---|
| H1 | El texto de terceros (páginas, PDFs, Excel) llegaba al agente sin marcar | ✅ Corregido: aviso en secciones, calendario y previos; `untrusted()` escapa variantes del cierre | `tools/secciones.ts`, `tools/calendario.ts`, `tools/webcampus.ts`, `untrusted.ts` | `auditoria.test.ts` H1 |
| M1 | Un borrador podía ir a cualquier @uade.edu.ar (exfiltración por prompt injection) | ✅ Corregido: la tool deja de ser "solo lectura" (el cliente pide aprobación mostrando destinatarios) y avisa si un destinatario no es del equipo docente de tus materias | `tools/mail.ts` | manual |
| M2 | Tools que abren el navegador/Finder marcadas como solo lectura | ✅ Corregido: `readOnlyHint: false` en mail y Plan UADE | `tools/mail.ts`, `tools/planuade.ts` | — |
| M3 | Mostrar adjuntos permitía atajos (symlinks) y `~/Library` | ✅ Corregido: `realpath`, solo Escritorio/Documentos/Descargas/iCloud Drive y tipos de documento | `net/open-browser.ts` | `common.test.ts` |
| M4 | Datos de compañeros filtrados por lista negra (`/alumn/`) | ✅ Corregido: lista blanca de roles docentes; cualquier otro rol no sale | `webcampus/parse.ts` | `auditoria.test.ts` M4 |
| M5 | Un link `//otro-host` de SharePoint mandaba las cookies a otro host | ✅ Corregido: `SessionClient` rechaza todo destino fuera de su origen; SharePoint solo en sitios habilitados | `net/session.ts`, `sharepoint/index.ts` | `auditoria.test.ts` M5 |
| M6 | Se guarda `rtFa` (cookie de Microsoft 365 de todo el tenant) | ⚠️ Aceptado: sin `rtFa` SharePoint responde 403 (verificado). Mitigado: el MCP solo la usa en el sitio de aranceles; vive en el llavero; `logout` la borra | `cli/login.ts`, `sharepoint/index.ts` | — |
| M7 | Con el MCP abierto, `logout` no borraba la sesión en memoria | ✅ Corregido: el llavero es la fuente de verdad en cada pedido | `net/session.ts` | `auditoria.test.ts` M7 |
| M8 | El tope anti zip-bomb confiaba en tamaños declarados | ✅ Corregido: se descomprime contando bytes reales, tope 60 MB | `webcampus/previos.ts` | `previos.test.ts` |
| M9 | Dependencias con rangos `^` | ✅ Corregido: versiones exactas; `files` en `package.json`. Al publicar: `npm-shrinkwrap.json` | `package.json` | — |
| L1 | Otro programa local puede leer el llavero sin aviso | ⚠️ Aceptado: inherente a un MCP local; documentado | `SECURITY.md` | — |
| L2 | La lista negra no veía el control de los postbacks | ✅ Corregido | `net/session.ts` | `auditoria.test.ts` L2 |
| L3 | Body y headers seguían redirecciones a otro host | ✅ Corregido | `net/http.ts` | `auditoria.test.ts` L3 |
| L4 | PDFs sin tope de páginas | ✅ Corregido: tope de 80 páginas (además de 10 MB y 20 s por pedido) | `calendario/index.ts` | — |
| L5 | `permitir` aceptaba la confirmación por tubería | ✅ Corregido: exige terminal interactiva | `cli/index.ts` | — |
| L6 | Datos personales en URLs (cuerpo del borrador, historial en el link de Plan UADE) | ⚠️ Aceptado: es como funcionan esas dos integraciones; el `#` no viaja al servidor; documentado | — | — |
| L7 | `fflate` usada sin declarar | ✅ Corregido | `package.json` | — |

Info: el hash del link de Plan UADE es de integridad, no una firma (corregido en `DISENO.md`); el
registro de auditoría de escrituras y la confirmación por elicitation todavía no existen porque no
hay ninguna tool que escriba en UADE.

## Controles por marco

### OWASP ASVS 4.0.3 (nivel 2, capítulos que aplican a un cliente local)

| Capítulo | Control | Evidencia |
|---|---|---|
| V1 Arquitectura | Modelo de amenazas, sin componentes de servidor | `DISENO.md` §1–4; corre por stdio |
| V2/V3 Autenticación y sesión | La contraseña nunca pasa por el código; sesiones en el llavero; logout efectivo | `cli/login.ts`, `auth/store.ts`, M7 |
| V5 Validación | IDs numéricos, enums, regex de rutas, esquemas zod | `tools/*.ts` |
| V6 Criptografía y almacenamiento | Secretos en el llavero del SO; nada en disco en claro | `auth/store.ts` |
| V7 Errores y logs | Errores sin detalles internos; cero logs con datos | `tools/common.ts` |
| V8 Protección de datos | Minimización (resúmenes, sin compañeros), nada sale de la compu | M4, `docs/COBERTURA.md` |
| V10 Código malicioso | Sin telemetría; dependencias fijas; scripts de instalación bloqueados | M9 |
| V12 Archivos | Topes de tamaño, páginas y descompresión; rutas validadas | M3, M8, L4 |
| V13/V14 Configuración | Allowlist de hosts, lista negra, https obligatorio, cookies por host | `net/policy.ts`, `net/http.ts` |

### OWASP Top 10 para aplicaciones con LLM (2025)

| Riesgo | Cómo se mitiga |
|---|---|
| LLM01 Prompt injection | Texto de terceros marcado; instrucciones del servidor; nada escribe en UADE; mail y navegador requieren aprobación (M1, M2) |
| LLM02 Divulgación de datos sensibles | Sin compañeros (M4), resúmenes por defecto, borradores solo a @uade.edu.ar con aviso |
| LLM05 Manejo inseguro de la salida | Parsers estrictos; `execFile` sin shell; URLs y rutas validadas |
| LLM06 Agencia excesiva | Solo lectura; permisos con nombre; lista negra en el cliente HTTP y en postbacks; login y permisos solo desde la terminal |
| LLM07 Filtración de instrucciones | Las instrucciones no tienen secretos |
| LLM10 Consumo sin límite | Topes de tamaño, tiempo, redirecciones, páginas, PDFs por recorrida; cachés de 1 h |

### NIST SSDF (SP 800-218)

| Práctica | Evidencia |
|---|---|
| PO (preparar la organización) | Requisitos de seguridad escritos (`DISENO.md`, `SECURITY.md`) |
| PS (proteger el software) | Repo privado, sin secretos en git (escaneado), dependencias fijas |
| PW (producir software seguro) | Revisión independiente, 113 tests incluidos los de regresión de esta auditoría, fixtures sintéticos |
| RV (responder a vulnerabilidades) | Canal privado de reporte (`SECURITY.md`), `doctor` para detectar cambios de UADE |

### ISO/IEC 27001:2022, Anexo A (controles que aplican)

| Control | Evidencia |
|---|---|
| 5.34 Privacidad y datos personales | Minimización, sin datos de terceros, todo local (Ley 25.326) |
| 8.12 Prevención de fuga de datos | Allowlist de red, destinatarios restringidos, aviso de destinatario ajeno |
| 8.24 Uso de criptografía | Llavero del SO; https obligatorio |
| 8.25–8.28 Desarrollo seguro | Diseño, revisión, tests de seguridad, código seguro |
| 8.8 Gestión de vulnerabilidades técnicas | `npm audit`, versiones fijas, CVE de pdf.js verificada |
| 8.16 Monitoreo | `doctor` (sin datos personales) |

### Ley 25.326 (Protección de Datos Personales, Argentina)

Mientras el MCP sea local, no hay una base de datos de terceros: cada alumno procesa solo sus
datos en su compu. Si algún día hay un modo remoto, pasa a haber responsable de una base y hay que
cumplir con política de privacidad, consentimiento e inscripción ante la AAIP (ver `DISENO.md`).

## Riesgos que quedan (aceptados)

1. **El agente tiene sus propias herramientas.** Un agente con acceso a la terminal puede hacer
   todo lo que vos podés en tu compu, incluso leer el llavero. El MCP no puede impedirlo: lo limita
   el cliente (Claude Code pide permiso para cada comando). Por eso las escrituras van a requerir
   confirmación en un diálogo propio.
2. **`rtFa` en el llavero (M6).** Si alguien entra a tu compu con tu sesión abierta, puede usarla.
   Dura poco y `logout` la borra.
3. **Datos en URLs (L6).** El texto del borrador pasa por Outlook web; el historial va en el `#` del
   link de Plan UADE (no viaja a ningún servidor, pero queda en el historial del navegador).

## Cómo repetir esta auditoría

```bash
npm audit
npx vitest run                 # incluye test/auditoria.test.ts
node dist/index.js doctor      # contra una cuenta real, sin datos personales
```
