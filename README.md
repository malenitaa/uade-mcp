# UADE-MCP

MCP no oficial para que tu agente (Claude, ChatGPT o cualquier cliente MCP) lea tu **WebCampus**,
busque e inscriba en **PIA** y, más adelante, maneje **Teams** y el **mail** de UADE. También le
pasa tus materias aprobadas a [Plan UADE](https://planuade.ar).

Proyecto hecho por estudiantes, sin afiliación con la universidad.

> **Estado: v0, en construcción.** Por ahora están listos el núcleo de seguridad y el diseño. Las tools
> de WebCampus y PIA vienen en los próximos commits.

## Cómo trata tus datos

- **Corre en tu compu**, por stdio. No hay ningún servidor nuestro en el medio.
- **Sin telemetría.** Solo habla con los dominios de UADE y de Microsoft. Cualquier otro host se bloquea en el código.
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
