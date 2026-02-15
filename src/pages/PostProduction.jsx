import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StageProgress from '@/components/StageProgress';
import ThumbnailGrid from '@/components/postprod/ThumbnailGrid';
import UploadMetadataPanel from '@/components/postprod/UploadMetadataPanel';
import {
  Loader2, Sparkles, Image as ImageIcon, FileText, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PostProduction() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [generatingMeta, setGeneratingMeta] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: script } = useQuery({
    queryKey: ['script-postprod', projectId],
    queryFn: async () => {
      if (!project?.script_id) return null;
      const list = await base44.entities.Scripts.filter({ id: project.script_id });
      return list[0] || null;
    },
    enabled: !!project?.script_id,
  });

  const { data: thumbnails = [], refetch: refetchThumbs } = useQuery({
    queryKey: ['thumbnails', projectId],
    queryFn: () => base44.entities.ThumbnailConcepts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: metadataList = [], refetch: refetchMeta } = useQuery({
    queryKey: ['upload-metadata', projectId],
    queryFn: () => base44.entities.UploadMetadata.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const metadata = metadataList[0] || null;

  const handleGenerateThumbnails = async () => {
    setGeneratingThumbs(true);
    await base44.functions.invoke('generateThumbnails', {
      project_id: projectId,
      video_title: script?.title || project?.name || 'Untitled Video',
    });
    refetchThumbs();
    setGeneratingThumbs(false);
  };

  const handleGenerateMetadata = async () => {
    setGeneratingMeta(true);
    await base44.functions.invoke('generateUploadMetadata', {
      project_id: projectId,
    });
    refetchMeta();
    setGeneratingMeta(false);
  };

  const handlePublish = async () => {
    await base44.entities.Projects.update(projectId, {
      status: 'published',
      current_step: 14,
    });
    navigate(createPageUrl('Dashboard'));
  };

  const selectedThumb = thumbnails.find(t => t.is_selected);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={4} />
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`))}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-3xl font-bold">Post Production</h1>
            </div>
            <p className="text-gray-600 ml-12">
              {project?.name} — Thumbnail, title, description & tags
            </p>
          </div>
          <div className="flex gap-2">
            {selectedThumb && metadata && (
              <Button onClick={handlePublish} className="bg-green-600 hover:bg-green-700 gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Mark as Published
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="thumbnails" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="thumbnails" className="gap-2">
              <ImageIcon className="w-4 h-4" />
              Thumbnails
              {thumbnails.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">{thumbnails.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="metadata" className="gap-2">
              <FileText className="w-4 h-4" />
              Title & Description
              {metadata && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />}
            </TabsTrigger>
          </TabsList>

          {/* THUMBNAILS TAB */}
          <TabsContent value="thumbnails" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Thumbnail Concepts</h2>
                <p className="text-sm text-gray-500">
                  AI-generated thumbnail ideas ranked by CTR potential
                </p>
              </div>
              <Button
                onClick={handleGenerateThumbnails}
                disabled={generatingThumbs}
                className="gap-2"
              >
                {generatingThumbs ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {thumbnails.length > 0 ? 'Regenerate Concepts' : 'Generate Concepts'}
              </Button>
            </div>

            {thumbnails.length === 0 && !generatingThumbs ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No thumbnail concepts yet</p>
                  <Button onClick={handleGenerateThumbnails} disabled={generatingThumbs} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Generate 10 Thumbnail Concepts
                  </Button>
                </CardContent>
              </Card>
            ) : generatingThumbs ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-500">Generating thumbnail concepts...</p>
                </CardContent>
              </Card>
            ) : (
              <ThumbnailGrid thumbnails={thumbnails} projectId={projectId} onRefetch={refetchThumbs} />
            )}
          </TabsContent>

          {/* METADATA TAB */}
          <TabsContent value="metadata" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Upload Metadata</h2>
                <p className="text-sm text-gray-500">
                  SEO-optimized titles, descriptions, tags & hashtags
                </p>
              </div>
              <Button
                onClick={handleGenerateMetadata}
                disabled={generatingMeta}
                className="gap-2"
              >
                {generatingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {metadata ? 'Regenerate Metadata' : 'Generate Metadata'}
              </Button>
            </div>

            {!metadata && !generatingMeta ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No upload metadata yet</p>
                  <Button onClick={handleGenerateMetadata} disabled={generatingMeta} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Generate Title, Description & Tags
                  </Button>
                </CardContent>
              </Card>
            ) : generatingMeta ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500">Generating upload metadata...</p>
                </CardContent>
              </Card>
            ) : (
              <UploadMetadataPanel metadata={metadata} onRefetch={refetchMeta} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}