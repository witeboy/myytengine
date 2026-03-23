// Shared YouTube resumable upload function
export async function uploadToYouTube({ accessToken, file, metadata, thumbnailBlob, onProgress }) {
  // Step 1: Init resumable upload
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': file.size,
      'X-Upload-Content-Type': file.type || 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: (metadata.title || 'Untitled').slice(0, 100),
        description: (metadata.description || '').slice(0, 5000),
        ...((() => {
          const cleaned = (Array.isArray(metadata.tags) ? metadata.tags : [])
            .map(t => String(t).replace(/[<>"#&\\{}|^~`\[\]]/g, '').replace(/\s+/g, ' ').trim())
            .filter(t => t && t.length >= 2 && t.length <= 100);
          return cleaned.length > 0 ? { tags: cleaned } : {};
        })()),
        categoryId: metadata.categoryId || '22',
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: metadata.privacy || 'private',
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`YouTube init failed (${initRes.status}): ${err}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from YouTube');

  // Step 2: Upload in 5MB chunks
  const CHUNK_SIZE = 5 * 1024 * 1024;
  let offset = 0;
  let videoId = null;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.size,
        'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
      },
      body: chunk,
    });

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const data = await chunkRes.json();
      videoId = data.id;
      onProgress?.(100);
      break;
    } else if (chunkRes.status === 308) {
      const range = chunkRes.headers.get('Range');
      if (range) {
        offset = parseInt(range.split('-')[1]) + 1;
        onProgress?.(Math.round((offset / file.size) * 95));
      } else {
        offset = end;
        onProgress?.(Math.round((end / file.size) * 95));
      }
    } else {
      const err = await chunkRes.text();
      throw new Error(`Upload chunk failed (${chunkRes.status}): ${err}`);
    }
  }

  if (!videoId) throw new Error('Upload completed but no video ID returned');

  // Step 3: Set thumbnail
  if (thumbnailBlob && videoId) {
    try {
      await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': thumbnailBlob.type || 'image/jpeg',
        },
        body: thumbnailBlob,
      });
    } catch (e) { console.warn('Thumbnail upload failed:', e.message); }
  }

  return { videoId, url: `https://youtu.be/${videoId}` };
}

// Sanitize tags for YouTube API
export function sanitizeTags(rawTagString) {
  const rawTags = rawTagString
    .split(',')
    .map(t => t.trim().replace(/[<>"#&\\{}|^~`\[\]]/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t && t.length >= 2 && t.length <= 100);
  const tagArray = [];
  let totalLen = 0;
  for (const t of rawTags) {
    if (totalLen + t.length + 2 > 500) break;
    tagArray.push(t);
    totalLen += t.length + 2;
  }
  return tagArray;
}