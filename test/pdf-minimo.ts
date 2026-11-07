// PDFs mínimos y sintéticos para los tests (sin datos de nadie).
// PDF de una página con el contenido dado y, opcional, una imagen XObject; con su tabla xref.
export function pdfMinimo(contenido: string, imagen?: Buffer, { filtro = 'DCTDecode', lado = 300 } = {}): Uint8Array {
  const objs: Buffer[] = [
    Buffer.from('<</Type/Catalog/Pages 2 0 R>>'),
    Buffer.from('<</Type/Pages/Kids[3 0 R]/Count 1>>'),
    Buffer.from(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R${imagen ? '/Resources<</XObject<</Im1 5 0 R>>>>' : ''}>>`),
    Buffer.concat([Buffer.from(`<</Length ${contenido.length}>>\nstream\n`), Buffer.from(contenido, 'latin1'), Buffer.from('\nendstream')]),
  ];
  if (imagen) objs.push(Buffer.concat([Buffer.from(`<</Type/XObject/Subtype/Image/Width ${lado}/Height ${lado}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/${filtro}/Length ${imagen.length}>>\nstream\n`), imagen, Buffer.from('\nendstream')]));
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let pos = partes[0]!.length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    offsets.push(pos);
    pos += b.length;
    partes.push(b);
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  partes.push(Buffer.from(`${xref}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${pos}\n%%EOF`));
  return new Uint8Array(Buffer.concat(partes));
}
