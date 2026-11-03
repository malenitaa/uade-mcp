// Si el texto que salió de un PDF se puede leer o es basura. Algunos PDFs de UADE (los cronogramas
// de inscripción, hechos en Illustrator) llevan fuentes recortadas sin mapa de caracteres: el
// extractor devuelve un código de control por letra (\u001f\u001e…) y ningún lector puede hacer
// más. Se mide la proporción de letras y números sobre los caracteres que no son blancos.
const UMBRAL = 0.5;

export function textoLegible(texto: string): boolean {
  const sinBlancos = texto.replace(/\s/g, '');
  if (!sinBlancos) return false;
  const alfanumericos = sinBlancos.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return alfanumericos / sinBlancos.length >= UMBRAL;
}
