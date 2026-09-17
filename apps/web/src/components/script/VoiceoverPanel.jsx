import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Pause, Download, Square, Search, X, Globe, Upload, FileAudio, CheckCircle2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// AI33 voice generation panel
// ══════════════════════════════════════════════════════════════════
function VoicePanel({ title, icon, color, badgeText, voices, loadingVoices, tabs, project, script, provider, onUpdate, settings, setSettings, error: parentError }) {
  const [selectedVoice, setSelectedVoice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const pollRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const pollFailuresRef = useRef(0);
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(null);
  const [previewCache, setPreviewCache] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || 'all');

  const filteredVoices = useMemo(() => {
    const tab = tabs.find(t => t.key === activeTab);
    let source = tab?.filter ? voices.filter(tab.filter) : voices;
    return source.filter(v => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (v.name || '').toLowerCase();
        const desc = (v.description || '').toLowerCase();
        const accent = (v.labels?.accent || '').toLowerCase();
        if (!name.includes(q) && !desc.includes(q) && !accent.includes(q)) return false;
      }
      const isCloned = v.category === 'cloned' || v.category === 'minimax_cloned';
      if (!isCloned) {
        if (genderFilter !== 'all' && (v.labels?.gender || '').toLowerCase() !== genderFilter) return false;
        if (ageFilter !== 'all') {
          const a = (v.labels?.age || '').toLowerCase().replace(/\s+/g, '_');
          if (a !== ageFilter) return false;
        }
      }
      return true;
    });
  }, [voices, searchQuery, genderFilter, ageFilter, activeTab, tabs]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollFailuresRef.current = 0;
    setGenerating(true);
    pollRef.current = setInterval(async () => {
      try {
        const response = await api.functions.invoke('pollVoiceover', { project_id: project.id });
        const data = response.data;
        if (data?.status === 'ready' && data?.voiceover_url) {
          const records = await api.entities.ProductionSettings.filter({ project_id: project.id });
          if (records[0]) setSettings({ ...records[0], voiceover_status: 'completed', voiceover_url: data.voiceover_url });
          setGenerating(false); clearInterval(pollRef.current); pollRef.current = null; onUpdate?.();
        } else if (data?.status === 'failed') {
          setError(data.error || 'Voiceover generation failed.'); setGenerating(false); clearInterval(pollRef.current); pollRef.current = null;
        }
      } catch (err) {
        // The loop used to keep running through every error for a full hour, showing a
        // spinner and an error side by side. Stop after a few, and stop at once when
        // there is no job to poll — that state can never resolve on its own.
        const message = err?.response?.data?.error || err.message || '';
        setError(message);
        pollFailuresRef.current += 1;
        const noTask = /no task_id/i.test(message);
        if (noTask || pollFailuresRef.current >= 5) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setGenerating(false);
          if (noTask) {
            setError('This voiceover was never submitted. Generate it again.');
            try {
              const records = await api.entities.ProductionSettings.filter({ project_id: project.id });
              if (records[0]) {
                await api.entities.ProductionSettings.update(records[0].id, { voiceover_status: 'failed' });
                setSettings({ ...records[0], voiceover_status: 'failed' });
              }
            } catch (_) {}
          }
        }
      }
    }, 10000);
    pollTimeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null; setGenerating(false); setError('Still generating. Refresh to resume checking.');
    }, 3600000);
  };

  const handleGenerate = async () => {
    if (!script?.id || !selectedVoice) return;
    setGenerating(true); setError('');
    let res;
    try {
      res = await api.functions.invoke('generateVoiceover', { project_id: project.id, voice_id: selectedVoice, voice_category: selectedVoiceData?.category, provider });
    } catch (err) { setError(err?.response?.data?.error || err.message); setGenerating(false); return; }
    if (res?.data?.error) { setError(res.data.error); setGenerating(false); return; }
    if (res.data?.instant && res.data?.voiceover_url) {
      const sr = await api.entities.ProductionSettings.filter({ project_id: project.id });
      if (sr[0]) setSettings({ ...sr[0], voiceover_status: 'completed', voiceover_url: res.data.voiceover_url });
      setGenerating(false); onUpdate?.(); return;
    }
    startPolling();
  };

  const handlePreview = async (voice) => {
    if (previewingVoice === voice.voice_id && previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current.currentTime = 0; setPreviewingVoice(null); return; }
    if (previewAudioRef.current) { previewAudioRef.current.pause(); setPreviewingVoice(null); }
    let url = voice.preview_url || previewCache[voice.voice_id];
    if (!url) {
      setLoadingPreview(voice.voice_id);
      try {
        const res = await api.functions.invoke('previewVoice', { voice_id: voice.voice_id, provider });
        if (res.data?.preview_url) { url = res.data.preview_url; setPreviewCache(prev => ({ ...prev, [voice.voice_id]: url })); }
        else { setLoadingPreview(null); return; }
      } catch (err) { console.warn('Preview failed:', err.message); setLoadingPreview(null); return; }
      setLoadingPreview(null);
    }
    const audio = new Audio(url); previewAudioRef.current = audio; setPreviewingVoice(voice.voice_id);
    audio.play(); audio.onended = () => setPreviewingVoice(null); audio.onerror = () => setPreviewingVoice(null);
  };

  useEffect(() => {
    if (settings?.voiceover_status === 'generating' && !settings?.voiceover_url && !pollRef.current) startPolling();
  }, [settings?.voiceover_status, settings?.voiceover_url, project?.id]);

  useEffect(() => { return () => {
    if (previewAudioRef.current) previewAudioRef.current.pause();
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
  }; }, []);
  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { try { await audioRef.current.play(); setPlaying(true); } catch (e) { setError('Audio cannot be played.'); } }
  };

  const selectedVoiceData = voices.find(v => v.voice_id === selectedVoice);
  const borderColor = color === 'orange' ? 'border-orange-200' : 'border-indigo-200';
  const bgSelected = color === 'orange' ? 'bg-orange-50 border-orange-300' : 'bg-indigo-50 border-indigo-300';
  const bgSelectedHeader = color === 'orange' ? 'border-orange-200 bg-orange-50' : 'border-indigo-200 bg-indigo-50';
  const btnColor = color === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700';
  const accentBg = color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700';
  const previewActiveClass = color === 'orange' ? 'bg-orange-600 text-white' : 'bg-indigo-600 text-white';
  const previewIdleClass = color === 'orange' ? 'bg-orange-200 text-orange-700' : 'bg-indigo-200 text-indigo-700';
  const hoverBg = color === 'orange' ? 'hover:bg-orange-100' : 'hover:bg-indigo-100';

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}<span>{title}</span><Badge className={`${accentBg} text-[10px]`}>{badgeText}</Badge>
          {settings?.voiceover_status === 'completed' && settings?.voiceover_url && <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Ready</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadingVoices ? <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading voices...</div> : (
          <>
            {selectedVoiceData && (
              <div className={`flex items-center gap-2 p-2 rounded-lg border ${bgSelectedHeader}`}>
                <button onClick={() => handlePreview(selectedVoiceData)} className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${previewingVoice === selectedVoiceData.voice_id ? previewActiveClass : previewIdleClass}`}>
                  {previewingVoice === selectedVoiceData.voice_id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{selectedVoiceData.name}</p><p className="text-xs text-gray-500 truncate">{[selectedVoiceData.labels?.accent, selectedVoiceData.labels?.gender, selectedVoiceData.labels?.age].filter(Boolean).join(' · ')}</p></div>
                {(selectedVoiceData.category === 'cloned' || selectedVoiceData.category === 'minimax_cloned') && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Clone</Badge>}
              </div>
            )}
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg flex-wrap">
              {tabs.map(tab => <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 px-2 py-1 rounded-md text-xs font-medium ${activeTab === tab.key ? `bg-white shadow ${tab.activeColor || 'text-gray-900'}` : 'text-gray-500'}`}>{tab.label} ({tab.filter ? voices.filter(tab.filter).length : voices.length})</button>)}
            </div>
            <div className="space-y-2">
              <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" /><Input placeholder="Search voices..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-7 h-8 text-xs" />{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3 h-3" /></button>}</div>
              <div className="flex gap-2">
                <Select value={genderFilter} onValueChange={setGenderFilter}><SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Genders</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select>
                <Select value={ageFilter} onValueChange={setAgeFilter}><SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Ages</SelectItem><SelectItem value="young">Young</SelectItem><SelectItem value="middle_aged">Middle Aged</SelectItem><SelectItem value="old">Old</SelectItem></SelectContent></Select>
              </div>
            </div>
            <p className="text-xs text-gray-400">{filteredVoices.length} voices</p>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {filteredVoices.map(v => {
                const isSelected = selectedVoice === v.voice_id; const isPreviewing = previewingVoice === v.voice_id;
                return (<div key={v.voice_id} onClick={() => setSelectedVoice(v.voice_id)} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${isSelected ? bgSelected : 'bg-white hover:bg-gray-50 border-gray-200'}`}>
                  <button onClick={e => { e.stopPropagation(); handlePreview(v); }} disabled={loadingPreview === v.voice_id} className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isPreviewing ? previewActiveClass : loadingPreview === v.voice_id ? 'bg-gray-100 text-gray-400' : `bg-gray-100 ${hoverBg} text-gray-600`}`}>
                    {loadingPreview === v.voice_id ? <Loader2 className="w-3 h-3 animate-spin" /> : isPreviewing ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0"><p className="font-medium truncate text-xs">{v.name}</p><p className="text-[11px] text-gray-500 truncate">{[v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.use_case].filter(Boolean).join(' · ')}</p></div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(v.category === 'elevenlabs' || v.category === 'elevenlabs_library') && <Badge variant="outline" className="text-[9px] px-1 border-indigo-300 text-indigo-600">EL</Badge>}
                    {v.category === 'minimax' && <Badge variant="outline" className="text-[9px] px-1 border-amber-300 text-amber-600">MM</Badge>}
                    {(v.category === 'cloned' || v.category === 'minimax_cloned') && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Clone</Badge>}
                    {isSelected && <Badge className={`${accentBg} text-[9px]`}>✓</Badge>}
                  </div>
                </div>);
              })}
              {filteredVoices.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No voices found</p>}
            </div>
          </>
        )}
        <Button onClick={handleGenerate} disabled={generating || !selectedVoice || !script} className={`w-full ${btnColor}`}>
          {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <>{icon} <span className="ml-2">Generate with {title}</span></>}
        </Button>
        {(error || parentError) && <p className="text-xs text-red-600">{error || parentError}</p>}
        {settings?.voiceover_url && settings.voiceover_status === 'completed' && settings.selected_voice_id !== 'uploaded' && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <audio ref={audioRef} src={settings.voiceover_url} onEnded={() => setPlaying(false)} className="hidden" />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={togglePlay}>{playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}</Button>
              <div className="flex-1"><p className="text-xs font-medium">{title} Voiceover</p><p className="text-[11px] text-gray-500">Ready to play</p></div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { const a = document.createElement('a'); a.href = settings.voiceover_url; a.download = `${project.name || 'voiceover'}.mp3`; a.click(); }}><Download className="w-3 h-3 mr-1" /> Download</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// User-supplied voiceover — upload to durable R2 and make it active
