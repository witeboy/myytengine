import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { block_id, block_prompt, target_ratio = '9:16' } = body;

    if (!block_id || !block_prompt) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return Response.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Use Gemini to suggest smart crop framing
    const prompt = `For this video scene, suggest optimal crop framing for ${target_ratio} aspect ratio:

Scene description: ${block_prompt}

Provide JSON crop settings (values 0-100 as percentages):
{"x": 25, "y": 10, "width": 50, "height": 80, "aspect_ratio": "${target_ratio}"}

Focus on keeping important subjects centered and avoiding cutting important elements.`;

    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!geminiResponse.ok) {
      return Response.json({ error: 'Failed to generate crop' }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.contents?.[0]?.parts?.[0]?.text || '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cropSettings = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      aspect_ratio: target_ratio
    };

    // Update block with crop settings
    await base44.entities.TimelineBlocks.update(block_id, {
      crop_settings: JSON.stringify(cropSettings)
    });

    return Response.json({
      success: true,
      crop_settings: cropSettings,
      message: `Smart crop applied for ${target_ratio} aspect ratio`
    });
  } catch (error) {
    console.error('Error generating smart crop:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});