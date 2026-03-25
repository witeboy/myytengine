import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { transcribeVoiceover } from '@/lib/transcribeASR';
import { initFFmpeg, isFFmpegSupported } from '@/lib/clipWithFFmpeg';
import ClipCard from '@/components/clips/ClipCard';
import ClipScheduler from '@/components/clips/ClipScheduler';
import YouTubeUrlInput from '@/components/clips/YouTubeUrlInput';
import CaptionPreview, { CAPTION_PRESETS } from '@/components/clips/CaptionPreview';
import CopyrightShield from '@/components/clips/CopyrightShield';
import {
  Upload, FileVideo, Mic, Brain, Scissors, ArrowLeft,
  Loader2, CheckCircle, AlertCircle, Sparkles, Flame,
  TrendingUp, Clock, ChevronRight, ChevronDown, ChevronUp,
  RotateCcw, Zap, Settings2, Type, Crop, Shield, Volume2,
  Palette, Smartphone,
} from 'lucide-react';

const STAGES = [
  { id: 'upload',    label: 'Upload',     icon: Upload },
  { id: 'settings',  label: 'Settings',   icon: Settings2 },
  { id: 'transcribe', label: 'Transcribe', icon: Mic },
  { id: 'analyze',   label: 'Find Clips', icon: Brain },
  { id: 'results',   label: 'Clips',      icon: Scissors },
];

function StageIndicator({ stages, currentStage, completedStages }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, i) => {
        const isComplete = completedStages.includes(stage.id);
        const isCurrent = currentStage === stage.id;
        const Icon = stage.icon;
        return (
          <div key={stage.id} className="contents">
            <div className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ' +
              (isComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isCurrent ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                : 'bg-gray-50 text-gray-400 border border-gray-100')}>
              {isComplete ? <CheckCircle className="w-3.5 h-3.5" />
                : isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{stage.label}</span>
            </div>
            {i < stages.length - 1 && <ChevronRight className={'w-3.5 h-3.5 ' + (isComplete ? 'text-emerald-400' : 'text-gray-200')} />}
          </div>
        );
      })}
    </div>
  );
}

