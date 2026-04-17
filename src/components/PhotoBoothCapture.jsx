/**
 * ============================================================
 * Componente: PhotoBoothCapture
 * Módulo B: Procesamiento de Imagen — Photobook Digital
 * ============================================================
 *
 * Flujo de usuario:
 *  1. Usuario abre el componente → se solicita acceso a cámara.
 *  2. Se muestra el preview del video en tiempo real.
 *  3. Al presionar "Empezar" → inicia la secuencia de ráfaga:
 *     Cuenta regresiva (3…2…1…) → Captura → Repite x4.
 *  4. Una vez capturadas las 4 fotos → llama a generateQuinceCollage.
 *  5. Muestra el collage final con opción de descarga.
 *
 * @component PhotoBoothCapture
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { generateQuinceCollage } from '../composables/generateQuinceCollage.js';
import { uploadToCloudinary } from '../services/cloudinaryService.js';

// ─────────────────────────────────────────────
// Constantes de configuración
// ─────────────────────────────────────────────
// ... (omitted for brevity in replacement, but I will include the full updated content below)

// ─────────────────────────────────────────────
// Constantes de configuración
// ─────────────────────────────────────────────

/** Total de fotos a capturar en la ráfaga */
const TOTAL_PHOTOS = 4;

/** Segundos de la cuenta regresiva entre capturas */
const COUNTDOWN_SECONDS = 3;

/** URL del marco decorativo — reemplazar con el asset real */
const FRAME_URL = '/assets/frames/quince-frame.png';

/**
 * Configuración de la cámara:
 * Pedimos HD nativa para que el collage tenga la mejor calidad posible.
 */
const CAMERA_CONSTRAINTS = {
  video: {
    width:       { ideal: 1920 },
    height:      { ideal: 1080 },
    facingMode:  'user', // cámara frontal por defecto en tablets
  },
  audio: false,
};

// ─────────────────────────────────────────────
// Tokens del design system (inline)
// ─────────────────────────────────────────────

const COLORS = {
  bg:          '#0F0A1E',       // fondo oscuro profundo
  surface:     'rgba(255,255,255,0.05)',
  glass:       'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.15)',
  primary:     '#C084FC',       // violeta quinceañera
  primaryDark: '#9333EA',
  accent:      '#F472B6',       // rosa
  accentGlow:  'rgba(244,114,182,0.4)',
  text:        '#F8FAFC',
  textMuted:   '#94A3B8',
  success:     '#34D399',
  danger:      '#F87171',
  countdown:   '#FDE68A',       // amarillo cálido para el número
};

// ─────────────────────────────────────────────
// Sub-componente: Miniatura de foto capturada
// ─────────────────────────────────────────────

/**
 * Muestra el estado de una slot de foto:
 * - Vacía (placeholder con número)
 * - Activa (parpadeando, captura en curso)
 * - Completa (muestra thumbnail)
 */
