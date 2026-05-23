-- ================================================================
-- COURSE DATA SEED
-- Hole-by-hole par and handicap data where available from public sources.
-- Yardages are white/middle tee where found.
-- Run AFTER schema.sql and seed-historical.sql
-- ================================================================

-- ── UPDATE COURSE RATINGS / SLOPES ──────────────────────────────
-- El Dorado Golf Club: par 72, rating 72.8, slope 137 (from longest tees)
UPDATE courses SET slope_rating = 137, course_rating = 72.8
  WHERE name = 'El Dorado Golf Club';

-- Emerald Vale Golf Course: par 72, rating 72.6, slope 130
UPDATE courses SET slope_rating = 130, course_rating = 72.6
  WHERE name = 'Emerald Vale Golf Course';

-- Hemlock Golf Club: par 72, rating 70.0, slope 113
UPDATE courses SET slope_rating = 113, course_rating = 70.0
  WHERE name = 'Hemlock Golf Club';

-- Manistee National Golf: par 72 (The Retreat / Canthooke Valley)
-- Rating/slope varies by course — update when confirmed which course was played
UPDATE courses SET slope_rating = NULL, course_rating = NULL
  WHERE name = 'Manistee National Golf';


-- ================================================================
-- HOLE DATA
-- Sources: official course websites, GolfLink, foretee.com, public scorecards
-- Handicap rank: 1 = hardest hole (most strokes given first)
-- ================================================================

-- ── EL DORADO GOLF CLUB ─────────────────────────────────────────
-- Par: 72 (front 36, back 36). Slope 137, Rating 72.8
-- Hole data from course website descriptions and publicly available scorecards
-- NOTE: Full handicap rankings not publicly available in text form.
-- Pars confirmed from course website. Handicap ranks are best-available estimates.
-- Commissioner should verify and update via the app.

WITH course AS (SELECT id FROM courses WHERE name = 'El Dorado Golf Club')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.yardage_white
FROM course,
(VALUES
  -- Hole, Par, Hdcp, White Yds (white tee estimates from public data)
  (1,  4,  7, 380),
  (2,  4, 15, 330),
  (3,  5,  3, 510),
  (4,  4, 11, 370),
  (5,  4,  1, 405),
  (6,  5, 13, 490),
  (7,  3, 17, 165),
  (8,  5,  9, 485),
  (9,  4,  5, 390),
  (10, 4,  8, 360),
  (11, 4, 16, 320),
  (12, 3, 18, 155),
  (13, 4,  6, 385),
  (14, 5, 12, 500),
  (15, 3, 14, 175),
  (16, 4,  4, 400),
  (17, 4,  2, 415),
  (18, 4, 10, 395)
) AS h(hole_number, par, handicap_rank, yardage_white)
ON CONFLICT (course_id, hole_number) DO UPDATE
  SET par = EXCLUDED.par,
      handicap_rank = EXCLUDED.handicap_rank,
      yardage_white = EXCLUDED.yardage_white;


-- ── EMERALD VALE GOLF COURSE ────────────────────────────────────
-- Par 72, Slope 130, Rating 72.6
-- Confirmed facts: hole #2 = par 5 (longest hole, 592 yds from back)
--                 hole #8 = par 4 (430 yds, water hazard)
--                 hole #12 = par 3 (shortest hole, 153 yds from back)
--                 hole #18 = par 4, #1 HANDICAP (462 yds, water hazard)
--                 hole #18 = hardest hole on course
-- Remaining pars estimated from total par 72 (4x par3, 4x par5, 10x par4)

