import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { sortPlayersByScore, sortCombinedForSunday, generateScrambleTeams, calculateTotal, getCourseForRound, STATUS_FLOW, formatTime } from '../lib/golf'

const TABS = ['Event', 'Players', 'Scores', 'Teams', 'Courses']

export default function CommissionerPage() {
  const { isCommissioner, signOutCommissioner } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Event')

  if (!isCommissioner) return (
    <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</p>
      <p className="text-muted" style={{ marginBottom: 20 }}>Commissioner access required</p>
      <button className="btn btn-primary" onClick={() => navigate('/login')}>Commissioner Login</button>
    </div></div>
  )

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Admin Panel</div>
          <div className="flex justify-between items-center">
            <h1>Commissioner</h1>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await signOutCommissioner(); navigate('/') }}>Sign Out</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius)', background: tab === t ? 'var(--gold)' : 'var(--green-dark)', color: tab === t ? 'var(--green-deep)' : 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: tab === t ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Event'   && <EventTab />}
        {tab === 'Players' && <PlayersTab />}
        {tab === 'Scores'  && <ScoresTab />}
        {tab === 'Teams'   && <TeamsTab />}
        {tab === 'Courses' && <CoursesTab />}
      </div>
    </div>
  )
}

// ─── EVENT TAB ────────────────────────────────────────────────────────────────
function EventTab() {
  const [events, setEvents] = useState([])
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState({ year: new Date().getFullYear(), event_date: '', friday_course_id: '', saturday_course_id: '', sunday_course_id: '', friday_tee_time: '', saturday_tee_time: '', sunday_tee_time: '', player_count: 20 })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: evs }, { data: cs }] = await Promise.all([db('list_events'), db('list_courses')])
    setEvents(evs || [])
    setCourses(cs || [])
  }

  const save = async () => {
    setSaving(true)
    const result = await db('upsert_event', form).catch(e => ({ error: e.message }))
    setSaving(false)
    if (result.error) showToast(result.error, 'error')
    else { showToast('Event saved!', 'success'); fetchData() }
  }

  const updateStatus = async (id, status) => {
    await db('update_event_status', { id, status, active_round: STATUS_FLOW.find(s => s.status === status)?.round || null })
    fetchData()
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const CourseSelect = ({ label, field }) => (
    <div className="form-group">
      <label>{label}</label>
      <select className="input" value={form[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}>
        <option value="">Select course...</option>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name} (par {c.par})</option>)}
      </select>
    </div>
  )

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
          <label>Event Date (Friday)</label>
          <input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
        </div>

        <p className="text-xs text-muted text-mono" style={{ marginBottom: 12, textTransform: 'uppercase' }}>Course Assignments</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CourseSelect label="Friday Course" field="friday_course_id" />
          <div className="form-group">
            <label>Friday Tee Time</label>
            <input type="time" className="input" value={form.friday_tee_time} onChange={e => setForm(f => ({ ...f, friday_tee_time: e.target.value }))} />
          </div>
          <CourseSelect label="Saturday Course" field="saturday_course_id" />
          <div className="form-group">
            <label>Saturday Tee Time</label>
            <input type="time" className="input" value={form.saturday_tee_time} onChange={e => setForm(f => ({ ...f, saturday_tee_time: e.target.value }))} />
          </div>
          <CourseSelect label="Sunday Course" field="sunday_course_id" />
          <div className="form-group">
            <label>Sunday Tee Time</label>
            <input type="time" className="input" value={form.sunday_tee_time} onChange={e => setForm(f => ({ ...f, sunday_tee_time: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Event'}</button>
      </div>

      {events.map(ev => (
        <div key={ev.id} className="card card-sm">
          <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
            <strong>{ev.year}</strong>
            <span className={`badge ${ev.status === 'upcoming' || ev.status === 'complete' ? 'badge-gray' : 'badge-gold'}`}>{ev.status.replace(/_/g, ' ')}</span>
          </div>
          {ev.friday_course_name && <p className="text-xs text-muted" style={{ marginBottom: 6 }}>Fri: {ev.friday_course_name} · Sat: {ev.saturday_course_name || '?'} · Sun: {ev.sunday_course_name || '?'}</p>}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STATUS_FLOW.map(s => (
              <button key={s.status} className={`btn btn-sm ${ev.status === s.status ? 'btn-primary' : 'btn-ghost'}`} onClick={() => updateStatus(ev.id, s.status)}>
                {s.label}
              </button>
            ))}
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
  const [eventPlayers, setEventPlayers] = useState([])
  const [form, setForm] = useState({ name: '', pin: '' })
  const [editingPin, setEditingPin] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: ps }, { data: evs }] = await Promise.all([db('list_players'), db('list_events')])
    setPlayers(ps || [])
    setEvents(evs || [])
  }

  const handleEventChange = async (eid) => {
    setEventId(eid)
    if (eid) {
      const { data } = await db('get_event_players', { event_id: eid })
      setEventPlayers(data?.map(r => r.player_id) || [])
    } else setEventPlayers([])
  }

  const addPlayer = async () => {
    if (!form.name.trim() || form.pin.length !== 4) return
    const result = await db('insert_player', { name: form.name.trim(), pin: form.pin }).catch(e => ({ error: e.message }))
    if (!result.error) { setForm({ name: '', pin: '' }); fetchData(); showToast('Player added!', 'success') }
    else showToast(result.error, 'error')
  }

  const updatePin = async (pid) => {
    if (newPin.length !== 4) return
    await db('update_player_pin', { id: pid, pin: newPin })
    setEditingPin(null); setNewPin(''); fetchData(); showToast('PIN updated', 'success')
  }

  const togglePlayer = async (playerId) => {
    if (!eventId) return
    const inEvent = eventPlayers.includes(playerId)
    await db('toggle_event_player', { event_id: eventId, player_id: playerId, add: !inEvent })
    setEventPlayers(ep => inEvent ? ep.filter(id => id !== playerId) : [...ep, playerId])
    showToast(inEvent ? 'Removed from event' : 'Added ✓', inEvent ? '' : 'success')
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Add New Player</h3>
        <div className="form-group">
          <label>Name</label>
          <input className="input" placeholder="John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPlayer()} />
        </div>
        <div className="form-group">
          <label>PIN (4 digits — permanent until changed)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input input-mono" placeholder="1234" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, pin: String(Math.floor(1000 + Math.random() * 9000)) }))}>Random</button>
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={addPlayer} disabled={!form.name.trim() || form.pin.length !== 4}>Add to Roster</button>
      </div>

      <div className="card card-sm">
        <label>Assign players to event</label>
        <select className="input" value={eventId} onChange={e => handleEventChange(e.target.value)}>
          <option value="">Select event...</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.year} Outing</option>)}
        </select>
        {eventId && <p className="text-xs text-muted" style={{ marginTop: 6 }}>{eventPlayers.length} players in this event · tap to toggle</p>}
      </div>

      <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Roster ({players.length})</p>
      {players.map(p => {
        const inEvent = eventPlayers.includes(p.id)
        const isEditing = editingPin === p.id
        return (
          <div key={p.id} className="card card-sm" style={{ marginBottom: 6, borderColor: inEvent && eventId ? 'var(--gold)' : 'var(--green-mid)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {eventId && (
                <button onClick={() => togglePlayer(p.id)} style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, background: inEvent ? 'var(--gold)' : 'transparent', border: `2px solid ${inEvent ? 'var(--gold)' : 'var(--green-mid)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--green-deep)' }}>
                  {inEvent ? '✓' : ''}
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 500 }}>{p.name}</span></div>
              {isEditing ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input input-mono" maxLength={4} placeholder="New PIN" style={{ width: 80, padding: '6px 8px', fontSize: '0.85rem' }} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus />
                  <button className="btn btn-sm btn-primary" onClick={() => updatePin(p.id)} disabled={newPin.length !== 4}>Save</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditingPin(null); setNewPin('') }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="text-mono text-sm" style={{ color: 'var(--gray-300)', letterSpacing: '0.1em' }}>{p.pin}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditingPin(p.id); setNewPin('') }}>Edit PIN</button>
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
  const ROUNDS_STROKE = [
    { key: 'friday_morning',   day: 'friday',   rt: 'morning',   label: 'Friday AM' },
    { key: 'saturday_morning', day: 'saturday', rt: 'morning',   label: 'Saturday AM' },
  ]
  const [event, setEvent] = useState(null)
  const [players, setPlayers] = useState([])
  const [holes, setHoles] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedRound, setSelectedRound] = useState('friday_morning')
  const [scores, setScores] = useState({})
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (event) loadHoles(event) }, [selectedRound, event])

  const fetchData = async () => {
    const { data: ev } = await db('get_current_event')
    if (!ev) return
    setEvent(ev)
    const { data: eps } = await db('get_event_players', { event_id: ev.id })
    setPlayers(eps || [])
  }

  const loadHoles = async (ev) => {
    const def = ROUNDS_STROKE.find(r => r.key === selectedRound)
    const course = getCourseForRound(ev, def?.day)
    if (course?.id) {
      const { data: h } = await db('get_course_holes', { course_id: course.id })
      setHoles((h || []).sort((a, b) => a.hole_number - b.hole_number))
    }
  }

  const selectPlayer = async (p) => {
    setSelectedPlayer(p); setScores({})
    const def = ROUNDS_STROKE.find(r => r.key === selectedRound)
    if (!event || !def || !p) return
    const course = getCourseForRound(event, def.day)
    if (!course?.id) return
    const { data: sc } = await db('get_player_round', { event_id: event.id, player_id: p.player_id, day: def.day, round_time: def.rt })
    if (sc?.hole_scores) setScores(typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores)
  }

  const save = async () => {
    if (!selectedPlayer || !event) return
    const def = ROUNDS_STROKE.find(r => r.key === selectedRound)
    const course = getCourseForRound(event, def.day)
    const holeScores = {}
    Object.entries(scores).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
    const total = calculateTotal(holeScores)
    await db('upsert_round_score', { event_id: event.id, player_id: selectedPlayer.player_id, course_id: course?.id, day: def.day, round_time: def.rt, is_scramble: false, hole_scores: holeScores, total_score: total, holes_completed: Object.keys(holeScores).length, is_complete: Object.keys(holeScores).length >= 18 })
    showToast(`${selectedPlayer.name} saved!`, 'success')
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast('Analyzing with AI...', '')
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: 18 }) })
      const data = await res.json()
      if (data.scores) {
        const parsed = {}
        data.scores.forEach((s, i) => { if (s) parsed[String(i + 1)] = s })
        setScores(parsed)
        showToast(`Parsed ${Object.keys(parsed).length} holes — review & save`, 'success')
      } else showToast('Could not parse.', 'error')
    } catch { showToast('Upload failed.', 'error') }
    setUploading(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }
  const total = calculateTotal(Object.fromEntries(Object.entries(scores).filter(([, v]) => v)))
  const def = ROUNDS_STROKE.find(r => r.key === selectedRound)
  const course = event && def ? getCourseForRound(event, def.day) : null

  return (
    <div>
      {/* Round selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {ROUNDS_STROKE.map(r => (
          <button key={r.key} onClick={() => { setSelectedRound(r.key); setScores({}); setSelectedPlayer(null) }}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 'var(--radius)', background: selectedRound === r.key ? 'var(--gold)' : 'var(--green-dark)', color: selectedRound === r.key ? 'var(--green-deep)' : 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: selectedRound === r.key ? 600 : 400, cursor: 'pointer' }}>
            {r.label}{course ? ` — ${course.name}` : ''}
          </button>
        ))}
      </div>

      <div className="card card-sm" style={{ marginBottom: 8 }}>
        <label>Select Player</label>
        <select className="input" value={selectedPlayer?.player_id || ''} onChange={e => { const p = players.find(p => p.player_id === e.target.value); selectPlayer(p || null) }}>
          <option value="">Choose player...</option>
          {players.map(p => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
        </select>
      </div>

      {selectedPlayer && (
        <>
          <div className="card card-sm flex gap-2 items-center" style={{ marginBottom: 8 }}>
            <span className="text-sm flex-1">Upload scorecard photo for AI parsing</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '...' : '📸'}</button>
          </div>
          {holes.length > 0 && (
            <div className="card">
              {[holes.slice(0, 9), holes.slice(9, 18)].map((nine, ni) => (
                <div key={ni}>
                  <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>{ni === 0 ? 'Front Nine' : 'Back Nine'}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: ni === 0 ? 12 : 16 }}>
                    {nine.map(h => (
                      <div key={h.hole_number} className="hole-input-wrap">
                        <span className="hole-num">{h.hole_number}</span>
                        <input type="number" min="1" max="15" className="hole-input"
                          value={scores[String(h.hole_number)] || ''}
                          onChange={e => setScores(s => ({ ...s, [String(h.hole_number)]: e.target.value }))} />
                        <span style={{ fontSize: '0.55rem', color: 'var(--gray-500)' }}>p{h.par}</span>
                      </div>
                    ))}
                  </div>
                  {ni === 0 && <hr className="divider" />}
                </div>
              ))}
              <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                <span>Total: <strong className="text-mono" style={{ fontSize: '1.2rem' }}>{total || '–'}</strong></span>
                {total && course?.par && <span className="text-mono" style={{ color: total - course.par > 0 ? 'var(--red)' : total - course.par < 0 ? 'var(--blue-birdie)' : 'var(--cream)' }}>{total - course.par === 0 ? 'E' : total - course.par > 0 ? `+${total - course.par}` : total - course.par}</span>}
              </div>
              <button className="btn btn-primary btn-full" onClick={save} disabled={!total}>Save Scores</button>
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
  const SCRAMBLE_DEFS = [
    { key: 'friday_afternoon',   label: 'Friday PM',   seeded_by_day: 'friday',   seeded_by_rt: 'morning' },
    { key: 'saturday_afternoon', label: 'Saturday PM', seeded_by_day: 'saturday', seeded_by_rt: 'morning' },
    { key: 'sunday_morning',     label: 'Sunday',      seeded_by_day: 'combined', seeded_by_rt: null },
  ]
  const [event, setEvent] = useState(null)
  const [selectedRound, setSelectedRound] = useState('friday_afternoon')
  const [teams, setTeams] = useState([])
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchEvent() }, [])

  const fetchEvent = async () => {
    const { data: ev } = await db('get_current_event')
    setEvent(ev)
    if (ev) await fetchTeams(ev, selectedRound)
  }

  const fetchTeams = async (ev, roundKey) => {
    const { data } = await db('get_scramble_teams', { event_id: ev.id, round: roundKey })
    if (data?.length) {
      // Get player names
      let playerMap = {}
      const def = SCRAMBLE_DEFS.find(d => d.key === roundKey)
      if (def.seeded_by_day === 'combined') {
        const { data: combined } = await db('get_combined_totals', { event_id: ev.id })
        combined?.forEach(p => { playerMap[p.player_id] = p })
      } else {
        const { data: scores } = await db('get_round_scores', { event_id: ev.id, day: def.seeded_by_day, round_time: def.seeded_by_rt })
        scores?.forEach(s => { playerMap[s.player_id] = s })
      }
      const built = data.map(t => ({
        ...t,
        player_ids: typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids,
        finishing_positions: typeof t.finishing_positions === 'string' ? JSON.parse(t.finishing_positions) : t.finishing_positions,
        players: (typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids).map(pid => playerMap[pid]).filter(Boolean),
      }))
      setTeams(built)
    } else setTeams([])
  }

  const generate = async () => {
    if (!event) return
    setGenerating(true)
    const def = SCRAMBLE_DEFS.find(d => d.key === selectedRound)

    let sorted = []
    if (def.seeded_by_day === 'combined') {
      const [{ data: combined }, { data: friHoles }, { data: satHoles }] = await Promise.all([
        db('get_combined_totals', { event_id: event.id }),
        event.friday_course_id ? db('get_course_holes', { course_id: event.friday_course_id }) : Promise.resolve({ data: [] }),
        event.saturday_course_id ? db('get_course_holes', { course_id: event.saturday_course_id }) : Promise.resolve({ data: [] }),
      ])
      sorted = sortCombinedForSunday(combined || [], friHoles || [], satHoles || [])
        .map(p => ({ ...p, total_score: p.combined_score }))
    } else {
      const [{ data: scores }, courseData] = await Promise.all([
        db('get_round_scores', { event_id: event.id, day: def.seeded_by_day, round_time: def.seeded_by_rt }),
        (() => { const c = getCourseForRound(event, def.seeded_by_day); return c?.id ? db('get_course_holes', { course_id: c.id }) : Promise.resolve({ data: [] }) })(),
      ])
      const withScores = (scores || [])
        .filter(sc => sc.is_complete && sc.total_score > 0)
        .map(sc => ({ ...sc, hole_scores: typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores || {} }))
      sorted = sortPlayersByScore(withScores, courseData.data || [])
    }

    try {
      const generated = generateScrambleTeams(sorted)
      await db('save_scramble_teams', {
        event_id: event.id, round: selectedRound,
        teams: generated.map(t => ({
          team_number: t.team_number,
          player_ids: t.players.map(p => p.player_id),
          finishing_positions: t.finishing_positions,
        }))
      })
      await fetchTeams(event, selectedRound)
      showToast('Teams generated and saved!', 'success')
    } catch (e) { showToast(e.message, 'error') }
    setGenerating(false)
  }

  const handleRoundChange = (key) => {
    setSelectedRound(key)
    setTeams([])
    if (event) fetchTeams(event, key)
  }

  const COLORS = ['#c9a84c','#6ab86a','#4a9eca','#e87040','#a855f7','#ec4899']
  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {SCRAMBLE_DEFS.map(d => (
          <button key={d.key} onClick={() => handleRoundChange(d.key)}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 'var(--radius)', background: selectedRound === d.key ? 'var(--gold)' : 'var(--green-dark)', color: selectedRound === d.key ? 'var(--green-deep)' : 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: selectedRound === d.key ? 600 : 400, cursor: 'pointer' }}>
            {d.label}
          </button>
        ))}
      </div>

      {event && (
        <button className="btn btn-primary btn-full" style={{ marginBottom: 16 }} onClick={generate} disabled={generating}>
          {generating ? 'Generating...' : `⚡ Generate ${SCRAMBLE_DEFS.find(d=>d.key===selectedRound)?.label} Teams`}
        </button>
      )}

      {teams.map((team, idx) => (
        <div key={team.team_number} className="team-card" style={{ borderLeftColor: COLORS[idx] }}>
          <div className="team-header">
            <strong>Team {team.team_number}</strong>
            <span className="text-xs text-muted text-mono">Pos: {(team.finishing_positions||[]).join(', ')}</span>
          </div>
          {(team.players||[]).map((p, pi) => (
            <div key={pi} className="team-player">
              <span className="team-position">#{team.finishing_positions?.[pi]}</span>
              <span>{p.player_name}</span>
              <span className="text-mono text-xs text-muted" style={{ marginLeft: 'auto' }}>{p.total_score || p.combined_score}</span>
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
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [holes, setHoles] = useState(Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4, handicap_rank: i + 1, yardage_white: '' })))
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { db('list_courses').then(({ data }) => setCourses(data || [])) }, [])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/.netlify/functions/search-course?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.courses || [])
    } catch { showToast('Search failed. Enter manually.', 'error') }
    setSearching(false)
  }

  const saveCourse = async () => {
    if (!selected?.name) return
    setSaving(true)
    const result = await db('insert_course', { name: selected.name, city: selected.city, state: selected.state, par: holes.reduce((s, h) => s + (parseInt(h.par) || 4), 0), slope_rating: selected.slope_rating, course_rating: selected.course_rating }).catch(e => ({ error: e.message }))
    if (result.error) { showToast(result.error, 'error'); setSaving(false); return }
    await db('insert_holes', { course_id: result.data.id, holes: holes.map(h => ({ ...h, par: parseInt(h.par), handicap_rank: parseInt(h.handicap_rank) })) })
    showToast('Course saved!', 'success')
    db('list_courses').then(({ data }) => setCourses(data || []))
    setSelected(null); setSaving(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Add Course</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="Search course name..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="btn btn-secondary btn-sm" onClick={search} disabled={searching} style={{ flexShrink: 0 }}>{searching ? '...' : '🔍'}</button>
        </div>
        {results.map((r, i) => (
          <button key={i} onClick={() => { setSelected(r); setResults([]) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--green-deep)', border: '1px solid var(--green-mid)', borderRadius: 6, color: 'var(--cream)', cursor: 'pointer', marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>{r.name}</span>
            <span className="text-xs text-muted" style={{ display: 'block' }}>{r.city}, {r.state}</span>
          </button>
        ))}
        {selected && (
          <>
            <div style={{ padding: 12, background: 'rgba(201,168,76,0.1)', borderRadius: 6, marginBottom: 12 }}>
              <strong>{selected.name}</strong><br />
              <span className="text-xs text-muted">{selected.city}, {selected.state}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--green-mid)' }}>
                    {['Hole','Par','Hdcp','Yards'].map(h => <th key={h} style={{ padding: '4px 6px', textAlign: 'center', color: 'var(--gray-500)', fontWeight: 400 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h, idx) => (
                    <tr key={h.hole_number} style={{ borderBottom: '1px solid var(--green-mid)' }}>
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{h.hole_number}</td>
                      {['par','handicap_rank','yardage_white'].map(field => (
                        <td key={field} style={{ padding: 4 }}>
                          <input type="number" className="input" style={{ padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                            value={h[field]} onChange={e => setHoles(hs => hs.map((hh, i) => i === idx ? { ...hh, [field]: e.target.value } : hh))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={saveCourse} disabled={saving}>{saving ? 'Saving...' : 'Save Course'}</button>
          </>
        )}
      </div>

      {courses.map(c => (
        <div key={c.id} className="card card-sm">
          <strong>{c.name}</strong>
          <p className="text-xs text-muted">{c.city}, {c.state} · Par {c.par}{c.course_rating ? ` · Rating ${c.course_rating}/${c.slope_rating}` : ''}</p>
        </div>
      ))}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
