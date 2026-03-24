import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import CaptionPreview, { CAPTION_PRESETS, drawCaptions } from './CaptionPreview';
import {
  Wand2, Loader2, CheckCircle, Type, Crop, Volume2,
  Zap, Search, Play, Pause, Download, Copy, Hash,
  Music, Sparkles, Clock, ChevronDown, ChevronUp,
  BarChart3, Smartphone, Monitor,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// SECTION WRAPPER — collapsible section for each layer
// ══════════════════════════════════════════════════════════════════
function Section({ title, icon: Icon, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900">{title}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{badge}</Badge>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// INLINE TAG — small display tag
// ══════════════════════════════════════════════════════════════════
function Tag({ color = 'gray', children }) {
  const colors = {
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function ClipEnhancePanel({ clip, clipIndex, words, videoUrl, onClose }) {
  // Enhancement data from Claude
  const [enhancement, setEnhancement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // User overrides
  const [captionPreset, setCaptionPreset] = useState('hormozi_bold');
  const [hookText, setHookText] = useState('');
  const [hookEnabled, setHookEnabled] = useState(true);
  const [progressBarEnabled, setProgressBarEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(20);
  const [voiceBoost, setVoiceBoost] = useState(3);
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [reframeMode, setReframeMode] = useState('center_lock');
  const [cropX, setCropX] = useState(50);

  // Preview
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState('vertical'); // vertical | horizontal
  const animFrameRef = useRef(null);

  // ── Fetch enhancement from Claude ─────────────────────────
  const fetchEnhancement = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('enhanceClipForFYP', {
        clip,
        words,
        video_duration: clip.end,
      });

      const data = res.data || res;
      if (!data?.enhancement) throw new Error('No enhancement data returned');

      const e = data.enhancement;
      setEnhancement(e);

      // Apply Claude's recommendations as defaults
      if (e.hook?.text) setHookText(e.hook.text);
      if (e.captions?.recommended_preset) setCaptionPreset(e.captions.recommended_preset);
      if (e.reframe?.strategy) setReframeMode(e.reframe.strategy);
      if (e.reframe?.crop_focus_x_percent) setCropX(e.reframe.crop_focus_x_percent);
      if (e.audio?.voice_boost_db) setVoiceBoost(e.audio.voice_boost_db);
      if (e.progress_bar) setProgressBarEnabled(e.progress_bar.enabled !== false);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnhancement();
  }, []);

  // ── Canvas preview rendering ──────────────────────────────
  const clipWords = words?.filter(w => w.start >= clip.start && w.end <= clip.end) || [];

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // Draw video frame with crop
    if (video.readyState >= 2) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (previewMode === 'vertical') {
        // 9:16 crop from 16:9 source
        const targetAspect = 9 / 16;
        const sourceAspect = vw / vh;
        let sx, sy, sw, sh;

        if (sourceAspect > targetAspect) {
          // Source is wider — crop sides
          sh = vh;
          sw = vh * targetAspect;
          sx = ((cropX / 100) * (vw - sw));
          sy = 0;
        } else {
          sw = vw;
          sh = vw / targetAspect;
          sx = 0;
          sy = (vh - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      } else {
        // Full 16:9
        const scale = Math.min(cw / vw, ch / vh);
        const dx = (cw - vw * scale) / 2;
        const dy = (ch - vh * scale) / 2;
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, vw * scale, vh * scale);
      }
    }

    const currentTime = video.currentTime;
    const clipProgress = (currentTime - clip.start) / clip.duration;

    // Hook overlay (first 2.5 seconds)
    if (hookEnabled && hookText && (currentTime - clip.start) < (enhancement?.hook?.display_duration || 2.5)) {
      const hookFontSize = previewMode === 'vertical' ? 28 : 22;
      ctx.save();
      ctx.font = `900 ${hookFontSize}px "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const hookY = previewMode === 'vertical' ? ch * 0.2 : ch * 0.15;
      const hookMaxW = cw * 0.85;

      // Hook background
      const metrics = ctx.measureText(hookText);
      const bgPad = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.roundRect(
        (cw - Math.min(metrics.width, hookMaxW)) / 2 - bgPad,
        hookY - hookFontSize / 2 - bgPad / 2,
        Math.min(metrics.width, hookMaxW) + bgPad * 2,
        hookFontSize + bgPad,
        8
      );
      ctx.fill();

      // Hook text
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(hookText, cw / 2, hookY, hookMaxW);
      ctx.fillText(hookText, cw / 2, hookY, hookMaxW);
      ctx.restore();
    }

    // Progress bar
    if (progressBarEnabled && clipProgress >= 0) {
      const barColor = enhancement?.progress_bar?.color || '#FF3B30';
      const barH = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, 0, cw, barH);
      ctx.fillStyle = barColor;
      ctx.fillRect(0, 0, cw * Math.min(1, Math.max(0, clipProgress)), barH);
    }

    // Captions
    if (clipWords.length > 0) {
      const highlightWords = enhancement?.captions?.highlight_words || [];
      drawCaptions(ctx, cw, ch, clipWords, currentTime, captionPreset, highlightWords);
    }

    if (playing) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  }, [playing, previewMode, captionPreset, hookText, hookEnabled, progressBarEnabled, cropX, clip, clipWords, enhancement]);

  useEffect(() => {
    if (playing) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, renderFrame]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.currentTime = clip.start;
      video.play();
      setPlaying(true);

      const checkEnd = () => {
        if (video.currentTime >= clip.end) {
          video.pause();
          setPlaying(false);
        } else if (!video.paused) {
          requestAnimationFrame(checkEnd);
        }
      };
      requestAnimationFrame(checkEnd);
    }
  };

  // Draw initial frame on load
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = clip.start;
      video.addEventListener('seeked', () => renderFrame(), { once: true });
    }
  }, [clip.start]);

  // ── Copy SEO to clipboard ─────────────────────────────────
  const copySeo = () => {
    if (!enhancement?.seo) return;
    const seo = enhancement.seo;
    const allTitles = [seo.title, ...(seo.ab_titles || [])];
    const text = `Title: ${allTitles[selectedTitle] || seo.title}\n\nDescription:\n${seo.description}\n\nHashtags: ${(seo.hashtags || []).map(h => '#' + h).join(' ')}`;
    navigator.clipboard.writeText(text);
  };

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  const canvasW = previewMode === 'vertical' ? 270 : 480;
  const canvasH = previewMode === 'vertical' ? 480 : 270;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <Wand2 className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">FYP Enhancement Studio</h2>
              <p className="text-xs text-gray-500">Clip #{clipIndex + 1}: {clip.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {enhancement && <Tag color="green">AI Enhanced</Tag>}
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Close</Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
            <p className="text-sm text-gray-600">Claude is analyzing your clip for maximum FYP impact…</p>
            <p className="text-xs text-gray-400">Generating hooks, captions, audio design, SEO & more</p>
          </div>
        )}

        {error && (
          <div className="p-4 m-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
            <Button variant="outline" size="sm" onClick={fetchEnhancement} className="ml-3 text-xs">
              Retry
            </Button>
          </div>
        )}

        {/* Main content */}
        {enhancement && !loading && (
          <div className="flex flex-col lg:flex-row">
            {/* Left: Preview */}
            <div className="lg:w-[320px] p-4 border-r border-gray-100 space-y-3 flex-shrink-0">
              {/* Preview mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setPreviewMode('vertical')}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    previewMode === 'vertical' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <Smartphone className="w-3 h-3" /> 9:16
                </button>
                <button
                  onClick={() => setPreviewMode('horizontal')}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    previewMode === 'horizontal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <Monitor className="w-3 h-3" /> 16:9
                </button>
              </div>

              {/* Canvas */}
              <div className="relative flex justify-center bg-black rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={canvasW}
                  height={canvasH}
                  className="max-w-full"
                  style={{ imageRendering: 'auto' }}
                />
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
                >
                  {!playing && (
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 text-gray-900 ml-0.5" />
                    </div>
                  )}
                </button>
              </div>

              {/* Hidden video element */}
              <video ref={videoRef} src={videoUrl} className="hidden" preload="auto" crossOrigin="anonymous" playsInline />

              <p className="text-[10px] text-gray-400 text-center">
                Live preview — all layers composite in real time
              </p>
            </div>

            {/* Right: Enhancement layers */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">

              {/* LAYER 1: Captions */}
              <Section title="Auto-captions" icon={Type} badge="Layer 1" defaultOpen={true}>
                <CaptionPreview
                  selectedPreset={captionPreset}
                  onSelectPreset={(key) => {
                    setCaptionPreset(key);
                    renderFrame();
                  }}
                />
                {enhancement.captions?.highlight_words?.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">AI-detected emphasis words</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {enhancement.captions.highlight_words.map((w, i) => (
                        <Tag key={i} color="amber">{w}</Tag>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* LAYER 2: Vertical Reframe */}
              <Section title="9:16 Vertical reframe" icon={Crop} badge="Layer 2" defaultOpen={false}>
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {['center_lock', 'face_track', 'rule_of_thirds_left', 'rule_of_thirds_right', 'split_screen_top'].map(mode => (
                      <button
                        key={mode}
                        onClick={() => {
                          setReframeMode(mode);
                          const xMap = { center_lock: 50, face_track: 50, rule_of_thirds_left: 33, rule_of_thirds_right: 67, split_screen_top: 50 };
                          setCropX(xMap[mode] || 50);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                          reframeMode === mode
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {mode.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Horizontal crop position</label>
                    <Slider
                      value={[cropX]}
                      onValueChange={([v]) => setCropX(v)}
                      min={0} max={100} step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>Left</span><span>Center</span><span>Right</span>
                    </div>
                  </div>

                  {enhancement.reframe?.reasoning && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 border-l-2 border-gray-300">
                      {enhancement.reframe.reasoning}
                    </p>
                  )}
                </div>
              </Section>

              {/* LAYER 3: Hook + Progress Bar */}
              <Section title="Hook & retention" icon={Zap} badge="Layer 3" defaultOpen={false}>
                <div className="space-y-3">
                  {/* Hook text */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-500">Hook overlay text</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">Enabled</span>
                        <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} />
                      </div>
                    </div>
                    <Input
                      value={hookText}
                      onChange={(e) => setHookText(e.target.value)}
                      placeholder="BOLD SCROLL-STOPPING TEXT"
                      className="h-8 text-xs font-bold"
                      maxLength={50}
                    />
                    {enhancement.hook && (
                      <div className="flex gap-1.5 mt-1.5">
                        <Tag color="purple">{enhancement.hook.style}</Tag>
                        <Tag color="blue">{enhancement.hook.animation} animation</Tag>
                        <Tag color="gray">{enhancement.hook.display_duration}s duration</Tag>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                    <div>
                      <p className="text-xs font-medium text-gray-900">Progress bar</p>
                      <p className="text-[10px] text-gray-400">Viewers stay when they see how long is left</p>
                    </div>
                    <Switch checked={progressBarEnabled} onCheckedChange={setProgressBarEnabled} />
                  </div>

                  {/* Cover frame */}
                  {enhancement.cover_frame && (
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-xs font-medium text-gray-900">
                        Best cover frame: {Math.floor(enhancement.cover_frame.timestamp / 60)}:{Math.floor(enhancement.cover_frame.timestamp % 60).toString().padStart(2, '0')} into clip
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{enhancement.cover_frame.reason}</p>
                    </div>
                  )}
                </div>
              </Section>

              {/* LAYER 4: Audio */}
              <Section title="Audio engineering" icon={Volume2} badge="Layer 4" defaultOpen={false}>
                <div className="space-y-3">
                  {/* Mood + music */}
                  {enhancement.audio && (
                    <div className="flex flex-wrap gap-1.5">
                      <Tag color="purple">{enhancement.audio.mood} mood</Tag>
                      <Tag color="blue">{enhancement.audio.music_energy} energy</Tag>
                      <Tag color="amber">{enhancement.audio.music_genre_hint}</Tag>
                      <Tag color="green">-{enhancement.audio.normalize_lufs} LUFS</Tag>
                    </div>
                  )}

                  {/* Voice boost */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Voice clarity boost (+{voiceBoost}dB)</label>
                    <Slider
                      value={[voiceBoost]}
                      onValueChange={([v]) => setVoiceBoost(v)}
                      min={0} max={10} step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Music volume */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Background music volume ({musicVolume}%)</label>
                    <Slider
                      value={[musicVolume]}
                      onValueChange={([v]) => setMusicVolume(v)}
                      min={0} max={50} step={5}
                      className="w-full"
                    />
                  </div>

                  {/* SFX cues */}
                  {enhancement.audio?.sfx_cues?.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">AI-placed sound effects</span>
                      <div className="space-y-1 mt-1">
                        {enhancement.audio.sfx_cues.map((sfx, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-gray-50">
                            <Tag color="red">{sfx.type}</Tag>
                            <span className="text-gray-400 font-mono text-[10px]">
                              {Math.floor(sfx.timestamp / 60)}:{Math.floor(sfx.timestamp % 60).toString().padStart(2, '0')}
                            </span>
                            <span className="text-gray-500">{sfx.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* LAYER 5: SEO + Distribution */}
              <Section title="SEO & distribution" icon={Search} badge="Layer 5" defaultOpen={false}>
                {enhancement.seo && (
                  <div className="space-y-3">
                    {/* Title picker */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Title (pick your favorite)</span>
                      <div className="space-y-1.5 mt-1">
                        {[enhancement.seo.title, ...(enhancement.seo.ab_titles || [])].map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedTitle(i)}
                            className={`w-full text-left p-2 rounded-lg border text-xs transition-all ${
                              selectedTitle === i
                                ? 'border-blue-400 bg-blue-50 text-gray-900'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {i === 0 ? <Tag color="green">Primary</Tag> : <Tag color="gray">A/B #{i}</Tag>}
                              <span>{t}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Description</span>
                      <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">
                        {enhancement.seo.description}
                      </p>
                    </div>

                    {/* Hashtags */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Hashtags</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(enhancement.seo.hashtags || []).map((h, i) => (
                          <Tag key={i} color="blue">#{h}</Tag>
                        ))}
                      </div>
                    </div>

                    {/* Platform notes */}
                    {enhancement.seo.platform_notes && (
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(enhancement.seo.platform_notes).map(([platform, note]) => (
                          <div key={platform} className="p-2 rounded bg-gray-50 border border-gray-100">
                            <span className="text-[10px] font-medium text-gray-700 capitalize">{platform.replace('_', ' ')}</span>
                            <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Best post time */}
                    {enhancement.seo.best_post_time && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500">Best time to post:</span>
                        <Tag color="amber">{enhancement.seo.best_post_time}</Tag>
                      </div>
                    )}

                    {/* Copy button */}
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={copySeo}>
                      <Copy className="w-3 h-3" />
                      Copy title + description + hashtags
                    </Button>
                  </div>
                )}
              </Section>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
