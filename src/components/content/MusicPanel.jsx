import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Music, Play, Pause, Check, RefreshCw, Volume2, Wand2, Pencil, Save, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function MusicPanel({ project }) {
  const [generating, setGenerating] = useState(false);
  const [generatingTrackId, setGeneratingTrackId] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [audioEl, setAudioEl] = useState(null);
  const [editingPromptId, setEditingPromptId] = useState(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const pollRef = useRef(null);

  const { data: tracks = [], refetch } = useQuery({
    queryKey: ['music', project?.id],
    queryFn: () => base44.entities.MusicTracks.filter({ project_id: project.id }),
    enabled: !!project?.id,
  });

  useEffect(() => {
    const genTrack = tracks.find(t => t.status === 'generating');
    if (genTrack && !pollRef.current) {
      setGeneratingTrackId(genTrack.id);
      pollRef.current = setInterval(async () => {
        await refetch();
      }, 5000);
    }
    if (!genTrack && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setGeneratingTrackId(null);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tracks]);

  const isSleepProject = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';

  const SLEEP_MUSIC_PROMPT = 'Deep ambient sleep music, 432Hz healing frequency, consistent low-end drone, warm synthesizer pads, minimal variation, extremely slow tempo, no percussion, no melodies, seamless loop, spatially immersive, dark calming atmosphere.';

  const handleGenerateConcepts = async () => {
    setGenerating(true);
    const prompt = customPrompt ||
      (isSleepProject
        ? SLEEP_MUSIC_PROMPT
        : `Create background music for a ${project.niche || 'general'} YouTube video with a ${project.tone || 'dramatic'} tone. Cinematic, suitable for storytelling narration.`);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Based on this request: "${prompt}"
Generate 3 distinct background music track concepts for a YouTube video. Each should have a detailed prompt suitable for AI music generation.
Return JSON:
{
  "tracks": [
    { "title": "string", "genre": "string", "mood": "string", "detailed_prompt": "A detailed description of the music: instruments, tempo, key, energy, style. E.g. 'Soft ambient piano with gentle strings, 80 BPM, C minor, melancholic and reflective, with subtle reverb and distant choir pads'" }
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
          status: 'pending',
        });
      }
    }
    await refetch();
    setGenerating(false);
  };

  const handleGenerateAudio = async (track) => {
    setGeneratingTrackId(track.id);
    let res;
    try {
      res = await base44.functions.invoke('generateMusic', {
        track_id: track.id,
        prompt: track.prompt,
        genre: track.genre,
        mood: track.mood,
      });
    } catch (err) {
      console.error('generateMusic failed:', err);
      const msg = err?.response?.data?.error || err.message || 'Music generation failed';
      await base44.entities.MusicTracks.update(track.id, { status: 'failed' });
      setGeneratingTrackId(null);
      refetch();
      toast({ title: 'Music Generation Failed', description: msg, variant: 'destructive', duration: 3000 });
      return;
    }
    const taskId = res.data?.task_id;
    const status = res.data?.status;

    if (status === 'completed') {
      setGeneratingTrackId(null);
      refetch();
      return;
    }

    if (taskId) {
      let failCount = 0;
      const poll = setInterval(async () => {
        try {
          const statusRes = await base44.functions.invoke('checkMusicStatus', {
            task_id: taskId,
            track_id: track.id,
          });
          const st = statusRes.data?.status;
          failCount = 0;
          if (st === 'COMPLETED' || st === 'completed' || st === 'FAILED' || st === 'failed') {
            clearInterval(poll);
            setGeneratingTrackId(null);
            refetch();
          }
        } catch (err) {
          failCount++;
          console.warn('Music status check failed:', err.message);
          if (failCount >= 5) {
            clearInterval(poll);
            setGeneratingTrackId(null);
            await base44.entities.MusicTracks.update(track.id, { status: 'failed' });
            refetch();
            toast({ title: 'Music Status Check Failed', description: 'Could not verify music generation status after multiple attempts.', variant: 'destructive', duration: 3000 });
          }
        }
      }, 15000);
    } else {
      setGeneratingTrackId(null);
      refetch();
    }
  };

  const handleSelect = async (trackId) => {
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

  const handleSavePrompt = async (trackId) => {
    await base44.entities.MusicTracks.update(trackId, { prompt: editedPrompt });
    setEditingPromptId(null);
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
        <div className="flex gap-2">
          <Input
            placeholder={`Music for ${project?.niche || 'your'} video...`}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleGenerateConcepts}
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
            <Button size="sm" variant="outline" onClick={handleGenerateConcepts} disabled={generating} className="mt-2">
              Generate Music Concepts
            </Button>
          </div>
        )}

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {tracks.map(track => (
            <div
              key={track.id}
              className={`p-3 rounded-lg border transition-all ${
                track.is_selected ? 'bg-green-50 border-green-300' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {track.audio_url ? (
                  <button
                    onClick={() => togglePlay(track)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"
                  >
                    {playingId === track.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                  </button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateAudio(track)}
                    disabled={generatingTrackId === track.id || track.status === 'generating'}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingTrackId === track.id || track.status === 'generating' 
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Wand2 className="w-3 h-3" />}
                    {track.status === 'generating' ? 'Generating...' : 'Generate'}
                  </Button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-gray-500">{track.genre} · {track.mood}</p>
                </div>
                {track.audio_url && (
                  <Button
                    size="sm"
                    variant={track.is_selected ? "default" : "outline"}
                    onClick={() => handleSelect(track.id)}
                    className={`h-7 text-xs ${track.is_selected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  >
                    {track.is_selected ? <><Check className="w-3 h-3 mr-1" /> Selected</> : 'Select'}
                  </Button>
                )}
                {track.status === 'failed' && (
                  <Badge className="bg-red-100 text-red-700 text-xs">Failed</Badge>
                )}
              </div>

              {/* Editable Prompt Section */}
              {editingPromptId === track.id ? (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="text-xs bg-gray-50 border-gray-200 min-h-[60px]"
                    placeholder="Describe the music style, tempo, instruments, mood..."
                  />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                      onClick={() => setEditingPromptId(null)}>
                      <X className="w-3 h-3 mr-0.5" /> Cancel
                    </Button>
                    <Button size="sm" className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 gap-1"
                      onClick={() => handleSavePrompt(track.id)}>
                      <Save className="w-3 h-3" /> Save Prompt
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingPromptId(track.id); setEditedPrompt(track.prompt || ''); }}
                  className="text-[10px] text-gray-400 mt-1.5 text-left w-full flex items-start gap-1 group hover:text-gray-600 transition-colors"
                >
                  <Pencil className="w-2.5 h-2.5 mt-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                  <span className={track.prompt ? 'line-clamp-2' : 'italic text-gray-300'}>
                    {track.prompt || '+ Add prompt description'}
                  </span>
                </button>
              )}

              {track.is_selected && track.audio_url && (
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