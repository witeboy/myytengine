import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download, X, Film, Monitor, Smartphone, AlertTriangle,
  CheckCircle, Loader2, HardDrive, Zap, Cpu,
} from 'lucide-react';
import { saveExportedVideo } from '@/utils/videoStorage';
import { useExport } from '@/lib/ExportContext';
import { makeFileBase } from '@/lib/fileNaming';
import useFFmpegExport from '@/components/timeline/useFFmpegExport';

const PHASE_LABELS = {
  checking:   'Checking browser support...',
  loading:    'Loading scene media...',
  rendering:  'Rendering video frames...',
  encoding:   'Encoding with FFmpeg...',
  audio:      'Mixing & encoding audio...',
  finalizing: 'Finalizing MP4...',
  done:       'Export complete!',
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
  const [quality,     setQuality]     = useState('720p');
  const [fps,         setFps]         = useState(30);
  const [aspectRatio, setAspectRatio] = useState(orientation === 'portrait' ? '9:16' : '16:9');
  const [watermark,   setWatermark]   = useState(false);
  const [activeMode,  setActiveMode]  = useState(null); // 'webcodecs' | 'ffmpeg' | null
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [fileSize,    setFileSize]    = useState(null);
  const [unsupported, setUnsupported] = useState(null);

  // ── Hooks ────────────────────────────────────────────────────────
  const {
    exporting: wcExporting, progress: wcProgress, phase: wcPhase,
    error: wcError, exportVideo: wcExportVideo, checkSupport, cancel: wcCancel,
  } = exportHook;

  const {
    exporting: ffExporting, progress: ffProgress, phase: ffPhase,
    error: ffError, exportVideo: ffExportVideo, cancel: ffCancel,
  } = useFFmpegExport();

  const exportCtx    = useExport();
  const anyExporting = wcExporting || ffExporting;
  const isPortrait   = aspectRatio === '9:16';

  useEffect(() => {
    if (exportCtx && projectId && wcExporting) {
      exportCtx.updateJob(projectId, { progress: wcProgress, phase: wcPhase });
    }
  }, [wcProgress, wcPhase, wcExporting, projectId]);

  if (!open) return null;

  const totalDuration = scenes.reduce((s, c) => s + (c.duration || c.duration_seconds || 8), 0);
  const isLong        = totalDuration > 300;

  // active progress values
  const progress = activeMode === 'ffmpeg' ? ffProgress : wcProgress;
  const phase    = activeMode === 'ffmpeg' ? ffPhase    : wcPhase;
  const curError = activeMode === 'ffmpeg' ? ffError    : wcError;

  // ── Helpers ──────────────────────────────────────────────────────
  const triggerDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleCancel = () => {
    if (activeMode === 'ffmpeg') ffCancel();
    else wcCancel();
    setActiveMode(null);
  };

  const handleClose = () => {
    if (downloadUrl && activeMode !== 'ffmpeg') URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null); setFileSize(null); setUnsupported(null); setActiveMode(null);
    onClose();
  };

  // ── WebCodecs export ─────────────────────────────────────────────
  const handleWebCodecsExport = async (force = false) => {
    setDownloadUrl(null); setFileSize(null); setUnsupported(null);
    setActiveMode('webcodecs');

    if (!force) {
      const support = await checkSupport(quality, isPortrait ? 'portrait' : 'landscape');
      if (!support.supported) { setUnsupported(support.reason); setActiveMode(null); return; }
      if (support.warning)    { setUnsupported(support.reason); setActiveMode(null); return; }
    }

    if (exportCtx && projectId) exportCtx.startJob(projectId, projectName || 'Video');

    const blob = await wcExportVideo(scenes, {
      quality, orientation: isPortrait ? 'portrait' : 'landscape',
      aspectRatio, fps, voiceoverUrl, musicUrl, musicVolume,
      musicClips: musicClips || [], watermark, captions: captions || [],
    });

    if (blob) {
      const filename = `${makeFileBase(projectName, projectNiche)}-${quality}-webcodecs.mp4`;
      const url      = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFileSize((blob.size / 1024 / 1024).toFixed(1));
      triggerDownload(url, filename);
      if (exportCtx && projectId) await exportCtx.completeJob(projectId, blob, filename);
      else if (projectId) saveExportedVideo(String(projectId), blob, filename).catch(console.error);
    } else if (exportCtx && projectId) {
      exportCtx.failJob(projectId, wcError || 'Export failed');
    }
    setActiveMode(null);
  };

  // ── FFmpeg Worker export ─────────────────────────────────────────
  const handleFFmpegExport = async () => {
    setDownloadUrl(null); setFileSize(null); setUnsupported(null);
    setActiveMode('ffmpeg');

    try {
      const result = await ffExportVideo(scenes, {
        quality, orientation: isPortrait ? 'portrait' : 'landscape',
        fps, voiceoverUrl, musicUrl, musicVolume,
        musicClips: musicClips || [], captions: captions || [],
      });

      if (result?.blobUrl) {
        const filename = `${makeFileBase(projectName, projectNiche)}-${quality}-ffmpeg.mp4`;
        setDownloadUrl(result.blobUrl);
        setFileSize((result.sizeBytes / 1024 / 1024).toFixed(1));
        triggerDownload(result.blobUrl, filename);
        if (projectId) {
          const resp = await fetch(result.blobUrl);
          const blob = await resp.blob();
          saveExportedVideo(String(projectId), blob, filename).catch(console.error);
        }
      }
    } catch (err) {
      if (err.message !== 'cancelled') console.error('[FFmpegExport]', err);
    }
    setActiveMode(null);
  };

  // ── Render ───────────────────────────────────────────────────────
  const qualityOptions = [
    { value: '480p',  label: '480p',  desc: 'Fast · small' },
    { value: '720p',  label: '720p',  desc: 'Recommended'  },
    { value: '1080p', label: '1080p', desc: 'Full HD'       },
  ];

  const aspectOptions = [
    { value: '16:9', label: '16:9', desc: 'Landscape', icon: Monitor    },
    { value: '9:16', label: '9:16', desc: 'Portrait',  icon: Smartphone },
    { value: '4:5',  label: '4:5',  desc: 'Social',    icon: Monitor    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-600" /> Export Video
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={anyExporting}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Badges */}
          <div className="flex gap-2 flex-wrap text-sm">
            <Badge variant="outline" className="gap-1">
              {isPortrait ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
              {aspectRatio}
            </Badge>
            <Badge variant="outline">{scenes.length} scenes</Badge>
            <Badge variant="outline">{Math.round(totalDuration)}s · {Math.round(totalDuration / 60)} min</Badge>
            {isLong && <Badge variant="outline" className="text-amber-600 border-amber-300">Long — FFmpeg Worker recommended</Badge>}
          </div>

          {/* Settings */}
          {!anyExporting && !downloadUrl && (
            <>
              <div>
                <p className="text-sm font-medium mb-2">Resolution</p>
                <div className="grid grid-cols-3 gap-2">
                  {qualityOptions.map(opt => (
                    <button key={opt.value} onClick={() => setQuality(opt.value)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${quality === opt.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Aspect Ratio</p>
                <div className="grid grid-cols-3 gap-2">
                  {aspectOptions.map(opt => (
                    <button key={opt.value} onClick={() => setAspectRatio(opt.value)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${aspectRatio === opt.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                      <opt.icon className={`w-4 h-4 mx-auto mb-1 ${aspectRatio === opt.value ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[10px] text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Frame Rate</p>
                <div className="flex gap-2">
                  {[24, 30].map(f => (
                    <button key={f} onClick={() => setFps(f)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${fps === f ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 font-semibold' : 'border-gray-200 hover:border-gray-300'}`}>
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Method comparison */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600 pt-1">
                <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                  <p className="font-semibold text-blue-700 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> WebCodecs</p>
                  <p>Hardware H.264. Fast for short videos under 5 min. Main thread — avoid switching tabs.</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
                  <p className="font-semibold text-purple-700 mb-1 flex items-center gap-1"><Cpu className="w-3 h-3" /> FFmpeg Worker</p>
                  <p>Off main thread. Better for long videos. UI stays responsive while encoding.</p>
                </div>
              </div>
            </>
          )}

          {/* Unsupported warning */}
          {unsupported && !anyExporting && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{unsupported}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                onClick={() => handleWebCodecsExport(true)}>
                Try Anyway
              </Button>
            </div>
          )}

          {/* Error */}
          {curError && !anyExporting && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{curError}</span>
            </div>
          )}

          {/* In progress */}
          {anyExporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className={`w-4 h-4 animate-spin ${activeMode === 'ffmpeg' ? 'text-purple-600' : 'text-blue-600'}`} />
                <span className={activeMode === 'ffmpeg' ? 'text-purple-700' : 'text-blue-700'}>
                  {PHASE_LABELS[phase] || 'Processing…'}
                </span>
              </div>
              <Progress value={progress} className={`h-2 ${activeMode === 'ffmpeg' ? '[&>div]:bg-purple-500' : ''}`} />
              <p className="text-xs text-gray-500 text-right">{progress}%</p>
              <p className="text-xs text-center rounded-md px-2.5 py-1.5 bg-gray-50 text-gray-500">
                Keep this tab open until export finishes.
                {activeMode === 'ffmpeg' && ' UI remains responsive — FFmpeg runs in background.'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Minimize</Button>
                <Button variant="outline" size="sm" onClick={handleCancel} className="flex-1 text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
              </div>
            </div>
          )}

          {/* Done */}
          {downloadUrl && !anyExporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium text-sm">Export complete!</p>
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> {fileSize} MB · {quality} · {fps}fps
                  </p>
                </div>
              </div>
              <Button onClick={() => triggerDownload(downloadUrl, `${makeFileBase(projectName, projectNiche)}-${quality}.mp4`)}
                className="w-full bg-green-600 hover:bg-green-700 gap-2">
                <Download className="w-4 h-4" /> Download MP4
              </Button>
              <Button variant="outline" onClick={() => { setDownloadUrl(null); setFileSize(null); }} className="w-full">
                Export Again
              </Button>
            </div>
          )}

          {/* Export buttons */}
          {!anyExporting && !downloadUrl && (
            <div className="space-y-2 pt-1">
              <Button onClick={() => handleWebCodecsExport(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={scenes.length === 0}>
                <Zap className="w-4 h-4" />
                Export — WebCodecs  ({quality} · {fps}fps)
              </Button>
              <Button onClick={handleFFmpegExport}
                className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                disabled={scenes.length === 0}>
                <Cpu className="w-4 h-4" />
                Export — FFmpeg Worker  ({quality} · {fps}fps)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
