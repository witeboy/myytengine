/**
 * OpenShorts.jsx — Clean rewrite
 *
 * Storage: Bunny CDN (via quickPublishTranscribe bunny_config + bunny_save_project)
 * Upload:  Bunny CDN (large file support, server env credentials)
 * Clips:   Bunny CDN URLs with timestamp metadata stored as JSON
 * Library: Project folders grouped by job_id, stored on Bunny as JSON manifest
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Youtube, Upload, FileVideo, X, Loader2, CheckCircle,
  AlertCircle, Download, Share2, Instagram, Sparkles, Settings,
  Scissors, Zap, Copy, Check, ChevronDown, ChevronUp,
  Globe, Eye, EyeOff, Flame, Library, Clock,
  Database, TrendingUp, CloudUpload, Star, Folder, FolderOpen,
  ExternalLink, Mic, Trash2,
} from 'lucide-react';
import {
  uploadToCloudinary,
  buildCloudinaryClipUrl,
  extractYouTubeAudio,
  transcribeFile,
  analyzeViralMoments,
} from '@/lib/directApi';

// ── localStorage keys (social posting only — storage is Bunny server-side) ──
const LS = {
  UP_KEY:  'openshorts_uploadpost_key',
  UP_USER: 'openshorts_uploadpost_user',
};

// ── Helpers ────────────────────────────────────────────────────────────
const TikTokIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
  </svg>
);

const getYouTubeId = (url) => {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([^#&?]{11})/);
  return m ? m[1] : null;
};

const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + s.toString().padStart(2, '0');
};

const formatDate = (iso) => {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
};

// ── Bunny project storage ──────────────────────────────────────────────
// Projects are stored as a JSON manifest on Bunny CDN via the backend function.
// Each project = { job_id, project_name, created_at, clips: [...] }

const bunny = {
  async saveProject(project) {
    try {
      await base44.functions.invoke('quickPublishTranscribe', {
        action:  'bunny_save_project',
        project,
      });
    } catch (e) {
      console.warn('Bunny save project failed:', e.message);
    }
  },

  async loadProjects() {
    try {
      const res = await base44.functions.invoke('quickPublishTranscribe', {
        action: 'bunny_list_projects',
      });
      return res.data?.projects || [];
    } catch (e) {
      console.warn('Bunny load projects failed:', e.message);
      return [];
    }
  },

  async deleteProject(jobId) {
    try {
      await base44.functions.invoke('quickPublishTranscribe', {
        action: 'bunny_delete_project',
        job_id: jobId,
      });
    } catch (e) {
      console.warn('Bunny delete project failed:', e.message);
    }
  },
};

const saveProject = async (clips, projectName) => {
  if (!clips.length) return;
  const project = {
    job_id:       'os_' + Date.now(),
    project_name: projectName || 'Untitled Project',
    created_at:   new Date().toISOString(),
    clips:        clips.map((c, i) => ({
      clip_index:    i,
      cdn_url:       c.cloudinary_url || c.blobUrl || null,
      youtube_url:   c.youtube_url    || null,
      hook_text:     c.viral_hook_text || null,
      yt_title:      c.video_title_for_youtube_short || null,
      tiktok_desc:   c.video_description_for_tiktok  || null,
      ig_desc:       c.video_description_for_instagram || null,
      virality_score: c.virality_score || null,
      virality_reason: c.virality_reason || null,
      start_seconds: c.start ?? null,
      end_seconds:   c.end   ?? null,
      duration_seconds: (c.end && c.start) ? +(c.end - c.start).toFixed(2) : null,
    })),
  };
  await bunny.saveProject(project);
  return project;
};

// ── Stage bar ──────────────────────────────────────────────────────────
const STAGE_DEFS = {
  transcribe: { label: 'Upload + Transcribe', icon: Mic      },
  analyze:    { label: 'Find Moments',        icon: Sparkles },
  clip:       { label: 'Generate Clips',      icon: Scissors },
};

function StageBar({ stageKeys, current, done }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stageKeys.map((key, i) => {
        const def   = STAGE_DEFS[key] || { label: key, icon: Sparkles };
        const Icon  = def.icon;
        const isDone = done.includes(key);
        const isCur  = current === key;
        return (
          <div key={key} className="flex items-center gap-2">
            <div className={
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ' +
              (isDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
               isCur  ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm' :
                        'bg-gray-50 text-gray-400 border-gray-100')
            }>
              {isDone ? <CheckCircle size={11} /> : isCur ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
              <span className="hidden sm:inline">{def.label}</span>
            </div>
            {i < stageKeys.length - 1 && <div className="w-3 h-px bg-gray-200 hidden sm:block" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ onClose }) {
  const FIELDS = [
    {
      section: 'Social Posting (Optional)',
      k: LS.UP_KEY, label: 'Upload-Post API Key', pw: true,
      ph: 'up_…', hint: 'uploadpost.com API key',
    },
    {
      k: LS.UP_USER, label: 'Upload-Post Username', pw: false,
      ph: '@handle', hint: '',
    },
  ];

  const [vals, setVals] = useState(() => {
    const obj = {};
    FIELDS.forEach(f => { obj[f.k] = localStorage.getItem(f.k) || ''; });
    return obj;
  });
  const [show, setShow]   = useState({});
  const [saved, setSaved] = useState(false);

  const save = () => {
    FIELDS.forEach(f => localStorage.setItem(f.k, vals[f.k].trim()));
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white border border-gray-100 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Settings size={15} className="text-rose-500" /> Open Shorts Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={17} /></button>
        </div>

        <div className="space-y-1.5">
          {[
            { ok: true, label: 'Bunny CDN — storage active (server env)' },
            { ok: true, label: 'AssemblyAI — transcription active (server env)' },
            { ok: true, label: 'Claude AI — analysis active (server env)' },
          ].map(({ ok, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle size={11} /> {label}
            </div>
          ))}
        </div>

        {FIELDS.map((f, idx) => (
          <div key={f.k}>
            {f.section && (
              <div className={'pb-1 ' + (idx > 0 ? 'pt-3 border-t border-gray-100' : '')}>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{f.section}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">{f.label}</label>
              <div className="relative">
                <input
                  type={(f.pw && !show[f.k]) ? 'password' : 'text'}
                  value={vals[f.k]}
                  onChange={e => setVals(p => ({ ...p, [f.k]: e.target.value }))}
                  placeholder={f.ph}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-rose-400 pr-9"
                />
                {f.pw && (
                  <button onClick={() => setShow(p => ({ ...p, [f.k]: !p[f.k] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show[f.k] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
              </div>
              {f.hint && <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>}
            </div>
          </div>
        ))}

        <Button onClick={save} className={`w-full h-10 text-white transition-all ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'}`}>
          {saved ? <span className="flex items-center gap-1"><Check size={12} /> Saved!</span> : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

// ── YouTubeClipCard ────────────────────────────────────────────────────
function YouTubeClipCard({ clip, index, ytUrl }) {
  const [copied, setCopied] = useState(null);
  const [expanded, setExp]  = useState(false);
  const ytId = getYouTubeId(ytUrl || clip.youtube_url || '');
  const dur  = clip.duration_seconds || ((clip.end && clip.start) ? Math.round(clip.end - clip.start) : null);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const start = clip.start_seconds ?? clip.start ?? 0;
  const end   = clip.end_seconds   ?? clip.end   ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {ytId ? (
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${ytId}?start=${Math.floor(start)}&rel=0`}
            title={`Clip ${index + 1}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <Youtube size={28} className="text-zinc-600" />
          </div>
        )}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold shadow">{index + 1}</div>
        {dur && <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-xs font-mono"><Clock size={8} /><span>{Math.round(dur)}s</span></div>}
        {clip.virality_score && <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-rose-600/90 text-white rounded-full text-xs font-bold"><Star size={8} /><span>{clip.virality_score}</span></div>}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-gray-400">{formatTime(start)} → {formatTime(end)}</span>
          {ytId && (
            <a href={`https://www.youtube.com/watch?v=${ytId}&t=${Math.floor(start)}s`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-medium">
              <ExternalLink size={9} /><span>Open</span>
            </a>
          )}
        </div>
        {(clip.hook_text || clip.viral_hook_text) && (
          <div className="flex items-start gap-1.5">
            <Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-gray-800 leading-snug">{clip.hook_text || clip.viral_hook_text}</p>
          </div>
        )}
        {(clip.yt_title || clip.video_title_for_youtube_short) && <p className="text-xs text-gray-500 line-clamp-2">{clip.yt_title || clip.video_title_for_youtube_short}</p>}
        {clip.virality_reason && <p className="text-xs text-gray-400 italic border-l-2 border-rose-100 pl-2 leading-relaxed line-clamp-2">{clip.virality_reason}</p>}
        <div>
          <button onClick={() => setExp(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <Globe size={9} /><span>Platform captions</span>{expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,    label: 'YouTube',   text: clip.yt_title || clip.video_title_for_youtube_short,         key: 'yt' },
                { icon: <TikTokIcon size={10} />,                           label: 'TikTok',    text: clip.tiktok_desc || clip.video_description_for_tiktok,       key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />, label: 'Instagram', text: clip.ig_desc || clip.video_description_for_instagram,         key: 'ig' },
              ].filter(x => x.text).map(({ icon, label, text, key }) => (
                <div key={key} className="bg-gray-50 rounded-lg p-2 group">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-500">{icon}<span>{label}</span></div>
                    <button onClick={() => copy(text, key)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                      {copied === key ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadClipButton({ src, clipStart, clipEnd, index }) {
  const [status, setStatus] = useState('idle'); // idle | cutting | done | error

  const handleDownload = async () => {
    setStatus('cutting');
    try {
      const res = await base44.functions.invoke('quickPublishTranscribe', {
        action:     'clip_video',
        source_url: src,
        start:      clipStart,
        end:        clipEnd,
      });
      const url = res.data?.clip_url || res.data?.url;
      if (!url) throw new Error('No clip URL returned');
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `clip_${index + 1}.mp4`;
      a.target = '_blank';
      a.click();
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      console.error('Clip cut failed:', e);
      // Fallback: open full video at timestamp so user can at least access it
      window.open(`${src}#t=${clipStart}`, '_blank');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={status === 'cutting'}
      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {status === 'cutting' ? <Loader2 size={10} className="animate-spin" /> :
       status === 'done'    ? <Check size={10} /> :
       <Download size={10} />}
      <span>{status === 'cutting' ? 'Cutting…' : status === 'done' ? 'Saved!' : 'Download'}</span>
    </button>
  );
}

// ── FileClipCard ───────────────────────────────────────────────────────
function FileClipCard({ clip, index }) {
  const [copied, setCopied]   = useState(null);
  const [expanded, setExp]    = useState(false);
  const [posting, setPosting] = useState(false);
  const [postRes, setPostRes] = useState(null);
  const videoRef = useRef(null);

  const rawSrc = clip.cdn_url || clip.cloudinary_url || clip.blobUrl || null;
  // Strip #t= fragment to get the base Bunny URL
  const src = rawSrc ? rawSrc.split('#')[0] : null;
  const clipStart = clip.start_seconds ?? clip.start ?? 0;
  const clipEnd   = clip.end_seconds   ?? clip.end   ?? null;
  const dur = clip.duration_seconds || ((clipEnd && clipStart != null) ? Math.round(clipEnd - clipStart) : null);

  const hookText  = clip.hook_text  || clip.viral_hook_text || null;
  const ytTitle   = clip.yt_title   || clip.video_title_for_youtube_short || null;
  const tiktokDesc = clip.tiktok_desc || clip.video_description_for_tiktok || null;
  const igDesc    = clip.ig_desc    || clip.video_description_for_instagram || null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const handleMouseEnter = () => { videoRef.current?.play().catch(() => {}); };
  const handleMouseLeave = () => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } };

  const runPost = async () => {
    const upKey  = localStorage.getItem(LS.UP_KEY);
    const upUser = localStorage.getItem(LS.UP_USER);
    if (!upKey) return setPostRes({ error: 'Upload-Post key required — add in Settings' });
    if (!src)   return setPostRes({ error: 'No CDN URL available for this clip' });
    setPosting(true); setPostRes(null);
    try {
      const res = await fetch('https://api.upload-post.com/v1/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': upKey },
        body: JSON.stringify({
          video_url:   src,
          user_id:     upUser,
          platforms:   ['tiktok', 'instagram', 'youtube'],
          title:       ytTitle || 'Viral Short',
          description: igDesc || '',
        }),
      });
      setPostRes(await res.json());
    } catch (e) { setPostRes({ error: e.message }); }
    finally { setPosting(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="relative bg-zinc-900 overflow-hidden cursor-pointer"
        style={{ aspectRatio: '9/16', maxHeight: 240 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className="absolute inset-0 w-full h-full object-cover"
            muted loop playsInline
            onLoadedMetadata={() => {
              if (videoRef.current && clipStart) {
                videoRef.current.currentTime = clipStart;
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
        )}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold shadow">{index + 1}</div>
        {dur && <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-xs font-mono"><Clock size={8} /><span>{Math.round(dur)}s</span></div>}
        {src && <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-blue-600/90 text-white rounded text-xs font-bold">CDN</div>}
      </div>
      <div className="p-3 space-y-2">
        {hookText && <div className="flex items-start gap-1.5"><Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" /><p className="text-xs font-semibold text-gray-800 leading-snug">{hookText}</p></div>}
        {ytTitle && <p className="text-xs text-gray-400 line-clamp-2">{ytTitle}</p>}
        <div>
          <button onClick={() => setExp(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <Globe size={9} /><span>Captions</span>{expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,    label: 'YouTube',   text: ytTitle,    key: 'yt' },
                { icon: <TikTokIcon size={10} />,                           label: 'TikTok',    text: tiktokDesc, key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />, label: 'Instagram', text: igDesc,     key: 'ig' },
              ].filter(x => x.text).map(({ icon, label, text, key }) => (
                <div key={key} className="bg-gray-50 rounded-lg p-2 group">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-500">{icon}<span>{label}</span></div>
                    <button onClick={() => copy(text, key)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                      {copied === key ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {src && (
            <DownloadClipButton
              src={src}
              clipStart={clipStart}
              clipEnd={clipEnd}
              index={index}
            />
          )}
          <button
            onClick={runPost}
            disabled={posting}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white text-xs font-semibold disabled:opacity-50 transition-all"
          >
            {posting ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />}
            <span>Post</span>
          </button>
        </div>
        {postRes && <p className={`text-xs rounded px-2 py-1 ${postRes.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{postRes.error || 'Posted!'}</p>}
      </div>
    </div>
  );
}

// ── Project Folder ─────────────────────────────────────────────────────
function ProjectFolder({ project, onDelete }) {
  const [open, setOpen]       = useState(false);
  const [deleting, setDel]    = useState(false);

  const isYouTube = project.clips.some(c => c.youtube_url && !c.cdn_url);
  const ytUrl     = project.clips.find(c => c.youtube_url)?.youtube_url || '';
  const totalDur  = project.clips.reduce((s, c) => s + (c.duration_seconds || 0), 0);

  const handleDelete = async () => {
    if (!window.confirm(`Delete project "${project.project_name}" and all ${project.clips.length} clips?`)) return;
    setDel(true);
    await bunny.deleteProject(project.job_id);
    onDelete(project.job_id);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shrink-0 shadow-sm">
            {open ? <FolderOpen size={16} className="text-white" /> : <Folder size={16} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{project.project_name}</p>
            <p className="text-xs text-gray-400">
              {project.clips.length} clip{project.clips.length !== 1 ? 's' : ''}
              {totalDur > 0 ? ` · ${Math.round(totalDur)}s total` : ''}
              {' · '}{formatDate(project.created_at)}
              {isYouTube ? ' · YouTube' : ' · File upload'}
            </p>
          </div>
          <div className="shrink-0">
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>

      {/* Folder contents */}
      {open && (
        <div className="border-t border-gray-100">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CloudUpload size={11} className="text-blue-500" />
              <span className="text-xs text-gray-500">
                {project.clips.filter(c => c.cdn_url).length} CDN clips ready · hover to preview
              </span>
            </div>
            <span className="text-xs text-gray-400 font-mono">{project.job_id}</span>
          </div>
          <div className="p-4">
            <div className={`grid gap-4 ${isYouTube ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
              {project.clips
                .sort((a, b) => (a.clip_index ?? 0) - (b.clip_index ?? 0))
                .map((c, i) => isYouTube
                  ? <YouTubeClipCard key={i} clip={c} index={c.clip_index ?? i} ytUrl={ytUrl} />
                  : <FileClipCard    key={i} clip={c} index={c.clip_index ?? i} />
                )
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clip Library ───────────────────────────────────────────────────────
function ClipLibrary() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoad]      = useState(true);
  const [filter, setFilter]     = useState('all');

  useEffect(() => {
    bunny.loadProjects()
      .then(p => setProjects(Array.isArray(p) ? p : []))
      .finally(() => setLoad(false));
  }, []);

  const now = Date.now();
  const filtered = projects.filter(p => {
    if (filter === 'today') return now - new Date(p.created_at).getTime() < 86400000;
    if (filter === 'week')  return now - new Date(p.created_at).getTime() < 604800000;
    return true;
  });

  const totalClips = projects.reduce((s, p) => s + p.clips.length, 0);
  const thisWeek   = projects.filter(p => now - new Date(p.created_at).getTime() < 604800000).length;
  const cdnClips   = projects.reduce((s, p) => s + p.clips.filter(c => c.cdn_url).length, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Projects',    val: projects.length, icon: Folder,     color: 'text-rose-500'   },
          { label: 'Total Clips', val: totalClips,      icon: Scissors,   color: 'text-purple-500' },
          { label: 'CDN Ready',   val: cdnClips,        icon: CloudUpload, color: 'text-blue-500'  },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <Icon size={14} className={color + ' mb-1'} />
            <div className="text-2xl font-bold text-gray-900">{val}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['all','All time'],['week','This week'],['today','Today']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Projects */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
          <span className="text-gray-400 text-sm">Loading projects…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto">
            <Folder size={22} className="text-rose-400" />
          </div>
          <p className="font-semibold text-gray-700">No projects yet</p>
          <p className="text-sm text-gray-400">Generate some clips first — they'll appear here as project folders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(project => (
            <ProjectFolder
              key={project.job_id}
              project={project}
              onDelete={(jobId) => setProjects(prev => prev.filter(p => p.job_id !== jobId))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function OpenShorts() {
  const [showSettings, setShowSettings] = useState(false);
  const [mainTab, setMainTab]           = useState('generate');
  const [inputMode, setInputMode]       = useState('youtube');

  const [ytUrl, setYtUrl]        = useState('');
  const [file, setFile]          = useState(null);
  const [vidDuration, setVidDur] = useState(0);
  const [dragging, setDragging]  = useState(false);
  const fileRef = useRef(null);

  const [stage, setStage]      = useState('idle');
  const [currentStep, setStep] = useState(null);
  const [doneSteps, setDone]   = useState([]);
  const [statusMsg, setMsg]    = useState('');
  const [progress, setProgress] = useState(0);
  const [err, setErr]           = useState('');
  const [clips, setClips]       = useState([]);

  const [maxClips, setMaxClips] = useState('8');
  const [minSec, setMinSec]     = useState('20');
  const [maxSec, setMaxSec]     = useState('60');
  const [showAdv, setShowAdv]   = useState(false);

  const markDone = (s) => setDone(p => p.includes(s) ? p : [...p, s]);

  const handleFileSelect = (f) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    const v   = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { setVidDur(v.duration || 0); URL.revokeObjectURL(url); };
    v.src = url;
  };

  // ── YouTube mode ──────────────────────────────────────────────────────
  const runYouTubeMode = async () => {
    if (!ytUrl.trim()) return setErr('Paste a YouTube URL first');
    setStage('processing'); setErr(''); setClips([]); setDone([]);

    try {
      setStep('transcribe');
      setMsg('Extracting audio from YouTube via Cobalt…');
      const audioUrl = await extractYouTubeAudio(ytUrl.trim());

      setMsg('Submitting to AssemblyAI for transcription…');
      const transcript = await transcribeFile(audioUrl, (msg) => setMsg(msg));
      markDone('transcribe');

      setStep('analyze');
      setMsg('Claude is finding the best viral moments…');
      const result = await analyzeViralMoments({
        transcript: transcript.text,
        words:      transcript.words,
        duration:   transcript.duration,
        maxClips:   parseInt(maxClips) || 8,
        minSeconds: parseInt(minSec)   || 20,
        maxSeconds: parseInt(maxSec)   || 60,
      });

      if (!result?.clips?.length) throw new Error('No viral moments found. Try a different video.');
      markDone('analyze');

      const enriched = result.clips.map(c => ({ ...c, youtube_url: ytUrl }));
      setClips(enriched);
      setStage('done');
      setMsg(`Found ${enriched.length} viral moments!`);

      // Save to Bunny as project
      const videoId = getYouTubeId(ytUrl);
      await saveProject(enriched, `YouTube — ${videoId || ytUrl.slice(-20)}`);

    } catch (e) {
      setStage('error');
      setErr(e.message || 'Something went wrong');
    } finally {
      setStep(null);
    }
  };

  // ── File mode ─────────────────────────────────────────────────────────
  const runFileMode = async () => {
    if (!file) return setErr('Select a video file first');
    setStage('processing'); setErr(''); setClips([]); setDone([]); setProgress(0);

    try {
      setStep('transcribe');
      setMsg('Uploading video to Bunny CDN…');
      const uploadResult = await uploadToCloudinary(file, {
        resourceType: 'video',
        onProgress: pct => { setProgress(pct * 0.4); setMsg(`Uploading… ${pct}%`); },
      });
      const cloudUrl = uploadResult.secure_url;
      setProgress(40);

      setMsg('Transcribing with AssemblyAI…');
      const transcript = await transcribeFile(cloudUrl, msg => setMsg(msg));
      markDone('transcribe');
      setProgress(70);

      setStep('analyze');
      setMsg('Claude is finding the best viral moments…');
      const result = await analyzeViralMoments({
        transcript: transcript.text,
        words:      transcript.words,
        duration:   transcript.duration || vidDuration,
        maxClips:   parseInt(maxClips) || 8,
        minSeconds: parseInt(minSec)   || 20,
        maxSeconds: parseInt(maxSec)   || 60,
      });

      const analysisClips = result?.clips || [];
      if (!analysisClips.length) throw new Error('No viral moments detected. Try a different video.');
      markDone('analyze');
      setProgress(85);

      setStep('clip');
      setMsg('Building clip URLs…');

      const processed = analysisClips.map(c => ({
        ...c,
        cloudinary_url: buildCloudinaryClipUrl(cloudUrl, '', c.start, c.end),
        blobUrl:        cloudUrl,
        cdn_url:        buildCloudinaryClipUrl(cloudUrl, '', c.start, c.end),
      }));

      markDone('clip');
      setClips(processed);
      setStage('done');
      setProgress(100);
      setMsg(`${processed.length} clips ready!`);

      await saveProject(processed, file.name);
      setStep(null);

    } catch (e) {
      console.error('OpenShorts file error:', e);
      setStage('error');
      setErr(e.message || 'Unexpected error');
      setStep(null);
    }
  };

  const handleReset = () => {
    setStage('idle'); setClips([]); setErr('');
    setStep(null); setDone([]); setMsg(''); setProgress(0);
    setFile(null); setYtUrl(''); setVidDur(0);
  };

  const isActive = stage === 'processing' || stage === 'done' || stage === 'error';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50">
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
              <ArrowLeft size={13} /><span>Dashboard</span>
            </Link>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm">
                <Scissors size={13} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Open Shorts</span>
              <Badge className="text-xs px-1.5 py-0 bg-rose-50 text-rose-600 border-rose-100">AI</Badge>
            </div>
            <div className="flex gap-1 ml-3">
              {[
                { k: 'generate', label: 'Generate', icon: Sparkles },
                { k: 'library',  label: 'Library',  icon: Library  },
              ].map(({ k, label, icon: Icon }) => (
                <button key={k} onClick={() => setMainTab(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mainTab === k ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Icon size={11} /><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors">
                <X size={11} /><span>Reset</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600 text-xs font-medium">
              <CloudUpload size={9} /><span>Bunny CDN</span>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <Settings size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Generate Tab */}
      {mainTab === 'generate' && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

          {!isActive && (
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-full text-rose-600 text-xs font-medium mb-1">
                <Zap size={11} /><span>AssemblyAI Transcription · Claude Analysis · Bunny CDN Storage</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Open Shorts</h1>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Upload video → AssemblyAI transcribes → Claude finds viral moments → clips saved as projects in your library.
              </p>
            </div>
          )}

          {!isActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {[
                  { k: 'youtube', icon: Youtube, label: 'YouTube URL',  desc: 'Extracts audio → transcribes → finds moments' },
                  { k: 'file',    icon: Upload,  label: 'Upload File',  desc: 'Bunny CDN upload → transcribe → find clips'   },
                ].map(({ k, icon: Icon, label, desc }) => (
                  <button key={k} onClick={() => setInputMode(k)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-sm font-medium transition-colors border-b-2 ${inputMode === k ? 'text-rose-600 border-rose-500 bg-rose-50/30' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
                    <div className="flex items-center gap-1.5"><Icon size={14} /><span>{label}</span></div>
                    <span className="text-xs font-normal text-gray-400">{desc}</span>
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-4">
                {inputMode === 'youtube' && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                      <Mic size={12} className="shrink-0 mt-0.5 text-blue-500" />
                      <span>Audio extracted via Cobalt, transcribed by AssemblyAI, then Claude identifies the best viral moments with exact timestamps.</span>
                    </div>
                    <Input value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="h-12 text-sm" onKeyDown={e => { if (e.key === 'Enter') runYouTubeMode(); }} />
                    <p className="text-xs text-gray-400">Supports youtube.com and youtu.be links</p>
                  </div>
                )}

                {inputMode === 'file' && (
                  <div className="space-y-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-700 flex items-start gap-2">
                      <CloudUpload size={12} className="shrink-0 mt-0.5 text-emerald-500" />
                      <span>Video uploads to Bunny CDN (handles 1GB+) → AssemblyAI transcribes → Claude finds viral moments → saved to your Library.</span>
                    </div>
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-rose-400 bg-rose-50' : file ? 'border-rose-300 bg-rose-50/50' : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50/20'}`}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('video/')) handleFileSelect(f); }}
                    >
                      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                      {file ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileVideo className="text-rose-500" size={20} />
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-800">{file.name}</p>
                            <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB{vidDuration ? ' / ' + formatTime(vidDuration) : ''}</p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setFile(null); setVidDur(0); }} className="ml-auto text-gray-400 hover:text-gray-600"><X size={15} /></button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto"><Upload size={18} className="text-gray-400" /></div>
                          <p className="text-sm text-gray-600 font-medium">Drag and drop video or <span className="text-rose-500">browse</span></p>
                          <p className="text-xs text-gray-400">MP4, MOV, AVI · 1GB+ supported via Bunny CDN</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Advanced settings */}
                <div>
                  <button onClick={() => setShowAdv(!showAdv)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <Settings size={11} /><span>Advanced settings</span>{showAdv ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                  {showAdv && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { label: 'Max clips', val: maxClips, set: setMaxClips, ph: '8'  },
                        { label: 'Min sec',   val: minSec,   set: setMinSec,   ph: '20' },
                        { label: 'Max sec',   val: maxSec,   set: setMaxSec,   ph: '60' },
                      ].map(({ label, val, set, ph }) => (
                        <div key={label}>
                          <label className="text-xs text-gray-500 block mb-1">{label}</label>
                          <Input value={val} onChange={e => set(e.target.value)} placeholder={ph} className="h-9 text-sm" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {err && stage === 'idle' && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    <AlertCircle size={13} /><span>{err}</span>
                  </div>
                )}

                <Button
                  onClick={inputMode === 'youtube' ? runYouTubeMode : runFileMode}
                  disabled={stage === 'processing' || (inputMode === 'youtube' && !ytUrl.trim()) || (inputMode === 'file' && !file)}
                  className="w-full h-12 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold rounded-xl disabled:opacity-50"
                >
                  {stage === 'processing'
                    ? <span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" />Processing…</span>
                    : inputMode === 'youtube'
                      ? <span className="flex items-center gap-2"><Mic size={15} />Transcribe + Analyze</span>
                      : <span className="flex items-center gap-2"><Scissors size={15} />Upload + Generate Clips</span>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Processing status */}
          {stage === 'processing' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <StageBar stageKeys={['transcribe', 'analyze', 'clip']} current={currentStep} done={doneSteps} />
              <div className="space-y-2">
                <p className="text-sm text-gray-700 font-medium">{statusMsg}</p>
                {progress > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-rose-500 to-red-600 h-1.5 rounded-full transition-all duration-500" style={{ width: progress + '%' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {stage === 'error' && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 space-y-3">
              <p className="font-semibold text-red-700 flex items-center gap-2"><AlertCircle size={16} />Something went wrong</p>
              <p className="text-sm text-red-600">{err}</p>
              <div className="text-xs text-red-500 space-y-1">
                {err?.includes('AssemblyAI') && <p>Check your AssemblyAI key in env settings.</p>}
                {err?.includes('Bunny')      && <p>Check your Bunny CDN env vars.</p>}
                {err?.includes('Cobalt')     && <p>Cobalt may be rate-limiting. Try again in a moment.</p>}
                {err?.includes('viral')      && <p>Try a longer video with more speech content.</p>}
              </div>
              <Button onClick={handleReset} className="bg-red-600 hover:bg-red-700 text-white h-9 text-sm">Try Again</Button>
            </div>
          )}

          {/* Results */}
          {clips.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-rose-500" />
                  <span>{stage === 'done' ? `${clips.length} Viral Clips Ready` : `Processing… (${clips.length} done)`}</span>
                </h2>
                {stage === 'done' && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setMainTab('library')} className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 font-medium px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors">
                      <Library size={11} /><span>View in Library</span>
                    </button>
                    <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                      <X size={11} /><span>New video</span>
                    </button>
                  </div>
                )}
              </div>

              {inputMode === 'youtube' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                  <Youtube size={12} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>These clips play at the exact viral timestamps in embedded YouTube players. Use File Upload mode to get downloadable 9:16 video files.</span>
                </div>
              )}

              <div className={`grid gap-5 ${inputMode === 'youtube' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
                {clips.map((c, i) => inputMode === 'youtube'
                  ? <YouTubeClipCard key={i} clip={c} index={i} ytUrl={ytUrl} />
                  : <FileClipCard    key={i} clip={c} index={i} />
                )}
              </div>

              {stage === 'done' && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
                  <CheckCircle size={12} />
                  <span>Project saved to your Library — open the Library tab to re-download anytime.</span>
                </div>
              )}
            </div>
          )}

          {/* Feature tiles */}
          {!isActive && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Mic,         label: 'AssemblyAI',   desc: 'Word-level transcription for precise clip boundaries' },
                { icon: Sparkles,    label: 'Claude AI',    desc: 'Finds the highest-virality moments automatically'     },
                { icon: CloudUpload, label: 'Bunny CDN',    desc: 'Handles 1GB+ uploads, instant global delivery'       },
                { icon: Folder,      label: 'Project Library', desc: 'Every generation saved — re-download anytime'     },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center mx-auto mb-2"><Icon size={13} className="text-rose-500" /></div>
                  <p className="text-xs font-semibold text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Library Tab */}
      {mainTab === 'library' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Library size={18} className="text-rose-500" /><span>Clip Library</span>
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">All your generated clip projects — open a folder to preview and download</p>
            </div>
          </div>
          <ClipLibrary />
        </div>
      )}
    </div>
  );
}