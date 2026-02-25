import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });
  const result = await res.json();
  if (!res.ok || result.code !== 200) {
    throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const poll = await res.json();
    if (poll.code !== 200) continue;
    const state = poll.data?.state;
    if (state === "success") {
      const rj = JSON.parse(poll.data.resultJson || "{}");
      return rj.resultUrls?.[0] || rj.url || rj.imageUrl || null;
    }
    if (state === "fail") throw new Error(poll.data?.failMsg || "Task failed");
  }
  throw new Error(`Task ${taskId} timed out`);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { prompt, project_id } = await req.json();
    if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // === TEXT OVERLAY ENFORCEMENT ===
    // Ideogram V3 only renders text that appears inside "QUOTATION MARKS" in the prompt.
    // Extract text elements and ensure they are properly quoted at the END of the prompt
    // so they get maximum rendering priority.
    let processedPrompt = prompt;

    // Find text patterns like: text "SOMETHING" or containing white text 'SOMETHING'
    // Also find unquoted text after keywords like "the text", "text overlay", "bold text"
    const textPatterns = [];
    
    // Extract all quoted strings (both single and double quotes)
    const doubleQuoted = processedPrompt.match(/"([^"]{1,50})"/g) || [];
    const singleQuoted = processedPrompt.match(/'([^']{1,50})'/g) || [];
    
    // Normalize single quotes to double quotes for Ideogram
    for (const sq of singleQuoted) {
      const inner = sq.slice(1, -1);
      processedPrompt = processedPrompt.replace(sq, `"${inner}"`);
      textPatterns.push(inner);
    }
    for (const dq of doubleQuoted) {
      textPatterns.push(dq.slice(1, -1));
    }

    // === PHOTOREALISM ENFORCEMENT ===
    // If the prompt describes real people, ensure photorealism keywords are present
    const photorealismKeywords = ['real human', 'photorealistic photograph', 'DSLR', 'real photograph of'];
    const hasPhotorealCues = /\b(person|man|woman|guy|girl|face|skin tone|expression|beard|hair)\b/i.test(processedPrompt);
    const alreadyPhotorealistic = photorealismKeywords.some(kw => processedPrompt.toLowerCase().includes(kw.toLowerCase()));
    
    if (hasPhotorealCues && !alreadyPhotorealistic) {
      // Insert photorealism enforcement after the opening line
      const insertAfter = 'graphic design composition.';
      if (processedPrompt.includes(insertAfter)) {
        processedPrompt = processedPrompt.replace(
          insertAfter,
          insertAfter + ' Photorealistic photograph, DSLR camera shot, real human skin with visible pores and texture, professional portrait photography, NOT illustration, NOT cartoon, NOT 3D render, NOT anime.'
        );
      } else {
        // Prepend if no standard opening found
        processedPrompt = 'Photorealistic photograph, DSLR camera shot, real human skin with visible pores and texture, professional portrait photography, NOT illustration, NOT cartoon, NOT 3D render, NOT anime. ' + processedPrompt;
      }
      console.log('[PhotorealEnforce] Added photorealism keywords to prompt');
    }

    // Add a TEXT RENDERING BLOCK at the end to reinforce text generation
    if (textPatterns.length > 0) {
      const uniqueTexts = [...new Set(textPatterns)].filter(t => t.length > 1 && t.length <= 40);
      if (uniqueTexts.length > 0) {
        const textBlock = uniqueTexts.map(t => `"${t}"`).join(', ');
        processedPrompt += `. CRITICAL TEXT OVERLAYS that MUST appear clearly and legibly on the thumbnail: ${textBlock}. Each text element must be rendered in large, bold, highly visible font with sharp edges and high contrast against its background.`;
        console.log(`[TextEnforce] Reinforced ${uniqueTexts.length} text elements: ${textBlock}`);
      }
    }

    // Attempt 1: Ideogram V3 QUALITY
    let imageUrl = null;
    let model = 'none';

    try {
      console.log('[Ideogram V3] Generating tweaked thumbnail...');
      const enhancedPrompt = `${processedPrompt}. Ultra high resolution 1920x1080 Full HD, crisp sharp details, professional quality.`;
      const taskId = await kieCreateTask(KIE_API_KEY, "ideogram/v3-text-to-image", {
        prompt: enhancedPrompt,
        image_size: "landscape_16_9",
        style: "DESIGN",
        rendering_speed: "QUALITY",
        expand_prompt: false,
        negative_prompt: "blurry, low quality, pixelated, watermark, distorted text, misspelled text, illegible text, small text, jpeg artifacts, low resolution, compressed"
      });
      imageUrl = await kiePollResult(KIE_API_KEY, taskId);
      model = "ideogram/v3-generate";
    } catch (e) {
      console.warn(`Ideogram V3 failed: ${e.message}`);
    }

    // Attempt 2: Ideogram V3 BALANCED (shorter prompt)
    if (!imageUrl) {
      try {
        console.log('[Ideogram V3 Balanced] Fallback...');
        const taskId = await kieCreateTask(KIE_API_KEY, "ideogram/v3-text-to-image", {
          prompt: `${processedPrompt.substring(0, 1200)}. 1920x1080 Full HD, professional YouTube thumbnail.`,
          image_size: "landscape_16_9",
          style: "DESIGN",
          rendering_speed: "BALANCED",
          expand_prompt: false,
          negative_prompt: "blurry, low quality, pixelated, watermark"
        });
        imageUrl = await kiePollResult(KIE_API_KEY, taskId);
        model = "ideogram/v3-generate (balanced)";
      } catch (e) {
        console.warn(`Ideogram balanced failed: ${e.message}`);
      }
    }

    // Attempt 3: Flux 2 Pro
    if (!imageUrl) {
      try {
        console.log('[Flux 2 Pro] Fallback...');
        const taskId = await kieCreateTask(KIE_API_KEY, "flux-2/pro-text-to-image", {
          prompt: `${processedPrompt}. Ultra high resolution 1920x1080 Full HD.`,
          aspect_ratio: "16:9",
          resolution: "2K"
        });
        imageUrl = await kiePollResult(KIE_API_KEY, taskId);
        model = "flux-2/pro-text-to-image";
      } catch (e) {
        console.warn(`Flux 2 failed: ${e.message}`);
      }
    }

    if (!imageUrl) {
      return Response.json({ error: 'All image generation attempts failed' }, { status: 500 });
    }

    console.log(`[TweakedThumb] Generated via ${model}`);
    console.log(`[TweakedThumb] URL: ${imageUrl.substring(0, 80)}...`);
    return Response.json({ success: true, image_url: imageUrl, model });

  } catch (error) {
    console.error('generateTweakedThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});