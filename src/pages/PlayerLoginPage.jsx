// PlayerLoginPage — phone OTP login (US-only at launch).
//
// Two steps:
//   1. Phone entry      → POST signInWithOtp → Supabase Auth sends SMS via Twilio
//   2. 6-digit code     → POST verifyOtp     → Supabase session established
//
// On verified session, AuthContext refreshes the player row from
// get-my-player. The auth gate in App.jsx then routes the user to:
//   - SignupPage if the player row is missing or incomplete
//   - HomePage if the player row exists with tos_accepted_at IS NOT NULL

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// US-only E.164 normalizer. Returns +1XXXXXXXXXX or null.
function normalizeUsPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return null
}

function formatUsPhone(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export default function PlayerLoginPage() {
  const { signInWithPhone, verifyOtp } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('phone')   // 'phone' | 'otp'
  const [phoneInput, setPhoneInput] = useState('')
  const [normalized, setNormalized] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const sendCode = async () => {
    const norm = normalizeUsPhone(phoneInput)
    if (!norm) {
      setError('Enter a 10-digit US phone number.')
      return
    }
    setError(''); setLoading(true)
    const err = await signInWithPhone(norm)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      setNormalized(norm)
      setCode('')
      setStep('otp')
    }
  }

  const verify = async () => {
    if (code.length < 6) return
    setError(''); setLoading(true)
    const err = await verifyOtp(normalized, code)
    setLoading(false)
    if (err) {
      setError(err)
      setCode('')
    }
    // On success the auth gate re-renders this away.
  }

  const resend = async () => {
    setError(''); setLoading(true)
    const err = await signInWithPhone(normalized)
    setLoading(false)
    if (err) setError(err)
  }

  if (step === 'phone') {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', paddingTop: 40, maxWidth: 360 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8 }}>
            Sign in
          </p>
          <h1 style={{ marginBottom: 8 }}>Your phone</h1>
          <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
            We'll text you a 6-digit code. Standard message rates apply.
          </p>

          <input
            className="input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={formatUsPhone(phoneInput)}
            onChange={e => setPhoneInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCode()}
            placeholder="(555) 123-4567"
            disabled={loading}
            style={{ fontSize: '1.1rem', textAlign: 'center' }}
          />

          {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 12 }}>{error}</p>}

          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 16 }}
            onClick={sendCode}
            disabled={loading || !normalizeUsPhone(phoneInput)}
          >
            {loading ? 'Sending…' : 'Send code'}
          </button>

          <button className="btn btn-ghost btn-full" style={{ marginTop: 10 }} onClick={() => navigate('/login')}>
            🔑 Commissioner sign in
          </button>
        </div>
      </div>
    )
  }

  // OTP step
  return (
    <div className="page">
      <div className="container" style={{ textAlign: 'center', paddingTop: 40, maxWidth: 360 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8 }}>
          Enter code
        </p>
        <h1 style={{ marginBottom: 8 }}>Check your texts</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
          Sent to {formatUsPhone(normalized.replace(/^\+1/, ''))}
        </p>

        <input
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => e.key === 'Enter' && verify()}
          placeholder="123456"
          disabled={loading}
          style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.3em' }}
        />

        {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 12 }}>{error}</p>}

        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: 16 }}
          onClick={verify}
          disabled={loading || code.length < 6}
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>

        <button className="btn btn-ghost btn-full" style={{ marginTop: 10 }} onClick={resend} disabled={loading}>
          Resend code
        </button>
        <button className="btn btn-ghost btn-full" style={{ marginTop: 4 }} onClick={() => { setStep('phone'); setError('') }} disabled={loading}>
          Use a different number
        </button>
      </div>
    </div>
  )
}
