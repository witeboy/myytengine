import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Play, Pause, Download, Volume2, Square, Search, X } from 'lucide-react';

export default function ElevenLabsVoiceoverPanel({ project, script, onUpdate }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const [settings, setSettings] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoadingVoices(true);
      const [voiceRes, settingsRes] = await Promise.all([
        base44.functions.invoke('listVoices', {}),
        base44.entities.ProductionSettings.filter({ project_id: project.id }),
      ]);
      const loadedVoices = voiceRes.data?.voices || [];
      // Only show AI33/ElevenLabs voices
      const elVoices = loadedVoices.filter(v => v.provider === 'elevenlabs');
      setVoices(elVoices);
      if (settingsRes.length > 0) {
        setSettings(settingsRes[0]);
      }
      setLoadingVoices(false);
    };
    if (project?.id) fetchData();
  }, [project?.id]);

  const filteredVoices = useMemo(() => {
    return voices.filter(v => {
      const q = searchQuery.toLowerCase();
      if (q) {
        const name = (v.name || '').toLowerCase();
        const desc = (v.description || '').toLowerCase();
        const accent = (v.labels?.accent || '').toLowerCase();
        if (!name.includes(q) && !desc.includes(q) && !accent.includes(q)) return false;
      }
      if (genderFilter !== 'all') {
        const g = (v.labels?.gender || '').toLowerCase();
        if (g !== genderFilter) return false;
      }
      if (ageFilter !== 'all') {
        const a = (v.labels?.age || '').toLowerCase().replace(/\s+/g, '_');
        if (a !== ageFilter) return false;
      }
      return true;
    });
  }, [voices, searchQuery, genderFilter, ageFilter]);

  const handleGenerate = async () => {
    if (!script?.id || !selectedVoice) return;
    setGenerating(true);
    setError('');

    let res;
    try {
      res = await base44.functions.invoke('generateVoiceover', {
        project_id: project.id,
        script_id: script?.id,
        voice_id: selectedVoice,
        provider: 'elevenlabs',
      });
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Voiceover generation failed';
      setError(errMsg);
      setGenerating(false);
      return;
    }

    if (res.data?.error) {
      setError(res.data.error);
      setGenerating(false);
      return;
    }

    if (res.data?.success && res.data?.voiceover_url) {
      const settingsRes = await base44.entities.ProductionSettings.filter({ project_id: project.id });
      if (settingsRes.length > 0) {
        setSettings({ ...settingsRes[0], voiceover_status: 'completed', voiceover_url: res.data.voiceover_url });
      }
      setGenerating(false);
      onUpdate?.();
      return;
    }

    // Poll for async completion
    const taskId = res.data?.task_id;
    if (taskId) {
      const pollInterval = setInterval(async () => {
        const statusRes = await base44.functions.invoke('checkVoiceoverStatus', {
          task_id: taskId,
          project_id: project.id,
        });
        const status = statusRes.data?.status;
        if (status === 'done') {
          const settingsRes = await base44.entities.ProductionSettings.filter({ project_id: project.id });
          if (settingsRes[0]) {
            setSettings({ ...settingsRes[0], voiceover_status: 'completed', voiceover_url: statusRes.data?.audio_url });
          }
          setGenerating(false);
          clearInterval(pollInterval);
          onUpdate?.();
        } else if (status === 'failed') {
          setError(statusRes.data?.error_message || 'Voiceover generation failed');
          setGenerating(false);
          clearInterval(pollInterval);
        }
      }, 5000);

      setTimeout(() => {
        clearInterval(pollInterval);
        if (generating) {
          setError('Voiceover generation timed out.');
          setGenerating(false);
        }
      }, 300000);
    } else {
      setGenerating(false);
    }
  };

  const handlePreviewVoice = (voice) => {
    if (previewingVoice === voice.voice_id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPreviewingVoice(null);
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingVoice(null);
    }
    if (!voice.preview_url) return;
    const audio = new Audio(voice.preview_url);
    previewAudioRef.current = audio;
    setPreviewingVoice(voice.voice_id);
    audio.play();
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
  };

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) previewAudioRef.current.pause();
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const handleDownload = () => {
    if (!settings?.voiceover_url) return;
    const a = document.createElement('a');
    a.href = settings.voiceover_url;
    a.download = `${project.name || 'voiceover'}_elevenlabs.mp3`;
    a.click();
  };

  const selectedVoiceData = voices.find(v => v.voice_id === selectedVoice);

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <span>ElevenLabs Voiceover</span>
          <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">AI33</Badge>
          {settings?.voiceover_status === 'completed' && (
            <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Ready</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Select ElevenLabs Voice</label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
            </div>
          ) : (
            <>
              {selectedVoiceData && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-indigo-300 bg-indigo-50 mb-3">
                  {selectedVoiceData.preview_url ? (
                    <button
                      onClick={() => handlePreviewVoice(selectedVoiceData)}
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        previewingVoice === selectedVoiceData.voice_id ? 'bg-indigo-600 text-white' : 'bg-indigo-200 hover:bg-indigo-300 text-indigo-700'
                      }`}
                    >
                      {previewingVoice === selectedVoiceData.voice_id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                    </button>
                  ) : (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{selectedVoiceData.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[selectedVoiceData.labels?.accent, selectedVoiceData.labels?.gender, selectedVoiceData.labels?.age].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge className="bg-indigo-100 text-indigo-700 text-[10px] flex-shrink-0">Selected</Badge>
                </div>
              )}

              {/* Search & Filters */}
              <div className="space-y-2 mb-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search ElevenLabs voices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={ageFilter} onValueChange={setAgeFilter}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Age" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ages</SelectItem>
                      <SelectItem value="young">Young</SelectItem>
                      <SelectItem value="middle_aged">Middle Aged</SelectItem>
                      <SelectItem value="old">Old</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-1">{filteredVoices.length} ElevenLabs voices</p>

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {filteredVoices.map(v => {
                  const isSelected = selectedVoice === v.voice_id;
                  const isPreviewing = previewingVoice === v.voice_id;
                  return (
                    <div
                      key={v.voice_id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                        isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-50 border-gray-200'
                      }`}
                      onClick={() => setSelectedVoice(v.voice_id)}
                    >
                      {v.preview_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v); }}
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                            isPreviewing ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700'
                          }`}
                        >
                          {isPreviewing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{v.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {[v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.use_case].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {isSelected && (
                        <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">Selected</Badge>
                      )}
                    </div>
                  );
                })}
                {filteredVoices.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No ElevenLabs voices found</p>
                )}
              </div>
            </>
          )}
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !selectedVoice || !script}
          className="w-full bg-indigo-600 hover:bg-indigo-700"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating via ElevenLabs...</>
          ) : (
            <><Mic className="w-4 h-4 mr-2" /> Generate with ElevenLabs</>
          )}
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {settings?.voiceover_url && settings.voiceover_status === 'completed' && (
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <audio
              ref={audioRef}
              src={settings.voiceover_url}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={togglePlay}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div className="flex-1">
                <p className="text-sm font-medium">ElevenLabs Voiceover</p>
                <p className="text-xs text-gray-500">
                  {settings.total_duration_seconds ? `${Math.round(settings.total_duration_seconds / 60)} min` : 'Ready to play'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}