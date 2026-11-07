# Inventario de lo que UADE publica para un alumno

Mapa de todo lo que un alumno de grado ve en UADE, comparado con lo que lee el MCP. Lo arma
`scripts/inventario.mjs` recorriendo las fuentes de verdad; la tabla de abajo es su salida. Los huecos y
los candidatos a base pública (al final) son la lectura de esa tabla, confirmada con las tools.
[COBERTURA.md](COBERTURA.md) sigue siendo la vista por sección del menú; este archivo es el mapa
completo, incluido lo que el MCP no toca.

## Cómo se repite

Una vez por cuatrimestre (cuando UADE publica cronogramas y calendario nuevos), con una sesión iniciada:

```bash
npm run build && node scripts/inventario.mjs
```

- Reescribe solo lo que está entre los dos comentarios `inventario:inicio` y `inventario:fin`; lo de
  afuera (este encabezado, huecos y candidatos) se actualiza a mano mirando el diff.
- El detalle completo (huella de cada página) queda en `~/.uade-mcp/inventario/<fecha>.json`, fuera
  del repo: comparar dos de esos archivos muestra qué cambió UADE.
- `--solo webcampus,inscripciones,publico,pia` recorre solo esas fuentes e imprime la tabla sin tocar
  este archivo.
- Lo que dice "lee mal" se mide, no se anota: PDF sin texto legible (`textoLegible`), PDF de más de
  10 MB, tabla de cuenta corriente que el parser no conoce (`parseCuenta().otras`), sección que
  `webcampus_section` recorta, banners sin texto alternativo. Una fila con acceso `?` es un ítem nuevo
  del menú que todavía no está en el mapa del script (`MAPA`): hay que clasificarlo.

### Qué hace y qué no

- Solo GET. WebCampus e Inscripciones van con el cliente del MCP (`dist/`), la sesión del llavero y
  la misma política de red (allowlist + lista negra); nunca un postback ni un formulario.
- No abre: trámites, reservas, lista de interesados, encuestas, consultas, certificados, datos
  personales, pagos, débito, logout ni links a PIA. Quedan anotados como "no seguido" o "bloqueado".
- PIA no se recorre: su puerta pide la contraseña personal. Tiene una fila con lo que cubre hoy el MCP.
- Sitio oficial sin cookies: robots.txt primero, un pedido por segundo como máximo. WebCampus e
  Inscripciones, uno cada 1,5 s.
- De lo personal se guarda la estructura (ids `ctl00_ContentPlaceHolderMain…`, encabezados de tablas,
  clases de filas, cantidades), nunca valores ni títulos.

### Criterio para el sitio oficial

El sitemap de www.uade.edu.ar tiene ~10.000 URLs: casi 8.700 son eventos de la agenda y casi todo el
resto es marketing para ingresantes (carreras, facultades, posgrados, investigación, UADE Art). Se
recorre lo que le sirve a alguien que ya cursa: preguntas frecuentes, ayuda al estudiante, código de
conducta, cursada intensiva, becas y su cronograma, reinscripción, formas de pago, sistema de
admisión, mención de honor, intercambio (outgoing), sedes, deportes, housing, búsquedas laborales y
pasantías, contacto, minors, aviso legal de WebCampus, el índice de noticias y de agenda, el home
(avisos) y una carrera de ejemplo (Ingeniería en Informática, para ver cómo se publica el plan). De
cada página se siguen hasta 4 documentos en dre.uade.edu.ar o www.uade.edu.ar. dre.uade.edu.ar no
tiene índice: sus PDFs aparecen a través de WebCampus y del sitio.

## Qué hay, fuente por fuente

Columnas: **Acceso** es público (sin login), igual para todos pero detrás del login, o personal. **MCP** es ✅ lo lee (con qué tool), 🟡 lo lee mal (por qué), ❌ no lo lee, ⛔ fuera de alcance a propósito o sitio externo. **Estructura** es la huella: páginas y legibilidad de un PDF, tablas con sus encabezados y clases de filas, imágenes, controles que envían algo.

<!-- inventario:inicio (lo genera scripts/inventario.mjs; no editar a mano) -->

Recorrido del 07/11/2026: 222 ítems. ✅ 100 · 🟡 11 · ❌ 55 · ⛔ 56. robots.txt: www.uade.edu.ar no tiene (404), dre.uade.edu.ar no tiene (200). Sitemap: 10052 URLs (8661 de agenda), 28 elegidas por el criterio.

### WebCampus

