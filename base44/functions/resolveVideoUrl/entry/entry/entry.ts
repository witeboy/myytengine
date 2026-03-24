import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import ytdl from 'npm:@distube/ytdl-core@4.16.4';

// ══════════════════════════════════════════════════════════════════
// RESOLVE VIDEO URL — Extract direct stream URL from YouTube link
//
// Input:  { url } — YouTube URL (full, short, or Shorts)
// Output: { stream_url, title, duration, thumbnail, channel }
//
// Does NOT download the video — just resolves the playable URL
// so the browser can stream it directly for clipping.
// Also returns audio_url for ASR transcription.
// ══════════════════════════════════════════════════════════════════

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pat of patterns) {
    const match = url.match(pat);
    if (match) return match[1];
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) {
      return Response.json({ error: 'Invalid YouTube URL. Supported: youtube.com/watch, youtu.be, youtube.com/shorts' }, { status: 400 });
    }

    console.log(`🔗 Resolving video: ${videoId}`);

    const info = await ytdl.getInfo(videoId);
    const { title, lengthSeconds, author, thumbnails } = info.videoDetails;

    // Get best combined format (video + audio) for browser playback
    const combinedFormats = info.formats
      .filter((f: any) => f.hasVideo && f.hasAudio && f.container === 'mp4')
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    // Get best audio-only format for ASR transcription
    const audioFormats = info.formats
      .filter((f: any) => f.hasAudio && !f.hasVideo)
      .sort((a: any, b: any) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    const bestVideo = combinedFormats[0];
    const bestAudio = audioFormats[0];

    if (!bestVideo) {
      return Response.json({ error: 'No playable MP4 format found for this video' }, { status: 400 });
    }

    const duration = parseInt(lengthSeconds) || 0;
    const thumbnail = thumbnails?.length > 0
      ? thumbnails[thumbnails.length - 1].url
      : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    console.log(`✅ Resolved: "${title}" (${Math.floor(duration / 60)}m${duration % 60}s) — ${bestVideo.height}p`);

    return Response.json({
      success: true,
      video_id: videoId,
      title,
      duration,
      channel: author?.name || '',
      thumbnail,
      stream_url: bestVideo.url,
      audio_url: bestAudio?.url || bestVideo.url,
      quality: `${bestVideo.height}p`,
      format: bestVideo.mimeType || 'video/mp4',
    });

  } catch (error) {
    console.error('❌ resolveVideoUrl error:', error.message);

    if (error.message?.includes('private') || error.message?.includes('unavailable')) {
      return Response.json({ error: 'Video is private or unavailable' }, { status: 400 });
    }
    if (error.message?.includes('age')) {
      return Response.json({ error: 'Age-restricted videos are not supported' }, { status: 400 });
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});
