import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Play, Pause, Download, Volume2, Square, Search, X, Zap, Globe } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// Shared voice list + preview + player sub-component
// ══════════════════════════════════════════════════════════════════
function VoicePanel({ title, icon, color, badgeText, voices, loadingVoices, tabs, project, script, provider, onUpdate, settings, setSettings, error: parentError }) {
  const [selectedVoice, setSelectedVoice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
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

  const handleGenerate = async () => {
    if (!script?.id || !selectedVoice) return;
    setGenerating(true);
    setError('');

    let res;
    try {
      res = await base44.functions.invoke('generateVoiceover', {
        project_id: project.id,
        voice_id: selectedVoice,
        provider,
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Generation failed');
      setGenerating(false);
      return;
    }

    if (res?.data?.error) { setError(res.data.error); setGenerating(false); return; }

    // Instant (MiniMax sync short scripts)
    if (res.data?.instant && res.data?.voiceover_url) {
      const settingsRes = await base44.entities.ProductionSettings.filter({ project_id: project.id });
      if (settingsRes[0]) setSettings({ ...settingsRes[0], voiceover_status: 'completed', voiceover_url: res.data.voiceover_url });
      setGenerating(false);
      onUpdate?.();
      return;
    }

    // Async — poll
    const pollInterval = setInterval(async () => {
      try {
        const pollRes = await base44.functions.invoke('pollVoiceover', { project_id: project.id });
        const data = pollRes.data;
        if (data?.status === 'ready' && data?.voiceover_url) {
          const settingsRes = await base44.entities.ProductionSettings.filter({ project_id: project.id });
          if (settingsRes[0]) setSettings({ ...settingsRes[0], voiceover_status: 'completed', voiceover_url: data.voiceover_url });
          setGenerating(false);
          clearInterval(pollInterval);
          onUpdate?.();
        } else if (data?.status === 'failed') {
          setError(data.error || 'Generation failed.');
          setGenerating(false);
          clearInterval(pollInterval);
        }
      } catch (e) { console.warn('Poll error:', e.message); }
    }, 10000);

    setTimeout(() => { clearInterval(pollInterval); setGenerating(p => { if (p) setError('Still generating. Refresh to check.'); return false; }); }, 3600000);
  };

  const handlePreview = async (voice) => {
    if (previewingVoice === voice.voice_id && previewAudioRef.current) {
      previewAudioRef.current.pause(); previewAudioRef.current.currentTime = 0; setPreviewingVoice(null); return;
    }
    if (previewAudioRef.current) { previewAudioRef.current.pause(); setPreviewingVoice(null); }

    let url = voice.preview_url || previewCache[voice.voice_id];
    if (!url) {
      setLoadingPreview(voice.voice_id);
      try {
        const res = await base44.functions.invoke('previewVoice', { voice_id: voice.voice_id, provider });
        if (res.data?.preview_url) { url = res.data.preview_url; setPreviewCache(prev => ({ ...prev, [voice.voice_id]: url })); }
        else { setLoadingPreview(null); return; }
      } catch (err) { console.warn('Preview failed:', err.message); setLoadingPreview(null); return; }
      setLoadingPreview(null);
    }
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    setPreviewingVoice(voice.voice_id);
    audio.play();
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
  };

  useEffect(() => { return () => { if (previewAudioRef.current) previewAudioRef.current.pause(); }; }, []);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { try { await audioRef.current.play(); setPlaying(true); } catch (e) { setError('Audio cannot be played. Try regenerating.'); } }
  };

  const selectedVoiceData = voices.find(v => v.voice_id === selectedVoice);
  const borderColor = color === 'orange' ? 'border-orange-200' : 'border-indigo-200';
  const bgSelected = color === 'orange' ? 'bg-orange-50 border-orange-300' : 'bg-indigo-50 border-indigo-300';
  const bgSelectedHeader = color === 'orange' ? 'border-orange-200 bg-orange-50' : 'border-indigo-200 bg-indigo-50';
  const btnColor = color === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700';
  const accentText = color === 'orange' ? 'text-orange-700' : 'text-indigo-700';
  const accentBg = color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700';
  const previewActiveClass = color === 'orange' ? 'bg-orange-600 text-white' : 'bg-indigo-600 text-white';
  const previewIdleClass = color === 'orange' ? 'bg-orange-200 text-orange-700' : 'bg-indigo-200 text-indigo-700';
  const hoverBg = color === 'orange' ? 'hover:bg-orange-100' : 'hover:bg-indigo-100';

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          <span>{title}</span>
          <Badge className={`${accentBg} text-[10px]`}>{badgeText}</Badge>
          {settings?.voiceover_status === 'completed' && settings?.voiceover_url && (
            <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Ready</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadingVoices ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading voices...</div>
        ) : (
          <>
            {/* Selected voice */}
            {selectedVoiceData && (
              <div className={`flex items-center gap-2 p-2 rounded-lg border ${bgSelectedHeader}`}>
                <button onClick={() => handlePreview(selectedVoiceData)}
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${previewingVoice === selectedVoiceData.voice_id ? previewActiveClass : previewIdleClass}`}>
                  {previewingVoice === selectedVoiceData.voice_id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{selectedVoiceData.name}</p>
                  <p className="text-xs text-gray-500 truncate">{[selectedVoiceData.labels?.accent, selectedVoiceData.labels?.gender, selectedVoiceData.labels?.age].filter(Boolean).join(' · ')}</p>
                </div>
                {(selectedVoiceData.category === 'cloned' || selectedVoiceData.category === 'minimax_cloned') && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Clone</Badge>}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg flex-wrap">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-2 py-1 rounded-md text-xs font-medium ${activeTab === tab.key ? `bg-white shadow ${tab.activeColor || 'text-gray-900'}` : 'text-gray-500'}`}>
                  {tab.label} ({tab.filter ? voices.filter(tab.filter).length : voices.length})
                </button>
              ))}
            </div>

            {/* Search + Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Search voices..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-7 h-8 text-xs" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3 h-3" /></button>}
              </div>
              <div className="flex gap-2">
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    <SelectItem value="young">Young</SelectItem>
                    <SelectItem value="middle_aged">Middle Aged</SelectItem>
                    <SelectItem value="old">Old</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-gray-400">{filteredVoices.length} voices</p>

            {/* Voice list */}
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {filteredVoices.map(v => {
                const isSelected = selectedVoice === v.voice_id;
                const isPreviewing = previewingVoice === v.voice_id;
                return (
                  <div key={v.voice_id} onClick={() => setSelectedVoice(v.voice_id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${isSelected ? bgSelected : 'bg-white hover:bg-gray-50 border-gray-200'}`}>
                    <button onClick={e => { e.stopPropagation(); handlePreview(v); }} disabled={loadingPreview === v.voice_id}
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isPreviewing ? previewActiveClass : loadingPreview === v.voice_id ? 'bg-gray-100 text-gray-400' : `bg-gray-100 ${hoverBg} text-gray-600`}`}>
                      {loadingPreview === v.voice_id ? <Loader2 className="w-3 h-3 animate-spin" /> : isPreviewing ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-xs">{v.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{[v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.use_case].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {v.category === 'elevenlabs' || v.category === 'elevenlabs_library' ? <Badge variant="outline" className="text-[9px] px-1 border-indigo-300 text-indigo-600">EL</Badge> : null}
                      {v.category === 'minimax' ? <Badge variant="outline" className="text-[9px] px-1 border-amber-300 text-amber-600">MM</Badge> : null}
                      {(v.category === 'cloned' || v.category === 'minimax_cloned') && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Clone</Badge>}
                      {isSelected && <Badge className={`${accentBg} text-[9px]`}>✓</Badge>}
                    </div>
                  </div>
                );
              })}
              {filteredVoices.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No voices found</p>}
            </div>
          </>
        )}

        {/* Generate */}
        <Button onClick={handleGenerate} disabled={generating || !selectedVoice || !script} className={`w-full ${btnColor}`}>
          {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <>{icon} <span className="ml-2">Generate with {title}</span></>}
        </Button>

        {(error || parentError) && <p className="text-xs text-red-600">{error || parentError}</p>}

        {/* Player */}
        {settings?.voiceover_url && settings.voiceover_status === 'completed' && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <audio ref={audioRef} src={settings.voiceover_url} onEnded={() => setPlaying(false)} className="hidden" />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={togglePlay}>
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
              <div className="flex-1">
                <p className="text-xs font-medium">{title} Voiceover</p>
                <p className="text-[11px] text-gray-500">Ready to play</p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { const a = document.createElement('a'); a.href = settings.voiceover_url; a.download = `${project.name || 'voiceover'}.mp3`; a.click(); }}>
                <Download className="w-3 h-3 mr-1" /> Download
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main VoiceoverPanel — renders both panels
// ══════════════════════════════════════════════════════════════════
export default function VoiceoverPanel({ project, script, onUpdate }) {
  const [mmVoices, setMmVoices] = useState([]);
  const [ai33Voices, setAi33Voices] = useState([]);
  const [loadingMm, setLoadingMm] = useState(false);
  const [loadingAi33, setLoadingAi33] = useState(false);
  const [mmError, setMmError] = useState('');
  const [ai33Error, setAi33Error] = useState('');
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!project?.id) return;

    // Load settings
    base44.entities.ProductionSettings.filter({ project_id: project.id }).then(res => {
      if (res.length > 0) setSettings(res[0]);
    });

    // Load MiniMax Direct voices
    setLoadingMm(true);
    base44.functions.invoke('listVoicesByProvider', { source: 'minimax_direct' })
      .then(res => setMmVoices(res.data?.voices || []))
      .catch(err => { console.warn('MiniMax voices failed:', err.message); setMmError('MiniMax voices unavailable.'); })
      .finally(() => setLoadingMm(false));

    // Load AI33 voices
    setLoadingAi33(true);
    base44.functions.invoke('listVoicesByProvider', { source: 'ai33' })
      .then(res => setAi33Voices(res.data?.voices || []))
      .catch(err => {
        console.warn('AI33 voices failed, trying listVoices:', err.message);
        base44.functions.invoke('listVoices', {})
          .then(res => setAi33Voices(res.data?.voices || []))
          .catch(err2 => { console.warn('All AI33 loading failed:', err2.message); setAi33Error('AI33 voices unavailable.'); });
      })
      .finally(() => setLoadingAi33(false));
  }, [project?.id]);

  const mmTabs = [
    { key: 'all', label: 'All', filter: null, activeColor: 'text-gray-900' },
    { key: 'system', label: 'System', filter: v => v.category === 'system', activeColor: 'text-gray-900' },
    { key: 'cloned', label: 'My Clones', filter: v => v.category === 'cloned', activeColor: 'text-amber-700' },
  ];

  const ai33Tabs = [
    { key: 'all', label: 'All', filter: null, activeColor: 'text-gray-900' },
    { key: 'minimax', label: 'MiniMax', filter: v => v.category === 'minimax', activeColor: 'text-amber-700' },
    { key: 'elevenlabs', label: 'ElevenLabs', filter: v => v.category === 'elevenlabs' || v.category === 'elevenlabs_library', activeColor: 'text-indigo-700' },
    { key: 'cloned', label: 'Cloned', filter: v => v.category === 'cloned' || v.category === 'minimax_cloned', activeColor: 'text-purple-700' },
  ];

  return (
    <div className="space-y-4">
      <VoicePanel
        title="MiniMax Direct"
        icon={<Zap className="w-4 h-4 text-orange-500" />}
        color="orange"
        badgeText="Your API"
        voices={mmVoices}
        loadingVoices={loadingMm}
        tabs={mmTabs}
        project={project}
        script={script}
        provider="minimax_direct"
        onUpdate={onUpdate}
        settings={settings}
        setSettings={setSettings}
        error={mmError}
      />
      <VoicePanel
        title="AI33 Pro"
        icon={<Globe className="w-4 h-4 text-indigo-500" />}
        color="indigo"
        badgeText="Async"
        voices={ai33Voices}
        loadingVoices={loadingAi33}
        tabs={ai33Tabs}
        project={project}
        script={script}
        provider="ai33"
        onUpdate={onUpdate}
        settings={settings}
        setSettings={setSettings}
        error={ai33Error}
      />
    </div>
  );
}