| Ítem | Tipo | Destino | Acceso | MCP | Tool / motivo | Estructura |
|---|---|---|---|---|---|---|
| Home › Home: banners, novedades y agenda | pagina | /HomeWC.aspx | igual para todos (login) | ✅ lee | webcampus_news | 18 banners (0 sin texto), 3 novedades, 5 eventos |
| Home › banners › Banner 1 | pdf | dre.uade.edu.ar/cambioalta.pdf | público | ✅ lee | webcampus_news link | 1 pág., texto legible |
| Home › banners › Banner 2 | externo | enelsubte.com | público | ⛔ fuera | acortador → enelsubte.com |  |
| Home › banners › Banner 3 | externo | sm.pemres.net | — | ⛔ fuera | sitio externo (sm.pemres.net), no se contactó |  |
| Home › banners › Banner 4 | externo | sm.pemres.net | — | ⛔ fuera | sitio externo (sm.pemres.net), no se contactó |  |
| Home › banners › Banner 5 | externo | docs.google.com | público | ⛔ fuera | acortador → docs.google.com |  |
| Home › banners › Banner 6 | pdf | dre.uade.edu.ar/cronogramasUADE.pdf | público | ✅ lee | webcampus_news link | 1 pág., texto legible |
| Home › banners › Banner 7 | externo | sm.pemres.net | público | ⛔ fuera | acortador → sm.pemres.net |  |
| Home › banners › Banner 8 | pdf | www.dre.uade.edu.ar/Requisistos_promociones y previos.pdf | público | 🟡 solo link | webcampus_news link — fotos JPEG 2000: avisa y da el link (0.6.4) | 1 pág., sin texto legible |
| Home › banners › Banner 9 | pdf | dre.uade.edu.ar/residencia.pdf | público | ✅ lee | webcampus_news link | 1 pág., texto legible |
| Home › banners › Banner 10 | externo | parking.uade.edu.ar | — | ⛔ fuera | sitio externo (parking.uade.edu.ar), no se contactó |  |
| Home › banners › Banner 11 | pdf | dre.uade.edu.ar/horariosemanales.pdf | público | ✅ lee | webcampus_news link | 1 pág., texto legible |
| Home › banners › Banner 12 | externo | forms.gle | público | ⛔ fuera | acortador → forms.gle |  |
| Home › banners › Banner 13 | pagina | uadeeduar.sharepoint.com/… | público | ✅ lee | webcampus_news link |  |
| Home › banners › Banner 14 | pdf | dre.uade.edu.ar/vestimentagym2026.pdf | público | ✅ lee | webcampus_news link — como imagen de la página (0.6.4) | 1 pág., sin texto legible |
| Home › Novedades (lista) | pagina | /MiContenido/Novedades.aspx?EsDC=False | igual para todos (login) | ✅ lee | webcampus_news newsId | 1 img |
| Home › Una novedad (ejemplo) | pagina | /MiContenido/Novedades.aspx?Id=…&EsDC=False | igual para todos (login) | ✅ lee | webcampus_news newsId | 1 img |
| Home › Una novedad (ejemplo) › Exámenes Previos (noviembre - diciembre): Campus Buenos Aires, UADE Online y Campus Costa  | pagina | /MiContenido/Novedades.aspx?Id=…&EsDC=False | igual para todos (login) | ✅ lee | webcampus_news newsId | 1 img |
| Home › Una novedad (ejemplo) › Información sobre los feriados del 9 y 10 de noviembre | pagina | /MiContenido/Novedades.aspx?Id=…&EsDC=False | igual para todos (login) | ✅ lee | webcampus_news newsId | 1 img |
| Home › Agenda completa | pagina | /MiContenido/Eventos.aspx?EsActiv=False | igual para todos (login) | ✅ lee | webcampus_news allEvents |  |
| Home › Un evento (ejemplo) | pagina | /MiContenido/Agenda.aspx?Id=…&EsActiv=False | igual para todos (login) | ✅ lee | webcampus_news eventId | 1 img; 1 controles que envían |
| Home › Mis actividades | pagina | /AgendaEventos/MisActividades.aspx?VieneDe=Home | personal | ⛔ fuera | inscripciones a eventos (escritura) |  |
| Barra superior › WiFi | pagina | /MiContenido/Wifi.aspx | igual para todos (login) | ✅ lee | webcampus_section wifi |  |
| Barra superior › WiFi › Descargar | pdf | /Docs/Configuracion_WiFi_Windows_10.pdf | igual para todos (login) | ✅ lee | webcampus_section wifi (guía enlazada) | 1 pág., texto legible |
| Barra superior › WiFi › Descargar | pdf | /Docs/Configuracion_WiFi_UADE_Android.pdf | igual para todos (login) | ✅ lee | webcampus_section wifi (guía enlazada) | 2 pág., texto legible |
| Barra superior › WiFi › Descargar | pdf | /Docs/Configuracion_WiFi_UADE_iOS.pdf | igual para todos (login) | ✅ lee | webcampus_section wifi (guía enlazada) | 2 pág., texto legible |
| Barra superior › WiFi › Descargar | pdf | /Docs/Configuracion_WiFi_UADE_OSX.pdf | igual para todos (login) | ✅ lee | webcampus_section wifi (guía enlazada) | 9 pág., texto legible |
| Barra superior › Mis marcaciones | pagina | /Contenidos/Marcaciones.aspx | personal | ✅ lee | webcampus_section marcaciones | tabla: RadDatePicker / Title and navigation / S / M / T [rcWeek, rcRow, rcbReadOnly]; 1 controles que envían |
| Barra lateral › Consultas | no seguido | /Atencion.aspx | personal | ⛔ fuera | formulario que manda un mail: no se abre |  |
| Barra lateral › Encuestas | no seguido | /MiContenido/Encuesta.aspx | personal | ⛔ fuera | encuestas (escritura): no se abre |  |
| Barra lateral › Barra lateral › NÚMEROS ANTE EMERGENCIAS | pdf | dre.uade.edu.ar/emergencia.pdf | público | ✅ lee | webcampus_section emergencias — como imagen de la página (0.6.4) | 1 pág., sin texto legible |
| General › Mi perfil › Cuenta Corriente | pagina | /Contenidos/CuentaCorrientes.aspx | personal | ✅ lee | webcampus_account_balance | TableDeudaVencida: Deuda Vencida impaga [grilla4]; TableProximosVenc [grilla5, tr_tbl_up, grilla]; TablePagosRealizados [grilla4, tr_tbl_up, grilla]; 1 img; 2 controles que envían |
| General › Mi perfil › Cuenta Corriente › aquí. | pagina | /Aranceles/ArancelesWC.aspx?VieneDeCC=1 | personal | ✅ lee | webcampus_section aranceles | tbl_Pago [tit2, tit3] |
| General › Mi perfil › Certificado de Alumno Regular | pagina | /contenidos/CertificadoAlumnoReg.aspx | personal | ⛔ fuera | genera el PDF con un postback | TblPrincipal; 1 controles que envían; 1 combos |
| General › Mi perfil › Datos Personales | bloqueado | /Principal.aspx?MenuItemId=56 | personal | ⛔ fuera | lista negra: datos personales y trámites |  |
| General › Mi perfil › Marcaciones | pagina | /Contenidos/Marcaciones.aspx | personal | ✅ lee | webcampus_section marcaciones | tabla: RadDatePicker / Title and navigation / S / M / T [rcWeek, rcRow, rcbReadOnly]; 1 controles que envían |
| General › Mi perfil › Código de Conducta | pdf | dre.uade.edu.ar/codigo_conducta/codigoconducta.pdf | público | ✅ lee | webcampus_section codigo_conducta | 18 pág., texto legible |
| General › Mi perfil › Compromiso UADE | pdf | dre.uade.edu.ar/compromisouade.pdf | público | ✅ lee | webcampus_section compromiso_uade | 1 pág., texto legible |
| General › Mi perfil › Código de Vestimenta | pdf | dre.uade.edu.ar/cod_vestimenta.pdf | público | ✅ lee | webcampus_section codigo_vestimenta | 1 pág., texto legible |
| General › Mi perfil › Protocolo de intervención institucional | pdf | dre.uade.edu.ar/protocolointervencion.pdf | público | ✅ lee | webcampus_section protocolo_intervencion | 3 pág., texto legible |
| General › Portales › Sitio Institucional | externo |  | público | ⛔ fuera | sitio institucional (recorrido aparte, sin sesión) |  |
| General › Portales › Mail UADE | externo | www.uade.edu.ar | personal | ⛔ fuera | Outlook; solo borradores con email_compose_draft |  |
| General › Portales › Desarrollo Profesional. Cargá tu CV | externo | www.empleos.uade.edu.ar | personal | ⛔ fuera | portal de CV |  |
| General › Portales › Biblioteca | externo | www.uade.edu.ar | igual para todos (login) | ⛔ fuera | biblioteca |  |
| General › Portales › Videoclases On Demand | externo | repositorio.uade.edu.ar | igual para todos (login) | ⛔ fuera | videoclases |  |
| General › Portales › Parking UADE | externo | parking.uade.edu.ar | personal | ⛔ fuera | parking (reservas) |  |
| General › Interés › Deportes | pagina | /Contenidos/Deportes.aspx | igual para todos (login) | 🟡 lee mal | webcampus_section deportes — recortado a 8.000 caracteres sin query (tiene 11380) | 3 img |
| General › Interés › Deportes › aquí | pdf | www.dre.uade.edu.ar/normas.pdf | público | ✅ lee | webcampus_section deportes (guía enlazada) | 67 pág., texto legible |
| General › Interés › Deportes › aquí | pdf | dre.uade.edu.ar/reglamentocentro.pdf | público | ✅ lee | webcampus_section deportes (guía enlazada) | 4 pág., texto legible |
| General › Interés › Deportes › @deportesuadeoficial | externo | www.instagram.com | — | ⛔ fuera | sitio externo (www.instagram.com), no se contactó |  |
| General › Interés › Deportes › aquí | link roto | /Contenidos/http//www.dre.uade.edu.ar/normas.pdf | igual para todos (login) | ⛔ fuera | link mal armado en la página de UADE (relativo a otro sitio) |  |
| General › Interés › Becas | pagina | /Contenidos/Becas.aspx | igual para todos (login) | ✅ lee | webcampus_section becas | tabla; 1 img |
| General › Interés › Becas › Formulario de Solicitud de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/FormulariodeSolicituddeBecaalMéritoI | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Instructivo de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/Instructivo de solicitud de Beca al  | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Planilla de Datos Anexos | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Becas › Informe Económico | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Becas › Formulario de Solicitud de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/Formulario de Renovación Beca al Mér | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Instructivo de la Beca | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Becas › Planilla de Datos Anexos | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Becas › Formulario de Solicitud de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/COSTA ARG.- Formulario de Solicitud  | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Instructivo de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/COSTA ARG. - Instructivo de Solicitu | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Planilla de Datos Anexos | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Becas › Formulario de Solicitud de la Beca | no seguido | www.dre.uade.edu.ar/becas/vigente/COSTA ARG. -  Formulario de Renovaci | igual para todos (login) | ⛔ fuera | trámite o escritura: no se abre |  |
| General › Interés › Becas › Instructivo de la Beca | externo | www.dre.uade.edu.ar | — | ⛔ fuera | sitio externo (www.dre.uade.edu.ar), no se contactó |  |
| General › Interés › Ayuda al Estudiante | pagina | /Contenidos/Ayues.aspx | igual para todos (login) | ✅ lee | webcampus_section ayuda_estudiante | 1 img |
| General › Interés › Ayuda al Estudiante › este enlace | pdf | dre.uade.edu.ar/ayues.pdf | público | ✅ lee | webcampus_section ayuda_estudiante (guía enlazada) | 1 pág., texto legible |
| General › Interés › Ayuda al Estudiante › este enlace | pdf | dre.uade.edu.ar/ayuescosta.pdf | público | ✅ lee | webcampus_section ayuda_estudiante (guía enlazada) | 1 pág., texto legible |
| General › Interés › Ayuda al Estudiante › <mail> | link roto | /Contenidos/ayues.costa@uade.edu.ar | igual para todos (login) | ⛔ fuera | link mal armado en la página de UADE (relativo a otro sitio) |  |
| General › Interés › UADE Housing | pdf | dre.uade.edu.ar/residencia.pdf | público | ✅ lee | webcampus_section housing | 1 pág., texto legible |
| General › Interés › Números ante emergencia | pdf | dre.uade.edu.ar/emergencia.pdf | público | ✅ lee | webcampus_section emergencias — como imagen de la página (0.6.4) | 1 pág., sin texto legible |
| Académico › Trámites varios › Lista de alumnos interesados en la apertura de la materia | no seguido | /Principal.aspx?MenuItemId=248 | personal | ⛔ fuera | lista de interesados (escritura): no se abre |  |
| Académico › Trámites varios › Enviar Documentación Escaneada | bloqueado | /Principal.aspx?MenuItemId=303 | personal | ⛔ fuera | lista negra: datos personales y trámites |  |
| Académico › Trámites varios › Disponibilidad de Clases | pagina | /Contenidos/MiProgramacion.aspx | igual para todos (login) | ✅ lee | webcampus_class_offering — solo remite a la Programación del sitio de inscripciones |  |
| Académico › Trámites varios › Disponibilidad de Clases › https://inscripciones.uade.edu.ar | externo | inscripciones.uade.edu.ar | — | ⛔ fuera | sitio externo (inscripciones.uade.edu.ar), no se contactó |  |
| Académico › Trámites varios › Alta/baja de débito en cuenta - ¡NUEVO! | bloqueado | /Principal.aspx?MenuItemId=508 | personal | ⛔ fuera | lista negra: alta/baja de débito automático |  |
| Académico › Trámites varios › Inscripciones | pagina | inscripciones.uade.edu.ar/Account/Login | igual para todos (login) | ✅ lee | uade_enrollment_windows y demás — lleva al sitio de inscripciones (recorrido aparte, abajo) | 2 img; 1 controles que envían |
| Académico › Trámites varios › Mis Comprobantes | pagina | /contenidos/MisComprobantes.aspx | personal | ✅ lee | webcampus_section comprobantes |  |
| Académico › Trámites varios › Trámites Web | bloqueado | /Principal.aspx?MenuItemId=133 | personal | ⛔ fuera | lista negra: datos personales y trámites |  |
| Académico › Trámites varios › Reserva de Turnos Media Labs | no seguido | /Principal.aspx?MenuItemId=204 | personal | ⛔ fuera | reserva de turnos (escritura): no se abre |  |
| Académico › Trámites varios › Reserva de Turnos Cortadora Láser - ULABS | no seguido | /Principal.aspx?MenuItemId=258 | personal | ⛔ fuera | reserva de turnos (escritura): no se abre |  |
| Académico › Trámites varios › Reserva Turno Laboratorio de Fotografía | no seguido | /Principal.aspx?MenuItemId=323 | personal | ⛔ fuera | reserva de turnos (escritura): no se abre |  |
| Académico › Información › Aranceles | pagina | /Aranceles/ArancelesWC.aspx | igual para todos (login) | ✅ lee | uade_tuition, webcampus_section aranceles | tbl_Pago [tit2, tit3] |
| Académico › Información › Aranceles › Ver PDF Aranceles UADE | externo | uadeeduar.sharepoint.com | igual para todos (login) | ✅ lee | webcampus_course_materials — sitio externo (uadeeduar.sharepoint.com), no se contactó |  |
| Académico › Información › Aranceles › www.webcampus.uade.edu.ar | externo | www.webcampus.uade.edu.ar | — | ⛔ fuera | sitio externo (www.webcampus.uade.edu.ar), no se contactó |  |
| Académico › Información › Aranceles › Consultá el instructivo | bloqueado | www.dre.uade.edu.ar/tutorialpagoqr.html | igual para todos (login) | ⛔ fuera | lista negra: pagos |  |
| Académico › Información › Aranceles › Hacé click aquí para conocer el beneficio para adhesiones clientes Santander | externo | www.santander.com.ar | — | ⛔ fuera | sitio externo (www.santander.com.ar), no se contactó |  |
| Académico › Información › Aranceles › pagar.com.ar, | externo | www.pagar.com.ar | — | ⛔ fuera | sitio externo (www.pagar.com.ar), no se contactó |  |
| Académico › Información › Aranceles › provincianet.com.ar | externo | www.provincianet.com.ar | — | ⛔ fuera | sitio externo (www.provincianet.com.ar), no se contactó |  |
| Académico › Información › Materias Regulares Intensivas (MRI) | pagina | /Contenidos/MateriasMRI.aspx | igual para todos (login) | ✅ lee | webcampus_section materias_intensivas_mri |  |
| Académico › Información › Materias Regulares Intensivas (MRI) › aquí | pdf | dre.uade.edu.ar/mri2c2026.pdf | público | ✅ lee | webcampus_section materias_intensivas_mri (guía enlazada) | 11 pág., texto legible |
| Académico › Información › Materias Regulares Intensivas (MRI) › aquí | pdf | dre.uade.edu.ar/mriver27.pdf | público | ✅ lee | webcampus_section materias_intensivas_mri (guía enlazada) | 9 pág., texto legible |
| Académico › Información › Materias Regulares Intensivas (MRI) › Términos y condiciones | pdf | dre.uade.edu.ar/condicionesmri.pdf | público | ✅ lee | webcampus_section materias_intensivas_mri (guía enlazada) | 13 pág., texto legible |
| Académico › Información › Materias Regulares Intensivas (MRI) › www.uade.edu.ar | link roto | /Contenidos/www.uade.edu.ar | igual para todos (login) | ⛔ fuera | link mal armado en la página de UADE (relativo a otro sitio) |  |
| Académico › Información › Materias Regulares Intensivas (MRI) › Facebook / UADE COSTA ARGENTINA | externo | www.facebook.com | — | ⛔ fuera | sitio externo (www.facebook.com), no se contactó |  |
| Académico › Información › Carreras - Materias | pagina | /Contenidos/ListaCarreras.aspx | igual para todos (login) | 🟡 lee mal | webcampus_section carreras — recortado a 8.000 caracteres sin query (tiene 9480) | tbl_Carreras; 176 img |
| Académico › Información › Carreras - Materias › Contador Público | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=922 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Contador Público (Costa Argentina) | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=P92 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Diplomatura en Administración Contable | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=P13 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Diplomatura en Sistemas de Gestión Empresarial sap Next-gen | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=146 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Diplomatura Universitaria en Administración de Inversiones Financieras | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=128 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Administración de Empresas y Comercio Internacional | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=419 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Administración de Empresas y Finanzas | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=420 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Administración de Empresas y Recursos Humanos | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=431 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Contador Público y Abogacía | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=932 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Contador Público y Administración de Empresas | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=409 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Contador Público y Administración de Empresas (Costa Argentina) | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=P40 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Carreras - Materias › Doble Titulación en Contador Público y Finanzas | pagina | /Contenidos/PlanesEstudioListaMaterias.aspx?IdFacultad=3&IdCarrera=926 | igual para todos (login) | ❌ no lee | materias de cada carrera, con su código (con el código, webcampus_course_program trae el programa) |  |
| Académico › Información › Información de Materias | pagina | /PlanesProgramas/Planes.aspx | igual para todos (login) | ❌ no lee | combos en cascada (facultad → carrera → materia) |  |
| Académico › Información › Información de Materias › SIA-COMPRENSIÓN DE TEXTOS | pagina | /HomeMateria.aspx?idMateria=… | igual para todos (login) | ❌ no lee |  |  |
| Académico › Información › Información de Materias › Cuadernillo SIA-COMPRENSIÓN DE TEXTOS | pdf | /Docs/Comprension-de-texto-Cuadernillo.pdf | igual para todos (login) | ❌ no lee |  | 66 pág., texto legible |
| Académico › Información › Materias Optativas | pdf | dre.uade.edu.ar/WebCampus/Optativas y Minors/Asignaturas Optativas.pdf | público | ✅ lee | webcampus_section optativas | 71 pág., texto legible |
| Académico › Información › Normativa Académica | pdf | www.dre.uade.edu.ar/normas.pdf | público | ✅ lee | webcampus_section normativa_academica | 67 pág., texto legible |
| Académico › Información › Guía Institucional para Alumnos | pdf | dre.uade.edu.ar/GuiaAluBA.pdf | público | ✅ lee | webcampus_section guia_alumnos | 29 pág., texto legible |
| Académico › Información › Intercambio Estudiantil | pagina | /Contenidos/Infointercambio.aspx | igual para todos (login) | ✅ lee | webcampus_section intercambio |  |
| Académico › Información › Intercambio Estudiantil › ver listado completo | pesado | dre.uade.edu.ar/convenios.pdf | público | 🟡 lee mal | webcampus_section intercambio (guía enlazada) — pesa más de 10 MB: el MCP no lo descarga |  |
| Académico › Información › Intercambio Estudiantil › ver listado completo | pesado | dre.uade.edu.ar/convenioposgrado.pdf | público | 🟡 lee mal | webcampus_section intercambio (guía enlazada) — pesa más de 10 MB: el MCP no lo descarga |  |
| Académico › Información › Intercambio Estudiantil › oferta académica | pdf | dre.uade.edu.ar/ofertauniversidades.pdf | público | ✅ lee | webcampus_section intercambio (guía enlazada) | 2 pág., texto legible |
| Académico › Información › Intercambio Estudiantil › ¡Postulate aquí! | externo | www.uade.edu.ar | — | ⛔ fuera | sitio externo (www.uade.edu.ar), no se contactó |  |
| Académico › Información › Intercambio Estudiantil › Más información | externo | help.uade.edu.ar | igual para todos (login) | ⛔ fuera | aplicación aparte con su propia sesión |  |
| Académico › Información › Intercambio Estudiantil › Accedé a las Preguntas Frecuentes aquí | pdf | www.uade.edu.ar/media/2lshpxs2/outgoing-faqs-español-uade.pdf | público | ❌ no lee |  | 7 pág., texto legible |
| Académico › Información › Intercambio Estudiantil › ¡Conocé más sobre los viajes del Programa Learning by Travelling! | externo | www.uade.edu.ar | — | ⛔ fuera | sitio externo (www.uade.edu.ar), no se contactó |  |
| Académico › Información › UADE Hub | externo | www.uade.edu.ar | igual para todos (login) | ⛔ fuera | UADE Hub |  |
| Académico › Información › Calendario académico | pdf | dre.uade.edu.ar/calendario.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › home.pdf | pdf | www.dre.uade.edu.ar/calendario/home.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › 3_sedes.pdf | pdf | www.dre.uade.edu.ar/calendario/3_sedes.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › Costa.pdf | pdf | www.dre.uade.edu.ar/calendario/Costa.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › ubs.pdf | pdf | www.dre.uade.edu.ar/calendario/ubs.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › Online.pdf | pdf | www.dre.uade.edu.ar/calendario/Online.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › Verano.pdf | pdf | www.dre.uade.edu.ar/calendario/Verano.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › Feriados.pdf | pdf | www.dre.uade.edu.ar/calendario/Feriados.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › home_2.pdf | pdf | www.dre.uade.edu.ar/calendario/2/home_2.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › 3sedes_2.pdf | pdf | www.dre.uade.edu.ar/calendario/2/3sedes_2.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › costa_2.pdf | pdf | www.dre.uade.edu.ar/calendario/2/costa_2.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › ubs_2.pdf | pdf | www.dre.uade.edu.ar/calendario/2/ubs_2.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › online_2.pdf | pdf | www.dre.uade.edu.ar/calendario/2/online_2.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Calendario académico › feriados.pdf | pdf | www.dre.uade.edu.ar/calendario/2/feriados.pdf | público | ✅ lee | uade_academic_calendar | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción | pdf | dre.uade.edu.ar/cronogramasUADE.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › cronos_inscrip_infogral.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/cronos_inscrip_in | público | ✅ lee | uade_academic_calendar topic=inscripciones — sin texto legible: va como imagen | 1 pág., sin texto legible |
| Académico › Información › Cronogramas de inscripción › crono_mriverano.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/crono_mriverano.p | público | ✅ lee | uade_academic_calendar topic=inscripciones — sin texto legible: va como imagen | 1 pág., sin texto legible |
| Académico › Información › Cronogramas de inscripción › Progra MRI Verano 2027.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/Progra MRI Verano | público | ✅ lee | uade_academic_calendar topic=inscripciones | 3 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › hotelescuela.pdf | pdf | dre.uade.edu.ar/hotelescuela.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › crono_cursosdeverano.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/crono_cursosdever | público | ✅ lee | uade_academic_calendar topic=inscripciones — sin texto legible: va como imagen | 1 pág., sin texto legible |
| Académico › Información › Cronogramas de inscripción › CV Monserrat.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/CV Monserrat.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 2 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › CV Belgrano.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/CV Belgrano.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › CV Recoleta.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/CV Recoleta.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › CV Online.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/CV Online.pdf | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › cronoveranoonline2027.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/cronoveranoonline | público | ✅ lee | uade_academic_calendar topic=inscripciones | 1 pág., texto legible |
| Académico › Información › Cronogramas de inscripción › cronos_inscrip_previos.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/cronos_inscrip_pr | público | ✅ lee | uade_academic_calendar topic=inscripciones — sin texto legible: va como imagen | 1 pág., sin texto legible |
| Académico › Información › Cronogramas de inscripción › cronos_inscrip_libres.pdf | pdf | www.dre.uade.edu.ar/PDFs/Cronograma de inscripciones/cronos_inscrip_li | público | ✅ lee | uade_academic_calendar topic=inscripciones — sin texto legible: va como imagen | 1 pág., sin texto legible |
| Académico › Información › Mención de Honor | pdf | dre.uade.edu.ar/honor.pdf | público | ✅ lee | webcampus_section mencion_honor | 2 pág., texto legible |
| Académico › Información › Minors | pdf | dre.uade.edu.ar/WebCampus/Optativas y Minors/Minors.pdf | público | ✅ lee | webcampus_section minors | 32 pág., texto legible |
| Académico › Consultas › Correlativas | pagina | /HistorialAcademico/Plan_Acedemico.aspx?VieneDe=Correlativa | igual para todos (login) | ✅ lee | uade_eligible_subjects — igual para todos los del mismo plan | Table1; 1 controles que envían |
| Académico › Consultas › Historial Académico | pagina | /HistorialAcademico/Plan_Acedemico.aspx | personal | ✅ lee | webcampus_transcript | Table1; Table2; 1 controles que envían |
| Académico › Consultas › Mi Semana | pagina | /Contenidos/Misemanasel.aspx | personal | ⛔ fuera | falla del lado de UADE; se usa la de cada materia | 1 img |
| Académico › Consultas › Buscador de Personas | bloqueado | /Principal.aspx?MenuItemId=253 | personal | ⛔ fuera | lista negra: buscador de personas (datos de terceros) |  |
| Académico › Consultas › Asignaturas Previas | pagina | /HistorialAcademico/Historial_academico.aspx?planacademico=0&asig_prev | personal | ✅ lee | webcampus_transcript | tabla; Table3; Table1 [anio, tr_grilla_hide, tr_tbl_up, tr_tbl_int]; 1 controles que envían |
| Académico › Consultas › Planes de Estudio | pagina | /HistorialAcademico/Plan_Acedemico.aspx?VieneDe=Plan | igual para todos (login) | ✅ lee | webcampus_transcript (plan completo) — igual para todos los del mismo plan | Table1; 1 controles que envían |
| Académico › Consultas › Sistema de Admisión (SIA) / ENI / ENE | pagina | /Contenidos/InfoENI.aspx | igual para todos (login) | ✅ lee | webcampus_section admision_sia | TablaGrillas |
| Académico › Consultas › Sistema de Admisión (SIA) / ENI / ENE › Guía de ingreso a UADE | pdf | dre.uade.edu.ar/guiadeingreso.pdf | público | ✅ lee | webcampus_section admision_sia (guía enlazada) | 14 pág., texto legible |
| Académico › Consultas › Simulación de Equivalencias | pagina | /Contenidos/SimuladorEquivalencias.aspx | personal | ❌ no lee | formulario interactivo | PaneInsc |
| Académico › Consultas › Lineamientos sobre el uso de IA | pdf | dre.uade.edu.ar/PDFs/lineamientosiaalumnos1.pdf | público | ✅ lee | webcampus_section lineamientos_ia | 1 pág., texto legible |
| Mis Cursos › Alumno › Mis Cursos (un período) | pagina | /Home.aspx?Periodo=… | personal | ✅ lee | webcampus_current_courses | CtrlMaterias_tblMaterias; tabla: EVALUACIÓN 1 / EVALUACIÓN 2 / Recup. / Informe Cursada / Examen Final [table-warning, table-light]; tabla: EVALUACIÓN 1 / EVALUACIÓN 2 / Recup. / Informe Cursada / Examen Final [table-warning, table-light]; 4 controles que envían |
| Mis Cursos › Alumno › Mis Cursos › links a teams.microsoft.com | externo | teams.microsoft.com | personal | ✅ lee | teams_channel_news (experimental) |  |
| Mis Cursos › Alumno › Mis Cursos › links a uadeeduar.sharepoint.com | externo | uadeeduar.sharepoint.com | igual para todos (login) | ✅ lee | webcampus_course_materials |  |
| Mis Cursos › aula de ejemplo › Home del aula | pagina | /MiAula.aspx?IdAula=…&EsUBS=False | personal | ❌ no lee | home del aula; lo útil sale de las páginas de abajo | tabla; tabla |
| Mis Cursos › aula de ejemplo › Asistencia | pagina | /AsistenciaAlumnos.aspx?IdAula=… | personal | ✅ lee | webcampus_attendance | tabla |
| Mis Cursos › aula de ejemplo › Integrantes | pagina | /Integrantes/Integrantes.aspx?IdAula=… | personal | ✅ lee | webcampus_teachers | tableintegrantes: Foto / Nombre / Email / Legajo / Rol; 30 img |
| Mis Cursos › aula de ejemplo › Mi Semana | pagina | /PlanificacionClases/MiSemana.aspx?IdAula=… | personal | ✅ lee | webcampus_course_calendar | 1500 [tr_ancho, celda_cursada_desplegada] |
| Mis Cursos › aula de ejemplo › Historial de novedades | pagina | /Contenidos/NovedadHist.aspx?IdAula=…&IdNov=… | personal | ❌ no lee | sin ejemplo con contenido | tabla; 1 img; vacía |
| Mis Cursos › aula de ejemplo › Programa de la materia | pdf | /Programas/<código>_<materia>_<fecha>.pdf | igual para todos (login) | ✅ lee | webcampus_course_program | 5 pág., texto legible |
| Mis Cursos › aula de ejemplo › Certificado de examen | no seguido | /contenidos/certificadoExamen.aspx | personal | ⛔ fuera | genera un certificado: no se abre |  |
| Mis Cursos › Alumno › Clases de consulta | pagina | /Contenidos/MisClasesApoyo.aspx | igual para todos (login) | ✅ lee | webcampus_consultation_classes | tabla; 2 combos |


