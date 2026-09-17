import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import { buildNicheForDuration } from '@/lib/longViralNicheData';
import StageProgress from '@/components/StageProgress';
import LongViralNicheSelector from '@/components/longviral/LongViralNicheSelector';
import LongViralStructureView from '@/components/longviral/LongViralStructureView';
import LongViralScriptStage from '@/components/longviral/LongViralScriptStage';
import { ArrowRight, Loader2, CheckCircle2,
  FileText, Layers, ImageIcon, Clock
} from 'lucide-react';

export default function LongViralPipeline() {
  const navigate = useNavigate();
  const rawProjectId = new URLSearchParams(window.location.search).get('project_id');
  const projectId = rawProjectId && rawProjectId !== 'null' ? rawProjectId : null;
  const [selectedNiche, setSelectedNiche] = useState('finance');
  const [durationMin, setDurationMin] = useState(10);
  const [userAdvanced, setUserAdvanced] = useState(false);
  const [savingDuration, setSavingDuration] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await api.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['longviral-scripts', projectId],
    queryFn: () => api.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project?.video_duration_minutes) setDurationMin(project.video_duration_minutes);
  }, [project?.video_duration_minutes]);

  // How often the video cuts. The breakdown gives every scene a slice of narration, so
  // this — not the video length — decides how many scenes (and images) a script becomes.
  const PACING = [
    { id: 'director', label: "Director's beats", words: 14, blurb: 'Scenes break where the story turns. The count comes from the script.' },
    { id: 'fast', label: 'Fast', words: 7, blurb: 'A cut every ~3s. Relentless, most scenes.' },
    { id: 'standard', label: 'Standard', words: 12, blurb: 'A cut every ~5s. Documentary pace.' },
    { id: 'cinematic', label: 'Cinematic', words: 18, blurb: 'A cut every ~7s. Lets shots breathe.' },
  ];
  const [pacing, setPacing] = useState('director');
  useEffect(() => {
    if (project?.scene_pacing) setPacing(project.scene_pacing);
  }, [project?.scene_pacing]);
  const pacingChoice = PACING.find(p => p.id === pacing) || PACING[0];
  // ~150 spoken words a minute, so words-per-scene sets the seconds per scene.
  const estimatedScenes = Math.round((durationMin * 150) / pacingChoice.words);

  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');

  let activeStage = 'blueprint';
  if (hasFinalScript) activeStage = 'handoff';
  if (userAdvanced && !hasFinalScript) activeStage = 'script';

  const structure = buildNicheForDuration(selectedNiche, durationMin);

  const handleSaveDuration = async () => {
    setSavingDuration(true);
    await api.entities.Projects.update(projectId, { video_duration_minutes: durationMin, scene_pacing: pacing });
    await refetchProject();
    setSavingDuration(false);
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge className="bg-amber-100 text-amber-700 text-[10px]">🎬 Long Viral</Badge>
            </div>
            <p className="text-gray-600">
              {durationMin} minutes · {project.orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'} · Same viral structure, long-form depth
            </p>
          </div>
          {activeStage === 'handoff' && (
            <Button
              onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              Content Generation <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Blueprint Stage */}
        {activeStage === 'blueprint' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Duration & Structure</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Duration Selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Video Duration (minutes)</label>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      min={3}
                      max={60}
                      value={durationMin}
                      onChange={e => setDurationMin(Math.max(3, Math.min(60, parseInt(e.target.value) || 10)))}
                      className="w-24 text-lg"
                    />
                    <div className="flex gap-2">
                      {[5, 8, 10, 15, 20].map(d => (
                        <button key={d} onClick={() => setDurationMin(d)}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                            durationMin === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>{d}m</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-700">{durationMin}</p>
                    <p className="text-xs text-blue-600">minutes</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-purple-700">{(durationMin * 160).toLocaleString()}</p>
                    <p className="text-xs text-purple-600">words</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <Layers className="w-5 h-5 text-green-600 mx-auto mb-1" />
                    {/* This used to assume five seconds a scene regardless of pacing,
                        so it promised half the scenes the breakdown actually created. */}
                    <p className="text-2xl font-bold text-green-700">~{estimatedScenes}</p>
                    <p className="text-xs text-green-600">scenes</p>
                  </div>
                </div>

                {/* Scene pacing — the real driver of scene count and image spend */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Scene pacing</h4>
                    <span className="text-xs text-gray-500">
                      {pacing === 'director'
                        ? 'The script decides — roughly ' + estimatedScenes + ' scenes'
                        : `~${estimatedScenes} scenes · about $${(estimatedScenes * 0.02).toFixed(2)} of images`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {PACING.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPacing(option.id)}
                        className={`rounded-lg border p-3 text-left transition ${
                          pacing === option.id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{option.label}</p>
                        <p className="text-[11px] leading-tight text-gray-500">{option.blurb}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Niche Selector */}
                <LongViralNicheSelector value={selectedNiche} onChange={setSelectedNiche} />

                {/* Structure View */}
                {structure && <LongViralStructureView structure={structure} />}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => { handleSaveDuration(); setUserAdvanced(true); }}
                className="bg-blue-600 hover:bg-blue-700 gap-2" size="lg">
                Continue to Script Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Script Stage */}
        {(activeStage === 'script' || hasFinalScript) && (
          <div className="space-y-6">
            <LongViralScriptStage projectId={projectId} project={project} scripts={scripts}
              onRefetch={async () => { await Promise.all([refetchScripts(), refetchProject()]); }} />
          </div>
        )}

        {/* Handoff */}
        {activeStage === 'handoff' && (
          <Card className="mt-6">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold mb-1">Script Complete</h3>
              <p className="text-gray-500 text-sm mb-4">
                Your {durationMin}-minute script is ready. Continue to Content Generation for scene breakdown, images, and video production.
              </p>
              <Button onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
                className="bg-blue-600 hover:bg-blue-700 gap-2">
                <ImageIcon className="w-4 h-4" /> Continue to Content Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}