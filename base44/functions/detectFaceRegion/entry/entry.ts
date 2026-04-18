import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// DETECT FACE REGION — Claude Vision face detection for smart crop
//
// Input:  { image_url } — URL of a video frame screenshot
//         OR { image_base64 } — base64 encoded frame
// Output: { faces: [...], primary_face: { x_center_percent, y_center_percent, ... } }
//
// Used by ExportEngine to position the 9:16 crop window so the
// speaker stays centered both horizontally AND vertically.
// ══════════════════════════════════════════════════════════════════

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

function clamp(n: number, lo = 0, hi = 100) {
  if (!Number.isFinite(n)) return 50;
  return Math.max(lo, Math.min(hi, n));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, image_base64 } = await req.json();

    if (!image_url && !image_base64) {
      return Response.json({ error: 'image_url or image_base64 required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

    // Build image block for Claude
    let imageBlock: any;
    if (image_base64) {
      imageBlock = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: image_base64 },
      };
    } else {
      imageBlock = {
        type: 'image',
        source: { type: 'url', url: image_url },
      };
    }

    const systemPrompt = `You are a computer-vision assistant specialized in detecting human faces in video frames for 9:16 vertical reframing.

Your job: find the person most likely speaking to the camera — the "primary subject" — and report the CENTER of their face as a percentage of the image width/height.

Rules:
- If multiple people are visible, pick the one with the largest face OR the one whose mouth appears open / who looks engaged with the camera.
- If no face is visible, return an empty faces array.
- Values are PERCENTAGES (0-100) of the image dimensions, where (0,0) is the top-left corner.
- Return ONLY valid JSON, no prose.`;

    const userPrompt = `Analyze this video frame and return the face position.

Return this exact JSON shape:
{
  "faces": [
    {
      "x_center_percent": 52,
      "y_center_percent": 38,
      "width_percent": 14,
      "height_percent": 20,
      "is_speaking": true
    }
  ]
}

If no faces: { "faces": [] }`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [imageBlock, { type: 'text', text: userPrompt }],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude API Error ${response.status}: ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let jsonStr = text;
    if (text.includes('```json')) {
      jsonStr = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonStr = text.split('```')[1].split('```')[0].trim();
    }

    let result: any;
    try {
      result = JSON.parse(jsonStr);
    } catch (_e) {
      console.warn('Claude returned unparseable response:', text.substring(0, 200));
      return Response.json({ success: true, faces: [], primary_face: null, face_count: 0 });
    }

    const faces = Array.isArray(result.faces) ? result.faces : [];

    // Validate + normalize each face
    const validFaces = faces
      .map((f: any) => ({
        x_center_percent: clamp(Number(f.x_center_percent)),
        y_center_percent: clamp(Number(f.y_center_percent)),
        width_percent: clamp(Number(f.width_percent ?? 15), 1, 100),
        height_percent: clamp(Number(f.height_percent ?? 20), 1, 100),
        is_speaking: !!f.is_speaking,
      }))
      .filter((f: any) =>
        f.width_percent > 2 && f.height_percent > 2 && // not a dot
        f.x_center_percent > 0 && f.x_center_percent < 100 &&
        f.y_center_percent > 0 && f.y_center_percent < 100
      );

    // Pick primary: speaking > largest
    let primary = null;
    if (validFaces.length > 0) {
      const speaking = validFaces.find((f: any) => f.is_speaking);
      const largest = validFaces.reduce((a: any, b: any) =>
        (a.width_percent * a.height_percent) > (b.width_percent * b.height_percent) ? a : b
      );
      primary = speaking || largest;
    }

    console.log(`👤 Claude detected ${validFaces.length} face(s)${primary ? `, primary at x=${primary.x_center_percent}% y=${primary.y_center_percent}%` : ''}`);

    return Response.json({
      success: true,
      faces: validFaces,
      primary_face: primary,
      face_count: validFaces.length,
    });

  } catch (error) {
    console.error('❌ detectFaceRegion error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});