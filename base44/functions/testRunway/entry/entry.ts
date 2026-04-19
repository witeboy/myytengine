import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const runwayKey = Deno.env.get("RUNWAY_API_KEY");
    if (!runwayKey) return Response.json({ error: 'RUNWAY_API_KEY not set' }, { status: 500 });

    console.log("Runway key length:", runwayKey.length);
    console.log("Runway key prefix:", runwayKey.substring(0, 8) + "...");

    const response = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${runwayKey}`,
        "X-Runway-Version": "2024-11-06"
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptImage: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698a65d39f71b549aa7af83f/e8b7b7b5d_generated_image.png",
        promptText: "Subtle cinematic motion, slow camera movement",
        duration: 5,
        ratio: "1280:720"
      })
    });

    const text = await response.text();
    console.log("Runway status:", response.status);
    console.log("Runway response:", text);

    return Response.json({ status: response.status, body: text });
  } catch (error) {
    console.error("testRunway error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});