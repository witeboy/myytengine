import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPageUrl } from '@/utils';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Users,
  Wand2,
  ImageIcon,
  Mic,
  Video,
  Download,
  CheckCircle2,
  Sparkles,
  Volume2,
  Save,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import UGCTemplates from '@/components/templates/UGCTemplates';
import InfluencerPromptBuilder, { buildUGCPrompt } from '@/components/ugc/InfluencerPromptBuilder';
import SaveInfluencerTemplate from '@/components/ugc/SaveInfluencerTemplate';
import InfluencerTemplatesPicker from '@/components/ugc/InfluencerTemplatesPicker';
import ProductUploader from '@/components/ugc/ProductUploader';
import VoicePicker from '@/components/repurpose/VoicePicker';
import OngoingUGCProjects from '@/components/ugc/OngoingUGCProjects';

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
  { value: 'gaming', label: 'Gaming' }
];

const MAX_SCRIPT_WORDS = 500;

export default function UGCPipeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectIdParam = searchParams.get('project_id');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: savedTemplates = [] } = useQuery({
    queryKey: ['influencer-templates-dropdown'],
    queryFn: () => base44.entities.InfluencerTemplates.list('-created_date', 50),
    initialData: []
  });

  // Step 1
  const [targetAudience, setTargetAudience] = useState('');
  const [targetDemography, setTargetDemography] = useState('');
  const [targetMarket, setTargetMarket] = useState('');

  // Step 2
  const [influencerType, setInfluencerType] = useState('');
  const [influencerAction, setInfluencerAction] = useState('');

  const [appearanceConfig, setAppearanceConfig] = useState({
    gender: 'female',
    ageRange: '24-30',
    skinTone: 'medium',
    ethnicity: '',
    hairStyle: '',
    clothing: '',
    setting: '',
    extraNotes: ''
  });

  const [holdMode, setHoldMode] = useState('product_review');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');

  // Step 3
  const [influencerPrompt, setInfluencerPrompt] = useState('');
  const [influencerImageUrl, setInfluencerImageUrl] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Step 4
  const [voiceScript, setVoiceScript] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [voiceGenerating, setVoiceGenerating] = useState(false);

  // Step 5
  const [pipelineStep, setPipelineStep] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // Loaded template
  const [loadedTemplateName, setLoadedTemplateName] = useState('');
  const [loadedTemplateArchetype, setLoadedTemplateArchetype] = useState('');
  const [loadedTemplateBasePrompt, setLoadedTemplateBasePrompt] = useState('');
  const [resumedProjectId, setResumedProjectId] = useState('');

  // Helpers
  const getWordCount = (text) => text.split(/\s+/).filter((w) => w.length > 0).length;
  const scriptWordCount = getWordCount(voiceScript);
  const isScriptTooLong = scriptWordCount > MAX_SCRIPT_WORDS;

  const showError = (msg, duration = 8000) => {
    setErrorMsg(msg);
    if (duration > 0) {
      setTimeout(() => setErrorMsg(''), duration);
    }
  };

  const clearStatus = () => {
    setStatusMsg('');
    setErrorMsg('');
  };

  // Load project data
  const loadProjectData = async (projectId) => {
    clearStatus();
    setStatusMsg('Loading project...');
    setLoading(true);

    try {
      const projects = await base44.entities.Projects.filter({ id: projectId });
      const project = projects[0];

      if (!project) {
        showError('Project not found');
        setLoading(false);
        return;
      }

      setResumedProjectId(project.id);
      setLoadedTemplateName(project.name || '');
      setInfluencerType(project.niche || '');

      if (project.reference_image_url) {
        setInfluencerImageUrl(project.reference_image_url);
      }

      const scripts = await base44.entities.Scripts.filter({ project_id: project.id });
      const finalScript = scripts.find((s) => s.version === 'final_aggregated') || scripts[0];
      if (finalScript?.full_script) {
        setVoiceScript(finalScript.full_script);
      }

      const settings = await base44.entities.ProductionSettings.filter({ project_id: project.id });
      const prod = settings[0];
      if (prod?.voiceover_url) {
        setVoiceUrl(prod.voiceover_url);
        setVoiceDuration(prod.total_duration_seconds || 0);
        if (prod.selected_voice_id) setSelectedVoiceId(prod.selected_voice_id);
      }

      if (prod?.voiceover_url) {
        setStep(4);
      } else if (finalScript?.full_script) {
        setStep(4);
      } else if (project.reference_image_url) {
        setStep(3);
      } else {
        setStep(1);
      }
    } catch (e) {
      console.error('Resume error:', e);
      showError('Failed to load project: ' + e.message);
    }

    setLoading(false);
    setStatusMsg('');
  };

  useEffect(() => {
    if (projectIdParam) {
      loadProjectData(projectIdParam);
    }
  }, [projectIdParam]);

  const handleResumeProject = (project) => {
    navigate(createPageUrl('UGCPipeline') + '?project_id=' + project.id, { replace: true });
    loadProjectData(project.id);
  };

  const typeLabel = loadedTemplateName
    ? loadedTemplateName + (loadedTemplateArchetype ? ' (' + loadedTemplateArchetype + ')' : '')
    : INFLUENCER_TYPES.find((t) => t.value === influencerType)?.label || influencerType;

  const handleTemplateSelect = (t) => {
    setTargetAudience(t.audience);
    setTargetDemography(t.demography);
    setTargetMarket(t.market);
    setInfluencerType(t.influencerType);
    setInfluencerAction(t.action);
    setStep(2);
  };

  const handleLoadTemplate = (template) => {
    setAppearanceConfig({
      gender: template.gender || 'female',
      ageRange: template.age_range || '24-30',
      skinTone: template.skin_tone || 'medium',
      ethnicity: template.ethnicity || '',
      hairStyle: '',
      clothing: '',
      setting: '',
      extraNotes: template.appearance_notes || ''
    });

    if (template.influencer_type) setInfluencerType(template.influencer_type);
    if (template.base_image_url) setInfluencerImageUrl(template.base_image_url);
    if (template.base_prompt) setInfluencerPrompt(template.base_prompt);
    if (template.target_audience) setTargetAudience(template.target_audience);
    if (template.monetization_fit) setTargetMarket(template.monetization_fit);

    if (template.archetype || template.voice_style) {
      const actionParts = [];
      if (template.archetype) actionParts.push(template.archetype);
      if (template.energy) actionParts.push('Energy: ' + template.energy.split('.')[0]);
      setInfluencerAction(
        'Speaking to camera as ' + (template.name || 'this influencer') + ', reviewing and recommending a product/app to their audience. ' + actionParts.join('. ') + '.'
      );
    }

    setLoadedTemplateName(template.name || '');
    setLoadedTemplateArchetype(template.archetype || '');
    setLoadedTemplateBasePrompt(template.base_prompt || '');
  };

  const handleGeneratePrompt = async () => {
    clearStatus();
    setLoading(true);
    setStatusMsg('Building hyper-realistic prompt...');

    try {
      if (loadedTemplateBasePrompt) {
        setStatusMsg('Adapting template prompt to your product...');
        
        const promptText = 'You are a UGC image prompt expert specializing in BELIEVABLE PRODUCT INTERACTION. I have an existing hyper-detailed image generation prompt for a specific influencer persona. I need you to adapt it to include a specific product/action context while keeping the EXACT persona identity intact.\n\n' +
          'EXISTING PERSONA PROMPT:\n' + loadedTemplateBasePrompt + '\n\n' +
          'PRODUCT/ACTION CONTEXT TO INTEGRATE:\n' +
          '- Hold Mode: ' + holdMode + '\n' +
          '- Product Description: ' + (productDescription || 'a product') + '\n' +
          '- Influencer Action: ' + influencerAction + '\n\n' +
          'CRITICAL RULES:\n' +
          '1. Keep ALL persona-specific appearance details from the existing prompt.\n' +
          '2. The PRODUCT INTERACTION must be the HERO ELEMENT of the image.\n' +
          '3. Based on hold mode, write DETAILED interaction instructions.\n' +
          '4. Ensure the action matches: "' + influencerAction + '"\n' +
          '5. Ensure PORTRAIT 9:16 format is specified.\n' +
          '6. Return ONLY the final prompt text, no explanations.';

        const mergedPrompt = await base44.integrations.Core.InvokeLLM({
          prompt: promptText
        });
        setInfluencerPrompt(mergedPrompt);
      } else {
        const prompt = buildUGCPrompt({
          ...appearanceConfig,
          influencerType: typeLabel,
          action: influencerAction,
          holdMode: holdMode,
          productDescription: productDescription
        });
        setInfluencerPrompt(prompt);
      }

      setStep(3);
    } catch (err) {
      console.error('Prompt generation error:', err);
      showError('Failed to generate prompt: ' + err.message);
    }

    setLoading(false);
    setStatusMsg('');
  };

  const handleGenerateImage = async () => {
    clearStatus();
    setLoading(true);
    setStatusMsg('Generating influencer image...');

    try {
      const genParams = { prompt: influencerPrompt };
      if (productImageUrl && holdMode !== 'none') {
        genParams.existing_image_urls = [productImageUrl];
      }

      const result = await base44.integrations.Core.GenerateImage(genParams);
      setInfluencerImageUrl(result.url);
    } catch (err) {
      console.error('Image generation error:', err);
      showError('Failed to generate image: ' + err.message);
    }

    setLoading(false);
    setStatusMsg('');
  };

  const handleGoToScript = () => {
    clearStatus();
    setStep(4);
  };

  const handleGenerateVoiceScript = async () => {
    clearStatus();
    setLoading(true);
    setStatusMsg('Writing voiceover script...');

    try {
      const scriptPrompt = 'You are a UGC scriptwriter. Write a short voiceover script (30-45 seconds) for a virtual influencer.\n\n' +
        'INFLUENCER TYPE: ' + typeLabel + '\n' +
        'ACTION: ' + influencerAction + '\n' +
        'TARGET AUDIENCE: ' + targetAudience + '\n' +
        'TARGET MARKET: ' + targetMarket + '\n\n' +
        'The script should:\n' +
        '- Sound natural and conversational\n' +
        '- Include a hook in the first 3 seconds\n' +
        '- Feel authentic UGC style\n' +
        '- Be 80-120 words MAXIMUM\n\n' +
        'Return ONLY the script text, no formatting or labels.';

      const result = await base44.integrations.Core.InvokeLLM({ prompt: scriptPrompt });
      setVoiceScript(result);
    } catch (err) {
      console.error('Script generation error:', err);
      showError('Failed to generate script: ' + err.message);
    }

    setLoading(false);
    setStatusMsg('');
  };

  const handleGenerateVoiceover = async () => {
    clearStatus();

    if (!voiceScript.trim()) {
      showError('Please enter a voiceover script');
      return;
    }

    if (!selectedVoiceId) {
      showError('Please select a voice');
      return;
    }

    if (isScriptTooLong) {
      showError('Script too long (' + scriptWordCount + ' words). Please reduce to under ' + MAX_SCRIPT_WORDS + ' words.');
      return;
    }

    setVoiceGenerating(true);
    setStatusMsg('Preparing voiceover...');

    try {
      let projectId = resumedProjectId;

      if (!projectId) {
        setStatusMsg('Creating project...');
        const project = await base44.entities.Projects.create({
          name: 'UGC: ' + typeLabel,
          niche: influencerType,
          tone: 'conversational',
          visual_style: 'photorealistic_4k',
          orientation: 'portrait',
          video_duration_minutes: 1,
          status: 'script_complete',
          current_step: 4,
          reference_image_url: influencerImageUrl || null
        });
        projectId = project.id;
        setResumedProjectId(project.id);
      }

      setStatusMsg('Saving script...');
      const existingScripts = await base44.entities.Scripts.filter({ project_id: projectId });
      const existingScript = existingScripts.find((s) => s.version === 'final_aggregated');

      if (existingScript) {
        await base44.entities.Scripts.update(existingScript.id, {
          full_script: voiceScript,
          word_count: scriptWordCount
        });
      } else {
        await base44.entities.Scripts.create({
          project_id: projectId,
          version: 'final_aggregated',
          title: 'UGC: ' + typeLabel,
          full_script: voiceScript,
          word_count: scriptWordCount
        });
      }

      setStatusMsg('Generating voiceover (this may take 30-60 seconds)...');

      const voResponse = await base44.functions.invoke('generateVoiceover', {
        project_id: projectId,
        voice_id: selectedVoiceId
      });

      const voResult = voResponse.data || voResponse;

      if (voResult.error) {
        throw new Error(voResult.error);
      }

      if (!voResult.voiceover_url) {
        throw new Error('No voiceover URL returned');
      }

      setVoiceUrl(voResult.voiceover_url);
      setVoiceDuration(voResult.voiceover_duration_seconds || 0);
      setStatusMsg('');

    } catch (err) {
      console.error('Voiceover generation error:', err);

      let errorMessage = 'Failed to generate voiceover. ';

      if (err?.response?.data?.error) {
        errorMessage += err.response.data.error;
      } else if (err?.message) {
        if (err.message.includes('522') || err.message.includes('timeout') || err.message.includes('Timeout')) {
          errorMessage += 'Voice API timed out. Try with a shorter script (under 100 words).';
        } else if (err.message.includes('500')) {
          errorMessage += 'Server error. Please try again in a moment.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Unknown error occurred. Please try again.';
      }

      showError(errorMessage, 0);
      setStatusMsg('');
    }

    setVoiceGenerating(false);
  };

  const handleGenerateLipSync = async () => {
    if (!influencerImageUrl || !voiceUrl) {
      showError('Missing image or voiceover');
      return;
    }

    clearStatus();
    setLoading(true);
    setStep(5);

    try {
      let finalImageUrl = influencerImageUrl;
      
      if (finalImageUrl.startsWith('data:')) {
        setPipelineStep('Uploading influencer image...');
        const resp = await fetch(finalImageUrl);
        const blob = await resp.blob();
        const file = new File([blob], 'ugc-influencer.png', { type: 'image/png' });
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        finalImageUrl = uploadResult.file_url;
      }

      setPipelineStep('Generating motion description...');
      let motionPrompt = 'Natural conversational head movements with slight nods and warm expressions.';
      
      try {
        const motionPromptText = 'You are a video director. Write a SHORT motion description (1-2 sentences) for a talking-head avatar video.\n\n' +
          'The person is: ' + typeLabel + '\n' +
          'They are doing: ' + influencerAction + '\n' +
          'Script: "' + voiceScript.substring(0, 200) + '..."\n\n' +
          'Describe natural head movements, facial expressions, and hand gestures. Keep under 50 words.\n' +
          'Return ONLY the motion description.';
        
        motionPrompt = await base44.integrations.Core.InvokeLLM({ prompt: motionPromptText });
      } catch (e) {
        console.warn('Motion prompt generation failed, using default');
      }

      setPipelineStep('Submitting to avatar API (lip-sync)...');
      
      let avatarResult;
      try {
        const avatarRes = await base44.functions.invoke('generateAvatarVideo', {
          image_url: finalImageUrl,
          audio_url: voiceUrl,
          prompt: motionPrompt,
          mode: 'std'
        });
        avatarResult = avatarRes.data || avatarRes;
      } catch (err) {
        const errMsg = err?.response?.data?.error || err.message || 'Unknown error';
        setPipelineStep('❌ ' + errMsg);
        setLoading(false);
        return;
      }

      if (avatarResult.success === false || avatarResult.error) {
        setPipelineStep('❌ ' + (avatarResult.error || 'Avatar API returned an error'));
        setLoading(false);
        return;
      }

      if (avatarResult.task_id) {
        const provider = avatarResult.provider || 'kie';
        setPipelineStep('Avatar rendering (' + provider + ') — polling...');
        
        let done = false;
        let polls = 0;

        while (!done && polls < 60) {
          await new Promise((r) => setTimeout(r, 15000));
          polls++;
          setPipelineStep('Avatar rendering (' + provider + ')... (poll ' + polls + '/60)');

          try {
            const pollRes = await base44.functions.invoke('pollAvatarVideo', {
              task_id: avatarResult.task_id,
              provider: provider
            });
            const pollResult = pollRes.data || pollRes;

            if (pollResult.status === 'COMPLETED') {
              setVideoUrl(pollResult.video_url || '');
              done = true;
            } else if (pollResult.status === 'FAILED') {
              setPipelineStep('❌ Avatar video failed: ' + (pollResult.error || 'Unknown error'));
              done = true;
            }
          } catch (pollErr) {
            console.warn('Poll error:', pollErr.message);
          }
        }

        if (!done) {
          setPipelineStep('⏱ Timed out — check back later.');
        }
      } else {
        setPipelineStep('❌ ' + (avatarResult.error || 'No task created'));
        setLoading(false);
        return;
      }

      setPipelineStep('Done!');
    } catch (err) {
      console.error('Lip-sync error:', err);
      setPipelineStep('❌ ' + err.message);
    }

    setLoading(false);
  };

  const handleDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.click();
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
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isCompleted = step > stepNum;
            const isCurrent = step === stepNum;
            const isClickable = isCompleted;

            return (
              <React.Fragment key={i}>
                <button
                  onClick={() => isClickable && setStep(stepNum)}
                  disabled={!isClickable && !isCurrent}
                  className={
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ' +
                    (isCompleted
                      ? 'bg-green-100 text-green-700 cursor-pointer hover:ring-2 hover:ring-green-300'
                      : isCurrent
                      ? 'bg-pink-100 text-pink-700'
                      : 'bg-gray-100 text-gray-400')
                  }
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <span className="w-3 text-center">{stepNum}</span>
                  )}
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {i < stepLabels.length - 1 && (
                  <div className={'w-6 h-0.5 ' + (step > stepNum ? 'bg-green-300' : 'bg-gray-200')} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Global Error Display */}
        {errorMsg && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{errorMsg}</p>
              <Button variant="outline" size="sm" onClick={() => setErrorMsg('')} className="mt-2 text-xs">
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-6">
            <OngoingUGCProjects onSelectProject={handleResumeProject} />
            <UGCTemplates onSelectTemplate={handleTemplateSelect} />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-pink-50 px-3 text-xs text-gray-500">or fill in manually</span>
              </div>
            </div>

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
                    onChange={(e) => setTargetAudience(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Target Demography</label>
                  <Input
                    placeholder="e.g. Urban millennials, middle income"
                    value={targetDemography}
                    onChange={(e) => setTargetDemography(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Target Market</label>
                  <Input
                    placeholder="e.g. US, UK, Australia"
                    value={targetMarket}
                    onChange={(e) => setTargetMarket(e.target.value)}
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
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <InfluencerTemplatesPicker onSelect={handleLoadTemplate} />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Influencer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Influencer Type</label>
                  <Select
                    value={influencerType}
                    onValueChange={(val) => {
                      if (val.startsWith('tpl_')) {
                        const tplId = val.replace('tpl_', '');
                        const tpl = savedTemplates.find((t) => t.id === tplId);
                        if (tpl) handleLoadTemplate(tpl);
                      } else {
                        setInfluencerType(val);
                        setLoadedTemplateName('');
                        setLoadedTemplateArchetype('');
                        setLoadedTemplateBasePrompt('');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedTemplates.length > 0 && (
                        <React.Fragment>
                          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            Saved Templates
                          </div>
                          {savedTemplates.map((t) => (
                            <SelectItem key={'tpl_' + t.id} value={'tpl_' + t.id}>
                              {t.name} {t.is_favorite ? '⭐' : ''}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t mt-1 pt-1.5">
                            Generic Types
                          </div>
                        </React.Fragment>
                      )}
                      {INFLUENCER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    What should the influencer be doing?
                  </label>
                  <Textarea
                    placeholder="e.g. Unboxing a product, speaking to camera..."
                    value={influencerAction}
                    onChange={(e) => setInfluencerAction(e.target.value)}
                    className="min-h-[80px]"
                  />
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
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button
                    onClick={handleGeneratePrompt}
                    disabled={
                      !influencerType ||
                      !influencerAction.trim() ||
                      !appearanceConfig.gender ||
                      !appearanceConfig.skinTone ||
                      loading
                    }
                    className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {loading ? statusMsg : 'Build Hyper-Realistic Prompt'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-pink-600" /> Influencer Image
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={influencerPrompt}
                onChange={(e) => setInfluencerPrompt(e.target.value)}
                className="min-h-[180px] text-sm"
              />

              <Button
                onClick={handleGenerateImage}
                disabled={loading || !influencerPrompt.trim()}
                className="w-full bg-pink-600 hover:bg-pink-700 gap-2"
              >
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
                    <Button onClick={handleGoToScript} className="flex-1 bg-pink-600 hover:bg-pink-700 gap-2">
                      <Mic className="w-4 h-4" /> Next: Voiceover
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>

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

        {/* STEP 4 */}
        {step === 4 && (
          <div className="space-y-4">
            {influencerImageUrl && (
              <div className="flex justify-center">
                <img
                  src={influencerImageUrl}
                  alt="Influencer"
                  className="w-32 h-32 object-cover rounded-xl border shadow-sm"
                />
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mic className="w-5 h-5 text-pink-600" /> Voiceover Script
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={voiceScript}
                  onChange={(e) => setVoiceScript(e.target.value)}
                  placeholder="Type or paste your voiceover script here..."
                  className={'min-h-[160px] ' + (isScriptTooLong ? 'border-red-300 focus:ring-red-200' : '')}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className={'text-xs ' + (isScriptTooLong ? 'text-red-600 font-medium' : 'text-gray-500')}>
                      {scriptWordCount} / {MAX_SCRIPT_WORDS} words · ~{Math.round(scriptWordCount / 2.5)}s
                    </p>
                    {isScriptTooLong && (
                      <Badge variant="destructive" className="text-[10px]">
                        Too long
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateVoiceScript}
                    disabled={loading}
                    className="gap-1.5 text-xs"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {loading ? 'Generating...' : 'AI Generate Script'}
                  </Button>
                </div>

                {isScriptTooLong && (
                  <p className="text-xs text-red-600">
                    Please reduce your script to under {MAX_SCRIPT_WORDS} words. Long scripts may cause timeout errors.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-pink-600" /> Select Voice
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VoicePicker selectedVoiceId={selectedVoiceId} onSelectVoice={setSelectedVoiceId} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button
                  onClick={handleGenerateVoiceover}
                  disabled={voiceGenerating || !voiceScript.trim() || !selectedVoiceId || isScriptTooLong}
                  className="w-full bg-pink-600 hover:bg-pink-700 gap-2"
                >
                  {voiceGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  {voiceGenerating ? statusMsg || 'Generating...' : voiceUrl ? 'Regenerate Voiceover' : 'Generate Voiceover'}
                </Button>

                {voiceGenerating && statusMsg && (
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-pink-600" />
                    <p className="text-sm text-pink-700">{statusMsg}</p>
                  </div>
                )}

                {voiceUrl && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Voiceover Ready ({voiceDuration}s)</span>
                    </div>
                    <audio controls src={voiceUrl} className="w-full h-10" />
                    <Button
                      onClick={handleGenerateLipSync}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                      Generate Lip-Sync Video
                    </Button>
                  </div>
                )}

                <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

      {/* STEP 5 */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5 text-pink-600" /> Lip-Sync Video
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-pink-600" />
                    <p className="text-sm font-medium text-pink-800">{pipelineStep}</p>
                  </div>
                  <Progress
                    value={
                      pipelineStep.includes('Uploading')
                        ? 15
                        : pipelineStep.includes('motion')
                        ? 25
                        : pipelineStep.includes('Submitting')
                        ? 40
                        : pipelineStep.includes('rendering') || pipelineStep.includes('poll')
                        ? 65
                        : pipelineStep.includes('Done')
                        ? 100
                        : 50
                    }
                    className="h-2"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {influencerImageUrl && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Influencer Image</p>
                    <img src={influencerImageUrl} alt="Influencer" className="w-full rounded-lg border" />
                  </div>
                )}
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Voiceover</p>
                    <audio controls src={voiceUrl} className="w-full h-10" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Script</p>
                    <div className="bg-gray-50 p-3 rounded-lg border text-xs text-gray-700 max-h-[150px] overflow-y-auto">
                      {voiceScript}
                    </div>
                  </div>
                </div>
              </div>

              {videoUrl && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Lip-sync Video Ready!</span>
                    <Badge className="bg-purple-100 text-purple-700 text-xs">AI Avatar</Badge>
                  </div>
                  <video controls src={videoUrl} className="w-full rounded-lg border" />
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => handleDownload(videoUrl, 'ugc-video.mp4')}
                    >
                      <Download className="w-4 h-4" /> Download Video
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleDownload(influencerImageUrl, 'ugc-influencer.png')}
                    >
                      <Download className="w-4 h-4" /> Image
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleDownload(voiceUrl, 'ugc-voiceover.mp3')}
                    >
                      <Download className="w-4 h-4" /> Audio
                    </Button>
                  </div>
                </div>
              )}

              {!loading && !videoUrl && pipelineStep && pipelineStep.startsWith('❌') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800">{pipelineStep.replace('❌ ', '')}</p>
                  {pipelineStep.includes('credits') && (
                    
                      href="https://klingai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-red-600 underline mt-1 inline-block"
                    >
                      Top up your Kling AI credits →
                    </a>
                  )}
                </div>
              )}

              {!loading && !videoUrl && (
                <Button onClick={handleGenerateLipSync} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
                  <RefreshCw className="w-4 h-4" /> Retry Lip-Sync Generation
                </Button>
              )}

              {!loading && (
                <Button variant="outline" onClick={() => setStep(4)} className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back to Voiceover
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}