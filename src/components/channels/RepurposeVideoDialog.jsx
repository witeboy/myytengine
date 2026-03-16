import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Zap, ArrowRight, FileText } from 'lucide-react';

export default function RepurposeVideoDialog({ open, onOpenChange, video, channel, onRepurposed }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && video && !result && !loading) {
      handleRepurpose();
    }
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open, video]);

  const handleRepurpose = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await base44.functions.invoke('repurposeCompetitorVideo', {
      channel_id: channel.id,
      video_title: video.title,
      video_id: video.video_id || '',
      video_url: video.video_id ? `https://www.youtube.com/watch?v=${video.video_id}` : '',
      competitor_name: video.channel_name || '',
    });

    setLoading(false);

    if (res.data?.success) {
      setResult({
        ...res.data.topic,
        transcript_source: res.data.transcript_source,
        transcript_length: res.data.transcript_length,
      });
      onRepurposed?.();
    } else {
      setError(res.data?.error || 'Failed to repurpose');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            Repurpose Competitor Content
          </DialogTitle>
          <DialogDescription>
            AI generates a unique topic from this competitor video for your pipeline.
          </DialogDescription>
        </DialogHeader>

        {/* Original video info */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
          {video?.thumbnail && (
            <img src={video.thumbnail} alt="" className="w-20 h-12 rounded object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{video?.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {video?.views ? `${formatNum(video.views)} views` : ''} · Original competitor content
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-orange-500" />
            <p className="text-sm font-medium text-gray-700">AI is fetching transcript & analyzing...</p>
            <p className="text-xs text-gray-400 mt-1">Extracting video content, then generating unique angle & strategy</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
            <Button onClick={handleRepurpose} variant="outline" size="sm" className="mt-2 text-xs">
              Retry
            </Button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-bold">Topic added to your pipeline!</span>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              {/* Transcript source badge */}
              {result.transcript_source && result.transcript_source !== 'none' && (
                <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-600 border-blue-200">
                  📝 Transcript: {result.transcript_source === 'youtube_captions' ? 'Captions' : result.transcript_source === 'youtube_innertube' ? 'InnerTube' : result.transcript_source} ({Math.round((result.transcript_length || 0) / 1000)}K chars)
                </Badge>
              )}

              {/* New title */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Your Repurposed Title</p>
                  <Badge className={`text-[9px] ${result.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {result.format === 'short' ? 'Short' : 'Long-form'}
                  </Badge>
                </div>
                <p className="text-base font-bold text-gray-900">{result.title}</p>
              </div>

              {/* Content brief */}
              {result.summary && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Content Brief</p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{result.summary}</p>
                </div>
              )}

              {/* Angles comparison */}
              <div className="grid grid-cols-2 gap-2">
                {result.original_angle && (
                  <div className="bg-red-50 border border-red-100 rounded p-2">
                    <p className="text-[9px] font-semibold text-red-500 uppercase mb-0.5">Their Angle</p>
                    <p className="text-[11px] text-gray-700">{result.original_angle}</p>
                  </div>
                )}
                {result.our_angle && (
                  <div className="bg-green-50 border border-green-100 rounded p-2">
                    <p className="text-[9px] font-semibold text-green-500 uppercase mb-0.5">Our Angle</p>
                    <p className="text-[11px] text-gray-700">{result.our_angle}</p>
                  </div>
                )}
              </div>

              {/* Strategy */}
              {result.strategic_notes && (
                <div className="bg-purple-50 border border-purple-100 rounded p-2">
                  <p className="text-[9px] font-semibold text-purple-500 uppercase mb-0.5">Strategy</p>
                  <p className="text-[11px] text-gray-700">{result.strategic_notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
              <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>This topic is now in your queue. Go to <strong>All Topics</strong> or schedule it via the calendar to start production.</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}