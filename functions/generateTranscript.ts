import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Uses AssemblyAI to transcribe voiceover audio and extract word-level timings

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

async function submitTranscription(apiKey, audioUrl) {
  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
    }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Transcription submit failed: ${JSON.stringify(data)}`);
  console.log(`Transcription submitted: ${data.id}`);
  return data.id;
}

async function pollTranscription(apiKey, transcriptId, maxAttempts = 60, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs));

    const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
      headers: { 'Authorization': apiKey },
    });
    const data = await res.json();
    console.log(`Poll ${i + 1}: status=${data.status}`);

    if (data.status === 'completed') {
      return data;
    }
    if (data.status === 'error') {
      throw new Error(`Transcription failed: ${data.error}`);
    }
  }
  throw new Error('Transcription timed out');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!API_KEY) return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured' }, { status: 500 });

    // Get voiceover URL from production settings
    const settings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const voiceoverUrl = settings[0]?.voiceover_url;
    if (!voiceoverUrl) {
      return Response.json({ error: 'No voiceover found for this project' }, { status: 400 });
    }

    // Check if transcript already exists
    const existing = await base44.asServiceRole.entities.Transcripts.filter({ project_id });
    let transcriptRecord;
    if (existing.length > 0) {
      transcriptRecord = existing[0];
      await base44.asServiceRole.entities.Transcripts.update(transcriptRecord.id, { status: 'processing' });
    } else {
      transcriptRecord = await base44.asServiceRole.entities.Transcripts.create({
        project_id,
        status: 'processing',
      });
    }

    // Submit to AssemblyAI
    const transcriptId = await submitTranscription(API_KEY, voiceoverUrl);

    // Poll until complete
    const result = await pollTranscription(API_KEY, transcriptId);

    // Extract word-level timings
    const words = (result.words || []).map(w => ({
      word: w.text,
      start: w.start / 1000, // Convert ms to seconds
      end: w.end / 1000,
    }));

    const fullText = words.map(w => w.word).join(' ');
    console.log(`Transcript complete: ${words.length} words`);

    // Save to entity
    await base44.asServiceRole.entities.Transcripts.update(transcriptRecord.id, {
      word_timings: JSON.stringify(words),
      full_text: fullText,
      total_words: words.length,
      status: 'ready',
    });

    return Response.json({
      success: true,
      total_words: words.length,
      transcript_id: transcriptRecord.id,
    });

  } catch (error) {
    console.error(`generateTranscript error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});