import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { sortPlayersByScore, sortCombinedForSunday, generateScrambleTeams, calculateTotal, getCourseForRound, STATUS_FLOW, formatTime } from '../lib/golf'

const TABS = ['Event', 'Players', 'Groups', 'Scores', 'Teams', 'Courses']

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
        {tab === 'Groups'  && <GroupsTab />}
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
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(null) // null until an event is loaded or Create clicked
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const EMPTY_FORM = {
    year: new Date().getFullYear(),
    event_date: '',
    status: 'upcoming',
    player_count: 20,
    friday_course_id: '',
    friday_pm_course_id: '',   // only used if multiple_courses
    friday_tee_time: '',
    friday_afternoon_tee_time: '',
    saturday_course_id: '',
    saturday_pm_course_id: '', // only used if multiple_courses
    saturday_tee_time: '',
    saturday_afternoon_tee_time: '',
    sunday_course_id: '',
    sunday_tee_time: '',
    friday_split: false,     // separate AM/PM courses on Friday
    saturday_split: false,   // separate AM/PM courses on Saturday
  }

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: evs }, { data: cs }] = await Promise.all([db('list_events'), db('list_courses')])
    setEvents(evs || [])
    setCourses(cs || [])
    // Default: load the most recent non-complete event
    const current = (evs || []).find(e => e.status !== 'complete') || evs?.[0]
    if (current) loadEvent(current, evs || [])
  }

  const loadEvent = (ev, evList) => {
    setCreating(false)
    setSelectedEventId(ev.id)
    setForm({
      ...EMPTY_FORM,
      year: ev.year,
      event_date: ev.event_date ? String(ev.event_date).split('T')[0] : '',
      status: ev.status || 'upcoming',
      player_count: ev.player_count || 20,
      friday_course_id: ev.friday_course_id || '',
      friday_tee_time: ev.friday_tee_time || '',
      friday_afternoon_tee_time: ev.friday_afternoon_tee_time || '',
      saturday_course_id: ev.saturday_course_id || '',
      saturday_tee_time: ev.saturday_tee_time || '',
      saturday_afternoon_tee_time: ev.saturday_afternoon_tee_time || '',
      sunday_course_id: ev.sunday_course_id || '',
      sunday_tee_time: ev.sunday_tee_time || '',
      friday_split: false,
      saturday_split: false,
    })
  }

  const startCreate = () => {
    setCreating(true)
    setSelectedEventId(null)
    setForm({ ...EMPTY_FORM })
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const save = async () => {
    if (!form) return
    setSaving(true)
    const payload = { ...form }
    // If not multiple courses, PM course = AM course for each day
    if (!form.multiple_courses) {
      payload.friday_pm_course_id = form.friday_course_id
      payload.saturday_pm_course_id = form.saturday_course_id
    }
    const result = await db('upsert_event', payload).catch(e => ({ error: e.message }))
    setSaving(false)
    if (result.error) showToast(result.error, 'error')
    else {
      showToast(creating ? 'Event created!' : 'Event saved!', 'success')
      setCreating(false)
      fetchData()
    }
  }

  const updateStatus = async (status) => {
    if (!selectedEventId) return
    await db('update_event_status', {
      id: selectedEventId, status,
      active_round: STATUS_FLOW.find(s => s.status === status)?.round || null
    })
    setForm(f => ({ ...f, status }))
    fetchData()
    showToast('Status updated', 'success')
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const CourseSelect = ({ label, field }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label>{label}</label>
      <select className="input" value={form?.[field] || ''} onChange={e => set(field, e.target.value)}>
        <option value="">Select course...</option>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name} (par {c.par})</option>)}
      </select>
    </div>
  )

  const TimeInput = ({ label, field }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label>{label}</label>
      <input type="time" className="input" value={form?.[field] || ''} onChange={e => set(field, e.target.value)} />
    </div>
  )

  const selectedEvent = events.find(e => e.id === selectedEventId)

  return (
    <div>
      {/* Header: event selector + Create button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <select className="input" style={{ flex: 1 }}
          value={selectedEventId || ''}
          onChange={e => {
            const ev = events.find(ev => ev.id === e.target.value)
            if (ev) loadEvent(ev, events)
          }}>
          <option value="">Select event to update...</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.year} Outing — {ev.status.replace(/_/g,' ')}</option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={startCreate} style={{ flexShrink: 0 }}>
          + Create
        </button>
      </div>

      {form && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>{creating ? 'New Event' : `${form.year} Outing`}</h3>

          {/* Row 1: Year + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Year</label>
              <input type="number" className="input" value={form.year}
                onChange={e => set('year', parseInt(e.target.value))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Event Date (Friday)</label>
              <input type="date" className="input" value={form.event_date}
                onChange={e => set('event_date', e.target.value)} />
            </div>
          </div>

          {/* Round status tabs — only show when updating existing event */}
          {!creating && selectedEvent && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>Round Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {STATUS_FLOW.map(s => (
                  <button key={s.status}
                    onClick={() => updateStatus(s.status)}
                    style={{
                      padding: '8px 4px', border: 'none', borderRadius: 'var(--radius)',
                      background: form.status === s.status ? 'var(--gold)' : 'var(--green-deep)',
                      color: form.status === s.status ? 'var(--green-deep)' : 'var(--gray-300)',
                      fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                      fontWeight: form.status === s.status ? 600 : 400,
                      cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Player count */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Player Count</label>
            <select className="input" value={form.player_count} onChange={e => set('player_count', parseInt(e.target.value))}>
              <option value={16}>16 players — 4 teams</option>
              <option value={20}>20 players — 5 teams</option>
              <option value={24}>24 players — 6 teams</option>
            </select>
          </div>



          {/* Course Assignments */}
          <div>
            {/* FRIDAY */}
            <div style={{ marginBottom: 14, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p className="text-xs text-muted text-mono" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Friday</p>
                <button onClick={() => set('friday_split', !form.friday_split)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: form.friday_split ? 'var(--gold)' : 'transparent', border: `2px solid ${form.friday_split ? 'var(--gold)' : 'var(--green-mid)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--green-deep)', flexShrink: 0 }}>{form.friday_split ? '✓' : ''}</div>
                  <span className="text-xs text-muted">Split AM/PM</span>
                </button>
              </div>
              {form.friday_split ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <CourseSelect label="AM Course" field="friday_course_id" />
                  <TimeInput label="AM Tee Time" field="friday_tee_time" />
                  <CourseSelect label="PM Course" field="friday_pm_course_id" />
                  <TimeInput label="PM Tee Time" field="friday_afternoon_tee_time" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <CourseSelect label="Course" field="friday_course_id" />
                  <div />
                  <TimeInput label="AM Tee Time" field="friday_tee_time" />
                  <TimeInput label="PM Tee Time" field="friday_afternoon_tee_time" />
                </div>
              )}
            </div>

            {/* SATURDAY */}
            <div style={{ marginBottom: 14, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p className="text-xs text-muted text-mono" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saturday</p>
                <button onClick={() => set('saturday_split', !form.saturday_split)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: form.saturday_split ? 'var(--gold)' : 'transparent', border: `2px solid ${form.saturday_split ? 'var(--gold)' : 'var(--green-mid)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--green-deep)', flexShrink: 0 }}>{form.saturday_split ? '✓' : ''}</div>
                  <span className="text-xs text-muted">Split AM/PM</span>
                </button>
              </div>
              {form.saturday_split ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <CourseSelect label="AM Course" field="saturday_course_id" />
                  <TimeInput label="AM Tee Time" field="saturday_tee_time" />
                  <CourseSelect label="PM Course" field="saturday_pm_course_id" />
                  <TimeInput label="PM Tee Time" field="saturday_afternoon_tee_time" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <CourseSelect label="Course" field="saturday_course_id" />
                  <div />
                  <TimeInput label="AM Tee Time" field="saturday_tee_time" />
                  <TimeInput label="PM Tee Time" field="saturday_afternoon_tee_time" />
                </div>
              )}
            </div>

            {/* SUNDAY */}
            <div style={{ marginBottom: 16, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 12 }}>
              <p className="text-xs text-muted text-mono" style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sunday</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <CourseSelect label="Scramble Course" field="sunday_course_id" />
                <TimeInput label="Tee Time" field="sunday_tee_time" />
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : creating ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      )}

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
          {events.filter(ev => ev.status !== 'complete').map(ev => <option key={ev.id} value={ev.id}>{ev.year} Outing</option>)}
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
  const ALL_ROUNDS = [
    { key: 'friday_morning',    day: 'friday',   rt: 'morning',   label: 'Fri AM Singles',  is_scramble: false },
    { key: 'friday_afternoon',  day: 'friday',   rt: 'afternoon', label: 'Fri PM Scramble', is_scramble: true  },
    { key: 'saturday_morning',  day: 'saturday', rt: 'morning',   label: 'Sat AM Singles',  is_scramble: false },
    { key: 'saturday_afternoon',day: 'saturday', rt: 'afternoon', label: 'Sat PM Scramble', is_scramble: true  },
    { key: 'sunday_morning',    day: 'sunday',   rt: 'morning',   label: 'Sun Scramble',    is_scramble: true  },
  ]

  const [event, setEvent] = useState(null)
  const [selectedRound, setSelectedRound] = useState('friday_morning')
  const [groups, setGroups] = useState([])       // morning groups for stroke play rounds
  const [scrambleTeams, setScrambleTeams] = useState([]) // for scramble rounds
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [groupMembers, setGroupMembers] = useState([])   // [{ player_id, name }]
  const [holes, setHoles] = useState([])
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState({})        // { playerId: { "1": 4, "2": 5 } }
  const [scrambleScore, setScrambleScore] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchEvent() }, [])
  useEffect(() => { if (event) fetchRoundData() }, [selectedRound, event])

  const fetchEvent = async () => {
    const { data: ev } = await db('get_current_event')
    setEvent(ev)
  }

  const fetchRoundData = async () => {
    if (!event) return
    const def = ALL_ROUNDS.find(r => r.key === selectedRound)
    setSelectedGroupId(null)
    setGroupMembers([])
    setScores({})
    setCurrentHole(1)

    // Load holes for the course
    const course = getCourseForRound(event, def.day)
    if (course?.id) {
      const { data: h } = await db('get_course_holes', { course_id: course.id })
      setHoles((h || []).sort((a, b) => a.hole_number - b.hole_number))
    } else {
      setHoles([])
    }

    if (!def.is_scramble) {
      // Load morning groups for group-based entry
      const { data: g } = await db('get_groups', { event_id: event.id, day: def.day })
      setGroups(g || [])
      setScrambleTeams([])
    } else {
      // Load scramble teams
      const { data: t } = await db('get_scramble_teams', { event_id: event.id, round: selectedRound })
      setScrambleTeams(t || [])
      setGroups([])
    }
  }

  const selectGroup = async (group) => {
    setSelectedGroupId(group.id || group.group_number)
    const members = group.players || []
    setGroupMembers(members)
    setCurrentHole(1)

    // Load existing scores for all members
    const def = ALL_ROUNDS.find(r => r.key === selectedRound)
    const course = getCourseForRound(event, def.day)
    if (!course?.id) return
    const newScores = {}
    await Promise.all(members.map(async m => {
      const pid = m.player_id
      const { data: sc } = await db('get_player_round', {
        event_id: event.id, player_id: pid, day: def.day, round_time: def.rt
      })
      newScores[pid] = sc?.hole_scores
        ? (typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores)
        : {}
    }))
    setScores(newScores)
  }

  const selectTeam = async (team) => {
    const pids = typeof team.player_ids === 'string' ? JSON.parse(team.player_ids) : team.player_ids
    const def = ALL_ROUNDS.find(r => r.key === selectedRound)
    // Get player names from round scores if available
    const { data: allScores } = await db('get_round_scores', { event_id: event.id, day: def.day, round_time: def.rt })
    const playerMap = {}
    allScores?.forEach(s => { playerMap[s.player_id] = s.player_name })
    const members = pids.map(pid => ({ player_id: pid, name: playerMap[pid] || pid }))
    setGroupMembers(members)
    setSelectedGroupId(team.id || team.team_number)
    // Load existing scramble score
    if (members[0]) {
      const { data: sc } = await db('get_player_round', {
        event_id: event.id, player_id: members[0].player_id, day: def.day, round_time: def.rt
      })
      if (sc?.total_score) setScrambleScore(String(sc.total_score))
    }
  }

  const setScore = (playerId, holeNum, value) => {
    setScores(s => ({ ...s, [playerId]: { ...s[playerId], [String(holeNum)]: value } }))
  }

  const adjustScore = (playerId, holeNum, delta) => {
    const current = scores[playerId]?.[String(holeNum)] ?? 4
    const next = Math.max(1, Math.min(15, current + delta))
    setScore(playerId, holeNum, next)
  }

  const saveAll = async () => {
    if (!event || groupMembers.length === 0) return
    setSaving(true)
    const def = ALL_ROUNDS.find(r => r.key === selectedRound)
    const course = getCourseForRound(event, def.day)

    if (def.is_scramble) {
      // Scramble: one score for all players
      const score = parseInt(scrambleScore)
      if (!isNaN(score)) {
        await db('save_scramble_score', {
          event_id: event.id, course_id: course?.id,
          day: def.day, round_time: def.rt,
          player_ids: groupMembers.map(m => m.player_id),
          score,
        })
        showToast('Scramble score saved!', 'success')
      }
    } else {
      // Stroke play: save each player's hole scores
      for (const member of groupMembers) {
        const holeScores = {}
        Object.entries(scores[member.player_id] || {}).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
        const total = Object.values(holeScores).reduce((a, v) => a + v, 0)
        const holesCompleted = Object.keys(holeScores).length
        await db('upsert_round_score', {
          event_id: event.id, player_id: member.player_id, course_id: course?.id,
          day: def.day, round_time: def.rt, is_scramble: false,
          hole_scores: holeScores, total_score: total,
          holes_completed: holesCompleted, is_complete: holesCompleted >= 18,
        })
      }
      showToast(`Saved ${groupMembers.length} scorecards!`, 'success')
    }
    setSaving(false)
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast('Analyzing with AI...', '')
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
    })
    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: 18, multiPlayer: true })
      })
      const data = await res.json()
      // data.players = [{ name, scores: [4,5,...] }] or data.scores for single player
      if (data.players?.length) {
        const newScores = { ...scores }
        data.players.forEach((parsed, idx) => {
          if (groupMembers[idx] && parsed.scores) {
            const holeScores = {}
            parsed.scores.forEach((s, i) => { if (s) holeScores[String(i + 1)] = s })
            newScores[groupMembers[idx].player_id] = holeScores
          }
        })
        setScores(newScores)
        showToast(`Parsed ${data.players.length} players — review & save`, 'success')
      } else if (data.scores) {
        // Single player fallback — apply to first unscored member or active
        const target = groupMembers[0]
        if (target) {
          const holeScores = {}
          data.scores.forEach((s, i) => { if (s) holeScores[String(i + 1)] = s })
          setScores(s => ({ ...s, [target.player_id]: holeScores }))
          showToast(`Parsed scores for ${target.name} — review & save`, 'success')
        }
      } else {
        showToast('Could not parse. Enter manually.', 'error')
      }
    } catch { showToast('Upload failed.', 'error') }
    setUploading(false)
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const def = ALL_ROUNDS.find(r => r.key === selectedRound)
  const course = event && def ? getCourseForRound(event, def.day) : null
  const currentHoleData = holes.find(h => h.hole_number === currentHole)
  const holePar = currentHoleData?.par || 4

  return (
    <div>
      {/* Round selector — 2 rows x 3 cols matching Groups layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 12 }}>
        {ALL_ROUNDS.slice(0, 3).map(r => (
          <button key={r.key} onClick={() => setSelectedRound(r.key)} style={{
            padding: '9px 4px', border: 'none', borderRadius: 'var(--radius)',
            background: selectedRound === r.key ? 'var(--gold)' : 'var(--green-deep)',
            color: selectedRound === r.key ? 'var(--green-deep)' : 'var(--gray-300)',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            fontWeight: selectedRound === r.key ? 600 : 400, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
          }}>{r.label}</button>
        ))}
        {ALL_ROUNDS.slice(3, 5).map(r => (
          <button key={r.key} onClick={() => setSelectedRound(r.key)} style={{
            padding: '9px 4px', border: 'none', borderRadius: 'var(--radius)',
            background: selectedRound === r.key ? 'var(--gold)' : 'var(--green-deep)',
            color: selectedRound === r.key ? 'var(--green-deep)' : 'var(--gray-300)',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            fontWeight: selectedRound === r.key ? 600 : 400, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
          }}>{r.label}</button>
        ))}
        <div /> {/* blank cell */}
      </div>

      {/* Course info */}
      {course?.name && (
        <p className="text-xs text-muted text-mono" style={{ marginBottom: 10 }}>
          {course.name} · Par {course.par}
        </p>
      )}

      {/* Group / Team selector */}
      {!def?.is_scramble && groups.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '0.75rem', color: 'var(--gray-300)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Select Group
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
            {groups.map(g => (
              <button key={g.group_number} onClick={() => selectGroup(g)} style={{
                padding: '8px 4px', border: 'none', borderRadius: 'var(--radius)',
                background: selectedGroupId === (g.id || g.group_number) ? 'var(--gold)' : 'var(--green-dark)',
                color: selectedGroupId === (g.id || g.group_number) ? 'var(--green-deep)' : 'var(--cream)',
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textAlign: 'center',
              }}>
                Group {g.group_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {def?.is_scramble && scrambleTeams.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '0.75rem', color: 'var(--gray-300)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Select Team
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
            {scrambleTeams.map(t => (
              <button key={t.team_number} onClick={() => selectTeam(t)} style={{
                padding: '8px 4px', border: 'none', borderRadius: 'var(--radius)',
                background: selectedGroupId === (t.id || t.team_number) ? 'var(--gold)' : 'var(--green-dark)',
                color: selectedGroupId === (t.id || t.team_number) ? 'var(--green-deep)' : 'var(--cream)',
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textAlign: 'center',
              }}>
                Team {t.team_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group members verification */}
      {groupMembers.length > 0 && (
        <div className="card card-sm" style={{ marginBottom: 12, borderColor: 'rgba(201,168,76,0.3)' }}>
          <p className="text-xs" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 6 }}>
            {def?.is_scramble ? 'Team Members' : 'Group Members'} — verify names match scorecard
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groupMembers.map(m => (
              <span key={m.player_id} style={{ background: 'var(--green-mid)', padding: '4px 10px', borderRadius: 100, fontSize: '0.8rem', fontWeight: 500 }}>
                {m.name}
              </span>
            ))}
          </div>
          {!def?.is_scramble && (
            <p className="text-xs text-muted" style={{ marginTop: 8 }}>
              Photo scorecard should show these players. Names must match system names for accurate record-keeping.
            </p>
          )}
        </div>
      )}

      {/* Photo upload */}
      {groupMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
          <button className="btn btn-secondary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '⏳ Analyzing...' : '📸 Upload Scorecard Photo'}
          </button>
        </div>
      )}

      {/* ── SCRAMBLE score entry ───────────────────────────────── */}
      {def?.is_scramble && groupMembers.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="text-xs text-muted text-mono" style={{ marginBottom: 12, textTransform: 'uppercase' }}>Team Score</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Score vs Par</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setScrambleScore(s => String((parseInt(s)||0) - 1))}
                  style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer' }}>−</button>
                <span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: 48, textAlign: 'center',
                  color: parseInt(scrambleScore) < 0 ? 'var(--blue-birdie)' : parseInt(scrambleScore) > 0 ? 'var(--red)' : 'var(--cream)' }}>
                  {scrambleScore === '' ? '–' : parseInt(scrambleScore) > 0 ? `+${scrambleScore}` : scrambleScore}
                </span>
                <button onClick={() => setScrambleScore(s => String((parseInt(s)||0) + 1))}
                  style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer' }}>+</button>
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={saveAll} disabled={saving || scrambleScore === ''}>
            {saving ? 'Saving...' : 'Save Team Score'}
          </button>
        </div>
      )}

      {/* ── STROKE PLAY hole-by-hole entry ────────────────────── */}
      {!def?.is_scramble && groupMembers.length > 0 && holes.length > 0 && (
        <div className="card">
          {/* Hole selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setCurrentHole(h => Math.max(1, h - 1))} disabled={currentHole === 1}
              style={{ width: 40, height: 40, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer' }}>
              ‹
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>
                Hole {currentHole}
              </p>
              <p className="text-xs text-muted text-mono" style={{ marginTop: 2 }}>
                Par {holePar} · Hdcp #{currentHoleData?.handicap_rank || '–'}
              </p>
            </div>
            <button onClick={() => setCurrentHole(h => Math.min(18, h + 1))} disabled={currentHole === 18}
              style={{ width: 40, height: 40, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer' }}>
              ›
            </button>
          </div>

          {/* Hole progress dots */}
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            {holes.map(h => {
              const anyScore = groupMembers.some(m => scores[m.player_id]?.[String(h.hole_number)])
              return (
                <button key={h.hole_number} onClick={() => setCurrentHole(h.hole_number)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', border: 'none',
                    background: h.hole_number === currentHole ? 'var(--gold)'
                      : anyScore ? 'var(--green-light)' : 'var(--green-mid)',
                    cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
                    color: h.hole_number === currentHole ? 'var(--green-deep)' : 'var(--cream)',
                    fontWeight: h.hole_number === currentHole ? 700 : 400,
                  }}>
                  {h.hole_number}
                </button>
              )
            })}
          </div>

          <hr className="divider" style={{ marginBottom: 12 }} />

          {/* Per-player score entry for current hole */}
          {groupMembers.map(member => {
            const holeScore = scores[member.player_id]?.[String(currentHole)] ?? 4
            const diff = holeScore - holePar
            const diffTxt = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
            const diffColor = diff < 0 ? 'var(--blue-birdie)' : diff > 0 ? 'var(--red)' : 'var(--gray-500)'
            const playerTotal = Object.values(scores[member.player_id] || {}).reduce((a, v) => a + (parseInt(v) || 0), 0)
            const playerHoles = Object.keys(scores[member.player_id] || {}).filter(k => scores[member.player_id][k]).length

            return (
              <div key={member.player_id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                alignItems: 'center', gap: 8, padding: '10px 0',
                borderBottom: '1px solid var(--green-mid)',
              }}>
                {/* Name + totals */}
                <div>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{member.name}</span>
                  {playerHoles > 0 && (
                    <span className="text-xs text-muted text-mono" style={{ marginLeft: 8 }}>
                      {playerTotal} ({playerHoles}/18)
                    </span>
                  )}
                </div>

                {/* Score stepper */}
                <button onClick={() => adjustScore(member.player_id, currentHole, -1)}
                  style={{ width: 32, height: 32, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1rem', cursor: 'pointer', flexShrink: 0 }}>
                  −
                </button>
                <span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {holeScore}
                </span>
                <button onClick={() => adjustScore(member.player_id, currentHole, 1)}
                  style={{ width: 32, height: 32, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1rem', cursor: 'pointer', flexShrink: 0 }}>
                  +
                </button>
              </div>
            )
          })}

          <hr className="divider" style={{ marginTop: 4, marginBottom: 12 }} />

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {currentHole < 18 && (
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCurrentHole(h => h + 1)}>
                Next Hole →
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveAll} disabled={saving}>
              {saving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        </div>
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


// ─── GROUPS TAB ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const [event, setEvent] = useState(null)
  const [players, setPlayers] = useState([])
  const [day, setDay] = useState('friday')
  const [groups, setGroups] = useState([]) // [{ group_number, player_ids: [] }]
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [unassigned, setUnassigned] = useState([])

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (event) loadGroups() }, [day, event])

  const fetchData = async () => {
    const [{ data: ev }, { data: ps }] = await Promise.all([db('get_current_event'), db('list_players')])
    setEvent(ev)
    if (ev) {
      const { data: eps } = await db('get_event_players', { event_id: ev.id })
      setPlayers(eps || [])
    }
  }

  const loadGroups = async () => {
    if (!event) return
    const { data } = await db('get_groups', { event_id: event.id, day })
    const loaded = (data || []).map(g => ({
      group_number: g.group_number,
      player_ids: (g.players || []).map(p => p.player_id),
    }))
    setGroups(loaded.length ? loaded : [{ group_number: 1, player_ids: [] }])
  }

  const addGroup = () => {
    const nextNum = groups.length ? Math.max(...groups.map(g => g.group_number)) + 1 : 1
    setGroups(g => [...g, { group_number: nextNum, player_ids: [] }])
  }

  const removeGroup = (num) => {
    setGroups(g => g.filter(grp => grp.group_number !== num))
  }

  const togglePlayerInGroup = (groupNum, playerId) => {
    setGroups(gs => gs.map(g => {
      if (g.group_number !== groupNum) {
        // Remove from any other group
        return { ...g, player_ids: g.player_ids.filter(id => id !== playerId) }
      }
      const inGroup = g.player_ids.includes(playerId)
      return { ...g, player_ids: inGroup ? g.player_ids.filter(id => id !== playerId) : [...g.player_ids, playerId] }
    }))
  }

  const saveGroups = async () => {
    if (!event) return
    setSaving(true)
    await db('save_groups', {
      event_id: event.id, day,
      groups: groups.filter(g => g.player_ids.length > 0)
    })
    setSaving(false)
    showToast('Groups saved!', 'success')
  }

  const assignedIds = new Set(groups.flatMap(g => g.player_ids))
  const unassignedPlayers = players.filter(p => !assignedIds.has(p.player_id))

  const baseTeeTime = day === 'friday' ? event?.friday_tee_time : event?.saturday_tee_time

  const calcTime = (groupNum) => {
    if (!baseTeeTime) return null
    const [h, m] = baseTeeTime.split(':').map(Number)
    const total = h * 60 + m + (groupNum - 1) * 8
    const nh = Math.floor(total / 60) % 24
    const nm = total % 60
    const hour = nh % 12 || 12
    const ampm = nh >= 12 ? 'PM' : 'AM'
    return `${hour}:${String(nm).padStart(2,'0')} ${ampm}`
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  return (
    <div>
      {/* Day selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['friday','saturday'].map(d => (
          <button key={d} onClick={() => setDay(d)}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 'var(--radius)', background: day === d ? 'var(--gold)' : 'var(--green-dark)', color: day === d ? 'var(--green-deep)' : 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: day === d ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
            {d} Morning
          </button>
        ))}
      </div>

      {/* Unassigned players */}
      {unassignedPlayers.length > 0 && (
        <div className="card card-sm" style={{ marginBottom: 12, borderColor: 'rgba(214,69,69,0.4)' }}>
          <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>
            Unassigned ({unassignedPlayers.length})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unassignedPlayers.map(p => (
              <span key={p.player_id} style={{ background: 'var(--green-mid)', padding: '4px 10px', borderRadius: 100, fontSize: '0.8rem' }}>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Groups */}
      {groups.map((group, idx) => (
        <div key={group.group_number} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
                Group {group.group_number}
              </span>
              {calcTime(group.group_number) && (
                <span className="text-mono text-sm" style={{ marginLeft: 10, color: 'var(--gold)' }}>
                  {calcTime(group.group_number)}
                </span>
              )}
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                {group.player_ids.length}/4 players
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => removeGroup(group.group_number)}
              style={{ color: 'var(--red)', fontSize: '0.75rem' }}>
              Remove
            </button>
          </div>

          {/* Player checkboxes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {players.map(p => {
              const inThisGroup = group.player_ids.includes(p.player_id)
              const inOtherGroup = !inThisGroup && assignedIds.has(p.player_id)
              return (
                <button key={p.player_id} onClick={() => !inOtherGroup && togglePlayerInGroup(group.group_number, p.player_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: inThisGroup ? 'rgba(201,168,76,0.15)' : 'var(--green-deep)',
                    border: `1px solid ${inThisGroup ? 'var(--gold)' : 'var(--green-mid)'}`,
                    borderRadius: 6, cursor: inOtherGroup ? 'default' : 'pointer',
                    opacity: inOtherGroup ? 0.35 : 1,
                  }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${inThisGroup ? 'var(--gold)' : 'var(--green-mid)'}`, background: inThisGroup ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--green-deep)', flexShrink: 0 }}>
                    {inThisGroup ? '✓' : ''}
                  </div>
                  <span style={{ fontSize: '0.82rem', color: inThisGroup ? 'var(--gold)' : 'var(--cream)', fontWeight: inThisGroup ? 600 : 400 }}>{p.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <button className="btn btn-secondary btn-full" onClick={addGroup} style={{ marginBottom: 12 }}>
        + Add Group {groups.length + 1}
      </button>
      <button className="btn btn-primary btn-full" onClick={saveGroups} disabled={saving}>
        {saving ? 'Saving...' : 'Save Groups'}
      </button>

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
