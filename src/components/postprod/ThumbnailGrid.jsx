import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Sparkles, CheckCircle2, Image as ImageIcon, Star, Eye, X, Wand2,
  BarChart3, ArrowUpDown, TrendingUp, RefreshCw, Code2, ChevronDown, ChevronUp, Download
} from 'lucide-react';
import RefineConceptDialog from './RefineConceptDialog';
import ThumbnailCtrBreakdown from './ThumbnailCtrBreakdown';

export default function ThumbnailGrid({ thumbnails, projectId, onRefetch }) {
  const [generatingImage, setGeneratingImage] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [previewThumb, setPreviewThumb] = useState(null);
  const [refineThumb, setRefineThumb] = useState(null);
  const [sortBy, setSortBy] = useState('rank'); // 'rank' or 'ctr'
  const [analyzingCtr, setAnalyzingCtr] = useState(false);
  const [ctrResults, setCtrResults] = useState(null);

  const [generateError, setGenerateError] = useState(null);
  const [rephrasingId, setRephrasingId] = useState(null);
  const [expandedPrompt, setExpandedPrompt] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState('');

  const buildFinalPrompt = (rawPrompt, textOverlay) => {
    // Force 16:9 widescreen and text overlay into prompt
    let prompt = rawPrompt || '';
    const aspectPrefix = 'CRITICAL: This image MUST be rendered in WIDE 16:9 LANDSCAPE aspect ratio (width is 1.78x the height, like a movie screen or YouTube thumbnail at 1280x720). The image must be significantly WIDER than it is tall — NOT square, NOT portrait. ';
    const textSuffix = textOverlay 
      ? ` MANDATORY TEXT OVERLAY: The image MUST include large, bold, white Impact-style text reading "${textOverlay}" with a thick black outline and heavy drop shadow, positioned prominently at the bottom center of the image. This text must be the most visible graphic element, readable even at small sizes.`
      : '';
    if (!prompt.toLowerCase().includes('16:9') && !prompt.toLowerCase().includes('landscape')) {
      prompt = aspectPrefix + prompt;
    }
    if (textOverlay && !prompt.includes(textOverlay)) {
      prompt += textSuffix;
    }
    return prompt;
  };

  const handleGenerateImage = async (thumb) => {
    setGeneratingImage(thumb.id);
    setGenerateError(null);
    try {
      const finalPrompt = buildFinalPrompt(thumb.image_prompt, thumb.text_overlay);
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: finalPrompt,
      });
      await base44.entities.ThumbnailConcepts.update(thumb.id, { image_url: url });
      onRefetch();
    } catch (err) {
      const msg = err?.message || 'Unknown error';
      if (msg.includes('refused')) {
        setGenerateError({ thumbId: thumb.id, message: `Thumbnail #${thumb.rank}: Image refused — prompt may reference real people or copyrighted content.` });
      } else {
        setGenerateError({ thumbId: thumb.id, message: `Thumbnail #${thumb.rank}: ${msg}` });
      }
    }
    setGeneratingImage(null);
  };

  const handleRephrasePrompt = async (thumb) => {
    setRephrasingId(thumb.id);
    setGenerateError(null);
    const res = await base44.functions.invoke('rephraseThumbnailPrompt', { thumbnail_id: thumb.id });
    if (res.data.success) {
      onRefetch();
    }
    setRephrasingId(null);
  };

  const handleSavePromptAndGenerate = async (thumb) => {
    setGeneratingImage(thumb.id);
    setGenerateError(null);
    await base44.entities.ThumbnailConcepts.update(thumb.id, { image_prompt: editingPrompt.trim() });
    try {
      const editFinalPrompt = buildFinalPrompt(editingPrompt.trim(), thumb.text_overlay);
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: editFinalPrompt,
      });
      await base44.entities.ThumbnailConcepts.update(thumb.id, { image_url: url });
      onRefetch();
      setExpandedPrompt(null);
    } catch (err) {
      const msg = err?.message || 'Unknown error';
      if (msg.includes('refused')) {
        setGenerateError({ thumbId: thumb.id, message: `Still refused — try rephrasing further or editing manually.` });
      } else {
        setGenerateError({ thumbId: thumb.id, message: msg });
      }
    }
    setGeneratingImage(null);
  };

  const handleSelect = async (thumb) => {
    setSelecting(thumb.id);
    for (const t of thumbnails) {
      if (t.is_selected && t.id !== thumb.id) {
        await base44.entities.ThumbnailConcepts.update(t.id, { is_selected: false });
      }
    }
    await base44.entities.ThumbnailConcepts.update(thumb.id, { is_selected: !thumb.is_selected });
    onRefetch();
    setSelecting(null);
  };

  const handleAnalyzeCtr = async () => {
    setAnalyzingCtr(true);
    setCtrResults(null);
    const res = await base44.functions.invoke('analyzeThumbnailCtr', { project_id: projectId });
    setCtrResults(res.data.results || []);
    onRefetch();
    setAnalyzingCtr(false);
  };

  const sorted = [...thumbnails].sort((a, b) => {
    if (sortBy === 'ctr') return (b.ctr_score || 0) - (a.ctr_score || 0);
    return a.rank - b.rank;
  });

  const getCtrResult = (thumbId) => ctrResults?.find(r => r.thumbnail_id === thumbId);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={sortBy === 'rank' ? 'default' : 'outline'}
            onClick={() => setSortBy('rank')}
            className="gap-1"
          >
            <ArrowUpDown className="w-3 h-3" /> By Rank
          </Button>
          <Button
            size="sm"
            variant={sortBy === 'ctr' ? 'default' : 'outline'}
            onClick={() => setSortBy('ctr')}
            className="gap-1"
          >
            <TrendingUp className="w-3 h-3" /> By CTR Score
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyzeCtr}
          disabled={analyzingCtr || thumbnails.filter(t => t.image_url).length === 0}
          className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
        >
          {analyzingCtr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
          {analyzingCtr ? 'Analyzing...' : 'Analyze CTR (AI Vision)'}
        </Button>
      </div>

      {generateError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{generateError.message}</p>
              <p className="text-xs text-red-500 mt-1">Use "Rewrite Prompt" on the thumbnail to auto-fix, or edit the prompt manually.</p>
            </div>
            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setGenerateError(null)}>
              <X className="w-3 h-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      {analyzingCtr && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">AI is analyzing each thumbnail for visual appeal, text clarity, emotional impact...</p>
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(thumb => {
          const ctr = getCtrResult(thumb.id);
          return (
            <Card
              key={thumb.id}
              className={`overflow-hidden transition-all ${thumb.is_selected ? 'ring-2 ring-green-500 shadow-lg' : 'hover:shadow-md'}`}
            >
              {/* Image area - forced 16:9 */}
              <div className="aspect-video bg-gray-100 relative overflow-hidden">
                {thumb.image_url ? (
                  <img src={thumb.image_url} alt={thumb.concept_description} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-xs">No image yet</span>
                  </div>
                )}
                {thumb.is_selected && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                <Badge className="absolute top-2 left-2 bg-black/70 text-white text-xs">
                  #{thumb.rank}
                </Badge>
              </div>

              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium line-clamp-2">{thumb.concept_description}</p>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs">{thumb.style_reference}</Badge>
                  {thumb.text_overlay && (
                    <Badge variant="secondary" className="text-xs">"{thumb.text_overlay}"</Badge>
                  )}
                  <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                    <Star className="w-3 h-3" /> CTR {thumb.ctr_score}/10
                  </Badge>
                </div>

                {/* CTR Breakdown (if analyzed) */}
                {ctr && <ThumbnailCtrBreakdown ctr={ctr} />}

                {thumb.visual_metaphor && !ctr && (
                  <p className="text-xs text-gray-500">Metaphor: {thumb.visual_metaphor}</p>
                )}

                {/* Expandable prompt viewer/editor */}
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    onClick={() => {
                      if (expandedPrompt === thumb.id) {
                        setExpandedPrompt(null);
                      } else {
                        setExpandedPrompt(thumb.id);
                        setEditingPrompt(thumb.image_prompt || '');
                      }
                    }}
                  >
                    <Code2 className="w-3 h-3" />
                    {expandedPrompt === thumb.id ? 'Hide Prompt' : 'View/Edit Prompt'}
                    {expandedPrompt === thumb.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expandedPrompt === thumb.id && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editingPrompt}
                        onChange={e => setEditingPrompt(e.target.value)}
                        className="text-[11px] min-h-[200px] font-mono bg-slate-50"
                      />
                      <Button
                        size="sm"
                        className="w-full gap-1"
                        onClick={() => handleSavePromptAndGenerate(thumb)}
                        disabled={generatingImage === thumb.id || !editingPrompt.trim()}
                      >
                        {generatingImage === thumb.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Save & Generate from Edited Prompt
                      </Button>
                    </div>
                  )}
                </div>

                {/* Rewrite button (policy fix) — shown when there's no image or generation was refused */}
                {(!thumb.image_url || generateError?.thumbId === thumb.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 gap-1"
                    onClick={() => handleRephrasePrompt(thumb)}
                    disabled={rephrasingId === thumb.id}
                  >
                    {rephrasingId === thumb.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {rephrasingId === thumb.id ? 'Rewriting...' : 'Rewrite Prompt (Policy Fix)'}
                  </Button>
                )}

                <div className="flex flex-wrap gap-2">
                  {thumb.image_url && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setPreviewThumb(thumb)}
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = thumb.image_url;
                          a.download = `thumbnail-${thumb.rank}.png`;
                          a.target = '_blank';
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                        }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={thumb.image_url ? 'outline' : 'default'}
                    className="flex-1 gap-1"
                    onClick={() => handleGenerateImage(thumb)}
                    disabled={generatingImage === thumb.id}
                  >
                    {generatingImage === thumb.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {thumb.image_url ? 'Regenerate' : 'Generate Image'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-purple-700 border-purple-200 hover:bg-purple-50"
                    onClick={() => setRefineThumb(thumb)}
                  >
                    <Wand2 className="w-3 h-3" />
                    Enhance
                  </Button>
                  <Button
                    size="sm"
                    variant={thumb.is_selected ? 'default' : 'outline'}
                    className={`flex-1 gap-1 ${thumb.is_selected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    onClick={() => handleSelect(thumb)}
                    disabled={selecting === thumb.id || !thumb.image_url}
                  >
                    {selecting === thumb.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {thumb.is_selected ? 'Selected' : 'Select'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Fullscreen 16:9 Preview Dialog */}
      <Dialog open={!!previewThumb} onOpenChange={() => setPreviewThumb(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden bg-black border-none [&>button]:hidden">
          {previewThumb && (
            <div className="relative">
              {/* Close button */}
              <button
                onClick={() => setPreviewThumb(null)}
                className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              {/* 16:9 container */}
              <div className="aspect-video w-full relative overflow-hidden">
                <img
                  src={previewThumb.image_url}
                  alt={previewThumb.concept_description}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="bg-black px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-white/20 text-white text-xs">#{previewThumb.rank}</Badge>
                  <Badge className="bg-amber-500/80 text-white text-xs gap-1">
                    <Star className="w-3 h-3" /> CTR {previewThumb.ctr_score}/10
                  </Badge>
                  {previewThumb.text_overlay && (
                    <Badge className="bg-white/20 text-white text-xs">"{previewThumb.text_overlay}"</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-white/60 hover:text-white gap-1"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = previewThumb.image_url;
                      a.download = `thumbnail-${previewThumb.rank}.png`;
                      a.target = '_blank';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }}
                  >
                    <Download className="w-3 h-3" /> Download
                  </Button>
                  <span className="text-white/40 text-xs">16:9 • 1280×720</span>
                </div>
                <p className="text-white text-sm line-clamp-2">{previewThumb.concept_description}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refine Concept Dialog */}
      <RefineConceptDialog
        thumb={refineThumb}
        open={!!refineThumb}
        onOpenChange={(open) => { if (!open) setRefineThumb(null); }}
        onRefined={() => { onRefetch(); setRefineThumb(null); }}
      />
    </div>
  );
}