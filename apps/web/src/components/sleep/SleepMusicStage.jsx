import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, RefreshCw } from 'lucide-react';

export default function SleepMusicStage({ projectId, project, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Load existing music tracks
  useEffect(() => {
    if (!projectId || loaded) return;
    (async () => {
      try {
        const t = await base44.entities.MusicTracks.filter({ project_id: projectId });
        setTracks(t || []);
      } catch (_) {}
      setLoaded(true);
    })();
  }, [projectId, loaded]);

  const selectedTrack = tracks.find(t => t.is_selected && t.audio_url);
  const hasMusicReady = !!selectedTrack;

  const handleGenerateMusic = async () => {
    setGenerating(true);
    try {
      const durationMin = project?.video_duration_minutes || 15;
      const topicName = project?.name || 'peaceful sleep';

      await base44.functions.invoke('generateMusic', {
        project_id: projectId,
        prompt: `432 Hz deep sleep ambient music for a ${durationMin}-minute ${project?.project_mode === 'sleep_meditation' ? 'guided meditation' : 'sleep story'} about "${topicName}". Ultra-calming, no percussion, no vocals. Gentle pads, soft atmospheric textures, very slow harmonic movement. Binaural-friendly, designed to induce deep relaxation and sleep. Think Brian Eno ambient meets 432 Hz healing frequency music. Extremely minimal, spacious, almost silent at times.`,
        mood: 'ambient_sleep',
        genre: '432hz_ambient'
      });

      const refreshed = await base44.entities.MusicTracks.filter({ project_id: projectId });
      setTracks(refreshed || []);
      await onRefetch();
    } catch (err) {
      console.error('Music generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Music className="w-4 h-4 text-indigo-400" />
          432Hz Sleep Music
          <Badge className="bg-indigo-500/20 text-indigo-300 text-[10px]">
            Ambient · No Percussion
          </Badge>
          {hasMusicReady && <Badge className="bg-green-500/20 text-green-300 text-[10px] ml-1">Ready</Badge>}
          {generating && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {generating && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating 432Hz ambient music...
            </div>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="space-y-2 mb-3">
            {tracks.filter(t => t.audio_url).map(track => (
              <div key={track.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-2.5">
                <Music className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 truncate">{track.title || '432Hz Ambient'}</p>
                  <audio src={track.audio_url} controls preload="none" className="w-full h-7 mt-1" />
                </div>
                {track.is_selected && (
                  <Badge className="bg-green-500/20 text-green-300 text-[10px] flex-shrink-0">Selected</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {!generating && (
          <Button
            size="sm"
            onClick={handleGenerateMusic}
            className={hasMusicReady ? "bg-white/10 hover:bg-white/15 text-white/60" : "bg-indigo-600 hover:bg-indigo-700"}
          >
            {hasMusicReady ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate Music</>
            ) : (
              <><Music className="w-3.5 h-3.5 mr-1" /> Generate 432Hz Music</>
            )}
          </Button>
        )}

        <p className="text-[10px] text-white/30 mt-3">
          432Hz tuning promotes deep relaxation. Music will be ultra-minimal ambient pads, no beats or vocals.
        </p>
      </CardContent>
    </Card>
  );
}