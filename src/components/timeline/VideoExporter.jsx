import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download, X, Film, Monitor, Smartphone, AlertTriangle,
  CheckCircle, Loader2, HardDrive
} from 'lucide-react';
import { saveExportedVideo } from '@/utils/videoStorage';
import { saveExportedVideo } from '@/utils/videoStorage';

const PHASE_LABELS = {
  checking: 'Checking browser support...',
  loading: 'Loading scene media...',
  encoding: 'Encoding video frames...',
  audio: 'Mixing & encoding audio...',
  finalizing: 'Finalizing MP4...',
  done: 'Export complete!',
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
  projectId,
  exportHook,
}) {
  const [quality, setQuality] = useState('720p');
  const [fps, setFps] = useState(30);
  const { exporting, progress, phase, error, exportVideo, checkSupport, cancel } = exportHook;
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [unsupported, setUnsupported] = useState(null);
  const [fileSize, setFileSize] = useState(null);

  if (!open) return null;

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || s.duration_seconds || 8), 0);
  const totalFrames = Math.ceil(totalDuration * fps);

  const handleExport = async (forceExport = false) => {
    setDownloadUrl(null);
    setFileSize(null);

    if (!forceExport) {
      setUnsupported(null);
      const support = await checkSupport(quality, orientation);
      if (!support.supported) {
        setUnsupported(support.reason);
        return;
      }
      if (support.warning) {
        setUnsupported(support.reason);
        return;
      }
    } else {
      setUnsupported(null);
    }

    const blob = await exportVideo(scenes, {
      quality,
      orientation: orientation || 'landscape',
      fps,
      voiceoverUrl,
      musicUrl,
      musicVolume,
    });

    if (blob) {
      const exportFilename = `${projectName || 'video'}-${quality}-export.mp4`;
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFileSize((blob.size / (1024 * 1024)).toFixed(1));

      // Auto-download immediately
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Store in memory for same-page access
      window.__exportedVideo = {
        blob,
        filename: exportFilename,
        size: blob.size,
      };
      if (projectId) {
        saveExportedVideo(projectId, blob, exportFilename);
      }
      console.log('[Export] Stored video blob:', blob.size, 'bytes');
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${projectName || 'video'}-${quality}-export.mp4`;
    a.click();
  };

  const handleClose = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setFileSize(null);
    setUnsupported(null);
    onClose();
  };

  const qualityOptions = [
    { value: '480p', label: '480p', desc: 'Fast export, smaller file' },
    { value: '720p', label: '720p', desc: 'Good balance of speed & quality' },
    { value: '1080p', label: '1080p', desc: 'Full HD, larger file' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-600" />
            Export Video
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={exporting}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 text-sm">
            <Badge variant="outline" className="gap-1">
              {orientation === 'portrait' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
              {orientation === 'portrait' ? '9:16' : '16:9'}
            </Badge>
            <Badge variant="outline">{scenes.length} scenes</Badge>
            <Badge variant="outline">{Math.round(totalDuration)}s ({Math.round(totalDuration / 60)} min)</Badge>
          </div>

          {!exporting && !downloadUrl && (
            <>
              <div>
                <p className="text-sm font-medium mb-2">Quality</p>
                <div className="grid grid-cols-3 gap-2">
                  {qualityOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        quality === opt.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Frame Rate</p>
                <div className="flex gap-2">
                  {[24, 30].map(f => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      className={`px-4 py-2 rounded-lg border text-sm transition-all ${
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

              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <strong>Estimated:</strong> ~{totalFrames} frames will be rendered using your browser's hardware encoder (WebCodecs H.264). No server needed.
              </div>
            </>
          )}

          {unsupported && !exporting && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{unsupported}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                onClick={() => handleExport(true)}
              >
                Try Anyway
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {exporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                {PHASE_LABELS[phase] || 'Processing...'}
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-gray-500 text-right">{progress}%</p>
              <Button variant="outline" size="sm" onClick={cancel} className="w-full">
                Cancel Export
              </Button>
            </div>
          )}

          {downloadUrl && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium text-sm">Export complete!</p>
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> {fileSize} MB • {quality} • {fps} FPS
                  </p>
                </div>
              </div>
              <Button onClick={handleDownload} className="w-full bg-green-600 hover:bg-green-700 gap-2">
                <Download className="w-4 h-4" />
                Download MP4
              </Button>
              <Button variant="outline" onClick={() => { setDownloadUrl(null); setFileSize(null); }} className="w-full">
                Export Again
              </Button>
            </div>
          )}

          {!exporting && !downloadUrl && (
            <Button
              onClick={handleExport}
              className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
              disabled={scenes.length === 0}
            >
              <Film className="w-4 h-4" />
              Start Export ({quality}, {fps}fps)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}