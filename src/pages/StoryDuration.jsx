import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import ScriptModeSelector from '@/components/script/ScriptModeSelector';
import { Loader2, Clock, FileText, Layers, ArrowRight, ArrowLeft } from 'lucide-react';

export default function StoryDuration() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [duration, setDuration] = useState(null);
  const [scriptMode, setScriptMode] = useState('');
  const [shortsNiche, setShortsNiche] = useState('finance');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project && !hasInitialized) {
      const saved = project.video_duration_minutes;
      setDuration(saved && saved > 0 ? saved : 8);
      setScriptMode(project.project_mode || '');
      setHasInitialized(true);
    }
  }, [project, hasInitialized]);

  const { data: topic } = useQuery({
    queryKey: ['topic', project?.selected_topic_id],
    queryFn: async () => {
      const list = await base44.entities.Topics.filter({ id: project.selected_topic_id });
      return list[0];
    },
    enabled: !!project?.selected_topic_id,
  });

  const isShorts = scriptMode === 'youtube_shorts';
  const isSleepProject = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
  const safeDuration = isShorts ? 1.5 : (duration || 8);
  const totalWords = isShorts ? 220 : safeDuration * 150;
  const numBatches = isShorts ? 1 : Math.max(2, Math.ceil(totalWords / (isSleepProject ? 1100 : 800)));

  const handleGenerate = async () => {
    const finalDuration = isShorts ? 1.5 : Math.max(1, Math.round(safeDuration));
    setLoading(true);
    await base44.entities.Projects.update(projectId, {
      video_duration_minutes: finalDuration,
      project_mode: scriptMode || '',
      orientation: isShorts ? 'portrait' : (project?.orientation || 'landscape'),
    });

    // Shorts skip outline — go straight to script page which uses shortsGenerateScript
    if (isShorts) {
      await base44.entities.Projects.update(projectId, { status: 'hooks_ready' });
      navigate(createPageUrl(`StoryScript?project_id=${projectId}`));
      setLoading(false);
      return;
    }

    const res = await base44.functions.invoke('generateOutline', {
      project_id: projectId,
      topic_id: project.selected_topic_id,
      topic_title: topic?.title || project.name,
      niche: project.niche,
      duration_minutes: finalDuration,
    });

    if (res.data?.error) {
      setLoading(false);
      return;
    }

    navigate(createPageUrl(`StoryScript?project_id=${projectId}`));
  };

  const handleContinue = async () => {
    const finalDuration = isShorts ? 1.5 : Math.max(1, Math.round(safeDuration));
    const modeChanged = (scriptMode || '') !== (project.project_mode || '');
    if (finalDuration !== project.video_duration_minutes || modeChanged) {
      setLoading(true);
      await base44.entities.Projects.update(projectId, {
        video_duration_minutes: finalDuration,
        project_mode: scriptMode || '',
        orientation: isShorts ? 'portrait' : (project?.orientation || 'landscape'),
      });
      if (!isShorts) {
        await base44.functions.invoke('generateOutline', {
          project_id: projectId,
          topic_id: project.selected_topic_id,
          topic_title: topic?.title || project.name,
          niche: project.niche,
          duration_minutes: finalDuration,
        });
      }
      setLoading(false);
    }
    navigate(createPageUrl(`StoryScript?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Set Video Duration</h1>
            <p className="text-gray-600">
              Topic: <span className="font-semibold">{topic?.title || 'Loading...'}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(createPageUrl(`StoryTopics?project_id=${projectId}`))} className="gap-2" size="sm">
              <ArrowLeft className="w-4 h-4" /> Topics
            </Button>
            {project && ['outline_ready','hooks_ready','scripting','script_complete','voiceover_ready','scene_breakdown','breakdown_complete','content_generation','scenes_ready'].includes(project.status) ? (
              <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700 gap-2" size="lg" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? 'Regenerating...' : 'Continue'}
              </Button>
            ) : (
              <Button onClick={handleGenerate} disabled={loading || duration === null} className="bg-blue-600 hover:bg-blue-700 gap-2" size="lg">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? 'Generating...' : 'Generate & Continue'}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Duration & Batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ScriptModeSelector
              value={scriptMode}
              onChange={setScriptMode}
              shortsNiche={shortsNiche}
              onShortsNicheChange={setShortsNiche}
            />

            {isShorts ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📱</span>
                  <span className="text-sm font-semibold text-green-800">YouTube Shorts Mode</span>
                </div>
                <p className="text-xs text-green-700">Duration is fixed at ~90 seconds. Script will be 200–240 words with visual changes every 2–3 seconds. Portrait 9:16 format.</p>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium mb-2 block">Video Duration (minutes)</label>
                <Input
                  type="number"
                  min={2}
                  max={480}
                  value={safeDuration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="text-lg"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-700">{safeDuration}</p>
                <p className="text-xs text-blue-600">minutes</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-purple-700">{totalWords.toLocaleString()}</p>
                <p className="text-xs text-purple-600">words</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <Layers className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700">{numBatches}</p>
                <p className="text-xs text-green-600">batches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}