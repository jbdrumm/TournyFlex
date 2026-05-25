-- ================================================================
-- UPDATE HISTORICAL EVENTS WITH COURSE ASSIGNMENTS
-- Run in Neon SQL Editor
-- ================================================================

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'Lakewood On The Green')
WHERE year = 2018;

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'Emerald Vale Golf Course')
WHERE year = 2021;

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'Emerald Vale Golf Course'),
  sunday_course_id   = (SELECT id FROM courses WHERE name = 'Lakewood On The Green')
WHERE year = 2022;

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  sunday_course_id   = (SELECT id FROM courses WHERE name = 'Evergreen Resort Golf')
WHERE year = 2023;

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'El Dorado Golf Club'),
  sunday_course_id   = (SELECT id FROM courses WHERE name = 'Lakewood On The Green')
WHERE year = 2024;

UPDATE events SET
  friday_course_id   = (SELECT id FROM courses WHERE name = 'Hemlock Golf Club'),
  saturday_course_id = (SELECT id FROM courses WHERE name = 'Manistee National - The Retreat'),
  sunday_course_id   = (SELECT id FROM courses WHERE name = 'Stonegate Golf Club')
WHERE year = 2025;
