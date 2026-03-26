import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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
import YouTubeUrlInput from '@/components/clips/YouTubeUrlInput';
import CaptionPreview, { CAPTION_PRESETS } from '@/components/clips/CaptionPreview';
import CopyrightShield from '@/components/clips/CopyrightShield';
import {
  Upload, FileVideo, Mic, Brain, Scissors, ArrowLeft,
  Loader2, CheckCircle, AlertCircle, Sparkles, Flame,
  TrendingUp, Clock, ChevronRight, ChevronDown, ChevronUp,
  RotateCcw, Zap, Settings2, Type, Crop, Shield, Volume2,
  Smartphone, FolderOpen, CheckSquare, Square, Calendar,
  Youtube, Send, Link2, Unlink2,
} from 'lucide-react';

var STAGES = [
  { id: 'upload',    label: 'Upload',     icon: Upload },
  { id: 'settings',  label: 'Settings',   icon: Settings2 },
  { id: 'transcribe', label: 'Transcribe', icon: Mic },
  { id: 'analyze',   label: 'Find Clips', icon: Brain },
  { id: 'results',   label: 'Clips',      icon: Scissors },
];

function StageIndicator({ stages, currentStage, completedStages }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map(function(stage, i) {
        var isComplete = completedStages.includes(stage.id);
        var isCurrent = currentStage === stage.id;
        var Icon = stage.icon;
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

function SettingsSection({ title, icon: Icon, defaultOpen, children }) {
  var [open, setOpen] = useState(defaultOpen || false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={function() { setOpen(!open); }}
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

// ── Scheduler Panel ────────────────────────────────────────────
function SchedulerPanel({ clips, selectedClips, videoUrl }) {
  var [channels, setChannels] = useState([]);
  var [selectedChannel, setSelectedChannel] = useState('');
  var [loadingChannels, setLoadingChannels] = useState(true);
  var [connecting, setConnecting] = useState(false);
  var [strategy, setStrategy] = useState('spread');
  var [timeSlot, setTimeSlot] = useState('evening');
  var [privacy, setPrivacy] = useState('public');
  var [scheduling, setScheduling] = useState(false);
  var [scheduled, setScheduled] = useState(false);
  var [scheduledPosts, setScheduledPosts] = useState([]);
  var [startDate, setStartDate] = useState(function() {
    var d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  useEffect(function() { loadChannels(); }, []);

  var loadChannels = async function() {
    setLoadingChannels(true);
    try {
      var res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      var data = res.data || res;
      if (data && data.channels && data.channels.length > 0) {
        setChannels(data.channels);
        var defaultCh = data.channels.find(function(c) { return c.is_default; }) || data.channels[0];
        setSelectedChannel(defaultCh.channel_id);
      }
    } catch (_e) {}
    finally { setLoadingChannels(false); }
  };

  var connectChannel = async function() {
    setConnecting(true);
    try {
      var res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      var data = res.data || res;
      if (data && data.auth_url) {
        var authWindow = window.open(data.auth_url, 'youtube-auth', 'width=600,height=700');
        var poll = setInterval(async function() {
          if (authWindow && authWindow.closed) { clearInterval(poll); await loadChannels(); setConnecting(false); }
        }, 1000);
        setTimeout(function() { clearInterval(poll); setConnecting(false); }, 120000);
      }
    } catch (_e) { setConnecting(false); }
  };

  var disconnectChannel = async function() {
    if (!selectedChannel) return;
    try {
      await base44.functions.invoke('youtubeAuth', { action: 'disconnect', channel_id: selectedChannel });
      await loadChannels();
    } catch (_e) {}
  };

  var selectedClipData = clips.filter(function(_, i) { return selectedClips.includes(i); });
  var TIME_LABELS = { morning: '9:00 AM', afternoon: '1:00 PM', evening: '7:00 PM', night: '9:00 PM' };

  var scheduleClips = async function() {
    if (!selectedChannel || selectedClipData.length === 0) return;
    setScheduling(true);
    try {
      var TIME_HOURS = { morning: 9, afternoon: 13, evening: 19, night: 21 };
      var hour = TIME_HOURS[timeSlot] || 19;
      var baseDate = new Date(startDate);
      baseDate.setDate(baseDate.getDate() + 1);
      var results = [];

      for (var i = 0; i < selectedClipData.length; i++) {
        var clip = selectedClipData[i];
        var dayOffset = strategy === 'spread' ? i : Math.floor(i / 3);
        var inDayOffset = strategy === 'burst' ? (i % 3) * 2 : 0;
        var postDate = new Date(baseDate);
        postDate.setDate(postDate.getDate() + dayOffset);
        postDate.setHours(hour + inDayOffset, 0, 0, 0);
        var scheduledAt = postDate.toISOString();

        var post = await base44.entities.UploadMetadata.create({
          record_type: 'scheduled_post',
          project_id: 'clip-extractor',
          title_primary: clip.title || 'Clip ' + (i + 1),
          description_template: '',
          tags: '',
          hashtags: '',
          platform: 'youtube_shorts',
          selected_channel_id: selectedChannel,
          scheduled_at: scheduledAt,
          status: 'scheduled',
          privacy: privacy,
          video_url: videoUrl,
          clip_url: clip.clip_url || '',
          clip_data: JSON.stringify(clip),
          published_url: '',
          error_message: '',
          virality_score: clip.virality_score || 0,
        });

        results.push({ post_id: post.id, title: clip.title || 'Clip ' + (i + 1), scheduled_at: scheduledAt });
      }

      setScheduled(true);
      setScheduledPosts(results);
      console.log('Scheduled ' + results.length + ' clips directly');
    } catch (err) {
      console.error('Schedule failed:', err);
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-gray-700" />
        <h3 className="text-sm font-semibold text-gray-900">Auto-post scheduler</h3>
        <Badge variant="outline" className="text-[10px]">{selectedClipData.length} clips selected</Badge>
      </div>

      {/* YouTube channel */}
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5 mb-2">
          <Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube channel
        </span>
        {loadingChannels ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
          </div>
        ) : channels.length > 0 ? (
          <div className="space-y-2">
            {channels.length > 1 && (
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channels.map(function(ch) { return <SelectItem key={ch.channel_id} value={ch.channel_id}>{ch.channel_name}</SelectItem>; })}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs text-emerald-700">{(channels.find(function(c) { return c.channel_id === selectedChannel; }) || {}).channel_name || 'Connected'}</span>
              </div>
              <button onClick={disconnectChannel} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-0.5">
                <Unlink2 className="w-2.5 h-2.5" /> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1 border-red-200 text-red-600"
            onClick={connectChannel} disabled={connecting}>
            {connecting ? <><Loader2 className="w-3 h-3 animate-spin" />Connecting...</> : <><Link2 className="w-3 h-3" />Connect YouTube</>}
          </Button>
        )}
      </div>

      {/* Schedule settings */}
      {!scheduled && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 font-medium">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spread">1/day</SelectItem>
                  <SelectItem value="burst">3/day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium">Time</label>
              <Select value={timeSlot} onValueChange={setTimeSlot}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">9 AM</SelectItem>
                  <SelectItem value="afternoon">1 PM</SelectItem>
                  <SelectItem value="evening">7 PM</SelectItem>
                  <SelectItem value="night">9 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium">Start</label>
              <Input type="date" value={startDate} onChange={function(e) { setStartDate(e.target.value); }} className="h-7 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium">Privacy</label>
              <Select value={privacy} onValueChange={setPrivacy}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-2 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
            {selectedClipData.length} clips will post {strategy === 'spread' ? '1/day' : '3/day'} starting {startDate} at {TIME_LABELS[timeSlot]}
          </div>

          <Button onClick={scheduleClips}
            disabled={scheduling || !selectedChannel || selectedClipData.length === 0}
            className="w-full h-10 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2">
            {scheduling ? <><Loader2 className="w-4 h-4 animate-spin" />Scheduling...</> : <><Send className="w-4 h-4" />Auto-schedule {selectedClipData.length} clips</>}
          </Button>
        </div>
      )}

      {/* Scheduled confirmation */}
      {scheduled && scheduledPosts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-800">{scheduledPosts.length} clips scheduled for auto-posting!</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {scheduledPosts.map(function(post, i) {
              var d = new Date(post.scheduled_at);
              return (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-gray-50 border border-gray-100">
                  <span className="text-gray-700 truncate flex-1 mr-2">{post.title}</span>
                  <span className="text-gray-400 flex-shrink-0 font-mono text-[10px]">
                    {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN CLIP EXTRACTOR
// ══════════════════════════════════════════════════════════════════
export default function ClipExtractor() {
  var [searchParams] = useSearchParams();
  var navigate = useNavigate();
  var projectId = searchParams.get('project');

  var [currentStage, setCurrentStage] = useState(null);
  var [completedStages, setCompletedStages] = useState([]);
  var [error, setError] = useState('');
  var [statusMessage, setStatusMessage] = useState('');
  var [inputMode, setInputMode] = useState('file');
  var [videoFile, setVideoFile] = useState(null);
  var [videoUrl, setVideoUrl] = useState('');
  var [audioUrl, setAudioUrl] = useState('');
  var [videoDuration, setVideoDuration] = useState(0);
  var fileInputRef = useRef(null);
  var [asrWords, setAsrWords] = useState([]);
  var [wordCount, setWordCount] = useState(0);
  var [clips, setClips] = useState([]);
  var [maxClips, setMaxClips] = useState('8');
  var [minClipLen, setMinClipLen] = useState('15');
  var [maxClipLen, setMaxClipLen] = useState('90');
  var [videoContext, setVideoContext] = useState('');
  var [captionPreset, setCaptionPreset] = useState('hormozi_bold');
  var [cropMode, setCropMode] = useState('center_lock');
  var [cropX, setCropX] = useState(50);
  var [hookEnabled, setHookEnabled] = useState(true);
  var [progressBarEnabled, setProgressBarEnabled] = useState(true);
  var [voiceBoost, setVoiceBoost] = useState(3);
  var [copyrightPreset, setCopyrightPreset] = useState('none');
  var [speed, setSpeed] = useState(1.0);
  var [pitchShift, setPitchShift] = useState(0);
  var [mirrorFlip, setMirrorFlip] = useState(false);
  var [visualFilter, setVisualFilter] = useState('none');
  var [outputOrientation, setOutputOrientation] = useState('vertical');
  var [ffmpegReady, setFfmpegReady] = useState(false);
  var [settingsConfirmed, setSettingsConfirmed] = useState(false);
  var [savedProjectId, setSavedProjectId] = useState(projectId || null);

  // Clip selection
  var [selectedClips, setSelectedClips] = useState([]);

  var markComplete = function(stage) {
    setCompletedStages(function(prev) { return prev.includes(stage) ? prev : prev.concat([stage]); });
    setCurrentStage(null);
  };

  // ── Load project from URL param ─────────────────────────────
  useEffect(function() {
    if (projectId) loadProject(projectId);
  }, [projectId]);

  var loadProject = async function(id) {
    try {
      var records = await base44.entities.UploadMetadata.filter({ record_type: 'clip_project' });
      var project = (records || []).find(function(r) { return r.id === id; });
      if (!project) { setError('Project not found'); return; }

      setVideoContext(project.title_primary || '');
      var vUrl = project.video_url || '';
      if (vUrl.startsWith('blob:')) vUrl = '';
      setVideoUrl(vUrl);
      var aUrl = project.audio_url || '';
      if (aUrl.startsWith('blob:')) aUrl = '';
      setAudioUrl(aUrl);
      if (!vUrl) setError('Video file expired — delete this project and re-upload to get playable clips');
      setSavedProjectId(project.id);

      if (project.settings_json) {
        try {
          var settings = JSON.parse(project.settings_json);
          if (settings.captionPreset) setCaptionPreset(settings.captionPreset);
          if (settings.cropMode) setCropMode(settings.cropMode);
          if (settings.outputOrientation) setOutputOrientation(settings.outputOrientation);
          if (settings.speed) setSpeed(settings.speed);
          if (settings.visualFilter) setVisualFilter(settings.visualFilter);
        } catch (_e) {}
      }

      if (project.words_json) {
        try { var w = JSON.parse(project.words_json); setAsrWords(w); setWordCount(w.length); } catch (_e) {}
      }

      if (project.clip_data) {
        try {
          var loadedClips = JSON.parse(project.clip_data);
          setClips(loadedClips);
          setCompletedStages(['upload', 'settings', 'transcribe', 'analyze']);
          setCurrentStage('results');
        } catch (_e) {}
      }
    } catch (err) {
      setError('Failed to load project: ' + err.message);
    }
  };

  // ── Save project ────────────────────────────────────────────
  var saveProject = async function(clipsData, wordsData) {
    try {
      var settingsObj = {
        captionPreset: captionPreset, cropMode: cropMode, cropX: cropX,
        hookEnabled: hookEnabled, progressBarEnabled: progressBarEnabled,
        voiceBoost: voiceBoost, speed: speed, pitchShift: pitchShift,
        mirrorFlip: mirrorFlip, visualFilter: visualFilter,
        outputOrientation: outputOrientation,
      };

      var projectData = {
        record_type: 'clip_project',
        project_id: 'clip-extractor',
        title_primary: videoContext || 'Untitled Project',
        video_url: videoUrl,
        audio_url: audioUrl,
        clip_data: JSON.stringify(clipsData),
        words_json: JSON.stringify(wordsData),
        settings_json: JSON.stringify(settingsObj),
        clips_count: clipsData.length,
        virality_score: clipsData.length > 0 ? Math.round(clipsData.reduce(function(s, c) { return s + (c.virality_score || 0); }, 0) / clipsData.length) : 0,
        status: 'complete',
      };

      if (savedProjectId) {
        await base44.entities.UploadMetadata.update(savedProjectId, projectData);
        console.log('Project updated: ' + savedProjectId);
      } else {
        var created = await base44.entities.UploadMetadata.create(projectData);
        setSavedProjectId(created.id);
        console.log('Project saved: ' + created.id);
      }
    } catch (err) {
      console.error('Failed to save project:', err);
    }
  };

  // ── File handling ───────────────────────────────────────────
  var handleFileSelect = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setError('');
    var url = URL.createObjectURL(file);
    setVideoUrl(url);
    var durationUrl = URL.createObjectURL(file);
    var vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = function() { setVideoDuration(vid.duration); URL.revokeObjectURL(durationUrl); };
    vid.src = durationUrl;
  };

  var handleDrop = function(e) {
    e.preventDefault();
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) handleFileSelect({ target: { files: [file] } });
  };

  // ── Pipeline ────────────────────────────────────────────────
  var runFullPipeline = async function() {
    if (!videoFile) return;
    setError('');
    setClips([]);
    setCompletedStages(['settings']);
    setSelectedClips([]);

    try {
      setCurrentStage('upload');
      setStatusMessage('Uploading video...');
      var uploadedUrl;
      if (videoFile._isUrl) {
        uploadedUrl = videoFile._audioUrl || videoFile._streamUrl;
        setAudioUrl(uploadedUrl);
        setVideoUrl(videoFile._streamUrl || uploadedUrl);
      } else {
        var uploadResult = await base44.integrations.Core.UploadFile({ file: videoFile });
        uploadedUrl = uploadResult.file_url;
        setAudioUrl(uploadedUrl);
        setVideoUrl(uploadedUrl);
      }
      markComplete('upload');

      setCurrentStage('transcribe');
      setStatusMessage('Transcribing audio...');
      var result = await transcribeVoiceover(uploadedUrl, function(p) { setStatusMessage(p.message); });
      if (!result.success || !result.words || !result.words.length) throw new Error('Transcription returned no words');
      setAsrWords(result.words);
      setWordCount(result.word_count);
      setVideoDuration(result.duration || videoDuration);
      markComplete('transcribe');

      setCurrentStage('analyze');
      setStatusMessage('Claude is finding viral moments...');
      var res = await base44.functions.invoke('analyzeViralMoments', {
        transcript: result.words.map(function(w) { return w.word; }).join(' '),
        words: result.words,
        duration: result.duration || videoDuration,
        max_clips: parseInt(maxClips) || 8,
        min_clip_seconds: parseInt(minClipLen) || 15,
        max_clip_seconds: parseInt(maxClipLen) || 90,
        context: videoContext,
      });
      var data = res.data || res;

      if (data && data.clips && data.clips.length) {
        var enrichedClips = data.clips;

        // Face detection if face_track mode
        if (cropMode === 'face_track' && videoUrl) {
          setStatusMessage('Detecting faces for smart crop...');
          try {
            var faceVideo = document.createElement('video');
            faceVideo.crossOrigin = 'anonymous';
            faceVideo.preload = 'auto';
            faceVideo.src = videoUrl;
            faceVideo.muted = true;
            await new Promise(function(resolve) {
              faceVideo.onloadeddata = resolve;
              setTimeout(resolve, 10000);
            });
            var tempCanvas = document.createElement('canvas');
            tempCanvas.width = faceVideo.videoWidth || 640;
            tempCanvas.height = faceVideo.videoHeight || 360;
            var tempCtx = tempCanvas.getContext('2d');

            for (var ci = 0; ci < enrichedClips.length; ci++) {
              try {
                var midpoint = enrichedClips[ci].start + enrichedClips[ci].duration / 3;
                faceVideo.currentTime = midpoint;
                await new Promise(function(r) { faceVideo.onseeked = r; });
                tempCtx.drawImage(faceVideo, 0, 0);
                var b64 = tempCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                var faceRes = await base44.functions.invoke('detectFaceRegion', {
                  image_base64: b64, frame_width: tempCanvas.width, frame_height: tempCanvas.height,
                });
                var faceData = faceRes.data || faceRes;
                if (faceData && faceData.primary_face && faceData.primary_face.x_center_percent) {
                  enrichedClips[ci] = Object.assign({}, enrichedClips[ci], { faceCropX: faceData.primary_face.x_center_percent });
                }
                setStatusMessage('Face detection: ' + (ci + 1) + '/' + enrichedClips.length);
              } catch (_fErr) {}
            }
          } catch (_faceErr) {}
        }

        setClips(enrichedClips);
        setSelectedClips(enrichedClips.map(function(_, i) { return i; })); // Select all by default
        setStatusMessage('Found ' + enrichedClips.length + ' viral clips!');

        // Auto-save project
        await saveProject(enrichedClips, result.words);
      } else {
        setClips([]);
        setStatusMessage('No strong viral moments found');
      }
      markComplete('analyze');
      setCurrentStage('results');

      if (isFFmpegSupported() && !ffmpegReady) {
        try { await initFFmpeg(function() {}); setFfmpegReady(true); } catch (_e) {}
      }
    } catch (err) {
      setError(err.message);
      setCurrentStage(null);
    }
  };

  var resetPipeline = function() {
    setCurrentStage(null); setCompletedStages([]); setVideoFile(null);
    setVideoUrl(''); setAudioUrl(''); setVideoDuration(0);
    setAsrWords([]); setWordCount(0); setClips([]);
    setError(''); setStatusMessage(''); setInputMode('file');
    setSettingsConfirmed(false); setSavedProjectId(null);
    setSelectedClips([]);
    navigate('/ClipExtractor');
  };

  // ── Selection helpers ───────────────────────────────────────
  var toggleClipSelection = function(index) {
    setSelectedClips(function(prev) {
      if (prev.includes(index)) return prev.filter(function(i) { return i !== index; });
      return prev.concat([index]);
    });
  };

  var selectAll = function() { setSelectedClips(clips.map(function(_, i) { return i; })); };
  var deselectAll = function() { setSelectedClips([]); };

  var isRunning = currentStage && currentStage !== 'results';
  var hasVideoReady = !!videoFile;
  var enhancementSettings = {
    captionPreset: captionPreset, cropMode: cropMode, cropX: cropX,
    hookEnabled: hookEnabled, progressBarEnabled: progressBarEnabled,
    voiceBoost: voiceBoost, speed: speed, pitchShift: pitchShift,
    mirrorFlip: mirrorFlip, visualFilter: visualFilter, outputOrientation: outputOrientation,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link to="/ClipProjects" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-3 h-3" /> Projects
              </Link>
              {savedProjectId && (
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-0.5">
                  <FolderOpen className="w-2.5 h-2.5" /> Saved
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-2 flex items-center gap-2">
              <Scissors className="w-6 h-6 text-gray-700" />
              Viral Clip Extractor
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Upload → Configure style → AI extracts viral clips → Schedule & auto-post
            </p>
          </div>
          {clips.length > 0 && (
            <Button variant="outline" size="sm" onClick={resetPipeline} className="gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> New Video
            </Button>
          )}
        </div>

        {!projectId && <StageIndicator stages={STAGES} currentStage={currentStage} completedStages={completedStages} />}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div><p className="font-medium">Error</p><p className="text-red-600 mt-0.5">{error}</p></div>
          </div>
        )}

        {statusMessage && isRunning && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" /> {statusMessage}
          </div>
        )}

        {/* ── STEP 1: UPLOAD ──────────────────────────────── */}
        {!hasVideoReady && !isRunning && clips.length === 0 && !projectId && (
          <div className="space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button onClick={function() { setInputMode('file'); }}
                className={'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                  (inputMode === 'file' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}>
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <button onClick={function() { setInputMode('url'); }}
                className={'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                  (inputMode === 'url' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500')}>
                <Youtube className="w-3.5 h-3.5" /> YouTube URL
              </button>
            </div>

            {inputMode === 'url' && (
              <YouTubeUrlInput onVideoReady={function(data) {
                setVideoUrl(data.videoUrl); setAudioUrl(data.audioUrl);
                setVideoContext(data.title + (data.channel ? ' by ' + data.channel : ''));
                setVideoFile({ name: data.title || 'YouTube Video', size: 0, type: 'video/mp4', _isUrl: true, _streamUrl: data.videoUrl, _audioUrl: data.audioUrl });
              }} />
            )}

            {inputMode === 'file' && (
              <div onDrop={handleDrop} onDragOver={function(e) { e.preventDefault(); }}
                onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}
                className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer border-gray-200 bg-gray-50/50 hover:border-gray-300">
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">
                  <Upload className="w-7 h-7 text-gray-400" />
                </div>
                <p className="font-semibold text-gray-700 mt-3">Drop your video here</p>
                <p className="text-sm text-gray-400 mt-1">MP4, MOV, WebM</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: SETTINGS ────────────────────────────── */}
        {hasVideoReady && !settingsConfirmed && !isRunning && clips.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <FileVideo className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 truncate">{videoFile.name}</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs" onClick={function() { setVideoFile(null); setVideoUrl(''); }}>Change</Button>
            </div>

            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" /> Configure clip style
            </h2>

            <SettingsSection title="Caption style" icon={Type} defaultOpen={true}>
              <CaptionPreview selectedPreset={captionPreset} onSelectPreset={setCaptionPreset} />
            </SettingsSection>

            <SettingsSection title="Output format" icon={Crop} defaultOpen={true}>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={function() { setOutputOrientation('vertical'); }}
                    className={'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium ' +
                      (outputOrientation === 'vertical' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                    <Smartphone className="w-3.5 h-3.5" /> 9:16
                  </button>
                  <button onClick={function() { setOutputOrientation('horizontal'); }}
                    className={'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium ' +
                      (outputOrientation === 'horizontal' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                    16:9
                  </button>
                </div>
                {outputOrientation === 'vertical' && (
                  <div className="flex gap-1.5 flex-wrap">
                    {['center_lock', 'face_track', 'rule_of_thirds_left', 'rule_of_thirds_right'].map(function(mode) {
                      return (
                        <button key={mode} onClick={function() { setCropMode(mode); var xMap = { center_lock: 50, face_track: 50, rule_of_thirds_left: 33, rule_of_thirds_right: 67 }; setCropX(xMap[mode] || 50); }}
                          className={'px-2.5 py-1 rounded text-xs font-medium border ' + (cropMode === mode ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600')}>
                          {mode.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="Hook & retention" icon={Zap}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Hook text overlay</span>
                  <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Progress bar</span>
                  <Switch checked={progressBarEnabled} onCheckedChange={setProgressBarEnabled} />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Copyright shield" icon={Shield}>
              <CopyrightShield speed={speed} onSpeedChange={setSpeed} pitchShift={pitchShift} onPitchChange={setPitchShift}
                mirror={mirrorFlip} onMirrorChange={setMirrorFlip} visualFilter={visualFilter} onVisualFilterChange={setVisualFilter}
                preset={copyrightPreset} onPresetChange={setCopyrightPreset} />
            </SettingsSection>

            <SettingsSection title="Detection settings" icon={Settings2}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-medium">Max clips</label>
                  <Select value={maxClips} onValueChange={setMaxClips}>
                    <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['3','5','8','10','15'].map(function(v) { return <SelectItem key={v} value={v}>{v}</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-medium">Min length</label>
                  <Select value={minClipLen} onValueChange={setMinClipLen}>
                    <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['10','15','20','30'].map(function(v) { return <SelectItem key={v} value={v}>{v}s</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-medium">Max length</label>
                  <Select value={maxClipLen} onValueChange={setMaxClipLen}>
                    <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['30','60','90','120','180'].map(function(v) { return <SelectItem key={v} value={v}>{v}s</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-medium">Context</label>
                  <Input className="h-7 text-xs mt-0.5" placeholder="e.g. tech podcast" value={videoContext}
                    onChange={function(e) { setVideoContext(e.target.value); }} />
                </div>
              </div>
            </SettingsSection>

            <Button onClick={function() { setSettingsConfirmed(true); runFullPipeline(); }}
              className="w-full h-12 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2">
              <Zap className="w-4 h-4" /> Extract Viral Clips
            </Button>
          </div>
        )}

        {/* ── PROCESSING ──────────────────────────────────── */}
        {isRunning && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center mx-auto">
                {currentStage === 'upload' && <Upload className="w-7 h-7 text-blue-500 animate-pulse" />}
                {currentStage === 'transcribe' && <Mic className="w-7 h-7 text-blue-500 animate-pulse" />}
                {currentStage === 'analyze' && <Brain className="w-7 h-7 text-blue-500 animate-pulse" />}
              </div>
              <p className="font-semibold text-gray-900">{statusMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* ── RESULTS ─────────────────────────────────────── */}
        {clips.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Flame className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900">{clips.length} Viral Clips</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                {wordCount > 0 && wordCount.toLocaleString() + ' words'}
              </div>
            </div>

            {/* Selection bar */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2">
                <button onClick={function() { selectedClips.length === clips.length ? deselectAll() : selectAll(); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  {selectedClips.length === clips.length ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5" />}
                  {selectedClips.length === clips.length ? 'Deselect all' : 'Select all'}
                </button>
                <span className="text-xs text-gray-400">{selectedClips.length} of {clips.length} selected</span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-red-500" /> Avg: {Math.round(clips.reduce(function(s, c) { return s + c.virality_score; }, 0) / clips.length)}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" /> {Math.round(clips.reduce(function(s, c) { return s + c.duration; }, 0))}s total</span>
              </div>
            </div>

            {/* Applied settings */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs text-purple-700">
                {CAPTION_PRESETS[captionPreset] ? CAPTION_PRESETS[captionPreset].name : captionPreset} captions
                {' · '}{outputOrientation === 'vertical' ? '9:16' : '16:9'}
                {speed !== 1 ? ' · ' + speed + 'x' : ''}
                {visualFilter !== 'none' ? ' · ' + visualFilter : ''}
              </span>
            </div>

            {/* Clips grid with selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clips.map(function(clip, i) {
                var isSelected = selectedClips.includes(i);
                return (
                  <div key={i} className="relative">
                    {/* Selection checkbox */}
                    <button
                      onClick={function(e) { e.stopPropagation(); toggleClipSelection(i); }}
                      className={'absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ' +
                        (isSelected ? 'bg-blue-500 text-white shadow-md' : 'bg-black/50 text-white/70 hover:bg-black/70')}>
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    </button>
                    <div className={isSelected ? 'ring-2 ring-blue-400 rounded-lg' : ''}>
                      <ClipCard
                        clip={clip}
                        index={i}
                        videoUrl={videoUrl}
                        allWords={asrWords}
                        enhancementSettings={enhancementSettings}
                        onClipReady={function(idx, blob) { console.log('Clip #' + (idx + 1) + ' ready'); }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scheduler */}
            <SchedulerPanel clips={clips} selectedClips={selectedClips} videoUrl={videoUrl} />
          </div>
        )}

        {/* Empty results */}
        {completedStages.includes('analyze') && clips.length === 0 && !isRunning && (
          <Card className="border-gray-200">
            <CardContent className="p-8 text-center space-y-3">
              <Scissors className="w-7 h-7 text-gray-400 mx-auto" />
              <p className="font-semibold text-gray-700">No viral moments detected</p>
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
