import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2, Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AIEnhancements({ projectId, blocks, onUpdate }) {
  const [isProcessing, setIsProcessing] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [colorMood, setColorMood] = useState('cinematic');
  const [cropRatio, setCropRatio] = useState('9:16');

  const handleGenerateTransitions = async () => {
    setIsProcessing('transitions');
    try {
      await base44.functions.invoke('generateTransitions', { project_id: projectId });
      onUpdate?.();
    } catch (error) {
      console.error('Transition generation error:', error);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleApplyColorGrade = async () => {
    if (!selectedBlock) return;
    setIsProcessing('color');
    try {
      await base44.functions.invoke('generateColorGrade', {
        block_id: selectedBlock.id,
        block_prompt: selectedBlock.prompt,
        mood: colorMood
      });
      onUpdate?.();
      setSelectedBlock(null);
    } catch (error) {
      console.error('Color grade error:', error);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleApplySmartCrop = async () => {
    if (!selectedBlock) return;
    setIsProcessing('crop');
    try {
      await base44.functions.invoke('generateSmartCrop', {
        block_id: selectedBlock.id,
        block_prompt: selectedBlock.prompt,
        target_ratio: cropRatio
      });
      onUpdate?.();
      setSelectedBlock(null);
    } catch (error) {
      console.error('Smart crop error:', error);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRemoveBackground = async () => {
    if (!selectedBlock) return;
    setIsProcessing('background');
    try {
      await base44.functions.invoke('removeBackground', {
        block_id: selectedBlock.id,
        asset_url: selectedBlock.generated_asset_url
      });
      onUpdate?.();
      setSelectedBlock(null);
    } catch (error) {
      console.error('Background removal error:', error);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          AI Enhancements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto Transitions */}
        <div className="bg-white p-4 rounded-lg border border-indigo-100">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Auto Transitions
          </h3>
          <p className="text-xs text-gray-600 mb-3">Intelligently generate transitions between all blocks based on scene context.</p>
          <Button
            onClick={handleGenerateTransitions}
            disabled={isProcessing || blocks.length < 2}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            {isProcessing === 'transitions' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate All Transitions'
            )}
          </Button>
        </div>

        {/* Color Grading & Smart Crop - Block Specific */}
        {blocks.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-indigo-100 space-y-3">
            <h3 className="font-semibold text-sm">Per-Block Enhancements</h3>
            
            <div>
              <label className="text-xs font-medium block mb-2">Select Block</label>
              <Select
                value={selectedBlock?.id || ''}
                onValueChange={(id) => setSelectedBlock(blocks.find(b => b.id === id))}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose a block..." />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((block, idx) => (
                    <SelectItem key={block.id} value={block.id}>
                      Block {idx + 1}: {block.prompt.substring(0, 30)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBlock && (
              <>
                {/* Color Grading */}
                <div className="space-y-2">
                  <label className="text-xs font-medium block">Color Grading Mood</label>
                  <Select value={colorMood} onValueChange={setColorMood}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cinematic">Cinematic</SelectItem>
                      <SelectItem value="vibrant">Vibrant</SelectItem>
                      <SelectItem value="warm">Warm & Golden</SelectItem>
                      <SelectItem value="cool">Cool & Blue</SelectItem>
                      <SelectItem value="vintage">Vintage</SelectItem>
                      <SelectItem value="documentary">Documentary</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleApplyColorGrade}
                    disabled={isProcessing}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-sm"
                    size="sm"
                  >
                    {isProcessing === 'color' ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Grading...
                      </>
                    ) : (
                      'Apply Color Grade'
                    )}
                  </Button>
                </div>

                {/* Smart Crop */}
                <div className="space-y-2">
                  <label className="text-xs font-medium block">Smart Crop for Platform</label>
                  <Select value={cropRatio} onValueChange={setCropRatio}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">YouTube (16:9)</SelectItem>
                      <SelectItem value="9:16">TikTok/Reels (9:16)</SelectItem>
                      <SelectItem value="1:1">Square (1:1)</SelectItem>
                      <SelectItem value="4:3">Classic (4:3)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleApplySmartCrop}
                    disabled={isProcessing}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 text-sm"
                    size="sm"
                  >
                    {isProcessing === 'crop' ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Cropping...
                      </>
                    ) : (
                      'Apply Smart Crop'
                    )}
                  </Button>
                </div>

                {/* Background Removal */}
                <Button
                  onClick={handleRemoveBackground}
                  disabled={isProcessing || !selectedBlock.generated_asset_url}
                  className="w-full bg-green-600 hover:bg-green-700 text-sm"
                  size="sm"
                >
                  {isProcessing === 'background' ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Remove Background'
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}