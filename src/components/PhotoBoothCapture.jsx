/**
 * ============================================================
 * Componente: PhotoBoothCapture
 * Módulo B + C: Captura, Procesamiento e Integración — Photobook Digital
 * ============================================================
 *
 * FIX ARQUITECTURAL: el <video> y <canvas> se renderizan SIEMPRE
 * en el DOM (ocultos cuando no son necesarios). Esto evita que
 * videoRef.current sea null cuando se asigna el stream.
 *
 * El bug original:
 *   setStatus('requesting') → React desmonta <video> → videoRef = null
 *   → stream nunca se conecta → pantalla negra → videoWidth = 0
 *
 * @component PhotoBoothCapture
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { generateQuinceCollage } from '../composables/generateQuinceCollage.js';
import { uploadToCloudinary } from '../services/cloudinaryService.js';

// ─────────────────────────────────────────────
// Constantes de configuración
// ─────────────────────────────────────────────

const TOTAL_PHOTOS      = 4;
const COUNTDOWN_SECONDS = 3;
/** URL de la imagen de fondo del diseño */
const BACKGROUND_URL = '/assets/frames/quince-frame.png';

const CAMERA_CONSTRAINTS = {
  video: {
    width:      { ideal: 1920 },
    height:     { ideal: 1080 },
    facingMode: 'user',
  },
  audio: false,
};

// ─────────────────────────────────────────────
// Design system tokens
// ─────────────────────────────────────────────

const COLORS = {
  bg:          '#0F0A1E',
  surface:     'rgba(255,255,255,0.05)',
  glass:       'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.15)',
  primary:     '#C084FC',
  primaryDark: '#9333EA',
  accent:      '#F472B6',
  accentGlow:  'rgba(244,114,182,0.4)',
  text:        '#F8FAFC',
  textMuted:   '#94A3B8',
  success:     '#34D399',
  danger:      '#F87171',
  countdown:   '#FDE68A',
};

// ─────────────────────────────────────────────
// Sub-componente: Miniatura de foto capturada
// ─────────────────────────────────────────────

