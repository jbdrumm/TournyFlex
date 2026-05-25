-- ================================================================
-- MANISTEE GOLF & COUNTRY CLUB — FULLY CONFIRMED
-- Source: GolfNow actual scorecard screenshot
-- Par 70 (front 34, back 36), Rating 69.0, Slope 128
-- White tees 5,587 yards
-- ================================================================

INSERT INTO courses (name, city, state, par, slope_rating, course_rating)
VALUES ('Manistee Golf & Country Club', 'Manistee', 'MI', 70, 128, 69.0)
ON CONFLICT (name) DO UPDATE SET par=70, slope_rating=128, course_rating=69.0;

WITH course AS (SELECT id FROM courses WHERE name = 'Manistee Golf & Country Club')
INSERT INTO course_holes (course_id, hole_number, par, handicap_rank,
  yardage_white, yardage_red)
SELECT course.id, h.hole_number, h.par, h.handicap_rank, h.white, h.red
FROM course, (VALUES
-- Hole  Par  Hdcp  White  Red
  (1,  4,  1, 408, 318),
  (2,  4,  7, 354, 273),
  (3,  4,  3, 351, 304),
  (4,  4, 15, 312, 268),
  (5,  4,  5, 354, 279),
  (6,  3, 11, 183, 126),
  (7,  4,  9, 324, 314),
  (8,  4, 13, 301, 293),
  (9,  3, 17, 119, 110),
  (10, 5,  2, 528, 464),
  (11, 3, 18, 160, 148),
  (12, 5,  6, 457, 407),
  (13, 4, 16, 304, 255),
  (14, 3, 12, 170, 158),
  (15, 4, 10, 301, 253),
  (16, 4, 14, 282, 276),
  (17, 4,  8, 304, 240),
  (18, 4,  4, 375, 303)
) AS h(hole_number, par, handicap_rank, white, red)
ON CONFLICT (course_id, hole_number) DO UPDATE SET
  par=EXCLUDED.par, handicap_rank=EXCLUDED.handicap_rank,
  yardage_white=EXCLUDED.yardage_white, yardage_red=EXCLUDED.yardage_red;

-- Update 2025 event and round scores to use this course for Saturday
UPDATE events SET
  saturday_course_id = (SELECT id FROM courses WHERE name = 'Manistee Golf & Country Club')
WHERE year = 2025;

UPDATE round_scores SET
  course_id = (SELECT id FROM courses WHERE name = 'Manistee Golf & Country Club')
WHERE event_id = (SELECT id FROM events WHERE year = 2025)
  AND day = 'saturday';

-- Verify
SELECT e.year, rs.day, rs.round_time, c.name as course, COUNT(*) as players
FROM round_scores rs
JOIN events e ON e.id = rs.event_id
JOIN courses c ON c.id = rs.course_id
WHERE e.year = 2025
GROUP BY e.year, rs.day, rs.round_time, c.name
ORDER BY rs.day, rs.round_time;
