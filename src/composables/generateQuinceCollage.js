/**
 * ============================================================
 * Módulo B: Motor de Collage Premium — Los XI de Vicky
 * ============================================================
 *
 * Genera un collage de 1080×1080px con diseño editorial:
 *   1. Imagen de fondo (background) como capa base
 *   2. 4 fotos con márgenes, bordes dorados y esquinas redondeadas
 *   3. Tipografía decorativa: título + fecha dibujados en canvas
 *   4. Viñeta cinematográfica para profundidad
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del motor
// ─────────────────────────────────────────────

const CANVAS_SIZE  = 1080;
const JPEG_QUALITY = 0.92;
const OUTPUT_MIME  = 'image/jpeg';

// ─── Layout premium ──────────────────────────
// Estas constantes controlan el "aire" del diseño.

const OUTER_PAD   = 48;    // margen exterior del canvas
const GAP         = 14;    // separación entre fotos
const HEADER_H    = 140;   // espacio para el título superior
const FOOTER_H    = 70;    // espacio para la fecha inferior
const PHOTO_R     = 14;    // radio de las esquinas redondeadas
const BORDER_W    = 2.5;   // grosor del borde dorado

// Colores del tema bosque encantado
const GOLD          = '#d4a853';
const GOLD_FAINT    = 'rgba(212, 168, 83, 0.35)';
const DARK_OVERLAY  = 'rgba(0, 0, 0, 0.35)';

// ─────────────────────────────────────────────
// Funciones auxiliares
// ─────────────────────────────────────────────

/**
 * Carga una imagen de forma asíncrona (URL o DataURL).
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
 * Dibuja una imagen con lógica object-fit: cover dentro de
 * un rectángulo destino (recorte centrado sin deformación).
 */
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

/**
 * Traza un rectángulo redondeado (sin dibujar — solo path).
 * Compatible con todos los navegadores (no usa roundRect nativo).
 */
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Dibuja una foto con esquinas redondeadas, borde dorado
 * y sombra interior (inset shadow).
 */
function drawPremiumPhoto(ctx, img, x, y, w, h) {
  // ── Sombra exterior (drop shadow sutil) ──
  ctx.save();
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur    = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  // Fondo oscuro detrás de la foto (para que la sombra se renderice)
  roundedRectPath(ctx, x, y, w, h, PHOTO_R);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // ── Foto con clip de esquinas redondeadas ──
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, PHOTO_R);
  ctx.clip();
  drawImageCover(ctx, img, x, y, w, h);

  // ── Inner shadow (sutil — da profundidad) ──
  const insetGrad = ctx.createRadialGradient(
    x + w / 2, y + h / 2, Math.min(w, h) * 0.35,
    x + w / 2, y + h / 2, Math.max(w, h) * 0.72
  );
  insetGrad.addColorStop(0, 'rgba(0,0,0,0)');
  insetGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = insetGrad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // ── Borde dorado ──
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, PHOTO_R);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = BORDER_W;
  ctx.stroke();
  ctx.restore();

  // ── Borde interior translúcido (highlight sutil) ──
  ctx.save();
  roundedRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, PHOTO_R - 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Dibuja la viñeta cinematográfica (esquinas oscuras → centro limpio).
 */
function drawVignette(ctx, size) {
  const vignette = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.28,
    size / 2, size / 2, size * 0.7
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,0.08)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
}

/**
 * Dibuja texto centrado con sombra y estilo premium.
 */
function drawCenteredText(ctx, text, y, options = {}) {
  const {
    font      = '700 34px Cinzel, Georgia, serif',
    color     = GOLD,
    shadowBlr = 12,
    shadowClr = 'rgba(212, 168, 83, 0.5)',
  } = options;

  ctx.save();
  ctx.font         = font;
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = shadowClr;
  ctx.shadowBlur   = shadowBlr;

  ctx.fillText(text, CANVAS_SIZE / 2, y);
  ctx.restore();
}

/**
 * Dibuja una línea decorativa horizontal (filigrana dorada).
 */
