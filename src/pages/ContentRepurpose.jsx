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
  { value: 'picstory_cocomelon', label: 'PicStory / CoComelon' },
  { value: 'cinematic_picstory', label: 'Cinematic PicStory' },
  { value: 'oil_painting', label: 'Oil Painting' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'comic_book', label: 'Comic Book' },
  { value: 'humpty_dumpty', label: 'Humpty Dumpty' },
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

  // ── Step 3→4: Generate new script via Gemini ──────────────────
  const handleGenerateNewScript = async () => {
    setLoading(true);
    setStatusMsg('Writing new script in original style...');

    const hasOriginalScript = analysis.original_script && analysis.original_script.length > 200;
    const scriptReference = hasOriginalScript
      ? `\n\nORIGINAL FULL SCRIPT (use this as your style bible — match tone, sentence structure, transitions, rhetorical devices EXACTLY):\n"""\n${analysis.original_script.substring(0, 40000)}\n"""`
      : '';

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a professional YouTube scriptwriter specializing in content repurposing. Your job is to take an original video's FULL transcript and REWRITE it for a NEW topic/title — while preserving the EXACT same dynamics, flow, beats, pulsating rhythm, and delivery style.

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
${scriptReference}

NEW TITLE: "${newTitle}"
USER NOTES: ${tweakNotes || 'None — keep as close to original style as possible'}

CRITICAL INSTRUCTIONS:
${hasOriginalScript ? `You have the FULL original transcript above. This is your STYLE BIBLE. You must:
1. REWRITE every section of the original script but for the NEW title "${newTitle}"
2. PRESERVE the EXACT same structure — if the original has a shocking hook, yours must too. If it builds tension in paragraph 3, yours must too.
3. MATCH sentence length patterns — short punchy sentences stay short, long flowing ones stay long
4. KEEP the same rhetorical devices — questions, callbacks, cliffhangers, reveals at the same beats
5. RETAIN the same energy arc — if the original starts intense, calms, then peaks, yours must follow the SAME rhythm
6. MATCH the approximate word count of the original (~${analysis.estimated_word_count || analysis.original_script.split(/\\s+/).length} words)
7. DO NOT generic-ify the script. The original has a unique voice — replicate it exactly for the new topic.
8. The new script should feel like the SAME creator made a video on a different topic.` : 'No full transcript available. Write a new script based on the detected style analysis above.'}
Write the complete narration script. Return ONLY the script text, no headers or meta-commentary.`,
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
      orientation: selectedOrientation,
      video_duration_minutes: Math.ceil((analysis.estimated_duration_seconds || 600) / 60),
      status: 'script_complete',
      current_step: 4,
    });
    setProjectId(project.id);

    // 2. Create script
    setPipelineStep('Saving script...');
    const scriptRecord = await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: newTitle || analysis.title,
      full_script: newScript,
      word_count: newScript.split(/\s+/).filter(w => w).length,
      estimated_duration_sec: analysis.estimated_duration_seconds || 600,
    });
    console.log('Script created:', scriptRecord.id);

    // 3. Generate voiceover (same ai33.pro backend)
    setPipelineStep('Generating voiceover (ai33.pro TTS)...');
    try {
      const voResp = await base44.functions.invoke('generateVoiceover', { project_id: project.id });
      console.log('Voiceover result:', voResp.data);
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
      const promptsResp = await base44.functions.invoke('generateScenePrompts', { project_id: project.id });
      console.log('Scene prompts result:', promptsResp.data);
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
          const imgResp = await base44.functions.invoke('generateSceneImage', { scene_id: ready[i].id });
          console.log(`Scene ${ready[i].scene_number} image:`, imgResp.data?.model_used);
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
                      <Badge variant="outline" className="text-[10px]">{analysis.transcript_source === 'youtube_captions' ? '📝 Captions' : analysis.transcript_source === 'assemblyai' ? '🎤 Audio Transcription' : 'Metadata'}</Badge>
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
                        {analysis.transcript_source === 'youtube_captions' ? '📝 Captions' : analysis.transcript_source === 'assemblyai' ? '🎤 Audio' : '📊 Metadata'}
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
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Wand2 className="w-5 h-5 text-emerald-600" /> Pipeline</CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className="text-[11px]">{selectedStyle.replace(/_/g, ' ')}</Badge>
                <Badge variant="outline" className="text-[11px]">{selectedOrientation === 'portrait' ? '📱 Portrait' : '🖥️ Landscape'}</Badge>
                <Badge variant="outline" className="text-[11px]">{newTitle || analysis?.title}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pipeline Steps Tracker */}
              <div className="space-y-2">
                {[
                  { key: 'project', label: 'Create Project', icon: '📁' },
                  { key: 'script', label: 'Save Script', icon: '📝' },
                  { key: 'voiceover', label: 'Generate Voiceover', icon: '🎙️' },
                  { key: 'breakdown', label: 'Scene Breakdown', icon: '🎬' },
                  { key: 'prompts', label: 'Visual Prompts', icon: '🖌️' },
                  { key: 'images', label: 'Generate Images', icon: '🖼️' },
                ].map((s, i) => {
                  const currentIdx =
                    pipelineStep.includes('Creating') ? 0 :
                    pipelineStep.includes('Saving') ? 1 :
                    pipelineStep.includes('voiceover') ? 2 :
                    pipelineStep.includes('Breaking') ? 3 :
                    pipelineStep.includes('visual prompts') || pipelineStep.includes('Converting') ? 4 :
                    pipelineStep.includes('image') || pipelineStep.includes('Generating image') ? 5 :
                    pipelineStep.includes('complete') ? 6 : -1;

                  const isDone = i < currentIdx || (!loading && pipelineStep.includes('complete'));
                  const isActive = i === currentIdx && loading;

                  return (
                    <div key={s.key} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                      isDone ? 'bg-green-50 text-green-700' :
                      isActive ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600 flex-shrink-0" />
                      ) : (
                        <span className="w-4 h-4 flex-shrink-0 text-center text-xs">{s.icon}</span>
                      )}
                      <span className="font-medium">{s.label}</span>
                      {isActive && s.key === 'images' && sceneCount > 0 && (
                        <span className="ml-auto text-xs">{imagesDone}/{sceneCount}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {loading && (
                <Progress value={
                  pipelineStep.includes('Creating') ? 5 :
                  pipelineStep.includes('Saving') ? 10 :
                  pipelineStep.includes('voiceover') ? 20 :
                  pipelineStep.includes('Breaking') ? 35 :
                  pipelineStep.includes('visual prompts') || pipelineStep.includes('Converting') ? 50 :
                  pipelineStep.includes('image') ? 50 + (imagesDone / Math.max(sceneCount, 1)) * 45 :
                  pipelineStep.includes('complete') ? 100 : 30
                } className="h-2" />
              )}

              {!loading && pipelineStep.includes('complete') && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="font-medium text-green-800">Pipeline Complete!</p>
                  <p className="text-xs text-green-600 mt-1">
                    {sceneCount} scenes created with images. Open the full editor to continue.
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