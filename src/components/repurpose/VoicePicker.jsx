import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mic, Play, Pause, Search, Volume2 } from 'lucide-react';

export default function VoicePicker({ selectedVoiceId, onSelectVoice, analysisVoiceStyle }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [filter, setFilter] = useState('all');
  const audioRef = useRef(null);
  const previewCacheRef = useRef({});

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    setLoading(true);
    const resp = await base44.functions.invoke('listVoices', {});
    const data = resp.data;
    if (data?.voices) setVoices(data.voices);
    setLoading(false);
  };

  const handlePlayPreview = async (voice) => {
    // If already playing this voice, stop
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Stop current audio
    if (audioRef.current) audioRef.current.pause();

    // If we already have a preview URL (from API or cache), play it
    const cachedUrl = voice.preview_url || previewCacheRef.current[voice.voice_id];
    if (cachedUrl) {
      const audio = new Audio(cachedUrl);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(voice.voice_id);
      return;
    }

    // Generate preview via TTS
    setPreviewLoading(voice.voice_id);
    try {
      const resp = await base44.functions.invoke('previewVoice', {
        voice_id: voice.voice_id,
        provider: voice.provider,
      });
      const result = resp.data;
      if (result?.preview_url) {
        previewCacheRef.current[voice.voice_id] = result.preview_url;
        const audio = new Audio(result.preview_url);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => setPlayingId(null);
        audio.play();
        audioRef.current = audio;
        setPlayingId(voice.voice_id);
      }
    } catch (err) {
      console.warn('Preview generation failed:', err.message);
    }
    setPreviewLoading(null);
  };

  const filtered = voices.filter(v => {
    const q = search.toLowerCase();
    const matchesSearch = !q || v.name?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q) ||
      v.labels?.accent?.toLowerCase().includes(q) || v.labels?.gender?.toLowerCase().includes(q) ||
      v.voice_id?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' ||
      (filter === 'male' && v.labels?.gender?.toLowerCase() === 'male') ||
      (filter === 'female' && v.labels?.gender?.toLowerCase() === 'female') ||
      (filter === 'cloned' && (v.category === 'minimax_cloned' || v.labels?.use_case === 'cloned')) ||
      (filter === 'narration' && (v.labels?.use_case?.toLowerCase().includes('narrat') || v.category === 'minimax_system'));
    return matchesSearch && matchesFilter;
  }).slice(0, 40);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-semibold">Voice Selection</span>
        {analysisVoiceStyle && (
          <Badge variant="outline" className="text-[10px] ml-auto">Original: {analysisVoiceStyle}</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search voices..." className="pl-8 text-xs h-8" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {['all', 'male', 'female', 'cloned', 'narration'].map(f => (
                <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" className="text-[10px] h-8 px-2"
                  onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</Button>
              ))}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No voices match your search</p>}
            {filtered.map(v => (
              <div
                key={v.voice_id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                  selectedVoiceId === v.voice_id
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-100 hover:border-gray-300 bg-white'
                }`}
                onClick={() => onSelectVoice(v.voice_id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{v.name}</span>
                    {v.labels?.gender && (
                      <Badge variant="secondary" className="text-[9px] px-1">{v.labels.gender}</Badge>
                    )}
                    {v.labels?.accent && v.labels.accent !== 'English' && v.labels.accent && (
                      <Badge variant="outline" className="text-[9px] px-1">{v.labels.accent}</Badge>
                    )}
                    {(v.category === 'minimax_cloned' || v.labels?.use_case === 'cloned') && (
                      <Badge className="text-[9px] px-1 bg-purple-100 text-purple-700">Cloned</Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] px-1 ml-auto">{v.provider}</Badge>
                  </div>
                  {v.description && v.description !== 'Custom cloned voice' && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{v.description.substring(0, 80)}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  disabled={previewLoading === v.voice_id}
                  onClick={e => { e.stopPropagation(); handlePlayPreview(v); }}
                >
                  {previewLoading === v.voice_id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : playingId === v.voice_id ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>

          {selectedVoiceId && (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">
                Selected: {voices.find(v => v.voice_id === selectedVoiceId)?.name || selectedVoiceId}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}