import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// DETECT FACE REGION — Gemini Vision face detection for smart crop
//
// Input:  { image_url } — URL of a video frame screenshot
//         OR { image_base64 } — base64 encoded frame
// Output: { faces: [{ x, y, width, height, confidence }], primary_face }
//
// The primary_face.x_center_percent is used to position the 9:16
// crop window so the speaker stays centered.
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, image_base64, frame_width, frame_height } = await req.json();

    if (!image_url && !image_base64) {
      return Response.json({ error: 'image_url or image_base64 required' }, { status: 400 });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    // Build Gemini request with vision
    const parts: any[] = [];

    if (image_base64) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: image_base64,
        }
      });
    } else {
      // Fetch image and convert to base64
      const imgRes = await fetch(image_url);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const imgBuffer = await imgRes.arrayBuffer();
      const imgBytes = new Uint8Array(imgBuffer);
      let binary = '';
      for (let i = 0; i < imgBytes.length; i++) {
        binary += String.fromCharCode(imgBytes[i]);
      }
      const b64 = btoa(binary);

      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: b64,
        }
      });
    }

    parts.push({
      text: `Detect all human faces in this video frame. For each face, return its bounding box as a percentage of the image dimensions.

Return ONLY valid JSON:
{
  "faces": [
    {
      "x_percent": 45,
      "y_percent": 15,
      "width_percent": 12,
      "height_percent": 18,
      "is_speaking": true
    }
  ]
}

x_percent and y_percent are the TOP-LEFT corner of the bounding box.
width_percent and height_percent are the size of the box.
All values are percentages of image width/height (0-100).
is_speaking: true if the mouth appears open or the person seems to be talking.
If no faces are found, return { "faces": [] }.`
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error: ${err.error?.message || response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON
    let jsonStr = text;
    if (text.includes('```json')) {
      jsonStr = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonStr = text.split('```')[1].split('```')[0].trim();
    }

    const result = JSON.parse(jsonStr);
    const faces = result.faces || [];

    // Determine primary face (largest or speaking)
    let primaryFace = null;
    if (faces.length > 0) {
      const speaking = faces.find((f: any) => f.is_speaking);
      const largest = faces.reduce((a: any, b: any) =>
        (a.width_percent * a.height_percent) > (b.width_percent * b.height_percent) ? a : b
      );
      primaryFace = speaking || largest;
    }

    const primary = primaryFace ? {
      x_center_percent: Math.round(primaryFace.x_percent + primaryFace.width_percent / 2),
      y_center_percent: Math.round(primaryFace.y_percent + primaryFace.height_percent / 2),
      ...primaryFace,
    } : null;

    console.log(`👤 Detected ${faces.length} face(s)${primary ? `, primary at x=${primary.x_center_percent}%` : ''}`);

    return Response.json({
      success: true,
      faces,
      primary_face: primary,
      face_count: faces.length,
    });

  } catch (error) {
    console.error('❌ detectFaceRegion error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