function drawOrnamentLine(ctx, y, width) {
  const x0 = (CANVAS_SIZE - width) / 2;
  const x1 = x0 + width;

  ctx.save();
  ctx.strokeStyle = GOLD_FAINT;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();

  // Diamante central
  const cx = CANVAS_SIZE / 2;
  const ds = 4;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cx,      y - ds);
  ctx.lineTo(cx + ds, y);
  ctx.lineTo(cx,      y + ds);
  ctx.lineTo(cx - ds, y);
  ctx.closePath();
  ctx.fill();

  // Puntos extremos
  [x0, x1].forEach((px) => {
    ctx.beginPath();
    ctx.arc(px, y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

/**
 * Genera el collage premium del evento.
 *
 * @param {string[]}  photosBase64  — Array de 4 DataURLs JPEG.
 * @param {string}    backgroundUrl — URL de la imagen de fondo.
 * @param {object}    [options={}]
 * @param {'blob'|'dataurl'} [options.format='blob']
 * @param {object[]}  [options.cells] — Layout personalizado (override).
 * @returns {Promise<Blob|string>}
 */
export async function generateQuinceCollage(
  photosBase64,
  backgroundUrl,
  options = {}
) {
  // ─── Validación ─────────────────────────────
  if (!Array.isArray(photosBase64) || photosBase64.length < 1) {
    throw new Error(`Se requiere al menos 1 imagen. Recibidas: ${
      Array.isArray(photosBase64) ? photosBase64.length : typeof photosBase64
    }`);
  }
  if (!backgroundUrl || typeof backgroundUrl !== 'string') {
    throw new Error('Se requiere la URL de la imagen de fondo.');
  }

  // ─── Calcular layout de celdas ──────────────
  const gridTop    = HEADER_H;
  const gridLeft   = OUTER_PAD;
  const gridRight  = CANVAS_SIZE - OUTER_PAD;
  const gridBottom = CANVAS_SIZE - FOOTER_H;
  const gridW      = gridRight - gridLeft;
  const gridH      = gridBottom - gridTop;
  const cellW      = (gridW - GAP) / 2;
  const cellH      = (gridH - GAP) / 2;

  const defaultCells = [
    { x: gridLeft,               y: gridTop,                width: cellW, height: cellH },
    { x: gridLeft + cellW + GAP, y: gridTop,                width: cellW, height: cellH },
    { x: gridLeft,               y: gridTop + cellH + GAP,  width: cellW, height: cellH },
    { x: gridLeft + cellW + GAP, y: gridTop + cellH + GAP,  width: cellW, height: cellH },
  ];

  const cells      = options.cells || defaultCells;
  const photoCount = Math.min(photosBase64.length, cells.length);

  // ─── Canvas ─────────────────────────────────
  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx     = canvas.getContext('2d');

  // Fondo negro de fallback
  ctx.fillStyle = '#020702';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── Carga en paralelo ──────────────────────
  const [bgImg, ...photoImgs] = await Promise.all([
    loadImage(backgroundUrl),
    ...photosBase64.slice(0, photoCount).map(loadImage),
  ]);

  // ─── CAPA 1: Background completo ───────────
  ctx.drawImage(bgImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── CAPA 2: Overlay semi-oscuro detrás de las fotos ──
  // Da contraste para que el texto y los marcos resalten.
  ctx.fillStyle = 'rgba(0, 8, 0, 0.2)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── CAPA 3: Línea decorativa superior ──────
  drawOrnamentLine(ctx, HEADER_H - 18, 300);

  // ─── CAPA 4: Título "Los XI de Vicky" ───────
  drawCenteredText(ctx, 'Los XI de Vicky', 58, {
    font:      '700 42px Cinzel, Georgia, serif',
    color:     GOLD,
    shadowBlr: 20,
    shadowClr: 'rgba(212, 168, 83, 0.6)',
  });

  // Subtítulo decorativo
  drawCenteredText(ctx, '✦  Bosque Encantado  ✦', 100, {
    font:      '400 15px Cinzel, Georgia, serif',
    color:     'rgba(212, 168, 83, 0.7)',
    shadowBlr: 8,
    shadowClr: 'rgba(212, 168, 83, 0.3)',
  });

  // ─── CAPA 5: Fotos premium ──────────────────
  photoImgs.forEach((photo, i) => {
    const { x, y, width, height } = cells[i];
    drawPremiumPhoto(ctx, photo, x, y, width, height);
  });

  // ─── CAPA 6: Línea decorativa inferior ──────
  drawOrnamentLine(ctx, CANVAS_SIZE - FOOTER_H + 14, 200);

  // ─── CAPA 7: Fecha + footer ─────────────────
  drawCenteredText(ctx, '18 de Abril · 2026', CANVAS_SIZE - 34, {
    font:      '400 18px Cinzel, Georgia, serif',
    color:     'rgba(212, 168, 83, 0.85)',
    shadowBlr: 10,
    shadowClr: 'rgba(212, 168, 83, 0.4)',
  });

  // ─── CAPA 8: Viñeta cinematográfica ─────────
  drawVignette(ctx, CANVAS_SIZE);

  // ─── Exportar ───────────────────────────────
  const format = options.format || 'blob';

  if (format === 'dataurl') {
    return canvas.toDataURL(OUTPUT_MIME, JPEG_QUALITY);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Error al generar el Blob.')),
      OUTPUT_MIME,
      JPEG_QUALITY
    );
  });
}
