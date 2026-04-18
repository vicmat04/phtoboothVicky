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
    width:      { ideal: 1080 },
    height:     { ideal: 1080 },
    aspectRatio: 1,
    facingMode: 'user',
  },
  audio: false,
};

// ─────────────────────────────────────────────
// Design system tokens — Enchanted Forest theme
// ─────────────────────────────────────────────

const COLORS = {
  bg:          '#070d07',        // negro forestal profundo
  surface:     'rgba(20, 50, 20, 0.45)',
  glass:       'rgba(10, 35, 10, 0.65)',
  glassBorder: 'rgba(100, 200, 80, 0.2)',
  primary:     '#4ade80',        // verde menta brillante
  primaryDark: '#16a34a',        // verde bosque
  accent:      '#a3e635',        // lima dorado
  accentGlow:  'rgba(74, 222, 128, 0.35)',
  gold:        '#d4a853',        // dorado cálido
  goldGlow:    'rgba(212, 168, 83, 0.4)',
  firefly:     '#c8ff00',        // amarillo-verde luciérnaga
  text:        '#e8f5e9',        // blanco verdoso
  textMuted:   '#6b9e72',        // verde apagado
  success:     '#4ade80',
  danger:      '#f87171',
  countdown:   '#ffd700',        // dorado para countdown
};

// ─────────────────────────────────────────────
// Hook: Detecta orientación del dispositivo
// — Screen Orientation API  (más fiable en tablets Android/iOS)
// — matchMedia              (fallback CSS)
// — window.innerWidth/Height (fallback de dimensiones)
// — visibilitychange        (re-evalúa al volver a la pestaña)
// ─────────────────────────────────────────────

