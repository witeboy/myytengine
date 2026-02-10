import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { block_id, block_prompt, mood = 'cinematic' } = body;

    if (!block_id || !block_prompt) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return Response.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Use Gemini to generate color grading profile
    const prompt = `Based on this video scene and desired mood, generate color grading parameters:

Scene: ${block_prompt}
Desired mood: ${mood}

Provide JSON with color grading values (all -100 to 100):
{"brightness": 0, "contrast": 10, "saturation": 15, "temperature": 5, "tint": -2}

Make the values realistic for achieving a ${mood} look.`;

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
      return Response.json({ error: 'Failed to generate color grade' }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.contents?.[0]?.parts?.[0]?.text || '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const colorGrade = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0
    };

    // Update block with color grade
    await base44.entities.TimelineBlocks.update(block_id, {
      color_grade: JSON.stringify(colorGrade)
    });

    return Response.json({
      success: true,
      color_grade: colorGrade,
      message: `Color grading applied: ${mood} mood`
    });
  } catch (error) {
    console.error('Error generating color grade:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});