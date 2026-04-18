import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Youtube, Upload, Loader2, ArrowLeft, Zap, FileText, Image, Send, RotateCcw, X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PipelineProgress from '../components/quickpublish/PipelineProgress';
import UploadStep from '../components/quickpublish/UploadStep';
import SeoReviewStep from '../components/quickpublish/SeoReviewStep';
import ThumbnailStep from '../components/quickpublish/ThumbnailStep';
import ChannelPublishStep from '../components/quickpublish/ChannelPublishStep';

const LS_KEY = 'qp_pipeline_state_v1';

export default function QuickPublish() {
  // ── File (not persisted) ──────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');

  // ── Persisted state ───────────────────────────────────────
  const [niche, setNiche] = useState('general');
  const [projectId, setProjectId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [transcript, setTranscript] = useState('');

  const [titles, setTitles] = useState([]);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [hashtags, setHashtags] = useState([]);
  const [pinnedComment, setPinnedComment] = useState('');
  const [descriptionOptions, setDescriptionOptions] = useState([]);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [categoryId, setCategoryId] = useState('22');

  // ── Restore from localStorage on mount ─────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.projectId) setProjectId(s.projectId);
      if (s.niche) setNiche(s.niche);
      if (s.completedSteps) setCompletedSteps(s.completedSteps);
      if (s.transcript) setTranscript(s.transcript);
      if (s.titles) setTitles(s.titles);
      if (s.seoAnalysis) setSeoAnalysis(s.seoAnalysis);
      if (s.hashtags) setHashtags(s.hashtags);
      if (s.pinnedComment) setPinnedComment(s.pinnedComment);
      if (s.descriptionOptions) setDescriptionOptions(s.descriptionOptions);
      if (s.tagsBreakdown) setTagsBreakdown(s.tagsBreakdown);
      if (s.title) setTitle(s.title);
      if (s.description) setDescription(s.description);
      if (s.tags) setTags(s.tags);
      if (s.thumbnailUrl) setThumbnailUrl(s.thumbnailUrl);
      if (s.privacy) setPrivacy(s.privacy);
      if (s.categoryId) setCategoryId(s.categoryId);
    } catch (_) {}
  }, []);

  // ── Persist to localStorage on changes (throttled by React batching) ──
  useEffect(() => {
    // Don't persist if nothing meaningful
    if (!projectId && completedSteps.length === 0) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        projectId, niche, completedSteps, transcript, titles, seoAnalysis,
        hashtags, pinnedComment, descriptionOptions, tagsBreakdown,
        title, description, tags, thumbnailUrl, privacy, categoryId,
      }));
    } catch (_) {}
  }, [
    projectId, niche, completedSteps, transcript, titles, seoAnalysis,
    hashtags, pinnedComment, descriptionOptions, tagsBreakdown,
    title, description, tags, thumbnailUrl, privacy, categoryId,
  ]);

  // ── Thumbnails query ────────────────────────────────────────
  const { data: thumbnails = [], refetch: refetchThumbs } = useQuery({
    queryKey: ['qp-thumbs', projectId],
    queryFn: () => base44.entities.ThumbnailConcepts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const markComplete = useCallback((step) => {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step]);
    setCurrentStep(null);
  }, []);

  // ── Reset entire pipeline ──────────────────────────────────
  const resetPipeline = () => {
    if (!window.confirm('Reset pipeline? This clears all generated SEO, titles, and thumbnails.')) return;
    localStorage.removeItem(LS_KEY);
    setVideoFile(null); setFileUrl(''); setProjectId(null);
    setCurrentStep(null); setCompletedSteps([]);
    setError(''); setStatusMessage(''); setTranscript('');
    setTitles([]); setSeoAnalysis(null); setHashtags([]); setPinnedComment('');
    setDescriptionOptions([]); setTagsBreakdown(null);
    setTitle(''); setDescription(''); setTags('');
    setThumbnailUrl(''); setPrivacy('private'); setCategoryId('22');
  };

  // ══════════════════════════════════════════════════════════
  // INDIVIDUAL STEP RUNNERS (enable per-step retry)
  // ══════════════════════════════════════════════════════════

  const runUpload = async () => {
    if (!videoFile) throw new Error('No video file selected');
    setCurrentStep('upload');
    setStatusMessage('Uploading video...');
    const { file_url } = await base44.integrations.Core.UploadFile({ file: videoFile });
    setFileUrl(file_url);
    markComplete('upload');
    return file_url;
  };

  const createProject = async () => {
    if (projectId) return projectId;
    const proj = await base44.entities.Projects.create({
      name: `Quick Publish - ${videoFile?.name || 'Untitled'}`,
      niche: niche,
      status: 'created',
    });
    setProjectId(proj.id);
    return proj.id;
  };

  const runTranscribe = async (uploadedUrl) => {
    setCurrentStep('transcribe');
    setStatusMessage('Submitting to transcription service...');
    const submitRes = await base44.functions.invoke('quickPublishTranscribe', {
      action: 'submit', file_url: uploadedUrl,
    });
    const transcriptId = submitRes.data?.transcript_id;
    if (!transcriptId) throw new Error(submitRes.data?.error || 'No transcript ID returned');

    // Poll up to 10 min (120 * 5s)
    const startedAt = Date.now();
    for (let attempts = 0; attempts < 120; attempts++) {
      await new Promise(r => setTimeout(r, 5000));
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatusMessage(`Transcribing... (${elapsed}s elapsed)`);

      const pollRes = await base44.functions.invoke('quickPublishTranscribe', {
        action: 'poll', transcript_id: transcriptId,
      });
      if (pollRes.data?.status === 'completed') {
        const text = pollRes.data.text || '';
        setTranscript(text);
        markComplete('transcribe');
        return text;
      }
      if (pollRes.data?.status === 'error') {
        throw new Error(pollRes.data?.error || 'Transcription failed');
      }
    }
    throw new Error('Transcription timed out after 10 minutes');
  };

  const runSeo = async (transcriptText, pid, channelName = '') => {
    setCurrentStep('seo');
    setStatusMessage('Generating SEO titles, descriptions, tags & hashtags...');
    const seoRes = await base44.functions.invoke('quickPublishSeo', {
      project_id: pid, transcript: transcriptText, niche: niche,
      channel_name: channelName,
    });
    const d = seoRes.data || {};
    if (!d.titles?.length) throw new Error(d.error || 'SEO generation returned no titles');

    setTitles(d.titles);
    setSeoAnalysis(d.seo_analysis || null);
    setHashtags(d.hashtags || []);
    setPinnedComment(d.pinned_comment || '');
    setTagsBreakdown(d.tags_breakdown || null);

    const descs = d.descriptions || [];
    setDescriptionOptions(descs);
    setTitle(d.titles[0]?.title || '');
    setDescription(descs[0]?.content || '');

    const allTags = [
      ...(d.tags_breakdown?.short || []),
      ...(d.tags_breakdown?.medium || []),
      ...(d.tags_breakdown?.long || []),
    ];
    setTags(allTags.join(', '));
    markComplete('seo');
    return d;
  };

  const runThumbnails = async (pid, firstTitle) => {
    setCurrentStep('thumbnails');
    setStatusMessage('Generating thumbnail concepts...');
    const thumbRes = await base44.functions.invoke('generateThumbnails', {
      project_id: pid,
      video_title: firstTitle || videoFile?.name || 'Untitled',
    });
    await refetchThumbs();

    // Auto-generate first 2 thumbnail images (reduced from 3 for speed)
    const conceptIds = thumbRes.data?.concept_ids || [];
    const topIds = conceptIds.slice(0, 2);

    for (let idx = 0; idx < topIds.length; idx++) {
      const cid = topIds[idx];
      setStatusMessage(`Rendering thumbnail ${idx + 1}/${topIds.length}...`);
      try {
        const imgRes = await base44.functions.invoke('generateThumbnailImage', { concept_id: cid });
        const data = imgRes.data || {};
        if (data.image_url) continue; // Already done
        if (data.pending && data.task_id) {
          // Poll max 90s per thumbnail
          for (let i = 0; i < 18; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
              const pollRes = await base44.functions.invoke('pollThumbnailTask', {
                task_id: data.task_id, concept_id: cid, task_type: data.task_type || 'kie',
              });
              if (pollRes.data?.completed) break;
            } catch (_) { /* transient poll error, keep trying */ }
          }
        }
      } catch (err) {
        console.warn(`Thumbnail ${cid} failed:`, err.message);
      }
    }
    await refetchThumbs();
    markComplete('thumbnails');
  };

  // ══════════════════════════════════════════════════════════
  // FULL PIPELINE ORCHESTRATION
  // ══════════════════════════════════════════════════════════
  const runPipeline = async () => {
    if (!videoFile) { setError('Please select a video file first.'); return; }
    if (currentStep) return; // concurrency guard
    setError('');

    try {
      // STEP 1: Upload (skip if already done)
      const uploadedUrl = completedSteps.includes('upload') && fileUrl
        ? fileUrl
        : await runUpload();

      // Ensure project exists
      const pid = await createProject();

      // STEP 2: Transcribe (skip if already done)
      const transcriptText = completedSteps.includes('transcribe') && transcript
        ? transcript
        : await runTranscribe(uploadedUrl);

      // STEP 3: SEO — ALWAYS use local `d` result for downstream, never state (avoids stale closure)
      let firstTitle = title;
      if (!completedSteps.includes('seo')) {
        // Try to grab the default channel name for branded hashtag
        let channelName = '';
        try {
          const chRes = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
          const chs = chRes.data?.channels || [];
          const def = chs.find(c => c.is_default) || chs[0];
          if (def) channelName = def.channel_name;
        } catch (_) {}

        const seoData = await runSeo(transcriptText, pid, channelName);
        firstTitle = seoData.titles?.[0]?.title || firstTitle;
      } else {
        firstTitle = titles[0]?.title || firstTitle;
      }

      // STEP 4: Thumbnails (non-blocking — failures are logged but don't stop pipeline)
      if (!completedSteps.includes('thumbnails')) {
        try {
          await runThumbnails(pid, firstTitle);
        } catch (thumbErr) {
          console.warn('Thumbnails failed (non-blocking):', thumbErr.message);
          markComplete('thumbnails');
        }
      }

      setStatusMessage('');
      setCurrentStep(null);
    } catch (e) {
      setError(e.message || 'Pipeline failed');
      setCurrentStep(null);
      setStatusMessage('');
    }
  };

  // ── Retry the single failed step ───────────────────────────
  const retryFailedStep = async () => {
    setError('');
    await runPipeline();
  };

  // ── Derived state ──────────────────────────────────────────
  const titleOptions = titles.map(t => t.title).filter(Boolean);
  const pipelineStarted = completedSteps.length > 0 || !!currentStep;
  const seoDone = completedSteps.includes('seo');
  const publishDone = completedSteps.includes('publish');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Quick Publish</h1>
              <p className="text-xs text-gray-500">Upload external video → Auto SEO → Thumbnails → Publish</p>
            </div>
            {pipelineStarted && (
              <Button
                variant="ghost" size="sm"
                onClick={resetPipeline}
                className="gap-1.5 text-xs text-gray-500 hover:text-red-600"
                title="Reset pipeline"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Resume banner if state was loaded without file */}
        {!videoFile && projectId && !publishDone && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-800">
              <RotateCcw className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Resuming previous session. Select your video again to continue.</span>
              <Button size="sm" variant="outline" onClick={resetPipeline} className="h-7 text-xs">
                Start fresh
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Progress */}
        {pipelineStarted && (
          <Card>
            <CardContent className="p-4">
              <PipelineProgress currentStep={currentStep} completedSteps={completedSteps} />
              {statusMessage && (
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> {statusMessage}
                </p>
              )}
              {error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <p className="font-medium">Error: {error}</p>
                  {videoFile && !currentStep && (
                    <Button onClick={retryFailedStep} size="sm" variant="outline" className="mt-1.5 h-6 text-[10px] border-red-300 gap-1">
                      <RotateCcw className="w-3 h-3" /> Retry
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 1: Upload + Niche + Start */}
        {!seoDone && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" /> Upload & Analyze
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UploadStep videoFile={videoFile} onFileSelect={setVideoFile} onClear={() => setVideoFile(null)} />

              <div>
                <label className="text-sm font-medium mb-1.5 block">Content Niche</label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="finance">Finance / Money</SelectItem>
                    <SelectItem value="tech">Tech / AI</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="health">Health & Fitness</SelectItem>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="true_crime">True Crime</SelectItem>
                    <SelectItem value="gaming">Gaming</SelectItem>
                    <SelectItem value="music">Music</SelectItem>
                    <SelectItem value="cooking">Cooking / Food</SelectItem>
                    <SelectItem value="motivation">Motivation / Self-Help</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={runPipeline}
                disabled={!videoFile || !!currentStep}
                className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {currentStep ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><Zap className="w-4 h-4" /> Start Pipeline — Transcribe → SEO → Thumbnails</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: SEO Review */}
        {seoDone && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> SEO & Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SeoReviewStep
                titleOptions={titleOptions}
                titleObjects={titles}
                title={title}
                onTitleChange={setTitle}
                descriptionOptions={descriptionOptions}
                description={description}
                onDescriptionChange={setDescription}
                tags={tags}
                onTagsChange={setTags}
                seoAnalysis={seoAnalysis}
                hashtags={hashtags}
                pinnedComment={pinnedComment}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Thumbnails */}
        {seoDone && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Image className="w-4 h-4 text-purple-600" /> Thumbnails
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ThumbnailStep
                projectId={projectId}
                thumbnails={thumbnails}
                onRefetch={refetchThumbs}
                selectedThumbnailUrl={thumbnailUrl}
                onSelect={setThumbnailUrl}
                videoFile={videoFile}
                videoUrl={fileUrl}
                transcript={transcript}
                title={title}
                niche={niche}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 4: Channel + Publish */}
        {seoDone && (
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-red-600" /> Publish
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChannelPublishStep
                videoFile={videoFile}
                title={title}
                description={description}
                tags={tags}
                thumbnailUrl={thumbnailUrl}
                privacy={privacy}
                categoryId={categoryId}
                pinnedComment={pinnedComment}
                onPrivacyChange={setPrivacy}
                onCategoryChange={setCategoryId}
                onPublishSuccess={() => markComplete('publish')}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}