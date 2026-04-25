import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Youtube, Upload, FileVideo, X, Loader2, CheckCircle,
  AlertCircle, Download, Share2, Instagram, Sparkles, Settings,
  Scissors, Zap, Copy, Check, ChevronDown, ChevronUp,
  Globe, Eye, EyeOff, Flame, Library, Clock,
  Play, Database, TrendingUp, CloudUpload, Star,
  Cpu, ExternalLink,
} from 'lucide-react';

// ─── localStorage keys ─────────────────────────────────────────────────
const LS = {
  CLOUD_NAME:   'openshorts_cloud_name',
  CLOUD_PRESET: 'openshorts_cloud_preset',
  SUPABASE_URL: 'openshorts_supabase_url',
  SUPABASE_KEY: 'openshorts_supabase_anon_key',
  UP_KEY:       'openshorts_uploadpost_key',
  UP_USER:      'openshorts_uploadpost_user',
};

// ─── Small helpers ─────────────────────────────────────────────────────
const TikTokIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
  </svg>
);

const getYouTubeId = (url) => {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([^#&?]{11})/);
  return m ? m[1] : null;
};

const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ─── Supabase REST — no SDK needed ────────────────────────────────────
const sb = {
  ready: () => !!(localStorage.getItem(LS.SUPABASE_URL) && localStorage.getItem(LS.SUPABASE_KEY)),
  _h: () => {
    const k = localStorage.getItem(LS.SUPABASE_KEY) || '';
    return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
  },
  _u: (t, q = '') =>
    `${(localStorage.getItem(LS.SUPABASE_URL) || '').replace(/\/$/, '')}/rest/v1/${t}${q}`,
  async insert(t, rows) {
    if (!this.ready()) return null;
    try {
      const r = await fetch(this._u(t), {
        method: 'POST',
        headers: { ...this._h(), Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      return r.ok;
    } catch { return null; }
  },
  async select(t, q = '') {
    if (!this.ready()) return [];
    try {
      const r = await fetch(this._u(t, q), { headers: this._h() });
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
};

// ─── Save clips to Supabase after a job ───────────────────────────────
const saveToSupabase = async (clips) => {
  if (!sb.ready() || !clips.length) return;
  const jobId = `os_${Date.now()}`;
  await sb.insert('clip_library', clips.map((c, i) => ({
    job_id:           jobId,
    clip_index:       i,
    cloudinary_url:   c.cloudinary_url  || null,
    local_url:        c.youtube_url     || null,
    yt_title:         c.video_title_for_youtube_short || null,
    hook_text:        c.viral_hook_text || null,
    tiktok_desc:      c.video_description_for_tiktok  || null,
    ig_desc:          c.video_description_for_instagram || null,
    start_seconds:    c.start ?? null,
    end_seconds:      c.end   ?? null,
    duration_seconds: c.end && c.start ? +(c.end - c.start).toFixed(2) : null,
  })));
};

// ─── Cloudinary upload (unsigned preset) ─────────────────────────────
const uploadToCloudinary = (file, onProgress) => {
  const cloudName = localStorage.getItem(LS.CLOUD_NAME);
  const preset    = localStorage.getItem(LS.CLOUD_PRESET) || 'openshorts_clips';
  if (!cloudName) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', preset);
    fd.append('resource_type', 'video');

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload  = () => { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Parse error')); } };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
    xhr.send(fd);
  });
};

// ═══════════════════════════════════════════════════════════════════════
// Stage progress bar
// ═══════════════════════════════════════════════════════════════════════
const STAGE_DEFS = {
  load:       { label: 'Load FFmpeg',          icon: Cpu       },
  analyze:    { label: 'Gemini Analysis',      icon: Sparkles  },
  clip:       { label: 'Cut + Crop 9:16',      icon: Scissors  },
  upload:     { label: 'Upload to Cloudinary', icon: CloudUpload },
};

function StageBar({ stageKeys, current, done }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stageKeys.map((key, i) => {
        const def      = STAGE_DEFS[key] || { label: key, icon: Sparkles };
        const Icon     = def.icon;
        const isDone   = done.includes(key);
        const isCur    = current === key;
        return (
          <React.Fragment key={key}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isDone  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              isCur   ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm' :
                        'bg-gray-50 text-gray-400 border-gray-100'
            }`}>
              {isDone ? <CheckCircle size={11} /> : isCur ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
              <span className="hidden sm:inline">{def.label}</span>
            </div>
            {i < stageKeys.length - 1 && <div className="w-3 h-px bg-gray-200 hidden sm:block" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Settings panel
// ═══════════════════════════════════════════════════════════════════════
function SettingsPanel({ onClose }) {
  const FIELDS = [
    {
      section: 'Cloudinary — Permanent Clip Storage (Optional)',
      k: LS.CLOUD_NAME, label: 'Cloud Name', pw: false,
      ph: 'your-cloud-name',
      hint: 'Cloudinary dashboard → top left corner',
    },
    {
      k: LS.CLOUD_PRESET, label: 'Upload Preset', pw: false,
      ph: 'openshorts_clips',
      hint: 'Cloudinary → Settings → Upload → Add unsigned preset → name it openshorts_clips',
    },
    {
      section: 'Supabase — Clip Library (Optional)',
      k: LS.SUPABASE_URL, label: 'Project URL', pw: false,
      ph: 'https://xxxx.supabase.co',
      hint: 'Supabase → Settings → API → Project URL',
    },
    {
      k: LS.SUPABASE_KEY, label: 'Anon Public Key', pw: true,
      ph: 'eyJ...',
      hint: 'Supabase → Settings → API → anon public',
    },
    {
      section: 'Social Posting (Optional)',
      k: LS.UP_KEY, label: 'Upload-Post API Key', pw: true,
      ph: 'up_...',
      hint: 'uploadpost.com API key',
    },
    {
      k: LS.UP_USER, label: 'Upload-Post Username', pw: false,
      ph: '@handle', hint: '',
    },
  ];

  const [vals, setVals]   = useState(() =>
    Object.fromEntries(FIELDS.map(f => [f.k, localStorage.getItem(f.k) || '']))
  );
  const [show, setShow]   = useState({});
  const [saved, setSaved] = useState(false);

  const save = () => {
    FIELDS.forEach(f => localStorage.setItem(f.k, vals[f.k].trim()));
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white border border-gray-100 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Settings size={15} className="text-rose-500" /> Open Shorts Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={17} /></button>
        </div>

        {FIELDS.map((f, idx) => (
          <div key={f.k}>
            {f.section && (
              <div className={`pt-${idx === 0 ? '0' : '3'} pb-1 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{f.section}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">{f.label}</label>
              <div className="relative">
                <input
                  type={f.pw && !show[f.k] ? 'password' : 'text'}
                  value={vals[f.k]}
                  onChange={e => setVals(p => ({ ...p, [f.k]: e.target.value }))}
                  placeholder={f.ph}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-rose-400 pr-9"
                />
                {f.pw && (
                  <button
                    onClick={() => setShow(p => ({ ...p, [f.k]: !p[f.k] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {show[f.k] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
              </div>
              {f.hint && <p className="text-[10px] text-gray-400 mt-0.5">{f.hint}</p>}
            </div>
          </div>
        ))}

        {/* Status indicators */}
        <div className="pt-2 space-y-1.5">
          {[
            { ok: true,                    label: 'Gemini AI — ready (env key)' },
            { ok: !!vals[LS.CLOUD_NAME],   label: 'Cloudinary — permanent clip storage' },
            { ok: !!(vals[LS.SUPABASE_URL] && vals[LS.SUPABASE_KEY]), label: 'Supabase — clip library' },
          ].map(({ ok, label }) => (
            <div key={label} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
              {ok ? <CheckCircle size={11} /> : <div className="w-2.5 h-2.5 rounded-full border border-gray-300" />}
              {label}
            </div>
          ))}
        </div>

        <Button
          onClick={save}
          className={`w-full h-10 text-white transition-all ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'}`}
        >
          {saved ? <><Check size={12} className="mr-1" /> Saved!</> : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// YouTube clip card — shows embed at timestamp, captions, link
// ═══════════════════════════════════════════════════════════════════════
function YouTubeClipCard({ clip, index, ytUrl }) {
  const [copied, setCopied]   = useState(null);
  const [expanded, setExp]    = useState(false);
  const ytId = getYouTubeId(ytUrl);
  const dur  = clip.end && clip.start ? Math.round(clip.end - clip.start) : null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* YouTube embed at start time */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {ytId && (
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${ytId}?start=${Math.floor(clip.start)}&rel=0`}
            title={`Clip ${index + 1}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        {/* Index badge */}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-[10px] font-bold shadow">
          {index + 1}
        </div>
        {/* Duration badge */}
        {dur && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-[9px] font-mono">
            <Clock size={8} /> {dur}s
          </div>
        )}
        {/* Virality score */}
        {clip.virality_score && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-rose-600/90 text-white rounded-full text-[9px] font-bold">
            <Star size={8} /> {clip.virality_score}
          </div>
        )}
      </div>

      <div className="p-3 space-y-2.5">
        {/* Timestamp + YouTube link */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-400">
            {formatTime(clip.start)} → {formatTime(clip.end)}
          </span>
          
            href={`https://www.youtube.com/watch?v=${ytId}&t=${Math.floor(clip.start)}s`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-rose-500 hover:text-rose-700 font-medium"
          >
            <ExternalLink size={9} /> Open on YouTube
          </a>
        </div>

        {/* Hook */}
        {clip.viral_hook_text && (
          <div className="flex items-start gap-1.5">
            <Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-gray-800 leading-snug">{clip.viral_hook_text}</p>
          </div>
        )}

        {/* Title */}
        {clip.video_title_for_youtube_short && (
          <p className="text-[11px] text-gray-500 line-clamp-2">{clip.video_title_for_youtube_short}</p>
        )}

        {/* Why viral */}
        {clip.virality_reason && (
          <p className="text-[10px] text-gray-400 italic border-l-2 border-rose-100 pl-2 leading-relaxed">
            {clip.virality_reason}
          </p>
        )}

        {/* Platform captions toggle */}
        <div>
          <button
            onClick={() => setExp(!expanded)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Globe size={9} /> Platform captions {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,       label: 'YouTube',   text: clip.video_title_for_youtube_short,    key: 'yt' },
                { icon: <TikTokIcon size={10} />,                              label: 'TikTok',    text: clip.video_description_for_tiktok,     key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />,     label: 'Instagram', text: clip.video_description_for_instagram,  key: 'ig' },
              ].filter(x => x.text).map(({ icon, label, text, key }) => (
                <div key={key} className="bg-gray-50 rounded-lg p-2 group">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">{icon} {label}</div>
                    <button onClick={() => copy(text, key)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                      {copied === key ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 line-clamp-2">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// File clip card — shows actual 9:16 video, download + post
// ═══════════════════════════════════════════════════════════════════════
function FileClipCard({ clip, index }) {
  const [copied, setCopied]   = useState(null);
  const [expanded, setExp]    = useState(false);
  const [posting, setPosting] = useState(false);
  const [postRes, setPostRes] = useState(null);
  const videoRef = useRef(null);
  const src = clip.cloudinary_url || clip.blobUrl || null;
  const dur = clip.end && clip.start ? Math.round(clip.end - clip.start) : null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const runPost = async () => {
    const upKey  = localStorage.getItem(LS.UP_KEY);
    const upUser = localStorage.getItem(LS.UP_USER);
    if (!upKey)              return setPostRes({ error: 'Upload-Post key required — add in Settings ⚙️' });
    if (!clip.cloudinary_url) return setPostRes({ error: 'Clip must finish uploading to Cloudinary first' });
    setPosting(true); setPostRes(null);
    try {
      const res = await fetch('https://api.upload-post.com/v1/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': upKey },
        body: JSON.stringify({
          video_url:   clip.cloudinary_url,
          user_id:     upUser,
          platforms:   ['tiktok', 'instagram', 'youtube'],
          title:       clip.video_title_for_youtube_short || 'Viral Short',
          description: clip.video_description_for_instagram || '',
        }),
      });
      setPostRes(await res.json());
    } catch (e) { setPostRes({ error: e.message }); }
    finally { setPosting(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* 9:16 video preview */}
      <div className="relative bg-zinc-900 overflow-hidden" style={{ aspectRatio: '9/16', maxHeight: 220 }}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className="absolute inset-0 w-full h-full object-cover"
            muted loop playsInline
            onMouseEnter={() => videoRef.current?.play()}
            onMouseLeave={() => videoRef.current?.pause()}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        )}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-[10px] font-bold shadow">
          {index + 1}
        </div>
        {dur && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-[9px] font-mono">
            <Clock size={8} /> {dur}s
          </div>
        )}
        {clip.cloudinary_url && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-blue-600/90 text-white rounded text-[9px] font-bold">
            CDN ✓
          </div>
        )}
        {/* Hover play hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Play size={14} className="text-white ml-0.5" />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {clip.viral_hook_text && (
          <div className="flex items-start gap-1.5">
            <Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-gray-800 leading-snug">{clip.viral_hook_text}</p>
          </div>
        )}
        {clip.video_title_for_youtube_short && (
          <p className="text-[11px] text-gray-400 line-clamp-2">{clip.video_title_for_youtube_short}</p>
        )}

        {/* Platform captions */}
        <div>
          <button onClick={() => setExp(!expanded)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
            <Globe size={9} /> Captions {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,      label: 'YouTube',   text: clip.video_title_for_youtube_short,    key: 'yt' },
                { icon: <TikTokIcon size={10} />,                             label: 'TikTok',    text: clip.video_description_for_tiktok,     key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />,    label: 'Instagram', text: clip.video_description_for_instagram,  key: 'ig' },
              ].filter(x => x.text).map(({ icon, label, text, key }) => (
                <div key={key} className="bg-gray-50 rounded-lg p-2 group">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">{icon} {label}</div>
                    <button onClick={() => copy(text, key)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                      {copied === key ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 line-clamp-2">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5">
          {src && (
            
              href={src}
              download={`clip_${index + 1}.mp4`}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium transition-colors"
            >
              <Download size={10} /> Download
            </a>
          )}
          <button
            onClick={runPost}
            disabled={posting}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white text-[10px] font-semibold disabled:opacity-50 transition-all"
          >
            {posting ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />} Post
          </button>
        </div>
        {postRes && (
          <p className={`text-[10px] rounded px-2 py-1 ${postRes.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {postRes.error || 'Posted ✓'}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Clip Library (Supabase-powered)
// ═══════════════════════════════════════════════════════════════════════
function ClipLibrary() {
  const [clips, setClips]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!sb.ready()) { setLoad(false); return; }
    sb.select('clip_library', '?select=*&order=created_at.desc&limit=100')
      .then(c => setClips(Array.isArray(c) ? c : []))
      .finally(() => setLoad(false));
  }, []);

  if (!sb.ready()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-sm mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <Database size={22} className="text-emerald-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">Connect Supabase to unlock your Clip Library</p>
          <p className="text-sm text-gray-400 mt-1">Every clip you generate gets saved here automatically, forever.</p>
        </div>
        <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 text-left w-full space-y-2">
          <p className="font-semibold text-gray-600">Setup (5 min):</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Go to <strong>supabase.com</strong> → your project → SQL Editor</li>
            <li>Run the table setup SQL (see setup guide)</li>
            <li>Copy <strong>Project URL</strong> + <strong>anon key</strong> from Settings → API</li>
            <li>Paste both into <strong>Open Shorts → Settings ⚙️</strong></li>
          </ol>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const filtered = clips.filter(c => {
    if (filter === 'today') return now - new Date(c.created_at) < 86_400_000;
    if (filter === 'week')  return now - new Date(c.created_at) < 604_800_000;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Clips',   val: clips.length, icon: Scissors,    color: 'text-rose-500'    },
          { label: 'This Week',     val: clips.filter(c => now - new Date(c.created_at) < 604_800_000).length, icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'On Cloudinary', val: clips.filter(c => c.cloudinary_url).length, icon: CloudUpload, color: 'text-blue-500' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <Icon size={14} className={`${color} mb-1`} />
            <div className="text-2xl font-bold text-gray-900">{val}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['all', 'All time'], ['week', 'This week'], ['today', 'Today']].map(([k, l]) => (
            <button
              key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >{l}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} clips</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
          <span className="text-gray-400 text-sm">Loading library...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Library size={28} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No clips yet{filter !== 'all' ? ' in this period' : ''}.</p>
          <p className="text-gray-300 text-xs mt-1">Generate your first clips in the Generate tab.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(c => <FileClipCard key={c.id} clip={c} index={c.clip_index} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════
export default function OpenShorts() {
  const [showSettings, setShowSettings] = useState(false);
  const [mainTab, setMainTab]           = useState('generate');
  const [inputMode, setInputMode]       = useState('youtube');
  const hasGemini = true;

  // Inputs
  const [ytUrl, setYtUrl]       = useState('');
  const [file, setFile]         = useState(null);
  const [vidDuration, setVidDur] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  // Processing
  const [stage, setStage]         = useState('idle');
  const [currentStep, setStep]    = useState(null);
  const [doneSteps, setDone]      = useState([]);
  const [statusMsg, setMsg]       = useState('');
  const [progress, setProgress]   = useState(0);
  const [err, setErr]             = useState('');

  // Results
  const [clips, setClips]         = useState([]);
  const [costInfo, setCost]       = useState(null);

  // Advanced
  const [maxClips, setMaxClips]   = useState('8');
  const [minSec, setMinSec]       = useState('20');
  const [maxSec, setMaxSec]       = useState('60');
  const [showAdv, setShowAdv]     = useState(false);

  const markDone  = (s) => setDone(p => p.includes(s) ? p : [...p, s]);

  const handleFileSelect = (f) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    const v   = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { setVidDur(v.duration || 0); URL.revokeObjectURL(url); };
    v.src = url;
  };

  // ─── YOUTUBE MODE — Gemini watches the video directly ──────────────
  const runYouTubeMode = async () => {
    if (!ytUrl.trim()) return setErr('Paste a YouTube URL first');
    if (!hasGemini)    return setShowSettings(true);

    setStage('processing'); setErr(''); setClips([]); setCost(null);
    setDone([]); setStep('analyze');
    setMsg('Gemini is watching the video and finding the best viral moments...');

    try {
      const res  = await base44.functions.invoke('analyzeVideoWithGemini', {
        videoUrl:  ytUrl.trim(),
        maxClips:  parseInt(maxClips) || 8,
        minSec:    parseInt(minSec)   || 20,
        maxSec:    parseInt(maxSec)   || 60,
      });

      const data = res?.data || res;
      if (!data?.clips?.length) throw new Error(data?.error || data?.message || 'No viral moments found. Try a different video.');

      markDone('analyze');
      const enriched = data.clips.map(c => ({ ...c, youtube_url: ytUrl }));
      setClips(enriched);
      if (data.cost_analysis) setCost(data.cost_analysis);
      await saveToSupabase(enriched);
      setStage('done');
      setMsg(`Found ${enriched.length} viral moments!`);
    } catch (e) {
      setStage('error');
      setErr(e.message || 'Something went wrong');
    } finally {
      setStep(null);
    }
  };

  // ─── FILE MODE — FFmpeg in browser, real 9:16 clips ────────────────
  const runFileMode = async () => {
    if (!file)       return setErr('Select a video file first');
    if (!hasGemini)  return setShowSettings(true);

    setStage('processing'); setErr(''); setClips([]); setCost(null);
    setDone([]); setProgress(0);

    try {
      // ── Step 1: Load FFmpeg ──────────────────────────────────────
      setStep('load'); setMsg('Loading FFmpeg engine... (one-time ~30MB download)');

      const { FFmpeg }        = await import(/* webpackIgnore: true */ 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
      const { fetchFile, toBlobURL } = await import(/* webpackIgnore: true */ 'https://esm.sh/@ffmpeg/util@0.12.1');

      const ffmpeg = new FFmpeg();
      ffmpeg.on('log',      ({ message }) => console.log('[FFmpeg]', message));
      ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)));

      const hasSAB  = typeof SharedArrayBuffer !== 'undefined';
      const baseURL = hasSAB
        ? 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
        : 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

      const workerURL = await toBlobURL(
        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
        'text/javascript'
      );

      await ffmpeg.load({
        coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
        wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL,
      });

      markDone('load');

      // ── Step 2: Analyze with Gemini (via transcript if available) ─
      setStep('analyze'); setMsg('Finding the best viral moments with AI...');
      setProgress(0);

      // Write video file to FFmpeg filesystem
      const videoData = await fetchFile(file);
      await ffmpeg.writeFile('source.mp4', videoData);

      // Try to get a transcript via audio extraction + existing submitTranscription function
      let analysisClips = [];
      let transcriptWords = [];

      try {
        // Extract audio to mp3
        await ffmpeg.exec(['-i', 'source.mp4', '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', '-t', '600', 'audio.mp3']);
        const audioData = await ffmpeg.readFile('audio.mp3');
        const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });

        // Convert to base64 for backend
        const ab  = await audioBlob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ab).slice(0, 500000))); // cap at 500KB

        const submitRes = await base44.functions.invoke('submitTranscription', {
          voiceover_url:    null,
          audio_blob_b64:   b64,
        }).catch(() => null);

        if (submitRes?.data?.transcript_id) {
          const tid = submitRes.data.transcript_id;
          const deadline = Date.now() + 180_000;
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            const poll = await base44.functions.invoke('pollTranscription', { transcript_id: tid }).catch(() => null);
            if (poll?.data?.status === 'completed') {
              transcriptWords = poll.data.words || [];
              break;
            }
            if (poll?.data?.status === 'error') break;
          }
        }
      } catch (audioErr) {
        console.warn('Audio extraction skipped:', audioErr.message);
      }

      if (transcriptWords.length > 0) {
        // Use Claude-based analyzeViralMoments (word-level timestamps)
        const aRes = await base44.functions.invoke('analyzeViralMoments', {
          transcript:       transcriptWords.map(w => w.word).join(' '),
          words:            transcriptWords,
          duration:         vidDuration || 300,
          max_clips:        parseInt(maxClips) || 8,
          min_clip_seconds: parseInt(minSec)   || 20,
          max_clip_seconds: parseInt(maxSec)   || 60,
        });
        analysisClips = aRes?.data?.clips || [];
      }

      // Fallback: evenly spaced clips if no transcript
      if (!analysisClips.length) {
        const dur     = vidDuration || 120;
        const clipLen = parseInt(maxSec) || 60;
        const count   = Math.min(parseInt(maxClips) || 8, Math.floor(dur / clipLen));
        for (let i = 0; i < count; i++) {
          analysisClips.push({
            start: i * clipLen,
            end:   Math.min((i + 1) * clipLen, dur),
            video_title_for_youtube_short: `Clip ${i + 1}`,
            viral_hook_text: '',
            video_description_for_tiktok: '',
            video_description_for_instagram: '',
          });
        }
      }

      if (!analysisClips.length) throw new Error('No clips to generate. Try a longer video.');
      markDone('analyze');

      // ── Step 3: Cut + crop each clip to 9:16 ──────────────────
      setStep('clip'); setMsg(`Cutting and cropping ${analysisClips.length} clips to 9:16...`);
      setProgress(0);

      const processed = [];

      for (let i = 0; i < analysisClips.length; i++) {
        const c    = analysisClips[i];
        const name = `clip_${i + 1}.mp4`;
        const dur  = c.end - c.start;

        setMsg(`Processing clip ${i + 1} of ${analysisClips.length}...`);
        setProgress(Math.round((i / analysisClips.length) * 100));

        try {
          await ffmpeg.exec([
            '-ss', c.start.toFixed(3),
            '-i', 'source.mp4',
            '-t', dur.toFixed(3),
            // Center crop to 9:16 vertical
            '-vf', 'scale=w=720:h=1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '26',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            name,
          ]);

          const outData = await ffmpeg.readFile(name);
          const blob    = new Blob([outData.buffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          await ffmpeg.deleteFile(name);

          processed.push({ ...c, blob, blobUrl, _idx: i });
        } catch (clipErr) {
          console.error(`Clip ${i + 1} failed:`, clipErr.message);
        }
      }

      if (!processed.length) throw new Error('All clips failed to process. Check the video file.');
      markDone('clip');

      // Show clips right away
      setClips(processed);
      setStage('done');
      setMsg(`${processed.length} clips ready!`);
      setProgress(100);

      // ── Step 4: Upload to Cloudinary in background (optional) ──
      const cloudName = localStorage.getItem(LS.CLOUD_NAME);
      if (cloudName) {
        setStep('upload');
        setMsg('Uploading to Cloudinary for permanent storage...');

        const withCDN = await Promise.all(
          processed.map(async (c) => {
            try {
              const result = await uploadToCloudinary(
                new File([c.blob], `clip_${c._idx + 1}.mp4`, { type: 'video/mp4' }),
                () => {}
              );
              return { ...c, cloudinary_url: result?.secure_url || null };
            } catch {
              return c;
            }
          })
        );

        markDone('upload');
        setClips(withCDN);
        setMsg(`${processed.length} clips saved to Cloudinary!`);
        await saveToSupabase(withCDN);
      } else {
        await saveToSupabase(processed);
      }

      setStep(null);

    } catch (e) {
      console.error('OpenShorts file error:', e);
      setStage('error');
      setErr(e.message || 'Unexpected error');
      setStep(null);
    }
  };

  const handleReset = () => {
    setStage('idle'); setClips([]); setCost(null); setErr('');
    setStep(null); setDone([]); setMsg(''); setProgress(0);
    setFile(null); setYtUrl(''); setVidDur(0);
  };

  const isActive = ['processing', 'done', 'error'].includes(stage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50">
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
              <ArrowLeft size={13} /> Dashboard
            </Link>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm">
                <Scissors size={13} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Open Shorts</span>
              <Badge className="text-[9px] px-1.5 py-0 bg-rose-50 text-rose-600 border-rose-100">AI</Badge>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 ml-3">
              {[
                { k: 'generate', label: 'Generate', icon: Sparkles },
                { k: 'library',  label: 'Library',  icon: Library  },
              ].map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setMainTab(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mainTab === k
                      ? 'bg-rose-50 text-rose-600 border border-rose-100'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                  {k === 'library' && !sb.ready() && <span className="text-gray-300 text-[9px]">🔒</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!hasGemini && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium"
              >
                <AlertCircle size={11} /> Add Gemini Key
              </button>
            )}
            {isActive && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
              >
                <X size={11} /> Reset
              </button>
            )}
            {sb.ready() && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600 text-[10px] font-medium">
                <Database size={9} /> Library On
              </div>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Generate Tab ────────────────────────────────────────────── */}
      {mainTab === 'generate' && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

          {/* Hero */}
          {!isActive && (
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-full text-rose-600 text-xs font-medium mb-1">
                <Zap size={11} /> No Docker · No Server · 100% In-Browser
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Open Shorts</h1>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Gemini AI finds viral moments · FFmpeg cuts + crops to 9:16 in your browser · Cloudinary stores them permanently
              </p>
            </div>
          )}

          {/* Input card */}
          {!isActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Mode tabs */}
              <div className="flex border-b border-gray-100">
                {[
                  { k: 'youtube', icon: Youtube, label: 'YouTube URL',  desc: 'Gemini watches it directly — instant results' },
                  { k: 'file',    icon: Upload,  label: 'Upload File',  desc: 'Full 9:16 clip files · works offline'         },
                ].map(({ k, icon: Icon, label, desc }) => (
                  <button
                    key={k}
                    onClick={() => setInputMode(k)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-sm font-medium transition-colors border-b-2 ${
                      inputMode === k
                        ? 'text-rose-600 border-rose-500 bg-rose-50/30'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5"><Icon size={14} /> {label}</div>
                    <span className="text-[10px] font-normal text-gray-400">{desc}</span>
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-4">
                {/* YouTube input */}
                {inputMode === 'youtube' && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                      <Zap size={12} className="shrink-0 mt-0.5 text-blue-500" />
                      <span>
                        <strong>How it works:</strong> Gemini watches your YouTube video and returns the
                        exact timestamps of the most viral moments, plus ready-made captions for every platform.
                        Embed players let you preview each clip instantly.
                      </span>
                    </div>
                    <Input
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="h-12 text-sm"
                      onKeyDown={e => e.key === 'Enter' && runYouTubeMode()}
                    />
                    <p className="text-xs text-gray-400">Supports youtube.com and youtu.be links</p>
                  </div>
                )}

                {/* File upload input */}
                {inputMode === 'file' && (
                  <div className="space-y-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-700 flex items-start gap-2">
                      <Cpu size={12} className="shrink-0 mt-0.5 text-emerald-500" />
                      <span>
                        <strong>How it works:</strong> FFmpeg runs inside your browser to cut your video into clips
                        and crop each one to 9:16 portrait. No files leave your computer until you choose to upload.
                        AI finds the best moments using transcript analysis.
                      </span>
                    </div>
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                        dragging     ? 'border-rose-400 bg-rose-50' :
                        file         ? 'border-rose-300 bg-rose-50/50' :
                                       'border-gray-200 hover:border-rose-300 hover:bg-rose-50/20'
                      }`}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e  => { e.preventDefault(); setDragging(true);  }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => {
                        e.preventDefault(); setDragging(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f?.type.startsWith('video/')) handleFileSelect(f);
                      }}
                    >
                      <input
                        ref={fileRef} type="file" accept="video/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      />
                      {file ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileVideo className="text-rose-500" size={20} />
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-800">{file.name}</p>
                            <p className="text-xs text-gray-400">
                              {(file.size / 1024 / 1024).toFixed(1)} MB
                              {vidDuration ? ` · ${formatTime(vidDuration)}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); setFile(null); setVidDur(0); }}
                            className="ml-auto text-gray-400 hover:text-gray-600"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto">
                            <Upload size={18} className="text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-600 font-medium">
                            Drag &amp; drop video or <span className="text-rose-500">browse</span>
                          </p>
                          <p className="text-xs text-gray-400">MP4, MOV, AVI · Any size</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Advanced */}
                <div>
                  <button onClick={() => setShowAdv(!showAdv)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <Settings size={11} /> Advanced settings {showAdv ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                  {showAdv && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { label: 'Max clips', val: maxClips, set: setMaxClips, ph: '8' },
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

                {/* Error */}
                {err && stage === 'idle' && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    <AlertCircle size={13} /> {err}
                  </div>
                )}

                {/* Submit */}
                <Button
                  onClick={inputMode === 'youtube' ? runYouTubeMode : runFileMode}
                  disabled={
                    stage === 'processing' ||
                    (inputMode === 'youtube' && !ytUrl.trim()) ||
                    (inputMode === 'file'    && !file)
                  }
                  className="w-full h-12 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold rounded-xl disabled:opacity-50"
                >
                  {stage === 'processing' ? (
                    <><Loader2 size={15} className="animate-spin mr-2" /> Processing...</>
                  ) : inputMode === 'youtube' ? (
                    <><Sparkles size={15} className="mr-2" /> Analyze with Gemini</>
                  ) : (
                    <><Scissors size={15} className="mr-2" /> Generate 9:16 Clips</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Processing status */}
          {stage === 'processing' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <StageBar
                stageKeys={inputMode === 'youtube' ? ['analyze'] : ['load', 'analyze', 'clip', 'upload']}
                current={currentStep}
                done={doneSteps}
              />
              <div className="space-y-2">
                <p className="text-sm text-gray-700 font-medium">{statusMsg}</p>
                {progress > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-rose-500 to-red-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  {inputMode === 'youtube'
                    ? 'Gemini watches the full video. Takes 30–120s depending on video length.'
                    : currentStep === 'clip'
                      ? 'FFmpeg is cropping each clip to 9:16. Takes ~30–90s per clip.'
                      : currentStep === 'load'
                        ? 'Downloading FFmpeg (one-time). Will be cached for future use.'
                        : ''}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {stage === 'error' && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 space-y-3">
              <p className="font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} /> Something went wrong
              </p>
              <p className="text-sm text-red-600">{err}</p>
              <div className="text-xs text-red-500 space-y-1">
                {err?.includes('Gemini') && <p>→ Check your Gemini API key in Settings ⚙️</p>}
                {err?.includes('YouTube') && <p>→ Some videos are restricted. Try a different video, or use File Upload mode.</p>}
                {err?.includes('FFmpeg') && <p>→ Try Chrome or Firefox. WebAssembly must be enabled.</p>}
              </div>
              <Button onClick={handleReset} className="bg-red-600 hover:bg-red-700 text-white h-9 text-sm">
                Try Again
              </Button>
            </div>
          )}

          {/* Results */}
          {clips.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-rose-500" />
                  {stage === 'done'
                    ? `${clips.length} Viral Clips Ready`
                    : `Processing... (${clips.length} done so far)`}
                  {costInfo && (
                    <span className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-1 rounded-full font-normal ml-1">
                      Gemini: ${costInfo.total_cost?.toFixed(5)}
                    </span>
                  )}
                </h2>
                {stage === 'done' && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <X size={11} /> New video
                  </button>
                )}
              </div>

              {/* YouTube mode notice */}
              {inputMode === 'youtube' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                  <Youtube size={12} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    These clips play in embedded YouTube players at the exact viral timestamps.
                    To get actual 9:16 video files, download the video and use <strong>Upload File</strong> mode instead.
                  </span>
                </div>
              )}

              {/* Clips grid */}
              <div className={`grid gap-5 ${
                inputMode === 'youtube'
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
              }`}>
                {clips.map((c, i) =>
                  inputMode === 'youtube'
                    ? <YouTubeClipCard key={i} clip={c} index={i} ytUrl={ytUrl} />
                    : <FileClipCard    key={i} clip={c} index={i} />
                )}
              </div>
            </div>
          )}

          {/* How it works — idle only */}
          {!isActive && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Youtube,     label: 'YouTube Mode',  desc: 'Gemini watches directly, no download needed' },
                { icon: Cpu,         label: 'File Mode',     desc: 'FFmpeg in-browser, real 9:16 output files'   },
                { icon: CloudUpload, label: 'Cloudinary',    desc: 'Optional — permanent CDN clip storage'        },
                { icon: Database,    label: 'Clip Library',  desc: 'Optional — Supabase saves your history'      },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center mx-auto mb-2">
                    <Icon size={13} className="text-rose-500" />
                  </div>
                  <p className="text-xs font-semibold text-gray-800">{label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Library Tab ────────────────────────────────────────────── */}
      {mainTab === 'library' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Library size={18} className="text-rose-500" /> Clip Library
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              All your generated clips — saved automatically via Supabase
            </p>
          </div>
          <ClipLibrary />
        </div>
      )}
    </div>
  );
}