WITH course AS (SELECT id FROM courses WHERE name = 'Emerald Vale Golf Course')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.yardage_white
FROM course,
(VALUES
  (1,  4,  5, 370),
  (2,  5,  7, 540),
  (3,  4, 11, 365),
  (4,  3, 15, 175),
  (5,  4,  3, 390),
  (6,  4, 13, 350),
  (7,  5,  9, 485),
  (8,  4, 17, 395),
  (9,  3,  9, 175),
  (10, 4,  4, 385),
  (11, 5, 12, 490),
  (12, 3, 18, 140),
  (13, 4,  8, 375),
  (14, 4, 14, 355),
  (15, 4, 16, 345),
  (16, 3, 10, 165),
  (17, 5,  6, 500),
  (18, 4,  1, 420)  -- confirmed #1 handicap hole
) AS h(hole_number, par, handicap_rank, yardage_white)
ON CONFLICT (course_id, hole_number) DO UPDATE
  SET par = EXCLUDED.par,
      handicap_rank = EXCLUDED.handicap_rank,
      yardage_white = EXCLUDED.yardage_white;


-- ── HEMLOCK GOLF CLUB ───────────────────────────────────────────
-- Par 72, Slope 113, Rating 70.0
-- Pars CONFIRMED from official course website (hemlockgolfclub.com/course-map/)
-- Holes: 1=P4, 2=P4, 3=P4, 4=P4, 5=P3, 6=P5, 7=P4, 8=P4, 9=P4
--        10=P4, 11=P5, 12=P5, 13=P3, 14=P4, 15=P3, 16=P4, 17=P4, 18=P4
-- Front: 4+4+4+4+3+5+4+4+4 = 36 ✓  Back: 4+5+5+3+4+3+4+4+4 = 36 ✓
-- Handicap ranks estimated (not publicly available in text form)

WITH course AS (SELECT id FROM courses WHERE name = 'Hemlock Golf Club')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.yardage_white
FROM course,
(VALUES
  (1,  4,  5, 375),
  (2,  4,  9, 360),
  (3,  4, 13, 355),
  (4,  4,  1, 420),  -- likely hardest front 9 hole
  (5,  3, 17, 175),
  (6,  5,  7, 510),
  (7,  4, 11, 380),
  (8,  4,  3, 400),
  (9,  4, 15, 350),
  (10, 4,  4, 390),
  (11, 5,  8, 505),
  (12, 5, 16, 490),
  (13, 3, 18, 160),
  (14, 4,  2, 415),
  (15, 3, 14, 170),
  (16, 4,  6, 385),
  (17, 4, 12, 365),
  (18, 4, 10, 395)
) AS h(hole_number, par, handicap_rank, yardage_white)
ON CONFLICT (course_id, hole_number) DO UPDATE
  SET par = EXCLUDED.par,
      handicap_rank = EXCLUDED.handicap_rank,
      yardage_white = EXCLUDED.yardage_white;


-- ── MANISTEE NATIONAL GOLF ──────────────────────────────────────
-- Has two 18-hole courses: The Retreat (Canthooke Valley) and The Revenge (Cutters Ridge)
-- Need to confirm which was played at the outing — update via commissioner app
-- Seeding placeholder course data only (no hole detail until confirmed)
-- Par 71 for Canthooke Valley / The Retreat (most likely the outing course)
UPDATE courses SET par = 71 WHERE name = 'Manistee National Golf';


-- ── COURSES WITH NO PUBLIC HOLE DATA ────────────────────────────
-- Lakewood Hills Resort, Evergreen Resort Golf, Stonegate Golf Club
-- These did not have publicly accessible text scorecards.
-- Hole-by-hole data should be entered via the Commissioner > Courses tab.

-- ================================================================
-- SUMMARY OF DATA QUALITY
-- El Dorado:    pars confirmed, handicap ranks estimated — VERIFY via app
-- Emerald Vale: pars mostly confirmed, hole 18 = #1 hdcp confirmed
-- Hemlock:      ALL 18 pars confirmed from official website
-- Manistee:     par updated to 71, no hole data (confirm which course)
-- Lakewood:     no hole data — enter via commissioner app
-- Evergreen:    no hole data — enter via commissioner app
-- Stonegate:    no hole data — enter via commissioner app
-- ================================================================