// ══════════════════════════════════════════════════════════════════
function UploadVoiceoverPanel({ project, onUpdate, settings, setSettings }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const isUploadedVoiceover = settings?.voiceover_status === 'completed'
    && settings?.selected_voice_id === 'uploaded'
    && settings?.voiceover_url;

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const chooseFile = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setError('');
    setSaved(false);
    const supportedExtension = /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(nextFile?.name || '');
    if (nextFile && !nextFile.type.startsWith('audio/') && !supportedExtension) {
      setFile(null);
      setError('Choose an audio file such as MP3, WAV, M4A, AAC, OGG, or WebM.');
      event.target.value = '';
      return;
    }
    setFile(nextFile);
  };

  const uploadVoiceover = async () => {
    if (!file || !project?.id) return;
    setUploading(true); setError(''); setSaved(false);
    try {
      // The API accepts a request body up to 100MB; anything larger is refused by the
      // platform with no useful message, so say it plainly here.
      if (file.size > 90 * 1024 * 1024) {
        throw new Error(`That file is ${(file.size / (1024 * 1024)).toFixed(0)}MB. The limit is 90MB — export it as MP3 (or a lower bitrate) and upload again.`);
      }

      const uploaded = await api.integrations.Core.UploadFile({ file });
      const voiceoverUrl = uploaded?.file_url;
      if (!voiceoverUrl) throw new Error('Upload returned no file URL.');

      const payload = {
        project_id: project.id,
        selected_voice_id: 'uploaded',
        voiceover_status: 'completed',
        voiceover_url: voiceoverUrl,
        generation_task_id: '',
        voiceover_chunks: '',
        voiceover_total_chunks: 0,
        voiceover_completed_chunks: 0,
      };
      const savedSettings = settings?.id
        ? await api.entities.ProductionSettings.update(settings.id, payload)
        : await api.entities.ProductionSettings.create(payload);
      await api.entities.Projects.update(project.id, { voiceover_url: voiceoverUrl });
      // Read it back rather than trusting the write: "Ready" must mean the timeline will
      // actually find this audio, on this project.
      const confirmed = (await api.entities.ProductionSettings.filter({ project_id: project.id }))
        .find(row => row.voiceover_url === voiceoverUrl);
      if (!confirmed) {
        throw new Error('The file uploaded but this project did not save it. Reload the page and try once more.');
      }

      setSettings(confirmed || savedSettings || { ...settings, ...payload });
      setSaved(true);
      onUpdate?.();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Voiceover upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const fileSize = file
    ? file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`
    : '';

  return (
    <Card className="border-slate-200 overflow-hidden">
      <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="w-4 h-4 text-slate-700" />
          <span>Use your own voiceover</span>
          {(saved || isUploadedVoiceover) && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] ml-auto"><CheckCircle2 className="w-3 h-3 mr-1" /> Ready</Badge>}
        </CardTitle>
        <p className="text-xs text-slate-500">Upload finished narration and use it everywhere this project expects a voiceover.</p>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <label className="group flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2">
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.webm"
            onChange={chooseFile}
            className="sr-only"
          />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700">
            <FileAudio className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">{file ? file.name : 'Choose an audio file'}</span>
            <span className="block text-xs text-slate-500">{file ? fileSize : 'MP3, WAV, M4A, AAC, OGG, or WebM'}</span>
          </span>
          <span className="text-xs font-medium text-indigo-700">Browse</span>
        </label>

        {previewUrl && <audio controls preload="metadata" src={previewUrl} className="w-full h-10" aria-label="Selected voiceover preview" />}

        {!previewUrl && isUploadedVoiceover && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-2 text-xs font-medium text-emerald-800">Current uploaded voiceover</p>
            <audio controls preload="metadata" src={settings.voiceover_url} className="w-full h-10" aria-label="Current uploaded voiceover" />
          </div>
        )}

        <Button onClick={uploadVoiceover} disabled={!file || uploading} className="w-full bg-slate-900 hover:bg-slate-800">
          {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading voiceover...</> : <><Upload className="w-4 h-4 mr-2" /> Use this voiceover</>}
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-emerald-700">Voiceover saved. Timeline and export will use this audio.</p>}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main VoiceoverPanel — upload or generate through the supported AI33 path
// ══════════════════════════════════════════════════════════════════
export default function VoiceoverPanel({ project, script, onUpdate }) {
  const [ai33Voices, setAi33Voices] = useState([]);
  const [loadingAi33, setLoadingAi33] = useState(false);
  const [ai33Error, setAi33Error] = useState('');
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!project?.id) return;
    api.entities.ProductionSettings.filter({ project_id: project.id }).then(res => { if (res.length > 0) setSettings(res[0]); });

    setLoadingAi33(true);
    api.functions.invoke('listVoicesByProvider', { source: 'ai33' })
      .then(res => setAi33Voices(res.data?.voices || []))
      .catch(err => {
        console.warn('AI33 voices failed:', err.message);
        api.functions.invoke('listVoices', {}).then(res => setAi33Voices(res.data?.voices || [])).catch(() => setAi33Error('AI33 voices unavailable.'));
      })
      .finally(() => setLoadingAi33(false));
  }, [project?.id]);

  const ai33Tabs = [
    { key: 'all', label: 'All', filter: null, activeColor: 'text-gray-900' },
    { key: 'minimax', label: 'MiniMax', filter: v => v.category === 'minimax', activeColor: 'text-amber-700' },
    { key: 'elevenlabs', label: 'ElevenLabs', filter: v => v.category === 'elevenlabs' || v.category === 'elevenlabs_library', activeColor: 'text-indigo-700' },
    { key: 'cloned', label: 'Cloned', filter: v => v.category === 'cloned' || v.category === 'minimax_cloned', activeColor: 'text-purple-700' },
  ];

  return (
    <div className="space-y-4">
      <UploadVoiceoverPanel project={project} onUpdate={onUpdate} settings={settings} setSettings={setSettings} />
      <VoicePanel title="AI33 Pro" icon={<Globe className="w-4 h-4 text-indigo-500" />} color="indigo" badgeText="Async" voices={ai33Voices} loadingVoices={loadingAi33} tabs={ai33Tabs} project={project} script={script} provider="ai33" onUpdate={onUpdate} settings={settings} setSettings={setSettings} error={ai33Error} />
    </div>
  );
}
