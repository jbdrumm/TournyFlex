-- ================================================================
-- HISTORICAL DATA BACKFILL (2021-2025)
-- ================================================================

-- STROKE PLAY: total_score = gross, score_vs_par = gross - course_par
UPDATE round_scores
SET
  hole_scores     = '{}',
  holes_completed = 18,
  is_complete     = true,
  total_score     = (hole_scores->>'total')::int,
  score_vs_par    = (hole_scores->>'total')::int - (
    SELECT c.par FROM courses c WHERE c.id = round_scores.course_id
  )
WHERE is_scramble = false
  AND event_id IN (SELECT id FROM events WHERE year BETWEEN 2021 AND 2025)
  AND hole_scores ? 'total';

-- SCRAMBLE: score_vs_par = spreadsheet value, total_score = value + course_par
UPDATE round_scores
SET
  hole_scores     = '{}',
  holes_completed = 18,
  is_complete     = true,
  score_vs_par    = (hole_scores->>'total')::int,
  total_score     = (hole_scores->>'total')::int + (
    SELECT c.par FROM courses c WHERE c.id = round_scores.course_id
  )
WHERE is_scramble = true
  AND event_id IN (SELECT id FROM events WHERE year BETWEEN 2021 AND 2025)
  AND hole_scores ? 'total';

-- DELETE 2026 test scramble scores still in {total:N} format
DELETE FROM round_scores
WHERE is_scramble = true
  AND event_id IN (SELECT id FROM events WHERE year = 2026)
  AND hole_scores ? 'total';

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