### Inscripciones

| Ítem | Tipo | Destino | Acceso | MCP | Tool / motivo | Estructura |
|---|---|---|---|---|---|---|
| Pestañas › Importante | pestaña | inscripciones.uade.edu.ar/#menuImportante | igual para todos (login) | ✅ lee | uade_enrollment_guide | 2 img; 1 controles que envían; 2 avisos |
| Pestañas › Inscribite | pestaña | inscripciones.uade.edu.ar/#menu3 | igual para todos (login) | ✅ lee | uade_enrollment_windows |  |
| Pestañas › Cronograma inscripción | pestaña | inscripciones.uade.edu.ar/#menu2 | igual para todos (login) | ✅ lee | uade_enrollment_schedule | 1 img |
| Pestañas › Instructivos | pestaña | inscripciones.uade.edu.ar/#home | igual para todos (login) | ✅ lee | uade_enrollment_guide |  |
| Pestañas › Ayuda | externo | help.uade.edu.ar | igual para todos (login) | ⛔ fuera | aplicación aparte con su propia sesión |  |
| Ventanas › Ventanas de inscripción (panel) | pagina | inscripciones.uade.edu.ar/Home/ObtenerInscripciones | personal | ✅ lee | uade_enrollment_windows — los links a PIA (data-linkid) no se siguen | links: InscripcionAsignatura, CambioAsignaturaPack, InscripcionExamen |
| Pestaña home › home › Tutorial inscripción a examen | externo | www.youtube.com | público | ✅ lee | uade_enrollment_guide (solo el link) |  |
| Pestaña home › home › Tutorial de Inscripción a Asignaturas | externo | www.youtube.com | público | ✅ lee | uade_enrollment_guide (solo el link) |  |
| Pestaña home › home › El Tutorial de cambio y baja de asignaturas | externo | youtu.be | público | ✅ lee | uade_enrollment_guide (solo el link) |  |
| Pestaña menu1 › menu1 › Inscripciones.uade.edu.ar > Inscribite > Asignaturas/Optativas | pagina | inscripciones.uade.edu.ar/ | igual para todos (login) | ❌ no lee |  |  |
| Pestaña menu2 › menu2 › Fechas de inscripciones 2020 - UADE sede Monserrat | imagen | inscripciones.uade.edu.ar/Content/images/cuadro_inscripciones01.jpg | igual para todos (login) | ✅ lee | uade_enrollment_schedule (imagen) |  |
| Pestaña menu2 › menu2 › chequeá la disponibilidad de clases antes de inscribirte | pagina | /MiProgramacion/Contenidos/MiProgramacion.aspx?IdUsuario=… | personal | ✅ lee | webcampus_class_offering |  |
| Pestaña menuImportante › menuImportante › imagen mensaje-min.png | imagen | inscripciones.uade.edu.ar/Content/images/imagen mensaje-min.png | igual para todos (login) | ✅ lee | uade_enrollment_guide — va como imagen con el aviso (0.6.4) |  |
| Pestaña menuImportante › menuImportante › grilla mensaje-min.png | imagen | inscripciones.uade.edu.ar/Content/images/grilla mensaje-min.png | igual para todos (login) | ✅ lee | uade_enrollment_guide — va como imagen con el aviso (0.6.4) |  |


