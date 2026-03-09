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
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2, Copy,
  Image, Music, Type, Wand2, Film, Mic, Settings,
  Loader2, CheckCircle, Sparkles, Star, Move, ArrowLeft, FileVideo,
  LayoutGrid, FolderOpen, X, Package, Camera, AlertCircle,
  Bold, Italic, Underline, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TIMELINE EDITOR V9 - FULL EDITING CAPABILITIES
// ══════════════════════════════════════════════════════════════════
// FIXED: Loads actual voiceover audio file and measures real duration
// FIXED: Scales scene beats proportionally to fill actual audio length  
// FIXED: Transitions now apply to clips (shows in purple on timeline)
// FIXED: Captions fully editable - resize left/right edges, move, edit timing
// NEW: Cinematic Zoom automation (Ken Burns effects for images)
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;
const MAX_HISTORY = 50;

// ═══════════════════════════════════════════════════════════════════
// CINEMATIC ZOOM MOTION TYPES
// ═══════════════════════════════════════════════════════════════════

const CINEMATIC_MOTIONS = [
  {
    id: 'zoom_in_center',
    name: 'Push In (Center)',
    description: 'Slow zoom toward center',
    startScale: 1.0,
    endScale: 1.08,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },
  {
    id: 'zoom_out_center',
    name: 'Pull Out (Center)',
    description: 'Slow zoom out revealing scene',
    startScale: 1.08,
    endScale: 1.0,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },
  {
    id: 'pan_left_zoom',
    name: 'Pan Left + Zoom',
    description: 'Drift left while zooming in',
    startScale: 1.0,
    endScale: 1.06,
    startX: 2,
    startY: 0,
    endX: -2,
    endY: 0,
  },
  {
    id: 'pan_right_zoom',
    name: 'Pan Right + Zoom',
    description: 'Drift right while zooming in',
    startScale: 1.0,
    endScale: 1.06,
    startX: -2,
    startY: 0,
    endX: 2,
    endY: 0,
  },
  {
    id: 'push_in_top',
    name: 'Push In (Top)',
    description: 'Zoom toward top of frame',
    startScale: 1.0,
    endScale: 1.07,
    startX: 0,
    startY: 1,
    endX: 0,
    endY: -1,
  },
  {
    id: 'push_in_bottom',
    name: 'Push In (Bottom)',
    description: 'Zoom toward bottom of frame',
    startScale: 1.0,
    endScale: 1.07,
    startX: 0,
    startY: -1,
    endX: 0,
    endY: 1,
  },
  {
    id: 'diagonal_tl_br',
    name: 'Diagonal Drift (TL→BR)',
    description: 'Top-left to bottom-right drift',
    startScale: 1.02,
    endScale: 1.06,
    startX: 1.5,
    startY: 1,
    endX: -1.5,
    endY: -1,
  },
  {
    id: 'diagonal_tr_bl',
    name: 'Diagonal Drift (TR→BL)',
    description: 'Top-right to bottom-left drift',
    startScale: 1.02,
    endScale: 1.06,
    startX: -1.5,
    startY: 1,
    endX: 1.5,
    endY: -1,
  },
];

// ═══════════════════════════════════════════════════════════════════
// EASING FUNCTIONS (CapCut-quality smooth transitions)
// ═══════════════════════════════════════════════════════════════════

const easingFunctions = {
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};


const EFFECTS = [
  { id: 'ken_burns', name: 'Ken Burns', icon: Move },
  { id: 'zoom_in', name: 'Zoom In', icon: ZoomIn },
  { id: 'zoom_out', name: 'Zoom Out', icon: Minimize2 },
  { id: 'fade', name: 'Fade', icon: Blend },
  { id: 'blur', name: 'Blur', icon: Focus },
  { id: 'glow', name: 'Glow', icon: Sparkles },
];

const TRANSITIONS = [
  { id: 'black_fade', name: 'Black Fade' },
  { id: 'gradual_fade', name: 'Gradual Fade' },
  { id: 'expand_fade', name: 'Expand Fade' },
  { id: 'overlap_fade', name: 'Overlap Fade' },
];

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

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

// Calculate word count from text
function getWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ═══════════════════════════════════════════════════════════════════
// HISTORY HOOK
// ═══════════════════════════════════════════════════════════════════

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

  const undo = useCallback(() => { if (index > 0) setIndex(index - 1); }, [index]);
  const redo = useCallback(() => { if (index < history.length - 1) setIndex(index + 1); }, [history.length, index]);
  const reset = useCallback((newState) => { setHistory([newState]); setIndex(0); }, []);

  return { state, setState, undo, redo, reset, canUndo: index > 0, canRedo: index < history.length - 1 };
}

// ═══════════════════════════════════════════════════════════════════
// TOP TOOLBAR
// ═══════════════════════════════════════════════════════════════════

