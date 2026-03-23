import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// Simple test to check if Grok Imagine API is working at all
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const KIE_API_KEY = Deno.env.get("KIE_API_KEY");

  // Step 1: Create task with simplest possible prompt
  console.log("Step 1: Creating task...");
  const createRes = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "grok-imagine/text-to-image",
      input: {
        prompt: "A beautiful sunset over mountains, oil painting style",
        aspect_ratio: "16:9"
      }
    })
  });

  const createData = await createRes.json();
  console.log("Create response:", JSON.stringify(createData));

  if (createData.code !== 200 || !createData.data?.taskId) {
    return Response.json({ error: "createTask failed", response: createData });
  }

  const taskId = createData.data.taskId;
  console.log("Task ID:", taskId);

  // Step 2: Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const pollRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
    });
    const pollData = await pollRes.json();
    console.log(`Poll ${i+1}: state=${pollData.data?.state}, failMsg=${pollData.data?.failMsg || 'none'}`);

    if (pollData.data?.state === "success") {
      const resultJson = JSON.parse(pollData.data.resultJson || "{}");
      return Response.json({ success: true, image_url: resultJson.resultUrls?.[0], raw: pollData.data });
    }

    if (pollData.data?.state === "fail") {
      return Response.json({ 
        success: false, 
        error: pollData.data.failMsg,
        full_response: pollData.data
      });
    }
  }

  return Response.json({ error: "Timed out waiting for result" });
});