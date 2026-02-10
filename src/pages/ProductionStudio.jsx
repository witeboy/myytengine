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
import Timeline from '@/components/production/Timeline';

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
      refetchSettings();
      setStep('timeline');
    },
  });

  // Create timeline blocks from script segments
  const handleCreateTimelineBlocks = async () => {
    if (!project || !settings) return;

    const segments = script?.full_script?.split('\n\n') || ['Default segment'];
    const timePerSegment = (settings.total_duration_seconds || 60) / segments.length;

    for (let i = 0; i < Math.min(segments.length, 5); i++) {
      await base44.entities.TimelineBlocks.create({
        project_id: projectId,
        block_type: i % 2 === 0 ? 'video' : 'image',
        prompt: segments[i]?.substring(0, 100) || `Segment ${i + 1}`,
        start_time_seconds: i * timePerSegment,
        duration_seconds: timePerSegment * 0.8,
        asset_style: selectedStyle,
        status: 'pending',
        order_index: i,
      });
    }

    refetchBlocks();
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
            />

            {settings?.voiceover_url && (
              <Card>
                <CardHeader>
                  <CardTitle>Voiceover Generated</CardTitle>
                </CardHeader>
                <CardContent>
                  <audio controls className="w-full">
                    <source src={settings.voiceover_url} type="audio/mpeg" />
                  </audio>
                  <p className="text-sm text-gray-600 mt-2">
                    Duration: {settings.total_duration_seconds}s
                  </p>
                </CardContent>
              </Card>
            )}

            {generateAudioMutation.isSuccess && (
              <Button
                onClick={() => {
                  handleCreateTimelineBlocks();
                  setStep('timeline');
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Create Timeline with Placeholders
              </Button>
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
                <Timeline
                  blocks={blocks}
                  totalDuration={settings?.total_duration_seconds || 60}
                  onBlockDurationChange={handleBlockDurationChange}
                  onBlockStartTimeChange={handleBlockStartTimeChange}
                  onBlockGenerate={(blockId) => generateAssetMutation.mutate(blockId)}
                  onBlockDelete={handleBlockDelete}
                  generatingBlockId={generatingBlockId}
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