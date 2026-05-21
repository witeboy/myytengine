import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import BatchCard from '@/components/script/BatchCard';
import ScriptEditor from '@/components/script/ScriptEditor';
import { Loader2, RefreshCw, Download, ArrowRight, FileText } from 'lucide-react';
import { showErrorToast } from '@/lib/errorToast';

export default function StoryScript() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: batches = [], isLoading: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['batches', projectId],
    queryFn: async () => {
      const all = await base44.entities.ScriptBatches.filter({ project_id: projectId });
      return all.sort((a, b) => a.batch_number - b.batch_number);
    },
    enabled: !!projectId,
    refetchInterval: generating ? 8000 : false,
  });

      const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
    // 🛡️ Added Array.isArray check to prevent the TypeError
    refetchInterval: (data) => {
      const hasFinal = Array.isArray(data) && data.some(s => s.version === 'final_aggregated');
      return hasFinal ? false : 10000;
    }
  });



  // Self-heal: if explainer_arc is set but project_mode is empty, treat as explainer.
  // (Older projects created before project_mode was reliably saved.)
  useEffect(() => {
    if (!project) return;
    if (!project.project_mode && project.explainer_arc) {
      base44.entities.Projects.update(projectId, { project_mode: 'explainer' })
        .then(() => refetchProject())
        .catch(() => {});
    }
  }, [project?.id, project?.project_mode, project?.explainer_arc]);

  const isShorts = project?.project_mode === 'youtube_shorts';
  const isExplainer = project?.project_mode === 'explainer';
  const effectiveMode = project?.project_mode || (project?.explainer_arc ? 'explainer' : '');

  const completedCount = batches.filter(b => b.status === 'completed').length;
  const stuckCount = batches.filter(b => b.status === 'generating').length;
  const allCompleted = isShorts
    ? scripts.some(s => s.version === 'final_aggregated')
    : (batches.length > 0 && completedCount === batches.length);

    // 🎯 Strictly look for the version created by your 'generateFullScript' function
  const latestScript = allCompleted
    ? scripts.find(s => s.version === 'final_aggregated')
    : null;


  // Reset stuck 'generating' batches back to 'pending' on page load
  const [stuckReset, setStuckReset] = useState(false);
  useEffect(() => {
    if (stuckReset || generating || batchesLoading) return;
    const stuck = batches.filter(b => b.status === 'generating');
    if (stuck.length > 0) {
      setStuckReset(true);
      console.log(`Resetting ${stuck.length} stuck 'generating' batches back to 'pending'`);
      Promise.all(
        stuck.map(b => base44.entities.ScriptBatches.update(b.id, { status: 'pending' }))
      ).then(() => refetchBatches());
    }
  }, [batches, batchesLoading, generating, stuckReset]);

  // ═══ SHORTS AUTO-GENERATION ═══
  useEffect(() => {
    if (!isShorts || autoGenTriggered || generating) return;
    if (!project?.id) return;
    if (project.status === 'script_complete') return;
    if (scripts.some(s => s.version === 'final_aggregated')) return;

    setAutoGenTriggered(true);
    setGenerating(true);

    const runShortsGeneration = async () => {
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const resp = await base44.functions.invoke('shortsGenerateScript', { project_id: projectId });
          const data = resp.data || resp;
          console.log('Shorts script generated:', data);
          await Promise.all([refetchProject(), refetchScripts()]);
          break;
        } catch (err) {
          const status = err?.response?.status || err?.status;
          console.warn(`Shorts script attempt ${attempt} failed (${status}):`, err.message);
          if (attempt < MAX_RETRIES && (status === 502 || status === 504 || status === 500)) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          showErrorToast(err, "Shorts Script Generation");
        }
      }
      setGenerating(false);
    };

    runShortsGeneration();
  }, [isShorts, project?.id, project?.status, autoGenTriggered, generating]);

  // ═══ STANDARD AUTO-GENERATION ═══
  useEffect(() => {
    if (isShorts) return;
    if (autoGenTriggered || generating) return;
    if (!project?.id) return;
    if (batchesLoading) return;
    if (project.status === 'script_complete') return;
    const isSleep = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const validStatuses = isSleep
      ? ['topic_selected', 'outline_ready', 'hooks_ready', 'scripting']
      : ['hooks_ready', 'scripting'];
    if (!validStatuses.includes(project.status)) return;
    // If any batch already has content, don't restart
    if (batches.some(b => b.status === 'completed' && b.content)) return;
    // Don't start if we just reset stuck batches — wait for refetch
    if (batches.some(b => b.status === 'generating')) return;

    setAutoGenTriggered(true);
    setGenerating(true);

    const runFullGeneration = async () => {
      try {
        // Always fetch fresh from DB — React state may be stale on page load
        const freshBatches = await base44.entities.ScriptBatches.filter({ project_id: projectId });
        const hasPendingBatches = freshBatches.length > 0 && freshBatches.some(b => b.status === 'pending');

        if (!hasPendingBatches) {
          // No usable pending batches — start fresh
          const oldScripts = await base44.entities.Scripts.filter({ project_id: projectId });
          for (const s of oldScripts) {
            await base44.entities.Scripts.delete(s.id);
          }

          for (const b of freshBatches) {
            await base44.entities.ScriptBatches.delete(b.id);
          }

          // Step 0: Explainer projects → run grounded research FIRST so script
          // batches and scene breakdown can anchor on real facts/numbers.
          // Skip if research_notes already exist (avoid re-spending Gemini calls).
          if (project?.project_mode === 'explainer' && !project?.research_notes) {
            const MAX_RESEARCH_RETRIES = 3;
            for (let attempt = 1; attempt <= MAX_RESEARCH_RETRIES; attempt++) {
              try {
                console.log(`[explainer] Running grounded research (attempt ${attempt}/${MAX_RESEARCH_RETRIES})...`);
                await base44.functions.invoke('explainerResearch', { project_id: projectId });
                await refetchProject();
                break;
              } catch (err) {
                const status = err?.response?.status || err?.status;
                console.warn(`[explainer] Research attempt ${attempt} failed (${status}):`, err.message);
                if (attempt < MAX_RESEARCH_RETRIES) {
                  await new Promise(r => setTimeout(r, 2000 * attempt));
                } else {
                  console.warn('[explainer] Research failed after all retries, continuing without grounded facts');
                }
              }
            }
          }

          // Step 1: Create batch outlines — route explainer to its own pipeline
          const initFn = isExplainer ? 'initializeExplainerBatches' : 'initializeScriptBatches';
          await base44.functions.invoke(initFn, { project_id: projectId });
          await refetchBatches();
        } else {
          // Batches exist — just make sure React Query is in sync
          await refetchBatches();
        }

        // Step 2: Generate batches one at a time with retry
        await generateBatchesWithRetry();

        await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
      } catch (err) {
        console.error('Script generation error:', err);
        showErrorToast(err, "Script Generation");
      } finally {
        setGenerating(false);
      }
    };

    runFullGeneration();
  }, [project?.id, project?.status, autoGenTriggered, generating]);

  // Retry-resilient batch generation — calls backend once per batch with retry
  const generateBatchesWithRetry = async () => {
    const MAX_RETRIES = 3;
    let allDone = false;

    while (!allDone) {
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          const genFn = isExplainer ? 'generateExplainerBatch' : 'generateScriptBatches';
          const resp = await base44.functions.invoke(genFn, { project_id: projectId });
          const data = resp.data || resp;
          success = true;
          allDone = data.done === true;
        } catch (err) {
          retries++;
          const status = err?.response?.status || err?.status;
          console.warn(`Batch generation attempt ${retries} failed (${status}):`, err.message);
          // Show toast immediately so user knows what's happening
          showErrorToast(err, `Script Batch (attempt ${retries}/${MAX_RETRIES})`);

          // Don't retry on billing/auth errors — they won't self-resolve
          if (status === 402 || status === 401 || status === 429) {
            break;
          }

          if (status === 504 || status === 500 || status === 502) {
            // Timeout/server error — the batch may have actually completed
            // Check by refetching and seeing if progress was made
            await new Promise(r => setTimeout(r, 5000));
            const freshBatches = await base44.entities.ScriptBatches.filter({ project_id: projectId });
            const stillPending = freshBatches.filter(b => b.status === 'pending' || b.status === 'generating');
            if (stillPending.length === 0) {
              success = true;
              allDone = true;
              break;
            }
          }

          if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }

      await refetchBatches();

      if (!success) {
        console.error('Max retries reached — user can click Resume to continue');
        break;
      }
    }
  };

  // ⚡ Auto-trigger the Merge function when batches hit 100% (standard mode only)
  useEffect(() => {
    if (isShorts) return; // Shorts scripts are already final_aggregated
    // Only trigger if all batches are done AND we don't have the final script yet
    if (allCompleted && !latestScript && !generating && project?.status !== 'script_complete') {
      
      const triggerMerge = async () => {
        try {
          console.log("All batches complete. Starting final merge...");
          // This calls your 'generateFullScript' Deno function
          await base44.functions.invoke('generateFullScript', {
            project_id: projectId
          });
          // Refresh everything so the final script pops up
          await Promise.all([refetchProject(), refetchScripts()]);
        } catch (err) {
          console.error('Merge error:', err);
          showErrorToast(err, "Script Merge");
        }
      };

      triggerMerge();
    }
  }, [allCompleted, latestScript, generating, project?.status, projectId]);


  const handleRegenerate = async () => {
    setRegenerating(true);

    // Delete all old scripts
    for (const s of scripts) {
      await base44.entities.Scripts.delete(s.id);
    }

    if (isShorts) {
      // Shorts regeneration — just re-run the shorts script generator
      await base44.entities.Projects.update(projectId, { status: 'hooks_ready', script_id: '' });
      await refetchScripts();
      setGenerating(true);
      setRegenerating(false);

      try {
        await base44.functions.invoke('shortsGenerateScript', { project_id: projectId });
        await Promise.all([refetchProject(), refetchScripts()]);
      } catch (err) {
        console.error('Shorts regeneration error:', err);
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Reset all batches to pending
    for (const b of batches) {
      await base44.entities.ScriptBatches.update(b.id, {
        content: '',
        word_count: 0,
        status: 'pending',
        scene_image_url: '',
      });
    }

    const isSleepProject = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';
    await base44.entities.Projects.update(projectId, {
      status: isSleepProject ? 'outline_ready' : 'hooks_ready',
      script_id: '',
    });

    await refetchScripts();
    setGenerating(true);
    setRegenerating(false);

    try {
      // Step 0: explainer projects → run grounded research first if missing
      if (isExplainer && !project?.research_notes) {
        const MAX_RESEARCH_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RESEARCH_RETRIES; attempt++) {
          try {
            await base44.functions.invoke('explainerResearch', { project_id: projectId });
            await refetchProject();
            break;
          } catch (err) {
            const status = err?.response?.status || err?.status;
            console.warn(`[explainer] Research attempt ${attempt} failed (${status}):`, err.message);
            if (attempt < MAX_RESEARCH_RETRIES) {
              await new Promise(r => setTimeout(r, 2000 * attempt));
            }
          }
        }
      }

      // Step 1: Re-initialize batch outlines — route explainer to its own pipeline
      const initFn = isExplainer ? 'initializeExplainerBatches' : 'initializeScriptBatches';
      await base44.functions.invoke(initFn, { project_id: projectId });
      await refetchBatches();

      // Step 2: Generate batches with retry logic
      await generateBatchesWithRetry();
      await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
    } catch (err) {
      console.error('Regeneration error:', err);
      showErrorToast(err, "Script Regeneration");
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = () => {
    if (!latestScript?.full_script) return;
    const blob = new Blob([latestScript.full_script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'script'}-script.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContinue = () => {
    navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* ── Mode Confirmation Banner — proves which writing pipeline will run ── */}
        {project && (
          <div className={`rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 text-sm border ${
            effectiveMode
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-300'
          }`}>
            {effectiveMode ? (
              <>
                <span className="text-emerald-700 font-medium">✅ Writing in mode:</span>
                <span className="font-mono font-semibold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                  {effectiveMode}
                </span>
                {effectiveMode === 'explainer' && (
                  <>
                    <span className="text-emerald-700">·</span>
                    <select
                      value={project.explainer_arc || 'professor'}
                      onChange={async (e) => {
                        await base44.entities.Projects.update(projectId, { explainer_arc: e.target.value });
                        await refetchProject();
                      }}
                      className="font-mono font-semibold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded text-xs border border-emerald-300 cursor-pointer hover:bg-emerald-200"
                      title="Change Einstein arc — affects character look & narration style"
                    >
                      <option value="science">science arc</option>
                      <option value="professor">professor arc</option>
                      <option value="accountant">accountant arc (finance)</option>
                      <option value="tech">tech arc</option>
                    </select>
                    <span className="text-emerald-600 text-xs">(click to change)</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="text-amber-800 font-medium">⚠️ No script mode set — defaulting to Standard (viral storytelling).</span>
                <span className="text-amber-700 text-xs">For explainer/educational topics, go back to project creation and pick "Explainer" mode.</span>
              </>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold">Script Generation</h1>
          </div>
                    <div className="flex gap-2">
            {allCompleted && (
              <>
                {!isShorts && !latestScript && (
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      setGenerating(true);
                      try {
                        await base44.functions.invoke('generateFullScript', { project_id: projectId });
                        await refetchScripts();
                      } finally {
                        setGenerating(false);
                      }
                    }}
                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${generating ? 'animate-spin' : ''}`} />
                    Force Merge Script
                  </Button>
                )}
                <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={!latestScript}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </>
            )}
            {allCompleted && latestScript && (
              <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700 gap-2">
                Next: Content <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </div>

        </div>
                <p className="text-gray-600 mb-8">
          {generating
            ? isShorts ? 'AI is generating your 90-second Shorts script...' : 'AI is writing your script batch by batch...'
            : (allCompleted && !latestScript)
            ? isShorts ? 'Finalizing your Shorts script...' : 'Batches finished! Merging and cleaning the final documentary script...'
            : allCompleted
            ? 'Script generation complete.'
            : 'Preparing script...'}
        </p>


        <div className="space-y-6">
          {/* Shorts generating indicator */}
          {isShorts && generating && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-green-800">Generating YouTube Shorts script...</p>
              <p className="text-xs text-green-600 mt-1">~90 seconds • 200–240 words • Niche-specific storytelling structure</p>
            </div>
          )}

          {/* Progress bar while generating (standard/sleep only) */}
          {!isShorts && batches.length > 0 && !allCompleted && (
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  {completedCount}/{batches.length} batches
                </span>
                <div className="flex items-center gap-2">
                  {generating && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  {!generating && !allCompleted && batches.length > 0 && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        setGenerating(true);
                        try {
                          // Reset any stuck batches first
                          const current = await base44.entities.ScriptBatches.filter({ project_id: projectId });
                          for (const b of current.filter(b => b.status === 'generating')) {
                            await base44.entities.ScriptBatches.update(b.id, { status: 'pending' });
                          }
                          await refetchBatches();
                          await generateBatchesWithRetry();
                          await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
                        } catch (err) {
                          console.error('Resume error:', err);
                          showErrorToast(err, "Resume Generation");
                        } finally {
                          setGenerating(false);
                        }
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Resume Generation
                    </Button>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / batches.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Batch Cards — show while generating or when not all complete (standard/sleep only) */}
          {!isShorts && !allCompleted && batches.length > 0 &&
            batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                onUpdate={() => {
                  refetchBatches();
                  refetchScripts();
                }}
              />
            ))}

          {/* Full Script Editor — ONLY after all batches complete AND script exists */}
          {allCompleted && latestScript && (
            <ScriptEditor script={latestScript} onSaved={() => refetchScripts()} />
          )}
        </div>
      </div>
    </div>
  );
}