function useOrientation() {
  const getIsLandscape = () => {
    if (typeof window === 'undefined') return false;
    const isPortraitUA = /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
    
    // Método 1: Por dimensiones reales (el más honesto)
    const byDimensions = window.innerWidth > window.innerHeight;
    
    // Método 2: Screen Orientation API
    let byAPI = false;
    if (typeof screen !== 'undefined' && screen.orientation?.type) {
      byAPI = screen.orientation.type.startsWith('landscape');
    }
    
    // Método 3: matchMedia
    const byMQ = window.matchMedia?.('(orientation: landscape)').matches;

    return byDimensions || byAPI || byMQ;
  };

  const [isLandscape, setIsLandscape] = useState(getIsLandscape);

  useEffect(() => {
    const update = () => setIsLandscape(getIsLandscape());

    // Listeners estándar
    screen.orientation?.addEventListener('change', update);
    const mq = window.matchMedia?.('(orientation: landscape)');
    mq?.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('visibilitychange', update);

    // HEARTBEAT: Brute force polling cada 1s por si el browser no dispara eventos
    const interval = setInterval(update, 1000);

    return () => {
      screen.orientation?.removeEventListener('change', update);
      mq?.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('visibilitychange', update);
      clearInterval(interval);
    };
  }, []); 

  return isLandscape;
}

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

  // ── Galería oculta: contador de taps en el emoji ──
  const secretTapsRef   = useRef(0);
  const secretTimerRef  = useRef(null);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [secretPass,      setSecretPass]      = useState('');
  const [secretError,     setSecretError]     = useState(false);

  // ── Orientación del dispositivo (reactivo al girar la tablet) ──
  const isLandscape = useOrientation();

  const handleSecretTap = useCallback(() => {
    secretTapsRef.current += 1;
    clearTimeout(secretTimerRef.current);
    secretTimerRef.current = setTimeout(() => {
      secretTapsRef.current = 0;
    }, 3000);
    if (secretTapsRef.current >= 5) {
      secretTapsRef.current = 0;
      clearTimeout(secretTimerRef.current);
      setSecretPass('');
      setSecretError(false);
      setShowSecretModal(true);
    }
  }, []);

  const handleSecretSubmit = useCallback(() => {
    if (secretPass === 'ana15') {
      setShowSecretModal(false);
      setSecretPass('');
      setSecretError(false);
      window.open(
        'https://console.cloudinary.com/console/media_library/search?q=los_15_de_ana&view_mode=mosaic',
        '_blank'
      );
    } else {
      setSecretError(true);
      setSecretPass('');
    }
  }, [secretPass]);

  const handleSecretCancel = useCallback(() => {
    setShowSecretModal(false);
    setSecretPass('');
    setSecretError(false);
  }, []);

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

    // VALIDACIÓN CRÍTICA: Los navegadores bloquean el acceso a la cámara si no hay HTTPS o Localhost.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('¡Error de Seguridad! La cámara requiere HTTPS. Si estás en una tablet probando en red local, debés habilitar "Insecure origins as secure" en chrome://flags.');
      setStatus('error');
      return;
    }

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

      // ── Paso 1: generar el collage en canvas ──────────────
      setStatus('processing');
      const blob = await generateQuinceCollage(captured, BACKGROUND_URL, { format: 'blob' });

      // ── Paso 2: subir automáticamente a Cloudinary ────────
      // Cada collage queda guardado independientemente de si el
      // usuario lo comparte por WhatsApp o no.
      setIsUploading(true);
      const secureUrl = await uploadToCloudinary(blob);
      setIsUploading(false);

      setCollageUrl(secureUrl);   // URL pública de Cloudinary
      setStatus('done');

    } catch (err) {
      setIsUploading(false);
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

    // El collage ya está en Cloudinary (se subió automáticamente al generarse).
    // Solo construimos el link de WhatsApp y lo abrimos.
    const text   = `¡Mira mi foto en los XV de Ana Victoria! 🎉 ${collageUrl}`;
    const waLink = `https://wa.me/507${whatsappNumber}?text=${encodeURIComponent(text)}`;
    window.open(waLink, '_blank');
    setSentSuccess(true);
    setTimeout(() => handleReset(), 15000);
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
    if (status === 'processing') return isUploading ? 'Subiendo a la nube... ☁️' : 'Generando tu collage...';
    if (status === 'done')       return '¡Collage listo! 🎉';
    if (status === 'previewing') return 'Listo para empezar';
    return '';
  };

  // ─────────────────────────────────────────────────────
  // Estilos
  // ─────────────────────────────────────────────────────

  const containerStyle = {
    minHeight:      '100dvh',
    background:     'radial-gradient(ellipse at 50% 0%, #0d2e0d 0%, #050f05 45%, #020702 100%)',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        isLandscape ? '12px 16px' : '24px',
    fontFamily:     "'Cinzel', 'Georgia', serif",
    color:          COLORS.text,
    boxSizing:      'border-box',
    gap:            isLandscape ? '12px' : '24px',
    position:       'relative',
    overflow:       'auto',
  };

  const glassCardStyle = {
    background:          COLORS.glass,
    backdropFilter:      'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    borderRadius:        '24px',
    border:              `1px solid ${COLORS.glassBorder}`,
    boxShadow:           `0 0 40px rgba(74, 222, 128, 0.08), inset 0 1px 0 rgba(100,200,80,0.15)`,
    padding:             '24px',
    width:               '100%',
    maxWidth:            '720px',
    boxSizing:           'border-box',
    position:            'relative',
    zIndex:              1,
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
    transition:    'all 0.25s ease',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    ...(variant === 'primary' && {
      background: `linear-gradient(135deg, ${COLORS.primaryDark} 0%, ${COLORS.primary} 60%, ${COLORS.accent} 100%)`,
      color:      '#020d02',
      fontWeight: '900',
      boxShadow:  `0 4px 28px ${COLORS.accentGlow}, 0 0 60px rgba(74,222,128,0.15)`,
    }),
    ...(variant === 'secondary' && {
      background: 'rgba(20, 60, 20, 0.6)',
      color:      COLORS.text,
      border:     `1px solid ${COLORS.glassBorder}`,
    }),
    ...(variant === 'success' && {
      background: `linear-gradient(135deg, ${COLORS.gold}, #b8860b)`,
      color:      '#020d02',
      fontWeight: '900',
      boxShadow:  `0 4px 28px ${COLORS.goldGlow}`,
    }),
  });

  // ─────────────────────────────────────────────────────
  // RENDER ÚNICO — el <video> y <canvas> SIEMPRE en el DOM
  // ─────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* ─────────────────────────────────────────────────────
          DEBUG BADGE & CSS FALLBACK
      ───────────────────────────────────────────────────── */}
      <style>{`
        @media (orientation: landscape) {
          #root { width: 100vw !important; }
        }
      `}</style>

      <div style={{
        position: 'fixed', top: '10px', left: '10px', zIndex: 10000,
        background: isLandscape ? '#22c55e' : '#ef4444',
        color: '#fff', padding: '4px 8px', borderRadius: '6px',
        fontSize: '10px', fontWeight: 'bold', pointerEvents: 'none',
        opacity: 0.8, border: '1px solid rgba(255,255,255,0.2)'
      }}>
        {isLandscape ? 'ORIENTACIÓN: LANDSCAPE (OK)' : 'ORIENTACIÓN: PORTRAIT'}
      </div>

      {/* ══════════════════════════════════════════════════
          LUCIÉRNAGAS — partículas animadas de fondo
          Posicionadas absolutamente detrás del contenido.
      ══════════════════════════════════════════════════ */}
      <Fireflies />

      {/* ══════════════════════════════════════════════════
          NIEBLA DEL BOSQUE — capas de bruma verde
      ══════════════════════════════════════════════════ */}
      <div style={{
        position:   'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 40% at 20% 80%, rgba(20,80,20,0.18) 0%, transparent 70%)',
      }} />
      <div style={{
        position:   'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 30% at 80% 20%, rgba(10,50,10,0.14) 0%, transparent 70%)',
      }} />
      {/* ══════════════════════════════════════════════════
          MODAL SECRETO: Acceso a Cloudinary
      ══════════════════════════════════════════════════ */}
      {showSecretModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: COLORS.glass,
            border: `1px solid ${COLORS.glassBorder}`,
            boxShadow: `0 0 60px rgba(74,222,128,0.12)`,
            borderRadius: '24px',
            padding: '36px 32px',
            width: '100%', maxWidth: '360px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔐</div>
            <h2 style={{
              margin: '0 0 8px', fontSize: '20px', fontWeight: '800',
              fontFamily: "'Cinzel', serif",
              color: COLORS.gold,
            }}>Acceso Restringido</h2>
            <p style={{ margin: '0 0 24px', color: COLORS.textMuted, fontSize: '14px' }}>
              Ingresá la contraseña para ver la galería
            </p>

            <input
              type="password"
              value={secretPass}
              onChange={e => { setSecretPass(e.target.value); setSecretError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleSecretSubmit()}
              placeholder="Contraseña"
              autoFocus
              style={{
                width: '100%', padding: '14px 16px',
                borderRadius: '12px', fontSize: '16px',
                background: 'rgba(20,50,20,0.6)',
                border: `1.5px solid ${secretError ? COLORS.danger : COLORS.glassBorder}`,
                color: COLORS.text, outline: 'none',
                boxSizing: 'border-box', marginBottom: '8px',
                letterSpacing: '0.15em',
                transition: 'border-color 0.2s',
              }}
            />

            {secretError && (
              <p style={{ margin: '0 0 16px', color: COLORS.danger, fontSize: '13px' }}>
                Contraseña incorrecta. Intentá de nuevo.
              </p>
            )}
            {!secretError && <div style={{ height: '24px' }} />}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSecretCancel}
                style={{ ...bigButtonStyle('secondary'), flex: 1, padding: '14px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSecretSubmit}
                style={{ ...bigButtonStyle('primary'), flex: 1, padding: '14px' }}
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════
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
        <div style={{
          ...glassCardStyle,
          display:       isLandscape ? 'flex' : 'block',
          flexDirection: isLandscape ? 'row' : 'column',
          alignItems:    isLandscape ? 'center' : 'stretch',
          gap:           isLandscape ? '40px' : '20px',
          maxWidth:      isLandscape ? 'none' : '720px',
          padding:       isLandscape ? '32px 48px' : '24px',
          textAlign:     isLandscape ? 'left' : 'center',
        }}>
          {/* Columna Izquierda / Superior: Título y Logo */}
          <div style={{ flex: 1 }}>
            <div
              onClick={handleSecretTap}
              style={{
                fontSize: '52px',
                marginBottom: '16px',
                cursor: 'default',
                userSelect: 'none',
                textAlign: isLandscape ? 'left' : 'center'
              }}
            >🌿</div>
            <h1 style={{
              margin: 0, fontSize: isLandscape ? '36px' : '28px', fontWeight: '800',
              fontFamily: "'Cinzel', 'Georgia', serif",
              background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.primary}, ${COLORS.accent})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              letterSpacing: '0.06em',
              lineHeight: 1.2,
            }}>
              Los XV de Ana Victoria
            </h1>
            <p style={{
              margin: '8px 0 0', color: COLORS.gold, fontSize: '14px',
              letterSpacing: '0.2em', textTransform: 'uppercase',
              fontFamily: "'Cinzel', serif",
            }}>
              Bosque Encantado · 18 Abril 2026
            </p>
            <p style={{
              margin: '16px 0 0', color: COLORS.textMuted,
              fontSize: '16px', lineHeight: 1.6
            }}>
              Capturá tus momentos mágicos en esta noche inolvidable.
            </p>
          </div>

          {/* Columna Derecha / Inferior: Características y Botón */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            marginTop: isLandscape ? 0 : '32px'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}>
              {[
                { icon: '📸', label: '4 capturas' },
                { icon: '✨', label: '3s cuenta' },
                { icon: '🌿', label: 'Diseño XV' },
                { icon: '📱', label: 'WhatsApp' },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  background: COLORS.surface, borderRadius: '12px', padding: '12px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: COLORS.textMuted,
                  border: `1px solid ${COLORS.glassBorder}`,
                }}>
                  <span style={{ fontSize: '20px' }}>{icon}</span>
                  {label}
                </div>
              ))}
            </div>

            <button style={bigButtonStyle('primary')} onClick={startCamera}>
              Activar cámara
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          PANTALLA: REQUESTING / CONNECTING — esperando stream
      ══════════════════════════════════════════════════ */}
      {(status === 'requesting' || status === 'connecting') && (
        <div style={{
          ...glassCardStyle,
          textAlign: 'center',
          maxWidth:  isLandscape ? 'none' : '720px'
        }}>
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
        <div style={{
          ...glassCardStyle,
          textAlign: 'center',
          maxWidth:  isLandscape ? 'none' : '720px'
        }}>
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
        <div style={{
          ...glassCardStyle,
          display:       isLandscape ? 'flex' : 'block',
          flexDirection: isLandscape ? 'row' : undefined,
          gap:           isLandscape ? '20px' : undefined,
          alignItems:    isLandscape ? 'flex-start' : undefined,
          maxWidth:      isLandscape ? 'none' : '720px',
          padding:       isLandscape ? '16px' : '24px',
        }}>

          {/* ── Columna izquierda: COLLAGE ───────────────── */}
          <div style={{
            flex:  isLandscape ? '0 0 auto' : undefined,
            width: isLandscape ? 'min(44vh, 46%)' : '100%',
          }}>
            {!isLandscape && (
              <h2 style={{
                textAlign: 'center', margin: '0 0 20px', fontSize: '24px', fontWeight: '700',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                ¡Tu collage está listo! 🎉
              </h2>
            )}
            <div style={{
              borderRadius: '16px', overflow: 'hidden',
              marginBottom: isLandscape ? 0 : '20px',
              border: `1px solid ${COLORS.glassBorder}`,
              boxShadow: `0 8px 40px rgba(192, 132, 252, 0.3)`,
            }}>
              <img src={collageUrl} alt="Collage quinceañera" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>

          {/* ── Columna derecha: CONTROLES ───────────────── */}
          <div style={{
            flex:          isLandscape ? 1 : undefined,
            display:       'flex',
            flexDirection: 'column',
            gap:           '16px',
            minWidth:      0,
          }}>
            {isLandscape && (
              <h2 style={{
                margin: '0 0 4px', fontSize: '20px', fontWeight: '700',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                ¡Tu collage está listo! 🎉
              </h2>
            )}

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
        <div style={{
          ...glassCardStyle,
          display:       'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          gap:           '20px',
          alignItems:    isLandscape ? 'flex-start' : 'stretch',
          maxWidth:      isLandscape ? 'none' : '720px',
          padding:       isLandscape ? '16px' : '24px',
        }}>

          {/* ── Columna izquierda: VIDEO ─────────────────── */}
          <div style={{
            flex:          isLandscape ? '0 0 auto' : undefined,
            width:         isLandscape ? 'min(48vh, 50%)' : '100%',
            display:       'flex',
            flexDirection: 'column',
            gap:           '16px',
          }}>

            {/* Header — portrait */}
            {!isLandscape && (
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
            )}

            {/* Video container */}
            <div style={{
              position:    'relative', borderRadius: '16px', overflow: 'hidden',
              aspectRatio: '1 / 1',   background: '#000',
              border:      `1px solid ${COLORS.glassBorder}`,
              boxShadow:   isCapturing && countdown !== null && typeof countdown === 'string'
                ? `0 0 0 4px ${COLORS.accent}, 0 0 60px ${COLORS.accentGlow}`
                : 'none',
              transition:  'box-shadow 0.15s ease',
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

            {/* Miniaturas — portrait: fila de 4 bajo el video */}
            {!isLandscape && (
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
            )}
          </div>

          {/* ── Columna derecha: CONTROLES ──────────────── */}
          <div style={{
            flex:           1,
            display:        'flex',
            flexDirection:  'column',
            gap:            '16px',
            justifyContent: isLandscape ? 'space-between' : 'flex-start',
            minWidth:       0,
          }}>

            {/* Header — landscape */}
            {isLandscape && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>PhotoBooth</h2>
                {(isCapturing || isProcessing) && (
                  <span style={{
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    fontSize: '13px', fontWeight: '700',
                  }}>
                    {getStatusLabel()}
                  </span>
                )}
              </div>
            )}

            {/* Miniaturas — landscape: grid 2×2 en la columna derecha */}
            {isLandscape && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {Array.from({ length: TOTAL_PHOTOS }).map((_, i) => (
                  <PhotoSlot
                    key={i}
                    index={i}
                    photoSrc={photos[i] || null}
                    isActive={isCapturing && i === currentPhotoIndex && countdown !== null}
                  />
                ))}
              </div>
            )}

            {/* Botón principal */}
            {(status === 'previewing' || isCapturing) && (
              <button
                style={{
                  ...bigButtonStyle('primary'),
                  opacity:       isCapturing ? 0.45 : 1,
                  cursor:        isCapturing ? 'not-allowed' : 'pointer',
                  pointerEvents: isCapturing ? 'none' : 'auto',
                  padding:       isLandscape ? '14px 24px' : '20px 32px',
                  fontSize:      isLandscape ? '15px' : '18px',
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
                padding: '10px', borderRadius: '12px', background: COLORS.surface,
              }}>
                {countdown === null
                  ? `Preparate para la foto ${currentPhotoIndex + 1} de ${TOTAL_PHOTOS}...`
                  : '¡Conteo iniciado — sonreí!'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS global */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;800&family=Inter:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        @keyframes countdownPop {
          0%   { transform: scale(1.4); opacity: 0; }
          30%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Luciérnagas */
        @keyframes fireflyFloat {
          0%   { transform: translate(0, 0)   scale(1);    opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: translate(var(--fx), var(--fy)) scale(1.3); opacity: 0.9; }
          85%  { opacity: 0.6; }
          100% { transform: translate(0, 0)   scale(0.8); opacity: 0; }
        }
        @keyframes fireflyGlow {
          0%, 100% { box-shadow: 0 0 4px 2px rgba(200,255,0,0.6); }
          50%       { box-shadow: 0 0 10px 5px rgba(200,255,0,0.95), 0 0 20px 8px rgba(180,255,20,0.4); }
        }

        /* Niebla del bosque */
        @keyframes mistDrift {
          0%, 100% { transform: translateX(0)   opacity: 0.6; }
          50%       { transform: translateX(30px); opacity: 1; }
        }

        button:not(:disabled):hover {
          transform: translateY(-2px);
          filter: brightness(1.12);
        }
        button:not(:disabled):active {
          transform: translateY(0);
          filter: brightness(0.92);
        }

        input:focus { outline: 2px solid rgba(74,222,128,0.5) !important; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-componente: Luciérnagas animadas
//
// Genera N partículas con posición, tamaño, delay
// y dirección de flotación aleatorios.
// Se renderizan con position:fixed detrás de todo el contenido.
// ─────────────────────────────────────────────

const FIREFLY_COUNT = 20;

function Fireflies() {
  // Generamos datos aleatorios UNA vez (durante el montaje).
  // useMemo no es necesario porque el componente rara vez se re-renderiza.
  const flies = Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
    id:       i,
    left:     `${Math.random() * 100}%`,
    top:      `${Math.random() * 100}%`,
    size:     3 + Math.random() * 4,           // 3–7px
    duration: 4 + Math.random() * 8,           // 4–12s
    delay:    Math.random() * 6,               // 0–6s
    fx:       `${(Math.random() - 0.5) * 120}px`, // desplazamiento X
    fy:       `${(Math.random() - 0.5) * 100}px`, // desplazamiento Y
  }));

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      {flies.map((f) => (
        <div
          key={f.id}
          style={{
            position:       'absolute',
            left:           f.left,
            top:            f.top,
            width:          `${f.size}px`,
            height:         `${f.size}px`,
            borderRadius:   '50%',
            background:     COLORS.firefly,
            animation:      `fireflyFloat ${f.duration}s ease-in-out ${f.delay}s infinite,
                             fireflyGlow ${f.duration * 0.6}s ease-in-out ${f.delay}s infinite`,
            '--fx':         f.fx,
            '--fy':         f.fy,
            willChange:     'transform, opacity',
          }}
        />
      ))}
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
