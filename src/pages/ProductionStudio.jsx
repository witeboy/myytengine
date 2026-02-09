import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Copy, ArrowRight, Loader2, Zap } from 'lucide-react';

export default function ProductionStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: voiceProfiles = [] } = useQuery({
    queryKey: ['voice', projectId],
    queryFn: () => base44.entities.VoiceProfiles.list(),
  });

  const { data: visualPrompts = [] } = useQuery({
    queryKey: ['visuals', projectId],
    queryFn: () => base44.entities.VisualPrompts.list(),
  });

  const { data: assetPlans = [] } = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => base44.entities.AssetPlans.list(),
  });

  const { data: timings = [] } = useQuery({
    queryKey: ['timing', projectId],
    queryFn: () => base44.entities.TimingEntries.list(),
  });

  const voiceProfile = voiceProfiles.find(v => v.project_id === projectId);
  const visuals = visualPrompts.filter(v => v.project_id === projectId).sort((a, b) => a.scene_number - b.scene_number);
  const assetPlan = assetPlans.find(a => a.project_id === projectId);
  const timingEntries = timings.filter(t => t.project_id === projectId).sort((a, b) => a.entry_order - b.entry_order);

  const handleGenerateAll = async () => {
    setIsLoading(true);
    try {
      const script = await base44.entities.Scripts.get(project.script_id);

      await base44.functions.invoke('generateVoiceProfile', {
        project_id: projectId,
        tone: project.tone,
      });

      await base44.functions.invoke('generateVisualPrompts', {
        project_id: projectId,
        script_id: script.id,
      });

      await base44.functions.invoke('generateAssetPlan', {
        project_id: projectId,
      });

      await base44.functions.invoke('generateTimingSync', {
        project_id: projectId,
        script_id: script.id,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={project?.current_step || 8} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Production Studio</h1>

        <div className="space-y-6">
          {/* Voice Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Voice Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              {voiceProfile ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold">Tone:</span> {voiceProfile.tone}
                  </div>
                  <div>
                    <span className="font-semibold">Pacing:</span> {voiceProfile.pacing_style?.substring(0, 50)}...
                  </div>
                </div>
              ) : (
                <p className="text-gray-600">Not generated yet</p>
              )}
            </CardContent>
          </Card>

          {/* Visual Prompts */}
          <Card>
            <CardHeader>
              <CardTitle>Visual Prompts ({visuals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {visuals.length > 0 ? (
                  visuals.map((visual) => (
                    <div key={visual.id} className="border rounded-lg p-3 text-sm space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold">Scene {visual.scene_number}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(visual.sora_prompt)}
                          className="h-6 px-2"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-gray-600 line-clamp-2">{visual.sora_prompt}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600">Not generated yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Asset Plan */}
          <Card>
            <CardHeader>
              <CardTitle>Asset Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {assetPlan ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>AI Visuals: {assetPlan.ai_visual_percent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Stock B-roll: {assetPlan.stock_broll_percent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span>Archival: {assetPlan.archival_percent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span>Text Animation: {assetPlan.text_animation_percent}%</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-600">Not generated yet</p>
              )}
            </CardContent>
          </Card>

          {/* Timing Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timing Timeline ({timingEntries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
                {timingEntries.length > 0 ? (
                  timingEntries.map((entry) => (
                    <div key={entry.id} className="border rounded p-2 grid grid-cols-4 gap-2">
                      <div>
                        <span className="font-semibold">{entry.timestamp_start}</span>
                      </div>
                      <div className="line-clamp-2 text-gray-600">{entry.spoken_text}</div>
                      <div>
                        <Badge variant="secondary" className="text-xs">{entry.transition_type}</Badge>
                      </div>
                      <div>{entry.duration_seconds}s</div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600">Not generated yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleGenerateAll}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 py-6 text-base"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-2" />}
            Generate All Production Assets
          </Button>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => navigate(createPageUrl(`script_workshop?project_id=${projectId}`))}>
              Back
            </Button>
            <Button onClick={() => navigate(createPageUrl(`publish_center?project_id=${projectId}`))} className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}