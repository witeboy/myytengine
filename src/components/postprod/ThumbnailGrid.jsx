// ══════════════════════════════════════════════════════════════════
// ThumbnailGrid.jsx — V3 FIXED
// ✅ Save now works properly with async/await
// ══════════════════════════════════════════════════════════════════
// Place in: src/components/postprod/ThumbnailGrid.jsx
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, RefreshCw, Download, Trash2, Star, Eye, Loader2,
  Sparkles, AlertCircle, Type, Palette, Layout, Package
} from 'lucide-react';
import ThumbnailWithTextOverlay, { downloadAllThumbnails } from './ThumbnailWithTextOverlay';

// ══════════════════════════════════════════════════════════════════
// SINGLE THUMBNAIL CARD
// ══════════════════════════════════════════════════════════════════

function ThumbnailCard({ concept, projectId, onRefetch, onSelect }) {
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const ctrScore = concept.ctr_score || 7;
  const template = concept.concept_type || 'custom';

  let colorSystem = {};
  try {
    colorSystem = JSON.parse(concept.color_scheme || '{}');
  } catch (_) {}

  let textStyle = {};
  try {
    textStyle = JSON.parse(concept.text_style || '{}');
  } catch (_) {}

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await base44.functions.invoke('generateThumbnailImage', { concept_id: concept.id });
      await onRefetch();
    } catch (e) {
      setError(e.message);
    }
    setRegenerating(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this thumbnail concept?')) return;
    setDeleting(true);
    try {
      await base44.entities.ThumbnailConcepts.delete(concept.id);
      await onRefetch();
    } catch (e) {
      setError(e.message);
    }
    setDeleting(false);
  };

  const handleSelect = async () => {
    try {
      const all = await base44.entities.ThumbnailConcepts.filter({ project_id: projectId });
      await Promise.all(all.map(t =>
        base44.entities.ThumbnailConcepts.update(t.id, { is_selected: t.id === concept.id })
      ));
      await onRefetch();
      if (onSelect) onSelect(concept);
    } catch (e) {
      setError(e.message);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // TEXT CHANGE HANDLER — FIXED: Returns a Promise
  // ════════════════════════════════════════════════════════════════
  const handleTextChange = async (newTextConfig) => {
    console.log('ThumbnailCard: Saving text config for concept', concept.id, newTextConfig);
    
    try {
      // Update the database
      await base44.entities.ThumbnailConcepts.update(concept.id, {
        text_overlay: newTextConfig.primary_text || '',
        text_style: JSON.stringify(newTextConfig)
      });
      
      console.log('ThumbnailCard: Save successful');
      
      // Refetch to update UI
      if (onRefetch) {
        await onRefetch();
      }
      
      // Return success (important for the child component to know save worked)
      return { success: true };
    } catch (e) {
      console.error('ThumbnailCard: Save failed', e);
      setError(e.message || 'Failed to save');
      throw e; // Re-throw so child component knows it failed
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${
      concept.is_selected
        ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-100'
        : 'hover:shadow-md'
    }`}>
      <CardContent className="p-0 relative">
        {/* Rank Badge */}
        <div className="absolute top-2 left-2 z-20">
          <Badge className={`
            ${concept.is_selected ? 'bg-purple-600' : 'bg-black/70'}
            text-white font-bold text-xs
          `}>
            #{concept.rank || 1}
          </Badge>
        </div>

        {/* Selected Indicator */}
        {concept.is_selected && (
          <div className="absolute top-2 right-12 z-20">
            <div className="bg-green-500 text-white p-1.5 rounded-full shadow-md">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Thumbnail with Text Overlay */}
        {concept.image_url ? (
          <ThumbnailWithTextOverlay
            imageUrl={concept.image_url}
            concept={concept}
            onTextChange={handleTextChange}
            editable={true}
          />
        ) : (
          <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center p-6">
            {regenerating ? (
              <>
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-3" />
                <p className="text-sm text-gray-600 font-medium">Generating image...</p>
                <p className="text-xs text-gray-400 mt-1">This may take 30-60 seconds</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <p className="text-sm text-gray-600 font-medium mb-1">No image yet</p>
                <Button size="sm" onClick={handleRegenerate} className="gap-2 bg-purple-600 hover:bg-purple-700 mt-2">
                  <Sparkles className="w-4 h-4" /> Generate
                </Button>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> 
              <span className="truncate">{error}</span>
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="p-3 border-t bg-gray-50/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] bg-white">
                <Layout className="w-2.5 h-2.5 mr-1" />
                {template.replace(/_/g, ' ')}
              </Badge>
              {colorSystem.emotion && (
                <Badge variant="outline" className="text-[10px] bg-white">
                  <Palette className="w-2.5 h-2.5 mr-1" />
                  {colorSystem.emotion}
                </Badge>
              )}
              {textStyle.sizeMultiplier && textStyle.sizeMultiplier !== 1.0 && (
                <Badge variant="outline" className="text-[10px] bg-white">
                  {Math.round(textStyle.sizeMultiplier * 100)}%
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-semibold text-yellow-700">{ctrScore}/10</span>
            </div>
          </div>

          <div className="flex items-start gap-1.5">
            <Type className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 line-clamp-1 flex-1 font-medium">
              {concept.text_overlay || textStyle.layerTexts?.headline || textStyle.primary_text ||
                <span className="text-gray-400 italic font-normal">No overlay text</span>
              }
            </p>
          </div>

          {concept.concept_description && (
            <p className="text-[10px] text-gray-400 line-clamp-2">
              {concept.concept_description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-1">
            {concept.image_url && (
              <>
                <Button
                  size="sm"
                  variant={concept.is_selected ? 'default' : 'outline'}
                  className={`flex-1 h-8 text-xs ${
                    concept.is_selected 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300'
                  }`}
                  onClick={handleSelect}
                >
                  {concept.is_selected ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Selected</>
                  ) : (
                    <><Eye className="w-3.5 h-3.5 mr-1" /> Select</>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  title="Regenerate"
                >
                  {regenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN GRID COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function ThumbnailGrid({ thumbnails, projectId, onRefetch }) {
  const [downloading, setDownloading] = useState(false);

  const sortedThumbnails = [...thumbnails].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const selectedThumb = sortedThumbnails.find(t => t.is_selected);
  const withImages = sortedThumbnails.filter(t => t.image_url);

  const handleDownloadAll = async () => {
    if (withImages.length === 0) return;
    
    setDownloading(true);
    try {
      await downloadAllThumbnails(withImages, `project-${projectId}-thumb`);
    } catch (e) {
      console.error('Download failed:', e);
    }
    setDownloading(false);
  };

  if (thumbnails.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium mb-1">No thumbnail concepts yet</p>
          <p className="text-sm text-gray-400">Generate concepts using the panel above</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{thumbnails.length}</span> concept{thumbnails.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {withImages.length > 0 && withImages.length < thumbnails.length && (
            <Badge variant="outline" className="text-xs">
              {withImages.length} with images
            </Badge>
          )}
          
          {selectedThumb && (
            <Badge className="bg-green-100 text-green-700 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              #{selectedThumb.rank} selected
            </Badge>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadAll}
          disabled={downloading || withImages.length === 0}
          className="gap-2 h-8"
        >
          {downloading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Downloading...</>
          ) : (
            <><Download className="w-4 h-4" /> Download All ({withImages.length})</>
          )}
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedThumbnails.map(concept => (
          <ThumbnailCard
            key={concept.id}
            concept={concept}
            projectId={projectId}
            onRefetch={onRefetch}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-gray-400 pt-3 border-t">
        <span className="flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5" />
          Click edit to customize text & size
        </span>
        <span className="flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Downloads include text overlay
        </span>
      </div>
    </div>
  );
}