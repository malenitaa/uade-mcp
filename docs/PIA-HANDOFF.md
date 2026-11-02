# PIA: dejar a la persona en la última pantalla

> **Estado (02/11/2026, 0.4.0):** hecho por el camino A. `pia_add_to_cart` (`src/sources/pia/navegador.ts`,
> `src/tools/pia.ts`, permiso `pia.carrito`) recorre PIA en la ventana visible hasta `InscripcionFinalizar.aspx`
> y se detiene; `kind: "exam"` hace lo mismo en el PIA de exámenes (`pia.uade.edu.ar`, `navegador-examen.ts`,
> relevado en vivo el 01/11/2026) hasta "Terminos y Condiciones" (Paso 3) o, si PIA la saltea, "Cálculo de
> Aranceles"; probado en vivo con una cuenta real el 02/11/2026 (llegó a términos sin marcar nada). Probado contra fixtures en `test/pia-navegador.test.ts` y `test/pia-examen-navegador.test.ts`. Lo que sigue abierto: la verificación
> en vivo de los selectores del diálogo de condiciones (`abrirDialogConfirmacionOfertaAmpliada`) cuando haya
> una clase con condiciones, y el 401 del cliente HTTP (`pia_class_search`), que este camino no necesita.
> El resto del documento es el plan original, que sirve como contexto.

Doc interno para quien tome este trabajo. Qué hay hecho, qué está trabado, cómo destrabarlo y qué
no se puede tocar. Leer antes `DISENO.md` (sección "PIA, mapeado del registro de red") y `SECURITY.md`.

## Objetivo

Hoy el MCP arma el resumen exacto de una inscripción (`pia_prepare_enrollment`) y abre Inscripciones
con la sesión iniciada (`uade_open_enrollment_site`), **en la lista de ventanas**. Desde ahí la persona
hace todo a mano: entrar a la ventana, buscar la materia, agregar la clase al carrito, confirmar,
aceptar términos y recién ahí Finalizar.

Lo que se quiere: que el MCP recorra PIA hasta la pantalla final (`InscripcionFinalizar.aspx`, la que
muestra el carrito, el **Resumen Arancelario** con importes y vencimientos reales, `chkTerminos` y
`btnFinalizar`) y **se detenga ahí**, con la ventana visible y la sesión de la persona. Finalizar lo
aprieta la persona, siempre. Esto no cambia.

## Límites que no se negocian

- **Nunca** se dispara `btnFinalizar` ni nada equivalente. Ni con confirmación, ni con permiso, ni
  "para probar". El test estático de `test/pia.test.ts` ("no hay ninguna función que envíe nada a PIA")
  hay que mantenerlo y extenderlo: ninguna función del repo manda `CONTROLES.finalizar`.
- El link firmado de la ventana (`?param=`) **no sale al modelo**: se usa adentro de las tools.
- Toda escritura nueva (agregar al carrito) va con permiso propio apagado por defecto (`pia.carrito`,
  igual que los otros permisos en `src/auth/permissions.ts`), anunciada con `readOnlyHint: false`, y con
  elicitation mostrando el resumen de `pia_prepare_enrollment` antes de tocar nada.
- Sin datos reales en el repo: fixtures sintéticas (`test/fixtures/pia/`), nunca un HAR ni HTML real.
  `npm run revisar` corre en el pre-commit y busca cookies y datos personales; no saltearlo.
