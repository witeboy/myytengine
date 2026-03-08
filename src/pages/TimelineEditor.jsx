import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Loader2, CheckCircle, Sparkles, Star, Move,
  LayoutGrid, List, FolderOpen, Plus, X,
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft, RefreshCw
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TIMELINE EDITOR V5 - AUTOSYNC FIXED
// ══════════════════════════════════════════════════════════════════
// AutoSync now matches each video clip to its scene's audio duration
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;

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
  { id: 'smooth_rub', name: 'Smooth Rub' },
  { id: 'fuzzy_fade', name: 'Fuzzy Fade' },
  { id: 'overlap_fade', name: 'Overlap Fade' },
  { id: 'fuzz_fade', name: 'Fuzz Fade' },
  { id: 'lazy_fade', name: 'Lazy Fade' },
  { id: 'square_fade', name: 'Square Fade' },
  { id: 'fade_up', name: 'Fade Up' },
  { id: 'central_fade', name: 'Central Fade' },
];

const TEXT_ANIMATIONS_IN = [
  { id: 'none', name: 'None' },
  { id: 'fade_in', name: 'Fade In' },
  { id: 'slide_up', name: 'Slide Up' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'wave', name: 'Wave' },
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
// TOP TOOLBAR
// ═══════════════════════════════════════════════════════════════════

function TopToolbar({ activePanel, onPanelChange }) {
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
    <div className="flex items-center gap-0.5 px-2 py-1 bg-[#1a1a2e] border-b border-gray-800">
      {panels.map(panel => (
        <button
          key={panel.id}
          onClick={() => onPanelChange(panel.id)}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded transition-all ${
            activePanel === panel.id ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <panel.icon size={16} />
          <span className="text-[9px]">{panel.label}</span>
        </button>
      ))}
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
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1">
                  <p className="text-[9px] text-white">Scene {scene.scene_number}</p>
                  <p className="text-[8px] text-gray-300">{scene.audio_duration || scene.duration_seconds || 5}s</p>
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
        <div className="mx-2 mt-2 px-3 py-2 bg-green-500/20 text-green-400 text-xs rounded">
          {notification}
        </div>
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
    if (selectedClipIndex === null || selectedClipIndex === undefined) {
      setNotification('Select a video clip first');
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    if (selectedClipIndex >= totalClips - 1) {
      setNotification('Cannot add transition after last clip');
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    onApplyTransition(transition, selectedClipIndex);
    setNotification(`Added ${transition.name} after Scene ${selectedClipIndex + 1}`);
    setTimeout(() => setNotification(null), 2500);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <Input placeholder="Search transitions..." value={search} onChange={e => setSearch(e.target.value)} className="h-7 text-xs bg-gray-800 border-gray-700" />
      </div>

      {notification && (
        <div className="mx-2 mt-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded">{notification}</div>
      )}

      <div className="px-3 py-2 text-[10px] text-gray-500">Select a clip, then click a transition</div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(transition => (
            <button key={transition.id} onClick={() => handleApply(transition)} className="relative aspect-video bg-gray-800 rounded overflow-hidden hover:ring-2 hover:ring-cyan-500 group">
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
    bilingual: 'none',
    highlightKeywords: false,
    aiEmojis: false,
    identifyFillers: false,
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
            <span className="text-xs text-gray-300">Auto highlight keywords</span>
            <Switch checked={settings.highlightKeywords} onCheckedChange={v => setSettings(s => ({ ...s, highlightKeywords: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">AI emojis</span>
            <Switch checked={settings.aiEmojis} onCheckedChange={v => setSettings(s => ({ ...s, aiEmojis: v }))} />
          </div>
        </div>

        {captionCount > 0 && (
          <div className="p-2 bg-gray-800/50 rounded text-xs text-gray-400">{captionCount} captions on timeline</div>
        )}
      </div>

      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <input type="checkbox" id="deleteExisting" checked={settings.deleteExisting} onChange={e => setSettings(s => ({ ...s, deleteExisting: e.target.checked }))} className="rounded border-gray-600" />
          <label htmlFor="deleteExisting" className="text-[10px] text-gray-400">Delete current captions</label>
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
        <p className="text-xs">Select a caption to edit</p>
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

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Alignment</label>
        <div className="flex gap-1">
          {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => {
            const values = ['left', 'center', 'right'];
            return (
              <button key={i} onClick={() => update('align', values[i])} className={`flex-1 h-8 rounded flex items-center justify-center ${caption.align === values[i] ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}>
                <Icon size={14} />
              </button>
            );
          })}
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
        <p className="text-xs">Select a clip to edit</p>
      </div>
    );
  }

  const update = (key, value) => onUpdate({ ...clip, [key]: value });

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4">
      <div className="text-sm font-medium text-white">Scene {clip.sceneNumber}</div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Duration (sec)</label>
        <Input type="number" step="0.1" value={clip.duration} onChange={e => update('duration', parseFloat(e.target.value) || 1)} className="h-8 text-xs bg-gray-800 border-gray-700" />
      </div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Audio Duration</label>
        <p className="text-xs text-cyan-400">{clip.audioDuration || 'Not set'}s</p>
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
        <span className="text-xs text-gray-300">Mute video audio</span>
        <Switch checked={clip.audioMuted || false} onCheckedChange={v => update('audioMuted', v)} />
      </div>

      {!clip.audioMuted && (
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Volume</label>
          <div className="flex items-center gap-2">
            <Volume1 size={14} className="text-gray-400" />
            <Slider value={[clip.volume || 100]} onValueChange={([v]) => update('volume', v)} min={0} max={200} className="flex-1" />
            <span className="text-xs text-gray-400 w-8">{clip.volume || 100}%</span>
          </div>
        </div>
      )}
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

  const handleMouseDown = (e, caption, action) => {
    e.stopPropagation();
    onSelectCaption(caption);
    setDragging({ id: caption.id, action, startX: e.clientX, startY: e.clientY, initialX: caption.x || 50, initialY: caption.y || 85, initialSize: caption.fontSize || 24 });
  };

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
                  textDecoration: caption.underline ? 'underline' : 'none',
                  textAlign: caption.align || 'center',
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
      <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
        <SkipBack size={20} />
      </button>

      <button onClick={onPlayPause} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-white hover:bg-gray-200'}`}>
        {isPlaying ? <Pause size={28} className="text-white" /> : <Play size={28} className="text-gray-900 ml-1" />}
      </button>

      <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
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

function TimelineRuler({ totalDuration, pixelsPerSecond, currentTime, onSeek }) {
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

function TimelineTrack({ type, clips, pixelsPerSecond, totalDuration, currentTime, selectedClipId, onSelectClip, onUpdateClip }) {
  const colors = { video: '#059669', audio: '#4f46e5', caption: '#d97706' };
  const icons = { video: Image, audio: Mic, caption: Type };
  const Icon = icons[type];
  const color = colors[type];

  const [dragging, setDragging] = useState(null);

  const handleMouseDown = (e, clip, action) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setDragging({ id: clip.id, action, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration });
  };

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
      } else if (dragging.action === 'resize-left') {
        const newStart = Math.max(0, dragging.initialStart + delta);
        onUpdateClip({ ...clip, startTime: newStart, duration: Math.max(0.5, dragging.initialDuration - delta) });
      }
    };
    const handleMouseUp = () => setDragging(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, clips, pixelsPerSecond, onUpdateClip]);

  return (
    <div className="flex border-b border-gray-800">
      <div className="flex-shrink-0 bg-[#12121f] flex items-center justify-center" style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}>
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <Icon size={10} className="text-gray-400 ml-1" />
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
              <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => handleMouseDown(e, clip, 'resize-left')} />
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

export default function TimelineEditorV5() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  // State
  const [activePanel, setActivePanel] = useState('media');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(15);
  const [isMuted, setIsMuted] = useState(false);

  // Clips
  const [videoClips, setVideoClips] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [captionClips, setCaptionClips] = useState([]);

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
  // CALCULATE AUDIO BEAT DURATIONS FROM SCENES
  // Each scene has its own audio_duration that we need to respect
  // ═══════════════════════════════════════════════════════════════════

  const scenesWithAudioTiming = useMemo(() => {
    let offset = 0;
    return scenes.map(scene => {
      // Use scene's audio_duration if available, otherwise fall back to duration_seconds or estimate
      const audioDuration = scene.audio_duration || scene.duration_seconds || 5;
      const result = {
        ...scene,
        audioDuration: audioDuration,
        audioStartTime: offset,
        audioEndTime: offset + audioDuration
      };
      offset += audioDuration;
      return result;
    });
  }, [scenes]);

  const totalDuration = useMemo(() => {
    return scenesWithAudioTiming.reduce((sum, s) => sum + s.audioDuration, 0) || 60;
  }, [scenesWithAudioTiming]);

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZE CLIPS - Video clips start with default/scene duration
  // Audio clips show the correct audio beat durations
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (scenesWithAudioTiming.length === 0) return;

    // Video clips - initially may not be synced
    setVideoClips(scenesWithAudioTiming.map((scene, idx) => ({
      id: `video-${scene.id}`,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      type: 'video',
      // Initially use whatever duration is set, may need syncing
      startTime: scenesWithAudioTiming.slice(0, idx).reduce((sum, s) => sum + (s.duration_seconds || 5), 0),
      duration: scene.duration_seconds || 5,
      // Store the audio duration for reference
      audioDuration: scene.audioDuration,
      label: `Scene ${scene.scene_number}`,
      thumbnail: scene.image_url,
      effects: [],
      audioMuted: false,
      volume: 100,
      transition: null,
      synced: false
    })));

    // Audio clips - always show correct audio beat durations
    if (voiceoverUrl) {
      // Create individual audio beat clips per scene
      setAudioClips(scenesWithAudioTiming.map(scene => ({
        id: `audio-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'audio',
        startTime: scene.audioStartTime,
        duration: scene.audioDuration,
        label: `${scene.audioDuration.toFixed(1)}s`
      })));
    }
  }, [scenesWithAudioTiming, voiceoverUrl]);

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

  // Current scene based on video clips
  const currentScene = useMemo(() => {
    const currentClip = videoClips.find(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration);
    if (currentClip) {
      return scenes.find(s => s.id === currentClip.sceneId);
    }
    return null;
  }, [videoClips, currentTime, scenes]);

  // ═══════════════════════════════════════════════════════════════════
  // AUTOSYNC - MATCH VIDEO CLIPS TO AUDIO BEAT DURATIONS
  // ═══════════════════════════════════════════════════════════════════

  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      // First try backend sync
      const result = await base44.functions.invoke('syncMediaToAudio', { project_id: projectId });
      if (result?.success || result?.data?.success) {
        await refetchScenes();
        // After refetch, scenes will have updated durations
      }
    } catch (err) {
      console.log('Backend sync not available, using client-side sync');
    }

    // CLIENT-SIDE SYNC: Match each video clip to its audio beat duration
    // This is the key fix - each clip gets its scene's audio duration
    let offset = 0;
    const syncedVideoClips = scenesWithAudioTiming.map(scene => {
      const existingClip = videoClips.find(c => c.sceneId === scene.id);
      const audioDuration = scene.audioDuration; // The audio beat duration
      
      const syncedClip = {
        ...(existingClip || {}),
        id: `video-${scene.id}`,
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        type: 'video',
        startTime: offset,
        duration: audioDuration, // <- THIS IS THE KEY: match audio duration
        audioDuration: audioDuration,
        label: `Scene ${scene.scene_number}`,
        thumbnail: scene.image_url,
        effects: existingClip?.effects || [],
        audioMuted: existingClip?.audioMuted || false,
        volume: existingClip?.volume || 100,
        transition: existingClip?.transition || null,
        synced: true
      };
      
      offset += audioDuration;
      return syncedClip;
    });

    setVideoClips(syncedVideoClips);

    // Also regenerate captions to match new timing
    const newCaptions = [];
    scenesWithAudioTiming.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;
      
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDur = scene.audioDuration / Math.max(sentences.length, 1);
      
      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}-synced`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.audioStartTime + idx * sentenceDur,
          duration: sentenceDur,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 20) + '...',
          x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)',
          font: 'System', bold: false, italic: false, underline: false, align: 'center'
        });
      });
    });
    
    if (captionClips.length > 0) {
      setCaptionClips(newCaptions);
    }

    setSyncStatus('success');
    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Generate captions
  const handleGenerateCaptions = async (settings) => {
    setIsGeneratingCaptions(true);
    if (settings.deleteExisting) setCaptionClips([]);

    const newCaptions = [];
    scenesWithAudioTiming.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDur = scene.audioDuration / Math.max(sentences.length, 1);
      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}-${Date.now()}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.audioStartTime + idx * sentenceDur,
          duration: sentenceDur,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 20) + '...',
          x: 50, y: 85, fontSize: 20, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)',
          font: 'System', bold: false, italic: false, underline: false, align: 'center'
        });
      });
    });

    setCaptionClips(settings.deleteExisting ? newCaptions : [...captionClips, ...newCaptions]);
    setIsGeneratingCaptions(false);
  };

  // Effects & Transitions
  const handleApplyEffect = (effect) => {
    if (!selectedVideoClipId) return;
    setVideoClips(prev => prev.map(clip =>
      clip.id === selectedVideoClipId ? { ...clip, effects: [...(clip.effects || []), effect.id] } : clip
    ));
  };

  const handleApplyTransition = (transition, clipIndex) => {
    setVideoClips(prev => prev.map((clip, idx) =>
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

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      <TopToolbar activePanel={activePanel} onPanelChange={setActivePanel} />

      <div className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media' && <MediaPanel scenes={scenes} onSelectScene={(s) => handleSeek(scenesWithAudioTiming.find(x => x.id === s.id)?.audioStartTime || 0)} />}
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
              onUpdateCaption={(c) => setCaptionClips(prev => prev.map(x => x.id === c.id ? c : x))}
              orientation={project?.orientation || 'landscape'}
            />
          </div>

          <TransportControls
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            currentTime={currentTime}
            totalDuration={totalDuration}
            onSeek={handleSeek}
          />
        </div>

        {/* Right Panel */}
        <div className="w-64 flex-shrink-0 bg-[#12121f]">
          {selectedCaption ? (
            <TextPropertiesPanel caption={selectedCaption} onUpdate={(c) => setCaptionClips(prev => prev.map(x => x.id === c.id ? c : x))} />
          ) : selectedVideoClip ? (
            <ClipPropertiesPanel clip={selectedVideoClip} onUpdate={(c) => setVideoClips(prev => prev.map(x => x.id === c.id ? c : x))} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip or caption</div>
          )}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Undo2 size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Redo2 size={16} /></button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Scissors size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Copy size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Trash2 size={16} /></button>
        </div>

        {/* AUTOSYNC BUTTON */}
        <Button
          onClick={handleAutoSync}
          disabled={isSyncing}
          size="lg"
          className={`gap-2 px-6 py-2 text-sm font-medium shadow-lg ${
            syncStatus === 'success' ? 'bg-green-600 hover:bg-green-700' :
            'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
          }`}
        >
          {isSyncing ? (
            <><Loader2 size={18} className="animate-spin" /> Syncing...</>
          ) : syncStatus === 'success' ? (
            <><CheckCircle size={18} /> Synced!</>
          ) : (
            <><Wand2 size={18} /> AutoSync to Audio</>
          )}
        </Button>

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
        <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} currentTime={currentTime} onSeek={handleSeek} />
        {scenes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No scenes</div>
        ) : (
          <>
            <TimelineTrack type="video" clips={videoClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={selectedVideoClipId} onSelectClip={(id) => { setSelectedVideoClipId(id); setSelectedCaptionId(null); }} onUpdateClip={(c) => setVideoClips(prev => prev.map(x => x.id === c.id ? c : x))} />
            <TimelineTrack type="audio" clips={audioClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={null} onSelectClip={() => {}} onUpdateClip={() => {}} />
            <TimelineTrack type="caption" clips={captionClips} pixelsPerSecond={pixelsPerSecond} totalDuration={totalDuration} currentTime={currentTime} selectedClipId={selectedCaptionId} onSelectClip={(id) => { setSelectedCaptionId(id); setSelectedVideoClipId(null); }} onUpdateClip={(c) => setCaptionClips(prev => prev.map(x => x.id === c.id ? c : x))} />
          </>
        )}
      </div>
    </div>
  );
}
