import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, X, CheckCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function BrollSelector({ 
  blockPrompt, 
  blockDuration,
  onSelectVideo,
  selectedVideoId
}) {
  const [videos, setVideos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [selectedVideo, setSelectedVideo] = useState(null);

  const handleSearch = async () => {
    if (!blockPrompt) return;
    
    setIsSearching(true);
    try {
      const result = await base44.functions.invoke('searchBrollVideos', {
        prompt: blockPrompt,
        duration: blockDuration,
        quality
      });
      
      if (result.data?.videos) {
        setVideos(result.data.videos);
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

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          Find B-Roll Videos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Controls */}
        <div className="space-y-3 bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-600">
            <strong>Searching for:</strong> {blockPrompt}
          </p>
          
          <div className="flex gap-2">
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="4k">4K</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleSearch}
              disabled={isSearching || !blockPrompt}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search B-Roll
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Video Results Grid */}
        {videos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Results ({videos.length})</h4>
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                    selectedVideoId === video.id
                      ? 'border-blue-600 bg-blue-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => onSelectVideo(video)}
                >
                  <div className="flex items-start gap-3">
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.name}
                        className="w-16 h-12 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium truncate">{video.name}</p>
                          <p className="text-xs text-gray-600">
                            {video.quality} • {video.duration}
                          </p>
                        </div>
                        {selectedVideoId === video.id && (
                          <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        )}
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

        {videos.length === 0 && !isSearching && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No videos found. Click search to find B-roll.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}