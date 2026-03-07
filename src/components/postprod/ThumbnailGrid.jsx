// ══════════════════════════════════════════════════════════════════
// ThumbnailGrid.jsx — UPDATED VERSION
// Uses ThumbnailWithTextOverlay for client-side text rendering
// ══════════════════════════════════════════════════════════════════
// Replace your existing ThumbnailGrid.jsx with this version
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, RefreshCw, Download, Trash2, Star, Eye, Loader2,
  Sparkles, AlertCircle, Type, Palette, Layout
} from 'lucide-react';
import ThumbnailWithTextOverlay, { downloadAllThumbnails } from './ThumbnailWithTextOverlay';

// ──────────────────────────────────────────────────────────────────
// SINGLE THUMBNAIL CARD
// ──────────────────────────────────────────────────────────────────

function ThumbnailCard({ concept, projectId, onRefetch, onSelect }) {
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Parse concept metadata
  const ctrScore = concept.ctr_score || 7;
  const template = concept.concept_type || 'custom';
  const composition = concept.focal_point || 'F';

  // Parse color system
  let colorSystem = {};
  try {
    colorSystem = JSON.parse(concept.color_scheme || '{}');
  } catch (_) {}

  // Parse text style
  let textStyle = {};
  try {
    textStyle = JSON.parse(concept.text_style || '{}');
  } catch (_) {}

  // Handle regenerate image
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

  // Handle delete
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

  // Handle select as final
  const handleSelect = async () => {
    try {
      // Deselect all others
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

  // Handle text change from overlay editor
  const handleTextChange = async (newTextConfig) => {
    try {
      await base44.entities.ThumbnailConcepts.update(concept.id, {
        text_overlay: newTextConfig.primary_text,
        text_style: JSON.stringify(newTextConfig)
      });
      await onRefetch();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${
      concept.is_selected
        ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-100'
        : 'hover:shadow-md'
    }`}>
      <CardContent className="p-0">
        {/* Rank Badge */}
        <div className="absolute top-2 left-2 z-10">
          <Badge className={`
            ${concept.is_selected ? 'bg-purple-600' : 'bg-black/60'}
            text-white font-bold
          `}>
            #{concept.rank || 1}
          </Badge>
        </div>

        {/* Selected Indicator */}
        {concept.is_selected && (
          <div className="absolute top-2 right-2 z-10">
            <div className="bg-green-500 text-white p-1 rounded-full">
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
          <div className="aspect-video bg-gray-100 flex flex-col items-center justify-center p-4">
            {regenerating ? (
              <>
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-2" />
                <p className="text-sm text-gray-500">Generating image...</p>
              </>
            ) : (
              <>
                <Sparkles className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 mb-2">No image yet</p>
                <Button size="sm" onClick={handleRegenerate} className="gap-1">
                  <Sparkles className="w-3 h-3" /> Generate
                </Button>
              </>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="px-3 py-2 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          </div>
        )}

        {/* Metadata Bar */}
        <div className="p-3 border-t bg-gray-50 space-y-2">
          {/* Template + CTR */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                <Layout className="w-2.5 h-2.5 mr-1" />
                {template.replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <Palette className="w-2.5 h-2.5 mr-1" />
                {colorSystem.emotion || 'custom'}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-500" />
              <span className="text-xs font-medium">{ctrScore}/10</span>
            </div>
          </div>

          {/* Text Preview */}
          <div className="flex items-center gap-1">
            <Type className="w-3 h-3 text-gray-400" />
            <p className="text-xs text-gray-600 truncate flex-1">
              {concept.text_overlay || textStyle.primary_text || 'No text'}
            </p>
          </div>

          {/* Concept Description */}
          {concept.concept_description && (
            <p className="text-[10px] text-gray-400 line-clamp-2">
              {concept.concept_description}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1 pt-1">
            {concept.image_url && (
              <>
                <Button
                  size="sm"
                  variant={concept.is_selected ? 'default' : 'outline'}
                  className={`flex-1 h-7 text-xs ${concept.is_selected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={handleSelect}
                >
                  {concept.is_selected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Selected
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 mr-1" /> Select
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// MAIN GRID COMPONENT
// ──────────────────────────────────────────────────────────────────

export default function ThumbnailGrid({ thumbnails, projectId, onRefetch }) {
  const [downloading, setDownloading] = useState(false);

  const sortedThumbnails = [...thumbnails].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const selectedThumb = sortedThumbnails.find(t => t.is_selected);

  // Handle download all
  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      await downloadAllThumbnails(sortedThumbnails, `project-${projectId}-thumb`);
    } catch (e) {
      console.error('Download failed:', e);
    }
    setDownloading(false);
  };

  if (thumbnails.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No thumbnail concepts yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500">
            {thumbnails.length} concept{thumbnails.length !== 1 ? 's' : ''}
            {selectedThumb && (
              <span className="ml-2 text-green-600">
                • #{selectedThumb.rank} selected
              </span>
            )}
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadAll}
          disabled={downloading || !thumbnails.some(t => t.image_url)}
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download All
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      <div className="flex items-center gap-4 text-xs text-gray-400 pt-2">
        <span className="flex items-center gap-1">
          <Type className="w-3 h-3" /> Click edit to customize text
        </span>
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> Downloads include text overlay
        </span>
      </div>
    </div>
  );
}