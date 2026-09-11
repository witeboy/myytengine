// Cloud clip client. The retired Creatomate functions were removed in Phase 0.
// Keep the existing basic 9:16 fallback contract through the ffmpeg adapter.
import { clipVideoCloud } from '@/lib/directApi';

export async function renderShortCloud({ videoUrl, startSec, endSec, onProgress }) {
  onProgress?.({ percent: 5, message: 'Submitting to cloud renderer…' });
  onProgress?.({ percent: 12, message: 'Cloud captions unavailable, rendering basic 9:16 clip...' });
  const result = await clipVideoCloud({ sourceUrl: videoUrl, start: startSec, end: endSec });
  onProgress?.({ percent: 100, message: 'Basic short ready' });
  return { url: result.clip_url, id: result.job_id || `basic-${Date.now()}`, fallback: true };
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
