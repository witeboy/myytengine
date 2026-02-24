import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  X, Clock, RefreshCw, Loader2, ImageIcon, Film, Scissors,
  Layers, Camera, Wand2, Volume2, ChevronDown, ChevronRight
} from 'lucide-react';

export default function PropertiesPanel({ scene, onClose, onUpdateDuration, onRefetch }) {
  const [duration, setDuration] = useState(scene?.duration_seconds || 8);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [regeneratingVideo, setRegeneratingVideo] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ basic: true, media: true, audio: false, prompt: false, transition: false });

  useEffect(() => {
    if (scene) setDuration(scene.duration_seconds || 8);
  }, [scene?.id]);

  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#16213e] p-4">
        <Layers className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs text-center">Select a scene to view its properties</p>
      </div>
    );
  }

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handleRegenerateImage = async () => {
    setRegeneratingImage(true);
    await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
    onRefetch?.();
    setRegeneratingImage(false);
  };

  const handleRegenerateVideo = async () => {
    setRegeneratingVideo(true);
    await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
    onRefetch?.();
    setRegeneratingVideo(false);
  };

  const handleSaveDuration = () => {
    onUpdateDuration(duration);
  };

  const handleTransitionChange = async (type) => {
    await base44.entities.Scenes.update(scene.id, { transition_type: type });
    onRefetch?.();
  };

  const handleTransitionDurationChange = async (dur) => {
    await base44.entities.Scenes.update(scene.id, { transition_duration: dur });
    onRefetch?.();
  };

  const SectionHeader = ({ label, icon: Icon, sectionKey }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center gap-2 py-2 px-3 text-[11px] font-semibold text-gray-300 hover:bg-white/5 transition-colors"
    >
      {expandedSections[sectionKey] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );

  const hasVideo = scene.video_url?.startsWith('http');
  const hasImage = scene.image_url?.startsWith('http');
  const statusColor = hasVideo ? 'text-purple-400' : hasImage ? 'text-emerald-400' : 'text-gray-500';

  return (
    <div className="h-full flex flex-col bg-[#16213e] border-x border-gray-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Scene {scene.scene_number}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 ${statusColor}`}>
            {scene.status?.replace(/_/g, ' ')}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Basic Section */}
        <SectionHeader label="Basic" icon={Clock} sectionKey="basic" />
        {expandedSections.basic && (
          <div className="px-3 pb-3 space-y-3">
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Duration (seconds)</label>
              <div className="flex gap-2">
                <Input
                  type="number" min={2} max={60} value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="h-7 w-20 text-xs bg-[#0f0f23] border-gray-700 text-white"
                />
                <Slider
                  value={[duration]} onValueChange={([v]) => setDuration(v)}
                  min={2} max={30} step={0.5} className="flex-1"
                />
                <Button size="sm" onClick={handleSaveDuration} className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700">
                  Save
                </Button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Camera Movement</label>
              <Select value={scene.camera_movement || 'slow_pan'} onValueChange={async (v) => {
                await base44.entities.Scenes.update(scene.id, { camera_movement: v });
                onRefetch?.();
              }}>
                <SelectTrigger className="h-7 text-[10px] bg-[#0f0f23] border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['static', 'slow_pan', 'slow_zoom_in', 'slow_zoom_out', 'dolly_zoom', 'crane_shot', 'tracking_shot', 'orbital', 'tilt_up', 'tilt_down'].map(m => (
                    <SelectItem key={m} value={m} className="text-xs">{m.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Media Section */}
        <SectionHeader label="Media" icon={Film} sectionKey="media" />
        {expandedSections.media && (
          <div className="px-3 pb-3 space-y-2">
            {/* Preview */}
            <div className="aspect-video bg-gray-900 rounded overflow-hidden">
              {hasVideo ? (
                <video src={scene.video_url} className="w-full h-full object-cover" controls />
              ) : hasImage ? (
                <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <Film className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={handleRegenerateImage} disabled={regeneratingImage}
                className="flex-1 text-[9px] h-7 gap-1 border-gray-700 text-gray-300 hover:text-white hover:bg-white/10">
                {regeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                Regen Image
              </Button>
              {hasImage && (
                <Button size="sm" variant="outline" onClick={handleRegenerateVideo} disabled={regeneratingVideo}
                  className="flex-1 text-[9px] h-7 gap-1 border-gray-700 text-gray-300 hover:text-white hover:bg-white/10">
                  {regeneratingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                  Regen Video
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Audio Section */}
        <SectionHeader label="Audio" icon={Volume2} sectionKey="audio" />
        {expandedSections.audio && (
          <div className="px-3 pb-3 space-y-2">
            {scene.sound_effect_url ? (
              <>
                <p className="text-[10px] text-gray-400">{scene.sound_effect || 'Sound effect'}</p>
                <audio src={scene.sound_effect_url} controls className="w-full h-7" />
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">SFX Volume</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[scene.sfx_volume ?? 0.5]}
                      onValueChange={async ([v]) => {
                        await base44.entities.Scenes.update(scene.id, { sfx_volume: v });
                        onRefetch?.();
                      }}
                      min={0} max={1} step={0.05} className="flex-1"
                    />
                    <span className="text-[10px] text-gray-400 w-8">{Math.round((scene.sfx_volume ?? 0.5) * 100)}%</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-gray-500">No sound effect assigned</p>
            )}
          </div>
        )}

        {/* Transition Section */}
        <SectionHeader label="Transition" icon={Layers} sectionKey="transition" />
        {expandedSections.transition && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Type</label>
              <Select value={scene.transition_type || 'cut'} onValueChange={handleTransitionChange}>
                <SelectTrigger className="h-7 text-[10px] bg-[#0f0f23] border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['cut', 'fade', 'dissolve', 'zoom', 'wipe', 'slide'].map(t => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scene.transition_type && scene.transition_type !== 'cut' && (
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Duration (s)</label>
                <Slider
                  value={[scene.transition_duration || 0.5]}
                  onValueChange={([v]) => handleTransitionDurationChange(v)}
                  min={0.1} max={2} step={0.1} className="w-full"
                />
                <span className="text-[10px] text-gray-500">{(scene.transition_duration || 0.5).toFixed(1)}s</span>
              </div>
            )}
          </div>
        )}

        {/* Prompt Section */}
        <SectionHeader label="Prompt" icon={Wand2} sectionKey="prompt" />
        {expandedSections.prompt && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Narration</label>
              <p className="text-[10px] text-gray-300 bg-[#0f0f23] rounded p-2 max-h-20 overflow-y-auto leading-relaxed">
                {scene.narration_text || 'No narration'}
              </p>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">Image Prompt</label>
              <p className="text-[10px] text-gray-300 bg-[#0f0f23] rounded p-2 max-h-20 overflow-y-auto leading-relaxed">
                {scene.image_prompt || 'No prompt'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}