function SettingsSection({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-900">{title}</span>
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

export default function ClipExtractor() {
  // Pipeline
  const [currentStage, setCurrentStage] = useState(null);
  const [completedStages, setCompletedStages] = useState([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [inputMode, setInputMode] = useState('file');

  // Upload
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef(null);

  // Transcription
  const [asrWords, setAsrWords] = useState([]);
  const [wordCount, setWordCount] = useState(0);

  // Clips
  const [clips, setClips] = useState([]);

  // Clip settings
  const [maxClips, setMaxClips] = useState('8');
  const [minClipLen, setMinClipLen] = useState('15');
  const [maxClipLen, setMaxClipLen] = useState('90');
  const [videoContext, setVideoContext] = useState('');

  // ── ENHANCEMENT SETTINGS (configured before pipeline runs) ──
  const [captionPreset, setCaptionPreset] = useState('hormozi_bold');
  const [cropMode, setCropMode] = useState('center_lock');
  const [cropX, setCropX] = useState(50);
  const [hookEnabled, setHookEnabled] = useState(true);
  const [progressBarEnabled, setProgressBarEnabled] = useState(true);
  const [voiceBoost, setVoiceBoost] = useState(3);
  const [copyrightPreset, setCopyrightPreset] = useState('none');
  const [speed, setSpeed] = useState(1.0);
  const [pitchShift, setPitchShift] = useState(0);
  const [mirrorFlip, setMirrorFlip] = useState(false);
  const [visualFilter, setVisualFilter] = useState('none');
  const [outputOrientation, setOutputOrientation] = useState('vertical');

  // FFmpeg
  const [ffmpegReady, setFfmpegReady] = useState(false);

  // Show settings step
  const [settingsConfirmed, setSettingsConfirmed] = useState(false);

  const markComplete = (stage) => {
    setCompletedStages(prev => prev.includes(stage) ? prev : [...prev, stage]);
    setCurrentStage(null);
  };

  // ── File handling ───────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setError('');
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    const durationUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => { setVideoDuration(vid.duration); URL.revokeObjectURL(durationUrl); };
    vid.src = durationUrl;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('video/')) handleFileSelect({ target: { files: [file] } });
  };

  // ── Pipeline ────────────────────────────────────────────────
  const runFullPipeline = async () => {
    if (!videoFile) return;
    setError('');
    setClips([]);
    setCompletedStages(prev => [...prev, 'settings']);

    try {
      // Stage 1: Upload
      setCurrentStage('upload');
      setStatusMessage('Uploading video...');
      let uploadedUrl;
      if (videoFile._isUrl) {
        uploadedUrl = videoFile._audioUrl || videoFile._streamUrl;
      } else {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: videoFile });
        uploadedUrl = file_url;
      }
      markComplete('upload');

      // Stage 2: Transcribe
      setCurrentStage('transcribe');
      setStatusMessage('Transcribing audio...');
      const result = await transcribeVoiceover(uploadedUrl, ({ message }) => setStatusMessage(message));
      if (!result.success || !result.words?.length) throw new Error('Transcription returned no words');
      setAsrWords(result.words);
      setWordCount(result.word_count);
      markComplete('transcribe');

      // Stage 3: Analyze
      setCurrentStage('analyze');
      setStatusMessage('Claude is finding viral moments...');
      const res = await base44.functions.invoke('analyzeViralMoments', {
        transcript: result.words.map(w => w.word).join(' '),
        words: result.words,
        duration: result.duration || videoDuration,
        max_clips: parseInt(maxClips) || 8,
        min_clip_seconds: parseInt(minClipLen) || 15,
        max_clip_seconds: parseInt(maxClipLen) || 90,
        context: videoContext,
      });
      const data = res.data || res;
      if (data?.clips?.length) {
        setClips(data.clips);
        setStatusMessage('Found ' + data.clips.length + ' viral clips!');
      } else {
        setClips([]);
        setStatusMessage('No strong viral moments found');
      }
      markComplete('analyze');
      setCurrentStage('results');

      // Load FFmpeg
      if (isFFmpegSupported() && !ffmpegReady) {
        try { await initFFmpeg(() => {}); setFfmpegReady(true); } catch (_e) {}
      }
    } catch (err) {
      setError(err.message);
      setCurrentStage(null);
    }
  };

  const resetPipeline = () => {
    setCurrentStage(null); setCompletedStages([]); setVideoFile(null);
    setVideoUrl(''); setAudioUrl(''); setVideoDuration(0);
    setAsrWords([]); setWordCount(0); setClips([]);
    setError(''); setStatusMessage(''); setInputMode('file');
    setSettingsConfirmed(false);
  };

  const isRunning = currentStage && currentStage !== 'results';
  const hasVideoReady = !!videoFile;

  // Enhancement settings object to pass to clip cards
  const enhancementSettings = {
    captionPreset, cropMode, cropX, hookEnabled, progressBarEnabled,
    voiceBoost, speed, pitchShift, mirrorFlip, visualFilter, outputOrientation,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link to="/Dashboard" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-2 flex items-center gap-2">
              <Scissors className="w-6 h-6 text-gray-700" />
              Viral Clip Extractor
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Upload → Configure style → AI extracts viral clips → Download FYP-ready
            </p>
          </div>
          {clips.length > 0 && (
            <Button variant="outline" size="sm" onClick={resetPipeline} className="gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> New Video
            </Button>
          )}
        </div>

        <StageIndicator stages={STAGES} currentStage={currentStage} completedStages={completedStages} />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Pipeline error</p>
              <p className="text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {statusMessage && isRunning && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" /> {statusMessage}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 1: UPLOAD                                        */}
        {/* ══════════════════════════════════════════════════════ */}
        {!hasVideoReady && !isRunning && clips.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button onClick={() => setInputMode('file')}
                className={'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                  (inputMode === 'file' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}>
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <button onClick={() => setInputMode('url')}
                className={'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                  (inputMode === 'url' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
                YouTube URL
              </button>
            </div>

            {inputMode === 'url' && (
              <YouTubeUrlInput onVideoReady={({ videoUrl: vUrl, audioUrl: aUrl, title, channel }) => {
                setVideoUrl(vUrl); setAudioUrl(aUrl);
                setVideoContext(title + (channel ? ' by ' + channel : ''));
                setVideoFile({ name: title || 'YouTube Video', size: 0, type: 'video/mp4', _isUrl: true, _streamUrl: vUrl, _audioUrl: aUrl });
              }} />
            )}

            {inputMode === 'file' && (
              <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ' +
                  (videoFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300')}>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">
                    <Upload className="w-7 h-7 text-gray-400" />
                  </div>
                  <p className="font-semibold text-gray-700">Drop your video here</p>
                  <p className="text-sm text-gray-400">MP4, MOV, WebM — podcasts, interviews, streams</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 2: ENHANCEMENT SETTINGS (before pipeline)        */}
        {/* ══════════════════════════════════════════════════════ */}
        {hasVideoReady && !settingsConfirmed && !isRunning && clips.length === 0 && (
          <div className="space-y-4">
            {/* Video info bar */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <FileVideo className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 truncate">{videoFile.name}</p>
                <p className="text-xs text-emerald-600">
                  {videoFile.size > 0 ? (videoFile.size / 1048576).toFixed(1) + ' MB' : ''}
                  {videoDuration > 0 ? (videoFile.size > 0 ? ' · ' : '') + Math.floor(videoDuration / 60) + 'm ' + Math.floor(videoDuration % 60) + 's' : ''}
                  {' · Ready to configure'}
                </p>
              </div>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => { setVideoFile(null); setVideoUrl(''); }}>
                Change
              </Button>
            </div>

            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Configure your clip style
            </h2>
            <p className="text-xs text-gray-500 -mt-2">These settings apply to all extracted clips. You can tweak individual clips later.</p>

            {/* Caption Style */}
            <SettingsSection title="Caption style" icon={Type} defaultOpen={true}>
              <CaptionPreview selectedPreset={captionPreset} onSelectPreset={setCaptionPreset} />
            </SettingsSection>

            {/* Output Orientation + Crop */}
            <SettingsSection title="Output format & crop" icon={Crop} defaultOpen={true}>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={() => setOutputOrientation('vertical')}
                    className={'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all ' +
                      (outputOrientation === 'vertical' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                    <Smartphone className="w-3.5 h-3.5" /> 9:16 Portrait
                  </button>
                  <button onClick={() => setOutputOrientation('horizontal')}
                    className={'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all ' +
                      (outputOrientation === 'horizontal' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                    16:9 Landscape
                  </button>
                </div>
                {outputOrientation === 'vertical' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Crop focus</label>
                    <div className="flex gap-2 flex-wrap">
                      {['center_lock', 'face_track', 'rule_of_thirds_left', 'rule_of_thirds_right'].map(mode => (
                        <button key={mode} onClick={() => { setCropMode(mode); const xMap = { center_lock: 50, face_track: 50, rule_of_thirds_left: 33, rule_of_thirds_right: 67 }; setCropX(xMap[mode] || 50); }}
                          className={'px-2.5 py-1 rounded text-xs font-medium border transition-all ' +
                            (cropMode === mode ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                          {mode.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SettingsSection>

            {/* Hook & Retention */}
            <SettingsSection title="Hook & retention" icon={Zap} defaultOpen={false}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Auto hook text overlay (first 2s)</span>
                  <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Progress bar at top</span>
                  <Switch checked={progressBarEnabled} onCheckedChange={setProgressBarEnabled} />
                </div>
              </div>
            </SettingsSection>

            {/* Audio */}
            <SettingsSection title="Audio" icon={Volume2} defaultOpen={false}>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Voice clarity boost (+{voiceBoost}dB)</label>
                <Slider value={[voiceBoost]} onValueChange={([v]) => setVoiceBoost(v)} min={0} max={10} step={1} className="w-full" />
              </div>
            </SettingsSection>

            {/* Copyright Shield */}
            <SettingsSection title="Copyright shield" icon={Shield} defaultOpen={false}>
              <CopyrightShield
                speed={speed} onSpeedChange={setSpeed}
                pitchShift={pitchShift} onPitchChange={setPitchShift}
                mirror={mirrorFlip} onMirrorChange={setMirrorFlip}
                visualFilter={visualFilter} onVisualFilterChange={setVisualFilter}
                preset={copyrightPreset} onPresetChange={setCopyrightPreset}
              />
            </SettingsSection>

            {/* Clip detection settings */}
            <SettingsSection title="Detection settings" icon={Settings2} defaultOpen={false}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Max clips</label>
                  <Select value={maxClips} onValueChange={setMaxClips}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['3','5','8','10','15'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Min length</label>
                  <Select value={minClipLen} onValueChange={setMinClipLen}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['10','15','20','30'].map(v => <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Max length</label>
                  <Select value={maxClipLen} onValueChange={setMaxClipLen}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['30','60','90','120','180'].map(v => <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Context</label>
                  <Input className="h-8 text-xs mt-1" placeholder="e.g. tech podcast" value={videoContext}
                    onChange={(e) => setVideoContext(e.target.value)} />
                </div>
              </div>
            </SettingsSection>

            {/* START BUTTON */}
            <Button onClick={() => { setSettingsConfirmed(true); runFullPipeline(); }}
              className="w-full h-12 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2">
              <Zap className="w-4 h-4" />
              Extract Viral Clips with these settings
            </Button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* PROCESSING                                            */}
        {/* ══════════════════════════════════════════════════════ */}
        {isRunning && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center mx-auto">
                {currentStage === 'upload' && <Upload className="w-8 h-8 text-blue-500 animate-pulse" />}
                {currentStage === 'transcribe' && <Mic className="w-8 h-8 text-blue-500 animate-pulse" />}
                {currentStage === 'analyze' && <Brain className="w-8 h-8 text-blue-500 animate-pulse" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {currentStage === 'upload' && 'Uploading video...'}
                  {currentStage === 'transcribe' && 'Transcribing audio...'}
                  {currentStage === 'analyze' && 'Claude is finding viral moments...'}
                </p>
                <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
              </div>

              {/* Settings summary */}
              <div className="flex flex-wrap gap-1 justify-center">
                <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                  {CAPTION_PRESETS[captionPreset]?.name || captionPreset}
                </Badge>
                <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                  {outputOrientation === 'vertical' ? '9:16' : '16:9'}
                </Badge>
                {hookEnabled && <Badge variant="outline" className="text-[9px] bg-pink-50 text-pink-700 border-pink-200">Hook</Badge>}
                {progressBarEnabled && <Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">Progress bar</Badge>}
                {speed !== 1 && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">{speed}x</Badge>}
                {visualFilter !== 'none' && <Badge variant="outline" className="text-[9px] bg-orange-50 text-orange-700 border-orange-200">{visualFilter}</Badge>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* RESULTS                                               */}
        {/* ══════════════════════════════════════════════════════ */}
        {clips.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Flame className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900">{clips.length} Viral Clips Found</h2>
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Ranked</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                {Math.floor(videoDuration / 60)}m {Math.floor(videoDuration % 60)}s
                {wordCount > 0 && ' · ' + wordCount.toLocaleString() + ' words'}
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Avg virality', value: Math.round(clips.reduce((s, c) => s + c.virality_score, 0) / clips.length), icon: TrendingUp, color: 'text-red-500' },
                { label: 'Total time', value: Math.round(clips.reduce((s, c) => s + c.duration, 0)) + 's', icon: Clock, color: 'text-blue-500' },
                { label: 'Top category', value: (clips[0]?.category || '').replace('_', ' '), icon: Sparkles, color: 'text-purple-500' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                  <stat.icon className={'w-3.5 h-3.5 ' + stat.color} />
                  <span className="text-xs text-gray-500">{stat.label}:</span>
                  <span className="text-xs font-semibold text-gray-900">{stat.value}</span>
                </div>
              ))}
            </div>

            {/* Applied settings reminder */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs text-purple-700">
                Applied: {CAPTION_PRESETS[captionPreset]?.name} captions · {outputOrientation === 'vertical' ? '9:16' : '16:9'}
                {speed !== 1 ? ' · ' + speed + 'x speed' : ''}
                {visualFilter !== 'none' ? ' · ' + visualFilter + ' filter' : ''}
                {hookEnabled ? ' · Hook' : ''}{progressBarEnabled ? ' · Progress bar' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clips.map((clip, i) => (
                <ClipCard
                  key={i}
                  clip={clip}
                  index={i}
                  videoUrl={videoUrl}
                  allWords={asrWords}
                  enhancementSettings={enhancementSettings}
                  onClipReady={(idx, blob) => {
                    console.log('Clip #' + (idx + 1) + ' ready: ' + (blob.size / 1048576).toFixed(1) + 'MB');
                  }}
                />
              ))}
            </div>

            <ClipScheduler clips={clips} videoUrl={videoUrl} />
          </div>
        )}

        {completedStages.includes('analyze') && clips.length === 0 && !isRunning && (
          <Card className="border-gray-200">
            <CardContent className="p-8 text-center space-y-3">
              <Scissors className="w-7 h-7 text-gray-400 mx-auto" />
              <p className="font-semibold text-gray-700">No viral moments detected</p>
              <p className="text-sm text-gray-400">Try a video with more emotional variety</p>
              <Button variant="outline" size="sm" onClick={resetPipeline} className="gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Try another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}