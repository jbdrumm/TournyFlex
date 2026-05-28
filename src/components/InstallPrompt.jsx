import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tf_install_prompt'
const DISMISS_DAYS = 30

// Detect if already running as installed PWA
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

// Detect iOS Safari specifically (only browser on iOS that supports Add to Home Screen)
function isIosSafari() {
  const ua = window.navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua)
  const isSafari = /safari/i.test(ua) && !/crios|fxios|opios|edgios/i.test(ua)
  return isIos && isSafari
}

// Check if prompt should be shown based on localStorage state
function shouldShow() {
  if (isStandalone()) return false
  if (!isIosSafari() && !window._deferredInstallPrompt) return false

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const { status, until } = JSON.parse(raw)
    if (status === 'never') return false
    if (status === 'dismissed' && until && Date.now() < until) return false
    return true
  } catch {
    return true
  }
}

export default function InstallPrompt({ visible, onDone }) {
  const [show, setShow] = useState(false)
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [androidPrompt, setAndroidPrompt] = useState(null)

  useEffect(() => {
    if (!visible) return

    // Capture deferred Android prompt if available
    if (window._deferredInstallPrompt) {
      setAndroidPrompt(window._deferredInstallPrompt)
    }

    setIsIos(isIosSafari())

    if (shouldShow()) {
      setShow(true)
    } else {
      // Nothing to show — go straight to app
      setHidden(true)
      onDone?.()
    }
  }, [visible])

  const dismiss = (type) => {
    try {
      if (type === 'never') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: 'never' }))
      } else {
        const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: 'dismissed', until }))
      }
    } catch {}

    setFading(true)
    setTimeout(() => {
      setHidden(true)
      onDone?.()
    }, 500)
  }

  const handleInstall = async () => {
    if (androidPrompt) {
      androidPrompt.prompt()
      const { outcome } = await androidPrompt.userChoice
      window._deferredInstallPrompt = null
      if (outcome === 'accepted') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: 'never' }))
      }
    }
    setFading(true)
    setTimeout(() => {
      setHidden(true)
      onDone?.()
    }, 500)
  }

  if (hidden || !show) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      backgroundColor: '#02183d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 28px',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.5s ease',
      pointerEvents: fading ? 'none' : 'all',
    }}>

      {/* Logo — smaller than splash */}
      <img
        src="/tourny-flex-logo.png"
        alt="TournyFlex"
        style={{ width: 'min(48vw, 200px)', height: 'auto', marginBottom: 36 }}
      />

      {/* Headline */}
      <p style={{
        color: '#ffffff',
        fontSize: '1.25rem',
        fontWeight: 700,
        fontFamily: "'Playfair Display', Georgia, serif",
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: '-0.01em',
      }}>
        Get the Full Experience
      </p>

      {/* Subtext */}
      <p style={{
        color: '#a0b4cc',
        fontSize: '0.9rem',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 1.5,
        maxWidth: 280,
      }}>
        Install TournyFlex on your home screen for fast access during your round — no browser needed.
      </p>

      {/* iOS instructions */}
      {isIos && (
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
          maxWidth: 300,
          width: '100%',
        }}>
          <p style={{ color: '#c9a84c', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            How to install on iPhone
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>1</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Tap the <ShareIcon /> <strong>Share</strong> button in Safari's toolbar
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>2</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Scroll down and tap <strong>"Add to Home Screen"</strong>
            </p>
          </div>
        </div>
      )}

      {/* Android install button */}
      {!isIos && androidPrompt && (
        <button
          onClick={handleInstall}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: '14px 24px',
            backgroundColor: '#c9a84c',
            color: '#02183d',
            border: 'none',
            borderRadius: 10,
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 12,
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          Install App
        </button>
      )}

      {/* Dismiss buttons */}
      <button
        onClick={() => dismiss('later')}
        style={{
          width: '100%',
          maxWidth: 300,
          padding: '12px 24px',
          backgroundColor: 'transparent',
          color: '#a0b4cc',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          fontSize: '0.9rem',
          cursor: 'pointer',
          marginBottom: 10,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        Dismiss
      </button>

      <button
        onClick={() => dismiss('never')}
        style={{
          background: 'none',
          border: 'none',
          color: '#5a7a9a',
          fontSize: '0.8rem',
          cursor: 'pointer',
          padding: '8px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          textDecoration: 'underline',
        }}
      >
        Never ask again
      </button>
    </div>
  )
}

// Inline iOS share icon SVG
function ShareIcon() {
  return (
    <svg
      width="14" height="16" viewBox="0 0 14 16" fill="none"
      style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}
    >
      <path d="M7 1v9M4 4L7 1l3 3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 8v6a1 1 0 001 1h10a1 1 0 001-1V8" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
