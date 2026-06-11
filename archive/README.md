# archive/

Historical SQL migration files, kept as the record of how the database was built.
These are **reference only** — they are NOT the source of truth and are known to
diverge from the live Neon database (see `docs/schema-current.md`,
"Known contradictions").

- `schema.sql` — original base schema (single annual outing).
- `schema-v2-migration.sql` — 3-day weekend format migration, run after the base.

For the current state of the database, see `docs/schema-current.md`.
Do not re-run these against a live database without checking current state first.
