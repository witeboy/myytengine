import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/utils';
import { SHORTS_NICHES, SCRIPT_EXAMPLES } from '@/lib/shortsNicheData';
import ShortsNicheSelector from '@/components/shorts/ShortsNicheSelector';
import ShortsStructureView from '@/components/shorts/ShortsStructureView';
import ShortsScriptExample from '@/components/shorts/ShortsScriptExample';
import ShortsEngineSpecs from '@/components/shorts/ShortsEngineSpecs';
import ShortsScriptStage from '@/components/shorts/ShortsScriptStage';
import ShortsScenesStage from '@/components/shorts/ShortsScenesStage';
import {
  ArrowLeft, ArrowRight, Film, Loader2, CheckCircle2, Circle,
  FileText, Layers, ImageIcon, Zap, Clock, Hash, AlertCircle
} from 'lucide-react';

// ── Mirror of backend SECTION_PACING — kept in sync ───────────────
// If you change the backend table, update this too.
const SECTION_PACING = [
  { name: 'hook',     start:  0, end:  5,  secPerScene: 1.5, color: 'emerald', label: 'Hook' },
  { name: 'tension',  start:  5, end: 20,  secPerScene: 2.0, color: 'red',     label: 'Tension' },
  { name: 'pivot',    start: 20, end: 25,  secPerScene: 2.5, color: 'amber',   label: 'Pivot' },
  { name: 'value',    start: 25, end: 70,  secPerScene: 3.0, color: 'blue',    label: 'Value (3 rules)' },
  { name: 'cta',      start: 70, end: 85,  secPerScene: 2.0, color: 'purple',  label: 'CTA' },
  { name: 'deadzone', start: 85, end: 90,  secPerScene: 5.0, color: 'gray',    label: 'End Card' },
];

// Mirrors backend estimateDuration() exactly
function estimateDuration(scriptText) {
  if (!scriptText) return 90;
  const words = scriptText.trim().split(/\s+/).filter(w => w.length > 0).length;
  return Math.min(90, Math.max(15, Math.round(words / 2.67)));
}

// Mirrors backend buildSectionPlan() exactly
function buildSectionPlan(totalDurationSeconds) {
  const scale = totalDurationSeconds / 90;
  let sceneNumber = 1;
  return SECTION_PACING.map(section => {
    const sectionDuration = (section.end - section.start) * scale;
    const count = Math.max(1, Math.round(sectionDuration / section.secPerScene));
    const assignedDuration = sectionDuration / count;
    const plan = {
      ...section,
      startTime: Math.round(section.start * scale),
      endTime: Math.round(section.end * scale),
      sectionDuration: Math.round(sectionDuration * 10) / 10,
      sceneCount: count,
      secPerScene: Math.round(assignedDuration * 10) / 10,
      firstScene: sceneNumber,
      lastScene: sceneNumber + count - 1,
    };
    sceneNumber += count;
    return plan;
  });
}

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', bar: 'bg-emerald-500', ring: 'ring-emerald-500/40' },
  red:     { bg: 'bg-red-500/20',     text: 'text-red-300',     bar: 'bg-red-500',     ring: 'ring-red-500/40' },
  amber:   { bg: 'bg-amber-500/20',   text: 'text-amber-300',   bar: 'bg-amber-500',   ring: 'ring-amber-500/40' },
  blue:    { bg: 'bg-blue-500/20',    text: 'text-blue-300',    bar: 'bg-blue-500',    ring: 'ring-blue-500/40' },
  purple:  { bg: 'bg-purple-500/20',  text: 'text-purple-300',  bar: 'bg-purple-500',  ring: 'ring-purple-500/40' },
  gray:    { bg: 'bg-white/5',        text: 'text-white/40',    bar: 'bg-white/20',    ring: 'ring-white/10' },
};

const STAGES = [
  { key: 'blueprint', label: 'Blueprint', icon: Zap },
  { key: 'script',    label: 'Script',    icon: FileText },
  { key: 'scenes',    label: 'Scenes',    icon: Layers },
  { key: 'handoff',   label: 'Content Gen', icon: Film },
];

