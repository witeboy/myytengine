import { base44 } from '@/api/base44Client';

// ══════════════════════════════════════════════════════════════════
// Frontend ASR Transcription — submit/poll pattern
// ══════════════════════════════════════════════════════════════════
// Avoids backend CPU time limits by doing the polling loop
// in the browser instead of in the Deno function.
// ══════════════════════════════════════════════════════════════════

const POLL_INTERVAL = 3000;  // 3s between polls
const POLL_TIMEOUT = 180000; // 3 min max

/**
 * Transcribe a voiceover URL using AssemblyAI via submit/poll backend functions.
 * @param {string} voiceoverUrl
 * @param {function} [onProgress] - optional callback({ phase, message, pollCount })
 * Returns { words: [{word, start, end}], word_count, confidence } or throws.
 */
export async function transcribeVoiceover(voiceoverUrl, onProgress) {
  // Step 1: Submit the transcription job (fast, <2s)
  const submitRes = await base44.functions.invoke('submitTranscription', {
    voiceover_url: voiceoverUrl,
  });

  const submitData = submitRes.data;
  if (!submitData?.success || !submitData?.transcript_id) {
    throw new Error(submitData?.error || 'Failed to submit transcription');
  }

  const transcriptId = submitData.transcript_id;
  console.log(`[ASR] Job submitted: ${transcriptId}`);
  onProgress?.({ phase: 'submitted', message: 'Audio submitted — waiting for speech recognition…', pollCount: 0 });

  // Step 2: Poll for completion (in browser — no CPU limit)
  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    if (Date.now() - startTime > POLL_TIMEOUT) {
      throw new Error('Transcription timed out after 3 minutes');
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    pollCount++;

    onProgress?.({ phase: 'processing', message: `Recognizing speech… (${pollCount * 3}s)`, pollCount });

    const pollRes = await base44.functions.invoke('pollTranscription', {
      transcript_id: transcriptId,
    });

    const pollData = pollRes.data;

    if (pollData?.status === 'completed') {
      onProgress?.({ phase: 'done', message: `Done — ${pollData.word_count} words detected`, pollCount });
      console.log(`[ASR] Complete: ${pollData.word_count} words, confidence: ${((pollData.confidence || 0) * 100).toFixed(0)}%`);
      return {
        success: true,
        words: pollData.words,
        word_count: pollData.word_count,
        confidence: pollData.confidence,
        duration: pollData.duration,
      };
    }

    if (pollData?.status === 'error') {
      throw new Error(pollData.error || 'Transcription failed');
    }

    // Still processing — continue polling
    console.log(`[ASR] Status: ${pollData?.status}...`);
  }
}