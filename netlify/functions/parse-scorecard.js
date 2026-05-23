// netlify/functions/parse-scorecard.js
// Proxies scorecard image to Claude Vision API, returns parsed hole scores

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

  const { image, mediaType, holeCount = 18 } = body

  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) }
  }

  const prompt = `You are analyzing a golf scorecard image. Extract the hole-by-hole scores for a single player.

The scorecard has ${holeCount} holes. Return ONLY a JSON object in this exact format:
{
  "scores": [4, 5, 3, 6, 4, 5, 4, 3, 5, 4, 4, 5, 3, 4, 6, 4, 3, 5],
  "player_name": "John Smith"
}

Where "scores" is an array of ${holeCount} integers (one per hole in order 1-${holeCount}).
Use null for any hole where the score is unclear or missing.
Do NOT include any explanation, markdown, or extra text. Return only the JSON.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    // Parse the JSON response
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    }
  } catch (err) {
    console.error('Vision parse error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to parse scorecard', detail: err.message })
    }
  }
}
