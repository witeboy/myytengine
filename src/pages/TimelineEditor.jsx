import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import VideoExporter from '@/components/timeline/VideoExporter';
import useVideoExport from '@/components/timeline/useVideoExport';
import ClipPropertiesPanel from '@/components/timeline/ClipPropertiesPanel';
import CanvasPreview from '@/components/timeline/CanvasPreview';
import SnapTimelineTrack from '@/components/timeline/SnapTimeline';
import SnapGuide from '@/components/timeline/SnapGuide';
import SilenceDetector from '@/components/timeline/SilenceDetector';
import CaptionStylePresets from '@/components/timeline/CaptionStylePresets';
import OverlayPanel from '@/components/timeline/OverlayPanel';
import OverlayPropertiesPanel from '@/components/timeline/OverlayPropertiesPanel';
import AudioVolumePanel from '@/components/timeline/AudioVolumePanel';
import MusicClipProperties from '@/components/timeline/MusicClipProperties';
import MotionPresetsPanel from '@/components/timeline/MotionPresetsPanel';
import SyncDiagnosticPanel from '@/components/timeline/SyncDiagnosticPanel';
import DriftFixPanel from '@/components/timeline/DriftFixPanel';
import usePlaybackEngine from '@/hooks/usePlaybackEngine';
import { closeGaps } from '@/hooks/useSnapEngine';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2, Copy,
  Image, Music, Type, Wand2, Film, Mic, Settings, Link2, Unlink2,
  Loader2, CheckCircle, Sparkles, Star, Move, ArrowLeft, ArrowRight, FileVideo,
  LayoutGrid, FolderOpen, X, Package, Camera, AlertCircle, Clapperboard,
  Bold, Italic, Underline, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft,
  Monitor, Smartphone, Radio, Smile, Layers, GripHorizontal, ChevronDown, ChevronUp
} from 'lucide-react';

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;
const MAX_HISTORY = 50;
const DEFAULT_TRANSITION_DURATION = 0.6;
const MIN_TIMELINE_HEIGHT = 100;
const DEFAULT_TIMELINE_HEIGHT = 180;

