import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Youtube, Upload, Check, Loader2, FileVideo, Tag,
  AlertCircle, ExternalLink, X, Video
} from 'lucide-react';
import YouTubeChannelSelector from './YouTubeChannelSelector';
import { uploadToYouTube, sanitizeTags } from './youtubeUploadUtil';

export default function StandalonePublishPanel() {
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [categoryId, setCategoryId] = useState('22');

  const [videoFile, setVideoFile] = useState(null);
  const fileInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

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
      const tokenRes = await base44.functions.invoke('youtubeAuth', { action: 'get_token', channel_id: selectedChannelId });
      if (!tokenRes.data?.access_token) throw new Error(tokenRes.data?.error || 'Failed to get token. Reconnect channel.');

      const tagArray = sanitizeTags(tags);
      const result = await uploadToYouTube({
        accessToken: tokenRes.data.access_token,
        file: videoFile,
        metadata: { title: title.trim(), description: description.trim(), tags: tagArray, privacy, categoryId },
        thumbnailBlob: null,
        onProgress: setUploadProgress,
      });

      setUploadResult(result);
      setUploadProgress(100);
    } catch (err) {
      console.error('YouTube upload failed:', err);
      setUploadError(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleReset = () => {
    setUploadResult(null);
    setVideoFile(null);
    setTitle('');
    setDescription('');
    setTags('');
    setUploadProgress(0);
  };

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="w-5 h-5 text-blue-600" />
          <span>Solo Upload</span>
          {uploadResult && <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Published!</Badge>}
        </CardTitle>
        <p className="text-xs text-gray-500">Upload a fresh video not produced in the app</p>
      </CardHeader>
      <CardContent className="space-y-4">

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
              <p className="text-sm text-gray-600">Select your video file</p>
              <p className="text-xs text-gray-400 mt-0.5">.mp4, .mov, .webm</p>
            </button>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Title</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Video title" maxLength={100} />
          <span className={`text-[10px] ${title.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{title.length}/100</span>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Description</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Video description" className="text-sm" />
        </div>

        {/* Tags */}
        <div>
          <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
          <Textarea value={tags} onChange={e => setTags(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
        </div>

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
            <Button onClick={handleReset} variant="outline" size="sm" className="w-full">Upload Another Video</Button>
          </div>
        )}

        {!uploading && !uploadResult && (
          <Button onClick={handlePublish} disabled={!videoFile || !selectedChannelId || !title.trim()} className="w-full bg-blue-600 hover:bg-blue-700 gap-2 h-11">
            <Youtube className="w-5 h-5" /> Upload to YouTube
          </Button>
        )}
      </CardContent>
    </Card>
  );
}