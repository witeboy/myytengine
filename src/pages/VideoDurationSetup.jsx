import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Clock, FileText } from 'lucide-react';

export default function VideoDurationSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [duration, setDuration] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Projects.list();
      return projects.find(p => p.id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: topic } = useQuery({
    queryKey: ['selected-topic', projectId],
    queryFn: async () => {
      const topics = await base44.entities.Topics.list();
      return topics.find(t => t.project_id === projectId && t.is_selected);
    },
    enabled: !!projectId,
  });

  const handleGenerateOutline = async () => {
    setIsGenerating(true);
    try {
      await base44.functions.invoke('generateOutline', {
        project_id: projectId,
        topic_id: topic.id,
        topic_title: topic.title,
        niche: project.niche,
        duration_minutes: duration,
      });

      navigate(createPageUrl(`script_workshop?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const estimatedWords = duration * 150;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={2} />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Video Duration Setup</CardTitle>
            <CardDescription>
              Selected Topic: <span className="font-semibold text-gray-900">{topic?.title}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="duration" className="text-base">
                How long should your video be? (minutes)
              </Label>
              <div className="flex items-center gap-4 mt-3">
                <Input
                  id="duration"
                  type="number"
                  min="5"
                  max="60"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="text-lg w-32"
                />
                <span className="text-sm text-gray-600">minutes</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <Clock className="w-3 h-3 inline mr-1" />
                Recommended: 8-15 minutes for maximum retention
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                <FileText className="w-4 h-4" />
                Estimated Script Details
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Target Words:</span>
                  <span className="ml-2 font-semibold text-gray-900">~{estimatedWords}</span>
                </div>
                <div>
                  <span className="text-gray-600">Script Batches:</span>
                  <span className="ml-2 font-semibold text-gray-900">5 segments</span>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                AI will generate your script in batches of ~1500 words each, following professional storytelling structure.
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(createPageUrl(`topic_selection?project_id=${projectId}`))}
                disabled={isGenerating}
              >
                Back
              </Button>
              <Button
                onClick={handleGenerateOutline}
                disabled={isGenerating || !duration || duration < 5}
                className="bg-blue-600 hover:bg-blue-700 flex-1"
              >
                {isGenerating ? 'Generating Outline...' : 'Generate Outline & Script'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}