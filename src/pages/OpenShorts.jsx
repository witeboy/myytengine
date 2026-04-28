/**
 * OpenShorts.jsx  —  Refactored: zero base44 integration dependencies
 *
 * Replaces:
 *   base44.functions.invoke('analyzeVideoWithGemini')  → Claude direct (transcript-first)
 *   base44.functions.invoke('analyzeViralMoments')     → analyzeViralMoments (directApi)
 *   base44.functions.invoke('submitTranscription')     → transcribeFile (directApi / AssemblyAI direct)
 *   base44.functions.invoke('pollTranscription')       → built into transcribeFile
 *
 * For File mode: FFmpeg clips → Cloudinary upload (replaces base44 UploadFile 402 error)
 * For YouTube mode: user pastes URL → Cobalt extracts audio → AssemblyAI transcribes → Claude analyzes
 *
 * Cloudinary, AssemblyAI key, and Supabase config all live in Settings panel (localStorage).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Youtube, Upload, FileVideo, X, Loader2, CheckCircle,
  AlertCircle, Download, Share2, Instagram, Sparkles, Settings,
  Scissors, Zap, Copy, Check, ChevronDown, ChevronUp,
  Globe, Eye, EyeOff, Flame, Library, Clock,
  Play, Database, TrendingUp, CloudUpload, Star,
  ExternalLink, Mic,
} from 'lucide-react';
import {
  LS_KEYS,
  uploadToCloudinary,
  buildCloudinaryClipUrl,
  extractYouTubeAudio,
  transcribeFile,
  analyzeViralMoments,
} from '@/lib/directApi';

// ── localStorage keys ──────────────────────────────────────────────────
const LS = {
  CLOUD_NAME:   LS_KEYS.CLOUD_NAME,
  CLOUD_PRESET: LS_KEYS.CLOUD_PRESET,
  SUPABASE_URL: 'openshorts_supabase_url',
  SUPABASE_KEY: 'openshorts_supabase_anon_key',
  UP_KEY:       'openshorts_uploadpost_key',
  UP_USER:      'openshorts_uploadpost_user',
};

// ── Helpers ────────────────────────────────────────────────────────────
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
  return m + ':' + s.toString().padStart(2, '0');
};

// ── Supabase REST ──────────────────────────────────────────────────────
const sb = {
  ready: () => !!(localStorage.getItem(LS.SUPABASE_URL) && localStorage.getItem(LS.SUPABASE_KEY)),
  _h: () => {
    const k = localStorage.getItem(LS.SUPABASE_KEY) || '';
    return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
  },
  _u: (t, q) => (localStorage.getItem(LS.SUPABASE_URL) || '').replace(/\/$/, '') + '/rest/v1/' + t + (q || ''),
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
  async select(t, q) {
    if (!this.ready()) return [];
    try {
      const r = await fetch(this._u(t, q), { headers: this._h() });
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
};

const saveToSupabase = async (clips) => {
  if (!sb.ready() || !clips.length) return;
  const jobId = 'os_' + Date.now();
  await sb.insert('clip_library', clips.map((c, i) => ({
    job_id:           jobId,
    clip_index:       i,
    cloudinary_url:   c.cloudinary_url || null,
    local_url:        c.youtube_url    || null,
    yt_title:         c.video_title_for_youtube_short || null,
    hook_text:        c.viral_hook_text || null,
    tiktok_desc:      c.video_description_for_tiktok  || null,
    ig_desc:          c.video_description_for_instagram || null,
    start_seconds:    c.start ?? null,
    end_seconds:      c.end   ?? null,
    duration_seconds: (c.end && c.start) ? +(c.end - c.start).toFixed(2) : null,
  })));
};

// ── Stage bar ──────────────────────────────────────────────────────────
const STAGE_DEFS = {
  transcribe: { label: 'Upload + Transcribe', icon: Mic        },
  analyze:    { label: 'Find Moments',        icon: Sparkles   },
  clip:       { label: 'Generate Clips',      icon: Scissors   },
};

function StageBar({ stageKeys, current, done }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stageKeys.map((key, i) => {
        const def    = STAGE_DEFS[key] || { label: key, icon: Sparkles };
        const Icon   = def.icon;
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
              {isDone
                ? <CheckCircle size={11} />
                : isCur
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Icon size={11} />
              }
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
      section: 'Cloudinary — Clip Storage',
      k: LS.CLOUD_NAME, label: 'Cloud Name', pw: false,
      ph: 'your-cloud-name',
      hint: 'Cloudinary dashboard, top left',
    },
    {
      k: LS.CLOUD_PRESET, label: 'Upload Preset', pw: false,
      ph: 'openshorts_clips',
      hint: 'Cloudinary → Settings → Upload → Add unsigned preset',
    },
    {
      section: 'Supabase — Clip Library (Optional)',
      k: LS.SUPABASE_URL, label: 'Project URL', pw: false,
      ph: 'https://xxxx.supabase.co',
      hint: 'Supabase → Settings → API → Project URL',
    },
    {
      k: LS.SUPABASE_KEY, label: 'Anon Public Key', pw: true,
      ph: 'eyJ…',
      hint: 'Supabase → Settings → API → anon public',
    },
    {
      section: 'Social Posting (Optional)',
      k: LS.UP_KEY, label: 'Upload-Post API Key', pw: true,
      ph: 'up_…',
      hint: 'uploadpost.com API key',
    },
    {
      k: LS.UP_USER, label: 'Upload-Post Username', pw: false,
      ph: '@handle', hint: '',
    },
  ];

  const [vals, setVals]   = useState(() => {
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
            <Settings size={15} className="text-rose-500" />
            Open Shorts Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={17} /></button>
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

        <div className="pt-2 space-y-1.5">
          {[
            { ok: !!vals[LS.CLOUD_NAME], label: 'Cloudinary — clip storage' },
            { ok: !!(vals[LS.SUPABASE_URL] && vals[LS.SUPABASE_KEY]), label: 'Supabase — clip library' },
          ].map(({ ok, label }) => (
            <div key={label} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
              {ok ? <CheckCircle size={11} /> : <div className="w-2.5 h-2.5 rounded-full border border-gray-300" />}
              {label}
            </div>
          ))}
        </div>

        <Button onClick={save} className={`w-full h-10 text-white transition-all ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'}`}>
          {saved ? <span className="flex items-center gap-1"><Check size={12} /> Saved!</span> : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

// ── YouTubeClipCard — unchanged from original ──────────────────────────
function YouTubeClipCard({ clip, index, ytUrl }) {
  const [copied, setCopied] = useState(null);
  const [expanded, setExp]  = useState(false);
  const ytId = getYouTubeId(ytUrl);
  const dur  = (clip.end && clip.start) ? Math.round(clip.end - clip.start) : null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
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
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold shadow">{index + 1}</div>
        {dur && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-xs font-mono">
            <Clock size={8} /><span>{dur}s</span>
          </div>
        )}
        {clip.virality_score && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-rose-600/90 text-white rounded-full text-xs font-bold">
            <Star size={8} /><span>{clip.virality_score}</span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-gray-400">{formatTime(clip.start)} to {formatTime(clip.end)}</span>
          <a href={`https://www.youtube.com/watch?v=${ytId}&t=${Math.floor(clip.start)}s`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-medium">
            <ExternalLink size={9} /><span>Open on YouTube</span>
          </a>
        </div>
        {clip.viral_hook_text && (
          <div className="flex items-start gap-1.5">
            <Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-gray-800 leading-snug">{clip.viral_hook_text}</p>
          </div>
        )}
        {clip.video_title_for_youtube_short && <p className="text-xs text-gray-500 line-clamp-2">{clip.video_title_for_youtube_short}</p>}
        {clip.virality_reason && <p className="text-xs text-gray-400 italic border-l-2 border-rose-100 pl-2 leading-relaxed">{clip.virality_reason}</p>}
        <div>
          <button onClick={() => setExp(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <Globe size={9} /><span>Platform captions</span>{expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,    label: 'YouTube',   text: clip.video_title_for_youtube_short,   key: 'yt' },
                { icon: <TikTokIcon size={10} />,                           label: 'TikTok',    text: clip.video_description_for_tiktok,    key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />, label: 'Instagram', text: clip.video_description_for_instagram, key: 'ig' },
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

// ── FileClipCard — unchanged from original ─────────────────────────────
function FileClipCard({ clip, index }) {
  const [copied, setCopied]   = useState(null);
  const [expanded, setExp]    = useState(false);
  const [posting, setPosting] = useState(false);
  const [postRes, setPostRes] = useState(null);
  const videoRef = useRef(null);
  const src = clip.cloudinary_url || clip.blobUrl || null;
  const dur = (clip.end && clip.start) ? Math.round(clip.end - clip.start) : null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const runPost = async () => {
    const upKey  = localStorage.getItem(LS.UP_KEY);
    const upUser = localStorage.getItem(LS.UP_USER);
    if (!upKey)               return setPostRes({ error: 'Upload-Post key required — add in Settings' });
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
      <div className="relative bg-zinc-900 overflow-hidden" style={{ aspectRatio: '9/16', maxHeight: 220 }}>
        {src ? (
          <video ref={videoRef} src={src} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline
            onMouseEnter={() => videoRef.current?.play()} onMouseLeave={() => videoRef.current?.pause()} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
        )}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold shadow">{index + 1}</div>
        {dur && <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/80 text-white rounded-full text-xs font-mono"><Clock size={8} /><span>{dur}s</span></div>}
        {clip.cloudinary_url && <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-blue-600/90 text-white rounded text-xs font-bold">CDN</div>}
      </div>
      <div className="p-3 space-y-2">
        {clip.viral_hook_text && <div className="flex items-start gap-1.5"><Flame className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" /><p className="text-xs font-semibold text-gray-800 leading-snug">{clip.viral_hook_text}</p></div>}
        {clip.video_title_for_youtube_short && <p className="text-xs text-gray-400 line-clamp-2">{clip.video_title_for_youtube_short}</p>}
        <div>
          <button onClick={() => setExp(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <Globe size={9} /><span>Captions</span>{expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {[
                { icon: <Youtube size={10} className="text-red-500" />,    label: 'YouTube',   text: clip.video_title_for_youtube_short,   key: 'yt' },
                { icon: <TikTokIcon size={10} />,                           label: 'TikTok',    text: clip.video_description_for_tiktok,    key: 'tt' },
                { icon: <Instagram size={10} className="text-pink-500" />, label: 'Instagram', text: clip.video_description_for_instagram, key: 'ig' },
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
            <a href={src} download={`clip_${index + 1}.mp4`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors">
              <Download size={10} /><span>Download</span>
            </a>
          )}
          <button onClick={runPost} disabled={posting} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white text-xs font-semibold disabled:opacity-50 transition-all">
            {posting ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />}
            <span>Post</span>
          </button>
        </div>
        {postRes && <p className={`text-xs rounded px-2 py-1 ${postRes.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{postRes.error || 'Posted!'}</p>}
      </div>
    </div>
  );
}

// ── Clip Library — unchanged from original ─────────────────────────────
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

  if (!sb.ready()) return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-sm mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center"><Database size={22} className="text-emerald-400" /></div>
      <div>
        <p className="font-semibold text-gray-800">Connect Supabase to unlock your Clip Library</p>
        <p className="text-sm text-gray-400 mt-1">Every clip you generate gets saved here automatically.</p>
      </div>
    </div>
  );

  const now      = Date.now();
  const filtered = clips.filter(c => {
    if (filter === 'today') return now - new Date(c.created_at).getTime() < 86400000;
    if (filter === 'week')  return now - new Date(c.created_at).getTime() < 604800000;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Clips',   val: clips.length, icon: Scissors,    color: 'text-rose-500' },
          { label: 'This Week',     val: clips.filter(c => now - new Date(c.created_at).getTime() < 604800000).length, icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'On Cloudinary', val: clips.filter(c => c.cloudinary_url).length, icon: CloudUpload, color: 'text-blue-500' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <Icon size={14} className={color + ' mb-1'} />
            <div className="text-2xl font-bold text-gray-900">{val}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['all','All time'],['week','This week'],['today','Today']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} clips</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-5 h-5 animate-spin text-rose-400" /><span className="text-gray-400 text-sm">Loading library…</span></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><Library size={28} className="text-gray-200 mx-auto mb-3" /><p className="text-gray-400 text-sm">No clips yet.</p></div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(c => <FileClipCard key={c.id} clip={c} index={c.clip_index} />)}
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

  const [ytUrl, setYtUrl]         = useState('');
  const [file, setFile]           = useState(null);
  const [vidDuration, setVidDur]  = useState(0);
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef(null);

  const [stage, setStage]       = useState('idle');
  const [currentStep, setStep]  = useState(null);
  const [doneSteps, setDone]    = useState([]);
  const [statusMsg, setMsg]     = useState('');
  const [progress, setProgress] = useState(0);
  const [err, setErr]           = useState('');

  const [clips, setClips]   = useState([]);
  const [costInfo, setCost] = useState(null);

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

  // ── YouTube mode: extract audio → transcribe → analyze ────────────────
  const runYouTubeMode = async () => {
    if (!ytUrl.trim()) return setErr('Paste a YouTube URL first');

    setStage('processing'); setErr(''); setClips([]); setCost(null); setDone([]);

    try {
      // 1. Extract audio via Cobalt
      setStep('transcribe');
      setMsg('Extracting audio from YouTube via Cobalt…');
      const audioUrl = await extractYouTubeAudio(ytUrl.trim());

      // 2. Transcribe via AssemblyAI direct
      setMsg('Submitting to AssemblyAI for transcription…');
      const transcript = await transcribeFile(audioUrl, (msg) => setMsg(msg));
      markDone('transcribe');

      // 3. Analyze with Claude
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

  // ── File mode: FFmpeg clip → Cloudinary upload → analyze ──────────────
  const runFileMode = async () => {
    if (!file) return setErr('Select a video file first');
    if (!localStorage.getItem(LS.CLOUD_NAME)) return setErr('Add your Cloudinary Cloud Name in Open Shorts Settings first');

    setStage('processing'); setErr(''); setClips([]); setCost(null); setDone([]); setProgress(0);

    try {
      // Step 1: Upload full video to Cloudinary (one upload, then clip server-side)
      setStep('transcribe');
      setMsg('Uploading video to Cloudinary…');
      const uploadResult = await uploadToCloudinary(file, {
        resourceType: 'video',
        onProgress: pct => setMsg(`Uploading… ${pct}%`),
      });
      const cloudUrl  = uploadResult.secure_url;
      const publicId  = uploadResult.public_id;
      const cloudName = localStorage.getItem(LS.CLOUD_NAME);

      // Step 2: Transcribe via AssemblyAI (backend has the key)
      setMsg('Transcribing with AssemblyAI…');
      const transcript = await transcribeFile(cloudUrl, msg => setMsg(msg));
      markDone('transcribe');

      // Step 3: Analyze viral moments with Claude
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

      // Step 4: Generate 9:16 clips via Cloudinary URL transformations
      // No FFmpeg, no WASM — Cloudinary crops + trims server-side instantly.
      setStep('clip');
      setMsg('Generating 9:16 clips via Cloudinary…');
      setProgress(0);

      const processed = analysisClips.map((c, ci) => {
        const clipUrl = buildCloudinaryClipUrl(publicId, cloudName, c.start, c.end);
        return {
          ...c,
          cloudinary_url: clipUrl,
          blobUrl:        clipUrl, // FileClipCard uses blobUrl for <video> src
          _idx:           ci,
        };
      });

      markDone('clip');
      setClips(processed);
      setStage('done');
      setMsg(`${processed.length} clips ready! Cloudinary is rendering them — playback starts in a few seconds.`);
      setProgress(100);

      // Step 5: Save to Supabase library
      markDone('upload'); // clips are already on Cloudinary CDN
      await saveToSupabase(processed);
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
                <button key={k} onClick={() => setMainTab(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mainTab === k ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'text-gray-500 hover:text-gray-700'}`}>
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
            {sb.ready() && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600 text-xs font-medium">
                <Database size={9} /><span>Library On</span>
              </div>
            )}
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
                <Zap size={11} /><span>AssemblyAI Transcription · Claude Analysis · FFmpeg Clips · Cloudinary CDN</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Open Shorts</h1>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Upload video → AssemblyAI transcribes → Claude finds viral moments → Cloudinary generates 9:16 clips instantly.
              </p>
            </div>
          )}

          {!isActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {[
                  { k: 'youtube', icon: Youtube, label: 'YouTube URL',  desc: 'Extracts audio → transcribes → finds moments' },
                  { k: 'file',    icon: Upload,  label: 'Upload File',  desc: 'Cloudinary generates 9:16 clips server-side' },
                ].map(({ k, icon: Icon, label, desc }) => (
                  <button key={k} onClick={() => setInputMode(k)} className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-sm font-medium transition-colors border-b-2 ${inputMode === k ? 'text-rose-600 border-rose-500 bg-rose-50/30' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
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
                      <span>
                        Audio is extracted via Cobalt, transcribed by AssemblyAI, then Claude identifies the best viral moments with exact timestamps.
                        Add your AssemblyAI key in Settings to get started.
                      </span>
                    </div>
                    <Input value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="h-12 text-sm" onKeyDown={e => { if (e.key === 'Enter') runYouTubeMode(); }} />
                    <p className="text-xs text-gray-400">Supports youtube.com and youtu.be links</p>
                  </div>
                )}

                {inputMode === 'file' && (
                  <div className="space-y-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-700 flex items-start gap-2">
                      <Scissors size={12} className="shrink-0 mt-0.5 text-emerald-500" />
                      <span>
                        Video uploads to Cloudinary → AssemblyAI transcribes → Claude finds viral moments → Cloudinary generates 9:16 clips server-side. No browser processing needed.
                      </span>
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
                          <p className="text-xs text-gray-400">MP4, MOV, AVI, any size</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                      : <span className="flex items-center gap-2"><Scissors size={15} />Generate 9:16 Clips</span>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Processing status */}
          {stage === 'processing' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <StageBar
                stageKeys={['transcribe', 'analyze', 'clip']}
                current={currentStep}
                done={doneSteps}
              />
              <div className="space-y-2">
                <p className="text-sm text-gray-700 font-medium">{statusMsg}</p>
                {progress > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-rose-500 to-red-600 h-1.5 rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
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
                {err?.includes('AssemblyAI') && <p>Check your AssemblyAI key in Settings.</p>}
                {err?.includes('Cloudinary') && <p>Check your Cloudinary Cloud Name and preset in Settings.</p>}
                {err?.includes('Cobalt')     && <p>Cobalt may be rate-limiting. Try adding a self-hosted Cobalt URL in Settings.</p>}
                {err?.includes('FFmpeg')     && <p>Try Chrome or Firefox. WebAssembly must be enabled.</p>}
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
                  <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                    <X size={11} /><span>New video</span>
                  </button>
                )}
              </div>

              {inputMode === 'youtube' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                  <Youtube size={12} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>These clips play at the exact viral timestamps in embedded YouTube players. Use File Upload mode to get real 9:16 video files.</span>
                </div>
              )}

              <div className={`grid gap-5 ${inputMode === 'youtube' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
                {clips.map((c, i) => inputMode === 'youtube'
                  ? <YouTubeClipCard key={i} clip={c} index={i} ytUrl={ytUrl} />
                  : <FileClipCard    key={i} clip={c} index={i} />
                )}
              </div>
            </div>
          )}

          {!isActive && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Mic,         label: 'AssemblyAI',    desc: 'Word-level transcription for precise clip boundaries' },
                { icon: Sparkles,    label: 'Claude AI',     desc: 'Finds the highest-virality moments automatically'     },
                { icon: Scissors,    label: 'Cloudinary AI', desc: 'Crops 9:16 + trims clips server-side, instant'       },
                { icon: CloudUpload, label: 'CDN Ready',     desc: 'Every clip is a permanent Cloudinary CDN URL'        },
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
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Library size={18} className="text-rose-500" /><span>Clip Library</span></h2>
            <p className="text-sm text-gray-400 mt-0.5">All your generated clips, saved automatically via Supabase</p>
          </div>
          <ClipLibrary />
        </div>
      )}
    </div>
  );
}