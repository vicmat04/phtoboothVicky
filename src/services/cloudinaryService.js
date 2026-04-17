/**
 * ============================================================
 * Servicio: Cloudinary
 * Módulo C: Integración y Almacenamiento — Photobook Digital
 * ============================================================
 *
 * Maneja la subida de imágenes a Cloudinary usando el endpoint
 * de Unsigned Upload.
 */

/**
 * CONFIGURACIÓN DE CLOUDINARY
 *
 * Lee desde variables de entorno de Vite (VITE_*) cuando están disponibles.
 * Fallback a los valores hardcodeados de producción.
 *
 * Para sobreescribir: crea un archivo .env.local con:
 *   VITE_CLOUDINARY_CLOUD_NAME=tu_cloud_name
 *   VITE_CLOUDINARY_UPLOAD_PRESET=tu_preset
 */
const CLOUD_NAME    = import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME    ?? 'dxdwlkcuj';
const UPLOAD_PRESET = import.meta.env?.VITE_CLOUDINARY_UPLOAD_PRESET ?? 'los_15_de_ana';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * Sube un Blob de imagen a Cloudinary.
 *
 * @param {Blob} blob - El archivo de imagen a subir.
 * @returns {Promise<string>} - La secure_url de la imagen subida.
 */
export async function uploadToCloudinary(blob) {
  if (!blob) throw new Error('No se proporcionó un Blob para subir.');

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', UPLOAD_PRESET);

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error en la subida a Cloudinary');
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error al subir a Cloudinary:', error);
    throw new Error('No se pudo conectar con el servidor de imágenes. Verificá tu conexión.');
  }
}
