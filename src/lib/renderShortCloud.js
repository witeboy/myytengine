// ══════════════════════════════════════════════════════════════════════
// CLOUD RENDER CLIENT — submits a Short to Creatomate via backend fn
// and polls until it's ready. Returns a downloadable MP4 URL.
//
// Why cloud: browser FFmpeg hits COOP/COEP + cross-origin Worker walls.
// Creatomate runs server-side, returns a finished MP4 in 15-30s.
// ══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 120; // 5 minutes max

export async function renderShortCloud({
  videoUrl,
  startSec,
  endSec,
  words = [],
  captionStyle = 'hormozi_pro',
  title = 'short',
  onProgress,
}) {
  onProgress?.({ percent: 5, message: 'Submitting to cloud renderer…' });

  // 1. Submit render job
  const submitRes = await base44.functions.invoke('renderShortCreatomate', {
    videoUrl,
    startSec,
    endSec,
    words,
    captionStyle,
    title,
  });

  if (submitRes.data?.error) {
    throw new Error(submitRes.data.error);
  }

  const renderId = submitRes.data?.id;
  if (!renderId) {
    throw new Error('No render ID returned from Creatomate');
  }

  // If already done (cached), return immediately
  if (submitRes.data.status === 'succeeded' && submitRes.data.url) {
    onProgress?.({ percent: 100, message: 'Render ready' });
    return { url: submitRes.data.url, id: renderId };
  }

  onProgress?.({ percent: 15, message: 'Rendering in cloud…' });

  // 2. Poll until done
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await base44.functions.invoke('pollCreatomateRender', { id: renderId });
    const data = pollRes.data || {};

    if (data.error) throw new Error(data.error);

    const status = data.status;
    const progress = typeof data.progress === 'number' ? data.progress : 0;

    // Map provider progress (0-1) to our 15-95% range
    const uiPct = Math.min(95, 15 + Math.round(progress * 80));
    onProgress?.({
      percent: uiPct,
      message: status === 'rendering'
        ? `Rendering… ${Math.round(progress * 100)}%`
        : `Status: ${status}`,
    });

    if (status === 'succeeded' && data.url) {
      onProgress?.({ percent: 100, message: 'Render ready' });
      return { url: data.url, id: renderId };
    }

    if (status === 'failed') {
      throw new Error(data.error || 'Render failed on Creatomate');
    }
  }

  throw new Error('Render timed out after 5 minutes');
}

// Trigger a browser download from a URL
export async function downloadShortUrl(url, title, index) {
  const safe = (title || `short_${index + 1}`)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40);

  // Fetch → blob → download to force actual file save (not tab-open)
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${safe}_9x16.mp4`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}