// Páginas de un PDF dibujadas como PNG, para PDFs cuyo texto no se puede leer (fuentes sin mapa de
// caracteres: ver legible.ts). Esto sí usa un motor gráfico: pdf.js dibuja sobre @napi-rs/canvas
// (Skia precompilado, dependencia opcional). Si el módulo no está (plataforma sin binario, instalación
// sin opcionales), se devuelve vacío y quien llama avisa con el link. Topes como en pdf-imagenes.ts:
// páginas, megapíxeles y cantidad de imágenes por PDF. Las páginas largas se cortan en tiras con
// un poco de solapamiento, porque el modelo achica cada imagen a unos 1500 px de lado.
import { createIsomorphicCanvasFactory, getDocumentProxy } from 'unpdf';

export interface PaginaPng {
  mimeType: 'image/png';
  bytes: Uint8Array;
  ancho: number;
  alto: number;
}

const MAX_PAGINAS = 3;
const MAX_IMAGENES = 6;
const ANCHO = 1200; // píxeles: suficiente para leer tablas de 10 pt
const MAX_PIXELES = 20_000_000; // por página; 20 megapíxeles RGBA son 80 MB
const ALTO_TIRA = Math.round(ANCHO * 1.3);
const SOLAPE = 40;

type Canvas = typeof import('@napi-rs/canvas');
let canvasModulo: Promise<Canvas | null> | undefined;

async function cargarCanvas(): Promise<Canvas | null> {
  canvasModulo ??= import('@napi-rs/canvas').then((m) => m, () => null);
  return canvasModulo;
}

export async function paginasComoImagenes(bytes: Uint8Array): Promise<PaginaPng[]> {
  const canvas = await cargarCanvas();
  if (!canvas) return [];
  const CanvasFactory = await createIsomorphicCanvasFactory(() => Promise.resolve(canvas));
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0, CanvasFactory });
  const out: PaginaPng[] = [];
  try {
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGINAS) && out.length < MAX_IMAGENES; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      let escala = ANCHO / base.width;
      if (base.width * base.height * escala * escala > MAX_PIXELES) escala = Math.sqrt(MAX_PIXELES / (base.width * base.height));
      const viewport = page.getViewport({ scale: escala });
      const ancho = Math.floor(viewport.width), alto = Math.floor(viewport.height);
      const pagina = canvas.createCanvas(ancho, alto);
      const ctx = pagina.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, ancho, alto);
      await page.render({ canvas: pagina as never, canvasContext: ctx as never, viewport }).promise;
      for (let y = 0; y < alto && out.length < MAX_IMAGENES; y += ALTO_TIRA - SOLAPE) {
        const h = Math.min(ALTO_TIRA, alto - y);
        let tira = pagina;
        if (h < alto) {
          tira = canvas.createCanvas(ancho, h);
          tira.getContext('2d').drawImage(pagina, 0, y, ancho, h, 0, 0, ancho, h);
        }
        out.push({ mimeType: 'image/png', bytes: new Uint8Array(await tira.encode('png')), ancho, alto: h });
        if (h === alto - y) break;
      }
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
  return out;
}
