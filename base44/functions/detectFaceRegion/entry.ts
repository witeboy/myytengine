import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ══════════════════════════════════════════════════════════════════
// DETECT FACE REGION — Gemini Vision face detection for smart crop
//
// Input:  { image_url } — URL of a video frame screenshot
//         OR { image_base64 } — base64 encoded frame
// Output: { faces: [...], primary_face: { x_center_percent, y_center_percent, ... } }
// ══════════════════════════════════════════════════════════════════

function clamp(n, lo = 0, hi = 100) {
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

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    // Build inline image data for Gemini
    let b64 = image_base64;
    if (!b64) {
      const imgRes = await fetch(image_url);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      b64 = btoa(binary);
    }

    const prompt = `You are a computer-vision assistant detecting human faces in video frames for 9:16 vertical reframing.

Find the person most likely speaking to the camera — the "primary subject" — and report the CENTER of their face as a percentage of image width/height, where (0,0) is the top-left corner.

Look carefully at THIS specific image and measure the actual face position. Do NOT guess or use typical values.

Return ONLY this exact JSON shape (numbers must be your real measurements from this image), no prose:
{
  "faces": [
    {
      "x_center_percent": <measured horizontal center of the face, 0-100>,
      "y_center_percent": <measured vertical center of the face, 0-100>,
      "width_percent": <measured face width, 0-100>,
      "height_percent": <measured face height, 0-100>,
      "is_speaking": <true|false>
    }
  ]
}

If no faces: { "faces": [] }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: b64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let jsonStr = text;
    if (text.includes('```json')) {
      jsonStr = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonStr = text.split('```')[1].split('```')[0].trim();
    }

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (_e) {
      console.warn('Gemini returned unparseable response:', text.substring(0, 200));
      return Response.json({ success: true, faces: [], primary_face: null, face_count: 0 });
    }

    const faces = Array.isArray(result.faces) ? result.faces : [];

    // Validate + normalize each face
    const validFaces = faces
      .map((f) => ({
        x_center_percent: clamp(Number(f.x_center_percent)),
        y_center_percent: clamp(Number(f.y_center_percent)),
        width_percent: clamp(Number(f.width_percent ?? 15), 1, 100),
        height_percent: clamp(Number(f.height_percent ?? 20), 1, 100),
        is_speaking: !!f.is_speaking,
      }))
      .filter((f) =>
        f.width_percent > 2 && f.height_percent > 2 &&
        f.x_center_percent > 0 && f.x_center_percent < 100 &&
        f.y_center_percent > 0 && f.y_center_percent < 100
      );

    // Pick primary: speaking > largest
    let primary = null;
    if (validFaces.length > 0) {
      const speaking = validFaces.find((f) => f.is_speaking);
      const largest = validFaces.reduce((a, b) =>
        (a.width_percent * a.height_percent) > (b.width_percent * b.height_percent) ? a : b
      );
      primary = speaking || largest;
    }

    console.log(`👤 Gemini detected ${validFaces.length} face(s)${primary ? `, primary at x=${primary.x_center_percent}% y=${primary.y_center_percent}%` : ''}`);

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