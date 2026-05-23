// netlify/functions/search-course.js
// Searches for golf course data. Uses Golf Course Finder or fallback.

exports.handler = async (event) => {
  const query = event.queryStringParameters?.q
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Query required' }) }
  }

  // Try the OpenStreetMap Overpass API for golf courses (free, no key needed)
  // This returns basic course info. For full hole data, commissioner enters manually.
  try {
    const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' golf course')}&format=json&limit=5&addressdetails=1`

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'GolfOutingApp/1.0' }
    })

    const data = await response.json()

    const courses = data
      .filter(r => r.type === 'golf_course' || r.class === 'leisure' || r.display_name?.toLowerCase().includes('golf'))
      .map(r => ({
        name: r.name || r.display_name?.split(',')[0],
        city: r.address?.city || r.address?.town || r.address?.village || '',
        state: r.address?.state || '',
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        // Hole data not available from OSM — commissioner will enter manually
        holes: null,
        course_rating: null,
        slope_rating: null,
      }))
      .filter(c => c.name)

    // Fallback: if no golf-specific results, return name-only results
    if (courses.length === 0) {
      const fallback = data.slice(0, 3).map(r => ({
        name: r.display_name?.split(',')[0] || query,
        city: r.address?.city || r.address?.town || '',
        state: r.address?.state || '',
      }))
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: fallback })
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courses })
    }
  } catch (err) {
    console.error('Course search error:', err)
    // Return empty so UI falls back to manual entry
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courses: [] })
    }
  }
}
