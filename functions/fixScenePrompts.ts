import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// FIX SCENE PROMPTS — Post-generation sanitizer
// ══════════════════════════════════════════════════════════════════
// Applies all prompt cleanup fixes to ALREADY GENERATED prompts:
// - Rebuilds character identity tags with the fixed splitIdentity
// - Strips garbled text, orphaned quotes, key-value dumps
// - Cleans screen/UI content, dollar amounts, resolution metadata
// - Re-injects correct tier-appropriate character descriptions
// - Strips duplicate identity injections
// Does NOT regenerate prompts from scratch — preserves existing content.
// ══════════════════════════════════════════════════════════════════

// ── Fixed splitIdentity (matches the one in generateScenePrompts) ──
function splitIdentity(rawDesc) {
  const ageMatch = rawDesc.match(/\b(\d{1,2})\s*[-–]?\s*(?:years?\s*old|year[\s-]old)\b/i)
    || rawDesc.match(/^(\d{1,2})\s*,/);
  const age = ageMatch ? ageMatch[1] : null;
  const genderMatch = rawDesc.match(/\b(female|male|woman|man)\b/i);
  const gender = genderMatch ? genderMatch[1].toLowerCase() : null;
  const buildMatch = rawDesc.match(/\b(average|athletic|slim|slender|heavy|lean|stocky|muscular|medium|thin|stout|petite|lanky|heavyset|curvy|hourglass|broad[\s-]shouldered)\s*(build)?\b/i);
  const build = buildMatch ? buildMatch[0].trim() : null;
  const heightMatch = rawDesc.match(/\b(\d+\s*['′]\s*\d+\s*["″]?|\d+\s*ft\s*\d+|\d+\s*cm)\b/i);
  const height = heightMatch ? heightMatch[0].trim() : null;

  const bodyParts = [];
  if (age) bodyParts.push(`${age}-year-old`);
  if (gender) bodyParts.push(gender);
  if (build) bodyParts.push(build);
  if (height) bodyParts.push(height);
  const bodyStr = bodyParts.join(', ');

  let faceDesc = rawDesc;
  if (ageMatch) faceDesc = faceDesc.replace(ageMatch[0], '');
  if (genderMatch) faceDesc = faceDesc.replace(genderMatch[0], '');
  if (buildMatch) faceDesc = faceDesc.replace(buildMatch[0], '');
  if (heightMatch) faceDesc = faceDesc.replace(heightMatch[0], '');

  faceDesc = faceDesc
    .replace(/[""'']+\s*/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { body: bodyStr, face: faceDesc };
}

// ── Style character rules (same as generateScenePrompts) ──
const styleCharacterRules = {
  cinematic_realistic: (b, f) => `photorealistic ${b}, ${f}, natural skin texture, cinematic lighting`,
  photorealistic_4k: (b, f) => `DSLR-quality photorealistic ${b}, ${f}, razor-sharp detail, editorial photography`,
  anime: (b, f) => `anime-style ${b}, ${f}, large expressive eyes with highlight reflections, clean linework, cel-shaded`,
  cinematic_anime: (b, f) => `cinematic anime ${b}, ${f}, Makoto Shinkai quality, dramatic volumetric lighting, flowing hair`,
  cartoon_2d: (b, f) => `2D cartoon ${b} with bold outlines, ${f}, flat vibrant colors, dynamic pose, normal proportions`,
  picstory_cocomelon: (b, f) => `3D rendered ${b}, ${f}, soft rounded plastic-smooth features, pastel colors, Pixar Junior quality`,
  cinematic_picstory: (b, f) => `Pixar-quality 3D animated ${b}, ${f}, subsurface scattering on skin, expressive features, dramatic studio rim lighting`,
  oil_painting: (b, f) => `oil-painted ${b}, ${f}, visible impasto brushstrokes, Rembrandt chiaroscuro lighting`,
  watercolor: (b, f) => `watercolor-rendered ${b}, ${f}, soft translucent washes, paper grain showing through`,
  comic_book: (b, f) => `comic book ${b}, ${f}, bold black ink outlines, halftone shading, Marvel/DC quality`,
  humpty_dumpty: (b, f) => `storybook ${b}, ${f}, rounded friendly shapes, gentle watercolor washes, fairy tale warmth`,
  harry_potter: (b, f) => `fantasy ${b}, ${f}, warm candlelit tones, magical golden particles, gothic atmosphere`,
  "3d_whiteboard_cartoon": (b, f) => `3D whiteboard cartoon ${b} with bold outlines, ${f}, flat color fills, normal proportions, warm peach-brown skin`,
  low_poly_3d_cartoon: (b, f) => `low-poly 3D ${b} from flat-shaded polygons, ${f}, angular geometric features, matte clay-toy quality`,
  roblox: (b, f) => `Roblox-style 3D blocky ${b} with cube head, rectangular torso and limbs, simple 2D cartoon face (two round eyes, curved mouth) painted on the cube head, ${f}, bright flat-shaded colors, toy-like plastic matte finish, R15 avatar proportions`,
  skeleton_protagonist: () => `photorealistic transparent skeleton with clear glass-like body shell, glossy ivory bones visible through translucent torso, big round expressive brown amber eyeballs in skull sockets`
};
const defaultStyleTransform = (b, f) => `${b}, ${f}`;

function normalizeStyleKey(raw) {
  if (!raw) return 'cinematic_realistic';
  const n = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const keys = Object.keys(styleCharacterRules);
  if (keys.includes(n)) return n;
  for (const k of keys) { if (n.includes(k) || k.includes(n)) return k; }
  if (n.includes('roblox')) return 'roblox';
  if (n.includes('skeleton')) return 'skeleton_protagonist';
  return 'cinematic_realistic';
}

function getIdentityTier(shotType) {
  if (!shotType) return 'moderate';
  const st = shotType.toLowerCase();
  if (/\b(ecu|extreme\s*close|mcu|medium\s*close|cu\b|close[\s-]*up|insert|detail|pov)\b/.test(st)) return 'full';
  if (/\b(ews|extreme\s*wide|ws\b|wide\s*shot|mws|medium\s*wide|high\s*angle|overhead|god.?s?\s*eye|establishing|aerial|drone|bird.?s?\s*eye)\b/.test(st)) return 'minimal';
  return 'moderate';
}

// ── Detect shot type from existing prompt text ──
function detectShotType(prompt) {
  const p = prompt.substring(0, 300).toLowerCase();
  if (/\b(extreme\s*close[\s-]*up|ecu)\b/.test(p)) return 'ECU';
  if (/\b(medium\s*close[\s-]*up|mcu)\b/.test(p)) return 'MCU';
  if (/\b(close[\s-]*up|cu\b)\b/.test(p)) return 'CU';
  if (/\b(extreme\s*wide|ews|establishing)\b/.test(p)) return 'EWS';
  if (/\b(wide\s*shot|full\s*body\s*wide)\b/.test(p)) return 'WS';
  if (/\b(medium\s*wide|mws)\b/.test(p)) return 'MWS';
  if (/\b(medium\s*shot|from\s*waist\s*up)\b/.test(p)) return 'MS';
  if (/\b(low\s*angle)\b/.test(p)) return 'LOW ANGLE';
  if (/\b(over[\s-]*the[\s-]*shoulder|ots)\b/.test(p)) return 'OTS';
  return 'MS';
}

// ── Clean identity description from junk ──
function cleanIdentityDesc(raw) {
  return raw
    .replace(/^Casting[- ]sheet:?\s*/i, '')
    .replace(/^IMMUTABLE[^:]*:\s*/i, '')
    .replace(/^Identity[^:]*:\s*/i, '')
    .replace(/\bCasting[- ]sheet:?\s*/gi, '')
    .replace(/\bshown full (?:body|figure)\b/gi, '')
    .replace(/\bshown full body in the scene\b/gi, '')
    .replace(/\bgender[\s:]*neutral\b/gi, 'female')
    .replace(/\bgender[\s:]*any\b/gi, 'female')
    .replace(/\bnon[\s-]?binary\b/gi, 'female')
    .replace(/\bAge[\s:]+/gi, '')
    .replace(/\bGender[\s:]+/gi, '')
    .replace(/\bSkin tone[\s:]*(shade[\s:]*)?/gi, '')
    .replace(/\bFace shape[\s:]+/gi, '')
    .replace(/\bEye color\+?shape[\s:]+/gi, '')
    .replace(/\bNose[\s:]+/gi, '')
    .replace(/\bLips[\s:]+/gi, '')
    .replace(/\bHair[\s:]*\([^)]*\)[\s:]+/gi, '')
    .replace(/\bHair[\s:]+/gi, '')
    .replace(/\bBuild\+?height[\s:]+/gi, '')
    .replace(/\bDistinguishing marks[\s:]+/gi, '')
    .replace(/\bBuild[\s:]+/gi, '')
    .replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Subject-type sanity check (Prompt Engine Rulebook) ──
function subjectTypeSanityCheck(prompt) {
  const head = prompt.substring(0, 250).toLowerCase();
  const humanIndicators = /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|teacher|scientist|protagonist|narrator|skeleton|individual|people|crowd|group|couple|family|mother|father|husband|wife)\b/;
  if (humanIndicators.test(head)) return { prompt, stripped: false };

  const humanOnlyTerms = [
    /\b(visible\s+)?skin\s+texture(\s+and\s+pores)?\b/gi,
    /\b(visible\s+)?pores\b/gi,
    /\bwrinkles?\s*(around\s+(his|her|their)\s+eyes)?\b/gi,
    /\bfacial\s+expression\b/gi,
    /\bsubtle\s+facial\s+expression\b/gi,
    /\bnatural\s+skin\s+texture\b/gi,
    /\bsoft\s+eye\s+reflections\b/gi,
    /\bfine\s+wrinkles\b/gi,
    /\bshows?\s+(?:slight\s+)?wrinkles\b/gi,
    /\b(his|her|their)\s+(eyes|face|smile|expression|skin|hands|body|hair)\b/gi,
    /\bconfident\s+smile\b/gi,
  ];

  let cleaned = prompt;
  let stripped = false;
  for (const pattern of humanOnlyTerms) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before) stripped = true;
  }
  if (stripped) {
    cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  }
  return { prompt: cleaned, stripped };
}

// ── Sanitize a single prompt (the core fix) ──
function sanitizePrompt(prompt, characterTieredTags, characters, visualStyle, shotTypeHint) {
  let p = prompt;
  if (!p || p.startsWith('DIRECTOR_NOTES:')) return { prompt: p, changed: false, fixes: [] };

  const fixes = [];
  const original = p;

  // ═══ 0. Subject-type sanity check (Prompt Engine Rulebook) ═══
  const sanity = subjectTypeSanityCheck(p);
  if (sanity.stripped) {
    p = sanity.prompt;
    fixes.push('subject_type_sanity_strip');
  }

  // Determine shot type from director notes hint or prompt content
  const shotType = shotTypeHint || detectShotType(p);
  const tier = getIdentityTier(shotType);

  // ═══ 1. Strip garbled identity dumps (the main bug) ═══
  // Pattern: "male, 35, short, average build, 5'10, '', light , oval face shape..."
  // These are raw identity_core fragments that got spliced in without cleanup
  p = p.replace(/\b(male|female),\s*\d{1,2},\s*[^.]{10,80}(?:oval|round|square|heart)\s*face\s*shape[^.]*\./gi, (match) => {
    fixes.push('stripped_garbled_identity');
    return '';
  });

  // ═══ 1b. Strip verbatim identity_core dumps that cause floating heads ═══
  // Pattern: "The 55 year old male with light-medium skin, oval face shape, hazel eyes..."
  // These appear when the LLM copies the raw character block instead of weaving traits into the scene
  const beforeIdentityDump = p;
  p = p.replace(
    /\b(?:The|A|An)\s+\d{1,2}\s*[-–]?\s*year[\s-]*old\s+(?:male|female|man|woman)\s+with\s+[^.]{30,}?(?=\b(?:is|was|sits|stands|walks|looks|leans|holds|stares|shows|implied|clutch|grip|sitting|standing|walking|holding|staring|leaning)\b)/gi,
    ''
  );
  // Also catch: "a 55-year-old male with light-medium skin... confident smile" (no verb follows, just ends with period)
  p = p.replace(
    /\b(?:The|A|An)\s+\d{1,2}\s*[-–]?\s*year[\s-]*old\s+(?:male|female|man|woman)\s+with\s+[^.]{50,300}\./gi,
    (match) => {
      // Only strip if it looks like an isolated identity dump (many commas = catalog of traits)
      const commaCount = (match.match(/,/g) || []).length;
      if (commaCount >= 4) return '';
      return match; // Keep if it's a short natural sentence
    }
  );
  if (p !== beforeIdentityDump) fixes.push('stripped_verbatim_identity_dump');

  // ═══ 2. Strip orphaned quotes and empty strings from height like 5'10" ═══
  p = p.replace(/['']\s*,\s*['']/g, ',');
  p = p.replace(/,\s*['']+\s*,/g, ',');
  p = p.replace(/[""]\s*,/g, ',');

  // ═══ 3. Strip "shown full body/figure" rendering instructions ═══
  const beforeShownFull = p;
  p = p
    .replace(/\bshown full (?:body|figure)\s*(?:in the scene)?\b/gi, '')
    .replace(/\bshown full body in the scene\b/gi, '');
  if (p !== beforeShownFull) fixes.push('stripped_shown_full_body');

  // ═══ 4. Strip screen/UI/document content descriptions ═══
  const beforeScreen = p;
  p = p
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'phone screen glowing with soft blue-white light,')
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'laptop screen casting cool light,')
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi, 'screen glowing softly,')
    .replace(/\b(receipt|bill|invoice|statement|contract|form|report|notice|certificate|ticket|prescription|memo|letter|document)\s+(showing|displaying|that\s+reads|that\s+says|reading|with\s+the\s+text|with\s+text|with\s+the\s+words|stamped\s+with|marked\s+with|printed\s+with)\s+[^,.]{3,100}[.,]/gi, '$1 clutched tightly,')
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '');
  if (p !== beforeScreen) fixes.push('stripped_screen_content');

  // ═══ 5. Strip dollar amounts, percentages, resolution metadata ═══
  const beforeNumbers = p;
  p = p
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '')
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');
  if (p !== beforeNumbers) fixes.push('stripped_numbers_metadata');

  // ═══ 6. Strip anti-text instructions (Grok renders them AS text) ═══
  const beforeAntiText = p;
  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[\s\S]{0,120}?(in the image|of any kind)[.\s]*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '');
  if (p !== beforeAntiText) fixes.push('stripped_anti_text');

  // ═══ 7. Fix "depth of field with ," left after bokeh removal ═══
  p = p.replace(/\bdepth of field with\s*,/gi, 'cinematic depth of field,');

  // ═══ 8. Strip markdown artifacts ═══
  p = p.replace(/\*\*[^*]+\*\*/g, (m) => m.replace(/\*\*/g, '')).replace(/\*/g, '').replace(/#{1,3}\s*/g, '');

  // ═══ 9. Dedup repeated sentences ═══
  const sentences = p.split(/(?<=\.)\s+/).filter(s => s.length > 0);
  if (sentences.length > 3) {
    const kept = [];
    const seenNorm = [];
    for (const sentence of sentences) {
      const words = sentence.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      let isDupe = false;
      for (const prev of seenNorm) {
        if (prev.length < 5 || words.length < 5) continue;
        const overlap = words.filter(w => prev.includes(w)).length;
        if (overlap / Math.min(words.length, prev.length) >= 0.7 && overlap >= 5) { isDupe = true; break; }
      }
      if (!isDupe) { kept.push(sentence); seenNorm.push(words); }
    }
    if (kept.length < sentences.length) {
      p = kept.join(' ').trim();
      fixes.push(`dedup_${sentences.length - kept.length}_sentences`);
    }
  }

  // ═══ 10. Clean up punctuation artifacts ═══
  p = p.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

  // ═══ 11. Re-inject clean character identity if needed ═══
  // Only if character names appear in the prompt but no clean identity tag is present
  if (Object.keys(characterTieredTags).length > 0) {
    for (const [charName, tiers] of Object.entries(characterTieredTags)) {
      const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
      if (!nameRegex.test(p)) continue;

      const desc = tiers[tier] || tiers.moderate;
      if (!desc) continue;

      // Check if the prompt already contains a clean identity description
      // (look for the style prefix like "Pixar-quality 3D animated" near the character name)
      const descPrefix = desc.substring(0, 30).toLowerCase();
      if (p.toLowerCase().includes(descPrefix)) continue; // Already has clean identity

      // Strip any existing garbled descriptions near the name
      p = p.replace(new RegExp(`\\b${escapedName}\\b\\s*\\([^)]{5,}\\)`, 'gi'), charName);
      p = p.replace(new RegExp(`\\b${escapedName}\\b,\\s*(?:a\\s)?\\d{1,2}[^.]*?(?=\\b(?:stands|sits|walks|is|was|holds|stares|looks|leans|clutch|grip|reach|kneel|crouch|watch|gaze|turn|step|press|scroll|tap|carry)\\b)`, 'gi'), `${charName} `);
      p = p.replace(new RegExp(`\\b${escapedName}(?:\\/[\\w\\s]+)?\\s+has\\s+[^.]{20,}?\\.`, 'gi'), '');
      p = p.replace(new RegExp(`\\b${escapedName}\\s+is\\s+a\\s+\\d{1,2}[^.]{15,}?\\.`, 'gi'), '');
      p = p.replace(new RegExp(`\\b${escapedName}\\b,\\s*age\\s+\\d{1,2}[^.]{10,}?\\.`, 'gi'), `${charName}.`);
      p = p.replace(new RegExp(`\\b${escapedName}\\/[\\w\\s]{3,30}\\b`, 'gi'), charName);

      // Strip second occurrence of name
      let count = 0;
      p = p.replace(new RegExp(`\\b${escapedName}\\b`, 'gi'), (m) => { count++; return count <= 1 ? m : ''; });
      p = p.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ');

      // Inject clean identity at first name occurrence
      // CRITICAL: Always SUBSTITUTE the name with the identity description.
      // Never use appositive pattern ("Name, HUGE BLOB, verb") — it causes
      // image gen to render a portrait/floating head instead of a scene.
      const firstOcc = p.match(new RegExp(`\\b${escapedName}\\b`, 'i'));
      if (firstOcc) {
        const idx = p.indexOf(firstOcc[0]);
        const before = p.substring(0, idx);
        const after = p.substring(idx + firstOcc[0].length);
        const afterTrimmed = after.trimStart();
        const isPossessive = /^'s\b/.test(afterTrimmed);
        if (isPossessive) {
          p = `${before}${desc}, whose${after.substring(after.indexOf("'s") + 2)}`;
        } else {
          // Always substitute — the desc is a natural noun phrase that reads as a subject
          p = `${before}${desc}${after}`;
        }
        fixes.push(`injected_${tier}_identity_${charName}`);
      }
    }
  }

  // ═══ 12. Gender sanitization ═══
  if (characters.length > 0) {
    const pc = characters[0];
    const pcId = (pc.identity_core || pc.visual_description || pc.description || '').toLowerCase();
    const isMale = /\b(male|man|boy|he|his|father|husband|grandfather|son|brother)\b/.test(pcId);
    const gn = isMale ? 'man' : 'woman';
    const ga = isMale ? 'male' : 'female';
    p = p
      .replace(/\bany gender\b/gi, ga)
      .replace(/\b(an?\s+)?individual\b/gi, `a ${gn}`)
      .replace(/\bperson of any gender\b/gi, gn)
      .replace(/\bgender[- ]neutral\b/gi, ga);
  }

  const changed = p !== original;
  return { prompt: p, changed, fixes };
}


// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
// Accepts:
//   { project_id, fix_type: "all"|"characters"|"cleanup"|"quality" }
//   { project_id, scene_id }  ← single scene mode
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, scene_id, fix_type = 'all' } = body;

    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // ── Load project + characters ──
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const visualStyle = normalizeStyleKey(project.visual_style);
    const styleTransform = styleCharacterRules[visualStyle] || defaultStyleTransform;

    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }

    // ── Build character identity tiers with FIXED splitIdentity ──
    const characterTieredTags = {};
    for (const c of characters) {
      const name = (c.name || '').toLowerCase().trim();
      let identityDesc = cleanIdentityDesc(c.identity_core || c.visual_description || c.description || '');
      const clothing = c.default_clothing || '';
      if (!name || !identityDesc) continue;

      const { body: bodyStr, face } = splitIdentity(identityDesc);
      const bodyDesc = bodyStr || 'adult character';

      const hairMatch = face.match(/\b([\w-]+\s+)?(hair|bob|ponytail|bun|braids?|curls?|locs|afro)\b[^,]*/i);
      const hairShort = hairMatch ? hairMatch[0].trim() : '';

      const minimalDesc = `a ${bodyDesc}${hairShort ? ', ' + hairShort : ''}${clothing ? ', wearing ' + clothing.substring(0, 60) : ''}`;

      let compactFaceMod = face;
      if (compactFaceMod.length > 100) {
        const cut = compactFaceMod.lastIndexOf(',', 100);
        compactFaceMod = cut > 50 ? compactFaceMod.substring(0, cut).trim() : compactFaceMod.substring(0, 100).trim();
      }
      const moderateDesc = styleTransform(bodyDesc, compactFaceMod);

      let compactFaceFull = face;
      if (compactFaceFull.length > 200) {
        const cut = compactFaceFull.lastIndexOf(',', 200);
        compactFaceFull = cut > 100 ? compactFaceFull.substring(0, cut).trim() : compactFaceFull.substring(0, 200).trim();
      }
      const fullDesc = styleTransform(bodyDesc, compactFaceFull);

      const charId = identityDesc.toLowerCase();
      const hasM = /\b(male|man|boy|father|husband|grandfather|son|brother)\b/.test(charId);
      const hasF = /\b(female|woman|girl|mother|wife|grandmother|daughter|sister|she|her)\b/.test(charId);
      const isMale = hasM && !hasF;
      const gn = isMale ? 'man' : 'woman';
      const ga = isMale ? 'male' : 'female';

      const sanitize = (d) => d
        .replace(/\bany gender\b/gi, ga)
        .replace(/\bindividual\b/gi, gn)
        .replace(/\bperson of any gender\b/gi, gn)
        .replace(/\bgender[- ]neutral\b/gi, ga)
        .replace(/\ba person\b/gi, `a ${gn}`)
        .replace(/\bthe person\b/gi, `the ${gn}`)
        .replace(/\ban adult\b/gi, `a ${gn}`);

      characterTieredTags[name] = {
        minimal: sanitize(minimalDesc.substring(0, 150)),
        moderate: sanitize(moderateDesc.substring(0, 300)),
        full: sanitize(fullDesc.substring(0, 500))
      };

      console.log(`👤 ${name}: body="${bodyStr}" | minimal=${characterTieredTags[name].minimal.length}ch | mod=${characterTieredTags[name].moderate.length}ch | full=${characterTieredTags[name].full.length}ch`);
    }

    // ── Load scenes ──
    let scenesToFix;
    if (scene_id) {
      scenesToFix = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    } else {
      const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      scenesToFix = allScenes.filter(s =>
        s.image_prompt && !s.image_prompt.startsWith('DIRECTOR_NOTES:') &&
        (s.status === 'prompts_ready' || s.status === 'image_generated' || s.status === 'video_generated' || s.status === 'video_ready')
      ).sort((a, b) => a.scene_number - b.scene_number);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔧 FIX PROMPTS — ${scenesToFix.length} scenes | fix_type="${fix_type}" | style="${visualStyle}"`);
    console.log(`👤 Characters: ${Object.keys(characterTieredTags).join(', ') || 'none'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let fixed = 0;
    let characterFixes = 0;
    let cleanupFixes = 0;
    let qualityResets = 0;

    for (const scene of scenesToFix) {
      const shotTypeHint = null; // Could extract from DIRECTOR_NOTES if stored elsewhere
      const result = sanitizePrompt(scene.image_prompt, characterTieredTags, characters, visualStyle, shotTypeHint);

      // Quality check — flag thin prompts for regen
      const wordCount = result.prompt.split(/\s+/).filter(w => w.length > 0).length;
      let shouldReset = false;
      if (fix_type === 'quality' || fix_type === 'all') {
        if (wordCount < 25) {
          shouldReset = true;
          qualityResets++;
        }
      }

      if (result.changed || shouldReset) {
        const update = {};

        if (result.changed && (fix_type === 'all' || fix_type === 'characters' || fix_type === 'cleanup')) {
          update.image_prompt = result.prompt;
        }

        if (shouldReset) {
          update.status = 'breakdown_ready'; // Will be re-generated on next prompt pass
        }

        if (Object.keys(update).length > 0) {
          await base44.asServiceRole.entities.Scenes.update(scene.id, update);
          fixed++;

          if (result.fixes.some(f => f.includes('identity'))) characterFixes++;
          if (result.fixes.some(f => f.includes('stripped') || f.includes('dedup'))) cleanupFixes++;

          if (result.fixes.length > 0) {
            console.log(`✓ Scene ${scene.scene_number}: ${result.fixes.join(', ')} (${wordCount} words)`);
          }
        }
      }
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 FIX COMPLETE — ${fixed}/${scenesToFix.length} scenes updated`);
    console.log(`👤 ${characterFixes} char fixes | 🧹 ${cleanupFixes} cleanups | ⚠️ ${qualityResets} quality resets`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      fixed,
      total: scenesToFix.length,
      character_fixes: characterFixes,
      cleanup_fixes: cleanupFixes,
      quality_resets: qualityResets,
    });

  } catch (error) {
    console.error("❌ fixScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});