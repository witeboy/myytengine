#!/usr/bin/env node
// port-fn.mjs — mechanical Deno→Worker transform for one Base44 function.
//
//   node migration/tools/port-fn.mjs base44/functions/generateHooks.ts generateHooks
//
// Writes workers/api/src/fn/<name>.ts.
//
// WHY THIS EXISTS: the prompt engine alone is ~400KB of hand-tuned prompt strings.
// Retyping those through a model is how they get silently corrupted. This script does
// only structural edits and never rewrites string contents, so prompt bodies are
// copied byte-for-byte. What it cannot do safely it marks `// PORT-TODO:` and reports.
//
// Scanning is string-aware: prompts are full of parentheses, braces and quotes, so a
// naive regex would shred them.
//
// ALWAYS run verify-prompts.mjs afterwards. It is the actual safety net.

import fs from 'node:fs';
import path from 'node:path';

const [, , srcPath, fnName] = process.argv;
if (!srcPath || !fnName) {
  console.error('usage: port-fn.mjs <source-file> <functionName>');
  process.exit(1);
}

let src = fs.readFileSync(srcPath, 'utf8');
const todos = [];
const note = (m) => { if (!todos.includes(m)) todos.push(m); };

// ── string-aware scanning ─────────────────────────────────────────────────────

/** Map of index -> true for every position inside a string, template or comment. */
function maskCode(code) {
  const mask = new Uint8Array(code.length);
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') mask[i++] = 1;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      mask[i++] = 1; mask[i++] = 1;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) mask[i++] = 1;
      if (i < code.length) { mask[i++] = 1; mask[i++] = 1; }
      continue;
    }
    // Regex literal — must be masked. These files are full of /['"]?\s*/g patterns and
    // treating the quote inside one as a string opener desyncs the mask for the rest of
    // the file, which then makes paren matching splice across unrelated calls.
    if (c === '/') {
      let k = i - 1;
      while (k >= 0 && /\s/.test(code[k])) k--;
      const prev = k >= 0 ? code[k] : '';
      if (!/[\w$)\]]/.test(prev)) {
        mask[i++] = 1;
        let inClass = false;
        while (i < code.length) {
          if (code[i] === '\\') { mask[i++] = 1; if (i < code.length) mask[i++] = 1; continue; }
          if (code[i] === '\n') break; // unterminated — bail rather than swallow the file
          if (code[i] === '[') inClass = true;
          else if (code[i] === ']') inClass = false;
          else if (code[i] === '/' && !inClass) { mask[i++] = 1; break; }
          mask[i++] = 1;
        }
        while (i < code.length && /[gimsuyvd]/.test(code[i])) mask[i++] = 1;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      mask[i++] = 1;
      while (i < code.length) {
        if (code[i] === '\\') { mask[i++] = 1; if (i < code.length) mask[i++] = 1; continue; }
        if (code[i] === q) { mask[i++] = 1; break; }
        // template interpolation is real code — leave it unmasked
        if (q === '`' && code[i] === '$' && code[i + 1] === '{') {
          mask[i++] = 1; mask[i++] = 1;
          let depth = 1;
          while (i < code.length && depth > 0) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') { depth--; if (!depth) { mask[i++] = 1; break; } }
            i++;
          }
          continue;
        }
        mask[i++] = 1;
      }
      continue;
    }
    i++;
  }
  return mask;
}

