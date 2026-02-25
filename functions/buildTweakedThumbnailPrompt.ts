import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { original_analysis, tweaks, thumbnail_url } = await req.json();
    if (!original_analysis || !tweaks) {
      return Response.json({ error: 'Missing original_analysis or tweaks' }, { status: 400 });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    // Build a structured tweak summary
    const textChanges = tweaks.textChanges || [];
    const textSection = textChanges.map((t, i) => {
      const parts = [];
      if (t.original && t.newText && t.original !== t.newText) {
        parts.push(`Change text "${t.original}" to "${t.newText}"`);
      } else if (t.newText) {
        parts.push(`Text: "${t.newText}"`);
      }
      if (t.color) parts.push(`Color: ${t.color}`);
      if (t.position) parts.push(`Position: ${t.position}`);
      if (t.font) parts.push(`Font: ${t.font}`);
      if (t.outline) parts.push(`Outline: ${t.outline}`);
      return parts.length > 0 ? `Text Element ${i + 1}: ${parts.join(' | ')}` : null;
    }).filter(Boolean).join('\n');

    const colorSection = [
      tweaks.colorChanges?.background ? `Background mood/colors: ${tweaks.colorChanges.background}` : null,
      tweaks.colorChanges?.accentColor ? `Accent color: ${tweaks.colorChanges.accentColor}` : null,
      tweaks.colorChanges?.atmosphere ? `Atmosphere: ${tweaks.colorChanges.atmosphere}` : null,
      tweaks.colorChanges?.colorGrading ? `Color grading: ${tweaks.colorChanges.colorGrading}` : null,
    ].filter(Boolean).join('\n');

    const subjectSection = (tweaks.subjectChanges || []).map((s, i) => {
      const parts = [];
      if (s.archetype) parts.push(`Archetype: ${s.archetype}`);
      if (s.expression) parts.push(`Expression: ${s.expression}`);
      if (s.clothing) parts.push(`Clothing: ${s.clothing}`);
      if (s.hair) parts.push(`Hair: ${s.hair}`);
      if (s.pose) parts.push(`Pose: ${s.pose}`);
      if (s.customNotes) parts.push(`Notes: ${s.customNotes}`);
      return parts.length > 0 ? `Person ${i + 1}: ${parts.join(' | ')}` : null;
    }).filter(Boolean).join('\n');

    const objectSection = [
      tweaks.objectChanges?.backgroundSetting ? `Background setting: ${tweaks.objectChanges.backgroundSetting}` : null,
      tweaks.objectChanges?.additionalObjects ? `ADD objects: ${tweaks.objectChanges.additionalObjects}` : null,
      tweaks.objectChanges?.removeObjects ? `REMOVE objects: ${tweaks.objectChanges.removeObjects}` : null,
    ].filter(Boolean).join('\n');

    const hasTweaks = textSection || colorSection || subjectSection || objectSection || tweaks.globalNotes;

    const tweaksSummary = hasTweaks ? `
═══ USER TWEAKS (APPLY THESE CHANGES) ═══
${textSection ? `\nTEXT CHANGES:\n${textSection}` : ''}
${colorSection ? `\nCOLOR CHANGES:\n${colorSection}` : ''}
${subjectSection ? `\nSUBJECT CHANGES:\n${subjectSection}` : ''}
${objectSection ? `\nOBJECT CHANGES:\n${objectSection}` : ''}
${tweaks.globalNotes ? `\nADDITIONAL INSTRUCTIONS:\n${tweaks.globalNotes}` : ''}
═══════════════════════════════════════════` : '\n(No tweaks — recreate as-is)\n';

    const originalPrompt = original_analysis.recreate_prompt || '';
    const detailedDesc = original_analysis.detailed_description || '';

    const prompt = `You are the world's best AI image prompt engineer specializing in YouTube thumbnails. You have an ORIGINAL ANALYSIS of a YouTube thumbnail from forensic AI vision, plus USER TWEAKS the user wants applied.

Your job: START from the original recreate_prompt as your BASE, then surgically apply ONLY the user's requested tweaks. The result must look 95% identical to the original — only the tweaked elements should differ.

═══ CRITICAL: USE THIS AS YOUR STARTING BASE ═══
The following is the original recreate_prompt — it was carefully crafted from forensic pixel-by-pixel analysis. Your output MUST preserve ALL of its details (people descriptions, lighting, background, composition, colors, clothing, expressions) EXCEPT where the user explicitly requested changes.

ORIGINAL RECREATE PROMPT:
${originalPrompt}

═══ DETAILED FORENSIC DESCRIPTION (for reference) ═══
${detailedDesc}

═══ FULL LAYER ANALYSIS (for reference) ═══
Layout: ${original_analysis.layout_breakdown || original_analysis.layout_type || 'unknown'}
Style: ${original_analysis.style_category || 'cinematic'}
Emotional hook: ${original_analysis.emotional_hook || ''}
- Background: ${JSON.stringify(original_analysis.layers?.background || {})}
- Midground: ${JSON.stringify(original_analysis.layers?.midground || {})}  
- Foreground: ${JSON.stringify(original_analysis.layers?.foreground || {})}
- Text & Graphics: ${JSON.stringify(original_analysis.layers?.text_and_graphics || {})}
Styling: ${JSON.stringify(original_analysis.styling || {})}
Color palette: ${(original_analysis.color_palette || []).join(', ')}

${tweaksSummary}

═══ PROMPT RULES ═══
1. MUST start with: "A high-detail 4K YouTube thumbnail in 16:9 aspect ratio (1920x1080), widescreen landscape format, graphic design composition."
2. 400+ words — hyper-detailed. Your prompt should be AT LEAST as long as the original recreate_prompt.
3. SURGICAL TWEAKS ONLY: Apply ONLY the user's requested changes. Everything else MUST remain identical to the original recreate_prompt.
4. Keep ALL original details: exact person descriptions (archetype, skin tone, hair, facial hair, clothing colors, logos, expression muscles), exact lighting setup (rim lights, key lights, color casts), exact background (blur level, atmosphere, colors), exact composition and spatial arrangement.
5. Any text overlay MUST be in "QUOTATION MARKS" (Ideogram renders text in quotes)
6. Use NAMED COLORS not hex codes
7. Use SPATIAL language not pixel values
8. If user changed a person's archetype, describe the NEW person in full detail but PRESERVE the same pose, position, lighting, crop, and scale from the original.
9. If user changed text, use the NEW text in quotes at the SAME position with the SAME styling as the original.
10. If NO tweaks were requested, reproduce the original recreate_prompt nearly verbatim (just ensure it starts with the correct prefix).
11. DO NOT simplify, summarize, or lose detail from the original prompt. The output must be equally or more detailed.

Return ONLY a JSON object:
{
  "prompt": "The full 400+ word Ideogram prompt — based on the original recreate_prompt with surgical tweaks applied",
  "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, misspelled text, illegible text, small text, jpeg artifacts",
  "changes_applied": ["list", "of", "changes", "that", "were", "applied"]
}`;

    // Call Gemini
    const parts = [{ text: prompt }];

    // If we have the thumbnail URL, try to include it as an image reference
    if (thumbnail_url) {
      try {
        console.log('[TweakedPrompt] Fetching reference thumbnail...');
        const imgResp = await fetch(thumbnail_url);
        if (imgResp.ok) {
          const imgBuf = await imgResp.arrayBuffer();
          const bytes = new Uint8Array(imgBuf);
          // Only attach if small enough to avoid memory issues
          if (bytes.length < 4 * 1024 * 1024) {
            let b64 = '';
            const chunkSize = 32768;
            for (let idx = 0; idx < bytes.length; idx += chunkSize) {
              b64 += String.fromCharCode.apply(null, bytes.subarray(idx, idx + chunkSize));
            }
            b64 = btoa(b64);
            const mimeType = imgResp.headers.get('content-type') || 'image/jpeg';
            parts.push({ inlineData: { mimeType, data: b64 } });
            console.log(`[TweakedPrompt] Attached ${(bytes.length / 1024).toFixed(0)}KB image`);
          } else {
            console.log(`[TweakedPrompt] Image too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB), skipping`);
          }
        }
      } catch (e) {
        console.warn('Could not attach thumbnail image:', e.message);
      }
    }

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192, responseMimeType: "application/json" }
        })
      }
    );

    if (!geminiResp.ok) {
      const err = await geminiResp.json();
      return Response.json({ error: `Gemini error: ${err.error?.message || 'unknown'}` }, { status: 500 });
    }

    const geminiData = await geminiResp.json();
    if (!geminiData.candidates?.[0]) {
      return Response.json({ error: 'No response from Gemini' }, { status: 500 });
    }

    const resultText = geminiData.candidates[0].content.parts[0].text;
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      const start = resultText.indexOf('{');
      const end = resultText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        result = JSON.parse(resultText.substring(start, end + 1));
      } else {
        return Response.json({ error: 'Failed to parse prompt result' }, { status: 500 });
      }
    }

    console.log(`[TweakedPrompt] Generated ${result.prompt?.length || 0} char prompt with ${(result.changes_applied || []).length} changes`);

    return Response.json({
      success: true,
      prompt: result.prompt,
      negative_prompt: result.negative_prompt || '',
      changes_applied: result.changes_applied || [],
    });

  } catch (error) {
    console.error('buildTweakedThumbnailPrompt error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});