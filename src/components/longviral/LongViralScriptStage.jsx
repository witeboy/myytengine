import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, CheckCircle2, FileText, Copy } from 'lucide-react';

export default function LongViralScriptStage({ projectId, project, scripts, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('');

  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');
  const finalScript = scripts.find(s => s.version === 'final_aggregated');
  const dur = project?.video_duration_minutes || 10;

  const handleGenerate = async () => {
    setGenerating(true);
    setPhase(`Generating ${dur}-minute Long Viral script...`);
    try {
      await base44.functions.invoke('longViralGenerateScript', { project_id: projectId });
      setPhase('Script generated!');
      await onRefetch();
    } catch (err) {
      console.error('Long Viral script generation failed:', err);
      setPhase('Failed: ' + (err.message || 'Unknown error'));
    }
    setGenerating(false);
  };

  const copyScript = () => {
    if (finalScript?.full_script) navigator.clipboard.writeText(finalScript.full_script);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-gray-900">Stage 1: Script Generation</h3>
            {hasFinalScript && <Badge className="bg-green-100 text-green-700 text-[10px]">Complete</Badge>}
          </div>
          {!hasFinalScript && (
            <Button onClick={handleGenerate} disabled={generating} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generating ? phase : `Generate ${dur}-Min Script`}
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-500 mb-4">
          AI generates a ~{dur * 160} word script using the same viral niche structure, expanded for {dur}-minute long-form depth.
        </p>

        {generating && !hasFinalScript && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <p className="text-sm text-amber-700">{phase}</p>
          </div>
        )}

        {hasFinalScript && finalScript && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-900 font-medium">{finalScript.title || project?.name}</span>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {finalScript.word_count || finalScript.full_script?.split(/\s+/).length || '?'} words
                </Badge>
                {finalScript.estimated_duration_sec && (
                  <Badge variant="secondary" className="text-[10px]">
                    ~{Math.round(finalScript.estimated_duration_sec / 60)}min
                  </Badge>
                )}
                <Button size="sm" variant="ghost" onClick={copyScript} className="h-7 gap-1">
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
              {finalScript.full_script}
            </div>
            <Button onClick={handleGenerate} disabled={generating} variant="outline" size="sm" className="gap-1">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Regenerate Script
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}