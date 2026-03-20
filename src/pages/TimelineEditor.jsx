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
import MotionPresetsPanel from '@/components/timeline/MotionPresetsPanel';
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

function TopToolbar({ activePanel, onPanelChange, projectName, onBack, onExport, onDownloadAssets, onShowExporter, onNext, onSave, isSaving, saveStatus }) {
  const panels = [
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

function TextPropertiesPanel({ caption, onUpdate, onDelete, onDuplicate, onApplyStyleToAll }) {
  if (!caption) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a caption</div>;
  const u = (k, v) => onUpdate({ ...caption, [k]: v });

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

function TimelineRuler({ totalDuration, pps, onSeek }) {
  const markers = [];
  const interval = pps >= 15 ? 5 : pps >= 8 ? 10 : 30;
  for (let t = 0; t <= totalDuration; t += interval) markers.push(t);
  return (
    <div className="h-5 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer"
      style={{ width: totalDuration * pps, marginLeft: LABEL_WIDTH }}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - r.left) / pps))); }}>
      {markers.map(t => <div key={t} className="absolute bottom-0" style={{ left: t * pps }}><span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span></div>)}
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
  const [currentTime,    setCurrentTime]    = useState(0);
  const [pps,            setPps]            = useState(15);
  const [isMuted,        setIsMuted]        = useState(false);
  const [musicVol,       setMusicVol]       = useState(0.3);
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
  const [isSyncing,         setIsSyncing]         = useState(false);
  const [syncStatus,        setSyncStatus]        = useState(null);
  const [isGenCaptions,     setIsGenCaptions]     = useState(false);
  const [captionOffset,     setCaptionOffset]     = useState(0);
  const [isApplyingZoom,    setIsApplyingZoom]    = useState(false);
  const [initialized,       setInitialized]       = useState(false);
  const [showExporter,      setShowExporter]      = useState(false);
  const initializedRef = useRef(false);

  const [transcription, setTranscription] = useState({ status: 'idle', words: [], wordCount: 0, error: null });
  const [overrideBeatDurations, setOverrideBeatDurations] = useState(null);

  const exportHook = useVideoExport();
  const audioRef   = useRef(null);

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

  // ── Initialize video clips once ────────────────────────────────
  useEffect(() => {
    if (scenes.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    if (prodSettings?.timeline_video_clips) {
      try {
        const savedVideo = JSON.parse(prodSettings.timeline_video_clips);
        const savedCaptions = prodSettings.timeline_caption_clips ? JSON.parse(prodSettings.timeline_caption_clips) : [];
        if (Array.isArray(savedVideo) && savedVideo.length > 0) {
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
    onTimeUpdate: useCallback((t) => setCurrentTime(t), []),
    onPlaybackEnd: useCallback(() => setIsPlaying(false), []),
  });

  useEffect(() => {
    if (isPlaying) playbackEngine.play();
    else playbackEngine.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (currentTime > totalDuration) { playbackEngine.seek(0); setCurrentTime(0); }
  }, [totalDuration]);

  // ── Audio sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (voiceoverUrl && audioRef.current) {
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.3) audioRef.current.currentTime = currentTime;
      audioRef.current.muted = isMuted;
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentTime, voiceoverUrl, isMuted]);

  const currentClip = useMemo(() =>
    videoClips.find(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration)
  , [videoClips, currentTime]);

  const prevClip = useMemo(() => {
    if (!currentClip) return null;
    const idx = videoClips.findIndex(c => c.id === currentClip.id);
    return idx > 0 ? videoClips[idx - 1] : null;
  }, [videoClips, currentClip]);

  const currentScene = useMemo(() =>
    currentClip ? scenes.find(s => s.id === currentClip.sceneId) : null
  , [currentClip, scenes]);

  // ── AutoSync — ASR-driven exact alignment ────────────────────────
  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      // Step 1: Measure audio duration
      let audioDuration = measuredAudioDuration;
      if (!audioDuration && voiceoverUrl) {
        audioDuration = await new Promise((resolve) => {
          const tmp = new Audio();
          tmp.addEventListener('loadedmetadata', () => resolve(tmp.duration || 0));
          tmp.addEventListener('error', () => resolve(0));
          tmp.preload = 'metadata';
          tmp.src = voiceoverUrl;
          setTimeout(() => resolve(0), 8000);
        });
      }
      if (!audioDuration || audioDuration <= 0) {
        throw new Error('No voiceover audio to sync against');
      }

      // Step 2: Get ASR word-level timestamps
      let asrWords = null;
      if (voiceoverUrl) {
        try {
          const res = await base44.functions.invoke('transcribeVoiceover', { voiceover_url: voiceoverUrl });
          if (res.data?.success && res.data.words?.length > 0) {
            asrWords = res.data.words; // [{word, start, end}, ...]
            console.log(`[AutoSync] ASR: ${asrWords.length} words transcribed`);
          }
        } catch (err) {
          console.warn('[AutoSync] ASR failed, will fall back to estimation:', err.message);
        }
      }

      let newBeatDurations;
      let newStartTimes;
      let syncSource;

      if (asrWords && asrWords.length > 0) {
        // ── ASR PATH: exact alignment via word matching ──────────
        const { alignScenesToASR } = await import('@/lib/asrAutoSync');
        const alignment = alignScenesToASR(asrWords, scenes, audioDuration);

        newBeatDurations = alignment.map(a => a.duration);
        newStartTimes = alignment.map(a => a.startTime);
        syncSource = 'asr';

        const avgScore = alignment.filter(a => !a.empty).reduce((s, a) => s + (a.matchScore || 0), 0) / alignment.filter(a => !a.empty).length;
        console.log(`[AutoSync] ASR alignment: ${alignment.length} scenes, avg match score: ${(avgScore * 100).toFixed(0)}%`);
      } else {
        // ── FALLBACK: syllable-weighted estimation ───────────────
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
        newBeatDurations = sceneWeights.map(w => parseFloat(((w / totalWeight) * audioDuration).toFixed(3)));
        newBeatDurations = newBeatDurations.map(d => Math.max(0.8, d));
        const scaledSum = newBeatDurations.reduce((s, d) => s + d, 0);
        const sf = audioDuration / scaledSum;
        newBeatDurations = newBeatDurations.map(d => parseFloat((d * sf).toFixed(3)));
        const drift = audioDuration - newBeatDurations.reduce((s, d) => s + d, 0);
        newBeatDurations[newBeatDurations.length - 1] += drift;

        newStartTimes = [];
        let off = 0;
        newBeatDurations.forEach(dur => { newStartTimes.push(off); off += dur; });
        syncSource = 'words';
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
        const rate = beatDur > vidDur ? Math.max(0.25, parseFloat((vidDur / beatDur).toFixed(3))) : 1.0;
        return { ...clip, playbackRate: rate, videoDuration: vidDur };
      }));

      setVideoClips(syncedWithRates);
      setOverrideBeatDurations(newBeatDurations);

      // Step 5: Persist
      if (prodSettings?.id) {
        try {
          await base44.entities.ProductionSettings.update(prodSettings.id, {
            beat_durations: JSON.stringify(newBeatDurations),
            beat_start_times: JSON.stringify(newStartTimes),
          });
        } catch (e) { console.warn('Could not save beat data to DB:', e.message); }
      }

      setSyncStatus(syncSource === 'asr' ? 'audio' : 'words');
    } catch (err) {
      console.error('AutoSync failed:', err);
      setSyncStatus('error');
    }

    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 4000);
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
      return {
        ...clip,
        cinematicMotion: idx % 2 === 0 ? family.inward : family.outward,
        motionIntensity: i,
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
    scenesWithText.forEach((scene) => {
      const idx = scenes.findIndex(s => s.id === scene.id);
      const text = (scene.narration_text || scene.voiceover_text).trim();
      const beatDur = audioBeatDurations[idx] ?? scene.duration_seconds ?? 5;
      const beatStart = audioStartTimes[idx] ?? 0;
      const SCENE_END_MARGIN = 0.12;
      const beatEnd = beatStart + beatDur - SCENE_END_MARGIN;
      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return;

      const weights = tokens.map(t => wordWeight(t) + pauseAfter(t));
      const rawSum = weights.reduce((s, w) => s + w, 0);
      const usableDur = beatDur - SCENE_END_MARGIN;
      const scale = rawSum > usableDur ? usableDur / rawSum : 1.0;

      let cursor = beatStart;
      tokens.forEach((token, wi) => {
        const dur = weights[wi] * scale;
        const word = token.replace(/[.,!?;:""'']/g, '').trim();
        if (!word) { cursor += dur; return; }
        if (cursor >= beatEnd) return;
        const wordEnd = Math.min(cursor + dur, beatEnd);
        allWords.push({ word, raw: token, start: parseFloat(cursor.toFixed(3)), end: parseFloat(wordEnd.toFixed(3)), sceneIdx: idx });
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
        const res = await base44.functions.invoke('transcribeVoiceover', { voiceover_url: voiceoverUrl });
        if (res.data?.success && res.data.words?.length > 0) {
          allWords = res.data.words.map(w => ({ word: w.word, raw: w.word, start: w.start, end: w.end }));
          usedASR = true;
        }
      } catch (err) {
        console.warn('[Captions] ASR failed, falling back:', err.message || err);
      }
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
  const handleUndo   = () => { videoHistory.undo(); captionHistory.undo(); overlayHistory.undo(); };
  const handleRedo   = () => { videoHistory.redo(); captionHistory.redo(); overlayHistory.redo(); };
  const handleDelete = () => {
    if (selectedVideoId) {
      let remaining = videoClips.filter(c => c.id !== selectedVideoId);
      if (magneticMode) remaining = closeGaps(remaining);
      setVideoClips(remaining);
      setSelectedVideoId(null);
    }
    if (selectedCaptionId) { setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); }
    if (selectedOverlayId) { setOverlayClips(overlayClips.filter(c => c.id !== selectedOverlayId)); setSelectedOverlayId(null); }
  };
  const handleBack           = () => navigate(createPageUrl('ContentGeneration') + `?project_id=${projectId}`);
  const handleExport         = () => alert('Export MP4 coming soon!');
  const handleDownloadAssets = () => alert('Download Assets coming soon!');
  const handleSeek           = t  => {
    const ct = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(ct);
    playbackEngine.seek(ct);
    if (audioRef.current) audioRef.current.currentTime = ct;
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
  const handleSetTransitionDuration = (dur) => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transitionDuration: dur } : c)); };
  const handleApplyTransitionToAll = t  => setVideoClips(videoClips.map(c => ({ ...c, transition: t.name })));
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
    setCaptionClips(captionClips.map(c => ({ ...c, fontSize: cap.fontSize, color: cap.color, bgColor: cap.bgColor, x: cap.x, y: cap.y })));
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
  const canUndo = videoHistory.canUndo || captionHistory.canUndo || overlayHistory.canUndo;
  const canRedo = videoHistory.canRedo || captionHistory.canRedo || overlayHistory.canRedo;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      <TopToolbar
        activePanel={activePanel} onPanelChange={setActivePanel}
        projectName={project?.name} onBack={handleBack}
        onExport={handleExport} onDownloadAssets={handleDownloadAssets}
        onShowExporter={() => setShowExporter(true)} onNext={handleNext}
        onSave={handleSaveTimeline} isSaving={isSaving} saveStatus={saveStatus}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <div className="w-52 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
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
              currentTime={currentTime} totalDuration={totalDuration}
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
          {!['media','effects','transitions','captions','overlays','motion','jumpcuts'].includes(activePanel) && <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>}
        </div>

        {/* Center — Preview (expands to fill remaining space) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <CanvasPreview
              currentScene={currentScene} currentTime={currentTime} currentClip={currentClip} prevClip={prevClip}
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
          <TransportControls isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} currentTime={currentTime} totalDuration={totalDuration} onSeek={handleSeek} />
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
            <TextPropertiesPanel caption={selectedCaption} onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} onDelete={handleDeleteCaption} onDuplicate={handleDuplicateCaption} onApplyStyleToAll={handleApplyStyleToAllCaptions} />
          ) : selectedVideo ? (
            <ClipPropertiesPanel clip={selectedVideo} audioBeatDuration={audioBeatDurations[selectedVideoIdx]} onUpdate={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} onApplyToAll={handleApplyToAll} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* Bottom compact toolbar + cinematic intensity */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!canUndo} className={`p-1 rounded ${canUndo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Undo"><Undo2 size={14} /></button>
          <button onClick={handleRedo} disabled={!canRedo} className={`p-1 rounded ${canRedo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Redo"><Redo2 size={14} /></button>
          <div className="w-px h-3 bg-gray-700 mx-0.5" />
          <button className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Split"><Scissors size={14} /></button>
          <button className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Duplicate"><Copy size={14} /></button>
          <button onClick={handleDelete} disabled={!selectedVideoId && !selectedCaptionId && !selectedOverlayId}
            className={`p-1 rounded ${(selectedVideoId || selectedCaptionId || selectedOverlayId) ? 'text-red-400 hover:text-red-300' : 'text-gray-600'}`} title="Delete"><Trash2 size={14} /></button>
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
          <Button onClick={handleAutoSync} disabled={isSyncing} size="sm"
            className={`gap-1.5 text-xs px-3 h-7 ${
              syncStatus === 'audio' ? 'bg-green-600' : syncStatus === 'words' ? 'bg-teal-600' : syncStatus === 'error' ? 'bg-red-600' :
              'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
            }`}>
            {isSyncing ? <><Loader2 size={12} className="animate-spin" /> Syncing…</> :
             syncStatus === 'audio' ? <><CheckCircle size={12} /> Synced!</> :
             syncStatus === 'words' ? <><CheckCircle size={12} /> Words!</> :
             <><Wand2 size={12} /> AutoSync</>}
          </Button>

          {/* Cinematic Zoom + Intensity */}
          <div className="flex items-center gap-1.5">
            <Button onClick={motionCount > 0 ? handleRemoveCinematicZoom : () => handleApplyCinematicZoom()} disabled={isApplyingZoom} size="sm"
              className={`gap-1 text-xs px-3 h-7 ${motionCount > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'}`}>
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
            <TimelineRuler totalDuration={totalDuration} pps={pps} onSeek={handleSeek} />
            {scenes.length === 0
              ? <div className="flex items-center justify-center h-20 text-gray-500 text-xs">No scenes</div>
              : <>
                  <SnapTimelineTrack type="overlay" clips={overlayClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedOverlayId}
                    onSelect={id => { setSelectedOverlayId(id); setSelectedVideoId(null); setSelectedCaptionId(null); }}
                    onUpdate={c => setOverlayClips(overlayClips.map(x => x.id === c.id ? c : x))}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                  <SnapTimelineTrack type="video" clips={videoClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedVideoId}
                    onSelect={id => { setSelectedVideoId(id); setSelectedCaptionId(null); setSelectedOverlayId(null); }}
                    onUpdate={c => { let updated = videoClips.map(x => x.id === c.id ? c : x); if (magneticMode) updated = closeGaps(updated); setVideoClips(updated); }}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                  <SnapTimelineTrack type="audio" clips={audioClips} allClips={[]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={null}
                    onSelect={() => {}} onUpdate={() => {}} editable={false} snappingEnabled={false} />
                  <SnapTimelineTrack type="caption" clips={captionClips} allClips={[...videoClips, ...overlayClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedCaptionId}
                    onSelect={id => { setSelectedCaptionId(id); setSelectedVideoId(null); setSelectedOverlayId(null); }}
                    onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
                    editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
                </>
            }
            <SnapGuide snapLinePx={snapLinePx} trackAreaHeight={effectiveTimelineHeight - 20} />
          </>
        )}
      </div>

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
            projectName={project?.name || 'Untitled'} projectId={projectId} exportHook={exportHook}
          />
        );
      })()}
    </div>
  );
}