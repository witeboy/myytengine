import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FIX SCENE PROMPTS — Retroactively inject character identity,
// strip metadata artifacts, and enforce quality on existing prompts
// ══════════════════════════════════════════════════════════════════

function normalizeStyleKey(raw) {
  if (!raw) return 'cinematic_realistic';
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const keys = Object.keys(styleCharacterRules);
  if (keys.includes(normalized)) return normalized;
  for (const key of keys) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  if (normalized.includes('skeleton')) return 'skeleton_protagonist';
  return 'cinematic_realistic';
}

const styleCharacterRules = {
  cinematic_realistic: (desc) =>
    `photorealistic human with ${desc}, natural skin texture with visible pores, real fabric clothing with realistic wrinkles, natural hair with individual strand detail, cinematic three-point lighting on face`,
  photorealistic_4k: (desc) =>
    `DSLR-quality photorealistic person with ${desc}, razor-sharp skin detail, real fabric textures, natural hair strands, authentic micro-expressions, editorial photography lighting`,
  anime: (desc) =>
    `anime-style character with ${desc}, large expressive detailed eyes with highlight reflections, clean sharp linework, cel-shaded smooth skin, stylized colorful flowing hair, anime proportions`,
  cinematic_anime: (desc) =>
    `cinematic anime character with ${desc}, Makoto Shinkai quality rendering, sharp detailed linework with subtle cel-shading gradients, dramatic volumetric lighting on face and hair, flowing hair with light interaction`,
  cartoon_2d: (desc) =>
    `2D cartoon character with ${desc}, bold clean black outlines around entire body, flat vibrant color fills with subtle gradient shading, exaggerated friendly proportions with larger head, big expressive eyes with thick outlines`,
  picstory_cocomelon: (desc) =>
    `adorable 3D rendered character with ${desc}, soft rounded plastic-smooth features, big sparkly expressive eyes, pastel-colored clothing with smooth toy-like texture, toy-like chunky proportions, CoComelon quality`,
  cinematic_picstory: (desc) =>
    `Pixar-quality 3D animated character with ${desc}, subsurface scattering on skin giving warm translucent glow, detailed clothing with fabric physics, expressive stylized features, dramatic studio rim lighting`,
  oil_painting: (desc) =>
    `oil-painted character with ${desc}, visible impasto brushstrokes on skin in warm pigment tones, classical portrait lighting with Rembrandt chiaroscuro, soft painterly edges on hair and clothing, rich varnish glow`,
  watercolor: (desc) =>
    `watercolor-rendered character with ${desc}, soft translucent color washes for skin with paper grain showing through, delicate wet-on-wet blending on hair, gentle bleeding edges on clothing silhouette`,
  comic_book: (desc) =>
    `comic book character with ${desc}, bold black ink outlines, halftone dot shading on skin and clothing, vibrant saturated flat colors with dramatic shadow areas, dynamic foreshortened pose, Marvel/DC quality`,
  humpty_dumpty: (desc) =>
    `whimsical storybook character with ${desc}, rounded friendly soft shapes, gentle watercolor wash coloring, warm nostalgic fairy tale proportions, delicate cross-hatching, vintage children's book charm`,
  harry_potter: (desc) =>
    `fantasy character with ${desc}, warm candlelit skin tones with amber glow, weathered textured robes, magical golden particle effects, gothic atmosphere, jewel-tone color palette`,
  "3d_whiteboard_cartoon": (desc) =>
    `3D whiteboard cartoon character with ${desc}, bold consistent black ink outlines, bright cheerful flat color fills with single-tone cel-shading, friendly exaggerated proportions with larger head, thick expressive eyebrows, warm peach-brown skin tones`,
  low_poly_3d_cartoon: (desc) =>
    `low-poly 3D character with ${desc}, visible flat-shaded polygon facets, oversized geometric head, angular nose, large round expressive eyes, chunky geometric hair, warm peach-tan skin with polygon-edge shading, matte clay-toy quality`,
  skeleton_protagonist: (desc) =>
    `photorealistic transparent skeleton with clear glass-like semi-transparent humanoid body shell, glossy ivory bones visible through translucent torso, big round expressive brown amber eyeballs in skull sockets, ${desc}, full body head-to-toe, wearing context-appropriate clothing`
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, scene_ids, fix_type } = await req.json();
    // fix_type: 'all' | 'characters' | 'cleanup' | 'quality'
    // scene_ids: optional — if provided, only fix those scenes

    const [projects, allScenes] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scenes.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const visualStyle = normalizeStyleKey(project.visual_style);
    const styleTransform = styleCharacterRules[visualStyle] || ((desc) => `character with ${desc}`);

    // Build character identity tags
    let characters = [];
    try { characters = JSON.parse(project.character_descriptions || '[]'); } catch (_) {}

    const characterTags = {};
    for (const c of characters) {
      const name = (c.name || '').toLowerCase().trim();
      const rawDesc = c.visual_description || c.description || '';
      if (name && rawDesc) {
        const styled = styleTransform(rawDesc);
        characterTags[name] = styled.length > 400 ? styled.substring(0, 400).trim() : styled;
      }
    }

    // Filter scenes to fix
    let targetScenes = allScenes
      .filter(s => s.status === 'prompts_ready' || s.status === 'image_generated')
      .filter(s => s.image_prompt && !s.image_prompt.startsWith('DIRECTOR_NOTES:'))
      .sort((a, b) => a.scene_number - b.scene_number);

    if (scene_ids && scene_ids.length > 0) {
      targetScenes = targetScenes.filter(s => scene_ids.includes(s.id));
    }

    if (targetScenes.length === 0) {
      return Response.json({ success: true, fixed: 0, message: 'No scenes to fix' });
    }

    console.log(`🔧 Fixing ${targetScenes.length} scene prompts (style: ${visualStyle}, characters: ${Object.keys(characterTags).join(', ') || 'none'})`);

    const mode = fix_type || 'all';
    let fixedCount = 0;
    let characterFixes = 0;
    let cleanupFixes = 0;
    let qualityFlags = 0;

    for (const scene of targetScenes) {
      let prompt = scene.image_prompt;
      let changed = false;

      // ═══ FIX 1: CHARACTER IDENTITY INJECTION ═══
      if (mode === 'all' || mode === 'characters') {
        const sceneCast = [];
        for (const [charName, charDesc] of Object.entries(characterTags)) {
          const namePattern = new RegExp(`\\b${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          if (namePattern.test(prompt)) {
            sceneCast.push({ name: charName, desc: charDesc });
          }
        }

        // Check for generic references
        const genericRefs = /\b(the protagonist|the main character|the character|the figure|the hero|the narrator)\b/gi;
        if (genericRefs.test(prompt) && characters.length > 0) {
          const primaryName = (characters[0].name || '').toLowerCase().trim();
          if (primaryName && !sceneCast.find(c => c.name === primaryName)) {
            sceneCast.unshift({ name: primaryName, desc: characterTags[primaryName] || '' });
          }
        }

        if (sceneCast.length > 0) {
          const totalBudget = 500;
          const perChar = Math.floor(totalBudget / sceneCast.length);

          for (const c of sceneCast) {
            let desc = c.desc || '';
            if (desc.length > perChar) {
              const lastComma = desc.lastIndexOf(',', perChar);
              desc = lastComma > perChar * 0.5 ? desc.substring(0, lastComma).trim() : desc.substring(0, perChar).trim();
            }

            if (!desc) continue;
            const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Skip if LLM already gave decent description
            const descCheck = new RegExp(`\\b${escapedName}\\b[,\\s]+[^.]{40,}`, 'gi');
            if (descCheck.test(prompt)) continue;

            // Strip short parentheticals
            const nameWithParens = new RegExp(`\\b${escapedName}\\b\\s*\\([^)]{5,}\\)`, 'gi');
            prompt = prompt.replace(nameWithParens, c.name);

            // Inline at first occurrence
            const firstOccurrence = new RegExp(`\\b${escapedName}\\b`, 'i');
            const match = prompt.match(firstOccurrence);
            if (match) {
              const idx = prompt.indexOf(match[0]);
              prompt = `${prompt.substring(0, idx)}a ${desc}${prompt.substring(idx + match[0].length)}`;
              changed = true;
              characterFixes++;
            }
          }

          // Replace generic references with primary character
          if (characters.length > 0) {
            const primaryName = (characters[0].name || '').toLowerCase().trim();
            const primaryDesc = characterTags[primaryName];
            if (primaryDesc) {
              const newPrompt = prompt.replace(genericRefs, `a ${primaryDesc.split(',').slice(0, 4).join(',')}`);
              if (newPrompt !== prompt) { prompt = newPrompt; changed = true; characterFixes++; }
            }
          }
        }
      }

      // ═══ FIX 2: METADATA CLEANUP ═══
      if (mode === 'all' || mode === 'cleanup') {
        const beforeClean = prompt;

        // Strip orientation text Grok renders as visible text
        prompt = prompt
          .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
          .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '')
          .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '')
          .replace(/\bwidescreen\b/gi, '')
          .replace(/\bvertical\s+\d+:\d+\b/gi, '')
          .replace(/\bhorizontal\s+\d+:\d+\b/gi, '');

        // Strip anti-text instruction (Grok renders it)
        prompt = prompt
          .replace(/,?\s*ABSOLUTELY\s+NO\s+text[\s\S]{0,120}?(in the image|of any kind)[.\s]*/gi, '')
          .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '')
          .replace(/,?\s*FORBIDDEN:?\s*text[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '');

        // Strip resolution numbers
        prompt = prompt
          .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
          .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

        // Clean artifacts
        prompt = prompt
          .replace(/,\s*,/g, ',')
          .replace(/\.\s*\./g, '.')
          .replace(/,\s*\./g, '.')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[\s,.]+/, '')
          .trim();

        if (prompt !== beforeClean) { changed = true; cleanupFixes++; }
      }

      // ═══ FIX 3: QUALITY FLAG ═══
      if (mode === 'all' || mode === 'quality') {
        const wordCount = prompt.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount < 30) {
          qualityFlags++;
          // Mark scene for regeneration by resetting status
          // The normal prompt generation loop will pick it up
          try {
            await base44.asServiceRole.entities.Scenes.update(scene.id, {
              status: 'breakdown_ready'
            });
            console.log(`⚠️ Scene ${scene.scene_number}: ${wordCount} words — reset to breakdown_ready for regeneration`);
            fixedCount++;
            continue; // Skip normal save — status changed
          } catch (_) {}
        }
      }

      // Save if changed
      if (changed) {
        // Cap at 900 chars
        if (prompt.length > 900) {
          prompt = prompt.substring(0, 897) + '...';
        }

        try {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_prompt: prompt
          });
          fixedCount++;
          console.log(`✓ Scene ${scene.scene_number} fixed`);
        } catch (err) {
          console.error(`Failed to fix scene ${scene.scene_number}: ${err.message}`);
        }
      }
    }

    console.log(`🔧 Fix complete: ${fixedCount}/${targetScenes.length} scenes updated`);
    console.log(`   Character injections: ${characterFixes}`);
    console.log(`   Metadata cleanups: ${cleanupFixes}`);
    console.log(`   Quality resets: ${qualityFlags}`);

    return Response.json({
      success: true,
      fixed: fixedCount,
      total: targetScenes.length,
      character_fixes: characterFixes,
      cleanup_fixes: cleanupFixes,
      quality_resets: qualityFlags
    });

  } catch (error) {
    console.error('fixScenePrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
