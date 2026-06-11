# Account-less Player Records (Stubs) & Claiming — Design Doc

Status: **design approved, not yet coded.** Read `CLAUDE.md` and
`docs/side-games.md` first. This doc defines how scores entered for a
not-yet-registered player are stored and later claimed by the real person. It is
the seam between the game engine and the friends layer, and it is the primary
growth mechanism for the app — get it right once and every game inherits it.

---

## Why this exists

The growth hook: in any individual-scoring game (everything except scramble),
one person keys in all players' scores, and the round saves to **every player's
record**, not just the scorekeeper's. A non-app player whose scores were entered
by a friend sees their history **waiting for them** when they sign up. If that
data didn't persist, players 2–4 would never install — the group would keep
relying on one person's phone. This doc makes that persistence safe and
claimable.

---

## Three identity states

Every player is one `players` row. A row moves through states; **the row never
moves, scores never re-point.**

1. **Stub** — created by a scorekeeper. Has a display name, optional saved
   contact (phone/email), and accumulating game history. No linked account.
2. **Claimed** — a real person has signed up and linked their account to the
   stub row. History is theirs. (Reversible — see disputes.)
3. **Registered** — a normal account linked to a player row from the start
   (the scorekeeper, or anyone who signed up before being scored).

The only difference between these states is **whether an account is linked to the
row**, and whether that link is provisional (within dispute window) or final.

---

## Schema shape (decided)

**Single `players` table.** An account links to a player row; it does not own a
separate guest record that gets migrated. This is load-bearing:

- Every score (`hole_scores`, `total_score`, `score_vs_par`) points at a
  `player_id` and **never changes that pointer**, before or after claim. This
  upholds "one score written once, read many times."
- A stub is a `players` row with `account_id = NULL`.
- Claiming = setting `account_id` on that existing row. No data moves.
- Unclaiming (dispute) = setting `account_id` back to `NULL`. Clean reverse,
  precisely because nothing was migrated.

Suggested columns on `players` (illustrative, not prescriptive — confirm against
existing schema):
- `id`
- `account_id` (nullable — NULL = unclaimed stub)
- `display_name`
- `invite_contact` (nullable; phone or email the scorekeeper saved)
- `invite_contact_type` (`email` | `phone` | null)
- `created_by_account_id` (the scorekeeper who made the stub)
- `claim_state` (`unclaimed` | `pending` | `claimed`)
- `claimed_at` (timestamp; pending until +72h, then final)

Do not store the TournyFlex Index as a column on the player as a stored trophy —
see "Index recomputes" below.

---

## What a scorekeeper can enter

When adding a non-app player to a round: **display name (required) + optional
phone or email.** The optional contact is what makes a fast, self-proving claim
possible later. No contact = the player can still be claimed, but only via the
weaker fallback path (below).

---

## The claim flow (decided model)

