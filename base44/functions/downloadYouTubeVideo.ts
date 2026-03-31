import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — downloadYouTubeVideo using proven Cobalt pattern

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await req.json();
  if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  const cobaltApiUrl = Deno.env.get("COBALT_API_URL");
  if (!cobaltApiUrl) return Response.json({ error: 'COBALT_API_URL not set' }, { status: 400 });

  const apiEndpoint = cobaltApiUrl.endsWith('/') ? cobaltApiUrl : cobaltApiUrl + '/';
  console.log('[DownloadYT] Cobalt endpoint: ' + apiEndpoint);
  console.log('[DownloadYT] URL: ' + url);

  // ── Step 1: Get VIDEO from Cobalt (for browser playback) ──────
  console.log('[DownloadYT] Requesting video...');
  const videoRes = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: url,
      videoQuality: '720',
      youtubeVideoCodec: 'h264',
      filenameStyle: 'basic',
    }),
  });

  console.log('[DownloadYT] Video response status: ' + videoRes.status);
  const videoText = await videoRes.text();
  console.log('[DownloadYT] Video response: ' + videoText.substring(0, 300));

  let videoData;
  try { videoData = JSON.parse(videoText); } catch { videoData = null; }

  let videoUrl = '';
  let videoFilename = '';
  if (videoData && (videoData.status === 'tunnel' || videoData.status === 'redirect' || videoData.status === 'stream')) {
    videoUrl = videoData.url || '';
    videoFilename = videoData.filename || '';
    console.log('[DownloadYT] Video URL obtained (' + videoData.status + ')');
  } else if (videoData && videoData.status === 'picker' && videoData.picker && videoData.picker.length > 0) {
    const item = videoData.picker.find(function(i) { return i.type === 'video'; }) || videoData.picker[0];
    videoUrl = item.url || '';
    console.log('[DownloadYT] Video from picker');
  } else {
    console.log('[DownloadYT] Video extraction failed: ' + (videoData?.error?.code || 'unknown'));
  }

  // ── Step 2: Get AUDIO from Cobalt (for ASR transcription) ─────
  console.log('[DownloadYT] Requesting audio...');
  const audioRes = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: url,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128',
    }),
  });

  console.log('[DownloadYT] Audio response status: ' + audioRes.status);
  const audioText = await audioRes.text();
  console.log('[DownloadYT] Audio response: ' + audioText.substring(0, 300));

  let audioData;
  try { audioData = JSON.parse(audioText); } catch { audioData = null; }

  let cobaltAudioUrl = '';
  if (audioData && (audioData.status === 'tunnel' || audioData.status === 'redirect' || audioData.status === 'stream')) {
    cobaltAudioUrl = audioData.url || '';
    console.log('[DownloadYT] Audio URL obtained (' + audioData.status + ')');
  } else if (audioData && audioData.status === 'picker' && audioData.picker && audioData.picker.length > 0) {
    const item = audioData.picker.find(function(i) { return i.type === 'audio'; }) || audioData.picker[0];
    cobaltAudioUrl = item.url || '';
    console.log('[DownloadYT] Audio from picker');
  }

  // ── Step 3: Download audio from Cobalt → upload to Base44 ─────
  // Cobalt tunnel URLs expire, so we re-upload to Base44 for stable URL
  let stableAudioUrl = cobaltAudioUrl;

  if (cobaltAudioUrl) {
    try {
      console.log('[DownloadYT] Downloading audio from Cobalt tunnel...');
      const dlResponse = await fetch(cobaltAudioUrl);
      if (dlResponse.ok) {
        const audioBuffer = await dlResponse.arrayBuffer();
        console.log('[DownloadYT] Downloaded ' + (audioBuffer.byteLength / 1024 / 1024).toFixed(1) + 'MB');

        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const file = new File([blob], 'audio.mp3', { type: 'audio/mpeg' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        stableAudioUrl = file_url;
        console.log('[DownloadYT] Base44 stable URL: ' + file_url.substring(0, 80));
      } else {
        console.log('[DownloadYT] Audio download failed: ' + dlResponse.status);
      }
    } catch (dlErr) {
      console.log('[DownloadYT] Audio download error: ' + dlErr.message);
    }
  }

  // ── Step 4: Get metadata from oEmbed ──────────────────────────
  let title = videoFilename ? videoFilename.replace(/\.[^.]+$/, '') : '';
  let channel = '';
  let videoId = '';

  const idMatch = url.match(/(?:watch\?v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (idMatch) videoId = idMatch[1];

  if (videoId) {
    try {
      const oembedRes = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json');
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = oembedData.title || title;
        channel = oembedData.author_name || '';
      }
    } catch (e) {
      console.log('[DownloadYT] oEmbed failed: ' + e.message);
    }
  }

  // ── Return result ─────────────────────────────────────────────
  if (!videoUrl && !stableAudioUrl) {
    return Response.json({
      error: 'Could not extract video or audio from this URL. It may be private, age-restricted, or geo-blocked.',
    }, { status: 400 });
  }

  console.log('[DownloadYT] Done! video=' + (videoUrl ? 'yes' : 'no') + ' audio=' + (stableAudioUrl ? 'yes' : 'no'));

  return Response.json({
    success: true,
    video_url: videoUrl,
    audio_url: stableAudioUrl || videoUrl,
    title: title,
    channel: channel,
    video_id: videoId,
    thumbnail: videoId ? ('https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg') : '',
  });
});
