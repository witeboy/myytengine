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
  Type, BookOpen, Library, ArrowRight, ClipboardCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PostProduction() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [thumbError, setThumbError] = useState(null);

  // Extended SEO data (from the new function)
  const [seoTitles, setSeoTitles] = useState(null);
  const [seoDescriptions, setSeoDescriptions] = useState(null);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [hashtags, setHashtags] = useState(null);
  const [pinnedComment, setPinnedComment] = useState('');
  const [selectedTitles, setSelectedTitles] = useState([]);

  const [activeTab, setActiveTab] = useState('titles');

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

  // Handle "Next" from Titles → Thumbnails: copy titles to clipboard and switch tab
  const handleTitlesToThumbnails = () => {
    if (selectedTitles.length > 0) {
      const text = selectedTitles.map(t => t.title).join('\n');
      navigator.clipboard.writeText(text);
    }
    setActiveTab('thumbnails');
  };

  // Generate thumbnails from script (with selected titles + niche DNA baked in)
  const handleGenerateFromScript = async () => {
    setGeneratingThumbs(true);
    setThumbError(null);
    const res = await base44.functions.invoke('generateThumbnailsFromScript', {
      project_id: projectId,
      reference_style: referenceStyle || undefined,
      niche_dna: selectedNiche?.synthesized_dna || undefined,
      niche_name: selectedNiche?.name || undefined,
      selected_title: selectedTitles.length > 0 ? selectedTitles.map(t => t.title).join(' | ') : undefined,
    });
    if (res.data?.error) {
      setThumbError(res.data.error);
    }
    refetchThumbs();
    setGeneratingThumbs(false);
  };

  // Generate full SEO package
  const handleGenerateSeo = async () => {
    setGeneratingSeo(true);
    try {
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
    } catch (e) {
      console.error('SEO generation failed:', e);
    }
    setGeneratingSeo(false);
  };

  const handlePublish = async () => {
    await base44.entities.Projects.update(projectId, { status: 'published', current_step: 14 });
    navigate(createPageUrl('Dashboard'));
  };

  const selectedThumb = thumbnails.find(t => t.is_selected);

  // Readiness indicators
  const titlesReady = seoTitles && selectedTitles.length > 0;
  const styleReady = !!selectedNiche || !!referenceStyle;

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

        <Tabs defaultValue="titles" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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

          {/* ======================== TITLES TAB ======================== */}
          <TabsContent value="titles" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">SEO Video Titles</h2>
                <p className="text-sm text-gray-500">10 scroll-stopping, algorithm-optimized titles extracted from your script</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleGenerateSeo} disabled={generatingSeo} variant={seoTitles ? 'outline' : 'default'} className="gap-2">
                  {generatingSeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {seoTitles ? 'Regenerate All SEO' : 'Generate SEO Package'}
                </Button>
                {titlesReady && (
                  <Button onClick={handleTitlesToThumbnails} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    Next: Thumbnails <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
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
                <SeoTitlesPanel titles={seoTitles} seoAnalysis={seoAnalysis} selectedTitles={selectedTitles} onToggleTitle={(t) => {
                  setSelectedTitles(prev => {
                    const exists = prev.find(s => s.rank === t.rank);
                    if (exists) return prev.filter(s => s.rank !== t.rank);
                    return [...prev, t];
                  });
                }} />
                {selectedTitles.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                    <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-blue-800">
                      <p className="font-medium mb-1">{selectedTitles.length} title{selectedTitles.length > 1 ? 's' : ''} selected — will be copied to clipboard & used as thumbnail text overlays:</p>
                      <ul className="space-y-0.5">
                        {selectedTitles.map(t => (
                          <li key={t.rank} className="flex items-center gap-1">
                            <span>• "{t.title}"</span>
                            <button className="text-blue-500 hover:text-blue-700 text-xs underline ml-1" onClick={() => setSelectedTitles(prev => prev.filter(s => s.rank !== t.rank))}>remove</button>
                          </li>
                        ))}
                      </ul>
                      <button className="text-blue-600 underline text-xs mt-1" onClick={() => setSelectedTitles([])}>Clear all</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ======================== THUMBNAILS TAB ======================== */}
          <TabsContent value="thumbnails" className="space-y-6">
            {/* Pipeline status bar */}
            <PipelineStatus
              selectedTitles={selectedTitles}
              selectedNiche={selectedNiche}
              referenceStyle={referenceStyle}
              onGoToTitles={() => setActiveTab('titles')}
            />

            {/* Step A: Choose style source — niche or YouTube import */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <NicheManager onSelectNiche={setSelectedNiche} selectedNicheId={selectedNiche?.id} />
              <YouTubeThumbnailImporter
                projectId={projectId}
                onConceptCreated={() => refetchThumbs()}
                onStyleExtracted={(style) => setReferenceStyle(style)}
              />
            </div>

            {/* Step B: Generate from Script */}
            <Card className={`transition-all ${(titlesReady || styleReady) ? 'border-purple-300 bg-purple-50/30' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Generate from Your Script</p>
                      <p className="text-xs text-gray-500">
                        AI weaves your script, selected titles & style DNA into scroll-stopping thumbnail concepts
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {selectedTitles.length > 0 && (
                          <Badge className="bg-blue-100 text-blue-700 text-[10px] gap-0.5">
                            <Type className="w-2.5 h-2.5" /> {selectedTitles.length} title{selectedTitles.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {selectedNiche && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                            {selectedNiche.icon} {selectedNiche.name} DNA
                          </Badge>
                        )}
                        {referenceStyle && (
                          <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                            🎨 YouTube style ref
                          </Badge>
                        )}
                        {!selectedTitles.length && !selectedNiche && !referenceStyle && (
                          <Badge variant="outline" className="text-[10px] text-gray-400">
                            Select titles & style above for best results
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleGenerateFromScript} disabled={generatingThumbs} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    {generatingThumbs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {thumbnails.length > 0 ? 'Regenerate' : 'Generate 3 Concepts'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Error state */}
            {thumbError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-4 text-center">
                  <p className="text-red-600 font-medium text-sm">{thumbError}</p>
                  <p className="text-xs text-red-400 mt-1">Make sure you have a selected topic and a final script before generating thumbnails.</p>
                </CardContent>
              </Card>
            )}

            {/* Loading state */}
            {generatingThumbs && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Creating 3 scroll-stopping thumbnail designs...</p>
                  <div className="mt-4 max-w-md mx-auto space-y-2 text-left">
                    <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 rounded px-3 py-1.5">
                      <Sparkles className="w-3 h-3 animate-pulse" /> Phase 0: Extracting script essence & emotional hooks
                    </div>
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded px-3 py-1.5">
                      <Type className="w-3 h-3" /> Phase 1: Generating high-CTR overlay text (max 5 words, power words)
                    </div>
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
                      <ImageIcon className="w-3 h-3" /> Phase 2: Composing visuals (rule of thirds, subject separation)
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-3 py-1.5">
                      <Sparkles className="w-3 h-3" /> Phase 3: Engineering image prompts & generating 3 images
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-4">This takes 1-2 minutes — weaving titles + style DNA + color contrast rules</p>
                </CardContent>
              </Card>
            )}

            {/* Thumbnail Grid */}
            {thumbnails.length > 0 && !generatingThumbs && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Generated Concepts</h3>
                  {selectedThumb && (
                    <Button onClick={() => setActiveTab('descriptions')} className="gap-2">
                      Next: Description & Tags <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <ThumbnailGrid thumbnails={thumbnails} projectId={projectId} onRefetch={refetchThumbs} />
              </>
            )}

            {thumbnails.length === 0 && !generatingThumbs && (
              <Card>
                <CardContent className="py-12 text-center">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">No thumbnail concepts yet</p>
                  <p className="text-xs text-gray-400">Select titles, pick a style, then click "Generate from Your Script" above</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ======================== DESCRIPTIONS TAB ======================== */}
          <TabsContent value="descriptions" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Description, Tags & Hashtags</h2>
                <p className="text-sm text-gray-500">Algorithm-optimized descriptions with keyword-rich content</p>
              </div>
              <div className="flex items-center gap-2">
                {!seoDescriptions && (
                  <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                    {generatingSeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate SEO Package
                  </Button>
                )}
                {selectedThumb && metadata && (
                  <Button onClick={handlePublish} className="bg-green-600 hover:bg-green-700 gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Publish
                  </Button>
                )}
              </div>
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

// Pipeline readiness status bar for the Thumbnails tab
function PipelineStatus({ selectedTitles, selectedNiche, referenceStyle, onGoToTitles }) {
  const hasTitles = selectedTitles.length > 0;
  const hasStyle = !!selectedNiche || !!referenceStyle;

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pipeline</span>

          {/* Title status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${hasTitles ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {hasTitles ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
            {hasTitles ? `${selectedTitles.length} title${selectedTitles.length > 1 ? 's' : ''} locked` : 'No titles selected'}
            {!hasTitles && (
              <button className="underline ml-1" onClick={onGoToTitles}>Select →</button>
            )}
          </div>

          <ArrowRight className="w-3 h-3 text-gray-300" />

          {/* Style status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${hasStyle ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {hasStyle ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Library className="w-3.5 h-3.5" />}
            {selectedNiche ? `${selectedNiche.icon} ${selectedNiche.name}` : referenceStyle ? '🎨 YouTube style' : 'Choose style below'}
          </div>

          <ArrowRight className="w-3 h-3 text-gray-300" />

          {/* Generate status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${(hasTitles && hasStyle) ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            Generate
          </div>
        </div>
      </CardContent>
    </Card>
  );
}