/** Index of the ')' matching the '(' that opens at `openIdx`. */
function matchParen(code, openIdx, mask) {
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    if (mask[i]) continue;
    if (code[i] === '(') depth++;
    else if (code[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Split an argument list on top-level commas. */
function splitArgs(code, mask, from, to) {
  const parts = [];
  let depth = 0, start = from;
  for (let i = from; i < to; i++) {
    if (mask[i]) continue;
    const c = code[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(code.slice(start, i)); start = i + 1; }
  }
  parts.push(code.slice(start, to));
  return parts.map((s) => s.trim());
}

// ── 1. imports ────────────────────────────────────────────────────────────────
src = src.replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"]npm:@base44\/sdk[^'"]*['"];?[ \t]*\r?\n/gm, '');
src = src.replace(/^\s*import\s+[^\n]*from\s+['"]https:\/\/cdn\.base44\.com[^'"]*['"];?[ \t]*\r?\n/gm, '');
if (/@aws-sdk\/client-s3/.test(src)) {
  src = src.replace(/^\s*import[^\n]*@aws-sdk\/client-s3[^\n]*\r?\n/gm,
    '// PORT-TODO: S3 SDK removed — R2 is a binding. Use lib/r2.ts (putMedia / ingestUrl).\n');
  note('Used the S3 SDK. Replace every S3 call with lib/r2.ts helpers.');
}

// ── 2. provider fetches -> raw-Response passthroughs ──────────────────────────
// Done BEFORE the env rewrite so the `?key=${apiKey}` shape is still intact.
const providersUsed = new Set();
function swapFetch(code, hostRe, helper, provider) {
  let out = code, guard = 0;
  for (;;) {
    if (guard++ > 200) break;
    const mask = maskCode(out);
    const m = hostRe.exec(out);
    hostRe.lastIndex = 0;
    if (!m) break;
    const urlStart = m.index;
    const pathForUrl = m[1]
      .replace(/\?key=\$\{[^}]*\}\s*$/, '')
      .replace(/\?key=[^`'"]*$/, '');
    // walk back to the `fetch(` that owns this URL
    const before = out.slice(Math.max(0, urlStart - 200), urlStart);
    const fetchRel = before.lastIndexOf('fetch(');
    if (fetchRel === -1) {
      // The URL was built into a variable first:
      //   const url = `https://…/models/${model}:generateContent?key=${KEY}`;
      //   const res = await fetch(url, init);
      // Rewrite the literal to a gwUrl() call and flag the fetch for a manual swap,
      // since we cannot see which fetch consumes the variable.
      const gwProvider =
        helper === 'geminiFetch' ? 'google-ai-studio'
        : helper === 'anthropicFetch' ? 'anthropic'
        : 'openai';
      // find the enclosing template/quote so the whole literal is replaced
      let s = urlStart, e = urlStart;
      while (s > 0 && !['`', "'", '"'].includes(out[s - 1])) s--;
      const quote = out[s - 1];
      e = s;
      while (e < out.length && out[e] !== quote) e++;
      const inner = out.slice(s, e).replace(/^https:\/\/[^/]+/, '');
      const pathExpr = quote === '`' ? '`' + inner.replace(/\?key=\$\{[^}]*\}\s*$/, '') + '`'
                                     : `'${inner.replace(/\?key=[^'"]*$/, '')}'`;
      out = out.slice(0, s - 1) +
            `gwUrl(ctx.env, '${gwProvider}', ${pathExpr}) /* PORT-TODO: this URL is passed to a bare fetch() — swap that call to ${helper}(ctx, path, init) so the API key header is attached */` +
            out.slice(e + 1);
      note(`A ${provider} URL was assigned to a variable before fetch(). The literal was ` +
           `rewritten to gwUrl(), but you MUST convert the fetch() call itself to ${helper}(ctx, …). ` +
           `A bare gwUrl() call is broken on the default 'aggregator' routing — it builds a ` +
           `Cloudflare AI Gateway URL, sends no key, and skips the Gemini->OpenAI translation.`);
      providersUsed.add('gwUrl');
      continue;
    }
    const fetchIdx = Math.max(0, urlStart - 200) + fetchRel;
    const open = fetchIdx + 'fetch'.length;
    const close = matchParen(out, open, mask);
    if (close === -1) break;
    const args = splitArgs(out, mask, open + 1, close);
    const pathOnly = m[1].replace(/\?key=\$\{[^}]*\}\s*$/, '').replace(/\?key=[^`'"]*$/, '');
    const rest = args.slice(1).join(', ');
    const replacement = `${helper}(ctx, '${pathOnly}'${rest ? ', ' + rest : ''})`;
    out = out.slice(0, fetchIdx) + replacement + out.slice(close + 1);
    providersUsed.add(helper);
  }
  return out;
}
src = swapFetch(src, /https:\/\/generativelanguage\.googleapis\.com([^`'"]*)/, 'geminiFetch', 'Gemini');
src = swapFetch(src, /https:\/\/api\.anthropic\.com([^`'"]*)/, 'anthropicFetch', 'Anthropic');
src = swapFetch(src, /https:\/\/api\.openai\.com([^`'"]*)/, 'openaiFetch', 'OpenAI');

// ── 3. the Deno.serve wrapper ─────────────────────────────────────────────────
const serveRe = /Deno\.serve\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/;
const sm = src.match(serveRe);
let reqName = 'req';
if (!sm) {
  note('No `Deno.serve(async (req) => {` found — port the entry point by hand.');
} else {
  reqName = sm[1];
  src = src.replace(serveRe, '__HANDLER_OPEN__');
  const last = src.lastIndexOf('});');
  if (last !== -1) src = src.slice(0, last) + '};' + src.slice(last + 3);
}

// Per-function CORS preflight. CORS is handled centrally in src/index.ts, so these
// blocks are dead weight — and they are the only remaining reference to `req` in 10
// of the kept functions.
{
  const NEEDLE = /if\s*\(\s*\w+\.method\s*===\s*['"]OPTIONS['"]\s*\)\s*\{/;
  for (let guard = 0; guard < 20; guard++) {
    const mask = maskCode(src);
    const m = src.match(NEEDLE);
    if (!m) break;
    const start = m.index;
    if (mask[start]) break;
    const braceIdx = src.indexOf('{', start + m[0].length - 1);
    let depth = 0, end = -1;
    for (let i = braceIdx; i < src.length; i++) {
      if (mask[i]) continue;
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (end === -1) break;
    src = src.slice(0, start) + src.slice(end + 1);
    note('Removed a per-function CORS preflight block — index.ts handles CORS centrally.');
  }
}

// `const base44 = createClientFromRequest(req)`
src = src.replace(/^[ \t]*const\s+base44\s*=\s*createClientFromRequest\([^)]*\);?[ \t]*\r?\n/gm, '');
// Deferred form: `let base44, scene_id;` … `base44 = createClientFromRequest(req);`
// … `if (scene_id && base44) { /* cleanup */ }`
if (/^[ \t]*(let|var)\s+base44\b/m.test(src)) {
  src = src.replace(/^[ \t]*(?:let|var)\s+base44\s*;[ \t]*\r?\n/gm, '');
  src = src.replace(/^([ \t]*)(let|var)\s+base44\s*,\s*/gm, '$1$2 ');
  src = src.replace(/^([ \t]*)(let|var)\s+([\w\s,]*?),\s*base44\s*;/gm, '$1$2 $3;');
  src = src.replace(/^[ \t]*base44\s*=\s*createClientFromRequest\([^)]*\);?[ \t]*\r?\n/gm, '');
  src = src.replace(/\s*&&\s*base44\b/g, '');
  src = src.replace(/\bbase44\s*&&\s*/g, '');
  note('Removed the deferred `let base44 … createClientFromRequest(req)` pattern and its ' +
       '`&& base44` guards. Check the cleanup branch in the catch block still reads correctly.');
}
src = src.replace(/^([ \t]*)const\s+user\s*=\s*await\s+base44\.auth\.me\(\);?[ \t]*\r?\n/gm,
  '$1const user = ctx.user;\n');
src = src.replace(
  /^[ \t]*if\s*\(\s*!user\s*\)\s*(?:return|\{[\s\S]{0,40}?return)\s+Response\.json\(\s*\{\s*error:\s*['"]Unauthorized['"]\s*\}\s*,\s*\{\s*status:\s*401\s*\}\s*\);?[ \t]*\}?[ \t]*\r?\n/gm,
  '');

const bodyRe = new RegExp(`(const|let)\\s+(\\{[\\s\\S]*?\\}|\\w+)\\s*=\\s*await\\s+${reqName}\\.json\\(\\);?`, 'g');
src = src.replace(bodyRe, (_a, kw, target) =>
  // `const body = await req.json()` would become `const body = body` — drop it instead.
  target === 'body' ? '' : `${kw} ${target} = body;`);
{
  const mask = maskCode(src);
  const re = new RegExp(`\\b${reqName}\\b`, 'g');
  let mm;
  while ((mm = re.exec(src))) {
    if (!mask[mm.index]) { note(`Still references \`${reqName}\` — the handler receives only (body, ctx).`); break; }
  }
}

// ── 4. entities / integrations ────────────────────────────────────────────────
src = src.replace(/base44\.asServiceRole\.entities\./g, 'ctx.db.');
src = src.replace(/base44\.entities\./g, 'ctx.db.');
if (/base44(\.asServiceRole)?\.functions\.invoke/.test(src)) {
  src = src.replace(/base44(\.asServiceRole)?\.functions\.invoke\(/g, '/* PORT-TODO: call the handler directly */ __invoke(');
  note('Calls another function. Import that handler and call `await other(payload, ctx)` — do not go over HTTP.');
}
src = src.replace(/base44(\.asServiceRole)?\.integrations\.Core\.InvokeLLM\(/g, 'invokeLLM(ctx, ');
if (/Core\.UploadFile/.test(src)) {
  src = src.replace(/base44(\.asServiceRole)?\.integrations\.Core\.UploadFile\(/g, '/* PORT-TODO */ putMedia(ctx, ');
  note('Used Core.UploadFile — adapt the call to putMedia(ctx, body, { filename, contentType }).');
}
if (/Core\.GenerateImage/.test(src)) note('Used Core.GenerateImage — route to KIE via lib/kie.');

// ── 5. env -> BYOK ────────────────────────────────────────────────────────────
// require() throws when a key is absent; get() returns null. Which one is correct
// depends on whether the ORIGINAL code null-checked the value.
//
//   const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
//   if (!MINIMAX_KEY) return Response.json({ error: '… Switch to AI33.' }, { status: 500 });
//
// Rewriting that to require() makes the check unreachable and destroys a graceful
// fallback — exactly the kind of silent behaviour change this migration forbids. So:
// null-checked anywhere in the file -> get(), otherwise -> require().
// Retired infrastructure. These were credentials for reaching R2 over the S3 API and
// Bunny CDN. In a Worker, R2 is a binding (no credentials at all) and Bunny is gone.
// They are NOT in lib/providers.ts and must never be requested from the vault — doing
// so would fail at runtime with a misleading "add it in Settings" message.
const RETIRED_ENV = /^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_R2_[A-Z_]+|BUNNY_[A-Z_]+)$/;
const retiredSeen = new Set();
src = src.replace(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g, (all, k) => {
  if (!RETIRED_ENV.test(k)) return all;
  retiredSeen.add(k);
  return `/* PORT-TODO: ${k} is retired — R2 is a binding (ctx.env.MEDIA), Bunny is gone. Use lib/r2.ts */ ''`;
});
if (retiredSeen.size) {
  note(`Retired env vars referenced: ${[...retiredSeen].join(', ')}. Replace the whole ` +
       `storage block with lib/r2.ts helpers (putMedia / ingestUrl) — do not add these ` +
       `to the BYOK vault.`);
}

const envKeys = new Set();
const optionalKeys = new Set();
src = src.replace(
  /(?:const|let)\s+(\w+)\s*=\s*Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g,
  (all, varName, key) => {
    const guarded = new RegExp(
      `!\\s*${varName}\\b|\\b${varName}\\s*\\?|\\b${varName}\\s*\\|\\||if\\s*\\(\\s*${varName}\\s*\\)`,
    ).test(src);
    if (guarded) optionalKeys.add(key);
    return all.replace(/Deno\.env\.get\([^)]*\)/,
      guarded ? `await ctx.keys.get('${key}')` : `await ctx.keys.require('${key}')`);
  });

src = src.replace(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g, (_a, k) => {
  envKeys.add(k);
  return `await ctx.keys.require('${k}')`;
});
if (optionalKeys.size) {
  note(`Treated as OPTIONAL (the original null-checked them, so ctx.keys.get() is used ` +
       `and the existing fallback still runs): ${[...optionalKeys].join(', ')}.`);
  optionalKeys.forEach((k) => envKeys.add(k));
}
// A key read that is now unused (its only consumer was the fetch URL we replaced).
src = src.replace(
  /^[ \t]*const\s+(\w+)\s*=\s*await ctx\.keys\.require\('([A-Z0-9_]+)'\);?[ \t]*\r?\n/gm,
  (all, varName, key) => {
    const uses = (src.match(new RegExp(`\\b${varName}\\b`, 'g')) || []).length;
    return uses <= 1 ? '' : all;
  });

// ── 6. helper functions need ctx ──────────────────────────────────────────────
// Module-scope helpers that now reference `ctx` must receive it.
{
  const helperRe = /^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm;
  const helpers = [];
  let hm;
  while ((hm = helperRe.exec(src))) {
    const [full, name, params] = hm;
    const bodyStart = src.indexOf('{', hm.index);
    if (bodyStart === -1) continue;
    const mask = maskCode(src);
    let depth = 0, end = bodyStart;
    for (let i = bodyStart; i < src.length; i++) {
      if (mask[i]) continue;
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (/\bctx\b/.test(src.slice(bodyStart, end))) {
      helpers.push({ name, params, full, index: hm.index, isAsync: full.startsWith('async') });
    }
  }
  for (const h of helpers) {
    if (!h.isAsync) note(`Helper \`${h.name}\` is not async but now awaits a key — make it async and await its call sites.`);
    const newSig = h.full.replace(`(${h.params})`, `(ctx${h.params.trim() ? ', ' + h.params : ''})`);
    src = src.replace(h.full, newSig);
    // call sites (skip the declaration itself)
    src = src.replace(new RegExp(`(?<!function\\s)\\b${h.name}\\(`, 'g'), `${h.name}(ctx, `);
    src = src.replace(new RegExp(`${h.name}\\(ctx, ctx`, 'g'), `${h.name}(ctx`);
    src = src.replace(new RegExp(`${h.name}\\(ctx, \\)`, 'g'), `${h.name}(ctx)`);
  }
  if (helpers.length) {
    note(`Injected \`ctx\` into helper(s): ${helpers.map((h) => h.name).join(', ')}. Check the call sites.`);
  }
}

// ── 7. Response.json -> plain return / HttpError ──────────────────────────────
{
  const NEEDLE = 'Response.json(';
  let guard = 0;
  for (;;) {
    if (guard++ > 500) break;
    const mask = maskCode(src);
    let idx = -1;
    for (let i = 0; i + NEEDLE.length <= src.length; i++) {
      if (!mask[i] && src.startsWith(NEEDLE, i)) { idx = i; break; }
    }
    if (idx === -1) break;
    const open = idx + NEEDLE.length - 1;
    const close = matchParen(src, open, mask);
    if (close === -1) break;
    const args = splitArgs(src, mask, open + 1, close);
    const statusM = args[1] && args[1].match(/status\s*:\s*(\d+)/);
    const status = statusM ? Number(statusM[1]) : 200;

    let replacement;
    let head = idx;
    const pre = src.slice(Math.max(0, idx - 12), idx);
    const retM = pre.match(/return\s+$/);
    if (retM) head = idx - retM[0].length;

    if (status >= 400) {
      const em = args[0].match(/^\{\s*error\s*:\s*([\s\S]+?)\s*\}$/);
      replacement = em
        ? `throw new HttpError(${status}, ${em[1]})`
        : `throw new HttpError(${status}, JSON.stringify(${args[0]}))`;
    } else {
      replacement = `return ${args[0]}`;
    }
    src = src.slice(0, head) + replacement + src.slice(close + 1);
  }
}

// ── 8. assemble ───────────────────────────────────────────────────────────────
const imports = [];
if (/\bHttpError\b/.test(src)) imports.push(`import { HttpError } from '../lib/http';`);
const aiImports = [...providersUsed];
if (/invokeLLM\(ctx/.test(src)) aiImports.push('invokeLLM');
if (aiImports.length) imports.push(`import { ${[...new Set(aiImports)].sort().join(', ')} } from '../lib/ai';`);
if (/putMedia\(ctx/.test(src)) imports.push(`import { putMedia } from '../lib/r2';`);
imports.push(`import type { FnHandler } from '../types';`);

const header =
  `// Ported from ${srcPath.replace(/\\/g, '/')}\n` +
  `// Generated by migration/tools/port-fn.mjs — resolve every PORT-TODO before shipping.\n` +
  `// Prompt strings are copied byte-for-byte. Prove it: tools/verify-prompts.mjs\n\n` +
  imports.join('\n') + '\n\n';

src = src.replace('__HANDLER_OPEN__', 'const handler: FnHandler = async (body, ctx) => {');
let out = (header + src.trimEnd() + '\n\nexport default handler;\n').replace(/\n{4,}/g, '\n\n\n');

const dest = path.join('workers/api/src/fn', `${fnName}.ts`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out, 'utf8');

const todoCount = (out.replace(header, '').match(/PORT-TODO/g) || []).length;
console.log(`✓ ${srcPath}  ->  ${dest}`);
console.log(`  ${out.split('\n').length} lines · ${todoCount} PORT-TODO marker(s) in file`);
if (todos.length) {
  console.log(`\n  ${todos.length} thing(s) need a human:`);
  todos.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));
}
console.log(`\n  Verify: node migration/tools/verify-prompts.mjs ${srcPath} ${dest}`);