const CINEMATIC_MOTIONS = [
  { id: 'zoom_in_center',  name: 'Push In',          description: 'Slowly drifts closer — holds at end',  startScale: 1.0,  endScale: 1.10, startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  { id: 'zoom_out_center', name: 'Pull Out',          description: 'Starts close, slowly reveals scene',   startScale: 1.10, endScale: 1.0,  startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  { id: 'pan_right_zoom',  name: 'Drift Right',       description: 'Drifts right while pushing in',        startScale: 1.0,  endScale: 1.08, startX: -1.5, startY: 0,    endX: 1.5,  endY: 0    },
  { id: 'pan_left_zoom',   name: 'Drift Left',        description: 'Drifts left while pushing in',         startScale: 1.0,  endScale: 1.08, startX: 1.5,  startY: 0,    endX: -1.5, endY: 0    },
  { id: 'push_in_top',     name: 'Drift Up',          description: 'Slowly rises while zooming in',        startScale: 1.0,  endScale: 1.08, startX: 0,    startY: 1.2,  endX: 0,    endY: -1.2 },
  { id: 'push_in_bottom',  name: 'Drift Down',        description: 'Slowly descends while zooming in',     startScale: 1.0,  endScale: 1.08, startX: 0,    startY: -1.2, endX: 0,    endY: 1.2  },
  { id: 'diagonal_tl_br',  name: 'Diagonal ↘',        description: 'Drifts top-left to bottom-right',      startScale: 1.0,  endScale: 1.08, startX: 1.5,  startY: 1.0,  endX: -1.5, endY: -1.0 },
  { id: 'diagonal_tr_bl',  name: 'Diagonal ↙',        description: 'Drifts top-right to bottom-left',      startScale: 1.0,  endScale: 1.08, startX: -1.5, startY: 1.0,  endX: 1.5,  endY: -1.0 },
];

const easingFunctions = {
  easeInOutQuad:  (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInQuad:     (t) => t * t,
  easeOutQuad:    (t) => 1 - (1 - t) * (1 - t),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutCubic:   (t) => 1 - Math.pow(1 - t, 3),
  easeOutExpo:    (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};

const EFFECTS = [
  { id: 'ken_burns', name: 'Ken Burns', icon: Move     },
  { id: 'zoom_in',   name: 'Zoom In',   icon: ZoomIn   },
  { id: 'zoom_out',  name: 'Zoom Out',  icon: Minimize2},
  { id: 'fade',      name: 'Fade',      icon: Blend    },
  { id: 'blur',      name: 'Blur',      icon: Focus    },
  { id: 'glow',      name: 'Glow',      icon: Sparkles },
];

const TRANSITIONS = [
  { id: 'black_fade',   name: 'Black Fade'   },
  { id: 'gradual_fade', name: 'Gradual Fade' },
  { id: 'expand_fade',  name: 'Expand Fade'  },
  { id: 'overlap_fade', name: 'Overlap Fade' },
];

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimecode(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

function useHistory(initialState) {
  const [history, setHistory] = useState([initialState]);
  const [index, setIndex] = useState(0);
  const state = history[index];

  const setState = useCallback((newState) => {
    const newHistory = history.slice(0, index + 1);
    newHistory.push(typeof newState === 'function' ? newState(state) : newState);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    setHistory(newHistory);
    setIndex(newHistory.length - 1);
  }, [history, index, state]);

  const undo  = useCallback(() => { if (index > 0) setIndex(index - 1); }, [index]);
  const redo  = useCallback(() => { if (index < history.length - 1) setIndex(index + 1); }, [history.length, index]);
  const reset = useCallback((newState) => { setHistory([newState]); setIndex(0); }, []);

  return { state, setState, undo, redo, reset, canUndo: index > 0, canRedo: index < history.length - 1 };
}

function TopToolbar({ activePanel, onPanelChange, projectName, onBack, onExport, onDownloadAssets, onShowExporter, onShowFFmpegExporter, onNext, onSave, isSaving, saveStatus }) {  const panels = [
    { id: 'media',       label: 'Media',       icon: Film     },
    { id: 'audio',       label: 'Audio',       icon: Music    },
    { id: 'text',        label: 'Text',        icon: Type     },
    { id: 'effects',     label: 'Effects',     icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Blend    },
    { id: 'captions',    label: 'Captions',    icon: Type     },
    { id: 'overlays',    label: 'Overlays',    icon: Layers   },
    { id: 'motion',      label: 'Motion',      icon: Camera   },
    { id: 'jumpcuts',    label: 'Jump Cuts',   icon: Scissors },
    { id: 'filters',     label: 'Filters',     icon: Palette  },
    { id: 'adjustment',  label: 'Adjustment',  icon: Settings },
  ];

  return (
    <div className="flex items-center justify-between px-2 py-1 bg-[#1a1a2e] border-b border-gray-800">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded">
          <ArrowLeft size={16} /><span className="text-xs">Back</span>
        </button>
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-sm font-medium text-white truncate max-w-[150px]">{projectName || 'Untitled'}</span>
      </div>

      <div className="flex items-center gap-0.5">
        {panels.map(panel => (
          <button key={panel.id} onClick={() => onPanelChange(panel.id)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded ${activePanel === panel.id ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}>
            <panel.icon size={14} />
            <span className="text-[8px]">{panel.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={isSaving} size="sm"
          className={`gap-1.5 text-xs ${
            saveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' :
            saveStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
            'bg-blue-600 hover:bg-blue-700'
          }`}>
          {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> :
           saveStatus === 'saved' ? <><CheckCircle size={14} /> Saved!</> :
           saveStatus === 'error' ? <><AlertCircle size={14} /> Failed</> :
           <><Package size={14} /> Save</>}
        </Button>
        <Button onClick={onDownloadAssets} variant="outline" size="sm" className="gap-1.5 text-xs border-gray-700 text-gray-300">
          <Package size={14} /> Assets
        </Button>
        <Button onClick={onShowExporter} size="sm" className="gap-1.5 text-xs bg-green-600 hover:bg-green-700">
          <FileVideo size={14} /> Export MP4
        </Button>
        <Button onClick={onShowFFmpegExporter} size="sm" className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600">
          <FileVideo size={14} /> FFmpeg Export
        </Button>
        <Button onClick={onNext} size="sm" className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700">
          Post Production <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function MediaPanel({ scenes, audioBeatDurations, videoClips, onSelectScene, onSetAllMediaType }) {
  const videoSceneCount = scenes.filter(s => s.video_url && s.video_url.startsWith('http') && !s.video_url.startsWith('veo_task:') && !s.video_url.startsWith('grok_vid_task:')).length;
  const brollSceneCount = scenes.filter(s => s.broll_url && s.broll_url.startsWith('http')).length;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{scenes.length} scenes</span>
          {videoSceneCount > 0 && <span className="text-[9px] text-purple-400">{videoSceneCount} video</span>}
          {brollSceneCount > 0 && <span className="text-[9px] text-teal-400">{brollSceneCount} B-roll</span>}
        </div>
        {(videoSceneCount > 0 || brollSceneCount > 0) && (
          <div className="space-y-1">
            <p className="text-[9px] text-gray-500">Set all clips to:</p>
            <div className="flex gap-1">
              <button onClick={() => onSetAllMediaType('image')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800/60 border border-cyan-800/50"><Image size={10} /> Image</button>
              {videoSceneCount > 0 && <button onClick={() => onSetAllMediaType('video')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] bg-purple-900/40 text-purple-300 hover:bg-purple-800/60 border border-purple-800/50"><Film size={10} /> Video</button>}
              {brollSceneCount > 0 && <button onClick={() => onSetAllMediaType('broll')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] bg-teal-900/40 text-teal-300 hover:bg-teal-800/60 border border-teal-800/50"><Clapperboard size={10} /> B-Roll</button>}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((scene, idx) => {
            const clip = videoClips.find(c => c.sceneId === scene.id);
            const isBroll = clip?.mediaType === 'broll' && clip?.brollUrl;
            const isVideo = clip?.mediaType === 'video' && clip?.videoUrl;
            const hasBroll = !!(scene.broll_url && scene.broll_url.startsWith('http'));
            const hasVideo = !!(scene.video_url && scene.video_url.startsWith('http') && !scene.video_url.startsWith('veo_task:') && !scene.video_url.startsWith('grok_vid_task:'));
            return (
              <div key={scene.id}
                className={`group relative aspect-video bg-gray-800 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-cyan-500 ${isBroll ? 'ring-1 ring-teal-500/50' : isVideo ? 'ring-1 ring-purple-500/50' : ''}`}
                onClick={() => onSelectScene(idx)}>
                {scene.image_url ? <img src={scene.image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Image className="w-5 h-5 text-gray-600" /></div>}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1">
                  <p className="text-[9px] text-white">Scene {scene.scene_number}</p>
                  <p className="text-[8px] text-cyan-300">🎵 {audioBeatDurations[idx]?.toFixed(1)}s</p>
                </div>
                <div className={`absolute top-1 right-1 px-1 py-0.5 rounded text-[8px] font-bold ${
                  isBroll ? 'bg-teal-600 text-white' : isVideo ? 'bg-purple-600 text-white' : hasBroll ? 'bg-teal-800/80 text-teal-300' : hasVideo ? 'bg-gray-700/80 text-gray-300' : 'bg-gray-800/80 text-gray-500'
                }`}>
                  {isBroll ? '📎' : isVideo ? '🎬' : hasBroll ? '📎' : hasVideo ? '🖼' : '📷'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EffectsPanel({ selectedClip, onApplyEffect, onApplyEffectToAll }) {
  const [msg, setMsg] = useState(null);
  const apply = (e) => {
    if (!selectedClip) { setMsg('Select a clip first'); setTimeout(() => setMsg(null), 2000); return; }
    onApplyEffect(e);
    setMsg(`Applied ${e.name}`);
    setTimeout(() => setMsg(null), 2000);
  };
  const applyAll = (e) => {
    onApplyEffectToAll(e);
    setMsg(`Applied ${e.name} to all clips`);
    setTimeout(() => setMsg(null), 2000);
  };
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs text-gray-400">{selectedClip ? `Scene ${selectedClip.sceneNumber}` : 'Select a clip'}</p>
      </div>
      {msg && <div className="mx-2 mt-2 px-3 py-2 bg-green-500/20 text-green-400 text-xs rounded">{msg}</div>}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {EFFECTS.map(e => (
            <div key={e.id} className="flex flex-col rounded-lg bg-gray-800/50 overflow-hidden">
              <button onClick={() => apply(e)} className="flex flex-col items-center gap-1 p-3 hover:bg-purple-500/20">
                <e.icon className="w-5 h-5 text-purple-400" />
                <span className="text-[10px] text-gray-300">{e.name}</span>
              </button>
              <button onClick={() => applyAll(e)}
                className="text-[9px] text-gray-500 hover:text-cyan-300 hover:bg-cyan-500/10 py-1 border-t border-gray-700/50 transition-colors">
                Apply to All
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransitionsPanel({ selectedClip, onApplyTransition, onRemoveTransition, onApplyTransitionToAll, onSetTransitionDuration }) {
  const [msg, setMsg] = useState(null);
  const [selectedTransition, setSelectedTransition] = useState(null);
  const currentDuration = selectedClip?.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  const apply = (t) => {
    if (!selectedClip) { setMsg('Select a video clip first'); setTimeout(() => setMsg(null), 2000); return; }
    setSelectedTransition(t);
    onApplyTransition(t);
    setMsg(`Applied "${t.name}" transition`);
    setTimeout(() => setMsg(null), 2000);
  };

  const applyToAll = () => {
    if (!selectedTransition) { setMsg('Select a transition first'); setTimeout(() => setMsg(null), 2000); return; }
    onApplyTransitionToAll(selectedTransition);
    setMsg(`Applied "${selectedTransition.name}" to all clips`);
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs text-gray-400">{selectedClip ? `Scene ${selectedClip.sceneNumber}` : 'Select a video clip'}</p>
        {selectedClip?.transition && (
          <div className="mt-2 p-2 bg-cyan-500/20 rounded flex items-center justify-between">
            <span className="text-xs text-cyan-300">Current: {selectedClip.transition}</span>
            <button onClick={onRemoveTransition} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
          </div>
        )}
      </div>
      {msg && <div className="mx-2 mt-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded">{msg}</div>}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        <p className="text-[10px] text-gray-500">Transition plays at the END of the selected clip</p>

        {selectedClip?.transition && (
          <div className="p-2 bg-purple-900/30 rounded border border-purple-700/40">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-purple-300 font-medium">Duration</span>
              <span className="text-white font-mono">{currentDuration.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0.1} max={5.0} step={0.1}
              value={currentDuration}
              onChange={e => onSetTransitionDuration(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>0.1s</span><span>Quick</span><span>Slow</span><span>5.0s</span>
            </div>
            {selectedClip && currentDuration > selectedClip.duration * 0.4 && (
              <p className="text-[9px] text-amber-400 mt-1">
                Clamped to {(selectedClip.duration * 0.4).toFixed(1)}s max (40% of clip)
              </p>
            )}
          </div>
        )}

        {selectedTransition && (
          <div className="p-2 bg-purple-500/20 rounded border border-purple-500/50">
            <p className="text-[9px] text-purple-300 mb-2">Selected: {selectedTransition.name}</p>
            <Button onClick={applyToAll} size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-xs">
              Apply to All Clips
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {TRANSITIONS.map(t => (
            <button key={t.id} onClick={() => apply(t)}
              className={`relative aspect-video bg-gray-800 rounded overflow-hidden hover:ring-2 hover:ring-cyan-500 ${selectedClip?.transition === t.name ? 'ring-2 ring-cyan-400' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center">
                <Blend className="w-6 h-6 text-white/50" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                <p className="text-[9px] text-white text-center">{t.name}</p>
              </div>
              {selectedClip?.transition === t.name && (
                <div className="absolute top-1 right-1"><CheckCircle size={12} className="text-cyan-400" /></div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CaptionsPanel({ onGenerate, isGenerating, captionCount, voiceoverUrl, transcriptionState, onOffsetCaptions, captionOffset, captionClips, onSetCaptionClips }) {
  const [del, setDel] = useState(true);
  const { status, wordCount, error, source } = transcriptionState;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">

        <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
          status === 'idle'         ? 'bg-gray-800/50 border-gray-700' :
          status === 'transcribing' ? 'bg-blue-900/30 border-blue-700/50' :
          status === 'done'         ? (source === 'asr' ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-green-900/30 border-green-700/50') :
          status === 'error'        ? 'bg-red-900/30 border-red-700/50' :
          'bg-gray-800/50 border-gray-700'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {status === 'idle'         && <><Mic size={12} className="text-gray-400" /><span className="text-gray-300">{voiceoverUrl ? 'Speech Recognition Ready' : 'Syllable-Weighted Timing'}</span></>}
            {status === 'transcribing' && <><Loader2 size={12} className="animate-spin text-blue-400" /><span className="text-blue-300">{voiceoverUrl ? 'Transcribing audio…' : 'Calculating word timings…'}</span></>}
            {status === 'done' && source === 'asr' && <><CheckCircle size={12} className="text-emerald-400" /><span className="text-emerald-300">ASR Transcription Complete</span></>}
            {status === 'done' && source !== 'asr' && <><CheckCircle size={12} className="text-green-400" /><span className="text-green-300">Captions timed (estimate)</span></>}
            {status === 'error'        && <><AlertCircle size={12} className="text-red-400" /><span className="text-red-300">No script text found</span></>}
          </div>

          {status === 'idle' && voiceoverUrl && (
            <p className="text-gray-500 leading-relaxed">
              Uses speech recognition to get exact word-level timestamps from your voiceover audio.
            </p>
          )}
          {status === 'idle' && !voiceoverUrl && (
            <p className="text-gray-500 leading-relaxed">
              No voiceover audio — will estimate timing from script text using syllable weighting.
            </p>
          )}
          {status === 'transcribing' && voiceoverUrl && (
            <p className="text-blue-400">Sending audio to speech recognition… This takes 15-30 seconds.</p>
          )}
          {status === 'transcribing' && !voiceoverUrl && (
            <p className="text-blue-400">Calculating syllable-weighted word timings…</p>
          )}
          {status === 'done' && source === 'asr' && (
            <p className="text-emerald-400">{wordCount} words with exact timestamps from audio waveform.</p>
          )}
          {status === 'done' && source !== 'asr' && (
            <p className="text-green-400">{wordCount} words timed by syllable weight (estimate).</p>
          )}
          {status === 'error' && (
            <p className="text-red-400">{error || 'Could not transcribe audio.'}<br />
              <span className="text-gray-500">Captions will fall back to script text timing.</span>
            </p>
          )}
        </div>

        {!voiceoverUrl && (
          <div className="p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-[10px] text-yellow-300">
            No voiceover loaded. Add a voiceover for frame-accurate caption timing.
          </div>
        )}

        {captionCount > 0 && (
          <div className="p-2 bg-orange-500/20 rounded text-xs text-orange-300">
            {captionCount} captions on timeline
          </div>
        )}

        <CaptionStylePresets
          captionClips={captionClips}
          onSetCaptionClips={onSetCaptionClips}
        />
      </div>

      <div className="p-3 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="del" checked={del} onChange={e => setDel(e.target.checked)} className="rounded border-gray-600" />
          <label htmlFor="del" className="text-[10px] text-gray-400">Replace existing captions</label>
        </div>
        {captionCount > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Timing Offset</span>
              <span className="text-white font-mono">{(captionOffset || 0) >= 0 ? '+' : ''}{(captionOffset || 0).toFixed(2)}s</span>
            </div>
            <input
              type="range" min={-2.0} max={2.0} step={0.05}
              value={captionOffset || 0}
              onChange={e => onOffsetCaptions(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[9px] text-gray-600">
              <span>-2s earlier</span><span>0</span><span>+2s later</span>
            </div>
          </div>
        )}
        <Button
          onClick={() => onGenerate(del)}
          disabled={isGenerating || status === 'transcribing'}
          className={`w-full ${voiceoverUrl ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}
        >
          {isGenerating
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {voiceoverUrl ? 'Transcribing Audio…' : 'Generating…'}</>
            : status === 'transcribing'
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing…</>
            : voiceoverUrl
            ? <><Mic size={14} className="mr-2" /> Generate from Audio (ASR)</>
            : <><Radio size={14} className="mr-2" /> Generate from Script</>
          }
        </Button>
      </div>
    </div>
  );
}

const STYLE_KEYS = ['fontSize', 'color', 'bgColor', 'x', 'y', 'strokeColor', 'strokeWidth', 'fontFamily', 'animation'];

function TextPropertiesPanel({ caption, onUpdate, onDelete, onDuplicate, onApplyStyleToAll, onUpdateStyleToAll }) {
  if (!caption) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a caption</div>;
  const u = (k, v) => {
    onUpdate({ ...caption, [k]: v });
    // Auto-propagate style changes to all captions
    if (STYLE_KEYS.includes(k)) {
      onUpdateStyleToAll(k, v);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Caption</span>
        <div className="flex gap-1">
          <button onClick={onApplyStyleToAll} className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded" title="Apply style to all captions"><Wand2 size={14} /></button>
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Duplicate"><Copy size={14} /></button>
          <button onClick={onDelete}    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"    title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Text</label>
        <Textarea value={caption.text} onChange={e => u('text', e.target.value)} className="bg-gray-800 border-gray-700 text-sm text-white" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
          <Input type="number" step="0.1" value={caption.startTime?.toFixed(1)} onChange={e => u('startTime', Math.max(0, parseFloat(e.target.value) || 0))} className="h-8 text-xs bg-gray-800 border-gray-700 text-white" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <Input type="number" step="0.1" value={caption.duration?.toFixed(1)} onChange={e => u('duration', Math.max(0.3, parseFloat(e.target.value) || 1))} className="h-8 text-xs bg-gray-800 border-gray-700 text-white" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Font Size: {caption.fontSize || 24}px</label>
        <Slider value={[caption.fontSize || 24]} onValueChange={([v]) => u('fontSize', v)} min={10} max={72} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">X Position: {Math.round(caption.x || 50)}%</label>
          <Slider value={[caption.x || 50]} onValueChange={([v]) => u('x', v)} min={5} max={95} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Y Position: {Math.round(caption.y || 85)}%</label>
          <Slider value={[caption.y || 85]} onValueChange={([v]) => u('y', v)} min={5} max={95} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Text Color</label>
          <div className="flex gap-1">
            <input type="color" value={caption.color || '#FFFFFF'} onChange={e => u('color', e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
            <Input value={caption.color || '#FFFFFF'} onChange={e => u('color', e.target.value)} className="flex-1 h-8 text-xs bg-gray-800 border-gray-700 text-white" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Background</label>
          <div className="flex gap-1">
            <input type="color" value={'#000000'} onChange={e => u('bgColor', e.target.value + 'cc')} className="w-8 h-8 rounded border-0 cursor-pointer" />
            <select
              value={caption.bgColor?.includes('0.7') ? '0.7' : caption.bgColor?.includes('0.5') ? '0.5' : caption.bgColor?.includes('0.9') ? '0.9' : '0.7'}
              onChange={e => u('bgColor', `rgba(0,0,0,${e.target.value})`)}
              className="flex-1 h-8 text-xs bg-gray-800 border-gray-700 rounded px-2 text-white">
              <option value="0.5">50%</option>
              <option value="0.7">70%</option>
              <option value="0.9">90%</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 mb-2 block">Quick Position</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { x: 50, y: 15, label: 'Top'    },
            { x: 50, y: 50, label: 'Center' },
            { x: 50, y: 85, label: 'Bottom' },
            { x: 15, y: 50, label: 'Left'   },
            { x: 50, y: 50, label: 'Middle' },
            { x: 85, y: 50, label: 'Right'  },
          ].map((pos, i) => (
            <button key={i} onClick={() => { u('x', pos.x); u('y', pos.y); }}
              className={`px-2 py-1.5 text-[10px] rounded ${
                Math.abs((caption.x || 50) - pos.x) < 10 && Math.abs((caption.y || 85) - pos.y) < 10
                  ? 'bg-orange-500/30 text-orange-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {pos.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransportControls({ isPlaying, onPlayPause, currentTime, totalDuration, onSeek }) {
  return (
    <div className="flex items-center justify-center gap-4 py-2 bg-[#12121f] border-t border-gray-800">
      <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10"><SkipBack size={18} /></button>
      <button onClick={onPlayPause} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${isPlaying ? 'bg-red-600' : 'bg-white'}`}>
        {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-gray-900 ml-0.5" />}
      </button>
      <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10"><SkipForward size={18} /></button>
      <div className="ml-3 flex items-center gap-2">
        <span className="text-xs font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
        <span className="text-gray-600">/</span>
        <span className="text-xs font-mono text-gray-500">{formatTimecode(totalDuration)}</span>
      </div>
    </div>
  );
}

function TimelineRuler({ totalDuration, pps, onSeek, beats = [], bpm = 0 }) {
  const markers = [];
  const interval = pps >= 15 ? 5 : pps >= 8 ? 10 : 30;
  for (let t = 0; t <= totalDuration; t += interval) markers.push(t);
 
  // Hook zone: first 3 seconds — viral content must hook here
  const hookEndPx = Math.min(3 * pps, totalDuration * pps);
 
  return (
    <div className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer overflow-hidden"
      style={{ width: totalDuration * pps, marginLeft: LABEL_WIDTH }}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - r.left) / pps))); }}>
 
      {/* Hook zone overlay — first 3 seconds */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: 0, width: hookEndPx, background: 'rgba(239,68,68,0.10)', borderRight: '1px solid rgba(239,68,68,0.5)' }}
        title="Hook Zone — first 3s must grab viewer">
        <span className="text-[7px] text-red-400 absolute top-0.5 left-1 font-bold tracking-wide select-none">HOOK</span>
      </div>
 
      {/* Beat grid lines */}
      {beats.map((beat, i) => (
        <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: beat * pps,
            width: 1,
            // Stronger line on every 4th beat (downbeat)
            background: i % 4 === 0 ? 'rgba(6,182,212,0.55)' : 'rgba(6,182,212,0.18)',
          }}
        />
      ))}
 
      {/* Time markers */}
      {markers.map(t => (
        <div key={t} className="absolute bottom-0" style={{ left: t * pps }}>
          <span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span>
        </div>
      ))}
 
      {/* BPM badge */}
      {bpm > 0 && (
        <div className="absolute right-1 top-0.5 text-[7px] text-cyan-400 font-mono select-none">
          {bpm} BPM
        </div>
      )}
    </div>
  );
}

// ── Resizable Timeline Divider ───────────────────────────────────
function TimelineDivider({ timelineHeight, onResize, collapsed, onToggle }) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = timelineHeight;
    const onMouseMove = (ev) => {
      if (!dragging.current) return;
      const delta = startY.current - ev.clientY;
      const newH = Math.max(MIN_TIMELINE_HEIGHT, Math.min(500, startH.current + delta));
      onResize(newH);
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="h-2 bg-gray-800 border-t border-gray-700 cursor-row-resize flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors group select-none"
      onMouseDown={onMouseDown}
    >
      <GripHorizontal size={12} className="text-gray-500 group-hover:text-gray-300" />
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="p-0.5 text-gray-500 hover:text-white"
      >
        {collapsed ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
    </div>
  );
}

export default function TimelineEditor() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId      = searchParams.get('project_id');

  const [activePanel,    setActivePanel]    = useState('media');
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [pps,            setPps]            = useState(15);
  const [isMuted,        setIsMuted]        = useState(false);
  const [musicVol,       setMusicVol]       = useState(0.3);
  const [voiceoverVol,   setVoiceoverVol]   = useState(1.0);
  const [previewOrientation, setPreviewOrientation] = useState(null);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [magneticMode,    setMagneticMode]    = useState(true);
  const [snapLinePx,      setSnapLinePx]      = useState(null);

  // Resizable timeline
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const effectiveTimelineHeight = timelineCollapsed ? 0 : timelineHeight;

  // Cinematic zoom intensity (global)
  const [globalZoomIntensity, setGlobalZoomIntensity] = useState(1.0);

  const videoHistory    = useHistory([]);
  const captionHistory  = useHistory([]);
  const videoClips      = videoHistory.state;
  const setVideoClips   = videoHistory.setState;
  const captionClips    = captionHistory.state;
  const setCaptionClips = captionHistory.setState;

  const [selectedVideoId,   setSelectedVideoId]   = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);

  const overlayHistory  = useHistory([]);
  const overlayClips    = overlayHistory.state;
  const setOverlayClips = overlayHistory.setState;

  // Refs that mirror clip arrays — engine reads these without triggering renders
  const videoClipsRef = useRef(videoClips);
  const captionClipsRef = useRef(captionClips);
  const overlayClipsRef = useRef(overlayClips);
  const musicClipsRef = useRef([]);
  useEffect(() => { videoClipsRef.current = videoClips; }, [videoClips]);
  useEffect(() => { captionClipsRef.current = captionClips; }, [captionClips]);
  useEffect(() => { overlayClipsRef.current = overlayClips; }, [overlayClips]);

  // Engine-driven state: only updated when visible content changes
  const [displayTime, setDisplayTime] = useState(0);
  const [activeClipState, setActiveClipState] = useState({ current: null, prev: null });
  const [activeCaptions, setActiveCaptions] = useState([]);
  const [activeOverlays, setActiveOverlays] = useState([]);

  // Ref to CanvasPreview's video element
  const previewVideoRef = useRef(null);

  const [isSyncing,         setIsSyncing]         = useState(false);
  
    // Beat detection state
  const [detectedBeats,     setDetectedBeats]     = useState([]);
  const [detectedBpm,       setDetectedBpm]       = useState(0);
  const [isDetectingBeats,  setIsDetectingBeats]  = useState(false);
  const [beatSnapEnabled,   setBeatSnapEnabled]   = useState(false);
  const [syncStatus,        setSyncStatus]        = useState(null);
  const [syncSource,        setSyncSource]        = useState(null);
  const [isGenCaptions,     setIsGenCaptions]     = useState(false);
  const [captionOffset,     setCaptionOffset]     = useState(0);
  const [isApplyingZoom,    setIsApplyingZoom]    = useState(false);
  const [initialized,       setInitialized]       = useState(false);
  const [showExporter,      setShowExporter]      = useState(false);
  const [showSyncDiag,      setShowSyncDiag]      = useState(false);
  const [asrProgress,       setAsrProgress]       = useState(null); // {phase, message, pollCount}
  const [driftedScenes,     setDriftedScenes]     = useState([]); // scenes with alignment drift detected after sync
  const [lastAlignmentResults, setLastAlignmentResults] = useState(null); // stored for manual drift fix
  const initializedRef = useRef(false);

  const [transcription, setTranscription] = useState({ status: 'idle', words: [], wordCount: 0, error: null });
  const [overrideBeatDurations, setOverrideBeatDurations] = useState(null);

  const exportHook = useVideoExport();
  const audioRef   = useRef(null);
  const musicRef   = useRef(null);

  // ── Data queries ────────────────────────────────────────────────
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn:  async () => (await base44.entities.Projects.filter({ id: projectId }))[0],
    enabled:  !!projectId
  });

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn:  async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    },
    enabled: !!projectId
  });

  const { data: prodSettings } = useQuery({
    queryKey: ['prod-settings', projectId],
    queryFn:  async () => { const l = await base44.entities.ProductionSettings.filter({ project_id: projectId }); return l[0] || null; },
    enabled:  !!projectId
  });

  const voiceoverUrl = prodSettings?.voiceover_url;

  const { data: musicTracks = [] } = useQuery({
    queryKey: ['music-timeline', projectId],
    queryFn:  () => base44.entities.MusicTracks.filter({ project_id: projectId }),
    enabled:  !!projectId,
  });
  const selectedMusic = musicTracks.find(t => t.is_selected);
  const musicUrl      = selectedMusic?.audio_url;

  const orientation = previewOrientation ?? project?.orientation ?? 'landscape';

  // ── Measure actual voiceover duration ──────────────────────────
  const [measuredAudioDuration, setMeasuredAudioDuration] = useState(0);
  const [audioLoading,          setAudioLoading]          = useState(false);
  const [audioError,            setAudioError]            = useState(null);

  useEffect(() => {
    if (!voiceoverUrl) { setMeasuredAudioDuration(0); return; }
    setAudioLoading(true);
    setAudioError(null);
    const tempAudio = new Audio();
    const handleLoadedMetadata = () => {
      const dur = tempAudio.duration;
      if (dur && isFinite(dur) && dur > 0) { setMeasuredAudioDuration(dur); setAudioError(null); }
      setAudioLoading(false);
    };
    const handleError = () => { setAudioError('Could not load audio file'); setAudioLoading(false); };
    const handleCanPlayThrough = () => {
      if (!measuredAudioDuration && tempAudio.duration && isFinite(tempAudio.duration)) setMeasuredAudioDuration(tempAudio.duration);
      setAudioLoading(false);
    };
    tempAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    tempAudio.addEventListener('error', handleError);
    tempAudio.addEventListener('canplaythrough', handleCanPlayThrough);
    tempAudio.preload = 'metadata';
    tempAudio.src     = voiceoverUrl;
    return () => {
      tempAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      tempAudio.removeEventListener('error', handleError);
      tempAudio.removeEventListener('canplaythrough', handleCanPlayThrough);
      tempAudio.src = '';
    };
  }, [voiceoverUrl]);

  const actualVoiceoverDuration = measuredAudioDuration || prodSettings?.voiceover_duration_seconds || 0;

  // ── Audio beat durations ─────────────────────────────────────────
  const audioBeatDurations = useMemo(() => {
    if (scenes.length === 0) return [];
    if (overrideBeatDurations && overrideBeatDurations.length === scenes.length) return overrideBeatDurations;
    if (prodSettings?.beat_durations) {
      try {
        const saved = JSON.parse(prodSettings.beat_durations);
        if (Array.isArray(saved) && saved.length === scenes.length) return saved;
      } catch (e) {}
    }
    return scenes.map(scene => Math.max(1.5, scene.duration_seconds || 5));
  }, [scenes, prodSettings, overrideBeatDurations]);

  const audioStartTimes = useMemo(() => {
    const starts = [];
    let offset = 0;
    audioBeatDurations.forEach(dur => { starts.push(offset); offset += dur; });
    return starts;
  }, [audioBeatDurations]);

  const totalDuration = useMemo(() => {
    const beatSum = audioBeatDurations.reduce((s, d) => s + d, 0);
    if (overrideBeatDurations) return beatSum > 0 ? beatSum : 60;
    if (actualVoiceoverDuration > 0) return actualVoiceoverDuration;
    return beatSum > 0 ? beatSum : 60;
  }, [audioBeatDurations, actualVoiceoverDuration, overrideBeatDurations]);

  const audioClips = useMemo(() => scenes.map((scene, idx) => {
    const dur = audioBeatDurations[idx] || scene.duration_seconds || 5;
    return {
      id:          `audio-${scene.id}`,
      sceneId:     scene.id,
      sceneNumber: scene.scene_number,
      type:        'audio',
      startTime:   audioStartTimes[idx] ?? 0,
      duration:    dur,
      label:       `${dur.toFixed(1)}s`,
    };
  }), [scenes, audioBeatDurations, audioStartTimes]);

  // ── Music clips — editable history-tracked state ─────────────────
  const musicHistory = useHistory([]);
  const musicClips = musicHistory.state;
  const setMusicClips = musicHistory.setState;
  const [selectedMusicId, setSelectedMusicId] = useState(null);

  // Keep musicClipsRef in sync
  useEffect(() => { musicClipsRef.current = musicClips; }, [musicClips]);

  // Auto-initialize music clip when a music track is selected
  useEffect(() => {
    if (!musicUrl || !selectedMusic || musicClips.length > 0) return;
    setMusicClips([{
      id: `music-${selectedMusic.id}-${Date.now()}`,
      type: 'music',
      startTime: 0,
      duration: totalDuration,
      audioUrl: musicUrl,
      sourceOffset: 0, // offset into the source audio file
      label: selectedMusic.title || 'Background Music',
      volume: musicVol,
    }]);
  }, [musicUrl, selectedMusic]);

  // ── Initialize video clips once ────────────────────────────────
  useEffect(() => {
    if (scenes.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    if (prodSettings?.timeline_video_clips) {
      try {
        const savedVideo = JSON.parse(prodSettings.timeline_video_clips);
        const savedCaptions = prodSettings.timeline_caption_clips ? JSON.parse(prodSettings.timeline_caption_clips) : [];
        // Only restore saved clips if they match the current scene count exactly
        // Mismatch means scenes were added/removed since last save — rebuild from scratch
        if (Array.isArray(savedVideo) && savedVideo.length === scenes.length) {
          videoHistory.reset(savedVideo);
          if (savedCaptions.length > 0) captionHistory.reset(savedCaptions);
          if (prodSettings.timeline_overlay_clips) {
            try {
              const savedOverlays = JSON.parse(prodSettings.timeline_overlay_clips);
              if (Array.isArray(savedOverlays) && savedOverlays.length > 0) overlayHistory.reset(savedOverlays);
            } catch (e) {}
          }
          setInitialized(true);
          return;
        } else {
          console.warn(`[Timeline] Saved clips (${savedVideo?.length}) ≠ scenes (${scenes.length}) — rebuilding from scenes`);
        }
      } catch (e) {
        console.warn('[Timeline] Could not restore saved state:', e.message);
      }
    }

    const currentBeats = audioBeatDurations.length === scenes.length ? audioBeatDurations : null;
    let offset = 0;
    const initClips = scenes.map((scene, idx) => {
      const duration  = (currentBeats ? currentBeats[idx] : null) || scene.duration_seconds || 5;
      const hasVideo  = scene.video_url && scene.video_url.startsWith('http') && !scene.video_url.startsWith('veo_task:') && !scene.video_url.startsWith('grok_vid_task:');
      const hasBroll = scene.broll_url && scene.broll_url.startsWith('http');
      const clip = {
        id: `video-${scene.id}`, sceneId: scene.id, sceneNumber: scene.scene_number,
        type: 'video', startTime: offset, duration,
        label: `Scene ${scene.scene_number}`, thumbnail: scene.image_url,
        imageUrl: scene.image_url, videoUrl: hasVideo ? scene.video_url : null,
        brollUrl: hasBroll ? scene.broll_url : null,
        brollSource: scene.broll_source || null, brollQuery: scene.broll_query || null,
        mediaType: hasVideo ? 'video' : 'image',
        effects: [], audioMuted: false, cinematicMotion: null,
        transition: null, transitionDuration: null, synced: false,
        motionSpeed: 1.0, motionIntensity: 1.0,
        playbackRate: 1.0, videoDuration: null,
      };
      offset += duration;
      return clip;
    });
    videoHistory.reset(initClips);
    setInitialized(true);
  }, [scenes.length, prodSettings]);

  // ── Playback Engine ─────────────────────────────────────────────
  const playbackEngine = usePlaybackEngine({
    totalDuration,
    audioRef,
    musicRef,
    videoClipsRef,
    captionClipsRef,
    overlayClipsRef,
    musicClipsRef,
    previewVideoRef,
    onTimeDisplay: useCallback((t) => setDisplayTime(t), []),
    onClipChange: useCallback((clip, prev) => setActiveClipState({ current: clip, prev }), []),
    onCaptionsChange: useCallback((caps) => setActiveCaptions(caps), []),
    onOverlaysChange: useCallback((ovs) => setActiveOverlays(ovs), []),
    onPlaybackEnd: useCallback(() => setIsPlaying(false), []),
  });

  useEffect(() => {
    if (isPlaying) playbackEngine.play();
    else playbackEngine.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (playbackEngine.getTime() > totalDuration) { playbackEngine.seek(0); }
  }, [totalDuration]);

  // ── Audio properties (mute + volume only — engine controls playback) ──
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = voiceoverVol;
    }
  }, [isMuted, voiceoverVol]);

  // ── Music mute only — engine handles play/pause/seek/volume per-clip ──
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const currentClip = activeClipState.current;
  const prevClip = activeClipState.prev;

  const currentScene = useMemo(() =>
    currentClip ? scenes.find(s => s.id === currentClip.sceneId) : null
  , [currentClip, scenes]);

  // ── AutoSync — reads saved beat timings, falls back to syllable estimation ──
  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      let newBeatDurations;
      let newStartTimes;
      let syncSource = 'words';
      let alignmentResults = null;

      // ── PRIMARY PATH: use beat_durations already saved at scene-creation time ──
      // generateSceneBreakdown and shortsSceneBreakdown both compute and save
      // beat_durations to ProductionSettings. Trust those — they are ground truth.
      const savedDurations = prodSettings?.beat_durations
        ? (() => { try { return JSON.parse(prodSettings.beat_durations); } catch (_) { return null; } })()
        : null;
      const savedStartTimes = prodSettings?.beat_start_times
        ? (() => { try { return JSON.parse(prodSettings.beat_start_times); } catch (_) { return null; } })()
        : null;

      if (
        savedDurations && Array.isArray(savedDurations) &&
        savedDurations.length === scenes.length &&
        savedDurations.every(d => typeof d === 'number' && d > 0 && isFinite(d))
      ) {
        newBeatDurations = savedDurations;
        newStartTimes = savedStartTimes && savedStartTimes.length === scenes.length
          ? savedStartTimes
          : (() => { let off = 0; return savedDurations.map(d => { const s = off; off += d; return s; }); })();
        syncSource = 'saved';
        console.log(`[AutoSync] Using saved beat timings: ${scenes.length} scenes, total ${newBeatDurations.reduce((s,d)=>s+d,0).toFixed(1)}s`);
      } else {
        // ── FALLBACK: syllable-weighted estimation ───────────────
        console.log(`[AutoSync] No saved timings match scene count (${savedDurations?.length} saved vs ${scenes.length} scenes) — estimating`);
        const countSyllables = (word) => {
          const w = word.toLowerCase().replace(/[^a-z]/g, '');
          if (!w || w.length <= 2) return 1;
          const stripped = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[aeiou]es?)$/, '').replace(/^y/, '');
          const clusters = stripped.match(/[aeiouy]{1,2}/g);
          return Math.max(1, clusters ? clusters.length : 1);
        };
        const FAST_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','is','it','its','be','as','by','he','she','we','they','this','that','was','are','has','have','had','do','did','not','so','if','up','out','from','into','than','then','when','where','who','which','i','you','my','your','our','their','its']);
        const SECS_PER_SYL = 0.165;
        const FAST_DISCOUNT = 0.60;
        const SCENE_GAP_SECS = 0.20;

        const sceneWeights = scenes.map(scene => {
          const text = (scene.narration_text || scene.voiceover_text || '').trim();
          const tokens = text.split(/\s+/).filter(Boolean);
          if (tokens.length === 0) return SCENE_GAP_SECS;
          let weight = SCENE_GAP_SECS;
          tokens.forEach(token => {
            const clean = token.toLowerCase().replace(/[^a-z]/g, '');
            const syls = countSyllables(clean);
            const fast = FAST_WORDS.has(clean);
            weight += Math.max(0.10, syls * SECS_PER_SYL * (fast ? FAST_DISCOUNT : 1.0));
            weight += /[.!?]$/.test(token) ? 0.30 : /[,;:]$/.test(token) ? 0.14 : 0;
          });
          return weight;
        });

        const totalWeight = sceneWeights.reduce((s, w) => s + w, 0);
        // Step 1: proportional raw durations
        const rawDurations = sceneWeights.map(w => (w / totalWeight) * audioDuration);
 
        // Step 2: per-scene speech span estimate (used as cap reference)
        const speechSpans = scenes.map(scene => {
          const text = (scene.narration_text || scene.voiceover_text || '').trim();
          const wc = text.split(/\s+/).filter(Boolean).length;
          return Math.max(1.0, wc * 0.42); // 0.42s per word at natural pace
        });
 
        // Step 3: clamp each scene — max 2.2× its speech span, min 1.5s
        newBeatDurations = rawDurations.map((d, i) => {
          const maxAllowed = Math.max(1.5, speechSpans[i] * 2.2);
          return Math.max(1.5, Math.min(d, maxAllowed));
        });
 
        // Step 4: redistribute clamped time proportionally to ALL scenes
        const cappedSum  = newBeatDurations.reduce((s, d) => s + d, 0);
        const surplusTime = audioDuration - cappedSum;
        if (Math.abs(surplusTime) > 0.01) {
          // First try scenes with headroom
          const headroom = newBeatDurations.map((d, i) => Math.max(0, speechSpans[i] * 2.2 - d));
          const totalHeadroom = headroom.reduce((s, h) => s + h, 0);
          if (totalHeadroom > 0.01) {
            newBeatDurations = newBeatDurations.map((d, i) =>
              parseFloat((d + (headroom[i] / totalHeadroom) * surplusTime).toFixed(3))
            );
          } else {
            // No headroom anywhere — distribute evenly across ALL scenes
            // instead of dumping everything on the last scene
            const perScene = surplusTime / newBeatDurations.length;
            newBeatDurations = newBeatDurations.map(d =>
              parseFloat((d + perScene).toFixed(3))
            );
          }
        }
 
        // Step 5: final drift correction (floating point cleanup)
        const finalDrift = audioDuration - newBeatDurations.reduce((s, d) => s + d, 0);
        if (Math.abs(finalDrift) > 0) {
          newBeatDurations[newBeatDurations.length - 1] =
            parseFloat((newBeatDurations[newBeatDurations.length - 1] + finalDrift).toFixed(3));
        }

        newStartTimes = [];
        let off = 0;
        newBeatDurations.forEach(dur => { newStartTimes.push(off); off += dur; });
        syncSource = 'words';
      } // ← closes the else/fallback block

      // Build alignment results for drift detection (syllable estimate only)
      if (syncSource === 'words') {
        alignmentResults = scenes.map((scene, idx) => {
          const text = (scene.narration_text || scene.voiceover_text || '').trim();
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          const dur = newBeatDurations[idx];
          const wordEstimate = Math.max(1.0, wordCount * 0.38);
          const isBloated = dur > wordEstimate * 2.5 && dur > 10;
          const suggestedDur = Math.round(Math.max(1.0, Math.min(10, wordEstimate + 1.5)) * 100) / 100;
          return {
            sceneId: scene.id,
            sceneNumber: scene.scene_number,
            startTime: newStartTimes[idx],
            endTime: newStartTimes[idx] + dur,
            duration: dur,
            matchScore: 1,
            empty: wordCount === 0,
            wordCount,
            speechStart: newStartTimes[idx],
            speechEnd: newStartTimes[idx] + wordEstimate,
            driftDetected: isBloated,
            driftInfo: isBloated ? {
              currentDuration: dur,
              speechSpan: Math.round(wordEstimate * 100) / 100,
              wordCount,
              wordEstimate: Math.round(wordEstimate * 100) / 100,
              suggestedDuration: suggestedDur,
              deadAir: Math.round((dur - wordEstimate) * 100) / 100,
            } : undefined,
          };
        });
      }

      // Step 3: Build synced video clips
      const synced = scenes.map((scene, idx) => {
        const existing = videoClips.find(c => c.sceneId === scene.id);
        const hasVideo = scene.video_url && scene.video_url.startsWith('http') && !scene.video_url.startsWith('veo_task:') && !scene.video_url.startsWith('grok_vid_task:');
        const hasBroll = scene.broll_url && scene.broll_url.startsWith('http');
        return {
          ...(existing || {}),
          id: `video-${scene.id}`, sceneId: scene.id, sceneNumber: scene.scene_number,
          type: 'video', startTime: newStartTimes[idx], duration: newBeatDurations[idx],
          label: `Scene ${scene.scene_number}`, thumbnail: scene.image_url,
          effects: existing?.effects || [], audioMuted: existing?.audioMuted || false,
          imageUrl: existing?.imageUrl || scene.image_url || null,
          videoUrl: existing?.videoUrl || (hasVideo ? scene.video_url : null),
          mediaType: existing?.mediaType || (hasVideo ? 'video' : 'image'),
          brollUrl: existing?.brollUrl || (hasBroll ? scene.broll_url : null),
          brollSource: existing?.brollSource || scene.broll_source || null,
          brollQuery: existing?.brollQuery || scene.broll_query || null,
          cinematicMotion: existing?.cinematicMotion || null,
          transition: existing?.transition || null,
          transitionDuration: existing?.transitionDuration ?? null,
          motionSpeed: existing?.motionSpeed ?? 1.0,
          motionIntensity: existing?.motionIntensity ?? 1.0,
          playbackRate: existing?.playbackRate ?? 1.0,
          videoDuration: existing?.videoDuration ?? null,
          manualSpeed: existing?.manualSpeed ?? false,
          synced: true,
        };
      });

      // Step 4: Measure video durations and set playback rates
      const videoDurationCache = {};
      const measureVideoDur = (url) => {
        if (videoDurationCache[url]) return Promise.resolve(videoDurationCache[url]);
        return new Promise(resolve => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => { videoDurationCache[url] = v.duration || 6; resolve(videoDurationCache[url]); };
          v.onerror = () => resolve(6);
          setTimeout(() => resolve(6), 4000);
          v.src = url;
        });
      };

      const syncedWithRates = await Promise.all(synced.map(async (clip) => {
        if (clip.mediaType !== 'video' || !clip.videoUrl) return clip;
        const vidDur = await measureVideoDur(clip.videoUrl);
        const beatDur = clip.duration;
        if (clip.manualSpeed) return { ...clip, videoDuration: vidDur };
 
        if (beatDur <= vidDur) {
          // Video is longer than or equal to beat — play at 1× (may need trimming)
          return { ...clip, playbackRate: 1.0, videoLoop: false, videoDuration: vidDur };
        }
 
        const rate = vidDur / beatDur;
 
        if (rate < 0.6) {
          // Video is too short to slow-stretch without looking broken
          // Loop at 1× instead of slow-mo
          return { ...clip, playbackRate: 1.0, videoLoop: true, videoDuration: vidDur };
        }
 
        // Safe slow-down range: 0.6× – 1.0×
        return { ...clip, playbackRate: parseFloat(rate.toFixed(3)), videoLoop: false, videoDuration: vidDur };
      }));

      setVideoClips(syncedWithRates);
      setOverrideBeatDurations(newBeatDurations);

      // Step 4b: Detect bloated scenes and show in DriftFixPanel
      if (alignmentResults) {
        setLastAlignmentResults(alignmentResults);
        const drifted = alignmentResults
          .map((a, i) => a.driftDetected ? { index: i, sceneNumber: a.sceneNumber, info: a.driftInfo } : null)
          .filter(Boolean);
        setDriftedScenes(drifted);
        if (drifted.length > 0) {
          console.log(`[AutoSync] ${drifted.length} bloated scene(s) detected — review in Drift Fix panel`);
        }
      } else {
        setDriftedScenes([]);
      }

      // Step 5: Persist
      if (prodSettings?.id) {
        try {
          await base44.entities.ProductionSettings.update(prodSettings.id, {
            beat_durations: JSON.stringify(newBeatDurations),
            beat_start_times: JSON.stringify(newStartTimes),
          });
        } catch (e) { console.warn('Could not save beat data to DB:', e.message); }
      }

      setSyncSource(syncSource);
      setSyncStatus(syncSource === 'saved' ? 'saved' : syncSource === 'asr' ? 'audio' : 'words');
    } catch (err) {
      console.error('AutoSync failed:', err);
      setSyncStatus('error');
    }

    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // ── Manual drift fix handler ─────────────────────────────────────
  const handleApplyDriftFix = async (driftedIndices) => {
    if (!lastAlignmentResults || !driftedIndices?.length) return;

    const { applyDriftFix } = await import('@/lib/asrAutoSync');
    const fixed = applyDriftFix(lastAlignmentResults.map(r => ({...r})), driftedIndices);

    const newDurations = fixed.map(a => a.duration);
    const newStarts = fixed.map(a => a.startTime);

    // Rebuild video clips with corrected timings, preserving all clip properties
    const updated = scenes.map((scene, idx) => {
      const existing = videoClips.find(c => c.sceneId === scene.id);
      const hasVideo = scene.video_url && scene.video_url.startsWith('http') && !scene.video_url.startsWith('veo_task:') && !scene.video_url.startsWith('grok_vid_task:');
      const hasBroll = scene.broll_url && scene.broll_url.startsWith('http');
      return {
        ...(existing || {}),
        id: `video-${scene.id}`, sceneId: scene.id, sceneNumber: scene.scene_number,
        type: 'video', startTime: newStarts[idx], duration: newDurations[idx],
        label: `Scene ${scene.scene_number}`, thumbnail: scene.image_url,
        imageUrl: existing?.imageUrl || scene.image_url || null,
        videoUrl: existing?.videoUrl || (hasVideo ? scene.video_url : null),
        brollUrl: existing?.brollUrl || (hasBroll ? scene.broll_url : null),
        mediaType: existing?.mediaType || (hasVideo ? 'video' : 'image'),
        effects: existing?.effects || [],
        cinematicMotion: existing?.cinematicMotion || null,
        transition: existing?.transition || null,
        transitionDuration: existing?.transitionDuration ?? null,
        motionSpeed: existing?.motionSpeed ?? 1.0,
        motionIntensity: existing?.motionIntensity ?? 1.0,
        playbackRate: existing?.playbackRate ?? 1.0,
        synced: true,
      };
    });

    setVideoClips(updated);
    setOverrideBeatDurations(newDurations);
    setLastAlignmentResults(fixed);
    setDriftedScenes([]);

    // Persist
    if (prodSettings?.id) {
      try {
        await base44.entities.ProductionSettings.update(prodSettings.id, {
          beat_durations: JSON.stringify(newDurations),
          beat_start_times: JSON.stringify(newStarts),
        });
      } catch (e) { console.warn('Could not save drift fix to DB:', e.message); }
    }

    // No caption regen needed — only bloated scenes changed, all others stay audio-anchored
  };

  // ── Cinematic zoom with intensity ───────────────────────────────
  const handleApplyCinematicZoom = (intensity) => {
    setIsApplyingZoom(true);
    const i = intensity ?? globalZoomIntensity;
    const families = [
      { inward: 'zoom_in_center',  outward: 'zoom_out_center' },
      { inward: 'pan_right_zoom',  outward: 'pan_left_zoom'   },
      { inward: 'push_in_top',     outward: 'push_in_bottom'  },
      { inward: 'diagonal_tl_br',  outward: 'diagonal_tr_bl'  },
    ];
    setVideoClips(videoClips.map((clip, idx) => {
      const family = families[Math.floor(idx / 2) % families.length];
      // Ken Burns needs ≥2.0s to complete — pad short clips
      const safeDuration = clip.duration < 2.0 ? 2.0 : clip.duration;
      return {
        ...clip,
        cinematicMotion: idx % 2 === 0 ? family.inward : family.outward,
        motionIntensity: i,
        duration: safeDuration, // enforce minimum
      };
    }));
    setIsApplyingZoom(false);
  };
  const handleRemoveCinematicZoom = () => setVideoClips(videoClips.map(c => ({ ...c, cinematicMotion: null })));

  // Update intensity on all clips when slider changes
  const handleGlobalIntensityChange = (newIntensity) => {
    setGlobalZoomIntensity(newIntensity);
    const hasMotion = videoClips.some(c => c.cinematicMotion);
    if (hasMotion) {
      setVideoClips(videoClips.map(c => c.cinematicMotion ? { ...c, motionIntensity: newIntensity } : c));
    }
  };

  const handleApplyToAll = () => {
    if (!selectedVideo) return;
    setVideoClips(videoClips.map(c => ({
      ...c,
      cinematicMotion: selectedVideo.cinematicMotion,
      motionSpeed: selectedVideo.motionSpeed ?? 1.0,
      motionIntensity: selectedVideo.motionIntensity ?? 1.0,
      transition: selectedVideo.transition,
      transitionDuration: selectedVideo.transitionDuration,
      mediaType: c.videoUrl && selectedVideo.mediaType === 'video' ? 'video' : c.mediaType,
      playbackRate: selectedVideo.mediaType === 'video' ? (selectedVideo.playbackRate ?? 1.0) : (c.playbackRate ?? 1.0),
      effects: selectedVideo.effects?.length > 0 ? [...selectedVideo.effects] : c.effects,
    })));
  };
  const motionCount     = videoClips.filter(c => c.cinematicMotion).length;
  const transitionCount = videoClips.filter(c => c.transition).length;

  // ── Caption generation ──────────────────────────────────────────
  const buildCaptionsFromWords = useCallback((allWords, deleteExisting) => {
    const MAX_CHUNK_WORDS = 6;
    const MAX_CHUNK_SECS  = 2.5;
    const caps = [];
    let chunk  = [];
    let ci     = 0;

    const flushChunk = () => {
      if (chunk.length === 0) return;
      const text = chunk.map(w => w.word).join(' ').trim();
      if (!text) { chunk = []; return; }
      caps.push({
        id: `cap-${ci++}-${Date.now()}`, type: 'caption',
        startTime: chunk[0].start,
        duration: Math.max(0.35, chunk[chunk.length - 1].end - chunk[0].start),
        text,
        label: text.slice(0, 18) + (text.length > 18 ? '…' : ''),
        x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)'
      });
      chunk = [];
    };

    allWords.forEach((w) => {
      const chunkDur = chunk.length > 0 ? w.end - chunk[0].start : 0;
      const sceneBreak = chunk.length > 0 && w.sceneIdx !== undefined && chunk[chunk.length - 1].sceneIdx !== undefined && w.sceneIdx !== chunk[chunk.length - 1].sceneIdx;

      if (sceneBreak) flushChunk();
      else if (chunk.length >= MAX_CHUNK_WORDS) flushChunk();
      else if (chunkDur >= MAX_CHUNK_SECS) flushChunk();

      chunk.push(w);

      const isSentenceEnd = /[.!?]$/.test(w.raw || w.word);
      const isClauseEnd   = /[,;:]$/.test(w.raw || w.word) && chunk.length >= 4;
      if (isSentenceEnd || isClauseEnd) flushChunk();
    });
    flushChunk();

    setCaptionClips(deleteExisting ? caps : [...captionClips, ...caps]);
  }, [captionClips, setCaptionClips]);

  const generateSyllableFallback = useCallback(() => {
    const countSyllables = (word) => {
      const w = word.toLowerCase().replace(/[^a-z]/g, '');
      if (!w) return 1;
      if (w.length <= 3) return 1;
      const stripped = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[aeiou]es?)$/, '').replace(/^y/, '');
      const clusters = stripped.match(/[aeiouy]{1,2}/g);
      return Math.max(1, clusters ? clusters.length : 1);
    };
    const FAST_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','is','it','its','be','as','by','he','she','we','they','this','that','was','are','has','have','had','do','did','not','so','if','up','out','from','into','than','then','when','where','who','which','i','you','my','your','our']);
    const SECS_PER_SYL = 0.165;
    const FAST_DISCOUNT = 0.60;
    const wordWeight = (raw) => {
      const clean = raw.toLowerCase().replace(/[^a-z]/g, '');
      return Math.max(0.10, countSyllables(clean) * SECS_PER_SYL * (FAST_WORDS.has(clean) ? FAST_DISCOUNT : 1.0));
    };
    const pauseAfter = (raw) => /[.!?]$/.test(raw) ? 0.32 : /[,;:]$/.test(raw) ? 0.16 : 0;

    const scenesWithText = scenes.filter(s => (s.narration_text || s.voiceover_text)?.trim());
    if (scenesWithText.length === 0) return [];

    const allWords = [];
    // Max seconds a scene can occupy = its speech span + generous buffer
    // Prevents 3-word scenes from stretching to 10+ seconds
    const SPEECH_RATE_SECS_PER_WORD = 0.42; // ~143 wpm natural speech
    const MAX_DENSITY_MULTIPLIER    = 2.2;   // scene can be at most 2.2× its speech span
    const MIN_SCENE_DURATION        = 1.5;   // never below 1.5s
    const SCENE_END_MARGIN          = 0.12;
 
    // First pass: compute raw speech span per scene
    const sceneSpeechSpans = scenesWithText.map((scene) => {
      const text = (scene.narration_text || scene.voiceover_text).trim();
      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return MIN_SCENE_DURATION;
      const rawSum = tokens.reduce((s, t) => s + wordWeight(t) + pauseAfter(t), 0);
      return Math.max(MIN_SCENE_DURATION, rawSum);
    });
 
    // Total raw speech time
    const totalRawSpeech = sceneSpeechSpans.reduce((s, d) => s + d, 0);
 
    // Scale factor — but cap each scene individually first
    let sf = totalRawSpeech > 0 ? 1.0 : 1.0;
 
    // Second pass: apply per-scene cap BEFORE global scale
    scenesWithText.forEach((scene, si) => {
      const idx = scenes.findIndex(s => s.id === scene.id);
      const text = (scene.narration_text || scene.voiceover_text).trim();
      const tokens = text.split(/\s+/).filter(Boolean);
      const beatStart = audioStartTimes[idx] ?? 0;
 
      // Raw speech span for this scene
      const speechSpan = sceneSpeechSpans[si];
 
      // Proportional share of total audio based on speech weight
      const proportionalShare = (speechSpan / totalRawSpeech) * (audioBeatDurations.reduce
        ? audioBeatDurations.reduce((s, d) => s + d, 0)
        : speechSpan);
 
      // Clamped beat duration — never more than MAX_DENSITY_MULTIPLIER × speech span
      const maxAllowed = Math.max(MIN_SCENE_DURATION, speechSpan * MAX_DENSITY_MULTIPLIER);
      const beatDur = Math.min(proportionalShare, maxAllowed);
      const beatEnd = beatStart + beatDur - SCENE_END_MARGIN;
 
      if (tokens.length === 0) return;
 
      const weights = tokens.map(t => wordWeight(t) + pauseAfter(t));
      const rawSum  = weights.reduce((s, w) => s + w, 0);
      const usableDur = beatDur - SCENE_END_MARGIN;
      const scale = rawSum > usableDur ? usableDur / rawSum : 1.0;
 
      let cursor = beatStart;
      tokens.forEach((token, wi) => {
        const dur = weights[wi] * scale;
        const word = token.replace(/[.,!?;:""'']/g, '').trim();
        if (!word) { cursor += dur; return; }
        if (cursor >= beatEnd) return;
        const wordEnd = Math.min(cursor + dur, beatEnd);
        allWords.push({
          word,
          raw: token,
          start: parseFloat(cursor.toFixed(3)),
          end: parseFloat(wordEnd.toFixed(3)),
          sceneIdx: idx,
        });
        cursor += dur;
      });
    });
    return allWords;
  }, [scenes, audioBeatDurations, audioStartTimes]);

  const handleGenerateCaptions = async (deleteExisting) => {
    setIsGenCaptions(true);
    setTranscription({ status: 'transcribing', words: [], wordCount: 0, error: null });

    let allWords = [];
    let usedASR = false;

    if (voiceoverUrl) {
      try {
        setAsrProgress({ phase: 'submitting', message: 'Submitting audio for speech recognition…', pollCount: 0 });
        const { transcribeVoiceover: transcribeASR } = await import('@/lib/transcribeASR');
        const result = await transcribeASR(voiceoverUrl, (p) => setAsrProgress(p));
        if (result?.success && result.words?.length > 0) {
          allWords = result.words.map(w => {
            let sceneIdx = 0;
            for (let i = audioStartTimes.length - 1; i >= 0; i--) {
              if (w.start >= (audioStartTimes[i] || 0)) { sceneIdx = i; break; }
            }
            return { word: w.word, raw: w.word, start: w.start, end: w.end, sceneIdx };
          });
          usedASR = true;
        }
      } catch (err) {
        console.warn('[Captions] ASR failed, falling back:', err.message || err);
      }
      setAsrProgress(null);
    }

    if (!usedASR) {
      allWords = generateSyllableFallback();
      if (allWords.length === 0) {
        setTranscription({ status: 'error', words: [], wordCount: 0, error: 'No script text found on any scene.' });
        setIsGenCaptions(false);
        return;
      }
    }

    setTranscription({ status: 'done', words: allWords, wordCount: allWords.length, error: null, source: usedASR ? 'asr' : 'syllable' });
    buildCaptionsFromWords(allWords, deleteExisting);
    setIsGenCaptions(false);
  };

  // ── Misc handlers ───────────────────────────────────────────────
  
  // Beat detection handler
  const handleDetectBeats = async () => {
    if (!musicUrl) return;
    setIsDetectingBeats(true);
    try {
      const { detectBeats } = await import('@/lib/beatDetector');
      const result = await detectBeats(musicUrl, (phase, pct) => {
        console.log(`[BeatDetect] ${phase} ${pct}%`);
      });
      setDetectedBeats(result.beats);
      setDetectedBpm(result.bpm);
      console.log(`[BeatDetect] ${result.beats.length} beats at ${result.bpm} BPM`);
    } catch (err) {
      console.error('[BeatDetect] failed:', err.message);
    }
    setIsDetectingBeats(false);
  };
 
  // Snap all clip boundaries to nearest beat
  const handleSnapAllToBeats = async () => {
    if (detectedBeats.length === 0) return;
    const { snapTimestampsToBeat } = await import('@/lib/beatDetector');
 
    // Collect all clip start times and snap them
    let cumulativeOffset = 0;
    const snappedClips = videoClips.map((clip, idx) => {
      const snappedStart = snapTimestampsToBeat([clip.startTime], detectedBeats, 150)[0];
      // Adjust duration so next clip starts where this one's snapped start was
      const nextStart = videoClips[idx + 1]?.startTime ?? (clip.startTime + clip.duration);
      const snappedNextStart = snapTimestampsToBeat([nextStart], detectedBeats, 150)[0];
      const newDuration = Math.max(1.0, snappedNextStart - snappedStart);
      return { ...clip, startTime: snappedStart, duration: newDuration };
    });
    setVideoClips(snappedClips);
  };
 
  // Beat-lock captions
  const handleBeatLockCaptions = async () => {
    if (detectedBeats.length === 0 || captionClips.length === 0) return;
    const { beatLockCaptions } = await import('@/lib/beatDetector');
    const locked = beatLockCaptions(captionClips, detectedBeats, 80);
    setCaptionClips(locked);
  };
 

 const handleUndo   = () => { videoHistory.undo(); captionHistory.undo(); overlayHistory.undo(); musicHistory.undo(); };
  const handleRedo   = () => { videoHistory.redo(); captionHistory.redo(); overlayHistory.redo(); musicHistory.redo(); };
  const handleDelete = () => {
    if (selectedVideoId) {
      let remaining = videoClips.filter(c => c.id !== selectedVideoId);
      if (magneticMode) remaining = closeGaps(remaining);
      setVideoClips(remaining);
      setSelectedVideoId(null);
    }
    if (selectedCaptionId) { setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); }
    if (selectedOverlayId) { setOverlayClips(overlayClips.filter(c => c.id !== selectedOverlayId)); setSelectedOverlayId(null); }
    if (selectedMusicId) { setMusicClips(musicClips.filter(c => c.id !== selectedMusicId)); setSelectedMusicId(null); }
  };

  // ── Music: split at playhead ─────────────────────────────────────
  const handleSplitMusicAtPlayhead = () => {
    const t = playbackEngine.getTime();
    const clip = musicClips.find(c => t > c.startTime && t < c.startTime + c.duration);
    if (!clip) return;
    const splitPoint = t - clip.startTime;
    const sourceOffsetBase = clip.sourceOffset || 0;
    const left = { ...clip, duration: splitPoint };
    const right = {
      ...clip,
      id: `music-split-${Date.now()}`,
      startTime: t,
      duration: clip.duration - splitPoint,
      sourceOffset: sourceOffsetBase + splitPoint,
    };
    setMusicClips(musicClips.map(c => c.id === clip.id ? left : c).concat(right));
  };

  // ── Music: duplicate selected ────────────────────────────────────
  const handleDuplicateMusic = () => {
    const clip = musicClips.find(c => c.id === selectedMusicId);
    if (!clip) return;
    const dup = { ...clip, id: `music-dup-${Date.now()}`, startTime: clip.startTime + clip.duration + 0.5 };
    setMusicClips([...musicClips, dup]);
    setSelectedMusicId(dup.id);
  };
  const handleBack           = () => navigate(createPageUrl('ContentGeneration') + `?project_id=${projectId}`);
  const handleExport         = () => setShowExporter(true);
  const [showFFmpegExporter, setShowFFmpegExporter] = useState(false);
  const handleDownloadAssets = () => alert('Download Assets coming soon!');
  const handleSeek           = t  => {
    const ct = Math.max(0, Math.min(totalDuration, t));
    playbackEngine.seek(ct);
  };
  const handleNext           = () => navigate(createPageUrl('PostProduction') + `?project_id=${projectId}`);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const handleSaveTimeline = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const payload = {
        timeline_video_clips: JSON.stringify(videoClips),
        timeline_caption_clips: JSON.stringify(captionClips),
        timeline_overlay_clips: JSON.stringify(overlayClips),
      };
      // Music clips don't have a dedicated DB field yet — piggyback on overlay clips field isn't ideal,
      // so we just re-derive them from the selected music track on load.
      if (overrideBeatDurations) payload.beat_durations = JSON.stringify(overrideBeatDurations);
      if (prodSettings?.id) {
        await base44.entities.ProductionSettings.update(prodSettings.id, payload);
      } else {
        await base44.entities.ProductionSettings.create({ project_id: projectId, ...payload });
      }
      setSaveStatus('saved');
    } catch (e) {
      console.error('[Timeline] Save failed:', e);
      setSaveStatus('error');
    }
    setIsSaving(false);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleApplyEffect          = e  => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, effects: [...(c.effects || []), e.id] } : c)); };
  const handleApplyEffectToAll     = e  => setVideoClips(videoClips.map(c => ({ ...c, effects: [...new Set([...(c.effects || []), e.id])] })));
  const handleApplyTransition      = t  => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: t.name } : c)); };
  const handleRemoveTransition     = () => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: null } : c)); };
  const handleSetTransitionDuration = (dur) => {
    if (!selectedVideoId) return;
    setVideoClips(videoClips.map(c => {
      if (c.id !== selectedVideoId) return c;
      // Never let transition outlast 40% of clip — prevents canvas corruption on export
      const maxTransition = parseFloat((c.duration * 0.4).toFixed(2));
      const safeDur = Math.min(dur, maxTransition);
      return { ...c, transitionDuration: safeDur };
    }));
  };  const handleApplyTransitionToAll = (t) => setVideoClips(videoClips.map(c => {
    const maxTransition = parseFloat((c.duration * 0.4).toFixed(2));
    const currentDur = c.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
    return { ...c, transition: t.name, transitionDuration: Math.min(currentDur, maxTransition) };
  }));
  const handleDeleteCaption        = () => { if (!selectedCaptionId) return; setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); };
  const handleDuplicateCaption     = () => {
    const cap = captionClips.find(c => c.id === selectedCaptionId);
    if (!cap) return;
    const dup = { ...cap, id: `cap-dup-${Date.now()}`, startTime: cap.startTime + cap.duration + 0.5 };
    setCaptionClips([...captionClips, dup]);
    setSelectedCaptionId(dup.id);
  };

  const handleApplyStyleToAllCaptions = () => {
    const cap = captionClips.find(c => c.id === selectedCaptionId);
    if (!cap) return;
    setCaptionClips(captionClips.map(c => ({
      ...c,
      fontSize: cap.fontSize,
      color: cap.color,
      bgColor: cap.bgColor,
      x: cap.x,
      y: cap.y,
      strokeColor: cap.strokeColor,
      strokeWidth: cap.strokeWidth,
      fontFamily: cap.fontFamily,
      animation: cap.animation,
    })));
  };

  const handleOffsetCaptions = (newOffset) => {
    const delta = newOffset - captionOffset;
    if (Math.abs(delta) < 0.001) return;
    setCaptionClips(captionClips.map(c => ({ ...c, startTime: Math.max(0, c.startTime + delta) })));
    setCaptionOffset(newOffset);
  };

  const selectedVideo    = videoClips.find(c => c.id === selectedVideoId);
  const selectedCaption  = captionClips.find(c => c.id === selectedCaptionId);
  const selectedVideoIdx = videoClips.findIndex(c => c.id === selectedVideoId);
  const selectedOverlay = overlayClips.find(c => c.id === selectedOverlayId);
  const selectedMusicClip = musicClips.find(c => c.id === selectedMusicId);
  const canUndo = videoHistory.canUndo || captionHistory.canUndo || overlayHistory.canUndo || musicHistory.canUndo;
  const canRedo = videoHistory.canRedo || captionHistory.canRedo || overlayHistory.canRedo || musicHistory.canRedo;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}
      {musicUrl && <audio ref={musicRef} src={musicUrl} preload="auto" loop />}

      <TopToolbar
        activePanel={activePanel} onPanelChange={setActivePanel}
        projectName={project?.name} onBack={handleBack}
        onExport={handleExport} onDownloadAssets={handleDownloadAssets}
        onShowExporter={() => setShowExporter(true)}
        onShowFFmpegExporter={() => setShowFFmpegExporter(true)} onNext={handleNext}
        onSave={handleSaveTimeline} isSaving={isSaving} saveStatus={saveStatus}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <div className="w-52 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'audio'       && (
            <AudioVolumePanel
              voiceoverUrl={voiceoverUrl} voiceoverVol={voiceoverVol} onVoiceoverVolChange={setVoiceoverVol}
              musicUrl={musicUrl} musicVol={musicVol} onMusicVolChange={setMusicVol}
              musicTitle={selectedMusic?.title}
            />
          )}
          {activePanel === 'media'       && <MediaPanel
            scenes={scenes} audioBeatDurations={audioBeatDurations} videoClips={videoClips}
            onSelectScene={idx => handleSeek(audioStartTimes[idx] ?? 0)}
            onSetAllMediaType={(type) => {
              setVideoClips(videoClips.map(clip => ({
                ...clip,
                mediaType: type === 'video' && clip.videoUrl ? 'video' : type === 'broll' && clip.brollUrl ? 'broll' : 'image',
              })));
            }}
          />}
          {activePanel === 'effects'     && <EffectsPanel selectedClip={selectedVideo} onApplyEffect={handleApplyEffect} onApplyEffectToAll={handleApplyEffectToAll} />}
          {activePanel === 'transitions' && <TransitionsPanel selectedClip={selectedVideo} onApplyTransition={handleApplyTransition} onRemoveTransition={handleRemoveTransition} onApplyTransitionToAll={handleApplyTransitionToAll} onSetTransitionDuration={handleSetTransitionDuration} />}
          {activePanel === 'captions'    && (
            <CaptionsPanel
              onGenerate={handleGenerateCaptions} isGenerating={isGenCaptions}
              captionCount={captionClips.length} voiceoverUrl={voiceoverUrl}
              transcriptionState={transcription} onOffsetCaptions={handleOffsetCaptions}
              captionOffset={captionOffset} captionClips={captionClips} onSetCaptionClips={setCaptionClips}
            />
          )}
          {activePanel === 'overlays'    && (
            <OverlayPanel
              overlayClips={overlayClips}
              onAddOverlay={(clip) => { setOverlayClips([...overlayClips, clip]); setSelectedOverlayId(clip.id); setSelectedVideoId(null); setSelectedCaptionId(null); }}
              onRemoveOverlay={(id) => { setOverlayClips(overlayClips.filter(c => c.id !== id)); if (selectedOverlayId === id) setSelectedOverlayId(null); }}
              currentTime={displayTime} totalDuration={totalDuration}
              projectId={projectId}
            />
          )}
          {activePanel === 'motion'      && (
            <MotionPresetsPanel
              selectedClip={selectedVideo} videoClips={videoClips}
              onUpdateClip={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))}
              onUpdateAllClips={setVideoClips}
            />
          )}
          {activePanel === 'jumpcuts'    && (
            <SilenceDetector
              voiceoverUrl={voiceoverUrl} videoClips={videoClips} captionClips={captionClips}
              onSetVideoClips={setVideoClips} onSetCaptionClips={setCaptionClips}
              onSeek={handleSeek} totalDuration={totalDuration}
            />
          )}
          {!['media','audio','effects','transitions','captions','overlays','motion','jumpcuts'].includes(activePanel) && <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>}
        </div>

        {/* Center — Preview (expands to fill remaining space) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <CanvasPreview
              currentScene={currentScene} currentTime={displayTime} currentClip={currentClip} prevClip={prevClip}
              videoRef={previewVideoRef}
              captions={captionClips} selectedCaption={selectedCaption}
              onSelectCaption={c => { setSelectedCaptionId(c?.id || null); setSelectedVideoId(null); setSelectedOverlayId(null); }}
              onUpdateCaption={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
              orientation={orientation} onOrientationChange={setPreviewOrientation}
              videoClips={videoClips} scenes={scenes} overlayClips={overlayClips}
              selectedOverlayId={selectedOverlayId}
              onSelectOverlay={ov => { setSelectedOverlayId(ov?.id || null); setSelectedVideoId(null); setSelectedCaptionId(null); }}
              onUpdateOverlay={c => setOverlayClips(overlayClips.map(x => x.id === c.id ? c : x))}
            />
          </div>
          <TransportControls isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} currentTime={displayTime} totalDuration={totalDuration} onSeek={handleSeek} />
        </div>

        {/* Right panel */}
        <div className="w-60 flex-shrink-0 bg-[#12121f]">
          {selectedOverlay ? (
            <OverlayPropertiesPanel
              overlay={selectedOverlay}
              onUpdate={c => setOverlayClips(overlayClips.map(x => x.id === c.id ? c : x))}
              onDelete={() => { setOverlayClips(overlayClips.filter(c => c.id !== selectedOverlayId)); setSelectedOverlayId(null); }}
              onDuplicate={() => {
                const dup = { ...selectedOverlay, id: `overlay-dup-${Date.now()}`, startTime: selectedOverlay.startTime + selectedOverlay.duration + 0.5 };
                setOverlayClips([...overlayClips, dup]);
                setSelectedOverlayId(dup.id);
              }}
            />
          ) : selectedCaption ? (
            <TextPropertiesPanel
              caption={selectedCaption}
              onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
              onDelete={handleDeleteCaption}
              onDuplicate={handleDuplicateCaption}
              onApplyStyleToAll={handleApplyStyleToAllCaptions}
              onUpdateStyleToAll={(k, v) => setCaptionClips(captionClips.map(c => ({ ...c, [k]: v })))}
            />
          ) : selectedMusicClip ? (
            <MusicClipProperties
              clip={selectedMusicClip}
              onUpdate={c => setMusicClips(musicClips.map(x => x.id === c.id ? c : x))}
              onDelete={() => { setMusicClips(musicClips.filter(c => c.id !== selectedMusicId)); setSelectedMusicId(null); }}
              onDuplicate={handleDuplicateMusic}
              onSplit={handleSplitMusicAtPlayhead}
              currentTime={displayTime}
            />
          ) : selectedVideo ? (
            <ClipPropertiesPanel clip={selectedVideo} audioBeatDuration={audioBeatDurations[selectedVideoIdx]} onUpdate={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} onApplyToAll={handleApplyToAll} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* ASR Processing Bar */}
      {asrProgress && (
        <div className="flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-indigo-900/60 to-cyan-900/60 border-t border-cyan-700/50">
          <div className="flex items-center gap-2 flex-shrink-0">
            {asrProgress.phase === 'done' ? (
              <CheckCircle size={14} className="text-emerald-400" />
            ) : asrProgress.phase === 'error' ? (
              <AlertCircle size={14} className="text-red-400" />
            ) : (
              <Loader2 size={14} className="animate-spin text-cyan-400" />
            )}
            <span className={`text-xs font-medium ${
              asrProgress.phase === 'done' ? 'text-emerald-300' :
              asrProgress.phase === 'error' ? 'text-red-300' :
              'text-cyan-300'
            }`}>
              {asrProgress.phase === 'submitting' ? 'Submitting' :
               asrProgress.phase === 'submitted' ? 'Submitted' :
               asrProgress.phase === 'processing' ? 'Transcribing' :
               asrProgress.phase === 'done' ? 'Complete' :
               asrProgress.phase === 'error' ? 'Failed' : 'ASR'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-700/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    asrProgress.phase === 'done' ? 'bg-emerald-400' :
                    asrProgress.phase === 'error' ? 'bg-red-400' :
                    'bg-gradient-to-r from-cyan-400 to-indigo-400'
                  }`}
                  style={{
                    width: asrProgress.phase === 'submitting' ? '5%' :
                           asrProgress.phase === 'submitted' ? '10%' :
                           asrProgress.phase === 'processing' ? `${Math.min(90, 10 + asrProgress.pollCount * 12)}%` :
                           asrProgress.phase === 'done' ? '100%' : '50%'
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0 font-mono">
                {asrProgress.phase === 'processing' ? `~${asrProgress.pollCount * 3}s` : ''}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{asrProgress.message}</p>
          </div>
        </div>
      )}

      {/* Drift Fix Panel — shows detected bloated scenes after sync */}
      <DriftFixPanel
        driftedScenes={driftedScenes}
        onApplyFix={handleApplyDriftFix}
        onDismiss={() => setDriftedScenes([])}
      />

      {/* Bottom compact toolbar + cinematic intensity */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!canUndo} className={`p-1 rounded ${canUndo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Undo"><Undo2 size={14} /></button>
          <button onClick={handleRedo} disabled={!canRedo} className={`p-1 rounded ${canRedo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Redo"><Redo2 size={14} /></button>
          <div className="w-px h-3 bg-gray-700 mx-0.5" />
          <button onClick={() => { if (selectedMusicId) handleSplitMusicAtPlayhead(); }} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Split at Playhead"><Scissors size={14} /></button>
          <button onClick={() => { if (selectedMusicId) handleDuplicateMusic(); }} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Duplicate"><Copy size={14} /></button>
          <button onClick={handleDelete} disabled={!selectedVideoId && !selectedCaptionId && !selectedOverlayId && !selectedMusicId}
            className={`p-1 rounded ${(selectedVideoId || selectedCaptionId || selectedOverlayId || selectedMusicId) ? 'text-red-400 hover:text-red-300' : 'text-gray-600'}`} title="Delete"><Trash2 size={14} /></button>
          <div className="w-px h-3 bg-gray-700 mx-0.5" />
          <button onClick={() => setSnappingEnabled(!snappingEnabled)}
            className={`p-1 rounded flex items-center gap-0.5 text-[9px] ${snappingEnabled ? 'text-cyan-400 bg-cyan-500/15' : 'text-gray-600'}`} title="Snap">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15V9a6 6 0 0 1 12 0v6"/><path d="M6 15a2 2 0 0 1-2-2V9"/><path d="M18 15a2 2 0 0 0 2-2V9"/></svg>
          </button>
          <button onClick={() => setMagneticMode(!magneticMode)}
            className={`p-1 rounded flex items-center gap-0.5 text-[9px] ${magneticMode ? 'text-green-400 bg-green-500/15' : 'text-gray-600'}`} title="Magnet">
            {magneticMode ? <Link2 size={12} /> : <Unlink2 size={12} />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => isSyncing ? null : setShowSyncDiag(true)} disabled={isSyncing} size="sm"
            className={`gap-1.5 text-xs px-3 h-7 ${
              syncSource === 'saved' || syncStatus === 'audio' || syncStatus === 'saved' ? 'bg-green-600' : syncStatus === 'words' ? 'bg-teal-600' : syncStatus === 'error' ? 'bg-red-600' :
              'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
            }`}>
            {isSyncing ? <><Loader2 size={12} className="animate-spin" /> ASR Syncing…</> :
             syncStatus === 'saved' ? <><CheckCircle size={12} /> Synced!</> :
             syncStatus === 'audio' ? <><CheckCircle size={12} /> ASR Synced!</> :
             syncStatus === 'words' ? <><CheckCircle size={12} /> Estimated</> :
             <><Wand2 size={12} /> AutoSync</>}
          </Button>

          {/* Beat Detection + Grid */}
          {musicUrl && (
            <div className="flex items-center gap-1">
              <Button
                onClick={detectedBeats.length > 0 ? handleSnapAllToBeats : handleDetectBeats}
                disabled={isDetectingBeats}
                size="sm"
                className={`gap-1 text-xs px-3 h-7 ${detectedBeats.length > 0 ? 'bg-cyan-700 hover:bg-cyan-800' : 'bg-[#0e4f5c] hover:bg-[#0e6070] border border-cyan-700/50'}`}
              >
                {isDetectingBeats
                  ? <><Loader2 size={12} className="animate-spin" /> Detecting…</>
                  : detectedBeats.length > 0
                  ? <><Music size={12} /> Snap to Beat ({detectedBeats.length})</>
                  : <><Music size={12} /> Detect Beats</>}
              </Button>
              {detectedBeats.length > 0 && captionClips.length > 0 && (
                <Button onClick={handleBeatLockCaptions} size="sm"
                  className="gap-1 text-xs px-2 h-7 bg-purple-800 hover:bg-purple-900 border border-purple-600/50">
                  <Type size={12} /> Lock Captions
                </Button>
              )}
            </div>
          )}
 
          {/* Cinematic Zoom + Intensity */}
          <div className="flex items-center gap-1.5">
             <Button onClick={motionCount > 0 ? handleRemoveCinematicZoom : () => handleApplyCinematicZoom(globalZoomIntensity)} disabled={isApplyingZoom} size="sm"      className={`gap-1 text-xs px-3 h-7 ${motionCount > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'}`}>
              {motionCount > 0 ? <><X size={12} /> Zoom ({motionCount})</> : <><Camera size={12} /> Zoom</>}
            </Button>
            <div className="flex items-center gap-1 bg-gray-800/80 rounded px-2 py-1">
              <span className="text-[9px] text-gray-400">Intensity</span>
              <input
                type="range" min={0.2} max={2.0} step={0.1}
                value={globalZoomIntensity}
                onChange={e => handleGlobalIntensityChange(parseFloat(e.target.value))}
                className="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-[9px] text-amber-400 w-6 text-right font-mono">{globalZoomIntensity.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-gray-500">
          <span>{videoClips.filter(c => c.mediaType === 'video').length}🎬 {videoClips.filter(c => c.mediaType === 'broll').length}📎 {videoClips.filter(c => c.mediaType === 'image' || (!c.mediaType)).length}🖼</span>
          <span>{captionClips.length} cap</span>
          {overlayClips.length > 0 && <span className="text-pink-400">{overlayClips.length} ov</span>}
          {motionCount > 0 && <span className="text-amber-400">{motionCount}z</span>}
          {transitionCount > 0 && <span className="text-purple-400">{transitionCount}t</span>}
          <div className="w-px h-3 bg-gray-700" />
          <button onClick={() => setPps(p => Math.max(3, p / 1.25))} className="p-0.5 text-gray-400 hover:text-white"><ZoomOut size={12} /></button>
          <span className="w-4 text-center">{Math.round(pps)}</span>
          <button onClick={() => setPps(p => Math.min(50, p * 1.25))} className="p-0.5 text-gray-400 hover:text-white"><ZoomIn size={12} /></button>
          <button onClick={() => setIsMuted(!isMuted)} className="p-0.5 text-gray-400 hover:text-white">{isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
          {/* Inline volume controls */}
          {voiceoverUrl && (
            <div className="flex items-center gap-1" title="Voiceover volume">
              <Mic size={10} className="text-indigo-400" />
              <input type="range" min={0} max={1} step={0.05} value={voiceoverVol}
                onChange={e => setVoiceoverVol(parseFloat(e.target.value))}
                className="w-12 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
          )}
          {musicUrl && (
            <div className="flex items-center gap-1" title="Music volume">
              <Music size={10} className="text-purple-400" />
              <input type="range" min={0} max={1} step={0.05} value={musicVol}
                onChange={e => setMusicVol(parseFloat(e.target.value))}
                className="w-12 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
            </div>
          )}
        </div>
      </div>

      {/* Voiceover info bar — compact */}
      {voiceoverUrl && (
        <div className={`px-2 py-1 border-t text-[10px] flex items-center gap-3 ${
          audioLoading ? 'bg-amber-900/30 border-amber-800/50 text-amber-300' :
          audioError   ? 'bg-red-900/30   border-red-800/50   text-red-300'   :
          actualVoiceoverDuration > 0 ? 'bg-indigo-900/30 border-indigo-800/50 text-indigo-300' :
          'bg-gray-800/50 border-gray-700 text-gray-400'
        }`}>
          <Mic size={10} />
          {audioLoading ? <><Loader2 size={10} className="animate-spin" /><span>Measuring…</span></> :
           audioError   ? <><AlertCircle size={10} /><span>Audio error</span></> :
           actualVoiceoverDuration > 0 ? <>
             <span>{formatTime(actualVoiceoverDuration)}</span>
             <span>•</span>
             <span>{scenes.length} scenes</span>
             {measuredAudioDuration > 0 && <span className="text-green-400">✓ measured</span>}
             {transcription.status === 'done' && <span className={transcription.source === 'asr' ? 'text-emerald-400' : 'text-orange-400'}>✓ {transcription.wordCount}w {transcription.source === 'asr' ? 'ASR' : 'est'}</span>}
           </> : <span>No audio</span>}
        </div>
      )}

      {/* Draggable Timeline Divider */}
      <TimelineDivider
        timelineHeight={timelineHeight}
        onResize={setTimelineHeight}
        collapsed={timelineCollapsed}
        onToggle={() => setTimelineCollapsed(!timelineCollapsed)}
      />

      {/* Timeline — collapsible & resizable */}
      <div className="flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto relative transition-all duration-200"
        style={{ height: effectiveTimelineHeight, overflow: timelineCollapsed ? 'hidden' : undefined }}>
        {!timelineCollapsed && (
          <>
            <TimelineRuler totalDuration={totalDuration} pps={pps} onSeek={handleSeek} beats={detectedBeats} bpm={detectedBpm} />
            {scenes.length === 0
              ? <div className="flex items-center justify-center h-20 text-gray-500 text-xs">No scenes</div>
              : <>
                  <SnapTimelineTrack type="overlay" clips={overlayClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={displayTime} selectedId={selectedOverlayId}
                    onSelect={id => { setSelectedOverlayId(id); setSelectedVideoId(null); setSelectedCaptionId(null); }}
                    onUpdate={c => setOverlayClips(overlayClips.map(x => x.id === c.id ? c : x))}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                  <SnapTimelineTrack type="video" clips={videoClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={displayTime} selectedId={selectedVideoId}
                    onSelect={id => { setSelectedVideoId(id); setSelectedCaptionId(null); setSelectedOverlayId(null); }}
                    onUpdate={c => { let updated = videoClips.map(x => x.id === c.id ? c : x); if (magneticMode) updated = closeGaps(updated); setVideoClips(updated); }}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                  <SnapTimelineTrack type="audio" clips={audioClips} allClips={[]} pps={pps} totalDuration={totalDuration} currentTime={displayTime} selectedId={null}
                    onSelect={() => {}} onUpdate={() => {}} editable={false} snappingEnabled={false} />
                  {musicClips.length > 0 && (
                    <SnapTimelineTrack type="music" clips={musicClips} allClips={[...musicClips, ...videoClips]} pps={pps} totalDuration={totalDuration} currentTime={displayTime} selectedId={selectedMusicId}
                      onSelect={id => { setSelectedMusicId(id); setSelectedVideoId(null); setSelectedCaptionId(null); setSelectedOverlayId(null); }}
                      onUpdate={c => setMusicClips(musicClips.map(x => x.id === c.id ? c : x))}
                      editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                  )}
                  <SnapTimelineTrack type="caption" clips={captionClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={displayTime} selectedId={selectedCaptionId}
                    onSelect={id => { setSelectedCaptionId(id); setSelectedVideoId(null); setSelectedOverlayId(null); }}
                    onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                </>
            }
            <SnapGuide snapLinePx={snapLinePx} trackAreaHeight={effectiveTimelineHeight - 20} />
          </>
        )}
      </div>

      {/* Sync Diagnostic Panel */}
      <SyncDiagnosticPanel
        open={showSyncDiag}
        onClose={() => setShowSyncDiag(false)}
        onProceed={handleAutoSync}
        scenes={scenes}
        voiceoverUrl={voiceoverUrl}
        audioDuration={actualVoiceoverDuration}
        audioLoading={audioLoading}
        audioError={audioError}
        videoClips={videoClips}
        captionClips={captionClips}
        prodSettings={prodSettings}
      />

      {/* FFmpeg Exporter modal */}
      {showFFmpegExporter && (() => {
        const exportScenes = videoClips.map(clip => {
          const scene = scenes.find(s => s.id === clip.sceneId);
          return {
            ...clip,
            image_url: clip.imageUrl || scene?.image_url,
            video_url: clip.videoUrl || scene?.video_url,
            narration_text: scene?.narration_text,
            voiceover_text: scene?.voiceover_text,
            mediaType: clip.mediaType || 'image',
            playbackRate: clip.playbackRate ?? 1.0,
            videoDuration: clip.videoDuration ?? null,
            cinematicMotion: clip.cinematicMotion || null,
            motionSpeed: clip.motionSpeed ?? 1.0,
            motionIntensity: clip.motionIntensity ?? 1.0,
            transition: clip.transition || null,
            transitionDuration: clip.transitionDuration ?? DEFAULT_TRANSITION_DURATION,
          };
        });
        return (
          <VideoExporter
            open={showFFmpegExporter} onClose={() => setShowFFmpegExporter(false)}
            scenes={exportScenes} orientation={orientation}
            voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} musicVolume={musicVol}
            musicClips={musicClips}
            projectName={project?.name || 'Untitled'} projectNiche={project?.niche} projectId={projectId} exportHook={exportHook}
            captions={captionClips}
            defaultMode="ffmpeg"
          />
        );
      })()}

      {/* Exporter modal */}
      {showExporter && (() => {
        const exportScenes = videoClips.map(clip => {
          const scene = scenes.find(s => s.id === clip.sceneId);
          return {
            ...clip,
            image_url: clip.imageUrl || scene?.image_url,
            video_url: clip.videoUrl || scene?.video_url,
            narration_text: scene?.narration_text,
            voiceover_text: scene?.voiceover_text,
            mediaType: clip.mediaType || 'image',
            playbackRate: clip.playbackRate ?? 1.0,
            videoDuration: clip.videoDuration ?? null,
            cinematicMotion: clip.cinematicMotion || null,
            motionSpeed: clip.motionSpeed ?? 1.0,
            motionIntensity: clip.motionIntensity ?? 1.0,
            transition: clip.transition || null,
            transitionDuration: clip.transitionDuration ?? DEFAULT_TRANSITION_DURATION,
          };
        });
        return (
          <VideoExporter
          open={showExporter} onClose={() => setShowExporter(false)}
          scenes={exportScenes} orientation={orientation}
          voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} musicVolume={musicVol}
          musicClips={musicClips}
          projectName={project?.name || 'Untitled'} projectNiche={project?.niche} projectId={projectId} exportHook={exportHook}
          captions={captionClips}
          />
        );
      })()}
    </div>
  );
}