### Sitio oficial

| Ítem | Tipo | Destino | Acceso | MCP | Tool / motivo | Estructura |
|---|---|---|---|---|---|---|
| home › / — UADE | pagina | www.uade.edu.ar/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 25 img; 8 controles que envían; 10 combos |
| sites › /sites/costa-argentina/ — UADE Costa Argentina | pagina | www.uade.edu.ar/sites/costa-argentina/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 11 img; 7 controles que envían; 10 combos |
| sites › /sites/belgrano/ — Belgrano UADE | pagina | www.uade.edu.ar/sites/belgrano/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 9 img; 4 controles que envían; 10 combos |
| sites › /sites/recoleta/ — UADE | pagina | www.uade.edu.ar/sites/recoleta/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 10 img; 4 controles que envían; 10 combos |
| agenda › /agenda/ — Agenda | pagina | www.uade.edu.ar/agenda/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 1 controles que envían |
| noticias › /noticias/ — UADE BLOG | pagina | www.uade.edu.ar/noticias/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 6 img |
| uade-faqs › /uade-faqs/ — UADE | pagina | www.uade.edu.ar/uade-faqs/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP |  |
| informacion-para › /informacion-para/ingresantes/becas/ — Becas | pagina | www.uade.edu.ar/informacion-para/ingresantes/becas/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 1 img; 2 controles que envían |
| informacion-para › /informacion-para/ingresantes/becas/cronograma-de-becas/ — Cronograma | pagina | www.uade.edu.ar/informacion-para/ingresantes/becas/cronograma-de-becas | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | tabla: Año académico a cursar en 2027 / Año / categoría / Categoría de beca / Fechas de presentación; 1 img; 2 controles que envían |
| informacion-para › /informacion-para/ingresantes/reinscripciones/ — Reinscripciones | pagina | www.uade.edu.ar/informacion-para/ingresantes/reinscripciones/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 2 controles que envían |
| /informacion-para/ingresantes/modalidades-de-pago/ | error | www.uade.edu.ar/informacion-para/ingresantes/modalidades-de-pago/ | público | ❌ no lee | lista negra: pagos |  |
| informacion-para › /informacion-para/ingresantes/sistema-de-admision/ — Sistema de Admisión | pagina | www.uade.edu.ar/informacion-para/ingresantes/sistema-de-admision/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | x_x_table_0; 3 controles que envían; 1 documentos |
| documentos › /informacion-para/ingresantes/sistema-de-admision/ › cronograma-sia-marzo-2027-e.pdf | pdf | www.uade.edu.ar/media/n1djc53r/cronograma-sia-marzo-2027-e.pdf | público | ❌ no lee |  | 8 pág., texto legible |
| informacion-para › /informacion-para/ingresantes/mencion-de-honor/ — Mención de Honor | pagina | www.uade.edu.ar/informacion-para/ingresantes/mencion-de-honor/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 2 controles que envían; 1 documentos |
| documentos › /informacion-para/ingresantes/mencion-de-honor/ › mencion-de-honor.pdf | pdf | www.uade.edu.ar/media/cvej0b5h/mencion-de-honor.pdf | público | ❌ no lee |  | 2 pág., texto legible |
| contacto › /contacto/ — Obtené información sobre las carreras UADE | pagina | www.uade.edu.ar/contacto/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 1 img; 4 controles que envían; 10 combos |
| facultad-de-ingenieria-y-ciencias-exactas › /facultad-de-ingenieria-y-ciencias-exactas/ingenieria-en-informatica/ — INGENIERÍA EN INFORMÁTICA | pagina | www.uade.edu.ar/facultad-de-ingenieria-y-ciencias-exactas/ingenieria-e | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 48 img; 6 controles que envían; 10 combos |
| acerca-de-uade › /acerca-de-uade/ayuda-al-estudiante/ — Ayuda al Estudiante | pagina | www.uade.edu.ar/acerca-de-uade/ayuda-al-estudiante/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 2 img; 2 controles que envían |
| acerca-de-uade › /acerca-de-uade/centro-deportivo-escuela/ — Centro Deportivo Escuela | pagina | www.uade.edu.ar/acerca-de-uade/centro-deportivo-escuela/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 8 img; 5 controles que envían |
| acerca-de-uade › /acerca-de-uade/cursada-intensiva/ — Cursada intensiva | pagina | www.uade.edu.ar/acerca-de-uade/cursada-intensiva/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 9 img; 6 controles que envían; 10 combos |
| acerca-de-uade › /acerca-de-uade/codigo-de-conducta/ — UADE | pagina | www.uade.edu.ar/acerca-de-uade/codigo-de-conducta/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 2 img; 2 controles que envían |
| acerca-de-uade › /acerca-de-uade/desarrollo-profesional-uade-alumni-club/desarrollo-profesional/busquedas-laborales/ — Búsquedas laborales | pagina | www.uade.edu.ar/acerca-de-uade/desarrollo-profesional-uade-alumni-club | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 4 img |
| acerca-de-uade › /acerca-de-uade/desarrollo-profesional-uade-alumni-club/desarrollo-profesional/pasantias/ — Pasantías | pagina | www.uade.edu.ar/acerca-de-uade/desarrollo-profesional-uade-alumni-club | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 5 img |
| acerca-de-uade › /acerca-de-uade/oportunidades-para-alumnos/ — Oportunidades para alumnos | pagina | www.uade.edu.ar/acerca-de-uade/oportunidades-para-alumnos/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 2 img; 2 controles que envían |
| acerca-de-uade › /acerca-de-uade/uade-housing/ — UADE Housing | pagina | www.uade.edu.ar/acerca-de-uade/uade-housing/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 1 img; 2 controles que envían |
| acerca-de-uade › /acerca-de-uade/uade-hub/ — UADE HUB | pagina | www.uade.edu.ar/acerca-de-uade/uade-hub/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 13 img; 2 controles que envían |
| uade-internacional › /uade-internacional/outgoing/ — Outgoing | pagina | www.uade.edu.ar/uade-internacional/outgoing/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 5 img; 1 controles que envían; 4 documentos |
| documentos › /uade-internacional/outgoing/ › grado-convenios-vf.pdf | pdf | www.uade.edu.ar/media/j2gofmnw/grado-convenios-vf.pdf | público | ❌ no lee |  | 38 pág., texto legible |
| documentos › /uade-internacional/outgoing/ › posgrado-convenios-uade-1.pdf | pesado | www.uade.edu.ar/media/pv4pfdap/posgrado-convenios-uade-1.pdf | público | ❌ no lee | pesa más de 10 MB: el MCP no lo descarga |  |
| documentos › /uade-internacional/outgoing/ › outgoing-oferta-académica-uade.pdf | pdf | www.uade.edu.ar/media/gnkbab10/outgoing-oferta-académica-uade.pdf | público | ❌ no lee |  | 2 pág., texto legible |
| documentos › /uade-internacional/outgoing/ › outgoing-certificados-de-idiomas-uade.pdf | pdf | www.uade.edu.ar/media/rhnkrqys/outgoing-certificados-de-idiomas-uade.p | público | ❌ no lee |  | 5 pág., texto legible |
| uade-internacional › /uade-internacional/outgoing/postulacion/ — Postulación | pagina | www.uade.edu.ar/uade-internacional/outgoing/postulacion/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 1 img; 2 documentos |
| documentos › /uade-internacional/outgoing/postulacion/ › compromiso_estudiante_intercambio_25.docx | office (zip) | www.uade.edu.ar/media/xfbbpyu2/compromiso_estudiante_intercambio_25.do | público | ❌ no lee |  |  |
| minors › /minors/ — Minors | pagina | www.uade.edu.ar/minors/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP |  |
| aviso-legal-web-campus › /aviso-legal-web-campus/ — Aviso legal Web Campus | pagina | www.uade.edu.ar/aviso-legal-web-campus/ | público | ❌ no lee | www.uade.edu.ar no está en la allowlist del MCP | 3 img; 4 controles que envían; 10 combos |


