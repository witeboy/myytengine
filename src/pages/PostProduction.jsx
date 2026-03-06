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
  Type, BookOpen, Library, ArrowRight, ClipboardCheck, Zap, Brain, TrendingUp,
  ChevronRight, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// ══════════════════════════════════════════════════════════════════
// TEMPLATE PICKER — inline (no separate file needed)
// ══════════════════════════════════════════════════════════════════

function FitBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-700"
          style={{ width: `${score || 0}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 font-medium w-8">{score}%</span>
    </div>
  );
}

function PowerDots({ power }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= power ? 'bg-amber-400' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function TemplateCard({ template, isSelected, selectionIndex, onToggle, disabled }) {
  const minCtr = parseFloat((template.ctr_range || '').split('-')[0]) || 6;
  const tier = minCtr >= 8 ? 'high' : minCtr >= 7 ? 'mid' : 'low';
  const colors = {
    high: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
    mid:  { bg: 'bg-blue-50',    border: 'border-blue-200',    badge: 'bg-blue-100 text-blue-700'       },
    low:  { bg: 'bg-slate-50',   border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-600'     },
  }[tier];

  return (
    <div
      onClick={() => !disabled && onToggle(template)}
      className={`
        relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 select-none
        ${isSelected
          ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100'
          : disabled
            ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
            : `${colors.border} ${colors.bg} hover:border-purple-300 hover:shadow-sm`
        }
      `}
    >
      {isSelected && (
        <div className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm z-10">
          {selectionIndex}
        </div>
      )}
      <div className="absolute top-3 left-3">
        <span className="text-xs font-bold text-gray-300">#{template.rank}</span>
      </div>

      <div className="pt-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{template.icon}</span>
            <div>
              <p className="font-semibold text-sm leading-tight text-gray-900">{template.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge className={`text-[10px] px-1.5 py-0 ${colors.badge}`}>{template.ctr_range} CTR</Badge>
                <PowerDots power={template.power} />
              </div>
            </div>
          </div>
          {isSelected
            ? <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
            : <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
          }
        </div>

        <div className="bg-black/5 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-gray-500 mb-0.5 font-medium">Your video:</p>
          <p className="font-black text-sm text-gray-900 tracking-wide">{template.example_text_for_this_video}</p>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed mb-3">{template.why_it_fits}</p>

        <div className="flex items-start gap-1.5 mb-3">
          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-purple-700 italic">{template.psychology}</p>
        </div>

        <FitBar score={template.fit_score} />

        {template.face_required && (
          <div className="mt-2">
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
              👤 Face expression required
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ThumbnailTemplatePicker({ projectId, onTemplatesSelected, onSkip }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [selected, setSelected] = useState([]);

  const handleSuggest = async () => {
    setLoading(true);
    setError(null);
    setSelected([]);
    try {
      const res = await base44.functions.invoke('suggestThumbnailTemplates', { project_id: projectId });
      if (res.data?.error) throw new Error(res.data.error);
      setSuggestions(res.data);
    } catch (e) {
      setError(e.message || 'Failed to get suggestions');
    }
    setLoading(false);
  };

  const handleToggle = (template) => {
    setSelected(prev => {
      const exists = prev.find(s => s.template_id === template.template_id);
      if (exists) return prev.filter(s => s.template_id !== template.template_id);
      if (prev.length >= 3) return prev;
      return [...prev, template];
    });
  };

  const handleConfirm = () => {
    if (selected.length !== 3) return;
    onTemplatesSelected(selected.map(s => s.template_id));
  };

  const isMaxed = selected.length >= 3;

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-white">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Template Intelligence</p>
              <p className="text-xs text-gray-500">AI analyzes your script → suggests 5 best templates → you pick 3</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs text-gray-400 h-7" onClick={onSkip}>
              Skip → auto-select
            </Button>
            <Button
              onClick={handleSuggest}
              disabled={loading}
              variant={suggestions ? 'outline' : 'default'}
              size="sm"
              className="gap-2"
            >
              {loading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                : suggestions
                  ? <><Sparkles className="w-3.5 h-3.5" /> Re-analyze</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Suggest Templates</>
              }
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Loading shimmer */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="rounded-xl border-2 border-gray-100 p-4 animate-pulse space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2 bg-gray-100 rounded w-full mt-4" />
              </div>
            ))}
          </div>
        )}

        {/* Video analysis summary */}
        {suggestions?.video_analysis && !loading && (
          <div className="bg-white border border-purple-100 rounded-lg px-4 py-3 flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-gray-600">
                <span className="font-medium">Core emotion:</span> {suggestions.video_analysis.core_emotion}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-gray-600">
                <span className="font-medium">Strongest hook:</span> {suggestions.video_analysis.strongest_hook}
              </span>
            </div>
          </div>
        )}

        {/* Template cards */}
        {suggestions?.top_5 && !loading && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                Pick exactly <span className="text-purple-700 font-bold">3 templates</span>
                <span className="ml-2 text-gray-400 font-normal">({selected.length}/3 selected)</span>
              </p>
              {selected.length === 3 && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {selected.map((s, i) => (
                    <Badge key={s.template_id} className="text-[10px] bg-purple-100 text-purple-700 gap-1">
                      {i+1}. {s.icon} {s.name}
                      <button onClick={(e) => { e.stopPropagation(); handleToggle(s); }} className="ml-0.5 hover:text-purple-900">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {suggestions.top_5.map(template => {
                const idx = selected.findIndex(s => s.template_id === template.template_id);
                return (
                  <TemplateCard
                    key={template.template_id}
                    template={template}
                    isSelected={idx !== -1}
                    selectionIndex={idx !== -1 ? idx + 1 : null}
                    onToggle={handleToggle}
                    disabled={isMaxed && idx === -1}
                  />
                );
              })}
            </div>

            {/* Confirm strip */}
            {selected.length > 0 && (
              <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                <div>
                  {selected.length < 3
                    ? <p className="text-sm text-purple-700">
                        Select <span className="font-bold">{3 - selected.length} more</span> to continue
                      </p>
                    : <div>
                        <p className="text-sm font-semibold text-purple-900">3 templates locked ✓</p>
                        <p className="text-xs text-purple-600">One concept generated per template</p>
                      </div>
                  }
                </div>
                <Button
                  onClick={handleConfirm}
                  disabled={selected.length !== 3}
                  className="gap-2 bg-purple-600 hover:bg-purple-700"
                >
                  Generate 3 Concepts <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!suggestions && !loading && !error && (
          <div className="text-center py-6">
            <Zap className="w-10 h-10 text-amber-200 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Click "Suggest Templates" to analyze your script</p>
            <p className="text-xs text-gray-400 mt-1">Takes ~5 seconds — reads your script and returns the 5 highest-CTR templates</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// PIPELINE STATUS BAR
// ══════════════════════════════════════════════════════════════════
function PipelineStatus({ selectedTitles, selectedNiche, referenceStyle, selectedTemplateIds, onGoToTitles }) {
  const hasTitles = selectedTitles.length > 0;
  const hasStyle = !!selectedNiche || !!referenceStyle;
  const hasTemplates = selectedTemplateIds.length === 3;

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pipeline</span>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${hasTitles ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {hasTitles ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
            {hasTitles ? `${selectedTitles.length} title${selectedTitles.length > 1 ? 's' : ''} locked` : 'No titles selected'}
            {!hasTitles && <button className="underline ml-1" onClick={onGoToTitles}>Select →</button>}
          </div>

          <ArrowRight className="w-3 h-3 text-gray-300" />

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${hasStyle ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {hasStyle ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Library className="w-3.5 h-3.5" />}
            {selectedNiche ? `${selectedNiche.icon} ${selectedNiche.name}` : referenceStyle ? '🎨 YouTube style' : 'Choose style below'}
          </div>

          <ArrowRight className="w-3 h-3 text-gray-300" />

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${hasTemplates ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-700'}`}>
            {hasTemplates ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {hasTemplates ? '3 templates selected' : 'Pick 3 templates below'}
          </div>

          <ArrowRight className="w-3 h-3 text-gray-300" />

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${(hasTitles && hasStyle && hasTemplates) ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            Generate
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function PostProduction() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');

  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [thumbError, setThumbError] = useState(null);
  const [seoError, setSeoError] = useState(null);

  // SEO state
  const [seoTitles, setSeoTitles] = useState(null);
  const [seoDescriptions, setSeoDescriptions] = useState(null);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [hashtags, setHashtags] = useState(null);
  const [pinnedComment, setPinnedComment] = useState('');
  const [selectedTitles, setSelectedTitles] = useState([]);

  const [activeTab, setActiveTab] = useState('titles');

  // Style state
  const [referenceStyle, setReferenceStyle] = useState('');
  const [selectedNiche, setSelectedNiche] = useState(null);

  // Template selection state
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]); // ['shock_face', 'income_reveal', 'breaking_news']

  // ── Queries ──────────────────────────────────────────────────────
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const list = await base44.entities.Projects.filter({ id: projectId }); return list[0]; },
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

  // ── Handlers ─────────────────────────────────────────────────────
  const handleTitlesToThumbnails = () => {
    if (selectedTitles.length > 0) {
      navigator.clipboard.writeText(selectedTitles.map(t => t.title).join('\n'));
    }
    setActiveTab('thumbnails');
  };

  // Core generation function — accepts optional templateIds override
  const runGeneration = async (templateIds) => {
    setGeneratingThumbs(true);
    setThumbError(null);

    try {
      // Step 1: Generate concepts (LLM only, no images)
      const res = await base44.functions.invoke('generateThumbnailConcepts', {
        project_id: projectId,
        video_title: selectedTitles.length > 0 ? selectedTitles[0].title : (project?.name || 'Untitled'),
        reference_style: referenceStyle || undefined,
        niche_dna: selectedNiche?.synthesized_dna || undefined,
        niche_name: selectedNiche?.name || undefined,
        selected_title: selectedTitles.length > 0 ? selectedTitles.map(t => t.title).join(' | ') : undefined,
        selected_templates: templateIds?.length === 3 ? templateIds : undefined,
      });

      const data = res.data || res;
      if (data?.error) {
        setThumbError(data.error);
        setGeneratingThumbs(false);
        return;
      }

      await refetchThumbs();

      // Step 2: Generate images one at a time (separate calls, no timeout)
      const concepts = await base44.entities.ThumbnailConcepts.filter({ project_id: projectId });
      const sorted = concepts.sort((a, b) => (a.rank || 0) - (b.rank || 0));

      for (let i = 0; i < sorted.length; i++) {
        const concept = sorted[i];
        if (concept.image_url) continue;
        try {
          console.log(`Generating thumbnail image ${i + 1}/${sorted.length}...`);
          await base44.functions.invoke('generateThumbnailImage', { concept_id: concept.id });
        } catch (imgErr) {
          console.warn(`Thumbnail ${concept.rank} image failed:`, imgErr.message);
        }
        await refetchThumbs();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      setThumbError(err.message || 'Generation failed');
    }

    await refetchThumbs();
    setGeneratingThumbs(false);
  };

  // Called by template picker when user confirms 3 templates
  const handleTemplatesSelected = (templateIds) => {
    setSelectedTemplateIds(templateIds);
    runGeneration(templateIds);
  };

  // Called by "Auto-Generate" skip button — uses whatever templates are selected or none
  const handleAutoGenerate = () => {
    runGeneration(selectedTemplateIds.length === 3 ? selectedTemplateIds : undefined);
  };

  const handleGenerateSeo = async () => {
    setGeneratingSeo(true);
    setSeoError(null);
    try {
      const res = await base44.functions.invoke('generateSeoTitlesDescriptions', { project_id: projectId });
      const d = res.data;
      if (d.error) {
        setSeoError(d.error);
      } else {
        setSeoTitles(d.titles || []);
        setSeoDescriptions(d.descriptions || []);
        setSeoAnalysis(d.seo_analysis || null);
        setTagsBreakdown(d.tags_breakdown || null);
        setHashtags(d.metadata_extra?.hashtags?.split(' ').filter(Boolean) || d.hashtags || []);
        setPinnedComment(d.metadata_extra?.pinned_comment || d.pinned_comment || '');
        refetchMeta();
      }
    } catch (e) {
      setSeoError(e?.response?.data?.error || e.message || 'SEO generation failed');
    }
    setGeneratingSeo(false);
  };

  const handlePublish = async () => {
    await base44.entities.Projects.update(projectId, { status: 'published', current_step: 14 });
    navigate(createPageUrl('Dashboard'));
  };

  const selectedThumb = thumbnails.find(t => t.is_selected);
  const titlesReady = seoTitles && selectedTitles.length > 0;
  const styleReady = !!selectedNiche || !!referenceStyle;

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

          {/* ═══════════════ TITLES TAB ═══════════════ */}
          <TabsContent value="titles" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">SEO Video Titles</h2>
                <p className="text-sm text-gray-500">10 scroll-stopping, algorithm-optimized titles from your script</p>
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
                  <p className="text-gray-500">Analyzing script for maximum SEO impact...</p>
                  <p className="text-xs text-gray-400 mt-1">Titles, descriptions, 30 tags, hashtags & pinned comment</p>
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

            {/* Pipeline status */}
            <PipelineStatus
              selectedTitles={selectedTitles}
              selectedNiche={selectedNiche}
              referenceStyle={referenceStyle}
              selectedTemplateIds={selectedTemplateIds}
              onGoToTitles={() => setActiveTab('titles')}
            />

            {/* Step A: Style source */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <NicheManager onSelectNiche={setSelectedNiche} selectedNicheId={selectedNiche?.id} />
              <YouTubeThumbnailImporter
                projectId={projectId}
                onConceptCreated={() => refetchThumbs()}
                onStyleExtracted={(style) => setReferenceStyle(style)}
              />
            </div>

            {/* Step B: Template Intelligence Picker */}
            <ThumbnailTemplatePicker
              projectId={projectId}
              onTemplatesSelected={handleTemplatesSelected}
              onSkip={handleAutoGenerate}
            />

            {/* Already selected templates strip — shown after selection */}
            {selectedTemplateIds.length === 3 && !generatingThumbs && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-800 font-medium">Templates locked:</span>
                    {selectedTemplateIds.map((id, i) => (
                      <Badge key={id} className="bg-green-100 text-green-700 text-xs">{i+1}. {id.replace(/_/g,' ')}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-400 h-7"
                      onClick={() => setSelectedTemplateIds([])}
                    >
                      Change templates
                    </Button>
                    <Button
                      onClick={handleAutoGenerate}
                      disabled={generatingThumbs}
                      size="sm"
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      {generatingThumbs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Regenerate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error state */}
            {thumbError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-4 text-center">
                  <p className="text-red-600 font-medium text-sm">{thumbError}</p>
                  <p className="text-xs text-red-400 mt-1">Make sure you have a selected topic and a final script.</p>
                </CardContent>
              </Card>
            )}

            {/* Loading state */}
            {generatingThumbs && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Creating 3 scroll-stopping thumbnail designs...</p>
                  {selectedTemplateIds.length === 3 && (
                    <div className="flex justify-center gap-2 mt-3 flex-wrap">
                      {selectedTemplateIds.map((id, i) => (
                        <Badge key={id} className="bg-purple-100 text-purple-700 text-xs">
                          Concept {i+1}: {id.replace(/_/g,' ')}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 max-w-md mx-auto space-y-2 text-left">
                    <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 rounded px-3 py-1.5">
                      <Sparkles className="w-3 h-3 animate-pulse" /> Phase 0: Extracting script essence & emotional hooks
                    </div>
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded px-3 py-1.5">
                      <Type className="w-3 h-3" /> Phase 1: Generating high-CTR overlay text (max 5 words, power words)
                    </div>
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
                      <ImageIcon className="w-3 h-3" /> Phase 2: Composing visuals with template DNA
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-3 py-1.5">
                      <Sparkles className="w-3 h-3" /> Phase 3: Engineering image prompts & generating 3 images
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-4">This takes 1–2 minutes</p>
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
                  <p className="text-xs text-gray-400">Select titles, pick a style, choose templates above, then generate</p>
                </CardContent>
              </Card>
            )}
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
        </Tabs>
      </div>
    </div>
  );
}
