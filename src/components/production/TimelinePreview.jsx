import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Play, RotateCcw } from 'lucide-react';

export default function TimelinePreview({ 
  blocks, 
  totalDuration, 
  voiceoverUrl,
  onGeneratePreview,
  isGenerating
}) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = React.useRef(null);

  const handleGeneratePreview = async () => {
    const result = await onGeneratePreview();
    if (result?.preview_url) {
      setPreviewUrl(result.preview_url);
    }
  };

  const handlePlayPreview = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="w-5 h-5" />
          Timeline Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewUrl ? (
          <>
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={previewUrl}
                className="w-full aspect-video"
                onEnded={() => setIsPlaying(false)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handlePlayPreview}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                onClick={() => setPreviewUrl(null)}
                variant="outline"
                className="flex-1"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-render
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-100 rounded-lg p-8 text-center">
              <p className="text-sm text-gray-600 mb-4">
                Preview will render all assets, animations, and audio mixed together
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Duration: {totalDuration.toFixed(1)}s | Assets: {blocks.length}
              </p>
            </div>
            <Button
              onClick={handleGeneratePreview}
              disabled={isGenerating || blocks.length === 0}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rendering Preview...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Generate Preview
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}