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

export default function App() {
  const { loading } = useAuth()

  // Pre-app flow stages: 'splash' → 'install' → 'app'
  // FUTURE LOGIN HOOK: add 'login' stage between 'install' and 'app'
  const [stage, setStage] = useState('splash')

  // Capture Android's deferred install prompt as early as possible
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      window._deferredInstallPrompt = e
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  return (
    <>
      {/* Stage 1: Splash */}
      {stage === 'splash' && (
        <SplashScreen
          ready={!loading}
          onDone={() => setStage('install')}
        />
      )}

      {/* Stage 2: Install prompt (skips itself if not needed) */}
      {stage === 'install' && (
        <InstallPrompt
          visible={true}
          onDone={() => setStage('app')}
        />
      )}

      {/* Stage 3: App
          FUTURE LOGIN HOOK: wrap routes in a login gate here */}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/scorecard" element={<ScorecardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/commissioner" element={<CommissionerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/player-login" element={<PlayerLoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}
