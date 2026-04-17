/**
 * ============================================================
 * Módulo B: Procesamiento de Imagen — Photobook Digital
 * ============================================================
 *
 * Función: generateQuinceCollage
 *
 * Genera un collage de 1080×1080px con 4 fotos en cuadrícula 2×2
 * y superpone un marco decorativo (overlay) sobre el resultado.
 *
 * @module generateQuinceCollage
 */

// ─────────────────────────────────────────────
// Constantes del módulo
// ─────────────────────────────────────────────

/** Dimensiones del canvas final (proporción 1:1) */
const CANVAS_SIZE = 1080;

/** Dimensiones de cada celda de la cuadrícula 2×2 */
const CELL_SIZE = CANVAS_SIZE / 2; // 540px

/** Calidad de exportación JPEG (0.0 – 1.0) */
const JPEG_QUALITY = 0.9;

/** Formato MIME de salida */
const OUTPUT_MIME = 'image/jpeg';

/**
 * Posiciones [x, y] de cada celda en la cuadrícula 2×2.
 *
 *  ┌────────────┬────────────┐
 *  │  [0]       │  [1]       │
 *  │  Sup-Izq   │  Sup-Der   │
 *  ├────────────┼────────────┤
 *  │  [2]       │  [3]       │
 *  │  Inf-Izq   │  Inf-Der   │
 *  └────────────┴────────────┘
 */
const GRID_POSITIONS = [
  { x: 0,         y: 0 },         // Superior Izquierda
  { x: CELL_SIZE, y: 0 },         // Superior Derecha
  { x: 0,         y: CELL_SIZE },  // Inferior Izquierda
  { x: CELL_SIZE, y: CELL_SIZE },  // Inferior Derecha
];

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

    // Permitir carga cross-origin si la fuente es una URL externa
    // (necesario para evitar "tainted canvas" al exportar).
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`No se pudo cargar la imagen: ${src.substring(0, 80)}…`));

    img.src = src;
  });
}

/**
 * Dibuja una imagen dentro de una celda del canvas usando la lógica
 * equivalente a CSS `object-fit: cover`.
 *
 * ¿Por qué es necesario?
 * ───────────────────────
 * Las fotos de la cámara rara vez tienen exactamente proporción 1:1.
 * Si dibujamos con drawImage(img, x, y, w, h) sin más, la imagen
 * se ESTIRA y deforma. Con "cover" recortamos el excedente y
 * centramos el contenido, tal como lo haría CSS.
 *
 * Algoritmo:
 * 1. Calcular la proporción de aspecto de la imagen fuente.
 * 2. Calcular las dimensiones de recorte (source) para que la
 *    parte visible mantenga la misma proporción que la celda destino.
 * 3. Centrar el área de recorte sobre la imagen original.
 * 4. Dibujar el recorte escalado en la celda destino.
 *
 * @param {CanvasRenderingContext2D} ctx   — Contexto 2D del canvas.
 * @param {HTMLImageElement}         img   — Imagen ya cargada.
 * @param {number}                   destX — Posición X de la celda destino.
 * @param {number}                   destY — Posición Y de la celda destino.
 * @param {number}                   destW — Ancho de la celda destino.
 * @param {number}                   destH — Alto de la celda destino.
 */
