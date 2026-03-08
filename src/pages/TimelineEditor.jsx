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
  Download, Home, ChevronRight, ChevronDown, ChevronUp,
  Image, Music, Type, Layers, Wand2, Film, Mic, Settings,
  Loader2, CheckCircle, AlertCircle, Sparkles, Star, Move,
  LayoutGrid, List, FolderOpen, Plus, GripVertical, X,
  SplitSquareHorizontal, Maximize, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette, RotateCcw,
  Minimize2, Maximize2, Eye, EyeOff, Lock, Unlock,
  ArrowUpRight, ArrowDownLeft, ZoomInIcon, Focus, Blend
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// CAPCUT-STYLE TIMELINE EDITOR V2 - FULL FEATURED
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;
const CAPTION_TRACK_HEIGHT = 48;

// ═══════════════════════════════════════════════════════════════════
// EFFECTS DATA
// ═══════════════════════════════════════════════════════════════════

const EFFECTS_LIST = [
  { id: 'ken_burns', name: 'Ken Burns', icon: Move, description: 'Slow zoom & pan' },
  { id: 'zoom_in', name: 'Zoom In', icon: ZoomIn, description: 'Gradual zoom in' },
  { id: 'zoom_out', name: 'Zoom Out', icon: Minimize2, description: 'Gradual zoom out' },
  { id: 'pan_left', name: 'Pan Left', icon: ArrowUpRight, description: 'Camera pans left' },
  { id: 'pan_right', name: 'Pan Right', icon: ArrowDownLeft, description: 'Camera pans right' },
  { id: 'fade', name: 'Fade', icon: Blend, description: 'Fade in/out' },
  { id: 'blur', name: 'Blur', icon: Focus, description: 'Blur effect' },
  { id: 'glow', name: 'Glow', icon: Sparkles, description: 'Soft glow' },
];

const TRANSITIONS_LIST = [
  { id: 'cut', name: 'Cut', duration: 0 },
  { id: 'fade', name: 'Fade', duration: 0.5 },
  { id: 'dissolve', name: 'Dissolve', duration: 0.8 },
  { id: 'wipe_left', name: 'Wipe Left', duration: 0.5 },
  { id: 'wipe_right', name: 'Wipe Right', duration: 0.5 },
  { id: 'zoom_in', name: 'Zoom In', duration: 0.6 },
  { id: 'zoom_out', name: 'Zoom Out', duration: 0.6 },
  { id: 'slide_up', name: 'Slide Up', duration: 0.5 },
  { id: 'blur_transition', name: 'Blur', duration: 0.7 },
];

const TEXT_ANIMATIONS = {
  in: [
    { id: 'none', name: 'None' },
    { id: 'fade_in', name: 'Fade In' },
    { id: 'slide_up', name: 'Slide Up' },
    { id: 'slide_down', name: 'Slide Down' },
    { id: 'zoom_in', name: 'Zoom In' },
    { id: 'typewriter', name: 'Typewriter' },
    { id: 'wave', name: 'Wave' },
    { id: 'bounce', name: 'Bounce' },
  ],
  out: [
    { id: 'none', name: 'None' },
    { id: 'fade_out', name: 'Fade Out' },
    { id: 'slide_up', name: 'Slide Up' },
    { id: 'slide_down', name: 'Slide Down' },
    { id: 'zoom_out', name: 'Zoom Out' },
  ],
  loop: [
    { id: 'none', name: 'None' },
    { id: 'pulse', name: 'Pulse' },
    { id: 'shake', name: 'Shake' },
    { id: 'glow', name: 'Glow' },
    { id: 'bounce', name: 'Bounce' },
  ]
};

