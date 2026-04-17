/**
 * ============================================================
 * Módulo B: Motor de Collage Premium — Gold & Black Edition
 * ============================================================
 *
 * Adaptado para el diseño vertical de "Los XI de Ana Victoria".
 * Ajusta 4 fotos en una grilla 2x2 dentro de marcos dorados.
 *
 * La imagen del fondo es 4267x6400 — usamos esas dimensiones
 * reales para que las coordenadas sean exactas y no haya
 * distorsión o mala alineación al escalar.
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del motor (Resolución real del asset)
// ─────────────────────────────────────────────

const CANVAS_W     = 4267;
const CANVAS_H     = 6400;
const JPEG_QUALITY = 0.92;
const OUTPUT_MIME  = 'image/jpeg';

// ─── Layout de Grilla 2x2 ──────────────────────
//
// Coordenadas calculadas SOBRE el asset de 4267x6400.
//
// Estructura visual del fondo:
//   0      → ~1100: Título "Los XI de Ana Victoria"
//   1100   → ~3510: Fila superior (2 marcos)
//   3510   → ~3760: Separador dorado central
//   3760   → ~6100: Fila inferior (2 marcos)
//   6100   → 6400:  Footer "18 de abril de 2026"
//
// Márgenes laterales del diseño: ~260px c/u
// Gap entre columnas: ~220px
// Cada celda: ~1890 × ~2340 px

const GRID_CELLS = [
  { x: 260,  y: 1100, width: 1890, height: 2380 }, // Fila 1 - Izq
  { x: 2370, y: 1100, width: 1890, height: 2380 }, // Fila 1 - Der
  { x: 260,  y: 3750, width: 1890, height: 2380 }, // Fila 2 - Izq
  { x: 2370, y: 3750, width: 1890, height: 2380 }, // Fila 2 - Der
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

  // Fondo negro de fallback
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Carga asíncrona en paralelo
  const [bgImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, 4).map(loadImage),
  ]);

  // CAPA 1: Background a resolución completa
  ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);

  // CAPA 2: Fotos dentro de los marcos dorados
  photoImgs.forEach((photo, i) => {
    const { x, y, width, height } = GRID_CELLS[i];

    ctx.save();
    // Inset de 8px (a esta resolución) para respetar el borde dorado
    drawImageCover(ctx, photo, x + 8, y + 8, width - 16, height - 16);

    // Sombra interna sutil para dar profundidad
    const grad = ctx.createRadialGradient(
      x + width / 2, y + height / 2, width * 0.3,
      x + width / 2, y + height / 2, width * 0.75
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  });

  // ─── Exportar ──────────────────────────────
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
