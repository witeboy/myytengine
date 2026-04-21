import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Smartphone, Download, Loader2, CheckCircle, AlertCircle,
  Wand2, Zap, Package,
} from 'lucide-react';
import { isFFmpegSupported } from '@/lib/clipWithFFmpeg';
import { renderShortWithCaptions, downloadShortBlob } from '@/lib/renderShortWithCaptions';

// ── Per-clip render state ────────────────────────────────────────────
const STATUS_IDLE = 'idle';
const STATUS_RENDERING = 'rendering';
const STATUS_DONE = 'done';
const STATUS_FAILED = 'failed';

function ShortRow({ clip, index, videoUrl, words, captionStyle, autoTrigger, onStateChange }) {
  const [status, setStatus] = useState(STATUS_IDLE);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState('');

  // Auto-trigger rendering when parent signals "Render All"
  React.useEffect(() => {
    if (autoTrigger && status === STATUS_IDLE) {
      render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  const render = async () => {
    if (status === STATUS_RENDERING) return;
    setStatus(STATUS_RENDERING);
    setError('');
    setPercent(0);
    onStateChange?.(index, STATUS_RENDERING);
    try {
      const result = await renderShortWithCaptions({
        videoUrl,
        startSec: clip.start,
        endSec: clip.end,
        words,
        captionStyle,
        onProgress: ({ percent: p, message: m }) => {
          if (typeof p === 'number') setPercent(p);
          if (m) setMessage(m);
        },
      });
      setBlob(result);
      setStatus(STATUS_DONE);
      onStateChange?.(index, STATUS_DONE, result);
    } catch (err) {
      setError(err.message || 'Render failed');
      setStatus(STATUS_FAILED);
      onStateChange?.(index, STATUS_FAILED);
    }
  };

  const download = () => {
    if (blob) downloadShortBlob(blob, clip.title, index);
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
      {/* Rank badge */}
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        #{index + 1}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{clip.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-400 font-mono">
            {clip.duration?.toFixed(0) ?? Math.round(clip.end - clip.start)}s
          </span>
          {clip.virality_score != null && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-200 text-red-600">
              🔥 {clip.virality_score}
            </Badge>
          )}
        </div>
        {status === STATUS_RENDERING && (
          <div className="mt-1.5">
            <Progress value={percent} className="h-1" />
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{message}</p>
          </div>
        )}
        {status === STATUS_FAILED && (
          <p className="text-[10px] text-red-500 mt-0.5 truncate">{error}</p>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {status === STATUS_IDLE && (
          <Button size="sm" variant="outline" onClick={render} className="h-8 text-xs gap-1">
            <Wand2 className="w-3 h-3" /> Render
          </Button>
        )}
        {status === STATUS_RENDERING && (
          <Button size="sm" variant="outline" disabled className="h-8 text-xs gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {percent}%
          </Button>
        )}
        {status === STATUS_DONE && (
          <Button
            size="sm"
            onClick={download}
            className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-3 h-3" /> Download
          </Button>
        )}
        {status === STATUS_FAILED && (
          <Button size="sm" variant="outline" onClick={render} className="h-8 text-xs gap-1 border-red-200 text-red-600">
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ══════════════════════════════════════════════════════════════════════
export default function ShortsClipperPanel({ clips = [], videoUrl, words = [] }) {
  const [captionStyle, setCaptionStyle] = useState('hormozi');
  const [renderAllTick, setRenderAllTick] = useState(0);
  const [rowStates, setRowStates] = useState({}); // { [index]: { status, blob } }
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const supported = isFFmpegSupported();
  const hasWords = words.length > 0;

  const handleStateChange = (idx, status, blob) => {
    setRowStates(prev => ({ ...prev, [idx]: { status, blob: blob || prev[idx]?.blob } }));
  };

  const renderAll = () => {
    setRenderAllTick(t => t + 1);
  };

  const doneCount = Object.values(rowStates).filter(s => s.status === STATUS_DONE).length;
  const renderingCount = Object.values(rowStates).filter(s => s.status === STATUS_RENDERING).length;

  // Download all rendered shorts as individual files (browsers cap concurrent downloads)
  const downloadAll = async () => {
    setBulkDownloading(true);
    const ready = clips
      .map((c, i) => ({ clip: c, idx: i, blob: rowStates[i]?.blob }))
      .filter(x => x.blob);
    for (const { clip, idx, blob } of ready) {
      downloadShortBlob(blob, clip.title, idx);
      await new Promise(r => setTimeout(r, 400)); // stagger triggers
    }
    setBulkDownloading(false);
  };

  if (!clips.length) return null;

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-pink-50/30">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold text-sm text-gray-900">
                Shorts Auto-Clipper
              </h3>
              <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] border-0">
                9:16 · Burned captions
              </Badge>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Renders each viral moment as a vertical MP4 with word-synced captions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={captionStyle} onValueChange={setCaptionStyle}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hormozi">Hormozi (yellow)</SelectItem>
                <SelectItem value="mrbeast">MrBeast (red)</SelectItem>
                <SelectItem value="minimal">Minimal (cyan)</SelectItem>
                <SelectItem value="none">No captions</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={renderAll}
              disabled={!supported || renderingCount > 0}
              className="h-8 text-xs gap-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              <Zap className="w-3 h-3" />
              Render All {clips.length}
            </Button>
          </div>
        </div>

        {/* Compat warning */}
        {!supported && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Your browser doesn't support SharedArrayBuffer. Vertical rendering requires Chrome/Edge/Firefox latest.
            </span>
          </div>
        )}
        {supported && !hasWords && captionStyle !== 'none' && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>No word-level timestamps available — clips will render 9:16 without captions.</span>
          </div>
        )}

        {/* Progress summary */}
        {(doneCount > 0 || renderingCount > 0) && (
          <div className="flex items-center gap-3 text-[11px] text-gray-600">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>{doneCount} of {clips.length} rendered</span>
            {renderingCount > 0 && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                <span>{renderingCount} rendering…</span>
              </>
            )}
            {doneCount > 0 && doneCount === clips.length && (
              <Button
                size="sm"
                variant="outline"
                onClick={downloadAll}
                disabled={bulkDownloading}
                className="ml-auto h-7 text-[10px] gap-1 border-emerald-300 text-emerald-700"
              >
                <Package className="w-3 h-3" />
                {bulkDownloading ? 'Triggering…' : `Download all ${doneCount}`}
              </Button>
            )}
          </div>
        )}

        {/* Clip rows */}
        <div className="space-y-2">
          {clips.map((clip, i) => (
            <ShortRow
              key={i}
              clip={clip}
              index={i}
              videoUrl={videoUrl}
              words={words}
              captionStyle={captionStyle}
              autoTrigger={renderAllTick}
              onStateChange={handleStateChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}