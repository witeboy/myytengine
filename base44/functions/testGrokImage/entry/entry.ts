import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v2 — redeployed
const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { prompt } = await req.json();
    const apiKey = Deno.env.get("KIE_API_KEY");
    
    const testPrompt = prompt || "A beautiful sunset over a calm ocean with orange and purple clouds";
    console.log(`Testing Grok Imagine with prompt: "${testPrompt}"`);

    // Create task
    const createRes = await fetch(`${KIE_BASE}/createTask`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "grok-imagine/text-to-image",
        input: {
          prompt: testPrompt,
          aspect_ratio: "16:9"
        }
      })
    });

    const createResult = await createRes.json();
    console.log(`Create response: ${JSON.stringify(createResult)}`);

    if (!createRes.ok || createResult.code !== 200) {
      return Response.json({ error: 'Task creation failed', details: createResult }, { status: 500 });
    }

    const taskId = createResult.data.taskId;
    console.log(`Task ID: ${taskId}`);

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      
      const pollRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      const poll = await pollRes.json();
      
      console.log(`Poll ${i+1}: state=${poll.data?.state}, failMsg=${poll.data?.failMsg || 'none'}`);

      if (poll.data?.state === "success") {
        const resultJson = JSON.parse(poll.data.resultJson || "{}");
        const url = resultJson.resultUrls?.[0];
        console.log(`SUCCESS! URL: ${url}`);
        return Response.json({ success: true, url, prompt: testPrompt });
      }

      if (poll.data?.state === "fail") {
        console.log(`FAILED: ${poll.data.failMsg}`);
        return Response.json({ 
          success: false, 
          error: poll.data.failMsg, 
          prompt: testPrompt 
        });
      }
    }

    return Response.json({ error: 'Timed out after 3 minutes' });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});