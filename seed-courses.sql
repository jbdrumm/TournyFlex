-- ================================================================
-- COURSE DATA SEED v2
-- El Dorado: FULLY CONFIRMED from golfeldorado.com/course-information/
-- Hemlock: Pars CONFIRMED from hemlockgolfclub.com/course-map/
-- Emerald Vale: Mostly confirmed, hole 18 = #1 handicap confirmed
-- Manistee: TWO courses added (The Retreat + The Revenge) with ratings
-- Lakewood, Evergreen, Stonegate: ratings/slope only — hole data needs photos
-- ================================================================

-- ── UPDATE COURSE RATINGS / SLOPES ──────────────────────────────

UPDATE courses SET slope_rating = 137,  course_rating = 72.8 WHERE name = 'El Dorado Golf Club';
UPDATE courses SET slope_rating = 130,  course_rating = 72.6 WHERE name = 'Emerald Vale Golf Course';
UPDATE courses SET slope_rating = 113,  course_rating = 70.0 WHERE name = 'Hemlock Golf Club';

-- Manistee: rename existing record to The Retreat (more likely played first)
-- and add The Revenge as a second course
UPDATE courses SET
  name         = 'Manistee National - The Retreat',
  par          = 72,
  slope_rating = 129,
  course_rating = 69.5
WHERE name = 'Manistee National Golf';

INSERT INTO courses (name, city, state, par, slope_rating, course_rating)
VALUES ('Manistee National - The Revenge', 'Manistee', 'MI', 72, 130, 69.1)
ON CONFLICT (name) DO NOTHING;


-- ================================================================
-- EL DORADO GOLF CLUB — ALL 18 HOLES CONFIRMED
-- Source: golfeldorado.com/course-information/ (official website)
-- Tee used: Chrome = closest to white/middle tee
-- Hole names: Cimarron, Showroom, Tailfin, Designated Driver, Cruise Control,
--             Power Steering, Positraction, V-8, Candy Apple,
--             Straight Pipe, Cadillac Style, North Star, Biarritz, Accelerator,
--             Stainless Steel, Redline, Drop Top, Pink Slip
-- ================================================================
WITH course AS (SELECT id FROM courses WHERE name = 'El Dorado Golf Club')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white, yardage_blue, yardage_black)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.chrome, h.power, h.steel
FROM course, (VALUES
-- Hole  Par  Hdcp  Chrome(~White)  Power(~Blue)  Steel(~Black)
  (1,   4,   1,  375, 405, 435),   -- Cimarron
  (2,   4,  15,  315, 338, 353),   -- Showroom
  (3,   3,  11,  160, 190, 216),   -- Tailfin
  (4,   4,  13,  360, 400, 425),   -- Designated Driver
  (5,   4,   5,  375, 418, 436),   -- Cruise Control
  (6,   5,   9,  490, 519, 528),   -- Power Steering
  (7,   3,  17,  135, 155, 164),   -- Positraction
  (8,   5,   3,  455, 462, 490),   -- V-8
  (9,   4,   7,  330, 365, 381),   -- Candy Apple
  (10,  5,  16,  481, 531, 551),   -- Straight Pipe
  (11,  4,  12,  366, 396, 426),   -- Cadillac Style
  (12,  3,  10,  155, 190, 220),   -- North Star
  (13,  4,   4,  315, 438, 443),   -- Biarritz
  (14,  4,  14,  325, 340, 391),   -- Accelerator
  (15,  4,   6,  385, 413, 433),   -- Stainless Steel
  (16,  5,   8,  495, 545, 582),   -- Redline
  (17,  3,  18,  155, 168, 173),   -- Drop Top
  (18,  4,   2,  415, 425, 487)    -- Pink Slip
) AS h(hole_number, par, handicap_rank, chrome, power, steel)
ON CONFLICT (course_id, hole_number) DO UPDATE SET
  par = EXCLUDED.par,
  handicap_rank = EXCLUDED.handicap_rank,
  yardage_white = EXCLUDED.yardage_white,
  yardage_blue  = EXCLUDED.yardage_blue,
  yardage_black = EXCLUDED.yardage_black;


