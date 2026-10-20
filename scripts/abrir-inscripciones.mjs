// Lo mismo que la tool uade_open_enrollment_site, desde la terminal: abre Inscripciones con la
// sesión iniciada y queda abierta hasta que cierres la ventana. No toca nada más.
import { abrirInscripciones } from '../dist/auth/login.js';

await abrirInscripciones();
console.log('Inscripciones abierta con tu sesión. Cerrá la ventana (o Ctrl-C acá) cuando termines.');
