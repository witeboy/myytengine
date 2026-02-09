import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Loader } from 'lucide-react';

export default function production_studio() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: voiceProfile } = useQuery({
    queryKey: ['voiceProfile', projectId],
    queryFn: async () => {
      const list = await base44.entities.VoiceProfiles.list();
      return list.find(v => v.project_id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: visuals = [] } = useQuery({
    queryKey: ['visuals', projectId],
    queryFn: async () => {
      const list = await base44.entities.VisualPrompts.list();
      return list.filter(v => v.project_id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: assetPlan } = useQuery({
    queryKey: ['assetPlan', projectId],
    queryFn: async () => {
      const list = await base44.entities.AssetPlans.list();
      return list.find(a => a.project_id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: timing = [] } = useQuery({
    queryKey: ['timing', projectId],
    queryFn: async () => {
      const list = await base44.entities.TimingEntries.list();
      return list.filter(t => t.project_id === projectId).sort((a, b) => a.entry_order - b.entry_order);
    },
    enabled: !!projectId,
  });

  const handleGenerateAll = async () => {
    setIsLoading(true);
    try {
      const scriptList = await base44.entities.Scripts.list();
      const finalScript = scriptList
        .filter(s => s.project_id === projectId)
        .find(s => s.version === 'final');

      const result = await base44.functions.invoke('runFullPipeline', {
        project_id: projectId,
      });

      navigate(createPageUrl(`publish_center?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    navigate(createPageUrl(`publish_center?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={8} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Production Studio</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {voiceProfile && (
            <Card>
              <CardHeader>
                <CardTitle>Voice Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Tone:</strong> {voiceProfile.tone}</p>
                <p><strong>Pacing:</strong> {voiceProfile.pacing_style}</p>
                <p><strong>Emotion Range:</strong> {voiceProfile.emotion_range}</p>
              </CardContent>
            </Card>
          )}

          {assetPlan && (
            <Card>
              <CardHeader>
                <CardTitle>Asset Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>AI Visuals: {assetPlan.ai_visual_percent}%</p>
                <p>Stock B-roll: {assetPlan.stock_broll_percent}%</p>
                <p>Archival: {assetPlan.archival_percent}%</p>
                <p>Text Animation: {assetPlan.text_animation_percent}%</p>
              </CardContent>
            </Card>
          )}

          {visuals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Visual Prompts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{visuals.length} scenes generated</p>
                <p className="text-gray-600">Sora 2.0 prompts ready for generation</p>
              </CardContent>
            </Card>
          )}

          {timing.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Timing Sync</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{timing.length} timing entries</p>
                <p className="text-gray-600">Scene-to-voiceover mapping complete</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Button
          onClick={handleGenerateAll}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg mb-8"
        >
          {isLoading ? (
            <>
              <Loader className="w-5 h-5 mr-2 animate-spin" />
              Generating all assets...
            </>
          ) : (
            'Generate All Remaining Assets'
          )}
        </Button>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl(`script_workshop?project_id=${projectId}`))}
          >
            Back
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={handleNext}
          >
            Continue to Publish Center
          </Button>
        </div>
      </div>
    </div>
  );
}