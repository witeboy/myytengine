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
  Mic, Video, Download, CheckCircle2, Sparkles, Volume2, Save, Play, Pause, RefreshCw
} from 'lucide-react';
import UGCTemplates from '@/components/templates/UGCTemplates';
import InfluencerPromptBuilder, { buildUGCPrompt } from '@/components/ugc/InfluencerPromptBuilder';
import SaveInfluencerTemplate from '@/components/ugc/SaveInfluencerTemplate';
import InfluencerTemplatesPicker from '@/components/ugc/InfluencerTemplatesPicker';
import ProductUploader from '@/components/ugc/ProductUploader';
import VoicePicker from '@/components/repurpose/VoicePicker';

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

  // Step 2.5 — appearance config
  const [appearanceConfig, setAppearanceConfig] = useState({
    gender: 'female', ageRange: '24-30', skinTone: 'medium', ethnicity: '',
    hairStyle: '', clothing: '', setting: '', extraNotes: '',
  });

  // Product/App hold config
  const [holdMode, setHoldMode] = useState('product_review');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');

  // Step 3
  const [influencerPrompt, setInfluencerPrompt] = useState('');
  const [influencerImageUrl, setInfluencerImageUrl] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Step 4 — voiceover
  const [voiceScript, setVoiceScript] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [voiceGenerating, setVoiceGenerating] = useState(false);

  // Step 5 — lip-sync video
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

  // ── Step 2→3: Build influencer prompt from config ──────────
  const handleGeneratePrompt = async () => {
    setLoading(true);
    setStatusMsg('Building hyper-realistic prompt...');
    const prompt = buildUGCPrompt({
      ...appearanceConfig,
      influencerType: typeLabel,
      action: influencerAction,
      holdMode,
      productDescription,
    });
    setInfluencerPrompt(prompt);
    setLoading(false);
    setStatusMsg('');
    setStep(3);
  };

  // ── Load from saved template ──────────────────────────────
  const handleLoadTemplate = (template) => {
    setAppearanceConfig({
      gender: template.gender || 'female',
      ageRange: template.age_range || '24-30',
      skinTone: template.skin_tone || 'medium',
      ethnicity: template.ethnicity || '',
      hairStyle: '',
      clothing: '',
      setting: '',
      extraNotes: template.appearance_notes || '',
    });
    if (template.influencer_type) setInfluencerType(template.influencer_type);
    if (template.base_image_url) setInfluencerImageUrl(template.base_image_url);
    if (template.base_prompt) setInfluencerPrompt(template.base_prompt);
    // Pre-fill audience from rich template data
    if (template.target_audience) setTargetAudience(template.target_audience);
    if (template.monetization_fit) setTargetMarket(template.monetization_fit);
  };

  // ── Step 3: Generate image ──────────────────────────────────
  const handleGenerateImage = async () => {
    setLoading(true);
    setStatusMsg('Generating influencer image...');
    const genParams = { prompt: influencerPrompt };
    // Pass product/app image as reference if uploaded
    if (productImageUrl && holdMode !== 'none') {
      genParams.existing_image_urls = [productImageUrl];
    }
    const { url } = await base44.integrations.Core.GenerateImage(genParams);
    setInfluencerImageUrl(url);
    setLoading(false);
    setStatusMsg('');
  };

  // ── Step 3→4: Move to script step ─────────────────────────
  const handleGoToScript = () => {
    setStep(4);
  };

  // ── Step 4: Generate AI script suggestion ─────────────────────────
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
  };

  // ── Step 4: Generate voiceover from script + voice ─────────────────
  const handleGenerateVoiceover = async () => {
    if (!voiceScript.trim() || !selectedVoiceId) return;
    setVoiceGenerating(true);
    setStatusMsg('Generating voiceover...');

    // Create a temp project + script for the voiceover function
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

    await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: `UGC: ${typeLabel}`,
      full_script: voiceScript,
      word_count: voiceScript.split(/\s+/).filter(w => w).length,
    });

    const voResponse = await base44.functions.invoke('generateVoiceover', {
      project_id: project.id,
      voice_id: selectedVoiceId,
    });
    const voResult = voResponse.data || voResponse;
    setVoiceUrl(voResult.voiceover_url || '');
    setVoiceDuration(voResult.voiceover_duration_seconds || 0);

    setVoiceGenerating(false);
    setStatusMsg('');
  };

  // ── Step 5: Generate Kling lip-sync video ──────────────────────────
  const handleGenerateLipSync = async () => {
    if (!influencerImageUrl || !voiceUrl) return;
    setLoading(true);
    setStep(5);

    // Ensure image is a public URL
    let finalImageUrl = influencerImageUrl;
    if (finalImageUrl.startsWith('data:')) {
      setPipelineStep('Uploading influencer image...');
      const resp = await fetch(finalImageUrl);
      const blob = await resp.blob();
      const file = new File([blob], 'ugc-influencer.png', { type: 'image/png' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      finalImageUrl = file_url;
    }

    // Generate motion prompt
    setPipelineStep('Generating motion description...');
    let motionPrompt = '';
    try {
      motionPrompt = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a video director. Write a SHORT motion description (1-2 sentences) for a talking-head avatar video.

The person is: ${typeLabel}
They are doing: ${influencerAction}
Script: "${voiceScript.substring(0, 200)}..."

Describe natural head movements, facial expressions, and hand gestures. Keep under 50 words.
Return ONLY the motion description.`,
      });
    } catch (_) {
      motionPrompt = 'Natural conversational head movements with slight nods and warm expressions.';
    }

    // Submit to Kling AI Avatar
    setPipelineStep('Submitting to Kling AI Avatar (lip-sync)...');
    const avatarRes = await base44.functions.invoke('generateAvatarVideo', {
      image_url: finalImageUrl,
      audio_url: voiceUrl,
      prompt: motionPrompt,
    });
    const avatarResult = avatarRes.data || avatarRes;

    if (avatarResult.task_id) {
      setPipelineStep('Avatar rendering with Kling AI — polling...');
      let done = false;
      let polls = 0;
      while (!done && polls < 60) {
        await new Promise(r => setTimeout(r, 15000));
        polls++;
        setPipelineStep(`Kling Avatar rendering... (poll ${polls})`);
        try {
          const pollRes = await base44.functions.invoke('pollAvatarVideo', {
            task_id: avatarResult.task_id,
          });
          const pollResult = pollRes.data || pollRes;
          if (pollResult.status === 'COMPLETED') {
            setVideoUrl(pollResult.video_url || '');
            done = true;
          } else if (pollResult.status === 'FAILED') {
            console.warn('Avatar video failed:', pollResult.error);
            setPipelineStep('Avatar video failed. Try again.');
            done = true;
          }
        } catch (pollErr) {
          console.warn('Poll error:', pollErr.message);
        }
      }
      if (!done) setPipelineStep('Timed out — check back later.');
    }

    if (videoUrl || pipelineStep.includes('failed') || pipelineStep.includes('Timed')) {
      // already set
    } else {
      setPipelineStep('Done!');
    }
    setLoading(false);
  };

  const stepLabels = ['Audience', 'Influencer', 'Image', 'Voice', 'Lip-Sync'];

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
          <p className="text-gray-500 mt-1">AI influencer → Image → Voice → Kling Lip-sync Video</p>
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

        {/* Step 2: Influencer Type + Appearance */}
        {step === 2 && (
          <div className="space-y-4">
            <InfluencerTemplatesPicker onSelect={handleLoadTemplate} />
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
                  <Textarea placeholder="e.g. Unboxing a product, speaking to camera..." value={influencerAction} onChange={e => setInfluencerAction(e.target.value)} className="min-h-[80px]" />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Product / App to Showcase</p>
                  <ProductUploader
                    holdMode={holdMode}
                    onHoldModeChange={setHoldMode}
                    productImageUrl={productImageUrl}
                    onProductImageChange={setProductImageUrl}
                    productDescription={productDescription}
                    onProductDescriptionChange={setProductDescription}
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Appearance & Demographics</p>
                  <InfluencerPromptBuilder config={appearanceConfig} onChange={setAppearanceConfig} />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                  <Button onClick={handleGeneratePrompt} disabled={!influencerType || !influencerAction.trim() || !appearanceConfig.gender || !appearanceConfig.skinTone || loading} className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {loading ? statusMsg : 'Build Hyper-Realistic Prompt'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
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
                  <div className="flex gap-2">
                    <Button onClick={() => setShowSaveTemplate(true)} variant="outline" className="gap-2">
                      <Save className="w-4 h-4" /> Save as Template
                    </Button>
                    <Button onClick={handleGenerateVoiceScript} disabled={loading} className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {loading ? statusMsg : 'Generate Voice Script'}
                    </Button>
                  </div>
                </div>
              )}
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
              <SaveInfluencerTemplate
                open={showSaveTemplate}
                onClose={() => setShowSaveTemplate(false)}
                config={appearanceConfig}
                imageUrl={influencerImageUrl}
                prompt={influencerPrompt}
                influencerType={influencerType}
              />
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
                  Generate Voiceover + Lip-sync Video
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
                    pipelineStep.includes('voiceover') || pipelineStep.includes('TTS') ? 35 :
                    pipelineStep.includes('scene') ? 50 :
                    pipelineStep.includes('motion') ? 55 :
                    pipelineStep.includes('Submitting') ? 60 :
                    pipelineStep.includes('Avatar rendering') || pipelineStep.includes('Kling') ? 75 :
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
                      <span className="text-sm font-medium">Lip-sync Video Generated!</span>
                      <Badge className="bg-purple-100 text-purple-700 text-xs">Kling AI Avatar</Badge>
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