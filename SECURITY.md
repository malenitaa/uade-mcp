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
| Sesiones en el llavero; perfil de navegador propio en `~/.uade-mcp/browser-profile`; `logout` borra todo | `src/auth/`, `src/cli/index.ts` | `test/auditoria.test.ts` |
| Renovación automática de sesión: una por pedido vencido, sin bucles | `src/net/session.ts` | `test/login.test.ts` |
| Copia local cifrada (AES-256-GCM, clave en el llavero) | `src/cache/cache.ts` | `test/cache.test.ts` |
| Nunca datos de compañeros (lista blanca de roles docentes) | `src/sources/webcampus/parse.ts` | `test/auditoria.test.ts` |
| Texto de terceros marcado como información, no instrucciones | `src/untrusted.ts`, `src/tools/*` | `test/auditoria.test.ts` |
| No envía inscripciones: el resumen es de lectura y la ventana de Inscripciones la usa la persona | `src/sources/pia/alta.ts`, `src/tools/pia.ts` | `test/pia.test.ts` |
| Mails solo como borrador a @uade.edu.ar; adjuntos solo de carpetas de documentos | `src/sources/mail/draft.ts`, `src/net/open-browser.ts` | `test/common.test.ts` |
| Topes: 10 MB y 20 s por pedido, 5 redirecciones, 80 páginas por PDF, 60 MB descomprimidos por archivo | varios | `test/previos.test.ts` |
| Reporte de errores opt-in (`reportes.errores`): campos fijos (versión, tool, tipo, página), mails y números largos tapados, un envío por error por día, único path permitido en planuade.ar | `src/report/errores.ts`, `src/net/policy.ts` | `test/reportes.test.ts` |
| Sin telemetría; dependencias con versión exacta; `npm audit` en cada commit | `package.json`, `scripts/revisar.mjs` | hook pre-commit |

La auditoría completa (hallazgos, controles OWASP, NIST y ISO 27001, riesgos aceptados) está en
[docs/AUDITORIA.md](docs/AUDITORIA.md).

## Cadena de suministro (que lo que instalás sea lo que está en el repo)

- **Publicación solo desde GitHub Actions** (`.github/workflows/publicar.yml`), al crear un tag `vX.Y.Z`
  que coincida con `package.json`. Usa *trusted publishing* (OIDC): no existe ningún token de npm guardado
  que se pueda robar, y cada versión sale con **provenance** firmada que apunta a este repo y a este commit.
- **Verificar lo instalado:** `npm audit signatures` en una carpeta con `uade-mcp` instalado comprueba la
  firma y la provenance contra el registro.
- **CI en cada push y PR** (`revisar.yml`): tipos, tests, `npm audit` y búsqueda de secretos en todo el
  repo, en Node 20 y 22, sin credenciales de nadie.
- **Rama `main` protegida:** sin force-push ni borrado, historial lineal, y solo por PR con el CI en verde;
  la regla aplica también a quien administra el repo.
- **Dependabot** avisa (y propone el PR) ante vulnerabilidades en dependencias o acciones; el escaneo de
  secretos de GitHub, con protección al push, bloquea tokens que intenten entrar.
- **Dependencias con versión exacta** y `package-lock.json`; `npm ci --ignore-scripts` en CI: ninguna
  dependencia corre código al instalarse.

## Lo que queda fuera de estas garantías

- **`experimentos/`**: el servidor no carga nada de esa carpeta, no se compila ni se testea con el resto
  y git la ignora. Lo que corras ahí corre con tus credenciales y bajo tu responsabilidad.
- **Teams** se lee corriendo el Teams web real en el navegador del MCP: contacta dominios de Microsoft,
  como si lo abrieras vos, y puede dejar de funcionar si Microsoft cambia la interfaz.

## Reglas para contribuir

- **Nunca** commitees HTML, HAR, capturas o cookies reales. Los fixtures van anonimizados en `test/fixtures/`.
- No se agregan dependencias que hagan llamadas de red propias (analytics, chequeo de versiones, reporte de errores).
- Toda tool que escriba algo necesita un permiso propio en `PERMISSIONS`, apagado por defecto, y la
  confirmación de la persona en un diálogo que el agente no pueda contestar.
- `npm run revisar` tiene que pasar antes de cada commit (el hook lo corre solo).
