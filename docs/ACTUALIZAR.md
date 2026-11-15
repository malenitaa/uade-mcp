# Versiones: cómo se actualiza el MCP y qué avisa

Tres preguntas, en orden: qué hace `npx` cuando sale una versión nueva (medido, no supuesto), qué
conviene poner en la config del cliente según eso, y qué hace exactamente el aviso de versión nueva.

## 1. Qué hace `npx -y uade-mcp` cuando sale una versión nueva

Medido el 15/11/2026 con `scripts/probar-npx.mjs`, antes de escribir el aviso (issue #44).

### La prueba

```bash
node scripts/probar-npx.mjs
```

No publica nada ni toca tu caché de npm. Levanta un registro de npm de mentira en `127.0.0.1` con un
paquete de juguete cuyo único comando imprime su versión. Para cada caso arma una caché de npm nueva
en una carpeta temporal, corre la 1.0.0, "publica" la 1.1.0 y mira qué versión corre el comando.
El registro real contesta `cache-control: max-age=300`, o sea que npm da por buena su lista de
versiones durante 5 minutos; la prueba cubre los dos lados de ese límite.

Para repetirla con otro npm: `NPX_CLI=/ruta/a/npm/bin/npx-cli.js node scripts/probar-npx.mjs`.

### El resultado

Igual con npm 10.9.10, 11.19.1 y 12.2.2 (Node 24.22.3, macOS):

| Comando, con la 1.0.0 ya corrida | Lista de versiones cacheada hace menos de 5 min | Pasados los 5 min |
|---|---|---|
| `npx -y paquete` | falla con `ETARGET` | corre la **1.1.0** |
| `npx -y paquete@latest` | falla con `ETARGET` | corre la **1.1.0** |
| `npx -y paquete@1.0.0` | — | corre la **1.0.0** |
| `npx -y paquete@1.1.0` | falla con `ETARGET` | — |
| `npx -y --prefer-online paquete@latest` | corre la **1.1.0** | — |
| borrar `<caché de npm>/_npx` y `npx -y paquete` | falla con `ETARGET` | — |

Además, con el paquete real y `--before` (npm resuelve como si la última fuera la de esa fecha), en
una caché temporal: `npm_config_before=2026-11-10 npx -y uade-mcp` instaló la 0.7.0, y el mismo
`npx -y uade-mcp` sin `--before` la reemplazó por la 0.7.2.

### Qué quiere decir

- **Sin versión, `npx` sigue la última.** Cada vez que el cliente arranca el MCP, `npx` le pregunta
  al registro cuál es la última y, si cambió, la instala y corre esa. No hace falta borrar
  `~/.npm/_npx` ni correr ningún comando: alcanza con cerrar y volver a abrir el cliente.
  `uade-mcp` y `uade-mcp@latest` se comportan igual.
- **Eso también quiere decir que, sin versión, no elegís cuándo actualizar:** la versión cambia sola
  en el próximo arranque, sin aviso previo. La única forma de elegir es fijarla.
- **Con versión fijada (`uade-mcp@0.8.0`) no cambia nunca** hasta que la persona cambia el número.
- **La ventana de 5 minutos.** Si npm consultó la lista de versiones hace menos de 5 minutos y en
  el medio se publicó una versión, `npx` falla con `ETARGET` ("No matching version found") en vez
  de correr la anterior: el cliente muestra que el MCP no conectó. Se va solo a los 5 minutos.
  Borrar `_npx` no lo arregla (la lista vive en otra parte de la caché); `--prefer-online` sí. Esto
  es lo que se veía después de cada publicación y se atribuía a `_npx`. Interpretación nuestra, no
  verificada en el código de npm: `npx` pregunta por la última sin usar la caché, pero el instalador
  sí la usa.
- **No probado:** Windows y Linux, npm anterior a 10 (Node 22, el mínimo, trae npm 10), ni una
  compu sin conexión al arrancar.

## 2. Qué poner en la config del cliente

| Querés | Config | Cómo se actualiza |
|---|---|---|
| Tener siempre lo último, sin ocuparte | `npx -y uade-mcp` | Sola, la próxima vez que abrís el cliente |
| Elegir vos cuándo | `npx -y uade-mcp@0.8.0` (el número que quieras) | Cambiás el número en la config del cliente |
| Tenerlo instalado | `npm i -g uade-mcp` y comando `uade-mcp` | `npm i -g uade-mcp@latest` |

Con la versión fijada o instalada con `npm i -g`, y también si dejás el cliente abierto varios días,
el aviso de la sección 3 es lo que te dice que hay una versión nueva.

## 3. El aviso de versión nueva (desde la 0.8.0)

El MCP nunca se cambia de versión solo ni corre ningún comando de actualización. Lo que hace es
avisar, y para avisar hace **un** pedido que no va a UADE ni a Microsoft:

- **Qué pide:** `GET https://registry.npmjs.org/uade-mcp/latest`, los metadatos públicos de la
  última versión publicada. De la respuesta lee dos cosas: el número de versión y el campo
  `notasDeVersion` del `package.json` (qué cambia, en una o dos líneas, y si corrige una falla de
  seguridad).
- **Qué no manda:** ni cookies, ni cabeceras propias, ni cuerpo, ni parámetros. Ningún dato tuyo ni
  de tu instalación: ni sesión, ni legajo, ni qué versión tenés, ni qué herramientas usás. Viajan
  solo las cabeceras que Node pone en cualquier pedido (`user-agent: node`). npm ve lo mismo que
  cuando `npx` baja el paquete: tu IP y la hora. Si el registro contesta con una cookie, no se
  guarda ni se reenvía.
- **Cada cuánto:** como mucho una vez por día. La respuesta (también si falló) queda en la copia
  local cifrada, y `uade_refresh` no la descarta.
- **Cómo avisa:** si la última es más nueva que la instalada, la primera respuesta de herramienta
  del día lleva al final un texto con las dos versiones, qué cambia y cómo actualizar. Si la versión
  nueva corrige una falla de seguridad, el texto va primero y lo dice sin vueltas. Las demás
  respuestas del día no lo repiten. `uade-mcp doctor` muestra lo mismo (y `--json` lo incluye en
  `version`), sin gastar el aviso del día.
- **Las notas son contenido externo:** la versión tiene que ser `número.número.número` y nada más;
  las notas se pasan a una línea, se recortan a 300 caracteres y le llegan al agente dentro de un
  bloque `<contenido_externo>`, como cualquier texto de terceros. Las escribe quien mantiene el
  proyecto y viajan dentro del paquete publicado, con la misma protección que el código (publicación
  solo desde GitHub Actions y aprobada con segundo factor).
- **Si algo sale mal:** si el registro no contesta en 2 segundos, contesta más de 64 KB, un error o
  algo que no es una versión válida, la herramienta responde como siempre, sin aviso y sin error, y
  no se vuelve a preguntar hasta el día siguiente. El pedido sale mientras la herramienta trabaja, así
  que en el caso normal no agrega demora.
- **Cómo se apaga:** con la variable `UADE_MCP_AVISO_VERSION=0` en la config de tu cliente, por
  ejemplo `claude mcp add uade -e UADE_MCP_AVISO_VERSION=0 -- npx -y uade-mcp`. Apagado no sale
  ningún pedido al registro. Tampoco sale si apagaste la copia local (`UADE_MCP_CACHE=0`): sin ella
  no hay dónde anotar que ya se preguntó hoy.

La política de red (`src/net/policy.ts`) solo deja pasar esa URL, letra por letra, y solo como un GET
sin cabeceras: cualquier otra ruta, método, cabecera, cookie o cuerpo hacia `registry.npmjs.org` se
rechaza antes de salir. Tests: `test/policy.test.ts` y `test/aviso-version.test.ts`.

## 4. Al publicar una versión

`package.json` lleva las notas de la versión que se publica:

```json
"notasDeVersion": {
  "version": "0.8.0",
  "cambios": "Qué cambia, en una o dos líneas (hasta 300 caracteres).",
  "seguridad": false
}
```

`seguridad: true` solo si la versión corrige una falla de seguridad: cambia la redacción del aviso y
lo pone primero. `publicar.yml` no publica si `notasDeVersion.version` no es la versión que se
publica, si `cambios` está vacío o pasa los 300 caracteres, o si `seguridad` no es un booleano; el
mismo control corre en cada PR (`test/aviso-version.test.ts`).
