import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function repairJSON(str) {
  let s = str;
  // Normalize control chars
  s = s.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/  +/g, ' ');
  // Trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Missing commas between fields
  s = s.replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
  // Escape unescaped inner quotes inside string values
  // Matches: "key": "value with "bad quotes" inside"
  // Strategy: walk through and fix quotes between key-value pairs
  s = s.replace(/"([^"]*?)"\s*:\s*"([\s\S]*?)"\s*([,}\]])/g, (match, key, val, end) => {
    // Escape any unescaped quotes inside the value
    const fixedVal = val.replace(/([^\\])"/g, '$1\\"').replace(/^"/g, '\\"');
    return `"${key}": "${fixedVal}"${end}`;
  });
  return s;
}

function fixUnescapedQuotes(raw) {
  let result = '', inString = false, prevChar = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"' && prevChar !== '\\') {
      if (!inString) { inString = true; result += c; }
      else {
        let next = '';
        for (let j = i + 1; j < raw.length; j++) {
          if (!' \n\r\t'.includes(raw[j])) { next = raw[j]; break; }
        }
        if (':,}]'.includes(next)) { inString = false; result += c; }
        else { result += '\\"'; }
      }
    } else { result += c; }
    prevChar = c;
  }
  return result;
}

async function callGemini(prompt, temperature = 0.7, retries = 3) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 8192,
              responseMimeType: "application/json"  // Forces Gemini to output valid JSON
            }
          })
        }
      );

      if (response.status === 429) {
        const waitMs = Math.pow(2, attempt + 1) * 3000;
        console.warn(`⏳ Rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
      }

      const data = await response.json();
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Gemini returned no candidates");
      }

      const rawText = data.candidates[0].content.parts[0].text;

      // Try direct parse first (responseMimeType should make this work most of the time)
      try { return JSON.parse(rawText); } catch (_) {}

      // Try with repair
      try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

      // Try fixing unescaped quotes inside string values (e.g. "Storage Almost Full" inside synopsis)
      try { return JSON.parse(fixUnescapedQuotes(rawText)); } catch (_) {}
      try { return JSON.parse(repairJSON(fixUnescapedQuotes(rawText))); } catch (_) {}

      // Try extracting from markdown code blocks
      let jsonStr = rawText;
      if (rawText.includes("```json")) {
        jsonStr = rawText.split("```json")[1].split("```")[0].trim();
      } else if (rawText.includes("```")) {
        jsonStr = rawText.split("```")[1].split("```")[0].trim();
      }
      try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

      // Try extracting just the JSON object
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { return JSON.parse(repairJSON(objMatch[0])); } catch (_) {}
      }

      // Truncation recovery: find last complete batch in a truncated array
      const lastBrace = rawText.lastIndexOf('}');
      if (lastBrace > 0) {
        const trimmed = rawText.substring(0, lastBrace + 1);
        for (const suffix of [']}', '}]}', '']) {
          try {
            const parsed = JSON.parse(trimmed + suffix);
            if (parsed.batches && Array.isArray(parsed.batches) && parsed.batches.length > 0) {
              console.log(`⚠️ Recovered ${parsed.batches.length} batches from truncated JSON (attempt ${attempt + 1})`);
              return parsed;
            }
          } catch (_) {}
        }
      }

      throw new Error("Failed to parse Gemini JSON after all recovery attempts");

    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`⚠️ Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_id, topic_title, niche, duration_minutes } = await req.json();

    const totalWords = duration_minutes * 150;
    const numBatches = Math.max(2, Math.round(totalWords / 1500));
    const wordsPerBatch = Math.floor(totalWords / numBatches);

    const prompt = `You are a YouTube documentary expert. Create a detailed outline for a ${duration_minutes}-minute video about "${topic_title}" in the ${niche} niche.

Pick the BEST storytelling format from: Big Lie, Untold Truth, Domino, Reveal, Zero to Hero, Turning Point, Timeline, Origin Story.

Create exactly ${numBatches} batches, each ~${wordsPerBatch} words (150 words per minute).

For each batch write a DETAILED synopsis (5-8 sentences, 150-200 words, no newlines inside the string). Include specific narrative beats, facts, names, events, anecdotes, emotional turning points, and how the segment should open and close. The more detail, the better the final script.

Respond with ONLY valid JSON:
{"storytelling_format": "Format Name", "batches": [{"batch_number": 1, "story_segment": "Segment Title", "focus_area": "Focus description", "target_words": ${wordsPerBatch}, "synopsis": "Detailed synopsis here."}]}`;

    const outline = await callGemini(prompt, 0.7);

    // Validate we got usable batches
    if (!outline.batches || !Array.isArray(outline.batches) || outline.batches.length === 0) {
      throw new Error("Gemini returned an outline with no batches");
    }

    // Delete any old batches for this project
    const oldBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const ob of oldBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(ob.id);
    }

    // Create new batch records
    for (const batch of outline.batches) {
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: batch.batch_number,
        story_segment: batch.story_segment,
        focus_area: batch.focus_area,
        synopsis: batch.synopsis || batch.focus_area,
        target_words: batch.target_words || wordsPerBatch,
        status: "pending"
      });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      video_duration_minutes: duration_minutes,
      storytelling_format: outline.storytelling_format,
      outline: JSON.stringify(outline.batches),
      status: "outline_ready",
      current_step: 3
    });

    return Response.json({
      success: true,
      storytelling_format: outline.storytelling_format,
      batches: outline.batches
    });
  } catch (error) {
    console.error("generateOutline error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});