The validation principle: **the new user proves control of the saved contact.
The scorekeeper is a watchdog, never a gate.** The scorekeeper is never in the
approval path — this avoids the friction trap (scorekeeper unavailable blocks a
new customer) and is actually more secure (proven contact control beats a
friend's judgment call).

### Primary path — contact-match with code-to-contact verification

1. Scorekeeper creates the stub with a saved phone/email.
2. The buddy is invited (link delivered to that contact: "claim your rounds").
3. The buddy signs up and, to claim, **enters a code sent to the saved
   contact** — not merely types the contact string.
4. Code verified → claim succeeds **immediately** (state → `pending`), no human
   approval.

**Why code-to-contact, not type-the-contact:** it defeats the overhear attack.
If a player overhears that the stub is keyed to a rival's email, typing that
email gets them nothing — the code lands in the *rival's* inbox/phone, which the
attacker doesn't control. (See "Threat model" below.)

### Fallback path — suggested-match on signup (when no contact, or contact didn't match)

- On signup, surface: "We found rounds where someone scored a player named
  *[name]* in groups with *[mutual friend]* — is this you?"
- This path is weaker (no proven contact control), so it is gated:
  **mutual-friend signal required + explicit human confirm.** Name-only with no
  mutual friend is not auto-offered.
- Leans on the existing shared-play friend-suggest mechanism.

### Exception path — support escalation

- For genuine edge cases (contact won't match, typo in saved contact, disputes),
  a support route exists. This is the **exception handler, not the main road** —
  keep it off the primary flow so it doesn't become a support-volume problem.

---

## Notify-and-dispute (replaces scorekeeper-as-gate)

A claim succeeds immediately but is **provisional for 72 hours.**

1. On claim, notify the **scorekeeper and the other players** who were in those
   rounds: "[Name] just claimed the player record from your [month] rounds."
2. **Nobody has to approve** — no friction trap. But the people who were actually
   there (especially the scorekeeper, who knows whose contact that was) can
   **dispute** within the window.
3. After **72 hours** with no dispute, the claim is **final** (`claim_state` →
   `claimed`).
4. A dispute during the window **unlinks** the account from the row
   (`account_id` → NULL, state → `unclaimed`), cleanly, because nothing migrated.
   The rightful owner can then claim properly.

This gives the security benefit of the scorekeeper's knowledge **without** making
them a blocking gatekeeper: detection instead of permission.

---

## Index recomputes from rounds (anti-theft by design)

The **TournyFlex Index always recomputes from round history** — it is never
stored as a transferable trophy. Consequence: claiming a record imports the
*rounds*, and the Index is derived from those rounds. Stealing a strong record
therefore hands the thief a **lower Index they must then play to** — a handicap
is a liability as much as a bragging right. This takes the motive out of theft
and is a backstop behind the verification + dispute protections, not a
replacement for them.

(Reminder from `CLAUDE.md`: only `index_eligible` individual stroke-play rounds
feed the Index. Scrambles, match play, side games are analysis-only and do not.)

---

## Threat model — the "Player 2 steals Player 1's good record" attack

Walkthrough of why the layered model defeats it:

- **Overhear the contact:** typing Player 1's email/phone is useless — the
  verification **code is sent to that contact**, which the attacker doesn't
  control. Blocked at verification.
- **Intercept the code (shared family email, text read over shoulder, etc.):**
  higher bar, but possible. Caught by **notify-and-dispute** — the scorekeeper,
  who knows whose contact it was, is pinged and can dispute within 72h.
- **Survive the dispute window:** even if undetected for a moment, the claim is
  **reversible** (clean unlink) the entire window, and the **Index recompute**
  means the stolen good scores become a standard the thief must live up to.

Net: the attack now requires intercepting a code AND surviving a dispute window
during which a knowledgeable party is notified — a dead end for inflating stats.

---

## Privacy & compliance (must respect)

- A non-user's contact is collected **for golf scoring**, given by a friend — not
  given to TournyFlex for marketing. **Marketing use of guest contacts must be
  opt-in** (the person consents before any marketing), consistent with the
  `shared_only` privacy default.
- Honor the **1-year data retention** rule for stored contact info where it
  applies; an unclaimed stub's saved contact should not be retained indefinitely.
- A second saved contact (if collected) is **redundancy for matching**, and any
  marketing value is subject to the same opt-in stance above. Collect with
  disclosure.

---

## Build implications / sequencing

- The **individual-stroke writer must persist by player identity, including
  stubs** (write to a resolvable `players` row with `account_id = NULL`). Design
  this before finalizing the stroke-play writer — every reader game inherits it.
- Claim, verification, notify-and-dispute, and unlink are a self-contained
  subsystem on top of the single `players` table.
- Net scoring is unaffected by this doc (still a fast-follow per
  `docs/side-games.md`).

## Open items to confirm before building

- Exact verification delivery (SMS vs email provider) and code format/expiry.
- Notification surface for dispute (push/email/in-app) and the dispute UI.
- Retention specifics for unclaimed-stub contact info (how long before purge).
- Whether a claimed-then-disputed row notifies the claimer of the reversal and
  routes them to support.
