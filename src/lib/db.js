// src/lib/db.js
// Thin client that calls our Netlify DB proxy function.
// No database credentials ever touch the browser.

export async function db(action, payload = {}) {
  const res = await fetch('/.netlify/functions/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(json.error || `DB error: ${res.status}`)
  }

  return json // { data: ... }
}
