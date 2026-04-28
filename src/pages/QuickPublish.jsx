/**
 * QuickPublish.jsx  —  Refactored: zero base44 integration dependencies
 *
 * Replaces:
 *   base44.integrations.Core.UploadFile  →  uploadToCloudinary (directApi)
 *   base44.functions.invoke('quickPublishTranscribe') →  transcribeFile (directApi / AssemblyAI direct)
 *   base44.functions.invoke('quickPublishSeo')        →  generateSeo (directApi / Claude direct)
 *   base44.functions.invoke('generateThumbnails')     →  generateThumbnailConcepts (directApi / Claude direct)
 *   base44.functions.invoke('generateThumbnailImage') →  uploadToCloudinary image gen (KIE removed — concepts only)
 *   base44.functions.invoke('youtubeAuth')            →  localStorage channelName setting
 *
 * base44.entities.* (Projects, ThumbnailConcepts) → localStorage only (no DB needed for the pipeline state)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Youtube, Upload, Loader2, ArrowLeft, Zap, FileText, Image,
  Send, RotateCcw, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PipelineProgress from '../components/quickpublish/PipelineProgress';
import UploadStep from '../components/quickpublish/UploadStep';
import SeoReviewStep from '../components/quickpublish/SeoReviewStep';
import ThumbnailStep from '../components/quickpublish/ThumbnailStep';
import ChannelPublishStep from '../components/quickpublish/ChannelPublishStep';
import ChaptersPanel from '../components/quickpublish/ChaptersPanel';
import ViralMomentsPanel from '../components/quickpublish/ViralMomentsPanel';
import SilenceTrimPanel from '../components/quickpublish/SilenceTrimPanel';

import {
  uploadToCloudinary,
  transcribeFile,
  generateSeo,
  generateThumbnailConcepts,
} from '@/lib/directApi';

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_KEY    = 'qp_pipeline_state_v2';
const LS_THUMBS = 'qp_thumbnail_concepts';

// ─────────────────────────────────────────────────────────────────────────────
export default function QuickPublish() {
  // ── File (not persisted) ───────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [fileUrl, setFileUrl]     = useState('');

  // ── Persisted pipeline state ───────────────────────────────
  const [niche, setNiche]                     = useState('general');
  const [projectId, setProjectId]             = useState(null);   // kept for ThumbnailStep compat
  const [currentStep, setCurrentStep]         = useState(null);
  const [completedSteps, setCompletedSteps]   = useState([]);
  const [error, setError]                     = useState('');
  const [statusMessage, setStatusMessage]     = useState('');
  const [transcript, setTranscript]           = useState('');
  const [transcriptChapters, setTranscriptChapters] = useState([]);
  const [transcriptWords, setTranscriptWords] = useState([]);
  const [transcriptDuration, setTranscriptDuration] = useState(0);

  const [titles, setTitles]                   = useState([]);
  const [seoAnalysis, setSeoAnalysis]         = useState(null);
  const [hashtags, setHashtags]               = useState([]);
  const [pinnedComment, setPinnedComment]     = useState('');
  const [descriptionOptions, setDescriptionOptions] = useState([]);
  const [tagsBreakdown, setTagsBreakdown]     = useState(null);
  const [title, setTitle]                     = useState('');
  const [description, setDescription]         = useState('');
  const [tags, setTags]                       = useState('');

  // Thumbnail concepts stored locally instead of base44 entity
  const [thumbnailConcepts, setThumbnailConcepts] = useState([]);

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [privacy, setPrivacy]           = useState('private');
  const [categoryId, setCategoryId]     = useState('22');

  // ── Restore from localStorage ──────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.projectId)          setProjectId(s.projectId);
      if (s.niche)              setNiche(s.niche);
      if (s.completedSteps)     setCompletedSteps(s.completedSteps);
      if (s.transcript)         setTranscript(s.transcript);
      if (s.transcriptChapters) setTranscriptChapters(s.transcriptChapters);
      if (s.transcriptWords)    setTranscriptWords(s.transcriptWords);
      if (s.transcriptDuration) setTranscriptDuration(s.transcriptDuration);
      if (s.titles)             setTitles(s.titles);
      if (s.seoAnalysis)        setSeoAnalysis(s.seoAnalysis);
      if (s.hashtags)           setHashtags(s.hashtags);
      if (s.pinnedComment)      setPinnedComment(s.pinnedComment);
      if (s.descriptionOptions) setDescriptionOptions(s.descriptionOptions);
      if (s.tagsBreakdown)      setTagsBreakdown(s.tagsBreakdown);
      if (s.title)              setTitle(s.title);
      if (s.description)        setDescription(s.description);
      if (s.tags)               setTags(s.tags);
      if (s.thumbnailUrl)       setThumbnailUrl(s.thumbnailUrl);
      if (s.privacy)            setPrivacy(s.privacy);
      if (s.categoryId)         setCategoryId(s.categoryId);
    } catch (_) {}

    try {
      const tc = localStorage.getItem(LS_THUMBS);
      if (tc) setThumbnailConcepts(JSON.parse(tc));
    } catch (_) {}
  }, []);

  // ── Persist on changes ─────────────────────────────────────
  useEffect(() => {
    if (!projectId && completedSteps.length === 0) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        projectId, niche, completedSteps, transcript, titles, seoAnalysis,
        hashtags, pinnedComment, descriptionOptions, tagsBreakdown,
        title, description, tags, thumbnailUrl, privacy, categoryId,
        transcriptChapters, transcriptWords, transcriptDuration,
      }));
    } catch (_) {}
  }, [
    projectId, niche, completedSteps, transcript, titles, seoAnalysis,
    hashtags, pinnedComment, descriptionOptions, tagsBreakdown,
    title, description, tags, thumbnailUrl, privacy, categoryId,
    transcriptChapters, transcriptWords, transcriptDuration,
  ]);

  useEffect(() => {
    try { localStorage.setItem(LS_THUMBS, JSON.stringify(thumbnailConcepts)); } catch (_) {}
  }, [thumbnailConcepts]);

  const markComplete = useCallback((step) => {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step]);
    setCurrentStep(null);
  }, []);

  // ── Reset ──────────────────────────────────────────────────
  const resetPipeline = () => {
    if (!window.confirm('Reset pipeline? This clears all generated SEO, titles, and thumbnails.')) return;
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_THUMBS);
    setVideoFile(null); setFileUrl(''); setProjectId(null);
    setCurrentStep(null); setCompletedSteps([]);
    setError(''); setStatusMessage(''); setTranscript('');
    setTranscriptChapters([]); setTranscriptWords([]); setTranscriptDuration(0);
    setTitles([]); setSeoAnalysis(null); setHashtags([]); setPinnedComment('');
    setDescriptionOptions([]); setTagsBreakdown(null);
    setTitle(''); setDescription(''); setTags('');
    setThumbnailUrl(''); setPrivacy('private'); setCategoryId('22');
    setThumbnailConcepts([]);
  };

  // ══════════════════════════════════════════════════════════
  // STEP RUNNERS
  // ══════════════════════════════════════════════════════════

  // STEP 1: Upload to Cloudinary (replaces base44.integrations.Core.UploadFile)
  const runUpload = async () => {
    if (!videoFile) throw new Error('No video file selected');
    setCurrentStep('upload');
    setStatusMessage('Uploading video to Cloudinary…');

    const cleanFile = videoFile instanceof File
      ? new File([videoFile], videoFile.name, { type: videoFile.type })
      : videoFile;

    const result = await uploadToCloudinary(cleanFile, {
      resourceType: 'video',
      onProgress: (pct) => setStatusMessage(`Uploading… ${pct}%`),
    });

    if (!result?.secure_url) throw new Error('Cloudinary upload returned no URL');

    const url = result.secure_url;
    setFileUrl(url);

    // Use Cloudinary public_id as projectId (no DB needed)
    const pid = result.public_id || ('qp_' + Date.now());
    setProjectId(pid);

    markComplete('upload');
    return { url, pid };
  };

  // STEP 2: Transcribe via AssemblyAI direct (replaces quickPublishTranscribe)
  const runTranscribe = async (uploadedUrl) => {
    setCurrentStep('transcribe');
    setStatusMessage('Submitting to AssemblyAI…');

    const result = await transcribeFile(uploadedUrl, (msg) => setStatusMessage(msg));

    setTranscript(result.text);
    setTranscriptChapters(result.chapters);
    setTranscriptWords(result.words);
    setTranscriptDuration(result.duration);
    markComplete('transcribe');
    return result.text;
  };

  // STEP 3: SEO via Claude direct (replaces quickPublishSeo)
  const runSeo = async (transcriptText) => {
    setCurrentStep('seo');
    setStatusMessage('Generating SEO titles, descriptions, tags & hashtags…');

    const channelName = '';
    const d = await generateSeo({ transcript: transcriptText, niche, channelName });

    if (!d.titles?.length) throw new Error('SEO generation returned no titles');

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
      ...(d.tags_breakdown?.short  || []),
      ...(d.tags_breakdown?.medium || []),
      ...(d.tags_breakdown?.long   || []),
    ];
    setTags(allTags.join(', '));
    markComplete('seo');
    return d;
  };

  // STEP 4: Thumbnail concepts via Claude direct (replaces generateThumbnails + polling)
  const runThumbnails = async (firstTitle, transcriptText) => {
    setCurrentStep('thumbnails');
    setStatusMessage('Generating thumbnail concepts with Claude…');

    const result = await generateThumbnailConcepts({
      videoTitle: firstTitle || videoFile?.name || 'Untitled',
      transcript: transcriptText,
      niche,
    });

    const concepts = (result.concepts || []).map((c, i) => ({
      ...c,
      id:         'concept_' + Date.now() + '_' + i,
      project_id: projectId,
      image_url:  null, // image generation is separate (KIE / user-triggered)
    }));

    setThumbnailConcepts(concepts);
    markComplete('thumbnails');
  };

  // ══════════════════════════════════════════════════════════
  // FULL PIPELINE
  // ══════════════════════════════════════════════════════════
  const runPipeline = async () => {
    if (!videoFile) { setError('Please select a video file first.'); return; }
    if (currentStep) return;
    setError('');

    try {
      // STEP 1
      let uploadedUrl = fileUrl;
      let pid         = projectId;
      if (!completedSteps.includes('upload') || !fileUrl) {
        const up = await runUpload();
        uploadedUrl = up.url;
        pid         = up.pid;
      }

      // STEP 2
      const transcriptText = completedSteps.includes('transcribe') && transcript
        ? transcript
        : await runTranscribe(uploadedUrl);

      // STEP 3
      let firstTitle = title;
      if (!completedSteps.includes('seo')) {
        const seoData = await runSeo(transcriptText);
        firstTitle = seoData.titles?.[0]?.title || firstTitle;
      } else {
        firstTitle = titles[0]?.title || firstTitle;
      }

      // STEP 4 (non-blocking)
      if (!completedSteps.includes('thumbnails')) {
        try {
          await runThumbnails(firstTitle, transcriptText);
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

  const retryFailedStep = async () => { setError(''); await runPipeline(); };

  const retryThumbnails = async () => {
    if (currentStep) return;
    setError('');
    setThumbnailConcepts([]);
    setCompletedSteps(prev => prev.filter(s => s !== 'thumbnails'));
    try {
      await runThumbnails(title || titles[0]?.title, transcript);
      setStatusMessage('');
      setCurrentStep(null);
    } catch (e) {
      setError(e.message || 'Thumbnail regeneration failed');
      setCurrentStep(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────
  const titleOptions    = titles.map(t => t.title).filter(Boolean);
  const pipelineStarted = completedSteps.length > 0 || !!currentStep;
  const seoDone         = completedSteps.includes('seo');
  const publishDone     = completedSteps.includes('publish');

  // ── ThumbnailStep expects the old shape: { id, image_url, concept_name, … }
  // thumbnailConcepts already matches that shape.

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
              <p className="text-xs text-gray-500">Upload → Transcribe → SEO → Thumbnails → Publish</p>
            </div>
            {pipelineStarted && (
              <Button
                variant="ghost" size="sm"
                onClick={resetPipeline}
                className="gap-1.5 text-xs text-gray-500 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Resume banner */}
        {!videoFile && projectId && !publishDone && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-800">
              <RotateCcw className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Resuming previous session. Select your video again to continue.</span>
              <Button size="sm" variant="outline" onClick={resetPipeline} className="h-7 text-xs">Start fresh</Button>
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
                    {[
                      ['general','General'],['finance','Finance / Money'],['tech','Tech / AI'],
                      ['education','Education'],['entertainment','Entertainment'],['health','Health & Fitness'],
                      ['travel','Travel'],['true_crime','True Crime'],['gaming','Gaming'],
                      ['music','Music'],['cooking','Cooking / Food'],['motivation','Motivation / Self-Help'],
                    ].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={runPipeline}
                disabled={!videoFile || !!currentStep}
                className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {currentStep
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><Zap className="w-4 h-4" /> Start Pipeline — Upload → Transcribe → SEO → Thumbnails</>
                }
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
            <CardContent className="space-y-4">
              <ChaptersPanel
                chapters={transcriptChapters}
                description={description}
                onAppendToDescription={(block) => setDescription(prev => (prev || '') + block)}
              />
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
              <ViralMomentsPanel
                transcript={transcript}
                words={transcriptWords}
                duration={transcriptDuration}
              />
              <SilenceTrimPanel
                words={transcriptWords}
                duration={transcriptDuration}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Thumbnails */}
        {seoDone && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="w-4 h-4 text-purple-600" /> Thumbnails
                </CardTitle>
                <Button
                  variant="outline" size="sm"
                  onClick={retryThumbnails}
                  disabled={!!currentStep}
                  className="h-7 text-xs gap-1.5"
                >
                  {currentStep === 'thumbnails'
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating…</>
                    : <><RotateCcw className="w-3 h-3" /> Retry Thumbnails</>
                  }
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* ThumbnailStep receives concepts array instead of querying base44 */}
              <ThumbnailStep
                projectId={projectId}
                thumbnails={thumbnailConcepts}
                onRefetch={() => {}} // no-op: state-driven now
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

        {/* Step 4: Publish */}
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