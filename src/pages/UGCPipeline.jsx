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
  Loader2, ArrowLeft, ArrowRight, Users, Wand2, ImageIcon,
  Mic, Video, Download, CheckCircle2, Sparkles, Volume2
} from 'lucide-react';
import UGCTemplates from '@/components/templates/UGCTemplates';

const INFLUENCER_TYPES = [
  { value: 'beauty_guru', label: 'Beauty / Skincare Guru' },
  { value: 'fitness_coach', label: 'Fitness Coach' },
  { value: 'tech_reviewer', label: 'Tech Reviewer' },
  { value: 'food_creator', label: 'Food / Recipe Creator' },
  { value: 'lifestyle', label: 'Lifestyle / Vlogger' },
  { value: 'fashion', label: 'Fashion Influencer' },
  { value: 'business', label: 'Business / Finance' },
  { value: 'education', label: 'Education / How-to' },
  { value: 'travel', label: 'Travel Content' },
  { value: 'gaming', label: 'Gaming' },
];

export default function UGCPipeline() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Step 1
  const [targetAudience, setTargetAudience] = useState('');
  const [targetDemography, setTargetDemography] = useState('');
  const [targetMarket, setTargetMarket] = useState('');

  // Step 2
  const [influencerType, setInfluencerType] = useState('');
  const [influencerAction, setInfluencerAction] = useState('');

  // Step 3
  const [influencerPrompt, setInfluencerPrompt] = useState('');
  const [influencerImageUrl, setInfluencerImageUrl] = useState('');

  // Step 4
  const [voiceScript, setVoiceScript] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);

  // Step 5 — project created, pipeline running
  const [projectId, setProjectId] = useState(null);
  const [pipelineStep, setPipelineStep] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const typeLabel = INFLUENCER_TYPES.find(t => t.value === influencerType)?.label || influencerType;

  const handleTemplateSelect = (t) => {
    setTargetAudience(t.audience);
    setTargetDemography(t.demography);
    setTargetMarket(t.market);
    setInfluencerType(t.influencerType);
    setInfluencerAction(t.action);
    setStep(2);
  };

  // ── Step 2→3: Generate influencer prompt via Gemini ──────────
  const handleGeneratePrompt = async () => {
    setLoading(true);
    setStatusMsg('Generating influencer prompt...');
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a UGC creative director. Create a detailed AI image generation prompt for a virtual influencer.

TARGET AUDIENCE: ${targetAudience}
TARGET DEMOGRAPHY: ${targetDemography}
TARGET MARKET: ${targetMarket}
INFLUENCER TYPE: ${typeLabel}
WHAT THEY'RE DOING: ${influencerAction}

Create a detailed, photorealistic image generation prompt (150-250 words) describing:
1. Appearance (age range, style, outfit, hair, expression)
2. Environment/setting
3. What they're doing/holding
4. Camera angle and lighting
5. Mood and aesthetic

Return ONLY the prompt text.`,
    });
    setInfluencerPrompt(result);
    setLoading(false);
    setStatusMsg('');
    setStep(3);
  };

  // ── Step 3: Generate image via Kie (same API as generateSceneImage) ──
  const handleGenerateImage = async () => {
    setLoading(true);
    setStatusMsg('Generating influencer image...');
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: influencerPrompt,
    });
    setInfluencerImageUrl(url);
    setLoading(false);
    setStatusMsg('');
  };

  // ── Step 3→4: Generate voice script via Gemini ──────────────
  const handleGenerateVoiceScript = async () => {
    setLoading(true);
    setStatusMsg('Writing voiceover script...');
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a UGC scriptwriter. Write a short voiceover script (30-60 seconds) for a virtual influencer.

INFLUENCER TYPE: ${typeLabel}
ACTION: ${influencerAction}
TARGET AUDIENCE: ${targetAudience}
TARGET MARKET: ${targetMarket}

The script should:
- Sound natural and conversational
- Include a hook in the first 3 seconds
- Feel authentic UGC style
- Be 80-150 words

Return ONLY the script text.`,
    });
    setVoiceScript(result);
    setLoading(false);
    setStatusMsg('');
    setStep(4);
  };

  // ── Step 4→5: Create project, script, generate voiceover, then scene breakdown + images + video ──
  const handleGenerateFullPipeline = async () => {
    setLoading(true);
    setStep(5);

    // 1. Create project
    setPipelineStep('Creating project...');
    const project = await base44.entities.Projects.create({
      name: `UGC: ${typeLabel}`,
      niche: influencerType,
      tone: 'conversational',
      visual_style: 'photorealistic_4k',
      orientation: 'portrait',
      video_duration_minutes: 1,
      status: 'script_complete',
      current_step: 4,
    });
    setProjectId(project.id);

    // 2. Create script record
    setPipelineStep('Saving script...');
    await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: `UGC: ${typeLabel}`,
      full_script: voiceScript,
      word_count: voiceScript.split(/\s+/).filter(w => w).length,
    });

    // 3. Generate voiceover via ai33.pro (same backend function)
    setPipelineStep('Generating voiceover (ai33.pro TTS)...');
    try {
      const voResponse = await base44.functions.invoke('generateVoiceover', {
        project_id: project.id,
      });
      const voResult = voResponse.data || voResponse;
      setVoiceUrl(voResult.voiceover_url || '');
      setVoiceDuration(voResult.voiceover_duration_seconds || 0);
    } catch (err) {
      console.warn('Voiceover generation failed:', err.message);
      setPipelineStep('Voiceover failed — continuing with image...');
    }

    // 4. Create a single scene with the influencer image
    setPipelineStep('Creating scene with influencer image...');
    const scene = await base44.entities.Scenes.create({
      project_id: project.id,
      scene_number: 1,
      narration_text: voiceScript,
      image_prompt: influencerPrompt,
      image_url: influencerImageUrl,
      duration_seconds: voiceDuration || 30,
      status: 'image_generated',
    });

    // 5. Generate video via Veo 3.1 (same backend function)
    if (influencerImageUrl && !influencerImageUrl.startsWith('data:')) {
      setPipelineStep('Submitting to Veo 3.1 for video generation...');
      try {
        const vidResponse = await base44.functions.invoke('generateSceneVideo', {
          scene_id: scene.id,
        });
        const vidResult = vidResponse.data || vidResponse;

        if (vidResult.task_id) {
          setPipelineStep('Video rendering with Veo 3.1 — polling...');
          // Poll for completion
          let done = false;
          let polls = 0;
          while (!done && polls < 40) {
            await new Promise(r => setTimeout(r, 15000));
            polls++;
            setPipelineStep(`Rendering... (poll ${polls})`);
            try {
              const pollResponse = await base44.functions.invoke('pollSceneVideo', {
                scene_id: scene.id,
              });
              const pollResult = pollResponse.data || pollResponse;
              if (pollResult.status === 'COMPLETED') {
                setVideoUrl(pollResult.video_url || '');
                done = true;
              } else if (pollResult.status === 'FAILED') {
                console.warn('Video generation failed');
                done = true;
              }
            } catch (pollErr) {
              console.warn('Poll error:', pollErr.message);
            }
          }
        }
      } catch (vidErr) {
        console.warn('Video generation failed:', vidErr.message);
      }
    }

    setPipelineStep('Done!');
    setLoading(false);
  };

  const stepLabels = ['Audience', 'Influencer', 'Image', 'Script', 'Pipeline'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" onClick={() => navigate(createPageUrl('NewProject'))} className="gap-2 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mx-auto shadow-lg mb-4">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">UGC Creator Pipeline</h1>
          <p className="text-gray-500 mt-1">AI influencer → Image → Voice → Lip-sync Video</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                step > i + 1 ? 'bg-green-100 text-green-700' :
                step === i + 1 ? 'bg-pink-100 text-pink-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className={`w-6 h-0.5 ${step > i + 1 ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Audience + Templates */}
        {step === 1 && (
          <div className="space-y-6">
            <UGCTemplates onSelectTemplate={handleTemplateSelect} />
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
              <div className="relative flex justify-center"><span className="bg-pink-50 px-3 text-xs text-gray-500">or fill in manually</span></div>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-lg">Target Audience & Market</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Target Audience</label>
                  <Input placeholder="e.g. Women 25-35 interested in skincare" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Target Demography</label>
                  <Input placeholder="e.g. Urban millennials, middle income" value={targetDemography} onChange={e => setTargetDemography(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Target Market</label>
                  <Input placeholder="e.g. US, UK, Australia" value={targetMarket} onChange={e => setTargetMarket(e.target.value)} />
                </div>
                <Button onClick={() => setStep(2)} disabled={!targetAudience.trim()} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Influencer Type */}
        {step === 2 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Influencer Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Influencer Type</label>
                <Select value={influencerType} onValueChange={setInfluencerType}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    {INFLUENCER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">What should the influencer be doing?</label>
                <Textarea placeholder="e.g. Unboxing a product, speaking to camera..." value={influencerAction} onChange={e => setInfluencerAction(e.target.value)} className="min-h-[100px]" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <Button onClick={handleGeneratePrompt} disabled={!influencerType || !influencerAction.trim() || loading} className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {loading ? statusMsg : 'Generate Influencer Prompt'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Image */}
        {step === 3 && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ImageIcon className="w-5 h-5 text-pink-600" /> Influencer Image</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={influencerPrompt} onChange={e => setInfluencerPrompt(e.target.value)} className="min-h-[180px] text-sm" />
              <Button onClick={handleGenerateImage} disabled={loading || !influencerPrompt.trim()} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? statusMsg : influencerImageUrl ? 'Regenerate Image' : 'Generate Image'}
              </Button>
              {influencerImageUrl && (
                <div className="space-y-3">
                  <img src={influencerImageUrl} alt="AI Influencer" className="w-full rounded-lg border shadow-sm" />
                  <Button onClick={handleGenerateVoiceScript} disabled={loading} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                    {loading ? statusMsg : 'Generate Voice Script'}
                  </Button>
                </div>
              )}
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Voice Script */}
        {step === 4 && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Mic className="w-5 h-5 text-pink-600" /> Voiceover Script</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {influencerImageUrl && <img src={influencerImageUrl} alt="Influencer" className="w-40 h-40 object-cover rounded-lg border mx-auto" />}
              <Textarea value={voiceScript} onChange={e => setVoiceScript(e.target.value)} className="min-h-[200px]" />
              <p className="text-xs text-gray-500">{voiceScript.split(/\s+/).filter(w => w).length} words · ~{Math.round(voiceScript.split(/\s+/).filter(w => w).length / 2.5)}s</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                <Button onClick={handleGenerateFullPipeline} disabled={loading || !voiceScript.trim()} className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  Generate Voiceover + Video
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Pipeline Running / Results */}
        {step === 5 && (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Video className="w-5 h-5 text-pink-600" /> UGC Pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {loading && (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-pink-600" />
                    <p className="text-sm font-medium text-pink-800">{pipelineStep}</p>
                  </div>
                  <Progress value={
                    pipelineStep.includes('project') ? 10 :
                    pipelineStep.includes('script') ? 20 :
                    pipelineStep.includes('voiceover') ? 40 :
                    pipelineStep.includes('scene') ? 60 :
                    pipelineStep.includes('Submitting') ? 70 :
                    pipelineStep.includes('Rendering') ? 85 :
                    pipelineStep.includes('Done') ? 100 : 50
                  } className="h-2" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {influencerImageUrl && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Influencer Image</p>
                    <img src={influencerImageUrl} alt="Influencer" className="w-full rounded-lg border" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Voice Script</p>
                  <div className="bg-gray-50 p-3 rounded-lg border text-xs text-gray-700 max-h-[200px] overflow-y-auto">{voiceScript}</div>
                </div>
              </div>

              {/* Results */}
              <div className="space-y-2">
                {voiceUrl && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <Volume2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm flex-1">Voiceover ready ({voiceDuration}s)</span>
                    <audio controls src={voiceUrl} className="h-8" />
                    <Button size="sm" variant="outline" onClick={() => { const a = document.createElement('a'); a.href = voiceUrl; a.download = 'ugc-voiceover.mp3'; a.target = '_blank'; a.click(); }}>
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {videoUrl && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">Video Generated!</span>
                    </div>
                    <video controls src={videoUrl} className="w-full rounded-lg border" />
                    <Button size="sm" variant="outline" className="mt-2 w-full gap-2" onClick={() => { const a = document.createElement('a'); a.href = videoUrl; a.download = 'ugc-video.mp4'; a.target = '_blank'; a.click(); }}>
                      <Download className="w-4 h-4" /> Download Video
                    </Button>
                  </div>
                )}
              </div>

              {!loading && influencerImageUrl && (
                <Button variant="outline" className="w-full gap-2" onClick={() => { const a = document.createElement('a'); a.href = influencerImageUrl; a.download = 'ugc-influencer.png'; a.target = '_blank'; a.click(); }}>
                  <Download className="w-4 h-4" /> Download Image
                </Button>
              )}

              {!loading && projectId && (
                <Button onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
                  Open in Full Pipeline <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}