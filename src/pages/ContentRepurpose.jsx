import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPageUrl } from '@/utils';
import {
  Loader2, ArrowLeft, ArrowRight, RefreshCw, Search, FileText,
  Edit, Sparkles, CheckCircle2, Play, Film
} from 'lucide-react';
import RepurposeTemplates from '@/components/templates/RepurposeTemplates';
import ScriptComparison from '@/components/repurpose/ScriptComparison';
import HookVariants from '@/components/repurpose/HookVariants';
import OngoingRepurposeProjects from '@/components/repurpose/OngoingRepurposeProjects';

// ── Inline Script Extender Component ────────────────────────────
function ScriptExtender({ script, title, analysis, onUpdate }) {
  const [expanding, setExpanding] = useState(false);
  const [targetPct, setTargetPct] = useState(20);
  const [progress, setProgress] = useState('');

  const currentWords = script.split(/\s+/).filter(w => w.length > 0).length;
  const targetWords = Math.round(currentWords * (1 + targetPct / 100));
  const extraWords = targetWords - currentWords;
  const targetMinutes = Math.round(targetWords / 150);

  const handleExtend = async () => {
    setExpanding(true);
    let workingScript = script;
    let workingWords = currentWords;
    const finalTarget = targetWords;
    const minAcceptable = Math.round(finalTarget * 0.95);
    let passes = 0;
    const MAX_PASSES = 5;

    while (workingWords < minAcceptable && passes < MAX_PASSES) {
      passes++;
      const deficit = finalTarget - workingWords;
      const paragraphsNeeded = Math.max(1, Math.round(deficit / 100));
      setProgress(`Pass ${passes}: adding ~${deficit} words (${paragraphsNeeded} paragraphs)...`);

      try {
        // Split script into chunks — send only the last portion for context
        const scriptTail = workingScript.length > 3000
          ? '...\n\n' + workingScript.slice(-3000)
          : workingScript;

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are a world-class YouTube scriptwriter expanding an existing narration.

CURRENT SCRIPT (last section for context — ${workingWords} total words):
"""
${scriptTail}
"""

TITLE: "${title}"
STYLE: ${analysis?.script_style || 'dramatic'} | TONE: ${analysis?.tone_description || 'engaging'} | PACING: ${analysis?.pacing || 'dynamic'}

YOUR TASK: Write EXACTLY ${deficit} words (${paragraphsNeeded} paragraphs of 80-120 words each) that will be INSERTED throughout the script to enrich it.

FORMAT YOUR OUTPUT AS NUMBERED INSERTION BLOCKS:
[AFTER: "quote the last 5-8 words of the paragraph this goes after"]
<the new paragraph(s) to insert>

[AFTER: "quote the last 5-8 words of another paragraph"]  
<the new paragraph(s) to insert>

EXPANSION RULES:
- Add NEW examples, anecdotes, case studies, and vivid stories related to "${title}"
- Deepen emotional moments with sensory details and "imagine this" scenarios
- Add rhetorical questions ("But here's what most people miss...")
- Add audience-directed moments ("Think about that for a second...")
- Add surprising statistics, comparisons, or counter-intuitive facts
- Add mini-stories that illustrate existing points more vividly
- NEVER repeat existing content — every sentence must be NEW
- NEVER add [MUSIC], [VISUAL], headers, or stage directions
- Match the existing voice, tone, rhythm, and style perfectly
- Spread insertions EVENLY across the script — not all at the end
- Each insertion block should be 80-150 words

You MUST write at least ${deficit} words total across all insertion blocks.`,
        });

        if (!result || result.length < 50) {
          console.warn(`Pass ${passes}: LLM returned empty`);
          continue;
        }

        // Parse insertion blocks and apply them
        const insertionPattern = /\[AFTER:\s*"([^"]+)"\]\s*\n([\s\S]*?)(?=\[AFTER:|$)/gi;
        let applied = 0;
        let updatedScript = workingScript;
        let match;

        while ((match = insertionPattern.exec(result)) !== null) {
          const anchor = match[1].trim();
          let newContent = match[2].trim()
            .replace(/\[[^\]]*\]/gi, '')
            .replace(/\*\*/g, '')
            .replace(/^\s*(VISUAL|AUDIO|MUSIC|SOUND|SFX).*$/gim, '')
            .trim();

          if (!newContent || newContent.length < 30) continue;

          // Find the anchor in the script
          const anchorIdx = updatedScript.indexOf(anchor);
          if (anchorIdx >= 0) {
            // Find end of the paragraph containing the anchor
            const afterAnchor = anchorIdx + anchor.length;
            const nextParaBreak = updatedScript.indexOf('\n\n', afterAnchor);
            const insertPoint = nextParaBreak >= 0 ? nextParaBreak : afterAnchor;
            updatedScript = updatedScript.slice(0, insertPoint) + '\n\n' + newContent + updatedScript.slice(insertPoint);
            applied++;
          }
        }

        // If structured insertions failed, fall back to appending
        if (applied === 0) {
          const cleanResult = result
            .replace(/\[AFTER:[^\]]*\]/gi, '')
            .replace(/\[[^\]]*\]/gi, '')
            .replace(/\*\*/g, '')
            .replace(/^\s*(VISUAL|AUDIO|MUSIC|SOUND|SFX).*$/gim, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          if (cleanResult.length > 50) {
            // Insert at ~70% mark to avoid always appending at the end
            const insertPoint = Math.round(updatedScript.length * 0.7);
            const nearestBreak = updatedScript.indexOf('\n\n', insertPoint);
            const breakPoint = nearestBreak >= 0 ? nearestBreak : insertPoint;
            updatedScript = updatedScript.slice(0, breakPoint) + '\n\n' + cleanResult + '\n\n' + updatedScript.slice(breakPoint);
          }
        }

        workingScript = updatedScript;
        workingWords = workingScript.split(/\s+/).filter(w => w.length > 0).length;
        setProgress(`Pass ${passes} done: ${workingWords}/${finalTarget} words`);

      } catch (err) {
        console.error(`Extension pass ${passes} failed:`, err);
        setProgress(`Pass ${passes} failed, retrying...`);
      }
    }

    // Clean any markdown/formatting artifacts that would break TTS
    workingScript = workingScript
      .replace(/\*\*\.\*\*/g, '.')
      .replace(/\*\*,\*\*/g, ',')
      .replace(/\*\*!\*\*/g, '!')
      .replace(/\*\*\?\*\*/g, '?')
      .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold text** → bold text
      .replace(/\*([^*]+)\*/g, '$1')        // *italic text* → italic text
      .replace(/__([^_]+)__/g, '$1')        // __underline__ → underline
      .replace(/_([^_]+)_/g, '$1')          // _italic_ → italic
      .replace(/#{1,6}\s*/g, '')            // ### headers → remove
      .replace(/^\s*[-*]\s+/gm, '')         // - bullet points → remove
      .replace(/^\s*\d+\.\s+/gm, '')        // 1. numbered lists → remove
      .replace(/\[[^\]]*\]/g, '')           // [brackets] → remove
      .replace(/`([^`]+)`/g, '$1')          // `code` → code
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    onUpdate(workingScript);
    setExpanding(false);
    setProgress('');
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-900">Script Extender</span>
        </div>
        <span className="text-xs text-blue-600">
          {currentWords} words → {targetWords} words (+{extraWords}) → ~{targetMinutes} min
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">Extend by:</span>
          {[10, 20, 30, 50, 75, 100].map(pct => (
            <button
              key={pct}
              onClick={() => setTargetPct(pct)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                targetPct === pct
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
              }`}
            >
              +{pct}%
            </button>
          ))}
        </div>
        <Button
          onClick={handleExtend}
          disabled={expanding}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 gap-1.5"
        >
          {expanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {expanding ? 'Extending...' : `Add ${extraWords} words`}
        </Button>
      </div>

      {progress && (
        <div className="mt-2 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          <span className="text-xs text-blue-700">{progress}</span>
        </div>
      )}
    </div>
  );
}

const VISUAL_STYLES = [
  { value: 'cinematic_realistic', label: 'Cinematic Realistic' },
  { value: 'photorealistic_4k', label: 'Photorealistic 4K' },
  { value: 'cinematic_anime', label: 'Cinematic Anime' },
  { value: 'anime', label: 'Anime' },
  { value: 'cartoon_2d', label: 'Cartoon 2D' },
  { value: 'picstory_cocomelon', label: 'PicStory / CoComelon' },
  { value: 'cinematic_picstory', label: 'Cinematic PicStory' },
  { value: 'oil_painting', label: 'Oil Painting' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'comic_book', label: 'Comic Book' },
  { value: 'humpty_dumpty', label: 'Humpty Dumpty' },
  { value: 'harry_potter', label: 'Harry Potter' },
  { value: '3d_whiteboard_cartoon', label: '3D Whiteboard Cartoon' },
  { value: 'low_poly_3d_cartoon', label: 'Low Poly 3D Cartoon' },
];

export default function ContentRepurpose() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Step 1: URL
  const [videoUrl, setVideoUrl] = useState('');

  // Step 2: Analysis
  const [analysis, setAnalysis] = useState(null);

  // Step 3: Tweaks
  const [newTitle, setNewTitle] = useState('');
  const [tweakNotes, setTweakNotes] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('cinematic_realistic');
  const [selectedOrientation, setSelectedOrientation] = useState('landscape');
  const [targetDurationMin, setTargetDurationMin] = useState(0); // 0 = match original

  // Step 4: New script
  const [newScript, setNewScript] = useState('');
  const [tempProjectId, setTempProjectId] = useState(null); // for cleanup

  // Hook selection
  const [selectedHook, setSelectedHook] = useState(null);

  const handleRepurposeTemplate = (t) => {
    if (t.sampleUrl && t.sampleUrl.length > 30) {
      setVideoUrl(t.sampleUrl);
    }
    setTweakNotes(t.tweakHint || '');
    setSelectedStyle(t.style || 'cinematic_realistic');
  };

  // Step 5: Pipeline
  const [projectId, setProjectId] = useState(null);
  const [pipelineStep, setPipelineStep] = useState('');

  // ── Step 1→2: Analyze video via YouTube API + Gemini ──────────
  const [analyzeError, setAnalyzeError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setStatusMsg('Fetching video data from YouTube...');
    setAnalyzeError('');

    try {
      const resp = await base44.functions.invoke('analyzeYouTubeVideo', { video_url: videoUrl });
      const result = resp.data;

      if (result.error) {
        setAnalyzeError(result.error);
        setLoading(false);
        setStatusMsg('');
        return;
      }

      if (!result || (!result.title && !result.niche)) {
        setAnalyzeError('Analysis returned empty results. Please check the URL and try again.');
        setLoading(false);
        setStatusMsg('');
        return;
      }

      setAnalysis(result);
      setNewTitle(result.title || 'Untitled Video');
      setTargetDurationMin(Math.ceil((result.estimated_duration_seconds || 600) / 60));
      const vs = (result.visual_style || '').toLowerCase();
      if (vs.includes('anime')) setSelectedStyle('cinematic_anime');
      else if (vs.includes('cartoon')) setSelectedStyle('cartoon_2d');
      else if (vs.includes('painting')) setSelectedStyle('oil_painting');
      else setSelectedStyle('cinematic_realistic');

      setLoading(false);
      setStatusMsg('');
      setStep(2);
    } catch (err) {
      console.error('Analysis failed:', err);
      setAnalyzeError('Analysis failed: ' + (err.response?.data?.error || err.message || 'Unknown error. Please try again.'));
      setLoading(false);
      setStatusMsg('');
    }
  };

  // Batch generation state
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, words: 0 });

  // ── Step 3→4: Generate new script via batch-based generation ──
  const handleGenerateNewScript = async () => {
    setLoading(true);
    const hasOriginalScript = analysis.original_script && analysis.original_script.length > 200;
    const originalScript = hasOriginalScript ? analysis.original_script : '';

    if (!originalScript) {
      setStatusMsg('Writing new script...');
      const targetWords = targetDurationMin * 150;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Write a ${targetWords}-word YouTube narration script about "${newTitle}" in a ${analysis.script_style || 'dramatic'} style.

TARGET: Exactly ${targetWords} words (${targetDurationMin} minute video at 150 words per minute).

REQUIREMENTS:
- Open with a powerful hook that creates immediate curiosity (first 5 seconds)
- Build emotional tension throughout with a clear arc: setup → rising action → climax → resolution
- Use vivid sensory details, specific examples, and "imagine this" scenarios
- Include rhetorical questions, callbacks, and direct audience address
- Short punchy sentences for tension, longer flowing ones for reflection
- End with a strong emotional payoff or call to action
${tweakNotes ? `\nUSER NOTES: ${tweakNotes}` : ''}

Write ONLY spoken narration. No headers, [MUSIC], [VISUAL], or formatting. Pure script text, exactly ${targetWords} words.`,
      });
      setNewScript(result);
      setLoading(false);
      setStatusMsg('');
      setStep(4);
      return;
    }

    // Step 1: Create a temporary project for batches
    setStatusMsg('Analyzing script structure...');
    const tempProject = await base44.entities.Projects.create({
      name: `_repurpose_temp_${Date.now()}`,
      niche: analysis.niche || 'general',
      tone: analysis.script_style || 'dramatic',
      status: 'scripting',
      archived: true, // hide from dashboard
    });

    // Step 2: Initialize batches
    const targetTotalWords = targetDurationMin * 150;
    const initResp = await base44.functions.invoke('initializeRepurposeBatches', {
      project_id: tempProject.id,
      original_script: originalScript,
      new_title: newTitle,
      analysis,
      tweak_notes: tweakNotes,
      target_duration_minutes: targetDurationMin,
      target_total_words: targetTotalWords,
    });
    const initResult = initResp.data;
    const totalBatches = initResult.batches_created || 0;
    setBatchProgress({ current: 0, total: totalBatches, words: 0 });

    // Step 3: Generate each batch sequentially
    let previousEnding = '';
    let totalWords = 0;

    const batchRecords = initResult.batches || [];
    for (let i = 0; i < batchRecords.length; i++) {
      setStatusMsg(`Writing batch ${i + 1}/${totalBatches}...`);
      setBatchProgress(p => ({ ...p, current: i + 1 }));

      const batchResp = await base44.functions.invoke('generateRepurposeBatch', {
        batch_id: batchRecords[i].id,
        previous_ending: previousEnding,
      });
      const batchResult = batchResp.data;
      previousEnding = batchResult.ending || '';
      totalWords += batchResult.word_count || 0;
      setBatchProgress(p => ({ ...p, words: totalWords }));
    }

    // Step 4: Merge all batches
    setStatusMsg('Merging batches...');
    const completedBatches = await base44.entities.ScriptBatches.filter({ project_id: tempProject.id });
    const sorted = completedBatches
      .filter(b => b.status === 'completed' && b.content)
      .sort((a, b) => a.batch_number - b.batch_number);
    let fullScript = sorted.map(b => b.content).join('\n\n').trim();
    let currentWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const targetMinWords = Math.round(targetTotalWords * 0.85);

    // Step 5: If still under target, do expansion passes
    let expansionAttempt = 0;
    while (currentWords < targetMinWords && expansionAttempt < 3) {
      expansionAttempt++;
      const deficit = targetTotalWords - currentWords;
      setStatusMsg(`Expanding script (${currentWords}/${targetTotalWords} words, pass ${expansionAttempt})...`);
      setBatchProgress(p => ({ ...p, words: currentWords }));

      try {
        const expandResp = await base44.integrations.Core.InvokeLLM({
          prompt: `You are expanding a YouTube narration script that is ${deficit} words SHORT of its target.

CURRENT SCRIPT (${currentWords} words — needs ${targetTotalWords} total):
"""
${fullScript.substring(fullScript.length - 3000)}
"""

TITLE: "${newTitle}"
TARGET: ${targetTotalWords} words total (${targetDurationMin} minute video at 150 words/minute)
SHORTFALL: ${deficit} words needed

Write EXACTLY ${deficit} words that CONTINUE this script seamlessly:
- Pick up naturally from where the script ends
- Add new examples, deeper emotional moments, vivid anecdotes, audience questions
- Maintain the same voice, tone, pacing, and storytelling style
- Do NOT repeat or summarize what's already written
- Do NOT add headers, labels, [MUSIC], [VISUAL] or any non-narration text
- Write ONLY spoken narration

OUTPUT: ${deficit} words of continuation.`,
        });

        if (expandResp && expandResp.length > 50) {
          const cleanExpansion = expandResp
            .replace(/\[[^\]]*\]/gi, '')
            .replace(/\*\*/g, '')
            .replace(/^\s*(Here|Below|Sure|Okay|Certainly).*?\n/i, '')
            .trim();
          if (cleanExpansion.length > 50) {
            fullScript = fullScript + '\n\n' + cleanExpansion;
            currentWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
            console.log(`Expansion pass ${expansionAttempt}: now ${currentWords} words`);
          }
        }
      } catch (expErr) {
        console.warn(`Expansion pass ${expansionAttempt} failed:`, expErr.message);
        break;
      }
    }

    setNewScript(fullScript);
    console.log(`Final script: ${currentWords} words (target: ${targetTotalWords})`);

    setLoading(false);
    setStatusMsg('');
    setStep(4);
  };

  // ── Step 4→5: Create project + save script, then redirect to ContentGeneration ──
  const handleRunPipeline = async () => {
    setLoading(true);
    setStep(5);

    setPipelineStep('Creating project...');
    const project = await base44.entities.Projects.create({
      name: newTitle || analysis.title,
      niche: analysis.niche,
      tone: analysis.script_style,
      visual_style: selectedStyle,
      orientation: selectedOrientation,
      video_duration_minutes: targetDurationMin,
      status: 'script_complete',
      current_step: 4,
    });
    setProjectId(project.id);

    setPipelineStep('Saving script...');
    await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: newTitle || analysis.title,
      full_script: newScript,
      word_count: newScript.split(/\s+/).filter(w => w).length,
      estimated_duration_sec: targetDurationMin * 60,
    });

    // Clean up the temporary project and its batches
    if (tempProjectId) {
      try {
        const tempBatches = await base44.entities.ScriptBatches.filter({ project_id: tempProjectId });
        await Promise.all(tempBatches.map(b => base44.entities.ScriptBatches.delete(b.id)));
        await base44.entities.Projects.delete(tempProjectId);
      } catch (cleanupErr) {
        console.warn('Temp project cleanup skipped:', cleanupErr.message);
      }
    }

    setPipelineStep('Redirecting to Content Generation...');
    setLoading(false);

    // Navigate to ContentGeneration which handles voiceover, scenes, images, videos
    navigate(createPageUrl(`ContentGeneration?project_id=${project.id}`));
  };

  const stepLabels = ['Video URL', 'Analysis', 'Customize', 'Script', 'Pipeline'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" onClick={() => navigate(createPageUrl('NewProject'))} className="gap-2 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg mb-4">
            <RefreshCw className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Content Repurpose</h1>
          <p className="text-gray-500 mt-1">Analyze → Rewrite → Full Pipeline (same APIs)</p>
        </div>

        {/* Step Indicator — clickable for completed steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isCompleted = step > stepNum;
            const isCurrent = step === stepNum;
            const isClickable = isCompleted && stepNum < 5; // can't go back to pipeline redirect
            return (
              <div key={i} className="flex items-center gap-2">
                <button
                  onClick={() => isClickable && setStep(stepNum)}
                  disabled={!isClickable && !isCurrent}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isCompleted ? 'bg-green-100 text-green-700 cursor-pointer hover:ring-2 hover:ring-green-300' :
                    isCurrent ? 'bg-emerald-100 text-emerald-700' :
                    'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{stepNum}</span>}
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {i < stepLabels.length - 1 && <div className={`w-6 h-0.5 ${step > stepNum ? 'bg-green-300' : 'bg-gray-200'}`} />}
              </div>
            );
          })}
        </div>

        {/* Step 1: URL + Templates */}
        {step === 1 && (
          <div className="space-y-6">
            <OngoingRepurposeProjects />
            <RepurposeTemplates onSelectTemplate={handleRepurposeTemplate} />
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Search className="w-5 h-5 text-emerald-600" /> YouTube Video URL</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="https://www.youtube.com/watch?v=..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="text-lg py-6" />
                <p className="text-xs text-gray-500">AI will analyze the video's style, structure, hooks, and pacing using Gemini with web search.</p>
                {analyzeError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{analyzeError}</div>
                )}
                <Button onClick={handleAnalyze} disabled={!videoUrl.trim() || loading} className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" size="lg">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  {loading ? statusMsg : 'Analyze Video'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Analysis */}
        {step === 2 && analysis && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Video Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{analysis.title}</h3>
                {analysis.youtube_stats && (
                  <p className="text-xs text-gray-500 mt-1">
                    {analysis.youtube_stats.channel} • {analysis.youtube_stats.views?.toLocaleString()} views • {analysis.youtube_stats.likes?.toLocaleString()} likes
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">{analysis.niche}</Badge>
                  <Badge variant="outline">{Math.ceil((analysis.estimated_duration_seconds || 600) / 60)} min</Badge>
                  {analysis.is_short && <Badge className="bg-red-100 text-red-700">Short</Badge>}
                  <Badge variant="outline">{analysis.pacing} pacing</Badge>
                  <Badge variant="outline">~{analysis.estimated_word_count || 1500} words</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Script Style', analysis.script_style],
                  ['Voiceover', analysis.voiceover_style],
                  ['Visual Style', analysis.visual_style],
                  ['Hook', analysis.hook_technique],
                ].map(([label, val]) => (
                  <div key={label} className="bg-white p-3 rounded border">
                    <p className="text-gray-500 text-xs mb-1">{label}</p>
                    <p className="font-medium text-sm">{val || <span className="text-gray-400 italic">Not detected</span>}</p>
                  </div>
                ))}
              </div>
              {analysis.content_structure && (
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-500 text-xs mb-1">Content Structure</p>
                  <p className="text-sm">{analysis.content_structure}</p>
                </div>
              )}
              {analysis.key_topics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.key_topics.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}
                </div>
              )}
              {analysis.original_script && analysis.original_script.length > 100 && (
                <div className="bg-white p-3 rounded border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500 text-xs font-medium">Original Script</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{analysis.transcript_source === 'youtube_captions' ? '📝 Captions' : analysis.transcript_source === 'youtube_innertube' ? '📝 InnerTube' : analysis.transcript_source === 'cobalt_assemblyai' ? '🎤 Audio Transcription' : '📊 Metadata'}</Badge>
                      <Badge variant="outline" className="text-[10px]">{analysis.original_script.split(/\s+/).length} words</Badge>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded p-2">{analysis.original_script}</div>
                </div>
              )}
              <Button onClick={() => setStep(3)} className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2">
                Customize & Recreate <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Customize */}
        {step === 3 && analysis && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Edit className="w-5 h-5 text-emerald-600" /> Customize</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Original Transcript Display */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-600" /> Original Transcript
                  </p>
                  {analysis.original_script && analysis.original_script.length > 50 && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {analysis.transcript_source === 'youtube_captions' ? '📝 Captions' : analysis.transcript_source === 'youtube_innertube' ? '📝 InnerTube' : analysis.transcript_source === 'cobalt_assemblyai' ? '🎤 Audio' : '📊 Metadata'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{analysis.original_script.split(/\s+/).length} words</Badge>
                    </div>
                  )}
                </div>
                {analysis.original_script && analysis.original_script.length > 50 ? (
                  <>
                    <div className="max-h-52 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white rounded p-3 border border-gray-100">
                      {analysis.original_script}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">This transcript will be used as the style blueprint — AI will rewrite it for your new title while keeping the same dynamics, flow, beats & delivery.</p>
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
                    ⚠️ No transcript was captured for this video. The AI will generate a new script based on metadata analysis (title, description, tags). For best results, go back and re-analyze — or paste the transcript manually in "What to change?" below.
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">New Title</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Original: {analysis.title}</p>
              </div>
              {/* Duration Control */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Target Video Duration</label>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800 font-mono">
                      {targetDurationMin} min → {(targetDurationMin * 150).toLocaleString()} words
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={targetDurationMin}
                    onChange={e => setTargetDurationMin(parseInt(e.target.value))}
                    className="flex-1 accent-emerald-600"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={targetDurationMin}
                    onChange={e => setTargetDurationMin(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-gray-500">min</span>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                  <span>Original: {Math.ceil((analysis?.estimated_duration_seconds || 600) / 60)} min (~{analysis?.estimated_word_count || 'N/A'} words)</span>
                  <span>
                    {targetDurationMin > Math.ceil((analysis?.estimated_duration_seconds || 600) / 60)
                      ? `↑ Expanding ${Math.round((targetDurationMin / Math.ceil((analysis?.estimated_duration_seconds || 600) / 60) - 1) * 100)}%`
                      : targetDurationMin < Math.ceil((analysis?.estimated_duration_seconds || 600) / 60)
                      ? `↓ Condensing ${Math.round((1 - targetDurationMin / Math.ceil((analysis?.estimated_duration_seconds || 600) / 60)) * 100)}%`
                      : '= Same length'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Based on 150 words/minute narration speed. AI will expand or condense the original while preserving hooks, emotional arcs, climax, and storytelling structure.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Visual Style</label>
                  <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISUAL_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Orientation</label>
                  <Select value={selectedOrientation} onValueChange={setSelectedOrientation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landscape">🖥️ Landscape (16:9)</SelectItem>
                      <SelectItem value="portrait">📱 Portrait (9:16)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">What to change?</label>
                <Textarea value={tweakNotes} onChange={e => setTweakNotes(e.target.value)} placeholder="e.g. More dramatic, personal story angle..." className="min-h-[100px]" />
              </div>

              {loading && batchProgress.total > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-emerald-700">
                      Writing batch {batchProgress.current}/{batchProgress.total}
                    </span>
                    <span className="text-emerald-600">{batchProgress.words.toLocaleString()} words</span>
                  </div>
                  <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-1.5" />
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <Button onClick={handleGenerateNewScript} disabled={loading || !newTitle.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {loading ? statusMsg : 'Generate New Script'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Script */}
        {step === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Film className="w-5 h-5 text-emerald-600" /> New Script</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-emerald-100 text-emerald-800">{newTitle}</Badge>
                  <Badge variant="outline">{newScript.split(/\s+/).filter(w => w).length} words</Badge>
                  <Badge variant="outline">~{Math.round(newScript.split(/\s+/).filter(w => w).length / 150)} min</Badge>
                  <Badge variant="outline">{selectedStyle.replace(/_/g, ' ')}</Badge>
                </div>

                {/* ── Script Extender ─────────────────────────────── */}
                <ScriptExtender
                  script={newScript}
                  title={newTitle}
                  analysis={analysis}
                  onUpdate={(updated) => setNewScript(updated)}
                />

                {/* Hook Variants */}
                <HookVariants
                  analysis={analysis}
                  newTitle={newTitle}
                  onSelectHook={(hook) => {
                    setSelectedHook(hook);
                    // Prepend hook to script if not already there
                    if (hook?.text && !newScript.startsWith(hook.text.substring(0, 30))) {
                      const firstPeriod = newScript.indexOf('. ');
                      const cutPoint = firstPeriod > 0 && firstPeriod < 300 ? firstPeriod + 2 : 0;
                      setNewScript(hook.text + '\n\n' + newScript.substring(cutPoint));
                    }
                  }}
                />

                {/* Script Comparison */}
                <ScriptComparison
                  originalScript={analysis?.original_script}
                  newScript={newScript}
                  originalTitle={analysis?.title}
                  newTitle={newTitle}
                />

                <Textarea value={newScript} onChange={e => setNewScript(e.target.value)} className="min-h-[300px] text-sm font-mono" />
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(3)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                  <Button onClick={handleRunPipeline} disabled={loading || !newScript.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" size="lg">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    Run Full Pipeline
                  </Button>
                </div>
                <p className="text-xs text-gray-400 text-center">Creates project → voiceover → scenes → prompts → images → videos (full automation)</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 5: Redirecting */}
        {step === 5 && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
              <p className="font-medium text-gray-700">{pipelineStep || 'Setting up project...'}</p>
              <p className="text-xs text-gray-400">Creating project and saving script, then redirecting to Content Generation...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}