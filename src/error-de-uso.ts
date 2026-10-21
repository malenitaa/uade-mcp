// Error cuyo mensaje lleva datos del estudiante o contenido de UADE (nombre de una materia, de un
// archivo, de una carrera, texto de PIA): se le muestra a la persona tal cual, pero el reporte de
// errores opcional (src/report/errores.ts) manda solo el tipo, nunca el mensaje. Todo mensaje que
// interpole algo leído de la cuenta tiene que ser de esta clase (lo controla test/reportes.test.ts).
export class ErrorDeUso extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorDeUso';
  }
}
