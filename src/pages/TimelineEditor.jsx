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
import usePlaybackEngine from '@/hooks/usePlaybackEngine';
import { closeGaps } from '@/hooks/useSnapEngine';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2, Copy, Magnet,
  Image, Music, Type, Wand2, Film, Mic, Settings, Link2, Unlink2,
  Loader2, CheckCircle, Sparkles, Star, Move, ArrowLeft, ArrowRight, FileVideo,
  LayoutGrid, FolderOpen, X, Package, Camera, AlertCircle, Clapperboard,
  Bold, Italic, Underline, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft,
  Monitor, Smartphone, Radio
} from 'lucide-react';

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;
const MAX_HISTORY = 50;
const DEFAULT_TRANSITION_DURATION = 0.6;

const CINEMATIC_MOTIONS = [
  // ── Zoom family ──────────────────────────────────────────────────
  { id: 'zoom_in_center',  name: 'Push In',          description: 'Slowly drifts closer — holds at end',  startScale: 1.0,  endScale: 1.10, startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  { id: 'zoom_out_center', name: 'Pull Out',          description: 'Starts close, slowly reveals scene',   startScale: 1.10, endScale: 1.0,  startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  // ── Pan family ───────────────────────────────────────────────────
  { id: 'pan_right_zoom',  name: 'Drift Right',       description: 'Drifts right while pushing in',        startScale: 1.0,  endScale: 1.08, startX: -1.5, startY: 0,    endX: 1.5,  endY: 0    },
  { id: 'pan_left_zoom',   name: 'Drift Left',        description: 'Drifts left while pushing in',         startScale: 1.0,  endScale: 1.08, startX: 1.5,  startY: 0,    endX: -1.5, endY: 0    },
  // ── Vertical family ──────────────────────────────────────────────
  { id: 'push_in_top',     name: 'Drift Up',          description: 'Slowly rises while zooming in',        startScale: 1.0,  endScale: 1.08, startX: 0,    startY: 1.2,  endX: 0,    endY: -1.2 },
  { id: 'push_in_bottom',  name: 'Drift Down',        description: 'Slowly descends while zooming in',     startScale: 1.0,  endScale: 1.08, startX: 0,    startY: -1.2, endX: 0,    endY: 1.2  },
  // ── Diagonal family ──────────────────────────────────────────────
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

async function getSmartWordTimings(sceneText, beatDuration, sceneNumber) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are a speech timing expert. Given a voiceover script and its exact audio duration, assign realistic word-level timestamps.

Rules:
- Total duration MUST fit within the given seconds (last word end <= duration)
- Short function words (a, the, is, in, of, to, and) = 0.15-0.20s
- Normal content words = 0.25-0.40s
- Long or stressed words = 0.40-0.60s
- Add ~0.15s gap after commas, ~0.30s after periods/question marks
- Return ONLY a raw JSON array, no markdown, no extra text

Format: [{"word":"hello","start":0.00,"end":0.35},{"word":"world","start":0.38,"end":0.75}]`,
        messages: [{
          role: 'user',
          content: `Scene ${sceneNumber} voiceover: "${sceneText}"\nAudio duration: ${beatDuration.toFixed(2)}s\n\nReturn word timing JSON array:`
        }]
      })
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const raw  = (data.content || []).map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const words = JSON.parse(clean);
    if (!Array.isArray(words) || words.length === 0) throw new Error('Empty response');
    return { success: true, words };
  } catch (err) {
    console.warn(`Scene ${sceneNumber} timing failed:`, err.message);
    return { success: false, words: [] };
  }
}

function TopToolbar({ activePanel, onPanelChange, projectName, onBack, onExport, onDownloadAssets, onShowExporter, onNext, onSave, isSaving, saveStatus }) {
  const panels = [
    { id: 'media',       label: 'Media',       icon: Film     },
    { id: 'audio',       label: 'Audio',       icon: Music    },
    { id: 'text',        label: 'Text',        icon: Type     },
    { id: 'effects',     label: 'Effects',     icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Blend    },
    { id: 'captions',    label: 'Captions',    icon: Type     },
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
        {/* Bulk media type controls */}
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

function EffectsPanel({ selectedClip, onApplyEffect }) {
  const [msg, setMsg] = useState(null);
  const apply = (e) => {
    if (!selectedClip) { setMsg('Select a clip first'); setTimeout(() => setMsg(null), 2000); return; }
    onApplyEffect(e);
    setMsg(`Applied ${e.name}`);
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
            <button key={e.id} onClick={() => apply(e)} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-gray-800/50 hover:bg-purple-500/20">
              <e.icon className="w-5 h-5 text-purple-400" />
              <span className="text-[10px] text-gray-300">{e.name}</span>
            </button>
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

function CaptionsPanel({ onGenerate, isGenerating, captionCount, voiceoverUrl, transcriptionState, onOffsetCaptions, captionOffset }) {
  const [del, setDel] = useState(true);
  const { status, wordCount, error } = transcriptionState;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">

        {/* Transcription status card */}
        <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
          status === 'idle'         ? 'bg-gray-800/50 border-gray-700' :
          status === 'transcribing' ? 'bg-blue-900/30 border-blue-700/50' :
          status === 'done'         ? 'bg-green-900/30 border-green-700/50' :
          status === 'error'        ? 'bg-red-900/30 border-red-700/50' :
          'bg-gray-800/50 border-gray-700'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {status === 'idle'         && <><Radio size={12} className="text-gray-400" /><span className="text-gray-300">Syllable-Weighted Timing</span></>}
            {status === 'transcribing' && <><Loader2 size={12} className="animate-spin text-blue-400" /><span className="text-blue-300">Calculating word timings…</span></>}
            {status === 'done'         && <><CheckCircle size={12} className="text-green-400" /><span className="text-green-300">Captions timed</span></>}
            {status === 'error'        && <><AlertCircle size={12} className="text-red-400" /><span className="text-red-300">No script text found</span></>}
          </div>

          {status === 'idle' && (
            <p className="text-gray-500 leading-relaxed">
              Times each word by syllable count — short words like "a" and "the" get less time, longer words get more. Breaks captions at natural sentence and clause boundaries.
            </p>
          )}
          {status === 'transcribing' && (
            <p className="text-blue-400">Calculating syllable-weighted word timings…</p>
          )}
          {status === 'done' && (
            <p className="text-green-400">{wordCount} words timed by syllable weight.</p>
          )}
          {status === 'error' && (
            <p className="text-red-400">{error || 'Could not transcribe audio.'}<br />
              <span className="text-gray-500">Captions will fall back to script text timing.</span>
            </p>
          )}
        </div>

        {!voiceoverUrl && (
          <div className="p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-[10px] text-yellow-300">
            No voiceover loaded. Captions will use script text estimates.
          </div>
        )}

        {captionCount > 0 && (
          <div className="p-2 bg-orange-500/20 rounded text-xs text-orange-300">
            {captionCount} captions on timeline
          </div>
        )}
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
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          {isGenerating
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
            : status === 'transcribing'
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing timing…</>
            : <><Radio size={14} className="mr-2" /> Generate Captions</>
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
        <Textarea value={caption.text} onChange={e => u('text', e.target.value)} className="bg-gray-800 border-gray-700 text-sm" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
          <Input type="number" step="0.1" value={caption.startTime?.toFixed(1)} onChange={e => u('startTime', Math.max(0, parseFloat(e.target.value) || 0))} className="h-8 text-xs bg-gray-800 border-gray-700" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <Input type="number" step="0.1" value={caption.duration?.toFixed(1)} onChange={e => u('duration', Math.max(0.3, parseFloat(e.target.value) || 1))} className="h-8 text-xs bg-gray-800 border-gray-700" />
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
            <Input value={caption.color || '#FFFFFF'} onChange={e => u('color', e.target.value)} className="flex-1 h-8 text-xs bg-gray-800 border-gray-700" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Background</label>
          <div className="flex gap-1">
            <input type="color" value={'#000000'} onChange={e => u('bgColor', e.target.value + 'cc')} className="w-8 h-8 rounded border-0 cursor-pointer" />
            <select
              value={caption.bgColor?.includes('0.7') ? '0.7' : caption.bgColor?.includes('0.5') ? '0.5' : caption.bgColor?.includes('0.9') ? '0.9' : '0.7'}
              onChange={e => u('bgColor', `rgba(0,0,0,${e.target.value})`)}
              className="flex-1 h-8 text-xs bg-gray-800 border-gray-700 rounded px-2">
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

// VideoPreview → CanvasPreview.jsx | TimelineTrack → SnapTimeline.jsx
/* REMOVED — old inline components replaced by imports above
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWrapperSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Sync video playback to timeline ─────────────────────────────
  // video.playbackRate = rate already makes the browser slow/speed the video.
  // So the position in the VIDEO file after `elapsed` real seconds is:
  //   videoTime = elapsed × rate
  // e.g. rate=0.5: after 2s real time → 1s into video file (slow-mo ✓)
  //      rate=1.0: after 2s real time → 2s into video file (normal ✓)
  // We seek when:
  //   a) The clip changes (remount handles this via key= too)
  //   b) The user scrubs (|expected - actual| > threshold)
  // We DON'T seek on every tick during normal play — the browser tracks it.
  useEffect(() => {
    if (!videoRef.current || !currentClip?.videoUrl) return;
    const el   = videoRef.current;
    const rate = currentClip.playbackRate ?? 1.0;
    // Always keep playbackRate in sync
    if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate;
    // Calculate where in the video file we should be
    const elapsed  = Math.max(0, currentTime - (currentClip.startTime ?? 0));
    const vidPos   = Math.min(elapsed * rate, (el.duration && el.duration < Infinity ? el.duration : 99) - 0.05);
    // Only seek if we're more than 0.5s off (scrub detection)
    // During normal autoplay the browser handles frame advancement
    if (Math.abs(el.currentTime - vidPos) > 0.5) el.currentTime = vidPos;
  }, [currentTime, currentClip]);

  // Compute the largest canvas that fits, preserving aspect ratio
  const { canvasW, canvasH } = useMemo(() => {
    const { w, h } = wrapperSize;
    if (!w || !h) return { canvasW: 0, canvasH: 0 };
    const targetRatio = orientation === 'portrait' ? 9 / 16 : 16 / 9;
    let cw = w;
    let ch = w / targetRatio;
    if (ch > h) { ch = h; cw = h * targetRatio; }
    return { canvasW: Math.floor(cw), canvasH: Math.floor(ch) };
  }, [wrapperSize, orientation]);

  const active = captions.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);

  // ── Transition detection via prevClip ───────────────────────────
  const getTransitionState = () => {
    if (!prevClip?.transition || !currentClip) {
      return { isTransitioning: false, transitionType: null, progress: 0, duration: DEFAULT_TRANSITION_DURATION };
    }
    const tDur = prevClip.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
    const timeFromClipStart = currentTime - currentClip.startTime;
    if (timeFromClipStart < 0 || timeFromClipStart >= tDur) {
      return { isTransitioning: false, transitionType: null, progress: 0, duration: tDur };
    }
    return { isTransitioning: true, transitionType: prevClip.transition, progress: timeFromClipStart / tDur, duration: tDur };
  };

  const getTransitionStyle = (isExiting = true) => {
    const { isTransitioning, transitionType: t, progress } = getTransitionState();
    if (!isTransitioning) return {};
    let easingFn = easingFunctions.easeInOutQuad;
    if (t === 'Black Fade')   easingFn = easingFunctions.easeInOutCubic;
    if (t === 'Expand Fade')  easingFn = isExiting ? easingFunctions.easeOutQuad  : easingFunctions.easeInQuad;
    if (t === 'Overlap Fade') easingFn = easingFunctions.easeInOutQuad;
    const eased = easingFn(progress);
    if (t === 'Gradual Fade') {
      return { opacity: isExiting ? 1 - eased : eased, mixBlendMode: isExiting ? 'normal' : 'screen', filter: isExiting ? `brightness(${0.95 + eased * 0.05})` : `brightness(${0.9 + eased * 0.1})` };
    }
    if (t === 'Black Fade') {
      const dp = Math.sin(eased * Math.PI);
      return { opacity: isExiting ? (1 - eased * 0.4) : (eased * 0.4), filter: `brightness(${1 - dp * 0.65}) contrast(${1 + dp * 0.15}) saturate(${1 - dp * 0.3})`, mixBlendMode: isExiting ? 'normal' : 'multiply' };
    }
    if (t === 'Expand Fade') {
      const scale = isExiting ? (1 - eased * 0.18) : (0.82 + eased * 0.18);
      return { opacity: isExiting ? (1 - eased * 0.8) : (eased * 0.8), transform: `scale(${scale})`, filter: `blur(${eased * eased * 5}px) brightness(${isExiting ? 1 - eased * 0.1 : 0.9 + eased * 0.1})`, mixBlendMode: 'overlay' };
    }
    if (t === 'Overlap Fade') {
      const sd = eased * eased * 60;
      return { opacity: isExiting ? (1 - eased * 0.7) : (eased * 0.9), transform: `translateX(${isExiting ? sd : -sd}px)`, filter: `blur(${eased * 6}px)`, mixBlendMode: 'lighten' };
    }
    return { mixBlendMode: 'normal' };
  };

  const getMotionStyle = () => {
    if (!currentClip?.cinematicMotion || !currentClip?.duration) return {};
    const motion = CINEMATIC_MOTIONS.find(m => m.id === currentClip.cinematicMotion);
    if (!motion) return {};

    // ── Speed control ───────────────────────────────────────────
    // motionSpeed 0.25 = very slow (uses full clip duration × 4)
    //             1.0  = default  (completes exactly at clip end)
    //             2.0  = fast     (completes at half clip duration, holds rest)
    // We divide clip duration by speed to get the "active window".
    // After the active window p stays clamped at 1 → holds end state.
    const speed       = currentClip.motionSpeed     ?? 1.0;
    const intensity   = currentClip.motionIntensity ?? 1.0;
    const activeWindow = currentClip.duration / speed;
    const elapsed     = currentTime - currentClip.startTime;
    const p           = Math.min(1, Math.max(0, elapsed / activeWindow));

    // easeOutSine: confident start, graceful deceleration into hold
    const eased = Math.sin((p * Math.PI) / 2);

    // ── Intensity control ───────────────────────────────────────
    // Multiplies the DELTA (not the base scale) so intensity=0 = static,
    // intensity=2 = double the zoom/pan range.
    const scaleDelta = (motion.endScale - motion.startScale) * intensity;
    const txDelta    = (motion.endX    - motion.startX)    * intensity;
    const tyDelta    = (motion.endY    - motion.startY)    * intensity;

    const scale = motion.startScale + scaleDelta * eased;
    const tx    = motion.startX    + txDelta    * eased;
    const ty    = motion.startY    + tyDelta    * eased;

    return {
      transform:  `scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%)`,
      willChange: 'transform',
    };
  };

  // Caption drag
  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      if (!canvasW || !canvasH) return;
      const cap = captions.find(c => c.id === drag.id);
      if (!cap) return;
      const canvasEl = canvasRef.current;
      const rect = canvasEl?.getBoundingClientRect();
      if (!rect) return;
      if (drag.action === 'move') {
        onUpdateCaption({ ...cap, x: Math.max(5, Math.min(95, drag.ix + ((e.clientX - drag.sx) / rect.width) * 100)), y: Math.max(5, Math.min(95, drag.iy + ((e.clientY - drag.sy) / rect.height) * 100)) });
      } else {
        onUpdateCaption({ ...cap, fontSize: Math.max(12, Math.min(72, Math.round(drag.is + (e.clientX - drag.sx) / 3))) });
      }
    };
    const up = () => setDrag(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag, captions, onUpdateCaption, canvasW, canvasH]);

  const down = (e, cap, action) => {
    e.stopPropagation();
    onSelectCaption(cap);
    setDrag({ id: cap.id, action, sx: e.clientX, sy: e.clientY, ix: cap.x || 50, iy: cap.y || 85, is: cap.fontSize || 24 });
  };

  const { isTransitioning } = getTransitionState();
  const motionStyle         = getMotionStyle();
  const prevScene           = prevClip ? scenes.find(s => s.id === prevClip.sceneId) : null;

  return (
    <div className="h-full flex flex-col bg-[#0a0a14] gap-2 p-3">

      {/* Orientation toggle */}
      <div className="flex items-center gap-2 flex-shrink-0 justify-end">
        <span className="text-[10px] text-gray-500 mr-1">Preview:</span>
        <button
          onClick={() => onOrientationChange('landscape')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border transition-all ${
            orientation === 'landscape' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 font-medium' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
          }`}>
          <Monitor size={13} /> 16:9
        </button>
        <button
          onClick={() => onOrientationChange('portrait')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border transition-all ${
            orientation === 'portrait' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 font-medium' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
          }`}>
          <Smartphone size={13} /> 9:16
        </button>
      </div>

      {/* ── FIX 2: Wrapper fills remaining space; canvas is sized by JS ── */}
      <div ref={wrapperRef} className="flex-1 min-h-0 flex items-center justify-center">
        {canvasW > 0 && (
          <div
            ref={canvasRef}
            className="relative bg-gray-900 rounded overflow-hidden flex-shrink-0"
            style={{ width: canvasW, height: canvasH }}
            onClick={() => onSelectCaption(null)}
          >
            {/* ── Incoming scene — video, broll, or image ──────────── */}
            <div className="absolute inset-0 overflow-hidden" style={isTransitioning ? getTransitionStyle(false) : {}}>
              {currentClip?.mediaType === 'broll' && currentClip?.brollUrl ? (
                <video key={`broll-${currentClip.brollUrl}`} ref={videoRef} src={currentClip.brollUrl} className="w-full h-full object-cover" style={motionStyle} muted playsInline autoPlay />
              ) : currentClip?.mediaType === 'video' && currentClip?.videoUrl ? (
                <video key={`${currentClip.videoUrl}-${currentClip.playbackRate ?? 1}`} ref={videoRef} src={currentClip.videoUrl} className="w-full h-full object-cover" style={motionStyle} muted playsInline autoPlay />
              ) : currentScene?.image_url ? (
                <img src={currentScene.image_url} className="w-full h-full object-cover" style={motionStyle} alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="w-12 h-12 text-gray-700" /></div>
              )}
            </div>

            {/* ── Outgoing scene during transition ─────────────────── */}
            {isTransitioning && (
              <div className="absolute inset-0 overflow-hidden" style={getTransitionStyle(true)}>
                {prevClip?.mediaType === 'video' && prevClip?.videoUrl ? (
                  <video
                    key={`prev-${prevClip.videoUrl}`}
                    ref={prevVideoRef}
                    src={prevClip.videoUrl}
                    className="w-full h-full object-cover"
                    muted playsInline autoPlay
                  />
                ) : prevScene?.image_url ? (
                  <img src={prevScene.image_url} className="w-full h-full object-cover" alt="transition-out" />
                ) : null}
              </div>
            )}

            {/* Captions */}
            {active.map(cap => {
              const sel = selectedCaption?.id === cap.id;
              return (
                <div key={cap.id}
                  className={`absolute cursor-move ${sel ? 'z-20' : 'z-10'}`}
                  style={{ left: `${cap.x || 50}%`, top: `${cap.y || 85}%`, transform: 'translate(-50%, -50%)' }}
                  onMouseDown={e => down(e, cap, 'move')}>
                  <div className={`px-4 py-2 rounded ${sel ? 'ring-2 ring-cyan-400' : ''}`}
                    style={{ backgroundColor: cap.bgColor || 'rgba(0,0,0,0.7)', color: cap.color || '#FFF', fontSize: `${cap.fontSize || 24}px`, whiteSpace: 'nowrap' }}>
                    {cap.text}
                  </div>
                  {sel && <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize border-2 border-white" onMouseDown={e => down(e, cap, 'resize')} />}
                </div>
              );
            })}

            {/* Overlay info */}
            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white flex items-center gap-2">
              Scene {currentScene?.scene_number || '-'}
              {currentClip?.cinematicMotion && <span className="flex items-center gap-1 text-amber-400"><Camera size={10} /> {CINEMATIC_MOTIONS.find(m => m.id === currentClip.cinematicMotion)?.name}</span>}
              {isTransitioning && <span className="flex items-center gap-1 text-purple-300"><Blend size={10} /> {prevClip?.transition}</span>}
            </div>
          </div>
        )}
      </div>
END OF REMOVED BLOCK */

function TransportControls({ isPlaying, onPlayPause, currentTime, totalDuration, onSeek }) {
  return (
    <div className="flex items-center justify-center gap-4 py-3 bg-[#12121f] border-t border-gray-800">
      <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10"><SkipBack size={20} /></button>
      <button onClick={onPlayPause} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${isPlaying ? 'bg-red-600' : 'bg-white'}`}>
        {isPlaying ? <Pause size={28} className="text-white" /> : <Play size={28} className="text-gray-900 ml-1" />}
      </button>
      <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10"><SkipForward size={20} /></button>
      <div className="ml-4 flex items-center gap-2">
        <span className="text-sm font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
        <span className="text-gray-600">/</span>
        <span className="text-sm font-mono text-gray-500">{formatTimecode(totalDuration)}</span>
      </div>
    </div>
  );
}

