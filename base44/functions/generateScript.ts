import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates. Possibly content filtered.");
    }

    const text = data.candidates[0].content.parts[0].text;

    let jsonStr = text;
    if (text.includes("```json")) {
      jsonStr = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonStr = text.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// VALIDATION: Ensure hook is properly integrated and enhanced
// ══════════════════════════════════════════════════════════════════
function validateScriptQuality(scriptData, selectedHook) {
  const issues = [];
  
  // Safely extract fields with defaults
  const coldOpen = scriptData?.cold_open || '';
  const act1 = scriptData?.act_1 || '';
  const act2 = scriptData?.act_2 || '';
  const act3 = scriptData?.act_3 || '';
  const fullScript = scriptData?.full_script || '';
  const wordCount = scriptData?.word_count || 0;
  const estimatedDuration = scriptData?.estimated_duration_sec || 0;

  // Early return if no hook provided
  if (!selectedHook || selectedHook.trim().length === 0) {
    issues.push('No hook provided for validation');
    return { valid: false, issues, quality_score: 0 };
  }

  // Check 1: Hook should be enhanced, not just copied verbatim
  if (coldOpen && selectedHook) {
    const hookWords = selectedHook.split(/\s+/).filter(w => w.length > 4);
    const coldOpenWords = coldOpen.split(/\s+/);
    
    if (hookWords.length > 0) {
      const matchCount = hookWords.filter(hw => 
        coldOpenWords.some(cow => cow.toLowerCase() === hw.toLowerCase())
      ).length;
      const matchPercentage = (matchCount / hookWords.length) * 100;
      
      if (matchPercentage > 80) {
        issues.push(`Hook appears to be copied verbatim (${matchPercentage.toFixed(0)}% match). Should be enhanced and transformed.`);
      }
    }
  }

  // Check 2: Cold open should have a scene direction
  if (!coldOpen.includes('[SCENE:') && !coldOpen.includes('[Scene:')) {
    issues.push('Cold open missing [SCENE:] direction');
  }

  // Check 3: Should flow into Act 1 without repetition
  if (coldOpen && act1) {
    const coldOpenSentences = coldOpen.split('.').filter(s => s.trim() && !s.includes('[SCENE'));
    const act1Sentences = act1.split('.');
    
    if (coldOpenSentences.length > 0 && act1Sentences.length > 0) {
      const coldOpenLastSentence = coldOpenSentences[coldOpenSentences.length - 1];
      const act1FirstSentence = act1Sentences[0];
      
      if (coldOpenLastSentence && act1FirstSentence) {
        const similarity = calculateSimilarity(coldOpenLastSentence, act1FirstSentence);
        if (similarity > 0.6) {
          issues.push('Cold open and Act 1 appear to repeat similar ideas (poor transition)');
        }
      }
    }
  }

  // Check 4: Minimum word count for quality
  if (wordCount < 500) {
    issues.push(`Script too short: ${wordCount} words (minimum 500 for quality content)`);
  }

  // Check 5: Every act should have scene directions
  const act1Scenes = (act1.match(/\[SCENE:/gi) || []).length;
  const act2Scenes = (act2.match(/\[SCENE:/gi) || []).length;
  const act3Scenes = (act3.match(/\[SCENE:/gi) || []).length;

  if (act1Scenes < 2) issues.push('Act 1 needs at least 2 scene directions');
  if (act2Scenes < 3) issues.push('Act 2 needs at least 3 scene directions');
  if (act3Scenes < 2) issues.push('Act 3 needs at least 2 scene directions');

  // Check 6: Duration should be reasonable
  if (estimatedDuration > 0) {
    const estimatedMinutes = estimatedDuration / 60;
    if (estimatedMinutes < 3) {
      issues.push(`Duration too short: ${estimatedMinutes.toFixed(1)} minutes (minimum 3 minutes)`);
    }
  } else {
    issues.push('Missing estimated duration');
  }

  // Check 7: Full script should exist and be comprehensive
  if (!fullScript || fullScript.trim().length === 0) {
    issues.push('Full script is empty or missing');
  }

  return {
    valid: issues.length === 0,
    issues: issues,
    quality_score: Math.max(0, 100 - (issues.length * 15))
  };
}

function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w));
  return commonWords.length / Math.max(words1.length, words2.length, 1);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, topic_id, topic_title, topic_description, selected_hook } = body;

    if (!selected_hook || !topic_title) {
      return Response.json({ error: 'Missing required fields: topic_title or selected_hook' }, { status: 400 });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎬 GENERATING PREMIUM SCRIPT');
    console.log(`📝 Topic: ${topic_title}`);
    console.log(`🎣 Hook length: ${selected_hook.length} chars`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const prompt = `You are an elite YouTube scriptwriter combining the narrative genius of Netflix documentaries, the psychological precision of Nir Eyal, and the viral instincts of MrBeast's team.

Your mission: Write a HIGH-RETENTION, CINEMATIC YouTube script about "${topic_title}".

**TARGET SPECS:**
- Duration: ~150 words per minute voiceover pacing
- Format: 16:9 widescreen cinematic documentary
- Tone: Intelligent, gripping, emotionally resonant

**CONTEXT:**
${topic_description}

══════════════════════════════════════════════════════════════════
HOOK TRANSFORMATION SYSTEM (CRITICAL)
══════════════════════════════════════════════════════════════════

You have been provided with this RAW HOOK CONCEPT:

"""
${selected_hook}
"""

**YOUR HOOK TRANSFORMATION MANDATE:**

This is NOT final copy. This is RAW MATERIAL to be TRANSFORMED into a viral, captivating opening that stops scrolls.

**TRANSFORMATION REQUIREMENTS:**

1. **EXTRACT THE CORE TENSION:**
   - What is the fundamental conflict/mystery/shock in this hook?
   - What emotion does it trigger? (curiosity, fear, outrage, fascination)
   - What question does it plant in the viewer's mind?

2. **ENHANCE WITH VIRAL PSYCHOLOGY:**
   Apply these proven retention techniques:
   
   ✓ **Pattern Interruption:** Start with something unexpected/counterintuitive
   ✓ **Specificity:** Replace vague with ultra-specific details (dates, numbers, names)
   ✓ **Stakes Elevation:** Make clear why this matters NOW
   ✓ **Emotional Trigger:** Hit ONE strong emotion immediately (shock, curiosity, anger, fear)
   ✓ **Question Seeding:** Plant an unanswered question in viewer's mind
   ✓ **Contrast/Paradox:** Use unexpected juxtaposition ("The man who saved millions... was never supposed to survive")

3. **CRAFT THE PERFECT OPENER:**
   
   Your cold_open should be 2-4 sentences that:
   - Opens with the MOST gripping moment (in medias res)
   - Uses vivid, sensory, specific language
   - Creates immediate intrigue
   - Avoids clichés like "In this video..." or "Today we're going to..."
   - Feels like a thriller opening, not a lecture
   
   **GOOD EXAMPLES:**
   
   Original hook: "The story of how one decision changed everything"
   ✅ Enhanced: "The email sat unopened for 3 hours. By the time Sarah Chen clicked it, $89 million had already vanished—and the world's most secure banking system had just been exposed as a lie."
   
   Original hook: "This technology will change the world"
   ✅ Enhanced: "They called it impossible. Every expert said it would never work. Then, on November 30th, 2022, a single demo broke the internet—and suddenly, every rule we knew about human creativity became obsolete."
   
   Original hook: "A controversial decision that shocked everyone"
   ✅ Enhanced: "The judge's hand was shaking as he read the verdict. What he was about to say would either save democracy—or destroy it. No one in that courtroom, including him, knew which."

4. **SEAMLESS TRANSITION INTO ACT 1:**
   
   After your enhanced hook, Act 1 should:
   - NOT repeat the hook's information
   - Expand OUTWARD from the hook's tension
   - Provide just enough context to deepen intrigue (not resolve it)
   - Escalate the stakes or mystery
   - Flow naturally like chapters in a thriller novel
   
   **TRANSITION STRUCTURE:**
   
   Cold Open (7-15 seconds) → Creates tension/mystery
   ↓
   Act 1 Opening (next paragraph) → Expands context WITHOUT resolving tension
   ↓
   Act 1 Development → Layers complexity, raises more questions
   
   **AVOID:**
   ❌ Repeating hook ideas in different words
   ❌ Immediately explaining everything (kills retention)
   ❌ Generic transitions like "But let me back up..." or "To understand this..."
   
   **DO:**
   ✅ Forward momentum (each sentence adds NEW information)
   ✅ Escalating intrigue (more questions arise before answers)
   ✅ Cinematic flow (think Netflix episode, not Wikipedia article)

5. **VIRAL POTENCY CHECKLIST:**
   
   Your enhanced hook must have AT LEAST 3 of these:
   □ Specific numbers/dates/names (not "many people" but "847 engineers")
   □ Unexpected contradiction ("The safest place became the deadliest")
   □ High stakes clearly stated (money, lives, power, future)
   □ Emotional trigger word (betrayal, collapse, discovery, secret)
   □ Unanswered question that nags at viewer
   □ Sensory/cinematic detail (not "he was scared" but "his hands wouldn't stop shaking")

══════════════════════════════════════════════════════════════════
AUTO NICHE DETECTION & OPTIMIZATION
══════════════════════════════════════════════════════════════════

Analyze "${topic_title}" and "${topic_description}" to determine the dominant niche, then adapt:

**FINANCE / BUSINESS / ECONOMICS:**
- Translate complex mechanisms into visceral stakes
- Show power structures, incentives, hidden leverage
- Use specific dollar amounts, percentages, time frames
- Make abstract financial concepts feel personal and urgent
- Frame decisions through "What would you do?" lens

**TECHNOLOGY / AI / PRODUCT:**
- Lead with IMPACT, not features
- Show before/after, promise vs reality
- Include adoption tipping points and disruption angles
- Make technical concepts feel like plot twists
- Use analogies that trigger visceral understanding

**CRIME / INVESTIGATION:**
- Maintain chronological clarity with strategic time jumps
- Layer psychological profiling into narrative
- Build moral ambiguity and ethical tension
- Plant evidence/clues before reveals
- End sections on unanswered questions

**HISTORY / BIOGRAPHY:**
- Emphasize pivotal choices under pressure
- Show personal stakes behind historical events
- Connect past decisions to present consequences
- Use primary source details for authenticity
- Make historical figures feel like complex humans

**GEOPOLITICS / WAR / LAW:**
- Explain power dynamics through personal stories
- Clarify strategic incentives and constraints
- Highlight unintended consequences
- Show how macro forces affect individual lives
- Use maps/movements to visualize abstract concepts

**SCIENCE / ENGINEERING:**
- Lead with the impossible problem
- Show failure attempts before breakthrough
- Make discovery feel earned and surprising
- Use everyday analogies for complex concepts
- Highlight human cost/benefit of science

**STORYTELLING / HUMAN DRAMA:**
- Deep emotional immersion with sensory details
- Internal conflict as important as external
- Show character change through actions
- Build empathy before judgment
- End on resonant emotional truth

**PHILOSOPHY / PSYCHOLOGY:**
- Use concrete examples before abstract concepts
- Challenge viewer assumptions early
- Make philosophical questions feel personal
- Show real-world applications
- Build to mind-shifting realization

══════════════════════════════════════════════════════════════════
STRUCTURE: 3-ACT NETFLIX DOCUMENTARY
══════════════════════════════════════════════════════════════════

**ACT 1 — GRAVITY HOOK & WORLD SETUP (25% of script)**

Your cold_open (enhanced hook) serves as the gravity hook.

Then immediately:
- Establish the world/context (just enough, not too much)
- Introduce central conflict or question
- Show why viewers should care (stakes)
- Plant seeds of complexity (it's not what it seems)
- NO "welcome to my channel" or "in this video"
- End Act 1 on rising tension or revelation

**Micro-hook to end Act 1:** Plant a question or revelation that propels into Act 2

**ACT 2 — ESCALATION & HIDDEN LAYERS (40% of script)**

This is the deep dive. Go beyond "what happened" to "why it mattered."

Requirements:
- Introduce complications, contradictions, hidden agendas
- Every 60-90 seconds, insert a micro-hook:
  → "But that wasn't the real story."
  → "What happened next changed everything."
  → "Almost no one noticed this detail."
  → "And this is where it gets uncomfortable."
  → "The truth was far stranger."

- Increase tension, emotional depth, OR insight with each section
- NEVER plateau—always climbing or descending
- Reveal information in strategic order for maximum impact
- Layer complexity: simple → nuanced → profound

**ACT 3 — TURNING POINT & AFTERMATH (25% of script)**

The critical moment where everything changes:
- A decision, betrayal, revelation, collapse, or breakthrough
- Slow pacing slightly for emotional/intellectual weight
- Examine consequences and ripple effects
- Show what changed (in the world, in understanding, in us)
- Build to a profound insight or lingering realization

**DO NOT:**
- Summarize what was already said
- Give a generic "lessons learned" list
- Lose narrative momentum

**DO:**
- Leave viewers with a perspective shift
- Create a resonant emotional or intellectual landing
- Make them feel changed by watching

**OUTRO (Final 5-10 seconds)**

Subtle, intelligent call to action that:
- Reinforces the core takeaway
- Invites reflection or action
- Feels earned, not tacked on
- Maintains the emotional/intellectual tone

══════════════════════════════════════════════════════════════════
RETENTION ENGINEERING RULES
══════════════════════════════════════════════════════════════════

**WORD-LEVEL OPTIMIZATION:**
✓ Vary sentence length (short punches mixed with flowing descriptions)
✓ Use active voice (not "it was discovered" but "she discovered")
✓ Choose specific over generic (not "many" but "847")
✓ Prefer visceral over abstract (not "it was bad" but "his hands wouldn't stop shaking")
✓ Cut every word that doesn't earn its place

**PARAGRAPH-LEVEL:**
✓ Each paragraph = ONE idea/moment
✓ Every paragraph must either:
  → Reveal new information
  → Escalate tension
  → Deepen understanding
  → Shift emotional tone
✓ Aim for 3-5 sentences per paragraph
✓ End paragraphs on intrigue (not resolution)

**PACING:**
✓ Fast opening (short sentences, high energy)
✓ Strategic slowing for emotional weight
✓ Accelerate during revelation/climax
✓ Rhythm variation prevents monotony

**FORBIDDEN:**
❌ No filler or repetition for word count
❌ No robotic "according to experts" without names/specificity
❌ No obvious padding ("as we'll see later")
❌ No breaking the fourth wall ("you might be wondering")
❌ No generic transitions ("moving on", "next", "additionally")

══════════════════════════════════════════════════════════════════
VISUAL SCENE DIRECTIONS (CRITICAL)
══════════════════════════════════════════════════════════════════

Every paragraph of narration MUST include a [SCENE:] direction.

**SCENE DIRECTION FORMAT:**

[SCENE: Shot type, subject/action, camera movement, lighting style, color grading, mood, environmental details, depth of field]

**EXAMPLE:**

Narration: "The boardroom was silent except for the sound of his pen, tapping against the mahogany table. Everyone knew what was coming. No one wanted to be the first to speak."

[SCENE: Medium wide shot of a modern corporate boardroom with floor-to-ceiling windows overlooking a city at dusk, slow dolly-in toward a 50-year-old CEO in a navy suit sitting at the head of a long table, dramatic side lighting from setting sun creating long shadows, teal and orange color grading, tense atmosphere, other executives in soft focus background, shallow depth of field f/2.8]

**QUALITY REQUIREMENTS:**
- Every scene should be cinematic and specific
- Include camera movement (dolly, pan, tilt, orbit, push-in, pull-out, static)
- Specify lighting (golden hour, harsh overhead, soft window light, dramatic side lighting)
- Include color grading (teal & orange, desaturated noir, warm vintage, cool clinical)
- Describe mood/atmosphere (tense, hopeful, ominous, triumphant)
- Add environmental context (location, weather, time of day)
- Specify depth of field when relevant (f/1.4 shallow bokeh, f/11 deep focus)

**Assume 16:9 widescreen cinematic composition for all scenes.**

══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (EXACT JSON STRUCTURE)
══════════════════════════════════════════════════════════════════

{
  "title": "Compelling Video Working Title (not clickbait, but intriguing)",
  "cold_open": "Your ENHANCED, TRANSFORMED hook (2-4 sentences) with [SCENE:] direction. This should be 7-15 seconds of narration that stops scrolling.",
  "act_1": "Full Act 1 narration with [SCENE:] directions for each paragraph. Should flow seamlessly from cold_open without repeating.",
  "act_2": "Full Act 2 narration with [SCENE:] directions. Deepest content with micro-hooks.",
  "act_3": "Full Act 3 narration with [SCENE:] directions. The turning point and aftermath.",
  "outro": "Final 5-10 seconds with subtle call to action.",
  "full_script": "Complete script combining cold_open + act_1 + act_2 + act_3 + outro in order",
  "word_count": [accurate count],
  "estimated_duration_sec": [accurate calculation at 150 words per minute]
}

**CALCULATION ACCURACY:**
- Count every word in full_script (including scene directions for accuracy, though they won't be read)
- Duration = (word_count / 150) * 60
- Ensure minimum 500 words for quality content
- Target 1000-2000 words for premium documentary feel

══════════════════════════════════════════════════════════════════
FINAL QUALITY CHECKS
══════════════════════════════════════════════════════════════════

Before generating, verify:
✓ Hook is TRANSFORMED (not copied verbatim)
✓ Cold open → Act 1 transition flows smoothly (no repetition)
✓ Every paragraph has [SCENE:] direction
✓ Micro-hooks appear every 60-90 seconds
✓ Escalating tension/insight throughout
✓ Zero filler or repetition
✓ Specific details (names, numbers, dates)
✓ Emotional resonance
✓ Memorable ending

**NOW: Generate the premium script.**`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      console.error('❌ Gemini call failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════════
    // VALIDATE SCRIPT QUALITY
    // ══════════════════════════════════════════════════════════════════
    const validation = validateScriptQuality(result.data, selected_hook);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SCRIPT QUALITY VALIDATION');
    console.log(`✓ Valid: ${validation.valid ? 'YES' : 'NO'}`);
    console.log(`✓ Quality Score: ${validation.quality_score}/100`);
    console.log(`✓ Word Count: ${result.data.word_count || 0}`);
    console.log(`✓ Duration: ${((result.data.estimated_duration_sec || 0) / 60).toFixed(1)} minutes`);
    
    if (validation.issues.length > 0) {
      console.log('\n⚠️  QUALITY ISSUES DETECTED:');
      validation.issues.forEach(issue => console.log(`   • ${issue}`));
    } else {
      console.log('✓ All quality checks passed!');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Save script with validation data
    const script = await base44.entities.Scripts.create({
      project_id: project_id,
      topic_id: topic_id,
      version: "draft",
      title: result.data.title || "Untitled Script",
      full_script: result.data.full_script || "",
      cold_open: result.data.cold_open || "",
      word_count: result.data.word_count || 0,
      estimated_duration_sec: result.data.estimated_duration_sec || 0,
      act_1: result.data.act_1 || "",
      act_2: result.data.act_2 || "",
      act_3: result.data.act_3 || "",
      outro: result.data.outro || ""
    });

    await base44.entities.Projects.update(project_id, {
      script_id: script.id,
      current_step: 4,
      status: "scripting"
    });

    console.log(`✓ Script saved with ID: ${script.id}`);

    return Response.json({ 
      success: true, 
      script: script,
      validation: validation
    });

  } catch (error) {
    console.error('❌ SCRIPT GENERATION ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});