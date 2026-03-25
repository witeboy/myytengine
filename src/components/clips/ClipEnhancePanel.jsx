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
  Wand2, Loader2, Type, Crop, Volume2,
  Zap, Search, Play, Copy,
  ChevronDown, ChevronUp,
  Smartphone, Monitor, Shield, Gamepad2, Youtube,
} from 'lucide-react';

function Section({ title, icon: Icon, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-900">{title}</span>
          {badge && <Badge variant="outline" className="text-[9px] px-1 py-0">{badge}</Badge>}
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

function Tag({ color = 'gray', children }) {
  var colors = {
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
  var [enhancement, setEnhancement] = useState(null);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState('');
  var [captionPreset, setCaptionPreset] = useState('hormozi_bold');
  var [reframeMode, setReframeMode] = useState('center_lock');
  var [cropX, setCropX] = useState(50);
  var [hookText, setHookText] = useState('');
  var [hookEnabled, setHookEnabled] = useState(true);
  var [progressBarEnabled, setProgressBarEnabled] = useState(true);
  var [voiceBoost, setVoiceBoost] = useState(3);
  var [selectedTitle, setSelectedTitle] = useState(0);
  var [copyrightPreset, setCopyrightPreset] = useState('none');
  var [speed, setSpeed] = useState(1.0);
  var [pitchShift, setPitchShift] = useState(0);
  var [mirrorFlip, setMirrorFlip] = useState(false);
  var [visualFilter, setVisualFilter] = useState('none');
  var [gameplaySplit, setGameplaySplit] = useState(false);
  var [selectedGameplay, setSelectedGameplay] = useState('subway_surfers');
  var [splitRatio, setSplitRatio] = useState(65);
  var [gameplayFile, setGameplayFile] = useState(null);
  var canvasRef = useRef(null);
  var videoRef = useRef(null);
  var [playing, setPlaying] = useState(false);
  var [previewMode, setPreviewMode] = useState('vertical');
  var animFrameRef = useRef(null);

  var fetchEnhancement = async function() {
    setLoading(true);
    setError('');
    try {
      var res = await base44.functions.invoke('enhanceClipForFYP', { clip: clip, words: words, video_duration: clip.end });
      var data = res.data || res;
      if (!data || !data.enhancement) throw new Error('No enhancement data returned');
      var e = data.enhancement;
      setEnhancement(e);
      if (e.hook && e.hook.text) setHookText(e.hook.text);
      if (e.captions && e.captions.recommended_preset) setCaptionPreset(e.captions.recommended_preset);
      if (e.reframe && e.reframe.strategy) setReframeMode(e.reframe.strategy);
      if (e.reframe && e.reframe.crop_focus_x_percent) setCropX(e.reframe.crop_focus_x_percent);
      if (e.audio && e.audio.voice_boost_db) setVoiceBoost(e.audio.voice_boost_db);
      if (e.progress_bar) setProgressBarEnabled(e.progress_bar.enabled !== false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(function() { fetchEnhancement(); }, []);

  var clipWords = (words || []).filter(function(w) { return w.start >= clip.start && w.end <= clip.end; });

  var renderFrame = useCallback(function() {
    var canvas = canvasRef.current;
    var video = videoRef.current;
    if (!canvas || !video) return;
    var ctx = canvas.getContext('2d');
    var cw = canvas.width;
    var ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    if (video.readyState >= 2) {
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      if (previewMode === 'vertical') {
        var targetAspect = 9 / 16;
        var sourceAspect = vw / vh;
        var sx, sy, sw, sh;
        if (sourceAspect > targetAspect) {
          sh = vh; sw = vh * targetAspect;
          sx = (cropX / 100) * (vw - sw); sy = 0;
        } else {
          sw = vw; sh = vw / targetAspect;
          sx = 0; sy = (vh - sh) / 2;
        }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      } else {
        var scale = Math.min(cw / vw, ch / vh);
        var dx = (cw - vw * scale) / 2;
        var dy = (ch - vh * scale) / 2;
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, vw * scale, vh * scale);
      }
    }
    var currentTime = video.currentTime;
    var clipProgress = (currentTime - clip.start) / clip.duration;
    if (progressBarEnabled && clipProgress >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, 0, cw, 3);
      ctx.fillStyle = '#FF3B30';
      ctx.fillRect(0, 0, cw * Math.min(1, Math.max(0, clipProgress)), 3);
    }
    if (hookEnabled && hookText && (currentTime - clip.start) < 2.5) {
      ctx.save();
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeText(hookText, cw / 2, ch * 0.2, cw * 0.9);
      ctx.fillText(hookText, cw / 2, ch * 0.2, cw * 0.9);
      ctx.restore();
    }
    if (clipWords.length > 0) {
      drawCaptions(ctx, cw, ch, clipWords, currentTime, captionPreset, (enhancement && enhancement.captions && enhancement.captions.highlight_words) || []);
    }
    if (playing) animFrameRef.current = requestAnimationFrame(renderFrame);
  }, [playing, previewMode, captionPreset, hookText, hookEnabled, progressBarEnabled, cropX, clip, clipWords, enhancement]);

  useEffect(function() {
    if (playing) animFrameRef.current = requestAnimationFrame(renderFrame);
    return function() { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [playing, renderFrame]);

  var togglePlay = function() {
    var video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else {
      video.currentTime = clip.start;
      video.play(); setPlaying(true);
      var checkEnd = function() {
        if (video.currentTime >= clip.end) { video.pause(); setPlaying(false); }
        else if (!video.paused) requestAnimationFrame(checkEnd);
      };
      requestAnimationFrame(checkEnd);
    }
  };

  useEffect(function() {
    var video = videoRef.current;
    if (video) {
      video.currentTime = clip.start;
      video.addEventListener('seeked', function() { renderFrame(); }, { once: true });
    }
  }, [clip.start]);

  var copySeo = function() {
    if (!enhancement || !enhancement.seo) return;
    var seo = enhancement.seo;
    var allTitles = [seo.title].concat(seo.ab_titles || []);
    var text = 'Title: ' + (allTitles[selectedTitle] || seo.title) + '\n\nDescription:\n' + seo.description + '\n\nHashtags: ' + (seo.hashtags || []).map(function(h) { return '#' + h; }).join(' ');
    navigator.clipboard.writeText(text);
  };

  var canvasW = previewMode === 'vertical' ? 135 : 240;
  var canvasH = previewMode === 'vertical' ? 240 : 135;

  return (
    <div className="mt-3 border-t border-purple-200 pt-3">
      <div className="bg-white rounded-xl border border-purple-200 shadow-sm w-full overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-semibold text-gray-900">FYP Studio</span>
            {enhancement && <Tag color="green">AI</Tag>}
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-[10px] h-6 px-2 bg-gray-100">Close</Button>
        </div>

        {loading && (
          <div className="p-4 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-purple-500 mx-auto" />
            <p className="text-xs text-gray-500 mt-1">Claude analyzing clip...</p>
          </div>
        )}

        {error && (
          <div className="p-2 m-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
            <Button variant="outline" size="sm" onClick={fetchEnhancement} className="ml-2 text-[10px] h-5">Retry</Button>
          </div>
        )}

        {enhancement && !loading && (
          <div>
            <div className="p-2 border-b border-gray-100 flex items-center gap-3">
              <div className="relative bg-black rounded overflow-hidden cursor-pointer flex-shrink-0" onClick={togglePlay}>
                <canvas ref={canvasRef} width={canvasW} height={canvasH} style={{ width: canvasW + 'px', height: canvasH + 'px' }} />
                {!playing && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-3 h-3 text-gray-900 ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex gap-1">
                  <button onClick={function() { setPreviewMode('vertical'); }}
                    className={'px-2 py-0.5 rounded text-[10px] font-medium border ' + (previewMode === 'vertical' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500')}>
                    9:16
                  </button>
                  <button onClick={function() { setPreviewMode('horizontal'); }}
                    className={'px-2 py-0.5 rounded text-[10px] font-medium border ' + (previewMode === 'horizontal' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500')}>
                    16:9
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Click preview to play</p>
              </div>
            </div>
            <video ref={videoRef} src={videoUrl} className="hidden" preload="auto" crossOrigin="anonymous" playsInline />

            <div className="p-2 space-y-1.5">
              <Section title="Captions" icon={Type} badge="1" defaultOpen={true}>
                <CaptionPreview selectedPreset={captionPreset} onSelectPreset={function(key) { setCaptionPreset(key); renderFrame(); }} />
              </Section>

              <Section title="9:16 crop" icon={Crop} badge="2">
                <div className="space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {['center_lock', 'face_track', 'rule_of_thirds_left', 'rule_of_thirds_right'].map(function(mode) {
                      return (
                        <button key={mode} onClick={function() { setReframeMode(mode); var xMap = { center_lock: 50, face_track: 50, rule_of_thirds_left: 33, rule_of_thirds_right: 67 }; setCropX(xMap[mode] || 50); }}
                          className={'px-2 py-0.5 rounded text-[10px] font-medium border ' + (reframeMode === mode ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                          {mode.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">Position: {cropX}%</label>
                    <Slider value={[cropX]} onValueChange={function(v) { setCropX(v[0]); }} min={0} max={100} step={1} />
                  </div>
                </div>
              </Section>

              <Section title="Hook & retention" icon={Zap} badge="3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-700">Hook text</span>
                    <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} />
                  </div>
                  <Input value={hookText} onChange={function(e) { setHookText(e.target.value); }} placeholder="HOOK TEXT" className="h-7 text-[10px] font-bold" maxLength={50} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-700">Progress bar</span>
                    <Switch checked={progressBarEnabled} onCheckedChange={setProgressBarEnabled} />
                  </div>
                </div>
              </Section>

              <Section title="Audio" icon={Volume2} badge="4">
                <div>
                  <label className="text-[10px] text-gray-500">Voice boost +{voiceBoost}dB</label>
                  <Slider value={[voiceBoost]} onValueChange={function(v) { setVoiceBoost(v[0]); }} min={0} max={10} step={1} />
                </div>
                {enhancement.audio && enhancement.audio.sfx_cues && enhancement.audio.sfx_cues.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <span className="text-[10px] text-gray-400 font-medium">AI SFX</span>
                    {enhancement.audio.sfx_cues.map(function(sfx, i) {
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] p-1 rounded bg-gray-50">
                          <Tag color="red">{sfx.type}</Tag>
                          <span className="text-gray-500">{sfx.reason}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title="SEO" icon={Search} badge="5">
                {enhancement.seo && (
                  <div className="space-y-2">
                    {[enhancement.seo.title].concat(enhancement.seo.ab_titles || []).map(function(t, i) {
                      return (
                        <button key={i} onClick={function() { setSelectedTitle(i); }}
                          className={'w-full text-left p-1.5 rounded border text-[10px] ' + (selectedTitle === i ? 'border-blue-400 bg-blue-50' : 'border-gray-200')}>
                          {i === 0 ? <Tag color="green">Primary</Tag> : <Tag color="gray">A/B</Tag>} {t}
                        </button>
                      );
                    })}
                    <div className="flex flex-wrap gap-1">
                      {(enhancement.seo.hashtags || []).map(function(h, i) { return <Tag key={i} color="blue">#{h}</Tag>; })}
                    </div>
                    <Button variant="outline" size="sm" className="w-full text-[10px] h-6 gap-1" onClick={copySeo}>
                      <Copy className="w-2.5 h-2.5" />Copy SEO
                    </Button>
                  </div>
                )}
              </Section>

              <Section title="Copyright shield" icon={Shield} badge="6">
                <CopyrightShield
                  speed={speed} onSpeedChange={setSpeed}
                  pitchShift={pitchShift} onPitchChange={setPitchShift}
                  mirror={mirrorFlip} onMirrorChange={setMirrorFlip}
                  visualFilter={visualFilter} onVisualFilterChange={setVisualFilter}
                  preset={copyrightPreset} onPresetChange={setCopyrightPreset}
                />
              </Section>

              <Section title="Gameplay split" icon={Gamepad2} badge="7">
                <GameplaySplitSelector
                  enabled={gameplaySplit} onEnabledChange={setGameplaySplit}
                  selectedGameplay={selectedGameplay} onSelectGameplay={setSelectedGameplay}
                  splitRatio={splitRatio} onSplitRatioChange={setSplitRatio}
                  onGameplayFileSelect={setGameplayFile}
                />
              </Section>

              <Section title="YouTube publish" icon={Youtube} badge="8">
                <ClipAutoPublish clip={clip} clipIndex={clipIndex} enhancement={enhancement} />
              </Section>

              <ExportEngine
                clip={clip}
                videoUrl={videoUrl}
                words={words}
                captionPreset={captionPreset}
                highlightWords={(enhancement.captions && enhancement.captions.highlight_words) || []}
                portrait={previewMode === 'vertical'}
                cropFocusX={cropX}
                hookText={hookText}
                hookEnabled={hookEnabled}
                hookDuration={(enhancement.hook && enhancement.hook.display_duration) || 2.5}
                progressBarEnabled={progressBarEnabled}
                progressBarColor={(enhancement.progress_bar && enhancement.progress_bar.color) || '#FF3B30'}
                voiceBoostDb={voiceBoost}
                speed={speed}
                pitchShift={pitchShift}
                mirror={mirrorFlip}
                visualFilter={visualFilter}
                gameplaySplit={gameplaySplit}
                gameplayVideoFile={gameplayFile}
                splitRatio={splitRatio}
                sfxCues={(enhancement.audio && enhancement.audio.sfx_cues) || []}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}