### PIA

| Ítem | Tipo | Destino | Acceso | MCP | Tool / motivo | Estructura |
|---|---|---|---|---|---|---|
| PIA (inscripcionespia.uade.edu.ar y pia.uade.edu.ar) | no seguido | inscripcionespia.uade.edu.ar/ | personal | 🟡 lee mal | pia_class_search, pia_prepare_enrollment, pia_add_to_cart, uade_open_enrollment_site — la búsqueda de clases responde 401 en vivo con el link firmado — no se recorre: su puerta pide la contraseña personal. Resumen de inscripción y carrito con confirmación en la ventana de la persona, que aprieta Finalizar |  |

<!-- inventario:fin -->

## Huecos priorizados

Qué preguntaría un alumno que hoy no se responde o se responde mal, de más a menos importante. Cada
uno está confirmado con la tool que debería responderlo (07/11/2026).

1. ~~**"¿Qué temas entran, cómo se aprueba, qué bibliografía tiene X?"**~~ **Resuelto en 0.7.0** con
   `webcampus_course_program`. El programa de cada materia es
   un PDF con texto legible (5 páginas en el aula de ejemplo) y **ninguna tool lo lee**. COBERTURA lo
   daba por difícil (combos en cascada de "Información de Materias"), pero hay un camino directo:
   `Contenidos/DownloadPrograma.aspx?IdMateria=<código>` redirige a `/Programas/<código>_<materia>_<fecha>.pdf`
   para **cualquier** materia, no solo las que se cursan (probado con tres códigos de otra carrera).
   Los códigos salen de la lista de materias de cada carrera (`PlanesEstudioListaMaterias.aspx`, ver
   el punto 5) o del historial. Igual para todos, detrás del login. Arreglo: una tool de solo lectura
   con el código o el nombre de la materia. Hecho: el redirect necesita `VieneDe=P` (sin eso, página
   vacía); `EsVirtual=True` da el programa de la modalidad virtual, y un código sin programa va a
   `/Archivo404.aspx`. Por nombre se resuelve solo dentro del plan propio; para otra carrera hace
   falta el código hasta que se lea el punto 5.
