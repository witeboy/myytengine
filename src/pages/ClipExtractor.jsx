/**
 * ClipExtractor.jsx  —  Fixed
 *
 * FIXES:
 *   1. Removed localStorage Cloudinary guard that blocked the pipeline.
 *      uploadToCloudinary reads openshorts_cloud_name / openshorts_cloud_preset
 *      from server env via directApi — no localStorage value needed.
 *   2. Removed dynamic import('@ffmpeg/ffmpeg') — not available in Base44.
 *      Clip playback/download uses Cloudinary URL transformations (instant CDN clips)
 *      plus the existing @/lib/clipWithFFmpeg for ShortsClipperPanel.
 */

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initFFmpeg, isFFmpegSupported } from '@/lib/clipWithFFmpeg';
import ClipCard from '@/components/clips/ClipCard';
import ClipScheduler from '@/components/clips/ClipScheduler';
import YouTubeUrlInput from '@/components/clips/YouTubeUrlInput';
import ShortsClipperPanel from '@/components/clips/ShortsClipperPanel';
import {
  Upload, FileVideo, Mic, Brain, Scissors, ArrowLeft,
  Loader2, CheckCircle, AlertCircle, Sparkles, Flame,
  TrendingUp, Clock, ChevronRight, RotateCcw, Zap,
  Settings2,
} from 'lucide-react';

import {
  uploadToCloudinary,
  buildCloudinaryClipUrl,
  getCloudinaryConfig,
  extractYouTubeAudio,
  transcribeFile,
  analyzeViralMoments,
} from '@/lib/directApi';

// ─────────────────────────────────────────────────────────────────────────────

const STAGES = [
  { id: 'upload',     label: 'Upload',      icon: Upload },
  { id: 'transcribe', label: 'Transcribe',   icon: Mic },
  { id: 'analyze',    label: 'Find Clips',   icon: Brain },
  { id: 'results',    label: 'Viral Clips',  icon: Scissors },
];

