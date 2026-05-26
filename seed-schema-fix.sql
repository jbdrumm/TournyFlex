-- ================================================================
-- HISTORICAL DATA BACKFILL (2021-2025)
-- Normalize all historical round_scores to clean schema:
--   hole_scores     = {} (no per-hole data available)
--   holes_completed = 18
--   is_complete     = true
--   total_score     = gross strokes
--   score_vs_par    = strokes vs par
-- ================================================================

-- STROKE PLAY (is_scramble = false)
-- spreadsheet value is gross score (e.g. 94)
-- total_score = 94, score_vs_par = 94 - course_par
UPDATE round_scores rs
SET
  hole_scores     = '{}',
  holes_completed = 18,
  is_complete     = true,
  total_score     = (rs.hole_scores->>'total')::int,
  score_vs_par    = (rs.hole_scores->>'total')::int - c.par
FROM courses c
JOIN events e ON e.id = rs.event_id
WHERE rs.course_id = c.id
  AND rs.is_scramble = false
  AND e.year BETWEEN 2021 AND 2025
  AND rs.hole_scores ? 'total';

-- SCRAMBLE (is_scramble = true)
-- spreadsheet value is already +/- par (e.g. -5)
-- score_vs_par = -5, total_score = -5 + course_par
UPDATE round_scores rs
SET
  hole_scores     = '{}',
  holes_completed = 18,
  is_complete     = true,
  score_vs_par    = (rs.hole_scores->>'total')::int,
  total_score     = (rs.hole_scores->>'total')::int + c.par
FROM courses c
JOIN events e ON e.id = rs.event_id
WHERE rs.course_id = c.id
  AND rs.is_scramble = true
  AND e.year BETWEEN 2021 AND 2025
  AND rs.hole_scores ? 'total';

-- Also clear out any 2026 test scramble scores that are still in {total:N} format
-- (these were saved before hole-by-hole scoring was fixed)
DELETE FROM round_scores rs
USING events e
WHERE rs.event_id = e.id
  AND e.year = 2026
  AND rs.is_scramble = true
  AND rs.hole_scores ? 'total';

-- Verify
SELECT
  e.year,
  rs.is_scramble,
  COUNT(*) as rows,
  COUNT(rs.total_score) as has_total,
  COUNT(rs.score_vs_par) as has_vs_par,
  SUM(CASE WHEN rs.hole_scores = '{}' THEN 1 ELSE 0 END) as empty_holes,
  SUM(CASE WHEN rs.hole_scores ? '1' THEN 1 ELSE 0 END) as per_hole,
  ROUND(AVG(rs.total_score),1) as avg_total,
  ROUND(AVG(rs.score_vs_par),1) as avg_vs_par
FROM round_scores rs
JOIN events e ON e.id = rs.event_id
GROUP BY e.year, rs.is_scramble
ORDER BY e.year, rs.is_scramble;
