import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download, X, Film, Monitor, Smartphone, AlertTriangle,
  CheckCircle, Loader2, HardDrive, Zap, Server,
} from 'lucide-react';
import { saveExportedVideo } from '@/utils/videoStorage';
import { useExport } from '@/lib/ExportContext';
import { makeFileBase } from '@/lib/fileNaming';
import { base44 } from '@/api/base44Client';

const PHASE_LABELS = {
  checking:   'Checking browser support...',
  loading:    'Loading scene media...',
  encoding:   'Encoding video frames...',
  audio:      'Mixing & encoding audio...',
  finalizing: 'Finalizing MP4...',
  done:       'Export complete!',
};

// ─── FFmpeg quality → resolution map (mirrors QUALITY_PRESETS in useVideoExport) ──
const FFMPEG_QUALITY = {
  '480p':  { width: 854,  height: 480  },
  '720p':  { width: 1280, height: 720  },
  '1080p': { width: 1920, height: 1080 },
  '4k':    { width: 3840, height: 2160 },
};
const FFMPEG_QUALITY_PORTRAIT = {
  '480p':  { width: 480,  height: 854  },
  '720p':  { width: 720,  height: 1280 },
  '1080p': { width: 1080, height: 1920 },
  '4k':    { width: 2160, height: 3840 },
};

