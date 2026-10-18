# Seguridad

## Reportar un problema

Usá el [formulario privado de GitHub](https://github.com/malenitaa/uade-mcp/security/advisories/new).
Por favor, no abras un issue público para temas de seguridad.

## Qué garantiza el código hoy

| Garantía | Dónde | Test |
|---|---|---|
| Solo HTTPS, a la allowlist de hosts de UADE y Microsoft. Cada redirección se vuelve a validar | `src/net/policy.ts`, `src/net/http.ts` | `test/policy.test.ts` |
| Lista negra: pagos, bajas, desvincularse, datos personales, buscador de personas, cerrar sesión | `src/net/policy.ts` | `test/policy.test.ts` |
| Permisos con nombre. Escrituras apagadas por defecto. Config inválida → falla cerrado | `src/auth/permissions.ts` | pendiente |
| Escrituras en dos pasos, de un solo uso, vencen a los 5 min y se confirman por elicitation (sin elicitation no hay escrituras) | `src/auth/confirm.ts` | `test/confirm.test.ts` |
| El contenido de terceros se marca como no confiable | `src/untrusted.ts` | pendiente |

## Reglas para contribuir

- **Nunca** commitees HTML, HAR, capturas o cookies reales. Los fixtures van anonimizados en `test/fixtures/`.
- No se agregan dependencias que hagan llamadas de red propias (analytics, update checks, crash reporting).
- Toda tool nueva que escriba necesita un permiso propio en `PERMISSIONS` y pasar por `DraftStore`.
