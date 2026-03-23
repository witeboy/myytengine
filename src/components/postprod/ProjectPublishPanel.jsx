import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Youtube, Upload, Check, Loader2, FileVideo, Image, Tag,
  AlertCircle, ExternalLink, X, FolderOpen
} from 'lucide-react';
import YouTubeChannelSelector from './YouTubeChannelSelector';
import { uploadToYouTube, sanitizeTags } from './youtubeUploadUtil';

const DONE_STATUSES = ['compiled', 'post_production'];

export default function ProjectPublishPanel({ preselectedProjectId }) {
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || '');
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const [title, setTitle] = useState('');
  const [titleOptions, setTitleOptions] = useState([]);
  const [description, setDescription] = useState('');
  const [descriptionOptions, setDescriptionOptions] = useState([]);
  const [tags, setTags] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [categoryId, setCategoryId] = useState('22');

  const [videoFile, setVideoFile] = useState(null);
  const fileInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  // Load done projects
  const { data: doneProjects = [] } = useQuery({
    queryKey: ['done-projects'],
    queryFn: async () => {
      const all = await base44.entities.Projects.list('-updated_date', 100);
      return all.filter(p => DONE_STATUSES.includes(p.status) && !p.archived);
    },
  });

  // Auto-select preselected project
  useEffect(() => {
    if (preselectedProjectId) setSelectedProjectId(preselectedProjectId);
  }, [preselectedProjectId]);

  // Load metadata when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setTitle(''); setTitleOptions([]); setDescription(''); setDescriptionOptions([]);
      setTags(''); setThumbnailUrl('');
      return;
    }
    loadMetadata(selectedProjectId);
  }, [selectedProjectId]);

  const loadMetadata = async (pid) => {
    try {
      const meta = await base44.entities.UploadMetadata.filter({ project_id: pid });
      if (meta[0]) {
        const m = meta[0];
        const titles = [m.title_primary, m.title_variation_1, m.title_variation_2, m.title_variation_3, m.title_variation_4].filter(Boolean);
        setTitleOptions(titles);
        setTitle(titles[0] || '');

        const descs = [];
        if (m.description_template) descs.push({ label: 'Hook-Heavy', content: m.description_template });
        if (m.description_alt_1) descs.push({ label: 'SEO-Optimized', content: m.description_alt_1 });
        if (m.description_alt_2) descs.push({ label: 'Storytelling', content: m.description_alt_2 });
        setDescriptionOptions(descs);
        setDescription(descs[0]?.content || '');

        try { setTags(JSON.parse(m.tags || '[]').join(', ')); } catch (_) { setTags(m.tags || ''); }
        if (m.selected_channel_id) setSelectedChannelId(m.selected_channel_id);
      } else {
        // Fallback to project name
        const proj = doneProjects.find(p => p.id === pid);
        setTitle(proj?.name || '');
      }

      const thumbs = await base44.entities.ThumbnailConcepts.filter({ project_id: pid });
      const selected = thumbs.find(t => t.is_selected && t.image_url) || thumbs.find(t => t.image_url);
      setThumbnailUrl(selected?.image_url || '');
    } catch (err) { console.warn('Failed to load metadata:', err.message); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setUploadError('');
    }
  };

  const handlePublish = async () => {
    if (!videoFile) { setUploadError('Select a video file first'); return; }
    if (!selectedChannelId) { setUploadError('Select a YouTube channel first'); return; }
    if (!title.trim()) { setUploadError('Title is required'); return; }

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setUploadResult(null);

    try {
      // Save channel to metadata
      if (selectedProjectId) {
        try {
          const meta = await base44.entities.UploadMetadata.filter({ project_id: selectedProjectId });
          if (meta[0]) await base44.entities.UploadMetadata.update(meta[0].id, { selected_channel_id: selectedChannelId });
        } catch (_) {}
      }

      const tokenRes = await base44.functions.invoke('youtubeAuth', { action: 'get_token', channel_id: selectedChannelId });
      if (!tokenRes.data?.access_token) throw new Error(tokenRes.data?.error || 'Failed to get token. Reconnect channel.');

      let thumbnailBlob = null;
      if (thumbnailUrl) {
        try { const r = await fetch(thumbnailUrl); if (r.ok) thumbnailBlob = await r.blob(); } catch (_) {}
      }

      const tagArray = sanitizeTags(tags);
      const result = await uploadToYouTube({
        accessToken: tokenRes.data.access_token,
        file: videoFile,
        metadata: { title: title.trim(), description: description.trim(), tags: tagArray, privacy, categoryId },
        thumbnailBlob,
        onProgress: setUploadProgress,
      });

      // Mark project as published
      if (selectedProjectId) {
        try {
          const proj = doneProjects.find(p => p.id === selectedProjectId);
          await base44.entities.Projects.update(selectedProjectId, { status: 'published', current_step: 14 });
          if (proj?.channel_topic_id) {
            try { await base44.entities.ChannelTopics.update(proj.channel_topic_id, { status: 'completed' }); } catch (_) {}
          }
        } catch (_) {}
      }

      setUploadResult(result);
      setUploadProgress(100);
    } catch (err) {
      console.error('YouTube upload failed:', err);
      setUploadError(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const selectedProject = doneProjects.find(p => p.id === selectedProjectId);

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-red-600" />
          <span>Publish Project</span>
          {uploadResult && <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Published!</Badge>}
        </CardTitle>
        <p className="text-xs text-gray-500">Select a completed project to publish with auto-populated SEO metadata</p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Project Selector */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Select Project</label>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Choose a completed project..." /></SelectTrigger>
            <SelectContent>
              {doneProjects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <span>{p.name} {p.niche ? `| ${p.niche}` : ''}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {doneProjects.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No completed projects yet. Finish a project to publish it here.</p>
          )}
        </div>

        {selectedProjectId && (
          <>
            {/* Channel */}
            <YouTubeChannelSelector selectedChannelId={selectedChannelId} onChannelChange={setSelectedChannelId} />

            {/* Video File */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Video File</label>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
              {videoFile ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <FileVideo className="w-5 h-5 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{videoFile.name}</p>
                    <p className="text-xs text-gray-500">{(videoFile.size / 1048576).toFixed(1)} MB</p>
                  </div>
                  <button onClick={() => setVideoFile(null)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-center">
                  <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                  <p className="text-sm text-gray-600">Select exported MP4</p>
                </button>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              {titleOptions.length > 1 ? (
                <Select value={title} onValueChange={setTitle}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Choose title..." /></SelectTrigger>
                  <SelectContent>
                    {titleOptions.map((t, i) => (
                      <SelectItem key={i} value={t}><span className="truncate">{t}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Video title" maxLength={100} />
              )}
              <span className={`text-[10px] ${title.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{title.length}/100</span>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              {descriptionOptions.length > 1 && (
                <div className="flex gap-1 mb-1.5">
                  {descriptionOptions.map((d, i) => (
                    <button key={i} onClick={() => setDescription(d.content)}
                      className={`flex-1 px-2 py-1 rounded text-[10px] font-medium ${description === d.content ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Video description" className="text-sm" />
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
              <Textarea value={tags} onChange={e => setTags(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
              <p className="text-[10px] text-gray-400 mt-0.5">{tags.split(',').filter(t => t.trim()).length} tags</p>
            </div>

            {/* Thumbnail */}
            {thumbnailUrl && (
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Thumbnail</label>
                <img src={thumbnailUrl} className="w-full aspect-video object-cover rounded-lg border" alt="Thumbnail" />
              </div>
            )}

            {/* Privacy + Category */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1.5 block">Privacy</label>
                <Select value={privacy} onValueChange={setPrivacy}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-1.5 block">Category</label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="22">People & Blogs</SelectItem>
                    <SelectItem value="27">Education</SelectItem>
                    <SelectItem value="28">Science & Tech</SelectItem>
                    <SelectItem value="24">Entertainment</SelectItem>
                    <SelectItem value="26">Howto & Style</SelectItem>
                    <SelectItem value="1">Film & Animation</SelectItem>
                    <SelectItem value="10">Music</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Progress / Error / Result */}
            {uploading && (
              <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading to YouTube...</span>
                  <span className="ml-auto font-mono text-xs">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-[10px] text-blue-500">Don't close this tab.</p>
              </div>
            )}

            {uploadError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{uploadError}</span>
              </div>
            )}

            {uploadResult && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
                <div className="flex items-center gap-2 text-green-700"><Check className="w-5 h-5" /><span className="font-medium">Published to YouTube!</span></div>
                <a href={uploadResult.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <ExternalLink className="w-4 h-4" />{uploadResult.url}
                </a>
              </div>
            )}

            {!uploading && !uploadResult && (
              <Button onClick={handlePublish} disabled={!videoFile || !selectedChannelId || !title.trim()} className="w-full bg-red-600 hover:bg-red-700 gap-2 h-11">
                <Youtube className="w-5 h-5" /> Publish to YouTube
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}