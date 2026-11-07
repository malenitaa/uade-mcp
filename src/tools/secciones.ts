// webcampus_section: reads any informational section of the WebCampus menu (page or PDF).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Permission } from '../auth/permissions.js';
import { cache, TTL } from '../cache/cache.js';
import { buscarCarrera, parseAranceles } from '../sources/webcampus/aranceles.js';
import { WebCampus } from '../sources/webcampus/index.js';
import { fragmentos } from '../sources/docs/fragmentos.js';
import { SECCIONES, Secciones, type Seccion } from '../sources/webcampus/secciones.js';
import { UNTRUSTED_NOTE } from '../untrusted.js';
import { CON_IMAGENES, READ_ONLY, run } from './common.js';
import { ErrorDeUso } from '../error-de-uso.js';

export function registerSeccionesTools(server: McpServer, granted: ReadonlySet<Permission>, sec = new Secciones(), wc = new WebCampus()): void {
  const nombres = Object.keys(SECCIONES) as [Seccion, ...Seccion[]];

  server.registerTool(
    'uade_tuition',
    {
      title: 'Official tuition fees per degree and shift',
      description:
        'Official UADE fee table (PDF linked from WebCampus > Aranceles): for a degree, per shift (mañana/tarde/noche), the semester enrollment fee (matrícula), the reference monthly fee for 5 subjects and the monthly fee per individual subject, plus admission fee and validity date. No degree: the student\'s own degree. Use it for any "cuánto sale / cuota / arancel / matrícula" question; webcampus_account_balance shows what this student is actually charged.',
      inputSchema: { degree: z.string().min(3).max(80).optional().describe('part of the degree name, e.g. "ingeniería informática"; add "costa" for Campus Costa Argentina') },
      annotations: READ_ONLY,
    },
    ({ degree }) =>
      run(granted, 'webcampus.leer', async () => {
        const { value: a, actualizado } = await cache.get('aranceles:tabla', TTL.semana, async () => {
          const { fuente, texto } = await sec.textoCompleto('aranceles_pdf');
          return { fuente, ...parseAranceles(texto) };
        });
        let consulta = degree;
        let propia: string | undefined;
        if (!consulta) {
          const carreras = (await cache.get('carreras', TTL.dia, () => wc.carreras())).value;
          propia = (carreras.find((c) => /activa/i.test(c.estado)) ?? carreras[0])?.carrera;
          if (!propia) throw new Error('No pude saber tu carrera; pasá degree.');
          consulta = propia;
        }
        const encontradas = buscarCarrera(a, consulta);
        if (!encontradas.length) throw new ErrorDeUso(`No encontré "${consulta}" en la tabla de aranceles (${a.carreras.length} carreras).`);
        const { carreras: _todas, ...resto } = a;
        return { actualizado, ...resto, consulta: propia ? `tu carrera: ${propia}` : consulta, carreras: encontradas, aviso: UNTRUSTED_NOTE };
      }),
  );
  server.registerTool(
    'webcampus_section',
    {
      title: 'WebCampus section',
      description: 'Text of an informational WebCampus section (page or official PDF, plus the PDF guides it links; a PDF without readable text, such as emergencias, comes back as page images: read them). normativa_academica = official academic rules (attendance %, regularity, exams, failed exams limits, deadlines): use it for any rules question. aranceles_pdf = official fee amounts per degree and shift. admision_sia = admission exam (SIA), English level (ENI), Spanish (ENE) and the admission guide. Also Wi-Fi setup per OS, fees and payment methods, MRI, rules, student guide, scholarships and AYUES workshops, minors, electives, honors, invoices, building entries, codes of conduct… Pass query (e.g. "macOS") to get only the relevant passages.',
      inputSchema: { section: z.enum(nombres), query: z.string().min(3).max(80).optional() },
      annotations: READ_ONLY,
    },
    ({ section, query }) =>
      run(granted, 'webcampus.leer', async () => {
        // Clave nueva en 0.6.4: la copia local de antes guardaba solo el link de los PDFs sin texto legible.
        const { value: d, actualizado } = await cache.get(`seccion:v2:${section}`, TTL.semana, () => sec.consultar(section));
        if (!query) {
          const { imagenes, ...resto } = d as typeof d & { imagenes?: unknown };
          return { actualizado, aviso: UNTRUSTED_NOTE, ...resto, [CON_IMAGENES]: imagenes };
        }
        const texto = 'texto' in d ? d.texto : '';
        const f = fragmentos(texto, query);
        // Lo que está en imágenes no se puede buscar: van igual, para que el modelo lo busque ahí.
        const imagenes = d.imagenes ?? [];
        const enImagenes = imagenes.length ? `Además van ${imagenes.length} ${imagenes.length > 1 ? 'imágenes' : 'imagen'} de PDFs sin texto legible: buscá "${query}" ahí.` : undefined;
        return { actualizado, aviso: UNTRUSTED_NOTE, seccion: section, fuente: d.fuente, fragmentos: f.length ? f : [`No aparece "${query}" en el texto de esta sección.`], enImagenes, [CON_IMAGENES]: imagenes };
      }),
  );
}
