import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Smartphone, Download, Loader2, CheckCircle, AlertCircle,
  Wand2, Zap, Package, Scissors, Volume2, Cloud, Cpu,
} from 'lucide-react';
import { isFFmpegSupported } from '@/lib/clipWithFFmpeg';
import { renderShortWithCaptions, downloadShortBlob } from '@/lib/renderShortWithCaptions';
import { renderShortCloud, downloadShortUrl } from '@/lib/renderShortCloud';

const STATUS_IDLE = 'idle';
const STATUS_RENDERING = 'rendering';
const STATUS_DONE = 'done';
const STATUS_FAILED = 'failed';

// ── Per-clip row ─────────────────────────────────────────────────────
function ShortRow({
  clip, index, videoUrl, words,
  captionStyle, trimSilence, addSfx, renderMode,
  autoTrigger, onStateChange,
}) {
  const [status, setStatus] = useState(STATUS_IDLE);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [blob, setBlob] = useState(null);        // browser mode output
  const [cloudUrl, setCloudUrl] = useState(null); // cloud mode output
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (autoTrigger && status === STATUS_IDLE) {
      runRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  const runRender = async () => {
    if (status === STATUS_RENDERING) return;
    setStatus(STATUS_RENDERING);
    setError('');
    setPercent(0);
    onStateChange?.(index, STATUS_RENDERING);
    try {
      if (renderMode === 'cloud') {
        const result = await renderShortCloud({
          videoUrl,
          startSec: clip.start,
          endSec: clip.end,
          words,
          captionStyle,
          title: clip.title,
          onProgress: ({ percent: p, message: m }) => {
            if (typeof p === 'number') setPercent(p);
            if (m) setMessage(m);
          },
        });
        setCloudUrl(result.url);
        setStatus(STATUS_DONE);
        onStateChange?.(index, STATUS_DONE, { url: result.url });
      } else {
        const result = await renderShortWithCaptions({
          videoUrl,
          startSec: clip.start,
          endSec: clip.end,
          words,
          captionStyle,
          trimSilence,
          addSfx,
          onProgress: ({ percent: p, message: m }) => {
            if (typeof p === 'number') setPercent(p);
            if (m) setMessage(m);
          },
        });
        setBlob(result.blob);
        setStats(result.stats);
        setStatus(STATUS_DONE);
        onStateChange?.(index, STATUS_DONE, { blob: result.blob });
      }
    } catch (err) {
      setError(err.message || 'Render failed');
      setStatus(STATUS_FAILED);
      onStateChange?.(index, STATUS_FAILED);
    }
  };

  const download = () => {
    if (cloudUrl) {
      downloadShortUrl(cloudUrl, clip.title, index);
    } else if (blob) {
      downloadShortBlob(blob, clip.title, index);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        #{index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{clip.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-gray-400 font-mono">
            {clip.duration?.toFixed(0) ?? Math.round(clip.end - clip.start)}s
          </span>
          {clip.virality_score != null && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-200 text-red-600">
              🔥 {clip.virality_score}
            </Badge>
          )}
          {status === STATUS_DONE && stats && (
            <>
              {stats.removedPercent > 1 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-200 text-amber-700">
                  ✂ -{stats.removedPercent.toFixed(0)}% dead air
                </Badge>
              )}
              {stats.sfxCount > 0 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-200 text-purple-700">
                  🔊 {stats.sfxCount} SFX
                </Badge>
              )}
            </>
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

      <div className="flex-shrink-0">
        {status === STATUS_IDLE && (
          <Button size="sm" variant="outline" onClick={runRender} className="h-8 text-xs gap-1">
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
          <Button size="sm" variant="outline" onClick={runRender} className="h-8 text-xs gap-1 border-red-200 text-red-600">
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
  const [renderMode, setRenderMode] = useState('cloud'); // 'cloud' | 'browser'
  const [captionStyle, setCaptionStyle] = useState('hormozi_pro');
  const [trimSilence, setTrimSilence] = useState(true);
  const [addSfx, setAddSfx] = useState(true);
  const [renderAllTick, setRenderAllTick] = useState(0);
  const [rowStates, setRowStates] = useState({});
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const supported = isFFmpegSupported();
  const hasWords = words.length > 0;
  const hasSAB = typeof SharedArrayBuffer !== 'undefined';

  const handleStateChange = (idx, status, output) => {
    setRowStates(prev => ({
      ...prev,
      [idx]: {
        status,
        blob: output?.blob || prev[idx]?.blob,
        url: output?.url || prev[idx]?.url,
      },
    }));
  };

  const renderAll = () => setRenderAllTick(t => t + 1);

  const doneCount = Object.values(rowStates).filter(s => s.status === STATUS_DONE).length;
  const renderingCount = Object.values(rowStates).filter(s => s.status === STATUS_RENDERING).length;

  const downloadAll = async () => {
    setBulkDownloading(true);
    const ready = clips
      .map((c, i) => ({ clip: c, idx: i, state: rowStates[i] }))
      .filter(x => x.state?.blob || x.state?.url);
    for (const { clip, idx, state } of ready) {
      if (state.url) {
        await downloadShortUrl(state.url, clip.title, idx);
      } else if (state.blob) {
        downloadShortBlob(state.blob, clip.title, idx);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkDownloading(false);
  };

  if (!clips.length) return null;

  return (
    <Card id="shorts-clipper-panel" className="border-2 border-purple-400 bg-gradient-to-br from-purple-100 via-pink-50 to-orange-50 shadow-xl ring-2 ring-purple-200/50 scroll-mt-4 transition-all duration-300">
      <CardContent className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-md">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                  🎬 Viral Shorts Auto-Clipper
                  <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] border-0 shadow">
                    NEW
                  </Badge>
                </h3>
                <p className="text-[11px] text-gray-600 font-medium">
                  9:16 · Hormozi captions · Auto-trim · Viral SFX
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Render mode toggle */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white border border-purple-200 shadow-sm">
              <button
                type="button"
                onClick={() => setRenderMode('cloud')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  renderMode === 'cloud'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Server-side rendering via Creatomate — fast & reliable"
              >
                <Cloud className="w-3 h-3" /> Cloud
              </button>
              <button
                type="button"
                onClick={() => setRenderMode('browser')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  renderMode === 'browser'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="In-browser FFmpeg.wasm (legacy) — may fail due to browser security"
              >
                <Cpu className="w-3 h-3" /> Browser
              </button>
            </div>

            <Button
              size="sm"
              onClick={renderAll}
              disabled={(renderMode === 'browser' && !supported) || renderingCount > 0}
              className="h-8 text-xs gap-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              <Zap className="w-3 h-3" />
              Render All {clips.length}
            </Button>
          </div>
        </div>

        {/* Controls row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2.5 rounded-lg bg-white/70 border border-purple-100">
          {/* Caption style */}
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block">Caption Style</label>
            <Select value={captionStyle} onValueChange={setCaptionStyle}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hormozi_pro">🔥 Hormozi Pro (yellow + green $)</SelectItem>
                <SelectItem value="beast">💥 Beast Mode (red + impact)</SelectItem>
                <SelectItem value="tiktok">📱 TikTok Native</SelectItem>
                <SelectItem value="minimal">✨ Minimal</SelectItem>
                <SelectItem value="none">No captions</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trim silence */}
          <div className="flex items-center justify-between p-1.5 rounded bg-gray-50">
            <div className="flex items-center gap-1.5 min-w-0">
              <Scissors className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-700">Auto-Trim</p>
                <p className="text-[9px] text-gray-400 truncate">Cut silences + "um/uh"</p>
              </div>
            </div>
            <Switch checked={trimSilence} onCheckedChange={setTrimSilence} />
          </div>

          {/* SFX */}
          <div className="flex items-center justify-between p-1.5 rounded bg-gray-50">
            <div className="flex items-center gap-1.5 min-w-0">
              <Volume2 className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-700">Viral SFX</p>
                <p className="text-[9px] text-gray-400 truncate">Whoosh + impact hits</p>
              </div>
            </div>
            <Switch checked={addSfx} onCheckedChange={setAddSfx} />
          </div>
        </div>

        {/* Mode notice */}
        {renderMode === 'cloud' && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-purple-50 border border-purple-200 text-[11px] text-purple-700">
            <Cloud className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Cloud mode: rendered server-side via Creatomate. Fast, reliable, no browser crashes. <strong>Auto-trim &amp; SFX are browser-only.</strong></span>
          </div>
        )}

        {/* Compat warnings (browser mode only) */}
        {renderMode === 'browser' && !supported && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Your browser doesn't support WebAssembly. Use Chrome/Edge/Firefox latest, or switch to Cloud mode.</span>
          </div>
        )}
        {renderMode === 'browser' && supported && !hasSAB && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-blue-50 border border-blue-200 text-[11px] text-blue-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Running single-threaded (no SharedArrayBuffer) — slower but functional. Switch to Cloud mode for best speed.</span>
          </div>
        )}
        {!hasWords && (captionStyle !== 'none' || trimSilence) && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>No word timestamps available — captions and auto-trim need transcript data.</span>
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
              trimSilence={trimSilence}
              addSfx={addSfx}
              renderMode={renderMode}
              autoTrigger={renderAllTick}
              onStateChange={handleStateChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}