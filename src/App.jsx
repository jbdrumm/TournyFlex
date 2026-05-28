import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import BottomNav from './components/BottomNav'
import SplashScreen from './components/SplashScreen'
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
  const [splashDone, setSplashDone] = useState(false)

  return (
    <>
      {/* Splash shown on cold start; fades out once AuthContext finishes loading */}
      {!splashDone && (
        <SplashScreen ready={!loading} onDone={() => setSplashDone(true)} />
      )}

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
