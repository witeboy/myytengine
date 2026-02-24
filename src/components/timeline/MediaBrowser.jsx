import React, { useState } from 'react';
import { Film, Image, Music, Search, Grid3x3, List } from 'lucide-react';
import { Input } from '@/components/ui/input';

const TABS = [
  { id: 'scenes', label: 'Scenes', icon: Film },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'audio', label: 'Audio', icon: Music },
];

export default function MediaBrowser({ scenes, selectedScene, onSelectScene, voiceoverUrl, musicUrl }) {
  const [tab, setTab] = useState('scenes');
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');

  const filteredScenes = scenes.filter(s => {
    if (!search) return true;
    return `scene ${s.scene_number}`.includes(search.toLowerCase()) ||
      (s.narration_text || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e] border-r border-gray-700/50">
      {/* Tabs */}
      <div className="flex border-b border-gray-700/50">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-medium transition-colors ${
              tab === t.id ? 'text-blue-400 border-b-2 border-blue-400 bg-white/5' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-7 pl-7 text-[10px] bg-[#0f0f23] border-gray-700 text-gray-300 placeholder:text-gray-600"
          />
        </div>
      </div>

      {/* View toggle */}
      <div className="px-2 pb-1 flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{filteredScenes.length} items</span>
        <div className="flex gap-0.5">
          <button onClick={() => setViewMode('grid')} className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
            <Grid3x3 className="w-3 h-3" />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
            <List className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {tab === 'scenes' && (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-1.5">
              {filteredScenes.map(scene => {
                const isSelected = selectedScene === scene.id;
                const hasVideo = scene.video_url?.startsWith('http');
                const hasImage = scene.image_url?.startsWith('http');
                const thumb = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
                return (
                  <button
                    key={scene.id}
                    onClick={() => onSelectScene(scene.id)}
                    className={`relative rounded overflow-hidden aspect-video bg-gray-900 group transition-all ${
                      isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-gray-600'
                    }`}
                  >
                    {thumb ? (
                      <img src={thumb} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <Film className="w-4 h-4 text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-white">S{scene.scene_number}</span>
                      <span className="text-[8px] text-gray-400">{scene.duration_seconds}s</span>
                    </div>
                    {/* Status dot */}
                    <div className="absolute top-0.5 right-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${hasVideo ? 'bg-purple-400' : hasImage ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredScenes.map(scene => {
                const isSelected = selectedScene === scene.id;
                const hasVideo = scene.video_url?.startsWith('http');
                const hasImage = scene.image_url?.startsWith('http');
                const thumb = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
                return (
                  <button
                    key={scene.id}
                    onClick={() => onSelectScene(scene.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                      isSelected ? 'bg-blue-500/20 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                    }`}
                  >
                    <div className="w-12 h-7 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                      {thumb ? (
                        <img src={thumb} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate">Scene {scene.scene_number}</p>
                      <p className="text-[9px] text-gray-500 truncate">{scene.narration_text || 'No narration'}</p>
                    </div>
                    <span className="text-[9px] text-gray-500 flex-shrink-0">{scene.duration_seconds}s</span>
                  </button>
                );
              })}
            </div>
          )
        )}

        {tab === 'audio' && (
          <div className="space-y-2 pt-1">
            {voiceoverUrl && (
              <div className="bg-[#0f0f23] rounded p-2">
                <p className="text-[10px] font-medium text-blue-400 mb-1">Voiceover</p>
                <audio src={voiceoverUrl} controls className="w-full h-7" />
              </div>
            )}
            {musicUrl && (
              <div className="bg-[#0f0f23] rounded p-2">
                <p className="text-[10px] font-medium text-green-400 mb-1">Background Music</p>
                <audio src={musicUrl} controls className="w-full h-7" />
              </div>
            )}
            {!voiceoverUrl && !musicUrl && (
              <p className="text-[10px] text-gray-500 text-center py-4">No audio assets yet</p>
            )}
          </div>
        )}

        {tab === 'images' && (
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {scenes.filter(s => s.image_url?.startsWith('http')).map(scene => (
              <button
                key={scene.id}
                onClick={() => onSelectScene(scene.id)}
                className="relative rounded overflow-hidden aspect-video bg-gray-900 hover:ring-1 hover:ring-gray-600"
              >
                <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                  <span className="text-[8px] text-white">S{scene.scene_number}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}