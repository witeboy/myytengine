import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play, Pause, Download, Loader2, Scissors, Clock,
  Flame, TrendingUp, ChevronDown, ChevronUp, Wand2,
} from 'lucide-react';
import { formatTimestamp, clipVideo, clipFilename } from '@/lib/clipWithFFmpeg';
import ClipEnhancePanel from './ClipEnhancePanel';

const CATEGORY_COLORS = {
  hot_take:       'bg-red-100 text-red-700 border-red-200',
  story:          'bg-blue-100 text-blue-700 border-blue-200',
  humor:          'bg-amber-100 text-amber-700 border-amber-200',
  insight:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  emotional:      'bg-pink-100 text-pink-700 border-pink-200',
  dramatic:       'bg-purple-100 text-purple-700 border-purple-200',
  quotable:       'bg-indigo-100 text-indigo-700 border-indigo-200',
  controversial:  'bg-orange-100 text-orange-700 border-orange-200',
};

const CATEGORY_LABELS = {
  hot_take: '🔥 Hot Take',
  story: '📖 Story',
  humor: '😂 Humor',
  insight: '💡 Insight',
  emotional: '😢 Emotional',
  dramatic: '🎭 Dramatic',
  quotable: '💬 Quotable',
  controversial: '⚡ Controversial',
};

function ViralityMeter({ score }) {
  const color = score >= 80 ? 'text-red-500' : score >= 60 ? 'text-amber-500' : 'text-blue-500';
  const bgColor = score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Flame className={`w-4 h-4 ${color}`} />
        <span className={`text-lg font-bold ${color}`}>{score}</span>
      </div>
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${bgColor} rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function ClipCard({ clip, index, videoUrl, onClipReady, allWords = [] }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [clipProgress, setClipProgress] = useState('');
  const [clipBlob, setClipBlob] = useState(null);
  const [showEnhance, setShowEnhance] = useState(false);

  const handlePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;

    if (playing) {
      vid.pause();
      setPlaying(false);
    } else {
      vid.currentTime = clip.start;
      vid.play();
      setPlaying(true);

      const checkEnd = () => {
        if (vid.currentTime >= clip.end) {
          vid.pause();
          setPlaying(false);
        } else if (!vid.paused) {
          requestAnimationFrame(checkEnd);
        }
      };
      requestAnimationFrame(checkEnd);
    }
  };

  const handleClip = async () => {
    if (clipBlob) {
      downloadBlob(clipBlob);
      return;
    }

    setClipping(true);
    try {
      const blob = await clipVideo(videoUrl, clip.start, clip.end, ({ message }) => {
        setClipProgress(message);
      });
      setClipBlob(blob);
      onClipReady?.(index, blob);
      downloadBlob(blob);
    } catch (err) {
      console.error('Clip failed:', err);
      setClipProgress('Clip failed — try again');
    } finally {
      setClipping(false);
    }
  };

  const downloadBlob = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = clipFilename(clip.title, index);
    a.click();
    URL.revokeObjectURL(url);
  };

  const categoryClass = CATEGORY_COLORS[clip.category] || 'bg-gray-100 text-gray-700 border-gray-200';
  const categoryLabel = CATEGORY_LABELS[clip.category] || clip.category;

  return (
    <Card className="overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors">
      <CardContent className="p-0">
        {/* Video Preview */}
        <div className="relative bg-black aspect-video cursor-pointer group" onClick={handlePlayPause}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            preload="metadata"
            playsInline
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />

          <div className={`absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              {playing
                ? <Pause className="w-5 h-5 text-gray-900" />
                : <Play className="w-5 h-5 text-gray-900 ml-0.5" />
              }
            </div>
          </div>

          <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center text-xs font-bold">
            #{index + 1}
          </div>

          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(clip.start)} → {formatTimestamp(clip.end)}
          </div>
        </div>

        {/* Info Section */}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">
                {clip.title}
              </h3>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${categoryClass}`}>
                  {categoryLabel}
                </Badge>
                <span className="text-xs text-gray-400">
                  {clip.duration.toFixed(0)}s
                </span>
              </div>
            </div>
            <ViralityMeter score={clip.virality_score} />
          </div>

          <p className="text-xs text-gray-500 italic leading-relaxed">
            "{clip.hook}"
          </p>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'Why this clip is viral'}
          </button>

          {expanded && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Virality reason</span>
                <p className="text-xs text-gray-600 mt-0.5">{clip.virality_reason}</p>
              </div>
              {clip.transcript_excerpt && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Peak moment</span>
                  <p className="text-xs text-gray-700 mt-0.5 bg-gray-50 rounded px-2 py-1.5 border-l-2 border-gray-300">
                    {clip.transcript_excerpt}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={handlePlayPause}
            >
              {playing ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
              Preview
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs bg-gray-900 hover:bg-gray-800 text-white"
              onClick={handleClip}
              disabled={clipping}
            >
              {clipping ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{clipProgress || 'Clipping…'}</>
              ) : clipBlob ? (
                <><Download className="w-3 h-3 mr-1" />Download</>
              ) : (
                <><Scissors className="w-3 h-3 mr-1" />Clip &amp; Download</>
              )}
            </Button>
          </div>

          {/* Enhance for FYP */}
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs mt-1 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={() => setShowEnhance(true)}
          >
            <Wand2 className="w-3 h-3 mr-1" />
            Enhance for FYP
          </Button>

          {showEnhance && (
            <ClipEnhancePanel
              clip={clip}
              clipIndex={index}
              words={allWords}
              videoUrl={videoUrl}
              onClose={() => setShowEnhance(false)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
