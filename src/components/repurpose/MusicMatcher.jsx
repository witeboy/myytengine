import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Music, Sparkles } from 'lucide-react';

export default function MusicMatcher({ analysis, projectId }) {
  const [musicPrompt, setMusicPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const handleSuggest = async () => {
    setSuggested(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Based on this video analysis, suggest a background music prompt for AI music generation.

Video details:
- Niche: ${analysis?.niche}
- Tone: ${analysis?.tone_description || analysis?.script_style}
- Pacing: ${analysis?.pacing}
- Content: ${analysis?.content_structure?.substring(0, 200)}

Return a single concise music generation prompt (1-2 sentences) describing the genre, mood, tempo, and instruments. Example: "Cinematic orchestral score with deep bass drums, suspenseful strings, building tension at 90 BPM"`,
    });
    setMusicPrompt(typeof result === 'string' ? result.replace(/^["']|["']$/g, '') : '');
  };

  const handleGenerate = async () => {
    if (!musicPrompt || !projectId) return;
    setGenerating(true);
    await base44.functions.invoke('generateMusic', {
      project_id: projectId,
      prompt: musicPrompt,
    });
    setGenerating(false);
    setGenerated(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-pink-500" />
        <span className="text-sm font-semibold">Background Music</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={musicPrompt}
          onChange={e => setMusicPrompt(e.target.value)}
          placeholder="e.g. Dark cinematic orchestra, suspenseful, 90 BPM..."
          className="text-xs flex-1"
        />
        {!suggested && (
          <Button variant="outline" size="sm" className="gap-1 text-xs flex-shrink-0" onClick={handleSuggest}>
            <Sparkles className="w-3 h-3" /> Suggest
          </Button>
        )}
      </div>

      {musicPrompt && projectId && !generated && (
        <Button onClick={handleGenerate} disabled={generating} variant="outline" size="sm" className="w-full gap-1 text-xs">
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
          {generating ? 'Generating...' : 'Generate Background Music'}
        </Button>
      )}

      {generated && (
        <Badge className="bg-green-100 text-green-700 text-[10px]">Music queued — will appear in Content Editor</Badge>
      )}
    </div>
  );
}