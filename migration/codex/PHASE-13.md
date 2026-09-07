# Phase 13 — Data cutover

> Prepend `codex/00-PREAMBLE.md`. The last phase, and **the only one that touches real
> data**. Everything up to here has been reversible. This is not.

25 entities move out of Base44 into D1 + R2. Two scripts do the work; the care is in the
sequencing.

---

## Step 0 — Before you touch anything

- [ ] Phases 0–12 complete and the app works on the new backend with a **test** project
- [ ] `npm run db:init` has been run against **remote** D1, not just local
- [ ] the Phase 2 parity suite passes against remote D1 — especially the >64KB
      cold-storage round-trip
- [ ] you have a Neon Auth access token for your own user

The export is read-only and never writes to Base44. Base44 stays untouched and usable
until you decide otherwise — this is a copy, not a move.

## Step 1 — Dry run, days early

```bash
export BASE44_APP_ID=...           # from the old .env.local
export BASE44_TOKEN=...            # browser console: localStorage.getItem('base44_access_token')
export BASE44_BASE_URL=https://your-app.base44.app

node migration/tools/export-base44.mjs ./cutover-dry
```

Do this while the app is still in normal use. You are not keeping this data — you are
finding out, without time pressure, whether any entity errors, whether the row counts
look sane, and how long the whole thing takes.

Then import it into D1 and click around. Fix whatever surfaces. Then **wipe D1 and start
clean** for the real run:

```bash
npx wrangler d1 execute myytengine --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table'"    # see what is there
# drop and re-run schema.sql
```

## Step 2 — The real export, with the app closed

> ⚠ **Stop using the app first.** The exporter pages by offset, and Base44 has no cursor
> API. A row created mid-export shifts the window and can duplicate or skip rows. The
> script de-duplicates by id, which covers duplicates but cannot recover a row it never
> saw. Closing the app is the only real protection.

```bash
node migration/tools/export-base44.mjs ./cutover
```

Writes one JSON file per entity plus `_manifest.json` with the row counts. **Keep this
directory.** It is your rollback: Base44 still has the data, and this is a second copy.

Seven entities are deliberately **not** exported — `NicheAudits`, `TrendingNiches`,
`CachedVideos`, `Searches`, `InfluencerTemplates`, `ProjectVersions`, `AutoEditJobs`.
They belong to dropped features and have no table to land in.

## Step 3 — Import

```bash
export API_BASE=https://myytengine-api.<subdomain>.workers.dev
export AUTH_TOKEN=<your Neon Auth access token>

node migration/tools/import-to-worker.mjs ./cutover
```

### Why this goes through the API and not `wrangler d1 execute`

Generating SQL and piping it into D1 is the obvious approach and it is wrong here. Every
row must pass through the real entity client, because:

- **Undeclared fields.** 15 entities write fields their schema never declared. Raw SQL
  would drop them or fail the INSERT; the client routes them into `attrs`.
- **Oversized columns.** A 3MB `timeline_video_clips` exceeds D1's 1MB row limit. The
  client offloads it to R2 and stores a pointer. Raw SQL simply fails.
- **Type coercion.** Booleans become `0/1`, arrays and objects are serialized the same
  way the app will read them back.

### Ids are preserved — this is the important bit

The import uses a dedicated `import` op that keeps `id`, `created_date` and
`created_by`. Every other write path mints a fresh id, which is right for normal use and
**fatal here**: `Scenes.project_id` points at `Projects.id`, and around a dozen other
columns do the same. Re-keying on import would silently orphan the entire dataset —
every project would load with no scenes, no script, no settings, and nothing would
error.

It is `INSERT OR REPLACE`, so the import is idempotent. A run that dies halfway can be
re-run from the top.

## Step 4 — Verify

The importer already compares live row counts against `_manifest.json` and exits
non-zero on any mismatch. Then check the things counts cannot see:

```bash
node migration/tools/import-to-worker.mjs ./cutover --verify
```

- [ ] **A big row survived.** Open a project with a real timeline. Its
      `timeline_video_clips` went to R2 and came back — if cold storage is broken, this
      is where it shows, and it shows as an empty editor rather than an error.
- [ ] **Relationships hold.** Open a project: its scenes, script, hooks and production
      settings are all attached. If ids had been re-keyed, this page would be empty.
- [ ] **Undeclared fields survived.** Check a `UploadMetadata` row has its
      `record_type`, and a `Projects` row has `scene_blueprint` if it had one.
- [ ] **Types round-tripped.** A boolean reads as `true`, not `1`; `tags` is an array,
      not a JSON string.
- [ ] **Counts match** for all 25 entities.

## Step 5 — Close it out

- [ ] Remove `'import'` from `OPS` in `workers/api/src/routes/db.ts`. It exists for this
      phase only, and an id-preserving `INSERT OR REPLACE` endpoint is not something to
      leave reachable.
- [ ] Archive `./cutover` somewhere durable — it is the only snapshot you control.
- [ ] Leave Base44 running, read-only, for a couple of weeks. It costs little and it is
      the rollback nobody wants but everybody eventually needs.
- [ ] Record the cutover date and final row counts in `MIGRATION-NOTES.md`.

## If it goes wrong

Nothing here is destructive to Base44. The recovery is: point the frontend's
`VITE_BASE44_*` back, redeploy the old build, and you are live again on the old stack
while you work out what happened. That is why Phase 12 is a separate commit — so
reverting the frontend is one revert, not an archaeology exercise.

## Do not

- Do not run the export while the app is in use.
- Do not import with `bulkCreate` — it re-keys every row.
- Do not generate SQL and skip the API; you lose `attrs` and cold storage.
- Do not delete the Base44 app on cutover day.
- Do not leave the `import` op enabled afterwards.
