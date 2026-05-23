import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sortPlayersByScore, generateScrambleTeams, calculateTotal } from '../lib/golf'

const TABS = ['Event', 'Players', 'Scores', 'Teams', 'Courses']

export default function CommissionerPage() {
  const { isCommissioner, signOutCommissioner, commissioner } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Event')

  if (!isCommissioner) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</p>
          <p className="text-muted" style={{ marginBottom: 20 }}>Commissioner access required</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>Commissioner Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Admin Panel</div>
          <div className="flex justify-between items-center">
            <h1>Commissioner</h1>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await signOutCommissioner(); navigate('/') }}>
              Sign Out
            </button>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>{commissioner?.email}</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '8px 14px', border: 'none', borderRadius: 'var(--radius)',
                background: tab === t ? 'var(--gold)' : 'var(--green-dark)',
                color: tab === t ? 'var(--green-deep)' : 'var(--gray-300)',
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Event' && <EventTab />}
        {tab === 'Players' && <PlayersTab />}
        {tab === 'Scores' && <ScoresTab />}
        {tab === 'Teams' && <TeamsTab />}
        {tab === 'Courses' && <CoursesTab />}
      </div>
    </div>
  )
}

// ─── EVENT TAB ───────────────────────────────────────────────────────────────
function EventTab() {
  const [events, setEvents] = useState([])
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState({ year: new Date().getFullYear(), name: "Annual Golf Outing", course_id: '', event_date: '', morning_tee_time: '', afternoon_tee_time: '', player_count: 20 })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: evs }, { data: cs }] = await Promise.all([
      supabase.from('events').select('*, courses(name)').order('event_date', { ascending: false }).limit(5),
      supabase.from('courses').select('id, name').order('name')
    ])
    setEvents(evs || [])
    setCourses(cs || [])
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('events').upsert(form, { onConflict: 'year' })
    setSaving(false)
    if (error) setToast({ msg: error.message, type: 'error' })
    else { setToast({ msg: 'Event saved!', type: 'success' }); fetchData() }
    setTimeout(() => setToast(null), 3000)
  }

  const updateStatus = async (id, status) => {
    await supabase.from('events').update({ status }).eq('id', id)
    fetchData()
  }

  const lockScores = async (id, locked) => {
    await supabase.from('events').update({ scores_locked: locked }).eq('id', id)
    fetchData()
  }

  const STATUS_FLOW = ['upcoming', 'morning_active', 'morning_complete', 'afternoon_active', 'complete']

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Create / Update Event</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Year</label>
            <input type="number" className="input" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label>Player Count</label>
            <select className="input" value={form.player_count} onChange={e => setForm(f => ({ ...f, player_count: parseInt(e.target.value) }))}>
              <option value={16}>16 players</option>
              <option value={20}>20 players</option>
              <option value={24}>24 players</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Course</label>
          <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
            <option value="">Select course...</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Event Date</label>
          <input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Morning Tee Time</label>
            <input type="time" className="input" value={form.morning_tee_time} onChange={e => setForm(f => ({ ...f, morning_tee_time: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Afternoon Tee Time</label>
            <input type="time" className="input" value={form.afternoon_tee_time} onChange={e => setForm(f => ({ ...f, afternoon_tee_time: e.target.value }))} />
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Event'}
        </button>
      </div>

      {/* Existing events */}
      {events.map(ev => (
        <div key={ev.id} className="card card-sm">
          <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
            <strong>{ev.year} — {ev.courses?.name || 'No course'}</strong>
            <span className={`badge ${ev.status === 'morning_active' || ev.status === 'afternoon_active' ? 'badge-gold' : 'badge-gray'}`}>{ev.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FLOW.map(s => (
              <button key={s} className={`btn btn-sm ${ev.status === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => updateStatus(ev.id, s)}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className={`btn btn-sm ${ev.scores_locked ? 'btn-danger' : 'btn-secondary'}`} onClick={() => lockScores(ev.id, !ev.scores_locked)}>
              {ev.scores_locked ? '🔒 Scores Locked' : '🔓 Lock Scores'}
            </button>
          </div>
        </div>
      ))}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── PLAYERS TAB ──────────────────────────────────────────────────────────────
function PlayersTab() {
  const [players, setPlayers] = useState([])
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [eventPlayers, setEventPlayers] = useState([]) // player IDs already in selected event
  const [form, setForm] = useState({ name: '', pin: '' })
  const [editingPin, setEditingPin] = useState(null) // player id being edited
  const [newPin, setNewPin] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: ps }, { data: evs }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('events').select('id, year, courses(name)').order('event_date', { ascending: false }).limit(10)
    ])
    setPlayers(ps || [])
    setEvents(evs || [])
  }

  const fetchEventPlayers = async (eid) => {
    const { data } = await supabase.from('event_players').select('player_id').eq('event_id', eid)
    setEventPlayers(data?.map(r => r.player_id) || [])
  }

  const handleEventChange = (eid) => {
    setEventId(eid)
    if (eid) fetchEventPlayers(eid)
    else setEventPlayers([])
  }

  const addPlayer = async () => {
    if (!form.name.trim() || form.pin.length !== 4) return
    const { error } = await supabase.from('players').insert({ name: form.name.trim(), pin: form.pin })
    if (!error) { setForm({ name: '', pin: '' }); fetchData(); showToast('Player added!', 'success') }
    else showToast(error.message, 'error')
  }

  const updatePin = async (playerId) => {
    if (newPin.length !== 4) return
    await supabase.from('players').update({ pin: newPin }).eq('id', playerId)
    setEditingPin(null)
    setNewPin('')
    fetchData()
    showToast('PIN updated', 'success')
  }

  const toggleEventPlayer = async (playerId) => {
    if (!eventId) return
    const inEvent = eventPlayers.includes(playerId)
    if (inEvent) {
      await supabase.from('event_players').delete().eq('event_id', eventId).eq('player_id', playerId)
      setEventPlayers(ep => ep.filter(id => id !== playerId))
      showToast('Removed from event', '')
    } else {
      await supabase.from('event_players').upsert({ event_id: eventId, player_id: playerId }, { onConflict: 'event_id,player_id' })
      setEventPlayers(ep => [...ep, playerId])
      showToast('Added to event ✓', 'success')
    }
  }

  const generatePin = () => setForm(f => ({ ...f, pin: String(Math.floor(1000 + Math.random() * 9000)) }))
  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      {/* Add new player */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Add New Player</h3>
        <div className="form-group">
          <label>Name</label>
          <input className="input" placeholder="John Smith" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addPlayer()} />
        </div>
        <div className="form-group">
          <label>PIN (4 digits — permanent until changed)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input input-mono" placeholder="1234" maxLength={4}
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            <button className="btn btn-ghost btn-sm" onClick={generatePin} style={{ flexShrink: 0 }}>Random</button>
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={addPlayer}
          disabled={!form.name.trim() || form.pin.length !== 4}>
          Add to Roster
        </button>
      </div>

      {/* Event assignment */}
      <div className="card card-sm">
        <label>Assign players to event</label>
        <select className="input" value={eventId} onChange={e => handleEventChange(e.target.value)}>
          <option value="">Select event...</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.year} — {ev.courses?.name || 'No course'}</option>)}
        </select>
        {eventId && (
          <p className="text-xs text-muted" style={{ marginTop: 6 }}>
            {eventPlayers.length} player{eventPlayers.length !== 1 ? 's' : ''} in this event · tap to toggle
          </p>
        )}
      </div>

      {/* Roster */}
      <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Roster ({players.length})
      </p>
      {players.map(p => {
        const inEvent = eventPlayers.includes(p.id)
        const isEditing = editingPin === p.id
        return (
          <div key={p.id} className="card card-sm" style={{
            marginBottom: 6,
            borderColor: inEvent && eventId ? 'var(--gold)' : 'var(--green-mid)',
            transition: 'border-color 0.15s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Event toggle checkbox */}
              {eventId && (
                <button onClick={() => toggleEventPlayer(p.id)} style={{
                  width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                  background: inEvent ? 'var(--gold)' : 'transparent',
                  border: `2px solid ${inEvent ? 'var(--gold)' : 'var(--green-mid)'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', color: 'var(--green-deep)'
                }}>
                  {inEvent ? '✓' : ''}
                </button>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
              </div>

              {/* PIN display / edit */}
              {isEditing ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input input-mono" maxLength={4} placeholder="New PIN"
                    style={{ width: 80, padding: '6px 8px', fontSize: '0.85rem' }}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    autoFocus />
                  <button className="btn btn-sm btn-primary" onClick={() => updatePin(p.id)} disabled={newPin.length !== 4}>Save</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditingPin(null); setNewPin('') }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="text-mono text-sm" style={{ color: 'var(--gray-300)', letterSpacing: '0.1em' }}>{p.pin}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditingPin(p.id); setNewPin('') }}>
                    Edit PIN
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── SCORES TAB ───────────────────────────────────────────────────────────────
function ScoresTab() {
  const [event, setEvent] = useState(null)
  const [players, setPlayers] = useState([])
  const [scorecards, setScorecards] = useState({})
  const [holes, setHoles] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [scores, setScores] = useState({})
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: ev } = await supabase
      .from('events')
      .select('*, courses(par, course_holes(*))')
      .not('status', 'eq', 'upcoming')
      .order('event_date', { ascending: false })
      .limit(1).single()

    if (!ev) return
    setEvent(ev)
    setHoles((ev.courses?.course_holes || []).sort((a, b) => a.hole_number - b.hole_number))

    const { data: eps } = await supabase.from('event_players').select('players(id, name)').eq('event_id', ev.id)
    const ps = eps?.map(e => e.players) || []
    setPlayers(ps)

    const { data: scs } = await supabase.from('scorecards').select('*').eq('event_id', ev.id)
    const scMap = {}
    scs?.forEach(sc => { scMap[sc.player_id] = sc })
    setScorecards(scMap)
  }

  const selectPlayer = (p) => {
    setSelectedPlayer(p)
    setScores(scorecards[p.id]?.hole_scores || {})
  }

  const handleSave = async () => {
    if (!selectedPlayer || !event) return
    const holeScores = {}
    Object.entries(scores).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
    const total = calculateTotal(holeScores)
    const holesCompleted = Object.keys(holeScores).length

    await supabase.from('scorecards').upsert({
      event_id: event.id, player_id: selectedPlayer.id,
      hole_scores: holeScores, total_score: total,
      holes_completed: holesCompleted, is_complete: holesCompleted >= 18,
      submitted_at: holesCompleted >= 18 ? new Date().toISOString() : null,
    }, { onConflict: 'event_id,player_id' })

    showToast(`${selectedPlayer.name} saved!`, 'success')
    fetchData()
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast('Analyzing scorecard with AI...', '')

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })

    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: 18 })
      })
      const data = await res.json()
      if (data.scores) {
        const parsed = {}
        data.scores.forEach((s, i) => { if (s) parsed[String(i + 1)] = s })
        setScores(parsed)
        showToast(`Parsed ${Object.keys(parsed).length} holes — review & save`, 'success')
      } else showToast('Could not parse. Enter manually.', 'error')
    } catch { showToast('Upload failed.', 'error') }

    setUploading(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const totalScore = calculateTotal(Object.fromEntries(Object.entries(scores).filter(([, v]) => v)))
  const par = event?.courses?.par

  return (
    <div>
      {/* Player selector */}
      <div className="card card-sm" style={{ marginBottom: 8 }}>
        <label>Select Player</label>
        <select className="input" value={selectedPlayer?.id || ''} onChange={e => { const p = players.find(p => p.id === e.target.value); selectPlayer(p || {}) }}>
          <option value="">Choose player...</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} {scorecards[p.id]?.is_complete ? '✓' : scorecards[p.id]?.holes_completed > 0 ? `(${scorecards[p.id].holes_completed}/18)` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedPlayer?.id && (
        <>
          {/* Photo upload */}
          <div className="card card-sm flex gap-2 items-center" style={{ marginBottom: 8 }}>
            <span className="text-sm flex-1">Upload scorecard photo for AI parsing</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '...' : '📸'}
            </button>
          </div>

          {/* Hole grid */}
          {holes.length > 0 && (
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: 12 }}>
                {holes.slice(0, 9).map(h => (
                  <div key={h.hole_number} className="hole-input-wrap">
                    <span className="hole-num">{h.hole_number}</span>
                    <input type="number" min="1" max="15" className="hole-input"
                      value={scores[String(h.hole_number)] || ''}
                      onChange={e => setScores(s => ({ ...s, [String(h.hole_number)]: e.target.value }))} />
                    <span style={{ fontSize: '0.55rem', color: 'var(--gray-500)' }}>p{h.par}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: 16 }}>
                {holes.slice(9, 18).map(h => (
                  <div key={h.hole_number} className="hole-input-wrap">
                    <span className="hole-num">{h.hole_number}</span>
                    <input type="number" min="1" max="15" className="hole-input"
                      value={scores[String(h.hole_number)] || ''}
                      onChange={e => setScores(s => ({ ...s, [String(h.hole_number)]: e.target.value }))} />
                    <span style={{ fontSize: '0.55rem', color: 'var(--gray-500)' }}>p{h.par}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                <span>Total: <strong className="text-mono" style={{ fontSize: '1.2rem' }}>{totalScore || '–'}</strong></span>
                {totalScore && par && (
                  <span className="text-mono" style={{ color: totalScore - par > 0 ? 'var(--red)' : totalScore - par < 0 ? 'var(--blue-birdie)' : 'var(--cream)' }}>
                    {totalScore - par === 0 ? 'E' : totalScore - par > 0 ? `+${totalScore - par}` : totalScore - par}
                  </span>
                )}
              </div>

              <button className="btn btn-primary btn-full" onClick={handleSave} disabled={!totalScore}>Save Scores</button>
            </div>
          )}
        </>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── TEAMS TAB ────────────────────────────────────────────────────────────────
function TeamsTab() {
  const [event, setEvent] = useState(null)
  const [teams, setTeams] = useState([])
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: ev } = await supabase
      .from('events')
      .select('*, courses(par, course_holes(hole_number, handicap_rank, par))')
      .in('status', ['morning_complete', 'afternoon_active', 'complete'])
      .order('event_date', { ascending: false }).limit(1).single()

    if (!ev) return
    setEvent(ev)

    const { data: existing } = await supabase.from('scramble_teams').select('*').eq('event_id', ev.id).order('team_number')
    if (existing?.length) {
      const { data: scs } = await supabase.from('scorecards').select('*, players(id, name)').eq('event_id', ev.id).eq('is_complete', true)
      const playerMap = {}
      scs?.forEach(sc => { playerMap[sc.player_id] = sc })
      const built = existing.map(t => ({ ...t, players: t.player_ids.map(pid => playerMap[pid]).filter(Boolean) }))
      setTeams(built)
    }
  }

  const generateTeams = async () => {
    if (!event) return
    setGenerating(true)

    const { data: scs } = await supabase.from('scorecards').select('*, players(id, name)').eq('event_id', event.id).eq('is_complete', true)
    const courseHoles = event.courses?.course_holes || []
    const withScores = (scs || []).map(sc => ({ ...sc, player: sc.players, total_score: sc.total_score || calculateTotal(sc.hole_scores) }))
    const sorted = sortPlayersByScore(withScores, courseHoles)

    try {
      const generated = generateScrambleTeams(sorted)

      // Save to DB
      await supabase.from('scramble_teams').delete().eq('event_id', event.id)
      for (const team of generated) {
        await supabase.from('scramble_teams').insert({
          event_id: event.id,
          team_number: team.team_number,
          player_ids: team.players.map(p => p.player.id),
          finishing_positions: team.finishing_positions,
        })
      }

      setTeams(generated)
      showToast('Teams generated and saved!', 'success')
    } catch (e) {
      showToast(e.message, 'error')
    }
    setGenerating(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }
  const COLORS = ['#c9a84c', '#6ab86a', '#4a9eca', '#e87040', '#a855f7', '#ec4899']

  return (
    <div>
      {event ? (
        <button className="btn btn-primary btn-full" style={{ marginBottom: 16 }} onClick={generateTeams} disabled={generating}>
          {generating ? 'Generating...' : '⚡ Generate / Regenerate Teams'}
        </button>
      ) : (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted">No event in morning_complete or later status.</p>
        </div>
      )}

      {teams.map((team, idx) => (
        <div key={team.team_number} className="team-card" style={{ borderLeftColor: COLORS[idx] }}>
          <div className="team-header">
            <strong>Team {team.team_number}</strong>
            <span className="text-xs text-muted text-mono">Pos: {(team.finishing_positions || []).join(', ')}</span>
          </div>
          {(team.players || []).map((p, pi) => (
            <div key={pi} className="team-player">
              <span className="team-position">#{team.finishing_positions?.[pi]}</span>
              <span>{p.player?.name || p.players?.name || 'Unknown'}</span>
              <span className="text-mono text-xs text-muted" style={{ marginLeft: 'auto' }}>{p.total_score}</span>
            </div>
          ))}
        </div>
      ))}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── COURSES TAB ──────────────────────────────────────────────────────────────
function CoursesTab() {
  const [courses, setCourses] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [holes, setHoles] = useState(Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4, handicap_rank: i + 1, yardage_white: '' })))
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchCourses() }, [])

  const fetchCourses = async () => {
    const { data } = await supabase.from('courses').select('*').order('name')
    setCourses(data || [])
  }

  const searchCourses = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)

    try {
      const res = await fetch(`/.netlify/functions/search-course?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.courses || [])
    } catch {
      showToast('Course search failed. Enter manually.', 'error')
    }
    setSearching(false)
  }

  const selectSearchResult = (course) => {
    setSelectedCourse(course)
    if (course.holes) {
      setHoles(course.holes.map(h => ({
        hole_number: h.number,
        par: h.par,
        handicap_rank: h.handicap || h.number,
        yardage_white: h.yardage || '',
        yardage_blue: h.yardage_blue || '',
        yardage_black: h.yardage_black || '',
      })))
    }
    setSearchResults([])
  }

  const saveCourse = async () => {
    if (!selectedCourse?.name) return
    setSaving(true)

    const { data: course, error } = await supabase.from('courses').insert({
      name: selectedCourse.name,
      city: selectedCourse.city,
      state: selectedCourse.state,
      par: holes.reduce((s, h) => s + (parseInt(h.par) || 4), 0),
      slope_rating: selectedCourse.slope_rating,
      course_rating: selectedCourse.course_rating,
    }).select().single()

    if (error) { showToast(error.message, 'error'); setSaving(false); return }

    for (const h of holes) {
      await supabase.from('course_holes').insert({ ...h, course_id: course.id, par: parseInt(h.par), handicap_rank: parseInt(h.handicap_rank) })
    }

    showToast('Course saved!', 'success')
    fetchCourses()
    setSelectedCourse(null)
    setSaving(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      {/* Search */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Add Course</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="Search course name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchCourses()} />
          <button className="btn btn-secondary btn-sm" onClick={searchCourses} disabled={searching} style={{ flexShrink: 0 }}>{searching ? '...' : '🔍'}</button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => selectSearchResult(r)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--green-deep)', border: '1px solid var(--green-mid)', borderRadius: 6, color: 'var(--cream)', cursor: 'pointer', marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                <span className="text-xs text-muted" style={{ display: 'block' }}>{r.city}, {r.state}</span>
              </button>
            ))}
          </div>
        )}

        {selectedCourse && (
          <>
            <div style={{ padding: 12, background: 'rgba(201,168,76,0.1)', borderRadius: 6, marginBottom: 12 }}>
              <strong>{selectedCourse.name}</strong>
              <p className="text-xs text-muted">{selectedCourse.city}, {selectedCourse.state}</p>
              {selectedCourse.course_rating && <p className="text-xs text-muted">Rating: {selectedCourse.course_rating} / Slope: {selectedCourse.slope_rating}</p>}
            </div>

            <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Hole Details</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--green-mid)' }}>
                    {['Hole', 'Par', 'Hdcp', 'Yards'].map(h => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: 'center', color: 'var(--gray-500)', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h, idx) => (
                    <tr key={h.hole_number} style={{ borderBottom: '1px solid var(--green-mid)' }}>
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{h.hole_number}</td>
                      <td style={{ padding: '4px' }}>
                        <input type="number" min="3" max="5" className="input" style={{ padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                          value={h.par} onChange={e => setHoles(hs => hs.map((hh, i) => i === idx ? { ...hh, par: e.target.value } : hh))} />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input type="number" min="1" max="18" className="input" style={{ padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                          value={h.handicap_rank} onChange={e => setHoles(hs => hs.map((hh, i) => i === idx ? { ...hh, handicap_rank: e.target.value } : hh))} />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input type="number" className="input" style={{ padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                          value={h.yardage_white} onChange={e => setHoles(hs => hs.map((hh, i) => i === idx ? { ...hh, yardage_white: e.target.value } : hh))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={saveCourse} disabled={saving}>
              {saving ? 'Saving...' : 'Save Course'}
            </button>
          </>
        )}
      </div>

      {/* Existing courses */}
      {courses.map(c => (
        <div key={c.id} className="card card-sm">
          <strong>{c.name}</strong>
          <p className="text-xs text-muted">{c.city}, {c.state} · Par {c.par}</p>
          {c.course_rating && <p className="text-xs text-muted">Rating: {c.course_rating} · Slope: {c.slope_rating}</p>}
        </div>
      ))}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
