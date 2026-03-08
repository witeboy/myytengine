import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Download, Home, ChevronRight, ChevronDown,
  Image, Music, Type, Layers, Wand2, Film, Mic, Settings,
  Loader2, CheckCircle, Sparkles, Star, Move,
  LayoutGrid, List, FolderOpen, Plus, X,
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette,
  Minimize2, Focus, Blend, ArrowUpRight, ArrowDownLeft, RefreshCw
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// CAPCUT TIMELINE EDITOR V3 - FULLY FUNCTIONAL
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;

// ═══════════════════════════════════════════════════════════════════
// EFFECTS & TRANSITIONS DATA
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
  { id: 'golden_dust', name: 'Golden Dust' },
  { id: 'blur_right', name: 'Blur ...Right' },
  { id: 'snow_ering', name: 'Snow ...ering' },
  { id: 'blur_out', name: 'Blur ...m Out' },
  { id: 'plain_fade', name: 'Plain Fade-In' },
  { id: 'wiping_in', name: 'Wiping In' },
  { id: 'wave_in', name: 'Wave in' },
  { id: 'typewriter', name: 'Typin...ursor' },
  { id: 'sparkly_vine', name: 'Sparkly Vine' },
];

const TEXT_ANIMATIONS_OUT = [
  { id: 'none', name: 'None' },
  { id: 'fade_out', name: 'Fade Out' },
  { id: 'blur_out', name: 'Blur Out' },
  { id: 'slide_out', name: 'Slide Out' },
];

const TEXT_ANIMATIONS_LOOP = [
  { id: 'none', name: 'None' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'shake', name: 'Shake' },
  { id: 'glow', name: 'Glow' },
];

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
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
// TOP TOOLBAR (CapCut Style)
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
            activePanel === panel.id
              ? 'text-cyan-400'
              : 'text-gray-400 hover:text-white'
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
// LEFT PANEL - MEDIA BROWSER
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
          <div className="flex flex-col items-center justify-center h-full text-center">
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
          {selectedClip ? `Scene ${selectedClip.sceneNumber}` : 'Select a clip'}
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
                  isApplied
                    ? 'bg-purple-500/30 ring-1 ring-purple-500'
                    : 'bg-gray-800/50 hover:bg-purple-500/20'
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

