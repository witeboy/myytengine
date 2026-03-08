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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2, Copy,
  Download, Home, Image, Music, Type, Wand2, Film, Mic, Settings,
  Loader2, CheckCircle, Sparkles, Star, Move, ArrowLeft, FileVideo,
  LayoutGrid, List, FolderOpen, Plus, X, Package,
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TIMELINE EDITOR V6
// ══════════════════════════════════════════════════════════════════
// - Audio beats from voiceover (not captions)
// - Working Undo/Redo/Delete
// - Navigation: Back, Export, Download Assets
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;
const MAX_HISTORY = 50;

// ═══════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════

const EFFECTS = [
  { id: 'ken_burns', name: 'Ken Burns', icon: Move },
  { id: 'zoom_in', name: 'Zoom In', icon: ZoomIn },
  { id: 'zoom_out', name: 'Zoom Out', icon: Minimize2 },
  { id: 'pan_left', name: 'Pan Left', icon: ArrowUpRight },
  { id: 'pan_right', name: 'Pan Right', icon: ArrowDownLeft },
  { id: 'fade', name: 'Fade', icon: Blend },
  { id: 'blur', name: 'Blur', icon: Focus },
  { id: 'glow', name: 'Glow', icon: Sparkles },
];

const TRANSITIONS = [
  { id: 'black_fade', name: 'Black Fade' },
  { id: 'gradual_fade', name: 'Gradual Fade' },
  { id: 'smooth_ink', name: 'Smooth Ink' },
  { id: 'expand_fade', name: 'Expand Fade' },
  { id: 'fuzzy_fade', name: 'Fuzzy Fade' },
  { id: 'overlap_fade', name: 'Overlap Fade' },
  { id: 'lazy_fade', name: 'Lazy Fade' },
  { id: 'square_fade', name: 'Square Fade' },
  { id: 'fade_up', name: 'Fade Up' },
  { id: 'central_fade', name: 'Central Fade' },
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

// ═══════════════════════════════════════════════════════════════════
// HISTORY HOOK FOR UNDO/REDO
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

  const undo = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) setIndex(index + 1);
  }, [history.length, index]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return { state, setState, undo, redo, canUndo, canRedo };
}

// ═══════════════════════════════════════════════════════════════════
// TOP TOOLBAR WITH NAVIGATION
// ═══════════════════════════════════════════════════════════════════

