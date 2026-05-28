import { useEffect, useState } from 'react'

// SplashScreen — shown on cold start only, fades out once app is ready.
//
// FUTURE LOGIN HOOK:
// When multi-tournament login is added, replace the auto-dismiss logic here
// with a transition to a LoginScreen component. The splash fades out the same
// way, but instead of revealing the app it reveals the login UI.
// The flow will be: SplashScreen → LoginScreen → App (tournament)

const MIN_DISPLAY_MS = 1500 // minimum time to show splash even if app loads fast

export default function SplashScreen({ ready, onDone }) {
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!ready) return

    const timer = setTimeout(() => {
      setFading(true)
      // After fade completes, fully remove from DOM
      setTimeout(() => {
        setHidden(true)
        onDone?.()
      }, 600)
    }, MIN_DISPLAY_MS)

    return () => clearTimeout(timer)
  }, [ready])

  if (hidden) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#081223',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      <img
        src="/tourny-flex-logo.png"
        alt="TournyFlex"
        style={{
          width: 'min(72vw, 320px)',
          height: 'auto',
          opacity: fading ? 0 : 1,
          transform: fading ? 'scale(0.97)' : 'scale(1)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      />
    </div>
  )
}
