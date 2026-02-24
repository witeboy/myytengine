import React, { useState } from 'react';
import { Film, Image, Music, Search, Grid3x3, List } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-[#1a1a2e]">
      {/* Tabs */}
      <div className="flex border-b border-gray-700/40 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
              tab === t.id ? 'text-blue-400 bg-blue-500/10 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <t.icon className="w-3 h-3" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="px-2 py-1.5 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full h-6 pl-6 pr-2 text-[10px] bg-[#0f0f23] border border-gray-700/40 rounded text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* View toggle + count */}
      <div className="px-2 pb-1 flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] text-gray-600">{filteredScenes.length} items</span>
        <div className="flex gap-px bg-gray-800/50 rounded overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={`p-0.5 ${viewMode === 'grid' ? 'bg-white/10 text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}>
            <Grid3x3 className="w-3 h-3" />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-0.5 ${viewMode === 'list' ? 'bg-white/10 text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}>
            <List className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
        {tab === 'scenes' && viewMode === 'grid' && (
          <div className="grid grid-cols-2 gap-1">
            {filteredScenes.map(scene => {
              const isSelected = selectedScene === scene.id;
              const hasVideo = scene.video_url?.startsWith('http');
              const hasImage = scene.image_url?.startsWith('http');
              const thumb = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
              return (
                <button
                  key={scene.id}
                  onClick={() => onSelectScene(scene.id)}
                  className={`relative rounded overflow-hidden aspect-video bg-gray-900 transition-all ${
                    isSelected ? 'ring-1 ring-blue-500 ring-offset-1 ring-offset-[#1a1a2e]' : 'hover:brightness-110'
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} className="w-full h-full object-cover" alt="" draggable={false} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                      <Film className="w-3.5 h-3.5 text-gray-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-1 pb-px flex items-center justify-between">
                    <span className="text-[8px] font-bold text-white">S{scene.scene_number}</span>
                    <span className="text-[7px] text-gray-400">{scene.duration_seconds}s</span>
                  </div>
                  <div className="absolute top-0.5 right-0.5">
                    <div className={`w-1 h-1 rounded-full ${hasVideo ? 'bg-purple-400' : hasImage ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'scenes' && viewMode === 'list' && (
          <div className="space-y-px">
            {filteredScenes.map(scene => {
              const isSelected = selectedScene === scene.id;
              const hasVideo = scene.video_url?.startsWith('http');
              const hasImage = scene.image_url?.startsWith('http');
              const thumb = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
              return (
                <button
                  key={scene.id}
                  onClick={() => onSelectScene(scene.id)}
                  className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors ${
                    isSelected ? 'bg-blue-500/15 text-white' : 'text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <div className="w-10 h-6 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                    {thumb ? <img src={thumb} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-2.5 h-2.5 text-gray-700" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-medium truncate">Scene {scene.scene_number}</p>
                    <p className="text-[8px] text-gray-600 truncate">{scene.narration_text || '—'}</p>
                  </div>
                  <span className="text-[8px] text-gray-600 flex-shrink-0">{scene.duration_seconds}s</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'audio' && (
          <div className="space-y-1.5 pt-1">
            {voiceoverUrl && (
              <div className="bg-[#0f0f23] rounded-md p-2">
                <p className="text-[9px] font-semibold text-blue-400 mb-1">Voiceover</p>
                <audio src={voiceoverUrl} controls className="w-full h-6" style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }} />
              </div>
            )}
            {musicUrl && (
              <div className="bg-[#0f0f23] rounded-md p-2">
                <p className="text-[9px] font-semibold text-green-400 mb-1">Background Music</p>
                <audio src={musicUrl} controls className="w-full h-6" style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }} />
              </div>
            )}
            {!voiceoverUrl && !musicUrl && (
              <p className="text-[9px] text-gray-600 text-center py-6">No audio assets</p>
            )}
          </div>
        )}

        {tab === 'images' && (
          <div className="grid grid-cols-2 gap-1 pt-1">
            {scenes.filter(s => s.image_url?.startsWith('http')).map(scene => (
              <button
                key={scene.id}
                onClick={() => onSelectScene(scene.id)}
                className="relative rounded overflow-hidden aspect-video bg-gray-900 hover:brightness-110 transition-all"
              >
                <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-px">
                  <span className="text-[7px] text-white font-medium">S{scene.scene_number}</span>
                </div>
              </button>
            ))}
            {scenes.filter(s => s.image_url?.startsWith('http')).length === 0 && (
              <p className="col-span-2 text-[9px] text-gray-600 text-center py-6">No images generated</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}