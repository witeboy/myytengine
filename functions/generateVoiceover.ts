import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — Dual Provider
//
// MiniMax Direct: Sync, instant audio, uploads to R2
// AI33 Pro:       Async, submit + poll via pollVoiceover
//
// Frontend sends provider: 'minimax_direct' or 'ai33'
// ══════════════════════════════════════════════════════════════════

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
      secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
    },
  });
}

async function uploadToR2(audioBytes, fileName) {
  const r2 = getR2Client();
  await r2.send(new PutObjectCommand({
    Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
    Key: fileName,
    Body: audioBytes,
    ContentType: 'audio/mpeg',
  }));
  const publicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
  return `${publicUrl}/${fileName}`;
}

function cleanScript(text, isSleepMode = false) {
  let cleaned = text;
  if (isSleepMode) {
    cleaned = cleaned.replace(/\[(PAUSE\s+(\d+)\s*(?:SEC(?:ONDS?)?)?)\]/gi, (_, _c, seconds) => {
      const sec = parseInt(seconds) || 3;
      const groups = Math.ceil(sec / 3);
      return ' ' + Array(groups).fill('... ... ...').join(' ') + ' ';
    });
    cleaned = cleaned.replace(/\[BREATHE\]/gi, ' ... ... ... ... ');
  } else {
    cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  }
  cleaned = cleaned
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id, provider: requestedProvider } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    if (!MINIMAX_KEY && !AI33_KEY) {
      return Response.json({ error: 'No TTS API keys configured' }, { status: 500 });
    }

    // ── Load project + script ───────────────────────────────────
    const [projects, allScripts] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scripts.filter({ project_id }),
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final_aggregated script found.' }, { status: 400 });
    }

    const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const cleanedText = cleanScript(script.full_script, isSleepMode);
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

    const defaultVoice = isSleepMode ? 'English_calm_female' : 'English_expressive_narrator';
    const selectedVoiceId = voice_id || defaultVoice;
    const isElevenlabs = /^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId);

    // Determine which provider to use
    const useMinimax = requestedProvider === 'minimax_direct' && MINIMAX_KEY && !isElevenlabs;
    const useAI33 = !useMinimax;

    console.log(`🎙 Voiceover: ${wordCount} words, ${cleanedText.length} chars, voice=${selectedVoiceId}, provider=${useMinimax ? 'minimax_direct' : 'ai33'}`);

    // ── Load settings ───────────────────────────────────────────
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    let settings = settingsList[0];

    // ════════════════════════════════════════════════════════════
    // PATH A: MiniMax Direct (sync — instant audio)
    // ════════════════════════════════════════════════════════════
    if (useMinimax) {
      console.log(`📍 MiniMax Direct: ${cleanedText.length} chars`);

      try {
        const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_KEY}`,
          },
          body: JSON.stringify({
            model: 'speech-2.8-hd',
            text: cleanedText,
            stream: false,
            voice_setting: {
              voice_id: selectedVoiceId,
              speed: 1.0,
              vol: 1.0,
              pitch: 0,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: 'mp3',
              channel: 1,
            },
            output_format: 'hex',
          }),
        });

        const data = await response.json();

        if (data.base_resp?.status_code === 0 && data.data?.audio) {
          const audioHex = data.data.audio;
          const bytes = new Uint8Array(audioHex.length / 2);
          for (let i = 0; i < audioHex.length; i += 2) {
            bytes[i / 2] = parseInt(audioHex.substr(i, 2), 16);
          }
          console.log(`✅ MiniMax audio: ${(bytes.length / 1024).toFixed(0)} KB`);

          // Upload to R2
          const fileName = `voiceover/${project_id}_${Date.now()}.mp3`;
          const voiceoverUrl = await uploadToR2(bytes, fileName);
          console.log(`✅ Uploaded: ${voiceoverUrl}`);

          // Save to DB
          const payload = {
            project_id,
            selected_voice_id: selectedVoiceId,
            voiceover_status: 'completed',
            voiceover_url: voiceoverUrl,
            generation_task_id: '',
            voiceover_chunks: '',
            voiceover_total_chunks: 0,
            voiceover_completed_chunks: 0,
          };

          if (settings) {
            await base44.asServiceRole.entities.ProductionSettings.update(settings.id, payload);
          } else {
            await base44.asServiceRole.entities.ProductionSettings.create(payload);
          }

          try {
            await base44.asServiceRole.entities.Projects.update(project_id, { voiceover_url: voiceoverUrl });
          } catch (e) {}

          return Response.json({
            success: true,
            provider: 'minimax_direct',
            voiceover_url: voiceoverUrl,
            word_count: wordCount,
            status: 'completed',
            instant: true,
          });
        }

        const errMsg = data.base_resp?.status_msg || JSON.stringify(data).substring(0, 200);
        throw new Error(`MiniMax: ${errMsg}`);

      } catch (minimaxErr) {
        console.warn(`⚠ MiniMax failed: ${minimaxErr.message}`);

        // If AI33 key exists, fall back to it
        if (AI33_KEY) {
          console.log('Falling back to AI33...');
          // Fall through to PATH B
        } else {
          return Response.json({ error: `MiniMax failed: ${minimaxErr.message}` }, { status: 500 });
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // PATH B: AI33 Async (submit task → poll via pollVoiceover)
    // ════════════════════════════════════════════════════════════
    if (!AI33_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    console.log(`📍 AI33 Async: ${cleanedText.length} chars`);

    const isEl = isElevenlabs;
    let submitUrl, submitBody;

    if (isEl) {
      submitUrl = `https://api.ai33.pro/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`;
      submitBody = JSON.stringify({
        text: cleanedText,
        model_id: 'eleven_multilingual_v2',
      });
    } else {
      submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
      submitBody = JSON.stringify({
        text: cleanedText,
        model: 'speech-2.6-hd',
        voice_setting: { voice_id: selectedVoiceId, vol: 1, pitch: 0, speed: 1 },
        language_boost: 'Auto',
      });
    }

    const submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
      body: submitBody,
    });

    const submitData = await submitRes.json();

    if (!submitData.success || !submitData.task_id) {
      throw new Error(`AI33 submit failed: ${JSON.stringify(submitData).substring(0, 300)}`);
    }

    const taskId = submitData.task_id;
    console.log(`✅ AI33 task: ${taskId}`);

    // Save to DB
    const payload = {
      project_id,
      selected_voice_id: selectedVoiceId,
      voiceover_status: 'generating',
      generation_task_id: taskId,
      voiceover_url: '',
      voiceover_chunks: '',
      voiceover_total_chunks: 0,
      voiceover_completed_chunks: 0,
    };

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, payload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(payload);
    }

    return Response.json({
      success: true,
      provider: 'ai33_async',
      task_id: taskId,
      word_count: wordCount,
      char_count: cleanedText.length,
      status: 'generating',
      instant: false,
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});