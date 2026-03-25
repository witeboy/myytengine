import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import CaptionPreview, { CAPTION_PRESETS, drawCaptions } from './CaptionPreview';
import CopyrightShield from './CopyrightShield';
import GameplaySplitSelector from './GameplaySplitSelector';
import ClipAutoPublish from './ClipAutoPublish';
import ExportEngine from './ExportEngine';
import {
  Wand2, Loader2, CheckCircle, Type, Crop, Volume2,
  Zap, Search, Play, Pause, Download, Copy,
  Clock, ChevronDown, ChevronUp,
  Smartphone, Monitor, Shield, Gamepad2, Youtube,
} from 'lucide-react';

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
          {badge && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

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
    <span className={'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ' + (colors[color] || colors.gray)}>
      {children}
    </span>
  );
}

export default function ClipEnhancePanel({ clip, clipIndex, words, videoUrl, onClose }) {
  const [enhancement, setEnhancement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Layer 1: Captions
  const [captionPreset, setCaptionPreset] = useState('hormozi_bold');
  // Layer 2: Reframe
  const [reframeMode, setReframeMode] = useState('center_lock');
  const [cropX, setCropX] = useState(50);
  // Layer 3: Hooks
  const [hookText, setHookText] = useState('');
  const [hookEnabled, setHookEnabled] = useState(true);
  const [progressBarEnabled, setProgressBarEnabled] = useState(true);
  // Layer 4: Audio
  const [musicVolume, setMusicVolume] = useState(20);
  const [voiceBoost, setVoiceBoost] = useState(3);
  // Layer 5: SEO
  const [selectedTitle, setSelectedTitle] = useState(0);
  // Layer 6: Copyright shield
  const [copyrightPreset, setCopyrightPreset] = useState('none');
  const [speed, setSpeed] = useState(1.0);
  const [pitchShift, setPitchShift] = useState(0);
  const [mirrorFlip, setMirrorFlip] = useState(false);
  const [visualFilter, setVisualFilter] = useState('none');
  // Layer 7: Gameplay split
  const [gameplaySplit, setGameplaySplit] = useState(false);
  const [selectedGameplay, setSelectedGameplay] = useState('subway_surfers');
  const [splitRatio, setSplitRatio] = useState(65);
  const [gameplayFile, setGameplayFile] = useState(null);
  // Preview
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState('vertical');
  const animFrameRef = useRef(null);

  const fetchEnhancement = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('enhanceClipForFYP', { clip, words, video_duration: clip.end });
      const data = res.data || res;
      if (!data?.enhancement) throw new Error('No enhancement data returned');
      const e = data.enhancement;
      setEnhancement(e);
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

  useEffect(() => { fetchEnhancement(); }, []);

  const clipWords = words?.filter(w => w.start >= clip.start && w.end <= clip.end) || [];

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    if (video.readyState >= 2) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (previewMode === 'vertical') {
        const targetAspect = 9 / 16;
        const sourceAspect = vw / vh;
        let sx, sy, sw, sh;
        if (sourceAspect > targetAspect) {
          sh = vh; sw = vh * targetAspect;
          sx = (cropX / 100) * (vw - sw); sy = 0;
        } else {
          sw = vw; sh = vw / targetAspect;
          sx = 0; sy = (vh - sh) / 2;
        }
        if (gameplaySplit) {
          const topH = (splitRatio / 100) * ch;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, topH);
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, topH, cw, ch - topH);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('[ ' + selectedGameplay.replace('_', ' ') + ' gameplay ]', cw / 2, topH + (ch - topH) / 2 + 4);
        } else {
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
        }
      } else {
        const scale = Math.min(cw / vw, ch / vh);
        const dx = (cw - vw * scale) / 2;
        const dy = (ch - vh * scale) / 2;
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, vw * scale, vh * scale);
      }
    }

    const currentTime = video.currentTime;
    const clipProgress = (currentTime - clip.start) / clip.duration;

    if (hookEnabled && hookText && (currentTime - clip.start) < (enhancement?.hook?.display_duration || 2.5)) {
      const fontSize = previewMode === 'vertical' ? 28 : 22;
      ctx.save();
      ctx.font = '900 ' + fontSize + 'px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hookY = previewMode === 'vertical' ? ch * 0.2 : ch * 0.15;
      const maxW = cw * 0.85;
      const metrics = ctx.measureText(hookText);
      const pad = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.roundRect((cw - Math.min(metrics.width, maxW)) / 2 - pad, hookY - fontSize / 2 - pad / 2, Math.min(metrics.width, maxW) + pad * 2, fontSize + pad, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(hookText, cw / 2, hookY, maxW);
      ctx.fillText(hookText, cw / 2, hookY, maxW);
      ctx.restore();
    }

    if (progressBarEnabled && clipProgress >= 0) {
      const barColor = enhancement?.progress_bar?.color || '#FF3B30';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, 0, cw, 4);
      ctx.fillStyle = barColor;
      ctx.fillRect(0, 0, cw * Math.min(1, Math.max(0, clipProgress)), 4);
    }

    if (clipWords.length > 0) {
      drawCaptions(ctx, cw, ch, clipWords, currentTime, captionPreset, enhancement?.captions?.highlight_words || []);
    }

    if (playing) { animFrameRef.current = requestAnimationFrame(renderFrame); }
  }, [playing, previewMode, captionPreset, hookText, hookEnabled, progressBarEnabled, cropX, clip, clipWords, enhancement, gameplaySplit, splitRatio, selectedGameplay]);

  useEffect(() => {
    if (playing) { animFrameRef.current = requestAnimationFrame(renderFrame); }
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [playing, renderFrame]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else {
      video.currentTime = clip.start;
      video.play(); setPlaying(true);
      const checkEnd = () => {
        if (video.currentTime >= clip.end) { video.pause(); setPlaying(false); }
        else if (!video.paused) { requestAnimationFrame(checkEnd); }
      };
      requestAnimationFrame(checkEnd);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = clip.start;
      video.addEventListener('seeked', () => renderFrame(), { once: true });
    }
  }, [clip.start]);

  const copySeo = () => {
    if (!enhancement?.seo) return;
    const seo = enhancement.seo;
    const allTitles = [seo.title, ...(seo.ab_titles || [])];
    const text = 'Title: ' + (allTitles[selectedTitle] || seo.title) + '\n\nDescription:\n' + seo.description + '\n\nHashtags: ' + (seo.hashtags || []).map(h => '#' + h).join(' ');
    navigator.clipboard.writeText(text);
  };

  const canvasW = previewMode === 'vertical' ? 270 : 480;
  const canvasH = previewMode === 'vertical' ? 480 : 270;

  return (
    <div className="mt-3 border-t border-purple-200 pt-3">
      <div className="bg-white rounded-xl border border-purple-200 shadow-sm w-full overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-900">FYP Enhancement Studio</span>
            {enhancement && <Tag color="green">AI Enhanced</Tag>}
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs bg-gray-100 hover:bg-gray-200">Close Studio</Button>
        </div>

        {loading && (
          <div className="p-6 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500 mx-auto" />
            <p className="text-sm text-gray-600">Claude is analyzing your clip…</p>
          </div>
        )}

        {error && (
          <div className="p-3 m-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
            <Button variant="outline" size="sm" onClick={fetchEnhancement} className="ml-3 text-xs">Retry</Button>
          </div>
        )}

        {enhancement && !loading && (
          <div className="flex flex-col lg:flex-row">
            {/* Left: Preview */}
            <div className="lg:w-[300px] p-3 border-r border-gray-100 space-y-2 flex-shrink-0">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setPreviewMode('vertical')}
                  className={'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ' + (previewMode === 'vertical' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}>
                  <Smartphone className="w-3 h-3" /> 9:16
                </button>
                <button onClick={() => setPreviewMode('horizontal')}
                  className={'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ' + (previewMode === 'horizontal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}>
                  <Monitor className="w-3 h-3" /> 16:9
                </button>
              </div>
              <div className="relative flex justify-center bg-black rounded-lg overflow-hidden cursor-pointer" onClick={togglePlay}>
                <canvas ref={canvasRef} width={canvasW} height={canvasH} className="max-w-full" />
                {!playing && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 text-gray-900 ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
              <video ref={videoRef} src={videoUrl} className="hidden" preload="auto" crossOrigin="anonymous" playsInline />
              <p className="text-[10px] text-gray-400 text-center">Live preview — all layers composite in real time</p>
            </div>

            {/* Right: Layers */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[600px]">

              {/* LAYER 1: Captions */}
              <Section title="Auto-captions" icon={Type} badge="1" defaultOpen={true}>
                <CaptionPreview selectedPreset={captionPreset} onSelectPreset={(key) => { setCaptionPreset(key); renderFrame(); }} />
                {enhancement.captions?.highlight_words?.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Emphasis words</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {enhancement.captions.highlight_words.map((w, i) => <Tag key={i} color="amber">{w}</Tag>)}
                    </div>
                  </div>
                )}
              </Section>

              {/* LAYER 2: Reframe */}
              <Section title="9:16 vertical reframe" icon={Crop} badge="2" defaultOpen={false}>
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {['center_lock', 'face_track', 'rule_of_thirds_left', 'rule_of_thirds_right'].map(mode => (
                      <button key={mode} onClick={() => { setReframeMode(mode); const xMap = { center_lock: 50, face_track: 50, rule_of_thirds_left: 33, rule_of_thirds_right: 67 }; setCropX(xMap[mode] || 50); }}
                        className={'px-2.5 py-1 rounded text-xs font-medium border transition-all ' + (reframeMode === mode ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                        {mode.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Crop position</label>
                    <Slider value={[cropX]} onValueChange={([v]) => setCropX(v)} min={0} max={100} step={1} className="w-full" />
                  </div>
                  {enhancement.reframe?.reasoning && <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 border-l-2 border-gray-300">{enhancement.reframe.reasoning}</p>}
                </div>
              </Section>

              {/* LAYER 3: Hook */}
              <Section title="Hook & retention" icon={Zap} badge="3" defaultOpen={false}>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-500">Hook text</label>
                      <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} />
                    </div>
                    <Input value={hookText} onChange={(e) => setHookText(e.target.value)} placeholder="BOLD HOOK TEXT" className="h-8 text-xs font-bold" maxLength={50} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div>
                      <p className="text-xs font-medium text-gray-900">Progress bar</p>
                      <p className="text-[10px] text-gray-400">Shows time remaining</p>
                    </div>
                    <Switch checked={progressBarEnabled} onCheckedChange={setProgressBarEnabled} />
                  </div>
                  {enhancement.cover_frame && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 border-l-2 border-gray-300">
                      Best cover frame: {Math.floor(enhancement.cover_frame.timestamp / 60)}:{Math.floor(enhancement.cover_frame.timestamp % 60).toString().padStart(2, '0')} — {enhancement.cover_frame.reason}
                    </p>
                  )}
                </div>
              </Section>

              {/* LAYER 4: Audio */}
              <Section title="Audio engineering" icon={Volume2} badge="4" defaultOpen={false}>
                <div className="space-y-3">
                  {enhancement.audio && (
                    <div className="flex flex-wrap gap-1.5">
                      <Tag color="purple">{enhancement.audio.mood}</Tag>
                      <Tag color="blue">{enhancement.audio.music_energy} energy</Tag>
                      <Tag color="amber">{enhancement.audio.music_genre_hint}</Tag>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Voice boost (+{voiceBoost}dB)</label>
                    <Slider value={[voiceBoost]} onValueChange={([v]) => setVoiceBoost(v)} min={0} max={10} step={1} className="w-full" />
                  </div>
                  {enhancement.audio?.sfx_cues?.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">AI-placed SFX</span>
                      <div className="space-y-1 mt-1">
                        {enhancement.audio.sfx_cues.map((sfx, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-gray-50">
                            <Tag color="red">{sfx.type}</Tag>
                            <span className="text-gray-400 font-mono text-[10px]">{Math.floor(sfx.timestamp / 60)}:{Math.floor(sfx.timestamp % 60).toString().padStart(2, '0')}</span>
                            <span className="text-gray-500">{sfx.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* LAYER 5: SEO */}
              <Section title="SEO & distribution" icon={Search} badge="5" defaultOpen={false}>
                {enhancement.seo && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      {[enhancement.seo.title, ...(enhancement.seo.ab_titles || [])].map((t, i) => (
                        <button key={i} onClick={() => setSelectedTitle(i)}
                          className={'w-full text-left p-2 rounded-lg border text-xs transition-all ' + (selectedTitle === i ? 'border-blue-400 bg-blue-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                          <div className="flex items-center gap-2">
                            {i === 0 ? <Tag color="green">Primary</Tag> : <Tag color="gray">A/B #{i}</Tag>}
                            <span>{t}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(enhancement.seo.hashtags || []).map((h, i) => <Tag key={i} color="blue">#{h}</Tag>)}
                    </div>
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={copySeo}>
                      <Copy className="w-3 h-3" />Copy SEO
                    </Button>
                  </div>
                )}
              </Section>

              {/* LAYER 6: Copyright Shield */}
              <Section title="Copyright shield" icon={Shield} badge="6" defaultOpen={false}>
                <CopyrightShield
                  speed={speed} onSpeedChange={setSpeed}
                  pitchShift={pitchShift} onPitchChange={setPitchShift}
                  mirror={mirrorFlip} onMirrorChange={setMirrorFlip}
                  visualFilter={visualFilter} onVisualFilterChange={setVisualFilter}
                  preset={copyrightPreset} onPresetChange={setCopyrightPreset}
                />
              </Section>

              {/* LAYER 7: Gameplay Split */}
              <Section title="Gameplay split-screen" icon={Gamepad2} badge="7" defaultOpen={false}>
                <GameplaySplitSelector
                  enabled={gameplaySplit} onEnabledChange={setGameplaySplit}
                  selectedGameplay={selectedGameplay} onSelectGameplay={setSelectedGameplay}
                  splitRatio={splitRatio} onSplitRatioChange={setSplitRatio}
                  onGameplayFileSelect={setGameplayFile}
                />
              </Section>

              {/* LAYER 8: Auto Publish */}
              <Section title="Publish to YouTube Shorts" icon={Youtube} badge="8" defaultOpen={false}>
                <ClipAutoPublish clip={clip} clipIndex={clipIndex} enhancement={enhancement} />
              </Section>

              {/* ══════ EXPORT ENGINE ══════ */}
              <ExportEngine
                clip={clip}
                videoUrl={videoUrl}
                words={words}
                captionPreset={captionPreset}
                highlightWords={enhancement?.captions?.highlight_words || []}
                portrait={previewMode === 'vertical'}
                cropFocusX={cropX}
                hookText={hookText}
                hookEnabled={hookEnabled}
                hookDuration={enhancement?.hook?.display_duration || 2.5}
                progressBarEnabled={progressBarEnabled}
                progressBarColor={enhancement?.progress_bar?.color || '#FF3B30'}
                voiceBoostDb={voiceBoost}
                speed={speed}
                pitchShift={pitchShift}
                mirror={mirrorFlip}
                visualFilter={visualFilter}
                gameplaySplit={gameplaySplit}
                gameplayVideoFile={gameplayFile}
                splitRatio={splitRatio}
                sfxCues={enhancement?.audio?.sfx_cues || []}
              />

            </div>
          </div>
        )}
      </div>
    </div>
  );
}