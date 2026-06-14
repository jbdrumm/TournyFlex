// Age gate, derived from birthdate.
//
// Per CLAUDE.md: never store a stored `is_21_plus` flag — it drifts on
// birthdays. Always compute from the player's birthdate at check time.
//
// Currently used by: future betting calculator (21+).
// Anywhere else you need an age gate, pass `minAge` explicitly.

export function meetsAgeGate(birthdate, minAge) {
  if (!birthdate) return false
  const dob = new Date(birthdate)
  if (Number.isNaN(dob.getTime())) return false
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age >= minAge
}
