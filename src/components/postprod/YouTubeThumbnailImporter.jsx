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

export default function YouTubeThumbnailImporter({ projectId, onConceptCreated }) {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [editablePrompt, setEditablePrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setAnalyzing(true);
    setAnalysis(null);
    const res = await base44.functions.invoke('analyzeYouTubeThumbnail', {
      youtube_url: url.trim(),
      project_id: projectId,
    });
    setAnalysis(res.data.analysis);
    setThumbnailUrl(res.data.thumbnail_url);
    setEditablePrompt(res.data.analysis.recreate_prompt || '');
    setAnalyzing(false);
  };

  const handleCreateConcept = async () => {
    if (!analysis) return;
    setGenerating(true);

    // Generate image from the prompt
    const { url: imageUrl } = await base44.integrations.Core.GenerateImage({
      prompt: editablePrompt,
    });

    // Save as a thumbnail concept
    await base44.entities.ThumbnailConcepts.create({
      project_id: projectId,
      rank: 0,
      concept_description: `[YouTube Import] ${analysis.detailed_description?.substring(0, 200)}`,
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

        {analysis && (
          <div className="space-y-4 bg-white rounded-xl p-4 border">
            {/* Thumbnail preview + analysis side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <img
                  src={thumbnailUrl}
                  alt="YouTube thumbnail"
                  className="w-full rounded-lg shadow-md"
                />
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
                    <span className="text-xs">
                      "{analysis.typography.text_shown}" — {analysis.typography.font_style}
                    </span>
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

            {/* Expandable details */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-500"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {showDetails ? 'Hide Details' : 'Show Full Analysis'}
            </Button>
            {showDetails && (
              <div className="text-xs text-gray-600 space-y-3 bg-gray-50 p-3 rounded-lg max-h-[400px] overflow-y-auto">
                <p><strong>Layout:</strong> {analysis.layout_breakdown}</p>
                <p><strong>Description:</strong> {analysis.detailed_description}</p>
                
                {/* Layer breakdown */}
                {analysis.layers && (
                  <div className="space-y-2 border-t pt-2">
                    <p className="font-semibold text-gray-700">🎬 Z-Depth Layers:</p>
                    {analysis.layers.background && (
                      <div className="bg-gray-100 p-2 rounded">
                        <p className="font-medium text-gray-700">Layer 1 — Background</p>
                        <p>{analysis.layers.background.content || JSON.stringify(analysis.layers.background)}</p>
                      </div>
                    )}
                    {analysis.layers.midground?.subjects && (
                      <div className="bg-blue-50 p-2 rounded">
                        <p className="font-medium text-blue-700">Layer 2 — Mid-ground Anchors</p>
                        {analysis.layers.midground.subjects.map((s, i) => (
                          <p key={i}>{s.description} — {s.expression} ({s.position})</p>
                        ))}
                      </div>
                    )}
                    {analysis.layers.foreground && (
                      <div className="bg-red-50 p-2 rounded">
                        <p className="font-medium text-red-700">Layer 3 — Foreground Contenders</p>
                        {analysis.layers.foreground.left_subject && (
                          <p><strong>Left:</strong> {analysis.layers.foreground.left_subject.expression} — {analysis.layers.foreground.left_subject.clothing} ({analysis.layers.foreground.left_subject.face_angle})</p>
                        )}
                        {analysis.layers.foreground.right_subject && (
                          <p><strong>Right:</strong> {analysis.layers.foreground.right_subject.expression} — {analysis.layers.foreground.right_subject.clothing} ({analysis.layers.foreground.right_subject.face_angle})</p>
                        )}
                      </div>
                    )}
                    {analysis.layers.ui_overlay && (
                      <div className="bg-yellow-50 p-2 rounded">
                        <p className="font-medium text-yellow-700">Layer 4 — UI Overlay</p>
                        {analysis.layers.ui_overlay.text_elements?.map((t, i) => (
                          <p key={i}><strong>"{t.text}"</strong> — {t.font}, {t.color}, {t.position}</p>
                        ))}
                        {analysis.layers.ui_overlay.graphic_elements?.map((g, i) => (
                          <p key={i}>• {g.type}: {g.details} ({g.position})</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Styling rules */}
                {analysis.styling_rules && (
                  <div className="border-t pt-2">
                    <p className="font-semibold text-gray-700">🎨 Styling Rules:</p>
                    <p>Rim Light: {analysis.styling_rules.rim_light}</p>
                    <p>Saturation: {analysis.styling_rules.saturation}</p>
                    <p>Contrast: {analysis.styling_rules.contrast}</p>
                    <p>Text: {analysis.styling_rules.text_style}</p>
                  </div>
                )}

                {/* Generic template */}
                {analysis.generic_template && (
                  <div className="border-t pt-2">
                    <p className="font-semibold text-gray-700">📋 Reusable Template:</p>
                    <p className="whitespace-pre-wrap bg-white p-2 rounded border text-[11px]">{analysis.generic_template}</p>
                  </div>
                )}
              </div>
            )}

            {/* Editable prompt */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                ✏️ AI Image Prompt (edit to customize)
              </p>
              <Textarea
                value={editablePrompt}
                onChange={e => setEditablePrompt(e.target.value)}
                className="text-sm min-h-[100px]"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateConcept}
                disabled={generating}
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate & Save as Concept
              </Button>
              <Button variant="outline" onClick={() => { setAnalysis(null); setUrl(''); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}