function TimelineRuler({ totalDuration, pps, onSeek }) {
  const markers = [];
  const interval = pps >= 15 ? 5 : pps >= 8 ? 10 : 30;
  for (let t = 0; t <= totalDuration; t += interval) markers.push(t);
  return (
    <div className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer"
      style={{ width: totalDuration * pps, marginLeft: LABEL_WIDTH }}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - r.left) / pps))); }}>
      {markers.map(t => <div key={t} className="absolute bottom-0" style={{ left: t * pps }}><span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span></div>)}
    </div>
  );
}

function TimelineTrack({ type, clips, pps, totalDuration, currentTime, selectedId, onSelect, onUpdate, editable = true }) {
  const colors = { video: '#059669', audio: '#4f46e5', caption: '#d97706' };
  const icons  = { video: Image,     audio: Mic,       caption: Type     };
  const Icon   = icons[type];
  const color  = colors[type];
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    if (!drag || !editable) return;
    const move = e => {
      const d = (e.clientX - drag.sx) / pps;
      const clip = clips.find(c => c.id === drag.id);
      if (!clip) return;
      if (drag.action === 'move') {
        onUpdate({ ...clip, startTime: Math.max(0, drag.is + d) });
      } else if (drag.action === 'resize-right') {
        onUpdate({ ...clip, duration: Math.max(0.3, drag.id2 + d) });
      } else if (drag.action === 'resize-left') {
        const newStart = Math.max(0, drag.is + d);
        const delta    = newStart - drag.is;
        onUpdate({ ...clip, startTime: newStart, duration: Math.max(0.3, drag.id2 - delta) });
      }
    };
    const up = () => setDrag(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag, clips, pps, onUpdate, editable]);

  const down = (e, clip, action) => {
    if (!editable) return;
    e.stopPropagation();
    onSelect(clip.id);
    setDrag({ id: clip.id, action, sx: e.clientX, is: clip.startTime, id2: clip.duration });
  };

  return (
    <div className="flex border-b border-gray-800">
      <div className="flex-shrink-0 bg-[#12121f] flex items-center justify-center gap-1" style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}>
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <Icon size={10} className="text-gray-400" />
      </div>
      <div className="relative bg-[#0a0a14]" style={{ height: TRACK_HEIGHT, width: Math.max(totalDuration * pps, 800) }}>
        {clips.map(clip => {
          const left          = clip.startTime * pps;
          const width         = Math.max(30, clip.duration * pps);
          const sel           = selectedId === clip.id;
          const hasMotion     = type === 'video' && clip.cinematicMotion;
          const hasTransition = type === 'video' && clip.transition;
          const isVideoClip   = type === 'video' && clip.mediaType === 'video' && clip.videoUrl;
          const isBrollClip   = type === 'video' && clip.mediaType === 'broll' && clip.brollUrl;
          let bgColor = isBrollClip ? '#0d9488' : isVideoClip ? '#7c3aed' : color;
          if (hasMotion)                  bgColor = '#b45309';
          if (hasTransition && !hasMotion) bgColor = '#6d28d9';
          if (hasMotion && hasTransition) bgColor = '#be185d';

          return (
            <div key={clip.id}
              className={`absolute top-1 bottom-1 rounded overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'} ${sel ? 'ring-2 ring-white z-10' : ''}`}
              style={{ left, width, backgroundColor: bgColor }}>
              {type === 'video' && clip.thumbnail && (
                <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
              )}
              {editable && type === 'caption' && (
                <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" onMouseDown={e => down(e, clip, 'resize-left')} />
              )}
              <div className="absolute inset-0 flex items-center px-2"
                style={{ left: type === 'caption' ? 8 : 0, right: editable ? 8 : 0 }}
                onMouseDown={e => down(e, clip, 'move')}>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white font-medium truncate drop-shadow flex items-center gap-1">
                    {clip.label}
                    {isBrollClip   && <Clapperboard size={8} className="text-teal-200" />}
                    {isVideoClip   && <Film   size={8} className="text-purple-200" />}
                    {hasMotion     && <Camera size={8} className="text-amber-200" />}
                    {hasTransition && <Blend  size={8} className="text-purple-200" />}
                  </p>
                  <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                </div>
              </div>
              {editable && (
                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" onMouseDown={e => down(e, clip, 'resize-right')} />
              )}
            </div>
          );
        })}
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20" style={{ left: currentTime * pps }} />
      </div>
    </div>
  );
}

