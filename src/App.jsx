import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import ScorecardPage from './pages/ScorecardPage'
import TeamsPage from './pages/TeamsPage'
import HistoryPage from './pages/HistoryPage'
import CommissionerPage from './pages/CommissionerPage'
import LoginPage from './pages/LoginPage'
import PlayerLoginPage from './pages/PlayerLoginPage'

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p className="text-muted text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/scorecard" element={<ScorecardPage />} />
        <Route path="/teams" element={<TeamsPage />} />
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
