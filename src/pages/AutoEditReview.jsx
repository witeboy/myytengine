import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import StoryboardCard from '@/components/autoedit/StoryboardCard';
import BrollSwapDialog from '@/components/autoedit/BrollSwapDialog';
import AudioDuckingVisualizer from '@/components/autoedit/AudioDuckingVisualizer';
import {
  ArrowLeft, CheckCircle2, XCircle, Film, Camera, Blend,
  SkipBack, SkipForward, Clock, Wand2, Volume2,
  ExternalLink, Loader2, ThumbsUp, ThumbsDown, GripVertical, Save
} from 'lucide-react';

function formatTime(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const MOTIONS_MAP = {
  zoom_in_center: 'Push In', zoom_out_center: 'Pull Out',
  pan_right_zoom: 'Drift Right', pan_left_zoom: 'Drift Left',
  push_in_top: 'Drift Up', push_in_bottom: 'Drift Down',
  diagonal_tl_br: 'Diagonal ↘', diagonal_tr_bl: 'Diagonal ↙',
};

export default function AutoEditReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobId = new URLSearchParams(window.location.search).get('job_id');

  const [selectedScene, setSelectedScene] = useState(0);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingToEditor, setSendingToEditor] = useState(false);
  const [swapIndex, setSwapIndex] = useState(null);
  const [localScenes, setLocalScenes] = useState(null); // local edits before save
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const serverScenes = useMemo(() => {
    if (!job?.scenes_data) return [];
    try { return JSON.parse(job.scenes_data); } catch { return []; }
  }, [job?.scenes_data]);

  const scenes = localScenes || serverScenes;

  const keywords = useMemo(() => {
    if (!job?.keywords_used) return [];
    try { return JSON.parse(job.keywords_used); } catch { return []; }
  }, [job?.keywords_used]);

  // ── Drag-and-drop reorder ────────────────────────────────────
  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const updated = [...scenes];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);

    // Recalculate scene numbers and start times
    let offset = 0;
    updated.forEach((s, i) => {
      s.sceneNumber = i + 1;
      s.id = `auto-${i}`;
      s.startTime = offset;
      offset += s.duration || 5;
    });

    setLocalScenes(updated);
    setHasUnsaved(true);
    setSelectedScene(to);
  }, [scenes]);

  // ── B-roll swap ──────────────────────────────────────────────
  const handleBrollSwap = useCallback((newClipData) => {
    if (swapIndex === null) return;
    const updated = [...scenes];
    const scene = { ...updated[swapIndex] };
    scene.videoUrl = newClipData.videoUrl;
    scene.brollUrl = newClipData.videoUrl;
    scene.thumbnail = newClipData.thumbnail;
    scene.imageUrl = newClipData.thumbnail;
    scene.stockSource = newClipData.source;
    scene.brollSource = newClipData.source;
    scene.stockId = newClipData.sourceId;
    scene.videoDuration = newClipData.videoDuration;
    // Recalculate playback rate for new clip
    if (newClipData.videoDuration && scene.duration) {
      scene.playbackRate = newClipData.videoDuration > scene.duration
        ? 1.0 : Math.max(0.5, scene.videoDuration / scene.duration);
    }
    updated[swapIndex] = scene;
    setLocalScenes(updated);
    setHasUnsaved(true);
    setSwapIndex(null);
  }, [scenes, swapIndex]);

  // ── Save edits back to job ───────────────────────────────────
  const handleSave = async () => {
    if (!localScenes) return;
    setSaving(true);
    const totalDuration = localScenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    await base44.entities.AutoEditJobs.update(jobId, {
      scenes_data: JSON.stringify(localScenes),
      total_duration_seconds: totalDuration,
    });
    queryClient.invalidateQueries({ queryKey: ['auto-edit-job', jobId] });
    setHasUnsaved(false);
    setSaving(false);
  };

  const handleApprove = async () => {
    setSubmitting(true);
    if (hasUnsaved) await handleSave();
    await base44.entities.AutoEditJobs.update(jobId, {
      status: 'approved', review_notes: reviewNotes,
      phase_message: 'Draft approved! Ready for final export.',
    });
    queryClient.invalidateQueries({ queryKey: ['auto-edit-job', jobId] });
    setSubmitting(false);
  };

  const handleReject = async () => {
    setSubmitting(true);
    await base44.entities.AutoEditJobs.update(jobId, {
      status: 'rejected', review_notes: reviewNotes, phase_message: 'Draft rejected.',
    });
    queryClient.invalidateQueries({ queryKey: ['auto-edit-job', jobId] });
    setSubmitting(false);
  };

  const handleSendToEditor = async () => {
    setSendingToEditor(true);
    try {
      if (hasUnsaved) await handleSave();
      const currentScenes = localScenes || serverScenes;

      const topic = job.topic_id
        ? (await base44.entities.ChannelTopics.filter({ id: job.topic_id }))[0]
        : null;
      let channel = null;
      if (job.channel_id) {
        channel = (await base44.entities.Channels.filter({ id: job.channel_id }))[0];
      }

      const project = await base44.entities.Projects.create({
        name: job.title, niche: channel?.niche || 'general',
        tone: channel?.tone || 'dramatic', orientation: job.orientation || 'landscape',
        visual_style: 'broll_only',
        video_duration_minutes: Math.ceil((job.total_duration_seconds || 60) / 60),
        status: 'timeline_editing', current_step: 6,
        channel_id: job.channel_id, channel_topic_id: job.topic_id,
      });

      for (let i = 0; i < currentScenes.length; i++) {
        const s = currentScenes[i];
        await base44.entities.Scenes.create({
          project_id: project.id, scene_number: s.sceneNumber || i + 1,
          narration_text: s.description || s.label || '',
          image_url: s.imageUrl || s.thumbnail || '',
          broll_url: s.videoUrl || s.brollUrl || '',
          broll_source: s.stockSource || s.brollSource || 'stock',
          duration_seconds: s.duration || s.targetDuration || 5,
          status: 'video_ready', camera_movement: 'slow_pan',
        });
      }

      await base44.entities.ProductionSettings.create({
        project_id: project.id,
        timeline_video_clips: JSON.stringify(currentScenes),
        timeline_caption_clips: '[]', timeline_overlay_clips: '[]',
      });

      if (topic) {
        await base44.entities.ChannelTopics.update(topic.id, { project_id: project.id, status: 'in_progress' });
      }

      await base44.entities.AutoEditJobs.update(jobId, {
        project_id: project.id, status: 'approved', phase_message: 'Sent to Timeline Editor',
      });

      navigate(`/TimelineEditor?project_id=${project.id}`);
    } catch (err) {
      console.error('Send to editor failed:', err);
    }
    setSendingToEditor(false);
  };

  // ── Loading / Not Found ──────────────────────────────────────
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
  const currentScene = scenes[selectedScene];
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Wand2 className="w-5 h-5 text-violet-600" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{job.title}</h1>
            <p className="text-sm text-gray-500">{job.phase_message}</p>
          </div>
          {hasUnsaved && (
            <Button onClick={handleSave} disabled={saving} size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-700">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Changes
            </Button>
          )}
          <Badge className={`text-xs flex-shrink-0 ${
            isReady ? 'bg-green-100 text-green-700' :
            isProcessing ? 'bg-violet-100 text-violet-700' :
            job.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
            job.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
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
                <div className="bg-violet-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress || 0}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{job.progress || 0}% complete</p>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {scenes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* ═══ LEFT: Storyboard Grid (drag-and-drop) ═══ */}
            <div className="lg:col-span-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <Film className="w-4 h-4 text-violet-600" />
                      Storyboard
                      <Badge variant="outline" className="text-[10px]">{scenes.length} scenes · {formatTime(totalDuration)}</Badge>
                    </h2>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <GripVertical className="w-3 h-3" /> Drag to reorder · Click search icon to swap B-roll
                    </p>
                  </div>

                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="storyboard" direction="horizontal">
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3"
                        >
                          {scenes.map((scene, idx) => (
                            <Draggable key={scene.id || `auto-${idx}`} draggableId={scene.id || `auto-${idx}`} index={idx}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps}>
                                  <StoryboardCard
                                    scene={scene}
                                    index={idx}
                                    isSelected={idx === selectedScene}
                                    isDragging={snapshot.isDragging}
                                    onSelect={setSelectedScene}
                                    onSwapClick={setSwapIndex}
                                    dragHandleProps={provided.dragHandleProps}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </CardContent>
              </Card>

              {/* ═══ Preview Player ═══ */}
              {currentScene && (
                <Card className="mt-4">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Video Preview */}
                      <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${
                        job.orientation === 'portrait' ? 'aspect-[9/16] max-w-[220px] mx-auto' : 'aspect-video'
                      }`}>
                        {currentScene.videoUrl ? (
                          <video key={currentScene.videoUrl} src={currentScene.videoUrl}
                            className="w-full h-full object-cover" autoPlay muted loop playsInline />
                        ) : currentScene.thumbnail || currentScene.imageUrl ? (
                          <img src={currentScene.thumbnail || currentScene.imageUrl}
                            className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-12 h-12 text-gray-600" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-2">
                          <p className="text-xs text-white font-medium">Scene {selectedScene + 1} / {scenes.length}</p>
                        </div>
                        {currentScene.cinematicMotion && (
                          <div className="absolute top-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-amber-300 flex items-center gap-1">
                            <Camera className="w-2.5 h-2.5" /> {MOTIONS_MAP[currentScene.cinematicMotion] || currentScene.cinematicMotion}
                          </div>
                        )}
                      </div>

                      {/* Audio Ducking + Scene Details */}
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-green-600" /> Audio Mix
                          </h3>
                          <AudioDuckingVisualizer scene={currentScene} />
                        </div>

                        <div className="text-xs space-y-1.5 text-gray-600">
                          <p><span className="font-medium text-gray-800">Description:</span> {currentScene.label || currentScene.description}</p>
                          <p><span className="font-medium text-gray-800">Keywords:</span> {currentScene.keywords}</p>
                          <p><span className="font-medium text-gray-800">Duration:</span> {currentScene.duration}s at {formatTime(currentScene.startTime)}</p>
                          <p><span className="font-medium text-gray-800">Source:</span> {currentScene.stockSource || currentScene.brollSource || 'stock'}</p>
                          {currentScene.arcPosition && (
                            <p><span className="font-medium text-gray-800">Arc:</span> {currentScene.arcPosition}</p>
                          )}
                          {currentScene.emotionalTone && (
                            <p><span className="font-medium text-gray-800">Tone:</span> {currentScene.emotionalTone}</p>
                          )}
                          <p><span className="font-medium text-gray-800">Playback:</span> {(currentScene.playbackRate || 1).toFixed(2)}x</p>
                        </div>

                        {/* Scene navigation */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedScene === 0}
                            onClick={() => setSelectedScene(p => Math.max(0, p - 1))}>
                            <SkipBack className="w-3 h-3" />
                          </Button>
                          <span className="text-xs font-mono text-gray-500">
                            {formatTime(currentScene.startTime)} / {formatTime(totalDuration)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedScene >= scenes.length - 1}
                            onClick={() => setSelectedScene(p => Math.min(scenes.length - 1, p + 1))}>
                            <SkipForward className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ═══ RIGHT: Stats + Review Actions ═══ */}
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
                      <p className="text-lg font-bold text-blue-700">{formatTime(totalDuration)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Motions</p>
                      <p className="text-lg font-bold text-amber-700">{scenes.filter(s => s.cinematicMotion).length}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2.5">
                      <p className="text-gray-500">Audio Duck</p>
                      <p className="text-lg font-bold text-green-700">{scenes.filter(s => s.audioDucking?.enabled).length}</p>
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

              {/* Review Actions */}
              {isReady && (
                <Card className="border-green-200">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800">Review Draft</h3>
                    <Textarea
                      placeholder="Add notes (optional)..."
                      value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                      className="text-xs" rows={3}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSendToEditor} disabled={sendingToEditor}
                        className="flex-1 bg-violet-600 hover:bg-violet-700 gap-1 text-xs">
                        {sendingToEditor ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        Open in Editor
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleApprove} disabled={submitting} variant="outline"
                        className="flex-1 border-green-200 text-green-700 hover:bg-green-50 gap-1 text-xs">
                        <ThumbsUp className="w-3 h-3" /> Approve
                      </Button>
                      <Button onClick={handleReject} disabled={submitting} variant="outline"
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1 text-xs">
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
                      <Button onClick={() => navigate(`/TimelineEditor?project_id=${job.project_id}`)}
                        className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1" size="sm">
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

      {/* B-Roll Swap Dialog */}
      {swapIndex !== null && scenes[swapIndex] && (
        <BrollSwapDialog
          scene={scenes[swapIndex]}
          orientation={job.orientation}
          onSwap={handleBrollSwap}
          onClose={() => setSwapIndex(null)}
        />
      )}
    </div>
  );
}