import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Film } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function RunwayVideoGenerator({ 
  blockId, 
  blockPrompt,
  blockDuration,
  onGenerationStart,
  onGenerationComplete
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [duration, setDuration] = useState(8);
  const [ratio, setRatio] = useState('1280:720');
  const [taskId, setTaskId] = useState(null);

  const handleGenerateVideo = async () => {
    if (!blockPrompt) return;

    setIsGenerating(true);
    try {
      const result = await base44.functions.invoke('generateRunwayVideo', {
        block_id: blockId,
        project_id: new URLSearchParams(window.location.search).get('project_id'),
        prompt: blockPrompt,
        duration,
        ratio
      });

      if (result.data?.task_id) {
        setTaskId(result.data.task_id);
        onGenerationStart?.(result.data.task_id);
        
        // Start polling
        pollStatus(result.data.task_id);
      }
    } catch (error) {
      console.error('Generation error:', error);
      setIsGenerating(false);
    }
  };

  const pollStatus = async (taskId) => {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5 sec intervals)

    const checkStatus = async () => {
      attempts++;
      try {
        const result = await base44.functions.invoke('checkRunwayVideoStatus', {
          block_id: blockId,
          task_id: taskId
        });

        if (result.data?.status === 'COMPLETED') {
          setIsGenerating(false);
          setTaskId(null);
          onGenerationComplete?.(result.data.video_url);
        } else if (result.data?.status === 'FAILED') {
          setIsGenerating(false);
          setTaskId(null);
        } else if (attempts < maxAttempts) {
          // Continue polling
          setTimeout(checkStatus, 5000);
        } else {
          setIsGenerating(false);
          setTaskId(null);
        }
      } catch (error) {
        console.error('Status check error:', error);
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        } else {
          setIsGenerating(false);
        }
      }
    };

    checkStatus();
  };

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="w-5 h-5" />
          Generate with Runway Gen 4.5
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="space-y-3 bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-600">
            <strong>Prompt:</strong> {blockPrompt}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Duration (sec)</label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 seconds</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">Aspect Ratio</label>
              <Select value={ratio} onValueChange={setRatio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1280:720">16:9 (YouTube)</SelectItem>
                  <SelectItem value="720:1280">9:16 (TikTok)</SelectItem>
                  <SelectItem value="960:960">1:1 (Square)</SelectItem>
                  <SelectItem value="1104:832">4:3</SelectItem>
                  <SelectItem value="832:1104">3:4 (Pinterest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerateVideo}
            disabled={isGenerating || !blockPrompt}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Video... (this may take 1-3 minutes)
              </>
            ) : (
              <>
                <Film className="w-4 h-4 mr-2" />
                Generate Video
              </>
            )}
          </Button>
        </div>

        {taskId && isGenerating && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            Task ID: {taskId.substring(0, 8)}... 
            <br />
            Runway is rendering your video. You can close this and check back later.
          </div>
        )}
      </CardContent>
    </Card>
  );
}