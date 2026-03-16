import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import SceneGrid from '@/components/content/SceneGrid';
import VoiceoverPanel from '@/components/script/VoiceoverPanel';
import ElevenLabsVoiceoverPanel from '@/components/script/ElevenLabsVoiceoverPanel';
import VisualStyleSelector from '@/components/content/VisualStyleSelector';
import OrientationSelector from '@/components/content/OrientationSelector';
import MusicPanel from '@/components/content/MusicPanel';

import AudioMixerPanel from '@/components/content/AudioMixerPanel';
import ProcessingNotifier from '@/components/content/ProcessingNotifier';
import DedupButton from '@/components/content/DedupButton';
import {
  Loader2, Download, ArrowRight, Import, Layers, ImageIcon, Film,
  Palette, Sparkles, Monitor, Clapperboard, Wand2, CheckCircle2,
  XCircle, Clock, Zap, Video, FolderDown, Mic, Music, Volume2
} from 'lucide-react';


// ═══════════════════════════════════════════════════════════════════
// Fix Prompts Button — Module-level component
// ═══════════════════════════════════════════════════════════════════
function FixPromptsButton({ projectId, sceneCount, onComplete }) {
  const [fixing, setFixing] = useState(false);
  const [fixType, setFixType] = useState(null);
  const [result, setResult] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleFix = async (type) => {
    setShowMenu(false);
    setFixing(true);
    setFixType(type);
    setResult(null);

    try {
      const resp = await base44.functions.invoke('fixScenePrompts', {
        project_id: projectId,
        fix_type: type
      });
      const data = resp.data || resp;
      setResult(data);
      await onComplete();
    } catch (err) {
      console.error('Fix prompts failed:', err);
      setResult({ error: err.message });
    }

    setFixing(false);
    setFixType(null);
    setTimeout(() => setResult(null), 5000);
  };

  if (sceneCount === 0) return null;

  const fixOptions = [
    { type: 'all', label: 'Fix Everything', desc: 'Characters + Cleanup + Quality', icon: '🔧' },
    { type: 'characters', label: 'Fix Characters', desc: 'Inject identity descriptions', icon: '👤' },
    { type: 'cleanup', label: 'Clean Metadata', desc: 'Strip orientation/text artifacts', icon: '🧹' },
    { type: 'quality', label: 'Flag Thin Prompts', desc: 'Reset weak prompts for regen', icon: '⚠️' },
  ];

  return (
    <div className="relative">
      <Button
        onClick={() => setShowMenu(!showMenu)}
        disabled={fixing}
        variant="outline"
        className="border-orange-200 text-orange-700 hover:bg-orange-50"
      >
        {fixing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
            Fixing {fixType === 'characters' ? 'Characters' : fixType === 'cleanup' ? 'Metadata' : fixType === 'quality' ? 'Quality' : 'All'}...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4 mr-1" />
            Fix Prompts ({sceneCount})
          </>
        )}
      </Button>

      {showMenu && !fixing && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-64">
          {fixOptions.map(opt => (
            <button
              key={opt.type}
              onClick={() => handleFix(opt.type)}
              className="w-full text-left px-4 py-2.5 hover:bg-orange-50 first:rounded-t-lg last:rounded-b-lg flex items-start gap-2"
            >
              <span className="text-lg">{opt.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className={`absolute top-full mt-1 right-0 z-50 rounded-lg p-3 shadow-lg text-xs w-64 ${
          result.error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {result.error ? (
            <p>Failed: {result.error}</p>
          ) : (
            <>
              <p className="font-medium">Fixed {result.fixed}/{result.total} scenes</p>
              {result.character_fixes > 0 && <p>👤 {result.character_fixes} character injections</p>}
              {result.cleanup_fixes > 0 && <p>🧹 {result.cleanup_fixes} metadata cleanups</p>}
              {result.quality_resets > 0 && <p>⚠️ {result.quality_resets} thin prompts flagged for regen</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// Audio Assets Download Panel — Module-level component
// ═══════════════════════════════════════════════════════════════════
function AudioAssetsPanel({ project }) {
  const [downloading, setDownloading] = useState(null);
  const [prodSettings, setProdSettings] = useState(null);
  const [musicTracks, setMusicTracks] = useState([]);
  const projectId = project?.id;

  // Load production settings + music tracks on mount
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const ps = await base44.entities.ProductionSettings?.filter({ project_id: projectId });
        if (ps?.length > 0) setProdSettings(ps[0]);
      } catch (_) {}

      try {
        const tracks = await base44.entities.MusicTracks?.filter({ project_id: projectId });
        if (tracks?.length > 0) setMusicTracks(tracks);
      } catch (_) {}
    })();
  }, [projectId]);

  // ── Scan ALL fields on project + prodSettings for audio URLs ──
  const allAudioUrls = {};

  const categorizeField = (field, url) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    if (/\.(png|jpg|jpeg|webp|gif|mp4|webm|mov|svg)(\?|$)/i.test(url)) return;
    if (/(image|thumbnail|poster|avatar|cover|photo|scene|video)/i.test(field) && !/(audio|voice|music|sound|narr)/i.test(field)) return;

    const f = field.toLowerCase();
    let category = null;
    let label = null;

    if (/elevenlabs|eleven_labs/.test(f)) {
      category = 'elevenlabs_voiceover';
      label = 'Voiceover (ElevenLabs)';
    } else if (/voiceover|narration|voice|narrator|tts/.test(f)) {
      category = 'voiceover';
      label = 'Voiceover';
    } else if (/music|soundtrack|bgm|background_music|bg_music|melody/.test(f)) {
      category = 'music';
      label = 'Background Music';
    } else if (/sfx|sound_effect|effect|foley/.test(f)) {
      category = 'sfx';
      label = 'Sound Effects';
    } else if (/mix|master|final_audio|combined/.test(f)) {
      category = 'mixed';
      label = 'Final Mixed Audio';
    } else if (/audio|\.mp3|\.wav|\.ogg/.test(f) || /\.mp3|\.wav|\.ogg/i.test(url)) {
      category = `other_${field}`;
      label = field.replace(/_/g, ' ').replace(/url$/i, '').trim();
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }

    if (category && !allAudioUrls[category]) {
      allAudioUrls[category] = { url, label, field };
    }
  };

  // Scan project fields
  if (project) {
    for (const [field, value] of Object.entries(project)) {
      categorizeField(field, value);
    }
  }

  // Scan production settings fields
  if (prodSettings) {
    for (const [field, value] of Object.entries(prodSettings)) {
      categorizeField(field, value);
    }
  }

  // Add music tracks from MusicTracks entity
  if (musicTracks.length > 0) {
    const sorted = [...musicTracks].sort((a, b) => (b.is_selected ? 1 : 0) - (a.is_selected ? 1 : 0));
    sorted.forEach((track, i) => {
      if (track.audio_url && track.audio_url.startsWith('http')) {
        const key = track.is_selected ? 'music' : `music_alt_${i}`;
        const label = track.is_selected
          ? `🎵 ${track.title || 'Background Music'} (Selected)`
          : `${track.title || `Music Track ${i + 1}`}`;
        if (!allAudioUrls[key]) {
          allAudioUrls[key] = { url: track.audio_url, label, field: `MusicTracks.${track.id}` };
        }
      }
    });
  }

// Only log once on mount, not every re-render
  useEffect(() => {
    if (Object.keys(allAudioUrls).length > 0) {
      console.log('🔊 Audio assets found:', Object.entries(allAudioUrls).map(([k, v]) => `${k}: ${v.field}`).join(', '));
    }
  }, [projectId, musicTracks.length, prodSettings]);
  const iconMap = {
    voiceover: <Mic className="w-4 h-4" />,
    elevenlabs_voiceover: <Mic className="w-4 h-4" />,
    music: <Music className="w-4 h-4" />,
    sfx: <Volume2 className="w-4 h-4" />,
    mixed: <Volume2 className="w-4 h-4" />,
  };

  const colorOrder = {
    voiceover: 'blue',
    elevenlabs_voiceover: 'indigo',
    music: 'purple',
    sfx: 'amber',
    mixed: 'emerald',
  };

  const assets = Object.entries(allAudioUrls).map(([category, { url, label }]) => ({
    key: category,
    label,
    icon: iconMap[category] || <Volume2 className="w-4 h-4" />,
    url,
    color: colorOrder[category] || 'blue',
  }));

  // Deduplicate by URL
  const seenUrls = new Set();
  const uniqueAssets = assets.filter(a => {
    if (seenUrls.has(a.url)) return false;
    seenUrls.add(a.url);
    return true;
  });

  if (uniqueAssets.length === 0) return null;

  const corsBlockedDomains = [
    'tempfile.aiquickdraw.com', 'aiquickdraw.com', 'kie.ai', 'api.kie.ai',
  ];

  const isCorsBocked = (url) => {
    try { return corsBlockedDomains.some(d => new URL(url).hostname.includes(d)); } catch (_) { return false; }
  };

  const handleDownload = async (asset) => {
    setDownloading(asset.key);

    const projectName = (project.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    let ext = 'mp3';
    if (asset.url.includes('.wav')) ext = 'wav';
    else if (asset.url.includes('.ogg')) ext = 'ogg';
    else if (asset.url.includes('.mp4')) ext = 'mp4';
    else if (asset.url.includes('.jpg') || asset.url.includes('.jpeg')) ext = 'jpg';
    else if (asset.url.includes('.png')) ext = 'png';

    // CORS-blocked domain → go straight to backend proxy
    if (isCorsBocked(asset.url)) {
      try {
        const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url: asset.url });
        const data = proxyRes.data || proxyRes;
        if (data.success && data.data) {
          const binary = atob(data.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: data.content_type || 'application/octet-stream' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${projectName}_${asset.key}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          setDownloading(null);
          return;
        }
      } catch (err) {
        console.warn(`Proxy download failed: ${err.message}`);
        window.open(asset.url, '_blank');
        setDownloading(null);
        return;
      }
    }

    // Non-blocked domain: try direct fetch
    try {
      const response = await fetch(asset.url, { mode: 'cors' });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('wav')) ext = 'wav';
        else if (contentType.includes('ogg')) ext = 'ogg';

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${projectName}_${asset.key}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        setDownloading(null);
        return;
      }
    } catch (_) {
      console.log(`CORS blocked for ${asset.key} — using direct link`);
    }

    // Method 2: Backend proxy (server-side, no CORS)
    try {
      const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url: asset.url });
      const data = proxyRes.data || proxyRes;
      if (data.success && data.data) {
        const binary = atob(data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.content_type || 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${projectName}_${asset.key}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        setDownloading(null);
        return;
      }
    } catch (proxyErr) {
      console.warn(`Proxy download failed for ${asset.key}: ${proxyErr.message}`);
    }

    // Method 3: Last resort — open in new tab
    window.open(asset.url, '_blank');

    setDownloading(null);
  };

  const handleDownloadAll = async () => {
    setDownloading('all');
    for (const asset of uniqueAssets) {
      await handleDownload(asset);
      await new Promise(r => setTimeout(r, 500));
    }
    setDownloading(null);
  };

  const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800', btn: 'bg-blue-600 hover:bg-blue-700' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-800', btn: 'bg-indigo-600 hover:bg-indigo-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800', btn: 'bg-purple-600 hover:bg-purple-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', btn: 'bg-amber-600 hover:bg-amber-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="w-4 h-4 text-gray-600" />
          Audio Assets
          <Badge variant="outline" className="text-[10px] ml-1">{uniqueAssets.length} available</Badge>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAll}
              disabled={downloading === 'all'}
              className="text-xs gap-1"
            >
              {downloading === 'all'
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Download className="w-3 h-3" />
              }
              Download All Audio
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {uniqueAssets.map(asset => {
            const c = colorMap[asset.color] || colorMap.blue;
            const isDownloading = downloading === asset.key;
            return (
              <div
                key={asset.key}
                className={`${c.bg} ${c.border} border rounded-lg p-3 flex flex-col gap-2`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${c.badge} flex items-center justify-center flex-shrink-0`}>
                    {asset.icon}
                  </div>
                  <p className={`text-sm font-medium ${c.text} flex-1`}>{asset.label}</p>
                  <button
                    onClick={() => handleDownload(asset)}
                    disabled={isDownloading}
                    className={`${c.btn} text-white p-1.5 rounded-lg flex-shrink-0 transition-colors`}
                    title={`Download ${asset.label}`}
                  >
                    {isDownloading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
                <audio
                  src={asset.url}
                  controls
                  preload="none"
                  className="w-full h-8"
                  style={{ maxWidth: '100%' }}
                />
                <p className="text-[10px] text-gray-400 truncate" title={asset.url}>
                  {asset.url.substring(0, 60)}...
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Content Generation Page
// ═══════════════════════════════════════════════════════════════════
export default function ContentGeneration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [audioLevels, setAudioLevels] = useState({ narration: 1, music: 0.3, sfx: 0.5 });
  const [enhancingAll, setEnhancingAll] = useState(false);
  const [retryingPrompts, setRetryingPrompts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, label: '' });
  const [estimatedWordCount, setEstimatedWordCount] = useState(0);
  const [totalExpectedScenes, setTotalExpectedScenes] = useState(0);
  

  // ── Per-scene generation tracking ─────────────────────────────
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0, sceneName: '' });
  const [videoProgress, setVideoProgress] = useState({
    current: 0, total: 0, sceneName: '',
    phase: '',
    sceneStatuses: {}
  });
  const pollAbortRef = useRef(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    return () => { pollAbortRef.current = true; };
  }, []);
  

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════
  const invokeWithTimeout = async (fnName, payload) => {
    try {
      await base44.functions.invoke(fnName, payload);
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 504) {
        console.log(`${fnName} returned 504 (timeout) — function still running, will poll for results`);
        return;
      }
      throw err;
    }
  };

  const pollForCompletion = async (checkFn, maxPolls = 60, intervalMs = 5000) => {
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      const done = await checkFn();
      if (done) return true;
    }
    return false;
  };

  // ══════════════════════════════════════════════════════════════════
  // IMPORT: Scene Breakdown → Prompt Generation
  // ══════════════════════════════════════════════════════════════════
  const handleImport = async () => {
    setImporting(true);

    try {
      const scriptsList = await base44.entities.Scripts.filter({ project_id: projectId });
      const script = scriptsList.find(s => s.version === 'final_aggregated');
      if (script?.full_script) {
        const wc = script.full_script.split(/\s+/).filter(w => w.length > 0).length;
        setEstimatedWordCount(wc);
        const expectedClips = Math.max(5, Math.min(1000, Math.floor((wc / 150) * 60 / 5)));
        setTotalExpectedScenes(expectedClips);
      }
    } catch (_) {}

    try {
      // ── Phase 1: Scene Breakdown ────────────────────────────────
      setImportPhase('breakdown');
      setImportProgress('Analyzing script & breaking down into cinematic scenes...');

      let breakdownDone = false;
      let nextBatch = 0;

      while (!breakdownDone) {
        try {
          // Longer delay after batch 0 (analysis) to let DB propagate blueprint
if (nextBatch > 0) {
  const delay = nextBatch === 1 ? 8000 : 3000;
  await new Promise(r => setTimeout(r, delay));
}

          const bdResult = await base44.functions.invoke('generateSceneBreakdown', {
            project_id: projectId,
            batch_index: nextBatch
          });
          const bdData = bdResult.data || bdResult;
          breakdownDone = bdData.done === true;
          nextBatch = bdData.next_batch ?? (nextBatch + 1);

          const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
          queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));

          const target = bdData.total_target || freshScenes.length;
          setTotalExpectedScenes(target);
          setImportProgress(`Breaking down script... ${freshScenes.length}/${target} scenes created`);
        } catch (err) {
          const status = err?.response?.status || err?.status;
          const errMsg = err?.response?.data?.error || '';
          if (status === 400 && errMsg.includes('blueprint')) {
            console.log(`Blueprint not ready yet, retrying batch ${nextBatch} in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          if (status === 500 || status === 502) {
            console.log(`Server error on batch ${nextBatch}, retrying in 8s...`);
            await new Promise(r => setTimeout(r, 8000));
            continue;
          }
          if (status === 504) {
            await new Promise(r => setTimeout(r, 8000));
            const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
            queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));
            setImportProgress(`Recovering from timeout... ${freshScenes.length} scenes so far`);
            continue;
          }
          throw err;
        }
      }

      await refetchScenes();

      // ── Phase 2: Prompt Generation ──────────────────────────────
      setImportPhase('prompts');
      setImportProgress('Converting director notes into visual prompts...');

      let promptsDone = false;

      while (!promptsDone) {
        try {
          const prResult = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
          const prData = prResult.data || prResult;
          promptsDone = prData.done === true;

          const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
          queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));
          const ready = freshScenes.filter(s => s.status === 'prompts_ready');
          setImportProgress(`Generating production prompts... ${ready.length}/${freshScenes.length} ready`);
        } catch (err) {
          const status = err?.response?.status || err?.status;
          if (status === 500 || status === 502 || status === 504) {
            console.log(`Prompts error ${status}, retrying in 8s...`);
            await new Promise(r => setTimeout(r, 8000));
            const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
            queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));
            const ready = freshScenes.filter(s => s.status === 'prompts_ready');
            setImportProgress(`Recovering... ${ready.length}/${freshScenes.length} prompts ready`);
            continue;
          }
          throw err;
        }
      }

      await refetchScenes();
    } catch (err) {
      console.error('Scene generation error:', err);
    } finally {
      await refetchScenes();
      await refetchProject();
      setImporting(false);
      setImportPhase('');
      setImportProgress('');
      setEstimatedWordCount(0);
      setTotalExpectedScenes(0);
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // GENERATE ALL IMAGES
  // ══════════════════════════════════════════════════════════════════
  const handleGenerateImages = async () => {
    setGeneratingImages(true);

    const pending = scenes.filter(s =>
      (s.status === 'prompts_ready' || !s.image_url) &&
      !s.image_prompt?.startsWith('DIRECTOR_NOTES:')
    );

    if (pending.length === 0 && scenes.some(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:'))) {
      setImageProgress({ current: 0, total: 0, sceneName: 'Converting director notes first...' });
      try {
        await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
        await refetchScenes();
      } catch (err) {
        console.error('Auto prompt generation failed:', err);
      }
    }

    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    const readyScenes = freshScenes
      .filter(s => s.status === 'prompts_ready' || (!s.image_url && !s.image_prompt?.startsWith('DIRECTOR_NOTES:')))
      .sort((a, b) => a.scene_number - b.scene_number);

    const CONCURRENCY = 5;
    const total = readyScenes.length;
    let completed = 0;
    let failed = 0;

    setImageProgress({ current: 0, total, sceneName: `Starting ${total} scenes...` });

    // ── SCENE 1 FIRST: Generate alone to lock character reference ──
    // If Scene 1 is in the batch AND no reference exists yet, generate it solo first
    const freshProject = (await base44.entities.Projects.filter({ id: projectId }))?.[0];
    const hasReference = freshProject?.reference_image_url;
    const scene1 = readyScenes.find(s => s.scene_number === 1);

    if (scene1 && !hasReference) {
      setImageProgress({ current: 0, total, sceneName: 'Generating Scene 1 (character reference lock)...' });
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene1.id });
        completed++;
        console.log('📌 Scene 1 generated — character reference locked');
      } catch (err) {
        console.warn('Scene 1 generation failed:', err.message);
        failed++;
        completed++;
      }
      await refetchScenes();
      await refetchProject();
    }

    // ── REMAINING SCENES: batch with concurrency ──
    const remainingScenes = readyScenes.filter(s => !(s.scene_number === 1 && !hasReference));

    for (let i = 0; i < remainingScenes.length; i += CONCURRENCY) {
      const batch = remainingScenes.slice(i, i + CONCURRENCY);
      const batchNum = Math.floor(i / CONCURRENCY) + 1;
      const totalBatches = Math.ceil(remainingScenes.length / CONCURRENCY);

      setImageProgress({
        current: completed,
        total,
        sceneName: `Batch ${batchNum}/${totalBatches} — Scenes ${batch.map(s => s.scene_number).join(', ')} (ref: ${hasReference || scene1 ? '🔗' : '—'})`
      });

      const results = await Promise.allSettled(
        batch.map(async (scene) => {
          try {
            await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
            return { scene_number: scene.scene_number, success: true };
          } catch (err) {
            console.warn(`Scene ${scene.scene_number} image failed:`, err.message);
            return { scene_number: scene.scene_number, success: false, error: err.message };
          }
        })
      );

      for (const r of results) {
        const val = r.status === 'fulfilled' ? r.value : { success: false };
        if (val.success) completed++;
        else { failed++; completed++; }
      }

      setImageProgress({
        current: completed,
        total,
        sceneName: `${completed - failed} generated · ${failed > 0 ? `${failed} failed · ` : ''}${total - completed} remaining`
      });

      await refetchScenes();
      if (i + CONCURRENCY < remainingScenes.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Final retry pass for failed scenes
    if (failed > 0) {
      setImageProgress({ current: completed, total, sceneName: `Retrying ${failed} failed scenes...` });
      const retryScenes = await base44.entities.Scenes.filter({ project_id: projectId });
      const stillFailed = retryScenes
        .filter(s => s.status === 'prompts_ready' && !s.image_url)
        .sort((a, b) => a.scene_number - b.scene_number);

      for (const scene of stillFailed) {
        try {
          await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
          failed--;
          setImageProgress({ current: completed, total, sceneName: `Retry: Scene ${scene.scene_number} ✓ · ${failed} remaining` });
        } catch (err) {
          console.warn(`Retry scene ${scene.scene_number} failed again:`, err.message);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      await refetchScenes();
    }

    setGeneratingImages(false);
    setImageProgress({ current: 0, total: 0, sceneName: '' });
  };

  // ══════════════════════════════════════════════════════════════════
  // GENERATE & POLL ALL VIDEOS
  // ══════════════════════════════════════════════════════════════════
  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    pollAbortRef.current = false;

    const ready = scenes.filter(s =>
      s.image_url &&
      s.image_url.startsWith('http') &&
      (s.status === 'image_generated' || s.status === 'prompts_ready') &&
      (!s.video_url || s.video_url.startsWith('grok_vid_task:') || s.video_url.startsWith('veo_task:'))
    );

    if (ready.length === 0) {
      setGeneratingVideos(false);
      return;
    }

    const initialStatuses = {};
    ready.forEach(s => { initialStatuses[s.id] = 'queued'; });

    setVideoProgress({
      current: 0, total: ready.length,
      sceneName: '', phase: 'submitting',
      sceneStatuses: { ...initialStatuses }
    });

    // Phase 1: Submit all
    const pendingPolls = [];

    for (let i = 0; i < ready.length; i++) {
      if (pollAbortRef.current) break;
      const scene = ready[i];

      setVideoProgress(prev => ({
        ...prev,
        current: i + 1,
        sceneName: `Submitting Scene ${scene.scene_number}...`,
        phase: 'submitting',
        sceneStatuses: { ...prev.sceneStatuses, [scene.id]: 'submitting' }
      }));

      try {
        const response = await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
        const result = response.data || response;
        pendingPolls.push({ scene_id: scene.id, task_id: result.task_id, scene_number: scene.scene_number });
        setVideoProgress(prev => ({
          ...prev,
          sceneStatuses: { ...prev.sceneStatuses, [scene.id]: 'polling' }
        }));
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} submit failed:`, err.message);
        setVideoProgress(prev => ({
          ...prev,
          sceneStatuses: { ...prev.sceneStatuses, [scene.id]: 'failed' }
        }));
      }
    }

    // Phase 2: Poll all
    if (pendingPolls.length > 0) {
      setVideoProgress(prev => ({
        ...prev,
        phase: 'polling',
        sceneName: `${pendingPolls.length} scenes rendering with Grok Imagine...`
      }));

      let remaining = [...pendingPolls];
      let pollCount = 0;
      const MAX_POLLS = 60;

      while (remaining.length > 0 && pollCount < MAX_POLLS && !pollAbortRef.current) {
        await new Promise(r => setTimeout(r, 15000));
        pollCount++;

        const stillPending = [];

        for (const item of remaining) {
          if (pollAbortRef.current) break;
          try {
            const pollResponse = await base44.functions.invoke('pollSceneVideo', { scene_id: item.scene_id });
            const pollResult = pollResponse.data || pollResponse;

            if (pollResult.status === 'COMPLETED') {
              setVideoProgress(prev => ({
                ...prev,
                sceneStatuses: { ...prev.sceneStatuses, [item.scene_id]: 'done' }
              }));
            } else if (pollResult.status === 'FAILED' || pollResult.error) {
              setVideoProgress(prev => ({
                ...prev,
                sceneStatuses: { ...prev.sceneStatuses, [item.scene_id]: 'failed' }
              }));
            } else {
              stillPending.push(item);
            }
          } catch (err) {
            console.warn(`Poll error scene ${item.scene_number}:`, err.message);
            stillPending.push(item);
          }
        }

        remaining = stillPending;
        await refetchScenes();

        setVideoProgress(prev => {
          const s = prev.sceneStatuses;
          const done = Object.values(s).filter(v => v === 'done').length;
          const failed = Object.values(s).filter(v => v === 'failed').length;
          return {
            ...prev,
            current: done + failed,
            sceneName: remaining.length > 0
              ? `${done} done · ${remaining.length} still rendering...`
              : `All complete! ${done} videos generated.`
          };
        });
      }

      if (remaining.length > 0 && pollCount >= MAX_POLLS) {
        console.warn(`Polling timed out with ${remaining.length} scenes still pending`);
      }
    }

    await refetchScenes();
    setGeneratingVideos(false);
    setVideoProgress({ current: 0, total: 0, sceneName: '', phase: '', sceneStatuses: {} });
  };

  // ══════════════════════════════════════════════════════════════════
  // RETRY PROMPT GENERATION
  // ══════════════════════════════════════════════════════════════════
  const handleRetryPrompts = async () => {
    setRetryingPrompts(true);
    try {
      let done = false;
      while (!done) {
        try {
          const result = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
          const data = result.data || result;
          done = data.done === true;

          const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
          queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));
          console.log(`Retry prompts: ${freshScenes.filter(s => s.status === 'prompts_ready').length}/${freshScenes.length} ready`);
        } catch (err) {
          const status = err?.response?.status || err?.status;
          if (status === 500 || status === 502 || status === 504) {
            console.log(`Prompt retry error ${status}, retrying in 8s...`);
            await new Promise(r => setTimeout(r, 8000));
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      console.error('Retry prompts failed:', err);
    } finally {
      await refetchScenes();
      setRetryingPrompts(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // ENHANCE ALL
  // ══════════════════════════════════════════════════════════════════
  const handleEnhanceAll = async () => {
    setEnhancingAll(true);
    for (const scene of scenes) {
      try {
        await base44.functions.invoke('enhanceScenePrompts', { scene_id: scene.id, enhance_type: 'both' });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} enhance failed:`, err.message);
      }
      await refetchScenes();
    }
    setEnhancingAll(false);
  };

  // ══════════════════════════════════════════════════════════════════
  // EXPORT ZIP
  // ══════════════════════════════════════════════════════════════════
  const loadJSZip = async () => {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  };

  const getArcLabel = (scene) => {
    try {
      if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
        const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
        const arc = notes.arc_position || notes.phase || '';
        if (arc.includes('cold_open') || arc.includes('setup')) return 'setup';
        if (arc.includes('rising')) return 'rising';
        if (arc.includes('emotional_core') || arc.includes('climax')) return 'climax';
        if (arc.includes('resolution')) return 'resolution';
      }
    } catch (_) {}
    const pos = scene.scene_number / scenes.length;
    if (pos <= 0.15) return 'setup';
    if (pos <= 0.50) return 'rising';
    if (pos <= 0.75) return 'climax';
    return 'resolution';
  };

  // Domains that block CORS — skip direct fetch, go straight to backend proxy
  const corsBlockedDomains = [
    'tempfile.aiquickdraw.com',
    'aiquickdraw.com',
    'kie.ai',
    'api.kie.ai',
  ];

  const isCorsBocked = (url) => {
    try {
      const hostname = new URL(url).hostname;
      return corsBlockedDomains.some(d => hostname.includes(d));
    } catch (_) { return false; }
  };

  const proxyFetch = async (url) => {
    const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url });
    const data = proxyRes.data || proxyRes;
    if (data.success && data.data) {
      const binary = atob(data.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: data.content_type || 'application/octet-stream' });
    }
    return null;
  };

  const fetchAsBlob = async (url) => {
    // Known CORS-blocked domain → skip direct fetch, go straight to proxy
    if (isCorsBocked(url)) {
      try {
        console.log(`📥 Proxy fetching (CORS-blocked): ${url.substring(0, 60)}`);
        return await proxyFetch(url);
      } catch (err) {
        console.warn(`Proxy failed: ${url.substring(0, 60)} — ${err.message}`);
        return null;
      }
    }

    // Method 1: Direct fetch (works for same-origin or CORS-enabled)
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) return await res.blob();
    } catch (_) {}

    // Method 2: Backend proxy fallback
    try {
      console.log(`📥 Proxy fallback: ${url.substring(0, 60)}`);
      return await proxyFetch(url);
    } catch (proxyErr) {
      console.warn(`All fetch methods failed: ${url.substring(0, 60)}`);
    }

    return null;
  };

  const getExtension = (url, fallback) => {
    try {
      const path = new URL(url).pathname;
      const ext = path.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return ext;
      if (['mp4', 'webm', 'mov'].includes(ext)) return ext;
    } catch (_) {}
    return fallback;
  };

  const handleExport = async () => {
    setExporting(true);
    const projectName = (project?.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const folder = zip.folder(`${projectName}_assets`);

      // Count total assets
      const totalAssets = scenes.reduce((sum, s) => {
        let count = 0;
        if (s.image_url && s.image_url.startsWith('http')) count++;
        if (s.video_url && !s.video_url.startsWith('veo_task:') && !s.video_url.startsWith('grok_vid_task:') && s.video_url.startsWith('http')) count++;
        return sum + count;
      }, 0);

      setExportProgress({ current: 0, total: totalAssets, label: 'Preparing...' });
      let downloaded = 0;

      // Adaptive padding
      const padWidth = scenes.length > 999 ? 4 : scenes.length > 99 ? 3 : 2;

      for (const scene of scenes) {
        const num = String(scene.scene_number).padStart(padWidth, '0');
        const arc = getArcLabel(scene);
        const prefix = `S${num}_${arc}`;

        // Download image
        if (scene.image_url && scene.image_url.startsWith('http')) {
          setExportProgress({ current: downloaded, total: totalAssets, label: `${prefix}_image` });
          const ext = getExtension(scene.image_url, 'png');
          const blob = await fetchAsBlob(scene.image_url);
          if (blob) folder.file(`${prefix}_image.${ext}`, blob);
          downloaded++;
        }

        // Download video
        if (scene.video_url && !scene.video_url.startsWith('veo_task:') && !scene.video_url.startsWith('grok_vid_task:') && scene.video_url.startsWith('http')) {
          setExportProgress({ current: downloaded, total: totalAssets, label: `${prefix}_video` });
          const ext = getExtension(scene.video_url, 'mp4');
          const blob = await fetchAsBlob(scene.video_url);
          if (blob) folder.file(`${prefix}_video.${ext}`, blob);
          downloaded++;
        }
      }

      // ── Audio assets ──────────────────────────────────────────
      const audioAssets = [];
      const audioFields = [
        'voiceover_url', 'narration_url', 'voiceover_audio_url', 'audio_url',
        'elevenlabs_voiceover_url', 'elevenlabs_audio_url',
        'music_url', 'background_music_url', 'music_audio_url',
        'sfx_url', 'sound_effects_url', 'effects_url',
        'mixed_audio_url', 'final_audio_url'
      ];

      // Scan project fields
      for (const field of audioFields) {
        const url = project?.[field];
        if (url && typeof url === 'string' && url.startsWith('http')) {
          const label = field.replace(/_url$/, '').replace(/_/g, '-');
          audioAssets.push({ label, url });
        }
      }

      // Scan MusicTracks entity
      try {
        const mt = await base44.entities.MusicTracks?.filter({ project_id: projectId });
        if (mt?.length > 0) {
          mt.forEach((track, i) => {
            if (track.audio_url && track.audio_url.startsWith('http') && !audioAssets.find(a => a.url === track.audio_url)) {
              const label = track.is_selected ? 'background-music-selected' : `music-track-${i + 1}`;
              audioAssets.push({ label, url: track.audio_url });
            }
          });
        }
      } catch (_) {}

      // Scan ProductionSettings entity
      try {
        const prodSettings = await base44.entities.ProductionSettings?.filter({ project_id: projectId });
        if (prodSettings?.length > 0) {
          const ps = prodSettings[0];
          for (const field of audioFields) {
            const url = ps?.[field];
            if (url && typeof url === 'string' && url.startsWith('http') && !audioAssets.find(a => a.url === url)) {
              const label = `ps-${field.replace(/_url$/, '').replace(/_/g, '-')}`;
              audioAssets.push({ label, url });
            }
          }
          if (ps.voiceover_parts) {
            try {
              const parts = JSON.parse(ps.voiceover_parts);
              if (Array.isArray(parts)) {
                parts.forEach((partUrl, i) => {
                  if (partUrl && partUrl.startsWith('http')) {
                    audioAssets.push({ label: `voiceover-part-${i + 1}`, url: partUrl });
                  }
                });
              }
            } catch (_) {}
          }
        }
      } catch (_) {
        console.log('No ProductionSettings entity or no records found');
      }

      if (audioAssets.length > 0) {
        const audioFolder = folder.folder('audio');
        for (const asset of audioAssets) {
          setExportProgress({ current: downloaded, total: totalAssets + audioAssets.length, label: `Audio: ${asset.label}` });
          const blob = await fetchAsBlob(asset.url);
          if (blob) {
            const ext = asset.url.includes('.wav') ? 'wav' : 'mp3';
            audioFolder.file(`${asset.label}.${ext}`, blob);
          }
          downloaded++;
        }
      }

      // ── Manifest ──────────────────────────────────────────────
      const manifest = scenes.map(s => ({
        scene_number: s.scene_number,
        arc_position: getArcLabel(s),
        narration: s.narration_text,
        duration: s.duration_seconds,
        image_file: s.image_url && s.image_url.startsWith('http')
          ? `S${String(s.scene_number).padStart(padWidth, '0')}_${getArcLabel(s)}_image.${getExtension(s.image_url, 'png')}`
          : null,
        video_file: (s.video_url && !s.video_url.startsWith('veo_task:') && !s.video_url.startsWith('grok_vid_task:') && s.video_url.startsWith('http'))
          ? `S${String(s.scene_number).padStart(padWidth, '0')}_${getArcLabel(s)}_video.${getExtension(s.video_url, 'mp4')}`
          : null,
      }));
      folder.file('manifest.json', JSON.stringify(manifest, null, 2));

      // ── Generate zip ──────────────────────────────────────────
      setExportProgress({ current: totalAssets, total: totalAssets, label: 'Compressing zip...' });
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        setExportProgress(prev => ({ ...prev, label: `Compressing... ${Math.round(meta.percent)}%` }));
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}_assets.zip`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export failed:', err);
      const exportData = scenes.map(s => ({
        scene_number: s.scene_number,
        arc_position: getArcLabel(s),
        narration: s.narration_text,
        image_url: s.image_url,
        video_url: s.video_url,
        duration: s.duration_seconds,
      }));
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'scenes'}-content.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
      setExportProgress({ current: 0, total: 0, label: '' });
    }
  };

  const handleContinueToTimeline = () => {
    navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`));
  };

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const latestScript = scripts.find(s => s.version === 'final_aggregated') || null;

  // ── Computed counts ───────────────────────────────────────────
  const imageCount = scenes.filter(s => s.image_url).length;
  const videoCount = scenes.filter(s => s.video_url && s.video_url.startsWith('http') && !s.video_url.startsWith('http://placeholder')).length;
  const animatingCount = scenes.filter(s => s.video_url?.startsWith('grok_vid_task:') || s.video_url?.startsWith('veo_task:') || s.status === 'pending').length;
  const breakdownReadyCount = scenes.filter(s => s.status === 'breakdown_ready').length;
  const promptsReadyCount = scenes.filter(s => s.status === 'prompts_ready').length;
  const directorNotesCount = scenes.filter(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:')).length;

  const videoStatusCounts = videoProgress.sceneStatuses
    ? {
        queued: Object.values(videoProgress.sceneStatuses).filter(s => s === 'queued').length,
        submitting: Object.values(videoProgress.sceneStatuses).filter(s => s === 'submitting').length,
        polling: Object.values(videoProgress.sceneStatuses).filter(s => s === 'polling').length,
        done: Object.values(videoProgress.sceneStatuses).filter(s => s === 'done').length,
        failed: Object.values(videoProgress.sceneStatuses).filter(s => s === 'failed').length,
      }
    : { queued: 0, submitting: 0, polling: 0, done: 0, failed: 0 };

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={2} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Content Generation</h1>
          <div className="flex gap-2">
            {scenes.length > 0 && (
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {exportProgress.total > 0 ? `${exportProgress.current}/${exportProgress.total}` : 'Preparing...'}
                  </>
                ) : (
                  <><FolderDown className="w-4 h-4 mr-1" /> Export Zip</>
                )}
              </Button>
            )}
            {scenes.length > 0 && imageCount > 0 && (
              <Button onClick={handleContinueToTimeline} className="bg-blue-600 hover:bg-blue-700 gap-2">
                Next: Timeline <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-gray-600 mb-8">Import your script, generate scene images and animations</p>

        {/* Orientation Selector */}
        {project && (
          <div className="bg-white p-5 rounded-lg shadow-sm border mb-6">
            <OrientationSelector
              selectedOrientation={project.orientation || 'landscape'}
              onSelect={async (orientation) => {
                await base44.entities.Projects.update(projectId, { orientation });
                refetchProject();
              }}
            />
          </div>
        )}

        {/* Visual Style Selector */}
        {project && (
          <div className="bg-white p-5 rounded-lg shadow-sm border mb-6">
            <VisualStyleSelector
              selectedStyle={project.visual_style}
              onSelect={async (style) => {
                await base44.entities.Projects.update(projectId, { visual_style: style });
                refetchProject();
              }}
            />
          </div>
        )}

        {/* Import Progress */}
        <ProcessingNotifier
          active={importing}
          phase={importPhase}
          progressText={importProgress}
          scenesCreated={scenes.length}
          totalExpected={totalExpectedScenes}
          breakdownReady={breakdownReadyCount}
          promptsReady={promptsReadyCount}
          wordCount={estimatedWordCount}
        />

        {/* Image Generation Progress */}
        {generatingImages && imageProgress.total > 0 && (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                    <ImageIcon className="w-3 h-3 mr-1" /> Generating Images
                  </Badge>
                  <span className="text-xs font-medium text-emerald-700">
                    {imageProgress.current} / {imageProgress.total}
                  </span>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-2 mt-2">
                  <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{imageProgress.sceneName} · Grok Imagine via Kie</p>
              </div>
            </div>
          </div>
        )}

        {/* Video Generation Progress */}
        {generatingVideos && videoProgress.total > 0 && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-violet-100 text-violet-800 text-xs">
                    <Video className="w-3 h-3 mr-1" />
                    {videoProgress.phase === 'submitting' ? 'Submitting to Grok Imagine' : 'Rendering with Grok · 480p'}
                  </Badge>
                </div>
                <div className="w-full bg-violet-100 rounded-full h-2 mb-3">
                  <div className="bg-violet-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${((videoStatusCounts.done + videoStatusCounts.failed) / videoProgress.total) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(videoProgress.sceneStatuses).map(([sceneId, status]) => {
                    const scene = scenes.find(s => s.id === sceneId);
                    const num = scene?.scene_number || '?';
                    const colors = {
                      done: 'bg-green-100 text-green-700',
                      failed: 'bg-red-100 text-red-700',
                      polling: 'bg-amber-100 text-amber-700',
                      submitting: 'bg-blue-100 text-blue-700',
                      queued: 'bg-gray-100 text-gray-500',
                    };
                    const icons = {
                      done: <CheckCircle2 className="w-3 h-3" />,
                      failed: <XCircle className="w-3 h-3" />,
                      polling: <Clock className="w-3 h-3 animate-pulse" />,
                      submitting: <Zap className="w-3 h-3" />,
                      queued: <Clock className="w-3 h-3 opacity-40" />,
                    };
                    return (
                      <span key={sceneId} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
                        {icons[status]} S{num}
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {videoStatusCounts.done > 0 && `${videoStatusCounts.done} complete`}
                  {videoStatusCounts.polling > 0 && ` · ${videoStatusCounts.polling} rendering`}
                  {videoStatusCounts.queued > 0 && ` · ${videoStatusCounts.queued} queued`}
                  {videoStatusCounts.failed > 0 && ` · ${videoStatusCounts.failed} failed`}
                  {videoProgress.phase === 'polling' && ' · Polling every 15s'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Export Progress */}
        {exporting && exportProgress.total > 0 && (
          <div className="bg-gradient-to-r from-sky-50 to-cyan-50 border border-sky-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-sky-100 text-sky-800 text-xs">
                    <FolderDown className="w-3 h-3 mr-1" /> Exporting Assets
                  </Badge>
                  <span className="text-xs font-medium text-sky-700">
                    {exportProgress.current} / {exportProgress.total}
                  </span>
                </div>
                <div className="w-full bg-sky-100 rounded-full h-2 mt-2">
                  <div className="bg-sky-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{exportProgress.label}</p>
              </div>
            </div>
          </div>
        )}

        {/* Director Notes Warning */}
        {!importing && directorNotesCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Wand2 className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  {directorNotesCount} scene{directorNotesCount > 1 ? 's have' : ' has'} director notes that need converting to image prompts
                </p>
                <p className="text-xs text-amber-600 mt-1">Click below to generate visual prompts before creating images.</p>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={async () => {
                  setImporting(true);
                  setImportPhase('prompts');
                  setImportProgress('Converting director notes into visual prompts...');
                  try {
                    await invokeWithTimeout('generateScenePrompts', { project_id: projectId });
                    await pollForCompletion(async () => {
                      const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
                      queryClient.setQueryData(['scenes', projectId], freshScenes.sort((a, b) => a.scene_number - b.scene_number));
                      const pending = freshScenes.filter(s => s.status === 'breakdown_ready');
                      const ready = freshScenes.filter(s => s.status === 'prompts_ready');
                      setImportProgress(`Converting prompts... ${ready.length}/${freshScenes.length} ready`);
                      return pending.length === 0 && ready.length > 0;
                    }, 360, 5000);
                    await refetchScenes();
                  } catch (err) {
                    console.error('Prompt generation failed:', err);
                  }
                  setImporting(false);
                  setImportPhase('');
                  setImportProgress('');
                }}
              >
                <Wand2 className="w-4 h-4 mr-1" /> Generate Prompts
              </Button>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex flex-wrap items-center gap-3">
          {scenes.length === 0 && !importing ? (
            <>
              <Button
                onClick={handleImport}
                disabled={importing || !project?.visual_style || !project?.orientation}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Import className="w-4 h-4 mr-2" /> Import Script & Generate Scenes
              </Button>
              {(!project?.visual_style || !project?.orientation) && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <Palette className="w-4 h-4" /> Please select orientation and visual style above first
                </p>
              )}
            </>
          ) : scenes.length > 0 ? (
            <>
              {project?.orientation && (
                <Badge className="bg-blue-100 text-blue-800 text-xs">
                  <Monitor className="w-3 h-3 mr-1" />
                  {project.orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'}
                </Badge>
              )}
              {project?.visual_style && (
                <Badge className="bg-purple-100 text-purple-800 text-xs">
                  <Palette className="w-3 h-3 mr-1" />
                  {project.visual_style.replace(/_/g, ' ')}
                </Badge>
              )}
              <div className="flex items-center gap-2 text-sm font-medium">
                <Layers className="w-4 h-4 text-blue-600" /> {scenes.length} scenes
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon className="w-4 h-4 text-green-600" /> {imageCount}/{scenes.length} images
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Film className="w-4 h-4 text-purple-600" /> {videoCount}/{scenes.length} videos
                {animatingCount > 0 && (
                  <span className="text-xs text-amber-600 font-medium">({animatingCount} rendering)</span>
                )}
              </div>
              <div className="flex-1" />

              {breakdownReadyCount > 0 && (
                <Button onClick={handleRetryPrompts} disabled={retryingPrompts} variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-50">
                  {retryingPrompts ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wand2 className="w-4 h-4 mr-1" />}
                  {retryingPrompts ? `Generating Prompts... (${breakdownReadyCount} left)` : `Generate Prompts (${breakdownReadyCount})`}
                </Button>
              )}

              <Button onClick={handleEnhanceAll} disabled={enhancingAll} variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">
                {enhancingAll ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                {enhancingAll ? 'Enhancing...' : 'AI Enhance All'}
              </Button>

              <FixPromptsButton
                projectId={projectId}
                sceneCount={scenes.filter(s => s.status === 'prompts_ready' || s.status === 'image_generated').length}
                onComplete={async () => { await refetchScenes(); }}
              />

<DedupButton
  projectId={projectId}
  sceneCount={scenes.length}
  onComplete={() => refetchScenes()}
/>

              <Button onClick={handleGenerateImages} disabled={generatingImages} variant="outline">
                {generatingImages ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ImageIcon className="w-4 h-4 mr-1" />}
                {generatingImages ? 'Generating...' : 'Generate All Images'}
              </Button>

              <Button onClick={handleGenerateVideos} disabled={generatingVideos || imageCount === 0} variant="outline">
                {generatingVideos ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Film className="w-4 h-4 mr-1" />}
                {generatingVideos ? 'Animating...' : 'Animate All Scenes'}
              </Button>
            </>
          ) : null}
        </div>



        {/* Scene Grid */}
        {scenes.length > 0 && (
          <div className="mb-8">
            <SceneGrid scenes={scenes} onRefetch={refetchScenes} />
          </div>
        )}

        {/* Audio Section */}
        {project && (
          <div className="mb-8 space-y-4">
            {latestScript && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VoiceoverPanel project={project} script={latestScript} onUpdate={() => refetchProject()} />
                <ElevenLabsVoiceoverPanel project={project} script={latestScript} onUpdate={() => refetchProject()} />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MusicPanel project={project} />
              <AudioMixerPanel
                narrationVolume={audioLevels.narration}
                musicVolume={audioLevels.music}
                sfxVolume={audioLevels.sfx}
                onChange={(update) => setAudioLevels(prev => ({ ...prev, ...update }))}
              />
            </div>
            <AudioAssetsPanel project={project} />
          </div>
        )}
      </div>
    </div>
  );
}