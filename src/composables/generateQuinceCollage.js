/**
 * ============================================================
 * Módulo B: Motor de Collage Premium — Gold & Black Edition
 * ============================================================
 *
 * Adaptado para el diseño vertical de "Los XI de Ana Victoria".
 * Ajusta 4 fotos en una grilla 2x2 dentro de marcos dorados.
 * Proporción de salida: 682x1024 (Vertical).
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del motor (Vertical: 682x1024)
// ─────────────────────────────────────────────

const CANVAS_W     = 682;
const CANVAS_H     = 1024;
const JPEG_QUALITY = 0.95;
const OUTPUT_MIME  = 'image/jpeg';

// ─── Layout de Grilla 2x2 ──────────────────
// Coordenadas calculadas para el diseño vertical Black & Gold

const GRID_CELLS = [
  { x: 53,  y: 246, width: 280, height: 298 }, // Fila 1 - Izq (Ajustado)
  { x: 349, y: 246, width: 280, height: 298 }, // Fila 1 - Der (Ajustado)
  { x: 53,  y: 562, width: 280, height: 298 }, // Fila 2 - Izq (Ajustado)
  { x: 349, y: 562, width: 280, height: 298 }, // Fila 2 - Der (Ajustado)
];

// ─────────────────────────────────────────────
// Funciones auxiliares
// ─────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen del collage.`));
    img.src = src;
  });
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = dw / dh;
  let sx, sy, sw, sh;

  if (ir > cr) {
    sh = img.naturalHeight;
    sw = sh * cr;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / cr;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

export async function generateQuinceCollage(
  photosBase64,
  backgroundUrl,
  options = {}
) {
  if (!Array.isArray(photosBase64) || photosBase64.length < 1) {
    throw new Error(`Se requieren fotos para generar el collage.`);
  }

  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx     = canvas.getContext('2d');

  // Fondo base negro
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Carga asíncrona
  const [bgImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, 4).map(loadImage),
  ]);

  // CAPA 1: Background Vertical (682x1024)
  ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);

  // CAPA 2: Fotos en marcos dorados
  photoImgs.forEach((photo, i) => {
    const { x, y, width, height } = GRID_CELLS[i];
    
    ctx.save();
    // Dibujamos con un pequeño inset de 1.5px para no tapar el brillo del marco dorado
    drawImageCover(ctx, photo, x + 1.5, y + 1.5, width - 3, height - 3);
    
    // Ambientación: Sombra interna sutil
    const grad = ctx.createRadialGradient(
      x + width/2, y + height/2, width*0.3,
      x + width/2, y + height/2, width*0.7
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  });

  const format = options.format || 'blob';

  if (format === 'dataurl') {
    return canvas.toDataURL(OUTPUT_MIME, JPEG_QUALITY);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Error al generar el collage.')),
      OUTPUT_MIME,
      JPEG_QUALITY
    );
  });
}
