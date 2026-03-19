import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, CheckCircle2, XCircle, Film, Camera, Blend,
  Play, Pause, SkipBack, SkipForward, Clock, Wand2,
  ExternalLink, Loader2, ThumbsUp, ThumbsDown
} from 'lucide-react';

const MOTIONS_MAP = {
  zoom_in_center: 'Push In', zoom_out_center: 'Pull Out',
  pan_right_zoom: 'Drift Right', pan_left_zoom: 'Drift Left',
  push_in_top: 'Drift Up', push_in_bottom: 'Drift Down',
  diagonal_tl_br: 'Diagonal ↘', diagonal_tr_bl: 'Diagonal ↙',
};

function formatTime(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AutoEditReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobId = new URLSearchParams(window.location.search).get('job_id');

  const [previewScene, setPreviewScene] = useState(0);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingToEditor, setSendingToEditor] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['auto-edit-job', jobId],
    queryFn: async () => {
      const list = await base44.entities.AutoEditJobs.filter({ id: jobId });
      return list[0];
    },
    enabled: !!jobId,
    refetchInterval: (data) => {
      if (!data) return 3000;
      if (['pending', 'searching_media', 'assembling_timeline', 'applying_effects', 'exporting'].includes(data.status)) return 3000;
      return false;
    }
  });

  const scenes = useMemo(() => {
    if (!job?.scenes_data) return [];
    try { return JSON.parse(job.scenes_data); } catch { return []; }
  }, [job?.scenes_data]);

  const keywords = useMemo(() => {
    if (!job?.keywords_used) return [];
    try { return JSON.parse(job.keywords_used); } catch { return []; }
  }, [job?.keywords_used]);

  const handleApprove = async () => {
    setSubmitting(true);
    await base44.entities.AutoEditJobs.update(jobId, {
      status: 'approved',
      review_notes: reviewNotes,
      phase_message: 'Draft approved! Ready for final export.',
    });
    queryClient.invalidateQueries({ queryKey: ['auto-edit-job', jobId] });
    setSubmitting(false);
  };

  const handleReject = async () => {
    setSubmitting(true);
    await base44.entities.AutoEditJobs.update(jobId, {
      status: 'rejected',
      review_notes: reviewNotes,
      phase_message: 'Draft rejected.',
    });
    queryClient.invalidateQueries({ queryKey: ['auto-edit-job', jobId] });
    setSubmitting(false);
  };

  const handleSendToEditor = async () => {
    setSendingToEditor(true);
    try {
      // Create a project and production settings with the timeline data
      const topic = job.topic_id
        ? (await base44.entities.ChannelTopics.filter({ id: job.topic_id }))[0]
        : null;

      let channel = null;
      if (job.channel_id) {
        channel = (await base44.entities.Channels.filter({ id: job.channel_id }))[0];
      }

      const project = await base44.entities.Projects.create({
        name: job.title,
        niche: channel?.niche || 'general',
        tone: channel?.tone || 'dramatic',
        orientation: job.orientation || 'landscape',
        visual_style: 'broll_only',
        video_duration_minutes: Math.ceil((job.total_duration_seconds || 60) / 60),
        status: 'timeline_editing',
        current_step: 6,
        channel_id: job.channel_id,
        channel_topic_id: job.topic_id,
      });

      // Create scenes from the auto-edit data
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        await base44.entities.Scenes.create({
          project_id: project.id,
          scene_number: s.sceneNumber || i + 1,
          narration_text: s.description || s.label || '',
          image_url: s.imageUrl || s.thumbnail || '',
          broll_url: s.videoUrl || s.brollUrl || '',
          broll_source: s.stockSource || s.brollSource || 'stock',
          duration_seconds: s.duration || s.targetDuration || 5,
          status: 'video_ready',
          camera_movement: 'slow_pan',
        });
      }

      // Save timeline clips to ProductionSettings
      await base44.entities.ProductionSettings.create({
        project_id: project.id,
        timeline_video_clips: job.scenes_data,
        timeline_caption_clips: '[]',
        timeline_overlay_clips: '[]',
      });

      // Link back to topic
      if (topic) {
        await base44.entities.ChannelTopics.update(topic.id, {
          project_id: project.id,
          status: 'in_progress',
        });
      }

      await base44.entities.AutoEditJobs.update(jobId, {
        project_id: project.id,
        status: 'approved',
        phase_message: 'Sent to Timeline Editor',
      });

      navigate(`/TimelineEditor?project_id=${project.id}`);
    } catch (err) {
      console.error('Send to editor failed:', err);
    }
    setSendingToEditor(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-gray-500">Job not found</p>
      </div>
    );
  }

  const isReady = job.status === 'ready_for_review';
  const isProcessing = ['pending', 'searching_media', 'assembling_timeline', 'applying_effects', 'exporting'].includes(job.status);
  const currentScene = scenes[previewScene];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Wand2 className="w-5 h-5 text-violet-600" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            <p className="text-sm text-gray-500">{job.phase_message}</p>
          </div>
          <Badge className={`text-xs ${
            isReady ? 'bg-green-100 text-green-700' :
            isProcessing ? 'bg-violet-100 text-violet-700' :
            job.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
            job.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {job.status?.replace(/_/g, ' ')}
          </Badge>
        </div>

        {/* Processing State */}
        {isProcessing && (
          <Card className="mb-6 border-violet-200">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-violet-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Pipeline Running...</h2>
              <p className="text-sm text-gray-500 mb-4">{job.phase_message}</p>
              <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress || 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{job.progress || 0}% complete</p>
            </CardContent>
          </Card>
        )}

        {/* Review Content */}
        {scenes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview */}
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-4">
                  {/* Scene Preview */}
                  <div className={`relative bg-gray-900 rounded-lg overflow-hidden mb-4 ${
                    job.orientation === 'portrait' ? 'aspect-[9/16] max-w-[300px] mx-auto' : 'aspect-video'
                  }`}>
                    {currentScene?.videoUrl ? (
                      <video
                        key={currentScene.videoUrl}
                        src={currentScene.videoUrl}
                        className="w-full h-full object-cover"
                        autoPlay muted loop playsInline
                      />
                    ) : currentScene?.thumbnail || currentScene?.imageUrl ? (
                      <img
                        src={currentScene.thumbnail || currentScene.imageUrl}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-12 h-12 text-gray-600" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-3">
                      <p className="text-sm text-white font-medium">Scene {previewScene + 1} / {scenes.length}</p>
                      <p className="text-xs text-gray-300">{currentScene?.label || currentScene?.description}</p>
                    </div>
                    {currentScene?.cinematicMotion && (
                      <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-amber-300 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> {MOTIONS_MAP[currentScene.cinematicMotion] || currentScene.cinematicMotion}
                      </div>
                    )}
                    {currentScene?.transition && (
                      <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-purple-300 flex items-center gap-1">
                        <Blend className="w-3 h-3" /> {currentScene.transition}
                      </div>
                    )}
                  </div>

                  {/* Scene Navigation */}
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <Button variant="ghost" size="icon" disabled={previewScene === 0}
                      onClick={() => setPreviewScene(p => Math.max(0, p - 1))}>
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-mono text-gray-600">
                      {formatTime(currentScene?.startTime)} / {formatTime(job.total_duration_seconds)}
                    </span>
                    <Button variant="ghost" size="icon" disabled={previewScene >= scenes.length - 1}
                      onClick={() => setPreviewScene(p => Math.min(scenes.length - 1, p + 1))}>
                      <SkipForward className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Scene Filmstrip */}
                  <div className="flex gap-1.5 overflow-x-auto pb-2">
                    {scenes.map((scene, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewScene(idx)}
                        className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-all ${
                          idx === previewScene ? 'border-violet-500 ring-1 ring-violet-300' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        {scene.thumbnail || scene.imageUrl ? (
                          <img src={scene.thumbnail || scene.imageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <Film className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel */}
            <div className="space-y-4">
              {/* Stats */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800">Draft Summary</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-violet-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Scenes</p>
                      <p className="text-lg font-bold text-violet-700">{scenes.length}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Duration</p>
                      <p className="text-lg font-bold text-blue-700">{formatTime(job.total_duration_seconds)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Motions</p>
                      <p className="text-lg font-bold text-amber-700">{scenes.filter(s => s.cinematicMotion).length}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Transitions</p>
                      <p className="text-lg font-bold text-purple-700">{scenes.filter(s => s.transition).length}</p>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    <p className="font-medium text-gray-700 mb-1">Keywords Used:</p>
                    <div className="flex flex-wrap gap-1">
                      {keywords.map((kw, i) => (
                        <span key={i} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{kw}</span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Current Scene Details */}
              {currentScene && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h3 className="text-sm font-bold text-gray-800">Scene {previewScene + 1} Details</h3>
                    <div className="text-xs space-y-1.5 text-gray-600">
                      <p><span className="font-medium text-gray-800">Keywords:</span> {currentScene.keywords}</p>
                      <p><span className="font-medium text-gray-800">Duration:</span> {currentScene.duration}s</p>
                      <p><span className="font-medium text-gray-800">Source:</span> {currentScene.stockSource || currentScene.brollSource || 'stock'}</p>
                      {currentScene.cinematicMotion && (
                        <p><span className="font-medium text-gray-800">Motion:</span> {MOTIONS_MAP[currentScene.cinematicMotion]}</p>
                      )}
                      {currentScene.transition && (
                        <p><span className="font-medium text-gray-800">Transition:</span> {currentScene.transition}</p>
                      )}
                      <p><span className="font-medium text-gray-800">Speed:</span> {(currentScene.playbackRate || 1).toFixed(2)}x</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Review Actions */}
              {isReady && (
                <Card className="border-green-200">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800">Review Draft</h3>
                    <Textarea
                      placeholder="Add notes (optional)..."
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      className="text-xs"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSendToEditor}
                        disabled={sendingToEditor}
                        className="flex-1 bg-violet-600 hover:bg-violet-700 gap-1 text-xs"
                      >
                        {sendingToEditor ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        Open in Editor
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleApprove}
                        disabled={submitting}
                        variant="outline"
                        className="flex-1 border-green-200 text-green-700 hover:bg-green-50 gap-1 text-xs"
                      >
                        <ThumbsUp className="w-3 h-3" /> Approve
                      </Button>
                      <Button
                        onClick={handleReject}
                        disabled={submitting}
                        variant="outline"
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1 text-xs"
                      >
                        <ThumbsDown className="w-3 h-3" /> Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {job.status === 'approved' && (
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="p-4 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-emerald-800">Draft Approved</p>
                    {job.review_notes && <p className="text-xs text-emerald-600 mt-1">{job.review_notes}</p>}
                    {job.project_id && (
                      <Button
                        onClick={() => navigate(`/TimelineEditor?project_id=${job.project_id}`)}
                        className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1"
                        size="sm"
                      >
                        <ExternalLink className="w-3 h-3" /> Open in Timeline Editor
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {job.status === 'rejected' && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-4 text-center">
                    <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-red-800">Draft Rejected</p>
                    {job.review_notes && <p className="text-xs text-red-600 mt-1">{job.review_notes}</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}