const CAPTION_STYLES = [
  { id: 'default', name: 'Default', bg: 'rgba(0,0,0,0.8)', color: '#FFFFFF' },
  { id: 'bold', name: 'Bold', bg: 'rgba(0,0,0,0.9)', color: '#FFFF00' },
  { id: 'minimal', name: 'Minimal', bg: 'transparent', color: '#FFFFFF' },
  { id: 'tiktok', name: 'TikTok', bg: 'transparent', color: '#FFFFFF', shadow: true },
  { id: 'netflix', name: 'Netflix', bg: 'rgba(0,0,0,0.7)', color: '#FFFFFF' },
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
// TOP TOOLBAR (Like CapCut)
// ═══════════════════════════════════════════════════════════════════

function TopToolbar({ activePanel, onPanelChange }) {
  const panels = [
    { id: 'media', label: 'Media', icon: Image },
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
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[#1a1a2e] border-b border-gray-800">
      {panels.map(panel => (
        <button
          key={panel.id}
          onClick={() => onPanelChange(panel.id)}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded transition-all ${
            activePanel === panel.id
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <panel.icon size={18} />
          <span className="text-[10px]">{panel.label}</span>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - MEDIA BROWSER
// ═══════════════════════════════════════════════════════════════════

function MediaBrowserPanel({ scenes, onSelectScene }) {
  const [viewMode, setViewMode] = useState('grid');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400">{scenes.length} items</span>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 rounded ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500'}`}
          >
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

function EffectsPanel({ selectedClip, onApplyEffect }) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs text-gray-400">
          {selectedClip ? `Apply to Scene ${selectedClip.sceneNumber}` : 'Select a clip first'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {EFFECTS_LIST.map(effect => (
            <button
              key={effect.id}
              onClick={() => onApplyEffect(effect)}
              disabled={!selectedClip}
              className="flex flex-col items-center gap-1 p-3 bg-gray-800/50 rounded-lg hover:bg-purple-500/20 hover:ring-1 hover:ring-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <effect.icon className="w-5 h-5 text-purple-400" />
              <span className="text-[10px] text-gray-300">{effect.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL - TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

function TransitionsPanel({ scenes, onApplyTransition }) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <Input
          placeholder="Search transitions..."
          className="h-7 text-xs bg-gray-800 border-gray-700"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {TRANSITIONS_LIST.map(transition => (
            <button
              key={transition.id}
              onClick={() => onApplyTransition(transition)}
              className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-cyan-500 transition-all group"
            >
              {/* Preview thumbnail - would be actual preview in production */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center">
                <Blend className="w-6 h-6 text-white/50" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                <p className="text-[9px] text-white text-center">{transition.name}</p>
              </div>
              {/* Download/Apply indicator */}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

function CaptionsPanel({ projectId, onGenerate, isGenerating, captions }) {
  const [settings, setSettings] = useState({
    language: 'auto',
    bilingual: 'none',
    highlightKeywords: true,
    aiEmojis: false,
    identifyFillers: true,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs font-medium text-white">Caption Settings</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Spoken Language */}
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
              <SelectItem value="de">German</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bilingual Captions */}
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

        {/* Toggle Options */}
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
              AI emojis <span className="text-[9px] text-green-400 bg-green-400/20 px-1 rounded">Free</span>
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

        {/* Existing Captions Info */}
        {captions.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400">{captions.length} captions generated</p>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" id="deleteCurrent" className="rounded border-gray-600" />
          <label htmlFor="deleteCurrent" className="text-[10px] text-gray-400">Delete current captions</label>
        </div>
        <Button
          onClick={() => onGenerate(settings)}
          disabled={isGenerating}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
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
// RIGHT PANEL - TEXT/CAPTION PROPERTIES
// ═══════════════════════════════════════════════════════════════════

function TextPropertiesPanel({ caption, onUpdate }) {
  const [activeTab, setActiveTab] = useState('text'); // text | animation | tracking
  const [animationTab, setAnimationTab] = useState('in'); // in | out | loop

  if (!caption) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-gray-500">Select a caption to edit</p>
      </div>
    );
  }

  const updateCaption = (key, value) => {
    onUpdate({ ...caption, [key]: value });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {['Text', 'Animation', 'Tracking', 'Text to speech'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '_'))}
            className={`flex-1 py-2 text-xs transition-colors ${
              activeTab === tab.toLowerCase().replace(' ', '_')
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'text' && (
          <>
            {/* Caption Text */}
            <div>
              <Textarea
                value={caption.text}
                onChange={e => updateCaption('text', e.target.value)}
                className="bg-gray-800 border-gray-700 text-sm resize-none"
                rows={3}
              />
              <p className="text-[9px] text-gray-500 mt-1 flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> AI writer <span className="text-green-400">Free</span>
              </p>
            </div>

            {/* Style Tabs */}
            <div className="flex border rounded-lg border-gray-700 overflow-hidden">
              <button className="flex-1 py-1.5 text-xs bg-gray-800 text-white">Basic</button>
              <button className="flex-1 py-1.5 text-xs text-gray-400 hover:bg-gray-800">Bubble</button>
              <button className="flex-1 py-1.5 text-xs text-gray-400 hover:bg-gray-800">Effects</button>
            </div>

            {/* Font */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Font</label>
              <Select value={caption.font || 'system'} onValueChange={v => updateCaption('font', v)}>
                <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="roboto">Roboto</SelectItem>
                  <SelectItem value="montserrat">Montserrat</SelectItem>
                  <SelectItem value="poppins">Poppins</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Font size</label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[caption.fontSize || 24]}
                  onValueChange={([v]) => updateCaption('fontSize', v)}
                  min={8}
                  max={72}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={caption.fontSize || 24}
                  onChange={e => updateCaption('fontSize', parseInt(e.target.value))}
                  className="w-14 h-7 text-xs bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            {/* Pattern (Bold, Underline, Italic) */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Pattern</label>
              <div className="flex gap-1">
                <button
                  onClick={() => updateCaption('bold', !caption.bold)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${caption.bold ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                >
                  <Bold size={14} />
                </button>
                <button
                  onClick={() => updateCaption('underline', !caption.underline)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${caption.underline ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                >
                  <Underline size={14} />
                </button>
                <button
                  onClick={() => updateCaption('italic', !caption.italic)}
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
                {['TT', 'tt', 'Tt'].map((c, i) => (
                  <button
                    key={c}
                    onClick={() => updateCaption('textCase', ['upper', 'lower', 'capitalize'][i])}
                    className={`flex-1 h-8 rounded text-xs ${caption.textCase === ['upper', 'lower', 'capitalize'][i] ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                  >
                    {c}
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
                  onChange={e => updateCaption('color', e.target.value)}
                  className="w-10 h-8 rounded border-0 cursor-pointer"
                />
                <Input
                  value={caption.color || '#FFFFFF'}
                  onChange={e => updateCaption('color', e.target.value)}
                  className="flex-1 h-8 text-xs bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            {/* Alignment */}
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Alignment</label>
              <div className="flex gap-1">
                {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => (
                  <button
                    key={i}
                    onClick={() => updateCaption('align', ['left', 'center', 'right'][i])}
                    className={`flex-1 h-8 rounded flex items-center justify-center ${caption.align === ['left', 'center', 'right'][i] ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'animation' && (
          <>
            {/* Animation Sub-tabs */}
            <div className="flex gap-1 p-1 bg-gray-800 rounded-lg">
              {['In', 'Out', 'Loop'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setAnimationTab(tab.toLowerCase())}
                  className={`flex-1 py-1.5 text-xs rounded ${animationTab === tab.toLowerCase() ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Animation Options */}
            <div className="grid grid-cols-3 gap-2">
              {TEXT_ANIMATIONS[animationTab].map(anim => (
                <button
                  key={anim.id}
                  onClick={() => updateCaption(`animation_${animationTab}`, anim.id)}
                  className={`p-2 rounded-lg text-center ${caption[`animation_${animationTab}`] === anim.id ? 'bg-cyan-500/20 ring-1 ring-cyan-500' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  <div className="w-8 h-8 mx-auto mb-1 rounded bg-gray-700 flex items-center justify-center text-[10px] text-white">
                    Aa
                  </div>
                  <p className="text-[9px] text-gray-300">{anim.name}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Save as preset */}
      <div className="p-3 border-t border-gray-800">
        <Button variant="outline" size="sm" className="w-full text-xs border-gray-700">
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
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-gray-500">Select a clip to edit</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-xs font-medium text-white">Scene {clip.sceneNumber}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Duration */}
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              value={clip.duration}
              onChange={e => onUpdate({ ...clip, duration: parseFloat(e.target.value) })}
              className="flex-1 h-8 text-xs bg-gray-800 border-gray-700"
            />
            <span className="text-xs text-gray-400">sec</span>
          </div>
        </div>

        {/* Effects Applied */}
        {clip.effects && clip.effects.length > 0 && (
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Effects Applied</label>
            <div className="flex flex-wrap gap-1">
              {clip.effects.map(effect => (
                <span key={effect} className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                  {effect}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mute Audio (for video clips) */}
        {clip.type === 'video' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Mute audio</span>
            <Switch
              checked={clip.audioMuted}
              onCheckedChange={v => onUpdate({ ...clip, audioMuted: v })}
            />
          </div>
        )}

        {/* Volume (for audio clips) */}
        {(clip.type === 'audio' || !clip.audioMuted) && (
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Volume</label>
            <div className="flex items-center gap-2">
              <Volume1 size={14} className="text-gray-400" />
              <Slider
                value={[clip.volume || 100]}
                onValueChange={([v]) => onUpdate({ ...clip, volume: v })}
                min={0}
                max={200}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-gray-400 w-8">{clip.volume || 100}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO PREVIEW WITH CAPTIONS
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
  const [dragging, setDragging] = useState(null); // { id, type: 'move' | 'resize', startX, startY }

  // Find active caption
  const activeCaption = captions.find(
    c => currentTime >= c.startTime && currentTime < c.startTime + c.duration
  );

  // Handle caption drag to resize/move
  const handleMouseDown = (e, caption, type) => {
    e.stopPropagation();
    onSelectCaption(caption);
    setDragging({
      id: caption.id,
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialX: caption.x || 50,
      initialY: caption.y || 85,
      initialSize: caption.fontSize || 24
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;

      const caption = captions.find(c => c.id === dragging.id);
      if (!caption) return;

      if (dragging.type === 'move') {
        const deltaX = ((e.clientX - dragging.startX) / rect.width) * 100;
        const deltaY = ((e.clientY - dragging.startY) / rect.height) * 100;
        onUpdateCaption({
          ...caption,
          x: Math.max(0, Math.min(100, dragging.initialX + deltaX)),
          y: Math.max(0, Math.min(100, dragging.initialY + deltaY))
        });
      } else if (dragging.type === 'resize') {
        const delta = e.clientX - dragging.startX;
        const newSize = Math.max(12, Math.min(72, dragging.initialSize + delta / 5));
        onUpdateCaption({ ...caption, fontSize: Math.round(newSize) });
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
      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div 
          ref={previewRef}
          className={`relative ${aspectClass} w-full max-h-full bg-gray-900 rounded overflow-hidden`}
          onClick={() => onSelectCaption(null)}
        >
          {/* Current frame */}
          {currentScene?.image_url ? (
            <img
              src={currentScene.image_url}
              className="w-full h-full object-contain"
              alt=""
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-gray-700" />
            </div>
          )}

          {/* Captions - draggable and resizable */}
          {activeCaption && (
            <div
              className={`absolute cursor-move select-none ${
                selectedCaption?.id === activeCaption.id ? 'ring-2 ring-cyan-400' : ''
              }`}
              style={{
                left: `${activeCaption.x || 50}%`,
                top: `${activeCaption.y || 85}%`,
                transform: 'translate(-50%, -50%)',
                maxWidth: '90%'
              }}
              onMouseDown={(e) => handleMouseDown(e, activeCaption, 'move')}
            >
              <div
                className="px-4 py-2 rounded"
                style={{
                  backgroundColor: activeCaption.bgColor || 'rgba(0,0,0,0.8)',
                  color: activeCaption.color || '#FFFFFF',
                  fontSize: `${activeCaption.fontSize || 24}px`,
                  fontWeight: activeCaption.bold ? 'bold' : 'normal',
                  fontStyle: activeCaption.italic ? 'italic' : 'normal',
                  textDecoration: activeCaption.underline ? 'underline' : 'none',
                  textAlign: activeCaption.align || 'center',
                  textTransform: activeCaption.textCase === 'upper' ? 'uppercase' : activeCaption.textCase === 'lower' ? 'lowercase' : 'none',
                  textShadow: activeCaption.shadow ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                }}
              >
                {activeCaption.text}
              </div>

              {/* Resize handle */}
              {selectedCaption?.id === activeCaption.id && (
                <div
                  className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize"
                  onMouseDown={(e) => handleMouseDown(e, activeCaption, 'resize')}
                />
              )}
            </div>
          )}

          {/* Scene number overlay */}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white">
            Scene {currentScene?.scene_number || '-'}
          </div>
        </div>
      </div>

      {/* Timecode */}
      <div className="flex items-center justify-center gap-4 py-2 bg-[#12121f] border-t border-gray-800">
        <span className="text-sm font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
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

  for (let t = 0; t <= totalDuration; t += interval) {
    markers.push(t);
  }

  return (
    <div
      className="h-5 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer"
      style={{ width: totalDuration * pixelsPerSecond, marginLeft: LABEL_WIDTH }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        onSeek(Math.max(0, Math.min(totalDuration, x / pixelsPerSecond)));
      }}
    >
      {markers.map(t => (
        <div
          key={t}
          className="absolute bottom-0"
          style={{ left: t * pixelsPerSecond }}
        >
          <span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE TRACK
// ═══════════════════════════════════════════════════════════════════

function TimelineTrack({
  type,
  clips,
  pixelsPerSecond,
  totalDuration,
  currentTime,
  selectedClipId,
  onSelectClip,
  onUpdateClip
}) {
  const colors = {
    video: '#059669',
    audio: '#4f46e5',
    caption: '#d97706'
  };

  const icons = {
    video: Image,
    audio: Mic,
    caption: Type
  };

  const Icon = icons[type];
  const color = colors[type];
  const height = type === 'caption' ? CAPTION_TRACK_HEIGHT : TRACK_HEIGHT;

  // Drag state
  const [dragging, setDragging] = useState(null);

  const handleMouseDown = (e, clip, action) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setDragging({
      id: clip.id,
      action, // 'move', 'resize-left', 'resize-right'
      startX: e.clientX,
      initialStart: clip.startTime,
      initialDuration: clip.duration
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragging.startX;
      const deltaTime = deltaX / pixelsPerSecond;

      const clip = clips.find(c => c.id === dragging.id);
      if (!clip) return;

      if (dragging.action === 'move') {
        const newStart = Math.max(0, dragging.initialStart + deltaTime);
        onUpdateClip({ ...clip, startTime: newStart });
      } else if (dragging.action === 'resize-right') {
        const newDuration = Math.max(0.5, dragging.initialDuration + deltaTime);
        onUpdateClip({ ...clip, duration: newDuration });
      } else if (dragging.action === 'resize-left') {
        const newStart = Math.max(0, dragging.initialStart + deltaTime);
        const newDuration = Math.max(0.5, dragging.initialDuration - deltaTime);
        onUpdateClip({ ...clip, startTime: newStart, duration: newDuration });
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
      {/* Track label */}
      <div
        className="flex-shrink-0 bg-[#12121f] flex items-center justify-center"
        style={{ width: LABEL_WIDTH, height }}
      >
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <Icon size={12} className="text-gray-400 ml-1" />
      </div>

      {/* Track content */}
      <div
        className="relative bg-[#0a0a14]"
        style={{ height, width: Math.max(totalDuration * pixelsPerSecond, 800) }}
      >
        {/* Clips */}
        {clips.map(clip => {
          const left = clip.startTime * pixelsPerSecond;
          const width = Math.max(20, clip.duration * pixelsPerSecond);
          const isSelected = selectedClipId === clip.id;

          return (
            <div
              key={clip.id}
              className={`absolute top-1 bottom-1 rounded cursor-pointer overflow-hidden transition-shadow ${
                isSelected ? 'ring-2 ring-white shadow-lg z-10' : ''
              }`}
              style={{
                left,
                width,
                backgroundColor: color
              }}
            >
              {/* Thumbnail for video */}
              {type === 'video' && clip.thumbnail && (
                <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
              )}

              {/* Clip content */}
              <div
                className="absolute inset-0 flex items-center px-2"
                onMouseDown={(e) => handleMouseDown(e, clip, 'move')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white font-medium truncate drop-shadow">
                    {clip.label || `Scene ${clip.sceneNumber}`}
                  </p>
                  {type !== 'caption' && (
                    <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                  )}
                </div>

                {/* Beat sync indicator */}
                {clip.beatSynced && (
                  <div className="w-2 h-2 bg-green-400 rounded-full ml-1" title="Synced" />
                )}

                {/* Muted indicator */}
                {clip.audioMuted && (
                  <VolumeX className="w-3 h-3 text-red-400 ml-1" />
                )}
              </div>

              {/* Resize handles */}
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
                onMouseDown={(e) => handleMouseDown(e, clip, 'resize-left')}
              />
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
                onMouseDown={(e) => handleMouseDown(e, clip, 'resize-right')}
              />
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
          style={{ left: currentTime * pixelsPerSecond }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN TIMELINE EDITOR COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function CapcutTimelineV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const queryClient = useQueryClient();

  // ═══ STATE ═══
  const [activePanel, setActivePanel] = useState('media');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(15);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Clips state
  const [videoClips, setVideoClips] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [captionClips, setCaptionClips] = useState([]);

  // Selection state
  const [selectedVideoClip, setSelectedVideoClip] = useState(null);
  const [selectedCaption, setSelectedCaption] = useState(null);

  // AutoSync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // Refs
  const playbackRef = useRef(null);
  const audioRef = useRef(null);
  const timelineRef = useRef(null);

  // ═══ DATA FETCHING ═══
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
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

  // ═══ CALCULATE TIMING ═══
  const scenesWithTiming = useMemo(() => {
    let offset = 0;
    return scenes.map(scene => {
      const duration = scene.duration_seconds || scene.audio_duration || 5;
      const result = { ...scene, startTime: offset, duration };
      offset += duration;
      return result;
    });
  }, [scenes]);

  const totalDuration = useMemo(() => {
    return voiceoverDuration > 0 ? voiceoverDuration : scenesWithTiming.reduce((sum, s) => sum + s.duration, 0) || 60;
  }, [scenesWithTiming, voiceoverDuration]);

  // ═══ INITIALIZE CLIPS ═══
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
      beatSynced: scene.beat_synced || false,
      effects: [],
      audioMuted: false,
      volume: 100
    })));

    // Generate captions from narration
    const newCaptions = [];
    scenesWithTiming.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDuration = scene.duration / Math.max(sentences.length, 1);

      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.startTime + (idx * sentenceDuration),
          duration: sentenceDuration,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 25) + '...',
          // Style properties
          x: 50,
          y: 85,
          fontSize: 20,
          color: '#FFFFFF',
          bgColor: 'rgba(0,0,0,0.7)',
          font: 'system',
          bold: false,
          italic: false,
          underline: false,
          align: 'center',
          textCase: 'none',
          shadow: false,
          animation_in: 'fade_in',
          animation_out: 'fade_out',
          animation_loop: 'none'
        });
      });
    });
    setCaptionClips(newCaptions);

    // Audio clips
    if (voiceoverUrl) {
      setAudioClips([{
        id: 'voiceover',
        type: 'audio',
        startTime: 0,
        duration: totalDuration,
        label: 'Voiceover',
        src: voiceoverUrl,
        beatSynced: true
      }]);
    }
  }, [scenesWithTiming, voiceoverUrl, totalDuration]);

  // ═══ PLAYBACK ═══
  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now() - (currentTime * 1000);
      playbackRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
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
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.5) {
        audioRef.current.currentTime = currentTime;
      }
      audioRef.current.volume = isMuted ? 0 : volume;
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentTime, voiceoverUrl, volume, isMuted]);

  // ═══ GET CURRENT SCENE ═══
  const currentScene = useMemo(() => {
    return scenesWithTiming.find(s => currentTime >= s.startTime && currentTime < s.startTime + s.duration);
  }, [scenesWithTiming, currentTime]);

  // ═══ AUTOSYNC ═══
  const handleAutoSync = async () => {
    setIsSyncing(true);

    try {
      // Call backend or do client-side sync
      const result = await base44.functions.invoke('syncMediaToAudio', { project_id: projectId });
      const data = result.data || result;

      if (data.success) {
        refetchScenes();
      }
    } catch (err) {
      // Client-side fallback: align video clips to audio duration
      if (voiceoverDuration > 0 && videoClips.length > 0) {
        const perScene = voiceoverDuration / videoClips.length;
        setVideoClips(prev => prev.map((clip, idx) => ({
          ...clip,
          startTime: idx * perScene,
          duration: perScene,
          beatSynced: true
        })));
      }
    }

    setIsSyncing(false);
  };

  // ═══ GENERATE CAPTIONS ═══
  const handleGenerateCaptions = async (settings) => {
    setIsGeneratingCaptions(true);

    // For now, regenerate from narration text
    const newCaptions = [];
    scenesWithTiming.forEach(scene => {
      const text = scene.narration_text || scene.voiceover_text;
      if (!text) return;

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDuration = scene.duration / Math.max(sentences.length, 1);

      sentences.forEach((sentence, idx) => {
        newCaptions.push({
          id: `caption-${scene.id}-${idx}-${Date.now()}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.startTime + (idx * sentenceDuration),
          duration: sentenceDuration,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 25) + '...',
          x: 50,
          y: 85,
          fontSize: 20,
          color: '#FFFFFF',
          bgColor: 'rgba(0,0,0,0.7)',
          font: 'system',
          bold: false,
          italic: false,
          underline: false,
          align: 'center',
          textCase: settings.highlightKeywords ? 'none' : 'none',
          shadow: false
        });
      });
    });

    setCaptionClips(newCaptions);
    setIsGeneratingCaptions(false);
  };

  // ═══ HANDLERS ═══
  const handleSeek = (time) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handlePlayPause = () => setIsPlaying(!isPlaying);

  const handleApplyEffect = (effect) => {
    if (!selectedVideoClip) return;
    setVideoClips(prev => prev.map(clip =>
      clip.id === selectedVideoClip.id
        ? { ...clip, effects: [...(clip.effects || []), effect.id] }
        : clip
    ));
  };

  const handleApplyTransition = (transition) => {
    // Apply to selected clip or between clips
    console.log('Apply transition:', transition);
  };

  const handleUpdateCaption = (updated) => {
    setCaptionClips(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedCaption(updated);
  };

  const handleUpdateVideoClip = (updated) => {
    setVideoClips(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedVideoClip(updated);
  };

  // Zoom
  const zoomIn = () => setPixelsPerSecond(prev => Math.min(50, prev * 1.25));
  const zoomOut = () => setPixelsPerSecond(prev => Math.max(3, prev / 1.25));

  // Find selected clips
  const selectedVideoClipObj = videoClips.find(c => c.id === selectedVideoClip?.id || c.id === selectedVideoClip);
  const selectedCaptionObj = captionClips.find(c => c.id === selectedCaption?.id || c.id === selectedCaption);

  // ═══ RENDER ═══
  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {/* Audio element */}
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      {/* Top Toolbar */}
      <TopToolbar activePanel={activePanel} onPanelChange={setActivePanel} />

      {/* Main Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#12121f]">
          {activePanel === 'media' && (
            <MediaBrowserPanel scenes={scenes} onSelectScene={(s) => handleSeek(scenesWithTiming.find(sc => sc.id === s.id)?.startTime || 0)} />
          )}
          {activePanel === 'effects' && (
            <EffectsPanel selectedClip={selectedVideoClipObj} onApplyEffect={handleApplyEffect} />
          )}
          {activePanel === 'transitions' && (
            <TransitionsPanel scenes={scenes} onApplyTransition={handleApplyTransition} />
          )}
          {activePanel === 'captions' && (
            <CaptionsPanel
              projectId={projectId}
              onGenerate={handleGenerateCaptions}
              isGenerating={isGeneratingCaptions}
              captions={captionClips}
            />
          )}
          {!['media', 'effects', 'transitions', 'captions'].includes(activePanel) && (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-gray-500">Coming soon</p>
            </div>
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
              selectedCaption={selectedCaptionObj}
              onSelectCaption={setSelectedCaption}
              onUpdateCaption={handleUpdateCaption}
              orientation={project?.orientation || 'landscape'}
            />
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-3 py-2 bg-[#12121f] border-t border-gray-800">
            <button onClick={() => handleSeek(currentTime - 5)} className="p-1.5 text-gray-400 hover:text-white">
              <SkipBack size={18} />
            </button>
            <button
              onClick={handlePlayPause}
              className={`w-10 h-10 rounded-full flex items-center justify-center ${isPlaying ? 'bg-red-600' : 'bg-white'}`}
            >
              {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-gray-900 ml-0.5" />}
            </button>
            <button onClick={() => handleSeek(currentTime + 5)} className="p-1.5 text-gray-400 hover:text-white">
              <SkipForward size={18} />
            </button>

            <span className="text-xs text-gray-500 ml-4">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Right Panel - Properties */}
        <div className="w-64 flex-shrink-0 bg-[#12121f]">
          {selectedCaptionObj ? (
            <TextPropertiesPanel caption={selectedCaptionObj} onUpdate={handleUpdateCaption} />
          ) : selectedVideoClipObj ? (
            <ClipPropertiesPanel clip={selectedVideoClipObj} onUpdate={handleUpdateVideoClip} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-gray-500">Select a clip to edit properties</p>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#12121f] border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Undo2 size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Redo2 size={16} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Scissors size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Copy size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Trash2 size={16} />
          </button>
        </div>

        {/* AutoSync Button */}
        <Button
          onClick={handleAutoSync}
          disabled={isSyncing}
          className="gap-2 bg-gradient-to-r from-cyan-600 to-purple-600"
        >
          {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
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
      <div className="h-44 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto" ref={timelineRef}>
        <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} currentTime={currentTime} onSeek={handleSeek} />

        {scenes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <p className="text-sm">No scenes to display</p>
          </div>
        ) : (
          <>
            <TimelineTrack
              type="video"
              clips={videoClips}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              currentTime={currentTime}
              selectedClipId={selectedVideoClip?.id || selectedVideoClip}
              onSelectClip={(id) => { setSelectedVideoClip(id); setSelectedCaption(null); }}
              onUpdateClip={handleUpdateVideoClip}
            />
            <TimelineTrack
              type="audio"
              clips={audioClips}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              currentTime={currentTime}
              selectedClipId={null}
              onSelectClip={() => {}}
              onUpdateClip={() => {}}
            />
            <TimelineTrack
              type="caption"
              clips={captionClips}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              currentTime={currentTime}
              selectedClipId={selectedCaption?.id || selectedCaption}
              onSelectClip={(id) => { setSelectedCaption(id); setSelectedVideoClip(null); }}
              onUpdateClip={handleUpdateCaption}
            />
          </>
        )}
      </div>
    </div>
  );
}
