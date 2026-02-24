import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Zap, Check } from 'lucide-react';

export default function HookVariants({ analysis, newTitle, onSelectHook }) {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a viral YouTube hook expert. Generate 3 different hook variants (the first 10-15 seconds of narration) for a video titled "${newTitle}".

ORIGINAL VIDEO ANALYSIS:
- Original hook technique: ${analysis?.hook_technique || 'Unknown'}
- Original script style: ${analysis?.script_style || 'Unknown'}
- Tone: ${analysis?.tone_description || 'Unknown'}
- Pacing: ${analysis?.pacing || 'medium'}
${analysis?.original_script ? `- Original opening (first 200 chars): "${analysis.original_script.substring(0, 200)}..."` : ''}

Generate 3 DIFFERENT hooks for the new title "${newTitle}", each using a different technique:
1. MIRROR HOOK — Clone the exact hook style/technique from the original but for the new topic
2. PATTERN INTERRUPT — Start with something unexpected that forces the viewer to stop scrolling
3. CURIOSITY LOOP — Open a question/mystery that can only be answered by watching

Each hook should be 2-4 sentences, ready to read as voiceover narration. Match the original's energy and pacing.`,
      response_json_schema: {
        type: "object",
        properties: {
          hooks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                technique: { type: "string" },
                text: { type: "string" },
                why_it_works: { type: "string" }
              }
            }
          }
        }
      }
    });
    setHooks(result.hooks || []);
    setLoading(false);
  };

  const handleSelect = (idx) => {
    setSelectedIdx(idx);
    if (onSelectHook) onSelectHook(hooks[idx]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold">Hook Variants</span>
        <Badge variant="outline" className="text-[10px] ml-auto">A/B Test</Badge>
      </div>

      {hooks.length === 0 && !loading && (
        <Button onClick={handleGenerate} variant="outline" size="sm" className="w-full gap-1.5 text-xs border-dashed">
          <Zap className="w-3 h-3" /> Generate 3 Hook Variants
        </Button>
      )}

      {loading && (
        <div className="flex items-center gap-2 justify-center py-4 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Generating hook variants...
        </div>
      )}

      {hooks.length > 0 && (
        <div className="space-y-2">
          {hooks.map((hook, i) => (
            <Card key={i} className={`cursor-pointer transition-all ${selectedIdx === i ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-100 hover:border-gray-300'}`}
              onClick={() => handleSelect(i)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge className={`text-[9px] ${
                    i === 0 ? 'bg-blue-100 text-blue-700' :
                    i === 1 ? 'bg-amber-100 text-amber-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>{hook.label || hook.technique}</Badge>
                  {selectedIdx === i && <Check className="w-3 h-3 text-emerald-600 ml-auto" />}
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{hook.text}</p>
                {hook.why_it_works && (
                  <p className="text-[10px] text-gray-400 mt-1.5 italic">{hook.why_it_works}</p>
                )}
              </CardContent>
            </Card>
          ))}
          <Button onClick={handleGenerate} variant="ghost" size="sm" className="w-full gap-1 text-[10px] text-gray-400">
            <Zap className="w-3 h-3" /> Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}