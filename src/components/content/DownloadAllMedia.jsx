import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2, Package, CheckCircle2 } from 'lucide-react';

export default function DownloadAllMedia({ scenes, voiceoverUrl, musicUrl, projectName }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });

  const handleDownloadAll = async () => {
    setDownloading(true);

    const items = [];

    // Collect images
    scenes.forEach(s => {
      if (s.image_url && s.image_url.startsWith('http')) {
        items.push({
          url: s.image_url,
          name: `scene-${String(s.scene_number).padStart(3, '0')}-image.png`,
          type: 'image'
        });
      }
    });

    // Collect videos
    scenes.forEach(s => {
      if (s.video_url && s.video_url.startsWith('http') && !s.video_url.startsWith('veo_task:')) {
        items.push({
          url: s.video_url,
          name: `scene-${String(s.scene_number).padStart(3, '0')}-video.mp4`,
          type: 'video'
        });
      }
    });

    // Voiceover
    if (voiceoverUrl) {
      items.push({ url: voiceoverUrl, name: 'voiceover.mp3', type: 'audio' });
    }

    // Music
    if (musicUrl) {
      items.push({ url: musicUrl, name: 'background-music.mp3', type: 'audio' });
    }

    if (items.length === 0) {
      setDownloading(false);
      return;
    }

    setProgress({ current: 0, total: items.length, label: 'Starting downloads...' });

    // Download each file with staggered timing to avoid browser blocking
    const safeName = (projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgress({ current: i + 1, total: items.length, label: `Downloading ${item.name}...` });

      try {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = `${safeName}-${item.name}`;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.warn(`Failed to download ${item.name}:`, err.message);
      }

      // Stagger downloads to avoid browser popup blockers
      await new Promise(r => setTimeout(r, 600));
    }

    setProgress({ current: items.length, total: items.length, label: `Done! ${items.length} files downloaded.` });

    setTimeout(() => {
      setDownloading(false);
      setProgress({ current: 0, total: 0, label: '' });
    }, 3000);
  };

  const imageCount = scenes.filter(s => s.image_url?.startsWith('http')).length;
  const videoCount = scenes.filter(s => s.video_url?.startsWith('http') && !s.video_url?.startsWith('veo_task:')).length;
  const totalFiles = imageCount + videoCount + (voiceoverUrl ? 1 : 0) + (musicUrl ? 1 : 0);

  if (totalFiles === 0) return null;

  return (
    <div className="bg-white border rounded-lg p-4 mb-6">
      <div className="flex items-center gap-3">
        <Package className="w-5 h-5 text-blue-600" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            Download All Media ({totalFiles} files)
          </p>
          <p className="text-xs text-gray-500">
            {imageCount} images · {videoCount} videos
            {voiceoverUrl ? ' · voiceover' : ''}
            {musicUrl ? ' · music' : ''}
          </p>
        </div>

        {downloading ? (
          <div className="flex items-center gap-2 min-w-[200px]">
            {progress.current === progress.total ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            )}
            <div className="flex-1">
              <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
              <p className="text-[10px] text-gray-500 mt-0.5">{progress.label}</p>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={handleDownloadAll} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
            <Download className="w-4 h-4" /> Download All
          </Button>
        )}
      </div>
    </div>
  );
}