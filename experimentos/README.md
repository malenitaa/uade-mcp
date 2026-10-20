# experimentos/

Espacio para probar código propio **sin tocar el MCP**.

- **El servidor no lo carga**: `src/index.ts` no importa nada de acá.
- **No se compila ni se testea con el resto**: `tsconfig.json` solo incluye `src/` y los tests de
  `npm test` excluyen esta carpeta. Si algo de acá falla, el MCP y el hook de commit siguen igual.
- **Git lo ignora** (salvo este README): nada de lo que pongas acá se sube al repo.

Podés usar cualquier lenguaje. Para correr algo en Node: `node experimentos/mi-script.mjs`.
Si querés reusar partes del MCP, importá desde `../dist/` después de `npm run build`.

Lo que corras acá **no tiene las garantías de [SECURITY.md](../SECURITY.md)**: usa las credenciales que
le des y hace lo que diga el código. Revisalo antes de correrlo, sobre todo si lo escribió otra persona o
una IA, y no guardes acá cookies, tokens ni registros de red.
