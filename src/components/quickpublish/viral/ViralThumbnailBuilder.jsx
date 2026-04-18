// Viral Thumbnail Builder
// - Extract real character frames from uploaded video
// - Generate high-CTR 2-5 word overlay hooks (via generateViralHook)
// - Live text-over-image preview with style presets
// - Export PNG (html2canvas) and optionally save to Media/Thumbnails

import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Download, RefreshCw, Wand2, Film, Type, Flame } from 'lucide-react';
import { useVideoFrames } from './useVideoFrames';
import ThumbnailPreview, { STYLE_PRESETS, POSITIONS } from './ThumbnailPreview';

export default function ViralThumbnailBuilder({
  videoFile,
  videoUrl,          // optional remote URL after upload
  transcript = '',
  title = '',
  niche = 'general',
  onThumbnailReady,  // (publicUrl) => void
}) {
  // Frames
  const { frames, extracting, error: frameError, extract } = useVideoFrames();
  const [selectedFrameUrl, setSelectedFrameUrl] = useState('');

  // Hooks
  const [hooks, setHooks] = useState([]);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [customText, setCustomText] = useState('');
  const [accentWord, setAccentWord] = useState('');

  // Style
  const [preset, setPreset] = useState('yellow_bold');
  const [position, setPosition] = useState('bottom_center');
  const [fontSize, setFontSize] = useState(12); // % of width
  const [tilt, setTilt] = useState(-3);
  const [accentColor, setAccentColor] = useState('#FFFFFF');

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState('');
  const previewRef = useRef(null);

  // ── Auto-select best frame when frames arrive ───────────────
  useEffect(() => {
    if (frames.length && !selectedFrameUrl) setSelectedFrameUrl(frames[0].url);
  }, [frames, selectedFrameUrl]);

  // ── Actions ─────────────────────────────────────────────────
  const handleExtractFrames = async () => {
    const source = videoUrl || (videoFile ? URL.createObjectURL(videoFile) : '');
    if (!source) return;
    setSelectedFrameUrl('');
    await extract(source, 10);
  };

  const handleGenerateHooks = async () => {
    setLoadingHooks(true);
    try {
      const res = await base44.functions.invoke('generateViralHook', {
        transcript,
        title,
        niche,
      });
      const hs = res?.data?.hooks || [];
      setHooks(hs);
      if (hs[0] && !customText) {
        setCustomText(hs[0].text);
        setAccentWord(hs[0].accent_word || '');
        setPreset(hs[0].style_tip || 'yellow_bold');
      }
    } catch (err) {
      console.error('Hook gen failed:', err.message);
    }
    setLoadingHooks(false);
  };

  const pickHook = (h) => {
    setCustomText(h.text);
    setAccentWord(h.accent_word || '');
    setPreset(h.style_tip || 'yellow_bold');
  };

  const handleExport = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      // Render at 1280x720 for high-res YouTube thumbnail
      const node = previewRef.current;
      const canvas = await html2canvas(node, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#000',
        scale: 1280 / node.clientWidth,
        logging: false,
      });

      // Export blob → download + upload
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png', 0.95));
      if (!blob) throw new Error('Canvas export failed');

      // Download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `viral_thumbnail_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Upload so it can be used for YouTube publish
      try {
        const file = new File([blob], `viral_thumb_${Date.now()}.png`, { type: 'image/png' });
        const up = await base44.integrations.Core.UploadFile({ file });
        if (up?.file_url) {
          setExportedUrl(up.file_url);
          onThumbnailReady?.(up.file_url);
        }
      } catch (upErr) {
        console.warn('Upload failed (download still worked):', upErr.message);
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } catch (err) {
      console.error('Export failed:', err.message);
      alert('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  const canExtract = !!(videoFile || videoUrl);

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-gray-900">Viral Thumbnail Builder</span>
          <Badge className="bg-orange-600 text-white text-[10px]">High CTR</Badge>
        </div>
        <p className="text-[11px] text-gray-600">
          Extract real faces from your video → add bold attention-grabbing text → export ready-to-upload thumbnail.
        </p>
      </div>

      {/* STEP 1: Frames */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-gray-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">1. Character Frames</span>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={handleExtractFrames}
            disabled={!canExtract || extracting}
            className="h-7 text-[11px] gap-1"
          >
            {extracting ? <><Loader2 className="w-3 h-3 animate-spin" /> Extracting…</>
              : frames.length ? <><RefreshCw className="w-3 h-3" /> Re-extract</>
              : <><Sparkles className="w-3 h-3" /> Extract from Video</>}
          </Button>
        </div>
        {!canExtract && (
          <p className="text-[11px] text-amber-600">Upload a video first — then extract character frames.</p>
        )}
        {frameError && <p className="text-[11px] text-red-600">{frameError}</p>}

        {frames.length > 0 && (
          <div className="grid grid-cols-5 gap-1.5">
            {frames.slice(0, 10).map((f) => (
              <button
                key={f.url}
                onClick={() => setSelectedFrameUrl(f.url)}
                className={`relative aspect-video overflow-hidden rounded-md border-2 transition-all ${
                  selectedFrameUrl === f.url ? 'border-orange-500 ring-1 ring-orange-500' : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <img src={f.url} alt={`frame ${f.time}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">{Math.round(f.time)}s</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* STEP 2: Overlay text */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-gray-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">2. Viral Hook Text</span>
          </div>
          <Button
            size="sm" variant="outline" onClick={handleGenerateHooks}
            disabled={loadingHooks}
            className="h-7 text-[11px] gap-1"
          >
            {loadingHooks ? <><Loader2 className="w-3 h-3 animate-spin" /> AI…</>
              : <><Wand2 className="w-3 h-3" /> Generate Hooks</>}
          </Button>
        </div>

        {hooks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hooks.map((h, i) => (
              <button key={i} onClick={() => pickHook(h)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase border ${
                  customText === h.text ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'
                }`}>
                {h.text}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="YOUR OVERLAY TEXT"
            value={customText}
            onChange={(e) => setCustomText(e.target.value.toUpperCase())}
            className="h-8 text-xs font-bold uppercase"
            maxLength={40}
          />
          <Input
            placeholder="Accent word (optional)"
            value={accentWord}
            onChange={(e) => setAccentWord(e.target.value.toUpperCase())}
            className="h-8 text-xs uppercase"
            maxLength={20}
          />
        </div>
      </div>

      {/* STEP 3: Style */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">3. Style</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Preset</label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STYLE_PRESETS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Position</label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(POSITIONS).map((k) => (
                  <SelectItem key={k} value={k}>{k.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Size: {fontSize}%</label>
            <input type="range" min="6" max="18" value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))} className="w-full h-8" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Tilt: {tilt}°</label>
            <input type="range" min="-10" max="10" value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))} className="w-full h-8" />
          </div>
        </div>
        {accentWord && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500">Accent color:</label>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-8 h-6 rounded" />
          </div>
        )}
      </div>

      {/* PREVIEW */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">4. Preview</span>
        <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <ThumbnailPreview
            ref={previewRef}
            backgroundUrl={selectedFrameUrl}
            text={customText}
            accentWord={accentWord}
            accentColor={accentColor}
            preset={preset}
            position={position}
            fontSize={fontSize}
            tilt={tilt}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={exporting || !selectedFrameUrl || !customText}
            className="flex-1 h-10 gap-2 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {exporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
              : <><Download className="w-4 h-4" /> Export Thumbnail (PNG)</>}
          </Button>
        </div>

        {exportedUrl && (
          <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
            ✓ Saved and ready to publish. <a href={exportedUrl} target="_blank" rel="noreferrer" className="underline">Open file</a>
          </div>
        )}
      </div>
    </div>
  );
}