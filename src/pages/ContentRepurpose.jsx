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
import VoicePicker from '@/components/repurpose/VoicePicker';
import ScriptComparison from '@/components/repurpose/ScriptComparison';
import HookVariants from '@/components/repurpose/HookVariants';

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

  // Step 4: New script
  const [newScript, setNewScript] = useState('');

  // Voice selection
  const [selectedVoiceId, setSelectedVoiceId] = useState('');

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
  const [sceneCount, setSceneCount] = useState(0);
  const [imagesDone, setImagesDone] = useState(0);
  const [videosDone, setVideosDone] = useState(0);

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
    const originalWordCount = hasOriginalScript
      ? analysis.original_script.split(/\s+/).filter(w => w).length
      : (analysis.estimated_word_count || 1500);
    const scriptReference = hasOriginalScript
      ? `\n\nORIGINAL FULL SCRIPT (${originalWordCount} words — your new script MUST match this length EXACTLY):\n"""\n${analysis.original_script.substring(0, 40000)}\n"""`
      : '';

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a professional YouTube scriptwriter specializing in content repurposing. Your job is to take an original video's FULL transcript and REWRITE it for a NEW topic/title — while preserving the EXACT same dynamics, flow, beats, pulsating rhythm, delivery style, AND LENGTH.

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
- ORIGINAL WORD COUNT: ${originalWordCount} words
${scriptReference}

NEW TITLE: "${newTitle}"
USER NOTES: ${tweakNotes || 'None — keep as close to original style as possible'}

ABSOLUTE LENGTH REQUIREMENT — THIS IS NON-NEGOTIABLE:
The original script is EXACTLY ${originalWordCount} words. Your new script MUST be between ${Math.floor(originalWordCount * 0.95)} and ${Math.ceil(originalWordCount * 1.05)} words (within 5% of original). 
DO NOT summarize. DO NOT condense. DO NOT shorten. If the original is ${originalWordCount} words, yours must be ~${originalWordCount} words.
Count your words carefully. If your draft is shorter, EXPAND sections with additional detail, examples, or elaboration until you hit the target.

ORIGINALITY & ANTI-PLAGIARISM — CRITICAL:
You are NOT copying or paraphrasing the original. You are CHANNELING its soul into a completely new script.
- STRIP OUT all specific names of people, brands, companies, locations, channel names, or any identifiable references from the original video
- NEVER carry over direct quotes, catchphrases, or signature lines from the original creator
- REPLACE every specific example, anecdote, and case study with COMPLETELY NEW ones relevant to "${newTitle}"
- If the original says "John discovered something shocking in 1987" — you invent a BRAND NEW scenario with different people, dates, places
- The new script must be UNTRACEABLE back to the original — no one should be able to Google a sentence and find the source
- Think of it as: you absorbed the ESSENCE (emotion, rhythm, storytelling DNA, tension arcs, rhetorical power) and are now creating something ORIGINAL that happens to have the same heartbeat

WHAT TO PRESERVE (the soul):
- The emotional journey and arc — every peak, valley, tension build, and release
- The storytelling techniques — foreshadowing, callbacks, cliffhangers, reveals at the same beats
- The pacing DNA — short punchy sentences stay short, flowing ones stay flowing
- The rhetorical devices — questions, repetition patterns, dramatic pauses, power phrases
- The energy signature — if it starts explosive, calms, then crescendos, yours must follow the SAME rhythm
- The ideological depth — the PURPOSE, the WHY, the deeper message beneath the surface
- The nuance and subtlety — the way it makes the audience FEEL, not just what it says

WHAT TO MAKE COMPLETELY NEW:
- All names, people, characters, real-world references
- All specific examples, statistics, dates, locations
- All anecdotes and stories — invent fresh ones that serve the same emotional purpose
- The surface-level content — while the deep structure mirrors the original, every word on the page is YOURS

STYLE INSTRUCTIONS:
${hasOriginalScript ? `You have the FULL original transcript above. This is your SOUL BLUEPRINT (not a copy source). You must:
1. ABSORB the emotional architecture, then REBUILD it entirely for "${newTitle}" with all-new content
2. PRESERVE the EXACT same structure — if the original has a shocking hook, yours must too. If it builds tension in paragraph 3, yours must too.
3. MATCH sentence length patterns — short punchy sentences stay short, long flowing ones stay long
4. KEEP the same rhetorical devices — questions, callbacks, cliffhangers, reveals at the same beats
5. RETAIN the same energy arc — if the original starts intense, calms, then peaks, yours must follow the SAME rhythm
6. MATCH paragraph-for-paragraph — for every paragraph in the original, write an equivalent paragraph of SIMILAR length with COMPLETELY DIFFERENT specific content
7. The voice should feel like a KINDRED SPIRIT — same energy, different person, different story
8. If someone read both scripts side by side, they should feel the same EMOTIONS but see ZERO overlapping content
9. YOUR OUTPUT MUST BE ${originalWordCount} WORDS (±5%). This is the #1 priority after style matching.` : `No full transcript available. Write a new script based on the detected style analysis above. TARGET LENGTH: ${originalWordCount} words.`}
Write the complete narration script. Return ONLY the script text, no headers or meta-commentary. NO word count annotations.`,
    });

    setNewScript(result);
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
      video_duration_minutes: Math.ceil((analysis.estimated_duration_seconds || 600) / 60),
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
      estimated_duration_sec: analysis.estimated_duration_seconds || 600,
    });

    // Save voice preference to ProductionSettings so ContentGeneration picks it up
    if (selectedVoiceId) {
      await base44.entities.ProductionSettings.create({
        project_id: project.id,
        selected_voice_id: selectedVoiceId,
        voiceover_status: 'pending',
      });
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

              {/* Voice Picker */}
              <VoicePicker
                selectedVoiceId={selectedVoiceId}
                onSelectVoice={setSelectedVoiceId}
                analysisVoiceStyle={analysis?.voiceover_style}
              />

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
                  <Badge variant="outline">{selectedStyle.replace(/_/g, ' ')}</Badge>
                  {selectedVoiceId && <Badge variant="outline" className="text-[10px]">🎙️ Voice set</Badge>}
                </div>

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