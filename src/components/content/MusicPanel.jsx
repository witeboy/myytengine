import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Loader2, Music, Play, Pause, Check, RefreshCw, Volume2 } from 'lucide-react';

export default function MusicPanel({ project }) {
  const [generating, setGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [audioEl, setAudioEl] = useState(null);

  const { data: tracks = [], refetch } = useQuery({
    queryKey: ['music', project?.id],
    queryFn: () => base44.entities.MusicTracks.filter({ project_id: project.id }),
    enabled: !!project?.id,
  });

  const handleGenerate = async () => {
    setGenerating(true);
    const prompt = customPrompt || 
      `Create background music for a ${project.niche || 'general'} YouTube video with a ${project.tone || 'dramatic'} tone. ` +
      `The music should be cinematic, royalty-free style, suitable for storytelling narration.`;
    
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Based on this music request: "${prompt}"
      
Generate 3 distinct background music track concepts for a YouTube video. Return JSON:
{
  "tracks": [
    { "title": "string", "genre": "string", "mood": "string", "detailed_prompt": "string describing the exact musical elements, instruments, tempo, key" }
  ]
}`,
      response_json_schema: {
        type: "object",
        properties: {
          tracks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                genre: { type: "string" },
                mood: { type: "string" },
                detailed_prompt: { type: "string" }
              }
            }
          }
        }
      }
    });

    if (result?.tracks) {
      for (const track of result.tracks) {
        await base44.entities.MusicTracks.create({
          project_id: project.id,
          title: track.title,
          genre: track.genre,
          mood: track.mood,
          prompt: track.detailed_prompt,
          status: 'completed',
        });
      }
    }
    await refetch();
    setGenerating(false);
  };

  const handleSelect = async (trackId) => {
    // Deselect all then select this one
    for (const t of tracks) {
      if (t.is_selected) await base44.entities.MusicTracks.update(t.id, { is_selected: false });
    }
    await base44.entities.MusicTracks.update(trackId, { is_selected: true });
    refetch();
  };

  const handleVolumeChange = async (trackId, vol) => {
    await base44.entities.MusicTracks.update(trackId, { volume: vol });
    refetch();
  };

  const togglePlay = (track) => {
    if (playingId === track.id) {
      audioEl?.pause();
      setPlayingId(null);
      setAudioEl(null);
      return;
    }
    if (audioEl) audioEl.pause();
    if (track.audio_url) {
      const a = new Audio(track.audio_url);
      a.play();
      a.onended = () => { setPlayingId(null); setAudioEl(null); };
      setAudioEl(a);
      setPlayingId(track.id);
    }
  };

  const selectedTrack = tracks.find(t => t.is_selected);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Music className="w-4 h-4" /> Background Music
          {selectedTrack && <Badge className="bg-green-100 text-green-800 text-xs">Selected</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Custom prompt */}
        <div className="flex gap-2">
          <Input
            placeholder={`Music for ${project?.niche || 'your'} video...`}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>

        {tracks.length === 0 && !generating && (
          <div className="text-center py-6 text-gray-400">
            <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No music tracks yet</p>
            <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating} className="mt-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Generate Music Concepts
            </Button>
          </div>
        )}

        {/* Track list */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {tracks.map(track => (
            <div
              key={track.id}
              className={`p-3 rounded-lg border transition-all ${
                track.is_selected ? 'bg-green-50 border-green-300' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {track.audio_url && (
                  <button
                    onClick={() => togglePlay(track)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"
                  >
                    {playingId === track.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-gray-500">{track.genre} · {track.mood}</p>
                </div>
                <Button
                  size="sm"
                  variant={track.is_selected ? "default" : "outline"}
                  onClick={() => handleSelect(track.id)}
                  className={`h-7 text-xs ${track.is_selected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  {track.is_selected ? <><Check className="w-3 h-3 mr-1" /> Selected</> : 'Select'}
                </Button>
              </div>

              {track.is_selected && (
                <div className="mt-2 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                  <Slider
                    value={[track.volume ?? 0.3]}
                    onValueChange={([v]) => handleVolumeChange(track.id, v)}
                    min={0}
                    max={1}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 w-8">{Math.round((track.volume ?? 0.3) * 100)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}