2. ~~**"¿Qué necesito para promocionar o rendir previo?" y otros avisos en PDF sin texto.**~~ **Resuelto en
   0.6.4.** `webcampus_news link=`, `webcampus_section` (y sus guías) y `uade_academic_calendar` pasan por
   un solo camino (`textoOImagenes`, `sources/docs/legible.ts`): texto si se lee; si no tiene texto y trae
   fotos, las fotos; si no, las páginas dibujadas; si nada sale, un aviso con el link. Vestimenta del
   gimnasio y números ante emergencias llegan como imagen. Queda 🟡 *Requisitos de promociones y
   previos*: no es un dibujo sino 7 fotos **JPEG 2000**, que el pdf.js de `unpdf` no decodifica (trae
   recortado el cargador de `openjpeg.wasm`); la página saldría en blanco, así que no se manda y se da el
   link. Arreglo posible: decodificar JPX con el `openjpeg.wasm` de `pdfjs-dist` de la misma versión.
3. ~~**Avisos de inscripción que están en una imagen.**~~ **Resuelto en 0.6.4.** `uade_enrollment_guide`
   baja las imágenes de los avisos de *Importante* (mismo sitio, hasta 6, 1,5 MB cada una), las manda
   como imagen y marca con `[imagen N]` dónde estaba cada una: el aviso de las modalidades nuevas sigue
   en la grilla que muestra cómo se ven en la oferta.
