import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StageProgress from '@/components/StageProgress';
import SeoTitlesPanel from '@/components/postprod/SeoTitlesPanel';
import SeoDescriptionsPanel from '@/components/postprod/SeoDescriptionsPanel';
import MakeThumbnail from '@/components/production/MakeThumbnail';
import {
  Loader2, Sparkles, Image as ImageIcon, FileText, CheckCircle2, ArrowLeft,
  Type, ArrowRight, ClipboardCheck, Youtube
} from 'lucide-react';
import YouTubePublishPanel from '@/components/youtube/YouTubePublishPanel';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';









// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function PostProduction() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');

  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [seoError, setSeoError] = useState(null);

  // Script summary for thumbnail maker
  const [scriptSummary, setScriptSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  // SEO state
  const [seoTitles, setSeoTitles] = useState(null);
  const [seoDescriptions, setSeoDescriptions] = useState(null);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [hashtags, setHashtags] = useState(null);
  const [pinnedComment, setPinnedComment] = useState('');
  const [selectedTitles, setSelectedTitles] = useState([]);

  const [activeTab, setActiveTab] = useState('titles');



  // ── Queries ──────────────────────────────────────────────────────
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const list = await base44.entities.Projects.filter({ id: projectId }); return list[0]; },
    enabled: !!projectId,
  });

  const { data: script } = useQuery({
    queryKey: ['script-postprod', projectId, project?.script_id],
    queryFn: async () => {
      // Try by script_id first
      if (project?.script_id) {
        const list = await base44.entities.Scripts.filter({ id: project.script_id });
        if (list[0]) return list[0];
      }
      // Fallback: find final_aggregated script by project_id
      const allScripts = await base44.entities.Scripts.filter({ project_id: projectId });
      const final = allScripts.find(s => s.version === 'final_aggregated') || allScripts[0];
      return final || null;
    },
    enabled: !!projectId && !!project,
  });

  // Scene images from Content Generation
  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes-postprod', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.filter(s => s.image_url && s.image_url.startsWith('http')).sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  const { data: metadataList = [], refetch: refetchMeta } = useQuery({
    queryKey: ['upload-metadata', projectId],
    queryFn: () => base44.entities.UploadMetadata.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const metadata = metadataList[0] || null;

  // ── Hydrate SEO state from saved metadata on load ────────────────
  useEffect(() => {
    if (!metadata) return;
    // Only hydrate if state is empty (not currently generating)
    if (seoTitles || generatingSeo) return;

    // Hydrate titles
    if (metadata.titles_json) {
      try {
        const titles = JSON.parse(metadata.titles_json);
        if (titles?.length) setSeoTitles(titles);
      } catch (_) {}
    }

    // Hydrate SEO analysis
    if (metadata.seo_analysis) {
      try { setSeoAnalysis(JSON.parse(metadata.seo_analysis)); } catch (_) {}
    }

    // Hydrate tags breakdown
    if (metadata.tags_short || metadata.tags_medium || metadata.tags_long) {
      try {
        setTagsBreakdown({
          short: JSON.parse(metadata.tags_short || '[]'),
          medium: JSON.parse(metadata.tags_medium || '[]'),
          long: JSON.parse(metadata.tags_long || '[]'),
        });
      } catch (_) {}
    }

    // Hydrate hashtags
    if (metadata.hashtags) {
      const h = metadata.hashtags.trim().split(/\s+/).filter(Boolean);
      if (h.length) setHashtags(h);
    }

    // Hydrate pinned comment
    if (metadata.pinned_comment) setPinnedComment(metadata.pinned_comment);

    // Hydrate descriptions
    if (metadata.descriptions_json) {
      try {
        const descs = JSON.parse(metadata.descriptions_json);
        if (descs?.length) setSeoDescriptions(descs);
      } catch (_) {}
    } else if (metadata.description_template) {
      // Fallback: reconstruct from individual fields
      const descs = [];
      if (metadata.description_template) descs.push({ label: 'Hook-Heavy', content: metadata.description_template, word_count: 0, primary_keywords: [], long_tail_keywords: [] });
      if (metadata.description_alt_1) descs.push({ label: 'SEO-Optimized', content: metadata.description_alt_1, word_count: 0, primary_keywords: [], long_tail_keywords: [] });
      if (metadata.description_alt_2) descs.push({ label: 'Storytelling', content: metadata.description_alt_2, word_count: 0, primary_keywords: [], long_tail_keywords: [] });
      if (descs.length) setSeoDescriptions(descs);
    }
  }, [metadata]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleTitlesToThumbnails = async () => {
    if (selectedTitles.length > 0) {
      navigator.clipboard.writeText(selectedTitles.map(t => t.title).join('\n'));
    }
    setActiveTab('thumbnails');
    // Auto-summarize script when switching to thumbnails tab
    if (!scriptSummary && script?.full_script) {
      await summarizeScript(script.full_script);
    }
  };

  const summarizeScript = async (fullScript) => {
    if (!fullScript || summarizing) return;
    setSummarizing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Summarize the following video script in under 400 words. Focus on: the main story arc, key characters/people involved, emotional beats and turning points, visual themes and settings. This summary will be used to generate a YouTube thumbnail, so emphasize the most visually dramatic and emotionally compelling moments.\n\nSCRIPT:\n${fullScript.substring(0, 12000)}`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "The script summary under 400 words" }
          },
          required: ["summary"]
        }
      });
      if (result?.summary) setScriptSummary(result.summary);
    } catch (e) {
      console.error('Script summarization failed:', e);
    }
    setSummarizing(false);
  };

  const handleGenerateSeo = async () => {
  setGeneratingSeo(true);
  setSeoError(null);
  
  try {
    // ════════════════════════════════════════════════════════════════
    // PHASE 1: Generate titles, tags, hashtags (fast)
    // ════════════════════════════════════════════════════════════════
    const res1 = await base44.functions.invoke('generateSeoTitlesDescriptions', { 
      project_id: projectId 
    });
    
    const data1 = res1.data;
    
    if (data1.error) {
      setSeoError(data1.error);
      setGeneratingSeo(false);
      return;
    }
    
    // Update UI with Phase 1 results immediately
    setSeoTitles(data1.titles || []);
    setSeoAnalysis(data1.seo_analysis || null);
    setTagsBreakdown(data1.tags_breakdown || null);
    setHashtags(data1.hashtags || []);
    setPinnedComment(data1.pinned_comment || '');
    
    // ════════════════════════════════════════════════════════════════
    // PHASE 2: Generate descriptions (slower, but UI already updated)
    // ════════════════════════════════════════════════════════════════
    if (data1.needs_descriptions) {
      const res2 = await base44.functions.invoke('generateSeoDescriptions', { 
        project_id: projectId 
      });
      
      const data2 = res2.data;
      
      if (!data2.error && data2.descriptions) {
        setSeoDescriptions(data2.descriptions);
      }
    }
    
    // Refetch metadata to ensure UI is in sync
    refetchMeta();
    
  } catch (e) {
    console.error('SEO generation error:', e);
    setSeoError(e?.response?.data?.error || e.message || 'SEO generation failed');
  }
  
  setGeneratingSeo(false);
};

  const [markingDone, setMarkingDone] = useState(false);

  const handlePublish = async () => {
    setMarkingDone(true);
    try {
      // Mark project as published
      await base44.entities.Projects.update(projectId, { status: 'published', current_step: 14 });

      // Also mark the channel topic as completed if linked
      if (project?.channel_topic_id) {
        try {
          await base44.entities.ChannelTopics.update(project.channel_topic_id, { status: 'completed' });
        } catch (_) {}
      }

      navigate(createPageUrl('Dashboard'));
    } catch (e) {
      console.error('Error marking done:', e);
      setMarkingDone(false);
    }
  };

  const titlesReady = seoTitles && selectedTitles.length > 0;

  // ── Render ────────────────────────────────────────────────────────
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
          {metadata && (
            <Button onClick={handlePublish} disabled={markingDone} className="bg-green-600 hover:bg-green-700 gap-2">
              {markingDone ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {markingDone ? 'Finishing...' : 'Done — Finalize All Assets'}
            </Button>
          )}
        </div>

        <Tabs defaultValue="titles" value={activeTab} onValueChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'thumbnails' && !scriptSummary && !summarizing && script?.full_script) {
            summarizeScript(script.full_script);
          }
        }} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="titles" className="gap-2">
              <Type className="w-4 h-4" />
              1. SEO Titles
              {seoTitles && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />}
            </TabsTrigger>
            <TabsTrigger value="thumbnails" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            2. Thumbnails
            </TabsTrigger>
            <TabsTrigger value="descriptions" className="gap-2">
              <FileText className="w-4 h-4" />
              3. Description & Tags
              {metadata && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />}
            </TabsTrigger>
            <TabsTrigger value="publish" className="gap-2">
              <Youtube className="w-4 h-4" />
              4. Publish
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ TITLES TAB ═══════════════ */}
          <TabsContent value="titles" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">SEO Video Titles</h2>
                <p className="text-sm text-gray-500">10 AI-powered, clickbait-style titles with keyword optimization & thumbnail pairing</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleGenerateSeo}
                  disabled={generatingSeo}
                  variant={seoTitles ? 'outline' : 'default'}
                  className="gap-2"
                >
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

            {seoError && !generatingSeo && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-4 text-center">
                  <p className="text-red-600 font-medium text-sm">{seoError}</p>
                  <p className="text-xs text-red-400 mt-1">Make sure you have a selected topic and a final script.</p>
                </CardContent>
              </Card>
            )}

            {generatingSeo && (
  <Card>
    <CardContent className="py-12 text-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
      <p className="text-gray-500">
        {seoTitles ? 'Phase 2: Generating descriptions...' : 'Phase 1: Generating titles & tags...'}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {seoTitles ? '2 of 2 — Almost done' : '1 of 2 — Titles, tags, hashtags'}
      </p>
    </CardContent>
  </Card>
)}

            {!seoTitles && !generatingSeo && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Type className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">Generate your full SEO package from the script</p>
                  <Button onClick={handleGenerateSeo} disabled={generatingSeo} className="gap-2">
                    <Sparkles className="w-4 h-4" /> Generate SEO Titles, Descriptions & Tags
                  </Button>
                </CardContent>
              </Card>
            )}

            {seoTitles && !generatingSeo && (
              <div className="space-y-4">
                <SeoTitlesPanel
                  titles={seoTitles}
                  seoAnalysis={seoAnalysis}
                  selectedTitles={selectedTitles}
                  onToggleTitle={(t) => {
                    setSelectedTitles(prev => {
                      const exists = prev.find(s => s.rank === t.rank);
                      return exists ? prev.filter(s => s.rank !== t.rank) : [...prev, t];
                    });
                  }}
                />
                {selectedTitles.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                    <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-blue-800">
                      <p className="font-medium mb-1">
                        {selectedTitles.length} title{selectedTitles.length > 1 ? 's' : ''} selected — will be used as thumbnail text overlays:
                      </p>
                      <ul className="space-y-0.5">
                        {selectedTitles.map(t => (
                          <li key={t.rank} className="flex items-center gap-1">
                            <span>• "{t.title}"</span>
                            <button
                              className="text-blue-500 hover:text-blue-700 text-xs underline ml-1"
                              onClick={() => setSelectedTitles(prev => prev.filter(s => s.rank !== t.rank))}
                            >remove</button>
                          </li>
                        ))}
                      </ul>
                      <button className="text-blue-600 underline text-xs mt-1" onClick={() => setSelectedTitles([])}>
                        Clear all
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ═══════════════ THUMBNAILS TAB ═══════════════ */}
          <TabsContent value="thumbnails" className="space-y-5">
            {summarizing && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Summarizing your script for thumbnail AI...</p>
                </CardContent>
              </Card>
            )}
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
              <MakeThumbnail
                onBack={() => setActiveTab('titles')}
                initialTitle={selectedTitles.length > 0 ? selectedTitles[0].title : (project?.name || '')}
                initialSummary={scriptSummary}
                sceneImages={scenes}
                projectId={projectId}
                selectedSeoTitles={selectedTitles}
              />
            </div>
          </TabsContent>

          {/* ═══════════════ DESCRIPTIONS TAB ═══════════════ */}
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
                {metadata && (
                  <Button onClick={handlePublish} disabled={markingDone} className="bg-green-600 hover:bg-green-700 gap-2">
                    {markingDone ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {markingDone ? 'Finishing...' : 'Done — Finalize'}
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
                    <Sparkles className="w-4 h-4" /> Generate Full SEO Package
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
        {/* ═══════════════ PUBLISH TAB ═══════════════ */}
          <TabsContent value="publish" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Publish to YouTube</h2>
              <p className="text-sm text-gray-500">Select channel, pick your exported video, and publish with auto-populated SEO metadata</p>
            </div>
            <YouTubePublishPanel project={project} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}