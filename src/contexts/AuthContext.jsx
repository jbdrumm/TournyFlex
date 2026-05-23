import { createContext, useContext, useEffect, useState } from 'react'
import { db } from '../lib/db'

const AuthContext = createContext(null)
const COMMISSIONER_KEY = 'golf_commissioner'
const PLAYER_KEY = 'golf_player'

export function AuthProvider({ children }) {
  const [commissioner, setCommissioner] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try { const c = localStorage.getItem(COMMISSIONER_KEY); if (c) setCommissioner(JSON.parse(c)) } catch {}
    try { const p = localStorage.getItem(PLAYER_KEY); if (p) setPlayer(JSON.parse(p)) } catch {}
    setLoading(false)
  }, [])

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

  const signInPlayer = async (pin) => {
    const { data } = await db('get_player_by_pin', { pin })
    if (!data) return { error: 'Invalid PIN' }
    setPlayer(data)
    localStorage.setItem(PLAYER_KEY, JSON.stringify(data))
    return { player: data }
  }

  const signOutPlayer = () => {
    setPlayer(null)
    localStorage.removeItem(PLAYER_KEY)
  }

  return (
    <AuthContext.Provider value={{
      commissioner, player, loading,
      isCommissioner: !!commissioner?.verified,
      isPlayer: !!player,
      signInCommissioner, signOutCommissioner,
      signInPlayer, signOutPlayer,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
