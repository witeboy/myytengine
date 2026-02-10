import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Mic, Loader2, CheckCircle2, Volume2 } from 'lucide-react';

export default function VoiceGeneration() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM');
  const [taskId, setTaskId] = useState(null);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: script } = useQuery({
    queryKey: ['script', projectId],
    queryFn: async () => {
      const scripts = await base44.entities.Scripts.list();
      return scripts.find(s => s.project_id === projectId && (s.version === 'final' || s.version === 'edited' || s.version === 'draft'));
    },
    enabled: !!projectId,
  });

  const { data: voices = [] } = useQuery({
    queryKey: ['voices'],
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke('listVoices', {});
        return response.data?.voices || [];
      } catch (error) {
        console.error('Error fetching voices:', error);
        return [];
      }
    },
  });

  useEffect(() => {
    if (project?.voiceover_task_id && project?.voiceover_status === 'generating') {
      setTaskId(project.voiceover_task_id);
    }
  }, [project]);

  useEffect(() => {
    if (!taskId || project?.voiceover_status === 'completed') return;

    const pollStatus = async () => {
      try {
        const response = await base44.functions.invoke('checkVoiceoverStatus', {
          task_id: taskId,
          project_id: projectId,
        });

        if (response.data?.status === 'done') {
          await refetchProject();
          setTaskId(null);
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };

    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [taskId, projectId, project?.voiceover_status]);

  const handleGenerateVoiceover = async () => {
    setIsGenerating(true);
    try {
      await base44.entities.Projects.update(projectId, {
        selected_voice_id: selectedVoice,
      });

      const response = await base44.functions.invoke('generateVoiceover', {
        project_id: projectId,
        script_id: script.id,
        voice_id: selectedVoice,
      });

      setTaskId(response.data?.task_id);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const isCompleted = project?.voiceover_status === 'completed';
  const isGeneratingNow = project?.voiceover_status === 'generating' || isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={9} />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Voice Generation</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Select Voice
              </CardTitle>
              <CardDescription>
                Choose a voice for your narration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedVoice} onValueChange={setSelectedVoice} disabled={isGeneratingNow}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Default)</SelectItem>
                  {voices.slice(0, 10).map((voice) => (
                    <SelectItem key={voice.voice_id} value={voice.voice_id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {script && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">
                    <strong>Script:</strong> {script.title}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Words:</strong> {script.word_count}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Estimated Duration:</strong> {Math.ceil(script.estimated_duration_sec / 60)} minutes
                  </p>
                </div>
              )}

              <Button
                onClick={handleGenerateVoiceover}
                disabled={isGeneratingNow || isCompleted || !script}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingNow ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Voiceover...
                  </>
                ) : isCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Voiceover Generated
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-2" />
                    Generate Voiceover
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {isCompleted && project?.voiceover_url && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <CheckCircle2 className="w-5 h-5" />
                  Voiceover Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <audio controls className="w-full mb-4">
                  <source src={project.voiceover_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => window.open(project.voiceover_url, '_blank')}
                    className="flex items-center gap-2"
                  >
                    <Volume2 className="w-4 h-4" />
                    Download Audio
                  </Button>
                  {project.voiceover_transcript_url && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(project.voiceover_transcript_url, '_blank')}
                    >
                      Download Transcript (SRT)
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl(`production_studio?project_id=${projectId}`))}
            >
              Back
            </Button>
            <Button
              onClick={() => navigate(createPageUrl(`production_studio?project_id=${projectId}`))}
              disabled={!isCompleted}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}