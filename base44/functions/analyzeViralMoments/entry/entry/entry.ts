import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v4 — redeployed, clean style

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const words = body.words || [];
  const duration = body.duration || 0;
  const max_clips = body.max_clips || 8;
  const min_clip_seconds = body.min_clip_seconds || 15;
  const max_clip_seconds = body.max_clip_seconds || 90;
  const context = body.context || '';

  if (!words.length) {
    return Response.json({ error: 'words array required (from ASR)' }, { status: 400 });
  }

  const API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

  // Build timestamped transcript with [M:SS] markers every ~10 seconds
  var chunks = [];
  var currentChunk = '';
  var lastMarker = -10;

  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi];
    if (w.start - lastMarker >= 10) {
      if (currentChunk) chunks.push(currentChunk.trim());
      var mins = Math.floor(w.start / 60);
      var secs = Math.floor(w.start % 60);
      currentChunk = '[' + mins + ':' + (secs < 10 ? '0' : '') + secs + '] ';
      lastMarker = w.start;
    }
    currentChunk += w.word + ' ';
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  var timestampedTranscript = chunks.join('\n');

  // System prompt
  var systemPrompt = 'You are a world-class AI video clipping engine, combining the capabilities of a viral content strategist, film editor, and multimodal video analyst.\n\n'
    + 'Your task is to analyze a long-form video transcript and identify the most viral, high-retention, and highly shareable moments.\n\n'
    + 'IMPORTANT: You must STRICTLY extract clips from the ORIGINAL video flow.\n'
    + '- Do NOT invent dialogue\n'
    + '- Do NOT rewrite meaning\n'
    + '- Do NOT merge separate moments\n'
    + '- Only refine start/end boundaries for maximum impact\n\n'
    + '-----------------------------------\n'
    + 'MULTIMODAL SIMULATION\n'
    + '-----------------------------------\n'
    + 'Even though you are given a transcript, simulate full video understanding:\n'
    + '- Detect emotional intensity (excitement, anger, shock, humor, tension)\n'
    + '- Detect delivery shifts (pauses, emphasis, speed changes)\n'
    + '- Detect topic or scene transitions\n'
    + '- Detect conflict, disagreement, or tension\n'
    + '- Detect energy spikes where attention increases\n'
    + 'Treat the transcript as a sequence of SCENES and evaluate each for viral potential.\n\n'
    + '-----------------------------------\n'
    + 'VIRAL DETECTION CRITERIA\n'
    + '-----------------------------------\n'
    + 'Identify moments that maximize:\n'
    + '1. HOOK STRENGTH (first 1-2 seconds) - Bold claim, curiosity gap, or disruption\n'
    + '2. EMOTIONAL SPIKE - Surprise, humor, outrage, awe, tension\n'
    + '3. CURIOSITY GAP - Viewer feels: Wait, what happens next?\n'
    + '4. PAYOFF - Clear resolution, punchline, insight, or reveal\n'
    + '5. LOOPABILITY - Ending naturally encourages replay\n'
    + '6. TENSION / CONFLICT - Disagreement, stakes, or friction\n'
    + '7. SHAREABILITY - Viewer would send this to someone else\n\n'
    + '-----------------------------------\n'
    + 'CLIPPING RULES (CRITICAL)\n'
    + '-----------------------------------\n'
    + '- Clips MUST be fully self-contained\n'
    + '- Must make sense WITHOUT external context\n'
    + '- NO mid-sentence cuts\n'
    + '- START = strongest possible hook within the original footage\n'
    + '- END = satisfying conclusion or payoff\n'
    + '- Prefer NATURAL boundaries (not forced cuts)\n'
    + '- You MAY slightly adjust timestamps to improve hook strength\n'
    + '- Clip length must be between ' + min_clip_seconds + 's and ' + max_clip_seconds + 's\n'
    + '- Return at most ' + max_clips + ' clips\n\n'
    + '-----------------------------------\n'
    + 'TIMESTAMP RULES\n'
    + '-----------------------------------\n'
    + '- Use the [M:SS] markers as anchors\n'
    + '- Convert ALL timestamps to seconds in output\n'
    + '- Choose the most precise start/end possible\n\n'
    + '-----------------------------------\n'
    + 'SCORING\n'
    + '-----------------------------------\n'
    + 'For each clip assign a virality_score (0-100) based on hook strength, emotional intensity, curiosity gap, payoff strength, and rewatchability.\n\n'
    + '-----------------------------------\n'
    + 'ANTI-FAILURE RULES\n'
    + '-----------------------------------\n'
    + '- Avoid clips that start too early or too late\n'
    + '- Avoid clips that end abruptly without payoff\n'
    + '- Avoid flat monologues with no emotional change\n'
    + '- Prefer clips with clear energy shifts or turning points\n\n'
    + 'Only return the BEST clips, no filler.\n'
    + 'Return ONLY valid JSON, no markdown fences, no explanation.';

  // User prompt
  var durationMins = Math.round(duration / 60);
  var userPrompt = 'Analyze this ' + durationMins + '-minute video transcript and find the top viral clip moments.\n';
  if (context) userPrompt += '\nVideo context: ' + context + '\n';
  userPrompt += '\nTIMESTAMPED TRANSCRIPT:\n' + timestampedTranscript + '\n\n';
  userPrompt += 'Return JSON in this exact format:\n'
    + '{\n'
    + '  "clips": [\n'
    + '    {\n'
    + '      "title": "Short punchy title for this clip (max 60 chars)",\n'
    + '      "hook": "The opening line that grabs attention (first 10 words)",\n'
    + '      "start": 45.0,\n'
    + '      "end": 78.5,\n'
    + '      "duration": 33.5,\n'
    + '      "virality_score": 92,\n'
    + '      "virality_reason": "Why this moment is viral-worthy (1-2 sentences)",\n'
    + '      "category": "one of: hot_take | story | humor | insight | emotional | dramatic | quotable | controversial",\n'
    + '      "transcript_excerpt": "Key 1-2 sentence excerpt from the peak moment"\n'
    + '    }\n'
    + '  ]\n'
    + '}\n\n'
    + 'Sort clips by virality_score descending (best first).';

  console.log('Analyzing ' + words.length + ' words, ' + Math.round(duration) + 's video for viral moments...');

  // Call Claude
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!claudeRes.ok) {
    const errData = await claudeRes.json();
    var errMsg = errData.error ? (errData.error.message || 'Unknown') : 'Unknown';
    return Response.json({ error: 'Claude API Error ' + claudeRes.status + ': ' + errMsg }, { status: 500 });
  }

  const claudeData = await claudeRes.json();
  var responseText = '';
  if (claudeData.content && claudeData.content.length > 0) {
    responseText = claudeData.content[0].text || '';
  }

  // Parse JSON from response — handle possible markdown fences
  var cleaned = responseText.trim();
  if (cleaned.indexOf('```json') !== -1) {
    cleaned = cleaned.split('```json')[1].split('```')[0].trim();
  } else if (cleaned.indexOf('```') !== -1) {
    cleaned = cleaned.split('```')[1].split('```')[0].trim();
  }

  var result;
  try {
    result = JSON.parse(cleaned);
  } catch (parseErr) {
    console.log('JSON parse failed, raw response: ' + responseText.substring(0, 500));
    return Response.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 });
  }

  if (!result || !result.clips || !result.clips.length) {
    return Response.json({
      success: true,
      clips: [],
      message: 'No strong viral moments found in this content',
    });
  }

  // Post-process: snap start/end to nearest word boundaries
  var snappedClips = [];
  for (var ci = 0; ci < result.clips.length; ci++) {
    var clip = result.clips[ci];

    // Find closest ASR word to start timestamp
    var bestStart = words[0];
    for (var si = 0; si < words.length; si++) {
      if (Math.abs(words[si].start - clip.start) < Math.abs(bestStart.start - clip.start)) {
        bestStart = words[si];
      }
    }

    // Find closest ASR word to end timestamp
    var bestEnd = words[words.length - 1];
    for (var ei = 0; ei < words.length; ei++) {
      if (Math.abs(words[ei].end - clip.end) < Math.abs(bestEnd.end - clip.end)) {
        bestEnd = words[ei];
      }
    }

    // Add padding for natural feel
    var snappedStart = Math.max(0, bestStart.start - 0.3);
    var snappedEnd = Math.min(duration, bestEnd.end + 0.5);

    snappedClips.push({
      title: clip.title || '',
      hook: clip.hook || '',
      start: Math.round(snappedStart * 100) / 100,
      end: Math.round(snappedEnd * 100) / 100,
      duration: Math.round((snappedEnd - snappedStart) * 100) / 100,
      virality_score: clip.virality_score || 0,
      virality_reason: clip.virality_reason || '',
      category: clip.category || 'insight',
      transcript_excerpt: clip.transcript_excerpt || '',
    });
  }

  // Sort by virality score descending
  snappedClips.sort(function(a, b) { return (b.virality_score || 0) - (a.virality_score || 0); });

  console.log('Found ' + snappedClips.length + ' viral clips');
  for (var li = 0; li < snappedClips.length; li++) {
    var c = snappedClips[li];
    console.log('  #' + (li + 1) + ' [' + c.virality_score + '] ' + c.start.toFixed(1) + 's -> ' + c.end.toFixed(1) + 's "' + c.title + '"');
  }

  return Response.json({
    success: true,
    clips: snappedClips,
    total_found: snappedClips.length,
    video_duration: duration,
  });
});
