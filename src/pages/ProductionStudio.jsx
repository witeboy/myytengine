import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Loader2, Plus } from 'lucide-react';
import AssetStyleSelector from '@/components/production/AssetStyleSelector';
import VoiceSelector from '@/components/production/VoiceSelector';
import StoryboardTimeline from '@/components/production/StoryboardTimeline';
import KeyframeEditor from '@/components/production/KeyframeEditor';
import TimelinePreview from '@/components/production/TimelinePreview';
import BrollSelector from '@/components/production/BrollSelector';
import RunwayVideoGenerator from '@/components/production/RunwayVideoGenerator';
import AIEnhancements from '@/components/production/AIEnhancements';

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Antoni', accent: 'European' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', accent: 'American' },
  { id: 'cgSgspJ2msLidFaJZe7t', name: 'Sam', accent: 'American' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Glinda', accent: 'American' },
];

export default function ProductionStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');

  const [step, setStep] = useState('style'); // style -> voice -> timeline -> done
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [generatingBlockId, setGeneratingBlockId] = useState(null);
  const [isCheckingVoice, setIsCheckingVoice] = useState(false);
  const [selectedBlockForKeyframes, setSelectedBlockForKeyframes] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [selectedBlockForBroll, setSelectedBlockForBroll] = useState(null);
  const [selectedBlockForRunway, setSelectedBlockForRunway] = useState(null);

  // Fetch project
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Projects.list();
      return projects.find(p => p.id === projectId);
    },
    enabled: !!projectId,
  });

  // Fetch production settings
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['production-settings', projectId],
    queryFn: async () => {
      const allSettings = await base44.entities.ProductionSettings.list();
      return allSettings.find(s => s.project_id === projectId);
    },
    enabled: !!projectId,
  });

  // Fetch timeline blocks
  const { data: blocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ['timeline-blocks', projectId],
    queryFn: async () => {
      const allBlocks = await base44.entities.TimelineBlocks.list();
      return allBlocks.filter(b => b.project_id === projectId).sort((a, b) => a.order_index - b.order_index);
    },
    enabled: !!projectId,
    refetchInterval: generatingBlockId ? 2000 : false,
  });

  // Fetch script for text extraction
  const { data: script } = useQuery({
    queryKey: ['script', projectId],
    queryFn: async () => {
      const allScripts = await base44.entities.Scripts.list();
      return allScripts.find(s => s.project_id === projectId && s.version === 'final');
    },
    enabled: !!projectId,
  });

  // Fetch visual prompts
  const { data: visualPrompts = [] } = useQuery({
    queryKey: ['visual-prompts', projectId],
    queryFn: async () => {
      const allPrompts = await base44.entities.VisualPrompts.list();
      return allPrompts.filter(p => p.project_id === projectId).sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  // Initialize settings
  useEffect(() => {
    if (settings) {
      setSelectedStyle(settings.selected_asset_style);
      setSelectedVoice(settings.selected_voice_id);
      if (settings.voiceover_url) {
        setStep('timeline');
      } else {
        setStep('voice');
      }
    }
  }, [settings]);

  // Generate voice audio mutation
  const generateAudioMutation = useMutation({
    mutationFn: async () => {
      const scriptText = script?.full_script || project?.name || 'Default narration';
      const result = await base44.functions.invoke('generateVoiceAudio', {
        project_id: projectId,
        voice_id: selectedVoice,
        script_text: scriptText,
      });
      return result;
    },
    onSuccess: () => {
      // Start polling for voice status
      pollVoiceStatus();
    },
  });

  // Poll voice status mutation
  const checkVoiceStatusMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('checkVoiceStatus', {
        project_id: projectId,
      });
      return result;
    },
    onSuccess: (result) => {
      if (result.status === 'completed') {
        refetchSettings();
        setStep('timeline');
        setIsCheckingVoice(false);
      } else if (result.status === 'generating') {
        // Continue polling after 2 seconds
        setTimeout(() => pollVoiceStatus(), 2000);
      }
    },
    onError: () => {
      setIsCheckingVoice(false);
    },
  });

  const pollVoiceStatus = async () => {
    setIsCheckingVoice(true);
    checkVoiceStatusMutation.mutate();
  };

  // Create timeline blocks from timing entries
  const handleCreateTimelineBlocks = async () => {
    try {
      await base44.functions.invoke('createPlaceholderTimeline', {
        project_id: projectId,
      });
      refetchBlocks();
    } catch (error) {
      console.error('Error creating timeline blocks:', error);
    }
  };

  // Generate asset mutation
  const generateAssetMutation = useMutation({
    mutationFn: async (blockId) => {
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;

      setGeneratingBlockId(blockId);
      const result = await base44.functions.invoke('generateAsset', {
        block_id: blockId,
        project_id: projectId,
        prompt: block.prompt,
        asset_style: selectedStyle,
        block_type: block.block_type,
      });
      return result;
    },
    onSuccess: () => {
      refetchBlocks();
      setGeneratingBlockId(null);
    },
    onError: () => {
      setGeneratingBlockId(null);
    },
  });

  // Update block timeline position
  const handleBlockStartTimeChange = async (blockId, newStartTime) => {
    await base44.entities.TimelineBlocks.update(blockId, {
      start_time_seconds: newStartTime,
    });
  };

  // Update block duration
  const handleBlockDurationChange = async (blockId, newDuration) => {
    await base44.entities.TimelineBlocks.update(blockId, {
      duration_seconds: newDuration,
    });
  };

  // Delete block
  const handleBlockDelete = async (blockId) => {
    await base44.entities.TimelineBlocks.delete(blockId);
    refetchBlocks();
  };



  // Update block keyframes
  const handleBlockKeyframesChange = async (blockId, keyframes) => {
    await base44.entities.TimelineBlocks.update(blockId, {
      keyframes: keyframes,
    });
    refetchBlocks();
  };

  // Generate preview
  const handleGeneratePreview = async () => {
    setIsGeneratingPreview(true);
    try {
      const result = await base44.functions.invoke('generateTimelinePreview', {
        project_id: projectId,
      });
      return result;
    } catch (error) {
      console.error('Preview generation error:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Apply B-roll to block
  const handleSelectBroll = async (video) => {
    if (!selectedBlockForBroll) return;

    await base44.entities.TimelineBlocks.update(selectedBlockForBroll.id, {
      status: 'completed',
      broll_source: 'freepik',
      broll_id: video.id,
      broll_url: video.preview,
      generated_asset_url: video.preview,
    });

    refetchBlocks();
    setSelectedBlockForBroll(null);
  };

  if (!projectId) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={8} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Production Studio</h1>

        {/* Step 1: Style Selection */}
        {step === 'style' && (
          <div className="grid gap-6">
            <AssetStyleSelector
              selectedStyle={selectedStyle}
              onStyleSelect={(style) => {
                setSelectedStyle(style);
              }}
            />

            <Button
              onClick={async () => {
                if (selectedStyle) {
                  // Save style to production settings
                  if (settings) {
                    await base44.entities.ProductionSettings.update(settings.id, {
                      selected_asset_style: selectedStyle,
                    });
                  } else {
                    await base44.entities.ProductionSettings.create({
                      project_id: projectId,
                      selected_asset_style: selectedStyle,
                    });
                  }
                  refetchSettings();
                  setStep('voice');
                }
              }}
              disabled={!selectedStyle}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Continue to Voice Selection
            </Button>
          </div>
        )}

        {/* Step 2: Voice Selection & Audio Generation */}
        {step === 'voice' && (
          <div className="grid gap-6">
            <VoiceSelector
              voices={VOICES}
              selectedVoice={selectedVoice}
              onVoiceSelect={setSelectedVoice}
              onGenerateAudio={() => generateAudioMutation.mutate()}
              isGenerating={generateAudioMutation.isPending}
              isChecking={isCheckingVoice}
            />

            {settings?.voiceover_status === 'generating' && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Generating voiceover... this may take a minute</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {settings?.voiceover_url && settings?.voiceover_status === 'completed' && (
              <Card>
                <CardHeader>
                  <CardTitle>Voiceover Generated ✓</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <audio controls className="w-full">
                    <source src={settings.voiceover_url} type="audio/mpeg" />
                  </audio>
                  <p className="text-sm text-gray-600">
                    Duration: {settings.total_duration_seconds}s
                  </p>
                  <Button
                    onClick={() => {
                      handleCreateTimelineBlocks();
                      setStep('timeline');
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Continue to Timeline
                  </Button>
                </CardContent>
              </Card>
            )}

            {settings?.voiceover_status === 'failed' && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-6">
                  <p className="text-sm text-red-600">Failed to generate voiceover. Please try again.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 3: Timeline & Asset Generation */}
        {step === 'timeline' && settings?.voiceover_url && (
          <div className="grid gap-6">
            {blocks.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-gray-600 mb-4">No timeline blocks created yet</p>
                  <Button
                    onClick={handleCreateTimelineBlocks}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Auto-Create Asset Placeholders
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Storyboard Timeline with Placeholders */}
                <StoryboardTimeline
                  blocks={blocks}
                  totalDuration={settings?.total_duration_seconds || 60}
                  voiceoverUrl={settings.voiceover_url}
                  onBlockDurationChange={handleBlockDurationChange}
                  onBlockStartTimeChange={handleBlockStartTimeChange}
                  onBlockGenerate={(blockId) => generateAssetMutation.mutate(blockId)}
                  onBlockDelete={handleBlockDelete}
                  generatingBlockId={generatingBlockId}
                />

                {/* Asset Generation Options */}
                {blocks.some(b => b.status === 'pending') && (
                  <Card className="bg-blue-50 border-blue-200 p-4">
                    <h3 className="font-semibold text-sm text-blue-900 mb-3">Generate Assets</h3>
                    <div className="flex gap-2 flex-wrap">
                      {selectedBlockForRunway && selectedBlockForRunway.block_type === 'video' && (
                        <RunwayVideoGenerator
                          blockId={selectedBlockForRunway.id}
                          blockPrompt={selectedBlockForRunway.prompt}
                          blockDuration={selectedBlockForRunway.duration_seconds}
                          onGenerationStart={() => refetchBlocks()}
                          onGenerationComplete={() => refetchBlocks()}
                        />
                      )}

                      {selectedBlockForBroll && !selectedBlockForRunway && selectedBlockForBroll.block_type === 'video' && (
                        <BrollSelector
                          blockPrompt={selectedBlockForBroll.prompt}
                          blockDuration={selectedBlockForBroll.duration_seconds}
                          onSelectVideo={handleSelectBroll}
                          selectedVideoId={selectedBlockForBroll.broll_id}
                        />
                      )}

                      {!selectedBlockForRunway && !selectedBlockForBroll && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setSelectedBlockForRunway(blocks.find(b => b.block_type === 'video' && b.status === 'pending'))}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            Generate Video
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setSelectedBlockForBroll(blocks.find(b => b.block_type === 'video' && b.status === 'pending'))}
                            className="bg-cyan-600 hover:bg-cyan-700"
                          >
                            Find B-Roll
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                )}

                {/* AI Enhancements */}
                <AIEnhancements
                  projectId={projectId}
                  blocks={blocks}
                  onUpdate={() => refetchBlocks()}
                />

                {/* Timeline Preview */}
                <TimelinePreview
                  blocks={blocks}
                  totalDuration={settings?.total_duration_seconds || 60}
                  voiceoverUrl={settings.voiceover_url}
                  onGeneratePreview={handleGeneratePreview}
                  isGenerating={isGeneratingPreview}
                />

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep('voice')}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => navigate(createPageUrl(`publish_center?project_id=${projectId}`))}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Proceed to Publish
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}