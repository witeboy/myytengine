import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v1 — resolveVideoUrl

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await req.json();
  if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  // Extract video ID from URL
  let videoId = null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pat of patterns) {
    const match = url.match(pat);
    if (match) { videoId = match[1]; break; }
  }

  if (!videoId) {
    return Response.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  console.log(`🔗 Resolving video: ${videoId}`);

  // Step 1: Get metadata from oEmbed
  let oembed = null;
  const oembedUrl = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json';
  const oembedRes = await fetch(oembedUrl);
  if (oembedRes.ok) {
    oembed = await oembedRes.json();
  }

  // Step 2: Get stream URLs from Innertube API
  let streams = null;
  const innertubeRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      videoId: videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.29.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
          userAgent: 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });

  if (innertubeRes.ok) {
    const data = await innertubeRes.json();

    if (data.playabilityStatus && data.playabilityStatus.status === 'OK') {
      const formats = data.streamingData?.formats || [];
      const adaptiveFormats = data.streamingData?.adaptiveFormats || [];
      const dur = parseInt(data.videoDetails?.lengthSeconds || '0');

      // Best combined format (video + audio)
      const combined = formats.filter((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4'));
      combined.sort((a, b) => (b.height || 0) - (a.height || 0));

      // Best audio-only for ASR
      const audioOnly = adaptiveFormats.filter((f) => f.url && f.mimeType && f.mimeType.includes('audio/'));
      audioOnly.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      const bestVideo = combined.length > 0 ? combined[0] : null;
      const bestAudio = audioOnly.length > 0 ? audioOnly[0] : null;

      streams = {
        streamUrl: bestVideo ? bestVideo.url : null,
        audioUrl: bestAudio ? bestAudio.url : (bestVideo ? bestVideo.url : null),
        quality: bestVideo ? (bestVideo.height + 'p') : null,
        duration: dur,
        title: data.videoDetails?.title || '',
        channel: data.videoDetails?.author || '',
      };
    } else {
      console.log('Video not playable: ' + (data.playabilityStatus?.reason || 'unknown'));
    }
  } else {
    console.log('Innertube API returned ' + innertubeRes.status);
  }

  // Build response
  const title = (streams && streams.title) || (oembed && oembed.title) || ('YouTube Video ' + videoId);
  const channel = (streams && streams.channel) || (oembed && oembed.author_name) || '';
  const duration = (streams && streams.duration) || 0;
  const thumbnail = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';

  if (streams && (streams.streamUrl || streams.audioUrl)) {
    console.log(`✅ Resolved: "${title}" (${Math.floor(duration / 60)}m${duration % 60}s) — ${streams.quality}`);

    return Response.json({
      success: true,
      video_id: videoId,
      title: title,
      duration: duration,
      channel: channel,
      thumbnail: thumbnail,
      stream_url: streams.streamUrl || '',
      audio_url: streams.audioUrl || '',
      quality: streams.quality || 'unknown',
      has_streams: true,
    });
  }

  // Fallback: metadata only
  console.log(`⚠️ Metadata only: "${title}"`);

  return Response.json({
    success: true,
    video_id: videoId,
    title: title,
    duration: duration,
    channel: channel,
    thumbnail: thumbnail,
    stream_url: '',
    audio_url: '',
    quality: 'metadata_only',
    has_streams: false,
    message: 'Could not extract stream URLs. Try uploading the file instead.',
  });
});
