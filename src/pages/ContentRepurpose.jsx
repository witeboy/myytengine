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
  Edit, Sparkles, CheckCircle2, Play, Film, Wand2, ImageIcon
} from 'lucide-react';
import RepurposeTemplates from '@/components/templates/RepurposeTemplates';

const VISUAL_STYLES = [
  { value: 'cinematic_realistic', label: 'Cinematic Realistic' },
  { value: 'photorealistic_4k', label: 'Photorealistic 4K' },
  { value: 'cinematic_anime', label: 'Cinematic Anime' },
  { value: 'anime', label: 'Anime' },
  { value: 'cartoon_2d', label: 'Cartoon 2D' },
  { value: 'oil_painting', label: 'Oil Painting' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'comic_book', label: 'Comic Book' },
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

  // Step 4: New script
  const [newScript, setNewScript] = useState('');

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
  const [sceneCount, setSceneCount] = useState(0);
  const [imagesDone, setImagesDone] = useState(0);

  // ── Step 1→2: Analyze video via Gemini with internet ──────────
  const handleAnalyze = async () => {
    setLoading(true);
    setStatusMsg('AI is analyzing the video...');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a YouTube content analyst. Analyze this YouTube video URL and extract a complete breakdown.

VIDEO URL: ${videoUrl}

Return a detailed JSON breakdown including: title, estimated_duration_seconds, niche, script_style, voiceover_style, visual_style, pacing, hook_technique, content_structure, key_topics, estimated_word_count, reconstructed_outline, tone_description.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          estimated_duration_seconds: { type: "number" },
          niche: { type: "string" },
          script_style: { type: "string" },
          voiceover_style: { type: "string" },
          visual_style: { type: "string" },
          pacing: { type: "string" },
          hook_technique: { type: "string" },
          content_structure: { type: "string" },
          key_topics: { type: "array", items: { type: "string" } },
          estimated_word_count: { type: "number" },
          reconstructed_outline: { type: "string" },
          tone_description: { type: "string" },
        }
      }
    });

    setAnalysis(result);
    setNewTitle(result.title || '');
    // Auto-detect visual style
    const vs = (result.visual_style || '').toLowerCase();
    if (vs.includes('anime')) setSelectedStyle('cinematic_anime');
    else if (vs.includes('cartoon')) setSelectedStyle('cartoon_2d');
    else if (vs.includes('painting')) setSelectedStyle('oil_painting');
    else setSelectedStyle('cinematic_realistic');

    setLoading(false);
    setStatusMsg('');
    setStep(2);
  };

  // ── Step 3→4: Generate new script via Gemini ──────────────────
  const handleGenerateNewScript = async () => {
    setLoading(true);
    setStatusMsg('Writing new script in original style...');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a professional YouTube scriptwriter. Based on the analysis of an existing high-performing video, write a NEW script in the SAME style but with the user's modifications.

ORIGINAL VIDEO ANALYSIS:
- Title: ${analysis.title}
- Niche: ${analysis.niche}
- Script Style: ${analysis.script_style}
- Voiceover Style: ${analysis.voiceover_style}
- Pacing: ${analysis.pacing}
- Hook Technique: ${analysis.hook_technique}
- Content Structure: ${analysis.content_structure}
- Tone: ${analysis.tone_description}
- Estimated Duration: ${analysis.estimated_duration_seconds}s
- Original Outline: ${analysis.reconstructed_outline}

USER'S MODIFICATIONS:
- New Title: ${newTitle}
- Additional Notes: ${tweakNotes || 'None — keep as close to original style as possible'}

Write a complete narration script (~${analysis.estimated_word_count || 1500} words) matching the EXACT style, tone, and pacing. Return ONLY the script text.`,
    });

    setNewScript(result);
    setLoading(false);
    setStatusMsg('');
    setStep(4);
  };

  // ── Step 4→5: Create project + run full pipeline ──────────────
  const handleRunPipeline = async () => {
    setLoading(true);
    setStep(5);

    // 1. Create project
    setPipelineStep('Creating project...');
    const project = await base44.entities.Projects.create({
      name: newTitle || analysis.title,
      niche: analysis.niche,
      tone: analysis.script_style,
      visual_style: selectedStyle,
      orientation: 'landscape',
      video_duration_minutes: Math.ceil((analysis.estimated_duration_seconds || 600) / 60),
      status: 'script_complete',
      current_step: 4,
    });
    setProjectId(project.id);

    // 2. Create script
    setPipelineStep('Saving script...');
    await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: newTitle || analysis.title,
      full_script: newScript,
      word_count: newScript.split(/\s+/).filter(w => w).length,
      estimated_duration_sec: analysis.estimated_duration_seconds || 600,
    });

    // 3. Generate voiceover (same ai33.pro backend)
    setPipelineStep('Generating voiceover (ai33.pro TTS)...');
    try {
      await base44.functions.invoke('generateVoiceover', { project_id: project.id });
    } catch (err) {
      console.warn('Voiceover failed:', err.message);
    }

    // 4. Scene breakdown (same Gemini backend)
    setPipelineStep('Breaking down script into cinematic scenes...');
    try {
      const breakdownResponse = await base44.functions.invoke('generateSceneBreakdown', { project_id: project.id });
      const breakdownResult = breakdownResponse.data || breakdownResponse;
      setSceneCount(breakdownResult.scenes_created || 0);
    } catch (err) {
      console.warn('Scene breakdown failed:', err.message);
    }

    // 5. Generate scene prompts (same Gemini backend)
    setPipelineStep('Converting to visual prompts...');
    try {
      await base44.functions.invoke('generateScenePrompts', { project_id: project.id });
    } catch (err) {
      console.warn('Prompt generation failed:', err.message);
    }

    // 6. Generate images for all scenes (same Kie backend)
    setPipelineStep('Generating scene images...');
    try {
      const scenes = await base44.entities.Scenes.filter({ project_id: project.id });
      const ready = scenes.filter(s => s.status === 'prompts_ready').sort((a, b) => a.scene_number - b.scene_number);
      setSceneCount(ready.length);

      for (let i = 0; i < ready.length; i++) {
        setPipelineStep(`Generating image ${i + 1}/${ready.length}...`);
        setImagesDone(i + 1);
        try {
          await base44.functions.invoke('generateSceneImage', { scene_id: ready[i].id });
        } catch (imgErr) {
          console.warn(`Scene ${ready[i].scene_number} image failed:`, imgErr.message);
        }
      }
    } catch (err) {
      console.warn('Image generation failed:', err.message);
    }

    setPipelineStep('Pipeline complete!');
    setLoading(false);
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

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                step > i + 1 ? 'bg-green-100 text-green-700' :
                step === i + 1 ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className={`w-6 h-0.5 ${step > i + 1 ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: URL + Templates */}
        {step === 1 && (
          <div className="space-y-6">
            <RepurposeTemplates onSelectTemplate={handleRepurposeTemplate} />
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Search className="w-5 h-5 text-emerald-600" /> YouTube Video URL</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="https://www.youtube.com/watch?v=..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="text-lg py-6" />
                <p className="text-xs text-gray-500">AI will analyze the video's style, structure, hooks, and pacing using Gemini with web search.</p>
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
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">{analysis.niche}</Badge>
                  <Badge variant="outline">{Math.ceil((analysis.estimated_duration_seconds || 600) / 60)} min</Badge>
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
                    <p className="font-medium text-sm">{val}</p>
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
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">New Title</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Original: {analysis.title}</p>
              </div>
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
                <label className="text-sm font-medium text-gray-700 mb-1 block">What to change?</label>
                <Textarea value={tweakNotes} onChange={e => setTweakNotes(e.target.value)} placeholder="e.g. More dramatic, personal story angle..." className="min-h-[100px]" />
              </div>
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
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Film className="w-5 h-5 text-emerald-600" /> New Script</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800">{newTitle}</Badge>
                <Badge variant="outline">{newScript.split(/\s+/).filter(w => w).length} words</Badge>
                <Badge variant="outline">{selectedStyle.replace(/_/g, ' ')}</Badge>
              </div>
              <Textarea value={newScript} onChange={e => setNewScript(e.target.value)} className="min-h-[350px] text-sm font-mono" />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <Button onClick={handleRunPipeline} disabled={loading || !newScript.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" size="lg">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  Run Full Pipeline
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">Creates project → voiceover → scene breakdown → prompts → images (same APIs as faceless pipeline)</p>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Pipeline Running */}
        {step === 5 && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wand2 className="w-5 h-5 text-emerald-600" /> Pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {loading && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-800">{pipelineStep}</p>
                  </div>
                  <Progress value={
                    pipelineStep.includes('Creating') ? 5 :
                    pipelineStep.includes('Saving') ? 10 :
                    pipelineStep.includes('voiceover') ? 20 :
                    pipelineStep.includes('Breaking') ? 35 :
                    pipelineStep.includes('visual prompts') ? 50 :
                    pipelineStep.includes('image') ? 50 + (imagesDone / Math.max(sceneCount, 1)) * 45 :
                    pipelineStep.includes('complete') ? 100 : 30
                  } className="h-2" />
                  {sceneCount > 0 && pipelineStep.includes('image') && (
                    <p className="text-xs text-gray-500 mt-1">{imagesDone}/{sceneCount} images generated</p>
                  )}
                </div>
              )}

              {!loading && pipelineStep.includes('complete') && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="font-medium text-green-800">Pipeline Complete!</p>
                  <p className="text-xs text-green-600 mt-1">
                    {sceneCount} scenes created with images. Open the full editor to generate videos and continue.
                  </p>
                </div>
              )}

              {projectId && !loading && (
                <div className="flex gap-3">
                  <Button onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <ImageIcon className="w-4 h-4" /> Content Editor
                  </Button>
                  <Button variant="outline" onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`))} className="flex-1 gap-2">
                    <Film className="w-4 h-4" /> Timeline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}