export default function TimelineEditorV10() {
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
  // Phase 3: Magnetic snapping state
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [magneticMode,    setMagneticMode]    = useState(true); // gap-closing on main track
  const [snapLinePx,      setSnapLinePx]      = useState(null);

  const videoHistory    = useHistory([]);
  const captionHistory  = useHistory([]);
  const videoClips      = videoHistory.state;
  const setVideoClips   = videoHistory.setState;
  const captionClips    = captionHistory.state;
  const setCaptionClips = captionHistory.setState;

  const [selectedVideoId,   setSelectedVideoId]   = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);
  const [isSyncing,         setIsSyncing]         = useState(false);
  const [syncStatus,        setSyncStatus]        = useState(null);
  const [isGenCaptions,     setIsGenCaptions]     = useState(false);
  const [captionOffset,     setCaptionOffset]     = useState(0);
  const [isApplyingZoom,    setIsApplyingZoom]    = useState(false);
  const [initialized,       setInitialized]       = useState(false);
  const [showExporter,      setShowExporter]      = useState(false);
  const initializedRef = useRef(false);

  // ── Transcription state ─────────────────────────────────────────
  // status: 'idle' | 'transcribing' | 'done' | 'error'
  const [transcription, setTranscription] = useState({ status: 'idle', words: [], wordCount: 0, error: null });
  // Overrides beat durations after AutoSync re-calculates from real audio.
  // null = use DB/scene values; array = use these recalculated values.
  const [overrideBeatDurations, setOverrideBeatDurations] = useState(null);

  const exportHook = useVideoExport();
  const playRef    = useRef(null);
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
    // Priority 1: live override from AutoSync (recalculated from real audio)
    if (overrideBeatDurations && overrideBeatDurations.length === scenes.length) {
      return overrideBeatDurations;
    }
    // Priority 2: saved beat_durations from ProductionSettings DB
    if (prodSettings?.beat_durations) {
      try {
        const saved = JSON.parse(prodSettings.beat_durations);
        if (Array.isArray(saved) && saved.length === scenes.length) return saved;
      } catch (e) {}
    }
    // Priority 3: scene.duration_seconds set during breakdown (AI estimate)
    return scenes.map(scene => Math.max(1.5, scene.duration_seconds || 5));
  }, [scenes, prodSettings, overrideBeatDurations]);

  const audioStartTimes = useMemo(() => {
    const starts = [];
    let offset = 0;
    audioBeatDurations.forEach(dur => { starts.push(offset); offset += dur; });
    return starts;
  }, [audioBeatDurations]);

  const totalDuration = useMemo(() => {
    // If AutoSync has redistributed beats from real audio, the beat sum
    // IS the audio duration (they were computed from it), so use it directly.
    // This keeps the timeline ruler exactly as wide as the content.
    const beatSum = audioBeatDurations.reduce((s, d) => s + d, 0);
    if (overrideBeatDurations) return beatSum > 0 ? beatSum : 60;
    if (actualVoiceoverDuration > 0) return actualVoiceoverDuration;
    return beatSum > 0 ? beatSum : 60;
  }, [audioBeatDurations, actualVoiceoverDuration, overrideBeatDurations]);

  // audioClips always reflects the current beat grid — same source of truth
  // as video clips so the two tracks stay pixel-perfectly aligned.
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
  // Each clip stores both imageUrl AND videoUrl so users can mix
  // video clips and image clips on the same timeline.
  // mediaType: 'video' if a valid video_url exists, else 'image'.
  // Users can toggle this per-clip in ClipPropertiesPanel.
  useEffect(() => {
    if (scenes.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    // Try to restore saved timeline state from DB
    if (prodSettings?.timeline_video_clips) {
      try {
        const savedVideo = JSON.parse(prodSettings.timeline_video_clips);
        const savedCaptions = prodSettings.timeline_caption_clips
          ? JSON.parse(prodSettings.timeline_caption_clips)
          : [];
        if (Array.isArray(savedVideo) && savedVideo.length > 0) {
          videoHistory.reset(savedVideo);
          if (savedCaptions.length > 0) captionHistory.reset(savedCaptions);
          setInitialized(true);
          console.log('[Timeline] Restored', savedVideo.length, 'clips +', savedCaptions.length, 'captions from DB');
          return;
        }
      } catch (e) {
        console.warn('[Timeline] Could not restore saved state:', e.message);
      }
    }

    // Fresh init from scenes
    const currentBeats = audioBeatDurations.length === scenes.length ? audioBeatDurations : null;
    let offset = 0;
    const initClips = scenes.map((scene, idx) => {
      const duration  = (currentBeats ? currentBeats[idx] : null) || scene.duration_seconds || 5;
      const hasVideo  = scene.video_url &&
                        scene.video_url.startsWith('http') &&
                        !scene.video_url.startsWith('veo_task:') &&
                        !scene.video_url.startsWith('grok_vid_task:');
      const hasBroll = scene.broll_url && scene.broll_url.startsWith('http');
      const clip = {
        id: `video-${scene.id}`, sceneId: scene.id, sceneNumber: scene.scene_number,
        type: 'video', startTime: offset, duration,
        label:     `Scene ${scene.scene_number}`,
        thumbnail: scene.image_url,
        imageUrl:  scene.image_url,
        videoUrl:  hasVideo ? scene.video_url : null,
        brollUrl:  hasBroll ? scene.broll_url : null,
        brollSource: scene.broll_source || null,
        brollQuery: scene.broll_query || null,
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

  // ── Phase 1: rAF Playback Engine (60fps, bypasses React render cycle) ──
  const playbackEngine = usePlaybackEngine({
    totalDuration,
    onTimeUpdate: useCallback((t) => setCurrentTime(t), []),
    onPlaybackEnd: useCallback(() => setIsPlaying(false), []),
  });

  // Sync engine play/pause with React state
  useEffect(() => {
    if (isPlaying) playbackEngine.play();
    else playbackEngine.pause();
  }, [isPlaying]);

  // Keep engine in sync when totalDuration changes
  useEffect(() => {
    if (currentTime > totalDuration) {
      playbackEngine.seek(0);
      setCurrentTime(0);
    }
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

  // ── Current & previous clip ─────────────────────────────────────
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

  // ── AutoSync — Re-sync beats to actual audio then snap clips ───
  //
  // Step 1: Measure real voiceover duration from the audio file.
  //         (already done via measuredAudioDuration state)
  // Step 2: Count words in each scene's narration text.
  // Step 3: Distribute the total audio duration across scenes
  //         proportionally by word count — scenes with more words
  //         get more time, scenes with fewer words get less.
  //         Minimum 0.5s per scene so nothing collapses to zero.
  // Step 4: Recompute start offsets and snap all video clips to
  //         the new beat grid.
  // Step 5: Save the new beat_durations to ProductionSettings so
  //         they persist and captions stay in sync on next open.
  // ─────────────────────────────────────────────────────────────
  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      // ── Step 1: Get actual audio duration ──────────────────────
      // measuredAudioDuration is already loaded from the audio file.
      // If not yet available, try to measure it now.
      let audioDuration = measuredAudioDuration;

      if (!audioDuration && voiceoverUrl) {
        audioDuration = await new Promise((resolve) => {
          const tmp = new Audio();
          tmp.addEventListener('loadedmetadata', () => resolve(tmp.duration || 0));
          tmp.addEventListener('error', () => resolve(0));
          tmp.preload = 'metadata';
          tmp.src = voiceoverUrl;
          setTimeout(() => resolve(0), 8000); // 8s timeout
        });
      }

      // ── Step 2: Syllable-weighted speech duration per scene ───────
      //
      // Raw word count is inaccurate because:
      //   • "extraordinary" takes ~4× longer to say than "a"
      //   • Punctuation creates natural pauses between scenes
      //   • Function words (the, a, is) are spoken fast
      //
      // Instead we model each scene's spoken duration using the same
      // syllable-weighting system as the caption engine:
      //   • Count syllables per word (vowel-cluster heuristic)
      //   • Discount common function words by 40%
      //   • Add punctuation pause weight at sentence boundaries
      //   • Add a fixed inter-scene breath gap (SCENE_GAP_SECS) that
      //     represents the natural pause between scenes in the recording
      //
      // We then normalise all scene weights so they sum to 1.0 and
      // multiply by the total audio duration — giving each scene exactly
      // its proportional share of the real recording time.

      const countSyllables = (word) => {
        const w = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!w || w.length <= 2) return 1;
        const stripped = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[aeiou]es?)$/, '').replace(/^y/, '');
        const clusters = stripped.match(/[aeiouy]{1,2}/g);
        return Math.max(1, clusters ? clusters.length : 1);
      };

      const FAST_WORDS = new Set([
        'a','an','the','and','or','but','in','on','at','to','for','of','with',
        'is','it','its','be','as','by','he','she','we','they','this','that',
        'was','are','has','have','had','do','did','not','so','if','up','out',
        'from','into','than','then','when','where','who','which','i','you',
        'my','your','our','their','its',
      ]);

      const SECS_PER_SYL  = 0.165;  // avg syllable duration at normal pace
      const FAST_DISCOUNT = 0.60;   // function words spoken 40% faster
      const SCENE_GAP_SECS = 0.20;  // natural breath/pause between scenes

      const sceneWeights = scenes.map(scene => {
        const text   = (scene.narration_text || scene.voiceover_text || '').trim();
        const tokens = text.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return SCENE_GAP_SECS; // silent scene gets gap only

        let weight = SCENE_GAP_SECS; // start with inter-scene breath
        tokens.forEach(token => {
          const clean = token.toLowerCase().replace(/[^a-z]/g, '');
          const syls  = countSyllables(clean);
          const fast  = FAST_WORDS.has(clean);
          const base  = Math.max(0.10, syls * SECS_PER_SYL * (fast ? FAST_DISCOUNT : 1.0));
          // Add punctuation pause after the word
          const pause = /[.!?]$/.test(token) ? 0.30 : /[,;:]$/.test(token) ? 0.14 : 0;
          weight += base + pause;
        });
        return weight;
      });

      const totalWeight = sceneWeights.reduce((s, w) => s + w, 0);

      // ── Step 3: Scale weights to real audio duration ────────────
      let newBeatDurations;

      if (audioDuration > 0 && totalWeight > 0) {
        // Scale syllable weights proportionally to actual recording time
        newBeatDurations = sceneWeights.map(w =>
          parseFloat(((w / totalWeight) * audioDuration).toFixed(3))
        );

        // Enforce minimum 0.8s per scene (even silent scenes need a beat)
        const MIN_PER_SCENE = 0.8;
        newBeatDurations = newBeatDurations.map(d => Math.max(MIN_PER_SCENE, d));

        // Re-scale to preserve exact total after minimum enforcement
        const scaledSum  = newBeatDurations.reduce((s, d) => s + d, 0);
        const scaleFactor = audioDuration / scaledSum;
        newBeatDurations = newBeatDurations.map(d =>
          parseFloat((d * scaleFactor).toFixed(3))
        );

        // Correct floating-point drift on last scene
        const drift = audioDuration - newBeatDurations.reduce((s, d) => s + d, 0);
        newBeatDurations[newBeatDurations.length - 1] =
          parseFloat((newBeatDurations[newBeatDurations.length - 1] + drift).toFixed(3));

      } else {
        // No audio — use raw syllable weights at natural speech pace
        // (weights are already in seconds at SECS_PER_SYL rate)
        newBeatDurations = sceneWeights.map(w =>
          parseFloat(Math.max(1.5, w).toFixed(3))
        );
      }

      // ── Step 4: Recompute start offsets ────────────────────────
      const newStartTimes = [];
      let offset = 0;
      newBeatDurations.forEach(dur => { newStartTimes.push(offset); offset += dur; });

      // ── Step 5: Snap all video clips to new beat grid ──────────
      const synced = scenes.map((scene, idx) => {
        const existing = videoClips.find(c => c.sceneId === scene.id);
        return {
          ...(existing || {}),
          id: `video-${scene.id}`, sceneId: scene.id, sceneNumber: scene.scene_number,
          type: 'video',
          startTime: newStartTimes[idx],
          duration:  newBeatDurations[idx],
          label: `Scene ${scene.scene_number}`, thumbnail: scene.image_url,
          effects: existing?.effects || [], audioMuted: existing?.audioMuted || false,
          imageUrl:         existing?.imageUrl  || scene.image_url || null,
          videoUrl:         existing?.videoUrl  || (
                              scene.video_url &&
                              scene.video_url.startsWith('http') &&
                              !scene.video_url.startsWith('veo_task:') &&
                              !scene.video_url.startsWith('grok_vid_task:')
                                ? scene.video_url : null
                            ),
          mediaType:        existing?.mediaType || (
                              scene.video_url &&
                              scene.video_url.startsWith('http') &&
                              !scene.video_url.startsWith('veo_task:') &&
                              !scene.video_url.startsWith('grok_vid_task:')
                                ? 'video' : 'image'
                            ),
          brollUrl:         existing?.brollUrl   || (scene.broll_url?.startsWith('http') ? scene.broll_url : null),
          brollSource:      existing?.brollSource || scene.broll_source || null,
          brollQuery:       existing?.brollQuery  || scene.broll_query  || null,
          cinematicMotion:  existing?.cinematicMotion  || null,
          transition:       existing?.transition       || null,
          transitionDuration: existing?.transitionDuration ?? null,
          motionSpeed:      existing?.motionSpeed      ?? 1.0,
          motionIntensity:  existing?.motionIntensity  ?? 1.0,
          playbackRate:     existing?.playbackRate     ?? 1.0,
          videoDuration:    existing?.videoDuration    ?? null,
          manualSpeed:      existing?.manualSpeed      ?? false,
          synced: true,
        };
      });
      // ── Step 5b: Calculate playbackRate for video clips ──────────
      // If a clip has a video and its beat duration > video file duration,
      // we slow the video down so it fills the beat without looping.
      // Formula: playbackRate = videoDuration / beatDuration
      //   e.g. 5s video in a 7s beat → rate = 5/7 = 0.714x (slow mo)
      //        5s video in a 3s beat → rate = 1.0  (plays at full speed, ends early — fine)
      // We cap the slowdown at 0.25x (4× slower) to avoid extreme slo-mo.
      // Video durations are measured by creating a temporary Audio element.
      const videoDurationCache = {};
      const measureVideoDur = (url) => {
        if (videoDurationCache[url]) return Promise.resolve(videoDurationCache[url]);
        return new Promise(resolve => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => { videoDurationCache[url] = v.duration || 6; resolve(videoDurationCache[url]); };
          v.onerror = () => resolve(6); // fallback 6s
          setTimeout(() => resolve(6), 4000);
          v.src = url;
        });
      };

      const syncedWithRates = await Promise.all(synced.map(async (clip) => {
        if (clip.mediaType !== 'video' || !clip.videoUrl) return clip;
        const vidDur  = await measureVideoDur(clip.videoUrl);
        const beatDur = clip.duration;
        // Only slow down if beat is longer than the video
        // If user manually set the speed, don't override it
        if (clip.manualSpeed) return { ...clip, videoDuration: vidDur };
        const rate = beatDur > vidDur
          ? Math.max(0.25, parseFloat((vidDur / beatDur).toFixed(3)))
          : 1.0;
        return { ...clip, playbackRate: rate, videoDuration: vidDur };
      }));
      setVideoClips(syncedWithRates);

      // Also update the live audioBeatDurations so captions use the new values
      setOverrideBeatDurations(newBeatDurations);

      // ── Step 6: Persist to ProductionSettings ──────────────────
      if (prodSettings?.id) {
        try {
          await base44.entities.ProductionSettings.update(prodSettings.id, {
            beat_durations: JSON.stringify(newBeatDurations),
          });
        } catch (e) {
          console.warn('Could not save beat_durations to DB:', e.message);
        }
      }

      setSyncStatus(audioDuration > 0 ? 'audio' : 'words');
    } catch (err) {
      console.error('AutoSync failed:', err);
      setSyncStatus('error');
    }

    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // ── Cinematic zoom ──────────────────────────────────────────────
  const handleApplyCinematicZoom = () => {
    setIsApplyingZoom(true);
    // Each pair: clip A drifts IN (ends zoomed/panned), clip B drifts OUT
    // from that same zoomed state — so the cut feels like a continuous
    // camera move rather than two separate animations.
    // Cycle through 4 different motion families to add visual variety.
    const families = [
      { inward: 'zoom_in_center',  outward: 'zoom_out_center' },
      { inward: 'pan_right_zoom',  outward: 'pan_left_zoom'   },
      { inward: 'push_in_top',     outward: 'push_in_bottom'  },
      { inward: 'diagonal_tl_br',  outward: 'diagonal_tr_bl'  },
    ];
    setVideoClips(videoClips.map((clip, idx) => {
      const family = families[Math.floor(idx / 2) % families.length];
      // Even clips drift inward, odd clips drift outward
      return { ...clip, cinematicMotion: idx % 2 === 0 ? family.inward : family.outward };
    }));
    setIsApplyingZoom(false);
  };
  const handleRemoveCinematicZoom = () => setVideoClips(videoClips.map(c => ({ ...c, cinematicMotion: null })));

  const handleApplyToAll = () => {
    if (!selectedVideo) return;
    setVideoClips(videoClips.map(c => ({
      ...c,
      cinematicMotion:    selectedVideo.cinematicMotion,
      motionSpeed:        selectedVideo.motionSpeed ?? 1.0,
      motionIntensity:    selectedVideo.motionIntensity ?? 1.0,
      transition:         selectedVideo.transition,
      transitionDuration: selectedVideo.transitionDuration,
      mediaType:          c.videoUrl && selectedVideo.mediaType === 'video' ? 'video' : c.mediaType,
      playbackRate:       selectedVideo.mediaType === 'video' ? (selectedVideo.playbackRate ?? 1.0) : (c.playbackRate ?? 1.0),
      effects:            selectedVideo.effects?.length > 0 ? [...selectedVideo.effects] : c.effects,
    })));
  };
  const motionCount     = videoClips.filter(c => c.cinematicMotion).length;
  const transitionCount = videoClips.filter(c => c.transition).length;

  // ═══════════════════════════════════════════════════════════════
  // CAPTION GENERATION — Claude smart timing
  //
  // For each scene: sends the script text + beat duration to Claude
  // via the Anthropic API. Claude returns word-level timestamps that
  // account for natural speech rhythm and punctuation pauses.
  // Scenes are processed in parallel (Promise.all) for speed.
  // Falls back to simple linear math if the API call fails.
  // ═══════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────
  // CAPTION GENERATION — syllable-weighted local timing
  //
  // Core insight: a word's spoken duration correlates strongly with its
  // syllable count.  "a" = 1 syllable ≈ 0.12s.  "beautiful" = 3 syllables
  // ≈ 0.42s.  Punctuation adds pause time on top.
  //
  // Algorithm per scene:
  //   1. Count syllables in every word using a vowel-cluster heuristic.
  //   2. Add punctuation weight (period/! → +0.30s, comma → +0.15s).
  //   3. Normalise so the total weight sums to exactly beatDuration.
  //   4. Derive {start, end} for each word from cumulative weights.
  //
  // This runs instantly (no API), works offline, and produces timing
  // that tracks the audio much more closely than equal-duration math.
  //
  // Caption chunks respect clause boundaries:
  //   - Hard break after sentence-ending punctuation (. ! ?)
  //   - Soft break after commas when chunk already has ≥4 words
  //   - Never exceed MAX_CHUNK_WORDS (6) or MAX_CHUNK_SECS (2.5s)
  // ─────────────────────────────────────────────────────────────────

  const handleGenerateCaptions = (deleteExisting) => {
    setIsGenCaptions(true);
    setTranscription({ status: 'transcribing', words: [], wordCount: 0, error: null });

    // ── Syllable counter (vowel-cluster heuristic) ────────────────
    const countSyllables = (word) => {
      const w = word.toLowerCase().replace(/[^a-z]/g, '');
      if (!w) return 1;
      if (w.length <= 3) return 1;
      // Strip silent trailing e, then count vowel clusters
      const stripped = w
        .replace(/(?:[^laeiouy]es|[^laeiouy]ed|[aeiou]es?)$/, '')
        .replace(/^y/, '');
      const clusters = stripped.match(/[aeiouy]{1,2}/g);
      return Math.max(1, clusters ? clusters.length : 1);
    };

    // ── Function words spoken quickly ────────────────────────────
    const FAST_WORDS = new Set([
      'a','an','the','and','or','but','in','on','at','to','for',
      'of','with','is','it','its','be','as','by','he','she','we',
      'they','this','that','was','are','has','have','had','do',
      'did','not','so','if','up','out','from','into','than','then',
      'when','where','who','which','i','you','my','your','our',
    ]);

    // ── Base duration per word (seconds) ─────────────────────────
    // syllable weight × seconds-per-syllable, with fast-word discount
    const SECS_PER_SYL  = 0.165; // average syllable duration at normal pace
    const FAST_DISCOUNT = 0.60;  // function words spoken 40% faster

    const wordWeight = (raw) => {
      const clean = raw.toLowerCase().replace(/[^a-z]/g, '');
      const syls  = countSyllables(clean);
      const fast  = FAST_WORDS.has(clean);
      return Math.max(0.10, syls * SECS_PER_SYL * (fast ? FAST_DISCOUNT : 1.0));
    };

    // ── Punctuation pause added AFTER the word ────────────────────
    const pauseAfter = (raw) => {
      if (/[.!?]$/.test(raw)) return 0.32;
      if (/[,;:]$/.test(raw)) return 0.16;
      return 0;
    };

    const scenesWithText = scenes.filter(s => (s.narration_text || s.voiceover_text)?.trim());

    if (scenesWithText.length === 0) {
      setTranscription({ status: 'error', words: [], wordCount: 0, error: 'No script text found on any scene.' });
      setIsGenCaptions(false);
      return;
    }

    const allWords = [];

    scenesWithText.forEach((scene) => {
      // Always use full-array index so beat timings are correct
      const idx       = scenes.findIndex(s => s.id === scene.id);
      const text      = (scene.narration_text || scene.voiceover_text).trim();
      const beatDur   = audioBeatDurations[idx] ?? scene.duration_seconds ?? 5;
      const beatStart = audioStartTimes[idx] ?? 0;
      // Hard ceiling: no word can end past this point.
      // The 0.12s margin ensures the last caption clears before the scene cut,
      // preventing the "first 2 words of next scene" bleed problem.
      const SCENE_END_MARGIN = 0.12;
      const beatEnd   = beatStart + beatDur - SCENE_END_MARGIN;

      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return;

      // ── 1. Raw weights ────────────────────────────────────────
      const weights = tokens.map(t => wordWeight(t) + pauseAfter(t));
      const rawSum  = weights.reduce((s, w) => s + w, 0);

      // ── 2. Scale to natural speech pace ───────────────────────
      // Use natural speech timing if it fits within the beat.
      // Only compress if natural pace exceeds the beat.
      // Never stretch beyond natural pace — captions follow speech, not beats.
      const usableDur = beatDur - SCENE_END_MARGIN;
      const scale = rawSum > usableDur
        ? usableDur / rawSum
        : 1.0;

      // ── 3. Build word timeline ────────────────────────────────
      let cursor = beatStart;
      tokens.forEach((token, wi) => {
        const dur  = weights[wi] * scale;
        const word = token.replace(/[.,!?;:""'']/g, '').trim();
        if (!word) { cursor += dur; return; }
        // Hard clamp — never let a caption bleed into the next scene
        if (cursor >= beatEnd) return;
        const wordEnd = Math.min(cursor + dur, beatEnd);
        allWords.push({
          word,
          raw:      token,
          start:    parseFloat(cursor.toFixed(3)),
          end:      parseFloat(wordEnd.toFixed(3)),
          sceneIdx: idx,
        });
        cursor += dur;
      });
    });

    setTranscription({ status: 'done', words: allWords, wordCount: allWords.length, error: null });

    // ── 4. Group into caption chunks ─────────────────────────────
    // Rules:
    //   • Hard break after sentence-end punctuation (. ! ?)
    //   • Soft break after comma/semicolon when chunk ≥ 4 words
    //   • Hard break when chunk hits MAX_CHUNK_WORDS
    //   • Hard break when chunk duration hits MAX_CHUNK_SECS
    //   • Hard break at scene boundaries (sceneIdx changes)
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
        id:        `cap-${ci++}-${Date.now()}`,
        type:      'caption',
        startTime: chunk[0].start,
        duration:  Math.max(0.35, chunk[chunk.length - 1].end - chunk[0].start),
        text,
        label:     text.slice(0, 18) + (text.length > 18 ? '…' : ''),
        x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)'
      });
      chunk = [];
    };

    allWords.forEach((w, wi) => {
      const chunkDur = chunk.length > 0 ? w.end - chunk[0].start : 0;
      const sceneBreak = chunk.length > 0 && w.sceneIdx !== chunk[chunk.length - 1].sceneIdx;

      // Decide whether to flush BEFORE adding this word
      if (sceneBreak) {
        flushChunk();
      } else if (chunk.length >= MAX_CHUNK_WORDS) {
        flushChunk();
      } else if (chunkDur >= MAX_CHUNK_SECS) {
        flushChunk();
      }

      chunk.push(w);

      // Decide whether to flush AFTER adding this word
      const isSentenceEnd = /[.!?]$/.test(w.raw);
      const isClauseEnd   = /[,;:]$/.test(w.raw) && chunk.length >= 4;

      if (isSentenceEnd || isClauseEnd) {
        flushChunk();
      }
    });
    flushChunk(); // flush any remainder

    setCaptionClips(deleteExisting ? caps : [...captionClips, ...caps]);
    setIsGenCaptions(false);
  };

  // ── Misc handlers ───────────────────────────────────────────────
  const handleUndo   = () => { videoHistory.undo(); captionHistory.undo(); };
  const handleRedo   = () => { videoHistory.redo(); captionHistory.redo(); };
  const handleDelete = () => {
    if (selectedVideoId) {
      let remaining = videoClips.filter(c => c.id !== selectedVideoId);
      // Phase 3: Magnetic gap-closing on main track
      if (magneticMode) remaining = closeGaps(remaining);
      setVideoClips(remaining);
      setSelectedVideoId(null);
    }
    if (selectedCaptionId) { setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); }
  };
  const handleBack             = () => navigate(createPageUrl('ContentGeneration') + `?project_id=${projectId}`);
  const handleExport           = () => alert('Export MP4 coming soon!');
  const handleDownloadAssets   = () => alert('Download Assets coming soon!');
  const handleSeek             = t  => {
    const ct = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(ct);
    playbackEngine.seek(ct);
    if (audioRef.current) audioRef.current.currentTime = ct;
  };
  const handleNext             = () => navigate(createPageUrl('PostProduction') + `?project_id=${projectId}`);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'

  const handleSaveTimeline = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const payload = {
        timeline_video_clips: JSON.stringify(videoClips),
        timeline_caption_clips: JSON.stringify(captionClips),
      };
      if (overrideBeatDurations) {
        payload.beat_durations = JSON.stringify(overrideBeatDurations);
      }
      if (prodSettings?.id) {
        await base44.entities.ProductionSettings.update(prodSettings.id, payload);
      } else {
        await base44.entities.ProductionSettings.create({ project_id: projectId, ...payload });
      }
      setSaveStatus('saved');
      console.log('[Timeline] Saved', videoClips.length, 'clips +', captionClips.length, 'captions');
    } catch (e) {
      console.error('[Timeline] Save failed:', e);
      setSaveStatus('error');
    }
    setIsSaving(false);
    setTimeout(() => setSaveStatus(null), 3000);
  };
  const handleApplyEffect      = e  => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, effects: [...(c.effects || []), e.id] } : c)); };
  const handleApplyTransition      = t  => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: t.name } : c)); };
  const handleRemoveTransition     = ()  => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: null } : c)); };
  const handleSetTransitionDuration = (dur) => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transitionDuration: dur } : c)); };
  const handleApplyTransitionToAll = t  => setVideoClips(videoClips.map(c => ({ ...c, transition: t.name })));
  const handleDeleteCaption    = () => { if (!selectedCaptionId) return; setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); };
  const handleDuplicateCaption = () => {
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
    })));
  };

  const handleOffsetCaptions = (newOffset) => {
    const delta = newOffset - captionOffset;
    if (Math.abs(delta) < 0.001) return;
    setCaptionClips(captionClips.map(c => ({
      ...c,
      startTime: Math.max(0, c.startTime + delta),
    })));
    setCaptionOffset(newOffset);
  };

  const selectedVideo    = videoClips.find(c => c.id === selectedVideoId);
  const selectedCaption  = captionClips.find(c => c.id === selectedCaptionId);
  const selectedVideoIdx = videoClips.findIndex(c => c.id === selectedVideoId);
  const canUndo = videoHistory.canUndo || captionHistory.canUndo;
  const canRedo = videoHistory.canRedo || captionHistory.canRedo;

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
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media'       && <MediaPanel
            scenes={scenes}
            audioBeatDurations={audioBeatDurations}
            videoClips={videoClips}
            onSelectScene={idx => handleSeek(audioStartTimes[idx] ?? 0)}
            onSetAllMediaType={(type) => {
              setVideoClips(videoClips.map(clip => ({
                ...clip,
                mediaType: type === 'video' && clip.videoUrl ? 'video' : type === 'broll' && clip.brollUrl ? 'broll' : 'image',
              })));
            }}
          />}
          {activePanel === 'effects'     && <EffectsPanel selectedClip={selectedVideo} onApplyEffect={handleApplyEffect} />}
          {activePanel === 'transitions' && <TransitionsPanel selectedClip={selectedVideo} onApplyTransition={handleApplyTransition} onRemoveTransition={handleRemoveTransition} onApplyTransitionToAll={handleApplyTransitionToAll} onSetTransitionDuration={handleSetTransitionDuration} />}
          {activePanel === 'captions'    && (
            <CaptionsPanel
              onGenerate={handleGenerateCaptions}
              isGenerating={isGenCaptions}
              captionCount={captionClips.length}
              voiceoverUrl={voiceoverUrl}
              transcriptionState={transcription}
              onOffsetCaptions={handleOffsetCaptions}
              captionOffset={captionOffset}
            />
          )}
          {!['media','effects','transitions','captions'].includes(activePanel) && <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>}
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <CanvasPreview
              currentScene={currentScene}
              currentTime={currentTime}
              currentClip={currentClip}
              prevClip={prevClip}
              captions={captionClips}
              selectedCaption={selectedCaption}
              onSelectCaption={c => { setSelectedCaptionId(c?.id || null); setSelectedVideoId(null); }}
              onUpdateCaption={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
              orientation={orientation}
              onOrientationChange={setPreviewOrientation}
              videoClips={videoClips}
              scenes={scenes}
            />
          </div>
          <TransportControls isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} currentTime={currentTime} totalDuration={totalDuration} onSeek={handleSeek} />
        </div>

        {/* Right panel */}
        <div className="w-64 flex-shrink-0 bg-[#12121f]">
          {selectedCaption ? (
            <TextPropertiesPanel caption={selectedCaption} onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} onDelete={handleDeleteCaption} onDuplicate={handleDuplicateCaption} onApplyStyleToAll={handleApplyStyleToAllCaptions} />
          ) : selectedVideo ? (
            <ClipPropertiesPanel clip={selectedVideo} audioBeatDuration={audioBeatDurations[selectedVideoIdx]} onUpdate={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} onApplyToAll={handleApplyToAll} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!canUndo} className={`p-1.5 rounded ${canUndo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Undo"><Undo2 size={16} /></button>
          <button onClick={handleRedo} disabled={!canRedo} className={`p-1.5 rounded ${canRedo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Redo"><Redo2 size={16} /></button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Split"><Scissors size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Duplicate"><Copy size={16} /></button>
          <button onClick={handleDelete} disabled={!selectedVideoId && !selectedCaptionId}
            className={`p-1.5 rounded ${(selectedVideoId || selectedCaptionId) ? 'text-red-400 hover:text-red-300' : 'text-gray-600'}`} title="Delete"><Trash2 size={16} /></button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button onClick={() => setSnappingEnabled(!snappingEnabled)}
            className={`p-1.5 rounded flex items-center gap-1 text-[10px] ${snappingEnabled ? 'text-cyan-400 bg-cyan-500/15' : 'text-gray-600 hover:text-gray-400'}`}
            title="Toggle Snapping (N)">
            <Magnet size={14} />{snappingEnabled && <span>Snap</span>}
          </button>
          <button onClick={() => setMagneticMode(!magneticMode)}
            className={`p-1.5 rounded flex items-center gap-1 text-[10px] ${magneticMode ? 'text-green-400 bg-green-500/15' : 'text-gray-600 hover:text-gray-400'}`}
            title="Toggle Magnetic Timeline">
            {magneticMode ? <Link2 size={14} /> : <Unlink2 size={14} />}{magneticMode && <span>Magnet</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <Button onClick={handleAutoSync} disabled={isSyncing} size="default"
              title="Measures real audio duration, redistributes scene beats by word count, then snaps all clips to the new grid"
              className={`gap-2 px-4 shadow-lg ${
                syncStatus === 'audio'  ? 'bg-green-600' :
                syncStatus === 'words' ? 'bg-teal-600' :
                syncStatus === 'error'  ? 'bg-red-600' :
                'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
              }`}>
              {isSyncing
                ? <><Loader2 size={16} className="animate-spin" /> Re-syncing beats…</>
                : syncStatus === 'audio'
                ? <><CheckCircle size={16} /> Synced to Audio!</>
                : syncStatus === 'words'
                ? <><CheckCircle size={16} /> Synced by Words!</>
                : syncStatus === 'error'
                ? <><AlertCircle size={16} /> Sync Failed</>
                : <><Wand2 size={16} /> AutoSync Beats</>
              }
            </Button>
            {!isSyncing && !syncStatus && (
              <span className="text-[9px] text-gray-500">
                {measuredAudioDuration > 0
                  ? `🎙 ${formatTime(measuredAudioDuration)} · clips will resize to word count`
                  : 'no audio · clips sized by word count'}
              </span>
            )}
            {isSyncing && (
              <span className="text-[9px] text-cyan-400">resizing clips to match speech pace…</span>
            )}
            {syncStatus === 'audio' && (
              <span className="text-[9px] text-green-400">✓ clips resized · video speeds auto-matched · scene changes match audio</span>
            )}
            {syncStatus === 'words' && (
              <span className="text-[9px] text-teal-400">✓ clips resized by word count</span>
            )}
          </div>
          <Button onClick={motionCount > 0 ? handleRemoveCinematicZoom : handleApplyCinematicZoom} disabled={isApplyingZoom} size="default"
            className={`gap-2 px-4 shadow-lg ${motionCount > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'}`}>
            {isApplyingZoom ? <><Loader2 size={16} className="animate-spin" /> Applying...</> : motionCount > 0 ? <><X size={16} /> Remove Zoom ({motionCount})</> : <><Camera size={16} /> Cinematic Zoom</>}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{videoClips.filter(c => c.mediaType === 'video').length}🎬 {videoClips.filter(c => c.mediaType === 'broll').length}📎 {videoClips.filter(c => c.mediaType === 'image' || (!c.mediaType)).length}🖼</span>
          <span>{audioClips.length} audio</span>
          <span>{captionClips.length} captions</span>
          {motionCount     > 0 && <span className="text-amber-400">{motionCount} zooms</span>}
          {transitionCount > 0 && <span className="text-purple-400">{transitionCount} transitions</span>}
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => setPps(p => Math.max(3, p / 1.25))}  className="p-1 text-gray-400 hover:text-white"><ZoomOut size={14} /></button>
          <span className="w-6 text-center">{Math.round(pps)}</span>
          <button onClick={() => setPps(p => Math.min(50, p * 1.25))} className="p-1 text-gray-400 hover:text-white"><ZoomIn  size={14} /></button>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => setIsMuted(!isMuted)} className="p-1 text-gray-400 hover:text-white">{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
        </div>
      </div>

      {/* Voiceover info bar */}
      {voiceoverUrl && (
        <div className={`px-3 py-1.5 border-t text-xs flex items-center gap-4 ${
          audioLoading ? 'bg-amber-900/30 border-amber-800/50 text-amber-300' :
          audioError   ? 'bg-red-900/30   border-red-800/50   text-red-300'   :
          actualVoiceoverDuration > 0 ? 'bg-indigo-900/30 border-indigo-800/50 text-indigo-300' :
          'bg-gray-800/50 border-gray-700 text-gray-400'
        }`}>
          <Mic size={12} />
          {audioLoading ? (
            <><Loader2 size={12} className="animate-spin" /><span>Measuring voiceover duration...</span></>
          ) : audioError ? (
            <><AlertCircle size={12} /><span>Could not measure audio - using text estimates</span></>
          ) : actualVoiceoverDuration > 0 ? (
            <>
              <span className="font-medium">Voiceover: {formatTime(actualVoiceoverDuration)} total</span>
              <span className="text-indigo-400">•</span>
              <span>{scenes.length} scenes</span>
              <span className="text-indigo-400">•</span>
              <span>Avg {(actualVoiceoverDuration / Math.max(scenes.length, 1)).toFixed(1)}s per scene</span>
              {measuredAudioDuration > 0 && <span className="text-green-400 flex items-center gap-1"><CheckCircle size={10} /> Measured from audio file</span>}
              {transcription.status === 'done' && <span className="text-orange-400 flex items-center gap-1"><CheckCircle size={10} /> {transcription.wordCount} words AI-timed</span>}
            </>
          ) : (
            <span>No voiceover loaded - using text estimates</span>
          )}
        </div>
      )}

      {/* Timeline — Phase 3+4: Snap-enabled tracks with virtual scrolling */}
      <div className="h-48 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto relative">
        <TimelineRuler totalDuration={totalDuration} pps={pps} onSeek={handleSeek} />
        {scenes.length === 0
          ? <div className="flex items-center justify-center h-32 text-gray-500">No scenes</div>
          : <>
              <SnapTimelineTrack type="video" clips={videoClips} allClips={[...videoClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedVideoId}
                onSelect={id => { setSelectedVideoId(id); setSelectedCaptionId(null); }}
                onUpdate={c => { let updated = videoClips.map(x => x.id === c.id ? c : x); if (magneticMode) updated = closeGaps(updated); setVideoClips(updated); }}
                editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
              <SnapTimelineTrack type="audio" clips={audioClips} allClips={[]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={null}
                onSelect={() => {}} onUpdate={() => {}} editable={false} snappingEnabled={false} />
              <SnapTimelineTrack type="caption" clips={captionClips} allClips={[...videoClips, ...captionClips]} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedCaptionId}
                onSelect={id => { setSelectedCaptionId(id); setSelectedVideoId(null); }}
                onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
                editable snappingEnabled={snappingEnabled} onSnapLine={setSnapLinePx} />
            </>
        }
        <SnapGuide snapLinePx={snapLinePx} trackAreaHeight={168} />
      </div>

      {/* Exporter modal */}
      {showExporter && (() => {
        const exportScenes = videoClips.map(clip => {
          const scene = scenes.find(s => s.id === clip.sceneId);
          return {
            ...clip,
            // Scene source data
            image_url:       clip.imageUrl  || scene?.image_url,
            video_url:       clip.videoUrl  || scene?.video_url,
            narration_text:  scene?.narration_text,
            voiceover_text:  scene?.voiceover_text,
            // Playback control — used by exporter to set video speed
            mediaType:       clip.mediaType    || 'image',
            playbackRate:    clip.playbackRate ?? 1.0,
            videoDuration:   clip.videoDuration ?? null,
            // All effects
            cinematicMotion: clip.cinematicMotion  || null,
            motionSpeed:     clip.motionSpeed      ?? 1.0,
            motionIntensity: clip.motionIntensity  ?? 1.0,
            transition:      clip.transition       || null,
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