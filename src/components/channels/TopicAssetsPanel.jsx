import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Download, Loader2, Music, Mic, Image as ImageIcon, Video,
  FileText, Tag, Hash, MessageSquare, Type, ChevronDown, ChevronUp, Package
} from 'lucide-react';

function DownloadBtn({ url, label, icon: Icon, ext }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (!url) return;
    setDownloading(true);
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${label.replace(/\s+/g, '-').toLowerCase()}.${ext || 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (_) {
      window.open(url, '_blank');
    }
    setDownloading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-all text-left group"
    >
      <Icon className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
      <span className="text-xs text-gray-700 flex-1 truncate">{label}</span>
      {downloading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
      ) : (
        <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-600 flex-shrink-0" />
      )}
    </button>
  );
}

function TextDownloadBtn({ text, label, icon: Icon, filename }) {
  const handleDownload = (e) => {
    e.stopPropagation();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${label.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-green-50 hover:border-green-300 transition-all text-left group"
    >
      <Icon className="w-4 h-4 text-gray-400 group-hover:text-green-600 flex-shrink-0" />
      <span className="text-xs text-gray-700 flex-1 truncate">{label}</span>
      <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-green-600 flex-shrink-0" />
    </button>
  );
}

function buildTextDocument(data) {
  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push(`PROJECT: ${data.projectName}`);
  lines.push('═══════════════════════════════════════');
  lines.push('');

  if (data.seoTitles?.length) {
    lines.push('── SEO TITLES ──');
    data.seoTitles.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');
  }

  if (data.descriptions?.length) {
    lines.push('── DESCRIPTIONS ──');
    data.descriptions.forEach((d) => {
      lines.push(`[${d.label}]`);
      lines.push(d.content);
      lines.push('');
    });
  }

  if (data.tags?.length) {
    lines.push('── TAGS ──');
    lines.push(data.tags.join(', '));
    lines.push('');
  }

  if (data.hashtags) {
    lines.push('── HASHTAGS ──');
    lines.push(data.hashtags);
    lines.push('');
  }

  if (data.pinnedComment) {
    lines.push('── PINNED COMMENT ──');
    lines.push(data.pinnedComment);
    lines.push('');
  }

  if (data.script) {
    lines.push('── FULL SCRIPT ──');
    lines.push(data.script);
    lines.push('');
  }

  return lines.join('\n');
}

export default function TopicAssetsPanel({ projectId, topicTitle }) {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState(null);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    loadAssets();
  }, [projectId]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const [projects, prodSettings, metaList, thumbnails, musicTracks, scripts] = await Promise.all([
        base44.entities.Projects.filter({ id: projectId }),
        base44.entities.ProductionSettings.filter({ project_id: projectId }),
        base44.entities.UploadMetadata.filter({ project_id: projectId }),
        base44.entities.ThumbnailConcepts.filter({ project_id: projectId }),
        base44.entities.MusicTracks.filter({ project_id: projectId }),
        base44.entities.Scripts.filter({ project_id: projectId }),
      ]);

      const project = projects[0];
      const prod = prodSettings[0];
      const meta = metaList[0];
      const selectedThumb = thumbnails.find(t => t.is_selected && t.image_url) || thumbnails.find(t => t.image_url);
      const selectedMusic = musicTracks.find(m => m.is_selected && m.audio_url) || musicTracks.find(m => m.audio_url);
      const finalScript = scripts.find(s => s.version === 'final_aggregated') || scripts.find(s => s.version === 'final') || scripts[0];

      // Parse SEO data
      let seoTitles = [];
      let descriptions = [];
      let tags = [];
      let hashtags = '';
      let pinnedComment = '';

      if (meta) {
        try { seoTitles = JSON.parse(meta.titles_json || '[]').map(t => t.title || t); } catch (_) {}
        try { descriptions = JSON.parse(meta.descriptions_json || '[]'); } catch (_) {}
        try { tags = JSON.parse(meta.tags || '[]'); } catch (_) {}
        hashtags = meta.hashtags || '';
        pinnedComment = meta.pinned_comment || '';
      }

      setAssets({
        project,
        voiceoverUrl: prod?.voiceover_url,
        thumbnailUrl: selectedThumb?.image_url,
        musicUrl: selectedMusic?.audio_url,
        musicTitle: selectedMusic?.title,
        scriptText: finalScript?.full_script,
        scriptTitle: finalScript?.title,
        seoTitles,
        descriptions,
        tags,
        hashtags,
        pinnedComment,
        status: project?.status,
      });
    } catch (e) {
      console.error('Failed to load assets:', e);
      setAssets(null);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Loading assets...</span>
      </div>
    );
  }

  if (!assets) {
    return (
      <div className="py-3 px-4 text-xs text-gray-400">No project data found</div>
    );
  }

  const mediaAssets = [];
  if (assets.voiceoverUrl) mediaAssets.push({ url: assets.voiceoverUrl, label: 'Voiceover', icon: Mic, ext: 'mp3' });
  if (assets.musicUrl) mediaAssets.push({ url: assets.musicUrl, label: assets.musicTitle || 'Background Music', icon: Music, ext: 'mp3' });
  if (assets.thumbnailUrl) mediaAssets.push({ url: assets.thumbnailUrl, label: 'Thumbnail', icon: ImageIcon, ext: 'png' });

  const textParts = [];
  if (assets.scriptText) textParts.push('Script');
  if (assets.seoTitles.length) textParts.push('Titles');
  if (assets.descriptions.length) textParts.push('Descriptions');
  if (assets.tags.length) textParts.push('Tags');

  const hasAnyAsset = mediaAssets.length > 0 || textParts.length > 0;

  if (!hasAnyAsset) {
    return (
      <div className="py-3 px-4 text-xs text-gray-400 flex items-center gap-2">
        <Package className="w-3.5 h-3.5" /> No assets generated yet
      </div>
    );
  }

  const fullTextDoc = buildTextDocument({
    projectName: topicTitle || assets.project?.name || 'Project',
    seoTitles: assets.seoTitles,
    descriptions: assets.descriptions,
    tags: assets.tags,
    hashtags: assets.hashtags,
    pinnedComment: assets.pinnedComment,
    script: assets.scriptText,
  });

  return (
    <div className="py-3 px-4 space-y-3 bg-gray-50/80 rounded-b-lg border-t border-gray-100" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-semibold text-gray-700">Generated Assets</span>
          <Badge className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200">
            {mediaAssets.length + (textParts.length > 0 ? 1 : 0)} files
          </Badge>
        </div>
        <Badge className={`text-[9px] ${
          assets.status === 'published' ? 'bg-green-100 text-green-700' :
          assets.status === 'post_production' ? 'bg-purple-100 text-purple-700' :
          'bg-amber-100 text-amber-700'
        }`}>
          {assets.status?.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Media downloads */}
      {mediaAssets.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Media</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {mediaAssets.map((a, i) => (
              <DownloadBtn key={i} url={a.url} label={a.label} icon={a.icon} ext={a.ext} />
            ))}
          </div>
        </div>
      )}

      {/* Text document download */}
      {textParts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Documents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <TextDownloadBtn
              text={fullTextDoc}
              label={`Full Package (${textParts.join(', ')})`}
              icon={FileText}
              filename={`${(topicTitle || 'project').replace(/\s+/g, '-').toLowerCase()}-seo-package.txt`}
            />
            {assets.scriptText && (
              <TextDownloadBtn
                text={assets.scriptText}
                label="Script Only"
                icon={Type}
                filename={`${(topicTitle || 'project').replace(/\s+/g, '-').toLowerCase()}-script.txt`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight wrapper for expandable topic row usage
export function ExpandableAssets({ projectId, topicTitle, isOpen }) {
  if (!isOpen || !projectId) return null;
  return <TopicAssetsPanel projectId={projectId} topicTitle={topicTitle} />;
}