4. **"¿Con qué universidades hay convenio de intercambio?"** `webcampus_section intercambio` responde
   "(no se pudo leer)" para `convenios.pdf` y `convenioposgrado.pdf`: pesan más de 10 MB. El sitio
   oficial tiene una versión liviana y legible del de grado (`grado-convenios-vf.pdf`, 38 páginas,
   texto legible); la de posgrado también pasa los 10 MB. Arreglo: el PDF del sitio oficial (ver
   candidatos) o un tope mayor solo para PDFs públicos de dre.
5. **"¿Qué materias tiene la carrera X o la doble titulación Y?"** (cambio de carrera, doble título,
   materias de otra carrera). "Carreras – Materias" enlaza una página por carrera
   (`PlanesEstudioListaMaterias.aspx`, tablas `tbl_Materias`, `tblNotas`, `tblHorarios`) y
   `webcampus_section carreras` solo lee el índice: devuelve nombres de carreras, no materias, y lo
   recorta (9.480 caracteres, tope 8.000). El MCP solo conoce el plan propio (historial).
6. **Secciones recortadas sin `query`.** Deportes (11.380 caracteres) y Carreras (9.480) pasan el tope
   de 8.000 de `webcampus_section`. Con `query` se encuentra lo que se busca; sin `query` el final de la
   página no llega. Menor: el modelo ya pasa `query` casi siempre.