function TopToolbar({ activePanel, onPanelChange, projectName, onBack, onExport, onDownloadAssets, onShowExporter }) {
  const panels = [
    { id: 'media', label: 'Media', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Blend },
    { id: 'captions', label: 'Captions', icon: Type },
    { id: 'filters', label: 'Filters', icon: Palette },
    { id: 'adjustment', label: 'Adjustment', icon: Settings },
  ];

  return (
    <div className="flex items-center justify-between px-2 py-1 bg-[#1a1a2e] border-b border-gray-800">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded">
          <ArrowLeft size={16} />
          <span className="text-xs">Back</span>
        </button>
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-sm font-medium text-white truncate max-w-[150px]">{projectName || 'Untitled'}</span>
      </div>

      <div className="flex items-center gap-0.5">
        {panels.map(panel => (
          <button key={panel.id} onClick={() => onPanelChange(panel.id)} className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded ${activePanel === panel.id ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}>
            <panel.icon size={14} />
            <span className="text-[8px]">{panel.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
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

// ═══════════════════════════════════════════════════════════════════
// LEFT PANELS
// ═══════════════════════════════════════════════════════════════════

function MediaPanel({ scenes, audioBeatDurations, onSelectScene }) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400">{scenes.length} scenes</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((scene, idx) => (
            <div key={scene.id} className="group relative aspect-video bg-gray-800 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-cyan-500" onClick={() => onSelectScene(idx)}>
              {scene.image_url ? <img src={scene.image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Image className="w-5 h-5 text-gray-600" /></div>}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1">
                <p className="text-[9px] text-white">Scene {scene.scene_number}</p>
                <p className="text-[8px] text-cyan-300">🎵 {audioBeatDurations[idx]?.toFixed(1)}s</p>
              </div>
            </div>
          ))}
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

function TransitionsPanel({ selectedClip, onApplyTransition, onRemoveTransition, onApplyTransitionToAll }) {
  const [msg, setMsg] = useState(null);
  const [selectedTransition, setSelectedTransition] = useState(null);
  
  const apply = (t) => {
    if (!selectedClip) {
      setMsg('Select a video clip first');
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setSelectedTransition(t);
    onApplyTransition(t);
    setMsg(`Applied "${t.name}" transition`);
    setTimeout(() => setMsg(null), 2000);
  };

  const applyToAll = () => {
    if (!selectedTransition) {
      setMsg('Select a transition first');
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    onApplyTransitionToAll(selectedTransition);
    setMsg(`Applied "${selectedTransition.name}" to all clips`);
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs text-gray-400">
          {selectedClip ? `Scene ${selectedClip.sceneNumber}` : 'Select a video clip'}
        </p>
        {selectedClip?.transition && (
          <div className="mt-2 p-2 bg-cyan-500/20 rounded flex items-center justify-between">
            <span className="text-xs text-cyan-300">Current: {selectedClip.transition}</span>
            <button onClick={onRemoveTransition} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
          </div>
        )}
      </div>
      {msg && (
        <div className="mx-2 mt-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded">{msg}</div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <p className="text-[10px] text-gray-500 mb-2">Transition plays at the END of the selected clip</p>
        {selectedTransition && (
          <div className="mb-3 p-2 bg-purple-500/20 rounded border border-purple-500/50">
            <p className="text-[9px] text-purple-300 mb-2">Selected: {selectedTransition.name}</p>
            <Button onClick={applyToAll} size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-xs">
              Apply to All {selectedTransition.name}
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {TRANSITIONS.map(t => (
            <button 
              key={t.id} 
              onClick={() => apply(t)} 
              className={`relative aspect-video bg-gray-800 rounded overflow-hidden hover:ring-2 hover:ring-cyan-500 ${selectedClip?.transition === t.name ? 'ring-2 ring-cyan-400' : ''}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center">
                <Blend className="w-6 h-6 text-white/50" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                <p className="text-[9px] text-white text-center">{t.name}</p>
              </div>
              {selectedClip?.transition === t.name && (
                <div className="absolute top-1 right-1">
                  <CheckCircle size={12} className="text-cyan-400" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CaptionsPanel({ onGenerate, isGenerating, captionCount }) {
  const [del, setDel] = useState(false);
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-3">
        <p className="text-[10px] text-gray-400 mb-3">Captions are generated from voiceover text and timed to match audio beats.</p>
        {captionCount > 0 && <div className="p-2 bg-orange-500/20 rounded text-xs text-orange-300">{captionCount} captions on timeline</div>}
      </div>
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <input type="checkbox" id="del" checked={del} onChange={e => setDel(e.target.checked)} className="rounded border-gray-600" />
          <label htmlFor="del" className="text-[10px] text-gray-400">Replace existing captions</label>
        </div>
        <Button onClick={() => onGenerate(del)} disabled={isGenerating} className="w-full bg-orange-600 hover:bg-orange-700">
          {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</> : 'Generate Captions'}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIGHT PANELS
// ═══════════════════════════════════════════════════════════════════

function TextPropertiesPanel({ caption, onUpdate, onDelete, onDuplicate }) {
  if (!caption) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a caption</div>;
  const u = (k, v) => onUpdate({ ...caption, [k]: v });
  
  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Caption</span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Duplicate">
            <Copy size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Text content */}
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Text</label>
        <Textarea 
          value={caption.text} 
          onChange={e => u('text', e.target.value)} 
          className="bg-gray-800 border-gray-700 text-sm" 
          rows={3} 
        />
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
          <Input 
            type="number" 
            step="0.1" 
            value={caption.startTime?.toFixed(1)} 
            onChange={e => u('startTime', Math.max(0, parseFloat(e.target.value) || 0))} 
            className="h-8 text-xs bg-gray-800 border-gray-700" 
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <Input 
            type="number" 
            step="0.1" 
            value={caption.duration?.toFixed(1)} 
            onChange={e => u('duration', Math.max(0.3, parseFloat(e.target.value) || 1))} 
            className="h-8 text-xs bg-gray-800 border-gray-700" 
          />
        </div>
      </div>

      {/* Font size */}
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Font Size: {caption.fontSize || 24}px</label>
        <Slider 
          value={[caption.fontSize || 24]} 
          onValueChange={([v]) => u('fontSize', v)} 
          min={10} 
          max={72} 
        />
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">X Position: {Math.round(caption.x || 50)}%</label>
          <Slider 
            value={[caption.x || 50]} 
            onValueChange={([v]) => u('x', v)} 
            min={5} 
            max={95} 
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Y Position: {Math.round(caption.y || 85)}%</label>
          <Slider 
            value={[caption.y || 85]} 
            onValueChange={([v]) => u('y', v)} 
            min={5} 
            max={95} 
          />
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Text Color</label>
          <div className="flex gap-1">
            <input 
              type="color" 
              value={caption.color || '#FFFFFF'} 
              onChange={e => u('color', e.target.value)} 
              className="w-8 h-8 rounded border-0 cursor-pointer" 
            />
            <Input 
              value={caption.color || '#FFFFFF'} 
              onChange={e => u('color', e.target.value)} 
              className="flex-1 h-8 text-xs bg-gray-800 border-gray-700" 
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Background</label>
          <div className="flex gap-1">
            <input 
              type="color" 
              value={caption.bgColor?.replace(/rgba?\([^)]+\)/, '#000000') || '#000000'} 
              onChange={e => u('bgColor', e.target.value + 'cc')} 
              className="w-8 h-8 rounded border-0 cursor-pointer" 
            />
            <select
              value={caption.bgColor?.includes('0.7') ? '0.7' : caption.bgColor?.includes('0.5') ? '0.5' : caption.bgColor?.includes('0.9') ? '0.9' : '0.7'}
              onChange={e => {
                const opacity = e.target.value;
                u('bgColor', `rgba(0,0,0,${opacity})`);
              }}
              className="flex-1 h-8 text-xs bg-gray-800 border-gray-700 rounded px-2"
            >
              <option value="0.5">50%</option>
              <option value="0.7">70%</option>
              <option value="0.9">90%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quick position presets */}
      <div>
        <label className="text-[10px] text-gray-400 mb-2 block">Quick Position</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { x: 50, y: 15, label: 'Top' },
            { x: 50, y: 50, label: 'Center' },
            { x: 50, y: 85, label: 'Bottom' },
            { x: 15, y: 50, label: 'Left' },
            { x: 50, y: 50, label: 'Middle' },
            { x: 85, y: 50, label: 'Right' },
          ].map((pos, i) => (
            <button
              key={i}
              onClick={() => { u('x', pos.x); u('y', pos.y); }}
              className={`px-2 py-1.5 text-[10px] rounded ${
                Math.abs((caption.x || 50) - pos.x) < 10 && Math.abs((caption.y || 85) - pos.y) < 10
                  ? 'bg-orange-500/30 text-orange-300'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClipPropertiesPanel({ clip, audioBeatDuration, onUpdate }) {
  if (!clip) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip</div>;
  const u = (k, v) => onUpdate({ ...clip, [k]: v });
  const isSynced = Math.abs(clip.duration - audioBeatDuration) < 0.1;

  const motion = CINEMATIC_MOTIONS.find(m => m.id === clip.cinematicMotion);

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="text-sm font-medium text-white">Scene {clip.sceneNumber}</div>
      
      {/* Audio Beat */}
      <div className="p-3 bg-indigo-500/20 rounded border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-1">
          <Mic size={14} className="text-indigo-400" />
          <label className="text-[10px] text-indigo-300">Audio Beat Duration</label>
        </div>
        <p className="text-xl text-white font-mono">{audioBeatDuration?.toFixed(1)}s</p>
      </div>

      {/* Video Duration */}
      <div className={`p-3 rounded border ${isSynced ? 'bg-green-500/20 border-green-500/30' : 'bg-yellow-500/20 border-yellow-500/30'}`}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-300">Video Duration</label>
          {isSynced && <span className="text-[9px] text-green-400 flex items-center gap-1"><CheckCircle size={10} /> Synced</span>}
        </div>
        <Input type="number" step="0.1" value={clip.duration?.toFixed(1)} onChange={e => u('duration', parseFloat(e.target.value) || 1)} className="h-8 text-xs bg-gray-800 border-gray-700" />
      </div>

      {/* Cinematic Motion */}
      {clip.cinematicMotion && (
        <div className="p-3 bg-amber-500/20 rounded border border-amber-500/30">
          <div className="flex items-center gap-2 mb-1">
            <Camera size={14} className="text-amber-400" />
            <label className="text-[10px] text-amber-300">Cinematic Motion</label>
          </div>
          <p className="text-sm text-white">{motion?.name || clip.cinematicMotion}</p>
          <p className="text-[10px] text-gray-400 mt-1">{motion?.description}</p>
          <button onClick={() => u('cinematicMotion', null)} className="text-[10px] text-red-400 mt-2 hover:text-red-300">Remove motion</button>
        </div>
      )}

      {/* Transition */}
      {clip.transition && (
        <div className="p-3 bg-purple-500/20 rounded border border-purple-500/30">
          <div className="flex items-center gap-2 mb-1">
            <Blend size={14} className="text-purple-400" />
            <label className="text-[10px] text-purple-300">Transition (Out)</label>
          </div>
          <p className="text-sm text-white">{clip.transition}</p>
          <p className="text-[10px] text-gray-400 mt-1">Plays at end of this clip</p>
          <button onClick={() => u('transition', null)} className="text-[10px] text-red-400 mt-2 hover:text-red-300">Remove transition</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">Mute audio</span>
        <Switch checked={clip.audioMuted || false} onCheckedChange={v => u('audioMuted', v)} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO PREVIEW WITH CINEMATIC ZOOM
// ═══════════════════════════════════════════════════════════════════

function VideoPreview({ currentScene, currentTime, currentClip, captions, selectedCaption, onSelectCaption, onUpdateCaption, orientation, videoClips, scenes }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const active = captions.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);

  // Detect transition state
 const getTransitionState = () => {
    if (!currentClip || !currentClip.transition) {
      return { isTransitioning: false, transitionType: null, progress: 0, nextClip: null };
    }
    
    const clipEndTime = currentClip.startTime + currentClip.duration;
    const transitionDuration = 0.6;
    const timeFromClipEnd = currentTime - clipEndTime;
    
    // Transition ONLY plays in the 0.6s window AFTER clip ends
    if (timeFromClipEnd < 0 || timeFromClipEnd >= transitionDuration) {
      return { isTransitioning: false, transitionType: null, progress: 0, nextClip: null };
    }
    
    // Find next clip that starts where this one ends
    const nextClip = videoClips?.find(c => Math.abs(c.startTime - clipEndTime) < 0.01);
    
    const progress = timeFromClipEnd / transitionDuration;
    
    return { 
      isTransitioning: true, 
      transitionType: currentClip.transition, 
      progress,
      nextClip
    };
  };

 // Generate transition effect styles with easing & blend modes

// Generate transition effect styles with easing & blend modes
  const getTransitionStyle = (isExiting = true) => {
    const { isTransitioning, transitionType, progress } = getTransitionState();
    if (!isTransitioning) return {}; // Return empty object, not mixBlendMode

    const t = transitionType;

    // Select easing function based on transition type
    let easingFn = easingFunctions.easeInOutQuad; // default
    if (t === 'Black Fade') easingFn = easingFunctions.easeInOutCubic;
    if (t === 'Expand Fade') easingFn = isExiting ? easingFunctions.easeOutQuad : easingFunctions.easeInQuad;
    if (t === 'Overlap Fade') easingFn = easingFunctions.easeInOutQuad;

    const eased = easingFn(progress);

    // ═══ GRADUAL FADE (Cross-Dissolve) ═══
    // Smooth opacity fade with soften blend mode
    if (t === 'Gradual Fade') {
      const opacityOut = 1 - eased;
      const opacityIn = eased;
      
      return {
        opacity: isExiting ? opacityOut : opacityIn,
        mixBlendMode: isExiting ? 'normal' : 'screen', // incoming uses 'screen' blend for softer overlap
        filter: isExiting 
          ? `brightness(${0.95 + eased * 0.05})` 
          : `brightness(${0.9 + eased * 0.1})`,
      };
    }

    // ═══ BLACK FADE (Dip to Black) ═══
    // Dramatic dip through black with color grading shift
    if (t === 'Black Fade') {
      // Create sine wave darkness (0 → 1 → 0 for smooth dip)
      const darknessPeak = Math.sin(eased * Math.PI);
      const brightness = 1 - darknessPeak * 0.65; // 1.0 → 0.35 → 1.0
      const contrast = 1 + darknessPeak * 0.15;
      
      return {
        opacity: isExiting ? (1 - eased * 0.4) : (eased * 0.4),
        filter: `brightness(${brightness}) contrast(${contrast}) saturate(${1 - darknessPeak * 0.3})`,
        mixBlendMode: isExiting ? 'normal' : 'multiply',
      };
    }

    // ═══ EXPAND FADE (Zoom Pulse with Motion Blur) ═══
    // Cinematic zoom with dynamic motion blur momentum
    if (t === 'Expand Fade') {
      const scaleOut = 1 - eased * 0.18; // 1.0 → 0.82 (push away)
      const scaleIn = 0.82 + eased * 0.18; // 0.82 → 1.0 (pull in)
      const scale = isExiting ? scaleOut : scaleIn;
      
      // Motion blur increases with velocity (quadratic ramp)
      const blurAmount = eased * eased * 5; // 0 → 5px
      
      // Soften edges during expansion
      const brightness = isExiting ? (1 - eased * 0.1) : (0.9 + eased * 0.1);
      
      return {
        opacity: isExiting ? (1 - eased * 0.8) : (eased * 0.8),
        transform: `scale(${scale})`,
        filter: `blur(${blurAmount}px) brightness(${brightness})`,
        mixBlendMode: 'overlay',
      };
    }

    // ═══ OVERLAP FADE (Whip Pan with Directional Motion Blur) ═══
    // Fast slide with velocity-based directional blur
    if (t === 'Overlap Fade') {
      const slideDistance = eased * eased * 60; // quadratic: 0 → 60px (accelerating)
      const translateX = isExiting ? slideDistance : -slideDistance;
      
      // Directional motion blur (more blur = faster pan)
      const blurAmount = eased * 6; // 0 → 6px directional blur
      
      return {
        opacity: isExiting ? (1 - eased * 0.7) : (eased * 0.9),
        transform: `translateX(${translateX}px)`,
        filter: `blur(${blurAmount}px)`,
        mixBlendMode: 'lighten',
      };
    }

    return { mixBlendMode: 'normal' };
  };

  // Calculate cinematic motion transform
  const getMotionStyle = () => {
    if (!currentClip?.cinematicMotion || !currentClip?.duration) return {};
    
    const motion = CINEMATIC_MOTIONS.find(m => m.id === currentClip.cinematicMotion);
    if (!motion) return {};

    // Calculate progress through the clip (0 to 1)
    const clipProgress = Math.min(1, Math.max(0, (currentTime - currentClip.startTime) / currentClip.duration));
    
    // Ease in-out curve
    const eased = clipProgress < 0.5 
      ? 2 * clipProgress * clipProgress 
      : 1 - Math.pow(-2 * clipProgress + 2, 2) / 2;

    // Interpolate values
    const scale = motion.startScale + (motion.endScale - motion.startScale) * eased;
    const x = motion.startX + (motion.endX - motion.startX) * eased;
    const y = motion.startY + (motion.endY - motion.startY) * eased;

    return {
      transform: `scale(${scale}) translate(${x}%, ${y}%)`,
      transition: 'transform 0.1s linear',
    };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const cap = captions.find(c => c.id === drag.id);
      if (!cap) return;
      if (drag.action === 'move') {
        onUpdateCaption({ ...cap, x: Math.max(5, Math.min(95, drag.ix + ((e.clientX - drag.sx) / rect.width) * 100)), y: Math.max(5, Math.min(95, drag.iy + ((e.clientY - drag.sy) / rect.height) * 100)) });
      } else {
        onUpdateCaption({ ...cap, fontSize: Math.max(12, Math.min(72, Math.round(drag.is + (e.clientX - drag.sx) / 3))) });
      }
    };
    const up = () => setDrag(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag, captions, onUpdateCaption]);

  const down = (e, cap, action) => {
    e.stopPropagation();
    onSelectCaption(cap);
    setDrag({ id: cap.id, action, sx: e.clientX, sy: e.clientY, ix: cap.x || 50, iy: cap.y || 85, is: cap.fontSize || 24 });
  };

  const motionStyle = getMotionStyle();
  const hasMotion = !!currentClip?.cinematicMotion;
  const { isTransitioning, nextClip } = getTransitionState();
  const nextScene = nextClip && scenes ? scenes.find(s => s.id === nextClip.sceneId) : null;

  return (
    <div className="h-full flex items-center justify-center p-4 bg-[#0a0a14]">
      <div ref={ref} className={`relative ${orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'} w-full max-h-full bg-gray-900 rounded overflow-hidden`} onClick={() => onSelectCaption(null)}>
        {/* Current image with cinematic motion */}
        <div className="absolute inset-0 overflow-hidden" style={getTransitionStyle(true)}>
          {currentScene?.image_url ? (
            <img 
              src={currentScene.image_url} 
              className="w-full h-full object-cover"
              style={motionStyle}
              alt="" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-gray-700" />
            </div>
          )}
        </div>

        {/* Next image overlay (during transition) */}
        {(() => {
          const { isTransitioning, nextClip: transNextClip } = getTransitionState();
          if (!isTransitioning || !transNextClip) return null;
          
          const nextSceneForTrans = scenes.find(s => s.id === transNextClip.sceneId);
          if (!nextSceneForTrans?.image_url) return null;
          
          return (
            <div className="absolute inset-0 overflow-hidden" style={getTransitionStyle(false)}>
              <img 
                src={nextSceneForTrans.image_url} 
                className="w-full h-full object-cover"
                alt="transition" 
              />
            </div>
          );
        })()}

        {/* Captions overlay */}
        {active.map(cap => {
          const sel = selectedCaption?.id === cap.id;
          return (
            <div key={cap.id} className={`absolute cursor-move ${sel ? 'z-20' : 'z-10'}`} style={{ left: `${cap.x || 50}%`, top: `${cap.y || 85}%`, transform: 'translate(-50%, -50%)' }} onMouseDown={e => down(e, cap, 'move')}>
              <div className={`px-4 py-2 rounded ${sel ? 'ring-2 ring-cyan-400' : ''}`} style={{ backgroundColor: cap.bgColor || 'rgba(0,0,0,0.7)', color: cap.color || '#FFF', fontSize: `${cap.fontSize || 24}px` }}>{cap.text}</div>
              {sel && <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize border-2 border-white" onMouseDown={e => down(e, cap, 'resize')} />}
            </div>
          );
        })}

        {/* Scene info */}
        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white flex items-center gap-2">
          Scene {currentScene?.scene_number || '-'}
          {hasMotion && (
            <span className="flex items-center gap-1 text-amber-400">
              <Camera size={10} /> {CINEMATIC_MOTIONS.find(m => m.id === currentClip?.cinematicMotion)?.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRANSPORT & TIMELINE
// ═══════════════════════════════════════════════════════════════════

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
    <div className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer" style={{ width: totalDuration * pps, marginLeft: LABEL_WIDTH }} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - r.left) / pps))); }}>
      {markers.map(t => <div key={t} className="absolute bottom-0" style={{ left: t * pps }}><span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span></div>)}
    </div>
  );
}

function TimelineTrack({ type, clips, pps, totalDuration, currentTime, selectedId, onSelect, onUpdate, editable = true }) {
  const colors = { video: '#059669', audio: '#4f46e5', caption: '#d97706' };
  const icons = { video: Image, audio: Mic, caption: Type };
  const Icon = icons[type];
  const color = colors[type];
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    if (!drag || !editable) return;
    const move = e => {
      const d = (e.clientX - drag.sx) / pps;
      const clip = clips.find(c => c.id === drag.id);
      if (!clip) return;
      
      if (drag.action === 'move') {
        // Move the entire clip
        onUpdate({ ...clip, startTime: Math.max(0, drag.is + d) });
      } else if (drag.action === 'resize-right') {
        // Resize from right edge (change duration)
        const newDuration = Math.max(0.3, drag.id2 + d);
        onUpdate({ ...clip, duration: newDuration });
      } else if (drag.action === 'resize-left') {
        // Resize from left edge (change start time and duration)
        const newStartTime = Math.max(0, drag.is + d);
        const deltaStart = newStartTime - drag.is;
        const newDuration = Math.max(0.3, drag.id2 - deltaStart);
        onUpdate({ ...clip, startTime: newStartTime, duration: newDuration });
      }
    };
    const up = () => setDrag(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
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
          const left = clip.startTime * pps;
          const width = Math.max(30, clip.duration * pps);
          const sel = selectedId === clip.id;
          const hasMotion = type === 'video' && clip.cinematicMotion;
          const hasTransition = type === 'video' && clip.transition;
          
          // Determine clip background color
          let bgColor = color;
          if (hasMotion) bgColor = '#b45309'; // amber for motion
          if (hasTransition) bgColor = '#7c3aed'; // purple for transition
          if (hasMotion && hasTransition) bgColor = '#be185d'; // pink for both
          
          return (
            <div 
              key={clip.id} 
              className={`absolute top-1 bottom-1 rounded overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'} ${sel ? 'ring-2 ring-white z-10' : ''}`} 
              style={{ left, width, backgroundColor: bgColor }}
            >
              {/* Thumbnail for video clips */}
              {type === 'video' && clip.thumbnail && (
                <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
              )}
              
              {/* Left resize handle (for captions) */}
              {editable && type === 'caption' && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" 
                  onMouseDown={e => down(e, clip, 'resize-left')} 
                />
              )}
              
              {/* Main content area - draggable */}
              <div 
                className="absolute inset-0 flex items-center px-2" 
                style={{ left: type === 'caption' ? 8 : 0, right: editable ? 8 : 0 }}
                onMouseDown={e => down(e, clip, 'move')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white font-medium truncate drop-shadow flex items-center gap-1">
                    {clip.label}
                    {hasMotion && <Camera size={8} className="text-amber-200" />}
                    {hasTransition && <Blend size={8} className="text-purple-200" />}
                  </p>
                  <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                </div>
              </div>
              
              {/* Right resize handle */}
              {editable && (
                <div 
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" 
                  onMouseDown={e => down(e, clip, 'resize-right')} 
                />
              )}
            </div>
          );
        })}
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20" style={{ left: currentTime * pps }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TimelineEditorV9() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  const [activePanel, setActivePanel] = useState('media');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pps, setPps] = useState(15);
  const [isMuted, setIsMuted] = useState(false);
  const [musicVol, setMusicVol] = useState(0.3);

  const videoHistory = useHistory([]);
  const captionHistory = useHistory([]);
  const videoClips = videoHistory.state;
  const setVideoClips = videoHistory.setState;
  const captionClips = captionHistory.state;
  const setCaptionClips = captionHistory.setState;

  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isGenCaptions, setIsGenCaptions] = useState(false);
  const [isApplyingZoom, setIsApplyingZoom] = useState(false);
  const [initialized, setInitialized] = useState(false);
const [showExporter, setShowExporter] = useState(false);
  const exportHook = useVideoExport();
  const playRef = useRef(null);
  const audioRef = useRef(null);
  

  // Data queries
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await base44.entities.Projects.filter({ id: projectId }))[0],
    enabled: !!projectId
  });

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    },
    enabled: !!projectId
  });

  // FIXED: Get actual voiceover duration from ProductionSettings
  const { data: prodSettings } = useQuery({
    queryKey: ['prod-settings', projectId],
    queryFn: async () => {
      const list = await base44.entities.ProductionSettings.filter({ project_id: projectId });
      return list[0] || null;
    },
    enabled: !!projectId
  });

  const voiceoverUrl = prodSettings?.voiceover_url;

  const { data: musicTracks = [] } = useQuery({
    queryKey: ['music-timeline', projectId],
    queryFn: () => base44.entities.MusicTracks.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const selectedMusic = musicTracks.find(t => t.is_selected);
  const musicUrl = selectedMusic?.audio_url;

  // ═══════════════════════════════════════════════════════════════════
  // MEASURE ACTUAL VOICEOVER DURATION FROM AUDIO FILE
  // This is the SOURCE OF TRUTH - not estimates!
  // ═══════════════════════════════════════════════════════════════════

  const [measuredAudioDuration, setMeasuredAudioDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(null);

  useEffect(() => {
    if (!voiceoverUrl) {
      setMeasuredAudioDuration(0);
      return;
    }

    setAudioLoading(true);
    setAudioError(null);

    // Create a temporary audio element to measure duration
    const tempAudio = new Audio();
    
    const handleLoadedMetadata = () => {
      const duration = tempAudio.duration;
      if (duration && isFinite(duration) && duration > 0) {
        console.log(`🎵 Measured voiceover duration: ${duration.toFixed(1)}s from ${voiceoverUrl.substring(0, 50)}...`);
        setMeasuredAudioDuration(duration);
        setAudioError(null);
      }
      setAudioLoading(false);
    };

    const handleError = (e) => {
      console.warn('Failed to load voiceover audio:', e);
      setAudioError('Could not load audio file');
      setAudioLoading(false);
    };

    const handleCanPlayThrough = () => {
      // Sometimes loadedmetadata doesn't fire, but canplaythrough does
      if (!measuredAudioDuration && tempAudio.duration && isFinite(tempAudio.duration)) {
        console.log(`🎵 Measured voiceover duration (canplaythrough): ${tempAudio.duration.toFixed(1)}s`);
        setMeasuredAudioDuration(tempAudio.duration);
      }
      setAudioLoading(false);
    };

    tempAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    tempAudio.addEventListener('error', handleError);
    tempAudio.addEventListener('canplaythrough', handleCanPlayThrough);
    
    // Set source and start loading
    tempAudio.preload = 'metadata';
    tempAudio.src = voiceoverUrl;

    return () => {
      tempAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      tempAudio.removeEventListener('error', handleError);
      tempAudio.removeEventListener('canplaythrough', handleCanPlayThrough);
      tempAudio.src = '';
    };
  }, [voiceoverUrl]);

  // Actual duration: measured > stored > 0
  const actualVoiceoverDuration = measuredAudioDuration || prodSettings?.voiceover_duration_seconds || 0;

  // ═══════════════════════════════════════════════════════════════════
  // AUDIO BEAT DURATIONS - Scaled to ACTUAL voiceover duration
  // Each scene gets duration proportional to its word count
  // ═══════════════════════════════════════════════════════════════════

  const audioBeatDurations = useMemo(() => {
    if (scenes.length === 0) return [];

    // Priority 1: Use saved beat durations from ProductionSettings (most accurate!)
    if (prodSettings?.beat_durations) {
      try {
        const saved = JSON.parse(prodSettings.beat_durations);
        if (Array.isArray(saved) && saved.length === scenes.length) {
          console.log(`🎵 Using saved beat durations from ProductionSettings`);
          console.log(`   Durations: [${saved.map(d => d.toFixed(1)).join(', ')}]`);
          const total = saved.reduce((a, b) => a + b, 0);
          console.log(`   Total: ${total.toFixed(1)}s`);
          return saved;
        }
      } catch (e) {
        console.warn('Failed to parse beat_durations:', e);
      }
    }

    // Priority 2: Fall back to scene.duration_seconds from database
    console.log(`📊 Beat durations not found in ProductionSettings, using scene defaults`);
    const durations = scenes.map(scene => {
      const duration = scene.duration_seconds;
      if (duration === null || duration === undefined || duration <= 0) {
        console.warn(`Scene ${scene.scene_number} missing/invalid duration_seconds — using 5s fallback`);
        return 5;
      }
      return Math.max(1.5, duration);
    });

    const totalCalc = durations.reduce((sum, d) => sum + d, 0);
    console.log(`✅ Timeline beat sync: ${scenes.length} scenes = ${totalCalc.toFixed(1)}s total (from scene defaults)`);
    if (scenes.length <= 20) {
      console.log(`   Durations: [${durations.map(d => d.toFixed(1)).join(', ')}]`);
    }

    return durations;
  }, [scenes, prodSettings]);

  const audioStartTimes = useMemo(() => {
    const starts = [];
    let offset = 0;
    audioBeatDurations.forEach(dur => {
      starts.push(offset);
      offset += dur;
    });
    return starts;
  }, [audioBeatDurations]);

  // Total duration = actual voiceover duration OR sum of beats
  const totalDuration = useMemo(() => {
    // Priority 1: Measured voiceover audio (most accurate)
    if (actualVoiceoverDuration > 0) {
      console.log(`⏱️ Total duration: ${actualVoiceoverDuration.toFixed(1)}s (from measured audio)`);
      return actualVoiceoverDuration;
    }

    // Priority 2: Sum of scene durations (from backend breakdown)
    const sceneSum = audioBeatDurations.reduce((sum, d) => sum + d, 0);
    if (sceneSum > 0) {
      console.log(`⏱️ Total duration: ${sceneSum.toFixed(1)}s (from scene durations)`);
      return sceneSum;
    }

    // Fallback
    console.warn('⚠️ No duration source available — using 60s default');
    return 60;
  }, [audioBeatDurations, actualVoiceoverDuration]);

  // Audio clips
  const audioClips = useMemo(() => {
    return scenes.map((scene, idx) => {
      // Use scene duration directly from database (authoritative source)
      const duration = scene.duration_seconds || audioBeatDurations[idx] || 5;
      return {
        id: `audio-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'audio',
        startTime: audioStartTimes[idx] || 0,
        duration: duration,
        label: `${duration.toFixed(1)}s`
      };
    });
  }, [scenes, audioBeatDurations, audioStartTimes]);

  // Initialize video clips - only once when scenes first load
 useEffect(() => {
    if (scenes.length === 0 || initialized) return;

    // Use beat durations if available, otherwise scene defaults
    let offset = 0;
    const initClips = scenes.map((scene, idx) => {
      const duration = audioBeatDurations[idx] || scene.duration_seconds || 5;
      const clip = {
        id: `video-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'video',
        startTime: offset,
        duration: duration,
        label: `Scene ${scene.scene_number}`,
        thumbnail: scene.image_url,
        effects: [],
        audioMuted: false,
        cinematicMotion: null,
        transition: null,
        synced: false
      };
      offset += duration;
      return clip;
    });

    console.log('📍 INIT: Setting initial clips from scenes');
    console.log(`   Using beat durations: ${audioBeatDurations.length > 0 ? 'YES ✓' : 'NO'}`);
    videoHistory.reset(initClips);
    setInitialized(true);
  }, [scenes.length, initialized, audioBeatDurations]);

  // Playback
  useEffect(() => {
    if (isPlaying) {
      const start = Date.now() - currentTime * 1000;
      playRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed >= totalDuration) { setIsPlaying(false); setCurrentTime(0); }
        else setCurrentTime(elapsed);
      }, 33);
    } else if (playRef.current) clearInterval(playRef.current);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalDuration]);

  // Audio sync
  useEffect(() => {
    if (voiceoverUrl && audioRef.current) {
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.3) audioRef.current.currentTime = currentTime;
      audioRef.current.muted = isMuted;
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentTime, voiceoverUrl, isMuted]);

  // Current scene & clip
  const currentClip = useMemo(() => {
    return videoClips.find(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);
  }, [videoClips, currentTime]);

  const currentScene = useMemo(() => {
    return currentClip ? scenes.find(s => s.id === currentClip.sceneId) : null;
  }, [currentClip, scenes]);

  // ═══════════════════════════════════════════════════════════════════
  // AUTOSYNC
  // ═══════════════════════════════════════════════════════════════════

  const handleAutoSync = () => {
    setIsSyncing(true);
    setSyncStatus(null);

    console.log('🔄 AUTOSYNC: Starting...');
    console.log('   Current clips:', videoClips.map(c => ({ id: c.id, duration: c.duration, startTime: c.startTime })));
    console.log('   Audio beats:', audioBeatDurations);
    console.log('   Start times:', audioStartTimes);

    const synced = scenes.map((scene, idx) => {
      const existing = videoClips.find(c => c.sceneId === scene.id);
      const newClip = {
        ...(existing || {}),
        id: `video-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'video',
        startTime: audioStartTimes[idx],
        duration: audioBeatDurations[idx],
        label: `Scene ${scene.scene_number}`,
        thumbnail: scene.image_url,
        effects: existing?.effects || [],
        audioMuted: existing?.audioMuted || false,
        cinematicMotion: existing?.cinematicMotion || null,
        transition: existing?.transition || null,
        synced: true
      };
      console.log(`   Scene ${scene.scene_number}: ${newClip.startTime} → duration ${newClip.duration}`);
      return newClip;
    });

    console.log('🔄 AUTOSYNC: Setting new clips:', synced.map(c => ({ id: c.id, duration: c.duration, startTime: c.startTime })));
    setVideoClips(synced);
    setSyncStatus('success');
    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // ═══════════════════════════════════════════════════════════════════
  // APPLY CINEMATIC ZOOM TO ALL IMAGES
  // ═══════════════════════════════════════════════════════════════════

  const handleApplyCinematicZoom = () => {
    setIsApplyingZoom(true);

    // Define motion families with alternating opposites for smooth flow
    const motionFamilies = [
      // Family 1: Horizontal pans (left/right alternating)
      { forward: 'pan_right_zoom', backward: 'pan_left_zoom' },
      // Family 2: Vertical motions (top/bottom alternating)
      { forward: 'push_in_top', backward: 'push_in_bottom' },
      // Family 3: Diagonal motions (opposite directions)
      { forward: 'diagonal_tl_br', backward: 'diagonal_tr_bl' },
      // Family 4: Zoom center (in/out alternating)
      { forward: 'zoom_in_center', backward: 'zoom_out_center' },
    ];

    const withMotion = videoClips.map((clip, idx) => {
      // Pick a motion family based on position
      const familyIndex = Math.floor(idx / 2) % motionFamilies.length;
      const family = motionFamilies[familyIndex];
      
      // Alternate between forward and backward within the family for opposite effect
      const isEven = idx % 2 === 0;
      const motionId = isEven ? family.forward : family.backward;
      
      return {
        ...clip,
        cinematicMotion: motionId
      };
    });

    setVideoClips(withMotion);
    setIsApplyingZoom(false);
  };

  // Remove all cinematic zoom
  const handleRemoveCinematicZoom = () => {
    const withoutMotion = videoClips.map(clip => ({
      ...clip,
      cinematicMotion: null
    }));
    setVideoClips(withoutMotion);
  };

  // Count clips with cinematic motion
  const motionCount = videoClips.filter(c => c.cinematicMotion).length;
  
  // Count clips with transitions
  const transitionCount = videoClips.filter(c => c.transition).length;

  // Generate captions from timeline voiceover (fresh generation)
  const handleGenerateCaptions = (deleteExisting) => {
    setIsGenCaptions(true);

    console.log(`📝 Generating captions with beat durations:`, audioBeatDurations);
    console.log(`   Start times:`, audioStartTimes);
    console.log(`   Total duration:`, actualVoiceoverDuration);

    const caps = [];
    
    // CRITICAL: Use the CURRENT beat durations from state, not stored values
    if (audioBeatDurations.length > 0 && audioStartTimes.length > 0) {
      // Generate captions based on CURRENT audio beat timing (timeline-aware)
      scenes.forEach((scene, idx) => {
        const text = scene.narration_text || scene.voiceover_text;
        if (!text) return;

        // Split into words to distribute evenly across audio beat duration
        const words = text.trim().split(/\s+/);
        if (words.length === 0) return;

        // Use CURRENT beat data from state (which was loaded from ProductionSettings)
        const beatDuration = audioBeatDurations[idx];
        const beatStartTime = audioStartTimes[idx];
        
        if (!beatDuration || !beatStartTime) {
          console.warn(`⚠️ Scene ${scene.scene_number}: missing beat duration or start time`);
          return;
        }
        
        console.log(`   Scene ${scene.scene_number}: beat starts at ${beatStartTime.toFixed(1)}s, duration ${beatDuration.toFixed(1)}s`);
        const wordsPerCaption = Math.max(1, Math.ceil(words.length / 4)); // 4 captions per scene roughly
        
        let wordIdx = 0;
        while (wordIdx < words.length) {
          const captionWords = words.slice(wordIdx, wordIdx + wordsPerCaption);
          const captionText = captionWords.join(' ');
          const proportionStart = wordIdx / words.length;
          const proportionEnd = Math.min(1, (wordIdx + wordsPerCaption) / words.length);
          
          const captionStartTime = beatStartTime + proportionStart * beatDuration;
          const captionDuration = (proportionEnd - proportionStart) * beatDuration;

          caps.push({
            id: `cap-${scene.id}-${wordIdx}-${Date.now()}`,
            sceneId: scene.id,
            type: 'caption',
            startTime: captionStartTime,
            duration: Math.max(0.5, captionDuration),
            text: captionText,
            label: captionText.slice(0, 15) + '...',
            x: 50, 
            y: 85, 
            fontSize: 20, 
            color: '#FFFFFF', 
            bgColor: 'rgba(0,0,0,0.7)'
          });
          
          console.log(`   Cap: "${captionText}" @ ${captionStartTime.toFixed(1)}s for ${captionDuration.toFixed(1)}s`);
          
          wordIdx += wordsPerCaption;
        }
      });
    } else {
      // Fallback: use beat durations as a safety net (should not reach here)
      console.warn(`⚠️ No beat durations available for captions! Using fallback.`);
      
      if (audioBeatDurations.length > 0) {
        scenes.forEach((scene, idx) => {
          const text = scene.narration_text || scene.voiceover_text;
          if (!text) return;

          const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
          const sceneDuration = audioBeatDurations[idx] || 5; // Use beat duration!
          const sentenceDuration = sceneDuration / Math.max(sentences.length, 1);
          const sceneStartTime = audioStartTimes[idx] || 0;

          sentences.forEach((sent, i) => {
            caps.push({
              id: `cap-${scene.id}-${i}-${Date.now()}`,
              sceneId: scene.id,
              type: 'caption',
              startTime: sceneStartTime + i * sentenceDuration,
              duration: sentenceDuration,
              text: sent.trim(),
              label: sent.trim().slice(0, 15) + '...',
              x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)'
            });
          });
        });
      }
    }

    setCaptionClips(deleteExisting ? caps : [...captionClips, ...caps]);
    setIsGenCaptions(false);
  };

  // Handlers
  const handleUndo = () => { videoHistory.undo(); captionHistory.undo(); };
  const handleRedo = () => { videoHistory.redo(); captionHistory.redo(); };
  const handleDelete = () => {
    if (selectedVideoId) { setVideoClips(videoClips.filter(c => c.id !== selectedVideoId)); setSelectedVideoId(null); }
    if (selectedCaptionId) { setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId)); setSelectedCaptionId(null); }
  };
  const handleBack = () => navigate(createPageUrl('ContentGeneration') + `?project_id=${projectId}`);
  const handleExport = () => alert('Export MP4 coming soon!');
  const handleDownloadAssets = () => alert('Download Assets coming soon!');
  const handleSeek = t => { setCurrentTime(Math.max(0, Math.min(totalDuration, t))); if (audioRef.current) audioRef.current.currentTime = t; };
  const handleNext = () => navigate(createPageUrl('PostProduction') + `?project_id=${projectId}`);
  const handleApplyEffect = e => { if (!selectedVideoId) return; setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, effects: [...(c.effects || []), e.id] } : c)); };
  
  // Transition handlers
  const handleApplyTransition = (t) => {
    if (!selectedVideoId) return;
    setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: t.name } : c));
  };


const handleRemoveTransition = () => {
    if (!selectedVideoId) return;
    setVideoClips(videoClips.map(c => c.id === selectedVideoId ? { ...c, transition: null } : c));
  };
  const handleApplyTransitionToAll = (transition) => {
    setVideoClips(videoClips.map(c => ({ ...c, transition: transition.name })));
  };

  // Caption handlers
  const handleDeleteCaption = () => {
    if (!selectedCaptionId) return;
    setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId));
    setSelectedCaptionId(null);
  };

  const handleDuplicateCaption = () => {
    if (!selectedCaptionId) return;
    const cap = captionClips.find(c => c.id === selectedCaptionId);
    if (!cap) return;
    const newCap = {
      ...cap,
      id: `cap-dup-${Date.now()}`,
      startTime: cap.startTime + cap.duration + 0.5,
    };
    setCaptionClips([...captionClips, newCap]);
    setSelectedCaptionId(newCap.id);
  };

  const selectedVideo = videoClips.find(c => c.id === selectedVideoId);
  const selectedCaption = captionClips.find(c => c.id === selectedCaptionId);
  const selectedVideoIdx = videoClips.findIndex(c => c.id === selectedVideoId);
  const canUndo = videoHistory.canUndo || captionHistory.canUndo;
  const canRedo = videoHistory.canRedo || captionHistory.canRedo;

  // DEBUG: Expose to console
  useEffect(() => {
    window.DEBUG = {
      scenes: scenes.length,
      firstScene: scenes[0],
      videoClips: videoClips.length,
      audioStartTimes,
      audioBeatDurations,
      totalDuration,
      actualVoiceoverDuration,
      currentTime,
      currentClip: currentClip ? { id: currentClip.id, startTime: currentClip.startTime, duration: currentClip.duration, transition: currentClip.transition } : null,
      prodSettings: prodSettings ? { 
        beat_durations: prodSettings.beat_durations ? JSON.parse(prodSettings.beat_durations) : null,
        beat_start_times: prodSettings.beat_start_times ? JSON.parse(prodSettings.beat_start_times) : null,
        voiceover_url: prodSettings.voiceover_url
      } : null,
    };
  }, [scenes, videoClips, audioStartTimes, audioBeatDurations, totalDuration, actualVoiceoverDuration, currentTime, currentClip, prodSettings]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      <TopToolbar activePanel={activePanel} onPanelChange={setActivePanel} projectName={project?.name} onBack={handleBack} onExport={handleExport} onDownloadAssets={handleDownloadAssets} onShowExporter={() => setShowExporter(true)} onNext={handleNext} />      <div className="flex-1 flex min-h-0">
        {/* Left */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media' && <MediaPanel scenes={scenes} audioBeatDurations={audioBeatDurations} onSelectScene={(idx) => handleSeek(audioStartTimes[idx] || 0)} />}
          {activePanel === 'effects' && <EffectsPanel selectedClip={selectedVideo} onApplyEffect={handleApplyEffect} />}
          {activePanel === 'transitions' && (
            <TransitionsPanel 
              selectedClip={selectedVideo} 
              onApplyTransition={handleApplyTransition}
              onRemoveTransition={handleRemoveTransition}
              onApplyTransitionToAll={handleApplyTransitionToAll}
            />
          )}
          {activePanel === 'captions' && <CaptionsPanel onGenerate={handleGenerateCaptions} isGenerating={isGenCaptions} captionCount={captionClips.length} />}
          {!['media', 'effects', 'transitions', 'captions'].includes(activePanel) && <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>}
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <VideoPreview 
              currentScene={currentScene} 
              currentTime={currentTime} 
              currentClip={currentClip}
              captions={captionClips} 
              selectedCaption={selectedCaption} 
              onSelectCaption={c => { setSelectedCaptionId(c?.id || null); setSelectedVideoId(null); }} 
              onUpdateCaption={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} 
              orientation={project?.orientation || 'landscape'}
              videoClips={videoClips}
              scenes={scenes}
            />
          </div>
          <TransportControls isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} currentTime={currentTime} totalDuration={totalDuration} onSeek={handleSeek} />
        </div>

        {/* Right */}
        <div className="w-64 flex-shrink-0 bg-[#12121f]">
          {selectedCaption ? (
            <TextPropertiesPanel 
              caption={selectedCaption} 
              onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} 
              onDelete={handleDeleteCaption}
              onDuplicate={handleDuplicateCaption}
            />
          ) : selectedVideo ? (
            <ClipPropertiesPanel 
              clip={selectedVideo} 
              audioBeatDuration={audioBeatDurations[selectedVideoIdx]} 
              onUpdate={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} 
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!canUndo} className={`p-1.5 rounded ${canUndo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Undo"><Undo2 size={16} /></button>
          <button onClick={handleRedo} disabled={!canRedo} className={`p-1.5 rounded ${canRedo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600'}`} title="Redo"><Redo2 size={16} /></button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Split"><Scissors size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Duplicate"><Copy size={16} /></button>
          <button onClick={handleDelete} disabled={!selectedVideoId && !selectedCaptionId} className={`p-1.5 rounded ${(selectedVideoId || selectedCaptionId) ? 'text-red-400 hover:text-red-300' : 'text-gray-600'}`} title="Delete"><Trash2 size={16} /></button>
        </div>

        {/* Center buttons */}
        <div className="flex items-center gap-2">
          <Button onClick={handleAutoSync} disabled={isSyncing} size="default" className={`gap-2 px-4 shadow-lg ${syncStatus === 'success' ? 'bg-green-600' : 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'}`}>
            {isSyncing ? <><Loader2 size={16} className="animate-spin" /> Syncing...</> : syncStatus === 'success' ? <><CheckCircle size={16} /> Synced!</> : <><Wand2 size={16} /> AutoSync</>}
          </Button>

          {/* Cinematic Zoom Button */}
          <Button 
            onClick={motionCount > 0 ? handleRemoveCinematicZoom : handleApplyCinematicZoom} 
            disabled={isApplyingZoom}
            size="default" 
            className={`gap-2 px-4 shadow-lg ${motionCount > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'}`}
          >
            {isApplyingZoom ? (
              <><Loader2 size={16} className="animate-spin" /> Applying...</>
            ) : motionCount > 0 ? (
              <><X size={16} /> Remove Zoom ({motionCount})</>
            ) : (
              <><Camera size={16} /> Cinematic Zoom</>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{videoClips.length} video</span>
          <span>{audioClips.length} audio</span>
          <span>{captionClips.length} captions</span>
          {motionCount > 0 && <span className="text-amber-400">{motionCount} zooms</span>}
          {transitionCount > 0 && <span className="text-purple-400">{transitionCount} transitions</span>}
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => setPps(p => Math.max(3, p / 1.25))} className="p-1 text-gray-400 hover:text-white"><ZoomOut size={14} /></button>
          <span className="w-6 text-center">{Math.round(pps)}</span>
          <button onClick={() => setPps(p => Math.min(50, p * 1.25))} className="p-1 text-gray-400 hover:text-white"><ZoomIn size={14} /></button>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => setIsMuted(!isMuted)} className="p-1 text-gray-400 hover:text-white">{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
        </div>
      </div>

      {/* Voiceover Info Bar */}
      {voiceoverUrl && (
        <div className={`px-3 py-1.5 border-t text-xs flex items-center gap-4 ${
          audioLoading ? 'bg-amber-900/30 border-amber-800/50 text-amber-300' :
          audioError ? 'bg-red-900/30 border-red-800/50 text-red-300' :
          actualVoiceoverDuration > 0 ? 'bg-indigo-900/30 border-indigo-800/50 text-indigo-300' :
          'bg-gray-800/50 border-gray-700 text-gray-400'
        }`}>
          <Mic size={12} />
          {audioLoading ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Measuring voiceover duration...</span>
            </>
          ) : audioError ? (
            <>
              <AlertCircle size={12} />
              <span>Could not measure audio - using text estimates</span>
            </>
          ) : actualVoiceoverDuration > 0 ? (
            <>
              <span className="font-medium">Voiceover: {formatTime(actualVoiceoverDuration)} total</span>
              <span className="text-indigo-400">•</span>
              <span>{scenes.length} scenes</span>
              <span className="text-indigo-400">•</span>
              <span>Avg {(actualVoiceoverDuration / Math.max(scenes.length, 1)).toFixed(1)}s per scene</span>
              {measuredAudioDuration > 0 && (
                <>
                  <span className="text-indigo-400">•</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle size={10} /> Measured from audio file
                  </span>
                </>
              )}
            </>
          ) : (
            <span>No voiceover loaded - using text estimates</span>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="h-48 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto">
        <TimelineRuler totalDuration={totalDuration} pps={pps} onSeek={handleSeek} />
        {scenes.length === 0 ? <div className="flex items-center justify-center h-32 text-gray-500">No scenes</div> : (
          <>
            <TimelineTrack type="video" clips={videoClips} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedVideoId} onSelect={id => { setSelectedVideoId(id); setSelectedCaptionId(null); }} onUpdate={c => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} editable={true} />
            <TimelineTrack type="audio" clips={audioClips} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={null} onSelect={() => {}} onUpdate={() => {}} editable={false} />
            <TimelineTrack type="caption" clips={captionClips} pps={pps} totalDuration={totalDuration} currentTime={currentTime} selectedId={selectedCaptionId} onSelect={id => { setSelectedCaptionId(id); setSelectedVideoId(null); }} onUpdate={c => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} editable={true} />
          </>
        )}
      </div>
      {/* Video Exporter Modal */}
      {showExporter && (() => {
        const exportScenes = videoClips.map(clip => {
          const scene = scenes.find(s => s.id === clip.sceneId);
          return {
            ...clip,
            image_url: scene?.image_url,
            video_url: scene?.video_url,
            narration_text: scene?.narration_text,
            voiceover_text: scene?.voiceover_text,
          };
        });
        
        return (
          <VideoExporter
            open={showExporter}
            onClose={() => setShowExporter(false)}
            scenes={exportScenes}
            orientation={project?.orientation || 'landscape'}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
            musicVolume={musicVol}
            projectName={project?.name || 'Untitled'}
            exportHook={exportHook}
          />
        );
      })()}
    </div>
  );
}
