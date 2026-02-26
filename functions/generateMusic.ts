import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// INTELLIGENT MUSIC GENERATION — Script-Aware Soundtrack
// ══════════════════════════════════════════════════════════════════

async function analyzeScriptForMusic(script, niche, tone) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  const prompt = `You are an expert film music supervisor. Analyze this video script and determine the PERFECT background instrumental music.

SCRIPT:
"""
${script.substring(0, 3000)}
"""

NICHE: ${niche || 'general'}
TONE: ${tone || 'not specified'}

Analyze the script's emotional arc, pacing, subject matter, and energy level. Then recommend music that:
- Matches the STORY MOOD (not just the genre)
- Supports narration without competing with it
- Has the right energy arc (builds, sustains, or resolves)
- Fits the content type (documentary, motivational, thriller, educational, etc.)

MUSIC STYLE VOCABULARY (pick the most fitting combination):
- Genres: Cinematic, Epic Orchestral, Lo-Fi, Ambient, Electronic, Piano Ballad, Corporate, Hip-Hop Instrumental, Jazz, Acoustic Folk, Dark Ambient, Synthwave, Classical, World Music, Trap Beat, Indie
- Moods: Tense, Hopeful, Mysterious, Triumphant, Melancholic, Urgent, Peaceful, Suspenseful, Inspiring, Dark, Playful, Nostalgic, Dramatic, Reflective, Energetic, Somber
- Pacing: Slow build, Steady pulse, Fast-paced, Breathing/dynamic, Minimal ambient, Driving rhythm
- Instruments: Piano, Strings, Synth pads, Acoustic guitar, Orchestra, Bass-heavy, Percussion-driven, Ambient textures, Brass, Electronic beats

Return ONLY this JSON:
{
  "style": "2-3 word Suno style tag (e.g. 'Epic Cinematic Orchestral', 'Dark Ambient Electronic', 'Inspiring Piano Strings')",
  "music_prompt": "A rich 1-2 sentence prompt describing the exact sound (e.g. 'Slow-building orchestral score with deep cello undertones, rising strings, and subtle percussion that builds tension before resolving into a triumphant brass-led climax')",
  "title": "Short evocative track name under 80 chars",
  "reasoning": "Why this music fits this specific script"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024, responseMimeType: "application/json" }
        })
      }
    );

    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No Gemini response");
    return JSON.parse(text);
  } catch (err) {
    console.warn(`Music analysis failed: ${err.message} — using fallback`);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, genre, mood, project_id } = await req.json();

    const apiKey = Deno.env.get('KIE_API_KEY');
    if (!apiKey) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'generating' });
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 1: Try to analyze the actual script for intelligent music selection
    // ══════════════════════════════════════════════════════════════
    let musicPrompt, style, title;
    let analysisUsed = false;

    if (project_id) {
      try {
        const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
        const project = projects[0];

        if (project?.script) {
          console.log(`🎵 Analyzing script for intelligent music selection...`);
          const analysis = await analyzeScriptForMusic(
            project.script,
            project.niche,
            project.tone
          );

          if (analysis) {
            musicPrompt = analysis.music_prompt;
            style = analysis.style;
            title = analysis.title;
            analysisUsed = true;
            console.log(`🎵 Music analysis: style="${style}" | ${analysis.reasoning}`);
          }
        }
      } catch (err) {
        console.warn(`Script fetch failed: ${err.message} — using manual inputs`);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2: Fall back to manual inputs if no script analysis
    // ══════════════════════════════════════════════════════════════
    if (!analysisUsed) {
      musicPrompt = prompt || 'Cinematic background music for storytelling narration';
      style = genre || mood || 'Cinematic';
      title = (prompt || 'Background Track').substring(0, 80);
    }

    // Enforce prompt length limit
    if (musicPrompt.length > 400) musicPrompt = musicPrompt.substring(0, 397) + '...';
    if (title.length > 80) title = title.substring(0, 80);

    const negativeTags = 'Vocals, Singing, Rap, Voice, Spoken Word, Choir, Humming, Whistling';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎵 Music Generation | ${analysisUsed ? 'Script-Analyzed' : 'Manual Input'}`);
    console.log(`🎨 Style: ${style}`);
    console.log(`📝 Prompt: ${musicPrompt}`);
    console.log(`🎹 Title: ${title}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const response = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: musicPrompt,
        customMode: true,
        instrumental: true,
        model: 'V4',
        style: style,
        title: title,
        negativeTags: negativeTags,
        callBackUrl: 'https://example.com/noop-callback',
      }),
    });

    const data = await response.json();
    console.log('KIE Suno response:', JSON.stringify(data));

    if (data.code === 200 && data.data?.taskId) {
      return Response.json({
        success: true,
        status: 'pending',
        task_id: data.data.taskId,
        music_style: style,
        music_prompt: musicPrompt,
        analysis_used: analysisUsed
      });
    }

    const errMsg = data.msg || data.errorMessage || 'Unknown KIE error';
    console.error('KIE Suno generation failed:', errMsg);
    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }
    return Response.json({ error: `Music generation failed: ${errMsg}` }, { status: 500 });

  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});