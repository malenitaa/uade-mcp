# Seguridad

## Reportar un problema

Usá el [formulario privado de GitHub](https://github.com/malenitaa/uade-mcp/security/advisories/new).
Por favor, no abras un issue público para temas de seguridad.

## Qué garantiza el código hoy

| Garantía | Dónde | Test |
|---|---|---|
| Solo HTTPS a la allowlist de UADE y Microsoft; cada redirección se revalida; http→https solo para hosts permitidos | `src/net/policy.ts`, `src/net/http.ts` | `test/policy.test.ts` |
| Lista negra (pagos, bajas, desvincularse, datos personales, buscador de personas, cerrar sesión) en URLs y en postbacks | `src/net/policy.ts`, `src/net/session.ts` | `test/policy.test.ts`, `test/auditoria.test.ts` |
| Cookies, headers y body solo al host que corresponde; nada sale del origen de cada sitio | `src/net/http.ts`, `src/net/session.ts` | `test/webcampus-client.test.ts`, `test/auditoria.test.ts` |
| Sesiones en el llavero; logout efectivo aunque el MCP esté abierto | `src/auth/store.ts`, `src/net/session.ts` | `test/auditoria.test.ts` |
| Nunca datos de compañeros (lista blanca de roles docentes) | `src/sources/webcampus/parse.ts` | `test/auditoria.test.ts` |
| Texto de terceros marcado como información, no instrucciones | `src/untrusted.ts`, `src/tools/*` | `test/auditoria.test.ts` |
| Borradores solo a @uade.edu.ar, con aviso si no es docente de tus materias; la tool pide aprobación | `src/sources/mail/draft.ts`, `src/tools/mail.ts` | `test/common.test.ts` |
| Adjuntos solo de Escritorio/Documentos/Descargas/iCloud Drive, tipos de documento, sin atajos | `src/net/open-browser.ts` | `test/common.test.ts` |
| Topes: 10 MB y 20 s por pedido, 5 redirecciones, 80 páginas por PDF, 60 MB descomprimidos por Excel | varios | `test/previos.test.ts` |
| Sin telemetría; dependencias en versiones exactas | `package.json` | — |

| Teams: perfil de navegador propio y aislado (`<config>/teams-profile`), headless, solo para leer canales; `logout` lo borra | `src/sources/teams/index.ts`, `src/cli/index.ts` | doctor |

> **Sobre Teams.** Leer los canales necesita correr el Teams web real en un navegador (no se puede
> con `fetch`, y la API oficial de Microsoft está bloqueada para alumnos). Ese navegador contacta los
> dominios de Microsoft, como si abrieras Teams vos. El perfil (con la sesión de Microsoft) queda en
> `<config>/teams-profile`; es la sesión más poderosa que guarda el MCP y por eso es opt-in (`login-teams`)
> y `logout` la borra. Es la parte más frágil: si Teams cambia su interfaz, deja de leer y lo avisa.

La auditoría completa, con cada hallazgo, los controles OWASP/NIST/ISO y los riesgos aceptados,
está en [docs/AUDITORIA.md](docs/AUDITORIA.md).

## Reglas para contribuir

- **Nunca** commitees HTML, HAR, capturas o cookies reales. Los fixtures van anonimizados en `test/fixtures/`.
- No se agregan dependencias que hagan llamadas de red propias (analytics, update checks, crash reporting).
- Toda tool nueva que escriba necesita un permiso propio en `PERMISSIONS` y pasar por `DraftStore`.
