#!/usr/bin/env node
// import-to-worker.mjs — load the Base44 export into D1 + R2, through the Worker.
//
//   API_BASE=https://myytengine-api.you.workers.dev AUTH_TOKEN=... \
//     node migration/tools/import-to-worker.mjs ./cutover
//
// Add --verify to re-check row counts without writing anything.
//
// WHY THROUGH THE API AND NOT `wrangler d1 execute`
// -------------------------------------------------
// Generating SQL and piping it into D1 looks simpler and is wrong here. Going through
// `/api/db/:entity/import` means every row passes the real entity client, so:
//
//   • undeclared fields land in `attrs` instead of being dropped or breaking the INSERT
//     (15 entities write fields their schema never declared)
//   • oversized columns offload to R2 automatically — a raw INSERT of a 3MB
//     `timeline_video_clips` would simply fail on D1's 1MB row limit
//   • types are coerced the same way the app will read them back
//
// The import op preserves `id`, `created_date` and `created_by`. That is the whole point:
// `Scenes.project_id` points at `Projects.id`, and about a dozen other columns do the
// same. Re-keying on import would silently orphan the entire dataset.
//
// INSERT OR REPLACE, so re-running is idempotent and a half-finished run is safe to resume.

import fs from 'node:fs';
import path from 'node:path';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const TOKEN = process.env.AUTH_TOKEN;
const dir = process.argv[2] || './cutover';
const verifyOnly = process.argv.includes('--verify');

if (!API_BASE || !TOKEN) {
  console.error('Set API_BASE and AUTH_TOKEN (a Neon Auth access token for your user).');
  process.exit(1);
}

// Parents before children. Import order matters only for readability — there are no FK
// constraints in the schema — but a sane order makes a partial run easier to reason about.
const ORDER = [
  'Channels', 'ChannelThumbnailDNA', 'ChannelTopics', 'CalendarEntries',
  'Projects', 'Topics', 'Hooks', 'Scripts', 'ScriptBatches',
  'Scenes', 'VisualPrompts', 'TimingEntries', 'TimelineBlocks',
  'ProductionSettings', 'Transcripts', 'MusicTracks', 'MediaAssets',
  'ThumbnailNiches', 'ThumbnailTemplates', 'ThumbnailConcepts',
  'UploadMetadata', 'AssetPlans', 'BrandIdentities', 'RetentionMaps', 'VoiceProfiles',
];

// Small batches: a page of Scenes can carry very large prompt fields, and each row may
// trigger an R2 write. 25 keeps a single request comfortably inside limits.
const BATCH = 25;

async function call(entity, op, payload) {
  const res = await fetch(`${API_BASE}/api/db/${entity}/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body?.data;
}

const manifestPath = path.join(dir, '_manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`No _manifest.json in ${dir}. Run export-base44.mjs first.`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(verifyOnly ? 'Verifying row counts\n' : `Importing from ${dir}\n`);

let imported = 0;
const problems = [];

for (const entity of ORDER) {
  const file = path.join(dir, `${entity}.json`);
  if (!fs.existsSync(file)) {
    console.log(`  ${entity.padEnd(22)} (no export file — skipped)`);
    continue;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!verifyOnly) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      try {
        await call(entity, 'import', { rows: slice });
        imported += slice.length;
        process.stdout.write(`\r  ${entity.padEnd(22)} ${Math.min(i + BATCH, rows.length)}/${rows.length}   `);
      } catch (e) {
        problems.push(`${entity} rows ${i}-${i + slice.length}: ${e.message}`);
      }
    }
  }

  // Count what actually landed. `list` is capped, so page until exhausted rather than
  // trusting a single call — an entity with >1000 rows would otherwise read as short.
  let live = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await call(entity, 'list', { limit: 1000, offset });
    live += page.length;
    if (page.length < 1000) break;
  }

  const expected = manifest.counts[entity] ?? rows.length;
  const ok = live === expected;
  if (!ok) problems.push(`${entity}: expected ${expected}, found ${live}`);
  console.log(`\r  ${entity.padEnd(22)} ${String(live).padStart(6)} / ${String(expected).padEnd(6)} ${ok ? 'ok' : '  MISMATCH'}`);
}

console.log(`\n${verifyOnly ? 'Checked' : 'Imported'} ${imported} rows.`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n`);
  problems.forEach((p) => console.log('  ' + p));
  console.log('\nThe import is INSERT OR REPLACE — fix the cause and re-run; it is idempotent.');
  process.exit(1);
}
console.log('All row counts match the export manifest.');
