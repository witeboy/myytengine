#!/usr/bin/env node
// verify-prompts.mjs — prove a port changed no prompt text.
//
//   node migration/tools/verify-prompts.mjs <original> <ported>
//
// Extracts every string and template literal of >= MIN_LEN characters from both files
// and compares the multisets. A prompt that was reworded, re-indented, truncated or
// dropped shows up here.
//
// This is the safety net for Phase 6: ~400KB of hand-tuned prompt engineering that must
// survive the migration untouched. Exit code 1 means DO NOT SHIP.
//
// The tokenizer is a proper state machine with a context stack, because these files
// nest backticks inside ${...} interpolations inside template literals. A naive scanner
// desyncs there and starts reporting code as prompt text.

import fs from 'node:fs';

const MIN_LEN = 40;

// Strings the port is SUPPOSED to change.
const EXPECTED_TO_CHANGE = [
  /generativelanguage\.googleapis\.com/,
  /api\.anthropic\.com/,
  /api\.openai\.com/,
  /gateway\.ai\.cloudflare\.com/,
  /^npm:@base44/,
  /^https:\/\/cdn\.base44\.com/,
  // API path literals the codemod lifts out of the old inline URLs
  /^\/v1(beta|m)?\//,
  /^\/api\/v1\//,
  // Per-function CORS preflight headers. index.ts handles CORS centrally, so the
  // codemod deletes those blocks — this string going missing is intended, not a
  // prompt regression.
  /^authorization, x-client-info, apikey, content-type$/,
  // Retired storage infrastructure. R2 is a binding now (no S3 endpoint, no
  // credentials) and Bunny is gone entirely, so these URL fragments are demolished
  // on purpose.
  /r2\.cloudflarestorage\.com/,
  /bunnycdn\.com/,
  /b-cdn\.net/,
];

/**
 * Returns every string/template literal >= MIN_LEN.
 * Interpolated expressions are replaced by a `${}` placeholder so that a legitimate
 * code change inside an interpolation does not register as a prompt change, while the
 * surrounding prose is still compared exactly.
 */
function extractStrings(code) {
  const out = [];
  // stack entries: {kind:'tpl', buf:string} | {kind:'interp', depth:number}
  const stack = [];
  let i = 0;
  const n = code.length;

  const top = () => stack[stack.length - 1];
  const append = (s) => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].kind === 'tpl') { stack[k].buf += s; return; }
    }
  };

  while (i < n) {
    const c = code[i];
    const t = top();
    const inTpl = t && t.kind === 'tpl';

    if (inTpl) {
      if (c === '\\') { append(code.slice(i, i + 2)); i += 2; continue; }
      if (c === '`') {
        const done = stack.pop();
        if (done.buf.length >= MIN_LEN) out.push(done.buf);
        append('`' + done.buf + '`'); // nested template counts toward its parent too
        i++;
        continue;
      }
      if (c === '$' && code[i + 1] === '{') {
        append('${}');
        stack.push({ kind: 'interp', depth: 1 });
        i += 2;
        continue;
      }
      append(c);
      i++;
      continue;
    }

    // ── code context (top-level, or inside ${ } ) ──
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Regex literal. These files are full of /['"]?\s*/g style patterns; treating the
    // quote inside one as a string opener desyncs the scanner for the rest of the file.
    if (c === '/') {
      let k = i - 1;
      while (k >= 0 && /\s/.test(code[k])) k--;
      const prev = k >= 0 ? code[k] : '';
      const isDivision = /[\w$)\]]/.test(prev);
      if (!isDivision) {
        i++;
        let inClass = false;
        while (i < n) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === '[') inClass = true;
          else if (code[i] === ']') inClass = false;
          else if (code[i] === '/' && !inClass) { i++; break; }
          else if (code[i] === '\n') break; // unterminated — bail rather than run away
          i++;
        }
        while (i < n && /[gimsuyvd]/.test(code[i])) i++;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let buf = '';
      while (i < n) {
        if (code[i] === '\\') { buf += code[i] + (code[i + 1] ?? ''); i += 2; continue; }
        if (code[i] === q) { i++; break; }
        buf += code[i++];
      }
      if (buf.length >= MIN_LEN) out.push(buf);
      append(JSON.stringify(buf));
      continue;
    }
    if (c === '`') { stack.push({ kind: 'tpl', buf: '' }); i++; continue; }

    if (t && t.kind === 'interp') {
      if (c === '{') t.depth++;
      else if (c === '}') {
        t.depth--;
        if (t.depth === 0) { stack.pop(); i++; continue; }
      }
    }
    i++;
  }
  return out;
}

const [, , origPath, portPath] = process.argv;
if (!origPath || !portPath) {
  console.error('usage: verify-prompts.mjs <original> <ported>');
  process.exit(1);
}

const relevant = (s) => !EXPECTED_TO_CHANGE.some((re) => re.test(s));
const before = extractStrings(fs.readFileSync(origPath, 'utf8')).filter(relevant);
const after = extractStrings(fs.readFileSync(portPath, 'utf8')).filter(relevant);

const count = (arr) => {
  const m = new Map();
  for (const s of arr) m.set(s, (m.get(s) || 0) + 1);
  return m;
};
const b = count(before);
const a = count(after);

const missing = [];
const added = [];
for (const [s, k] of b) { const g = a.get(s) || 0; if (g < k) missing.push({ s, n: k - g }); }
for (const [s, k] of a) { const g = b.get(s) || 0; if (g < k) added.push({ s, n: k - g }); }

const preview = (s) => (s.length > 110 ? s.slice(0, 110) + '…' : s).replace(/\n/g, '⏎');

console.log(`strings >= ${MIN_LEN} chars — before: ${before.length}, after: ${after.length}`);

if (!missing.length && !added.length) {
  console.log('✓ PASS — every prompt string survived byte-for-byte.');
  process.exit(0);
}

if (missing.length) {
  console.log(`\n✗ ${missing.length} string(s) LOST or ALTERED:\n`);
  for (const { s, n } of missing.slice(0, 20)) console.log(`  [-${n}] ${preview(s)}`);
  if (missing.length > 20) console.log(`  …and ${missing.length - 20} more`);
}
if (added.length) {
  console.log(`\n! ${added.length} string(s) NEW in the port:\n`);
  for (const { s, n } of added.slice(0, 20)) console.log(`  [+${n}] ${preview(s)}`);
  if (added.length > 20) console.log(`  …and ${added.length - 20} more`);
}

console.log('\nA lost/altered prompt means the port changed behaviour. DO NOT SHIP.');
process.exit(1);
