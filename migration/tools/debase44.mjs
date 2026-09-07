#!/usr/bin/env node
// debase44.mjs — final rename of the API client import across the frontend.
//
//   node migration/tools/debase44.mjs apps/web/src            # dry run
//   node migration/tools/debase44.mjs apps/web/src --write
//
// All 104 call sites use ONE import form:
//
//   import { base44 } from '@/api/base44Client'
//
// so this is an exact-string swap, not a regex over varied shapes. It rewrites them to
//
//   import { api as base44 } from '@/api/client'
//
// keeping the local identifier `base44` so not one usage line changes — only the import.
// Renaming the identifier too would touch ~440 call sites for cosmetic gain and put the
// whole migration's "no behaviour change" claim at risk for nothing.
//
// Run this LAST, after the app is green on the new backend. It is the step that lets
// `grep -ri base44 apps/web/src` come back clean and `api/base44Client.js` be deleted.

import fs from 'node:fs';
import path from 'node:path';

const OLD = "import { base44 } from '@/api/base44Client'";
const NEW = "import { api as base44 } from '@/api/client'";

const root = process.argv[2];
const write = process.argv.includes('--write');

if (!root) {
  console.error('usage: debase44.mjs <src-dir> [--write]');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(root);
let changed = 0;
const leftovers = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes(OLD)) {
    const next = src.split(OLD).join(NEW);
    if (write) fs.writeFileSync(f, next, 'utf8');
    changed++;
    continue;
  }
  // Anything else mentioning base44 needs a human — an import form the swap missed,
  // or a genuine leftover like the old AuthContext axios import.
  if (/base44|@base44/i.test(src) && !f.endsWith('base44Client.js')) {
    leftovers.push(f);
  }
}

console.log(`${write ? 'Rewrote' : 'Would rewrite'} ${changed} import(s) across ${files.length} file(s).`);

if (leftovers.length) {
  console.log(`\n${leftovers.length} file(s) still mention base44 and need a look:\n`);
  leftovers.forEach((f) => console.log('  ' + f));
  console.log('\nExpected leftovers before Phase 12 finishes:');
  console.log('  src/api/base44Client.js        the compat shim — delete after this runs');
  console.log('  src/functions/callClaudeProxy.js  a Deno function stranded in the frontend tree, imported by nothing — delete');
} else {
  console.log('\nNo leftovers. `api/base44Client.js` can be deleted.');
}

if (!write) console.log('\nDry run. Re-run with --write to apply.');
