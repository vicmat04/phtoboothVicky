/**
 * ============================================================
 * Módulo B: Motor de Collage Premium — Gold & Black Edition
 * ============================================================
 *
 * Arquitectura "frame-on-top":
 *   1. Fondo negro
 *   2. 4 fotos dibujadas en las posiciones exactas de los huecos
 *   3. El frame PNG (con canal alpha) se pone ENCIMA
 *      — sus transparencias dejan ver las fotos de abajo.
 *
 * Coordenadas detectadas con pixel-scan sobre el alpha channel
 * de la imagen 4267x6400:
 *
 *   Col Izq:  x 300  → 2050  (1750px ancho)
 *   Col Der:  x 2250 → 4000  (1750px ancho)
 *   Fila Sup: y 1600 → 3450  (1850px alto)
 *   Fila Inf: y 3650 → 5600  (1950px alto)
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del motor
// ─────────────────────────────────────────────

const CANVAS_W     = 4267;
const CANVAS_H     = 6400;
const JPEG_QUALITY = 0.92;
const OUTPUT_MIME  = 'image/jpeg';

// ─── Coordenadas exactas (pixel-scan del alpha channel) ───────
const GRID_CELLS = [
  { x: 300,  y: 1600, width: 1750, height: 1850 }, // Fila 1 - Izq
  { x: 2250, y: 1600, width: 1750, height: 1850 }, // Fila 1 - Der
  { x: 300,  y: 3650, width: 1750, height: 1950 }, // Fila 2 - Izq
  { x: 2250, y: 3650, width: 1750, height: 1950 }, // Fila 2 - Der
];

// ─────────────────────────────────────────────
// Funciones auxiliares
// ─────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen del collage.'));
    img.src = src;
  });
}

/**
 * Dibuja una imagen con object-fit: cover dentro del rectángulo
 * destino — recorte centrado, sin deformación.
 */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = dw / dh;
  let sx, sy, sw, sh;

  if (srcRatio > dstRatio) {
    // Recortar ancho
    sh = img.naturalHeight;
    sw = sh * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    // Recortar alto
    sw = img.naturalWidth;
    sh = sw / dstRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

/**
 * Genera el collage premium.
 *
 * @param {string[]} photosBase64  — Array de 4 DataURLs JPEG.
 * @param {string}   backgroundUrl — URL del frame PNG (con alpha).
 * @param {object}   [options={}]
 * @returns {Promise<Blob|string>}
 */
export async function generateQuinceCollage(
  photosBase64,
  backgroundUrl,
  options = {}
) {
  if (!Array.isArray(photosBase64) || photosBase64.length < 1) {
    throw new Error('Se requieren fotos para generar el collage.');
  }

  // ─── Canvas ───────────────────────────────
  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx     = canvas.getContext('2d');

  // ─── CAPA 1: Fondo negro ──────────────────
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ─── Carga asíncrona paralela ─────────────
  const [frameImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, 4).map(loadImage),
  ]);

  // ─── CAPA 2: Fotos en posición exacta ─────
  // Se dibujan ANTES del frame para que queden detrás.
  photoImgs.forEach((photo, i) => {
    const { x, y, width, height } = GRID_CELLS[i];
    ctx.save();
    drawImageCover(ctx, photo, x, y, width, height);
    ctx.restore();
  });

  // ─── CAPA 3: Frame encima (con alpha) ─────
  // Los huecos transparentes del frame revelan las fotos de abajo.
  ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);

  // ─── Exportar ─────────────────────────────
  const format = options.format || 'blob';

  if (format === 'dataurl') {
    return canvas.toDataURL(OUTPUT_MIME, JPEG_QUALITY);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new Error('Error al convertir el canvas a Blob.')),
      OUTPUT_MIME,
      JPEG_QUALITY
    );
  });
}