// ── Stage pill ────────────────────────────────────────────────────
function StagePill({ stage, isActive, isComplete, onClick }) {
  const Icon = stage.icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
        isActive   ? 'bg-green-500/20 text-green-300 ring-2 ring-green-500/40' :
        isComplete ? 'bg-green-900/30 text-green-500 hover:bg-green-900/50' :
                     'bg-white/5 text-white/30'
      }`}
    >
      {isComplete
        ? <CheckCircle2 className="w-3.5 h-3.5" />
        : isActive
          ? <div className="w-3.5 h-3.5 rounded-full bg-green-400 animate-pulse" />
          : <Circle className="w-3.5 h-3.5" />}
      <Icon className="w-3.5 h-3.5" />
      {stage.label}
    </button>
  );
}

// ── Live section plan preview ─────────────────────────────────────
function SectionPlanPreview({ scriptText, liveScenes }) {
  const duration = estimateDuration(scriptText);
  const plan = buildSectionPlan(duration);
  const totalScenes = plan.reduce((s, p) => s + p.sceneCount, 0);

  // If we have real scenes, show per-section actual counts
  const actualCounts = {};
  if (liveScenes?.length > 0) {
    liveScenes.forEach(s => {
      const sec = s.act || 'unknown';
      actualCounts[sec] = (actualCounts[sec] || 0) + 1;
    });
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-white/40 tracking-widest font-bold uppercase">Live Scene Plan</p>
        <div className="flex items-center gap-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{duration}s script</span>
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{totalScenes} scenes</span>
          <span>≈ {(duration / totalScenes).toFixed(1)}s avg</span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="flex h-6 rounded-lg overflow-hidden mb-3 gap-px">
        {plan.map(section => {
          const c = COLOR_MAP[section.color];
          const widthPct = (section.sectionDuration / duration) * 100;
          return (
            <div
              key={section.name}
              className={`${c.bar} flex items-center justify-center`}
              style={{ width: `${widthPct}%` }}
              title={`${section.label}: ${section.sceneCount} scenes × ${section.secPerScene}s`}
            >
              {widthPct > 8 && (
                <span className="text-[8px] text-white font-bold truncate px-1">{section.sceneCount}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Section breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {plan.map(section => {
          const c = COLOR_MAP[section.color];
          const actual = actualCounts[section.name];
          const hasActual = liveScenes?.length > 0;
          return (
            <div key={section.name} className={`${c.bg} rounded-lg p-2`}>
              <p className={`text-[9px] font-bold tracking-wide uppercase ${c.text} mb-1`}>{section.label}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-white text-sm font-bold">
                  {hasActual ? (actual || 0) : section.sceneCount}
                </span>
                {hasActual && actual !== section.sceneCount && (
                  <span className={`text-[8px] ${c.text}`}>/{section.sceneCount}</span>
                )}
                <span className="text-white/30 text-[9px]">scenes</span>
              </div>
              <p className="text-white/30 text-[9px]">{section.secPerScene}s each</p>
              <p className="text-white/20 text-[8px]">{section.startTime}–{section.endTime}s</p>
            </div>
          );
        })}
      </div>

      {liveScenes?.length > 0 && liveScenes.length !== totalScenes && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
          <AlertCircle className="w-3 h-3" />
          {liveScenes.length} scenes generated vs {totalScenes} planned — re-run breakdown to sync
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function ShortsPipeline() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [selectedNiche, setSelectedNiche] = useState('finance');
  const [activeStageKey, setActiveStageKey] = useState('blueprint');
  const [breakingDown, setBreakingDown] = useState(false);
  const [breakdownError, setBreakdownError] = useState(null);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['shorts-scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['shorts-scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  const finalScript = scripts.find(s => s.version === 'final_aggregated');
  const hasFinalScript = !!finalScript;
  const hasScenes = scenes.length > 0;

  // FIX: correct status check — breakdown sets 'breakdown_ready', prompts set 'prompts_ready'
  const hasPrompts = hasScenes && scenes.every(
    s => s.status === 'prompts_ready' || s.status === 'image_generated'
  );
  const hasBreakdown = hasScenes && scenes.some(s => s.status === 'breakdown_ready');

  // Auto-advance stage based on data state, but let user navigate back freely
  useEffect(() => {
    if (hasPrompts) {
      setActiveStageKey('handoff');
    } else if (hasScenes) {
      setActiveStageKey('scenes');
    } else if (hasFinalScript) {
      setActiveStageKey('scenes'); // jump straight to scenes so they can trigger breakdown
    }
    // don't auto-advance past blueprint until user clicks
  }, [hasFinalScript, hasScenes, hasPrompts]);

  // ── Trigger the shortsSceneBreakdown backend function ────────────
  const handleRunBreakdown = async () => {
    setBreakingDown(true);
    setBreakdownError(null);
    try {
      const result = await base44.functions.invoke('shortsSceneBreakdown', { project_id: projectId });
      const data = result?.data || result;
      if (data?.error) throw new Error(data.error);
      await refetchScenes();
      await refetchProject();
    } catch (err) {
      console.error('Breakdown failed:', err);
      setBreakdownError(err.message || 'Scene breakdown failed — try again');
    } finally {
      setBreakingDown(false);
    }
  };

  const currentStructure = SHORTS_NICHES[selectedNiche];
  const currentExample   = SCRIPT_EXAMPLES[selectedNiche];
  const stageIdx = STAGES.findIndex(s => s.key === activeStageKey);

  if (!project) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace" }}>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}
            className="text-white/60 hover:text-white hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-lg">📱</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{project.name}</h1>
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px]">📱 YouTube Shorts</Badge>
              {hasScenes && (
                <Badge className="bg-white/10 text-white/50 border-white/10 text-[10px]">
                  {scenes.length} scenes · {estimateDuration(finalScript?.full_script || '')}s
                </Badge>
              )}
            </div>
            <p className="text-xs text-white/40">90s · 9:16 Portrait · 1 scene per 2s</p>
          </div>
          {activeStageKey === 'handoff' && (
            <Button
              onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              Content Generation <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* ── Stage Pills (clickable navigation) ─────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {STAGES.map((stage, i) => (
            <StagePill
              key={stage.key}
              stage={stage}
              isActive={stage.key === activeStageKey}
              isComplete={i < stageIdx}
              onClick={() => {
                // Only allow navigating to stages that make sense
                if (stage.key === 'blueprint') setActiveStageKey('blueprint');
                if (stage.key === 'script') setActiveStageKey('script');
                if (stage.key === 'scenes' && hasFinalScript) setActiveStageKey('scenes');
                if (stage.key === 'handoff' && hasPrompts) setActiveStageKey('handoff');
              }}
            />
          ))}
        </div>

        {/* ── Blueprint Stage ─────────────────────────────────────── */}
        {activeStageKey === 'blueprint' && (
          <div className="space-y-6">
            <div className="text-center border-b border-green-500/20 pb-6">
              <p className="text-[9px] tracking-widest text-green-400 font-bold mb-2">PRODUCTION BLUEPRINT v3.0</p>
              <h2 className="text-2xl font-black text-white">90-SECOND SHORTS STRUCTURE</h2>
              <p className="text-[11px] text-white/30 mt-1">Deterministic pacing · 1 scene per 2s · Math-first, AI-second</p>
            </div>

            <ShortsNicheSelector value={selectedNiche} onChange={setSelectedNiche} />

            {/* Live plan preview — shows real numbers from the engine */}
            <SectionPlanPreview scriptText={finalScript?.full_script || ''} liveScenes={scenes} />

            <Tabs defaultValue="structure">
              <TabsList className="bg-white/5 border-white/10">
                <TabsTrigger value="structure" className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Structure</TabsTrigger>
                <TabsTrigger value="script"    className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Script Example</TabsTrigger>
                <TabsTrigger value="specs"     className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Engine Specs</TabsTrigger>
              </TabsList>
              <TabsContent value="structure" className="mt-4">
                {currentStructure && <ShortsStructureView structure={currentStructure} />}
              </TabsContent>
              <TabsContent value="script" className="mt-4">
                <ShortsScriptExample example={currentExample} niche={selectedNiche} />
              </TabsContent>
              <TabsContent value="specs" className="mt-4">
                <ShortsEngineSpecs />
              </TabsContent>
            </Tabs>

            <div className="text-center pt-4">
              <Button
                onClick={() => setActiveStageKey('script')}
                className="bg-green-600 hover:bg-green-700 gap-2 px-8"
              >
                Continue to Script Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Script Stage ────────────────────────────────────────── */}
        {activeStageKey === 'script' && (
          <div className="space-y-6">
            <ShortsScriptStage
              projectId={projectId}
              project={project}
              scripts={scripts}
              onRefetch={async () => {
                await Promise.all([refetchScripts(), refetchProject()]);
              }}
            />
            {hasFinalScript && (
              <div className="text-center pt-2">
                <Button
                  onClick={() => setActiveStageKey('scenes')}
                  className="bg-green-600 hover:bg-green-700 gap-2 px-8"
                >
                  Continue to Scene Breakdown <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Scenes Stage ────────────────────────────────────────── */}
        {activeStageKey === 'scenes' && (
          <div className="space-y-4">

            {/* Live plan preview */}
            {hasFinalScript && (
              <SectionPlanPreview scriptText={finalScript.full_script} liveScenes={scenes} />
            )}

            {/* Breakdown trigger card */}
            {hasFinalScript && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-sm font-bold text-white mb-0.5">
                        {hasScenes ? 'Re-run Scene Breakdown' : 'Run Scene Breakdown'}
                      </p>
                      <p className="text-[11px] text-white/40">
                        {hasScenes
                          ? `${scenes.length} scenes exist · Re-running will delete and regenerate all`
                          : `Breaks your script into ${buildSectionPlan(estimateDuration(finalScript.full_script)).reduce((s,p)=>s+p.sceneCount,0)} scenes using deterministic pacing`}
                      </p>
                    </div>
                    <Button
                      onClick={handleRunBreakdown}
                      disabled={breakingDown}
                      className={`gap-2 ${hasScenes ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {breakingDown
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Breaking down scenes...</>
                        : <><Layers className="w-4 h-4" /> {hasScenes ? 'Regenerate Scenes' : 'Generate Scenes'}</>}
                    </Button>
                  </div>

                  {breakdownError && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {breakdownError}
                    </div>
                  )}

                  {breakingDown && (
                    <div className="mt-3 space-y-1.5">
                      {buildSectionPlan(estimateDuration(finalScript.full_script)).map(section => {
                        const c = COLOR_MAP[section.color];
                        return (
                          <div key={section.name} className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${c.bar} animate-pulse`} />
                            <span className={`text-[10px] ${c.text}`}>{section.label}</span>
                            <span className="text-white/20 text-[10px]">{section.sceneCount} scenes × {section.secPerScene}s</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Scene list from ShortsScenesStage */}
            {hasScenes && (
              <ShortsScenesStage
                projectId={projectId}
                project={project}
                scenes={scenes}
                onRefetch={async () => {
                  await Promise.all([refetchScenes(), refetchProject()]);
                }}
              />
            )}

            {/* Advance to handoff once prompts are ready */}
            {hasPrompts && (
              <div className="text-center pt-2">
                <Button
                  onClick={() => setActiveStageKey('handoff')}
                  className="bg-green-600 hover:bg-green-700 gap-2 px-8"
                >
                  Continue to Content Generation <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Nudge if breakdown done but prompts not yet generated */}
            {hasBreakdown && !hasPrompts && (
              <p className="text-center text-[11px] text-white/30">
                Scenes created with director notes — run <span className="text-amber-400">Generate Prompts</span> in Content Generation to produce image prompts.
              </p>
            )}
          </div>
        )}

        {/* ── Handoff Stage ───────────────────────────────────────── */}
        {activeStageKey === 'handoff' && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Shorts Pipeline Complete</h3>
                <p className="text-white/40 text-sm">
                  {scenes.length} scenes · {estimateDuration(finalScript?.full_script || '')}s script · prompts ready
                </p>
              </div>

              {/* Final section summary */}
              {finalScript && (
                <SectionPlanPreview scriptText={finalScript.full_script} liveScenes={scenes} />
              )}

              <div className="flex gap-3 justify-center flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => setActiveStageKey('scenes')}
                  className="border-white/20 text-white/60 hover:bg-white/10 gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Scenes
                </Button>
                <Button
                  onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <ImageIcon className="w-4 h-4" /> Go to Content Generation <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}