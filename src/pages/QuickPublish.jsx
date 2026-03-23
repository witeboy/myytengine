import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Youtube, Upload, Loader2, ArrowLeft, Zap, ChevronRight, FileText, Image, Send
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PipelineProgress from '../components/quickpublish/PipelineProgress';
import UploadStep from '../components/quickpublish/UploadStep';
import SeoReviewStep from '../components/quickpublish/SeoReviewStep';
import ThumbnailStep from '../components/quickpublish/ThumbnailStep';
import ChannelPublishStep from '../components/quickpublish/ChannelPublishStep';

export default function QuickPublish() {
  // ── State ───────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [niche, setNiche] = useState('general');
  const [projectId, setProjectId] = useState(null);

  // Pipeline state
  const [currentStep, setCurrentStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Transcript
  const [transcript, setTranscript] = useState('');

  // SEO data
  const [titles, setTitles] = useState([]);
  const [seoAnalysis, setSeoAnalysis] = useState(null);
  const [hashtags, setHashtags] = useState([]);
  const [pinnedComment, setPinnedComment] = useState('');
  const [descriptionOptions, setDescriptionOptions] = useState([]);
  const [tagsBreakdown, setTagsBreakdown] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  // Thumbnail
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  // Publish
  const [privacy, setPrivacy] = useState('private');
  const [categoryId, setCategoryId] = useState('22');

  // ── Thumbnails query ────────────────────────────────────────
  const { data: thumbnails = [], refetch: refetchThumbs } = useQuery({
    queryKey: ['qp-thumbs', projectId],
    queryFn: () => base44.entities.ThumbnailConcepts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const markComplete = (step) => {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step]);
    setCurrentStep(null);
  };

  // ── PIPELINE: Run all steps ─────────────────────────────────
  const runPipeline = async () => {
    if (!videoFile) return;
    setError('');

    // STEP 1: Upload video
    setCurrentStep('upload');
    setStatusMessage('Uploading video...');
    let uploadedUrl;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: videoFile });
      uploadedUrl = file_url;
      setFileUrl(file_url);
    } catch (e) {
      setError('Upload failed: ' + e.message); setCurrentStep(null); return;
    }
    markComplete('upload');

    // Create a quick-publish project for metadata storage
    let pid;
    try {
      const proj = await base44.entities.Projects.create({
        name: `Quick Publish - ${videoFile.name}`,
        niche: niche,
        status: 'created',
      });
      pid = proj.id;
      setProjectId(pid);
    } catch (e) {
      setError('Failed to create project: ' + e.message); setCurrentStep(null); return;
    }

    // STEP 2: Transcribe
    setCurrentStep('transcribe');
    setStatusMessage('Transcribing video with ASR...');
    let transcriptText;
    try {
      const submitRes = await base44.functions.invoke('quickPublishTranscribe', {
        action: 'submit', file_url: uploadedUrl,
      });
      const transcriptId = submitRes.data.transcript_id;

      // Poll for completion
      let attempts = 0;
      while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await base44.functions.invoke('quickPublishTranscribe', {
          action: 'poll', transcript_id: transcriptId,
        });
        if (pollRes.data.status === 'completed') {
          transcriptText = pollRes.data.text;
          setTranscript(transcriptText);
          break;
        }
        if (pollRes.data.status === 'error') {
          throw new Error(pollRes.data.error || 'Transcription failed');
        }
        setStatusMessage(`Transcribing... (${Math.min(attempts * 5, 600)}s)`);
        attempts++;
      }
      if (!transcriptText) throw new Error('Transcription timed out');
    } catch (e) {
      setError('Transcription failed: ' + e.message); setCurrentStep(null); return;
    }
    markComplete('transcribe');

    // STEP 3: SEO generation
    setCurrentStep('seo');
    setStatusMessage('Generating SEO titles, descriptions & tags...');
    try {
      const seoRes = await base44.functions.invoke('quickPublishSeo', {
        project_id: pid, transcript: transcriptText, niche: niche,
      });
      const d = seoRes.data;
      setTitles(d.titles || []);
      setSeoAnalysis(d.seo_analysis || null);
      setHashtags(d.hashtags || []);
      setPinnedComment(d.pinned_comment || '');
      setTagsBreakdown(d.tags_breakdown || null);

      // Set defaults
      setTitle(d.titles?.[0]?.title || '');
      const descs = d.descriptions || [];
      setDescriptionOptions(descs);
      setDescription(descs[0]?.content || '');
      const allTags = [
        ...(d.tags_breakdown?.short || []),
        ...(d.tags_breakdown?.medium || []),
        ...(d.tags_breakdown?.long || []),
      ];
      setTags(allTags.join(', '));
    } catch (e) {
      setError('SEO generation failed: ' + e.message); setCurrentStep(null); return;
    }
    markComplete('seo');

    // STEP 4: Thumbnail generation
    setCurrentStep('thumbnails');
    setStatusMessage('Generating thumbnail concepts...');
    try {
      const thumbRes = await base44.functions.invoke('generateThumbnails', {
        project_id: pid,
        video_title: titles?.[0]?.title || videoFile.name,
      });
      await refetchThumbs();

      // Auto-generate first 3 images
      setStatusMessage('Generating thumbnail images (top 3)...');
      const conceptIds = thumbRes.data?.concept_ids || [];
      const topIds = conceptIds.slice(0, 3);
      for (const cid of topIds) {
        try {
          const imgRes = await base44.functions.invoke('generateThumbnailImage', { concept_id: cid });
          if (imgRes.data?.pending && imgRes.data?.task_id) {
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 5000));
              const pollRes = await base44.functions.invoke('pollThumbnailTask', {
                task_id: imgRes.data.task_id, concept_id: cid, task_type: imgRes.data.task_type || 'kie',
              });
              if (pollRes.data?.completed) break;
            }
          }
        } catch (_) {}
      }
      await refetchThumbs();
    } catch (e) {
      console.warn('Thumbnail generation failed:', e.message);
      // Non-blocking — user can still publish without thumbnails
    }
    markComplete('thumbnails');
    setStatusMessage('');
  };

  const titleOptions = titles.map(t => t.title).filter(Boolean);
  const pipelineStarted = completedSteps.length > 0 || currentStep;
  const pipelineDone = completedSteps.includes('seo');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Quick Publish</h1>
              <p className="text-xs text-gray-500">Upload external video → Auto SEO → Thumbnails → Publish</p>
            </div>
          </div>
        </div>

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
                <p className="text-xs text-red-600 mt-2">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 1: Upload + Niche + Start */}
        {!pipelineDone && (
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
        {pipelineDone && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> SEO & Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SeoReviewStep
                titleOptions={titleOptions}
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
        {completedSteps.includes('thumbnails') && (
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
              />
            </CardContent>
          </Card>
        )}

        {/* Step 4: Channel + Publish */}
        {pipelineDone && (
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
                onPrivacyChange={setPrivacy}
                onCategoryChange={setCategoryId}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}