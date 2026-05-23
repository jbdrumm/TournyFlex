import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Commissioner uses a longer PIN (6-8 digits, set in Netlify env as COMMISSIONER_PIN)
// Verified server-side so the PIN is never exposed in the client bundle.

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signInCommissioner, isCommissioner } = useAuth()
  const navigate = useNavigate()

  if (isCommissioner) {
    navigate('/commissioner')
    return null
  }

  const handleKey = (key) => {
    if (key === 'del') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (pin.length >= 8) return
    const next = pin + key
    setPin(next)
  }

  const handleSubmit = async () => {
    if (pin.length < 4) return
    setLoading(true)
    setError('')
    const err = await signInCommissioner(pin)
    setLoading(false)
    if (err) {
      setError('Incorrect PIN')
      setPin('')
    } else {
      navigate('/commissioner')
    }
  }

  const pinLength = 8 // display 8 dots max; actual PIN length is flexible

  return (
    <div className="page">
      <div className="container" style={{ textAlign: 'center', paddingTop: 40, maxWidth: 320 }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
          textTransform: 'uppercase', letterSpacing: '0.15em',
          color: 'var(--gold)', marginBottom: 8
        }}>
          🏌️ Commissioner
        </p>
        <h1 style={{ marginBottom: 8 }}>Admin PIN</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 32 }}>
          Enter your commissioner PIN
        </p>

        {/* PIN dots — show up to 8 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
          {Array.from({ length: Math.max(pin.length, 6) }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--gold)',
              background: i < pin.length ? 'var(--gold)' : 'transparent',
              transition: 'background 0.1s',
            }} />
          ))}
        </div>
        <p className="text-mono text-xs text-muted" style={{ marginBottom: 24 }}>
          {pin.length} digit{pin.length !== 1 ? 's' : ''} entered
        </p>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
        )}

        {/* Keypad */}
        <div className="pin-pad" style={{ marginBottom: 16 }}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => (
            key === '' ? <div key={idx} /> : (
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

        <button
          className="btn btn-primary btn-full"
          onClick={handleSubmit}
          disabled={loading || pin.length < 4}
        >
          {loading ? 'Verifying...' : 'Enter'}
        </button>

        <button className="btn btn-ghost btn-full" style={{ marginTop: 10 }} onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  )
}