export default function VideoExporter({
  open,
  onClose,
  scenes,
  orientation,
  voiceoverUrl,
  musicUrl,
  musicVolume,
  projectName,
  projectNiche,
  projectId,
  exportHook,
  captions,
  musicClips,
}) {
  const [quality,     setQuality]     = useState('1080p');
  const [fps,         setFps]         = useState(30);
  const [aspectRatio, setAspectRatio] = useState(orientation === 'portrait' ? '9:16' : '16:9');
  const [watermark,   setWatermark]   = useState(false);

  // FFmpeg export state
  const [ffmpegExporting,  setFfmpegExporting]  = useState(false);
  const [ffmpegProgress,   setFfmpegProgress]   = useState(0);
  const [ffmpegPhase,      setFfmpegPhase]      = useState('');
  const [ffmpegError,      setFfmpegError]      = useState(null);
  const [ffmpegDownloadUrl, setFfmpegDownloadUrl] = useState(null);
  const [ffmpegFileSize,   setFfmpegFileSize]   = useState(null);
  const [ffmpegCancelled,  setFfmpegCancelled]  = useState(false);

  const { exporting, progress, phase, error, exportVideo, checkSupport, cancel } = exportHook;
  const [downloadUrl,  setDownloadUrl]  = useState(null);
  const [unsupported,  setUnsupported]  = useState(null);
  const [fileSize,     setFileSize]     = useState(null);
  const exportCtx = useExport();

  // Sync local export progress to global context so it persists across navigation
  useEffect(() => {
    if (exportCtx && projectId && exporting) {
      exportCtx.updateJob(projectId, { progress, phase });
    }
  }, [progress, phase, exporting, projectId]);

  if (!open) return null;

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || s.duration_seconds || 8), 0);
  const totalFrames   = Math.ceil(totalDuration * fps);
  const isPortrait    = aspectRatio === '9:16';
  const anyExporting  = exporting || ffmpegExporting;

  // ─────────────────────────────────────────────────────────────────
  // WEBCODES EXPORT (existing path, unchanged)
  // ─────────────────────────────────────────────────────────────────
  const handleExport = async (forceExport = false) => {
    setDownloadUrl(null);
    setFileSize(null);

    if (!forceExport) {
      setUnsupported(null);
      const support = await checkSupport(quality, isPortrait ? 'portrait' : 'landscape');
      if (!support.supported) { setUnsupported(support.reason); return; }
      if (support.warning)    { setUnsupported(support.reason); return; }
    } else {
      setUnsupported(null);
    }

    if (exportCtx && projectId) exportCtx.startJob(projectId, projectName || 'Video');

    const exportOrientation = isPortrait ? 'portrait' : 'landscape';

    const blob = await exportVideo(scenes, {
      quality,
      orientation: exportOrientation,
      aspectRatio,
      fps,
      voiceoverUrl,
      musicUrl,
      musicVolume,
      musicClips: musicClips || [],
      watermark,
      captions: captions || [],
    });

    if (blob) {
      const fileBase       = makeFileBase(projectName, projectNiche);
      const exportFilename = `${fileBase}-${quality}-export.mp4`;
      const url            = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFileSize((blob.size / (1024 * 1024)).toFixed(1));

      const a = document.createElement('a');
      a.href = url; a.download = exportFilename;
      document.body.appendChild(a); a.click(); a.remove();

      if (exportCtx && projectId) {
        await exportCtx.completeJob(projectId, blob, exportFilename);
      } else if (projectId) {
        saveExportedVideo(String(projectId), blob, exportFilename).catch(err =>
          console.error('[Export] IndexedDB save FAILED:', err)
        );
      }
    } else if (exportCtx && projectId) {
      exportCtx.failJob(projectId, error || 'Export cancelled or failed');
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // FFMPEG SERVER EXPORT
  // Sends scene list + all settings to the Deno exportVideoFFmpeg
  // function, which composes the full video server-side and returns
  // a permanent R2 URL for download. Tab can close — job runs on server.
  // ─────────────────────────────────────────────────────────────────
  const handleFFmpegExport = async () => {
    setFfmpegError(null);
    setFfmpegDownloadUrl(null);
    setFfmpegFileSize(null);
    setFfmpegCancelled(false);
    setFfmpegExporting(true);
    setFfmpegProgress(5);
    setFfmpegPhase('Sending job to server…');

    try {
      const exportOrientation = isPortrait ? 'portrait' : 'landscape';
      const qualityMap = isPortrait ? FFMPEG_QUALITY_PORTRAIT : FFMPEG_QUALITY;
      const { width, height } = qualityMap[quality] || qualityMap['1080p'];

      // Build the scene payload — mirrors what WebCodecs export uses
      const exportScenes = scenes.map((s, i) => ({
        index:              i,
        imageUrl:           s.imageUrl   || s.image_url  || '',
        videoUrl:           s.videoUrl   || s.video_url  || '',
        mediaType:          s.mediaType  || (s.video_url?.startsWith('http') ? 'video' : 'image'),
        duration:           s.duration   || s.duration_seconds || 8,
        playbackRate:       s.playbackRate       ?? 1.0,
        videoDuration:      s.videoDuration       ?? null,
        cinematicMotion:    s.cinematicMotion     || null,
        motionSpeed:        s.motionSpeed         ?? 1.0,
        motionIntensity:    s.motionIntensity      ?? 1.0,
        transition:         s.transition          || null,
        transitionDuration: s.transitionDuration   ?? 0.6,
      }));

      // Build captions payload for ASS subtitle burning
      const captionPayload = (captions || []).map(c => ({
        text:      c.text      || '',
        startTime: c.startTime || 0,
        duration:  c.duration  || 1,
        x:         c.x         ?? 50,
        y:         c.y         ?? 85,
        fontSize:  c.fontSize  ?? 20,
        color:     c.color     || '#FFFFFF',
      }));

      // Music clip positions for precise mixing
      const musicClipPayload = (musicClips || []).map(mc => ({
        startTime:    mc.startTime    || 0,
        duration:     mc.duration     || totalDuration,
        sourceOffset: mc.sourceOffset || 0,
        volume:       mc.volume       ?? musicVolume ?? 0.3,
      }));

      setFfmpegProgress(10);
      setFfmpegPhase('Server compositing scenes…');

      const result = await base44.functions.invoke('exportVideoFFmpeg', {
        scenes:       exportScenes,
        captions:     captionPayload,
        voiceover_url: voiceoverUrl  || null,
        music_url:    musicUrl        || null,
        music_clips:  musicClipPayload,
        music_volume: musicVolume     ?? 0.3,
        quality,
        width,
        height,
        fps,
        orientation:  exportOrientation,
        aspect_ratio: aspectRatio,
        project_id:   projectId      || 'timeline',
        project_name: projectName    || 'Untitled',
      });

      if (result?.error) throw new Error(result.error);
      if (!result?.download_url) throw new Error('No download URL returned from server');

      setFfmpegProgress(100);
      setFfmpegPhase('Done!');
      setFfmpegDownloadUrl(result.download_url);
      setFfmpegFileSize(result.size_mb || '?');

      // Auto-trigger browser download from R2 URL
      const a = document.createElement('a');
      a.href     = result.download_url;
      a.download = result.filename || `${makeFileBase(projectName, projectNiche)}-ffmpeg-${quality}.mp4`;
      a.target   = '_blank';
      document.body.appendChild(a); a.click(); a.remove();

    } catch (err) {
      if (!ffmpegCancelled) {
        console.error('[FFmpeg Export] Failed:', err);
        setFfmpegError(err.message || 'Server export failed');
      }
    } finally {
      setFfmpegExporting(false);
    }
  };

  const handleFFmpegDownloadAgain = () => {
    if (!ffmpegDownloadUrl) return;
    const a = document.createElement('a');
    a.href = ffmpegDownloadUrl;
    a.download = `${makeFileBase(projectName, projectNiche)}-ffmpeg-${quality}.mp4`;
    a.target = '_blank';
    a.click();
  };

  // ─── Shared helpers ───────────────────────────────────────────────
  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href     = downloadUrl;
    a.download = `${makeFileBase(projectName, projectNiche)}-${quality}-export.mp4`;
    a.click();
  };

  const handleClose = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setFileSize(null);
    setUnsupported(null);
    setFfmpegDownloadUrl(null);
    setFfmpegError(null);
    onClose();
  };

  const qualityOptions = [
    { value: '480p',  label: '480p',  desc: 'Fast, small file' },
    { value: '720p',  label: '720p',  desc: 'Good balance'     },
    { value: '1080p', label: '1080p', desc: 'Full HD'          },
    { value: '4k',    label: '4K',    desc: '2160p, large file' },
  ];

  const aspectRatioOptions = [
    { value: '16:9', label: '16:9', desc: 'Landscape', icon: Monitor    },
    { value: '9:16', label: '9:16', desc: 'Portrait',  icon: Smartphone },
    { value: '4:5',  label: '4:5',  desc: 'Social',    icon: Monitor    },
  ];

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-600" />
            Export Video
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={anyExporting}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Info badges */}
          <div className="flex gap-3 text-sm flex-wrap">
            <Badge variant="outline" className="gap-1">
              {isPortrait ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
              {aspectRatio}
            </Badge>
            <Badge variant="outline">{scenes.length} scenes</Badge>
            <Badge variant="outline">{Math.round(totalDuration)}s ({Math.round(totalDuration / 60)} min)</Badge>
            {watermark && <Badge variant="outline" className="text-amber-600 border-amber-300">Watermark ON</Badge>}
          </div>

          {/* Settings — only show when nothing is running or done */}
          {!anyExporting && !downloadUrl && !ffmpegDownloadUrl && (
            <>
              {/* Resolution */}
              <div>
                <p className="text-sm font-medium mb-2">Resolution</p>
                <div className="grid grid-cols-4 gap-2">
                  {qualityOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        quality === opt.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <p className="text-sm font-medium mb-2">Aspect Ratio</p>
                <div className="grid grid-cols-3 gap-2">
                  {aspectRatioOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAspectRatio(opt.value)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        aspectRatio === opt.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <opt.icon className={`w-4 h-4 mx-auto mb-1 ${aspectRatio === opt.value ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[10px] text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate + Watermark */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Frame Rate</p>
                  <div className="flex gap-2">
                    {[24, 30].map(f => (
                      <button
                        key={f}
                        onClick={() => setFps(f)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                          fps === f
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 font-semibold'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Watermark</p>
                  <button
                    onClick={() => setWatermark(!watermark)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm transition-all flex items-center justify-center gap-2 ${
                      watermark
                        ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500 text-amber-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-500'
                    }`}
                  >
                    {watermark ? <><CheckCircle className="w-4 h-4" /> Enabled</> : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Info row */}
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <strong>Estimated:</strong> ~{totalFrames} frames at {quality} ({aspectRatio}) • {Math.round(totalDuration / 60)} min video
                {quality === '4k' && <span className="block mt-1 text-amber-600 font-medium">⚠ 4K is memory-intensive — ensure enough RAM.</span>}
              </div>
            </>
          )}

          {/* WebCodecs warning */}
          {unsupported && !exporting && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{unsupported}</span>
              </div>
              <Button size="sm" variant="outline"
                className="w-full border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                onClick={() => handleExport(true)}
              >
                Try Anyway
              </Button>
            </div>
          )}

          {/* WebCodecs error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* FFmpeg error */}
          {ffmpegError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Server export failed</p>
                <p className="text-xs mt-0.5">{ffmpegError}</p>
              </div>
            </div>
          )}

          {/* WebCodecs in-progress */}
          {exporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                {PHASE_LABELS[phase] || 'Processing...'}
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-gray-500 text-right">{progress}%</p>
              <p className="text-xs text-blue-600 bg-blue-50 rounded-md px-2.5 py-1.5 text-center">
                You can close this dialog — export progress persists in the bottom-right corner.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Minimize</Button>
                <Button variant="outline" size="sm" onClick={cancel} className="flex-1 text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
              </div>
            </div>
          )}

          {/* FFmpeg in-progress */}
          {ffmpegExporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span className="text-orange-700">{ffmpegPhase}</span>
              </div>
              <Progress value={ffmpegProgress} className="h-2 [&>div]:bg-orange-500" />
              <p className="text-xs text-gray-500 text-right">{ffmpegProgress}%</p>
              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5 text-center">
                Running on server — you can close this dialog. Result uploads to R2 when done.
              </p>
              <Button variant="outline" size="sm"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => { setFfmpegCancelled(true); setFfmpegExporting(false); setFfmpegPhase('Cancelled'); }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* WebCodecs done */}
          {downloadUrl && !exporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium text-sm">Browser export complete!</p>
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> {fileSize} MB • {quality} • {fps} FPS
                  </p>
                </div>
              </div>
              <Button onClick={handleDownload} className="w-full bg-green-600 hover:bg-green-700 gap-2">
                <Download className="w-4 h-4" /> Download MP4
              </Button>
              <Button variant="outline" onClick={() => { setDownloadUrl(null); setFileSize(null); }} className="w-full">
                Export Again
              </Button>
            </div>
          )}

          {/* FFmpeg done */}
          {ffmpegDownloadUrl && !ffmpegExporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <CheckCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-medium text-sm">FFmpeg export complete!</p>
                  <p className="text-xs text-orange-600 flex items-center gap-1">
                    <Server className="w-3 h-3" /> {ffmpegFileSize} MB • {quality} • {fps} FPS • Saved to R2
                  </p>
                </div>
              </div>
              <Button onClick={handleFFmpegDownloadAgain} className="w-full bg-orange-500 hover:bg-orange-600 gap-2">
                <Download className="w-4 h-4" /> Download MP4
              </Button>
              <Button variant="outline"
                onClick={() => { setFfmpegDownloadUrl(null); setFfmpegFileSize(null); setFfmpegError(null); }}
                className="w-full"
              >
                Export Again
              </Button>
            </div>
          )}

          {/* ── Export buttons — only shown when idle ── */}
          {!anyExporting && !downloadUrl && !ffmpegDownloadUrl && (
            <div className="space-y-2">
              {/* Primary: WebCodecs (browser) */}
              <Button
                onClick={() => handleExport()}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={scenes.length === 0}
              >
                <Zap className="w-4 h-4" />
                Export MP4 — Browser ({quality}, {aspectRatio}, {fps}fps)
              </Button>

              {/* Secondary: FFmpeg (server) */}
              <Button
                onClick={handleFFmpegExport}
                className="w-full bg-orange-500 hover:bg-orange-600 gap-2"
                disabled={scenes.length === 0}
              >
                <Server className="w-4 h-4" />
                Export MP4 — FFmpeg Server ({quality}, {aspectRatio}, {fps}fps)
              </Button>

              {/* Explainer */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 pt-1">
                <div className="bg-blue-50 rounded p-2 border border-blue-100">
                  <p className="font-semibold text-blue-700 mb-0.5">Browser (WebCodecs)</p>
                  <p>Best for short videos under 8 min. Runs locally, no server needed. Tab must stay open.</p>
                </div>
                <div className="bg-orange-50 rounded p-2 border border-orange-100">
                  <p className="font-semibold text-orange-700 mb-0.5">FFmpeg Server</p>
                  <p>Best for long videos. 5–20× faster. Runs on server — tab can close. Result saved to R2.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}