function StageIndicator({ stages, currentStage, completedStages }) {
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        const isComplete = completedStages.includes(stage.id);
        const isCurrent  = currentStage === stage.id;
        const Icon       = stage.icon;
        return (
          <div key={stage.id} className="contents">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isComplete
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isCurrent
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                  : 'bg-gray-50 text-gray-400 border border-gray-100'
            }`}>
              {isComplete
                ? <CheckCircle className="w-3.5 h-3.5" />
                : isCurrent
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Icon className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">{stage.label}</span>
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className={`w-3.5 h-3.5 ${isComplete ? 'text-emerald-400' : 'text-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClipExtractor() {
  const [currentStage, setCurrentStage]       = useState(null);
  const [completedStages, setCompletedStages] = useState([]);
  const [error, setError]                     = useState('');
  const [statusMessage, setStatusMessage]     = useState('');
  const [inputMode, setInputMode]             = useState('file');
  const [videoFile, setVideoFile]             = useState(null);
  const [videoUrl, setVideoUrl]               = useState('');
  const [audioUrl, setAudioUrl]               = useState('');
  const [videoDuration, setVideoDuration]     = useState(0);
  const fileInputRef = useRef(null);
  const [transcript, setTranscript]           = useState('');
  const [asrWords, setAsrWords]               = useState([]);
  const [wordCount, setWordCount]             = useState(0);
  const [clips, setClips]                     = useState([]);
  const [analyzing, setAnalyzing]             = useState(false);
  const [maxClips, setMaxClips]               = useState('8');
  const [minClipLen, setMinClipLen]           = useState('50');
  const [maxClipLen, setMaxClipLen]           = useState('120');
  const [videoContext, setVideoContext]        = useState('');
  const [showSettings, setShowSettings]       = useState(false);
  const [ffmpegReady, setFfmpegReady]         = useState(false);

  const markComplete = (stage) => {
    setCompletedStages(prev => prev.includes(stage) ? prev : [...prev, stage]);
    setCurrentStage(null);
  };

  // ── File select ─────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setError('');
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => setVideoDuration(vid.duration);
    vid.src = url;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('video/')) {
      handleFileSelect({ target: { files: [file] } });
    }
  };

  // ── Transcription via AssemblyAI direct ────────────────────
  const runTranscription = async (uploadedUrl) => {
    setCurrentStage('transcribe');
    setStatusMessage('Submitting to AssemblyAI for transcription…');

    const result = await transcribeFile(uploadedUrl, (msg) => setStatusMessage(msg));

    if (!result.words?.length) throw new Error('Transcription returned no words');

    setAsrWords(result.words);
    setWordCount(result.words.length);
    setTranscript(result.words.map(w => w.word).join(' '));
    markComplete('transcribe');
    return result;
  };

  // ── Claude viral analysis ───────────────────────────────────
  const runViralAnalysis = async (words, duration) => {
    setCurrentStage('analyze');
    setStatusMessage('Claude is analyzing for viral moments…');
    setAnalyzing(true);

    try {
      const result = await analyzeViralMoments({
        transcript: words.map(w => w.word).join(' '),
        words,
        duration,
        maxClips:   parseInt(maxClips)   || 8,
        minSeconds: parseInt(minClipLen) || 15,
        maxSeconds: parseInt(maxClipLen) || 90,
        context:    videoContext,
      });

      const foundClips = result?.clips || [];
      if (!foundClips.length) {
        setClips([]);
        setStatusMessage('No strong viral moments found');
      } else {
        setClips(foundClips);
        setStatusMessage(`Found ${foundClips.length} viral clips!`);
      }
      markComplete('analyze');
      setCurrentStage('results');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Full pipeline ───────────────────────────────────────────
  const runFullPipeline = async () => {
    if (!videoFile) return;

    // FIX: Removed localStorage Cloudinary guard.
    // uploadToCloudinary reads openshorts_cloud_name / openshorts_cloud_preset
    // from server env via directApi — no localStorage value required.

    setError('');
    setClips([]);
    setCompletedStages([]);

    try {
      let uploadedUrl;
      let cloudPublicId = null;

      if (videoFile._isUrl) {
        // YouTube URL mode: audio URL already resolved by YouTubeUrlInput
        uploadedUrl = videoFile._audioUrl || videoFile._streamUrl;
        markComplete('upload');
      } else {
        // File mode: upload to Cloudinary directly (server env supplies cloud config)
        setCurrentStage('upload');
        setStatusMessage('Uploading to Cloudinary…');
        const cloudResult = await uploadToCloudinary(videoFile, {
          resourceType: 'video',
          onProgress: pct => setStatusMessage(`Uploading… ${pct}%`),
        });
        uploadedUrl    = cloudResult.secure_url;
        cloudPublicId  = cloudResult.public_id;
        if (!uploadedUrl) throw new Error('Upload returned no URL');
        markComplete('upload');
      }

      // Transcribe via AssemblyAI (backend has the key)
      const asrResult = await runTranscription(uploadedUrl);

      // Viral analysis via Claude direct
      await runViralAnalysis(asrResult.words, asrResult.duration || videoDuration);

      // Attach Cloudinary clip URLs to results so ClipCard can play/download them
      if (cloudPublicId) {
        const { cloudName } = getCloudinaryConfig();
        setClips(prev => prev.map(clip => ({
          ...clip,
          cloudinary_clip_url: buildCloudinaryClipUrl(cloudPublicId, cloudName, clip.start, clip.end),
        })));
      }

      // Init FFmpeg for ShortsClipperPanel (non-blocking, uses existing @/lib/clipWithFFmpeg)
      if (isFFmpegSupported() && !ffmpegReady) {
        initFFmpeg(({ message }) => setStatusMessage(message))
          .then(() => setFfmpegReady(true))
          .catch(() => {}); // silent fallback — Cloudinary clips still work
      }
    } catch (err) {
      setError(err.message);
      setCurrentStage(null);
    }
  };

  const resetPipeline = () => {
    setCurrentStage(null);
    setCompletedStages([]);
    setVideoFile(null);
    setVideoUrl('');
    setAudioUrl('');
    setVideoDuration(0);
    setTranscript('');
    setAsrWords([]);
    setWordCount(0);
    setClips([]);
    setError('');
    setStatusMessage('');
    setInputMode('file');
  };

  const isRunning      = currentStage && currentStage !== 'results';
  const hasVideoReady  = !!videoFile;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link to="/Dashboard" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-2 flex items-center gap-2">
              <Scissors className="w-6 h-6 text-gray-700" />
              Viral Clip Extractor
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Upload or paste a YouTube link → AssemblyAI transcribes → Claude finds viral moments → Download FYP-ready clips
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
            <Loader2 className="w-4 h-4 animate-spin" />
            {statusMessage}
          </div>
        )}

        {/* ── UPLOAD STAGE ──────────────────────────────────── */}
        {!completedStages.includes('upload') && currentStage !== 'upload' && clips.length === 0 && (
          <div className="space-y-4">

            {/* Source toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button
                onClick={() => setInputMode('file')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${inputMode === 'file' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
              >
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <button
                onClick={() => setInputMode('url')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${inputMode === 'url' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
                YouTube URL
              </button>
            </div>

            {/* YouTube URL */}
            {inputMode === 'url' && (
              <YouTubeUrlInput
                onVideoReady={({ videoUrl: vUrl, audioUrl: aUrl, title, channel }) => {
                  setVideoUrl(vUrl);
                  setAudioUrl(aUrl);
                  setVideoContext(title + (channel ? ' by ' + channel : ''));
                  setVideoFile({
                    name: title || 'YouTube Video', size: 0, type: 'video/mp4',
                    _isUrl: true, _streamUrl: vUrl, _audioUrl: aUrl,
                  });
                  const probe = document.createElement('video');
                  probe.preload = 'metadata';
                  probe.crossOrigin = 'anonymous';
                  probe.onloadedmetadata = () => { if (isFinite(probe.duration)) setVideoDuration(probe.duration); };
                  probe.src = vUrl;
                }}
              />
            )}

            {/* File upload */}
            {inputMode === 'file' && (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${videoFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
                {videoFile ? (
                  <div className="space-y-3">
                    <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto"><FileVideo className="w-7 h-7 text-emerald-600" /></div>
                    <div>
                      <p className="font-semibold text-gray-900">{videoFile.name}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {videoFile.size > 0 ? (videoFile.size / 1048576).toFixed(1) + ' MB' : ''}
                        {videoDuration > 0 ? (videoFile.size > 0 ? ' · ' : '') + Math.floor(videoDuration / 60) + 'm ' + Math.floor(videoDuration % 60) + 's' : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto"><Upload className="w-7 h-7 text-gray-400" /></div>
                    <div>
                      <p className="font-semibold text-gray-700">Drop your video here</p>
                      <p className="text-sm text-gray-400 mt-1">MP4, MOV, WebM — podcasts, interviews, streams, lectures</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Settings */}
            <div className="flex items-center justify-between">
              <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <Settings2 className="w-3.5 h-3.5" />
                {showSettings ? 'Hide settings' : 'Clip settings'}
              </button>
              {!isFFmpegSupported() && (
                <span className="text-[10px] text-amber-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Using browser capture mode</span>
              )}
            </div>

            {showSettings && (
              <Card className="border-gray-200">
                <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Max clips</label>
                    <Select value={maxClips} onValueChange={setMaxClips}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['3','5','8','10','15'].map(v => <SelectItem key={v} value={v}>{v} clips</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Min length</label>
                    <Select value={minClipLen} onValueChange={setMinClipLen}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['30','45','50','60','75','90'].map(v => <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Max length</label>
                    <Select value={maxClipLen} onValueChange={setMaxClipLen}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['60','90','120','150','180'].map(v => <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Video context</label>
                    <Input className="h-8 text-xs mt-1" placeholder="e.g. tech podcast, interview…" value={videoContext} onChange={e => setVideoContext(e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            )}

            {hasVideoReady && (
              <Button onClick={runFullPipeline} disabled={isRunning} className="w-full h-12 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2">
                <Zap className="w-4 h-4" /> Extract Viral Clips
              </Button>
            )}
          </div>
        )}

        {/* ── PROCESSING ───────────────────────────────────── */}
        {isRunning && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center mx-auto">
                {currentStage === 'upload'    && <Upload  className="w-8 h-8 text-blue-500 animate-pulse" />}
                {currentStage === 'transcribe'&& <Mic     className="w-8 h-8 text-blue-500 animate-pulse" />}
                {currentStage === 'analyze'   && <Brain   className="w-8 h-8 text-blue-500 animate-pulse" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {currentStage === 'upload'     && 'Uploading to Cloudinary…'}
                  {currentStage === 'transcribe' && 'Transcribing with AssemblyAI…'}
                  {currentStage === 'analyze'    && 'Claude is finding viral moments…'}
                </p>
                <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── RESULTS ──────────────────────────────────────── */}
        {clips.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-5 h-5 text-red-500" />
                  <h2 className="text-lg font-semibold text-gray-900">{clips.length} Viral Clips Found</h2>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Ranked by virality</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                Source: {Math.floor(videoDuration / 60)}m {Math.floor(videoDuration % 60)}s
                {wordCount > 0 && ' · ' + wordCount.toLocaleString() + ' words'}
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Avg virality',    value: Math.round(clips.reduce((s, c) => s + (c.virality_score || 0), 0) / clips.length), icon: TrendingUp, color: 'text-red-500' },
                { label: 'Total clip time', value: Math.round(clips.reduce((s, c) => s + (c.duration || (c.end - c.start) || 0), 0)) + 's', icon: Clock, color: 'text-blue-500' },
                { label: 'Top category',    value: (clips[0]?.category || '').replace('_', ' '), icon: Sparkles, color: 'text-purple-500' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                  <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                  <span className="text-xs text-gray-500">{stat.label}:</span>
                  <span className="text-xs font-semibold text-gray-900">{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clips.map((clip, i) => (
                <ClipCard
                  key={i}
                  clip={clip}
                  index={i}
                  videoUrl={videoUrl}
                  allWords={asrWords}
                  onClipReady={(idx, blob) => {
                    console.log(`Clip #${idx + 1} ready: ${(blob.size / 1048576).toFixed(1)}MB`);
                  }}
                />
              ))}
            </div>

            <ShortsClipperPanel clips={clips} videoUrl={videoUrl} words={asrWords} />
            <ClipScheduler clips={clips} videoUrl={videoUrl} enhancements={{}} />
          </div>
        )}

        {completedStages.includes('analyze') && clips.length === 0 && !isRunning && (
          <Card className="border-gray-200">
            <CardContent className="p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto"><Scissors className="w-7 h-7 text-gray-400" /></div>
              <p className="font-semibold text-gray-700">No viral moments detected</p>
              <p className="text-sm text-gray-400">The content may be too uniform or quiet. Try a video with more emotional variety.</p>
              <Button variant="outline" size="sm" onClick={resetPipeline} className="gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Try another video
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}