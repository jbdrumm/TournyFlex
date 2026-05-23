import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PlayerLoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signInPlayer, player, signOutPlayer } = useAuth()
  const navigate = useNavigate()

  const handleKey = (key) => {
    if (key === 'del') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (pin.length >= 4) return
    const newPin = pin + key
    setPin(newPin)
    if (newPin.length === 4) {
      handleSubmit(newPin)
    }
  }

  const handleSubmit = async (p) => {
    setLoading(true)
    setError('')
    const { error } = await signInPlayer(p)
    setLoading(false)
    if (error) {
      setError('Invalid PIN. Try again.')
      setPin('')
    } else {
      navigate('/')
    }
  }

  if (player) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: '3rem', marginBottom: 16 }}>👋</p>
          <h2 style={{ marginBottom: 8 }}>Hello, {player.name}</h2>
          <p className="text-muted" style={{ marginBottom: 32 }}>You're signed in and ready to play.</p>
          <button className="btn btn-primary btn-full" onClick={() => navigate('/scorecard')}>
            Enter My Scores
          </button>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 10 }} onClick={() => { signOutPlayer(); navigate('/') }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container" style={{ textAlign: 'center', paddingTop: 40 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8 }}>
          Player Login
        </p>
        <h1 style={{ marginBottom: 8 }}>Enter PIN</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 32 }}>
          Your commissioner assigned you a 4-digit PIN
        </p>

        {/* PIN dots */}
        <div className="pin-display">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
          ))}
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
        )}
        {loading && (
          <p style={{ color: 'var(--gold)', fontSize: '0.85rem', marginBottom: 12 }}>Checking PIN...</p>
        )}

        {/* Keypad */}
        <div className="pin-pad" style={{ marginTop: 24 }}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => (
            key === '' ? (
              <div key={idx} />
            ) : (
              <button
                key={key}
                className={`pin-key${key === 'del' ? ' delete' : ''}`}
                onClick={() => handleKey(key)}
                disabled={loading}
              >
                {key === 'del' ? '⌫' : key}
              </button>
            )
          ))}
        </div>

        <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  )
}
