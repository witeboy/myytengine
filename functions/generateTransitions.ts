import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id } = body;

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // Get all timeline blocks
    const allBlocks = await base44.entities.TimelineBlocks.list();
    const blocks = allBlocks.filter(b => b.project_id === project_id).sort((a, b) => a.order_index - b.order_index);

    if (blocks.length < 2) {
      return Response.json({ error: 'Need at least 2 blocks for transitions' }, { status: 400 });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return Response.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Generate transitions for each pair of consecutive blocks
    const transitions = [];
    for (let i = 0; i < blocks.length - 1; i++) {
      const currentBlock = blocks[i];
      const nextBlock = blocks[i + 1];

      // Use Gemini to suggest appropriate transition
      const prompt = `Based on these two consecutive video scenes, suggest the most appropriate transition type and duration:

Current scene: ${currentBlock.prompt}
Next scene: ${nextBlock.prompt}

Current duration: ${currentBlock.duration_seconds}s
Next duration: ${nextBlock.duration_seconds}s

Available transitions: cut, fade, dissolve, zoom, wipe, slide

Respond with ONLY JSON: {"transition": "TYPE", "duration": 0.5}`;

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
        console.error('Gemini error:', await geminiResponse.text());
        continue;
      }

      const geminiData = await geminiResponse.json();
      const responseText = geminiData.contents?.[0]?.parts?.[0]?.text || '{}';
      
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : { transition: 'fade', duration: 0.5 };
        
        // Update current block with transition
        await base44.entities.TimelineBlocks.update(currentBlock.id, {
          transition_type: suggestion.transition || 'fade',
          transition_duration: suggestion.duration || 0.5
        });

        transitions.push({
          block_id: currentBlock.id,
          transition: suggestion.transition,
          duration: suggestion.duration
        });
      } catch (parseError) {
        console.error('Parse error:', parseError);
      }
    }

    return Response.json({
      success: true,
      transitions_applied: transitions.length,
      transitions: transitions
    });
  } catch (error) {
    console.error('Error generating transitions:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});