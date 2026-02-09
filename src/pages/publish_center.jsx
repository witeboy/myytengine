import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Copy, Check } from 'lucide-react';

export default function publish_center() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [copiedId, setCopiedId] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: thumbnails = [] } = useQuery({
    queryKey: ['thumbnails', projectId],
    queryFn: async () => {
      const list = await base44.entities.ThumbnailConcepts.list();
      return list.filter(t => t.project_id === projectId).sort((a, b) => a.rank - b.rank);
    },
    enabled: !!projectId,
  });

  const { data: metadata } = useQuery({
    queryKey: ['metadata', projectId],
    queryFn: async () => {
      const list = await base44.entities.UploadMetadata.list();
      return list.find(m => m.project_id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: calendar = [] } = useQuery({
    queryKey: ['calendar', projectId],
    queryFn: async () => {
      const list = await base44.entities.CalendarEntries.list();
      return list.filter(c => c.project_id === projectId).sort((a, b) => a.week_number - b.week_number);
    },
    enabled: !!projectId,
  });

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await base44.entities.Projects.update(projectId, { status: 'published' });
      navigate(createPageUrl('dashboard'));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const tags = metadata?.tags ? JSON.parse(metadata.tags) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={14} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Publish Center</h1>

        {metadata && (
          <>
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Video Titles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">Primary Title (SEO)</p>
                      <p className="text-sm text-gray-700">{metadata.title_primary}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(metadata.title_primary, 'title1')}
                      className="p-2 hover:bg-gray-100 rounded"
                    >
                      {copiedId === 'title1' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Variation 1</p>
                  <p className="text-sm text-gray-700">{metadata.title_variation_1}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Variation 2</p>
                  <p className="text-sm text-gray-700">{metadata.title_variation_2}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Primary Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{metadata.description_template}</p>
                  <button
                    onClick={() => copyToClipboard(metadata.description_template, 'desc1')}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {copiedId === 'desc1' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Tags & Hashtags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-3">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, idx) => (
                      <Badge key={idx} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                  <button
                    onClick={() => copyToClipboard(tags.join(', '), 'tags')}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {copiedId === 'tags' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy All
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Hashtags</p>
                  <p className="text-sm text-gray-700">{metadata.hashtags}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {thumbnails.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Thumbnail Concepts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {thumbnails.slice(0, 3).map((thumb) => (
                <div key={thumb.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <p className="font-medium">#{thumb.rank}</p>
                    <Badge>CTR: {thumb.ctr_score}/10</Badge>
                  </div>
                  <p className="text-sm">{thumb.concept_description}</p>
                  <p className="text-xs text-gray-600">Text: "{thumb.text_overlay}"</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {calendar.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>12-Week Content Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {calendar.slice(0, 12).map((entry, idx) => (
                <div key={entry.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="font-medium">Week {entry.week_number} • {entry.day_of_week}</p>
                  <p className="text-gray-700">{entry.topic_title}</p>
                  <p className="text-xs text-gray-600">Format: {entry.format}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={handlePublish}
          disabled={isPublishing}
          className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg mb-4"
        >
          {isPublishing ? 'Publishing...' : '✓ Mark as Published'}
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(createPageUrl('dashboard'))}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}