7. **Sitio oficial.** Nada de www.uade.edu.ar se lee (no está en la allowlist). Lo que **solo** está
   ahí y le sirve a quien cursa: cronograma de becas, reinscripciones, preguntas frecuentes, sedes con
   direcciones, pasantías y búsquedas laborales, cursada intensiva. El resto (becas, código de
   conducta, ayuda al estudiante, mención de honor, housing) está también en WebCampus y ya se lee.
   Formas de pago no se recorrió: la URL cae en la lista negra de pagos del MCP.
8. **Menores, sin pregunta concreta hoy:** zona de alertas del home (`Pnl_Alertas`, `popUpMatVen`)
   sin parser y vacía en esta cuenta; historial de novedades del aula todavía sin un ejemplo con
   contenido; "Simulación de equivalencias" (`infousu.aspx`) llega sin contenido por GET (se arma con
   scripts); la búsqueda de clases de PIA sigue en 401 en vivo; el cuadernillo de comprensión de
   textos del SIA (66 páginas, legible) no lo lee ninguna tool.

Lo que el inventario corrigió de COBERTURA: Housing ya no pesa más de 10 MB (hoy es `residencia.pdf`,
una página, y se lee). Y "Información de Materias" no hace falta recorrerla con los combos (punto 1).

## Candidatos a base pública

Lo que es igual para todos y está en el sitio oficial sin login, para una base que se actualice sola
(GitHub Actions) y que el MCP lea sin sesión. Todo tiene URL fija o una página índice estable.

| Documento | Dónde | Hoy | Por qué conviene |
|---|---|---|---|
| Calendario académico (índice + 12 PDFs por sede, cuatrimestre y feriados) | dre.uade.edu.ar/calendario.pdf y `calendario/…` | ✅ `uade_academic_calendar`, con sesión para llegar al índice | El índice y los PDFs son públicos: no hace falta WebCampus para llegar |
| Cronogramas de inscripción (índice + 13 PDFs; 5 sin texto legible) | dre.uade.edu.ar/cronogramasUADE.pdf y `PDFs/Cronograma de inscripciones/…` | ✅ como imagen | Renderizar las páginas ilegibles una vez por cuatrimestre en la Action, y no en cada compu |
| Aranceles (PDF vigente) | SharePoint, enlazado desde Aranceles | ✅ `uade_tuition` | Cambia por cuatrimestre; el link pide sesión de SharePoint: conviene si UADE lo publica también en dre |
| MRI (cuatrimestre, verano, condiciones), hotel escuela | dre.uade.edu.ar/mri2c2026.pdf, mriver27.pdf, condicionesmri.pdf, hotelescuela.pdf | ✅ | Públicos y con texto |
| Normativa académica, guía institucional, código de conducta, compromiso, vestimenta, protocolo, lineamientos de IA | dre.uade.edu.ar (normas.pdf, GuiaAluBA.pdf, …) | ✅ `webcampus_section` | Públicos; hoy se llega con sesión al menú |
| Optativas y minors | dre.uade.edu.ar/WebCampus/Optativas y Minors/… | ✅ | 71 y 32 páginas: buenos para buscar sin bajarlos cada vez |
| Mención de honor, guía de ingreso, reglamento del centro deportivo, AYUES, residencia | dre.uade.edu.ar | ✅ | Públicos |
| Avisos en banners con PDF (horarios semanales, cambio/alta, vestimenta del gym, requisitos de promociones y previos) | dre.uade.edu.ar | ✅ / 🟡 | Cambian seguido; desde 0.6.4 el del gym va como imagen; el de promociones (JPEG 2000) sigue solo con link |
| Números ante emergencias | dre.uade.edu.ar/emergencia.pdf | ✅ como imagen (0.6.4) | — |
| Convenios de intercambio de grado | www.uade.edu.ar/media/…/grado-convenios-vf.pdf | ❌ | Versión liviana y legible del que en WebCampus pesa más de 10 MB |
| Oferta académica y certificados de idioma de intercambio, FAQ de outgoing | www.uade.edu.ar/media/… | ❌ (la oferta sí, por dre) | Públicos |
| Cronograma de becas, reinscripciones, preguntas frecuentes, sedes | www.uade.edu.ar (páginas) | ❌ | Solo están ahí |
| Cronograma del SIA | www.uade.edu.ar/media/…/cronograma-sia-marzo-2027-e.pdf | ❌ | Para ingresantes y para quien rinde ENI |

**No van a la base** (igual para todos pero detrás del login, se siguen leyendo en vivo con la sesión
de cada uno): programas de materias, lista de materias por carrera, oferta de clases, clases de
consulta, novedades y agenda del home, pestañas del sitio de inscripciones. **Nunca se centraliza**
lo personal: cursada, historial, asistencia, cuenta corriente, comprobantes, marcaciones, ventanas de
inscripción y todo PIA.