- Al terminar hay que actualizar lo que hoy promete otra cosa: `SECURITY.md` ("No envía
  inscripciones"), `README.md`, `docs/COBERTURA.md` (fila "Inscripción en PIA"), `docs/AUDITORIA.md`
  (sección nueva, con tests) y en el sitio `mcp/index.html` ("Te inscribe ni aprieta Finalizar: te
  deja en Inscripciones con tu sesión" pasa a "te deja en la última pantalla, con los términos y el arancel a la vista").

## Qué hay hecho

| Qué | Dónde |
|---|---|
| Cliente HTTP de PIA (sesión por URL, cookies en memoria, solo `inscripcionespia.uade.edu.ar`) | `src/sources/pia/index.ts` (`PiaClient`, `Pia.materias`, `Pia.buscar`) |
| Parsers: buscador, materias por año, grilla de clases (con `ClaseId`, `HashConsistencia`, `btnAlta`), deltas de MS AJAX, pantalla Finalizar | `src/sources/pia/parse.ts` (`parseBuscador`, `parseMaterias`, `parseClases`, `parseDelta`, `htmlDe`, `parseFinalizar`) |
| Nombres de controles del formulario (`btnSeleccionarMaterias`, `btnBuscar`, `btnCarritoAlta`, `btnConfirmarCarrito`, `chkTerminos`, `btnFinalizar`, `btnVolver`) | `CONTROLES` en `parse.ts` |
| Resumen de lectura de materia y de previo | `src/sources/pia/alta.ts` |
| Tools `pia_class_search`, `pia_prepare_enrollment`, `uade_open_enrollment_site` | `src/tools/pia.ts` |
| Cómo se obtiene el link firmado de cada ventana abierta (`data-linkid`) | `src/sources/inscripciones/index.ts` (`linkPia`, `ventanas()`) |
| Ventana visible con la sesión de Microsoft (Playwright, perfil propio del MCP) | `abrirInscripciones` en `src/auth/login.ts` |
| Fixtures sintéticas y tests de parsers y cliente (servidor simulado) | `test/fixtures/pia/{buscar,materias,clases,finalizar}.html`, `test/pia-parse.test.ts`, `test/pia.test.ts` |

Flujo de PIA tal como se observó (WebForms + UpdatePanels), paso por paso, en `DISENO.md`.

## Qué está trabado

1. **401 en vivo.** Con el mismo link firmado que en el navegador funciona, el cliente HTTP recibe
   `401` con `WWW-Authenticate: Basic realm="uade.edu.ar"`. Hipótesis, sin verificar: el navegador
   manda algo que el cliente no manda. Candidatos: una cookie de dominio `.uade.edu.ar` que PIA
   comparte con `inscripciones.uade.edu.ar` (el cliente de PIA arranca sin cookies: `memoryStore`),
   o una credencial Basic que el navegador tiene guardada, o un header (`Referer`, `User-Agent`) que
   el servidor exige. `uade-mcp doctor` tiene una prueba "PIA (buscador)" que avisa cuando hay ventana
   abierta y PIA sigue rechazando: cuando pase a OK, esto quedó resuelto.
2. **Solo se puede probar con una ventana de inscripción abierta.** Fuera de esas fechas PIA no
   muestra nada; el calendario está en `uade_enrollment_windows`.
3. **El alta al carrito nunca se ejecutó desde código.** `btnCarritoAlta` → `btnConfirmarCarrito` →
   `InscripcionFinalizar.aspx` está mapeado del registro de red de la autora, pero no hay cliente que
   lo recorra. Y no hay registro de `btnFinalizar` (a propósito: no hace falta).

## Dos caminos para implementarlo

**A. Navegador visible (recomendado).** Hacer todo el recorrido dentro de la ventana que ya abre
`uade_open_enrollment_site` (Playwright sobre el perfil propio del MCP, que ya tiene la sesión de
Microsoft): entrar a la ventana, `btnSeleccionarMaterias`, tildar la materia, `btnBuscar`, en la fila
de la clase elegida `btnCarritoAlta` (y aceptar el diálogo de "oferta ampliada" si aparece, mostrando
antes esas condiciones a la persona), `btnConfirmarCarrito`, y **frenar** al llegar a
`InscripcionFinalizar.aspx`. Dejar la ventana abierta y devolver al modelo el texto del Resumen
Arancelario (`parseFinalizar`) para que lo repita.
- Ventajas: esquiva el 401 (es el navegador real), el carrito queda en la misma sesión que ve la
  persona, y Finalizar está a un clic de ella, con la pantalla adelante.
- Cuidados: selectores por `name` de los controles (`CONTROLES`), timeouts, y si algo no coincide
  con lo esperado (otra clase, otro importe) frenar y decirlo en vez de seguir. Nunca `click` en
  `btnFinalizar`: un test estático debe buscar `finalizar` en el código de Playwright y fallar.

**B. Cliente HTTP + pasar la sesión al navegador.** Resolver el 401 en `PiaClient`, implementar el
alta con `postback` (como `Pia.buscar`), y después abrir en la ventana visible la URL de
`InscripcionFinalizar.aspx?param=…` que devuelve el `pageRedirect`. Problema: el carrito vive en la
sesión de PIA (cookies en memoria del MCP), que no es la del navegador; habría que inyectar esas
cookies en el contexto de Playwright. Más frágil que A, y A ya tiene todo lo que necesita.

## Cómo relevar lo que falta, sin filtrar datos

- Con una ventana abierta, en el navegador propio: DevTools → Network → "Preserve log", y hacer el
  recorrido hasta la pantalla final **sin apretar Finalizar**. Mirar la primera request a
  `InscripcionClaseBuscar.aspx?param=`: headers `Cookie` (nombres, no valores) y `Authorization`.
  Eso responde la hipótesis del 401.
- Un HAR trae cookies, el `param` firmado y datos personales. No se commitea, no se pega en un chat,
  no se comparte. Lo que sirve se pasa a fixtures sintéticas con valores inventados, como las que hay.
- Las fixtures nuevas que harían falta: la respuesta de `btnCarritoAlta` (delta), la de
  `btnConfirmarCarrito` (delta con `pageRedirect`) y la pantalla de Finalizar con un carrito de dos
  items (`finalizar.html` tiene uno).

## Orden sugerido (2 a 4 días, con una ventana abierta)

1. Relevar el 401 y la secuencia del carrito en DevTools (medio día).
2. Camino A en un módulo nuevo `src/sources/pia/navegador.ts`: recorrido hasta
   Finalizar, con `parseFinalizar` sobre el HTML de la ventana. Tests con Playwright apuntando a un
   servidor local que sirva las fixtures (hay un servidor simulado en `test/pia-parse.test.ts` para
   el cliente HTTP; se puede reusar la idea).
3. Tool nueva `pia_fill_cart` (nombre tentativo): permiso `pia.carrito`, elicitation con el resumen,
   `readOnlyHint: false`, y respuesta que repite el Resumen Arancelario y dice "Finalizar lo apretás
   vos". `uade_open_enrollment_site` queda como está para quien prefiera hacerlo a mano.
4. Test estático: ninguna función del repo dispara `CONTROLES.finalizar` (extender el de `pia.test.ts`).
5. Docs y sitio (lista de arriba), `npm run revisar`, versión nueva (`package.json`, `src/index.ts`,
   `src/report/errores.ts`) y tag.
