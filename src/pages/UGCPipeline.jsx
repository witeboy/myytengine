import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPageUrl } from '@/utils';
import {
  Loader2, ArrowLeft, ArrowRight, Users, Wand2, ImageIcon,
  Mic, Video, Download, CheckCircle2, Sparkles
} from 'lucide-react';

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

  // Step 1: Audience & Demography
  const [targetAudience, setTargetAudience] = useState('');
  const [targetDemography, setTargetDemography] = useState('');
  const [targetMarket, setTargetMarket] = useState('');

  // Step 2: Influencer type
  const [influencerType, setInfluencerType] = useState('');
  const [influencerAction, setInfluencerAction] = useState('');

  // Step 3: AI prompt
  const [influencerPrompt, setInfluencerPrompt] = useState('');
  const [influencerImageUrl, setInfluencerImageUrl] = useState('');

  // Step 4: Voiceover script
  const [voiceScript, setVoiceScript] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');

  // Step 5: Final video
  const [finalVideoUrl, setFinalVideoUrl] = useState('');

  const handleGeneratePrompt = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a UGC (User Generated Content) creative director. Create a detailed AI image generation prompt for a virtual influencer.

TARGET AUDIENCE: ${targetAudience}
TARGET DEMOGRAPHY: ${targetDemography}
TARGET MARKET: ${targetMarket}
INFLUENCER TYPE: ${INFLUENCER_TYPES.find(t => t.value === influencerType)?.label || influencerType}
WHAT THEY'RE DOING: ${influencerAction}

Create a detailed, photorealistic image generation prompt that describes:
1. The influencer's appearance (age range, style, outfit, hair, expression)
2. The environment/setting they're in
3. What they're doing/holding
4. Camera angle and lighting
5. Overall mood and aesthetic

The prompt should be 150-250 words, highly detailed, photorealistic quality.
Return ONLY the prompt text, nothing else.`,
    });
    setInfluencerPrompt(result);
    setLoading(false);
    setStep(3);
  };

  const handleGenerateImage = async () => {
    setLoading(true);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: influencerPrompt,
    });
    setInfluencerImageUrl(url);
    setLoading(false);
  };

  const handleGenerateVoiceScript = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a UGC content scriptwriter. Write a short, authentic voiceover script (30-60 seconds speaking time) for a virtual influencer video.

INFLUENCER TYPE: ${INFLUENCER_TYPES.find(t => t.value === influencerType)?.label || influencerType}
ACTION: ${influencerAction}
TARGET AUDIENCE: ${targetAudience}
TARGET MARKET: ${targetMarket}

The script should:
- Sound natural and conversational, like a real person talking to camera
- Include a hook in the first 3 seconds
- Feel authentic to UGC style (not overly polished)
- Include natural pauses and emphasis points
- Be between 80-150 words

Return ONLY the script text, no directions or labels.`,
    });
    setVoiceScript(result);
    setLoading(false);
    setStep(4);
  };

  const handleGenerateVoice = async () => {
    setLoading(true);
    // Use the TTS pipeline
    const AI33_KEY = true; // We'll use the existing voiceover pipeline
    // For now, generate using InvokeLLM to get a polished script, then user can use voiceover panel
    setVoiceUrl('pending'); // Placeholder — would connect to TTS
    setLoading(false);
    setStep(5);
  };

  const stepLabels = ['Audience', 'Influencer', 'Image Prompt', 'Voice Script', 'Generate'];

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
          <p className="text-gray-500 mt-1">Generate AI influencer content with lip-sync video</p>
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

        {/* Step 1: Audience */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Target Audience & Market</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Target Audience</label>
                <Input
                  placeholder="e.g. Women 25-35 interested in skincare"
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Target Demography</label>
                <Input
                  placeholder="e.g. Urban millennials, middle income"
                  value={targetDemography}
                  onChange={e => setTargetDemography(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Target Market</label>
                <Input
                  placeholder="e.g. US, UK, Australia"
                  value={targetMarket}
                  onChange={e => setTargetMarket(e.target.value)}
                />
              </div>
              <Button
                onClick={() => setStep(2)}
                disabled={!targetAudience.trim()}
                className="w-full bg-pink-600 hover:bg-pink-700 gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Influencer Type */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Influencer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Influencer Type</label>
                <Select value={influencerType} onValueChange={setInfluencerType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {INFLUENCER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">What should the influencer be doing?</label>
                <Textarea
                  placeholder="e.g. Unboxing a skincare product, showing before/after results, speaking directly to camera in a bathroom..."
                  value={influencerAction}
                  onChange={e => setInfluencerAction(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handleGeneratePrompt}
                  disabled={!influencerType || !influencerAction.trim() || loading}
                  className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate Influencer Prompt
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Image Prompt & Generation */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-pink-600" />
                Influencer Image Prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={influencerPrompt}
                onChange={e => setInfluencerPrompt(e.target.value)}
                className="min-h-[200px] text-sm"
                placeholder="AI-generated prompt..."
              />
              <Button
                onClick={handleGenerateImage}
                disabled={loading || !influencerPrompt.trim()}
                className="w-full bg-pink-600 hover:bg-pink-700 gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Generating Image...' : 'Generate Influencer Image'}
              </Button>

              {influencerImageUrl && (
                <div className="space-y-3">
                  <img src={influencerImageUrl} alt="AI Influencer" className="w-full rounded-lg border shadow-sm" />
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleGenerateImage} disabled={loading} className="gap-2">
                      <Sparkles className="w-4 h-4" /> Regenerate
                    </Button>
                    <Button
                      onClick={handleGenerateVoiceScript}
                      disabled={loading}
                      className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      Generate Voice Script
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Voice Script */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mic className="w-5 h-5 text-pink-600" />
                Voiceover Script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {influencerImageUrl && (
                <img src={influencerImageUrl} alt="AI Influencer" className="w-40 h-40 object-cover rounded-lg border mx-auto" />
              )}
              <Textarea
                value={voiceScript}
                onChange={e => setVoiceScript(e.target.value)}
                className="min-h-[200px]"
              />
              <p className="text-xs text-gray-500">
                {voiceScript.split(/\s+/).filter(w => w).length} words · ~{Math.round(voiceScript.split(/\s+/).filter(w => w).length / 2.5)}s
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handleGenerateVoice}
                  disabled={loading || !voiceScript.trim()}
                  className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  Generate Video
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Final */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5 text-pink-600" />
                UGC Video Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 text-center">
                <Sparkles className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-pink-800">Video Generation Pipeline</p>
                <p className="text-xs text-pink-600 mt-1">
                  The lip-sync video generation will combine your influencer image with the voiceover script.
                  This feature connects to Kling or similar lip-sync APIs.
                </p>
              </div>

              {influencerImageUrl && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Influencer Image</p>
                    <img src={influencerImageUrl} alt="Influencer" className="w-full rounded-lg border" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Voice Script</p>
                    <div className="bg-gray-50 p-3 rounded-lg border text-xs text-gray-700 max-h-[200px] overflow-y-auto">
                      {voiceScript}
                    </div>
                  </div>
                </div>
              )}

              {influencerImageUrl && (
                <Button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = influencerImageUrl;
                    a.download = 'ugc-influencer.png';
                    a.target = '_blank';
                    a.click();
                  }}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Download className="w-4 h-4" /> Download Influencer Image
                </Button>
              )}

              <Button variant="outline" onClick={() => setStep(4)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}