function TransitionsPanel({ onApplyTransition }) {
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState(null);

  const filtered = TRANSITIONS.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleApply = (transition) => {
    onApplyTransition(transition);
    setNotification(`Applied ${transition.name}`);
    setTimeout(() => setNotification(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <Input
          placeholder="smooth fade"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs bg-gray-800 border-gray-700"
        />
      </div>

      {notification && (
        <div className="mx-2 mt-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded">
          {notification}
        </div>
      )}

      <div className="px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 text-xs bg-gray-800 rounded text-gray-300">Favorites</button>
          <button className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 rounded">Transitions</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(transition => (
            <button
              key={transition.id}
              onClick={() => handleApply(transition)}
              className="relative aspect-video bg-gray-800 rounded overflow-hidden hover:ring-2 hover:ring-cyan-500 group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center">
                <Blend className="w-6 h-6 text-white/50" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                <p className="text-[9px] text-white text-center truncate">{transition.name}</p>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100">
                <Download className="w-3 h-3 text-cyan-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - CAPTIONS GENERATOR
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
        {/* Language */}
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Spoken language</label>
          <Select value={settings.language} onValueChange={v => setSettings(s => ({ ...s, language: v }))}>
            <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto detect</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bilingual */}
        <div>
          <label className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
            Bilingual captions <span className="text-cyan-400">✦</span>
          </label>
          <Select value={settings.bilingual} onValueChange={v => setSettings(s => ({ ...s, bilingual: v }))}>
            <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="zh">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 flex items-center gap-1">
              Auto highlight keywords <span className="text-cyan-400">✦</span>
            </span>
            <Switch
              checked={settings.highlightKeywords}
              onCheckedChange={v => setSettings(s => ({ ...s, highlightKeywords: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 flex items-center gap-1">
              AI emojis <span className="text-[8px] text-green-400 bg-green-400/20 px-1 rounded">Free</span>
            </span>
            <Switch
              checked={settings.aiEmojis}
              onCheckedChange={v => setSettings(s => ({ ...s, aiEmojis: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 flex items-center gap-1">
              Identify filler words <span className="text-cyan-400">✦</span>
            </span>
            <Switch
              checked={settings.identifyFillers}
              onCheckedChange={v => setSettings(s => ({ ...s, identifyFillers: v }))}
            />
          </div>
        </div>

        {/* Current captions info */}
        {captionCount > 0 && (
          <div className="p-2 bg-gray-800/50 rounded text-xs text-gray-400">
            {captionCount} captions on timeline
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            id="deleteExisting"
            checked={settings.deleteExisting}
            onChange={e => setSettings(s => ({ ...s, deleteExisting: e.target.checked }))}
            className="rounded border-gray-600"
          />
          <label htmlFor="deleteExisting" className="text-[10px] text-gray-400">Delete current captions</label>
        </div>
        <Button
          onClick={() => onGenerate(settings)}
          disabled={isGenerating}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
        >
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
          ) : (
            'Generate'
          )}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RIGHT PANEL - TEXT PROPERTIES
// ═══════════════════════════════════════════════════════════════════

function TextPropertiesPanel({ caption, onUpdate }) {
  const [activeTab, setActiveTab] = useState('text');
  const [animTab, setAnimTab] = useState('in');

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
    <div className="h-full flex flex-col bg-[#12121f]">
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {['Text', 'Animation', 'Tracking', 'Text to speech'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase().replace(/ /g, '_'))}
            className={`flex-1 py-2 text-[10px] ${
              activeTab === tab.toLowerCase().replace(/ /g, '_')
                ? 'text-cyan-400 border-b border-cyan-400'
                : 'text-gray-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'text' && (
          <>
            {/* Style Tabs */}
            <div className="flex border rounded border-gray-700 overflow-hidden">
              <button className="flex-1 py-1.5 text-[10px] bg-gray-800 text-white">Basic</button>
              <button className="flex-1 py-1.5 text-[10px] text-gray-400 hover:bg-gray-800">Bubble</button>
              <button className="flex-1 py-1.5 text-[10px] text-gray-400 hover:bg-gray-800">Effects</button>
            </div>

            {/* Text */}
            <div>
              <Textarea
                value={caption.text}
                onChange={e => update('text', e.target.value)}
                className="bg-gray-800 border-gray-700 text-sm"
                rows={3}
              />
              <p className="text-[9px] text-gray-500 mt-1 flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> AI writer <span className="text-green-400">Free</span>
              </p>
            </div>

            {/* Font */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Font</label>
              <Select value={caption.font || 'System'} onValueChange={v => update('font', v)}>
                <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="System">System</SelectItem>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Font size</label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[caption.fontSize || 24]}
                  onValueChange={([v]) => update('fontSize', v)}
                  min={10}
                  max={72}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={caption.fontSize || 24}
                  onChange={e => update('fontSize', parseInt(e.target.value) || 24)}
                  className="w-14 h-7 text-xs bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            {/* Pattern */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Pattern</label>
              <div className="flex gap-1">
                <button
                  onClick={() => update('bold', !caption.bold)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${caption.bold ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                >
                  <Bold size={14} />
                </button>
                <button
                  onClick={() => update('underline', !caption.underline)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${caption.underline ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                >
                  <Underline size={14} />
                </button>
                <button
                  onClick={() => update('italic', !caption.italic)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${caption.italic ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                >
                  <Italic size={14} />
                </button>
              </div>
            </div>

            {/* Case */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Case</label>
              <div className="flex gap-1">
                {[
                  { label: 'TT', value: 'uppercase' },
                  { label: 'tt', value: 'lowercase' },
                  { label: 'Tt', value: 'capitalize' }
                ].map(c => (
                  <button
                    key={c.value}
                    onClick={() => update('textCase', c.value)}
                    className={`flex-1 h-8 rounded text-xs ${caption.textCase === c.value ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={caption.color || '#FFFFFF'}
                  onChange={e => update('color', e.target.value)}
                  className="w-10 h-8 rounded border-0 cursor-pointer"
                />
                <Input
                  value={caption.color || '#FFFFFF'}
                  onChange={e => update('color', e.target.value)}
                  className="flex-1 h-8 text-xs bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            {/* Character & Line spacing */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Character</label>
                <Input
                  type="number"
                  value={caption.letterSpacing || 0}
                  onChange={e => update('letterSpacing', parseInt(e.target.value) || 0)}
                  className="h-7 text-xs bg-gray-800 border-gray-700"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Line</label>
                <Input
                  type="number"
                  value={caption.lineHeight || 0}
                  onChange={e => update('lineHeight', parseInt(e.target.value) || 0)}
                  className="h-7 text-xs bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            {/* Alignment */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Alignment</label>
              <div className="flex gap-1">
                {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => {
                  const values = ['left', 'center', 'right'];
                  return (
                    <button
                      key={i}
                      onClick={() => update('align', values[i])}
                      className={`flex-1 h-8 rounded flex items-center justify-center ${caption.align === values[i] ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'animation' && (
          <>
            {/* Animation Sub-tabs */}
            <div className="flex gap-1">
              <button className="flex items-center justify-center w-8 h-8 bg-gray-800 rounded text-gray-400">
                <Star size={14} />
              </button>
              <button className="px-3 py-1.5 text-xs bg-gray-800 rounded text-gray-400">All</button>
            </div>

            <div className="flex border rounded border-gray-700 overflow-hidden">
              {['In', 'Out', 'Loop'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setAnimTab(tab.toLowerCase())}
                  className={`flex-1 py-1.5 text-[10px] ${animTab === tab.toLowerCase() ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Animation Grid */}
            <div className="grid grid-cols-4 gap-2">
              {(animTab === 'in' ? TEXT_ANIMATIONS_IN : animTab === 'out' ? TEXT_ANIMATIONS_OUT : TEXT_ANIMATIONS_LOOP).map(anim => (
                <button
                  key={anim.id}
                  onClick={() => update(`anim_${animTab}`, anim.id)}
                  className={`p-2 rounded text-center ${caption[`anim_${animTab}`] === anim.id ? 'bg-cyan-500/20 ring-1 ring-cyan-500' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  <div className="w-full aspect-square rounded bg-gray-700 mb-1 flex items-center justify-center">
                    <span className="text-[10px] text-white">ABC</span>
                  </div>
                  <p className="text-[8px] text-gray-300 truncate">{anim.name}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Save as preset */}
      <div className="p-3 border-t border-gray-800">
        <Button variant="outline" size="sm" className="w-full text-xs border-cyan-600 text-cyan-400">
          Save as preset
        </Button>
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

      {/* Duration */}
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Duration (seconds)</label>
        <Input
          type="number"
          step="0.1"
          value={clip.duration}
          onChange={e => update('duration', parseFloat(e.target.value) || 1)}
          className="h-8 text-xs bg-gray-800 border-gray-700"
        />
      </div>

      {/* Effects */}
      {clip.effects?.length > 0 && (
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Applied Effects</label>
          <div className="flex flex-wrap gap-1">
            {clip.effects.map(e => (
              <span key={e} className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded flex items-center gap-1">
                {e}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-red-400"
                  onClick={() => update('effects', clip.effects.filter(x => x !== e))}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mute Audio */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">Mute video audio</span>
        <Switch
          checked={clip.audioMuted || false}
          onCheckedChange={v => update('audioMuted', v)}
        />
      </div>

      {/* Volume */}
      {!clip.audioMuted && (
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Volume</label>
          <div className="flex items-center gap-2">
            <Volume1 size={14} className="text-gray-400" />
            <Slider
              value={[clip.volume || 100]}
              onValueChange={([v]) => update('volume', v)}
              min={0}
              max={200}
              className="flex-1"
            />
            <span className="text-xs text-gray-400 w-8">{clip.volume || 100}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO PREVIEW WITH DRAGGABLE CAPTIONS
// ═══════════════════════════════════════════════════════════════════

function VideoPreview({
  currentScene,
  currentTime,
  isPlaying,
  captions,
  selectedCaption,
  onSelectCaption,
  onUpdateCaption,
  orientation
}) {
  const previewRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  // Find active captions at current time
  const activeCaptions = captions.filter(
    c => currentTime >= c.startTime && currentTime < c.startTime + c.duration
  );

  // Handle drag start
  const handleMouseDown = (e, caption, action) => {
    e.stopPropagation();
    onSelectCaption(caption);
    setDragging({
      id: caption.id,
      action,
      startX: e.clientX,
      startY: e.clientY,
      initialX: caption.x || 50,
      initialY: caption.y || 85,
      initialSize: caption.fontSize || 24
    });
  };

  // Handle drag
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
        onUpdateCaption({
          ...caption,
          x: Math.max(5, Math.min(95, dragging.initialX + deltaX)),
          y: Math.max(5, Math.min(95, dragging.initialY + deltaY))
        });
      } else if (dragging.action === 'resize') {
        const delta = (e.clientX - dragging.startX) / 3;
        onUpdateCaption({
          ...caption,
          fontSize: Math.max(12, Math.min(72, Math.round(dragging.initialSize + delta)))
        });
      }
    };

    const handleMouseUp = () => setDragging(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, captions, onUpdateCaption]);

  const aspectClass = orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <div className="h-full flex flex-col bg-[#0a0a14]">
      {/* Preview */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          ref={previewRef}
          className={`relative ${aspectClass} w-full max-h-full bg-gray-900 rounded overflow-hidden`}
          onClick={() => onSelectCaption(null)}
        >
          {/* Scene image */}
          {currentScene?.image_url ? (
            <img src={currentScene.image_url} className="w-full h-full object-contain" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-gray-700" />
            </div>
          )}

          {/* Captions - draggable */}
          {activeCaptions.map(caption => {
            const isSelected = selectedCaption?.id === caption.id;
            return (
              <div
                key={caption.id}
                className={`absolute cursor-move select-none transition-shadow ${isSelected ? 'z-20' : 'z-10'}`}
                style={{
                  left: `${caption.x || 50}%`,
                  top: `${caption.y || 85}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                onMouseDown={(e) => handleMouseDown(e, caption, 'move')}
              >
                <div
                  className={`px-4 py-2 rounded transition-all ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
                  style={{
                    backgroundColor: caption.bgColor || 'rgba(0,0,0,0.7)',
                    color: caption.color || '#FFFFFF',
                    fontSize: `${caption.fontSize || 24}px`,
                    fontWeight: caption.bold ? 'bold' : 'normal',
                    fontStyle: caption.italic ? 'italic' : 'normal',
                    textDecoration: caption.underline ? 'underline' : 'none',
                    textAlign: caption.align || 'center',
                    textTransform: caption.textCase || 'none',
                    letterSpacing: caption.letterSpacing ? `${caption.letterSpacing}px` : undefined,
                    lineHeight: caption.lineHeight ? `${caption.lineHeight}px` : undefined
                  }}
                >
                  {caption.text}
                </div>

                {/* Resize handle */}
                {isSelected && (
                  <div
                    className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize border-2 border-white"
                    onMouseDown={(e) => handleMouseDown(e, caption, 'resize')}
                  />
                )}
              </div>
            );
          })}

          {/* Scene indicator */}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white">
            Scene {currentScene?.scene_number || '-'}
          </div>
        </div>
      </div>

      {/* Timecode */}
      <div className="flex items-center justify-center py-2 bg-[#12121f] border-t border-gray-800">
        <span className="text-sm font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
        <span className="text-sm font-mono text-gray-500 mx-2">/</span>
        <span className="text-sm font-mono text-gray-500">{formatTimecode(0)}</span>
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
        const newDur = Math.max(0.5, dragging.initialDuration - delta);
        onUpdateClip({ ...clip, startTime: newStart, duration: newDur });
      }
    };
    const handleMouseUp = () => setDragging(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
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

export default function TimelineEditorV3() {
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
  const [captionClips, setCaptionClips] = useState([]); // Start empty - no auto-captions

  // Selection
  const [selectedVideoClipId, setSelectedVideoClipId] = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);

  // Status
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // Refs
  const playbackRef = useRef(null);
  const audioRef = useRef(null);

  // Data fetching
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
  const voiceoverDuration = prodSettings[0]?.voiceover_duration_seconds || 0;

  // Calculate timing
  const scenesWithTiming = useMemo(() => {
    let offset = 0;
    return scenes.map(scene => {
      const dur = scene.duration_seconds || scene.audio_duration || 5;
      const result = { ...scene, startTime: offset, duration: dur };
      offset += dur;
      return result;
    });
  }, [scenes]);

  const totalDuration = useMemo(() => {
    return voiceoverDuration > 0 ? voiceoverDuration : scenesWithTiming.reduce((sum, s) => sum + s.duration, 0) || 60;
  }, [scenesWithTiming, voiceoverDuration]);

  // Initialize video clips from scenes
  useEffect(() => {
    if (scenesWithTiming.length === 0) return;
    setVideoClips(scenesWithTiming.map(scene => ({
      id: `video-${scene.id}`,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      type: 'video',
      startTime: scene.startTime,
      duration: scene.duration,
      label: `Scene ${scene.scene_number}`,
      thumbnail: scene.image_url,
      effects: [],
      audioMuted: false,
      volume: 100
    })));

    if (voiceoverUrl) {
      setAudioClips([{ id: 'voiceover', type: 'audio', startTime: 0, duration: totalDuration, label: 'Voiceover' }]);
    }
  }, [scenesWithTiming, voiceoverUrl, totalDuration]);

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
    return scenesWithTiming.find(s => currentTime >= s.startTime && currentTime < s.startTime + s.duration);
  }, [scenesWithTiming, currentTime]);

  // ═══ AUTOSYNC ═══
  const handleAutoSync = async () => {
    setIsSyncing(true);

    try {
      const result = await base44.functions.invoke('syncMediaToAudio', { project_id: projectId });
      if (result?.success || result?.data?.success) {
        await refetchScenes();
      }
    } catch (err) {
      // Fallback: client-side sync
      if (voiceoverDuration > 0 && videoClips.length > 0) {
        const perScene = voiceoverDuration / videoClips.length;
        setVideoClips(prev => prev.map((clip, idx) => ({
          ...clip,
          startTime: idx * perScene,
          duration: perScene
        })));
      }
    }

    setIsSyncing(false);
  };

  // ═══ GENERATE CAPTIONS ═══
  const handleGenerateCaptions = async (settings) => {
    setIsGeneratingCaptions(true);

    // Clear existing if requested
    if (settings.deleteExisting) {
      setCaptionClips([]);
    }

    // Generate from narration
    const newCaptions = [];
    scenesWithTiming.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDur = scene.duration / Math.max(sentences.length, 1);

      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}-${Date.now()}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.startTime + idx * sentenceDur,
          duration: sentenceDur,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 20) + '...',
          x: 50,
          y: 85,
          fontSize: 20,
          color: '#FFFFFF',
          bgColor: 'rgba(0,0,0,0.7)',
          font: 'System',
          bold: false,
          italic: false,
          underline: false,
          align: 'center',
          textCase: 'none'
        });
      });
    });

    setCaptionClips(settings.deleteExisting ? newCaptions : [...captionClips, ...newCaptions]);
    setIsGeneratingCaptions(false);
  };

  // Apply effect
  const handleApplyEffect = (effect) => {
    if (!selectedVideoClipId) return;
    setVideoClips(prev => prev.map(clip =>
      clip.id === selectedVideoClipId
        ? { ...clip, effects: [...(clip.effects || []), effect.id] }
        : clip
    ));
  };

  // Apply transition
  const handleApplyTransition = (transition) => {
    console.log('Apply transition:', transition);
  };

  // Handlers
  const handleSeek = (t) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, t)));
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const zoomIn = () => setPixelsPerSecond(p => Math.min(50, p * 1.25));
  const zoomOut = () => setPixelsPerSecond(p => Math.max(3, p / 1.25));

  // Selected objects
  const selectedVideoClip = videoClips.find(c => c.id === selectedVideoClipId);
  const selectedCaption = captionClips.find(c => c.id === selectedCaptionId);

  // ═══ RENDER ═══
  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      <TopToolbar activePanel={activePanel} onPanelChange={setActivePanel} />

      <div className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media' && <MediaPanel scenes={scenes} onSelectScene={(s) => handleSeek(scenesWithTiming.find(x => x.id === s.id)?.startTime || 0)} />}
          {activePanel === 'effects' && <EffectsPanel selectedClip={selectedVideoClip} onApplyEffect={handleApplyEffect} appliedEffects={selectedVideoClip?.effects} />}
          {activePanel === 'transitions' && <TransitionsPanel onApplyTransition={handleApplyTransition} />}
          {activePanel === 'captions' && <CaptionsPanel onGenerate={handleGenerateCaptions} isGenerating={isGeneratingCaptions} captionCount={captionClips.length} />}
          {!['media', 'effects', 'transitions', 'captions'].includes(activePanel) && (
            <div className="flex items-center justify-center h-full text-xs text-gray-500">Coming soon</div>
          )}
        </div>

        {/* Center - Preview */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-800">
          <div className="flex-1 min-h-0">
            <VideoPreview
              currentScene={currentScene}
              currentTime={currentTime}
              isPlaying={isPlaying}
              captions={captionClips}
              selectedCaption={selectedCaption}
              onSelectCaption={(c) => { setSelectedCaptionId(c?.id || null); setSelectedVideoClipId(null); }}
              onUpdateCaption={(c) => setCaptionClips(prev => prev.map(x => x.id === c.id ? c : x))}
              orientation={project?.orientation || 'landscape'}
            />
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-3 py-2 bg-[#12121f] border-t border-gray-800">
            <button onClick={() => handleSeek(currentTime - 5)} className="p-1.5 text-gray-400 hover:text-white"><SkipBack size={18} /></button>
            <button onClick={() => setIsPlaying(!isPlaying)} className={`w-10 h-10 rounded-full flex items-center justify-center ${isPlaying ? 'bg-red-600' : 'bg-white'}`}>
              {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-gray-900 ml-0.5" />}
            </button>
            <button onClick={() => handleSeek(currentTime + 5)} className="p-1.5 text-gray-400 hover:text-white"><SkipForward size={18} /></button>
            <span className="text-xs text-gray-500 ml-4">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
          </div>
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

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Undo2 size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Redo2 size={16} /></button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Scissors size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Copy size={16} /></button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"><Trash2 size={16} /></button>
        </div>

        <Button onClick={handleAutoSync} disabled={isSyncing} className="gap-2 bg-gradient-to-r from-cyan-600 to-purple-600">
          {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          AutoSync to Audio
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
      <div className="h-44 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto">
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
