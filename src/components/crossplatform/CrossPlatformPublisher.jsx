import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Upload, FileVideo, X, Wand2, Send, ChevronRight,
  CheckCircle2, ArrowLeft, Globe, Sparkles, Tag
} from 'lucide-react';
import PlatformAdaptCard from './PlatformAdaptCard';
import YouTubeUploadSection from './YouTubeUploadSection';
import { PLATFORM_META as _PM } from './PlatformIcon';

const PLATFORMS = ['youtube', 'tiktok', 'x', 'instagram'];

export default function CrossPlatformPublisher({ projects = [] }) {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [step, setStep] = useState('source'); // source | adapt | publish
  const [videoFile, setVideoFile] = useState(null);
  const fileRef = useRef(null);

  // Source metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [niche, setNiche] = useState('general');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  // Adapted per-platform data
  const [adaptations, setAdaptations] = useState({});
  const [adaptingAll, setAdaptingAll] = useState(false);

  // Load project metadata when selected
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    if (!selectedProjectId) return;
    loadProjectMeta();
  }, [selectedProjectId]);

  const loadProjectMeta = async () => {
    try {
      const [metaArr, thumbArr] = await Promise.all([
        base44.entities.UploadMetadata.filter({ project_id: selectedProjectId }),
        base44.entities.ThumbnailConcepts.filter({ project_id: selectedProjectId }),
      ]);

      const m = metaArr[0];
      if (m) {
        setTitle(m.title_primary || selectedProject?.name || '');
        setDescription(m.description_template || '');
        try { setTags(JSON.parse(m.tags || '[]').join(', ')); } catch (_) { setTags(m.tags || ''); }
        setHashtags(m.hashtags || '');
      }
      if (selectedProject?.niche) setNiche(selectedProject.niche);

      const thumb = thumbArr.find(t => t.is_selected && t.image_url) || thumbArr.find(t => t.image_url);
      if (thumb) setThumbnailUrl(thumb.image_url);
    } catch (_) {}
  };

  const handleAdaptAll = async () => {
    setAdaptingAll(true);
    const results = {};
    for (const platform of PLATFORMS) {
      try {
        const res = await base44.functions.invoke('adaptForPlatform', {
          platform, title, description, tags, hashtags, niche,
        });
        results[platform] = res.data;
      } catch (e) {
        console.warn(`${platform} adaptation failed:`, e.message);
      }
    }
    setAdaptations(results);
    setAdaptingAll(false);
    setStep('adapt');
  };

  const handleSingleAdapted = (platform, data) => {
    setAdaptations(prev => ({ ...prev, [platform]: data }));
  };

  const adaptedCount = Object.keys(adaptations).length;
  const hasSource = title.trim() || description.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
          <Globe className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Cross-Platform Publisher</h2>
          <p className="text-xs text-gray-500">Adapt & publish to YouTube, TikTok, X.com, Instagram</p>
        </div>
        {adaptedCount > 0 && (
          <Badge className="ml-auto bg-purple-100 text-purple-700">{adaptedCount}/{PLATFORMS.length} adapted</Badge>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-xs">
        {['Source Content', 'Adapt per Platform', 'Publish'].map((label, i) => {
          const stepKey = ['source', 'adapt', 'publish'][i];
          const isActive = step === stepKey;
          const isDone = (stepKey === 'source' && step !== 'source') || (stepKey === 'adapt' && step === 'publish');
          return (
            <React.Fragment key={label}>
              {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              <button
                onClick={() => setStep(stepKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                  isActive ? 'bg-purple-100 text-purple-700 font-semibold' : isDone ? 'bg-green-50 text-green-700' : 'text-gray-400'
                }`}
              >
                {isDone && <CheckCircle2 className="w-3 h-3" />}
                <span>{label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* STEP 1: Source Content */}
      {step === 'source' && (
        <div className="space-y-4">
          {/* Project selector */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Load from Project</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Choose a project to pre-fill..." /></SelectTrigger>
                  <SelectContent>
                    {projects.filter(p => !p.archived).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Video File */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Video File</label>
                <input ref={fileRef} type="file" accept="video/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setVideoFile(f); }} />
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
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors text-center">
                    <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-600">Click to select video</p>
                  </button>
                )}
              </div>

              {/* Niche */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Niche</label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['general','finance','tech','education','entertainment','health','travel','true_crime','gaming','music','cooking','motivation','drama','legal','relationships'].map(n => (
                      <SelectItem key={n} value={n}>{n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Title (YouTube/Master)</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Your video title" />
                <span className="text-[10px] text-gray-400">{title.length} chars</span>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description (Master)</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Full description..." className="text-sm" />
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
                <Textarea value={tags} onChange={e => setTags(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Hashtags</label>
                <Input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#hashtag1 #hashtag2..." className="text-xs" />
              </div>

              {/* Thumbnail preview */}
              {thumbnailUrl && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Thumbnail</label>
                  <img src={thumbnailUrl} className="w-full max-w-sm aspect-video object-cover rounded-lg border" alt="" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adapt button */}
          <Button
            onClick={handleAdaptAll}
            disabled={!hasSource || adaptingAll}
            className="w-full h-11 gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {adaptingAll
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Adapting for all platforms...</>
              : <><Wand2 className="w-4 h-4" /> Adapt for All 4 Platforms</>}
          </Button>

          {/* Or adapt individually */}
          <div className="text-center">
            <button onClick={() => setStep('adapt')} className="text-xs text-gray-500 hover:text-purple-600">
              Or adapt platforms individually →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Per-Platform Adaptation */}
      {step === 'adapt' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('source')} className="gap-1 text-xs">
              <ArrowLeft className="w-3 h-3" /> Back to Source
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAdaptAll}
              disabled={adaptingAll}
              className="gap-1.5 text-xs"
            >
              {adaptingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {adaptingAll ? 'Adapting...' : 'Re-adapt All'}
            </Button>
          </div>

          <div className="grid gap-3">
            {PLATFORMS.map(platform => (
              <PlatformAdaptCard
                key={platform}
                platform={platform}
                sourceTitle={title}
                sourceDescription={description}
                sourceTags={tags}
                sourceHashtags={hashtags}
                niche={niche}
                adaptedData={adaptations[platform]}
                onAdapted={handleSingleAdapted}
                disabled={!hasSource}
              />
            ))}
          </div>

          <Button
            onClick={() => setStep('publish')}
            disabled={adaptedCount === 0}
            className="w-full h-11 gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            <Send className="w-4 h-4" />
            Proceed to Publish ({adaptedCount} platforms ready)
          </Button>
        </div>
      )}

      {/* STEP 3: Publish */}
      {step === 'publish' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('adapt')} className="gap-1 text-xs">
              <ArrowLeft className="w-3 h-3" /> Back to Adapt
            </Button>
          </div>

          {/* YouTube — Full upload integration */}
          {adaptations.youtube && (
            <YouTubeUploadSection
              videoFile={videoFile}
              adaptation={adaptations.youtube}
              thumbnailUrl={thumbnailUrl}
              projectId={selectedProjectId}
            />
          )}

          {/* TikTok, X, Instagram — Copy-ready cards */}
          {['tiktok', 'x', 'instagram'].map(platform => {
            const data = adaptations[platform];
            if (!data) return null;
            return (
              <CopyPublishCard key={platform} platform={platform} data={data} />
            );
          })}

          {/* No platforms adapted */}
          {adaptedCount === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No platforms adapted yet. Go back and adapt first.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyPublishCard({ platform, data }) {
  const [copied, setCopied] = useState(false);
  const meta = _PM[platform];

  const fullText = [
    data.adapted_title,
    data.adapted_description,
    data.adapted_hashtags?.join(' '),
  ].filter(Boolean).join('\n\n');

  const handleCopyAll = () => {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const links = {
    tiktok: 'https://www.tiktok.com/upload',
    x: 'https://x.com/compose/post',
    instagram: 'https://www.instagram.com/',
  };

  return (
    <Card className={meta.borderColor}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${meta.color} flex items-center justify-center text-white`}>
            <PlatformIcon platform={platform} className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm">{meta.name}</span>
          <Badge className="bg-green-100 text-green-700 text-[10px] ml-auto">Ready</Badge>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
          {data.adapted_description?.slice(0, 200)}...
        </div>

        {data.adapted_hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.adapted_hashtags.slice(0, 10).map((h, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{h}</Badge>
            ))}
            {data.adapted_hashtags.length > 10 && (
              <Badge variant="outline" className="text-[10px] text-gray-400">+{data.adapted_hashtags.length - 10} more</Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCopyAll} className="flex-1 gap-1.5 text-xs">
            {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy All'}
          </Button>
          <Button size="sm" asChild className={`flex-1 gap-1.5 text-xs ${meta.color} text-white`}>
            <a href={links[platform]} target="_blank" rel="noopener noreferrer">
              <Send className="w-3 h-3" /> Open {meta.name}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}