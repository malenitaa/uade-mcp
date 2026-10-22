# Seguridad

## Reportar un problema

Usá el [formulario privado de GitHub](https://github.com/malenitaa/uade-mcp/security/advisories/new).
No abras un issue público para temas de seguridad.

## Qué garantiza el servidor

| Garantía | Dónde | Test |
|---|---|---|
| Solo HTTPS a la allowlist de UADE y Microsoft; cada redirección se revalida | `src/net/policy.ts`, `src/net/http.ts` | `test/policy.test.ts` |
| Bloqueos fijos (pagos, bajas, desvincularse, datos personales, buscador de personas, cerrar sesión) en URLs y postbacks | `src/net/policy.ts`, `src/net/session.ts` | `test/policy.test.ts`, `test/auditoria.test.ts` |
| Cookies y headers solo al host que corresponde; nada sale del origen de cada sitio | `src/net/http.ts`, `src/net/session.ts` | `test/webcampus-client.test.ts` |
| Nunca ve la contraseña: el login lo hace la persona en la página de Microsoft | `src/auth/login.ts` | — |
| Sesiones en el llavero; perfil de navegador propio en `~/.uade-mcp/browser-profile`, cifrado con el llavero del sistema (sin el llavero de mentira de Playwright); `logout` borra todo | `src/auth/`, `src/cli/index.ts` | `test/auditoria.test.ts` |
| Renovación automática de sesión: una por pedido vencido, sin bucles | `src/net/session.ts` | `test/login.test.ts` |
| Navegador: Chrome, Edge o Brave instalados, o un Chromium propio que el MCP baja solo si no hay ninguno y la persona lo confirma (en la terminal o diciéndoselo al agente); las URLs de descarga se verifican antes de bajar (https a `cdn.playwright.dev` o `playwright.download.prss.microsoft.com`, fuera de la allowlist del cliente HTTP); queda en `~/.uade-mcp/browsers` y se borra con `borrar-navegador` | `src/net/browser.ts`, `src/net/descargar-navegador.ts`, `src/net/policy.ts` | `test/navegador.test.ts` |
| Copia local cifrada (AES-256-GCM, clave en el llavero) | `src/cache/cache.ts` | `test/cache.test.ts` |
| Nunca datos de compañeros (lista blanca de roles docentes) | `src/sources/webcampus/parse.ts` | `test/auditoria.test.ts` |
| Texto de terceros marcado como información, no instrucciones: campo `aviso` en los resultados estructurados y bloque `<contenido_externo>` alrededor del texto plano (documentos, adjuntos, modo degradado) | `src/untrusted.ts`, `src/tools/*` | `test/auditoria.test.ts` |
| No envía inscripciones: el resumen es de lectura y la ventana de Inscripciones la usa la persona | `src/sources/pia/alta.ts`, `src/tools/pia.ts` | `test/pia.test.ts` |
| Mails solo como borrador a @uade.edu.ar; adjuntos solo de carpetas de documentos | `src/sources/mail/draft.ts`, `src/net/open-browser.ts` | `test/common.test.ts` |
| Lo único que escribe en tu disco va a `Downloads/uade-mcp`: nombre saneado, solo tipos de documento, nunca pisa un archivo, legible solo por vos; las tools que escriben o abren una ventana no se anuncian como solo lectura | `src/net/open-browser.ts`, `src/tools/materiales.ts`, `src/tools/pia.ts` | `test/materiales.test.ts`, `test/auditoria.test.ts` |
| Rutas de SharePoint ancladas a la carpeta habilitada; `folder` no acepta `..`, `.` ni segmentos vacíos | `src/sources/sharepoint/index.ts`, `src/tools/materiales.ts` | `test/materiales.test.ts` |
| Topes: 10 MB y 20 s por pedido, 5 redirecciones, 80 páginas por PDF, 60 MB descomprimidos por archivo contando bytes reales (xlsx, docx, pptx) y por PDF escaneado (imágenes, con tope por imagen); los PDFs se recorren en tiempo lineal | `src/sources/docs/`, `src/sources/webcampus/previos.ts` | `test/previos.test.ts`, `test/materiales.test.ts`, `test/pdf-imagenes.test.ts` |
| Reporte de errores opt-in (`reportes.errores`): campos fijos (versión, tool, tipo, página); el mensaje viaja solo de errores técnicos y tapado (mails, números largos, rutas, comillas); de los errores que nombran materias, archivos o carreras (`ErrorDeUso`) va solo el tipo; un envío por tool, tipo y página por día; único path permitido en planuade.ar | `src/report/errores.ts`, `src/error-de-uso.ts`, `src/net/policy.ts` | `test/reportes.test.ts` |
| Sin telemetría; dependencias directas con versión exacta (npm 12 ignora `npm-shrinkwrap.json`, así que las transitivas las fija el lockfile solo en desarrollo y CI); `npm audit` en cada commit | `package.json`, `.github/workflows/publicar.yml`, `scripts/revisar.mjs` | hook pre-commit, CI |

La auditoría completa (hallazgos, controles OWASP, NIST y ISO 27001, riesgos aceptados) está en
[docs/AUDITORIA.md](docs/AUDITORIA.md).

## Cadena de suministro (que lo que instalás sea lo que está en el repo)

- **Publicación solo desde GitHub Actions** (`.github/workflows/publicar.yml`), al crear un tag `vX.Y.Z`
  que coincida con `package.json`. Usa *trusted publishing* (OIDC): no existe ningún token de npm guardado
  que se pueda robar, y cada versión sale con **provenance** firmada que apunta a este repo y a este commit.
- **Nada sale al público sin una persona:** GitHub solo deja la versión *en espera* en npm; la publica quien
  mantiene el paquete, aprobándola en npmjs.com con su segundo factor. Un repo o una cuenta de GitHub
  comprometidos no alcanzan para publicar.
- **Verificar lo instalado:** `npm audit signatures` en una carpeta con `uade-mcp` instalado comprueba la
  firma y la provenance contra el registro.
- **CI en cada push y PR** (`revisar.yml`): tipos, tests, `npm audit` y búsqueda de secretos en todo el
  repo, en Node 20 y 22, sin credenciales de nadie.
- **Commits firmados:** `main` solo acepta commits con firma verificada (clave SSH de quien mantiene el
  proyecto, registrada en GitHub, o la firma de GitHub en los merges). Un commit que no sea de esa clave no entra.
- **Rama `main` protegida:** sin force-push ni borrado, historial lineal, y solo por PR con el CI en verde;
  la regla aplica también a quien administra el repo.
- **Dependabot** avisa (y propone el PR) ante vulnerabilidades en dependencias o acciones; el escaneo de
  secretos de GitHub, con protección al push, bloquea tokens que intenten entrar.
- **Dependencias con versión exacta** y `package-lock.json`; `npm ci --ignore-scripts` en CI: ninguna
  dependencia corre código al instalarse. Límite conocido: npm 12, que es el que exige la publicación
  en staging, no incluye ni respeta `npm-shrinkwrap.json`, así que `npx -y uade-mcp` fija las
  dependencias directas (versión exacta en `package.json`) pero resuelve las transitivas al instalar.
  `npm audit` corre en cada commit y en CI.

## Lo que queda fuera de estas garantías

- **`experimentos/`**: el servidor no carga nada de esa carpeta, no se compila ni se testea con el resto
  y git la ignora. Lo que corras ahí corre con tus credenciales y bajo tu responsabilidad.
- **Teams** se lee corriendo el Teams web real en el navegador del MCP: contacta dominios de Microsoft,
  como si lo abrieras vos, y puede dejar de funcionar si Microsoft cambia la interfaz.
- **El Chromium propio** (solo si no tenés Chrome, Edge ni Brave y lo confirmás): se baja "Chrome for
  Testing" en la versión que fija `playwright-core` (`browsers.json`), más el ffmpeg que su instalador
  agrega siempre, desde los servidores de Playwright (`cdn.playwright.dev`, con
  `playwright.download.prss.microsoft.com` como alternativa), unos 190 MB (~370 MB en disco), a
  `~/.uade-mcp/browsers`. Playwright no publica checksums de esos archivos: su instalador verifica el
  tamaño sobre HTTPS, y el MCP además corre el binario con `--version` y compara con la versión
  declarada (si no coincide, lo borra). Lo baja el instalador de `playwright-core` en un proceso aparte,
  sin heredar las variables con las que Playwright cambiaría de host o de carpeta. No tiene datos tuyos;
  `logout` no lo toca, `uade-mcp borrar-navegador` lo borra.
- **La sesión persistente de Microsoft** ("¿Mantener la sesión iniciada?" → Sí) vive en el perfil de
  navegador del MCP, cifrada con el llavero del sistema. Esa sesión (`ESTSAUTHPERSISTENT`) y la cookie
  `rtFa` de SharePoint no son solo de WebCampus: valen para todo Microsoft 365 de tu cuenta de UADE (mail,
  Teams, OneDrive). El MCP solo las usa en los sitios de su allowlist, pero quien controle tu usuario de la
  compu puede usarlas igual que vos. Por eso `uade-mcp logout` borra el perfil y el llavero, y conviene
  correrlo en una compu compartida.

## Reglas para contribuir

- **Nunca** commitees HTML, HAR, capturas o cookies reales. Los fixtures van anonimizados en `test/fixtures/`.
- No se agregan dependencias que hagan llamadas de red propias (analytics, chequeo de versiones, reporte de errores).
- Toda tool que escriba algo necesita un permiso propio en `PERMISSIONS`, apagado por defecto, y la
  confirmación de la persona en un diálogo que el agente no pueda contestar.
- `npm run revisar` tiene que pasar antes de cada commit (el hook lo corre solo).