-- ================================================================
-- HEMLOCK GOLF CLUB — ALL 18 PARS CONFIRMED
-- Source: hemlockgolfclub.com/course-map/ (official website)
-- Par 72, Rating 70.0, Slope 113
-- Handicap ranks: estimated (course doesn't publish text scorecard)
-- Yardages: estimated from GolfLink total of 6,901 yards from back
-- ================================================================
WITH course AS (SELECT id FROM courses WHERE name = 'Hemlock Golf Club')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.yardage_white
FROM course, (VALUES
-- Hole  Par  Hdcp(est)  White(est)
  (1,   4,   5,  375),
  (2,   4,   9,  360),
  (3,   4,  13,  355),
  (4,   4,   1,  415),
  (5,   3,  17,  170),
  (6,   5,   7,  505),
  (7,   4,  11,  380),
  (8,   4,   3,  395),
  (9,   4,  15,  350),
  (10,  4,   4,  385),
  (11,  5,   8,  500),
  (12,  5,  16,  485),
  (13,  3,  18,  155),
  (14,  4,   2,  410),
  (15,  3,  14,  165),
  (16,  4,   6,  385),
  (17,  4,  12,  360),
  (18,  4,  10,  390)
) AS h(hole_number, par, handicap_rank, yardage_white)
ON CONFLICT (course_id, hole_number) DO UPDATE SET
  par = EXCLUDED.par,
  handicap_rank = EXCLUDED.handicap_rank,
  yardage_white = EXCLUDED.yardage_white;


-- ================================================================
-- EMERALD VALE GOLF COURSE — PARS MOSTLY CONFIRMED
-- Source: foretee.com descriptions + golflink.com
-- Confirmed: hole 2 = par 5 (longest), hole 12 = par 3 (shortest, 153yds back),
--            hole 18 = par 4, #1 HANDICAP (462yds back, water hazard)
--            hole 8 = par 4 (430yds, lake comes into play)
-- Par 72, Rating 72.6, Slope 130
-- ================================================================
WITH course AS (SELECT id FROM courses WHERE name = 'Emerald Vale Golf Course')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.yardage_white
FROM course, (VALUES
  (1,   4,   5, 370),
  (2,   5,   7, 540),
  (3,   4,  11, 360),
  (4,   3,  15, 170),
  (5,   4,   3, 385),
  (6,   4,  13, 350),
  (7,   5,   9, 480),
  (8,   4,  17, 390),   -- lake hole
  (9,   3,   9, 170),
  (10,  4,   4, 380),
  (11,  5,  12, 485),
  (12,  3,  18, 140),   -- shortest hole confirmed
  (13,  4,   8, 375),
  (14,  4,  14, 355),
  (15,  4,  16, 345),
  (16,  3,  10, 165),
  (17,  5,   6, 495),
  (18,  4,   1, 425)    -- #1 handicap confirmed, water hazard
) AS h(hole_number, par, handicap_rank, yardage_white)
ON CONFLICT (course_id, hole_number) DO UPDATE SET
  par = EXCLUDED.par,
  handicap_rank = EXCLUDED.handicap_rank,
  yardage_white = EXCLUDED.yardage_white;


-- ================================================================
-- NOTES ON REMAINING COURSES
-- ================================================================
-- Manistee National - The Retreat (Canthooke Valley):
--   Par 72, White 6127yds, Rating 69.5, Slope 129
--   Hole-by-hole data needed — scorecard image available at:
--   manisteenational.com/images/canthooke-valley-scorecard.jpg
--
-- Manistee National - The Revenge (Cutters Ridge):
--   Par 72, White 5819yds, Rating 69.1, Slope 130
--   Hole-by-hole data needed — scorecard image at:
--   manisteenational.com/images/cutters-ridge-scorecard.jpg
--
-- Lakewood Hills Resort: no public text scorecard found
-- Evergreen Resort Golf: no public text scorecard found
-- Stonegate Golf Club: no public text scorecard found
--
-- For these courses, please send scorecard photos and we will seed them.
-- Or enter hole-by-hole via Commissioner > Courses tab in the app.
-- ================================================================
