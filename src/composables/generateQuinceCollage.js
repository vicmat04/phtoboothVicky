/**
 * ============================================================
 * Módulo B: Procesamiento de Imagen — Photobook Digital
 * ============================================================
 *
 * Función: generateQuinceCollage
 *
 * Genera un collage de 1080×1080px con:
 *   1. Imagen de fondo (background) como capa inferior
 *   2. 4 fotos en cuadrícula 2×2 encima del fondo
 *
 * Cambio vs versión anterior:
 *   ANTES: fotos primero → frame/overlay encima (PNG transparente)
 *   AHORA: background primero → fotos encima (imagen de diseño completo)
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del módulo
// ─────────────────────────────────────────────

/** Dimensiones del canvas final (proporción 1:1) */
const CANVAS_SIZE = 1080;

/** Calidad de exportación JPEG (0.0 – 1.0) */
const JPEG_QUALITY = 0.9;

/** Formato MIME de salida */
const OUTPUT_MIME = 'image/jpeg';

// ─────────────────────────────────────────────
// Funciones auxiliares
// ─────────────────────────────────────────────

/**
 * Carga una imagen de forma asíncrona a partir de una URL o un
 * string Base64. Envuelve el patrón clásico Image.onload / onerror
 * en una Promise limpia.
 *
 * @param {string} src — URL absoluta o Data URL (base64) de la imagen.
 * @returns {Promise<HTMLImageElement>} — Imagen completamente cargada.
 * @throws {Error} — Si la imagen no puede cargarse.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src.substring(0, 80)}…`));
    img.src = src;
  });
}

/**
 * Dibuja una imagen dentro de un rectángulo destino usando la lógica
 * equivalente a CSS `object-fit: cover` (recorte centrado sin deformación).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement}         img
 * @param {number} destX — X del destino en el canvas
 * @param {number} destY — Y del destino en el canvas
 * @param {number} destW — Ancho del destino
 * @param {number} destH — Alto del destino
 */
function drawImageCover(ctx, img, destX, destY, destW, destH) {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  const imgRatio  = imgW / imgH;
  const cellRatio = destW / destH;

  let srcX, srcY, srcW, srcH;

  if (imgRatio > cellRatio) {
    // Imagen más ancha que la celda → recortar lados
    srcH = imgH;
    srcW = imgH * cellRatio;
    srcX = (imgW - srcW) / 2;
    srcY = 0;
  } else {
    // Imagen más alta que la celda → recortar arriba/abajo
    srcW = imgW;
    srcH = imgW / cellRatio;
    srcX = 0;
    srcY = (imgH - srcH) / 2;
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

/**
 * Genera el collage del evento con fondo de diseño y fotos superpuestas.
 *
 * Flujo de renderizado:
 * ─────────────────────
 *  1. Crear canvas offscreen de 1080×1080.
 *  2. Cargar el fondo + las 4 fotos en paralelo (Promise.all).
 *  3. Dibujar el fondo completo (capa inferior).
 *  4. Dibujar cada foto en su celda con lógica "cover" (encima del fondo).
 *  5. Exportar como JPEG de alta calidad (Blob o DataURL).
 *
 * @param {string[]} photosBase64
 *   Array con exactamente 4 strings (Data URLs JPEG) de las fotos capturadas.
 *   Orden: [0] Sup-Izq · [1] Sup-Der · [2] Inf-Izq · [3] Inf-Der
 *
 * @param {string} backgroundUrl
 *   URL de la imagen de fondo del diseño (PNG o JPG).
 *   Se dibuja como capa INFERIOR, debajo de las fotos.
 *
 * @param {object} [options={}]
 *   @param {'blob'|'dataurl'} [options.format='blob'] — Formato de salida.
 *   @param {object[]} [options.cells] — Layout personalizado. Si no se pasa,
 *     se usa la cuadrícula 2×2 por defecto.
 *     Cada cell: { x, y, width, height }
 *
 * @returns {Promise<Blob | string>}
 */
export async function generateQuinceCollage(
  photosBase64,
  backgroundUrl,
  options = {}
) {
  // ─── Validación ─────────────────────────────────────────
  if (!Array.isArray(photosBase64) || photosBase64.length < 1) {
    throw new Error(
      `Se requiere al menos 1 imagen. Recibidas: ${
        Array.isArray(photosBase64) ? photosBase64.length : typeof photosBase64
      }`
    );
  }

  if (!backgroundUrl || typeof backgroundUrl !== 'string') {
    throw new Error('Se requiere la URL de la imagen de fondo (backgroundUrl).');
  }

  // ─── Layout de celdas ───────────────────────────────────
  // Por defecto: cuadrícula 2×2, cada celda de 540×540px.
  // Se puede sobreescribir con options.cells para otros layouts.
  const CELL = CANVAS_SIZE / 2; // 540px

  const defaultCells = [
    { x: 0,    y: 0,    width: CELL, height: CELL },  // Sup-Izq
    { x: CELL, y: 0,    width: CELL, height: CELL },  // Sup-Der
    { x: 0,    y: CELL, width: CELL, height: CELL },  // Inf-Izq
    { x: CELL, y: CELL, width: CELL, height: CELL },  // Inf-Der
  ];

  const cells = options.cells || defaultCells;

  // Limitamos las fotos a la cantidad de celdas disponibles
  const photoCount = Math.min(photosBase64.length, cells.length);

  // ─── Canvas offscreen ────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  // Fondo negro como fallback de seguridad
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── Carga en paralelo: fondo + fotos ────────────────────
  const [backgroundImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, photoCount).map(loadImage),
  ]);

  // ─── CAPA 1: Imagen de fondo completa ────────────────────
  // Se dibuja primero, ocupando todo el canvas.
  ctx.drawImage(backgroundImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── CAPA 2: Fotos encima del fondo ──────────────────────
  // Cada foto se coloca en su celda correspondiente del layout,
  // usando object-fit: cover para evitar deformaciones.
  photoImgs.forEach((photo, index) => {
    const { x, y, width, height } = cells[index];
    drawImageCover(ctx, photo, x, y, width, height);
  });

  // ─── Exportar resultado ──────────────────────────────────
  const format = options.format || 'blob';

  if (format === 'dataurl') {
    return canvas.toDataURL(OUTPUT_MIME, JPEG_QUALITY);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Error al generar el Blob del collage.'));
      },
      OUTPUT_MIME,
      JPEG_QUALITY
    );
  });
}
