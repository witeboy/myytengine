import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Link2, Eye, Palette, Type, Zap, Sparkles, X, ChevronDown, ChevronUp
} from 'lucide-react';
import ThumbnailTweakEditor from './ThumbnailTweakEditor';

export default function YouTubeThumbnailImporter({ projectId, onConceptCreated, onStyleExtracted }) {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [editablePrompt, setEditablePrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [buildingPrompt, setBuildingPrompt] = useState(false);
  const [changesApplied, setChangesApplied] = useState([]);
  const [step, setStep] = useState('input'); // 'input' | 'review' | 'tweak' | 'prompt' | 'done'

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setAnalyzing(true);
    setAnalysis(null);
    setStep('input');
    const res = await base44.functions.invoke('analyzeYouTubeThumbnail', {
      youtube_url: url.trim(),
      project_id: projectId,
    });
    setAnalysis(res.data.analysis);
    setThumbnailUrl(res.data.thumbnail_url);
    setEditablePrompt(res.data.analysis.recreate_prompt || '');
    // Extract style DNA from the analysis for the pipeline
    const styleDna = [
      res.data.analysis.style_category,
      res.data.analysis.layout_breakdown,
      res.data.analysis.styling ? `Aesthetic: ${res.data.analysis.styling.aesthetic}, Contrast: ${res.data.analysis.styling.contrast}` : '',
      res.data.analysis.generic_template,
    ].filter(Boolean).join(' | ');
    onStyleExtracted?.(styleDna);
    setAnalyzing(false);
    setStep('review');
  };

  const handleProceedToTweak = () => {
    setStep('tweak');
  };

  const handleSkipToPrompt = () => {
    setStep('prompt');
  };

  const handleBuildTweakedPrompt = async (tweaks) => {
    setBuildingPrompt(true);
    setChangesApplied([]);
    const res = await base44.functions.invoke('buildTweakedThumbnailPrompt', {
      original_analysis: analysis,
      tweaks,
      thumbnail_url: thumbnailUrl,
    });
    const data = res.data;
    if (data.success && data.prompt) {
      setEditablePrompt(data.prompt);
      setChangesApplied(data.changes_applied || []);
    }
    setBuildingPrompt(false);
    setStep('prompt');
  };

  const handleCreateConcept = async () => {
    if (!analysis) return;
    setGenerating(true);

    // Use Ideogram V3 via KIE for best text rendering
    let imageUrl = null;
    try {
      const kieRes = await base44.functions.invoke('generateTweakedThumbnailImage', {
        prompt: editablePrompt,
        project_id: projectId,
      });
      imageUrl = kieRes.data?.image_url;
    } catch (e) {
      console.warn('KIE generation failed, falling back to Core.GenerateImage:', e.message);
    }

    // Fallback to Core.GenerateImage
    if (!imageUrl) {
      const promptPrefix = '16:9 aspect ratio, 1280x720 resolution, widescreen landscape format YouTube thumbnail. ';
      const finalPrompt = editablePrompt.toLowerCase().includes('16:9') ? editablePrompt : promptPrefix + editablePrompt;
      const result = await base44.integrations.Core.GenerateImage({ prompt: finalPrompt });
      imageUrl = result.url;
    }

    await base44.entities.ThumbnailConcepts.create({
      project_id: projectId,
      rank: 0,
      concept_description: `[YouTube Import${changesApplied.length > 0 ? ' + Tweaks' : ''}] ${analysis.detailed_description?.substring(0, 200)}`,
      facial_expression: analysis.editable_elements?.subject_description || '',
      visual_metaphor: analysis.style_category || '',
      color_scheme: `${analysis.editable_elements?.mood || ''} | Palette: ${(analysis.color_palette || []).join(', ')}`,
      text_overlay: analysis.typography?.text_shown || '',
      style_reference: (analysis.style_category || 'cinema').includes('minimal') ? 'minimal' : (analysis.style_category || '').includes('doc') ? 'documentary' : 'cinema',
      ctr_score: 8,
      image_prompt: editablePrompt,
      image_url: imageUrl,
      is_selected: false,
    });

    setGenerating(false);
    setAnalysis(null);
    setUrl('');
    setStep('input');
    setChangesApplied([]);
    onConceptCreated();
  };

  return (
    <Card className="border-dashed border-2 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-600" />
          Import from YouTube
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Paste any YouTube video URL..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="flex-1 bg-white"
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
          />
          <Button onClick={handleAnalyze} disabled={analyzing || !url.trim()} className="gap-2">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Analyze
          </Button>
        </div>

        {analyzing && (
          <div className="text-center py-6">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-500">Analyzing thumbnail with AI vision...</p>
          </div>
        )}

        {/* STEP 1: Review Analysis */}
        {analysis && step === 'review' && (
          <div className="space-y-4 bg-white rounded-xl p-4 border">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-blue-100 text-blue-800">Step 1 of 3</Badge>
              <span className="text-sm font-medium text-gray-700">Review Analysis</span>
            </div>

            {/* Thumbnail preview + summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <img src={thumbnailUrl} alt="YouTube thumbnail" className="w-full rounded-lg shadow-md" />
              </div>
              <div className="space-y-3">
                <div>
                  <Badge className="bg-amber-100 text-amber-800 mb-2">{analysis.style_category}</Badge>
                  <p className="text-sm font-medium">{analysis.emotional_hook}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">CTR Analysis</p>
                  <p className="text-xs text-gray-700">{analysis.ctr_analysis}</p>
                </div>
                {analysis.typography && (
                  <div className="flex items-center gap-2">
                    <Type className="w-3 h-3 text-gray-400" />
                    <span className="text-xs">"{analysis.typography.text_shown}" — {analysis.typography.font_style}</span>
                  </div>
                )}
                {analysis.color_palette && (
                  <div className="flex items-center gap-1">
                    <Palette className="w-3 h-3 text-gray-400 mr-1" />
                    {analysis.color_palette.map((c, i) => (
                      <div key={i} className="w-6 h-6 rounded border" style={{ backgroundColor: c }} title={c} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Full analysis */}
            <div className="text-xs text-gray-600 space-y-3 bg-gray-50 p-3 rounded-lg max-h-[400px] overflow-y-auto">
              <p><strong>Layout:</strong> {analysis.layout_breakdown}</p>
              <p><strong>Description:</strong> {analysis.detailed_description}</p>
              
              {analysis.layers && (
                <div className="space-y-2 border-t pt-2">
                  <p className="font-semibold text-gray-700">🎬 Visual Layers:</p>
                  {analysis.layers.background && (
                    <div className="bg-gray-100 p-2 rounded">
                      <p className="font-medium text-gray-700">Background</p>
                      <p>{analysis.layers.background.description || analysis.layers.background.setting}</p>
                      {analysis.layers.background.mood && <p className="text-gray-500">Mood: {analysis.layers.background.mood}</p>}
                    </div>
                  )}
                  {analysis.layers.foreground && (
                    <div className="bg-red-50 p-2 rounded">
                      <p className="font-medium text-red-700">Foreground ({analysis.layers.foreground.subject_count || 'N/A'} subjects)</p>
                      <p className="text-xs text-red-600 mb-1"><strong>Arrangement:</strong> {analysis.layers.foreground.spatial_arrangement}</p>
                      {analysis.layers.foreground.subjects?.map((s, i) => (
                        <div key={i} className="ml-2 mt-1 p-1.5 bg-white rounded border-l-2 border-red-300">
                          <p className="font-medium text-xs">Person {i + 1} — <span className="text-red-600">{s.position_in_frame}</span></p>
                          <p><strong>Type:</strong> {s.archetype}</p>
                          <p><strong>Expression:</strong> {s.expression_decoded}</p>
                          <p><strong>Clothing:</strong> {s.clothing}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {analysis.layers.text_and_graphics?.elements && (
                    <div className="bg-yellow-50 p-2 rounded">
                      <p className="font-medium text-yellow-700">Text & Graphics</p>
                      {analysis.layers.text_and_graphics.elements.map((el, i) => (
                        <p key={i}>• <strong>{el.type}:</strong> "{el.text}" — {el.description}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {analysis.styling && (
                <div className="border-t pt-2">
                  <p className="font-semibold text-gray-700">🎨 Styling:</p>
                  <p>Aesthetic: {analysis.styling.aesthetic} | Contrast: {analysis.styling.contrast}</p>
                  <p>Saturation: {analysis.styling.saturation} | Render: {analysis.styling.render_quality}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleProceedToTweak}
                className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Zap className="w-4 h-4" />
                Customize & Tweak
              </Button>
              <Button
                onClick={handleSkipToPrompt}
                variant="outline"
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Recreate As-Is
              </Button>
              <Button variant="outline" onClick={() => { setAnalysis(null); setUrl(''); setStep('input'); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Tweak Editor */}
        {analysis && step === 'tweak' && (
          <div className="space-y-4 bg-white rounded-xl p-4 border">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-purple-100 text-purple-800">Step 2 of 3</Badge>
              <span className="text-sm font-medium text-gray-700">Customize Elements</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs text-blue-600" onClick={() => setStep('review')}>
                ← Back to Analysis
              </Button>
            </div>

            {buildingPrompt ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                <p className="text-sm text-gray-500">Building tweaked prompt with AI...</p>
                <p className="text-xs text-gray-400 mt-1">Merging original analysis with your changes</p>
              </div>
            ) : (
              <ThumbnailTweakEditor
                analysis={analysis}
                thumbnailUrl={thumbnailUrl}
                onBuildPrompt={handleBuildTweakedPrompt}
              />
            )}
          </div>
        )}

        {/* STEP 3: Edit Prompt & Generate */}
        {analysis && step === 'prompt' && (
          <div className="space-y-4 bg-white rounded-xl p-4 border">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-green-100 text-green-800">Step 3 of 3</Badge>
              <span className="text-sm font-medium text-gray-700">Review Prompt & Generate</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs text-blue-600" onClick={() => setStep('tweak')}>
                ← Back to Tweaks
              </Button>
            </div>

            {changesApplied.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-700 mb-1">Changes applied:</p>
                <div className="flex flex-wrap gap-1">
                  {changesApplied.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <img src={thumbnailUrl} alt="Reference" className="w-full rounded-lg shadow-sm" />
                <p className="text-[10px] text-gray-400 text-center mt-1">Original Reference</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  ✏️ AI Prompt — review & edit before generating
                </p>
                <Textarea
                  value={editablePrompt}
                  onChange={e => setEditablePrompt(e.target.value)}
                  className="text-xs min-h-[280px] font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateConcept}
                disabled={generating}
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Generating with Ideogram V3...' : 'Generate Thumbnail'}
              </Button>
              <Button variant="outline" onClick={() => { setAnalysis(null); setUrl(''); setStep('input'); setChangesApplied([]); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}