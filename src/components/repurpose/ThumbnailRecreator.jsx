import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ImageIcon, RefreshCw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import ThumbnailTweakEditor from '@/components/postprod/ThumbnailTweakEditor';

export default function ThumbnailRecreator({ videoUrl, newTitle, projectId }) {
  const [step, setStep] = useState('idle'); // idle | analyzing | tweaking | building | generating | done
  const [thumbnailAnalysis, setThumbnailAnalysis] = useState(null);
  const [originalThumbUrl, setOriginalThumbUrl] = useState('');
  const [generatedThumbUrl, setGeneratedThumbUrl] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const extractVideoId = (url) => {
    const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
              url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
              url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  const handleAnalyze = async () => {
    setStep('analyzing');
    setError('');
    const resp = await base44.functions.invoke('analyzeYouTubeThumbnail', { youtube_url: videoUrl });
    const data = resp.data;
    if (data.error) {
      setError(data.error);
      setStep('idle');
      return;
    }
    setThumbnailAnalysis(data.analysis);
    setOriginalThumbUrl(data.thumbnail_url);
    setStep('tweaking');
    setExpanded(true);
  };

  const handleBuildAndGenerate = async (tweaks) => {
    setStep('building');

    // Build prompt
    const promptResp = await base44.functions.invoke('buildTweakedThumbnailPrompt', {
      original_analysis: thumbnailAnalysis,
      tweaks: {
        ...tweaks,
        globalNotes: (tweaks.globalNotes || '') + (newTitle ? `\nNew video title: "${newTitle}" — incorporate this into text overlays if relevant.` : ''),
      },
      thumbnail_url: originalThumbUrl,
    });

    const promptData = promptResp.data;
    if (!promptData.success || !promptData.prompt) {
      setError('Failed to build prompt');
      setStep('tweaking');
      return;
    }

    // Generate image
    setStep('generating');
    const imgResp = await base44.functions.invoke('generateTweakedThumbnailImage', {
      prompt: promptData.prompt,
    });

    const imgData = imgResp.data;
    if (imgData.success && imgData.image_url) {
      setGeneratedThumbUrl(imgData.image_url);

      // Save as thumbnail concept if project exists
      if (projectId) {
        await base44.entities.ThumbnailConcepts.create({
          project_id: projectId,
          rank: 1,
          concept_description: 'Recreated from original video thumbnail',
          image_prompt: promptData.prompt,
          image_url: imgData.image_url,
          is_selected: true,
        });
      }
      setStep('done');
    } else {
      setError('Image generation failed');
      setStep('tweaking');
    }
  };

  const handleQuickRecreate = async () => {
    if (!thumbnailAnalysis?.recreate_prompt) return;
    setStep('generating');

    // Enhance prompt with new title
    let prompt = thumbnailAnalysis.recreate_prompt;
    if (newTitle) {
      prompt = prompt.replace(/["'][^"']{3,}["']/g, `"${newTitle}"`);
    }

    const imgResp = await base44.functions.invoke('generateTweakedThumbnailImage', { prompt });
    const imgData = imgResp.data;
    if (imgData.success && imgData.image_url) {
      setGeneratedThumbUrl(imgData.image_url);
      if (projectId) {
        await base44.entities.ThumbnailConcepts.create({
          project_id: projectId,
          rank: 1,
          concept_description: 'Quick recreate from original thumbnail',
          image_prompt: prompt,
          image_url: imgData.image_url,
          is_selected: true,
        });
      }
      setStep('done');
    } else {
      setError('Generation failed');
      setStep('tweaking');
    }
  };

  return (
    <Card className="border-blue-100">
      <CardContent className="p-4 space-y-3">
        <button className="flex items-center gap-2 w-full text-left" onClick={() => setExpanded(!expanded)}>
          <ImageIcon className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold flex-1">Thumbnail Recreation</span>
          {generatedThumbUrl && <Badge className="bg-green-100 text-green-700 text-[10px]">Done</Badge>}
          {step === 'idle' && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
          {expanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
        </button>

        {expanded && (
          <div className="space-y-3">
            {step === 'idle' && (
              <Button onClick={handleAnalyze} className="w-full bg-blue-600 hover:bg-blue-700 gap-2" size="sm">
                <ImageIcon className="w-4 h-4" /> Analyze Original Thumbnail
              </Button>
            )}

            {step === 'analyzing' && (
              <div className="flex items-center gap-2 justify-center py-6 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing thumbnail with AI vision...
              </div>
            )}

            {step === 'tweaking' && thumbnailAnalysis && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button onClick={handleQuickRecreate} variant="outline" size="sm" className="flex-1 gap-1 text-xs">
                    <RefreshCw className="w-3 h-3" /> Quick Recreate (No Changes)
                  </Button>
                </div>
                <ThumbnailTweakEditor
                  analysis={thumbnailAnalysis}
                  thumbnailUrl={originalThumbUrl}
                  onBuildPrompt={handleBuildAndGenerate}
                />
              </div>
            )}

            {(step === 'building' || step === 'generating') && (
              <div className="flex items-center gap-2 justify-center py-6 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                {step === 'building' ? 'Building AI prompt from tweaks...' : 'Generating thumbnail with Ideogram V3...'}
              </div>
            )}

            {step === 'done' && generatedThumbUrl && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {originalThumbUrl && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">Original</p>
                      <img src={originalThumbUrl} alt="Original" className="w-full rounded-lg border" />
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Recreated</p>
                    <img src={generatedThumbUrl} alt="Recreated" className="w-full rounded-lg border" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs"
                    onClick={() => { setStep('tweaking'); setGeneratedThumbUrl(''); }}>
                    <RefreshCw className="w-3 h-3" /> Redo with Tweaks
                  </Button>
                  <a href={generatedThumbUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <Download className="w-3 h-3" /> Download
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}