function PhotoSlot({ index, photoSrc, isActive }) {
  const label = `Foto ${index + 1}`;

  const baseStyle = {
    width:        '100%',
    aspectRatio:  '1 / 1',
    borderRadius: '12px',
    overflow:     'hidden',
    border:       `2px solid ${isActive ? COLORS.accent : COLORS.glassBorder}`,
    background:   COLORS.surface,
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    position:     'relative',
    transition:   'border-color 0.3s ease, box-shadow 0.3s ease',
    boxShadow:    isActive
      ? `0 0 20px ${COLORS.accentGlow}`
      : 'none',
    animation:    isActive ? 'pulse 1s infinite' : 'none',
  };

  if (photoSrc) {
    return (
      <div style={baseStyle}>
        <img
          src={photoSrc}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        {/* Badge de completado */}
        <div style={{
          position:   'absolute',
          top:        '8px',
          right:      '8px',
          background: COLORS.success,
          borderRadius: '50%',
          width:      '24px',
          height:     '24px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize:   '14px',
        }}>
          ✓
        </div>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <span style={{
        fontSize:   '13px',
        color:      isActive ? COLORS.accent : COLORS.textMuted,
        fontWeight: isActive ? '700' : '400',
        fontFamily: 'system-ui, sans-serif',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function PhotoBoothCapture() {
  // ── Estado de cámara ──────────────────────────────────
  /** Referencia al elemento <video> del preview */
  const videoRef = useRef(null);

  /** Canvas oculto usado para capturar frames del video */
  const captureCanvasRef = useRef(null);

  /** Track del stream activo (para poder detenerlo al desmontar) */
  const streamRef = useRef(null);

  /** Referencia mutable al índice actual — evita stale closures en el timer */
  const currentIndexRef = useRef(0);

  // ── Estado de la UI ───────────────────────────────────
  /** 'idle' | 'requesting' | 'previewing' | 'capturing' | 'processing' | 'done' | 'error' */
  const [status, setStatus] = useState('idle');

  /** Mensaje de error si algo falla */
  const [errorMsg, setErrorMsg] = useState('');

  /** Array con los DataURLs de las 4 fotos capturadas */
  const [photos, setPhotos] = useState([]);

  /** Índice de la foto que se está capturando actualmente (0–3) */
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  /** Número visible en la cuenta regresiva (3, 2, 1 o null) */
  const [countdown, setCountdown] = useState(null);

  /** DataURL del collage final generado */
  const [collageUrl, setCollageUrl] = useState(null);

  /** Número de WhatsApp del usuario */
  const [whatsappNumber, setWhatsappNumber] = useState('');

  /** Estado de subida a Cloudinary */
  const [isUploading, setIsUploading] = useState(false);

  /** Estado de éxito en el envío (Modo Kiosco) */
  const [sentSuccess, setSentSuccess] = useState(false);

  // ─────────────────────────────────────────────────────
  // Efecto de limpieza: detener el stream al desmontar
  // ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Solicitar acceso a la cámara
  // ─────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setStatus('requesting');
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // PARCHE 1 — Esperar loadedmetadata antes de reproducir.
        // Garantiza que videoWidth y videoHeight ya no sean 0.
        // Sin esto la primera captura puede devolver data:, (canvas vacío).
        await new Promise((resolve) => {
          if (videoRef.current.readyState >= 1) {
            // El navegador ya cargó los metadatos antes de que pudiéramos asignar el handler
            resolve();
          } else {
            videoRef.current.onloadedmetadata = resolve;
          }
        });

        await videoRef.current.play();

        // PARCHE 2 — Pequeño delay de seguridad (100ms).
        // Da tiempo al hardware de la cámara para que envíe el primer frame real.
        // Sin esto la primera foto puede ser completamente negra.
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setStatus('previewing');
    } catch (err) {
      // Errores comunes: NotAllowedError (permiso denegado), NotFoundError (sin cámara)
      const msg =
        err.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilitalo en la configuración del navegador.'
          : err.name === 'NotFoundError'
          ? 'No se encontró ninguna cámara en este dispositivo.'
          : `Error de cámara: ${err.message}`;

      setErrorMsg(msg);
      setStatus('error');
    }
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Capturar un frame del video al canvas oculto
  // ─────────────────────────────────────────────────────

  /**
   * Extrae el frame actual del <video> con lógica de REINTENTOS.
   *
   * Si el sensor de la cámara aún no envió un frame real (videoWidth === 0),
   * espera 100ms y reintenta hasta MAX_RETRIES veces antes de rendirse.
   * Esto evita que la secuencia se bloquee por una race condition de hardware.
   *
   * @returns {Promise<string>} DataURL JPEG del frame capturado.
   * @throws {Error} Si después de todos los reintentos no hay frame.
   */
  const captureFrame = useCallback(async () => {
    const MAX_RETRIES  = 10;
    const RETRY_DELAY  = 100; // ms entre intentos

    const video  = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (!video || !canvas) {
      throw new Error('Referencia al video o canvas no disponible.');
    }

    // ── Bucle de reintentos ─────────────────────────────
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[PhotoBooth] Intentando captura... (intento ${attempt}/${MAX_RETRIES})`);

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        // El sensor ya tiene dimensiones reales — podemos capturar
        console.log(`[PhotoBooth] Dimensiones detectadas: ${video.videoWidth} x ${video.videoHeight}`);
        break;
      }

      if (attempt === MAX_RETRIES) {
        // Agotamos todos los intentos
        throw new Error(
          'La cámara no entregó imagen a tiempo. Por favor, refrescá la página.'
        );
      }

      // Esperar antes del siguiente intento
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }

    // ── Captura del frame ───────────────────────────────
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');

    // Efecto espejo: volteamos el canvas antes de dibujar.
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    console.log('[PhotoBooth] Captura exitosa ✓ — dataUrl length:', dataUrl.length);

    return dataUrl;
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Secuencia de cuenta regresiva + captura
  // ─────────────────────────────────────────────────────

  /**
   * Espera N milisegundos. Utility para hacer el código más legible.
   */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Ejecuta la cuenta regresiva visual (3 → 2 → 1 → captura).
   * Retorna cuando la captura ha sido realizada.
   *
   * @returns {Promise<string>} DataURL de la foto capturada.
   */
  const runCountdownAndCapture = useCallback(async () => {
    // Cuenta regresiva: 3, 2, 1
    for (let i = COUNTDOWN_SECONDS; i >= 1; i--) {
      setCountdown(i);
      await wait(1000);
    }

    // Flash visual — removemos el countdown antes de capturar
    setCountdown('📸');
    await wait(150);

    // captureFrame ahora es async (tiene reintentos internos)
    const dataUrl = await captureFrame();
    setCountdown(null);

    return dataUrl;
  }, [captureFrame]);

  // ─────────────────────────────────────────────────────
  // Lógica: Secuencia de ráfaga completa (4 fotos)
  // ─────────────────────────────────────────────────────

  const startBurstSequence = useCallback(async () => {
    setStatus('capturing');
    setPhotos([]);
    setCurrentPhotoIndex(0);
    currentIndexRef.current = 0;

    const captured = [];

    try {
      for (let i = 0; i < TOTAL_PHOTOS; i++) {
        // Actualizar el índice activo en la UI
        setCurrentPhotoIndex(i);
        currentIndexRef.current = i;

        // Pausa entre fotos (excepto la primera) — da tiempo para reposicionarse
        if (i > 0) await wait(800);

        // Cuenta regresiva + captura (captureFrame tiene reintentos internos)
        const frame = await runCountdownAndCapture();

        if (!frame) {
          throw new Error('La cámara no entregó imagen a tiempo. Por favor, refrescá la página.');
        }

        captured.push(frame);

        // Actualizar el estado de fotos de forma incremental
        setPhotos([...captured]);
      }

      // ── Todas las fotos capturadas → generar el collage ──
      setStatus('processing');

      const dataUrl = await generateQuinceCollage(captured, FRAME_URL, {
        format: 'dataurl',
      });

      setCollageUrl(dataUrl);
      setStatus('done');

    } catch (err) {
      // Un único catch para toda la secuencia: captura + collage
      const userMsg = err.message.includes('cámara')
        ? err.message  // mensaje ya amigable desde captureFrame
        : `Error al generar el collage: ${err.message}`;

      setErrorMsg(userMsg);
      setStatus('error');
    }
  }, [runCountdownAndCapture]);

  // ─────────────────────────────────────────────────────
  // Lógica: Reiniciar todo el proceso
  // ─────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setCountdown(null);
    setCollageUrl(null);
    setSentSuccess(false);
    setWhatsappNumber('');
    setErrorMsg('');
    setStatus('previewing');
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Descargar el collage
  // ─────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!collageUrl) return;
    const link = document.createElement('a');
    link.href     = collageUrl;
    link.download = `quince-collage-${Date.now()}.jpg`;
    link.click();
  }, [collageUrl]);

  // ─────────────────────────────────────────────────────
  // Lógica: Subir a Cloudinary y enviar WhatsApp
  // ─────────────────────────────────────────────────────

  const handleSendWhatsApp = useCallback(async () => {
    // 1. Validar número de Panamá (8 dígitos)
    const phoneRegex = /^[0-9]{8}$/;
    if (!phoneRegex.test(whatsappNumber)) {
      alert('Por favor, ingresá un número de Panamá válido (8 dígitos).');
      return;
    }

    if (!collageUrl) return;

    setIsUploading(true);
    setSentSuccess(false);

    try {
      // 2. Convertir DataURL a Blob para la subida
      const response = await fetch(collageUrl);
      const blob = await response.blob();

      // 3. Subir a Cloudinary
      const secureUrl = await uploadToCloudinary(blob);

      // 4. Generar link de WhatsApp
      const text = `¡Mira mi foto en los 15 de Ana! 🎉 ${secureUrl}`;
      const waLink = `https://wa.me/507${whatsappNumber}?text=${encodeURIComponent(text)}`;

      // 5. Abrir en nueva pestaña
      window.open(waLink, '_blank');

      // 6. Modo Kiosco: Marcar éxito e iniciar reset automático
      setSentSuccess(true);
      
      // Timer de 15 segundos para volver al inicio automáticamente
      setTimeout(() => {
        handleReset();
      }, 15000);

    } catch (err) {
      alert(`Error al enviar: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [whatsappNumber, collageUrl, handleReset]);

  // ─────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────

  /** Texto del estado actual para el indicador superior */
  const getStatusLabel = () => {
    if (status === 'capturing') {
      return countdown !== null
        ? typeof countdown === 'number'
          ? `Foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS} — Preparate...`
          : `¡Capturando Foto ${currentPhotoIndex + 1}!`
        : `Foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS}`;
    }
    if (status === 'processing') return 'Generando tu collage...';
    if (status === 'done')       return '¡Collage listo! 🎉';
    if (status === 'previewing') return 'Listo para empezar';
    return '';
  };

  // ─────────────────────────────────────────────────────
  // Estilos reutilizables
  // ─────────────────────────────────────────────────────

  const containerStyle = {
    minHeight:       '100vh',
    background:      `radial-gradient(ellipse at top, #1e0a3c 0%, ${COLORS.bg} 60%)`,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '24px',
    fontFamily:      "'Inter', system-ui, -apple-system, sans-serif",
    color:           COLORS.text,
    boxSizing:       'border-box',
    gap:             '24px',
  };

  const glassCardStyle = {
    background:   COLORS.glass,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '24px',
    border:       `1px solid ${COLORS.glassBorder}`,
    padding:      '24px',
    width:        '100%',
    maxWidth:     '720px',
    boxSizing:    'border-box',
  };

  const bigButtonStyle = (variant = 'primary') => ({
    width:        '100%',
    padding:      '20px 32px',
    borderRadius: '16px',
    fontSize:     '18px',
    fontWeight:   '700',
    fontFamily:   'inherit',
    cursor:       'pointer',
    border:       'none',
    transition:   'all 0.2s ease',
    letterSpacing: '0.03em',
    ...(variant === 'primary' && {
      background:  `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
      color:       '#fff',
      boxShadow:   `0 4px 24px ${COLORS.accentGlow}`,
    }),
    ...(variant === 'secondary' && {
      background:  'rgba(255,255,255,0.08)',
      color:       COLORS.text,
      border:      `1px solid ${COLORS.glassBorder}`,
    }),
    ...(variant === 'success' && {
      background:  `linear-gradient(135deg, ${COLORS.success}, #059669)`,
      color:       '#fff',
      boxShadow:   '0 4px 24px rgba(52,211,153,0.35)',
    }),
  });

  // ─────────────────────────────────────────────────────
  // RENDER: Estado IDLE — pantalla de bienvenida
  // ─────────────────────────────────────────────────────

  if (status === 'idle') {
    return (
      <div style={containerStyle}>
        <div style={glassCardStyle}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '56px', marginBottom: '8px' }}>👑</div>
            <h1 style={{
              margin:       0,
              fontSize:     '32px',
              fontWeight:   '800',
              background:   `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
              backgroundClip: 'text',
            }}>
              PhotoBooth
            </h1>
            <p style={{
              margin:    '8px 0 0',
              color:     COLORS.textMuted,
              fontSize:  '16px',
            }}>
              Capturá 4 fotos y creá tu collage de quinceañera
            </p>
          </div>

          {/* Info grid */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 '12px',
            marginBottom:        '32px',
          }}>
            {[
              { icon: '📸', label: '4 capturas automáticas' },
              { icon: '⏱️', label: 'Cuenta regresiva de 3s' },
              { icon: '🖼️', label: 'Marco decorativo incluido' },
              { icon: '💾', label: 'Descarga en alta calidad' },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                background:   COLORS.surface,
                borderRadius: '12px',
                padding:      '16px',
                display:      'flex',
                alignItems:   'center',
                gap:          '12px',
                fontSize:     '14px',
                color:        COLORS.textMuted,
              }}>
                <span style={{ fontSize: '24px' }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>

          <button
            style={bigButtonStyle('primary')}
            onClick={startCamera}
          >
            Activar cámara
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Estado REQUESTING — esperando permiso
  // ─────────────────────────────────────────────────────

  if (status === 'requesting') {
    return (
      <div style={containerStyle}>
        <div style={{ ...glassCardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📷</div>
          <p style={{ color: COLORS.textMuted, fontSize: '18px', margin: 0 }}>
            Solicitando acceso a la cámara...
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Estado ERROR
  // ─────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div style={containerStyle}>
        <div style={{ ...glassCardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <p style={{ color: COLORS.danger, fontSize: '16px', marginBottom: '24px' }}>
            {errorMsg}
          </p>
          <button style={bigButtonStyle('secondary')} onClick={() => setStatus('idle')}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Estado DONE — mostrar collage final
  // ─────────────────────────────────────────────────────

  if (status === 'done' && collageUrl) {
    return (
      <div style={containerStyle}>
        <div style={glassCardStyle}>
          <h2 style={{
            textAlign:  'center',
            margin:     '0 0 20px',
            fontSize:   '24px',
            fontWeight: '700',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor:  'transparent',
            backgroundClip: 'text',
          }}>
            ¡Tu collage está listo! 🎉
          </h2>

          {/* Preview del collage */}
          <div style={{
            borderRadius: '16px',
            overflow:     'hidden',
            marginBottom: '20px',
            border:       `1px solid ${COLORS.glassBorder}`,
            boxShadow:    `0 8px 40px rgba(192, 132, 252, 0.3)`,
          }}>
            <img
              src={collageUrl}
              alt="Collage quinceañera"
              style={{ width: '100%', display: 'block' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sección de WhatsApp */}
            <div style={{
              background:   'rgba(255,255,255,0.05)',
              padding:      '16px',
              borderRadius: '16px',
              border:       `1px solid ${COLORS.glassBorder}`,
            }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                color: COLORS.textMuted,
              }}>
                Enviá tu foto por WhatsApp (Panamá)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{
                  background: COLORS.surface,
                  padding: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${COLORS.glassBorder}`,
                  color: COLORS.textMuted,
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  +507
                </div>
                <input
                  type="tel"
                  placeholder="60001234"
                  maxLength="8"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                  style={{
                    flex: 1,
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.glassBorder}`,
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: COLORS.text,
                    fontSize: '16px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <button
                style={{
                  ...bigButtonStyle('primary'),
                  padding: '16px',
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: isUploading ? 0.7 : 1,
                  pointerEvents: isUploading ? 'none' : 'auto',
                }}
                onClick={handleSendWhatsApp}
              >
                {isUploading ? (
                  <>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTop: '2px solid #fff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }} />
                    Subiendo...
                  </>
                ) : (
                  'Enviar a mi WhatsApp 📱'
                )}
              </button>

              {/* Mensaje Modo Kiosco (Éxito) */}
              {sentSuccess && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  borderRadius: '12px',
                  border: `1px solid ${COLORS.success}`,
                  color: COLORS.success,
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: '600',
                  animation: 'countdownPop 0.3s ease-out',
                }}>
                  ¡Listo! Se abrirá WhatsApp... <br/>
                  <span style={{ fontSize: '12px', fontWeight: '400', opacity: 0.8 }}>
                    La tablet volverá al inicio en 15 segundos automáticamente.
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button style={{ ...bigButtonStyle('secondary'), flex: 1 }} onClick={handleDownload}>
                Descargar 💾
              </button>
              <button style={{ ...bigButtonStyle('secondary'), flex: 1 }} onClick={handleReset}>
                Nueva foto 🔄
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Estado PREVIEWING / CAPTURING / PROCESSING
  // ─────────────────────────────────────────────────────

  const isCapturing  = status === 'capturing';
  const isProcessing = status === 'processing';

  return (
    <div style={containerStyle}>
      {/* Canvas OCULTO — solo para captura, nunca visible */}
      <canvas
        ref={captureCanvasRef}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <div style={{ ...glassCardStyle, display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── Header / Status bar ── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
            PhotoBooth
          </h2>
          {(isCapturing || isProcessing) && (
            <span style={{
              background:   `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
              fontSize:     '14px',
              fontWeight:   '700',
            }}>
              {getStatusLabel()}
            </span>
          )}
        </div>

        {/* ── Video preview + overlay de cuenta regresiva ── */}
        <div style={{
          position:     'relative',
          borderRadius: '16px',
          overflow:     'hidden',
          aspectRatio:  '16 / 9',
          background:   '#000',
          border:       `1px solid ${COLORS.glassBorder}`,
          boxShadow:    isCapturing && countdown !== null && typeof countdown === 'string'
            ? `0 0 0 4px ${COLORS.accent}, 0 0 60px ${COLORS.accentGlow}`
            : 'none',
          transition:   'box-shadow 0.15s ease',
        }}>
          {/* Video stream — espejado con CSS para selfie natural */}
          {/* Atributos explícitos: algunos navegadores bloquean el autoplay
               si muted o playsInline no están declarados como booleanos. */}
          <video
            ref={videoRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            onLoadedMetadata={() => {
              console.debug('[PhotoBooth] loadedmetadata fired — videoWidth:', videoRef.current?.videoWidth);
            }}
            style={{
              width:          '100%',
              height:         '100%',
              objectFit:      'cover',
              objectPosition: 'center',
              transform:      'scaleX(-1)',
              display:        'block',
              pointerEvents:  'none', // evita que interacciones táctiles interfieran con el stream
            }}
          />

          {/* Overlay de cuenta regresiva */}
          {isCapturing && countdown !== null && (
            <div style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     typeof countdown === 'string'
                ? 'rgba(0,0,0,0.3)'
                : 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(2px)',
            }}>
              <span style={{
                fontSize:   typeof countdown === 'number' ? '120px' : '80px',
                fontWeight: '900',
                color:      typeof countdown === 'number'
                  ? COLORS.countdown
                  : COLORS.accent,
                textShadow: `0 0 40px currentColor`,
                lineHeight: 1,
                animation:  typeof countdown === 'number'
                  ? 'countdownPop 1s ease-out'
                  : 'none',
              }}>
                {countdown}
              </span>
            </div>
          )}

          {/* Overlay de procesamiento */}
          {isProcessing && (
            <div style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              background:     'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              gap:            '16px',
            }}>
              <div style={{
                width:        '48px',
                height:       '48px',
                border:       `3px solid ${COLORS.glassBorder}`,
                borderTop:    `3px solid ${COLORS.primary}`,
                borderRadius: '50%',
                animation:    'spin 0.8s linear infinite',
              }} />
              <p style={{ color: COLORS.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>
                Generando collage...
              </p>
            </div>
          )}
        </div>

        {/* ── Grid de miniaturas (4 slots) ── */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap:                 '12px',
        }}>
          {Array.from({ length: TOTAL_PHOTOS }).map((_, i) => (
            <PhotoSlot
              key={i}
              index={i}
              photoSrc={photos[i] || null}
              isActive={isCapturing && i === currentPhotoIndex && countdown !== null}
            />
          ))}
        </div>

        {/* ── Botón principal ──
             visible siempre en modo preview/capturing.
             Deshabilitado durante la ráfaga para evitar dobles clicks. */}
        {(status === 'previewing' || isCapturing) && (
          <button
            style={{
              ...bigButtonStyle('primary'),
              opacity:       isCapturing ? 0.45 : 1,
              cursor:        isCapturing ? 'not-allowed' : 'pointer',
              pointerEvents: isCapturing ? 'none' : 'auto',
            }}
            disabled={isCapturing}
            onClick={startBurstSequence}
          >
            {isCapturing
              ? `Capturando foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS}...`
              : '¡Empezar! 📸'}
          </button>
        )}

        {isCapturing && (
          <div style={{
            textAlign:  'center',
            color:      COLORS.textMuted,
            fontSize:   '14px',
            padding:    '12px',
            borderRadius: '12px',
            background: COLORS.surface,
          }}>
            {countdown === null
              ? `Preparate para la foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS}...`
              : `La cuenta regresiva comenzó — ¡sonreí!`}
          </div>
        )}

      </div>

      {/* Animaciones CSS globales (inyectadas en el <head> una sola vez) */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');

        * { box-sizing: border-box; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }

        @keyframes countdownPop {
          0%   { transform: scale(1.4); opacity: 0; }
          30%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        button:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        button:active {
          transform: translateY(0);
          filter: brightness(0.95);
        }
      `}</style>
    </div>
  );
}
