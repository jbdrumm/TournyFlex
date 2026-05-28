import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tf_install_prompt'
const DISMISS_DAYS = 30

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function getDeviceType() {
  const ua = window.navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua)

  if (!isIos) return 'android' // covers Android + desktop

  // iOS — check which browser
  const isFirefox = /fxios/i.test(ua)
  const isChrome = /crios/i.test(ua)
  const isEdge = /edgios/i.test(ua)
  const isOpera = /opios/i.test(ua)
  const isOtherBrowser = isFirefox || isChrome || isEdge || isOpera

  if (isOtherBrowser) return 'ios-unsupported'
  return 'ios-safari'
}

function shouldShow(deviceType) {
  if (isStandalone()) return false

  // ios-unsupported: always show the "open in Safari" nudge (no dismiss state)
  if (deviceType === 'ios-unsupported') return true

  // ios-safari: show install instructions
  if (deviceType === 'ios-safari') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return true
      const { status, until } = JSON.parse(raw)
      if (status === 'never') return false
      if (status === 'dismissed' && until && Date.now() < until) return false
      return true
    } catch { return true }
  }

  // android: only show if native prompt is available
  if (deviceType === 'android') {
    if (!window._deferredInstallPrompt) return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return true
      const { status, until } = JSON.parse(raw)
      if (status === 'never') return false
      if (status === 'dismissed' && until && Date.now() < until) return false
      return true
    } catch { return true }
  }

  return false
}

export default function InstallPrompt({ visible, onDone }) {
  const [show, setShow] = useState(false)
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [deviceType, setDeviceType] = useState(null)
  const [androidPrompt, setAndroidPrompt] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!visible) return

    const type = getDeviceType()
    setDeviceType(type)

    if (window._deferredInstallPrompt) {
      setAndroidPrompt(window._deferredInstallPrompt)
    }

    if (shouldShow(type)) {
      setShow(true)
    } else {
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
    fade()
  }

  const fade = () => {
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
    fade()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }

  if (hidden || !show) return null

  const btnBase = {
    width: '100%',
    maxWidth: 300,
    borderRadius: 10,
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  }

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

      {/* Logo */}
      <img
        src="/tourny-flex-logo.png"
        alt="TournyFlex"
        style={{ width: 'min(48vw, 200px)', height: 'auto', marginBottom: 36 }}
      />

      {/* ── iOS UNSUPPORTED BROWSER ── */}
      {deviceType === 'ios-unsupported' && <>
        <p style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", textAlign: 'center', marginBottom: 12 }}>
          Open in Safari to Install
        </p>
        <p style={{ color: '#a0b4cc', fontSize: '0.9rem', textAlign: 'center', marginBottom: 28, lineHeight: 1.5, maxWidth: 280 }}>
          TournyFlex can only be installed from Safari on iPhone. Copy the link below and paste it into Safari.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, maxWidth: 300, width: '100%' }}>
          <p style={{ color: '#c9a84c', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Then in Safari:
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <span style={{ color: '#a0b4cc', fontSize: '0.88rem', minWidth: 14 }}>1</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Tap the <ShareIcon /> <strong>Share</strong> button in the toolbar
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: '#a0b4cc', fontSize: '0.88rem', minWidth: 14 }}>2</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Tap <strong>"Add to Home Screen"</strong>
            </p>
          </div>
        </div>

        <button
          onClick={handleCopyLink}
          style={{ ...btnBase, padding: '14px 24px', backgroundColor: '#c9a84c', color: '#02183d', border: 'none', fontWeight: 700, fontSize: '1rem', marginBottom: 12 }}
        >
          {copied ? '✓ Link Copied!' : 'Copy Link'}
        </button>

        <button
          onClick={fade}
          style={{ ...btnBase, padding: '12px 24px', backgroundColor: 'transparent', color: '#a0b4cc', border: '1px solid rgba(255,255,255,0.15)', marginBottom: 10 }}
        >
          Continue Without Installing
        </button>
      </>}

      {/* ── iOS SAFARI ── */}
      {deviceType === 'ios-safari' && <>
        <p style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", textAlign: 'center', marginBottom: 12 }}>
          Get the Full Experience
        </p>
        <p style={{ color: '#a0b4cc', fontSize: '0.9rem', textAlign: 'center', marginBottom: 28, lineHeight: 1.5, maxWidth: 280 }}>
          Install TournyFlex on your home screen for fast access during your round — no browser needed.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '16px 20px', marginBottom: 28, maxWidth: 300, width: '100%' }}>
          <p style={{ color: '#c9a84c', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            How to install on iPhone
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <span style={{ color: '#a0b4cc', fontSize: '0.88rem', minWidth: 14 }}>1</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Tap the <ShareIcon /> <strong>Share</strong> button in Safari's toolbar
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: '#a0b4cc', fontSize: '0.88rem', minWidth: 14 }}>2</span>
            <p style={{ color: '#e0e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
              Scroll down and tap <strong>"Add to Home Screen"</strong>
            </p>
          </div>
        </div>

        <button
          onClick={() => dismiss('later')}
          style={{ ...btnBase, padding: '12px 24px', backgroundColor: 'transparent', color: '#a0b4cc', border: '1px solid rgba(255,255,255,0.15)', marginBottom: 10 }}
        >
          Dismiss
        </button>
        <button
          onClick={() => dismiss('never')}
          style={{ background: 'none', border: 'none', color: '#5a7a9a', fontSize: '0.8rem', cursor: 'pointer', padding: '8px', fontFamily: "'DM Sans', system-ui, sans-serif", textDecoration: 'underline' }}
        >
          Never ask again
        </button>
      </>}

      {/* ── ANDROID ── */}
      {deviceType === 'android' && <>
        <p style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", textAlign: 'center', marginBottom: 12 }}>
          Get the Full Experience
        </p>
        <p style={{ color: '#a0b4cc', fontSize: '0.9rem', textAlign: 'center', marginBottom: 32, lineHeight: 1.5, maxWidth: 280 }}>
          Install TournyFlex on your home screen for fast access during your round — no browser needed.
        </p>

        <button
          onClick={handleInstall}
          style={{ ...btnBase, padding: '14px 24px', backgroundColor: '#c9a84c', color: '#02183d', border: 'none', fontWeight: 700, fontSize: '1rem', marginBottom: 12 }}
        >
          Install App
        </button>

        <button
          onClick={() => dismiss('later')}
          style={{ ...btnBase, padding: '12px 24px', backgroundColor: 'transparent', color: '#a0b4cc', border: '1px solid rgba(255,255,255,0.15)', marginBottom: 10 }}
        >
          Dismiss
        </button>
        <button
          onClick={() => dismiss('never')}
          style={{ background: 'none', border: 'none', color: '#5a7a9a', fontSize: '0.8rem', cursor: 'pointer', padding: '8px', fontFamily: "'DM Sans', system-ui, sans-serif", textDecoration: 'underline' }}
        >
          Never ask again
        </button>
      </>}

    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
      <path d="M7 1v9M4 4L7 1l3 3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 8v6a1 1 0 001 1h10a1 1 0 001-1V8" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