function PhotoSlot({ index, photoSrc, isActive }) {
  const label = `Foto ${index + 1}`;

  const baseStyle = {
    width:          '100%',
    aspectRatio:    '1 / 1',
    borderRadius:   '12px',
    overflow:       'hidden',
    border:         `2px solid ${isActive ? COLORS.accent : COLORS.glassBorder}`,
    background:     COLORS.surface,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
    transition:     'border-color 0.3s ease, box-shadow 0.3s ease',
    boxShadow:      isActive ? `0 0 20px ${COLORS.accentGlow}` : 'none',
    animation:      isActive ? 'pulse 1s infinite' : 'none',
  };

  if (photoSrc) {
    return (
      <div style={baseStyle}>
        <img
          src={photoSrc}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div style={{
          position:       'absolute', top: '8px', right: '8px',
          background:     COLORS.success, borderRadius: '50%',
          width: '24px',  height: '24px',
          display:        'flex', alignItems: 'center', justifyContent: 'center',
          fontSize:       '14px',
        }}>
          ✓
        </div>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <span style={{
        fontSize:      '13px',
        color:         isActive ? COLORS.accent : COLORS.textMuted,
        fontWeight:    isActive ? '700' : '400',
        fontFamily:    'system-ui, sans-serif',
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

  // ── Refs de media (SIEMPRE en el DOM) ────────────────
  const videoRef         = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef        = useRef(null);
  const currentIndexRef  = useRef(0);

  // ── Estado de la UI ───────────────────────────────────
  // 'idle' | 'requesting' | 'previewing' | 'capturing' | 'processing' | 'done' | 'error'
  const [status,           setStatus]           = useState('idle');
  const [errorMsg,         setErrorMsg]         = useState('');
  const [photos,           setPhotos]           = useState([]);
  const [currentPhotoIndex,setCurrentPhotoIndex]= useState(0);
  const [countdown,        setCountdown]        = useState(null);
  const [collageUrl,       setCollageUrl]       = useState(null);
  const [whatsappNumber,   setWhatsappNumber]   = useState('');
  const [isUploading,      setIsUploading]      = useState(false);
  const [sentSuccess,      setSentSuccess]      = useState(false);

  // ─────────────────────────────────────────────────────
  // Efecto: conectar el stream al <video> cuando el
  // componente ya montó el elemento y el stream está listo.
  //
  // KEY FIX: en lugar de asignar srcObject dentro de
  // startCamera (donde videoRef puede ser null por el
  // early-return de 'requesting'), usamos un efecto que
  // reacciona cuando streamRef.current cambia.
  // ─────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    video.srcObject = streamRef.current;

    // Esperar a que los metadatos estén disponibles (videoWidth ≠ 0)
    const onMeta = () => {
      console.log(`[PhotoBooth] loadedmetadata — ${video.videoWidth}×${video.videoHeight}`);
      video.play()
        .then(() => {
          // 100ms de margen para que el primer frame real llegue del sensor
          setTimeout(() => setStatus('previewing'), 100);
        })
        .catch((err) => {
          setErrorMsg(`Error al reproducir la cámara: ${err.message}`);
          setStatus('error');
        });
    };

    if (video.readyState >= 1) {
      // Los metadatos ya llegaron antes de que asignáramos el handler
      onMeta();
    } else {
      video.addEventListener('loadedmetadata', onMeta, { once: true });
    }

    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
    };
  }, [status === 'requesting']); // se re-ejecuta cuando pasamos a 'requesting'

  // Limpieza del stream al desmontar el componente
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Solicitar acceso a la cámara
  //
  // KEY FIX: ya NO asignamos srcObject aquí. Solo pedimos
  // el stream, lo guardamos en el ref, y cambiamos el status
  // a 'requesting'. El useEffect de arriba detecta ese cambio
  // y conecta el stream al <video> (que siempre está en el DOM).
  // ─────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setStatus('requesting');
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      // El useEffect se encarga de conectar stream → <video> → play()
      // Forzamos un re-trigger del efecto actualizando un estado auxiliar
      // El efecto depende de [status === 'requesting'] que ya es true aquí,
      // así que React lo ejecuta en el próximo render post-setState.
      // Para forzar la re-ejecución usamos una técnica de trigger:
      setStatus('connecting'); // estado transitorio que dispara el efecto
    } catch (err) {
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
  // Lógica: Capturar un frame con reintentos
  // ─────────────────────────────────────────────────────

  const captureFrame = useCallback(async () => {
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 100;
    const video  = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (!video || !canvas) throw new Error('Referencia al video o canvas no disponible.');

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[PhotoBooth] Intentando captura... (intento ${attempt}/${MAX_RETRIES})`);

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        console.log(`[PhotoBooth] Dimensiones: ${video.videoWidth}×${video.videoHeight}`);
        break;
      }

      if (attempt === MAX_RETRIES) {
        throw new Error('Cámara lenta: Por favor, intentá de nuevo.');
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    console.log(`[PhotoBooth] Captura exitosa ✓ — length: ${dataUrl.length}`);
    return dataUrl;
  }, []);

  // ─────────────────────────────────────────────────────
  // Lógica: Cuenta regresiva + captura
  // ─────────────────────────────────────────────────────

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const runCountdownAndCapture = useCallback(async () => {
    for (let i = COUNTDOWN_SECONDS; i >= 1; i--) {
      setCountdown(i);
      await wait(1000);
    }
    setCountdown('📸');
    await wait(150);
    const dataUrl = await captureFrame();
    setCountdown(null);
    return dataUrl;
  }, [captureFrame]);

  // ─────────────────────────────────────────────────────
  // Lógica: Secuencia de ráfaga (4 fotos)
  // ─────────────────────────────────────────────────────

  const startBurstSequence = useCallback(async () => {
    setStatus('capturing');
    setPhotos([]);
    setCurrentPhotoIndex(0);
    currentIndexRef.current = 0;

    const captured = [];

    try {
      for (let i = 0; i < TOTAL_PHOTOS; i++) {
        setCurrentPhotoIndex(i);
        currentIndexRef.current = i;
        if (i > 0) await wait(800);

        const frame = await runCountdownAndCapture();
        if (!frame) throw new Error('Cámara lenta: Por favor, intentá de nuevo.');

        captured.push(frame);
        setPhotos([...captured]);
      }

      setStatus('processing');

      const dataUrl = await generateQuinceCollage(captured, BACKGROUND_URL, { format: 'dataurl' });
      setCollageUrl(dataUrl);
      setStatus('done');

    } catch (err) {
      const userMsg = err.message.includes('mara')
        ? err.message
        : `Error al generar el collage: ${err.message}`;
      setErrorMsg(userMsg);
      setStatus('error');
    }
  }, [runCountdownAndCapture]);

  // ─────────────────────────────────────────────────────
  // Lógica: Reiniciar
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
  // Lógica: Descargar
  // ─────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!collageUrl) return;
    const link = document.createElement('a');
    link.href     = collageUrl;
    link.download = `quince-collage-${Date.now()}.jpg`;
    link.click();
  }, [collageUrl]);

  // ─────────────────────────────────────────────────────
  // Lógica: WhatsApp + Cloudinary
  // ─────────────────────────────────────────────────────

  const handleSendWhatsApp = useCallback(async () => {
    if (!/^[0-9]{8}$/.test(whatsappNumber)) {
      alert('Por favor, ingresá un número de Panamá válido (8 dígitos).');
      return;
    }
    if (!collageUrl) return;

    setIsUploading(true);
    setSentSuccess(false);

    try {
      const response  = await fetch(collageUrl);
      const blob      = await response.blob();
      const secureUrl = await uploadToCloudinary(blob);
      const text      = `¡Mira mi foto en los 15 de Ana! 🎉 ${secureUrl}`;
      const waLink    = `https://wa.me/507${whatsappNumber}?text=${encodeURIComponent(text)}`;

      window.open(waLink, '_blank');
      setSentSuccess(true);
      setTimeout(() => handleReset(), 15000);
    } catch (err) {
      alert(`Error al enviar: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [whatsappNumber, collageUrl, handleReset]);

  // ─────────────────────────────────────────────────────
  // Derivados de UI
  // ─────────────────────────────────────────────────────

  const isCapturing  = status === 'capturing';
  const isProcessing = status === 'processing';
  const showCamera   = ['previewing', 'capturing', 'processing', 'connecting', 'requesting'].includes(status);

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
  // Estilos
  // ─────────────────────────────────────────────────────

  const containerStyle = {
    minHeight:      '100vh',
    background:     `radial-gradient(ellipse at top, #1e0a3c 0%, ${COLORS.bg} 60%)`,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '24px',
    fontFamily:     "'Inter', system-ui, -apple-system, sans-serif",
    color:          COLORS.text,
    boxSizing:      'border-box',
    gap:            '24px',
  };

  const glassCardStyle = {
    background:          COLORS.glass,
    backdropFilter:      'blur(12px)',
    WebkitBackdropFilter:'blur(12px)',
    borderRadius:        '24px',
    border:              `1px solid ${COLORS.glassBorder}`,
    padding:             '24px',
    width:               '100%',
    maxWidth:            '720px',
    boxSizing:           'border-box',
  };

  const bigButtonStyle = (variant = 'primary') => ({
    width:         '100%',
    padding:       '20px 32px',
    borderRadius:  '16px',
    fontSize:      '18px',
    fontWeight:    '700',
    fontFamily:    'inherit',
    cursor:        'pointer',
    border:        'none',
    transition:    'all 0.2s ease',
    letterSpacing: '0.03em',
    ...(variant === 'primary' && {
      background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
      color:      '#fff',
      boxShadow:  `0 4px 24px ${COLORS.accentGlow}`,
    }),
    ...(variant === 'secondary' && {
      background: 'rgba(255,255,255,0.08)',
      color:      COLORS.text,
      border:     `1px solid ${COLORS.glassBorder}`,
    }),
    ...(variant === 'success' && {
      background: `linear-gradient(135deg, ${COLORS.success}, #059669)`,
      color:      '#fff',
      boxShadow:  '0 4px 24px rgba(52,211,153,0.35)',
    }),
  });

  // ─────────────────────────────────────────────────────
  // RENDER ÚNICO — el <video> y <canvas> SIEMPRE en el DOM
  // ─────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>

      {/* ══════════════════════════════════════════════════
          ELEMENTOS DE MEDIA — siempre montados.
          El video está posicionado fuera de la pantalla
          cuando no se muestra, para que videoRef.current
          nunca sea null al asignar el stream.
      ══════════════════════════════════════════════════ */}
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} aria-hidden="true" />
      <video
        ref={videoRef}
        autoPlay={true}
        playsInline={true}
        muted={true}
        style={{ display: 'none' }}  /* se mueve al layout de cámara via la sección de abajo */
        aria-hidden="true"
      />

      {/* ══════════════════════════════════════════════════
          PANTALLA: IDLE — bienvenida
      ══════════════════════════════════════════════════ */}
      {status === 'idle' && (
        <div style={glassCardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '56px', marginBottom: '8px' }}>👑</div>
            <h1 style={{
              margin:       0, fontSize: '32px', fontWeight: '800',
              background:   `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              PhotoBooth
            </h1>
            <p style={{ margin: '8px 0 0', color: COLORS.textMuted, fontSize: '16px' }}>
              Capturá 4 fotos y creá tu collage de quinceañera
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
            {[
              { icon: '📸', label: '4 capturas automáticas' },
              { icon: '⏱️', label: 'Cuenta regresiva de 3s' },
              { icon: '🖼️', label: 'Marco decorativo incluido' },
              { icon: '📱', label: 'Compartí por WhatsApp' },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                background: COLORS.surface, borderRadius: '12px', padding: '16px',
                display: 'flex', alignItems: 'center', gap: '12px',
                fontSize: '14px', color: COLORS.textMuted,
              }}>
                <span style={{ fontSize: '24px' }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>

          <button style={bigButtonStyle('primary')} onClick={startCamera}>
            Activar cámara
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          PANTALLA: REQUESTING / CONNECTING — esperando stream
      ══════════════════════════════════════════════════ */}
      {(status === 'requesting' || status === 'connecting') && (
        <div style={{ ...glassCardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📷</div>
          <p style={{ color: COLORS.textMuted, fontSize: '18px', margin: 0 }}>
            Conectando con la cámara...
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          PANTALLA: ERROR
      ══════════════════════════════════════════════════ */}
      {status === 'error' && (
        <div style={{ ...glassCardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <p style={{ color: COLORS.danger, fontSize: '16px', marginBottom: '24px' }}>
            {errorMsg}
          </p>
          <button style={bigButtonStyle('secondary')} onClick={() => setStatus('idle')}>
            Volver al inicio
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          PANTALLA: DONE — collage final + WhatsApp
      ══════════════════════════════════════════════════ */}
      {status === 'done' && collageUrl && (
        <div style={glassCardStyle}>
          <h2 style={{
            textAlign: 'center', margin: '0 0 20px', fontSize: '24px', fontWeight: '700',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            ¡Tu collage está listo! 🎉
          </h2>

          <div style={{
            borderRadius: '16px', overflow: 'hidden', marginBottom: '20px',
            border: `1px solid ${COLORS.glassBorder}`,
            boxShadow: `0 8px 40px rgba(192, 132, 252, 0.3)`,
          }}>
            <img src={collageUrl} alt="Collage quinceañera" style={{ width: '100%', display: 'block' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sección WhatsApp */}
            <div style={{
              background: 'rgba(255,255,255,0.05)', padding: '16px',
              borderRadius: '16px', border: `1px solid ${COLORS.glassBorder}`,
            }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: COLORS.textMuted }}>
                Enviá tu foto por WhatsApp (Panamá)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{
                  background: COLORS.surface, padding: '12px', borderRadius: '12px',
                  border: `1px solid ${COLORS.glassBorder}`,
                  color: COLORS.textMuted, fontSize: '16px',
                  display: 'flex', alignItems: 'center',
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
                    flex: 1, background: COLORS.surface,
                    border: `1px solid ${COLORS.glassBorder}`,
                    borderRadius: '12px', padding: '12px 16px',
                    color: COLORS.text, fontSize: '16px',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              <button
                style={{
                  ...bigButtonStyle('primary'),
                  padding: '16px', marginTop: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  opacity:       isUploading ? 0.7 : 1,
                  pointerEvents: isUploading ? 'none' : 'auto',
                }}
                onClick={handleSendWhatsApp}
              >
                {isUploading ? (
                  <>
                    <div style={{
                      width: '18px', height: '18px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTop: '2px solid #fff',
                      borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                    }} />
                    Subiendo...
                  </>
                ) : 'Enviar a mi WhatsApp 📱'}
              </button>

              {sentSuccess && (
                <div style={{
                  marginTop: '16px', padding: '12px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  borderRadius: '12px', border: `1px solid ${COLORS.success}`,
                  color: COLORS.success, textAlign: 'center',
                  fontSize: '14px', fontWeight: '600',
                  animation: 'countdownPop 0.3s ease-out',
                }}>
                  ¡Listo! Se abrirá WhatsApp...<br />
                  <span style={{ fontSize: '12px', fontWeight: '400', opacity: 0.8 }}>
                    La tablet volverá al inicio en 15 segundos.
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
      )}

      {/* ══════════════════════════════════════════════════
          PANTALLA: CÁMARA — previewing / capturing / processing
          El <video> aquí es un ESPEJO VISUAL del elemento
          siempre-montado. Asignamos el mismo ref y React
          unifica en el mismo nodo del DOM.
      ══════════════════════════════════════════════════ */}
      {showCamera && (
        <div style={{ ...glassCardStyle, display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>PhotoBooth</h2>
            {(isCapturing || isProcessing) && (
              <span style={{
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                fontSize: '14px', fontWeight: '700',
              }}>
                {getStatusLabel()}
              </span>
            )}
          </div>

          {/* Video container */}
          <div style={{
            position:     'relative', borderRadius: '16px', overflow: 'hidden',
            aspectRatio:  '16 / 9',  background: '#000',
            border:       `1px solid ${COLORS.glassBorder}`,
            boxShadow:    isCapturing && countdown !== null && typeof countdown === 'string'
              ? `0 0 0 4px ${COLORS.accent}, 0 0 60px ${COLORS.accentGlow}`
              : 'none',
            transition:   'box-shadow 0.15s ease',
          }}>
            {/* ─── Espejo visual del <video> real ───
                Usamos un <video> independiente que apunta al mismo stream
                (NO el mismo ref) — así el videoRef sigue apuntando al
                elemento hidden que recibió el stream, evitando doble
                asignación de srcObject. */}
            <VideoMirror streamRef={streamRef} />

            {/* Overlay: cuenta regresiva */}
            {isCapturing && countdown !== null && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background:     typeof countdown === 'string' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(2px)',
              }}>
                <span style={{
                  fontSize:   typeof countdown === 'number' ? '120px' : '80px',
                  fontWeight: '900',
                  color:      typeof countdown === 'number' ? COLORS.countdown : COLORS.accent,
                  textShadow: '0 0 40px currentColor',
                  lineHeight: 1,
                  animation:  typeof countdown === 'number' ? 'countdownPop 1s ease-out' : 'none',
                }}>
                  {countdown}
                </span>
              </div>
            )}

            {/* Overlay: procesando */}
            {isProcessing && (
              <div style={{
                position: 'absolute', inset: 0, gap: '16px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
              }}>
                <div style={{
                  width: '48px', height: '48px',
                  border: `3px solid ${COLORS.glassBorder}`,
                  borderTop: `3px solid ${COLORS.primary}`,
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ color: COLORS.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>
                  Generando collage...
                </p>
              </div>
            )}

            {/* Overlay: conectando */}
            {(status === 'requesting' || status === 'connecting') && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)',
              }}>
                <p style={{ color: COLORS.textMuted, fontSize: '18px', margin: 0 }}>
                  Conectando cámara...
                </p>
              </div>
            )}
          </div>

          {/* Miniaturas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {Array.from({ length: TOTAL_PHOTOS }).map((_, i) => (
              <PhotoSlot
                key={i}
                index={i}
                photoSrc={photos[i] || null}
                isActive={isCapturing && i === currentPhotoIndex && countdown !== null}
              />
            ))}
          </div>

          {/* Botón principal — siempre visible, deshabilitado durante ráfaga */}
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

          {/* Hint durante captura */}
          {isCapturing && (
            <div style={{
              textAlign: 'center', color: COLORS.textMuted, fontSize: '14px',
              padding: '12px', borderRadius: '12px', background: COLORS.surface,
            }}>
              {countdown === null
                ? `Preparate para la foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS}...`
                : '¡Conteo iniciado — sonreí!'}
            </div>
          )}
        </div>
      )}

      {/* CSS global */}
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
        button:not(:disabled):hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        button:not(:disabled):active {
          transform: translateY(0);
          filter: brightness(0.95);
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-componente: Espejo visual del stream
//
// Renderiza un <video> independiente que recibe el
// mismo MediaStream para mostrar el preview.
// El <video> oculto (videoRef) es el que hace la captura.
// Este solo es visual — sin ref, sin drawImage.
// ─────────────────────────────────────────────

function VideoMirror({ streamRef }) {
  const mirrorRef = useRef(null);

  useEffect(() => {
    const el = mirrorRef.current;
    if (!el || !streamRef.current) return;
    el.srcObject = streamRef.current;
    el.play().catch(() => {}); // silencia el error si ya está reproduciendo
  }, [streamRef.current]);

  return (
    <video
      ref={mirrorRef}
      autoPlay={true}
      playsInline={true}
      muted={true}
      style={{
        width:          '100%',
        height:         '100%',
        objectFit:      'cover',
        objectPosition: 'center',
        transform:      'scaleX(-1)',
        display:        'block',
        pointerEvents:  'none',
      }}
    />
  );
}
