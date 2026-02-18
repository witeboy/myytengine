import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id } = body;

    // Get project
    const projects = await base44.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get selected topic (filter by is_selected = true)
    const allTopics = await base44.entities.Topics.filter({ project_id });
    const selectedTopic = allTopics.find(t => t.is_selected === true);
    if (!selectedTopic) {
      return Response.json({ error: 'No selected topic found' }, { status: 400 });
    }

    // Get final script (version = 'final_aggregated')
    const allScripts = await base44.entities.Scripts.filter({ project_id });
    const finalScript = allScripts.find(s => s.version === 'final_aggregated');
    if (!finalScript) {
      return Response.json({ error: 'No final script found' }, { status: 400 });
    }

    const videoTitle = project.name || selectedTopic.title;

    const prompt = `I'm about to upload this YouTube video about "${selectedTopic.title}". Generate:

→ SEO-optimized title variations (under 100 characters, clickable but accurate)
→ 3 description templates (engaging, with timestamps placeholder, CTAs)
→ 10 relevant tags (mix of broad and specific keywords)
→ Template for pinned comment (builds community, asks question)
→ Hashtags for discovery (5-8 relevant hashtags)

Make sure everything targets watch-time and engagement, not just clicks.

Video title: ${videoTitle}
Video topic: ${selectedTopic.title}
Topic description: ${selectedTopic.description}
Niche: ${project.niche}

Script preview (first 200 chars): ${finalScript.full_script.substring(0, 200)}...

RESPOND IN THIS EXACT JSON FORMAT:

{
  "title_primary": "Main SEO title under 100 chars",
  "title_variation_1": "Alt title 1 under 100 chars",
  "title_variation_2": "Alt title 2 under 100 chars",
  "description_template": "Primary description with [TIMESTAMPS] placeholder, links section, and CTA",
  "description_alt_1": "Alternative description 1",
  "description_alt_2": "Alternative description 2",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "pinned_comment": "Engaging pinned comment that asks a question or builds community",
  "hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5"
}`;

    const result = await safeGeminiCall(prompt, 0.6);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const metadata = await base44.entities.UploadMetadata.create({
      project_id: project_id,
      title_primary: result.data.title_primary,
      title_variation_1: result.data.title_variation_1,
      title_variation_2: result.data.title_variation_2,
      description_template: result.data.description_template,
      description_alt_1: result.data.description_alt_1,
      description_alt_2: result.data.description_alt_2,
      tags: JSON.stringify(result.data.tags),
      pinned_comment: result.data.pinned_comment,
      hashtags: result.data.hashtags
    });

    await base44.entities.Projects.update(project_id, { 
      current_step: 13, 
      status: "publish_ready" 
    });

    console.log(`Upload metadata generated for: ${videoTitle}`);

    return Response.json({ 
      success: true, 
      metadata: metadata,
      video_title: videoTitle,
      topic_title: selectedTopic.title
    });
  } catch (error) {
    console.error('generateUploadMetadata error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});