#!/usr/bin/env node
// export-base44.mjs — dump every live entity out of Base44 to JSON, one file each.
//
//   BASE44_APP_ID=... BASE44_TOKEN=... BASE44_BASE_URL=https://your-app.base44.app \
//     node migration/tools/export-base44.mjs ./cutover
//
// Read-only. It never writes to Base44 and can be run as many times as you like — run
// it once for a dry run days before cutover, and again for the real thing.
//
// Getting the token: open the live app, and in the browser console run
//   localStorage.getItem('base44_access_token')
//
// Pagination is by offset with a fixed page size. Base44 has no cursor API, so a row
// created *during* the export can shift the window and cause a duplicate or a miss.
// That is why the real run happens with the app closed — see PHASE-13.md §1.

import fs from 'node:fs';
import path from 'node:path';

const APP_ID = process.env.BASE44_APP_ID;
const TOKEN = process.env.BASE44_TOKEN;
const BASE_URL = (process.env.BASE44_BASE_URL || '').replace(/\/$/, '');
const outDir = process.argv[2] || './cutover';

if (!APP_ID || !TOKEN || !BASE_URL) {
  console.error('Set BASE44_APP_ID, BASE44_TOKEN and BASE44_BASE_URL.');
  process.exit(1);
}

// The 25 entities that survive the scope cuts. The other 7 (NicheAudits,
// TrendingNiches, CachedVideos, Searches, InfluencerTemplates, ProjectVersions,
// AutoEditJobs) belong to dropped features and are deliberately NOT exported.
const ENTITIES = [
  'AssetPlans', 'BrandIdentities', 'CalendarEntries', 'ChannelThumbnailDNA',
  'ChannelTopics', 'Channels', 'Hooks', 'MediaAssets', 'MusicTracks',
  'ProductionSettings', 'Projects', 'RetentionMaps', 'Scenes', 'ScriptBatches',
  'Scripts', 'ThumbnailConcepts', 'ThumbnailNiches', 'ThumbnailTemplates',
  'TimelineBlocks', 'TimingEntries', 'Topics', 'Transcripts', 'UploadMetadata',
  'VisualPrompts', 'VoiceProfiles',
];

const PAGE = 200;

async function fetchPage(entity, offset) {
  const url =
    `${BASE_URL}/api/apps/${APP_ID}/entities/${entity}` +
    `?limit=${PAGE}&offset=${offset}&sort=created_date`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'X-App-Id': APP_ID },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${entity} @${offset}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // Base44 returns either a bare array or { data: [...] } depending on endpoint version.
  return Array.isArray(data) ? data : data.data || [];
}

async function exportEntity(entity) {
  const rows = [];
  const seen = new Set();
  let offset = 0;

  for (;;) {
    const page = await fetchPage(entity, offset);
    if (page.length === 0) break;

    for (const r of page) {
      // Offset pagination can repeat a row if the table shifts underneath us. Dropping
      // duplicates by id is safe; the import is INSERT OR REPLACE anyway.
      if (r?.id && seen.has(r.id)) continue;
      if (r?.id) seen.add(r.id);
      rows.push(r);
    }

    if (page.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`\r  ${entity}: ${rows.length}…   `);
  }
  return rows;
}

fs.mkdirSync(outDir, { recursive: true });

const manifest = { exported_at: new Date().toISOString(), app_id: APP_ID, counts: {} };
let total = 0;
const failures = [];

for (const entity of ENTITIES) {
  try {
    const rows = await exportEntity(entity);
    fs.writeFileSync(
      path.join(outDir, `${entity}.json`),
      JSON.stringify(rows, null, 2),
      'utf8',
    );
    manifest.counts[entity] = rows.length;
    total += rows.length;
    console.log(`\r  ${entity.padEnd(22)} ${String(rows.length).padStart(6)} rows`);
  } catch (e) {
    failures.push(`${entity}: ${e.message}`);
    console.log(`\r  ${entity.padEnd(22)} FAILED — ${e.message}`);
  }
}

fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\n${total} rows across ${Object.keys(manifest.counts).length} entities -> ${outDir}`);
console.log('Row counts written to _manifest.json — import-to-worker.mjs checks against it.');

if (failures.length) {
  console.log(`\n${failures.length} entity/entities failed:`);
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