function drawImageCover(ctx, img, destX, destY, destW, destH) {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  // Proporciones de aspecto
  const imgRatio  = imgW / imgH;   // ratio de la imagen fuente
  const cellRatio = destW / destH;  // ratio de la celda (aquí siempre 1:1)

  // Variables para el recorte de la imagen fuente (source rect)
  let srcX, srcY, srcW, srcH;

  if (imgRatio > cellRatio) {
    // La imagen es MÁS ANCHA que la celda (landscape vs. square).
    // → Recortamos los lados (ancho), usamos toda la altura.
    srcH = imgH;
    srcW = imgH * cellRatio; // ajustar ancho al ratio de la celda
    srcX = (imgW - srcW) / 2; // centrar horizontalmente
    srcY = 0;
  } else {
    // La imagen es MÁS ALTA que la celda (portrait vs. square).
    // → Recortamos arriba/abajo (alto), usamos todo el ancho.
    srcW = imgW;
    srcH = imgW / cellRatio; // ajustar alto al ratio de la celda
    srcX = 0;
    srcY = (imgH - srcH) / 2; // centrar verticalmente
  }

  // Dibujar el fragmento recortado de la fuente en la celda destino
  // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
  ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

/**
 * Genera un collage de quinceañera con 4 fotos y un marco decorativo.
 *
 * Flujo de renderizado:
 * ─────────────────────
 *  1. Crear canvas offscreen de 1080×1080.
 *  2. Cargar las 4 imágenes + el marco en paralelo (Promise.all).
 *  3. Dibujar cada imagen en su celda con lógica "cover".
 *  4. Superponer el marco (capa superior — overlay).
 *  5. Exportar como JPEG de alta calidad (Blob o DataURL).
 *
 * @param {string[]} photosBase64
 *   Array con exactamente 4 strings Base64 (Data URLs) de las fotos
 *   capturadas por la cámara. Orden esperado:
 *     [0] Superior Izquierda
 *     [1] Superior Derecha
 *     [2] Inferior Izquierda
 *     [3] Inferior Derecha
 *
 * @param {string} frameUrl
 *   URL de la imagen PNG transparente del marco decorativo.
 *   Se dibuja como capa superior sobre todo el canvas.
 *
 * @param {{ format?: 'blob' | 'dataurl' }} [options={}]
 *   Opciones de salida. Por defecto retorna un Blob.
 *
 * @returns {Promise<Blob | string>}
 *   Promesa que resuelve en:
 *     - Un `Blob` de tipo image/jpeg (por defecto).
 *     - Un `string` DataURL si se pasa `{ format: 'dataurl' }`.
 *
 * @throws {Error}
 *   - Si el array no contiene exactamente 4 imágenes.
 *   - Si alguna imagen no puede cargarse.
 *
 * @example
 * // Uso básico — retorna un Blob
 * const blob = await generateQuinceCollage(photos, FRAME_URL);
 * const url = URL.createObjectURL(blob);
 * document.getElementById('preview').src = url;
 *
 * @example
 * // Retornar como DataURL
 * const dataUrl = await generateQuinceCollage(photos, FRAME_URL, {
 *   format: 'dataurl',
 * });
 * document.getElementById('preview').src = dataUrl;
 */
export async function generateQuinceCollage(
  photosBase64,
  frameUrl,
  options = {}
) {
  // ─── Paso 0: Validación de entradas ─────────────────────
  if (!Array.isArray(photosBase64) || photosBase64.length !== 4) {
    throw new Error(
      `Se requieren exactamente 4 imágenes. Recibidas: ${
        Array.isArray(photosBase64) ? photosBase64.length : typeof photosBase64
      }`
    );
  }

  if (!frameUrl || typeof frameUrl !== 'string') {
    throw new Error('Se requiere la URL del marco (frameUrl).');
  }

  // ─── Paso 1: Crear el canvas offscreen de 1080×1080 ────
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  // Fondo blanco como fallback (visible si alguna celda
  // tuviera transparencia o problemas de carga parcial).
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── Paso 2: Carga asíncrona en paralelo ───────────────
  // Cargamos las 4 fotos Y el marco simultáneamente para
  // minimizar el tiempo total de espera.
  const [photo0, photo1, photo2, photo3, frameImg] = await Promise.all([
    loadImage(photosBase64[0]),
    loadImage(photosBase64[1]),
    loadImage(photosBase64[2]),
    loadImage(photosBase64[3]),
    loadImage(frameUrl),
  ]);

  const photos = [photo0, photo1, photo2, photo3];

  // ─── Paso 3: Dibujar cada foto en su celda (2×2) ───────
  // Iteramos sobre las posiciones de la cuadrícula y dibujamos
  // cada imagen con la lógica de "cover" para evitar deformación.
  photos.forEach((photo, index) => {
    const { x, y } = GRID_POSITIONS[index];
    drawImageCover(ctx, photo, x, y, CELL_SIZE, CELL_SIZE);
  });

  // ─── Paso 4: Superponer el marco (overlay) ─────────────
  // El marco es un PNG con transparencia que cubre todo el canvas.
  // Se dibuja DESPUÉS de las fotos para quedar encima (capa superior).
  ctx.drawImage(frameImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ─── Paso 5: Exportar resultado ────────────────────────
  const format = options.format || 'blob';

  if (format === 'dataurl') {
    // Exportar como Data URL (string base64 embebido)
    return canvas.toDataURL(OUTPUT_MIME, JPEG_QUALITY);
  }

  // Exportar como Blob (por defecto)
  // canvas.toBlob es callback-based, lo envolvemos en Promise.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Error al generar el Blob del collage.'));
        }
      },
      OUTPUT_MIME,
      JPEG_QUALITY
    );
  });
}
