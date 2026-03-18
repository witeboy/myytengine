import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, CheckCircle, ExternalLink, Eye, Download } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SOURCE_COLORS = {
  freepik: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Freepik' },
  pexels:  { bg: 'bg-green-100', text: 'text-green-700', label: 'Pexels' },
  pixabay: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Pixabay' },
};

function SourceBadge({ source }) {
  const config = SOURCE_COLORS[source] || { bg: 'bg-gray-100', text: 'text-gray-700', label: source };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

export default function BrollSelector({ 
  blockPrompt, 
  blockDuration,
  onSelectVideo,
  selectedVideoId,
  orientation,
}) {
  const [videos, setVideos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [customQuery, setCustomQuery] = useState('');
  const [sourceSummary, setSourceSummary] = useState(null);
  const [filterSource, setFilterSource] = useState('all');

  const handleSearch = async (queryOverride) => {
    const query = queryOverride || customQuery || blockPrompt;
    if (!query) return;
    
    setIsSearching(true);
    setSourceSummary(null);
    try {
      const result = await base44.functions.invoke('searchBrollVideos', {
        prompt: query,
        duration: blockDuration,
        quality,
        orientation: orientation || 'landscape',
      });
      
      if (result.data?.videos) {
        setVideos(result.data.videos);
        setSourceSummary(result.data.sources || null);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectVideo = (video) => {
    setSelectedVideo(video);
    onSelectVideo(video);
  };

  const filteredVideos = filterSource === 'all' 
    ? videos 
    : videos.filter(v => v.source === filterSource);

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="w-5 h-5" />
          Find B-Roll Videos
        </CardTitle>
        <p className="text-xs text-gray-500">
          Searches Freepik, Pexels &amp; Pixabay simultaneously
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Controls */}
        <div className="space-y-3 bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-600">
            <strong>Scene prompt:</strong> {blockPrompt?.substring(0, 120)}{blockPrompt?.length > 120 ? '...' : ''}
          </p>
          
          <div className="flex gap-2">
            <Input
              placeholder="Custom search terms..."
              value={customQuery}
              onChange={e => setCustomQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="4k">4K</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => handleSearch()}
              disabled={isSearching}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSearching ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching 3 sources...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Search B-Roll</>
              )}
            </Button>
          </div>
        </div>

        {/* Source Summary */}
        {sourceSummary && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterSource('all')}
              className={`px-2 py-1 rounded text-xs font-medium transition ${
                filterSource === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({videos.length})
            </button>
            {Object.entries(sourceSummary).map(([source, info]) => {
              const cfg = SOURCE_COLORS[source] || {};
              return (
                <button
                  key={source}
                  onClick={() => setFilterSource(source)}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    filterSource === source 
                      ? 'bg-gray-800 text-white' 
                      : `${cfg.bg || 'bg-gray-100'} ${cfg.text || 'text-gray-600'} hover:opacity-80`
                  }`}
                >
                  {cfg.label || source} ({info.count})
                  {info.error && <span className="ml-1 text-red-500">⚠</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Video Results Grid */}
        {filteredVideos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Results ({filteredVideos.length})</h4>
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                    selectedVideo?.id === video.id
                      ? 'border-blue-600 bg-blue-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => handleSelectVideo(video)}
                >
                  <div className="flex items-start gap-3">
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.name}
                        className="w-20 h-14 rounded object-cover flex-shrink-0 bg-gray-200"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium truncate">{video.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <SourceBadge source={video.source} />
                            <span className="text-xs text-gray-500">
                              {video.quality} • {video.duration}s
                            </span>
                            {video.width && video.height && (
                              <span className="text-xs text-gray-400">{video.width}×{video.height}</span>
                            )}
                          </div>
                          {video.author && (
                            <p className="text-xs text-gray-500 mt-0.5">by {video.author}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {video.url && (
                            <a href={video.url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1 text-gray-400 hover:text-blue-600 transition"
                              title="View on source"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {selectedVideo?.id === video.id && (
                            <CheckCircle className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                      </div>
                      {video.premium && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                          Premium
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredVideos.length === 0 && !isSearching && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              {videos.length > 0 
                ? 'No results for this filter. Try "All" sources.' 
                : 'Click search to find B-roll from Freepik, Pexels & Pixabay.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}