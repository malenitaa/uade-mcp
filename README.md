# UADE-MCP

MCP no oficial para que tu agente (Claude, ChatGPT o cualquier cliente MCP) lea tu **WebCampus**,
busque e inscriba en **PIA** y, más adelante, maneje **Teams** y el **mail** de UADE. También le
pasa tus materias aprobadas a [Plan UADE](https://planuade.ar).

Proyecto hecho por estudiantes, sin afiliación con la universidad.

> **Estado: v0, en construcción.** Funciona la lectura de WebCampus: períodos, materias del cuatrimestre
> (horario, sede, notas, fecha de final), asistencia, historial académico y cuenta corriente.
> PIA, Teams y mail vienen después.

## Uso

```bash
npm install && npm run build
node dist/index.js login      # se abre el navegador; iniciás sesión vos con tu cuenta de UADE
node dist/index.js estado     # sesión y permisos
```

Para sumarlo a Claude Code (lo corrés vos; el MCP nunca toca la configuración de tu cliente):

```bash
claude mcp add uade -- node /ruta/a/uade-mcp/dist/index.js
```

| Tool | Qué devuelve |
|---|---|
| `webcampus_periodos` | Tus cuatrimestres |
| `webcampus_cursada` | Materias con día, horario, aula y sede, notas, fecha de final, links a Teams y apuntes |
| `webcampus_asistencia` | Presentes, inasistencias y detalle por clase |
| `webcampus_historial` | Todas las materias del plan con situación, nota y fecha, y el promedio |
| `webcampus_cuenta` | Deuda, próximos vencimientos y pagos (solo lectura: no paga) |
| `planuade_link_importar` | Un link de [Plan UADE](https://planuade.ar) con tus aprobadas, finales pendientes y cursadas. Lo abrís vos y confirmás ahí |

## Cómo trata tus datos

- **Corre en tu compu**, por stdio. No hay ningún servidor nuestro en el medio.
- **Sin telemetría.** Solo habla con los dominios de UADE y de Microsoft. Cualquier otro host se bloquea en el código.
- **Nunca ve tu contraseña.** El login es con Microsoft en un navegador; solo se guarda la cookie de sesión, en el llavero.
- **Lectura por defecto.** Las escrituras (inscribirte, entregar, mandar mails) vienen apagadas. Las prendés
  vos desde la terminal y cada una te pide confirmación en un diálogo que el agente no puede contestar solo.
- **Hay cosas que no hace nunca:** pagar, darse de baja, desvincularse de materias, tocar tus datos personales.

El detalle completo está en [docs/DISENO.md](docs/DISENO.md) y [SECURITY.md](SECURITY.md).

## Desarrollo

```bash
npm install
npm test
npm run build
```

## Licencia

[MIT](LICENSE).