function TopToolbar({ activePanel, onPanelChange, projectName, onBack, onExport, onDownloadAssets }) {
  const panels = [
    { id: 'media', label: 'Media', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'stickers', label: 'Stickers', icon: Star },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: Blend },
    { id: 'captions', label: 'Captions', icon: Type },
    { id: 'filters', label: 'Filters', icon: Palette },
    { id: 'adjustment', label: 'Adjustment', icon: Settings },
  ];

  return (
    <div className="flex items-center justify-between px-2 py-1 bg-[#1a1a2e] border-b border-gray-800">
      {/* Left - Back & Project Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-xs">Back</span>
        </button>
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-sm font-medium text-white truncate max-w-[150px]">{projectName || 'Untitled'}</span>
      </div>

      {/* Center - Panel Tabs */}
      <div className="flex items-center gap-0.5">
        {panels.map(panel => (
          <button
            key={panel.id}
            onClick={() => onPanelChange(panel.id)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded transition-all ${
              activePanel === panel.id ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <panel.icon size={14} />
            <span className="text-[8px]">{panel.label}</span>
          </button>
        ))}
      </div>

      {/* Right - Export & Download */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onDownloadAssets}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-gray-700 text-gray-300 hover:text-white"
        >
          <Package size={14} />
          Assets
        </Button>
        <Button
          onClick={onExport}
          size="sm"
          className="gap-1.5 text-xs bg-green-600 hover:bg-green-700"
        >
          <FileVideo size={14} />
          Export MP4
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - MEDIA
// ═══════════════════════════════════════════════════════════════════

function MediaPanel({ scenes, onSelectScene }) {
  const [viewMode, setViewMode] = useState('grid');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400">{scenes.length} items</span>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('grid')} className={`p-1 rounded ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500'}`}>
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500'}`}>
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <FolderOpen className="w-10 h-10 text-gray-600 mb-2" />
            <p className="text-xs text-gray-500">No media</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1'}>
            {scenes.map(scene => (
              <div
                key={scene.id}
                className="group relative aspect-video bg-gray-800 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-cyan-500"
                onClick={() => onSelectScene(scene)}
              >
                {scene.image_url ? (
                  <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1">
                  <p className="text-[9px] text-white">Scene {scene.scene_number}</p>
                  <p className="text-[8px] text-cyan-300">{(scene.audio_duration || scene.duration_seconds || 5).toFixed(1)}s audio</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - EFFECTS
// ═══════════════════════════════════════════════════════════════════

function EffectsPanel({ selectedClip, onApplyEffect, appliedEffects }) {
  const [notification, setNotification] = useState(null);

  const handleApply = (effect) => {
    if (!selectedClip) {
      setNotification('Select a video clip first');
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    onApplyEffect(effect);
    setNotification(`Applied ${effect.name}`);
    setTimeout(() => setNotification(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs text-gray-400">
          {selectedClip ? `Scene ${selectedClip.sceneNumber}` : 'Select a clip first'}
        </p>
      </div>

      {notification && (
        <div className="mx-2 mt-2 px-3 py-2 bg-green-500/20 text-green-400 text-xs rounded">{notification}</div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {EFFECTS.map(effect => {
            const isApplied = appliedEffects?.includes(effect.id);
            return (
              <button
                key={effect.id}
                onClick={() => handleApply(effect)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all ${
                  isApplied ? 'bg-purple-500/30 ring-1 ring-purple-500' : 'bg-gray-800/50 hover:bg-purple-500/20'
                }`}
              >
                <effect.icon className="w-5 h-5 text-purple-400" />
                <span className="text-[10px] text-gray-300">{effect.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

function TransitionsPanel({ selectedClipIndex, totalClips, onApplyTransition }) {
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState(null);

  const filtered = TRANSITIONS.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const handleApply = (transition) => {
    if (selectedClipIndex === null || selectedClipIndex < 0) {
      setNotification('Select a video clip first');
    } else if (selectedClipIndex >= totalClips - 1) {
      setNotification('Cannot add after last clip');
    } else {
      onApplyTransition(transition, selectedClipIndex);
      setNotification(`Added ${transition.name}`);
    }
    setTimeout(() => setNotification(null), 2500);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-7 text-xs bg-gray-800 border-gray-700" />
      </div>

      {notification && (
        <div className="mx-2 mt-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded">{notification}</div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(transition => (
            <button key={transition.id} onClick={() => handleApply(transition)} className="relative aspect-video bg-gray-800 rounded overflow-hidden hover:ring-2 hover:ring-cyan-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center">
                <Blend className="w-6 h-6 text-white/50" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                <p className="text-[9px] text-white text-center truncate">{transition.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - CAPTIONS
// ═══════════════════════════════════════════════════════════════════

function CaptionsPanel({ onGenerate, isGenerating, captionCount }) {
  const [settings, setSettings] = useState({
    language: 'auto',
    highlightKeywords: false,
    aiEmojis: false,
    deleteExisting: false,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Spoken language</label>
          <Select value={settings.language} onValueChange={v => setSettings(s => ({ ...s, language: v }))}>
            <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto detect</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Highlight keywords</span>
            <Switch checked={settings.highlightKeywords} onCheckedChange={v => setSettings(s => ({ ...s, highlightKeywords: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">AI emojis</span>
            <Switch checked={settings.aiEmojis} onCheckedChange={v => setSettings(s => ({ ...s, aiEmojis: v }))} />
          </div>
        </div>

        {captionCount > 0 && (
          <div className="p-2 bg-gray-800/50 rounded text-xs text-gray-400">{captionCount} captions</div>
        )}
      </div>

      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <input type="checkbox" id="del" checked={settings.deleteExisting} onChange={e => setSettings(s => ({ ...s, deleteExisting: e.target.checked }))} className="rounded border-gray-600" />
          <label htmlFor="del" className="text-[10px] text-gray-400">Delete existing</label>
        </div>
        <Button onClick={() => onGenerate(settings)} disabled={isGenerating} className="w-full bg-cyan-600 hover:bg-cyan-700">
          {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</> : 'Generate'}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIGHT PANEL - TEXT PROPERTIES
// ═══════════════════════════════════════════════════════════════════

function TextPropertiesPanel({ caption, onUpdate }) {
  if (!caption) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <Type className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-xs">Select a caption</p>
      </div>
    );
  }

  const update = (key, value) => onUpdate({ ...caption, [key]: value });

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <Textarea value={caption.text} onChange={e => update('text', e.target.value)} className="bg-gray-800 border-gray-700 text-sm" rows={3} />

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Font size</label>
        <div className="flex items-center gap-2">
          <Slider value={[caption.fontSize || 24]} onValueChange={([v]) => update('fontSize', v)} min={10} max={72} className="flex-1" />
          <Input type="number" value={caption.fontSize || 24} onChange={e => update('fontSize', parseInt(e.target.value) || 24)} className="w-14 h-7 text-xs bg-gray-800 border-gray-700" />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Style</label>
        <div className="flex gap-1">
          <button onClick={() => update('bold', !caption.bold)} className={`w-8 h-8 rounded flex items-center justify-center ${caption.bold ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}><Bold size={14} /></button>
          <button onClick={() => update('italic', !caption.italic)} className={`w-8 h-8 rounded flex items-center justify-center ${caption.italic ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}><Italic size={14} /></button>
          <button onClick={() => update('underline', !caption.underline)} className={`w-8 h-8 rounded flex items-center justify-center ${caption.underline ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}><Underline size={14} /></button>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Color</label>
        <div className="flex items-center gap-2">
          <input type="color" value={caption.color || '#FFFFFF'} onChange={e => update('color', e.target.value)} className="w-10 h-8 rounded border-0 cursor-pointer" />
          <Input value={caption.color || '#FFFFFF'} onChange={e => update('color', e.target.value)} className="flex-1 h-8 text-xs bg-gray-800 border-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIGHT PANEL - CLIP PROPERTIES
// ═══════════════════════════════════════════════════════════════════

function ClipPropertiesPanel({ clip, onUpdate }) {
  if (!clip) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <Film className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-xs">Select a clip</p>
      </div>
    );
  }

  const update = (key, value) => onUpdate({ ...clip, [key]: value });

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4">
      <div className="text-sm font-medium text-white">Scene {clip.sceneNumber}</div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Video Duration</label>
        <Input type="number" step="0.1" value={clip.duration} onChange={e => update('duration', parseFloat(e.target.value) || 1)} className="h-8 text-xs bg-gray-800 border-gray-700" />
      </div>

      <div className="p-2 bg-cyan-500/10 rounded">
        <label className="text-[10px] text-cyan-400 mb-1 block">Audio Beat Duration</label>
        <p className="text-sm text-white font-mono">{clip.audioDuration?.toFixed(2) || '?'}s</p>
      </div>

      {clip.effects?.length > 0 && (
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Effects</label>
          <div className="flex flex-wrap gap-1">
            {clip.effects.map(e => (
              <span key={e} className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded flex items-center gap-1">
                {e}
                <X className="w-3 h-3 cursor-pointer hover:text-red-400" onClick={() => update('effects', clip.effects.filter(x => x !== e))} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">Mute audio</span>
        <Switch checked={clip.audioMuted || false} onCheckedChange={v => update('audioMuted', v)} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO PREVIEW
// ═══════════════════════════════════════════════════════════════════

function VideoPreview({ currentScene, currentTime, captions, selectedCaption, onSelectCaption, onUpdateCaption, orientation }) {
  const previewRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const activeCaptions = captions.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;
      const caption = captions.find(c => c.id === dragging.id);
      if (!caption) return;
      if (dragging.action === 'move') {
        const deltaX = ((e.clientX - dragging.startX) / rect.width) * 100;
        const deltaY = ((e.clientY - dragging.startY) / rect.height) * 100;
        onUpdateCaption({ ...caption, x: Math.max(5, Math.min(95, dragging.initialX + deltaX)), y: Math.max(5, Math.min(95, dragging.initialY + deltaY)) });
      } else if (dragging.action === 'resize') {
        const delta = (e.clientX - dragging.startX) / 3;
        onUpdateCaption({ ...caption, fontSize: Math.max(12, Math.min(72, Math.round(dragging.initialSize + delta))) });
      }
    };
    const handleMouseUp = () => setDragging(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, captions, onUpdateCaption]);

  const handleMouseDown = (e, caption, action) => {
    e.stopPropagation();
    onSelectCaption(caption);
    setDragging({ id: caption.id, action, startX: e.clientX, startY: e.clientY, initialX: caption.x || 50, initialY: caption.y || 85, initialSize: caption.fontSize || 24 });
  };

  return (
    <div className="h-full flex items-center justify-center p-4 bg-[#0a0a14]">
      <div
        ref={previewRef}
        className={`relative ${orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'} w-full max-h-full bg-gray-900 rounded overflow-hidden`}
        onClick={() => onSelectCaption(null)}
      >
        {currentScene?.image_url ? (
          <img src={currentScene.image_url} className="w-full h-full object-contain" alt="" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-12 h-12 text-gray-700" />
          </div>
        )}

        {activeCaptions.map(caption => {
          const isSelected = selectedCaption?.id === caption.id;
          return (
            <div
              key={caption.id}
              className={`absolute cursor-move select-none ${isSelected ? 'z-20' : 'z-10'}`}
              style={{ left: `${caption.x || 50}%`, top: `${caption.y || 85}%`, transform: 'translate(-50%, -50%)' }}
              onMouseDown={(e) => handleMouseDown(e, caption, 'move')}
            >
              <div
                className={`px-4 py-2 rounded ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
                style={{
                  backgroundColor: caption.bgColor || 'rgba(0,0,0,0.7)',
                  color: caption.color || '#FFFFFF',
                  fontSize: `${caption.fontSize || 24}px`,
                  fontWeight: caption.bold ? 'bold' : 'normal',
                  fontStyle: caption.italic ? 'italic' : 'normal',
                }}
              >
                {caption.text}
              </div>
              {isSelected && (
                <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize border-2 border-white" onMouseDown={(e) => handleMouseDown(e, caption, 'resize')} />
              )}
            </div>
          );
        })}

        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white">
          Scene {currentScene?.scene_number || '-'}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRANSPORT CONTROLS
// ═══════════════════════════════════════════════════════════════════

function TransportControls({ isPlaying, onPlayPause, currentTime, totalDuration, onSeek }) {
  return (
    <div className="flex items-center justify-center gap-4 py-3 px-4 bg-[#12121f] border-t border-gray-800">
      <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
        <SkipBack size={20} />
      </button>
      <button onClick={onPlayPause} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${isPlaying ? 'bg-red-600' : 'bg-white'}`}>
        {isPlaying ? <Pause size={28} className="text-white" /> : <Play size={28} className="text-gray-900 ml-1" />}
      </button>
      <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
        <SkipForward size={20} />
      </button>
      <div className="ml-4 flex items-center gap-2">
        <span className="text-sm font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
        <span className="text-gray-600">/</span>
        <span className="text-sm font-mono text-gray-500">{formatTimecode(totalDuration)}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE RULER
// ═══════════════════════════════════════════════════════════════════

function TimelineRuler({ totalDuration, pixelsPerSecond, onSeek }) {
  const markers = [];
  const interval = pixelsPerSecond >= 15 ? 5 : pixelsPerSecond >= 8 ? 10 : 30;
  for (let t = 0; t <= totalDuration; t += interval) markers.push(t);

  return (
    <div
      className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer"
      style={{ width: totalDuration * pixelsPerSecond, marginLeft: LABEL_WIDTH }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - rect.left) / pixelsPerSecond)));
      }}
    >
      {markers.map(t => (
        <div key={t} className="absolute bottom-0" style={{ left: t * pixelsPerSecond }}>
          <span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE TRACK
// ═══════════════════════════════════════════════════════════════════

function TimelineTrack({ type, label, clips, pixelsPerSecond, totalDuration, currentTime, selectedClipId, onSelectClip, onUpdateClip }) {
  const colors = { video: '#059669', audio: '#4f46e5', caption: '#d97706' };
  const icons = { video: Image, audio: Mic, caption: Type };
  const Icon = icons[type];
  const color = colors[type];

  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e) => {
      const delta = (e.clientX - dragging.startX) / pixelsPerSecond;
      const clip = clips.find(c => c.id === dragging.id);
      if (!clip) return;
      if (dragging.action === 'move') {
        onUpdateClip({ ...clip, startTime: Math.max(0, dragging.initialStart + delta) });
      } else if (dragging.action === 'resize-right') {
        onUpdateClip({ ...clip, duration: Math.max(0.5, dragging.initialDuration + delta) });
      }
    };
    const handleMouseUp = () => setDragging(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, clips, pixelsPerSecond, onUpdateClip]);

  const handleMouseDown = (e, clip, action) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setDragging({ id: clip.id, action, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration });
  };

  return (
    <div className="flex border-b border-gray-800">
      <div className="flex-shrink-0 bg-[#12121f] flex items-center justify-center gap-1" style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}>
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <Icon size={10} className="text-gray-400" />
      </div>
      <div className="relative bg-[#0a0a14]" style={{ height: TRACK_HEIGHT, width: Math.max(totalDuration * pixelsPerSecond, 800) }}>
        {clips.map(clip => {
          const left = clip.startTime * pixelsPerSecond;
          const width = Math.max(30, clip.duration * pixelsPerSecond);
          const isSelected = selectedClipId === clip.id;
          return (
            <div
              key={clip.id}
              className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer ${isSelected ? 'ring-2 ring-white z-10' : ''}`}
              style={{ left, width, backgroundColor: color }}
            >
              {type === 'video' && clip.thumbnail && (
                <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
              )}
              <div className="absolute inset-0 flex items-center px-2" onMouseDown={(e) => handleMouseDown(e, clip, 'move')}>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white font-medium truncate drop-shadow">{clip.label}</p>
                  <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                </div>
                {clip.audioMuted && <VolumeX className="w-3 h-3 text-red-400" />}
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => handleMouseDown(e, clip, 'resize-right')} />
            </div>
          );
        })}
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20" style={{ left: currentTime * pixelsPerSecond }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TimelineEditorV6() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  // State
  const [activePanel, setActivePanel] = useState('media');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(15);
  const [isMuted, setIsMuted] = useState(false);

  // Clips with history for undo/redo
  const videoHistory = useHistory([]);
  const captionHistory = useHistory([]);
  const videoClips = videoHistory.state;
  const setVideoClips = videoHistory.setState;
  const captionClips = captionHistory.state;
  const setCaptionClips = captionHistory.setState;

  // Audio clips (from voiceover - the source of truth for beats)
  const [audioClips, setAudioClips] = useState([]);

  // Selection
  const [selectedVideoClipId, setSelectedVideoClipId] = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);

  // Status
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // Refs
  const playbackRef = useRef(null);
  const audioRef = useRef(null);

  // Data
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await base44.entities.Projects.filter({ id: projectId }))[0],
    enabled: !!projectId
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    },
    enabled: !!projectId
  });

  const { data: prodSettings = [] } = useQuery({
    queryKey: ['prod-settings', projectId],
    queryFn: () => base44.entities.ProductionSettings.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const voiceoverUrl = prodSettings[0]?.voiceover_url;

  // ═══════════════════════════════════════════════════════════════════
  // AUDIO BEAT DURATIONS FROM SCENES (Source of Truth)
  // Each scene has audio_duration from voiceover generation
  // ═══════════════════════════════════════════════════════════════════

  const scenesWithAudioBeats = useMemo(() => {
    let offset = 0;
    return scenes.map(scene => {
      // Get audio duration - this is the beat duration from voiceover
      // Priority: audio_duration > duration_seconds > estimate from text > 5s default
      let audioDuration = 5;
      
      if (scene.audio_duration && scene.audio_duration > 0) {
        audioDuration = scene.audio_duration;
      } else if (scene.duration_seconds && scene.duration_seconds > 0) {
        audioDuration = scene.duration_seconds;
      } else if (scene.voiceover_text || scene.narration_text) {
        // Estimate: ~150 words per minute
        const text = scene.voiceover_text || scene.narration_text || '';
        const wordCount = text.split(/\s+/).filter(w => w).length;
        audioDuration = Math.max(2, Math.round((wordCount / 150) * 60 * 10) / 10);
      }

      const result = {
        ...scene,
        audioDuration,
        audioStartTime: offset,
        audioEndTime: offset + audioDuration
      };
      offset += audioDuration;
      return result;
    });
  }, [scenes]);

  const totalDuration = useMemo(() => {
    return scenesWithAudioBeats.reduce((sum, s) => sum + s.audioDuration, 0) || 60;
  }, [scenesWithAudioBeats]);

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZE CLIPS
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (scenesWithAudioBeats.length === 0) return;

    // Only initialize if empty
    if (videoClips.length === 0) {
      // Video clips - start with scene durations (may need syncing)
      const initialVideoClips = scenesWithAudioBeats.map((scene, idx) => {
        const prevScenes = scenesWithAudioBeats.slice(0, idx);
        const startTime = prevScenes.reduce((sum, s) => sum + (s.duration_seconds || 5), 0);
        return {
          id: `video-${scene.id}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'video',
          startTime,
          duration: scene.duration_seconds || 5,
          audioDuration: scene.audioDuration,
          label: `Scene ${scene.scene_number}`,
          thumbnail: scene.image_url,
          effects: [],
          audioMuted: false,
          volume: 100,
          synced: false
        };
      });
      setVideoClips(initialVideoClips);
    }

    // Audio clips - ALWAYS from voiceover beats (source of truth)
    const audioBeats = scenesWithAudioBeats.map(scene => ({
      id: `audio-${scene.id}`,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      type: 'audio',
      startTime: scene.audioStartTime,
      duration: scene.audioDuration,
      label: `${scene.audioDuration.toFixed(1)}s`
    }));
    setAudioClips(audioBeats);

  }, [scenesWithAudioBeats]);

  // Playback
  useEffect(() => {
    if (isPlaying) {
      const start = Date.now() - currentTime * 1000;
      playbackRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed >= totalDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
        } else {
          setCurrentTime(elapsed);
        }
      }, 33);
    } else {
      if (playbackRef.current) clearInterval(playbackRef.current);
    }
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [isPlaying, totalDuration]);

  // Audio sync
  useEffect(() => {
    if (voiceoverUrl && audioRef.current) {
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.3) {
        audioRef.current.currentTime = currentTime;
      }
      audioRef.current.muted = isMuted;
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentTime, voiceoverUrl, isMuted]);

  // Current scene
  const currentScene = useMemo(() => {
    const clip = videoClips.find(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);
    return clip ? scenes.find(s => s.id === clip.sceneId) : null;
  }, [videoClips, currentTime, scenes]);

  // ═══════════════════════════════════════════════════════════════════
  // AUTOSYNC - Match video to audio beats
  // ═══════════════════════════════════════════════════════════════════

  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    // Match each video clip to its audio beat duration
    let offset = 0;
    const syncedClips = scenesWithAudioBeats.map(scene => {
      const existing = videoClips.find(c => c.sceneId === scene.id);
      const clip = {
        ...(existing || {}),
        id: `video-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'video',
        startTime: offset,
        duration: scene.audioDuration, // Match audio beat!
        audioDuration: scene.audioDuration,
        label: `Scene ${scene.scene_number}`,
        thumbnail: scene.image_url,
        effects: existing?.effects || [],
        audioMuted: existing?.audioMuted || false,
        volume: existing?.volume || 100,
        synced: true
      };
      offset += scene.audioDuration;
      return clip;
    });

    setVideoClips(syncedClips);
    setSyncStatus('success');
    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // ═══════════════════════════════════════════════════════════════════
  // UNDO / REDO / DELETE
  // ═══════════════════════════════════════════════════════════════════

  const handleUndo = () => {
    videoHistory.undo();
    captionHistory.undo();
  };

  const handleRedo = () => {
    videoHistory.redo();
    captionHistory.redo();
  };

  const handleDelete = () => {
    if (selectedVideoClipId) {
      setVideoClips(videoClips.filter(c => c.id !== selectedVideoClipId));
      setSelectedVideoClipId(null);
    }
    if (selectedCaptionId) {
      setCaptionClips(captionClips.filter(c => c.id !== selectedCaptionId));
      setSelectedCaptionId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════════

  const handleBack = () => {
    navigate(createPageUrl('ContentGeneration') + `?project_id=${projectId}`);
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!\n\nThis will compile your video with all clips, transitions, and captions into an MP4 file.');
  };

  const handleDownloadAssets = () => {
    // TODO: Implement asset download
    alert('Download Assets functionality coming soon!\n\nThis will let you download all images, audio files, and captions.');
  };

  // Generate captions
  const handleGenerateCaptions = async (settings) => {
    setIsGeneratingCaptions(true);
    if (settings.deleteExisting) setCaptionClips([]);

    const newCaptions = [];
    scenesWithAudioBeats.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDur = scene.audioDuration / Math.max(sentences.length, 1);
      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}-${Date.now()}`,
          sceneId: scene.id,
          type: 'caption',
          startTime: scene.audioStartTime + idx * sentenceDur,
          duration: sentenceDur,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 20) + '...',
          x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)',
        });
      });
    });

    setCaptionClips(settings.deleteExisting ? newCaptions : [...captionClips, ...newCaptions]);
    setIsGeneratingCaptions(false);
  };

  // Effects & Transitions
  const handleApplyEffect = (effect) => {
    if (!selectedVideoClipId) return;
    setVideoClips(videoClips.map(clip =>
      clip.id === selectedVideoClipId ? { ...clip, effects: [...(clip.effects || []), effect.id] } : clip
    ));
  };

  const handleApplyTransition = (transition, clipIndex) => {
    setVideoClips(videoClips.map((clip, idx) =>
      idx === clipIndex ? { ...clip, transition: transition.name } : clip
    ));
  };

  // Handlers
  const handleSeek = (t) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, t)));
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const zoomIn = () => setPixelsPerSecond(p => Math.min(50, p * 1.25));
  const zoomOut = () => setPixelsPerSecond(p => Math.max(3, p / 1.25));

  // Selected
  const selectedVideoClip = videoClips.find(c => c.id === selectedVideoClipId);
  const selectedCaption = captionClips.find(c => c.id === selectedCaptionId);
  const selectedClipIndex = videoClips.findIndex(c => c.id === selectedVideoClipId);

  const canUndo = videoHistory.canUndo || captionHistory.canUndo;
  const canRedo = videoHistory.canRedo || captionHistory.canRedo;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      <TopToolbar
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        projectName={project?.name}
        onBack={handleBack}
        onExport={handleExport}
        onDownloadAssets={handleDownloadAssets}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media' && <MediaPanel scenes={scenes} onSelectScene={(s) => handleSeek(scenesWithAudioBeats.find(x => x.id === s.id)?.audioStartTime || 0)} />}
          {activePanel === 'effects' && <EffectsPanel selectedClip={selectedVideoClip} onApplyEffect={handleApplyEffect} appliedEffects={selectedVideoClip?.effects} />}
          {activePanel === 'transitions' && <TransitionsPanel selectedClipIndex={selectedClipIndex >= 0 ? selectedClipIndex : null} totalClips={videoClips.length} onApplyTransition={handleApplyTransition} />}
          {activePanel === 'captions' && <CaptionsPanel onGenerate={handleGenerateCaptions} isGenerating={isGeneratingCaptions} captionCount={captionClips.length} />}
          {!['media', 'effects', 'transitions', 'captions'].includes(activePanel) && (
            <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>
          )}
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <VideoPreview
              currentScene={currentScene}
              currentTime={currentTime}
              captions={captionClips}
              selectedCaption={selectedCaption}
              onSelectCaption={(c) => { setSelectedCaptionId(c?.id || null); setSelectedVideoClipId(null); }}
              onUpdateCaption={(c) => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))}
              orientation={project?.orientation || 'landscape'}
            />
          </div>
          <TransportControls isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} currentTime={currentTime} totalDuration={totalDuration} onSeek={handleSeek} />
        </div>

        {/* Right Panel */}
        <div className="w-64 flex-shrink-0 bg-[#12121f]">
          {selectedCaption ? (
            <TextPropertiesPanel caption={selectedCaption} onUpdate={(c) => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} />
          ) : selectedVideoClip ? (
            <ClipPropertiesPanel clip={selectedVideoClip} onUpdate={(c) => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121f] border-t border-gray-800">
        {/* Left - Undo/Redo/Delete */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded ${canUndo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600 cursor-not-allowed'}`}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded ${canRedo ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600 cursor-not-allowed'}`}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Split">
            <Scissors size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" title="Duplicate">
            <Copy size={16} />
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedVideoClipId && !selectedCaptionId}
            className={`p-1.5 rounded ${(selectedVideoClipId || selectedCaptionId) ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-gray-600 cursor-not-allowed'}`}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Center - AutoSync */}
        <Button
          onClick={handleAutoSync}
          disabled={isSyncing}
          size="lg"
          className={`gap-2 px-6 py-2 text-sm font-medium shadow-lg ${
            syncStatus === 'success' ? 'bg-green-600 hover:bg-green-700' :
            'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
          }`}
        >
          {isSyncing ? <><Loader2 size={18} className="animate-spin" /> Syncing...</> :
           syncStatus === 'success' ? <><CheckCircle size={18} /> Synced!</> :
           <><Wand2 size={18} /> AutoSync to Audio</>}
        </Button>

        {/* Right - Zoom & Info */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{videoClips.length} video</span>
          <span>{audioClips.length} audio</span>
          <span>{captionClips.length} captions</span>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={zoomOut} className="p-1 text-gray-400 hover:text-white"><ZoomOut size={14} /></button>
          <span className="w-6 text-center">{Math.round(pixelsPerSecond)}</span>
          <button onClick={zoomIn} className="p-1 text-gray-400 hover:text-white"><ZoomIn size={14} /></button>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => setIsMuted(!isMuted)} className="p-1 text-gray-400 hover:text-white">
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="h-48 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto">
        <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} onSeek={handleSeek} />
        {scenes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No scenes</div>
        ) : (
          <>
            <TimelineTrack type="video" label="Video" clips={videoClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={selectedVideoClipId} onSelectClip={(id) => { setSelectedVideoClipId(id); setSelectedCaptionId(null); }} onUpdateClip={(c) => setVideoClips(videoClips.map(x => x.id === c.id ? c : x))} />
            <TimelineTrack type="audio" label="Audio" clips={audioClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={null} onSelectClip={() => {}} onUpdateClip={() => {}} />
            <TimelineTrack type="caption" label="Caption" clips={captionClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={selectedCaptionId} onSelectClip={(id) => { setSelectedCaptionId(id); setSelectedVideoClipId(null); }} onUpdateClip={(c) => setCaptionClips(captionClips.map(x => x.id === c.id ? c : x))} />
          </>
        )}
      </div>
    </div>
  );
}
