import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Check, X, Film } from 'lucide-react';

export default function BrollSwapDialog({ scene, orientation, onSwap, onClose }) {
  const [query, setQuery] = useState(scene.keywords || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSelected(null);
    try {
      const res = await base44.functions.invoke('searchBrollVideos', {
        prompt: query, orientation: orientation || 'landscape',
      });
      const data = res.data || res;
      setResults((data.videos || []).slice(0, 12));
    } catch (err) {
      console.error('B-roll search failed:', err);
    }
    setSearching(false);
  };

  const handleConfirm = () => {
    if (!selected) return;
    onSwap({
      videoUrl: selected.downloadUrl || selected.preview,
      thumbnail: selected.thumbnail,
      source: selected.source,
      sourceId: selected.id,
      videoDuration: selected.duration,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Swap B-Roll — Scene {scene.sceneNumber}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{scene.label || scene.description}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b flex gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search stock video..."
            className="text-sm flex-1"
          />
          <Button onClick={handleSearch} disabled={searching} size="sm" className="gap-1">
            {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Search
          </Button>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.length === 0 && !searching && (
            <p className="text-sm text-gray-400 text-center py-8">Search for B-roll clips to swap in</p>
          )}
          {searching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {results.map((video) => (
              <button
                key={video.id}
                onClick={() => setSelected(video)}
                className={`rounded-lg overflow-hidden border-2 transition-all ${
                  selected?.id === video.id ? 'border-violet-500 ring-2 ring-violet-200' : 'border-transparent hover:border-gray-300'
                }`}
              >
                <div className="aspect-video bg-gray-900 relative">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-between">
                    <span className="text-[9px] text-gray-300">{video.duration}s</span>
                    <Badge className="text-[8px] bg-gray-700/80 text-gray-300 px-1 py-0">{video.source}</Badge>
                  </div>
                  {selected?.id === video.id && (
                    <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                      <Check className="w-6 h-6 text-white drop-shadow-lg" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-xs text-gray-400">{results.length} results</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!selected} onClick={handleConfirm} className="bg-violet-600 hover:bg-violet-700 gap-1">
              <Check className="w-3 h-3" /> Use This Clip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}