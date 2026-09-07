#!/usr/bin/env node
// port-batch.mjs — run port-fn + verify-prompts across a whole phase.
//
//   node migration/tools/port-batch.mjs migration/tools/batches/phase6.json
//
// Exit code 1 if ANY function fails prompt verification. Wire this into CI.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('usage: port-batch.mjs <batch.json>');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(`Phase ${manifest.phase} — ${manifest.title}`);
console.log(`${manifest.functions.length} functions\n`);

const run = (args) => execFileSync('node', args, { encoding: 'utf8' });

let pass = 0, fail = 0, todos = 0, prompts = 0;
const failed = [];
const needsHuman = [];

for (const { name, src } of manifest.functions) {
  if (!fs.existsSync(src)) {
    console.log(`${name.padEnd(26)} SKIP   source not found: ${src}`);
    failed.push(name); fail++;
    continue;
  }
  const dest = `workers/api/src/fn/${name}.ts`;

  const portOut = run(['migration/tools/port-fn.mjs', src, name]);
  const todoCount = Number((portOut.match(/· (\d+) PORT-TODO/) || [])[1] || 0);
  const humanItems = portOut.split('\n')
    .filter((l) => /^\s+\d+\. /.test(l))
    .map((l) => l.trim());

  let verifyOut = '', ok = false;
  try {
    verifyOut = run(['migration/tools/verify-prompts.mjs', src, dest]);
    ok = /PASS/.test(verifyOut);
  } catch (e) {
    verifyOut = (e.stdout || '') + (e.stderr || '');
    ok = false;
  }
  const promptCount = Number((verifyOut.match(/before: (\d+)/) || [])[1] || 0);

  prompts += promptCount;
  todos += todoCount;
  if (ok) pass++; else { fail++; failed.push(name); }
  if (humanItems.length) needsHuman.push({ name, items: humanItems });

  console.log(
    `${name.padEnd(26)} ${(ok ? 'PASS' : 'FAIL').padEnd(5)} ` +
    `${String(promptCount).padStart(4)} prompts  ${String(todoCount).padStart(2)} todo`);
  if (!ok) {
    verifyOut.split('\n').filter((l) => /^\s+\[/.test(l)).slice(0, 3)
      .forEach((l) => console.log(`      ${l.trim().slice(0, 100)}`));
  }
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`prompt integrity : ${pass} pass / ${fail} fail  (${prompts} strings compared)`);
console.log(`manual follow-ups: ${todos} PORT-TODO marker(s) in generated files`);

if (needsHuman.length) {
  console.log(`\nNeeds a human:`);
  for (const { name, items } of needsHuman) {
    console.log(`\n  ${name}`);
    items.forEach((i) => console.log(`    ${i}`));
  }
}

if (fail) {
  console.log(`\n✗ ${failed.join(', ')} altered prompt text. DO NOT SHIP.`);
  process.exit(1);
}
console.log('\n✓ All prompts survived byte-for-byte. Now resolve the PORT-TODOs and typecheck.');
