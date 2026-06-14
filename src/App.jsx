import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import BottomNav from './components/BottomNav'
import SplashScreen from './components/SplashScreen'
import InstallPrompt from './components/InstallPrompt'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import ScorecardPage from './pages/ScorecardPage'
import GroupsPage from './pages/GroupsPage'
import HistoryPage from './pages/HistoryPage'
import CommissionerPage from './pages/CommissionerPage'
import LoginPage from './pages/LoginPage'
import PlayerLoginPage from './pages/PlayerLoginPage'
import SignupPage from './pages/SignupPage'

// Pre-app flow: splash → install → auth gate → app
//
// Auth gate (after install is dismissed):
//   - isCommissioner OR (session + completed player) → app routes
//   - session, no player or incomplete                → SignupPage
//   - no session and not commissioner                 → PlayerLoginPage
//
// /login (commissioner PIN) is still a normal route so it's reachable from
// the PlayerLoginPage "Commissioner sign in" link.

export default function App() {
  const { loading, isCommissioner, session, isSignedUp } = useAuth()

  const [stage, setStage] = useState('splash')

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      window._deferredInstallPrompt = e
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Splash
  if (stage === 'splash') {
    return (
      <SplashScreen
        ready={!loading}
        onDone={() => setStage('install')}
      />
    )
  }

  // Install prompt (self-skips if not needed)
  if (stage === 'install') {
    return (
      <InstallPrompt
        visible={true}
        onDone={() => setStage('app')}
      />
    )
  }

  // Stage = 'app' — apply auth gate
  const isAuthed = isCommissioner || (session && isSignedUp)

  if (!isAuthed && session && !isSignedUp) {
    return <SignupPage />
  }

  if (!isAuthed) {
    return (
      <Routes>
        {/* Commissioner PIN page is reachable from the player login screen */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<PlayerLoginPage />} />
      </Routes>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/scorecard" element={<ScorecardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/commissioner" element={<CommissionerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/player-login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}
