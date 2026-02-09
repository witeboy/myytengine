import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Copy, CheckCircle2, Loader2 } from 'lucide-react';

export default function PublishCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: thumbnails = [] } = useQuery({
    queryKey: ['thumbnails', projectId],
    queryFn: () => base44.entities.ThumbnailConcepts.list(),
  });

  const { data: metadata = [] } = useQuery({
    queryKey: ['metadata', projectId],
    queryFn: () => base44.entities.UploadMetadata.list(),
  });

  const { data: calendar = [] } = useQuery({
    queryKey: ['calendar', projectId],
    queryFn: () => base44.entities.CalendarEntries.list(),
  });

  const projectThumbnails = thumbnails.filter(t => t.project_id === projectId).sort((a, b) => a.rank - b.rank);
  const projectMetadata = metadata.find(m => m.project_id === projectId);
  const calendarEntries = calendar.filter(c => c.project_id === projectId).sort((a, b) => a.week_number - b.week_number);

  const handleMarkPublished = async () => {
    setIsLoading(true);
    try {
      await base44.entities.Projects.update(projectId, { status: 'published' });
      alert('Project marked as published!');
      navigate(createPageUrl('dashboard'));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const parseTags = (tagsStr) => {
    try {
      return typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
    } catch {
      return [];
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={13} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Publish Center</h1>

        <div className="space-y-6">
          {/* Thumbnails */}
          <Card>
            <CardHeader>
              <CardTitle>Thumbnail Concepts ({projectThumbnails.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projectThumbnails.slice(0, 6).map((thumb) => (
                  <div key={thumb.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold">#{thumb.rank}</span>
                      <Badge variant="outline">{thumb.style_reference}</Badge>
                    </div>
                    <p className="text-sm text-gray-700">{thumb.concept_description.substring(0, 100)}...</p>
                    <div className="flex gap-2 flex-wrap text-xs">
                      {thumb.text_overlay && <Badge className="bg-blue-100 text-blue-800">{thumb.text_overlay}</Badge>}
                      <span className="text-gray-600">CTR: {thumb.ctr_score}/10</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(thumb.image_prompt)}
                      className="w-full"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy Prompt
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upload Metadata */}
          {projectMetadata && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Titles</h4>
                  <div className="space-y-2 text-sm">
                    {[
                      projectMetadata.title_primary,
                      projectMetadata.title_variation_1,
                      projectMetadata.title_variation_2,
                    ].map((title, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-2 bg-gray-50 p-2 rounded">
                        <span className="line-clamp-2">{title}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(title)}
                          className="flex-shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Description</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm max-h-32 overflow-y-auto relative">
                    <p className="line-clamp-6">{projectMetadata.description_template}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(projectMetadata.description_template)}
                      className="absolute top-2 right-2"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {parseTags(projectMetadata.tags).map((tag, idx) => (
                      <Badge key={idx} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Hashtags</h4>
                  <div className="bg-gray-50 p-2 rounded text-sm flex justify-between items-start gap-2">
                    <span>{projectMetadata.hashtags}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(projectMetadata.hashtags)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 12-Week Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>12-Week Content Calendar ({calendarEntries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {calendarEntries.map((entry) => (
                  <div key={entry.id} className="border rounded p-3 text-sm space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold">Week {entry.week_number} - {entry.day_of_week}</span>
                      <Badge variant="outline">{entry.format}</Badge>
                    </div>
                    <p className="text-gray-700">{entry.topic_title}</p>
                    <p className="text-xs text-gray-600">{entry.content_theme}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleMarkPublished}
            disabled={isLoading}
            className="w-full bg-green-600 hover:bg-green-700 py-6 text-base"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            Mark Project as Published
          </Button>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => navigate(createPageUrl(`production_studio?project_id=${projectId}`))}>
              Back
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('dashboard'))}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}