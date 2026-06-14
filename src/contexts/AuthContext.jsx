// AuthContext
//
// Two parallel auth tracks:
//   1. Player — Supabase phone OTP. Session lives in Supabase JS client's
//      localStorage; the players-table row is fetched from the
//      get-my-player Netlify function on session change.
//   2. Commissioner — PIN-based, verified via verify-commissioner Netlify
//      function. Persisted in localStorage. Unchanged from pre-OTP build.
//
// A user can be both (a commissioner who is also a signed-up player).
// `loading` is true until both tracks have resolved their initial state.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const COMMISSIONER_KEY = 'golf_commissioner'

export function AuthProvider({ children }) {
  const [commissioner, setCommissioner] = useState(null)
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)

  // -- mount: hydrate commissioner (sync) + initial session (async) --
  useEffect(() => {
    let mounted = true

    try {
      const c = localStorage.getItem(COMMISSIONER_KEY)
      if (c) setCommissioner(JSON.parse(c))
    } catch { /* ignore parse errors */ }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session || null)
      if (data.session) {
        const p = await fetchPlayer(data.session.access_token)
        if (mounted) setPlayer(p)
      }
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (!mounted) return
      setSession(sess || null)
      if (sess) {
        const p = await fetchPlayer(sess.access_token)
        if (mounted) setPlayer(p)
      } else {
        setPlayer(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const fetchPlayer = async (token) => {
    try {
      const res = await fetch('/.netlify/functions/get-my-player', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const json = await res.json()
      return json.data || null
    } catch {
      return null
    }
  }

  // -- Player (phone OTP) --

  const signInWithPhone = async (phone) => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    return error?.message || null
  }

  const verifyOtp = async (phone, code) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
    return error?.message || null
  }

  const completeSignup = async (fields) => {
    if (!session?.access_token) return { error: 'No session' }
    try {
      const res = await fetch('/.netlify/functions/complete-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok) return { error: json.error || 'Signup failed' }
      setPlayer(json.data)
      return { player: json.data }
    } catch (e) {
      return { error: e.message }
    }
  }

  const signOutAccount = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setPlayer(null)
  }

  // -- Commissioner (PIN) --

  const signInCommissioner = async (pin) => {
    const res = await fetch('/.netlify/functions/verify-commissioner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    if (res.ok) {
      const data = { verified: true }
      setCommissioner(data)
      localStorage.setItem(COMMISSIONER_KEY, JSON.stringify(data))
      return null
    }
    return 'Invalid PIN'
  }

  const signOutCommissioner = () => {
    setCommissioner(null)
    localStorage.removeItem(COMMISSIONER_KEY)
  }

  const isSignedUp = !!(player?.tos_accepted_at)

  return (
    <AuthContext.Provider value={{
      // state
      commissioner, session, player, loading,
      // computed
      isCommissioner: !!commissioner?.verified,
      isPlayer: !!player,
      isSignedUp,
      // player auth
      signInWithPhone, verifyOtp, completeSignup, signOutAccount,
      // commissioner auth
      signInCommissioner, signOutCommissioner,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
