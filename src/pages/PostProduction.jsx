import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StageProgress from '@/components/StageProgress';
import ThumbnailGrid from '@/components/postprod/ThumbnailGrid';
import YouTubeThumbnailImporter from '@/components/postprod/YouTubeThumbnailImporter';
import NicheManager from '@/components/postprod/NicheManager';
import SeoTitlesPanel from '@/components/postprod/SeoTitlesPanel';
import SeoDescriptionsPanel from '@/components/postprod/SeoDescriptionsPanel';
import {
  Loader2, Sparkles, Image as ImageIcon, FileText, CheckCircle2, ArrowLeft,
  Type, BookOpen, Library
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PostProduction() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [generatingSeo, setGeneratingSeo] = useState(false);

  // Extended SEO data (from the new function)
  const [seoTitles, setSeoTitles] = useState(null);
  const [seoDescriptions, setSeoDescriptions] = useState(null);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [hashtags, setHashtags] = useState(null);
  const [pinnedComment, setPinnedComment] = useState('');
  const [selectedTitle, setSelectedTitle] = useState(null);

  // Reference style from imported thumbnail
  const [referenceStyle, setReferenceStyle] = useState('');
  // Selected niche from library
  const [selectedNiche, setSelectedNiche] = useState(null);

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

  // Generate thumbnails from script (with optional reference style + niche DNA)
  const handleGenerateFromScript = async () => {
    setGeneratingThumbs(true);
    await base44.functions.invoke('generateThumbnailsFromScript', {
      project_id: projectId,
      reference_style: referenceStyle || undefined,
      niche_dna: selectedNiche?.synthesized_dna || undefined,
      niche_name: selectedNiche?.name || undefined,
      selected_title: selectedTitle?.title || undefined,
    });
    refetchThumbs();
    setGeneratingThumbs(false);
  };

  // Generate full SEO package
  const handleGenerateSeo = async () => {
    setGeneratingSeo(true);
    const res = await base44.functions.invoke('generateSeoTitlesDescriptions', {
      project_id: projectId,
    });
    const d = res.data;
    setSeoTitles(d.titles || []);
    setSeoDescriptions(d.descriptions || []);
    setSeoAnalysis(d.seo_analysis || null);
    setTagsBreakdown(d.tags_breakdown || null);
    setHashtags(d.metadata?.hashtags?.split(' ').filter(Boolean) || []);
    setPinnedComment(d.metadata?.pinned_comment || '');
    refetchMeta();
    setGeneratingSeo(false);
  };

  const handlePublish = async () => {
    await base44.entities.Projects.update(projectId, { status: 'published', current_step: 14 });
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
              <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`))}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-3xl font-bold">Post Production</h1>
            </div>
            <p className="text-gray-600 ml-12">{project?.name} — Thumbnails, SEO titles, descriptions & tags</p>
          </div>
          {selectedThumb && metadata && (
            <Button onClick={handlePublish} className="bg-green-600 hover:bg-green-700 gap-2">
              <CheckCircle2 className="w-4 h-4" /> Mark as Published
            </Button>
          )}
        </div>

        <Tabs defaultValue="titles" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="titles" className="gap-2">
              <Type className="w-4 h-4" />
              1. SEO Titles
              {seoTitles && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />}
            </TabsTrigger>
            <TabsTrigger value="thumbnails" className="gap-2">
              <ImageIcon className="w-4 h-4" />
              2. Thumbnails
              {thumbnails.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{thumbnails.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="descriptions" className="gap-2">
              <FileText className="w-4 h-4" />
              3. Description & Tags
              {metadata && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />}
            </TabsTrigger>
          </TabsList>

          {/* ======================== THUMBNAILS TAB ======================== */}
          <TabsContent value="thumbnails" className="space-y-6">
            {/* 0. Niche Template Library */}
            <NicheManager onSelectNiche={setSelectedNiche} selectedNicheId={selectedNiche?.id} />

            {/* 1. Import from YouTube */}
            <YouTubeThumbnailImporter
              projectId={projectId}
              onConceptCreated={() => refetchThumbs()}
            />

            {/* 2. Generate from Script */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Generate from Your Script</p>
                      <p className="text-xs text-gray-500">
                        AI analyzes your script to find the most click-worthy moments
                        {selectedTitle && <span className="text-blue-600"> + overlay: "{selectedTitle.title}"</span>}
                        {referenceStyle && <span className="text-purple-600"> + using imported style</span>}
                        {selectedNiche && <span className="text-amber-600"> + niche: {selectedNiche.icon} {selectedNiche.name}</span>}
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleGenerateFromScript} disabled={generatingThumbs} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    {generatingThumbs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {thumbnails.length > 0 ? 'Regenerate' : 'Generate 3 Concepts'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Loading state */}
            {generatingThumbs && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500">Creating scroll-stopping thumbnail concepts from your script...</p>
                  <p className="text-xs text-gray-400 mt-1">Analyzing key moments, emotional hooks & visual metaphors</p>
                </CardContent>
              </Card>
            )}

            {/* Thumbnail Grid */}
            {thumbnails.length > 0 && !generatingThumbs && (
              <ThumbnailGrid thumbnails={thumbnails} projectId={projectId} onRefetch={refetchThumbs} />
            )}

            {thumbnails.length === 0 && !generatingThumbs && (
              <Card>
                <CardContent className="py-12 text-center">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">No thumbnail concepts yet</p>
                  <p className="text-xs text-gray-400">Import from YouTube or generate from your script above</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ======================== TITLES TAB ======================== */}
          <TabsContent value="titles" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">SEO Video Titles</h2>
                <p className="text-sm text-gray-500">10 scroll-stopping, algorithm-optimized titles extracted from your script</p>
              </div>
              <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                {generatingSeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {seoTitles ? 'Regenerate All SEO' : 'Generate SEO Package'}
              </Button>
            </div>

            {generatingSeo && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-500">Analyzing script for maximum SEO impact...</p>
                  <p className="text-xs text-gray-400 mt-1">Generating titles, descriptions, 30 tags, hashtags & pinned comment</p>
                </CardContent>
              </Card>
            )}

            {!seoTitles && !generatingSeo && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Type className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">Generate your full SEO package from the script</p>
                  <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Generate SEO Titles, Descriptions & Tags
                  </Button>
                </CardContent>
              </Card>
            )}

            {seoTitles && !generatingSeo && (
              <div className="space-y-4">
                <SeoTitlesPanel titles={seoTitles} seoAnalysis={seoAnalysis} onSelectTitle={setSelectedTitle} />
                {selectedTitle && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <p className="text-sm text-blue-800">
                      Selected: <strong>"{selectedTitle.title}"</strong> — this will be used as the text overlay in generated thumbnails.
                      <button className="text-blue-600 underline ml-2 text-xs" onClick={() => setSelectedTitle(null)}>Clear</button>
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ======================== DESCRIPTIONS TAB ======================== */}
          <TabsContent value="descriptions" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Description, Tags & Hashtags</h2>
                <p className="text-sm text-gray-500">Algorithm-optimized descriptions with keyword-rich content</p>
              </div>
              {!seoDescriptions && (
                <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                  {generatingSeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate SEO Package
                </Button>
              )}
            </div>

            {generatingSeo && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500">Building algorithm-loving descriptions...</p>
                </CardContent>
              </Card>
            )}

            {!seoDescriptions && !generatingSeo && (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">Generate SEO descriptions from the Titles tab first</p>
                  <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Generate Full SEO Package
                  </Button>
                </CardContent>
              </Card>
            )}

            {seoDescriptions && !generatingSeo && (
              <SeoDescriptionsPanel
                descriptions={seoDescriptions}
                tagsBreakdown={tagsBreakdown}
                hashtags={hashtags}
                pinnedComment={pinnedComment}
                metadata={metadata}
                onRefetch={refetchMeta}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}