// SignupPage — shown after a successful phone OTP when the user has no
// completed players row (tos_accepted_at IS NULL). Collects the 11 signup
// fields and POSTs to /.netlify/functions/complete-signup.
//
// On success, AuthContext stores the player row and the auth gate flips
// the user into the app.

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const GENDERS = [
  { v: 'male', label: 'Male' },
  { v: 'female', label: 'Female' },
  { v: 'nonbinary', label: 'Non-binary' },
  { v: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export default function SignupPage() {
  const { completeSignup, signOutAccount } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [displayNameDirty, setDisplayNameDirty] = useState(false)
  const [email, setEmail] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [gender, setGender] = useState('')
  const [starterIndex, setStarterIndex] = useState('')
  const [ghin, setGhin] = useState('')
  const [tos, setTos] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Default display_name to first + last unless user has typed in it
  const onFirst = (v) => {
    setFirstName(v)
    if (!displayNameDirty) setDisplayName(`${v} ${lastName}`.trim())
  }
  const onLast = (v) => {
    setLastName(v)
    if (!displayNameDirty) setDisplayName(`${firstName} ${v}`.trim())
  }
  const onDisplay = (v) => {
    setDisplayName(v)
    setDisplayNameDirty(true)
  }

  const canSubmit =
    firstName.trim() && lastName.trim() && displayName.trim() &&
    email.trim() && birthdate && gender && tos && !submitting

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(''); setSubmitting(true)
    const result = await completeSignup({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      display_name: displayName.trim(),
      email: email.trim(),
      birthdate,
      gender,
      starter_handicap_index: starterIndex === '' ? null : parseFloat(starterIndex),
      ghin_number: ghin.trim() || null,
      tos_accepted: true,
      marketing_opt_in: marketing,
    })
    setSubmitting(false)
    if (result.error) setError(result.error)
    // On success the auth gate (App.jsx) re-renders into the app automatically.
  }

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 480 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8, textAlign: 'center' }}>
          Welcome to TournyFlex
        </p>
        <h1 style={{ marginBottom: 8, textAlign: 'center' }}>Finish your profile</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 24, textAlign: 'center' }}>
          A few details and you're in.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Row label="First name" required>
            <input className="input" value={firstName} onChange={e => onFirst(e.target.value)} autoComplete="given-name" required />
          </Row>
          <Row label="Last name" required>
            <input className="input" value={lastName} onChange={e => onLast(e.target.value)} autoComplete="family-name" required />
          </Row>
          <Row label="Display name" hint="Shown on scorecards and leaderboards." required>
            <input className="input" value={displayName} onChange={e => onDisplay(e.target.value)} required />
          </Row>
          <Row label="Email" required>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </Row>
          <Row label="Birthdate" hint="Required. Used for age-restricted features." required>
            <input className="input" type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} required />
          </Row>
          <Row label="Gender" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GENDERS.map(g => (
                <button
                  type="button"
                  key={g.v}
                  className={`btn btn-sm ${gender === g.v ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setGender(g.v)}
                >{g.label}</button>
              ))}
            </div>
          </Row>
          <Row label="Starter handicap index" hint="Optional. Your current handicap if you have one.">
            <input className="input" type="number" step="0.1" value={starterIndex} onChange={e => setStarterIndex(e.target.value)} placeholder="e.g. 12.4" />
          </Row>
          <Row label="GHIN number" hint="Optional.">
            <input className="input" value={ghin} onChange={e => setGhin(e.target.value)} />
          </Row>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8, fontSize: '0.9rem' }}>
            <input type="checkbox" checked={tos} onChange={e => setTos(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I accept the Terms of Service and Privacy Policy.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Send me occasional updates about TournyFlex. (Optional)</span>
          </label>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={!canSubmit} style={{ marginTop: 8 }}>
            {submitting ? 'Setting up…' : 'Finish'}
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={signOutAccount}>
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  )
}

function Row({ label, hint, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
        {label}{required && <span style={{ color: 'var(--gold)' }}> *</span>}
      </label>
      {children}
      {hint && <p className="text-muted" style={{ fontSize: '0.75rem' }}>{hint}</p>}
    </div>
  )
}
