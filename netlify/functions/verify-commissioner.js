// netlify/functions/verify-commissioner.js
// Verifies the commissioner PIN without exposing it to the client.
// Set COMMISSIONER_PIN in your Netlify environment variables (6-8 digits recommended).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { pin } = body
  const correctPin = process.env.COMMISSIONER_PIN

  if (!correctPin) {
    console.error('COMMISSIONER_PIN env variable not set')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration' }) }
  }

  if (!pin || pin !== correctPin) {
    // Artificial delay to slow brute-force attempts
    await new Promise(r => setTimeout(r, 600))
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid PIN' })
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
