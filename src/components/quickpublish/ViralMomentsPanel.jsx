import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, Loader2, Scissors, TrendingUp, Copy, Check } from 'lucide-react';

// ── Format seconds → mm:ss ──────────────────────────────────────
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ScoreBar({ label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-gray-500 w-12 capitalize">{label}</span>
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-red-500"
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-gray-600 w-4">{value}</span>
    </div>
  );
}

export default function ViralMomentsPanel({ transcript, words, duration }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [clips, setClips] = useState([]);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await base44.functions.invoke('extractBestMoments', {
        transcript, words, duration, max_clips: 5, clip_min_sec: 15, clip_max_sec: 60,
      });
      if (res.data?.clips?.length) {
        setClips(res.data.clips);
      } else {
        setError(res.data?.error || 'No viral moments detected');
      }
    } catch (err) {
      setError(err.message || 'Analysis failed');
    }
    setAnalyzing(false);
  };

  const copyTimestamps = async (clip, idx) => {
    const text = `${fmt(clip.start_time)} - ${fmt(clip.end_time)} · ${clip.title}\nHook: "${clip.hook_sentence}"`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch (_) {}
  };

  if (!transcript || transcript.length < 200) return null;

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-900">
            Viral Shorts Detector
          </span>
          <Badge className="bg-orange-100 text-orange-700 text-[10px]">
            AI Powered
          </Badge>
        </div>
        {!clips.length && (
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="h-7 text-xs gap-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
            {analyzing ? 'Analyzing...' : 'Find Viral Moments'}
          </Button>
        )}
      </div>

      {!clips.length && (
        <p className="text-[10px] text-orange-700">
          AI scans transcript for 3-5 clips with viral potential (15-60s each). Perfect for Shorts, Reels, TikTok.
        </p>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
      )}

      {clips.length > 0 && (
        <div className="space-y-2">
          {clips.map((clip, idx) => (
            <Card key={idx} className="bg-white border-orange-100">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge className="bg-orange-500 text-white text-[10px]">#{clip.rank}</Badge>
                      <span className="text-[10px] font-mono text-gray-500">
                        {fmt(clip.start_time)} → {fmt(clip.end_time)} · {Math.round(clip.duration)}s
                      </span>
                      <Badge variant="outline" className="text-[9px] capitalize">{clip.platform}</Badge>
                      <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px] ml-auto">
                        <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                        {clip.overall_score?.toFixed(1)}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{clip.title}</p>
                    <p className="text-[11px] text-gray-600 italic mt-0.5">
                      Hook: "{clip.hook_sentence}"
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">{clip.viral_reasoning}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyTimestamps(clip, idx)}
                    className="h-7 w-7 p-0 flex-shrink-0"
                    title="Copy timestamps"
                  >
                    {copiedIdx === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>

                {clip.scores && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 border-t border-gray-100">
                    {Object.entries(clip.scores).map(([k, v]) => (
                      <ScoreBar key={k} label={k.replace('_', ' ')} value={v} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <p className="text-[10px] text-orange-700 pt-1">
            💡 Use these timestamps in your video editor to extract Shorts. Copy for FFmpeg/Descript.
          </p>
        </div>
      )}
    </div>
  );
}