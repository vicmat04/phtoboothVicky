/**
 * ============================================================
 * Módulo B: Motor de Collage Premium — Film Strip Edition
 * ============================================================
 *
 * Adaptado para el diseño de "Los XI de Ana Victoria".
 * Ajusta 4 fotos exactamente sobre los recuadros blancos de
 * los rollos de película (film strips).
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del motor (Ajustadas a 1024x682)
// ─────────────────────────────────────────────

const CANVAS_W     = 1024;
const CANVAS_H     = 682;
const JPEG_QUALITY = 0.95;
const OUTPUT_MIME  = 'image/jpeg';

// ─── Layout de Film Strips ────────────────────
// Coordenadas calculadas para el diseño enviado

const FILM_CELLS = [
  { x: 312, y: 142, width: 198, height: 148 }, // Top-Left
  { x: 510, y: 142, width: 198, height: 148 }, // Top-Right
  { x: 318, y: 396, width: 198, height: 148 }, // Bottom-Left
  { x: 516, y: 396, width: 198, height: 148 }, // Bottom-Right
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
  // ─── Validación ─────────────────────────────
  if (!Array.isArray(photosBase64) || photosBase64.length < 1) {
    throw new Error(`Se requieren fotos para generar el collage.`);
  }

  // ─── Canvas ─────────────────────────────────
  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx     = canvas.getContext('2d');

  // Fondo base
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ─── Carga en paralelo ──────────────────────
  const [bgImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, 4).map(loadImage),
  ]);

  // ─── CAPA 1: Background completo de Vicky ───
  ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);

  // ─── CAPA 2: Fotos en Film Strips ───────────
  photoImgs.forEach((photo, i) => {
    const { x, y, width, height } = FILM_CELLS[i];
    
    ctx.save();
    // Dibujamos la foto. Usamos un pequeño margen para no tocar
    // los bordes negros del film strip si la alineación no es perfecta.
    drawImageCover(ctx, photo, x + 1, y + 1, width - 2, height - 2);
    
    // Opcional: Una sombra interior muy tenue para darle profundidad
    const grad = ctx.createRadialGradient(
      x + width/2, y + height/2, width*0.3,
      x + width/2, y + height/2, width*0.7
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  });

  // ─── Exportar ───────────────────────────────
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
